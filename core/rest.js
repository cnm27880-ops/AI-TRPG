// [規則書＋使用者決定] 休息 —— 資源怎麼回來。
//
// **這個模組補的是一個資源只出不進的洞。** 在它出現之前，整個遊戲迴圈裡沒有任何「休息」：
// `core/health.js` 的 `shortRest()` 與 `core/energyPools.js` 的 `recoverEnergy()`／
// `longRestPools()` 全都是零呼叫端。於是 2026-08-17 把能量池接上消費端之後，
// 情況變成「開一次洞察眼扣1點查克拉，那1點永遠回不來」——池子上限11、目前5，然後就一直是5。
//
// [使用者決定 2026-08-17] 什麼時候可以休息、休息要付什麼代價：
//
//   主神空間 —— **完全恢復**，不需要付出任何代價。
//   副本中   —— 可以休息，但**每次消耗3回合的時間預算**(content/scenario/timeBudget.js)。
//
// 恢復多少則不是設計決定，是照書上抄的。每個能量池的頁面都寫著同一句恢復方式：
//
//   「自行恢復或者打坐，前者一天恢復完全，後者每次消耗起碼15分鐘，
//     做一個關鍵屬性的判定，恢復等同於成功數的點數。」
//
// 兩種休息剛好對上那句話的兩半：主神空間＝「自行恢復（一天恢復完全）」，
// 副本中＝「打坐（做一次關鍵屬性判定，恢復等同成功數）」。**打坐是一次真的擲骰**，
// 走 `core/check.js` 的 `performCheck()`，不是一個憑空的固定值——骰池是那個池子的
// 兩個關鍵屬性之和，也就是決定這個池子上限的同一個數字。
//
// 意志力刻意不在副本中恢復：書上的意志力恢復是「冥想」專長給的每日效果(第2700行起)，
// 那是一個**專長**，不是通則。沒有通則就不發明數字，這是 CONVERSION_RULES.md 第0條。
// 主神空間的完全恢復包含意志力，因為那是使用者明確說的「完全恢復」。

import { createHpState, shortRest } from "./health.js";
import { POOL_DEFS, longRestPools, recoverEnergy } from "./energyPools.js";
import { performCheck } from "./check.js";

/** [使用者決定] 副本中休息一次要付的時間預算。 */
export const IN_MOVIE_REST_ROUNDS = 3;

export const REST_KINDS = Object.freeze(["完全恢復", "打坐"]);

/**
 * 主神空間的完全恢復：生命、意志力、所有能量池一次全滿。
 * 不擲骰、不收費、不消耗時間——主神空間裡沒有時間預算這條軌。
 *
 * @returns {{ character: object, recovered: object }}
 */
export function fullRecovery(character) {
  const hp = createHpState(character.derived.hp.max);
  const willpower = { ...character.derived.willpower, current: character.derived.willpower.max };
  const energyPools = longRestPools(character.derived.energyPools ?? {}, character.attributes);

  return {
    character: { ...character, derived: { ...character.derived, hp, willpower, energyPools } },
    recovered: {
      kind: "完全恢復",
      hp: {
        before: { B: character.derived.hp.B, L: character.derived.hp.L, A: character.derived.hp.A },
        after: { B: 0, L: 0, A: 0 },
      },
      willpower: { before: character.derived.willpower.current, after: willpower.max },
      pools: Object.fromEntries(
        Object.entries(energyPools).map(([name, p]) => [
          name,
          { before: character.derived.energyPools?.[name]?.current ?? 0, after: p.current, max: p.max },
        ])
      ),
    },
  };
}

/**
 * 副本中的打坐：每個能量池各做一次關鍵屬性判定，恢復等同成功數的點數；
 * 生命走既有的 `shortRest()`(一次1點沖擊傷害)。
 *
 * **骰池 = 這個池子的兩個關鍵屬性之和**，跟 `baseCapacity()` 用的是同一個和——
 * 書上說「做一個關鍵屬性的判定」，而這個引擎的檢定一次只吃一個屬性，
 * 所以第二個屬性用 `otherDpModifier` 加進骰池。DC 給 0：書上沒有給難度，
 * 而且打坐要的是「成功數」本身(恢復等同成功數)，不是成功/失敗。
 *
 * @param {object} character
 * @param {{ diceOpts?: object }} [opts] 擲骰選項，原樣傳給 core/dice.js。
 *   測試用 `{ successThreshold: 11 }` 可以逼出「一個成功數都沒有」的情況——
 *   那不是失敗處理，是書上真的會發生的結果(打坐了一場，什麼都沒恢復)。
 * @returns {{ character: object, recovered: object }}
 */
export function meditate(character, { diceOpts } = {}) {
  const hp = shortRest(character.derived.hp);
  let pools = character.derived.energyPools ?? {};
  const poolResults = {};

  for (const name of Object.keys(pools)) {
    const def = POOL_DEFS[name];
    if (!def) {
      // 存檔裡有一個沒登錄的池子：不擲骰、不恢復，但要說得出來，不要靜靜跳過。
      poolResults[name] = { before: pools[name].current, after: pools[name].current, note: "沒有登錄關鍵屬性，無法打坐" };
      continue;
    }
    const [first, second] = def.keyAttributes;
    const check = performCheck(character, {
      attribute: first,
      otherDpModifier: character.attributes?.[second] ?? 0,
      dc: 0,
      ...(diceOpts ? { diceOpts } : {}),
    });
    // 成功數可能是 0(骰運不好)，那就真的什麼都沒恢復——這是書上的規則，不是bug。
    const gained = Math.max(0, check.totalSuccesses ?? 0);
    const before = pools[name].current;
    pools = recoverEnergy(pools, name, gained, character.attributes);
    poolResults[name] = {
      before,
      after: pools[name].current,
      gained: pools[name].current - before,
      max: pools[name].max,
      dp: check.dp,
      keyAttributes: def.keyAttributes,
    };
  }

  return {
    character: { ...character, derived: { ...character.derived, hp, energyPools: pools } },
    recovered: {
      kind: "打坐",
      roundsSpent: IN_MOVIE_REST_ROUNDS,
      hp: { before: character.derived.hp.B, after: hp.B, note: "打坐一次恢復1點沖擊傷害" },
      // 意志力不在這裡恢復，理由見檔頭：書上的意志力恢復是專長給的，不是通則。
      willpower: null,
      pools: poolResults,
    },
  };
}

/** 給 UI 與 AI 敘事用的一句話摘要。 */
export function describeRest(recovered) {
  const parts = [];
  if (recovered.kind === "完全恢復") {
    parts.push("在主神空間完全恢復");
    if (recovered.willpower.after > recovered.willpower.before) {
      parts.push(`意志力回到${recovered.willpower.after}`);
    }
  } else {
    parts.push(`打坐了${recovered.roundsSpent}回合`);
    if (recovered.hp.after < recovered.hp.before) parts.push("恢復1點沖擊傷害");
  }
  for (const [name, p] of Object.entries(recovered.pools)) {
    if (p.note) parts.push(`${name}${p.note}`);
    else if (p.after > p.before) parts.push(`${name} ${p.before}→${p.after}/${p.max}`);
    else parts.push(`${name} 沒有恢復(${p.after}/${p.max})`);
  }
  return parts.join("；");
}
