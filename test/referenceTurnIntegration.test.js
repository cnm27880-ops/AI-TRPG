import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { onRequestPost as createSession } from "../functions/api/session.js";
import { onRequestPost as playTurn } from "../functions/api/turn.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";
import { getScenarioReference } from "../content/scenario/registry.js";

function request(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("new session without scenarioId defaults to Alien V2 and seeds reference state", async () => {
  const created = await createSession({
    request: request("https://test.local/api/session", {
      character: emptyCharacter("預設副本測試者"),
    }),
    env: {},
  });
  const body = await created.json();
  assert.equal(created.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.session.id != null, true);
  const saved = await resolveSessionStore({}).get(body.session.id);
  assert.equal(saved.scenario.packId, "scenario.nostromo-01-v2");
  assert.equal(saved.scenario.referenceState.currentSceneId, "evt_cryo_clearance");
  assert.ok(saved.scenario.referenceState.npcStatuses.npc_luyuan);
  assert.equal("scenario" in body.session, false, "POST session 不得暴露 raw scenario");
});

test("Ripley cooperation state is persisted before an unavailable LLM response", async () => {
  const env = {};
  const created = await createSession({
    request: request("https://test.local/api/session", {
      character: emptyCharacter("Ripley 整合測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  });
  const createdBody = await created.json();
  assert.equal(createdBody.ok, true);
  const sessionId = createdBody.session.id;

  const opening = await playTurn({
    request: request("https://test.local/api/turn", { sessionId }),
    env,
  });
  assert.equal(opening.status, 200);
  const store = resolveSessionStore(env);
  const seeded = await store.get(sessionId);
  seeded.scenario.referenceState.currentSceneId = "evt_meet_ripley";
  seeded.scenario.referenceState.currentLocation = "loc_bridge";
  await store.put(seeded);

  const action = await playTurn({
    request: request("https://test.local/api/turn", {
      sessionId,
      requestId: "ripley-threat-1",
      playerAction: "我拿槍指著 Ripley，要求她立刻開門",
    }),
    env,
  });
  assert.equal(action.status, 503);
  const actionBody = await action.json();
  assert.equal(actionBody.ok, false);
  assert.equal(actionBody.pendingTurn?.referenceState, undefined, "pendingTurn 不得把 server-only referenceState 暴露給前端");

  const saved = await store.get(sessionId);
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_ripley.state, "angry");
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_ripley.lastInteractionType, "coercive_pressure");
  assert.equal(saved.pendingTurn.referenceState.npcCooperation.npc_ripley.lastUpdatedTurn, 2);

  const retry = await playTurn({
    request: request("https://test.local/api/turn", {
      sessionId,
      requestId: "ripley-threat-1",
      retryPending: true,
      playerAction: "我拿槍指著 Ripley，要求她立刻開門",
    }),
    env,
  });
  assert.equal(retry.status, 503);
  const retryBody = await retry.json();
  assert.equal(retryBody.ok, false);
  const replayed = await store.get(sessionId);
  assert.equal(replayed.scenario.referenceState.npcCooperation.npc_ripley.incidents, 1);
  assert.equal(replayed.scenario.referenceState.npcCooperation.npc_ripley.lastInteractionType, "coercive_pressure");
});

test("同一回合的 Ripley／Lambert cooperation state 會依序合併而不互相覆蓋", async () => {
  const env = {};
  const created = await createSession({
    request: request("https://test.local/api/session", {
      character: emptyCharacter("多 NPC 整合測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  });
  const createdBody = await created.json();
  assert.equal(createdBody.ok, true);
  const sessionId = createdBody.session.id;

  const opening = await playTurn({
    request: request("https://test.local/api/turn", { sessionId }),
    env,
  });
  assert.equal(opening.status, 200);
  const store = resolveSessionStore(env);
  const seeded = await store.get(sessionId);
  seeded.scenario.referenceState.currentSceneId = "evt_meet_ripley";
  seeded.scenario.referenceState.currentLocation = "loc_bridge";
  await store.put(seeded);

  const action = await playTurn({
    request: request("https://test.local/api/turn", {
      sessionId,
      requestId: "support-lambert-ripley-1",
      playerAction: "我安撫 Lambert，請 Ripley 說明下一步",
    }),
    env,
  });
  assert.equal(action.status, 200);
  const actionBody = await action.json();
  assert.equal(actionBody.ok, true, JSON.stringify(actionBody));
  assert.equal(actionBody.degraded.llmCalled, false);
  assert.match(actionBody.degraded.narrationSource, /^canonical_/);
  assert.equal(actionBody.pendingTurn, null);

  const saved = await store.get(sessionId);
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_ripley.lastInteractionType, "calm_lambert");
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_lambert.lastInteractionType, "offer_reassurance");
  assert.equal(saved.pendingTurn, null);
});

test("極端壓力下 `/api/turn` 會合併 Parker／Lambert state 且 retryPending 不重複累計", async () => {
  const env = {};
  const created = await createSession({
    request: request("https://test.local/api/session", {
      character: emptyCharacter("Parker Lambert 壓力測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  });
  const createdBody = await created.json();
  assert.equal(createdBody.ok, true);
  const sessionId = createdBody.session.id;

  const opening = await playTurn({
    request: request("https://test.local/api/turn", { sessionId }),
    env,
  });
  assert.equal(opening.status, 200);
  const store = resolveSessionStore(env);
  const seeded = await store.get(sessionId);
  seeded.scenario.referenceState.currentSceneId = "evt_engine_coolant_prep";
  await store.put(seeded);

  const requestId = "parker-lambert-pressure-1";
  const actionText = "我威脅 Parker 立刻拉閥，同時對 Lambert 大吼叫她閉嘴";
  const action = await playTurn({
    request: request("https://test.local/api/turn", { sessionId, requestId, playerAction: actionText }),
    env,
  });
  assert.equal(action.status, 503);
  const body = await action.json();
  assert.equal(body.ok, false);
  assert.equal(body.pendingTurn?.referenceState, undefined);

  const saved = await store.get(sessionId);
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_parker.lastInteractionType, "coercive_pressure");
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_parker.incidents, 1);
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_lambert.lastInteractionType, "pressure_or_dismissal");
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_lambert.incidents, 1);

  const retry = await playTurn({
    request: request("https://test.local/api/turn", { sessionId, requestId, retryPending: true, playerAction: actionText }),
    env,
  });
  assert.equal(retry.status, 503);
  const replayed = await store.get(sessionId);
  assert.equal(replayed.scenario.referenceState.npcCooperation.npc_parker.incidents, 1);
  assert.equal(replayed.scenario.referenceState.npcCooperation.npc_lambert.incidents, 1);
  assert.equal(replayed.pendingTurn.referenceState.npcCooperation.npc_parker.incidents, 1);
  assert.equal(replayed.pendingTurn.referenceState.npcCooperation.npc_lambert.incidents, 1);
});

test("V2 reference action uses canonical direct-send without an LLM response", async () => {
  let llmCalls = 0;
  const env = {
    AI: {
      run: async () => {
        llmCalls += 1;
        throw new Error("canonical direct-send 不應呼叫 LLM");
      },
    },
  };
  const character = emptyCharacter("Reference 測試者");
  const created = await createSession({
    request: request("https://test.local/api/session", {
      character,
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  });
  const createdBody = await created.json();
  assert.equal(createdBody.ok, true);
  const sessionId = createdBody.session.id;

  const opening = await playTurn({
    request: request("https://test.local/api/turn", { sessionId }),
    env,
  });
  const openingBody = await opening.json();
  assert.equal(openingBody.ok, true);
  assert.equal(openingBody.options[0].reference.sceneId, "evt_cryo_clearance");

  const action = await playTurn({
    request: request("https://test.local/api/turn", {
      sessionId,
      chosenOption: openingBody.options[0],
    }),
    env,
  });
  assert.equal(action.status, 200);
  const actionBody = await action.json();
  assert.equal(actionBody.ok, true, JSON.stringify(actionBody));
  assert.equal(actionBody.degraded.llmCalled, false);
  assert.equal(actionBody.degraded.narrationSource, "canonical_result");
  assert.equal(actionBody.degraded.llmCalled, false);
  assert.equal(llmCalls, 0);
  assert.equal(actionBody.pendingTurn, null);

  const saved = await resolveSessionStore(env).get(sessionId);
  const canonicalScene = getScenarioReference("scenario.nostromo-01-v2").scenes.find((scene) => scene.id === "evt_cryo_clearance");
  const canonicalTexts = Object.values(canonicalScene.narrativeSource.outcomes.app_cryo_recon);
  assert.ok(canonicalTexts.includes(actionBody.narration), "direct-send 必須逐字採用 canonical outcome 原文");
  assert.equal(saved.scenario.referenceState.lastApproachId, "app_cryo_recon");
  assert.equal(saved.scenario.referenceState.lastOutcomeTier !== null, true);
  assert.equal(saved.scenario.referenceState.currentSceneId, "evt_cryo_clearance");
  assert.ok(saved.scenario.referenceState.flags.includes("flag_cryo_recon_done"));
  assert.equal(saved.log.events.some((entry) => entry.type === "reference_action"), true);
  assert.equal(saved.history.at(-1).narration, actionBody.narration);

  const publicLoaded = await (await import("../functions/api/session.js")).onRequestGet({
    request: new Request(`https://test.local/api/session?id=${sessionId}`),
    env,
  });
  const publicBody = await publicLoaded.json();
  assert.equal(publicBody.session.scenario, undefined);
  assert.equal(publicBody.session.log, undefined);
});

// ---------------------------------------------------------------------------
// [2026-09-01] 時間預算耗盡要變成 referenceState 看得見的事實（第零階段）
//
// 在此之前，deriveEndingId() 會讀 flag_expire_triggered 與 flag_player_dead_overload，
// 但整個 content/ 與 functions/ 沒有任何地方寫入這兩個旗標——只有測試自己塞。
// 結果是 end_expire_ruins 與 end_death_overload_vaporized 這兩個結局在正式遊玩中
// 永遠到不了：時間用完之後引擎只多送一句語氣指令，世界狀態一個字都沒變。
// ---------------------------------------------------------------------------

/** 把時間預算推到「再花一回合就耗盡」，再回寫存檔。 */
async function primeExpiry(env, sessionId, extraFlags = []) {
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  const budget = session.scenario.progress.timeBudget;
  session.scenario.progress = {
    ...session.scenario.progress,
    timeBudget: { ...budget, spentRounds: budget.totalRounds - 1 },
  };
  if (extraFlags.length) {
    session.scenario.referenceState = {
      ...session.scenario.referenceState,
      flags: [...new Set([...(session.scenario.referenceState.flags ?? []), ...extraFlags])],
    };
  }
  await store.put(session);
  return store;
}

async function openScenario(env, name) {
  const created = await createSession({
    request: request("https://test.local/api/session", {
      character: emptyCharacter(name),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  });
  const createdBody = await created.json();
  assert.equal(createdBody.ok, true);
  const sessionId = createdBody.session.id;
  const opening = await playTurn({ request: request("https://test.local/api/turn", { sessionId }), env });
  const openingBody = await opening.json();
  assert.equal(openingBody.ok, true);
  return { sessionId, firstOption: openingBody.options[0] };
}

test("時間預算耗盡的那一回合會寫入 flag_expire_triggered 並定出劣化結局", async () => {
  const env = {};
  const { sessionId, firstOption } = await openScenario(env, "時間窗口測試者");
  const store = await primeExpiry(env, sessionId);

  const action = await playTurn({
    request: request("https://test.local/api/turn", { sessionId, chosenOption: firstOption }),
    env,
  });
  assert.equal((await action.json()).ok, true);

  const saved = await store.get(sessionId);
  assert.ok(saved.scenario.referenceState.flags.includes("flag_expire_triggered"), "時間到了要變成世界事實");
  // 沒有啟動超載 → 主神機制把玩家從爆炸邊緣撈回來，是劣化生還而不是死亡。
  assert.equal(saved.scenario.referenceState.endingId, "end_expire_ruins");
  assert.equal(
    saved.scenario.referenceState.flags.includes("flag_player_dead_overload"),
    false,
    "沒有啟動超載就不該判成核心崩潰死亡"
  );
});

test("超載已啟動而玩家還在母船上時，倒數歸零判成核心崩潰死亡", async () => {
  const env = {};
  const { sessionId, firstOption } = await openScenario(env, "超載倒數測試者");
  const store = await primeExpiry(env, sessionId, ["flag_overload_active"]);

  const action = await playTurn({
    request: request("https://test.local/api/turn", { sessionId, chosenOption: firstOption }),
    env,
  });
  assert.equal((await action.json()).ok, true);

  const saved = await store.get(sessionId);
  assert.ok(saved.scenario.referenceState.flags.includes("flag_expire_triggered"));
  assert.ok(saved.scenario.referenceState.flags.includes("flag_player_dead_overload"));
  assert.equal(saved.scenario.referenceState.endingId, "end_death_overload_vaporized");
});
