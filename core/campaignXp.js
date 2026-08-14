// [規則書] 經驗值系統.htm ——「每部影片/每次跑團結束」的經驗值發放公式
//
// 規則書提供兩種發放方式：
//   第一種「固定分配」：逐項給分，不需要跟其他玩家比較，天生適合單人遊戲。
//   第二種「動態分配」：五段式(基礎值/獎勵經驗/參團率/表現獎勵/補助)，是為多人團設計的，
//     其中「表現獎勵」是把在場所有PC按表現排名、名次給分(給分=存活人數-1遞減)，
//     在單人遊戲(參團人數=1)時這一項會恆為0(只有一名玩家，沒有排名可比)，直接照搬會讓
//     「表現越好給越多」的精神在單人場景下失效。
//
// 設計決策：這個網站是單人遊戲，所以「固定分配」是主要採用的方式，尤其是使用者要的
// 「RP精彩度」獎勵，直接對應固定分配裡的「扮演出色」與「突出扮演表現」兩項。
// 「動態分配」仍然完整實作、有測試，保留給未來萬一支援多人房間時使用，但不是這個專案現在的預設路徑。
//
// AI 的角色：只能從下面每一項給定的「有限分級」裡選一個，不能自己填數字。
// 分級 -> 實際點數的對照表是寫死在程式碼裡的，這是遵守 ARCHITECTURE.md 的最高原則。

/**
 * 固定分配(第一種)：逐項加總。每一項都是「AI 選一個分級，程式碼查表給點數」。
 * @param {object} tiers
 * @param {boolean} tiers.participated 是否參與本場並執行了基礎行動 -> 1點
 * @param {"無"|"普通"|"出色"|"優異"} tiers.roleplay 角色扮演符合人物性格的程度 -> 0/1/2/3點
 * @param {"無"|"有"} tiers.arcPerformance 整場有合理且具承順性的突出扮演與性格發展
 *   -> 0點 或 依 tiers.arcPerformanceLevel(1~5映射到3~10，5個等級平均分佈) 點
 * @param {1|2|3|4|5} [tiers.arcPerformanceLevel] 只有 arcPerformance="有" 時才需要，1最低5最高
 * @param {"無"|"有"} tiers.nearDeathEscape 從幾乎必死的危險中逃生或解決不可能的難題 -> 0/1~3點(用level)
 * @param {1|2|3} [tiers.nearDeathEscapeLevel]
 * @param {"無"|"有"} tiers.enduredHardship 堅持性格特質且承受嚴重打擊仍不放棄 -> 0/2~6點(用level)
 * @param {1|2|3|4|5} [tiers.enduredHardshipLevel]
 * @param {boolean} tiers.heroicAct 有特別英勇的舉動 -> 1點
 * @param {boolean} tiers.learnedSomething 學到明顯超出原本水平的東西 -> 建議直接提升對應技能1級，不算XP
 * @param {"無"|"有"} tiers.defeatedStrongEnemy 戰勝非常強大關鍵性的敵人 -> 0/1~3點(用level，依數量與強度)
 * @param {1|2|3} [tiers.defeatedStrongEnemyLevel]
 * @param {number} [tiers.virtueTriggers] 觸發「美德」次數，每次3點(若使用美德/惡德系統)
 * @param {number} [tiers.viceTriggers] 觸發「惡德」次數，每次1點
 */
export function fixedSessionXp(tiers) {
  let total = 0;
  const breakdown = {};

  breakdown.baseXP = 10; // 規則書：基礎經驗通常是10(定值，避免長團拿得少、短團拿得多)
  total += breakdown.baseXP;

  breakdown.participation = tiers.participated ? 1 : 0;
  total += breakdown.participation;

  const roleplayTable = { 無: 0, 普通: 1, 出色: 2, 優異: 3 };
  breakdown.roleplay = roleplayTable[tiers.roleplay] ?? 0;
  total += breakdown.roleplay;

  // 每個欄位的「級距數」對應規則書給的點數範圍寬度，用整數等距分級，
  // 不能通用套一個固定的maxLevel，否則像1~3這種只有3個整數值的範圍會被錯誤地內插成小數再取整。
  breakdown.arcPerformance =
    tiers.arcPerformance === "有" ? levelToRange(tiers.arcPerformanceLevel, 3, 10, 5) : 0;
  total += breakdown.arcPerformance;

  breakdown.nearDeathEscape =
    tiers.nearDeathEscape === "有" ? levelToRange(tiers.nearDeathEscapeLevel, 1, 3, 3) : 0;
  total += breakdown.nearDeathEscape;

  breakdown.enduredHardship =
    tiers.enduredHardship === "有" ? levelToRange(tiers.enduredHardshipLevel, 2, 6, 5) : 0;
  total += breakdown.enduredHardship;

  breakdown.heroicAct = tiers.heroicAct ? 1 : 0;
  total += breakdown.heroicAct;

  breakdown.defeatedStrongEnemy =
    tiers.defeatedStrongEnemy === "有" ? levelToRange(tiers.defeatedStrongEnemyLevel, 1, 3, 3) : 0;
  total += breakdown.defeatedStrongEnemy;

  breakdown.virtueBonus = (tiers.virtueTriggers ?? 0) * 3;
  total += breakdown.virtueBonus;

  breakdown.viceBonus = (tiers.viceTriggers ?? 0) * 1;
  total += breakdown.viceBonus;

  return { total, breakdown };
}

/** 把 1~maxLevel 的分級，等距映射到 [min,max] 的整數點數；maxLevel 必須跟呼叫端的級距定義一致 */
function levelToRange(level, min, max, maxLevel) {
  const clampedLevel = Math.max(1, Math.min(maxLevel, level ?? 1));
  if (maxLevel === 1) return min;
  const step = (max - min) / (maxLevel - 1);
  return Math.round(min + step * (clampedLevel - 1));
}

/**
 * 動態分配(第二種)：五段式。保留給未來多人模式使用，單人模式下 performanceBonus 恆為0(見檔頭說明)。
 * @param {object} params
 * @param {number} params.partySize 參團PC人數
 * @param {number} params.totalDCount 本場所有PC獲得的D級獎勵總數
 * @param {number} params.totalPoints 本場所有PC獲得的「分」總數(即遊戲內積分/pts)
 * @param {1|2} params.participationPoints 參團率點數(1~2，ST決定)
 * @param {number} params.performanceRank 本PC的表現名次，1是最好
 * @param {number} params.survivingCount 本場最後存活PC總人數
 * @param {number} [params.subsidy] 補助(正負皆可，例如死亡+1/失去支線-1)
 */
export function dynamicSessionXp(params) {
  const {
    partySize,
    totalDCount = 0,
    totalPoints = 0,
    participationPoints = 1,
    performanceRank,
    survivingCount,
    subsidy = 0,
  } = params;

  const baseValue = Math.max(0, partySize - 5);

  const bonusUnits = totalDCount + Math.floor(totalPoints / 500);
  const bonusXp = Math.ceil(bonusUnits / Math.max(1, partySize));

  const participationRate = Math.max(1, Math.min(2, participationPoints));

  // 表現獎勵：第一名拿 (存活人數-1)，往下每名遞減1，最低0
  const performanceBonus =
    performanceRank == null
      ? 0
      : Math.max(0, survivingCount - 1 - (performanceRank - 1));

  const total = baseValue + bonusXp + participationRate + performanceBonus + subsidy;

  return {
    total,
    breakdown: { baseValue, bonusXp, participationRate, performanceBonus, subsidy },
    warning:
      partySize === 1
        ? "單人遊戲下 baseValue 與 performanceBonus 會趨近於0，建議改用 fixedSessionXp"
        : null,
  };
}
