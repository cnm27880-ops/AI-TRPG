// Cloudflare Pages Function —— 開始一場戰鬥遭遇。
// 路由：POST /api/combat/start { sessionId }
//
// 目前只支援單敵人（見 content/combat/encounterState.js 的範圍限制），敵人資料固定用
// content/combat/placeholderEncounters.js 的臨時佔位資料——之後接上真實怪物型錄時，
// 這裡會改成接受一個 encounterId 之類的參數去查表，UI/呼叫端的介面不用變。
//
// 角色卡一律以存檔為準（跟 /api/turn 同一個原則），不接受前端直接塞一張角色卡進來開戰。

import { resolveSessionStore } from "../../../content/storage/sessionStore.js";
import { createEncounter, resolveLeadingEnemyTurns } from "../../../content/combat/encounterState.js";
import { appendEvent, EVENT_TYPES } from "../../../core/eventLog.js";
import { getScenarioPack } from "../../../content/scenario/registry.js";
import { findActiveNode } from "../../../content/scenario/progress.js";
import { getDownState } from "../../../content/downState.js";

export async function onRequestPost(context) {
  const store = resolveSessionStore(context.env ?? {});

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const { sessionId } = body ?? {};
  if (!sessionId) return json({ ok: false, error: "body必須包含 sessionId" }, 400);

  const session = await store.get(sessionId);
  if (!session) return json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404);

  if (session.combat?.active) {
    return json({ ok: false, error: "這場存檔已經有進行中的戰鬥，請先結束才能開始新的" }, 409);
  }

  // 昏迷/死亡的角色不能開新戰鬥（跟 /api/turn 的傷勢閘門同一個原則）。
  const downState = getDownState(session.character);
  if (!downState.canAct) {
    return json({ ok: false, error: downState.reason, downState }, 409);
  }

  // 副本的最終戰節點若已經是目前活躍節點，改用它掛的 bossEncounter 樣板，
  // 而不是預設的雜魚——玩家推進到最終戰後隨時按「遭遇戰鬥」都是打這場戰。
  // combat.scenarioFinaleNodeId 讓 /api/combat/act 知道這場戰打贏後要順便結算哪個節點。
  const scenarioPack = session.scenario ? getScenarioPack(session.scenario.packId) : null;
  const activeNode = scenarioPack ? findActiveNode(scenarioPack, session.scenario.progress) : null;
  const finaleNode = activeNode?.isFinale ? activeNode : null;

  // 敵人樣板有問題(例如 weaponKey 不在武器型錄裡)時，這裡會丟錯。要接住並回成一個
  // 看得懂的 400，否則 Pages Functions 會回一個沒有內容的 500，前端只能顯示「連線失敗」，
  // 而真正的原因(某個boss樣板打錯字)完全不會出現在任何地方。
  let combat;
  let openingEnemyAttacks;
  try {
    combat = createEncounter(session.character, finaleNode?.bossEncounter);
    if (finaleNode) combat.scenarioFinaleNodeId = finaleNode.id;

    // 敵人若贏得先攻，開戰當下就先把敵人的開場攻擊解決掉，玩家才有機會行動（見
    // content/combat/encounterState.js 的 resolveLeadingEnemyTurns 說明）。
    openingEnemyAttacks = resolveLeadingEnemyTurns(combat, session.character);
  } catch (err) {
    console.error("[COMBAT_START_FAILED]", JSON.stringify({
      where: "POST /api/combat/start",
      sessionId,
      enemyTemplate: finaleNode?.bossEncounter?.name ?? "(預設佔位敵人)",
      message: err.message,
    }));
    return json({ ok: false, error: `無法建立戰鬥遭遇：${err.message}` }, 400);
  }
  for (const atk of openingEnemyAttacks) {
    appendEvent(session.log, EVENT_TYPES.COMBAT_ACTION, {
      actor: "enemy",
      weaponKey: combat.enemy.weaponKey,
      hit: atk.hit,
      damage: atk.finalDamage ?? 0,
    });
  }
  if (openingEnemyAttacks.length) {
    session.character.derived.hp = { ...combat.player.hpState };
  }

  session.combat = combat;
  await store.put(session);

  return json({ ok: true, persistent: store.persistent, combat, openingEnemyAttacks, character: session.character });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
