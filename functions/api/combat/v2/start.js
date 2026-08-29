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
import { getScenarioPack } from "../../../../content/scenario/registry.js";
import { findActiveNode, getThreatTrack, dischargeThreatOnEncounter } from "../../../../content/scenario/progress.js";
import { THREAT_MAX } from "../../../../content/scenario/threat.js";
import { sceneKeyOf } from "../../../../content/shop/access.js";
import { formsForScene } from "../../../../content/shop/forms.js";
import { battleResponse, detachCharacter, json, loadOwnedSession } from "../../../../content/combat/v2/apiSupport.js";

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

  // 這一場要打誰，由副本進度決定，不是由前端傳什麼決定：
  //   1. 最終戰節點已經是目前活躍節點 -> 打那個節點掛的 bossEncounter
  //   2. 迫近度到頂（接觸）-> 打這個副本自己的追兵樣板 threatEncounter
  //   3. 都不是 -> 內建的佔位遭遇
  //
  // 第 2 點是「迫近度」那條軌道的兌現點：玩家一路失敗把它推到頂之後，如果只是換一段
  // 比較嚇人的文字、開戰卻跳出一隻不相干的「掠奪者」，整條軌道就白做了。
  const scenarioPack = session.scenario ? getScenarioPack(session.scenario.packId) : null;
  const activeNode = scenarioPack ? findActiveNode(scenarioPack, session.scenario.progress) : null;
  const finaleNode = activeNode?.isFinale ? activeNode : null;

  const threatTrack = session.scenario ? getThreatTrack(session.scenario.progress) : null;
  const threatContact = Boolean(threatTrack && threatTrack.level >= THREAT_MAX);
  const threatTemplate = !finaleNode && threatContact ? scenarioPack?.threatEncounter ?? null : null;
  const enemyTemplate = finaleNode?.bossEncounter ?? threatTemplate ?? null;

  // 戰鬥外已經在進行中的型態要跟著進戰鬥，但**先對一次場景鑰匙**：玩家在別的地點變的身
  // 應該在走到這裡之前就已經到期（見 forms.js 的 formsForScene）。跟舊流程同一個判斷。
  const sceneKey = sceneKeyOf(session, getScenarioPack);
  const synced = formsForScene(session.forms, sceneKey);
  session.forms = synced.formsState;

  let battle;
  try {
    battle = startBattleV2({
      character: session.character,
      forms: session.forms,
      sceneKey,
      enemyTemplate,
      encounterLabel: finaleNode ? finaleNode.title : threatTemplate ? "追兵接觸" : undefined,
      battleId: `battle_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      encounterId: enemyTemplate ? `scenario:${scenarioPack?.id ?? "unknown"}` : encounterId,
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
      enemyTemplate: enemyTemplate?.name ?? "(內建佔位遭遇)",
      message: err.message,
    }));
    return json({ ok: false, error: `無法建立戰鬥：${err.message}` }, 400);
  }

  if (finaleNode) battle.scenarioFinaleNodeId = finaleNode.id;

  pushLog(battle, { actor: "system", kind: "round", text: `戰鬥開始：${battle.scene.label}。` });
  if (battle.order[0] !== "player") {
    // 先攻輸掉不代表要先挨一輪打——V2 的敵方回合固定在玩家確認之後執行，
    // 先攻順序影響的是同一輪內誰先結算（見 enemyTurn.js 依 battle.order 處理）。
    pushLog(battle, { actor: "system", kind: "info", text: "敵人取得本輪先手。" });
  } else {
    pushLog(battle, { actor: "system", kind: "info", text: "你取得本輪先手。" });
  }

  // battle.character 是暫時的工作參照，不進存檔（見 apiSupport.attachCharacter 的說明）。
  session.combatV2 = detachCharacter(battle);
  // 開戰＝追蹤結束、正面衝突開始，迫近度回落（見 content/scenario/threat.js 的 dischargeThreat）。
  // 不歸零是刻意的：打完之後追兵還在，玩家不該因為打了一場就回到「它不知道你在哪」。
  // 跟舊流程 /api/combat/start 的同一段是同一個約定。
  if (session.scenario) {
    session.scenario = { ...session.scenario, progress: dischargeThreatOnEncounter(session.scenario.progress) };
  }
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

  // 回應要畫得出玩家的意志力／能量池，所以再掛一次——這一份不會被存回去。
  battle.character = session.character;
  return json(battleResponse(battle, { persistent: store.persistent, character: session.character }));
}
