// Cloudflare Pages Function —— Combat V2：驗證或結算玩家這一輪的選擇（規格第8.3節）。
// 路由：POST /api/combat/v2/turn
//   { sessionId, battleId, stateVersion, requestId, selectedActions:[{actionId,targetId,parameters}], preview? }
//
// 兩種模式共用同一段驗證程式碼：
//   preview:true   只驗證、只回推算後的選單，**不改任何狀態**（規格第5.1節第8點、
//                  第7.2節第4點：玩家每改一次選擇，要重新向 server 取得最新 action state）
//   preview:false  真的結算整輪（玩家行動 -> 敵方回合 -> 勝敗判定）
//
// 伺服器**重新驗證所有內容**。前端送上來的 actionId / targetId / parameters 以外的欄位
// 一律不讀——沒有任何一行程式碼會去看 payload 裡的 cost、actionType、distance、
// hit、damage、roll（規格第6.3節、第11.4節）。

import { resolveSessionStore, SessionConflictError } from "../../../../content/storage/sessionStore.js";
import { resolveTurn, validateSelection, TurnValidationError } from "../../../../core/combat/v2/resolveTurn.js";
import { getAvailableCombatActions } from "../../../../core/combat/v2/availableActions.js";
import { buildNarrationContext, toPublicBattle } from "../../../../core/combat/v2/publicState.js";
import { publicBudget } from "../../../../core/combat/v2/actionBudget.js";
import { appendEvent, EVENT_TYPES } from "../../../../core/eventLog.js";
import {
  battleResponse,
  findRequestRecord,
  json,
  loadOwnedSession,
  rememberRequest,
  stateVersionConflict,
  syncPlayerHp,
} from "../../../../content/combat/v2/apiSupport.js";

export async function onRequestPost(context) {
  const store = resolveSessionStore(context.env ?? {});

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const {
    sessionId,
    battleId = null,
    stateVersion,
    requestId = null,
    selectedActions = [],
    preview = false,
  } = body ?? {};

  const loaded = await loadOwnedSession(context, store, sessionId);
  if (!loaded.ok) return loaded.response;
  const session = loaded.session;
  const expectedRev = session.rev ?? 0;
  const battle = session.combatV2;

  if (!battle) {
    return json({ ok: false, code: "NO_BATTLE", error: "這場存檔目前沒有 Combat V2 戰鬥。" }, 409);
  }
  if (battleId && battle.battleId !== battleId) {
    return json({ ok: false, code: "BATTLE_MISMATCH", error: "這個 battleId 不是目前進行中的戰鬥。" }, 409);
  }
  if (!battle.active) {
    // 戰鬥已結束後重送不得改變狀態（規格第10節）。回最新狀態讓前端能收尾。
    return json(
      { ok: false, code: "BATTLE_ENDED", error: "戰鬥已經結束。", battle: toPublicBattle(battle) },
      409
    );
  }

  // 冪等：同一個 requestId 重送直接回原本的結果，不再結算一次
  // （規格第8.4節第2點、第11.4節第5、7點——「結算途中重複按下確認」走的就是這一條）。
  const replay = findRequestRecord(battle, requestId);
  if (replay && !preview) {
    return json({
      ...battleResponse(battle, { persistent: store.persistent, character: session.character }),
      replayed: true,
      resolution: replay.resolution,
    });
  }

  const conflict = stateVersionConflict(battle, stateVersion);
  if (conflict) return conflict;

  // --- 預覽模式：只驗證，不動任何狀態 ---
  if (preview) {
    try {
      const { actions, budgetAfter } = validateSelection(battle, selectedActions);
      return json({
        ok: true,
        valid: true,
        stateVersion: battle.stateVersion,
        // 扣掉這些選擇之後的額度與選單，讓前端把「還剩什麼、什麼被鎖住」畫對。
        playerActionBudget: publicBudget(budgetAfter),
        availableActions: getAvailableCombatActions({
          battle,
          budgetOverride: budgetAfter,
          pending: actions.map((item) => ({ definitionId: item.definition.id, targetId: item.card.targetId })),
        }),
        plannedOrder: actions.map((item) => ({ actionId: item.card.id, label: item.card.label })),
      });
    } catch (err) {
      if (err instanceof TurnValidationError) {
        return json({ ok: true, valid: false, code: err.code, error: err.message, details: err.details });
      }
      throw err;
    }
  }

  // --- 結算 ---
  // 在**副本**上結算：驗證失敗時丟掉整份副本，存檔一個字都沒動
  // （規格第10節：不得部分扣除、不改變狀態）。
  const working = structuredClone(battle);
  let result;
  try {
    result = resolveTurn(working, selectedActions);
  } catch (err) {
    if (err instanceof TurnValidationError) {
      return json(
        {
          ok: false,
          code: err.code,
          error: err.message,
          details: err.details,
          battle: toPublicBattle(battle),
        },
        err.status
      );
    }
    console.error("[COMBAT_V2_RESOLVE_FAILED]", JSON.stringify({
      where: "POST /api/combat/v2/turn",
      sessionId,
      battleId: battle.battleId,
      round: battle.round,
      message: err.message,
    }));
    // 敵方 AI 或結算途中的非預期錯誤：保留原本狀態（規格第10節最後幾列），
    // 不重複扣除玩家資源，也不留下半套戰鬥。
    return json({ ok: false, code: "RESOLUTION_ERROR", error: "戰鬥結算發生錯誤，狀態未改變。", battle: toPublicBattle(battle) }, 500);
  }

  rememberRequest(working, requestId, result.resolution);
  session.combatV2 = working;
  syncPlayerHp(session, working);

  for (const action of result.resolution.playerActions) {
    appendEvent(
      session.log,
      EVENT_TYPES.COMBAT_ACTION,
      { engine: "combat-v2", actor: "player", action: action.definitionId ?? action.actionId, ok: action.ok, round: working.round },
      { timestamp: new Date().toISOString(), scenarioId: session.scenario?.packId ?? null, turn: (session.turns ?? 0) + 1 }
    );
  }

  try {
    await store.put(session, { expectedRev });
  } catch (err) {
    if (err instanceof SessionConflictError) {
      return json({ ok: false, code: "SESSION_CONFLICT", error: "這份存檔剛被另一個請求更新，請重新整理後再試一次。" }, 409);
    }
    throw err;
  }

  return json({
    ...battleResponse(working, { persistent: store.persistent, character: session.character }),
    resolution: result.resolution,
    // 給敘事層的公開摘要。它只含已裁定的結果，LLM 拿不到任何可以改的數字（規格第9節）。
    narrationContext: buildNarrationContext(working, result.resolution),
  });
}
