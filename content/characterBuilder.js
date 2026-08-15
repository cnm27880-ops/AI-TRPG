// [設計] 建卡組裝層 —— 把 core/characterCreation.js 的四個「驗證器」串成一個
// 「驗證 + 組出一張合法角色卡」的流程。
//
// 分工說明（為什麼要多這一層）：
//   core/characterCreation.js  [規則書] 只回答「這樣花點數合不合法」，不產生角色卡。
//   core/derivedStats.js       [規則書] 只回答「屬性算出來的衍生值是多少」。
//   core/schema.js             [規則書] 只定義空白角色卡長什麼樣子。
//   這個檔案                    [設計]  把上面三個接起來，變成建卡UI可以直接呼叫的一個函式。
//
// 這一層不含任何規則判斷——所有數字都來自上面三個模組，這裡只負責組裝與彙整錯誤訊息。
// 這樣的好處是：規則有變動時改的是core/，這一層不用動；UI要改流程時改這一層，規則不受影響。

import { emptyCharacter, ATTRIBUTES, SKILLS } from "../core/schema.js";
import { computeDerivedStats, DEFAULT_SIZE } from "../core/derivedStats.js";
import {
  validateAttributeBudget,
  validateSkillBudget,
  validateSpecializations,
  validateFeatBudget,
  ATTRIBUTE_CATEGORY_BUDGETS,
  SKILL_CATEGORY_BUDGETS,
  ATTRIBUTE_FREE_POINTS,
  SKILL_FREE_POINTS,
  ATTRIBUTE_CAP,
  SKILL_CAP,
  FREE_SPECIALIZATIONS,
  FEAT_POINTS,
} from "../core/characterCreation.js";

const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key);
const ALL_SKILLS = Object.values(SKILLS).flat();

/**
 * 建卡UI需要知道的所有常數，一次給前端，避免前端自己抄一份數字然後跟引擎不同步。
 * （前端抄常數是很常見的bug來源：規則改了但前端沒改，玩家看到的預算跟後端驗的不一樣。）
 */
export function chargenRules() {
  return {
    attributes: {
      keys: ATTRIBUTE_KEYS,
      byCategory: ATTRIBUTES.reduce((acc, a) => {
        (acc[a.category] ??= []).push({ key: a.key, en: a.en });
        return acc;
      }, {}),
      categoryBudgets: ATTRIBUTE_CATEGORY_BUDGETS,
      freePoints: ATTRIBUTE_FREE_POINTS,
      cap: ATTRIBUTE_CAP,
      startValue: 1,
      note: `屬性從1開始，每升1級花1點，唯獨4→5那一級要花2點（傳奇門檻）`,
    },
    skills: {
      byCategory: SKILLS,
      categoryBudgets: SKILL_CATEGORY_BUDGETS,
      freePoints: SKILL_FREE_POINTS,
      cap: SKILL_CAP,
      startValue: 0,
      note: `技能從0開始，每升1級固定花1點`,
    },
    specializations: {
      free: FREE_SPECIALIZATIONS,
      note: `${FREE_SPECIALIZATIONS}個免費專業，只能掛在等級≥1的技能上`,
    },
    feats: {
      points: FEAT_POINTS,
      note: "專長點數。專長型錄尚未數位化，目前建卡UI不提供選擇，此欄位保留給之後使用",
    },
    size: { default: DEFAULT_SIZE, min: 4, max: 6 },
  };
}

/**
 * 驗證一份建卡草稿，合法的話順便組出完整角色卡。
 *
 * @param {object} draft
 * @param {object} draft.concept { name, gender, age, background }
 * @param {object} draft.attributeCategoryAllocation { 生理:3, 心智:2, 互動:1 } 的某個排列
 * @param {object} draft.attributes { 力量:3, ... } 九個都要有
 * @param {object} draft.skillCategoryAllocation { 生理:6, 心智:5, 互動:4 } 的某個排列
 * @param {object} draft.skills { 運動:2, ... } 沒列到的視為0
 * @param {object} [draft.specializations] { 技能名: [專業名,...] }
 * @param {Array} [draft.feats] [{name, level}]
 * @param {Array} [draft.languageFeats] [{name, level}]
 * @param {number} [draft.size] 體積，預設5
 * @returns {{valid: boolean, errors: string[], budgets: object, character?: object}}
 */
export function buildCharacter(draft = {}) {
  const errors = [];

  const {
    concept = {},
    attributeCategoryAllocation = {},
    attributes = {},
    skillCategoryAllocation = {},
    skills = {},
    specializations = {},
    feats = [],
    languageFeats = [],
    size = DEFAULT_SIZE,
  } = draft;

  const name = typeof concept.name === "string" ? concept.name.trim() : "";
  if (!name) errors.push("角色必須有名字");

  // --- 先擋掉「欄位根本不是規則書裡的東西」，否則下面的驗證器會算出莫名其妙的結果 ---
  for (const key of Object.keys(attributes)) {
    if (!ATTRIBUTE_KEYS.includes(key)) errors.push(`未知的屬性「${key}」`);
  }
  for (const key of Object.keys(skills)) {
    if (!ALL_SKILLS.includes(key)) errors.push(`未知的技能「${key}」`);
  }
  for (const key of Object.keys(specializations)) {
    if (!ALL_SKILLS.includes(key)) errors.push(`專業掛在未知的技能「${key}」上`);
  }

  // --- 四段預算驗證，全部委給 core/characterCreation.js，這裡不自己算 ---
  let attributeBudget, skillBudget, specBudget, featBudget;

  try {
    attributeBudget = validateAttributeBudget(attributeCategoryAllocation, attributes);
    attributeBudget.errors.forEach((e) => errors.push(`屬性：${e}`));
  } catch (err) {
    errors.push(`屬性：${err.message}`);
  }

  try {
    skillBudget = validateSkillBudget(skillCategoryAllocation, skills);
    skillBudget.errors.forEach((e) => errors.push(`技能：${e}`));
  } catch (err) {
    errors.push(`技能：${err.message}`);
  }

  try {
    specBudget = validateSpecializations(specializations, skills);
    specBudget.errors.forEach((e) => errors.push(`專業：${e}`));
  } catch (err) {
    errors.push(`專業：${err.message}`);
  }

  const intelligence = attributes["智力"];
  if (typeof intelligence === "number") {
    try {
      featBudget = validateFeatBudget(feats, { intelligence, languageFeats });
      featBudget.errors.forEach((e) => errors.push(`專長：${e}`));
    } catch (err) {
      errors.push(`專長：${err.message}`);
    }
  }

  const budgets = {
    attributes: attributeBudget ?? null,
    skills: skillBudget ?? null,
    specializations: specBudget ?? null,
    feats: featBudget ?? null,
  };

  if (errors.length > 0) {
    return { valid: false, errors, budgets };
  }

  // --- 通過驗證，組出角色卡 ---
  const character = emptyCharacter(name);
  character.concept = {
    name,
    gender: concept.gender ?? "",
    age: concept.age ?? null,
    background: concept.background ?? "",
  };

  for (const key of ATTRIBUTE_KEYS) character.attributes[key] = attributes[key];
  for (const skill of ALL_SKILLS) character.skills[skill] = skills[skill] ?? 0;
  character.specializations = { ...specializations };
  character.feats = feats.map((f) => ({ ...f }));

  // 衍生屬性由引擎算，不讓前端傳進來——前端算的話遲早會跟規則不同步
  character.derived = { ...character.derived, ...computeDerivedStats(character.attributes, { size }) };

  return { valid: true, errors: [], budgets, character };
}
