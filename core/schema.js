// 無限恐怖 TRPG —— 核心資料結構（輕量六維版）

export const ATTRIBUTES = [
  { key: "力量", en: "STR", category: "生理" },
  { key: "敏捷", en: "DEX", category: "生理" },
  { key: "耐力", en: "CON", category: "生理" },
  { key: "智力", en: "INT", category: "心智" },
  { key: "感知", en: "PER", category: "心智" },
  { key: "意志", en: "WIL", category: "心智" },
];

export const ATTRIBUTE_CATEGORY = Object.fromEntries(
  ATTRIBUTES.map((a) => [a.key, a.category])
);

export const SKILLS = {
  戰鬥: ["格鬥", "射擊"],
  身手: ["體魄", "潛行", "求生"],
  心智: ["偵察", "技藝", "醫療", "秘識"],
  社交: ["交涉"],
};

export function skillCategory(skillName) {
  for (const [category, list] of Object.entries(SKILLS)) {
    if (list.includes(skillName)) return category;
  }
  return null;
}

export function emptyCharacter(name = "未命名輪迴者") {
  const attributes = Object.fromEntries(ATTRIBUTES.map((a) => [a.key, 1]));
  const skills = Object.fromEntries(
    Object.values(SKILLS).flat().map((s) => [s, 0])
  );
  return {
    concept: { name, gender: "", age: 24, background: "" },
    attributes,
    skills,
    specializations: {},
    feats: [],
    derived: {
      hp: { max: 6, intact: 6, B: 0, L: 0, A: 0 },
      willpower: { max: 2, current: 2, temp: 0 },
      energyPools: {},
    },
    xp: { earned: 0, spent: 0 },
    // 這輩子已經復活過幾次。規則書給每個角色兩次機會（見 core/deathAndRevival.js 的
    // MAX_REVIVALS 與該檔案對書中原文的引用）；用完之後再死就是真死，只能重新創角。
    reviveCount: 0,
    abilities: [],
  };
}
