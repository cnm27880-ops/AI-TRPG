// 傷害吸收（單一護甲值）—— [設計，取代原始8步驟減免]
//
// [決策記錄 2026-08-15] 使用者明確決定廢除書中「免疫->忽略->硬度->吸收->轉化->抗力/減免->
// 抵消」8步驟、六大傷害類別(物理/能量/精神/力場/毒素/墜落)各自適用不同規則的減免系統，
// 把硬度與抗力合併成單一數值「護甲值(Armor)」，不再區分傷害類型。完整理由見
// ARCHITECTURE.md「戰鬥數學簡化(2026-08-15)」決策記錄，舊版8步驟的完整規則書出處
// (rules-2.35.txt 第5116~5116行)保留在 git 歷史紀錄中，不是被遺忘。
//
// 新流程（見 core/combat/resolveCombatAction.js）：
//   1) 命中判定：命中成功數 - 防御DC = 基礎傷害點數（core/combat/attack.js）
//   2) 傷害吸收：基礎傷害 - 目標護甲值 = 實質扣血點數（這個模組）
//   3) 傷勢結算：直接扣減目標的 HP 軌道（core/health.js）

/**
 * @param {number} baseDamage 命中後、防御DC扣完的基礎傷害點數（見 attack.js 的 baseDamage）
 * @param {number} [armor] 目標的護甲值，預設0
 */
export function applyArmor(baseDamage, armor = 0) {
  if (baseDamage < 0) throw new Error("基礎傷害點數不能是負數");
  return Math.max(0, baseDamage - Math.max(0, armor));
}
