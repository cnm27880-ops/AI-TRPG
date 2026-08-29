// Combat V2 —— 玩家的戰鬥裝備清單（武器、彈藥、消耗品）。
//
// 武器來源刻意沿用既有的兩張表：content/combat/placeholderEncounters.js 的佔位武器
// ＋ content/shop/effects.js 的 weaponsFrom()（買到的武器與型態授予的天生武器）。
// 也就是說商店買到什麼，Combat V2 的行動選單就長出什麼——這條線在舊戰鬥流程已經接好了
// （見 encounterState.js 的 combatOptions），沒有理由在 V2 重接一次。
//
// V2 額外需要三個舊資料沒有的欄位，在這裡補上：
//   category    武器類別（melee / firearm），行動的 requirements.weaponCategory 用它判定
//   validRanges 這把武器能在哪些距離使用（規格第4節）
//   magazine    彈匣容量。彈藥是 V2 新增的資源（規格第6節的 requirements.ammunition），
//               舊資料沒有這個概念，所以由這裡依武器類別給預設值。
//
// 彈藥狀態存在戰鬥狀態裡而不是角色卡上，是刻意的：一場戰鬥打完，子彈不會回來，
// 但也不該讓「戰鬥外的角色卡」多長出一個沒有人維護的欄位。之後真的要做跨場景彈藥
// 管理時，把 loadout.ammo 搬進角色卡即可，行動選單那一層不用改。

import { PLACEHOLDER_WEAPONS } from "../placeholderEncounters.js";
import { weaponsFrom } from "../../shop/effects.js";

export const WEAPON_CATEGORIES = Object.freeze({ MELEE: "melee", FIREARM: "firearm" });

/** 依武器類別給的預設彈匣容量。近戰武器沒有彈藥。 */
const DEFAULT_MAGAZINE = Object.freeze({ firearm: 7, melee: 0 });
/** 開場帶幾個備用彈匣。 */
const DEFAULT_SPARE_MAGAZINES = 2;

/**
 * 把一筆武器資料補成 Combat V2 需要的形狀。
 * `ranged` 是舊資料就有的旗標，這裡把它翻成類別與可用距離——不改舊資料，只做轉接。
 */
export function toV2Weapon(weapon) {
  const category = weapon.ranged ? WEAPON_CATEGORIES.FIREARM : WEAPON_CATEGORIES.MELEE;
  return {
    key: weapon.key,
    label: weapon.label ?? weapon.key,
    attackType: weapon.attackType,
    weaponDamage: weapon.weaponDamage ?? 0,
    severity: weapon.severity ?? "B",
    weaponRange: weapon.weaponRange ?? null,
    category,
    // 近戰只能在接觸距離揮；槍械在中/遠距離最有效，貼身開槍另有近戰行動可用。
    validRanges: category === WEAPON_CATEGORIES.FIREARM ? ["medium", "far"] : ["close"],
    magazine: DEFAULT_MAGAZINE[category],
    sourceGood: weapon.sourceGood ?? null,
  };
}

/**
 * 建立一場戰鬥的裝備清單。
 * @param {object} character 角色卡
 * @param {{ extraSources?: object[] }} [opts] extraSources：型態授予的天生武器來源，
 *   形狀同 content/shop/effects.js 的約定。
 */
export function buildLoadout(character, { extraSources = [] } = {}) {
  const table = new Map();
  for (const weapon of Object.values(PLACEHOLDER_WEAPONS)) {
    table.set(weapon.key, toV2Weapon(weapon));
  }
  for (const weapon of weaponsFrom(character, { extraSources })) {
    table.set(weapon.key, toV2Weapon(weapon));
  }

  const weapons = [...table.values()];
  const ammo = {};
  for (const weapon of weapons) {
    if (weapon.category !== WEAPON_CATEGORIES.FIREARM) continue;
    ammo[weapon.key] = {
      loaded: weapon.magazine,
      magazine: weapon.magazine,
      spareMagazines: DEFAULT_SPARE_MAGAZINES,
    };
  }

  return {
    weapons,
    ammo,
    // 消耗品。目前只有醫療包——它讓「標準動作花在治療」這個選擇真的存在，
    // 否則戰術行動選單裡的「物品」分類會是一排永遠不可用的按鈕。
    items: { medkit: 1 },
  };
}

/** 這把武器現在裝填了幾發。近戰武器一律回 null（沒有彈藥這回事，不是 0 發）。 */
export function ammoOf(loadout, weaponKey) {
  return loadout.ammo?.[weaponKey] ?? null;
}

export function findWeapon(loadout, weaponKey) {
  return loadout.weapons.find((w) => w.key === weaponKey) ?? null;
}

/** 目前身上還有沒有這個類別、而且還打得出子彈的武器。 */
export function usableWeaponsOfCategory(loadout, category) {
  return loadout.weapons.filter((weapon) => {
    if (weapon.category !== category) return false;
    if (weapon.category !== WEAPON_CATEGORIES.FIREARM) return true;
    return (ammoOf(loadout, weapon.key)?.loaded ?? 0) > 0;
  });
}

/** 有沒有任何一把該類別的武器（不管有沒有子彈）——用來分辨「沒有槍」與「沒有子彈」。 */
export function ownsWeaponOfCategory(loadout, category) {
  return loadout.weapons.some((weapon) => weapon.category === category);
}

/** 扣彈藥。回傳新的 loadout（不修改傳入的）。不足時回 null，由呼叫端拒絕整個行動。 */
export function consumeAmmo(loadout, weaponKey, rounds = 1) {
  const current = ammoOf(loadout, weaponKey);
  if (!current || current.loaded < rounds) return null;
  return {
    ...loadout,
    ammo: { ...loadout.ammo, [weaponKey]: { ...current, loaded: current.loaded - rounds } },
  };
}

/** 換彈匣。沒有備用彈匣時回 null。 */
export function reloadWeapon(loadout, weaponKey) {
  const current = ammoOf(loadout, weaponKey);
  if (!current || current.spareMagazines <= 0) return null;
  return {
    ...loadout,
    ammo: {
      ...loadout.ammo,
      [weaponKey]: { ...current, loaded: current.magazine, spareMagazines: current.spareMagazines - 1 },
    },
  };
}

/** 用掉一個消耗品。不足時回 null。 */
export function consumeItem(loadout, itemKey, count = 1) {
  const have = loadout.items?.[itemKey] ?? 0;
  if (have < count) return null;
  return { ...loadout, items: { ...loadout.items, [itemKey]: have - count } };
}
