// 回合選項系統 —— AI 提出四個行動選項，每個選項自帶一組「屬性+技能」的檢定，
// 玩家挑一個，引擎負責擲骰與規則查驗。
//
// ============================================================================
// [規則書] 這個機制的授權出處 —— 不是自創的玩法
//
// rules-2.35.txt 第686~686行（技能檢定總述）明文寫著：
//
//   「一般來說，為任何一次行動所進行的判定大多會使用 關鍵屬性 + 關鍵技能等級（對應專業）
//     來進行。這代表著角色的天賦（屬性）+ 訓練程度（技能等級）+ 該領域上的專業程度（專業）
//     + 運氣（扔骰結果）。」
//
//   「而一次行動所進行的判定究竟關聯何種關鍵技能以及何種關鍵屬性…對于沒有詳述的部分，
//     在很大程度上取決于 ST 眼中的常識，并且**可能有多種屬性+技能的組合均合適，
//     由 ST 選擇最合適的一種**。」
//
// 也就是說「幫一個行動挑屬性+技能組合」本來就是規則書指派給 ST（說書人）的工作，
// 而這個專案的 AI 扮演的正是 ST。所以讓 AI 挑組合是**照規則書辦事**，不是把規則交給 AI。
//
// 分界線在哪裡（這條必須守住）：
//   AI 負責「挑哪一組」——這是規則書授權的 ST 判斷。
//   引擎負責「挑完之後怎麼算」——骰池、成功數、附加成功、DC比較，AI 一個數字都不碰。
//   而且 AI 挑的組合**必須通過引擎查驗**：技能名不在規則書技能表裡就不採用，
//   不是「AI說有就有」。查驗邏輯見本檔 validateOption()。
// ============================================================================
//
// [設計] 難度分級表：規則書**沒有**一張通用的「難度等級 -> DC」對照表，
// 它是每個技能各自給情境表（例如攀爬：有繩索DC1 / 只能用雙手DC3 / 完全光滑DC10 / 雙腳懸空全光滑DC20）。
// 但這個專案需要一個「AI 可以從中挑一個」的有限量表——這正是最高原則第4條的作法：
// AI 只在有限選項裡挑一個分級，實際數值由程式碼查表決定，不讓 AI 自己講「這次DC是7」。
//
// 下面五級的 DC 值**不是我隨便編的**，是取自規則書實際用過的數字分布
// （攀爬表 DC1/2/3/4/5、平衡表 DC1/2/3、其他技能表大多落在 DC1~DC4）。
// 書中的 DC10/DC20 保留給「表面完全光滑」這種近乎不可能的極端情境，
// 刻意**不放進 AI 可選的量表**——那種難度應該由劇本資料明確指定，不是 AI 臨場決定。

import { ATTRIBUTES, SKILLS } from "../core/schema.js";

/** 每回合要提供幾個 AI 產生的選項（第五個「自訂行動」是前端固定提供的，不由 AI 產生）。 */
export const OPTION_COUNT = 4;

export const DIFFICULTY_TIERS = [
  { id: "容易", dc: 1, hint: "有充分的條件或工具輔助，正常情況下應該做得到" },
  { id: "普通", dc: 2, hint: "一般的挑戰，需要基本的訓練或運氣" },
  { id: "困難", dc: 3, hint: "條件不利，需要相當的專長才有把握" },
  { id: "很困難", dc: 4, hint: "條件明顯惡劣，即使是專家也可能失手" },
  { id: "極難", dc: 5, hint: "接近能力極限，通常需要傳奇級的天賦或運氣" },
];

export const DIFFICULTY_IDS = DIFFICULTY_TIERS.map((t) => t.id);
export const DEFAULT_DIFFICULTY = "普通";

/** 選項提示（這個行動想達成什麼）的長度上限。要塞進按鈕，太長會把版面撐爛。 */
const HINT_MAX_LENGTH = 24;

const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key);
const ALL_SKILLS = Object.values(SKILLS).flat();

/** 難度分級 -> DC。未知分級一律退回預設，不丟錯（AI 偶爾會寫出量表外的字串）。 */
export function difficultyToDc(difficultyId) {
  const tier = DIFFICULTY_TIERS.find((t) => t.id === difficultyId);
  return (tier ?? DIFFICULTY_TIERS.find((t) => t.id === DEFAULT_DIFFICULTY)).dc;
}

/**
 * 組出要塞進 prompt 的「選項規格說明」。
 *
 * 會把角色目前真正擁有的技能等級一起列給 AI，理由：AI 不知道角色練了什麼的話，
 * 很容易四個選項全挑到 0 級技能——而心智系技能 0 級在規則上是**自動失敗**，
 * 那會讓玩家四個選項全是死路，體驗極差。列出來讓它有依據地挑。
 */
export function buildOptionsSpec(character) {
  const trained = ALL_SKILLS.filter((s) => (character?.skills?.[s] ?? 0) > 0)
    .map((s) => `${s}${character.skills[s]}`)
    .join("、");
  const untrained = ALL_SKILLS.filter((s) => (character?.skills?.[s] ?? 0) === 0).join("、");

  const skillsByCategory = Object.entries(SKILLS)
    .map(([category, list]) => `${category}：${list.join("、")}`)
    .join("\n");

  return `【你要額外產出的東西：${OPTION_COUNT}個行動選項】

除了敘事之外，你必須提出 ${OPTION_COUNT} 個玩家接下來可以採取的行動選項，
並且為每個選項指定它會用到的「關鍵屬性 + 關鍵技能」組合與難度分級。
這是規則書指派給說書人的工作（規則書：可能有多種屬性+技能組合均合適，由ST選擇最合適的一種）。

可用的屬性（只能從這${ATTRIBUTE_KEYS.length}個裡挑，用完全一樣的中文字）：
${ATTRIBUTE_KEYS.join("、")}

可用的技能（只能從這裡挑，用完全一樣的中文字；也可以填 null 表示純屬性檢定）：
${skillsByCategory}

這個角色目前的技能等級：
- 有訓練：${trained || "（無）"}
- 未訓練（等級0）：${untrained}

挑選時請注意：
- **四個選項要是四種不同的解決思路**（例如：正面強攻／迂迴潛行／溝通交涉／觀察搜證）。
- **需要檢定的選項，技能必須全部不同**，不可以有兩個選項用同一個技能。這條沒有例外：
  玩家如果每一回合都能在選項裡找到自己最強的那個技能，他就不會再讀故事，
  只會挑骰池最大的那個按下去。
- 至少有一個、但**最多兩個**選項用到角色有訓練的技能。有訓練的選項是讓玩家有把握的出口，
  但四個裡面給太多，等於在告訴玩家「照你原本的打法繼續就好」。
- 心智系技能（${SKILLS.心智.join("、")}）在等級0時規則上是**自動失敗**，
  除非你就是想給一個明知極險的選項，否則不要指定角色沒練的心智系技能。
- 難度分級只能從這五個裡挑：${DIFFICULTY_IDS.join("／")}
  （${DIFFICULTY_TIERS.map((t) => `${t.id}=${t.hint}`).join("；")}）
- 選項文字寫成玩家會說出口的行動，20字以內，不要寫成「進行感知檢定」這種系統語言。
- **每個選項都要附一句 hint（15字以內）：玩家做這件事是想得到什麼。**
  例如「想知道血跡通往哪裡」「想搶在它繞過來之前離開這層」。
  這一格是玩家判斷「該按哪個」的主要依據——沒有它，玩家只能比較骰池數字大小，
  那等於整個故事都白寫了。hint 寫目的與可能的收穫，不要寫成功率、不要重複 label 的字面。

【純敘事選項（requiresCheck: false）】
你可以、也**建議**在這 ${OPTION_COUNT} 個選項裡放 1~2 個純探索、對話、無風險的行動——
例如「問對方剛才那句話是什麼意思」「走過去看牆上的名牌」「把手電筒轉向通風口」。
這類選項請標記 "requiresCheck": false，並且**不要**填 attribute / skill / difficulty。
剩下的選項標記 "requiresCheck": true，照常填屬性、技能與難度。

為什麼要有這種選項：不是每個動作都該擲骰。當四個選項全都是檢定時，玩家每一回合都在
賭博，故事就退化成連續的骰子畫面；而且「跟NPC講一句話也要擲骰」本身就不合理。
純敘事選項是讓玩家能安全地把世界看清楚的出口。

限制（這幾條由引擎查驗，違反的選項會被降級或退回）：
- 純敘事選項不可以拿來取代真正有風險的行動。要開一道卡死的門、要偷東西、
  要在怪物旁邊移動——那些一律是檢定選項，不可以標成 requiresCheck: false 混過去。
- 純敘事選項一樣要寫 hint（做這件事想知道／想得到什麼）。
- ${OPTION_COUNT} 個選項裡**至少要有 2 個是檢定選項**，不可以整頁都是無風險行動。

【輸出格式】
你必須輸出**純JSON**，不要包任何說明文字、不要用markdown程式碼區塊。格式如下：

{
  "st_thought": "【玩家看不到】這一回合的盤算：判定是哪一級、要付出什麼代價／給什麼成果、處境怎麼變",
  "narration": "這一段是你的敘事文字",
  "options": [
    { "label": "選項文字", "hint": "想達成什麼", "requiresCheck": true, "attribute": "感知", "skill": "偵察", "difficulty": "普通" },
    { "label": "選項文字", "hint": "想達成什麼", "requiresCheck": true, "attribute": "力量", "skill": "格鬥", "difficulty": "困難" },
    { "label": "選項文字", "hint": "想達成什麼", "requiresCheck": true, "attribute": "敏捷", "skill": "潛行", "difficulty": "很困難" },
    { "label": "純敘事選項的文字", "hint": "想知道什麼", "requiresCheck": false }
  ]
}

st_thought 是給你自己用的後台盤算，玩家看不到，寫80字以內的重點條列就好。
它必須排在 narration 之前——先想清楚這一回合要發生什麼，再動筆寫。`;
}

/**
 * 這一回合期望的回覆結構，寫成 JSON Schema。
 *
 * [2026-08-16] 用途是「結構化輸出」：多數供應商都支援在請求裡附一份 schema，
 * 由供應商端**保證**模型的輸出符合它（Gemini 的 responseSchema、OpenAI 相容的
 * response_format.json_schema、Workers AI 的 json_schema）。這是把
 * 「祈禱模型照著 prompt 裡的範例寫」換成「格式由協定保證」，
 * 也是把保底選項的觸發率壓下來最有效的一招——線上實測 8B 模型光靠 prompt
 * 大約每四輪會有一輪寫出不合法的 JSON。
 *
 * schema 刻意寫得**只約束結構、不約束內容**（只有 attribute 與 difficulty 用 enum，
 * 因為那兩個的合法值很少且固定）。技能名、專業名一律不進 schema，理由是這個專案的
 * 分工本來就是「AI 挑組合、引擎查驗」（見本檔案開頭的規則書出處說明）——
 * 查驗權在 validateOption()，不能因為多了一份 schema 就把它變成第二個真理來源，
 * 那樣以後改技能表要記得改兩個地方，遲早會不一致。
 *
 * 這份 schema 放在這個檔案而不是 content/llm/client.js：client.js 只該懂「線路格式」，
 * 不該懂「一回合長什麼樣」。呼叫端（functions/api/turn.js）負責把兩者接起來。
 */
export const TURN_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    // [2026-08-18 新增] 思維鏈（CoT）欄位：模型必須先寫這一格的盤算，才寫敘事。
    //
    // 放進 schema 而不是只寫在 prompt 裡，是因為結構化輸出是**照欄位順序**生成的——
    // 只有真的排在 narration 之前，「先想再寫」才成立；寫在 prompt 裡拜託它先想，
    // 模型照樣可以先寫完故事再回頭補一段事後諸葛。
    // （Gemini 眼裡 properties 是無序的，順序要靠 propertyOrdering，
    //   那一步由 content/llm/client.js 的 withPropertyOrdering() 自動補上。）
    //
    // 這一格**不給玩家看**（見 functions/api/turn.js：只在 degraded/debug 欄位帶回，
    // 不會進 narration、不會進存檔的 history）。它也**不是**新的真理來源：
    // 裡面就算寫了數字也一律不採用，引擎的判定結果永遠以 checkResult 為準。
    st_thought: { type: "string" },
    narration: { type: "string" },
    options: {
      type: "array",
      minItems: OPTION_COUNT,
      maxItems: OPTION_COUNT,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          // hint 進 schema 是刻意的（跟技能名不進 schema 的理由不衝突）：它沒有「合法值清單」
          // 要維護，純粹是一段給玩家看的文字，但它是玩家判斷該按哪個選項的主要依據，
          // 少了它整個選單就退化成比大小。用 schema 保證它一定出現，比在prompt裡拜託模型可靠。
          hint: { type: "string" },
          // [2026-08-18 新增] 這個選項要不要擲骰。明確的布林值，不是「有沒有填 attribute」
          // 這種靠推論得到的東西——推論出來的東西沒辦法查驗，也沒辦法在UI上誠實標示。
          // false = 純敘事行動（探索/對話/觀察），引擎不擲骰，attribute/skill/difficulty 一律忽略。
          requiresCheck: { type: "boolean" },
          // attribute/difficulty 不再是 required：純敘事選項本來就不該有這兩格。
          // 留在 properties 裡是因為檢定選項仍然要用它們，而且 enum 仍然由供應商端保證。
          attribute: { type: "string", enum: ATTRIBUTE_KEYS },
          skill: { type: ["string", "null"] },
          difficulty: { type: "string", enum: DIFFICULTY_IDS },
        },
        required: ["label", "hint", "requiresCheck"],
      },
    },
  },
  required: ["st_thought", "narration", "options"],
};

/**
 * 從 LLM 回傳的文字裡把 JSON 挖出來。
 *
 * 為什麼要「挖」而不是直接 JSON.parse：不論怎麼交代，模型還是常常會
 * 包一層 ```json 程式碼區塊、或在前後加一句「好的，以下是…」。
 * 這裡容忍這些情況，但**不容忍解析失敗還假裝成功**——挖不出來就明確回報，
 * 由呼叫端決定降級處理（見 functions/api/turn.js：退回純敘事、選項留空，
 * 玩家仍然可以用自訂行動繼續玩，不會卡死）。
 *
 * @returns {{ok: true, data: object} | {ok: false, error: string}}
 */
export function parseTurnResponse(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: "AI回傳空白內容" };
  }

  const candidates = [];
  const trimmed = text.trim();
  candidates.push(trimmed);

  // ```json ... ``` 或 ``` ... ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());

  // 最外層的 {...}
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const data = JSON.parse(candidate);
      if (data && typeof data === "object" && !Array.isArray(data)) return { ok: true, data };
    } catch {
      // 換下一種挖法
    }
  }

  return { ok: false, error: "AI回傳的內容不是合法JSON，無法取出選項" };
}

/**
 * parseTurnResponse() 判定失敗（通常是輸出被截斷，JSON缺了結尾括號）時的最後防線：
 * 用正則把 "narration": "..." 欄位的純文字內容挖出來，而不是把整坨壞掉的JSON原文
 * 直接顯示給玩家看——那會讓玩家在說書人對話框裡看到裸奔的程式碼，瞬間出戲。
 *
 * 挖不到就回傳 null，呼叫端(functions/api/turn.js)退回顯示原始文字，
 * 至少行為跟修正前一樣，不會因為這個防線而讓情況變得更差。
 *
 * @param {string} text LLM 原始回覆
 * @returns {string | null}
 */
export function extractNarrationFallback(text) {
  if (typeof text !== "string") return null;

  // 1) 正常情況：narration 字串有頭有尾。
  const closed = text.match(/"narration"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (closed) return unescapeJsonString(closed[1]);

  // 2) [2026-08-16 修正] 輸出被切斷，narration 字串**沒有收尾引號**。
  //
  // 這是實際回報的畫面bug：玩家在說書人對話框裡看到裸奔的
  //   { "narration": "昏紅的緊急照明燈光在B3隔離艙內…掛著一枚沾染暗紅血跡的士兵
  // ——文字停在句子中間、沒有結尾引號，所以上面那條要求收尾引號的正則match不到，
  // 回傳null，呼叫端只好把整段原文印出來，玩家就看到了程式碼。
  //
  // 被切斷的敘事本身**仍然是AI寫的、仍然可讀**，沒有理由不給玩家看。
  // 這裡把「開頭到字串結束為止」抓出來，至少讓玩家讀到那段文字而不是JSON語法。
  // 結尾的 \\? 是必要的：輸出剛好斷在一個反斜線上時（跳脫序列只寫了一半），
  // 那個落單的反斜線既不符合 \\. 也不符合 [^"\\]，沒有這一格的話整條正則會match不到、
  // 退回 null，玩家又會看到裸JSON——等於這個修正在最需要它的邊界上失效。
  const truncated = text.match(/"narration"\s*:\s*"((?:\\.|[^"\\])*)\\?$/);
  if (truncated) return unescapeJsonString(truncated[1]);

  return null;
}

function unescapeJsonString(raw) {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * 查驗單一選項是否合乎規則書。**這是「AI說了不算」的那道關卡。**
 *
 * 查驗策略是「盡量修好，而不是整個丟掉」——因為丟掉一個選項，玩家的可選項就少一個，
 * 體驗損失比「這個選項的技能被降級成純屬性檢定」大得多。但每一次修正都會記錄在
 * warnings 裡回傳，不會靜靜地改掉然後假裝沒事。
 *
 * @param {object} raw AI 產生的選項物件
 * @param {object} [character] 角色卡，用來查驗技能/專業是否真的存在於這張卡上
 * @returns {{ok: boolean, option?: object, warnings: string[], error?: string}}
 */
export function validateOption(raw, character) {
  const warnings = [];

  if (!raw || typeof raw !== "object") {
    return { ok: false, warnings, error: "選項不是物件" };
  }

  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!label) {
    return { ok: false, warnings, error: "選項缺少label（要顯示給玩家看的行動文字）" };
  }

  // hint（這個選項想達成什麼）：缺了不算錯——選項本身仍然可以玩，只是玩家少一份判斷依據，
  // 為了這個把整個選項丟掉反而更糟。長度截斷是因為它要塞進按鈕裡，太長會把版面撐爛。
  const hint =
    typeof raw.hint === "string" && raw.hint.trim()
      ? raw.hint.trim().slice(0, HINT_MAX_LENGTH)
      : null;

  // -------------------------------------------------------------------------
  // [2026-08-18 新增] 純敘事選項（requiresCheck === false）。
  //
  // 走這條路的選項**完全不驗** attribute / skill / difficulty，而且會把這三格
  // 連同 dc 一起強制設成 null。理由是「沒有檢定」必須是一個乾淨的狀態，不能留下
  // 半截的檢定欄位：只要 dc 還帶著一個數字，之後任何一個呼叫端都可能把它拿去擲骰，
  // 而玩家看到的按鈕上寫的是「這個行動沒有風險」——那就是引擎在騙人。
  //
  // 判斷用嚴格 `=== false`：欄位缺席（舊的AI、舊的存檔、舊的前端）一律當成「要檢定」，
  // 也就是修改前的行為。默認值選「要檢定」而不是「不檢定」是刻意的——猜錯的話，
  // 前者只是多擲一次骰，後者會讓有風險的行動變成免費通行證。
  // -------------------------------------------------------------------------
  if (raw.requiresCheck === false) {
    const option = {
      label,
      requiresCheck: false,
      attribute: null,
      skill: null,
      difficulty: null,
      dc: null,
    };
    if (hint) option.hint = hint;
    // 有填屬性/技能/難度不算錯，但要講出來：這代表AI對這個選項的性質猶豫，
    // 而引擎已經照它自己填的 requiresCheck 把那些欄位丟掉了。
    if (raw.attribute || raw.skill || raw.difficulty) {
      warnings.push("純敘事選項(requiresCheck:false)附帶了屬性/技能/難度，已一律忽略");
    }
    return { ok: true, option, warnings };
  }

  // --- 屬性：一定要是規則書六維屬性之一，沒得商量（沒有屬性就無法組骰池） ---
  if (!ATTRIBUTE_KEYS.includes(raw.attribute)) {
    return {
      ok: false,
      warnings,
      error: `屬性「${raw.attribute}」不在規則書屬性表裡（${ATTRIBUTE_KEYS.join("/")}）`,
    };
  }

  const option = { label, requiresCheck: true, attribute: raw.attribute };
  if (hint) option.hint = hint;

  // --- 技能：不在規則書技能表裡就降級成純屬性檢定，不採用AI自創的技能名 ---
  if (raw.skill != null && raw.skill !== "") {
    if (!ALL_SKILLS.includes(raw.skill)) {
      warnings.push(`技能「${raw.skill}」不在規則書技能表裡，已改為純屬性檢定`);
    } else if (character && character.skills?.[raw.skill] == null) {
      // 技能存在於規則書，但這張角色卡上沒有這個欄位（例如自訂卡片刪過欄位）。
      // 直接傳給 performCheck() 會丟錯，所以在這裡先降級。
      warnings.push(`角色卡上沒有技能「${raw.skill}」欄位，已改為純屬性檢定`);
    } else {
      option.skill = raw.skill;
    }
  }

  // --- 專業(specialization)：輕量化規則刻意不做，所以這裡**明確丟棄**，不是忘了處理 ---
  //
  // [2026-08-16 決策] 在這之前這裡會查驗並帶上 raw.specialization，一路傳進
  // optionToCheckParams() -> performCheck()，但 core/check.js 從頭到尾沒有讀過這個欄位。
  // 也就是說：選項帶不帶專業，判定結果完全一樣。更糟的是上面那句被刪掉的警告文字寫著
  // 「引擎會依規則將技能等級減半」——那個減半規則在整個專案裡不存在，等於程式碼在說謊。
  //
  // 兩條路（接上／拆掉）選了拆掉，理由：建卡已經改成後台自動配點，玩家沒有任何
  // 購買專業的入口，接上等於為一個沒人能取得的資源實作一整套規則。留著一個
  // 「假裝生效」的參數比明講「還沒做」危險得多，所以現在明確不接受這個欄位。
  // 規則書原文的專業機制仍記錄在 RULES_DIGEST.md 的「已知落差」，要做的時候從那裡接回來。

  // --- 難度：不在量表裡就退回預設，不接受 AI 自己講一個 DC 數字 ---
  //
  // 注意這裡刻意**完全忽略** raw.dc：DC 一律從難度分級查表得出。
  // 這擋掉了「AI 或前端直接塞一個 dc: 0 進來」這種最嚴重的情況。
  //
  // [已知限制] 但擋不掉「把難度分級從『困難』改成『容易』」——那是一個量表內的合法值，
  // 伺服器沒有回合狀態，無從得知 AI 原本給的是哪一級。要完全防堵需要伺服器端保存
  // 「這一回合我發出去的選項長什麼樣」（或對選項簽章），那要等存檔/session機制做出來
  // （見 README 的待辦）。以單人遊戲來說，改難度只是自己騙自己，不影響別人，
  // 所以先接受這個限制，但如實寫在這裡，不假裝已經防住了。
  let difficulty = raw.difficulty;
  if (!DIFFICULTY_IDS.includes(difficulty)) {
    warnings.push(`難度「${difficulty}」不在分級量表裡，已改用「${DEFAULT_DIFFICULTY}」`);
    difficulty = DEFAULT_DIFFICULTY;
  }
  option.difficulty = difficulty;
  option.dc = difficultyToDc(difficulty);

  return { ok: true, option, warnings };
}

/**
 * 系統預設的通用行動選項，只在 validateOptions() 判定數量不足時用來墊底(見該函式的說明)。
 *
 * 這些選項刻意寫得跟場景/劇情完全無關——不描寫任何NPC、地點或情境細節，純粹是
 * 「觀察／突破／交涉／潛行」四種通用行為傾向，放進任何場景都說得通。這樣拿它們墊底
 * 不算是程式碼在替AI編故事，只是保證版面一定有得選，跟AI實際寫了什麼敘事內容完全脫鉤。
 */
export const FALLBACK_OPTIONS = [
  { label: "謹慎觀察四周，尋找線索", hint: "想弄清楚眼前的狀況", requiresCheck: true, attribute: "感知", skill: "偵察", difficulty: "容易" },
  { label: "強行突破當前的阻礙", hint: "想用力氣打開一條路", requiresCheck: true, attribute: "力量", skill: "格鬥", difficulty: "普通" },
  { label: "試著開口溝通或喊話", hint: "想確認附近還有沒有人", requiresCheck: true, attribute: "意志", skill: "交涉", difficulty: "普通" },
  { label: "悄悄行動，伺機而動", hint: "想在不被發現下換位置", requiresCheck: true, attribute: "敏捷", skill: "潛行", difficulty: "普通" },
];

/**
 * 一個回合最多幾個純敘事選項。
 *
 * 上限存在的理由：純敘事選項不擲骰、不會推進迫近度、也不會消耗套路遞減的計數，
 * 全部給純敘事等於玩家可以無風險地一直看下去。留 2 個是「有安全出口」與
 * 「這仍然是一個有骰子的遊戲」之間的折衷，跟 prompt 裡寫給AI的「1~2個」一致。
 */
export const MAX_FREE_OPTIONS = 2;

/** 這一批選項裡有幾個是真的要擲骰的（純敘事選項不算）。 */
function checkOptionCount(options) {
  return options.filter((o) => o.requiresCheck !== false).length;
}

/** 這一批選項裡有幾個是純敘事選項。 */
function countFreeOptions(options) {
  return options.filter((o) => o.requiresCheck === false).length;
}

/**
 * 查驗整批選項，數量不足時用 FALLBACK_OPTIONS 墊到 OPTION_COUNT 個。
 *
 * [2026-08-15 決策變更] 這裡原本刻意不補選項，理由是「補出來的選項文字等於是程式碼在編
 * 劇情」，違反「敘事只能來自 AI、數值只能來自引擎」的分工。但使用者明確要求「不管AI輸出
 * 什麼，每個回覆底下都要有四個選項」——版面時而2顆時而4顆按鈕的不一致，體驗上比「絕對
 * 不讓引擎生一個字的選項文字」更糟。折衷做法：墊底只用完全通用、不涉及任何場景細節的
 * FALLBACK_OPTIONS，跟這回合AI寫了什麼敘事完全無關，所以嚴格來說引擎沒有在「編故事」，
 * 只是保底版面；AI真正給的合法選項一律優先，只有數量不足額才補墊底選項。
 * 「自訂行動」輸入框本來就是前端固定提供、不受這裡影響，雙重保底玩家不會卡住。
 *
 * [2026-08-16 決策變更] 原本這個函式把兩種性質完全不同的情況處理成一模一樣的結果：
 *   (a) AI給了3個合法選項、少1個  —— 正常的小瑕疵，墊1個沒什麼問題
 *   (b) AI根本沒回傳可用的選項    —— 代表這一輪的選項**全部**是引擎湊的，
 *       玩家看到的四個按鈕跟AI寫的敘事毫無關係，而且每一輪都會逐字一樣
 * 兩者都只在 warnings 裡留一句話，而 warnings 沒有任何呼叫端在看，所以(b)可以連續
 * 發生幾十輪而沒有人發現。現在改成：
 *   - 每個選項標上 source（"ai" 或 "fallback"），呼叫端/前端可以直接看出誰是保底的
 *   - 回傳 aiOptionCount / fallbackCount，讓呼叫端能區分(a)與(b)並決定要不要留log
 *   - (b) 的警告文字明講「整組都是保底選項」，不再跟(a)共用同一句
 * 墊底行為本身完全沒變（使用者要求版面一定要有四顆按鈕），變的只有「有沒有講出來」。
 *
 * @returns {{options: object[], warnings: string[], aiOptionCount: number, fallbackCount: number}}
 */
export function validateOptions(rawOptions, character) {
  const warnings = [];
  const options = [];

  if (!Array.isArray(rawOptions)) {
    warnings.push("AI沒有回傳options陣列");
  } else {
    rawOptions.forEach((raw, index) => {
      const result = validateOption(raw, character);
      result.warnings.forEach((w) => warnings.push(`選項${index + 1}：${w}`));
      if (!result.ok) {
        warnings.push(`選項${index + 1}被捨棄：${result.error}`);
        return;
      }
      // [2026-08-18] 純敘事選項的數量上限。prompt 裡寫的是「1~2個」，但那是請求，不是保證——
      // 模型有機會整頁都給無風險行動，那樣玩家整個回合不會擲到任何一顆骰子，
      // 骰子系統等於被AI關掉了。超過上限的純敘事選項在這裡丟掉，
      // 空出來的位置由底下的保底選項（一定是檢定選項）補回來，版面仍然是四顆按鈕。
      if (result.option.requiresCheck === false && countFreeOptions(options) >= MAX_FREE_OPTIONS) {
        warnings.push(
          `選項${index + 1}被捨棄：純敘事選項一回合最多 ${MAX_FREE_OPTIONS} 個（這是第 ${countFreeOptions(options) + 1} 個）`
        );
        return;
      }
      options.push({ ...result.option, source: "ai" });
    });
  }

  const aiOptionCount = options.length;

  if (aiOptionCount === 0) {
    warnings.push(
      `AI這一輪沒有給出任何可用選項，底下四個選項**全部**是與劇情無關的通用保底選項` +
        `（每一輪都會是同一組文字）。這通常代表AI沒有照JSON格式輸出，或選項全部沒通過規則查驗。`
    );
  } else if (aiOptionCount !== OPTION_COUNT) {
    warnings.push(`AI給了${aiOptionCount}個可用選項，預期${OPTION_COUNT}個，已用通用選項墊滿`);
  }

  for (const fallback of FALLBACK_OPTIONS) {
    if (options.length >= OPTION_COUNT) break;
    if (options.some((o) => o.label === fallback.label)) continue;
    const result = validateOption(fallback, character);
    if (result.ok) options.push({ ...result.option, source: "fallback" });
  }

  return {
    options,
    warnings,
    aiOptionCount,
    fallbackCount: options.length - aiOptionCount,
    // 這一輪玩家有幾個「按下去會擲骰」的選項、幾個純敘事選項。呼叫端拿它留log／給前端顯示，
    // 不用自己再掃一次陣列，也不用自己推論「沒有 attribute 大概就是純敘事吧」。
    freeOptionCount: countFreeOptions(options),
    checkOptionCount: checkOptionCount(options),
  };
}

/**
 * 把查驗過的選項轉成 core/check.js 的 performCheck() 需要的參數。
 *
 * 純敘事選項（requiresCheck === false）走到這裡一律**丟錯**，不回傳一組湊出來的參數。
 * 這是刻意大聲的：呼叫端如果忘了先分流，代表它會替一個「玩家被告知沒有風險」的行動
 * 擲一次骰——那種錯不可以靜靜地發生，寧可當場炸掉讓測試抓到。
 */
export function optionToCheckParams(option) {
  if (option?.requiresCheck === false) {
    throw new Error(
      `「${option.label}」是純敘事選項(requiresCheck:false)，不需要檢定。` +
        `呼叫端應該在轉檢定參數之前就先分流，不要對它擲骰。`
    );
  }
  const params = { attribute: option.attribute, dc: option.dc ?? difficultyToDc(option.difficulty) };
  if (option.skill) params.skill = option.skill;
  return params;
}
