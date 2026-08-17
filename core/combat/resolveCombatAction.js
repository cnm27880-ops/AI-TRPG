// [設計] 把攻擊判定(attack.js) + 護甲吸收(armor.js) + 生命值扣減(health.js)
// 三層串成一次完整的「攻擊行動」。
//
// [決策記錄 2026-08-15] 隨 defense.js/armor.js 的單一DC+單一護甲值簡化，這裡的流程
// 也跟著變成三步：命中判定(含基礎傷害) -> 護甲吸收 -> 扣血，不再有「傷害類別」
// (damageCategory/energySubtype)與「傷害上限加成」(extraDamageCap)這些跟舊機制綁定的參數。
//
// 呼叫端要準備：
//   - 攻擊方：這次攻擊用到的屬性值、技能等級、武器(或天生武器)傷害值
//   - 防御方：屬性值(算防御DC用)、core/character.js 的 combatProfile(技能補正/裝備防御/
//     護甲值)、core/health.js 的 hpState
//   - 這次攻擊的性質：攻擊方式(attackTypes.js的key)、傷害嚴重度(B/L/A，依武器而定)

import { getAttackType, rangePenalty } from "./attackTypes.js";
import { computeDefenseDC } from "./defense.js";
import { resolveAttack } from "./attack.js";
import { applyArmor } from "./armor.js";
import { applyDamage } from "../health.js";
import { emptyCombatProfile } from "../character.js";

/**
 * 跑一次完整的攻擊行動：命中判定 -> 護甲吸收 -> 扣血，回傳每一步的結果。
 * @param {object} params
 * @param {string} params.attackType core/combat/attackTypes.js 的 key
 * @param {object} params.attackParams 傳給 attackTypes 的 dp() 的欄位
 *   (例如肉搏要傳 {strength, unarmedSkill, weaponDamage})
 * @param {number} [params.attackDpModifier] 攻擊骰池的加減(商品/型態給的檢定加骰，
 *   由 content/shop/effects.js 的 attackModifiersFor() 算好傳進來)。跟 attackParams 分開
 *   是刻意的：attackParams 是**公式的輸入**，改它等於改寫攻擊公式(CONVERSION_RULES.md
 *   第5節明令禁止)；這個參數是公式算完之後的外部調整，兩者不該混在一起。
 * @param {number} [params.attackBonusSuccesses] 攻擊方的附加成功(呼叫端自己算好傳進來)
 * @param {number} [params.distance] 距離(遠程攻擊用)
 * @param {number} [params.weaponRange] 武器射程(遠程攻擊用)
 * @param {object} params.defenderAttributes 防御方屬性(至少要有 敏捷、感知)
 * @param {object} [params.defenderCombatProfile] 見 core/character.js 的 emptyCombatProfile()
 * @param {object} params.defenderHpState 見 core/health.js 的 createHpState()
 * @param {"B"|"L"|"A"} params.severity 這次攻擊造成的傷害嚴重度
 * @param {object} [params.diceOpts]
 * @param {Function} [params.rollFn] 測試用依賴注入，直接轉傳給 resolveAttack()
 */
export function resolveCombatAction({
  attackType,
  attackParams,
  attackDpModifier = 0,
  attackBonusSuccesses = 0,
  distance = 0,
  weaponRange = Infinity,
  defenderAttributes,
  defenderCombatProfile,
  defenderHpState,
  severity,
  diceOpts,
  rollFn,
}) {
  const profile = getAttackType(attackType);
  const combatProfile = { ...emptyCombatProfile(), ...defenderCombatProfile };

  const attackDP = profile.dp(attackParams) + attackDpModifier;
  const rangeDPPenalty = profile.ranged ? rangePenalty(distance, weaponRange) : 0;

  const defenseDC = computeDefenseDC({
    agility: defenderAttributes.敏捷,
    perception: defenderAttributes.感知,
    skillCorrection: combatProfile.skillCorrection,
    equipmentDefense: combatProfile.equipmentDefense,
  });

  const attackResult = resolveAttack({
    attackDP,
    attackBonusSuccesses,
    rangeDPPenalty,
    defenseDC,
    diceOpts,
    ...(rollFn ? { rollFn } : {}),
  });

  if (!attackResult.hit) {
    return {
      hit: false,
      attackResult,
      defenseDC,
      finalDamage: 0,
      newHpState: defenderHpState,
    };
  }

  const finalDamage = applyArmor(attackResult.baseDamage, combatProfile.armor);
  const newHpState = applyDamage(defenderHpState, finalDamage, severity);

  return {
    hit: true,
    attackResult,
    defenseDC,
    finalDamage,
    newHpState,
  };
}
