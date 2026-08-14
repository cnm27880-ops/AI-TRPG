// 建卡點數預算驗證 —— [規則書] 出處：建卡.htm 第1030~1768行(含完整的「羅蘭」角色創建範例)。
//
// 這個模組驗證的是「建卡當下」的點數花費是否合法，跟 core/xp.js(建卡後的成長花費公式)是
// 兩個不同的系統——建卡時走這裡的固定預算表，之後升級才走xp.js的公式。
//
// 三段預算，形狀都一樣(類別預算+自由點數)，但每段的「單點成本」公式不同：
//   1) 屬性：三個分類(生理/心智/互動)各分到{3,2,1}其中一個預算(玩家自己決定怎麼分配)，
//      外加3點自由點數可以花在任何屬性上。屬性從1開始，每提升1級花1點，唯獨4→5那一級要花2點
//      (書中「傳奇屬性」的門檻，衝破正常人類極限，所以特別貴)。
//   2) 技能：三個分類各分到{6,5,4}其中一個預算，外加5點自由點數。技能從0開始，每提升1級
//      固定花1點(沒有4→5那種突增，技能建卡上限本來就只到3)。另外還有3個免費專業(specialization)
//      名額，可以掛在任何等級≥1的技能上(不用額外花點數，但不能掛在0級的技能上)。
//   3) 專長：固定5點專長點數(多級專長是「花到那一級的點數=那一級的等級數」，不是每級都要重新
//      累加前面等級的花費——書中原文是「flat」不是「cumulative」)，另外語言類專長有獨立點數池，
//      額度=最終智力值×2，跟5點專長點數分開算。
//
// [已知簡化] 「類別預算」在驗證時只加總成「總預算」一起檢查，不會逐類別強制「生理分類點數只能花在
// 生理屬性/技能上」——因為自由點數可以花在任何分類，光看最終數值沒辦法反推「這一點到底是從
// 哪個預算池出的」，勉強拆分只會是憑空assume，違反「嚴禁杜撰」原則。這裡選擇只驗證：
// (a) 類別預算的分配本身有沒有把{3,2,1}/{6,5,4}三個數字分別指派給三個分類(不能重複分配)，
// (b) 總花費有沒有超過「類別預算總和+自由點數」這個總盤子。如果之後需要逐類別強制查核，
// 需要建卡介面額外記錄「這一點花在哪個預算池」，不是本模組現在能從最終數值反推的。
//
// [已知簡化] 專長帶來的技能上限提升(例如「特殊身份」專長可以把某技能上限從3提高到4，書中羅蘭
// 範例的最終角色卡就把1點肉搏重新分配到白刃，變成肉搏2/白刃4)是「建卡預算花完之後」的專長效果，
// 不是skillChargenCost()這層要處理的東西。validateSkillBudget()驗證的是「純技能預算」花費，
// 呼叫端如果要驗證含專長調整後的最終技能等級，要自己先扣掉/還原專長帶來的上限異動。

import { ATTRIBUTES, SKILLS } from "./schema.js";

export const ATTRIBUTE_CATEGORY_BUDGETS = [3, 2, 1];
export const ATTRIBUTE_FREE_POINTS = 3;
export const ATTRIBUTE_CAP = 5;
export const ATTRIBUTE_LEGENDARY_THRESHOLD = 5; // 4→5這一級的突破點，多花1點

export const SKILL_CATEGORY_BUDGETS = [6, 5, 4];
export const SKILL_FREE_POINTS = 5;
export const SKILL_CAP = 3;
export const FREE_SPECIALIZATIONS = 3;

export const FEAT_POINTS = 5;
export const LANGUAGE_FEAT_POINTS_PER_INTELLIGENCE = 2;

const ATTRIBUTE_CATEGORIES = [...new Set(ATTRIBUTES.map((a) => a.category))];
const SKILL_CATEGORIES = Object.keys(SKILLS);

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function sameMultiset(a, b) {
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/** 屬性從1級提升到value所需的建卡點數(4→5那一級花2點，其餘每級1點)。 */
export function attributeChargenCost(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`屬性值必須是≥1的整數，收到：${value}`);
  }
  if (value > ATTRIBUTE_CAP) {
    throw new Error(`建卡階段屬性上限是${ATTRIBUTE_CAP}，收到：${value}`);
  }
  const normalSteps = value - 1;
  const legendarySurcharge = value >= ATTRIBUTE_LEGENDARY_THRESHOLD ? 1 : 0;
  return normalSteps + legendarySurcharge;
}

/** 技能從0級提升到level所需的建卡點數(固定1級1點，沒有突增)。 */
export function skillChargenCost(level) {
  if (!Number.isInteger(level) || level < 0) {
    throw new Error(`技能等級必須是≥0的整數，收到：${level}`);
  }
  if (level > SKILL_CAP) {
    throw new Error(`建卡階段技能上限是${SKILL_CAP}，收到：${level}`);
  }
  return level;
}

/**
 * 驗證屬性點數預算。
 * @param {object} categoryAllocation { 生理: 3, 心智: 2, 互動: 1 } 這種形狀，
 *   必須是ATTRIBUTE_CATEGORY_BUDGETS({3,2,1})的一個排列，分配給三個屬性分類。
 * @param {object} finalAttributes { 力量: 3, 敏捷: 1, ... } 建卡完成時的最終屬性值(九個都要有)。
 */
export function validateAttributeBudget(categoryAllocation, finalAttributes) {
  const errors = [];

  const allocatedCategories = Object.keys(categoryAllocation);
  const missingCategories = ATTRIBUTE_CATEGORIES.filter((c) => !allocatedCategories.includes(c));
  if (missingCategories.length > 0) {
    errors.push(`缺少分類預算分配：${missingCategories.join("、")}`);
  }
  if (!sameMultiset(Object.values(categoryAllocation), ATTRIBUTE_CATEGORY_BUDGETS)) {
    errors.push(
      `分類預算分配必須是{${ATTRIBUTE_CATEGORY_BUDGETS.join(",")}}的排列，收到：{${Object.values(categoryAllocation).join(",")}}`
    );
  }

  let totalCost = 0;
  for (const attr of ATTRIBUTES) {
    const value = finalAttributes[attr.key];
    if (value === undefined) {
      errors.push(`缺少屬性「${attr.key}」的最終數值`);
      continue;
    }
    totalCost += attributeChargenCost(value);
  }

  const totalBudget = sum(ATTRIBUTE_CATEGORY_BUDGETS) + ATTRIBUTE_FREE_POINTS;
  if (totalCost > totalBudget) {
    errors.push(`總花費${totalCost}點超過總預算${totalBudget}點(類別預算${sum(ATTRIBUTE_CATEGORY_BUDGETS)}+自由${ATTRIBUTE_FREE_POINTS})`);
  }

  return {
    valid: errors.length === 0,
    totalCost,
    totalBudget,
    remaining: totalBudget - totalCost,
    errors,
  };
}

/**
 * 驗證技能點數預算。
 * @param {object} categoryAllocation { 生理: 6, 心智: 4, 互動: 5 } 這種形狀，
 *   必須是SKILL_CATEGORY_BUDGETS({6,5,4})的一個排列。
 * @param {object} finalSkills { 運動: 3, 肉搏: 3, ... } 建卡完成時的最終技能等級(沒列到的視為0)。
 */
export function validateSkillBudget(categoryAllocation, finalSkills) {
  const errors = [];

  const allocatedCategories = Object.keys(categoryAllocation);
  const missingCategories = SKILL_CATEGORIES.filter((c) => !allocatedCategories.includes(c));
  if (missingCategories.length > 0) {
    errors.push(`缺少分類預算分配：${missingCategories.join("、")}`);
  }
  if (!sameMultiset(Object.values(categoryAllocation), SKILL_CATEGORY_BUDGETS)) {
    errors.push(
      `分類預算分配必須是{${SKILL_CATEGORY_BUDGETS.join(",")}}的排列，收到：{${Object.values(categoryAllocation).join(",")}}`
    );
  }

  let totalCost = 0;
  for (const skillName of Object.values(SKILLS).flat()) {
    const level = finalSkills[skillName] ?? 0;
    totalCost += skillChargenCost(level);
  }

  const totalBudget = sum(SKILL_CATEGORY_BUDGETS) + SKILL_FREE_POINTS;
  if (totalCost > totalBudget) {
    errors.push(`總花費${totalCost}點超過總預算${totalBudget}點(類別預算${sum(SKILL_CATEGORY_BUDGETS)}+自由${SKILL_FREE_POINTS})`);
  }

  return {
    valid: errors.length === 0,
    totalCost,
    totalBudget,
    remaining: totalBudget - totalCost,
    errors,
  };
}

/**
 * 驗證免費專業(specialization)的掛載是否合法。
 * @param {object} specializations { 技能名: [專業名, ...] }
 * @param {object} finalSkills 建卡完成時的最終技能等級，用來檢查專業有沒有掛在0級的技能上。
 */
export function validateSpecializations(specializations, finalSkills) {
  const errors = [];
  let totalSpecs = 0;

  for (const [skillName, specs] of Object.entries(specializations)) {
    const level = finalSkills[skillName] ?? 0;
    if (specs.length > 0 && level < 1) {
      errors.push(`專業「${specs.join("、")}」掛在技能「${skillName}」上，但${skillName}是0級，不能掛專業`);
    }
    totalSpecs += specs.length;
  }

  if (totalSpecs > FREE_SPECIALIZATIONS) {
    errors.push(`專業總數${totalSpecs}個超過免費配額${FREE_SPECIALIZATIONS}個`);
  }

  return {
    valid: errors.length === 0,
    totalSpecs,
    remaining: FREE_SPECIALIZATIONS - totalSpecs,
    errors,
  };
}

/**
 * 驗證專長點數預算(一般專長+語言專長分開算)。
 * @param {Array<{name: string, level: number}>} feats 一般專長列表(level=花費的點數，flat不累加)。
 * @param {object} opts
 * @param {number} opts.intelligence 最終智力值，用來算語言點數額度(=智力×2)。
 * @param {Array<{name: string, level: number}>} [opts.languageFeats] 語言類專長列表，走獨立點數池。
 */
export function validateFeatBudget(feats, { intelligence, languageFeats = [] } = {}) {
  const errors = [];

  const totalCost = sum(feats.map((f) => f.level));
  if (totalCost > FEAT_POINTS) {
    errors.push(`一般專長總花費${totalCost}點超過${FEAT_POINTS}點專長點數`);
  }

  const languageCost = sum(languageFeats.map((f) => f.level));
  const languageBudget = LANGUAGE_FEAT_POINTS_PER_INTELLIGENCE * intelligence;
  if (languageCost > languageBudget) {
    errors.push(`語言專長總花費${languageCost}點超過語言點數額度${languageBudget}點(=智力${intelligence}×${LANGUAGE_FEAT_POINTS_PER_INTELLIGENCE})`);
  }

  return {
    valid: errors.length === 0,
    totalCost,
    remaining: FEAT_POINTS - totalCost,
    languageCost,
    languageBudget,
    languageRemaining: languageBudget - languageCost,
    errors,
  };
}
