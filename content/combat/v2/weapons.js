// [設計-臨時佔位資料] 戰鬥用的武器表與攻擊參數轉接。
//
// 這份資料原本在 content/combat/placeholderEncounters.js，隨舊戰鬥系統一起移除時搬到這裡。
// 內容沒有改，定位也沒有改：這**不是**規則書內容，也不是正式的資源型錄——content/packs/
// 裡的血統/改造/瞳術條目目前是自由文字描述（例如金剛狼的「骨爪：3L天生武器，破甲1」），
// 還沒有轉成 core/combat/attackTypes.js 的 dp() 可以直接吃的結構化欄位。
//
// 這裡先給兩把最陽春的武器，讓戰鬥引擎跑得起來；之後型錄資料接上時，只要把
// buildAttackParams() 這層 adapter 的資料來源換掉，行動目錄與 UI 都不用動。

export const COMBAT_WEAPONS = {
  unarmed: {
    key: "unarmed",
    label: "徒手（肉搏）",
    attackType: "肉搏",
    weaponDamage: 0,
    severity: "B",
    ranged: false,
  },
  pistol: {
    key: "pistol",
    label: "制式手槍（槍械）",
    attackType: "槍械",
    weaponDamage: 2,
    weaponRange: 20,
    severity: "B",
    ranged: true,
  },
};

/** 每種攻擊方式需要的具名參數不同（見 core/combat/attackTypes.js），這裡把角色資料轉成對應形狀。 */
export function buildAttackParams(attackType, character, weapon) {
  const attrs = character.attributes ?? {};
  const skills = character.skills ?? {};
  const weaponDamage = weapon.weaponDamage ?? 0;

  switch (attackType) {
    case "肉搏":
      return { strength: attrs.力量 ?? 1, unarmedSkill: skills.格鬥 ?? 0, weaponDamage };
    case "白刃":
      return { strength: attrs.力量 ?? 1, meleeWeaponSkill: skills.格鬥 ?? 0, weaponDamage };
    case "槍械":
      return { agility: attrs.敏捷 ?? 1, gunSkill: skills.射擊 ?? 0, weaponDamage };
    default:
      throw new Error(`content/combat/v2/weapons.js 尚未支援攻擊方式：${attackType}`);
  }
}
