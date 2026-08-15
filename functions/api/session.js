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

export async function onRequestPost(context) {
  const store = resolveSessionStore(context.env ?? {});

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const { draft, character: providedCharacter, sceneContext } = body ?? {};

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

  const session = createSession({ id: newSessionId(), character, sceneContext });
  await store.put(session);

  return json({ ok: true, persistent: store.persistent, storeKind: store.kind, session });
}

export async function onRequestGet(context) {
  const store = resolveSessionStore(context.env ?? {});
  const id = new URL(context.request.url).searchParams.get("id");

  if (!id) {
    return json({ ok: true, persistent: store.persistent, storeKind: store.kind, ids: await store.list() });
  }

  const session = await store.get(id);
  if (!session) {
    return json({ ok: false, error: `找不到存檔 ${id}` }, 404);
  }
  return json({ ok: true, persistent: store.persistent, storeKind: store.kind, session });
}

export async function onRequestDelete(context) {
  const store = resolveSessionStore(context.env ?? {});
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "必須指定 id" }, 400);

  await store.delete(id);
  return json({ ok: true });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
