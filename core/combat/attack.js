// 命中判定核心 —— [規則書] 出處：戰！戰！戰！.htm 各攻擊方式段落 + 第13687行「命中」定義。
//
// 這是這次讀規則書最重要的發現：命中判定不是「總成功數 vs DC」的單層比較(那是技能檢定的形狀，
// 見 core/check.js)，而是兩層機制：
//   1) 目標的「防御值」(defense.total)直接從攻擊方DP扣掉，骰池變小之後才擲骰。
//   2) 命中與否：攻擊方「擲出來的原始成功數」(不含任何附加成功)要大於目標的
//      「防御附加成功數」(defense.bonusSuccesses)，才算命中——這一步就決定了有沒有打中，
//      跟後面的傷害計算是分開的兩件事。
// 命中之後，總成功數(原始成功數 + 攻擊方自己的附加成功)就是傷害點數，但傷害上限公式封頂
// (各攻擊方式的傷害上限公式見 core/combat/attackTypes.js)。
//
// 沿用 core/dice.js 的「附加成功在原始成功數為0時不生效」規則(core/check.js也是這樣處理)，
// 這裡不重新發明一套邏輯，只是套用同一個核心原則。

import { rollDicePool } from "../dice.js";

/**
 * @param {object} params
 * @param {number} params.attackDP 攻擊方的基礎DP(關鍵屬性+技能+武器傷害值，還沒扣防御)，
 *   用 core/combat/attackTypes.js 的 dp() 算好傳進來。
 * @param {number} [params.attackBonusSuccesses] 攻擊方的附加成功(傳奇屬性/技能附加成功等)，
 *   命中之後才會加進總成功數，預設0。
 * @param {number} [params.rangeDPPenalty] 距離減值等額外DP扣減(近戰傳0，遠程用
 *   core/combat/attackTypes.js 的 rangePenalty() 算好傳進來)，預設0。
 * @param {{ total: number, bonusSuccesses: number }} params.targetDefense
 *   見 core/combat/defense.js 的 computeDefenseProfile() 回傳格式。
 * @param {number} params.damageCap 傷害上限，用 attackTypes.js 的 damageCap() 算好傳進來。
 * @param {object} [params.diceOpts] 傳給 rollDicePool 的選項(rerollThreshold等)。
 * @param {typeof rollDicePool} [params.rollFn] 測試用依賴注入，預設是真正的 rollDicePool，
 *   讓測試可以塞一個回傳固定結果的假函式進來，驗證命中/傷害的計算邏輯本身，而不用依賴真骰子的機率。
 */
export function resolveAttack({
  attackDP,
  attackBonusSuccesses = 0,
  rangeDPPenalty = 0,
  targetDefense,
  damageCap,
  diceOpts = {},
  rollFn = rollDicePool,
}) {
  const effectiveDP = attackDP - targetDefense.total - rangeDPPenalty;
  const roll = rollFn(effectiveDP, diceOpts);
  const rawSuccesses = roll.successes;
  const hit = rawSuccesses > targetDefense.bonusSuccesses;

  if (!hit) {
    return {
      ...roll,
      effectiveDP,
      rawSuccesses,
      hit: false,
      totalSuccesses: rawSuccesses,
      damage: 0,
    };
  }

  // 沿用「原始成功數為0時附加成功不生效」的核心規則(此時通常也不會命中，除非防御附加成功是負數)
  const bonusApplied = rawSuccesses > 0 ? attackBonusSuccesses : 0;
  const totalSuccesses = rawSuccesses + bonusApplied;
  const damage = Math.min(totalSuccesses, damageCap);

  return {
    ...roll,
    effectiveDP,
    rawSuccesses,
    hit: true,
    bonusSuccessesApplied: bonusApplied,
    totalSuccesses,
    damageCap,
    damage,
  };
}
