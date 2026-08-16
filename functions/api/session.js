// Cloudflare Pages Function —— 存檔管理。
// 路由：POST /api/session（建立）、GET /api/session?id=xxx（讀取）、DELETE /api/session?id=xxx（刪除）
//       GET /api/session（列出全部存檔ID）
//
// 存檔存在 Cloudflare KV，需要在 wrangler.toml 設定 binding（見該檔案內的說明）。
// **沒有設定 KV binding 時不會直接壞掉**，會退到記憶體版讓你先把流程跑起來，
// 但回傳值裡的 persistent 會是 false，前端必須顯示警告——那個模式下存檔隨時會消失。

import { buildCharacter } from "../../content/characterBuilder.js";
import {
  createSession,
  resolveSessionStore,
  newSessionId,
} from "../../content/storage/sessionStore.js";
import { getScenarioPack, DEFAULT_SCENARIO_ID, listScenarios } from "../../content/scenario/registry.js";
import { initScenarioProgress } from "../../content/scenario/progress.js";
import { getDownState, revivalQuote } from "../../content/downState.js";
import { getCurrentUser } from "../../content/auth/sessionToken.js";
import {
  canAccessSession,
  claimSession,
  indexSessionForOwner,
  listSessionsForOwner,
  unindexSessionForOwner,
} from "../../content/auth/ownership.js";

export async function onRequestPost(context) {
  const env = context.env ?? {};
  const store = resolveSessionStore(env);
  // 有登入就把新存檔直接掛在這個帳號底下；沒登入就是匿名存檔(ownerId=null)，
  // 之後玩家登入時會被自動認領(見 content/auth/ownership.js)。
  const user = await getCurrentUser(context.request, env);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const { draft, character: providedCharacter, sceneContext, scenarioId } = body ?? {};

  // 兩種建立方式：給建卡草稿（正常流程），或直接給一張現成角色卡（測試/匯入用）
  let character;
  if (draft) {
    const result = buildCharacter(draft);
    if (!result.valid) {
      return json({ ok: false, error: "建卡驗證失敗", errors: result.errors, budgets: result.budgets }, 400);
    }
    character = result.character;
  } else if (providedCharacter) {
    character = providedCharacter;
  } else {
    return json({ ok: false, error: "body必須包含 draft(建卡草稿) 或 character(現成角色卡)" }, 400);
  }

  // 副本(scenario)：沒指定就用內建範例當預設，讓「先給我一個範例副本測試」這件事不需要
  // 前端先做選擇畫面也能玩起來。指定了但查無此包則明確擋下，不會靜默退回預設。
  const pack = getScenarioPack(scenarioId ?? DEFAULT_SCENARIO_ID);
  if (!pack) {
    return json(
      { ok: false, error: `找不到副本「${scenarioId}」，可用的有：${listScenarios().map((s) => s.id).join("/")}` },
      400
    );
  }
  const scenarioProgress = initScenarioProgress(pack);
  const openingScene = pack.entries[0]?.openingScene;

  const session = createSession({
    id: newSessionId(),
    character,
    sceneContext: sceneContext ?? openingScene ?? "",
    ownerId: user?.sub ?? null,
  });
  session.scenario = { packId: pack.id, progress: scenarioProgress };
  await store.put(session);
  if (user?.sub) await indexSessionForOwner(store, user.sub, session.id);

  return json({ ok: true, persistent: store.persistent, storeKind: store.kind, session, user });
}

export async function onRequestGet(context) {
  const env = context.env ?? {};
  const store = resolveSessionStore(env);
  const id = new URL(context.request.url).searchParams.get("id");
  const user = await getCurrentUser(context.request, env);

  if (!id) {
    // 有登入就只列出這個帳號名下的存檔；沒登入維持原本「列出全部ID」的除錯用行為。
    const ids = user?.sub ? await listSessionsForOwner(store, user.sub) : await store.list();
    return json({ ok: true, persistent: store.persistent, storeKind: store.kind, ids, user });
  }

  const session = await store.get(id);
  if (!session) {
    return json({ ok: false, error: `找不到存檔 ${id}` }, 404);
  }
  if (!canAccessSession(session, user)) {
    // 刻意回 404 而不是 403：告訴對方「這個ID存在但你不能看」等於確認了它的存在。
    return json({ ok: false, error: `找不到存檔 ${id}` }, 404);
  }

  // 登入者手上拿著一份匿名存檔時，順手認領成他的。
  // 這是使用者選定的行為：已經在玩的人登入之後，進度不會不見。
  if (user?.sub && !session.ownerId) {
    const claim = claimSession(session, user);
    if (claim.claimed) {
      await store.put(session);
      await indexSessionForOwner(store, user.sub, session.id);
    }
  }
  // downState / revival 一起回傳：玩家重整頁面回到一張昏迷或死亡的角色卡時，
  // 畫面必須立刻反映出來，而不是等他按下一個選項、撞到 /api/turn 的閘門才知道。
  return json({
    ok: true,
    persistent: store.persistent,
    storeKind: store.kind,
    session,
    user,
    downState: getDownState(session.character),
    revival: revivalQuote(session.character),
  });
}

export async function onRequestDelete(context) {
  const env = context.env ?? {};
  const store = resolveSessionStore(env);
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "必須指定 id" }, 400);

  const user = await getCurrentUser(context.request, env);
  const session = await store.get(id);
  if (session && !canAccessSession(session, user)) {
    return json({ ok: false, error: `找不到存檔 ${id}` }, 404);
  }

  if (session?.ownerId) await unindexSessionForOwner(store, session.ownerId, id);
  await store.delete(id);
  return json({ ok: true });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
