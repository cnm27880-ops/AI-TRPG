// 無限恐怖 TRPG 2.35 —— 經驗值花費公式(經驗值系統.htm)
// 這些都是純數學公式，直接照規則書字面定義實作，沒有模糊空間，適合完全交給程式碼。

/** 提升 1 點屬性所需 XP = 目前屬性值 * 4 */
export function attributeRaiseCost(currentValue) {
  return currentValue * 4;
}

/**
 * 提升 1 級技能所需 XP：
 * 0 -> 1 固定 3XP；其餘為 (目前等級-1) * 2XP，**最低 1 點**。
 *
 * [2026-08-17 修正] 原本沒有那個「最低 1 點」的下限，於是 1->2 級算出 0XP(免費升級)。
 * 那是漏抄，不是規則書的字面意思：rules-2.35.txt 第3758行原文寫
 * 「通過從主神處兌換提升技能需要（當前技能等級-1）×2XP，最低為1點。特殊的，將技能從0級提升
 * 到1級需要3XP。」，第741行(核心規則部分.htm)另有一句更直白的「技能從1級提升到2級需要1XP」。
 * 兩處都指向同一個下限。舊版的 test/engine.test.js 還用註解把 0 說成「規則書公式字面上如此」，
 * 一併更正。這個下限對 4 級以上完全沒有影響((4-1)*2=6 > 1)，只影響 1->2 這一級。
 */
export function skillRaiseCost(currentLevel) {
  if (currentLevel === 0) return 3;
  return Math.max(1, (currentLevel - 1) * 2);
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
