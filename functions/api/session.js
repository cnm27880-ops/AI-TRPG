// Cloudflare Pages Function —— 存檔管理。
// 路由：POST /api/session（建立）、GET /api/session?id=xxx（讀取）、DELETE /api/session?id=xxx（刪除）
//       GET /api/session（列出全部存檔ID）
//
// 存檔存在 Cloudflare KV，需要在 wrangler.toml 設定 binding（見該檔案內的說明）。
// **沒有設定 KV binding 時不會直接壞掉**，會退到記憶體版讓你先把流程跑起來，
// 但回傳值裡的 persistent 會是 false，前端必須顯示警告——那個模式下存檔隨時會消失。

import { buildCharacter, buildCharacterFromLifePath } from "../../content/characterBuilder.js";
import {
  createSession,
  resolveSessionStore,
  newSessionId,
} from "../../content/storage/sessionStore.js";
import { getScenarioPack, DEFAULT_SCENARIO_ID, listScenarios } from "../../content/scenario/registry.js";
import { initScenarioProgress } from "../../content/scenario/progress.js";
import { getDownState, revivalQuote } from "../../content/downState.js";
import { combatOptions } from "../../content/combat/encounterState.js";
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

  const { lifePath, draft, character: providedCharacter, sceneContext, scenarioId } = body ?? {};

  // 三種建立方式：生平問答（正常流程）、現成配點草稿、或直接給一張角色卡（測試/匯入用）
  let character;
  if (lifePath) {
    const result = buildCharacterFromLifePath(lifePath);
    if (!result.valid) {
      return json({ ok: false, error: "建卡驗證失敗", errors: result.errors }, 400);
    }
    character = result.character;
  } else if (draft) {
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
    // [2026-08-16 修正] 沒登入時**不再列出任何存檔**。
    //
    // 舊行為是「沒登入就列出全部存檔ID」（原本當除錯用）。但匿名存檔的規則是
    // 「知道 sessionId 就能讀」（見 content/auth/ownership.js），所以那個清單等於
    // 把所有匿名存檔的鑰匙串公開掛在網路上——任何人打一次這個端點就能讀別人的進度。
    // 除錯用的方便不值得這個代價，而且 KV binding 接上之後存檔是真的會留著的。
    const ids = user?.sub ? await listSessionsForOwner(store, user.sub) : [];

    // 回傳摘要而不是只有ID：前端要畫的是「我的存檔」清單，光有一串UUID沒辦法讓玩家
    // 認出哪一份是哪一份。多讀幾筆的成本換一個真的能用的畫面，划算。
    const sessions = await summarizeSessions(store, ids);
    return json({ ok: true, persistent: store.persistent, storeKind: store.kind, ids, sessions, user });
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
    // [2026-08-17 第九輪] 續戰時的行動列。**這是同一個洞的第二半**：上一輪把戰鬥行動列
    // 從「index.html 裡寫死的兩顆按鈕」改成引擎算的 combatOptions()，但只接了
    // /api/combat/start 與 act 兩條回應——**重整頁面回到一場進行中的戰鬥時沒有人算它**，
    // 前端只好退回那兩顆寫死的按鈕，於是買到的武器與身上的型態在續戰時全部按不到。
    // 症狀跟上一輪修掉的完全一樣，只是躲在另一條路徑上。
    combatOptions: session.combat?.active ? combatOptions(session.combat, session.character) : null,
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

/** 一次最多摘要幾份存檔。KV 是一份一次讀，沒有上限的話帳號一多就會拖垮這個端點。 */
const SESSION_LIST_LIMIT = 20;

/**
 * 把存檔ID清單變成「可以畫成清單」的摘要。
 *
 * 最新的排前面（索引是依建立順序 push 的，所以反過來就是新到舊）。
 * 讀不到的ID直接跳過而不是回報錯誤：索引裡留著一筆已經被刪掉的存檔是可能的
 * （刪除時 unindex 失敗、或舊資料），為此讓整個清單掛掉不值得。
 */
async function summarizeSessions(store, ids) {
  const recent = [...ids].reverse().slice(0, SESSION_LIST_LIMIT);
  const summaries = [];

  for (const sessionId of recent) {
    const session = await store.get(sessionId);
    if (!session) continue;
    summaries.push({
      id: session.id,
      name: session.character?.concept?.name ?? "未命名輪迴者",
      updatedAt: session.updatedAt ?? session.createdAt ?? null,
      turnCount: session.log?.events?.length ?? 0,
      scenarioId: session.scenario?.packId ?? null,
      // 死掉的角色也要看得出來，否則玩家會讀進一張已經不能動的卡才發現
      dead: Boolean(session.character?.derived?.hp?.dead),
    });
  }
  return summaries;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
