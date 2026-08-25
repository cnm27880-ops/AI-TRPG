import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { onRequestPost as createSession } from "../functions/api/session.js";
import { onRequestPost as playTurn } from "../functions/api/turn.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";

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
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_ripley.lastEntryId, "ripley_boundary_force_01");
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
  assert.equal(replayed.scenario.referenceState.npcCooperation.npc_ripley.boundaryIncidents, 1);
  assert.equal(replayed.scenario.referenceState.npcCooperation.npc_ripley.lastEntryId, "ripley_boundary_force_01");
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
  assert.equal(action.status, 503);
  const actionBody = await action.json();
  assert.equal(actionBody.ok, false);
  assert.equal(actionBody.pendingTurn?.referenceState, undefined);

  const saved = await store.get(sessionId);
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_ripley.lastEntryId, "ripley_cooperate_lambert_02");
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_lambert.lastEntryId, "lambert_cooperate_reassurance_01");
  assert.equal(saved.pendingTurn.referenceState.npcCooperation.npc_ripley.lastEntryId, "ripley_cooperate_lambert_02");
  assert.equal(saved.pendingTurn.referenceState.npcCooperation.npc_lambert.lastEntryId, "lambert_cooperate_reassurance_01");
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
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_parker.lastEntryId, "parker_boundary_coercion_02");
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_parker.boundaryIncidents, 1);
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_lambert.lastEntryId, "lambert_pressure_shout_01");
  assert.equal(saved.scenario.referenceState.npcCooperation.npc_lambert.pressureIncidents, 1);

  const retry = await playTurn({
    request: request("https://test.local/api/turn", { sessionId, requestId, retryPending: true, playerAction: actionText }),
    env,
  });
  assert.equal(retry.status, 503);
  const replayed = await store.get(sessionId);
  assert.equal(replayed.scenario.referenceState.npcCooperation.npc_parker.boundaryIncidents, 1);
  assert.equal(replayed.scenario.referenceState.npcCooperation.npc_lambert.pressureIncidents, 1);
  assert.equal(replayed.pendingTurn.referenceState.npcCooperation.npc_parker.boundaryIncidents, 1);
  assert.equal(replayed.pendingTurn.referenceState.npcCooperation.npc_lambert.pressureIncidents, 1);
});

test("V2 reference action is persisted before an unavailable LLM response", async () => {
  const env = {};
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
  assert.equal(action.status, 503);
  const actionBody = await action.json();
  assert.equal(actionBody.ok, false);
  assert.equal(actionBody.error.includes("沒有可用的LLM供應商"), true);

  const saved = await resolveSessionStore(env).get(sessionId);
  assert.equal(saved.scenario.referenceState.lastApproachId, "app_cryo_recon");
  assert.equal(saved.scenario.referenceState.lastOutcomeTier !== null, true);
  assert.equal(saved.scenario.referenceState.currentSceneId, "evt_cryo_clearance");
  assert.ok(saved.scenario.referenceState.flags.includes("flag_cryo_recon_done"));
  assert.equal(saved.log.events.some((entry) => entry.type === "reference_action"), true);

  const publicLoaded = await (await import("../functions/api/session.js")).onRequestGet({
    request: new Request(`https://test.local/api/session?id=${sessionId}`),
    env,
  });
  const publicBody = await publicLoaded.json();
  assert.equal(publicBody.session.scenario, undefined);
  assert.equal(publicBody.session.log, undefined);
});
