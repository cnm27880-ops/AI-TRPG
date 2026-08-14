// [設計] NPC好感度分級與增益系統。
//
// 規則書裡「好感度」這個詞散落在各種血統/瞳術/專長效果的觸發條件裡(例如"好感度上升一級"、
// "對你好感度低於冷漠")，用的等級詞彙包括：敵對/冷漠(冷淡)/中立/友好/親切/崇敬——但規則書
// 沒有一張統一的「好感度等級 -> 玩家獲得什麼增益」的對照表，這件事完全需要我們自己設計。
//
// 設計原則(遵守 ARCHITECTURE.md 最高原則)：AI 只能在這張固定表裡查表，不能自己決定
// "這個NPC現在對你好感度這麼高，應該給你什麼加值"。加值多少，全部是這裡的常數表決定。
//
// 這是草案版本(使用者要求先出草案表格再調整)，數值都可以之後再改，但改法是改這張表，
// 不是讓AI臨場發揮。

export const AFFECTION_TIERS = [
  { tier: -2, label: "敵對", minPoints: -Infinity, checkBonus: -2, note: "拒絕互動，甚至主動採取敵意行為，無法進行好感度養成活動" },
  { tier: -1, label: "冷漠", minPoints: -20, checkBonus: -1, note: "對玩家的請求/互動意願低，社交類判定扣1" },
  { tier: 0, label: "中立", minPoints: 0, checkBonus: 0, note: "無加值也無扣值，是好感度養成的起始狀態" },
  { tier: 1, label: "友好", minPoints: 20, checkBonus: 1, note: "與此NPC相關的社交/求助類判定+1" },
  { tier: 2, label: "親切", minPoints: 50, checkBonus: 2, note: "解鎖此NPC專屬的支線劇情選項，相關判定+2" },
  { tier: 3, label: "崇敬", minPoints: 100, checkBonus: 3, note: "相關判定+3，達到「主神商店契約」的好感度門檻(需另購買契約才能帶出世界)" },
];

const MIN_TIER = AFFECTION_TIERS[0].tier;
const MAX_TIER = AFFECTION_TIERS[AFFECTION_TIERS.length - 1].tier;

/**
 * 依累積好感度點數查出對應的分級(從最高分級往下找，第一個 minPoints <= points 的就是答案)。
 */
export function tierForPoints(points) {
  for (let i = AFFECTION_TIERS.length - 1; i >= 0; i--) {
    if (points >= AFFECTION_TIERS[i].minPoints) return AFFECTION_TIERS[i];
  }
  return AFFECTION_TIERS[0];
}

/**
 * 好感度變動的合法性檢查用(不做四捨五入或夾限，變動量本身應該由呼叫端的固定事件表決定，
 * 不是這裡決定，這個函式只回傳「變動後的新分級」方便呼叫端知道有沒有跨級)。
 */
export function applyAffectionDelta(currentPoints, delta) {
  const newPoints = currentPoints + delta;
  return {
    points: newPoints,
    tier: tierForPoints(newPoints),
    tierChanged: tierForPoints(currentPoints).tier !== tierForPoints(newPoints).tier,
  };
}

export { MIN_TIER, MAX_TIER };
