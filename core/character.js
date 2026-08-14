// [設計] 戰鬥用角色檔案的資料形狀 —— 不是新規則，是把之前分散在 core/combat/ 各模組裡的
// 「防御/減免相關欄位」整理成一個角色可以攜帶的物件，讓 resolveCombatAction() 可以直接吃。
//
// 跟 core/schema.js 的 emptyCharacter() 是互補關係：emptyCharacter() 是建卡六大段的完整骨架
// (概念/屬性/技能/專長/衍生屬性/能力)，這裡的 emptyCombatProfile() 只挑出「打一場戰鬥需要的
// 那些額外欄位」——大多數是裝備/血統/改造提供的數值，目前這個引擎還沒有真正的裝備/血統資料
// (Phase 3才會有)，所以全部給預設值0/空，讓引擎在「空手空防具」的情況下也能正確跑完整套流程，
// 之後接上真實資源資料時，只要把這些欄位的數字填對就好，不用改動任何 core/combat/ 的邏輯。

export function emptyCombatProfile() {
  return {
    // 格擋防御的組成部分(見 core/combat/defense.js)
    meleeWeaponSkill: 0, // 白刃技能等級
    unarmedSkill: 0, // 肉搏技能等級
    shieldDefense: 0, // 盾牌防御(裝備體積來源)
    armorDefense: 0, // 盔甲防御(裝備來源)
    naturalDefense: 0, // 天生防御(血統/改造來源)
    extraDefenseBonusSuccesses: 0, // 除了傳奇敏捷/傳奇感知以外的其他防御附加成功來源

    // 傷害減免相關(見 core/combat/damageTypes.js)
    hardness: 0,
    physicalDR: 0, // 物理傷害減免(不含特定弱點比對，見damageTypes.js的已知簡化)
    physicalAbsorption: 0,
    fullAbsorption: 0,
    energyResistances: {}, // { 火焰: 3, 寒冰: 2, ... }，key是能量子類型
    immunities: [], // 對哪些傷害大類完全免疫，例如 ["毒素"]
  };
}

/** 判斷角色是否對某個傷害大類免疫(見 core/combat/damageTypes.js 的 category 概念)。 */
export function isImmuneTo(combatProfile, damageCategory) {
  return (combatProfile.immunities ?? []).includes(damageCategory);
}

/** 依傷害大類，從combatProfile裡取出對應的抗力/減免數值(能量傷害要另外指定子類型)。 */
export function resistanceFor(combatProfile, damageCategory, energySubtype) {
  if (damageCategory === "物理") return combatProfile.physicalDR ?? 0;
  if (damageCategory === "能量") return combatProfile.energyResistances?.[energySubtype] ?? 0;
  return 0; // 精神/力場/毒素/墜落預設沒有專屬抗力欄位，力場的DR/-例外由呼叫端另外處理
}
