// 回合選項系統 —— AI 提出四個行動選項，每個選項自帶一組「屬性+技能」的檢定，
// 玩家挑一個，引擎負責擲骰與規則查驗。
//
// ============================================================================
// [規則書] 這個機制的授權出處 —— 不是自創的玩法
//
// rules-2.35.txt 第3819~3849行（技能檢定總述）明文寫著：
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

  const specs = Object.entries(character?.specializations ?? {})
    .filter(([, list]) => Array.isArray(list) && list.length > 0)
    .map(([skill, list]) => `${skill}（${list.join("、")}）`)
    .join("、");

  return `【你要額外產出的東西：${OPTION_COUNT}個行動選項】

除了敘事之外，你必須提出 ${OPTION_COUNT} 個玩家接下來可以採取的行動選項，
並且為每個選項指定它會用到的「關鍵屬性 + 關鍵技能」組合與難度分級。
這是規則書指派給說書人的工作（規則書：可能有多種屬性+技能組合均合適，由ST選擇最合適的一種）。

可用的屬性（只能從這九個裡挑，用完全一樣的中文字）：
${ATTRIBUTE_KEYS.join("、")}

可用的技能（只能從這裡挑，用完全一樣的中文字；也可以填 null 表示純屬性檢定）：
生理：${SKILLS.生理.join("、")}
心智：${SKILLS.心智.join("、")}
互動：${SKILLS.互動.join("、")}

這個角色目前的技能等級：
- 有訓練：${trained || "（無）"}
- 未訓練（等級0）：${untrained}
${specs ? `- 已登記的專業：${specs}` : ""}

挑選時請注意：
- **四個選項要是四種不同的解決思路**（例如：正面強攻／迂迴潛行／溝通交涉／觀察搜證），
  不要四個都是打架，也不要四個都用同一個技能。
- 至少有兩個選項應該用到角色**有訓練**的技能，否則玩家等於沒有選擇。
- 心智系技能（${SKILLS.心智.join("、")}）在等級0時規則上是**自動失敗**，
  除非你就是想給一個明知極險的選項，否則不要指定角色沒練的心智系技能。
- 難度分級只能從這五個裡挑：${DIFFICULTY_IDS.join("／")}
  （${DIFFICULTY_TIERS.map((t) => `${t.id}=${t.hint}`).join("；")}）
- 選項文字寫成玩家會說出口的行動，20字以內，不要寫成「進行感知檢定」這種系統語言。

【輸出格式】
你必須輸出**純JSON**，不要包任何說明文字、不要用markdown程式碼區塊。格式如下：

{
  "narration": "這一段是你的敘事文字",
  "options": [
    { "label": "選項文字", "attribute": "感知", "skill": "調查", "specialization": null, "difficulty": "普通" },
    { "label": "選項文字", "attribute": "力量", "skill": "運動", "specialization": null, "difficulty": "困難" },
    { "label": "選項文字", "attribute": "風度", "skill": "交際", "specialization": null, "difficulty": "容易" },
    { "label": "選項文字", "attribute": "敏捷", "skill": "躲藏", "specialization": null, "difficulty": "很困難" }
  ]
}`;
}

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

  // --- 屬性：一定要是規則書九維屬性之一，沒得商量（沒有屬性就無法組骰池） ---
  if (!ATTRIBUTE_KEYS.includes(raw.attribute)) {
    return {
      ok: false,
      warnings,
      error: `屬性「${raw.attribute}」不在規則書九維屬性表裡（${ATTRIBUTE_KEYS.join("/")}）`,
    };
  }

  const option = { label, attribute: raw.attribute };

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

  // --- 專業：只有角色真的登記過才帶上，否則讓引擎照「無對應專業減半」規則處理 ---
  if (option.skill && raw.specialization) {
    const owned = character?.specializations?.[option.skill] ?? [];
    if (!character || owned.includes(raw.specialization)) {
      option.specialization = raw.specialization;
    } else {
      warnings.push(
        `角色沒有登記「${option.skill}」的專業「${raw.specialization}」，` +
          `本次不套用專業（引擎會依規則將技能等級減半）`
      );
    }
  }

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
 * 查驗整批選項。
 *
 * 刻意**不**在數量不足時自己補選項——補出來的選項文字等於是程式碼在編劇情，
 * 那違反「敘事只能來自 AI、數值只能來自引擎」的分工。數量不足就如實回報，
 * 前端照樣會提供第五個「自訂行動」輸入框，玩家不會卡住。
 *
 * @returns {{options: object[], warnings: string[]}}
 */
export function validateOptions(rawOptions, character) {
  const warnings = [];

  if (!Array.isArray(rawOptions)) {
    return { options: [], warnings: ["AI沒有回傳options陣列"] };
  }

  const options = [];
  rawOptions.forEach((raw, index) => {
    const result = validateOption(raw, character);
    result.warnings.forEach((w) => warnings.push(`選項${index + 1}：${w}`));
    if (result.ok) {
      options.push(result.option);
    } else {
      warnings.push(`選項${index + 1}被捨棄：${result.error}`);
    }
  });

  if (options.length !== OPTION_COUNT) {
    warnings.push(`AI給了${options.length}個可用選項，預期${OPTION_COUNT}個`);
  }

  return { options, warnings };
}

/** 把查驗過的選項轉成 core/check.js 的 performCheck() 需要的參數。 */
export function optionToCheckParams(option) {
  const params = { attribute: option.attribute, dc: option.dc ?? difficultyToDc(option.difficulty) };
  if (option.skill) params.skill = option.skill;
  if (option.specialization) params.specialization = option.specialization;
  return params;
}
