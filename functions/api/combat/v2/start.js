// Cloudflare Pages Function —— Combat V2：開始一場戰鬥（規格第8.1節）。
// 路由：POST /api/combat/v2/start { sessionId, encounterId?, requestId? }
//
// 跟舊的 /api/combat/start 是**兩條互不相干的線**：這一條寫 session.combatV2，
// 舊的寫 session.combat。兩者不會互相覆蓋，也不共用任何狀態機
// （隔離說明見 core/combat/V2_ISOLATION.md）。

import { resolveSessionStore, SessionConflictError } from "../../../../content/storage/sessionStore.js";
import { startBattleV2 } from "../../../../content/combat/v2/battleFactory.js";
import { getDownState } from "../../../../content/downState.js";
import { appendEvent, EVENT_TYPES } from "../../../../core/eventLog.js";
import { pushLog } from "../../../../core/combat/v2/battleState.js";
import { battleResponse, json, loadOwnedSession } from "../../../../content/combat/v2/apiSupport.js";

export async function onRequestPost(context) {
  const store = resolveSessionStore(context.env ?? {});

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const { sessionId, encounterId = null, seed = null } = body ?? {};
  const loaded = await loadOwnedSession(context, store, sessionId);
  if (!loaded.ok) return loaded.response;
  const session = loaded.session;
  const expectedRev = session.rev ?? 0;

  if (session.combatV2?.active) {
    return json(
      { ok: false, code: "BATTLE_IN_PROGRESS", error: "這場存檔已經有進行中的戰鬥。", battle: undefined },
      409
    );
  }

  // 昏迷/死亡的角色不能開新戰鬥（跟 /api/turn 的傷勢閘門同一個原則）。
  const downState = getDownState(session.character);
  if (!downState.canAct) {
    return json({ ok: false, code: "PLAYER_DOWN", error: downState.reason, downState }, 409);
  }

  let battle;
  try {
    battle = startBattleV2({
      character: session.character,
      battleId: `battle_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      encounterId,
      forms: session.forms,
      // seed 只在測試/開發環境接受。正式環境傳進來也只影響**這一場**的骰序，
      // 而且 seed 從不出現在任何回應裡（見 publicState.js 的白名單），
      // 所以玩家沒有辦法用它預測後續結果。
      ...(Number.isInteger(seed) ? { seed } : {}),
    });
  } catch (err) {
    console.error("[COMBAT_V2_START_FAILED]", JSON.stringify({
      where: "POST /api/combat/v2/start",
      sessionId,
      encounterId,
      message: err.message,
    }));
    return json({ ok: false, error: `無法建立戰鬥：${err.message}` }, 400);
  }

  pushLog(battle, { actor: "system", kind: "round", text: `戰鬥開始：${battle.scene.label}。` });
  if (battle.order[0] !== "player") {
    // 先攻輸掉不代表要先挨一輪打——V2 的敵方回合固定在玩家確認之後執行，
    // 先攻順序影響的是同一輪內誰先結算（見 enemyTurn.js 依 battle.order 處理）。
    pushLog(battle, { actor: "system", kind: "info", text: "敵人取得本輪先手。" });
  } else {
    pushLog(battle, { actor: "system", kind: "info", text: "你取得本輪先手。" });
  }

  session.combatV2 = battle;
  appendEvent(
    session.log,
    EVENT_TYPES.COMBAT_ACTION,
    { engine: "combat-v2", event: "戰鬥開始", encounterId: battle.encounterId, scene: battle.scene.id },
    { timestamp: new Date().toISOString(), scenarioId: session.scenario?.packId ?? null, turn: (session.turns ?? 0) + 1 }
  );

  try {
    await store.put(session, { expectedRev });
  } catch (err) {
    if (err instanceof SessionConflictError) {
      return json({ ok: false, code: "SESSION_CONFLICT", error: "這份存檔剛被另一個請求更新，請重新整理後再試一次。" }, 409);
    }
    throw err;
  }

  return json(battleResponse(battle, { persistent: store.persistent, character: session.character }));
}
