// Cloudflare Pages Function —— 角色死亡後的復活。
// 路由：GET /api/revive?id=xxx（查詢這次復活要多少、還剩幾次機會）
//       POST /api/revive { sessionId }（實際執行）
//
// 為什麼需要這個端點（2026-08-16）：/api/turn 新增了傷勢閘門，角色死亡就不能再行動。
// 沒有復活路徑的話，那個閘門只是把「靜靜地用死角色繼續玩」換成「靜靜地卡死」，
// 兩種都不能接受。規則書本來就給每個角色兩次復活機會（core/deathAndRevival.js
// 有完整實作與書中出處），這裡只是把它接上實際流程。
//
// 規則一律由 core/deathAndRevival.js 決定，這個檔案不自己判斷任何條件：
// 能不能復活、要多少錢、是不是真死，全部照那個模組的回傳值走。

import { resolveSessionStore, SessionConflictError } from "../../content/storage/sessionStore.js";
import { getDownState, revivalQuote, reviveCharacter } from "../../content/downState.js";
import { appendEvent, EVENT_TYPES } from "../../core/eventLog.js";
import { getCurrentUser } from "../../content/auth/sessionToken.js";
import { canAccessSession } from "../../content/auth/ownership.js";
import { endScene } from "../../content/shop/forms.js";

export async function onRequestGet(context) {
  const store = resolveSessionStore(context.env ?? {});
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "必須指定 id" }, 400);

  const session = await store.get(id);
  if (!session) return json({ ok: false, error: `找不到存檔 ${id}` }, 404);
  if (!canAccessSession(session, await getCurrentUser(context.request, context.env ?? {}))) {
    return json({ ok: false, error: `找不到存檔 ${id}` }, 404);
  }

  return json({
    ok: true,
    persistent: store.persistent,
    downState: getDownState(session.character),
    revival: revivalQuote(session.character),
  });
}

export async function onRequestPost(context) {
  const store = resolveSessionStore(context.env ?? {});

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const { sessionId, requestId: rawRequestId } = body ?? {};
  if (!sessionId) return json({ ok: false, error: "body必須包含 sessionId" }, 400);
  const requestId = typeof rawRequestId === "string" ? rawRequestId.trim().slice(0, 160) : "";

  const session = await store.get(sessionId);
  if (!session) return json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404);
  if (!canAccessSession(session, await getCurrentUser(context.request, context.env ?? {}))) {
    return json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404);
  }
  // response 遺失時前端會用同一 requestId 重送；回放已保存的結果，不能再扣一次
  // 復活費用或再消耗一次復活次數(見 core/deathAndRevival.js 的 MAX_REVIVALS)。
  if (requestId && session.reviveReplay?.requestId === requestId) {
    return json({ ...session.reviveReplay.response, replayed: true });
  }
  const expectedRev = session.rev ?? 0;

  const result = reviveCharacter(session.character);
  if (!result.ok) {
    // 「湊不出費用」跟「復活次數用完(真死)」對玩家是兩件不同的事，permaDeath 要照實帶出去，
    // 前端才能決定要顯示「再去賺點數」還是「這張卡結束了，請重新創角」。
    return json(
      {
        ok: false,
        error: result.reason,
        permaDeath: result.permaDeath,
        downState: getDownState(session.character),
        revival: revivalQuote(session.character),
      },
      409
    );
  }

  // 用 REVIVAL 事件而不是負數的 XP_GRANT：後者在日誌摘要裡會變成「獲得 -N 點經驗值」，
  // 而那段摘要是要餵給AI當事實記憶的（見 core/eventLog.js 的 journalSummary），
  // 讓AI讀到「獲得負經驗」只會製造混淆。REVIVAL 本來就有對應的摘要格式。
  appendEvent(
    session.log,
    EVENT_TYPES.REVIVAL,
    { cost: result.cost, reviveCount: result.reviveCount },
    { timestamp: new Date().toISOString(), scenarioId: session.scenario?.packId ?? null, turn: (session.turns ?? 0) + 1 }
  );

  // 復活後那場戰鬥不該還留著：玩家是在戰鬥裡被打死的，戰鬥已經分出勝負了。
  if (session.combat) session.combat.active = false;

  // 書中原文的復活規則：非永久 buff/debuff 全部移除，永久效果保留。
  // [2026-08-17] 這條規則在此之前**沒有執行點**——`clearTemporaryEffectsOnRevival()`
  // 收的是一個從來沒實作出來的效果形狀，所以它一直是零呼叫端。真正會留下來的
  // 非永久效果是「型態」(變身/開眼/爆發)，而型態在同一天變成了跨戰鬥、跨重整的
  // 持久狀態——不清的話，玩家倒下復活之後還維持著變身，那顯然不對。
  const revivedForms = endScene(session.forms, "復活：非永久效果全部移除(書中原文)");
  session.forms = revivedForms.formsState;
  if (session.combat?.forms) {
    session.combat.forms = endScene(session.combat.forms, "復活").formsState;
  }

  const responseBody = {
    ok: true,
    persistent: store.persistent,
    cost: result.cost,
    reviveCount: result.reviveCount,
    character: session.character,
    downState: getDownState(session.character),
    revival: revivalQuote(session.character),
  };
  if (requestId) {
    session.reviveReplay = { requestId, response: responseBody, savedAt: new Date().toISOString() };
  }

  try {
    await store.put(session, { expectedRev });
  } catch (err) {
    if (err instanceof SessionConflictError) {
      return json({
        ok: false,
        code: "SESSION_CONFLICT",
        error: "這份存檔剛被另一個請求更新，請重新整理後再試一次；復活尚未生效，沒有扣費。",
      }, 409);
    }
    throw err;
  }

  return json(responseBody);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
