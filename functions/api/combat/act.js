// Cloudflare Pages Function —— 戰鬥中的一次玩家行動（目前只有「攻擊」）。
// 路由：POST /api/combat/act { sessionId, weaponKey }
//
// 一次呼叫做完「玩家攻擊 -> 若戰鬥未結束，敵人立刻反擊」，因為這是單敵人回合制、
// 敵人沒有任何戰術選擇（固定用配備的唯一武器攻擊），沒有必要為了敵人的行動再往返一次
// 前後端——敵人的「決策」本來就是常數，不是要不要用AI決定的問題（AI不做算術，這裡
// 連算術都不需要AI介入判斷要不要打）。
//
// 玩家受到的傷害（combat.player.hpState）打完這次行動後會同步回
// session.character.derived.hp，讓角色面板跟戰鬥面板看到的血量隨時一致。

import { resolveSessionStore } from "../../../content/storage/sessionStore.js";
import { resolvePlayerAttack, resolveEnemyAttack, isCombatOver } from "../../../content/combat/encounterState.js";
import { appendEvent, EVENT_TYPES } from "../../../core/eventLog.js";

export async function onRequestPost(context) {
  const store = resolveSessionStore(context.env ?? {});

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const { sessionId, weaponKey = "unarmed" } = body ?? {};
  if (!sessionId) return json({ ok: false, error: "body必須包含 sessionId" }, 400);

  const session = await store.get(sessionId);
  if (!session) return json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404);

  const combat = session.combat;
  if (!combat?.active) {
    return json({ ok: false, error: "這場存檔目前沒有進行中的戰鬥，請先呼叫 /api/combat/start" }, 409);
  }
  if (combat.order[combat.turnIndex] !== "player") {
    return json({ ok: false, error: "現在不是玩家的行動順位" }, 409);
  }

  let playerAttack;
  try {
    playerAttack = resolvePlayerAttack(combat, session.character, weaponKey).result;
  } catch (err) {
    return json({ ok: false, error: err.message }, 400);
  }

  appendEvent(session.log, EVENT_TYPES.COMBAT_ACTION, {
    actor: "player",
    weaponKey,
    hit: playerAttack.hit,
    damage: playerAttack.finalDamage ?? 0,
  });

  let enemyAttack = null;
  if (combat.active && combat.order[combat.turnIndex] === "enemy") {
    enemyAttack = resolveEnemyAttack(combat, session.character).result;
    session.character.derived.hp = { ...combat.player.hpState };

    appendEvent(session.log, EVENT_TYPES.COMBAT_ACTION, {
      actor: "enemy",
      weaponKey: combat.enemy.weaponKey,
      hit: enemyAttack.hit,
      damage: enemyAttack.finalDamage ?? 0,
    });
  }

  // 保險同步：不管是哪一步讓戰鬥結束的，都確保角色卡血量反映combat.player.hpState最終結果。
  session.character.derived.hp = { ...combat.player.hpState };

  session.combat = combat;
  await store.put(session);

  return json({
    ok: true,
    persistent: store.persistent,
    combat,
    playerAttack,
    enemyAttack,
    combatOver: isCombatOver(combat),
    character: session.character,
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
