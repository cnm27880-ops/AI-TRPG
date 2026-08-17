// Cloudflare Pages Function —— 主神商店。
//   GET  /api/shop?sessionId=...            取貨架(含地點門禁與每一件的可否購買)
//   POST /api/shop { sessionId, goodId, allocation? }   兌換一件商品
//
// 地點門禁的規則書出處在 content/shop/access.js 的檔頭(rules-2.35.txt 第469行)。
// 摘要：支線與獎勵點數只能在主神空間花；經驗兩邊都能花，但在副本中要付兩倍。
//
// 這一層刻意很薄：什麼買得起、什麼買不到、買下去角色卡怎麼變，全部是
// content/shop/ 底下的純函式在算。這裡只負責「讀存檔 → 呼叫純函式 → 寫回存檔」，
// 跟 /api/combat/act 同一個分工原則。角色卡一律以存檔為準，不接受前端塞角色卡進來。

import { resolveSessionStore } from "../../content/storage/sessionStore.js";
import { allGoods, getGood } from "../../content/shop/registry.js";
import { buildStorefront, purchase, summarizeStorefront } from "../../content/shop/catalog.js";
import { locationOf, describeAccess } from "../../content/shop/access.js";
import { formsOf } from "../../content/shop/forms.js";
import { getScenarioPack } from "../../content/scenario/registry.js";
import { appendEvent, EVENT_TYPES } from "../../core/eventLog.js";
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
  // 回 404 而不是 403：告訴對方「這個ID存在但你不能看」等於確認了它的存在。
  if (!canAccessSession(session, await getCurrentUser(context.request, context.env ?? {}))) {
    return { error: json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404) };
  }
  return { store, session };
}

/** 貨架 + 錢包 + 現在人在哪，一次回齊——商店UI一頁要顯示的東西全在這裡。 */
function storefrontPayload(session) {
  const access = locationOf(session, getScenarioPack);
  const goods = allGoods(session.character);
  const shelf = buildStorefront(session.character, session.wallet, goods, {
    location: access.location,
    inCombat: access.inCombat,
  });
  return {
    ok: true,
    access: { ...access, description: describeAccess(access) },
    wallet: session.wallet,
    shelf,
    summary: summarizeStorefront(goods),
    // 已持有的能力與可啟動的型態，讓商店頁同時當「我身上有什麼」的檢視。
    owned: (session.character.abilities ?? []).map((o) => ({
      goodId: o.goodId,
      name: o.name,
      category: o.category,
      rank: o.rank,
    })),
    forms: formsOf(session.character).map((f) => ({
      formId: f.formId,
      label: f.effect.label,
      sourceName: f.sourceName,
      activation: f.effect.activation,
      duration: f.effect.duration,
    })),
  };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const { error, session } = await loadSession(context, url.searchParams.get("sessionId"));
  if (error) return error;
  return json(storefrontPayload(session));
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const { sessionId, goodId, allocation } = body ?? {};
  const { error, store, session } = await loadSession(context, sessionId);
  if (error) return error;

  if (!goodId) return json({ ok: false, error: "body必須包含 goodId" }, 400);
  const good = getGood(goodId, session.character);
  if (!good) return json({ ok: false, error: `貨架上沒有商品「${goodId}」` }, 404);

  const access = locationOf(session, getScenarioPack);
  const result = purchase(session.character, session.wallet, good, {
    allocation,
    location: access.location,
    inCombat: access.inCombat,
  });

  if (!result.ok) {
    // 買不成不是錯誤，是遊戲狀態——回 200 並把所有阻擋理由一次給前端，
    // 讓它可以直接顯示「你差500分、而且力量不夠、而且現在不在主神空間」。
    return json({
      ok: false,
      blockers: result.blockers,
      access: { ...access, description: describeAccess(access) },
    });
  }

  session.character = result.character;
  session.wallet = result.wallet;
  appendEvent(
    session.log,
    EVENT_TYPES.PURCHASE,
    {
      goodId: good.goodId,
      name: good.name,
      pricePaid: result.receipt.pricePaid,
      location: access.location,
      droppedTraits: result.receipt.droppedTraits.map((d) => d.trait),
    },
    { timestamp: new Date().toISOString() }
  );
  await store.put(session);

  return json({
    ...storefrontPayload(session),
    receipt: result.receipt,
    character: session.character,
  });
}
