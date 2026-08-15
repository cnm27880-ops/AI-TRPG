// 防御值（單一綜合防御 DC）—— [設計，取代原始四層防御拆分]
//
// [決策記錄 2026-08-15] 使用者明確決定廢除書中「基礎/閃避/洞察/格擋」四層防御拆分與
// 「防御值直接從攻擊方DP扣掉、原始成功數需大於防御附加成功數才算命中」的兩段式機制，
// 改為單一綜合防御值，直接當作攻擊方命中判定的難度(DC)。完整理由與對照見 ARCHITECTURE.md
// 「戰鬥數學簡化(2026-08-15)」決策記錄與 RULES_DIGEST.md 第9節——這不是規則書內容，
// 是本專案為了降低戰鬥心智負擔、貼合網頁單人遊戲節奏而做的刻意簡化，舊版四層拆分的
// 完整規則書出處保留在 git 歷史紀錄中，不是被遺忘。
//
// 新公式：防御值(DC) = min(敏捷, 感知) + 技能補正(格鬥/體魄取較高者) + 裝備/天生防御
// 命中判定見 core/combat/attack.js：攻擊方擲骰後的總成功數要「大於」這個DC才算命中，
// 超出DC的成功數直接轉為基礎傷害，不再套用武器別的傷害上限公式。

/**
 * @param {object} params
 * @param {number} params.agility 敏捷值
 * @param {number} params.perception 感知值
 * @param {number} [params.skillCorrection] 技能補正，呼叫端自己算好傳進來
 *   （通常是 max(格鬥技能等級, 體魄技能等級)，這個模組不假設角色物件長什麼樣）
 * @param {number} [params.equipmentDefense] 裝備/天生防御來源的加總（血統/改造/防具等），預設0
 */
export function computeDefenseDC({ agility, perception, skillCorrection = 0, equipmentDefense = 0 }) {
  const base = Math.min(agility, perception);
  return base + skillCorrection + equipmentDefense;
}
