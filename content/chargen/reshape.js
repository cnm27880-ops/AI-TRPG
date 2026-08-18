// [設計] 肉體重塑 —— 主神系統在醒來那一幕給的 5 點自由屬性。
//
// 使用者的要求(逐字)，那段開場白裡的最後一句：
//   「【主神系統：…已為你喚醒專屬特質。防護罩將在三十秒後解除。
//     你還有最後 5 點自由屬性，請完成最終的肉體重塑。】」
//
// ---------------------------------------------------------------------------
// 為什麼是「另一個池」而不是從 ATTRIBUTE_BUDGET 的 8 點裡挖 5 點出來
//
// 挖的話會同時打壞兩件事：
//   1. allocate.js 只剩 3 點可配，它那套「性價比貪婪法 + 最多一條線到頂 + 保底廣度」
//      在 3 點的預算下幾乎不會發生作用，等於把自動配點的所有防呆一起關掉。
//   2. 敘事上也對不上。8 點是**你這輩子活成的樣子**（五題的答案換算來的），
//      5 點是**主神外加在你身上的東西**——所以它才可以突破你原本的極限。
//
// 這個切法剛好讓一件本來很彆扭的事變得合理：allocate.js 的 AUTO_ATTRIBUTE_CAP 是 4，
// 比建卡規則的 5 低一級（理由見該檔第2點：不讓系統親手幫玩家造出最無聊的那張卡）。
// 於是「屬性 5」變成**只有玩家自己按得出來**的東西，那正是肉體重塑該有的意義。
//
// 總量 8 + 5 = 13 點，比改版前的 8 點高。這是刻意的，而且只有一個常數要轉
// （RESHAPE_POINTS）；實測覺得太肥就往下調，不需要動任何邏輯。
// ---------------------------------------------------------------------------
//
// 「必須剛好用完」是照既有慣例走的：content/shop/catalog.js 的血統自由屬性點也是
// 「分配必須剛好用完、單項不得超過模板上限，而且由呼叫端指定不是AI決定」
// （見 test/shopCatalog.test.js 那條測試）。留點數不花沒有任何好處，只會讓玩家
// 在三十秒的緊張感裡漏掉自己的權益。

import { ATTRIBUTES } from "../../core/schema.js";
import { nextStepCost } from "./pointCosts.js";

const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key);

/** 主神給的自由屬性點數。 */
export const RESHAPE_POINTS = 5;
/** 重塑之後單項屬性的上限（建卡規則的上限，比自動配點的 4 高一級）。 */
export const RESHAPE_ATTRIBUTE_CAP = 5;

/**
 * 每個屬性「再加一級要花幾點」，給前端在加點按鈕旁邊標價用。
 * 玩家必須在按下去之前就看到價格，否則遞增成本只會變成「我按了才發現不夠」的挫折。
 *
 * @param {Record<string, number>} attributes 目前的屬性值
 * @returns {Record<string, number|null>} null = 已經到頂，不能再加
 */
export function reshapeStepCosts(attributes = {}) {
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => {
      const value = attributes[key] ?? 1;
      if (value >= RESHAPE_ATTRIBUTE_CAP) return [key, null];
      return [key, nextStepCost("attr", value)];
    })
  );
}

/**
 * 把玩家的重塑分配疊到自動配點的結果上。
 *
 * @param {Record<string, number>} baseAttributes 自動配點的結果（allocate.js 的產物）
 * @param {Record<string, number>} spend { 屬性: 要加幾級 }。沒列到的視為 0。
 * @param {object} [opts]
 * @param {boolean} [opts.requireExact=true] 是否要求剛好用完（送出時 true，即時預覽時 false）
 * @returns {{valid: boolean, attributes: object, cost: number, remaining: number, errors: string[]}}
 */
export function applyReshape(baseAttributes = {}, spend = {}, { requireExact = true } = {}) {
  const errors = [];
  const attributes = Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [key, baseAttributes[key] ?? 1])
  );

  // 先擋掉不認得的鍵。靜靜忽略會讓「我明明加了力氣」變成一個查不出來的問題——
  // 而這份輸入是從前端來的，不是自己人組的。
  for (const key of Object.keys(spend)) {
    if (!ATTRIBUTE_KEYS.includes(key)) errors.push(`「${key}」不是六維屬性之一`);
  }

  let cost = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const levels = spend[key] ?? 0;
    if (!Number.isInteger(levels) || levels < 0) {
      errors.push(`${key} 的加點必須是 0 或正整數`);
      continue;
    }
    for (let i = 0; i < levels; i++) {
      if (attributes[key] >= RESHAPE_ATTRIBUTE_CAP) {
        errors.push(`${key} 不能超過 ${RESHAPE_ATTRIBUTE_CAP}`);
        break;
      }
      cost += nextStepCost("attr", attributes[key]) ?? 0;
      attributes[key] += 1;
    }
  }

  const remaining = RESHAPE_POINTS - cost;
  if (remaining < 0) errors.push(`自由屬性點超支（已用 ${cost} / ${RESHAPE_POINTS} 點）`);
  if (requireExact && remaining > 0) errors.push(`還有 ${remaining} 點自由屬性沒有分配`);

  return { valid: errors.length === 0, attributes, cost, remaining, errors };
}

/**
 * 一份「按確認就能走」的預設分配：剛好花完 RESHAPE_POINTS 的一組加點。
 *
 * 兩個用途，都不是「幫玩家決定」：
 *   - 前端可以先把它填進去，玩家想改再改。三十秒的緊張感底下，逼一個沒看過規則的人
 *     從零開始配點是很糟的第一印象。
 *   - 它同時是「湊得出剛好 5 點」的存在性檢查，有測試在窮舉全部答案組合驗證。
 *
 * [實作記錄] 第一版是「一律買最便宜的下一級」的貪婪法，會卡住。實際踩到的例子：
 * 屬性 3/1/3/3/1/3 時，貪婪法先把兩個 1 買到 3（各花 1+1），用掉 4 點，
 * 剩下 1 點——而此時每一條線的下一級都要 2 點，於是永遠有 1 點花不掉，
 * requireExact 直接把玩家卡在甦醒畫面出不去。
 * （正解是 敏捷 買三級 1+1+2=4，再拿 1 點買 感知 的第一級，剛好 5。）
 *
 * 所以改成**深度優先搜尋**：預算只有 5 點、每一級至少 1 點，深度最多 5 層、
 * 每層 6 個分支，全部走完也只是幾千次遞迴，沒有效能問題，但保證找得到解。
 * 走訪順序固定（先便宜、再取目前值低的、最後照六維順序），所以結果仍然是決定性的。
 */
export function suggestReshape(baseAttributes = {}) {
  const base = Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [key, baseAttributes[key] ?? 1])
  );

  const seen = new Set();

  /**
   * @returns {Record<string, number>|null} 剛好花完 remaining 的加點，找不到回 null
   */
  function search(values, remaining) {
    if (remaining === 0) return Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 0]));

    const memoKey = `${remaining}|${ATTRIBUTE_KEYS.map((k) => values[k]).join(",")}`;
    if (seen.has(memoKey)) return null;
    seen.add(memoKey);

    const candidates = ATTRIBUTE_KEYS
      .map((key, index) => ({ key, index, value: values[key], cost: nextStepCost("attr", values[key]) }))
      .filter((c) => c.value < RESHAPE_ATTRIBUTE_CAP && c.cost != null && c.cost <= remaining)
      // 先便宜的，同價時先買目前值低的（把點花在還沒起步的屬性上，
      // 而不是繼續餵自動配點已經餵飽的那一條線），再同分照六維固定順序。
      .sort((a, b) => a.cost - b.cost || a.value - b.value || a.index - b.index);

    for (const candidate of candidates) {
      values[candidate.key] += 1;
      const rest = search(values, remaining - candidate.cost);
      values[candidate.key] -= 1;
      if (rest) {
        rest[candidate.key] += 1;
        return rest;
      }
    }
    return null;
  }

  return search({ ...base }, RESHAPE_POINTS) ?? Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 0]));
}
