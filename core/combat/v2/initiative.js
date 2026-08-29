// Combat V2 —— 先攻順序。
//
// 沿用既有的 core/combat/turnOrder.js（那是規則書的先攻規則，Combat V2 沒有理由重寫），
// 只是把擲骰換成戰鬥自己的可重播亂數來源，讓整場戰鬥能在測試裡完全鎖定。

import { determineTurnOrder } from "../turnOrder.js";

/**
 * 擲一次先攻。規則同 core/combat/turnOrder.js 的 rollInitiative（先攻值 + 1D10），
 * 差別只在骰子來自戰鬥的 seeded rng。
 */
export function rollInitiativeWith(rng, initiativeValue) {
  return initiativeValue + rng.d10();
}

/**
 * 決定一場戰鬥的行動順序。
 * @param {Array<{id:string, initiative:number, agility:number}>} entrants
 * @param {object} rng
 * @returns {{ order: string[], rolls: Record<string, number>, needsManualTieBreak: boolean }}
 */
export function rollBattleInitiative(entrants, rng) {
  const rolls = {};
  const scored = entrants.map((entrant) => {
    const value = rollInitiativeWith(rng, entrant.initiative ?? 0);
    rolls[entrant.id] = value;
    return { id: entrant.id, initiative: value, agility: entrant.agility ?? 1 };
  });
  const { order, needsManualTieBreak } = determineTurnOrder(scored);
  return { order, rolls, needsManualTieBreak };
}
