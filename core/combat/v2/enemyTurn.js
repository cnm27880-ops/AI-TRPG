// Combat V2 —— 敵方回合的公開規則執行層（規格第9節第12點）。
//
// 敵人**不是由 LLM 操縱的**。牠的每一步都是這裡的一組明確規則，用戰鬥自己的可重播
// 亂數決定取捨，所以同一個 seed 一定得到同一場戰鬥——這是「LLM 不得決定是否跳過敵方
// 回合」（規格第9節）唯一站得住腳的實作方式：敵方回合根本不經過 LLM。
//
// 敵人跟玩家用**同一套動作經濟**：每輪 1 迅捷 / 1 移動 / 1 標準，移動要花移動動作，
// 攻擊要花標準動作。這不是裝飾——它是玩家「拉開距離」為什麼有意義的原因：
// 敵人這一輪把移動花在追你，就沒有第二個移動可以繞側翼。

import { spendAction } from "./actionBudget.js";
import { createActionBudget } from "./actionBudget.js";
import { getRange, isDown, livingEnemies, playerOf, pushLog, setRange } from "./battleState.js";
import { RANGE_LABELS, stepRange } from "./range.js";
import { hasStatus, removeStatus } from "./battleState.js";
import { performAttack } from "./resolveAction.js";
import { PLACEHOLDER_WEAPONS } from "../../../content/combat/placeholderEncounters.js";
import { toV2Weapon } from "../../../content/combat/v2/loadout.js";

/** 敵人身上那把武器的 V2 形狀。查不到就用徒手，不丟錯——資料寫錯不該讓戰鬥卡死。 */
function enemyWeapon(enemy) {
  const raw = PLACEHOLDER_WEAPONS[enemy.weaponKey] ?? PLACEHOLDER_WEAPONS.unarmed;
  return toV2Weapon(raw);
}

/**
 * 一隻敵人這一輪要做什麼。回傳一串**意圖**（不執行），讓決策與執行分開——
 * 分開之後「這隻怪為什麼這樣動」可以單獨測，不必連著擲骰一起測。
 *
 * @returns {Array<{ kind: "move"|"attack"|"hold", direction?: string, reason: string }>}
 */
export function planEnemyActions(battle, enemy) {
  const player = playerOf(battle);
  const range = getRange(battle, "player", enemy.id);
  const weapon = enemyWeapon(enemy);
  const inWeaponRange = weapon.validRanges.includes(range);
  const plan = [];

  // 被壓制：這一輪只能縮著，不能推進也不能出手（壓制射擊的代價換來的就是這個）。
  if (hasStatus(enemy, "suppressed")) {
    return [{ kind: "hold", reason: "被火力壓制" }];
  }

  const grappled = hasStatus(enemy, "grappled");

  if (!inWeaponRange) {
    if (grappled) {
      // 被擒抱住還想用槍：距離不對又走不掉，只能空等。
      return [{ kind: "hold", reason: "被壓制住無法移動" }];
    }
    // 近戰型往前擠，遠程型退到自己的射程。兩者都只走一格（一般移動的規則）。
    const direction = weapon.category === "melee" ? "closer" : "away";
    plan.push({ kind: "move", direction, reason: "調整到可以出手的距離" });
  }

  // 移動之後如果進得了射程就出手。這個判斷用「移動後的距離」，所以敵人一輪內
  // 可以做到「先逼近再攻擊」——那正是移動動作與標準動作分開的意義。
  const afterMove = plan.length
    ? stepRange(range, plan[0].direction, 1)
    : range;
  if (weapon.validRanges.includes(afterMove) && !isDown(player)) {
    plan.push({ kind: "attack", reason: "目標在攻擊範圍內" });
  } else if (plan.length === 0) {
    plan.push({ kind: "hold", reason: "無法接近目標" });
  }

  return plan;
}

/**
 * 執行整個敵方回合。依先攻順序處理每一隻還活著的敵人。
 *
 * @param {object} battle 會被修改
 * @param {object} rng
 * @returns {{ actions: object[], playerHpState: object }}
 *   playerHpState 要由呼叫端同步回角色卡（跟舊 encounterState 的約定一致）。
 */
export function resolveEnemyTurn(battle, rng) {
  const player = playerOf(battle);
  const actions = [];

  const ordered = battle.order
    .map((id) => battle.participants.find((p) => p.id === id))
    .filter((p) => p && p.side === "enemy" && !isDown(p));

  for (const enemy of ordered) {
    if (isDown(player)) break;
    // 敵人每一輪都拿到跟玩家同樣的額度。這一行是「敵人也受動作經濟約束」的實作點。
    let budget = battle.budgets[enemy.id] ?? createActionBudget();

    for (const step of planEnemyActions(battle, enemy)) {
      if (isDown(player) || isDown(enemy)) break;

      if (step.kind === "move") {
        const spend = spendAction(budget, "move", {}, { actionId: "enemy_move", round: battle.round });
        if (!spend.ok) continue;
        budget = spend.budget;
        const from = getRange(battle, "player", enemy.id);
        const to = stepRange(from, step.direction, 1);
        if (from === to) continue;
        setRange(battle, "player", enemy.id, to);
        // 玩家的側翼優勢是針對「當時的相對位置」建立的；敵人一動，那個優勢就沒了。
        removeStatus(player, `flanking@${enemy.id}`);
        actions.push({ enemyId: enemy.id, kind: "move", from, to });
        pushLog(battle, {
          actor: enemy.id,
          kind: "move",
          text: `${enemy.name}${step.direction === "closer" ? "逼近到" : "退到"}${RANGE_LABELS[to]}。`,
        });
        continue;
      }

      if (step.kind === "attack") {
        const spend = spendAction(budget, "standard", {}, { actionId: "enemy_attack", round: battle.round });
        if (!spend.ok) continue;
        budget = spend.budget;
        const weapon = enemyWeapon(enemy);
        const attack = performAttack({ battle, attacker: enemy, defender: player, weapon, rng });
        if (attack.hit) player.hpState = attack.newHpState;
        actions.push({
          enemyId: enemy.id,
          kind: "attack",
          hit: attack.hit,
          severityTag: attack.severityTag,
        });
        pushLog(battle, {
          actor: enemy.id,
          kind: "attack",
          text: attack.hit
            ? `${enemy.name}的攻擊命中你${attack.damage > 0 ? "" : "，護甲擋下了大部分"}。`
            : `${enemy.name}的攻擊落空。`,
        });
        continue;
      }

      actions.push({ enemyId: enemy.id, kind: "hold", reason: step.reason });
      pushLog(battle, { actor: enemy.id, kind: "info", text: `${enemy.name}沒有推進（${step.reason}）。` });
    }

    battle.budgets[enemy.id] = budget;
  }

  return { actions, playerHpState: player.hpState };
}
