// 命中判定核心（單一DC版）—— [設計，取代原始兩段式命中機制]
//
// [決策記錄 2026-08-15] 見 core/combat/defense.js 檔頭的同一個決策。新規則下命中判定
// 只有一層：攻擊方擲骰後的「原始成功數」要嚴格大於目標的防御DC(computeDefenseDC())才算命中，
// 不再讓防御值直接扣減攻擊方的DP（舊版的「骰池變小」機制已移除，遠程距離減值仍然照常扣DP，
// 那是攻擊本身的懲罰，跟目標的防御能力無關，予以保留）。
//
// 傷害：命中時，基礎傷害 = 總成功數(原始+攻擊方附加成功) - 防御DC，不再套用武器別的
// 傷害上限公式（core/combat/attackTypes.js 的 damageCap() 目前不再被這裡呼叫，
// 但函式本身保留在 attackTypes.js 當作規則書原文的參考資料，見該檔案的說明）。
// 附加成功依然沿用「原始成功數為0時不生效」的核心規則（core/dice.js）。
//
// 護甲吸收是下一步（core/combat/armor.js），不在這個模組處理——這裡只算「打中了、
// 打穿防御之後有多少基礎傷害」，還沒扣護甲。

import { rollDicePool } from "../dice.js";

/**
 * @param {object} params
 * @param {number} params.attackDP 攻擊方的基礎DP(關鍵屬性+技能+武器傷害值)，
 *   用 core/combat/attackTypes.js 的 dp() 算好傳進來。
 * @param {number} [params.attackBonusSuccesses] 攻擊方的附加成功(傳奇屬性/技能附加成功等)，
 *   命中之後才會加進總成功數，預設0。
 * @param {number} [params.rangeDPPenalty] 距離減值等額外DP扣減(近戰傳0，遠程用
 *   core/combat/attackTypes.js 的 rangePenalty() 算好傳進來)，預設0。
 * @param {number} params.defenseDC 目標的防御DC，用 core/combat/defense.js 的
 *   computeDefenseDC() 算好傳進來。
 * @param {object} [params.diceOpts] 傳給 rollDicePool 的選項(rerollThreshold等)。
 * @param {typeof rollDicePool} [params.rollFn] 測試用依賴注入。
 */
export function resolveAttack({
  attackDP,
  attackBonusSuccesses = 0,
  rangeDPPenalty = 0,
  defenseDC,
  diceOpts = {},
  rollFn = rollDicePool,
}) {
  const effectiveDP = attackDP - rangeDPPenalty;
  const roll = rollFn(effectiveDP, diceOpts);
  const rawSuccesses = roll.successes;
  const hit = rawSuccesses > defenseDC;

  if (!hit) {
    return {
      ...roll,
      effectiveDP,
      rawSuccesses,
      hit: false,
      totalSuccesses: rawSuccesses,
      defenseDC,
      baseDamage: 0,
    };
  }

  const bonusApplied = rawSuccesses > 0 ? attackBonusSuccesses : 0;
  const totalSuccesses = rawSuccesses + bonusApplied;
  const baseDamage = totalSuccesses - defenseDC;

  return {
    ...roll,
    effectiveDP,
    rawSuccesses,
    hit: true,
    bonusSuccessesApplied: bonusApplied,
    totalSuccesses,
    defenseDC,
    baseDamage,
  };
}
