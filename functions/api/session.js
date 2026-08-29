// Cloudflare Pages Function —— 存檔管理。
// 路由：POST /api/session（建立）、GET /api/session?id=xxx（讀取）、DELETE /api/session?id=xxx（刪除）
//       GET /api/session（列出全部存檔ID）
//
// 存檔存在 Cloudflare KV，需要在 wrangler.toml 設定 binding（見該檔案內的說明）。
// **沒有設定 KV binding 時不會直接壞掉**，會退到記憶體版讓你先把流程跑起來，
// 但回傳值裡的 persistent 會是 false，前端必須顯示警告——那個模式下存檔隨時會消失。

import {
  buildCharacter,
  buildCharacterFromLifePath,
  sanitizeProvidedCharacter,
} from "../../content/characterBuilder.js";
import {
  createSession,
  resolveSessionStore,
  newSessionId,
  SessionConflictError,
} from "../../content/storage/sessionStore.js";
import {
  getScenarioPack,
  getScenarioReference,
  DEFAULT_SCENARIO_ID,
  listScenarios,
  isRetiredScenarioId,
} from "../../content/scenario/registry.js";
import { initScenarioProgress } from "../../content/scenario/progress.js";
import {
  createReferenceState,
  normalizeReferenceState,
  referenceStateForResponse,
} from "../../content/scenario/referenceAdapter.js";
import { scenarioHudView } from "../../content/scenario/hudView.js";
import { scenarioLifecycle } from "../../content/scenario/lifecycle.js";
import { getDownState, revivalQuote } from "../../content/downState.js";
import { getCurrentUser } from "../../content/auth/sessionToken.js";
import {
  canAccessSession,
  claimSession,
  indexSessionForOwner,
  listSessionsForOwner,
  unindexSessionForOwner,
} from "../../content/auth/ownership.js";
import { publicGodspaceProfile } from "../../content/godspace/schema.js";

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
    // 建卡的最後一步是甦醒那一幕的肉體重塑（見 content/chargen/reshape.js）。
    // 少了 reshape 一樣建得出合法角色卡，只是少了主神給的 5 點——那會是一個
    // 「玩家沒發現自己虧了」的靜默錯誤，所以這裡明確擋下來而不是放行。
    if (lifePath.reshape == null) {
      return json(
        { ok: false, error: "建卡尚未完成：還沒送出肉體重塑的自由屬性分配（lifePath.reshape）" },
        400
      );
    }
    const result = buildCharacterFromLifePath({
      ...lifePath,
      requireStartingSpecialties: true,
    });
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
    // [安全] 不可以把前端送來的角色卡原樣存進新存檔——attributes/xp/derived stats
    // 都可能被偽造。sanitizeProvidedCharacter() 只留下敘事欄位，數值一律由伺服器
    // 夾回合法範圍或重新計算（見該函式的說明）。
    character = sanitizeProvidedCharacter(providedCharacter);
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
  const reference = getScenarioReference(pack);
  session.scenario = {
    packId: pack.id,
    progress: scenarioProgress,
    ...(reference ? { referenceState: createReferenceState(reference) } : {}),
  };
  await store.put(session);
  if (user?.sub) await indexSessionForOwner(store, user.sub, session.id);

  return json({
    ok: true,
    persistent: store.persistent,
    storeKind: store.kind,
    session: publicSessionView(session),
    user,
  });
}

/**
 * 進行中的戰鬥要不要回給前端。
 *
 * [2026-08-29] 舊戰鬥系統移除之後，這裡不再自己攤平一份戰鬥狀態——戰鬥的公開形狀
 * 只有一個權威來源（core/combat/v2/publicState.js 的白名單），在這裡再寫第二份
 * 攤平邏輯，遲早會有一份忘記過濾而把敵人的精確血量或 seed 漏出去。
 *
 * 所以這裡只回一個「有沒有仗在打」的旗標，前端看到它就去打 /api/combat/v2/state
 * 拿完整狀態（見 public/combatV2.js 的 restoreCombatV2）。
 */
function publicCombatState(session) {
  const battle = session?.combatV2;
  if (!battle?.active) return null;
  return { active: true, battleId: battle.battleId ?? null, round: Number(battle.round) || 0 };
}

/**
 * session 對外只提供前端續玩真正需要的資料；referenceState、完整 event log、history
 * 與 ownerId 由 API 內部保留。公開副本狀態統一走下方已過濾的 scenario view。
 */
function publicSessionView(session) {
  const chronicle = Array.isArray(session?.chronicle) ? session.chronicle : [];
  return {
    id: session?.id ?? null,
    version: session?.version ?? null,
    character: session?.character ?? null,
    scene: {
      context: session?.scene?.context ?? "",
      options: Array.isArray(session?.scene?.options) ? session.scene.options : [],
    },
    turns: Number(session?.turns) || 0,
    recentChronicle: chronicle.slice(-5),
    recentChronicleTotal: chronicle.length,
    pendingTurn: session?.pendingTurn
      ? {
          requestId: session.pendingTurn.requestId ?? null,
          chosenOption: session.pendingTurn.chosenOption ?? null,
          playerAction: session.pendingTurn.playerAction ?? null,
          opening: Boolean(session.pendingTurn.opening),
          baseTurn: session.pendingTurn.baseTurn ?? session.turns ?? 0,
        }
      : null,
    combat: publicCombatState(session),
    godspace: publicGodspaceProfile(session?.godspace),
  };
}

export async function onRequestGet(context) {
  const env = context.env ?? {};
  const store = resolveSessionStore(env);
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  const runtimeView = url.searchParams.get("view") === "runtime";
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
  if (isRetiredScenarioId(session.scenario?.packId)) {
    return json({
      ok: false,
      retiredScenario: true,
      scenarioId: session.scenario.packId,
      error: "這份存檔使用已退役的 V1 異形副本，不能繼續進入舊文字流程；請重新開始 V2《異形：生化深淵》。",
    }, 410);
  }

  // 登入者手上拿著一份匿名存檔時，順手認領成他的。
  // 這是使用者選定的行為：已經在玩的人登入之後，進度不會不見。
  //
  // [併發][2026-08-24 second pass] 這也是一個會寫回存檔的 GET。跟 forms.js 的到期
  // 寫回同一個道理：認領本身是幂等的(認領後 session.ownerId 不再是空，下一次自然
  // 就不會再嘗試)，衝突時沒有必要讓整個 GET 失敗——略過這次寫入，讓下一次讀取
  // (或玩家的下一個動作)重新嘗試認領即可，不會遺失任何資源或造成重複扣費。
  if (user?.sub && !session.ownerId) {
    const claim = claimSession(session, user);
    if (claim.claimed) {
      try {
        await store.put(session, { expectedRev: session.rev ?? 0 });
        await indexSessionForOwner(store, user.sub, session.id);
      } catch (err) {
        if (!(err instanceof SessionConflictError)) throw err;
        console.warn("[SESSION_CONFLICT]", JSON.stringify({ where: "GET /api/session(claim)", sessionId: session.id }));
      }
    }
  }
  const lifecycle = scenarioLifecycle({
    session,
    pack: session.scenario ? getScenarioPack(session.scenario.packId) : null,
  });
  // downState / revival 一起回傳：玩家重整頁面回到一張昏迷或死亡的角色卡時，
  // 畫面必須立刻反映出來，而不是等他按下一個選項、撞到 /api/turn 的閘門才知道。
  // 主遊戲續接只需要最近幾筆訊息；完整 chronicle 改由 /api/chronicle 按需載入。
  // B0 起 GET 的 session view 統一走 whitelist；不再因省事把 referenceState、event log 或 ownerId
  // 原樣送到瀏覽器。runtime query 保留向後相容，但兩種 view 現在都使用同一份公開形狀。
  const sessionView = publicSessionView(session);
  return json({
    ok: true,
    persistent: store.persistent,
    storeKind: store.kind,
    session: sessionView,
    user,
    downState: getDownState(session.character),
    revival: revivalQuote(session.character),
    lifecycle,
    godspace: {
      available: lifecycle.canEnterGodspace,
      endpoint: "/api/godspace",
    },
    // [2026-08-20] 副本 HUD（當前目標／簡介／主線進度／迫近度／時間預算）也要在讀取存檔時
    // 一起算出來。先前只有 /api/turn 會回這一份，所以重整頁面接續遊戲的玩家會看到一條空的
    // 頂欄，得再打一個回合才知道自己現在的目標是什麼——狀態一直都在存檔裡，只是沒人讀。
    scenario: session.scenario
      ? (() => {
          const pack = getScenarioPack(session.scenario.packId);
          const reference = getScenarioReference(pack);
          const hud = scenarioHudView(pack, session.scenario.progress);
          return reference
            ? {
                ...hud,
                reference: referenceStateForResponse(
                  reference,
                  normalizeReferenceState(reference, session.scenario.referenceState)
                ),
              }
            : hud;
        })()
      : null,
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
      // 這個數字在畫面上寫的是「N 筆紀錄」，本來就是事件日誌的長度，不是回合數。
      // 舊欄位名叫 turnCount，跟 /api/turn 回的那個「回合數」同名卻是兩回事，容易看錯。
      eventCount: session.log?.events?.length ?? 0,
      turns: session.turns ?? 0,
      scenarioId: session.scenario?.packId ?? null,
      // HP 的 dead 是 evaluateStatus() 依目前傷勢即時計算的衍生旗標，不保證會持久化
      // 在 derived.hp 裡；存檔清單必須跟 /api/turn、/api/combat 的 canonical downState 一致。
      dead: getDownState(session.character).dead,
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
