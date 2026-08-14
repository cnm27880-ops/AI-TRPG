// 先攻與行動順序 —— [規則書] 出處：戰！戰！戰！.htm「先攻」「突襲輪」段落，
// rules2.35.txt 第11219~11359行一帶。
//
// 規則摘要：
//   - 先攻權 = 1D10 + 人物的先攻值(建卡時決定的固定值，不是這裡算的)。
//   - 這個檢定「雖名為檢定，但實際上并非檢定」——不受任何增加檢定DP或結果的能力影響
//     (書中原文特別強調)，所以這裡只單純擲一顆 d10，不走 core/dice.js 的骰池系統。
//   - 同先攻權時的排序：沉著較高者先動；沉著也相同則敏捷較高者先動；仍相同則 1D10 比大小；
//     若兩者是同陣營玩家，則由玩家自己決定順序(這裡回傳一個 "needsPlayerChoice" 旗標，
//     不擅自幫玩家決定)。
//   - 突襲輪(奇襲)的發起者無論先攻結果為何，必定第一個行動——這裡用 isAmbushInitiator 旗標處理。
//
// 這個模組只吃「已經算好的先攻值」，不管這個值是怎麼組出來的(建卡系統，Phase還沒做)。

import { rollD10 } from "../dice.js";

/**
 * 對單一角色投擲先攻，回傳先攻權(不套用任何DP/加骰規則，書中原文明確排除)。
 * @param {number} initiativeScore 角色的先攻值
 */
export function rollInitiative(initiativeScore) {
  return rollD10() + initiativeScore;
}

/**
 * 把多個參戰單位依先攻權排序成行動順序。
 * @param {Array<{ id: string, initiative: number, composure?: number, agility?: number, isAmbushInitiator?: boolean, sameFactionGroup?: string }>} combatants
 *   每個參戰單位至少要有 id 跟 initiative(先攻權，呼叫端用 rollInitiative 算好傳進來)。
 *   composure(沉著)/agility(敏捷) 用於同分時的第一/第二順位比較；沒有提供則視為 0。
 * @returns {{ order: object[], needsManualTieBreak: Array<{a:string,b:string}> }}
 */
export function determineTurnOrder(combatants) {
  const needsManualTieBreak = [];

  const sorted = [...combatants].sort((a, b) => {
    // 突襲輪發起者必定第一個行動，無視先攻結果
    if (a.isAmbushInitiator && !b.isAmbushInitiator) return -1;
    if (b.isAmbushInitiator && !a.isAmbushInitiator) return 1;

    if (b.initiative !== a.initiative) return b.initiative - a.initiative;

    const composureA = a.composure ?? 0;
    const composureB = b.composure ?? 0;
    if (composureB !== composureA) return composureB - composureA;

    const agilityA = a.agility ?? 0;
    const agilityB = b.agility ?? 0;
    if (agilityB !== agilityA) return agilityB - agilityA;

    // 完全同分：若同陣營，交給玩家自己決定；否則規則書說用 1D10 比大小，
    // 這裡不擅自幫忙擲骰決定順序(順序影響戰術決策，應該是明確的、可重現的動作，
    // 不該埋在排序函式的副作用裡)，只回報需要額外處理。
    needsManualTieBreak.push({ a: a.id, b: b.id, sameFaction: a.sameFactionGroup != null && a.sameFactionGroup === b.sameFactionGroup });
    return 0;
  });

  return { order: sorted.map((c) => c.id), needsManualTieBreak };
}
