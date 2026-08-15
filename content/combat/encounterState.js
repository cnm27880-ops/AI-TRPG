// [設計] 單敵人戰鬥遭遇的狀態機——把 core/combat/ 的引擎模組（先攻、行動經濟、命中判定、
// 傷害減免、生命值）接成一場「玩家 vs 一個敵人」的完整回合制流程。
//
// 範圍限制（刻意，MVP）：
//   - 只支援一對一（玩家 vs 單一敵人），不支援多敵人/隊友——多參戰單位需要重新設計
//     session 的資料形狀（陣營列表而非單一對手），留到之後有實際需求再做。
//   - 敵人 AI 是固定行為（永遠用自己配備的唯一武器攻擊），不做任何戰術決策，因為
//     「AI 不做算術」的最高原則同樣適用在敵人身上——敵人的行動不需要用到 LLM。
//   - 武器/敵人資料來自 content/combat/placeholderEncounters.js 的臨時佔位資料，
//     不是真實資源型錄，見該檔案的檔頭說明。
//   - 戰鬥判定本身完全不呼叫 AI；AI 只在戰鬥結束後，透過既有的 /api/turn 敘事迴圈
//     把結果寫成故事（呼叫端自己組一句 playerAction 摘要餵回去）。
//
// [決策記錄 2026-08-15] 底下呼叫 resolveCombatAction() 時組出的 defenderCombatProfile
// 已經改用單一DC+單一護甲值的簡化形狀（見 core/character.js 的 emptyCombatProfile()），
// 技能補正固定取「格鬥/體魄兩者較高者」，對應使用者新規則的「技能補正(格鬥/體魄)」。

import { rollInitiative, determineTurnOrder } from "../../core/combat/turnOrder.js";
import { createActionBudget } from "../../core/combat/actionEconomy.js";
import { resolveCombatAction } from "../../core/combat/resolveCombatAction.js";
import { emptyCombatProfile } from "../../core/character.js";
import { createHpState } from "../../core/health.js";
import { computeDerivedStats } from "../../core/derivedStats.js";
import { PLACEHOLDER_WEAPONS, buildAttackParams, PLACEHOLDER_ENEMY } from "./placeholderEncounters.js";

/**
 * 建立一場新的戰鬥遭遇。雙方各擲一次先攻，決定行動順序。
 * @param {object} character 玩家角色卡（core/schema.js 形狀，需要 attributes/skills/derived.hp）
 * @param {object} [enemyTemplate] 預設用 PLACEHOLDER_ENEMY
 */
export function createEncounter(character, enemyTemplate = PLACEHOLDER_ENEMY) {
  const enemyDerived = computeDerivedStats(enemyTemplate.attributes, { size: enemyTemplate.size ?? 5 });

  const playerInitiative = rollInitiative(character.derived.initiative);
  const enemyInitiative = rollInitiative(enemyDerived.initiative);

  const { order, needsManualTieBreak } = determineTurnOrder([
    { id: "player", initiative: playerInitiative, agility: character.attributes?.敏捷 ?? 1 },
    { id: "enemy", initiative: enemyInitiative, agility: enemyTemplate.attributes.敏捷 ?? 1 },
  ]);

  return {
    active: true,
    round: 1,
    turnIndex: 0,
    order,
    winner: null,
    initiative: { player: playerInitiative, enemy: enemyInitiative, needsManualTieBreak },
    player: {
      hpState: { ...character.derived.hp },
      budget: createActionBudget(),
    },
    enemy: {
      name: enemyTemplate.name,
      attributes: enemyTemplate.attributes,
      skills: enemyTemplate.skills,
      weaponKey: enemyTemplate.weaponKey,
      armor: enemyTemplate.armor ?? 0,
      hpState: createHpState(enemyDerived.hp.max),
      budget: createActionBudget(),
    },
    log: [],
  };
}

export function isCombatOver(combat) {
  if (combat.enemy.hpState.dead || combat.enemy.hpState.unconscious) {
    return { over: true, winner: "player" };
  }
  if (combat.player.hpState.dead || combat.player.hpState.unconscious) {
    return { over: true, winner: "enemy" };
  }
  return { over: false, winner: null };
}

function advanceTurn(combat) {
  const nextIndex = (combat.turnIndex + 1) % combat.order.length;
  combat.turnIndex = nextIndex;
  if (nextIndex === 0) {
    combat.round += 1;
    combat.player.budget = createActionBudget();
    combat.enemy.budget = createActionBudget();
  }
}

function finalizeIfOver(combat) {
  const status = isCombatOver(combat);
  if (status.over) {
    combat.active = false;
    combat.winner = status.winner;
  }
  return status;
}

/**
 * 玩家攻擊敵人。呼叫端(API層)要先確認 combat.order[combat.turnIndex] === "player"。
 * @param {object} combat createEncounter() 回傳的物件（會被直接修改並回傳同一份參照）
 * @param {object} character 玩家角色卡
 * @param {keyof PLACEHOLDER_WEAPONS} weaponKey
 */
export function resolvePlayerAttack(combat, character, weaponKey, { rollFn } = {}) {
  if (!combat.active) throw new Error("戰鬥已經結束");
  if (combat.order[combat.turnIndex] !== "player") throw new Error("現在不是玩家的行動順位");

  const weapon = PLACEHOLDER_WEAPONS[weaponKey];
  if (!weapon) throw new Error(`不合法的武器：${weaponKey}`);

  const attackParams = buildAttackParams(weapon.attackType, character, weapon);

  const result = resolveCombatAction({
    attackType: weapon.attackType,
    attackParams,
    distance: 0,
    weaponRange: weapon.weaponRange ?? Infinity,
    defenderAttributes: combat.enemy.attributes,
    defenderCombatProfile: {
      ...emptyCombatProfile(),
      skillCorrection: Math.max(combat.enemy.skills?.格鬥 ?? 0, combat.enemy.skills?.體魄 ?? 0),
      armor: combat.enemy.armor ?? 0,
    },
    defenderHpState: combat.enemy.hpState,
    severity: weapon.severity,
    ...(rollFn ? { rollFn } : {}),
  });

  combat.enemy.hpState = result.newHpState;
  combat.log.push({ actor: "player", weaponKey, ...summarizeResult(result) });

  const status = finalizeIfOver(combat);
  if (!status.over) advanceTurn(combat);

  return { result, combat };
}

/**
 * 敵人攻擊玩家（固定行為：用自己配備的武器攻擊）。呼叫端要先確認輪到敵人行動。
 * 回傳的 result.newHpState 要由呼叫端同步回 character.derived.hp（這個模組不改角色卡本身）。
 */
export function resolveEnemyAttack(combat, character, { rollFn } = {}) {
  if (!combat.active) throw new Error("戰鬥已經結束");
  if (combat.order[combat.turnIndex] !== "enemy") throw new Error("現在不是敵人的行動順位");

  const weapon = PLACEHOLDER_WEAPONS[combat.enemy.weaponKey];
  const attackParams = buildAttackParams(weapon.attackType, {
    attributes: combat.enemy.attributes,
    skills: combat.enemy.skills,
  }, weapon);

  const result = resolveCombatAction({
    attackType: weapon.attackType,
    attackParams,
    distance: 0,
    weaponRange: weapon.weaponRange ?? Infinity,
    defenderAttributes: character.attributes,
    defenderCombatProfile: {
      ...emptyCombatProfile(),
      skillCorrection: Math.max(character.skills?.格鬥 ?? 0, character.skills?.體魄 ?? 0),
      armor: character.combatProfile?.armor ?? 0,
    },
    defenderHpState: combat.player.hpState,
    severity: weapon.severity,
    ...(rollFn ? { rollFn } : {}),
  });

  combat.player.hpState = result.newHpState;
  combat.log.push({ actor: "enemy", weaponKey: weapon.key, ...summarizeResult(result) });

  const status = finalizeIfOver(combat);
  if (!status.over) advanceTurn(combat);

  return { result, combat };
}

/**
 * 若敵人贏得先攻、搶在玩家之前行動，開戰當下就要先把敵人的開場攻擊解決掉，
 * 不然玩家永遠等不到自己的行動順位（/api/combat/act 只接受玩家發起）。
 * 只有兩個參戰單位時最多執行一次，但寫成迴圈以防未來擴充成多參戰單位。
 * @returns {object[]} 這次連帶解決掉的敵人攻擊結果列表（可能是空陣列）
 */
export function resolveLeadingEnemyTurns(combat, character, { rollFn } = {}) {
  const results = [];
  while (combat.active && combat.order[combat.turnIndex] === "enemy") {
    results.push(resolveEnemyAttack(combat, character, { rollFn }).result);
  }
  return results;
}

function summarizeResult(result) {
  return {
    hit: result.hit,
    damage: result.finalDamage,
    rawSuccesses: result.attackResult?.rawSuccesses ?? null,
  };
}
