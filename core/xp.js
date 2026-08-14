// 無限恐怖 TRPG 2.35 —— 經驗值花費公式(經驗值系統.htm)
// 這些都是純數學公式，直接照規則書字面定義實作，沒有模糊空間，適合完全交給程式碼。

/** 提升 1 點屬性所需 XP = 目前屬性值 * 4 */
export function attributeRaiseCost(currentValue) {
  return currentValue * 4;
}

/**
 * 提升 1 級技能所需 XP：
 * 0 -> 1 固定 3XP；其餘為 (目前等級-1) * 2XP
 */
export function skillRaiseCost(currentLevel) {
  if (currentLevel === 0) return 3;
  return (currentLevel - 1) * 2;
}

/** 購買一個技能專業，固定 1XP */
export function specializationCost() {
  return 1;
}

/**
 * 購買專長所需 XP = 欲購買等級 * 3(一般專長) 或 * 6(輪回隊專長)
 * 多級專長必須按等級順序購買。
 */
export function featCost(level, { isLegacySquad = false } = {}) {
  return level * (isLegacySquad ? 6 : 3);
}

/**
 * 技能等級達到 6/9/12/14 時，可各挑一次專長/自創技能折抵對應的 XP：
 * 12 / 24 / 39 / 54，折抵到 0 為止，且每個角色一輩子只能用一次(不可疊加到多個能力上，但可疊加到同一個能力)。
 */
const XP_DISCOUNT_THRESHOLDS = { 6: 12, 9: 24, 12: 39, 14: 54 };
export function skillXpDiscountAvailableAt(skillLevel) {
  return XP_DISCOUNT_THRESHOLDS[skillLevel] ?? 0;
}
