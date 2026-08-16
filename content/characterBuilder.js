// [設計] 輕量建卡組裝層
//
// 每個身分模板(archetype)除了屬性/技能配點之外，還帶兩組「角色塑造」資料：
//   - backstoryOptions：2個背景故事候選，玩家二選一，各自帶一個選填的自訂欄位
//     (例如同袍的名字)，讓同一個模板的兩個玩家不會有一模一樣的來歷。
//   - feats：3個固定專長。2個是 skillBonus 型(實際影響數值)，1個是 narrative 型
//     (不影響任何數值，只餵給AI當性格傾向提示，見 content/narrativeStyle.js 的分層說明)。
//
// skillBonus 的加成時機刻意設計成「0-3配點驗證通過**之後**才疊加」：玩家自己能配到的
// 上限仍然是3，專長的+1是額外疊上去的，所以最終值可能到4。為了讓前端能顯示
// 「2 (+1專長) = 3」，回傳的角色卡把兩個值分開存：
//   character.skillBase.格鬥 = 玩家配點的原始值
//   character.skills.格鬥     = 專長加成後的最終值(實際判定用這個)

import { emptyCharacter, ATTRIBUTES, SKILLS } from "../core/schema.js";
import { computeDerivedStats, DEFAULT_SIZE } from "../core/derivedStats.js";

const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key);
const ALL_SKILLS = Object.values(SKILLS).flat();

/** 自訂欄位的長度上限。超過直接截斷，不報錯——這是選填的風味欄位，不值得擋住整張卡。 */
const CUSTOM_DETAIL_MAX_LENGTH = 40;

// ---------------------------------------------------------------------------
// [設計] 遞增配點成本
//
// 起因是實際測玩回饋（逐字）：
//   「只要玩家把單一屬性+單一技能點高，就能一直用同一個檢定通關，
//     因為我的敏捷+潛行最高，我每次都按相關的選項」
//
// 舊制是**線性**的：屬性從1加到5花4點、5個屬性各加1也花4點，兩者代價一模一樣。
// 在骰池制底下這不是平衡的選擇，是一個明顯的最佳解——骰池愈大成功率愈高，
// 而「把點全押在一個組合上」不需要付出任何額外代價，理性玩家沒有理由不這樣做。
//
// 改成遞增之後（每一級的邊際成本）：
//   屬性 1->2:1  2->3:1  3->4:2  4->5:3   （累計 0/1/2/4/7）
//   技能 0->1:1  1->2:1  2->3:2            （累計 0/1/2/4）
// 專精仍然做得到，而且仍然強——但把敏捷點到5要花掉7點（總預算8點），
// 玩家會清楚感覺到「這一點是拿其他五個屬性換來的」。這不是削弱專精，
// 是讓專精變成一個**有代價的選擇**，而不是一個沒有理由不選的選項。
//
// 預算跟著調高（屬性6->8、技能8->10），讓四個內建模板維持原本的配點不變——
// 這次要改的是「極端專精的代價」，不是「所有角色都變弱」。
//
// 數值是草案，之後依實際測玩調整；改的時候要連 test/characterBuilder.test.js 一起改。
// ---------------------------------------------------------------------------

/** 屬性每一級的邊際成本（索引 = 從幾升到幾+1）。基礎值1不用花點。 */
const ATTRIBUTE_STEP_COST = { 2: 1, 3: 1, 4: 2, 5: 3 };
/** 技能每一級的邊際成本。基礎值0不用花點。 */
const SKILL_STEP_COST = { 1: 1, 2: 1, 3: 2 };

export const ATTRIBUTE_BUDGET = 8;
export const SKILL_BUDGET = 10;

/** 把一個數值從基礎值升到 value 的**累計**成本。查表加總，不用公式，方便日後隨意調整曲線。 */
function cumulativeCost(value, stepCost, startValue) {
  let total = 0;
  for (let level = startValue + 1; level <= value; level++) total += stepCost[level] ?? 0;
  return total;
}

/** 屬性從1升到 value 的累計點數成本。 */
export function attributeCost(value) {
  return cumulativeCost(value, ATTRIBUTE_STEP_COST, 1);
}

/** 技能從0升到 value 的累計點數成本。 */
export function skillCost(value) {
  return cumulativeCost(value, SKILL_STEP_COST, 0);
}

/**
 * 「再加一級」要花幾點。前端用它在加點按鈕旁邊標出下一點的價格——
 * 玩家必須在按下去之前就看到「這一點要3點」，否則遞增成本只會變成一個
 * 「我按了才發現點數不夠」的挫折來源，而不是一個可以規劃的取捨。
 */
export function nextStepCost(kind, currentValue) {
  const table = kind === "attr" ? ATTRIBUTE_STEP_COST : SKILL_STEP_COST;
  return table[currentValue + 1] ?? null;
}

export const ARCHETYPES = {
  soldier: {
    name: "特戰隊員",
    desc: "遠程射擊與戰術身法專家",
    attributes: { 敏捷: 4, 耐力: 2, 感知: 2, 力量: 2, 智力: 1, 意志: 1 },
    skills: { 射擊: 3, 潛行: 2, 體魄: 2, 偵察: 1 },
    backstoryOptions: [
      {
        id: "soldier-veteran",
        text: "你是退役的資深士官，在海外維和任務裡親眼看著同袍死在自己面前，退伍後始終沒能真正習慣平民生活的步調。",
        customizableFields: [
          { key: "comradeName", label: "那位同袍/求婚對象的名字", placeholder: "選填" },
        ],
      },
      {
        id: "soldier-active",
        text: "你是特種部隊現役隊員，被選中捲入這一切的前一週，你才剛向交往多年的對象求婚。",
        customizableFields: [
          { key: "comradeName", label: "那位同袍/求婚對象的名字", placeholder: "選填" },
        ],
      },
    ],
    feats: [
      {
        id: "soldier-battle-instinct",
        name: "戰場直覺",
        description: "長年在火線上養成的環境掃描習慣，你總是比別人早半秒發現不對勁。",
        effect: { type: "skillBonus", skill: "偵察", amount: 1 },
      },
      {
        id: "soldier-ptsd-alert",
        name: "創傷後警覺",
        description: "睡不好的那幾年留下的後遺症：你的身體永遠準備著要活下來。",
        effect: { type: "skillBonus", skill: "求生", amount: 1 },
      },
      {
        id: "soldier-blood-oath",
        name: "過命交情",
        description: "對戰友情誼、犧牲、生死承諾類情節容易有情緒反應",
        effect: { type: "narrative" },
      },
    ],
  },
  martial: {
    name: "武道極限",
    desc: "近戰格鬥與強悍體魄",
    attributes: { 力量: 3, 敏捷: 2, 耐力: 3, 意志: 2, 感知: 1, 智力: 1 },
    skills: { 格鬥: 3, 體魄: 3, 求生: 1, 偵察: 1 },
    backstoryOptions: [
      {
        id: "martial-underground",
        text: "你是地下賭盤的職業格鬥選手，靠拳頭養活自己跟弟弟妹妹，最近一場比賽你贏得不明不白，總覺得哪裡不對勁。",
        customizableFields: [
          { key: "tiedName", label: "弟妹的名字/雇主的代號", placeholder: "選填" },
        ],
      },
      {
        id: "martial-bodyguard",
        text: "你是私人保鑣，雇主是個從不透露真實身分的富商，出事那天你正在執行一份你從沒完全搞懂內容的護送任務。",
        customizableFields: [
          { key: "tiedName", label: "弟妹的名字/雇主的代號", placeholder: "選填" },
        ],
      },
    ],
    feats: [
      {
        id: "martial-fist-instinct",
        name: "拳腳直覺",
        description: "打了太多場，身體比腦袋更早知道下一拳該往哪裡去。",
        effect: { type: "skillBonus", skill: "格鬥", amount: 1 },
      },
      {
        id: "martial-pain-tolerance",
        name: "久經打鬥的耐痛",
        description: "斷過的骨頭跟縫過的傷口教會你：痛不代表得停下來。",
        effect: { type: "skillBonus", skill: "體魄", amount: 1 },
      },
      {
        id: "martial-street-code",
        name: "江湖規矩",
        description: "對地下秩序、黑話、人情債類情節容易有反應傾向",
        effect: { type: "narrative" },
      },
    ],
  },
  tech: {
    name: "科技專家",
    desc: "工程駭客與神秘解密",
    attributes: { 智力: 3, 感知: 3, 意志: 3, 敏捷: 1, 耐力: 1, 力量: 1 },
    skills: { 技藝: 3, 秘識: 2, 偵察: 2, 射擊: 1 },
    backstoryOptions: [
      {
        id: "tech-hacker",
        text: "你是接案駭客，遊走法律邊緣賺快錢，這次的委託案報酬高得不正常，你明知不對勁還是接了。",
        customizableFields: [
          { key: "clientName", label: "委託人代號/公司名稱", placeholder: "選填" },
        ],
      },
      {
        id: "tech-engineer",
        text: "你是機電工程師，公司派你去偏僻據點做例行檢修，設備間的異常記錄你原本想上報，卻一直沒空寫完那份報告。",
        customizableFields: [
          { key: "clientName", label: "委託人代號/公司名稱", placeholder: "選填" },
        ],
      },
    ],
    feats: [
      {
        id: "tech-system-instinct",
        name: "系統直覺",
        description: "看一眼架構圖就知道哪裡被動過手腳，這種直覺說不清楚但很少出錯。",
        effect: { type: "skillBonus", skill: "秘識", amount: 1 },
      },
      {
        id: "tech-field-repair",
        name: "臨場排除故障",
        description: "沒有工具、沒有手冊、沒有時間，你還是能讓它再撐一陣子。",
        effect: { type: "skillBonus", skill: "技藝", amount: 1 },
      },
      {
        id: "tech-something-off",
        name: "總覺得哪裡不對勁",
        description: "對數據矛盾、系統異常、有人說謊類情節容易起疑心、傾向主動查證",
        effect: { type: "narrative" },
      },
    ],
  },
  medic: {
    name: "戰地軍醫",
    desc: "急救手術與冷靜交涉",
    attributes: { 智力: 2, 意志: 3, 耐力: 2, 感知: 3, 敏捷: 1, 力量: 1 },
    skills: { 醫療: 3, 交涉: 2, 求生: 2, 偵察: 1 },
    backstoryOptions: [
      {
        id: "medic-er-nurse",
        text: "你是急診室護理師，那晚值大夜班，處理完一台搶救無效的病患後，你走出醫院準備回家。",
        customizableFields: [
          { key: "lostPatientName", label: "那位搶救無效的病患的稱呼/志工組織名稱", placeholder: "選填" },
        ],
      },
      {
        id: "medic-field-volunteer",
        text: "你是戰地醫療志工，剛從一場撤離任務回來，行李都還沒打開，就被拉進了這一切。",
        customizableFields: [
          { key: "lostPatientName", label: "那位搶救無效的病患的稱呼/志工組織名稱", placeholder: "選填" },
        ],
      },
    ],
    feats: [
      {
        id: "medic-triage-instinct",
        name: "臨場急救直覺",
        description: "手比腦快：該壓哪裡、先處理誰，身體早就記住了。",
        effect: { type: "skillBonus", skill: "醫療", amount: 1 },
      },
      {
        id: "medic-steady-hands",
        name: "見過生死的沉穩",
        description: "看過太多次最壞的結果，所以你的手在關鍵時刻不會抖。",
        effect: { type: "skillBonus", skill: "偵察", amount: 1 },
      },
      {
        id: "medic-never-give-up",
        name: "不放棄的職業病",
        description: "對「有人可能還沒被放棄、一線生機」類情節容易有強烈反應，傾向主動選擇救援型選項",
        effect: { type: "narrative" },
      },
    ],
  },
};

export function chargenRules() {
  return {
    // stepCost / cumulativeCost 一起送給前端：加點按鈕要在旁邊標「下一點要幾點」，
    // 前端不自己抄一份成本表，否則曲線改了但前端沒改，玩家看到的價格會跟後端算的不一樣。
    attributes: {
      keys: ATTRIBUTE_KEYS,
      startValue: 1,
      cap: 5,
      freePoints: ATTRIBUTE_BUDGET,
      stepCost: ATTRIBUTE_STEP_COST,
      cumulativeCost: Object.fromEntries([1, 2, 3, 4, 5].map((v) => [v, attributeCost(v)])),
    },
    skills: {
      byCategory: SKILLS,
      startValue: 0,
      cap: 3,
      freePoints: SKILL_BUDGET,
      stepCost: SKILL_STEP_COST,
      cumulativeCost: Object.fromEntries([0, 1, 2, 3].map((v) => [v, skillCost(v)])),
    },
    archetypes: ARCHETYPES,
  };
}

/** 取出角色身上純敘事型專長的描述文字，給 prompt 組裝層當「性格提示」用。 */
export function narrativeFeatHints(character) {
  const feats = character?.feats;
  if (!Array.isArray(feats)) return [];
  return feats
    .filter((f) => f?.effect?.type === "narrative" && typeof f.description === "string")
    .map((f) => f.description);
}

function normalizeCustomDetails(rawDetails, backstory) {
  const result = {};
  if (!backstory || !rawDetails || typeof rawDetails !== "object") return result;

  for (const field of backstory.customizableFields ?? []) {
    const raw = rawDetails[field.key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    result[field.key] = trimmed.slice(0, CUSTOM_DETAIL_MAX_LENGTH);
  }
  return result;
}

export function buildCharacter(draft = {}) {
  const errors = [];
  const {
    concept = {},
    attributes = {},
    skills = {},
    size = DEFAULT_SIZE,
    archetypeId,
    backstoryChoiceId,
    customDetails,
  } = draft;

  const name = typeof concept.name === "string" ? concept.name.trim() : "";
  if (!name) errors.push("角色必須有名稱");

  // 身分模板：背景故事與專長都掛在模板上，所以要先確定是哪一個模板。
  const archetype = archetypeId ? ARCHETYPES[archetypeId] : null;
  if (archetypeId && !archetype) {
    errors.push(`未知的身分模板「${archetypeId}」`);
  }

  // 背景故事二選一。沒有模板就無從驗證，這時只擋「選了模板卻沒選背景」的情況。
  let backstory = null;
  if (archetype) {
    backstory = archetype.backstoryOptions.find((b) => b.id === backstoryChoiceId) ?? null;
    if (!backstoryChoiceId) {
      errors.push("必須選擇一個背景故事");
    } else if (!backstory) {
      errors.push(`背景故事「${backstoryChoiceId}」不屬於身分模板「${archetypeId}」`);
    }
  }

  // 計算屬性加點 (基礎值1)。成本是**遞增**的，見檔案上方 ATTRIBUTE_STEP_COST 的說明。
  let attrCost = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const val = attributes[key] ?? 1;
    if (val < 1) errors.push(`${key} 不能小於 1`);
    if (val > 5) errors.push(`${key} 不能大於 5`);
    attrCost += attributeCost(val);
  }

  // 計算技能加點 (基礎值0)。這裡驗的是**玩家自己配的點**，專長加成之後才疊上去，
  // 所以玩家能配到的上限仍然是3。
  let skillPointCost = 0;
  for (const key of ALL_SKILLS) {
    const val = skills[key] ?? 0;
    if (val < 0) errors.push(`${key} 不能小於 0`);
    if (val > 3) errors.push(`${key} 不能大於 3`);
    skillPointCost += skillCost(val);
  }

  const budgets = {
    attributes: { totalCost: attrCost, totalBudget: ATTRIBUTE_BUDGET, remaining: ATTRIBUTE_BUDGET - attrCost },
    skills: { totalCost: skillPointCost, totalBudget: SKILL_BUDGET, remaining: SKILL_BUDGET - skillPointCost },
  };

  if (attrCost > ATTRIBUTE_BUDGET) errors.push(`屬性點數超支（已用 ${attrCost} / ${ATTRIBUTE_BUDGET} 點）`);
  if (skillPointCost > SKILL_BUDGET) errors.push(`技能點數超支（已用 ${skillPointCost} / ${SKILL_BUDGET} 點）`);

  if (errors.length > 0) {
    return { valid: false, errors, budgets };
  }

  const character = emptyCharacter(name);
  character.concept = {
    name,
    gender: concept.gender ?? "未知",
    age: concept.age ?? 24,
    background: backstory?.text ?? "",
  };

  for (const key of ATTRIBUTE_KEYS) character.attributes[key] = attributes[key] ?? 1;

  // skillBase 是玩家配點的原始值，skills 是套用專長後的最終值(判定實際用的)。
  character.skillBase = {};
  for (const skill of ALL_SKILLS) character.skillBase[skill] = skills[skill] ?? 0;
  character.skills = { ...character.skillBase };

  character.feats = archetype ? archetype.feats.map((f) => ({ ...f })) : [];
  for (const feat of character.feats) {
    if (feat.effect?.type !== "skillBonus") continue;
    const { skill, amount } = feat.effect;
    if (!ALL_SKILLS.includes(skill)) continue;
    character.skills[skill] = (character.skills[skill] ?? 0) + amount;
  }

  if (archetypeId) character.archetypeId = archetypeId;
  if (backstory) {
    character.backstoryChoiceId = backstory.id;
    character.customDetails = normalizeCustomDetails(customDetails, backstory);
  }

  character.derived = computeDerivedStats(character.attributes, { size });

  return { valid: true, errors: [], budgets, character };
}
