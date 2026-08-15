// 衍生屬性 —— [規則書] 出處：rules-2.35.txt 第1755~1800行「衍生屬性段」，
// 以及第2060~2140行建卡頁的「衍生屬性」數值欄位。
//
// 這些是「由屬性算出來的第二層數字」，建卡完成的最後一步就是把它們算出來填進角色卡。
// 之前引擎缺這一塊：core/schema.js 的 emptyCharacter() 有 derived.hp 欄位，但沒有人算它，
// 測試裡都是手動寫 createHpState(20)。建卡流程要能自動產生合法角色卡就必須補上。
//
// 逐條出處（每一條都能在書裡找到原文）：
//   體積：「普通成年人體積為 5。通過選擇對應的專長或缺陷，你可以將體積擴大到 6 或降低到 4。」(第1758行)
//   生命值：「生命值：大小為 耐力 + 體積。」(第1787行)
//   意志值：「意志值 = 決心 + 沉著 + 傳奇決心 + 傳奇沉著」(建卡頁欄位，第2115~2128行)
//   先攻值：「先攻 = 敏捷 + 沉著」(建卡頁欄位，第2093~2100行)
//   基礎防御：「基礎防御：用于決定人物的防御值，初始值為 敏捷和感知中較低者。」(第1784行)
//   敏感範圍：「角色的敏感范圍初始值為 感知 * 10 米」(第1793行)
//
// [注意] 基礎防御這一條跟 core/combat/defense.js 是同一個公式，該模組已經在
// computeDefenseProfile() 裡算過（含閃避/洞察/格擋等其他層）。這裡另外提供一個
// baseDefense() 是給「建卡時要在角色卡上填一個初始值」用的，兩邊都取 min(敏捷, 感知)，
// 不可以只改一邊。
//
// [已知簡化] 書中提到「陸行速度/飛行速度」也是衍生屬性，但翻查建卡頁時該欄位是空的
// （沒有給公式，只有一個空格），沒找到明確的計算方式，所以這裡不做——不憑印象補一個公式上去。

import { legendaryAttributeBonus } from "./dice.js";

/** 普通成年人的體積。專長/缺陷可以改成4或6，超出這個範圍的要靠資源包提供。 */
export const DEFAULT_SIZE = 5;
export const MIN_SIZE = 4;
export const MAX_SIZE = 6;

/** 生命值上限 = 耐力 + 體積 */
export function maxHitPoints(constitution, size = DEFAULT_SIZE) {
  return constitution + size;
}

/** 意志值 = 決心 + 沉著 + 傳奇決心 + 傳奇沉著 */
export function maxWillpower(resolve, composure) {
  return (
    resolve + composure + legendaryAttributeBonus(resolve) + legendaryAttributeBonus(composure)
  );
}

/** 先攻值 = 敏捷 + 沉著（實際擲先攻是 1D10 + 這個值，見 core/combat/turnOrder.js） */
export function initiativeScore(agility, composure) {
  return agility + composure;
}

/** 基礎防御 = 敏捷和感知中較低者 */
export function baseDefense(agility, perception) {
  return Math.min(agility, perception);
}

/** 敏感範圍（公尺）= 感知 × 10 */
export function sensoryRangeMeters(perception) {
  return perception * 10;
}

/**
 * 依角色的九維屬性算出整組衍生屬性。
 *
 * @param {object} attributes 中文九維屬性物件（見 core/schema.js 的 ATTRIBUTES）
 * @param {object} [opts]
 * @param {number} [opts.size] 體積，預設 DEFAULT_SIZE
 * @returns {{hp:{max,intact,B,L,A}, willpower:{max,current,temp}, initiative:number,
 *            baseDefense:number, sensoryRangeMeters:number, size:number}}
 */
export function computeDerivedStats(attributes, { size = DEFAULT_SIZE } = {}) {
  const required = ["耐力", "決心", "沉著", "敏捷", "感知"];
  for (const key of required) {
    if (typeof attributes?.[key] !== "number") {
      throw new Error(`計算衍生屬性需要屬性「${key}」，收到：${attributes?.[key]}`);
    }
  }
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new Error(`體積必須是${MIN_SIZE}~${MAX_SIZE}的整數（普通成年人是${DEFAULT_SIZE}），收到：${size}`);
  }

  const hpMax = maxHitPoints(attributes["耐力"], size);
  const wpMax = maxWillpower(attributes["決心"], attributes["沉著"]);

  return {
    size,
    // 傷勢軌的初始狀態：全部都是「完好」，四段傷勢都是0（見 core/health.js）
    hp: { max: hpMax, intact: hpMax, B: 0, L: 0, A: 0 },
    willpower: { max: wpMax, current: wpMax, temp: 0 },
    initiative: initiativeScore(attributes["敏捷"], attributes["沉著"]),
    baseDefense: baseDefense(attributes["敏捷"], attributes["感知"]),
    sensoryRangeMeters: sensoryRangeMeters(attributes["感知"]),
  };
}
