// 無限恐怖 TRPG 2.35 —— 核心資料結構定義
// 來源：使用者上傳的規則書 rules2.35.txt(建卡.htm / 新建項目.htm / 技能概述1.htm 等段落)
// 這個檔案只定義「資料長什麼樣子」，不含任何遊戲邏輯運算。

// 九維屬性，依照規則書「建卡」頁的固定順序(這個順序在資源模板的「屬性：」欄位也是同一套，
// 之後解析血統/道具 JSON 時要沿用這個順序)
export const ATTRIBUTES = [
  { key: "力量", en: "STR", category: "生理" },
  { key: "敏捷", en: "DEX", category: "生理" },
  { key: "耐力", en: "CON", category: "生理" },
  { key: "智力", en: "INT", category: "心智" },
  { key: "感知", en: "PER", category: "心智" },
  { key: "決心", en: "WIL", category: "心智" },
  { key: "風度", en: "PRE", category: "互動" },
  { key: "操控", en: "MAN", category: "互動" },
  { key: "沉著", en: "COM", category: "互動" },
];

export const ATTRIBUTE_CATEGORY = Object.fromEntries(
  ATTRIBUTES.map((a) => [a.key, a.category])
);

// 三大技能分類與技能表(技能概述1.htm「技能表」段落)
export const SKILLS = {
  生理: ["運動", "肉搏", "駕駛", "槍械", "手上功夫", "躲藏", "求生", "白刃", "弓箭"],
  心智: ["學識", "電腦", "手藝", "調查", "醫學", "神秘學", "科學"],
  互動: ["馴獸", "感受", "表達", "脅迫", "交際", "掩飾"],
};

export function skillCategory(skillName) {
  for (const [category, list] of Object.entries(SKILLS)) {
    if (list.includes(skillName)) return category;
  }
  return null; // 未知技能，呼叫端應自行處理(可能是自創技能)
}

// 一張空白人物卡的骨架，對應建卡頁的六大段：概念/屬性/技能/專長/衍生屬性/能力
export function emptyCharacter(name = "未命名輪迴者") {
  const attributes = Object.fromEntries(ATTRIBUTES.map((a) => [a.key, 1]));
  const skills = Object.fromEntries(
    Object.values(SKILLS).flat().map((s) => [s, 0])
  );
  return {
    concept: { name, gender: "", age: null, background: "" },
    attributes,
    skills,
    specializations: {}, // { 技能名: [專業名, ...] }
    feats: [], // [{ name, level, description }]
    derived: {
      hp: { max: 0, intact: 0, B: 0, L: 0, A: 0 },
      willpower: { max: 0, current: 0, temp: 0 },
      energyPools: {}, // { 能量池名: { max, current, keyAttributes:[attr,attr] } }
    },
    xp: { earned: 0, spent: 0 },
    abilities: [], // 從「資源」轉化成 JSON 後掛載於此，Phase 2 才會真正填入
  };
}
