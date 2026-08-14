// [設計] 把攻擊判定(attack.js) + 傷害減免(damageTypes.js) + 生命值扣減(health.js)
// 三層串成一次完整的「攻擊行動」。這不是新規則，是把之前分開驗證過的三個模組實際接線起來。
//
// 呼叫端要準備：
//   - 攻擊方：這次攻擊用到的屬性值、技能等級、武器(或天生武器)傷害值
//   - 防御方：屬性值(算基礎/閃避/洞察防御用)、core/character.js 的 combatProfile(格擋/盔甲/
//     天生防御與傷害減免相關數值)、core/health.js 的 hpState
//   - 這次攻擊的性質：攻擊方式(attackTypes.js的key)、傷害大類(damageTypes.js的category)、
//     傷害嚴重度(B/L/A，依武器而定，書中各武器段落會寫「造成XX傷害」)
//
// 傳奇屬性帶來的附加成功/DP加值不會自動套用——呼叫端如果要算傳奇力量的傷害上限加成、
// 傳奇敏捷/感知的攻擊附加成功等，要自己用 core/legendaryAttributes.js 算好，
// 透過 attackBonusSuccesses / extraDamageCap 等參數傳進來，這裡不假設呼叫端一定要用傳奇效果。

import { getAttackType, rangePenalty } from "./attackTypes.js";
import { computeDefenseProfile } from "./defense.js";
import { resolveAttack } from "./attack.js";
import { applyDamageMitigation } from "./damageTypes.js";
import { applyDamage } from "../health.js";
import { emptyCombatProfile, isImmuneTo, resistanceFor } from "../character.js";

/**
 * 跑一次完整的攻擊行動：命中判定 -> 傷害減免 -> 扣血，回傳每一步的結果。
 * @param {object} params
 * @param {string} params.attackType core/combat/attackTypes.js 的 key
 * @param {object} params.attackParams 傳給 attackTypes 的 dp()/damageCap() 的欄位
 *   (例如肉搏要傳 {strength, unarmedSkill, weaponDamage})
 * @param {number} [params.attackBonusSuccesses] 攻擊方的附加成功(呼叫端自己算好傳進來)
 * @param {number} [params.extraDamageCap] 額外的傷害上限加成(例如傳奇力量的三角形數列加成)
 * @param {number} [params.distance] 距離(遠程攻擊用)
 * @param {number} [params.weaponRange] 武器射程(遠程攻擊用)
 * @param {object} params.defenderAttributes 防御方屬性(至少要有 敏捷、感知)
 * @param {object} [params.defenderCombatProfile] 見 core/character.js 的 emptyCombatProfile()
 * @param {boolean} [params.defenderFullDefense] 防御方是否使用「全力防御」標準動作
 * @param {object} params.defenderHpState 見 core/health.js 的 createHpState()
 * @param {"物理"|"能量"|"精神"|"力場"|"毒素"|"墜落"} params.damageCategory
 * @param {string} [params.energySubtype]
 * @param {"B"|"L"|"A"} params.severity 這次攻擊造成的傷害嚴重度
 * @param {boolean} [params.unconditionalPhysicalDR] 防御方的DR是否為DR/-(對力場傷害仍生效)
 * @param {object} [params.diceOpts]
 * @param {Function} [params.rollFn] 測試用依賴注入，直接轉傳給 resolveAttack()
 */
export function resolveCombatAction({
  attackType,
  attackParams,
  attackBonusSuccesses = 0,
  extraDamageCap = 0,
  distance = 0,
  weaponRange = Infinity,
  defenderAttributes,
  defenderCombatProfile,
  defenderFullDefense = false,
  defenderHpState,
  damageCategory,
  energySubtype,
  severity,
  unconditionalPhysicalDR = false,
  diceOpts,
  rollFn,
}) {
  const profile = getAttackType(attackType);
  const combatProfile = { ...emptyCombatProfile(), ...defenderCombatProfile };

  const attackDP = profile.dp(attackParams);
  const damageCap = profile.damageCap(attackParams) + extraDamageCap;
  const rangeDPPenalty = profile.ranged ? rangePenalty(distance, weaponRange) : 0;

  const defense = computeDefenseProfile({
    agility: defenderAttributes.敏捷,
    perception: defenderAttributes.感知,
    meleeWeaponSkill: combatProfile.meleeWeaponSkill,
    unarmedSkill: combatProfile.unarmedSkill,
    shieldDefense: combatProfile.shieldDefense,
    armorDefense: combatProfile.armorDefense,
    naturalDefense: combatProfile.naturalDefense,
    fullDefense: defenderFullDefense,
    extraBonusSuccesses: combatProfile.extraDefenseBonusSuccesses,
  });

  const attackResult = resolveAttack({
    attackDP,
    attackBonusSuccesses,
    rangeDPPenalty,
    targetDefense: defense,
    damageCap,
    diceOpts,
    ...(rollFn ? { rollFn } : {}),
  });

  if (!attackResult.hit) {
    return {
      hit: false,
      attackResult,
      defense,
      mitigation: null,
      finalDamage: 0,
      newHpState: defenderHpState,
    };
  }

  const mitigation = applyDamageMitigation({
    amount: attackResult.damage,
    category: damageCategory,
    energySubtype,
    isImmune: isImmuneTo(combatProfile, damageCategory),
    hardness: combatProfile.hardness,
    physicalAbsorption: combatProfile.physicalAbsorption,
    fullAbsorption: combatProfile.fullAbsorption,
    resistanceOrDR: resistanceFor(combatProfile, damageCategory, energySubtype),
    unconditionalPhysicalDR,
  });

  const newHpState = applyDamage(defenderHpState, mitigation.finalDamage, severity);

  return {
    hit: true,
    attackResult,
    defense,
    mitigation,
    finalDamage: mitigation.finalDamage,
    newHpState,
  };
}
