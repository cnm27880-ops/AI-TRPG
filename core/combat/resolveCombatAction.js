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


// ---------------------------------------------------------------------------
// [設計 2026-08-18] 傷害嚴重度標籤（見 Phase 5.3 任務4）。
//
// 這是給**敘事層**用的視覺提示，不是規則。引擎算出「實質傷害 3 點」之後，AI 收到的
// 只是一個數字，而 3 點在這套規則裡是「皮開肉綻」還是「擦傷」，它沒有依據判斷——
// 於是每次受擊都寫得差不多。標籤把「這個數字有多痛」翻譯成一句畫面提示，
// AI 照著它決定描寫的強度。
//
// 三條界線要守住（否則這個欄位就會變成第二個傷害系統）：
//   1. 標籤**不參與任何運算**。它在扣血之後才算，改它不會改變 HP、不會改變 B/L/A 轉換，
//      整個 core/health.js 沒有任何地方讀它。
//   2. 標籤由「實質傷害 + 嚴重度(B/L/A)」查表得出，AI 不能自己指定，也不能拿它反推數字。
//   3. 標籤文字**不可以出現在敘事裡**（那個要求寫在 prompt 端，見
//      content/gemini/promptContract.js 的 buildCombatNarrationPrompt）。
//
// 分級依據：severity A 是規則書的「惡性傷」——那一點傷會直接吃掉完好格並且不可回復，
// 所以不論點數多少都算重創；其餘依實質傷害點數分三段，界線取自 PLACEHOLDER 武器的
// 傷害分布（徒手/手槍在現行公式下大多落在 1~4 點），之後平衡調整時可以改，但要連同
// test/resolveCombatAction.test.js 一起改。
// ---------------------------------------------------------------------------

export const DAMAGE_SEVERITY_TAGS = Object.freeze({
  miss: "[攻勢落空 / 撲了個空]",
  absorbed: "[火花四濺 / 毫髮無傷]",
  light: "[輕微擦傷 / 踉蹌後退]",
  serious: "[皮開肉綻 / 痛苦嘶吼]",
  critical: "[肢體斷裂 / 致命重創]",
});

/**
 * 依「命中與否 + 實質傷害 + 傷害嚴重度」挑一個標籤。
 *
 * @param {object} params
 * @param {boolean} params.hit 是否命中
 * @param {number} params.damage 實質傷害（護甲吸收之後的點數）
 * @param {"B"|"L"|"A"} [params.severity] 這次攻擊的傷害嚴重度
 * @returns {{ key: string, tag: string }}
 */
export function damageSeverityTag({ hit, damage = 0, severity }) {
  if (!hit) return { key: "miss", tag: DAMAGE_SEVERITY_TAGS.miss };
  // 命中但一點血都沒掉＝護甲整個吃下來了。這一格單獨存在是刻意的：
  // 「打中了但沒事」跟「根本沒打中」在畫面上是兩件完全不同的事，
  // 前者要看到火花、要聽到金屬聲，後者只有風聲。
  if (damage <= 0) return { key: "absorbed", tag: DAMAGE_SEVERITY_TAGS.absorbed };
  if (severity === "A" || damage >= 5) return { key: "critical", tag: DAMAGE_SEVERITY_TAGS.critical };
  if (damage >= 3) return { key: "serious", tag: DAMAGE_SEVERITY_TAGS.serious };
  return { key: "light", tag: DAMAGE_SEVERITY_TAGS.light };
}

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
    const missTag = damageSeverityTag({ hit: false });
    return {
      hit: false,
      attackResult,
      defenseDC,
      finalDamage: 0,
      newHpState: defenderHpState,
      damageSeverity: missTag.key,
      damageSeverityTag: missTag.tag,
    };
  }

  const finalDamage = applyArmor(attackResult.baseDamage, combatProfile.armor);
  const newHpState = applyDamage(defenderHpState, finalDamage, severity);

  // 標籤在扣完血之後才算，順序本身就是「它不參與運算」的證明——
  // 上面那兩行拿到的東西跟這個欄位存不存在完全無關。
  const tag = damageSeverityTag({ hit: true, damage: finalDamage, severity });

  return {
    hit: true,
    attackResult,
    defenseDC,
    finalDamage,
    newHpState,
    // 給敘事層看的視覺提示（key 給程式判斷/UI 上色，tag 是要貼進 prompt 的那句話）。
    damageSeverity: tag.key,
    damageSeverityTag: tag.tag,
  };
}
