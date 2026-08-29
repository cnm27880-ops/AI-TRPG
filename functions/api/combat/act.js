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

import { resolveSessionStore, SessionConflictError } from "../../../content/storage/sessionStore.js";
import {
  resolvePlayerAttack,
  resolveEnemyAttack,
  isCombatOver,
  resolveFormActivation,
  combatOptions,
} from "../../../content/combat/encounterState.js";
import { appendEvent, EVENT_TYPES } from "../../../core/eventLog.js";
import { buildCombatNarrationPrompt } from "../../../content/gemini/promptContract.js";
import { settleFinaleVictory } from "../../../content/combat/finaleSettlement.js";
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
  // amount／mode 是 2026-08-17 第九輪補的：可變量型態要玩家報一個支付點數
  // (「支付最多不超過自身敏捷或感知取低/點劍氣」)，二選一的型態要玩家選一種。
  // 兩個都只在 action==="型態" 時有意義，範圍與合法值由引擎驗(見 forms.js 的 activateForm)。
  const { sessionId, weaponKey = "unarmed", action = "攻擊", formId, amount = null, mode = null } = body ?? {};
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

  const expectedRev = session.rev ?? 0;
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
    const activation = resolveFormActivation(combat, session.character, formId, { amount, mode });
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
      {
        event: "啟動",
        formId,
        label: activation.form.label,
        round: combat.round,
        where: "戰鬥中",
        paid: activation.form.paid ?? null,
        mode: activation.form.mode?.key ?? null,
      },
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
    return json({
      ok: true,
      persistent: store.persistent,
      combat,
      form: activation.form,
      character: session.character,
      options: combatOptions(combat, session.character),
    });
  }

  // 維持成本會在跨輪的時候扣掉能量池/意志力，扣完的角色卡由攻擊函式回傳——
  // 沒有接住它的話，維持成本會每輪都「扣了但沒扣」，型態就變成免費的。
  // 這一段記下的 logMark 是為了把這次跨輪發生的型態事件挑出來回給前端(見 formEvents)。
  const logMark = combat.log.length;

  let playerAttack;
  try {
    const attack = resolvePlayerAttack(combat, session.character, weaponKey);
    playerAttack = attack.result;
    session.character = attack.character;
  } catch (err) {
    return json({ ok: false, error: err.message }, 400);
  }

  // 這一輪敵人的意圖預告在玩家出手之前就已經抽好了（見 encounterState.js 的 advanceTurn）。
  // 先抓下來：底下組敘事 prompt 時要用它當背景，而 combat.currentTelegraph 在敵人反擊
  // 跨到下一輪時就會被換成新的一句。
  const telegraphThisRound = combat.currentTelegraph ?? null;

  appendEvent(session.log, EVENT_TYPES.COMBAT_ACTION, {
    actor: "player",
    weaponKey,
    hit: playerAttack.hit,
    damage: playerAttack.finalDamage ?? 0,
    // 傷害嚴重度標籤：事件日誌是餵給AI的事實記憶，戰後那一輪的敘事要寫得出
    // 「打斷了牠的哪隻手」就得靠它（見 core/combat/resolveCombatAction.js）。
    damageSeverityTag: playerAttack.damageSeverityTag ?? null,
  }, { timestamp: new Date().toISOString(), scenarioId: session.scenario?.packId ?? null, turn: (session.turns ?? 0) + 1 });

  let enemyAttack = null;
  if (combat.active && combat.order[combat.turnIndex] === "enemy") {
    const attack = resolveEnemyAttack(combat, session.character);
    enemyAttack = attack.result;
    session.character = attack.character;
    session.character.derived.hp = { ...combat.player.hpState };

    appendEvent(session.log, EVENT_TYPES.COMBAT_ACTION, {
      actor: "enemy",
      weaponKey: combat.enemy.weaponKey,
      hit: enemyAttack.hit,
      damage: enemyAttack.finalDamage ?? 0,
      damageSeverityTag: enemyAttack.damageSeverityTag ?? null,
    }, { timestamp: new Date().toISOString(), scenarioId: session.scenario?.packId ?? null, turn: (session.turns ?? 0) + 1 });
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
      { timestamp: new Date().toISOString(), scenarioId: session.scenario?.packId ?? null, turn: (session.turns ?? 0) + 1 }
    );
  }

  // 副本最終戰：玩家打贏了 /api/combat/start 標記過的 scenarioFinaleNodeId 時，
  // 自動結算那個節點，玩家不需要另外靠AI敘事JSON信號才能拿到最終戰獎勵。
  //
  // [2026-08-29] 這一段原本整個寫在這裡，現在抽到 content/combat/finaleSettlement.js，
  // 因為 Combat V2 需要一模一樣的行為，而這件事跟哪一套戰鬥引擎算出勝負完全無關。
  // 行為一個字都沒有改——包含所有「不靜音」的分支，見該檔案的檔頭說明。
  const scenarioResult =
    combatOver.over && combatOver.winner === "player"
      ? settleFinaleVictory({
          session,
          finaleNodeId: combat.scenarioFinaleNodeId,
          sessionId,
          where: "POST /api/combat/act",
        })
      : null;

  session.combat = combat;
  // 收兵：戰鬥中的型態狀態帶回戰鬥外那一份。以「輪」計時的已經在 finalizeIfOver() 收掉了
  // (戰鬥外沒有輪可以數)，剩下的是以「場景」計時的——打一場架不會改變你站在哪裡，
  // 所以它們要繼續有效，直到玩家離開這個地點。沒有這一行，戰鬥中變的身會在收兵時消失。
  if (!combat.active) session.forms = combat.forms;
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
    options: combatOptions(combat, session.character),
    playerAttack,
    enemyAttack,
    // 這一輪的意圖預告（玩家出手前抽的那一句）與下一輪的預告。前端把後者顯示在畫面上，
    // 玩家在按下一次攻擊之前就看得到敵人正在做什麼（見 Phase 5.3 任務5）。
    telegraph: telegraphThisRound,
    nextTelegraph: combat.currentTelegraph ?? null,
    // 這一輪要餵給AI的戰鬥敘事指令（含傷害嚴重度標籤與意圖預告）。
    // 引擎組好給呼叫端用，不讓每個呼叫端各自拼一次（見 Phase 5.3 任務4）。
    narrationPrompts: [
      buildCombatNarrationPrompt({
        attackerLabel: "你",
        targetLabel: combat.enemy.name,
        weaponLabel: weaponKey,
        hit: playerAttack.hit,
        damage: playerAttack.finalDamage ?? 0,
        damageSeverityTag: playerAttack.damageSeverityTag,
        round: combat.round,
      }),
      ...(enemyAttack
        ? [
            buildCombatNarrationPrompt({
              attackerLabel: combat.enemy.name,
              targetLabel: "你",
              weaponLabel: combat.enemy.weaponKey,
              hit: enemyAttack.hit,
              damage: enemyAttack.finalDamage ?? 0,
              damageSeverityTag: enemyAttack.damageSeverityTag,
              telegraph: telegraphThisRound,
              round: combat.round,
            }),
          ]
        : []),
    ],
    // 這次行動跨輪時發生的型態事件(付了維持成本、或付不出來而斷氣)。
    // 不回給前端的話，玩家會看到防御突然變低卻沒有任何訊息——那正是本專案一再抓到的
    // 「引擎做了事但畫面上不存在」，只是這次是反過來：引擎收走了東西。
    formEvents: combat.log
      .slice(logMark)
      .filter((e) => e.event === "型態維持" || e.event === "型態到期")
      .map((e) => ({ event: e.event, label: e.label, round: e.round, reason: e.reason ?? null })),
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
