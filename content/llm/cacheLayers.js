// [設計] Prompt Cache 分層契約 —— 「哪一段可以被快取、哪一段每回合都會變」的單一定義處。
//
// 起因：切到支援 context caching 的端點（DeepSeek V4 系列、硅基流動上的同型模型、
// OpenAI 相容的 automatic prefix caching）之後，成本與 TTFT 不再只跟「送了多少 token」有關，
// 而是跟「送出去的 token **前綴**跟上一次有多少是一模一樣的」有關。
// 這些端點的共同機制都是 **prefix caching**：從第 0 個 token 開始逐段比對，
// 一旦碰到第一個不同的 token，**從那裡到最後全部重算**，後面就算有 3000 字一字不差也救不回來。
//
// 所以「把靜態內容放進 system、動態內容放進 user」這句話只講對一半：真正的規則是
//   **整個請求序列化之後，變動的東西必須全部排在不變的東西後面。**
// 一個放在 system 最前面的回合數，跟一個放在 user 中段的血量，破壞力是一樣的——
// 都會讓它後面所有東西的快取失效。
//
// 本檔把這件事收成三層，順序即是「變動頻率由低到高」，不可調換：
//
//   1) STATIC（system message）：整場遊戲不變。規則契約、文筆層、人格面具、
//      場景固定背景、回應格式規格（options spec / JSON schema 說明）。
//      這一層是唯一真正吃得到快取的部分，所以要**盡量長**——把所有不變的東西都塞進來。
//   2) HISTORY（中段 user/assistant 訊息）：**只在尾端追加**的對話歷史。
//      追加不會動到前面的 token，所以前 N-1 輪仍然命中快取。
//      關鍵前提是「不可以從頭部裁掉」——見 sessionStore.js 的 HISTORY_MAX 遲滯窗。
//   3) DYNAMIC（最後一個 user message）：這一回合才成立的東西。
//      DM 備忘錄（血量／XP／剩餘回合）、判定結果、迫近度、卡關回合數、
//      玩家這次的輸入、JSON 強制指令。這一層**每回合必然全部重算**，是預期中的成本，
//      所以要盡量短，而且絕對不能把靜態內容混在它後面。
//
// 這裡不做任何網路呼叫，也不認識任何供應商——實際組成 messages 陣列是 client.js 的事。

/**
 * 「這段文字看起來含有每回合都會變的值」的偵測規則。
 *
 * 用途不是安全檢查，是**回歸防護**：靜態層一旦被摻進一個回合數或血量，
 * 快取命中率會直接掉到接近 0，而且從功能面完全看不出來——遊戲照跑，只是變貴變慢。
 * 這種 bug 沒有測試就一定會回來，所以把它寫成可以被 assert 的東西。
 *
 * 每一條都對應本專案實際出現過的動態字串（見 promptContract.js 的 buildDmMemo、
 * scenario/nodePrompt.js 的卡關警告、scenario/threat.js 的迫近度）。
 */
export const DYNAMIC_LEAK_PATTERNS = Object.freeze([
  { id: "iso-timestamp", label: "ISO 時間戳記", pattern: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/ },
  { id: "hp-counter", label: "血量計數（完好 n/n）", pattern: /完好\s*\d+\s*\/\s*\d+/ },
  { id: "xp-counter", label: "持有XP 數字", pattern: /持有XP[：:]\s*\d+/ },
  { id: "round-budget", label: "剩餘回合數", pattern: /剩餘\s*\d+\s*回合/ },
  { id: "round-index", label: "第 n 輪／第 n 回合", pattern: /第\s*\d+\s*(?:輪|回合)/ },
  { id: "stall-counter", label: "卡關回合計數", pattern: /(?:已連續|已經)\s*\d+\s*回合/ },
  // 只抓引擎實際輸出的那個形狀（【判定結果：慘烈失敗】）。規則契約裡有一句
  // 「[判定結果：xxx]」是在**描述**這個格式，屬於靜態文字，不可以被判成洩漏。
  { id: "outcome-tier", label: "本回合判定結果", pattern: /【判定結果[：:]/ },
  { id: "threat-level", label: "迫近度數值", pattern: /迫近度[^\n]{0,12}\d/ },
]);

/**
 * 掃描一段「應該是靜態」的文字，回傳它踩到的動態洩漏規則。
 * 空陣列 = 乾淨。這個函式只回報，不丟例外——要不要當成錯誤由呼叫端決定
 * （測試裡當成錯誤，線上只記 log，不能因為一個誤判就讓玩家玩不了）。
 *
 * @param {string} text
 * @returns {Array<{id: string, label: string}>}
 */
export function detectDynamicLeaks(text) {
  if (typeof text !== "string" || !text) return [];
  const hits = [];
  for (const rule of DYNAMIC_LEAK_PATTERNS) {
    if (rule.pattern.test(text)) hits.push({ id: rule.id, label: rule.label });
  }
  return hits;
}

/** 把區塊陣列接成一段文字：空值一律丟掉，接合符固定是兩個換行，順序完全照傳入順序。 */
function joinBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [blocks])
    .filter((b) => typeof b === "string" && b.trim())
    .join("\n\n");
}

/**
 * 把存檔的對話歷史轉成 chat messages。
 *
 * 為什麼要拆成多則 user/assistant 訊息，而不是像以前那樣壓成一段「【前情提要】」文字：
 * 壓成一段文字時，只要窗口往前滑一格，整段字串的**開頭**就變了，
 * 從它開始往後的所有 token 全部 cache miss。拆成獨立訊息之後，
 * 「新增一輪」在序列化之後就只是在尾端多接一段——前面每一則的 token 完全沒動。
 *
 * @param {Array<{action?: string|null, narration?: string|null}>} history
 * @returns {Array<{role: "user"|"assistant", content: string}>}
 */
export function historyToMessages(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  const messages = [];
  for (const turn of history) {
    if (!turn) continue;
    const action = typeof turn.action === "string" ? turn.action.trim() : "";
    const narration = typeof turn.narration === "string" ? turn.narration.trim() : "";
    if (!action && !narration) continue;
    // 沒有玩家行動的那幾輪（開場、回坐重述）照樣要放一則 user 訊息，內容是固定字串。
    // 不放的話 messages 會以 assistant 開頭，部分 OpenAI 相容端點會直接回 400；
    // 而且固定字串本身是靜態的，不影響快取。
    messages.push({
      role: "user",
      content: action ? `【玩家行動】${action}` : NO_PLAYER_ACTION_MARKER,
    });
    if (narration) messages.push({ role: "assistant", content: narration });
  }
  return mergeAdjacentRoles(messages);
}

/** 沒有玩家行動的那一輪（開場／回坐）在歷史裡的固定佔位文字。刻意是常數，不帶任何回合資訊。 */
export const NO_PLAYER_ACTION_MARKER = "（這一輪沒有玩家行動，是引擎要求的開場或接續敘事）";

/**
 * 把相鄰的同角色訊息併成一則。
 *
 * 上一輪敘事生成失敗（narration 為空）時會出現連續兩則 user；OpenAI 相容的端點對這件事
 * 寬鬆程度不一，有些會回 400。併起來之後序列一定是嚴格交替的 user/assistant，
 * 而且併法是決定性的，同一份歷史永遠得到同一個結果——這對快取前綴的穩定性是必要條件。
 */
function mergeAdjacentRoles(messages) {
  const merged = [];
  for (const msg of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      merged[merged.length - 1] = { role: last.role, content: `${last.content}\n\n${msg.content}` };
    } else {
      merged.push(msg);
    }
  }
  return merged;
}

/**
 * 依三層契約組出一次請求的三個部分。
 *
 * @param {object} params
 * @param {string[]} params.staticBlocks 靜態層區塊，**順序即是送出的順序**，
 *   呼叫端必須傳入一個固定順序的陣列（不可以是 Object.keys()/Set 迭代出來的東西）。
 * @param {Array<{role: string, content: string}>} [params.historyMessages] 歷史層，見 historyToMessages()
 * @param {string[]} params.dynamicBlocks 動態層區塊，會被接成最後一個 user message
 * @returns {{systemInstruction: string, history: Array, prompt: string, leaks: Array}}
 */
export function buildLayeredRequest({ staticBlocks = [], historyMessages = [], dynamicBlocks = [] }) {
  const systemInstruction = joinBlocks(staticBlocks);
  const prompt = joinBlocks(dynamicBlocks);
  return {
    systemInstruction,
    history: Array.isArray(historyMessages) ? historyMessages : [],
    prompt,
    // 只掃靜態層：動態層本來就該有這些東西，掃它沒有意義。
    leaks: detectDynamicLeaks(systemInstruction),
  };
}

/**
 * 從各家 usage 欄位裡撈出「這次命中了多少快取 token」。
 *
 * 欄位名沒有統一：
 *   - DeepSeek：usage.prompt_cache_hit_tokens / prompt_cache_miss_tokens
 *   - OpenAI 相容（含硅基流動多數模型）：usage.prompt_tokens_details.cached_tokens
 *   - Gemini：usageMetadata.cachedContentTokenCount
 * 撈不到就回 null，代表「這家沒回報」，不是「命中 0」——這兩件事不能混為一談，
 * 不然監控上會把不回報的供應商誤判成快取完全失效。
 *
 * @param {object} raw 供應商原始回應
 * @returns {{hit: number, miss: number|null, total: number|null, ratio: number|null}|null}
 */
export function extractCacheStats(raw) {
  if (!raw || typeof raw !== "object") return null;
  const usage = raw.usage ?? raw.usageMetadata ?? null;
  if (!usage || typeof usage !== "object") return null;

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const hit =
    num(usage.prompt_cache_hit_tokens) ??
    num(usage.prompt_tokens_details?.cached_tokens) ??
    num(usage.cachedContentTokenCount) ??
    null;
  if (hit === null) return null;

  const total =
    num(usage.prompt_tokens) ?? num(usage.promptTokenCount) ?? null;
  const miss =
    num(usage.prompt_cache_miss_tokens) ?? (total === null ? null : Math.max(0, total - hit));

  return {
    hit,
    miss,
    total,
    ratio: total && total > 0 ? Math.round((hit / total) * 1000) / 1000 : null,
  };
}

/**
 * [估算，非真實數據] 供應商沒回報 prompt cache 欄位時，用字元長度比例回推一個「推算值」。
 *
 * 這**不是**命中率，是猜的。真正的命中發生在供應商那一端的 KV 存取層，我們這裡完全看不到；
 * 唯一能做的是假設「這回合的動態輸入（最後兩則 messages）不可能命中，其餘照三層契約
 * 應該命中」，再用字元數的比例去套 promptTokens。跟真實 token 邊界、供應商實際 prefix
 * 比對結果都對不上，只能當作「大概是這個量級」的參考值。
 *
 * 契約要求「沒回報」不能被當成一個數字（見 extractCacheStats 與
 * docs/PROMPT_CACHE_CONTRACT.md），所以這個函式的輸出**必須**帶著 estimated:true，
 * 呼叫端只能把它寫進獨立欄位（例如 cacheStatsEstimate），絕對不可以塞進
 * extractCacheStats() 用的那個欄位——那個欄位的 null 是「沒回報」的唯一表達方式，
 * 混進一個猜出來的數字，就是拿一個假訊號去餵真正在算錢的儀表板。
 *
 * @param {object} params
 * @param {Array<{role: string, content: string}>} params.messages 這次實際送出的完整訊息陣列
 *   （含 system/history/最後一則 user），跟 client.js 組給供應商的那份一致。
 * @param {number} params.promptTokens 供應商回報的 prompt_tokens（真實值，只有 hit 是用猜的）
 * @returns {{hit: number, miss: number, total: number, ratio: number, estimated: true}|null}
 */
export function estimateCacheStats({ messages, promptTokens }) {
  if (!Array.isArray(messages) || messages.length <= 2) return null;
  if (!Number.isFinite(promptTokens) || promptTokens <= 0) return null;

  const totalChars = JSON.stringify(messages).length;
  if (totalChars <= 0) return null;
  const newTurnChars = JSON.stringify(messages.slice(-2)).length;
  const cachedChars = Math.max(0, totalChars - newTurnChars);
  const ratio = cachedChars / totalChars;

  // 乘 0.95 是保守容錯值：字元比例本來就是近似值，寧可低估也不要在儀表板上顯得比實際樂觀。
  const hit = Math.max(0, Math.min(promptTokens, Math.floor(promptTokens * ratio * 0.95)));
  const miss = Math.max(0, promptTokens - hit);

  return {
    hit,
    miss,
    total: promptTokens,
    ratio: Math.round((hit / promptTokens) * 1000) / 1000,
    estimated: true,
  };
}
