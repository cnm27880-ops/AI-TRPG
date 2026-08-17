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
import {
  resolvePlayerAttack,
  resolveEnemyAttack,
  isCombatOver,
  resolveFormActivation,
  combatOptions,
} from "../../../content/combat/encounterState.js";
import { appendEvent, EVENT_TYPES } from "../../../core/eventLog.js";
import { getScenarioPack } from "../../../content/scenario/registry.js";
import { completeNodeAndAdvance } from "../../../content/scenario/progress.js";
import { creditNodeReward, settleScenario } from "../../../content/scenario/settlement.js";
import { getDownState } from "../../../content/downState.js";
import { getCurrentUser } from "../../../content/auth/sessionToken.js";
import { canAccessSession } from "../../../content/auth/ownership.js";

export async function onRequestPost(context) {
  const store = resolveSessionStore(context.env ?? {});

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  // action 預設是「攻擊」，讓既有的呼叫端(只傳 weaponKey)行為完全不變。
  // 「型態」是 2026-08-17 補的：在此之前 encounterState.js 的 resolveFormActivation()
  // **沒有任何正式呼叫端**——引擎做得出戰鬥中變身，但沒有任何 API 叫得動它，
  // 於是血統/瞳術那一類商品在戰鬥裡完全按不下去。
  const { sessionId, weaponKey = "unarmed", action = "攻擊", formId } = body ?? {};
  if (!["攻擊", "型態"].includes(action)) {
    return json({ ok: false, error: `action 只能是「攻擊」或「型態」，收到「${action}」` }, 400);
  }
  if (!sessionId) return json({ ok: false, error: "body必須包含 sessionId" }, 400);

  const session = await store.get(sessionId);
  if (!session) return json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404);

  // 存檔歸屬檢查：有主人的存檔只有本人能碰（見 content/auth/ownership.js）。
  // 回 404 而不是 403 是刻意的——告訴對方「這個ID存在但你不能看」等於確認了它的存在。
  if (!canAccessSession(session, await getCurrentUser(context.request, context.env ?? {}))) {
    return json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404);
  }

  const combat = session.combat;
  if (!combat?.active) {
    return json({ ok: false, error: "這場存檔目前沒有進行中的戰鬥，請先呼叫 /api/combat/start" }, 409);
  }
  if (combat.order[combat.turnIndex] !== "player") {
    return json({ ok: false, error: "現在不是玩家的行動順位" }, 409);
  }

  // 變身/開眼：花掉動作額度與意志力/能量池，但**不推進行動順位**——書上這類啟動花的是
  // 移動或標準動作，玩家本輪還可以出手，所以這裡直接回傳，不跑敵人回合。
  if (action === "型態") {
    const activation = resolveFormActivation(combat, session.character, formId);
    if (!activation.ok) {
      // 變不成不是錯誤，是遊戲狀態(意志力不夠、動作用掉了、已經在進行中)，
      // 跟 /api/shop 買不成同一個約定：回 200 並把理由一次列齊。
      return json({ ok: false, blockers: activation.blockers, combat, options: combatOptions(combat, session.character) });
    }
    session.character = activation.character;
    session.combat = combat;
    appendEvent(
      session.log,
      EVENT_TYPES.FORM,
      { event: "啟動", formId, label: activation.form.label, round: combat.round, where: "戰鬥中" },
      { timestamp: new Date().toISOString() }
    );
    await store.put(session);
    return json({
      ok: true,
      persistent: store.persistent,
      combat,
      form: activation.form,
      character: session.character,
      options: combatOptions(combat, session.character),
    });
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

  const combatOver = isCombatOver(combat);

  // [2026-08-16 新增] 玩家倒下時把它寫進事件日誌。
  // 在這之前，「玩家被打死」這件事完全沒有留下任何紀錄：戰鬥面板顯示「戰鬥失利」，
  // 然後 endCombat() 送一句摘要回主迴圈，玩家就用一張死掉的角色卡繼續玩下去。
  // 現在 /api/turn 有傷勢閘門會擋住，但事件日誌本來就該記下這件事——
  // 它同時也是餵給AI的事實記憶，AI必須知道玩家倒下過。
  const playerDown = getDownState(session.character);
  if (combatOver.over && combatOver.winner === "enemy" && !playerDown.canAct) {
    appendEvent(
      session.log,
      EVENT_TYPES.DEATH,
      { cause: `在與${combat.enemy.name}的戰鬥中倒下`, dead: playerDown.dead, unconscious: playerDown.unconscious },
      { timestamp: new Date().toISOString() }
    );
  }

  // 副本最終戰：玩家打贏了 /api/combat/start 標記過的 scenarioFinaleNodeId 時，
  // 自動結算那個節點(扭轉度固定用0級/完全遵循原劇情——戰鬥勝負本身沒有「敘事扭轉度」可言，
  // 那是敘事節點的概念，見 content/scenario/divergence.js 檔頭說明)，
  // 玩家不需要另外靠AI敘事JSON信號才能拿到最終戰獎勵。
  // [2026-08-16 修正] 底下兩層 if 任一失敗時，scenarioResult 會停在 null，
  // 玩家打贏了boss卻沒有XP、沒有節點完成提示、也沒有任何錯誤——跟「沒打贏」長得一模一樣。
  // 現在失敗一律留 log 並把原因帶回前端(scenarioResult.warnings)，不再靜音。
  let scenarioResult = null;
  if (combatOver.over && combatOver.winner === "player" && combat.scenarioFinaleNodeId && session.scenario) {
    const scenarioWarnings = [];
    const pack = getScenarioPack(session.scenario.packId);
    if (!pack) {
      const msg =
        `打贏了最終戰，但存檔記錄的副本「${session.scenario.packId}」找不到對應的內建副本包，` +
        `本次無法結算節點獎勵。`;
      console.error("[SCENARIO_SETTLEMENT_FAILED]", JSON.stringify({
        where: "POST /api/combat/act",
        sessionId,
        packId: session.scenario.packId,
        nodeId: combat.scenarioFinaleNodeId,
        reason: "pack_not_found",
      }));
      scenarioWarnings.push(msg);
    }
    if (pack) {
      const result = completeNodeAndAdvance(pack, session.scenario.progress, combat.scenarioFinaleNodeId, 0);
      if (!result.ok) {
        console.error("[SCENARIO_SETTLEMENT_FAILED]", JSON.stringify({
          where: "POST /api/combat/act",
          sessionId,
          packId: pack.id,
          nodeId: combat.scenarioFinaleNodeId,
          reason: result.error,
        }));
        scenarioWarnings.push(`打贏了最終戰，但節點結算被引擎擋下：${result.error}`);
      }
      if (result.ok) {
        // 最終戰的獎勵跟一般節點一樣是獎勵點數，不是XP(見 content/scenario/settlement.js)
        session.wallet = creditNodeReward(session.wallet, result.reward, result.node.title).wallet;
        let progress = result.progress;
        const ts = new Date().toISOString();
        appendEvent(
          session.log,
          EVENT_TYPES.NODE_COMPLETE,
          { nodeId: result.node.id, title: result.node.title, divergenceTier: 0, reward: result.reward },
          { timestamp: ts }
        );
        appendEvent(
          session.log,
          EVENT_TYPES.POINTS_GRANT,
          { total: result.reward, reason: `擊敗最終戰「${result.node.title}」` },
          { timestamp: ts }
        );

        // 最終戰打完通常就是通關，所以結算也要在這條路徑上跑一次——
        // 不然玩家打贏之後如果沒有再送出任何一輪敘事，XP 就永遠不會入帳。
        const settlement = settleScenario(pack, progress, session.character, session.wallet);
        if (settlement.settled) {
          session.wallet = settlement.wallet;
          progress = settlement.progress;
          appendEvent(
            session.log,
            EVENT_TYPES.XP_GRANT,
            { total: settlement.xp, reason: `副本「${pack.briefing?.title ?? pack.id}」通關結算`, breakdown: settlement.breakdown },
            { timestamp: ts }
          );
          scenarioWarnings.push(`副本通關結算：獲得 ${settlement.xp} XP。回到主神空間，商店已開放。`);
        }

        session.scenario = { packId: pack.id, progress };
        scenarioResult = { nodeCompleted: { nodeId: result.node.id, title: result.node.title, reward: result.reward } };
      }
    }

    if (scenarioWarnings.length) {
      scenarioResult = { ...(scenarioResult ?? { nodeCompleted: null }), warnings: scenarioWarnings };
    }
  }

  session.combat = combat;
  // 收兵：戰鬥中的型態狀態帶回戰鬥外那一份。以「輪」計時的已經在 finalizeIfOver() 收掉了
  // (戰鬥外沒有輪可以數)，剩下的是以「場景」計時的——打一場架不會改變你站在哪裡，
  // 所以它們要繼續有效，直到玩家離開這個地點。沒有這一行，戰鬥中變的身會在收兵時消失。
  if (!combat.active) session.forms = combat.forms;
  await store.put(session);

  return json({
    ok: true,
    persistent: store.persistent,
    combat,
    options: combatOptions(combat, session.character),
    playerAttack,
    enemyAttack,
    combatOver,
    character: session.character,
    scenario: scenarioResult,
    downState: playerDown,
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
