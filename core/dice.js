// 無限恐怖 TRPG 2.35 —— 骰池判定引擎(核心規則.htm)
// 規則：DP 決定擲幾顆 D10；單顆骰出 8/9/10 = 1 個成功；骰出 10(可被強化降到 9，下限 8)
// 可以「加骰」再擲一顆，加骰的骰子同樣適用成功/加骰規則，直到不再觸發為止。
// DP<=0 時改為「機運骰」：只擲 1 顆 D10，只有骰出 10 才算 1 個成功，
// 但一樣可以正常加骰；若在沒有任何成功的情況下擲出 1，視為「大失敗」(由 AI/ST 決定敘事後果)。
//
// 這個模組刻意只回傳「數字與旗標」，不做任何敘事判斷——
// 敘事後果(大失敗要發生什麼、大成功要多精彩)一律留給負責劇情推進的 AI 依照這些旗標去演繹。

import { randomInt } from "node:crypto";

/** 擲一顆公平的 D10，回傳 1~10 */
export function rollD10() {
  return randomInt(1, 11); // randomInt 是 [min, max) 前閉後開，所以是 1~10
}

/**
 * 擲一次骰池判定。
 * @param {number} dp 骰池大小(要擲幾顆骰子)
 * @param {object} opts
 * @param {number} opts.rerollThreshold 觸發加骰的最低點數，預設 10，規則規定下限是 8
 * @param {number} opts.successThreshold 單顆骰視為成功的最低點數，預設 8
 * @returns {{
 *   successes: number,
 *   rolls: number[],
 *   isFortuneDie: boolean,
 *   fumble: boolean
 * }}
 */
export function rollDicePool(dp, opts = {}) {
  const rerollThreshold = clampRerollThreshold(opts.rerollThreshold ?? 10);
  const successThreshold = opts.successThreshold ?? 8;

  if (dp <= 0) {
    return rollFortuneDie({ rerollThreshold, successThreshold });
  }

  const rolls = [];
  let successes = 0;
  let queue = dp;

  while (queue > 0) {
    const r = rollD10();
    rolls.push(r);
    queue -= 1;
    if (r >= successThreshold) successes += 1;
    if (r >= rerollThreshold) queue += 1; // 加骰：再多擲一顆
  }

  return { successes, rolls, isFortuneDie: false, fumble: false };
}

/** 機運骰：DP<=0 時使用，只有 10 才算成功，但沿用一般的加骰規則 */
function rollFortuneDie({ rerollThreshold, successThreshold }) {
  const rolls = [];
  let successes = 0;
  let queue = 1;

  while (queue > 0) {
    const r = rollD10();
    rolls.push(r);
    queue -= 1;
    if (r === 10) successes += 1; // 機運骰只有天然 10 算成功(不是 successThreshold)
    else if (r >= rerollThreshold && rerollThreshold !== 10) successes += 0; // 理論上 rerollThreshold<=9 才可能出現，先保留邏輯
    if (r >= rerollThreshold) queue += 1;
  }

  // 大失敗：整輪機運骰完全沒有任何成功，且骰出過 1
  const fumble = successes === 0 && rolls.includes(1);

  return { successes, rolls, isFortuneDie: true, fumble };
}

function clampRerollThreshold(v) {
  // 規則書：加骰最低值為 8("9 加骰"的下限)，不可再低
  return Math.max(8, Math.min(10, v));
}

/**
 * 屬性帶來的「傳奇屬性」附加成功(屬性概述.htm)
 * n = floor((屬性值-1)/5)，屬性 6 才開始有(向下取整後 5 以下都是 0)
 */
export function legendaryAttributeBonus(attributeValue) {
  return Math.max(0, Math.floor((attributeValue - 1) / 5));
}

/**
 * 技能帶來的附加成功(技能概述1.htm)
 * 技能等級達到 5/10/11/13/15 時，各提供 1 個附加成功，最多 5 個，不會累加超過門檻數。
 */
const SKILL_BONUS_THRESHOLDS = [5, 10, 11, 13, 15];
export function skillBonusSuccesses(skillLevel) {
  return SKILL_BONUS_THRESHOLDS.filter((t) => skillLevel >= t).length;
}

/**
 * 完整判定：組合骰池 + 附加成功 + 跟 DC 比較。
 * 附加成功規則(附加成功的使用)：擲骰成功數為 0 時，附加成功不生效，判定仍算失敗。
 * @param {object} params
 * @param {number} params.dp
 * @param {number} params.dc 難度，對抗檢定時傳入對方的成功數即可
 * @param {number} [params.bonusSuccesses] 已經算好的附加成功總數(屬性+技能+其他來源)
 * @param {number} [params.flatPenalty] 與「附加成功是否生效」無關、必定套用的成功數扣減
 *   (例如生理/互動技能為0時的「損失1或2個成功數」，這種扣減即使擲骰成功數為0也依然套用)
 * @param {object} [params.diceOpts]
 */
export function resolveCheck({ dp, dc, bonusSuccesses = 0, flatPenalty = 0, diceOpts = {} }) {
  const roll = rollDicePool(dp, diceOpts);
  const rawSuccesses = roll.successes;
  // 核心規則：擲骰成功數為 0(或更低)時，附加成功不生效
  const effectiveBonus = rawSuccesses > 0 ? bonusSuccesses : 0;
  const totalSuccesses = rawSuccesses + effectiveBonus - flatPenalty;
  const success = totalSuccesses >= dc;
  return {
    ...roll,
    rawSuccesses,
    bonusSuccessesApplied: effectiveBonus,
    flatPenaltyApplied: flatPenalty,
    totalSuccesses,
    dc,
    success,
    margin: totalSuccesses - dc,
  };
}
