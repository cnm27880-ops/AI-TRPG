// 路由：GET /api/godspace?sessionId=xxx（讀取主神空間狀態）
//       POST /api/godspace/enter { sessionId, source? }（合法返回主神空間）
//
// 這裡只組裝 hub view，不呼叫 LLM。角色卡、wallet、結算與 lifecycle 一律以 session + engine 為準。

import { resolveSessionStore } from "../../content/storage/sessionStore.js";
import { getScenarioPack } from "../../content/scenario/registry.js";
import { buildGodspacePayload } from "../../content/godspace/payload.js";
import { godspaceLifecycle, requireGodspaceAction } from "../../content/godspace/lifecycleGate.js";
import { getCurrentUser } from "../../content/auth/sessionToken.js";
import { canAccessSession } from "../../content/auth/ownership.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function loadSession(context, sessionId) {
  const store = resolveSessionStore(context.env ?? {});
  if (!sessionId) return { error: json({ ok: false, error: "需要 sessionId" }, 400) };
  const session = await store.get(sessionId);
  if (!session) return { error: json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404) };
  if (!canAccessSession(session, await getCurrentUser(context.request, context.env ?? {}))) {
    return { error: json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404) };
  }
  const pack = session.scenario ? getScenarioPack(session.scenario.packId) : null;
  return { store, session, pack };
}

function payloadFor(session, pack, persistent) {
  const lifecycle = godspaceLifecycle({ session, pack });
  return buildGodspacePayload({ session, pack, persistent, lifecycle });
}

export async function onRequestGet(context) {
  const id = new URL(context.request.url).searchParams.get("sessionId");
  const loaded = await loadSession(context, id);
  if (loaded.error) return loaded.error;
  return json(payloadFor(loaded.session, loaded.pack, loaded.store.persistent));
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const loaded = await loadSession(context, body?.sessionId);
  if (loaded.error) return loaded.error;
  const { store, session, pack } = loaded;
  const lifecycle = godspaceLifecycle({ session, pack });
  const payload = buildGodspacePayload({ session, pack, persistent: store.persistent, lifecycle });
  const gate = requireGodspaceAction({ action: "enter", session, pack, lifecycle });

  if (!gate.allowed) {
    return json({
      ...payload,
      ok: false,
      code: lifecycle.status === "combat" || lifecycle.status === "combat_required" ? "COMBAT_IN_PROGRESS" : gate.code,
      error: gate.reason,
      source: body?.source ?? "manual",
    }, 409);
  }

  // 這個端點不發獎勵、不清傷、不改副本狀態；settleScenario() 應在副本最後一個合法回合完成。
  // 因此重複呼叫是天然 idempotent，不會因返回主神空間多拿一次 XP/points。
  return json({
    ...payload,
    source: body?.source ?? "manual",
    enteredAt: new Date().toISOString(),
  });
}
