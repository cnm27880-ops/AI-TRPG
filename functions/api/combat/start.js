// Cloudflare Pages Function —— 開始一場戰鬥遭遇。
// 路由：POST /api/combat/start { sessionId }
//
// 目前只支援單敵人（見 content/combat/encounterState.js 的範圍限制），敵人資料固定用
// content/combat/placeholderEncounters.js 的臨時佔位資料——之後接上真實怪物型錄時，
// 這裡會改成接受一個 encounterId 之類的參數去查表，UI/呼叫端的介面不用變。
//
// 角色卡一律以存檔為準（跟 /api/turn 同一個原則），不接受前端直接塞一張角色卡進來開戰。

import { resolveSessionStore, SessionConflictError } from "../../../content/storage/sessionStore.js";
import { createEncounter, resolveLeadingEnemyTurns, combatOptions } from "../../../content/combat/encounterState.js";
import { appendEvent, EVENT_TYPES } from "../../../core/eventLog.js";
import { getScenarioPack } from "../../../content/scenario/registry.js";
import {
  findActiveNode,
  getThreatTrack,
  dischargeThreatOnEncounter,
} from "../../../content/scenario/progress.js";
import { THREAT_MAX } from "../../../content/scenario/threat.js";
import { getDownState } from "../../../content/downState.js";
import { getCurrentUser } from "../../../content/auth/sessionToken.js";
import { canAccessSession } from "../../../content/auth/ownership.js";
import { sceneKeyOf } from "../../../content/shop/access.js";
import { formsForScene } from "../../../content/shop/forms.js";

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

  // 存檔歸屬檢查：有主人的存檔只有本人能碰（見 content/auth/ownership.js）。
  // 回 404 而不是 403 是刻意的——告訴對方「這個ID存在但你不能看」等於確認了它的存在。
  if (!canAccessSession(session, await getCurrentUser(context.request, context.env ?? {}))) {
    return json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404);
  }

  const expectedRev = session.rev ?? 0;

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

  // 迫近度到頂(接觸)時開的戰鬥，打的是這個副本自己的追兵樣板(scenarioPack.threatEncounter)，
  // 不是 content/combat/placeholderEncounters.js 的通用雜魚。
  //
  // 這一段是「迫近度」這條軌道的兌現點：玩家一路失敗把它推到頂之後，如果那只是換一段
  // 比較嚇人的文字、按下遭遇戰鬥卻跳出一隻不相干的「掠奪者」，整條軌道就白做了——
  // 世界觀當場穿幫，玩家也學不到「失敗會累積」這件事。追不到 threatEncounter 的副本包
  // (例如舊的 echoInstitute)行為完全不變，照樣用預設樣板。
  const threatTrack = session.scenario ? getThreatTrack(session.scenario.progress) : null;
  const threatContact = Boolean(threatTrack && threatTrack.level >= THREAT_MAX);
  const threatTemplate = !finaleNode && threatContact ? scenarioPack?.threatEncounter ?? null : null;

  // 敵人樣板有問題(例如 weaponKey 不在武器型錄裡)時，這裡會丟錯。要接住並回成一個
  // 看得懂的 400，否則 Pages Functions 會回一個沒有內容的 500，前端只能顯示「連線失敗」，
  // 而真正的原因(某個boss樣板打錯字)完全不會出現在任何地方。
  let combat;
  let openingEnemyAttacks;
  try {
    // 戰鬥外已經在進行中的型態要跟著進戰鬥。**先對一次場景鑰匙**：如果玩家是在別的
    // 地點變的身，走到這裡才開打，那個型態應該在開戰前就已經到期(見 forms.js 的
    // formsForScene)。在這一行出現之前，開戰一律從一份空的型態狀態開始——
    // 戰鬥外變好身再進戰鬥，變身會在開戰的瞬間無聲消失。
    const synced = formsForScene(session.forms, sceneKeyOf(session, getScenarioPack));
    session.forms = synced.formsState;
    combat = createEncounter(session.character, finaleNode?.bossEncounter ?? threatTemplate ?? undefined, {
      forms: session.forms,
    });
    if (finaleNode) combat.scenarioFinaleNodeId = finaleNode.id;

    // 敵人若贏得先攻，開戰當下就先把敵人的開場攻擊解決掉，玩家才有機會行動（見
    // content/combat/encounterState.js 的 resolveLeadingEnemyTurns 說明）。
    const leading = resolveLeadingEnemyTurns(combat, session.character);
    openingEnemyAttacks = leading.results;
    // 開場的敵人回合也可能跨輪(多參戰單位時)，跨輪就會收維持成本，所以角色卡要接回來。
    session.character = leading.character;
  } catch (err) {
    console.error("[COMBAT_START_FAILED]", JSON.stringify({
      where: "POST /api/combat/start",
      sessionId,
      enemyTemplate: finaleNode?.bossEncounter?.name ?? threatTemplate?.name ?? "(預設佔位敵人)",
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
    }, { timestamp: new Date().toISOString(), scenarioId: session.scenario?.packId ?? null, turn: (session.turns ?? 0) + 1 });
  }
  if (openingEnemyAttacks.length) {
    session.character.derived.hp = { ...combat.player.hpState };
  }

  session.combat = combat;
  // 開戰＝追蹤結束、正面衝突開始，迫近度回落（見 content/scenario/threat.js 的 dischargeThreat）。
  // 不歸零是刻意的：這艘船上就這一隻，打完之後它還在，玩家不該因為打了一場就回到「它不知道你在哪」。
  if (session.scenario) {
    session.scenario = { ...session.scenario, progress: dischargeThreatOnEncounter(session.scenario.progress) };
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
    ok: true,
    persistent: store.persistent,
    combat,
    openingEnemyAttacks,
    character: session.character,
    // 這一輪按得下去的東西由引擎算(買到的武器＋身上的型態)，前端只負責畫。
    options: combatOptions(combat, session.character),
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
