// [設計] 存檔層 —— 把「一場遊戲的完整狀態」存起來，讓玩家重整頁面不會失去進度，
// 也讓 AI 能讀到之前發生過什麼（AI記憶的資料來源就是這裡存的 eventLog 與 history）。
//
// 一份存檔（session）包含四塊：
//   character  角色卡（core/schema.js 的形狀）
//   log        事件日誌（core/eventLog.js 的形狀），結構化事實，例如「判定：躲藏，成功，margin=1」
//   history    最近幾輪的敘事文字，AI 需要它才能維持劇情連貫（事實摘要沒有語氣與細節）
//   scene      目前場景描述與 AI 上一輪提出的選項
//
// 為什麼 log 跟 history 要分開存：
//   log 是「不可竄改的事實」，之後要做日誌回顧UI、算經驗值、判斷成就都靠它，會一直長大。
//   history 是「餵給AI的短期記憶」，只保留最近N輪，因為每一輪都塞進prompt會爆掉context也燒錢。
//   兩者的生命週期跟用途完全不同，混在一起遲早要拆，不如一開始就分開。
//
// [已知簡化] 沒有做「長期記憶」。history 只留最近N輪，超過就掉了。
// 劇情拉長之後AI會忘記很早以前的事，正解是做摘要或向量檢索，那是之後的工作。
// 目前 log 仍然完整保留，所以資料沒有遺失，只是沒有餵給AI。

import { createEventLog } from "../../core/eventLog.js";
import { createWallet } from "../shop/wallet.js";
import { createFormsState } from "../shop/forms.js";
import { chronicleFromHistory } from "./chronicle.js";
import { createGodspaceProfile, normalizeGodspaceProfile } from "../godspace/schema.js";

/** 餵給AI的敘事短期記憶要保留幾輪。調大會更連貫但更花錢，調小會失憶。 */
export const HISTORY_LIMIT = 8;

/**
 * 存檔格式版本。
 *   1 —— 初版
 *   2 —— 2026-08-17 加入 wallet(主神商店錢包) 與 forms(進行中的型態)
 *   3 —— 2026-08-20 加入 turns(真正的回合數，見下面 ensureSessionShape 的說明)
 *   4 —— 2026-08-23 加入 chronicle(完整長期劇情，不受短期 history 上限影響)
 *   5 —— 2026-08-23 加入 pendingTurn(LLM 失敗時保存已完成的規則結果，重試不重骰)
 *   6 —— 2026-08-24 加入 B0 godspace profile(主神空間契約與 feature flags)
 * 舊版存檔由 ensureSessionShape() 就地補欄位，不需要離線遷移。
 */
export const SESSION_VERSION = 6;

/** 存檔在KV裡的key前綴。 */
const KEY_PREFIX = "session:";

/**
 * 把一份存檔補成目前的格式。**每一個讀取路徑都要經過它。**
 *
 * [決策記錄 2026-08-17] 錢包與型態在此之前是「函式回傳的獨立物件」，沒有任何地方存得住——
 * 也就是說買了東西重整頁面就沒了。這一版把它們放進存檔，同時面對一個現實：
 * KV 裡已經有一批 version:1 的舊存檔，而且玩家正在玩。與其寫一支離線遷移腳本
 * (Workers 沒有好地方跑它，而且會漏掉當下沒被掃到的 key)，不如**在讀取時補**——
 * 舊存檔第一次被讀到就長出新欄位，下一次 put 就寫回去了。
 *
 * 補欄位刻意只補不改：既有欄位一律原樣保留，這樣即使將來格式再變，
 * 這個函式也不會把某一版的資料吃掉。
 */
export function ensureSessionShape(session) {
  if (!session) return session;
  const next = { ...session };
  if (!next.wallet) next.wallet = createWallet();
  if (!next.forms) next.forms = createFormsState();
  // [2026-08-23] history 是餵給AI的短期記憶，chronicle 才是玩家的完整劇情檔案。
  // 舊版沒有 chronicle 時只能把仍保留的 history 搬過去；不假裝能找回更早的敘事。
  if (!Array.isArray(next.chronicle)) next.chronicle = chronicleFromHistory(next.history);
  if (!Array.isArray(next.chroniclePackages)) next.chroniclePackages = [];
  // pendingTurn 是一次性的重試狀態；缺少或形狀不對時安全視為沒有待完成回合。
  if (!next.pendingTurn || typeof next.pendingTurn !== "object") next.pendingTurn = null;
  // B0 godspace profile 是 server-owned 的版本化容器；舊存檔讀取時補出，
  // 未來若 profile 增加欄位仍保留未知內部欄位，但公開回應只走 schema whitelist。
  const normalizedGodspace = normalizeGodspaceProfile(next.godspace);
  next.godspace = next.godspace && typeof next.godspace === "object"
    ? { ...next.godspace, ...normalizedGodspace, featureFlags: normalizedGodspace.featureFlags }
    : normalizedGodspace;
  // [2026-08-20] 畫面頂欄那個「回合：N」以前顯示的是**事件日誌的筆數**，不是回合數——
  // 一場戰鬥打十下就會讓它跳十幾格，玩家看到的數字跟他實際玩過幾輪完全對不上。
  // 這裡開一個真的只在「敘事推進一輪」時 +1 的計數。舊存檔沒有這個欄位，
  // 用 history 的長度當近似值(它有上限，所以只是個下限)，總比從 0 重來合理。
  if (typeof next.turns !== "number") next.turns = next.history?.length ?? 0;
  next.version = SESSION_VERSION;
  return next;
}

/** 建立一份全新的存檔內容。 */
export function createSession({ id, character, sceneContext = "", ownerId = null }) {
  const now = new Date().toISOString();
  return {
    id,
    version: SESSION_VERSION,
    // 這份存檔屬於哪個登入帳號。null = 匿名存檔（沒登入時建立的）。
    // 匿名存檔在玩家登入時會被「認領」成他的（見 content/auth/ownership.js），
    // 這樣已經在玩的人登入之後不會覺得進度不見了。
    ownerId,
    character,
    log: createEventLog(),
    history: [],
    // 完整長期劇情。它不餵進每一回合 prompt，只在劇情回顧與 AI 劇情包需要時讀取。
    chronicle: [],
    // 副本結束後只保存 package metadata；完整內容由 /api/chronicle 按需組裝。
    chroniclePackages: [],
    // AI 供應商暫時失敗時，保存已完成的規則層結果，下一次重試不重新擲骰。
    pendingTurn: null,
    scene: { context: sceneContext, options: [] },
    // 真正的回合數：只有「敘事推進了一輪」才 +1（見 functions/api/turn.js）。
    turns: 0,
    // 主神商店的錢包(支線/獎勵點數/XP)。空的——怎麼賺錢見 content/scenario/settlement.js：
    // 副本節點完成給獎勵點數，副本通關給XP。
    wallet: createWallet(),
    // 進行中的型態(變身/開眼/爆發)。戰鬥中的型態另外存在 combat.forms 裡，
    // 這一份是戰鬥外的，見 content/shop/forms.js。開戰時由 combat/start.js 帶進 combat.forms、
    // 收兵時由 combat/act.js 帶回來。到期條件是「離開啟動時所在的地點」——
    // 場景的定義見 content/shop/access.js 的 sceneKeyOf()。
    forms: createFormsState(),
    // 主神空間 B0 profile：功能開關由 server 控制，不能由前端回傳的 body 覆寫。
    godspace: createGodspaceProfile(),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 把一輪的敘事推進 history，並自動裁掉超出上限的舊紀錄。
 * 回傳新的 history 陣列（不修改傳入的那個）。
 */
export function pushHistory(history, { action, narration }) {
  const next = [...(history ?? [])];
  next.push({ action: action ?? null, narration: narration ?? null });
  return next.slice(-HISTORY_LIMIT);
}

/**
 * 把 history 轉成可以塞進 prompt 的文字段落。
 * 沒有紀錄時回傳 null，讓呼叫端知道「這是第一輪」而不是塞一段空白進去。
 */
export function historyToPromptText(history) {
  if (!history?.length) return null;
  const lines = [];
  for (const turn of history) {
    if (turn.action) lines.push(`玩家：${turn.action}`);
    if (turn.narration) lines.push(`你上一輪寫的：${turn.narration}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 儲存後端
// ---------------------------------------------------------------------------

/**
 * Cloudflare KV 版本。正式環境用這個。
 * KV 的一致性是「最終一致」，同一個玩家連續操作偶爾可能讀到舊值——
 * 以單人回合制遊戲來說可以接受（玩家不會同時在兩個裝置上搶同一回合）。
 * 如果之後要做多人同場，KV 就不夠了，要換 Durable Objects。
 */
export function kvSessionStore(kv) {
  return {
    kind: "kv",
    persistent: true,
    async get(id) {
      return ensureSessionShape((await kv.get(KEY_PREFIX + id, "json")) ?? null);
    },
    async put(session) {
      session.updatedAt = new Date().toISOString();
      await kv.put(KEY_PREFIX + session.id, JSON.stringify(session));
      return session;
    },
    async delete(id) {
      await kv.delete(KEY_PREFIX + id);
    },
    async list(limit = 50) {
      const res = await kv.list({ prefix: KEY_PREFIX, limit });
      return (res.keys ?? []).map((k) => k.name.slice(KEY_PREFIX.length));
    },
    // 給 content/auth/ownership.js 存「帳號 -> 存檔ID清單」的索引用。
    // 刻意做成通用的 raw 存取而不是加一堆 owner 專用方法：儲存層不需要知道
    // 「帳號」這個概念，它只是一個 key-value；歸屬的規則留在 ownership.js。
    async getRaw(key) {
      return (await kv.get(key, "json")) ?? null;
    },
    async putRaw(key, value) {
      await kv.put(key, JSON.stringify(value));
    },
  };
}

/**
 * 記憶體版本 —— **只給測試與本機開發用**。
 *
 * [重要警告] 不要在正式環境依賴它。Cloudflare Workers 每個 isolate 有自己的記憶體，
 * 而且 isolate 隨時會被回收，所以：存檔會莫名其妙消失，不同玩家也可能被分到不同 isolate
 * 而看到不一樣的資料。這個實作存在的唯一理由是「沒有KV binding時也能把流程跑起來」，
 * 呼叫端必須把 persistent:false 這件事**顯示給使用者看**，不能假裝存檔成功了。
 */
export function memorySessionStore(initial = new Map()) {
  const map = initial;
  return {
    kind: "memory",
    persistent: false,
    async get(id) {
      const v = map.get(id);
      return v ? ensureSessionShape(JSON.parse(JSON.stringify(v))) : null;
    },
    async put(session) {
      session.updatedAt = new Date().toISOString();
      map.set(session.id, JSON.parse(JSON.stringify(session)));
      return session;
    },
    async delete(id) {
      map.delete(id);
    },
    async list(limit = 50) {
      return [...map.keys()].filter((k) => !k.startsWith("owner:")).slice(0, limit);
    },
    async getRaw(key) {
      const v = map.get(key);
      return v ? JSON.parse(JSON.stringify(v)) : null;
    },
    async putRaw(key, value) {
      map.set(key, JSON.parse(JSON.stringify(value)));
    },
  };
}

// Workers 的 isolate 內共用同一份，讓本機開發時至少同一個 isolate 內的多次請求連得起來。
const fallbackMap = new Map();

/**
 * 依環境挑一個儲存後端。
 * 有 KV binding 就用 KV，沒有就退到記憶體版並在回傳值裡標記 persistent:false。
 * @param {object} env Cloudflare Pages Functions 的 context.env
 */
export function resolveSessionStore(env = {}) {
  if (env.SAVES && typeof env.SAVES.get === "function") {
    return kvSessionStore(env.SAVES);
  }
  return memorySessionStore(fallbackMap);
}

/** 產生一個存檔ID。用 crypto.randomUUID()，Workers 與現代瀏覽器都有。 */
export function newSessionId() {
  return crypto.randomUUID();
}
