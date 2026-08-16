// [設計] 建卡組裝層 —— 驗證一份配點草稿並組出一張合法的角色卡。
//
// [2026-08-16 改版] 身分模板(archetype) + 二選一背景故事的建卡方式**整組拿掉**了，
// 換成 content/chargen/lifePath.js 的生平問答。使用者的要求(逐字)：
//   「我想把目前預設的背景故事拿掉，要透過一些更有代入感的方式讓玩家可以逐步建立
//     一個他心目中的角色，故事要豐富(且符合無限恐怖的設定，每個人都是現代普通人)，
//     這樣屬性跟技能都改成後台，透過建卡系統自動幫玩家分配好」
//
// 舊的四個模板（特戰隊員／武道極限／科技專家／戰地軍醫）不只是「不夠有代入感」，
// 它們跟《無限恐怖》的前提直接衝突：被抓進主神空間的是**現代普通人**。
// 所以整套模板資料是刪掉而不是留著不用——留著等於留一條隨時會被叫回來的舊路。
// 需要回顧的話在 git 歷史裡。
//
// 現在只剩兩層：
//   buildCharacterFromLifePath()  玩家實際走的入口：六個答案 -> 權重 -> 自動配點 -> 下面這層
//   buildCharacter()              低階入口：拿一份現成的 attributes/skills 草稿驗證並組卡
//                                 （自動配點、測試、之後的匯入功能共用同一份驗證）
//
// 專長(feats)分兩型，跟改版前一樣：
//   narrative  —— 不影響任何數值，只餵給AI當性格傾向提示（生平問答給的都是這型）
//   skillBonus —— 實際加技能等級，在配點驗證**通過之後**才疊加，所以最終值可能超過配點上限3。
//                 為了讓前端顯示「2 (+1專長)」，兩個值分開存：
//                   character.skillBase.格鬥 = 配點的原始值
//                   character.skills.格鬥     = 疊加後的最終值（判定用這個）

import { emptyCharacter, ATTRIBUTES, SKILLS } from "../core/schema.js";
import {
  ATTRIBUTE_BUDGET,
  SKILL_BUDGET,
  attributeCost,
  skillCost,
} from "./chargen/pointCosts.js";
import { collectLifePath, composeBackground, collectTraits, questionsForClient } from "./chargen/lifePath.js";
import { allocateFromWeights, describeCharacterTendency } from "./chargen/allocate.js";
import { computeDerivedStats, DEFAULT_SIZE } from "../core/derivedStats.js";

const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key);
const ALL_SKILLS = Object.values(SKILLS).flat();

/** 自訂欄位的長度上限。超過直接截斷，不報錯——這是選填的風味欄位，不值得擋住整張卡。 */
const CUSTOM_DETAIL_MAX_LENGTH = 40;

// 配點成本曲線與預算搬到 content/chargen/pointCosts.js（理由見該檔頭）。
// 這裡原樣再匯出一次，讓既有的 import 路徑（測試、API層）不用跟著改。
export {
  ATTRIBUTE_BUDGET,
  SKILL_BUDGET,
  attributeCost,
  skillCost,
  nextStepCost,
} from "./chargen/pointCosts.js";

/**
 * 建卡畫面需要的所有資料。
 *
 * 主體是生平問答的題目；配點成本表仍然一起送，但**不再是給玩家用的**——
 * 玩家已經不配點了，那份資料留給「查看詳細數值」那個摺疊區顯示用，
 * 以及讓任何要接匯入功能的人有一份權威來源可讀（前端永遠不自己抄常數）。
 */
export function chargenRules() {
  return {
    lifePath: questionsForClient(),
    attributes: {
      keys: ATTRIBUTE_KEYS,
      startValue: 1,
      cap: 5,
      freePoints: ATTRIBUTE_BUDGET,
      cumulativeCost: Object.fromEntries([1, 2, 3, 4, 5].map((v) => [v, attributeCost(v)])),
    },
    skills: {
      byCategory: SKILLS,
      startValue: 0,
      cap: 3,
      freePoints: SKILL_BUDGET,
      cumulativeCost: Object.fromEntries([0, 1, 2, 3].map((v) => [v, skillCost(v)])),
    },
  };
}

/**
 * 生平問答建卡的入口（見 content/chargen/lifePath.js）。
 *
 * 這是**目前前端唯一在走的建卡路徑**。它不是另一套建卡規則，只是換一個入口：
 * 把玩家的六個答案換算成 attributes/skills（content/chargen/allocate.js），
 * 再交給下面同一個 buildCharacter() 做驗證與組裝。所有點數上限、預算、
 * 衍生數值的計算完全共用，不會出現「兩條路徑算出不同角色卡」這種事。
 *
 * @param {object} input { concept: {name, gender, age}, answers: {題目id: 選項id} }
 * @returns buildCharacter() 的回傳值，外加 lifePath（小傳與傾向描述，給前端顯示用）
 */
export function buildCharacterFromLifePath(input = {}) {
  const { concept = {}, answers = {} } = input;
  const { weights, options, errors: pathErrors } = collectLifePath(answers);

  // 問答還沒答完就先回報，不要往下算——半套答案配出來的點數對玩家沒有意義，
  // 而且會讓建卡畫面顯示一個他還沒決定的角色。
  if (pathErrors.length > 0) {
    return { valid: false, errors: pathErrors, budgets: null, lifePath: null };
  }

  const allocated = allocateFromWeights(weights);
  const background = composeBackground(options);

  const result = buildCharacter({
    concept: { ...concept, background },
    attributes: allocated.attributes,
    skills: allocated.skills,
    feats: collectTraits(options),
    // 生平問答自己就是背景故事，不再走身分模板那一套(archetypeId/backstoryChoiceId)。
    backgroundText: background,
  });

  if (!result.valid) return { ...result, lifePath: null };

  return {
    ...result,
    lifePath: {
      background,
      tendency: describeCharacterTendency(allocated.attributes, allocated.skills),
      answers: options.map((o) => ({ questionId: o.questionId, optionId: o.id, label: o.label })),
    },
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

/**
 * 查驗一份外部傳進來的專長清單。
 *
 * 生平問答給的特質是引擎自己組的（content/chargen/lifePath.js 的 collectTraits），
 * 但這個函式一樣要驗——buildCharacter() 是公開入口，之後接匯入/工坊功能時，
 * 傳進來的東西就不再是自己人組的了。skillBonus 指向不存在的技能會讓後面的疊加
 * 靜靜地寫進一個規則書沒有的技能欄位，那種錯不會報錯，只會讓角色卡多一個怪欄位。
 */
function normalizeFeats(rawFeats) {
  if (!Array.isArray(rawFeats)) return [];
  const feats = [];
  for (const raw of rawFeats) {
    if (!raw || typeof raw.name !== "string" || typeof raw.description !== "string") continue;
    const type = raw.effect?.type;
    if (type === "narrative") {
      feats.push({ id: raw.id ?? raw.name, name: raw.name, description: raw.description, effect: { type: "narrative" } });
    } else if (type === "skillBonus" && ALL_SKILLS.includes(raw.effect.skill) && Number.isInteger(raw.effect.amount)) {
      feats.push({
        id: raw.id ?? raw.name,
        name: raw.name,
        description: raw.description,
        effect: { type: "skillBonus", skill: raw.effect.skill, amount: raw.effect.amount },
      });
    }
  }
  return feats;
}

export function buildCharacter(draft = {}) {
  const errors = [];
  const {
    concept = {},
    attributes = {},
    skills = {},
    size = DEFAULT_SIZE,
    feats: rawFeats,
  } = draft;

  const name = typeof concept.name === "string" ? concept.name.trim() : "";
  if (!name) errors.push("角色必須有名稱");

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
    // 背景故事由呼叫端提供（生平問答會把六段 story 接成一段小傳），這一層不生成文字。
    background: typeof concept.background === "string" ? concept.background : "",
  };

  for (const key of ATTRIBUTE_KEYS) character.attributes[key] = attributes[key] ?? 1;

  // skillBase 是玩家配點的原始值，skills 是套用專長後的最終值(判定實際用的)。
  character.skillBase = {};
  for (const skill of ALL_SKILLS) character.skillBase[skill] = skills[skill] ?? 0;
  character.skills = { ...character.skillBase };

  character.feats = normalizeFeats(rawFeats);
  for (const feat of character.feats) {
    if (feat.effect?.type !== "skillBonus") continue;
    const { skill, amount } = feat.effect;
    if (!ALL_SKILLS.includes(skill)) continue;
    character.skills[skill] = (character.skills[skill] ?? 0) + amount;
  }

  character.derived = computeDerivedStats(character.attributes, { size });

  return { valid: true, errors: [], budgets, character };
}
