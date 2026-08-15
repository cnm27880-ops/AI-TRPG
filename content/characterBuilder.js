// [設計] 輕量建卡組裝層
import { emptyCharacter, ATTRIBUTES, SKILLS } from "../core/schema.js";
import { computeDerivedStats, DEFAULT_SIZE } from "../core/derivedStats.js";

const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key);
const ALL_SKILLS = Object.values(SKILLS).flat();

export const ARCHETYPES = {
  soldier: {
    name: "特戰隊員",
    desc: "遠程射擊與戰術身法專家",
    attributes: { 敏捷: 3, 耐力: 2, 感知: 2, 力量: 1, 智力: 1, 意志: 1 },
    skills: { 射擊: 3, 潛行: 2, 體魄: 2, 偵察: 1 }
  },
  martial: {
    name: "武道極限",
    desc: "近戰格鬥與強悍體魄",
    attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 意志: 2, 感知: 1, 智力: 1 },
    skills: { 格鬥: 3, 體魄: 3, 求生: 1, 偵察: 1 }
  },
  tech: {
    name: "科技專家",
    desc: "工程駭客與神秘解密",
    attributes: { 智力: 3, 感知: 2, 意志: 2, 敏捷: 1, 耐力: 1, 力量: 1 },
    skills: { 技藝: 3, 秘識: 2, 偵察: 2, 射擊: 1 }
  },
  medic: {
    name: "戰地軍醫",
    desc: "急救手術與冷靜交涉",
    attributes: { 智力: 2, 意志: 3, 耐力: 2, 感知: 2, 敏捷: 1, 力量: 1 },
    skills: { 醫療: 3, 交涉: 2, 求生: 2, 偵察: 1 }
  }
};

export function chargenRules() {
  return {
    attributes: { keys: ATTRIBUTE_KEYS, startValue: 1, cap: 5, freePoints: 6 },
    skills: { byCategory: SKILLS, startValue: 0, cap: 3, freePoints: 8 },
    archetypes: ARCHETYPES,
  };
}

export function buildCharacter(draft = {}) {
  const errors = [];
  const { concept = {}, attributes = {}, skills = {}, size = DEFAULT_SIZE } = draft;

  const name = typeof concept.name === "string" ? concept.name.trim() : "";
  if (!name) errors.push("角色必須有名稱");

  // 計算屬性加點 (基礎值1)
  let attrCost = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const val = attributes[key] ?? 1;
    if (val < 1) errors.push(`${key} 不能小於 1`);
    if (val > 5) errors.push(`${key} 不能大於 5`);
    attrCost += (val - 1);
  }

  // 計算技能加點 (基礎值0)
  let skillCost = 0;
  for (const key of ALL_SKILLS) {
    const val = skills[key] ?? 0;
    if (val < 0) errors.push(`${key} 不能小於 0`);
    if (val > 3) errors.push(`${key} 不能大於 3`);
    skillCost += val;
  }

  const budgets = {
    attributes: { totalCost: attrCost, totalBudget: 6, remaining: 6 - attrCost },
    skills: { totalCost: skillCost, totalBudget: 8, remaining: 8 - skillCost }
  };

  if (attrCost > 6) errors.push(`屬性點數超支（已用 ${attrCost} / 6 點）`);
  if (skillCost > 8) errors.push(`技能點數超支（已用 ${skillCost} / 8 點）`);

  if (errors.length > 0) {
    return { valid: false, errors, budgets };
  }

  const character = emptyCharacter(name);
  character.concept = {
    name,
    gender: concept.gender ?? "未知",
    age: concept.age ?? 24,
    background: "",
  };

  for (const key of ATTRIBUTE_KEYS) character.attributes[key] = attributes[key] ?? 1;
  for (const skill of ALL_SKILLS) character.skills[skill] = skills[skill] ?? 0;
  character.derived = computeDerivedStats(character.attributes, { size });

  return { valid: true, errors: [], budgets, character };
}
