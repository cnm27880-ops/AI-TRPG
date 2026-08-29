// Combat V2 —— 一整輪玩家行動的驗證、排序、原子扣除與結算（規格第5.2節）。
//
// 這是伺服器權威的落地點。前端送上來的 payload 只有 actionId / targetId / parameters，
// 這裡把每一項**重新查一次**：這個 action 現在存不存在、屬不屬於這個玩家、距離對不對、
// 裝備夠不夠、動作額度排不排得下。前端送的 cost、actionType、distance、命中、傷害
// 一律不讀（規格第6.3節、第11.4節）。
//
// 結算順序**由伺服器決定**（規格第5.2節）：移動 -> 環境 -> 戰術 -> 攻擊 -> 支援，
// 同相位再依 action ID 排序。前端送上來的陣列順序沒有任何意義——否則玩家可以靠
// 調換順序把「先射擊再接近」變成「先接近再射擊」，繞過距離限制。

import { getActionDefinition, resolutionPhaseIndex } from "./actionCatalog.js";
import { getAvailableCombatActions } from "./availableActions.js";
import { spendBatch } from "./actionBudget.js";
import { resolveSingleAction } from "./resolveAction.js";
import { resolveEnemyTurn } from "./enemyTurn.js";
import {
  BATTLE_PHASES,
  battleRng,
  beginNextRound,
  bumpStateVersion,
  commitRng,
  evaluateBattleEnd,
  finalizeBattle,
  isDown,
  playerOf,
  pushLog,
} from "./battleState.js";

/** 驗證失敗時的具名錯誤。API 層依 `status` 決定 HTTP code（規格第10節的對照表）。 */
export class TurnValidationError extends Error {
  constructor(message, { status = 422, code = "INVALID_ACTION", details = null } = {}) {
    super(message);
    this.name = "TurnValidationError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * 驗證玩家這一輪選的所有行動。**不修改 battle。**
 *
 * 拆成獨立函式是為了讓「預覽」跟「結算」走同一段程式碼：玩家在 UI 上每改一次選擇，
 * 前端可以拿同一份 payload 來問伺服器合不合法，而不必等按下確認才知道。
 *
 * @returns {{ actions: object[], budgetAfter: object }}
 * @throws {TurnValidationError}
 */
export function validateSelection(battle, selectedActions) {
  if (!Array.isArray(selectedActions) || selectedActions.length === 0) {
    throw new TurnValidationError("這一輪沒有選擇任何行動", { code: "EMPTY_SELECTION" });
  }
  if (!battle.active) {
    throw new TurnValidationError("戰鬥已經結束", { status: 409, code: "BATTLE_ENDED" });
  }

  const seen = new Set();
  // 第一輪查驗只做兩件事：這個 actionId 存不存在、是不是這個玩家的。
  // **這裡刻意不看 available**——因為「可不可用」取決於結算順序（移動永遠先於攻擊，
  // 見規格第5.2節），而順序要等所有選擇都收齊、排序過才知道。在這裡就用目前的距離
  // 判可用性的話，「接近 + 近戰」會被錯誤地拒絕：近戰在**選的當下**確實不合法，
  // 但它結算時玩家已經在近距離了。真正的可用性判定在下面 sortForResolution 之後。
  const menu = getAvailableCombatActions({ battle });
  const resolved = [];

  for (const selection of selectedActions) {
    const actionId = selection?.actionId;
    if (typeof actionId !== "string" || !actionId) {
      throw new TurnValidationError("選擇的行動缺少 actionId", { code: "INVALID_ACTION" });
    }
    if (seen.has(actionId)) {
      throw new TurnValidationError(`同一個行動不能在一輪內選兩次：${actionId}`, { code: "DUPLICATE_ACTION" });
    }
    seen.add(actionId);

    // 前端只送 ID，卡片本身一律從伺服器剛產生的那份選單裡取——
    // 這一行就是「前端不能自訂 cost / actionType / 距離結果」的實作。
    const card = menu.find((entry) => entry.id === actionId);
    if (!card) {
      throw new TurnValidationError(`行動不存在或目前不屬於你：${actionId}`, { code: "UNKNOWN_ACTION" });
    }
    const definition = getActionDefinition(card.definitionId);
    if (!definition) {
      throw new TurnValidationError(`行動定義遺失：${card.definitionId}`, { status: 500, code: "CATALOG_MISSING" });
    }

    // 前端送的 targetId 只用來**核對**，不用來覆寫：真正的目標是選單那張卡上的。
    if (selection.targetId != null && card.targetId != null && selection.targetId !== card.targetId) {
      throw new TurnValidationError("選擇的目標與這張行動卡不符", { code: "TARGET_MISMATCH" });
    }

    resolved.push({ card, definition, parameters: selection.parameters ?? {} });
  }

  // 動作額度：一次排完整批，任何一項排不進去就整批拒絕，不做部分扣除
  // （規格第10節「動作額度不足 -> 422，不得部分扣除」）。
  const batch = spendBatch(
    battle.budgets.player,
    resolved.map((item) => ({
      actionType: item.definition.actionType,
      actionId: item.card.id,
      label: item.card.label,
    })),
    { round: battle.round }
  );
  if (!batch.ok) {
    throw new TurnValidationError(batch.reason, {
      code: "INSUFFICIENT_ACTIONS",
      details: { failedActionId: batch.failedActionId, missing: batch.missing },
    });
  }

  const ordered = sortForResolution(resolved);

  // **依實際結算順序判定可用性。** 這是唯一權威的那一次驗證：把已經排在前面的行動
  // 當作 pending 餵回 action generator，用推算後的距離重驗每一張卡。
  // 於是「接近 + 近戰」成立（近戰結算時人已經到了），而「接近 + 射擊」被擋下
  // （射擊結算時人已經貼身了）——兩者在選單上看到的，跟結算時真正發生的，是同一件事。
  for (let i = 0; i < ordered.length; i++) {
    const pending = ordered.slice(0, i).map((item) => ({
      definitionId: item.definition.id,
      targetId: item.card.targetId,
    }));
    const projectedMenu = getAvailableCombatActions({ battle, pending });
    const card = projectedMenu.find((entry) => entry.id === ordered[i].card.id);
    if (!card || !card.available) {
      throw new TurnValidationError(card?.unavailableReason ?? "這個行動目前不可用", {
        code: "ACTION_UNAVAILABLE",
        details: { actionId: ordered[i].card.id, reason: card?.unavailableReason ?? null },
      });
    }
    // 用重驗後的卡片取代原本那張：目標與距離資訊要跟結算當下一致。
    ordered[i] = { ...ordered[i], card };
  }

  return { actions: ordered, budgetAfter: batch.budget };
}

/**
 * deterministic 的結算排序（規格第5.2節末段）：
 * 先依結算相位，同相位依 action ID 字典序。沒有任何一步取決於前端送來的順序。
 */
function sortForResolution(items) {
  return [...items].sort(
    (a, b) =>
      resolutionPhaseIndex(a.definition) - resolutionPhaseIndex(b.definition) ||
      a.card.id.localeCompare(b.card.id)
  );
}

/**
 * 結算一整輪：玩家行動 -> 敵方回合 -> 勝敗判定 -> 進入下一輪。
 *
 * @param {object} battle 內部戰鬥狀態（**會被修改**，呼叫端要負責在失敗時丟棄這份副本）
 * @param {Array<{actionId:string,targetId?:string,parameters?:object}>} selectedActions
 * @returns {{ battle, resolution: { playerActions, enemyActions, stateChanges } }}
 */
export function resolveTurn(battle, selectedActions) {
  const { actions, budgetAfter } = validateSelection(battle, selectedActions);

  battle.phase = BATTLE_PHASES.RESOLVING;
  // 額度在執行任何效果**之前**就以原子方式扣完（規格第5.2節第5點）。
  // 先扣再做，中途任何一個行動失敗都不會退還——那是規則上的失敗，不是系統錯誤。
  battle.budgets.player = budgetAfter;

  const rng = battleRng(battle);
  const playerActions = [];
  const stateChanges = [];

  for (const item of actions) {
    // 每一步之前重新確認目標還在：前面的行動可能已經把牠打倒了
    // （規格第10節「目標已死亡 -> 422，重新產生 action menu」的輪內版本——
    // 這裡不丟錯，因為那個行動的額度已經合法地花掉了，只是打了空氣）。
    if (item.card.targetId) {
      const target = battle.participants.find((p) => p.id === item.card.targetId);
      if (target && target.side === "enemy" && isDown(target)) {
        playerActions.push({
          actionId: item.card.id,
          label: item.card.label,
          ok: false,
          reason: "目標已經倒下",
          publicText: `${item.card.label}沒有意義了，目標已經倒下。`,
          effects: [],
        });
        pushLog(battle, { actor: "player", kind: "info", text: `目標已經倒下，${item.card.label}沒有執行。` });
        continue;
      }
    }

    const outcome = resolveSingleAction({
      battle,
      action: item.card,
      definition: item.definition,
      rng,
      parameters: item.parameters,
    });
    playerActions.push(outcome);
    stateChanges.push(...outcome.effects);
    if (outcome.publicText) {
      pushLog(battle, { actor: "player", kind: outcome.ok ? "action" : "info", text: outcome.publicText });
    }
  }

  commitRng(battle, rng);

  // 玩家行動結束就先判一次勝負：敵人全倒的話不該再讓屍體打一輪。
  let ending = evaluateBattleEnd(battle);
  let enemyActions = [];
  if (!ending.over) {
    battle.phase = BATTLE_PHASES.ENEMY_RESOLUTION;
    const enemyRng = battleRng(battle);
    const enemyResult = resolveEnemyTurn(battle, enemyRng);
    commitRng(battle, enemyRng);
    enemyActions = enemyResult.actions;
    ending = evaluateBattleEnd(battle);
  }

  if (ending.over) {
    finalizeBattle(battle, ending);
    pushLog(battle, {
      actor: "system",
      kind: "result",
      text: ending.winner === "player" ? "戰鬥結束，敵人全部倒下。" : "你倒下了。",
    });
  } else {
    beginNextRound(battle);
  }

  bumpStateVersion(battle);

  return {
    battle,
    resolution: {
      playerActions,
      enemyActions,
      stateChanges,
      outcome: battle.outcome,
    },
  };
}
