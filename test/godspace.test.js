import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { onRequestPost as createSession } from "../functions/api/session.js";
import { onRequestGet as getGodspace, onRequestPost as enterGodspace } from "../functions/api/godspace.js";
import { onRequestPost as rest } from "../functions/api/rest.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";
import { getScenarioPack, getScenarioReference } from "../content/scenario/registry.js";
import { buildRunSummary } from "../content/scenario/settlement.js";
import { normalizeReferenceState } from "../content/scenario/referenceAdapter.js";

function postRequest(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(response) {
  return { status: response.status, body: await response.json() };
}

async function createV2() {
  const response = await createSession({
    request: postRequest("https://test.local/api/session", {
      character: emptyCharacter("主神空間測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env: {},
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return resolveSessionStore({}).get(data.session.id);
}

async function settleFixture(session) {
  const store = resolveSessionStore({});
  const pack = getScenarioPack(session.scenario.packId);
  const reference = getScenarioReference(pack);
  const referenceState = {
    ...normalizeReferenceState(reference, session.scenario.referenceState),
    endingId: "end_solo_survivor",
  };
  const runSummary = buildRunSummary(pack, session.scenario.progress, session.character, { xp: 7 }, referenceState);
  session.scenario = {
    ...session.scenario,
    referenceState,
    progress: {
      ...session.scenario.progress,
      settledAt: "2026-08-23T00:00:00.000Z",
      runSummary,
    },
  };
  await store.put(session);
  return store;
}

test("GET godspace：settled session 回傳 whitelist debrief、aftercare 與 server action metadata", async () => {
  const session = await createV2();
  await settleFixture(session);
  const result = await readJson(await getGodspace({
    request: new Request(`https://test.local/api/godspace?sessionId=${session.id}`),
    env: {},
  }));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.ok, true);
  assert.equal(result.body.apiVersion, "godspace.v1");
  assert.equal(result.body.lifecycle.status, "settled");
  assert.equal(result.body.lifecycle.canEnterGodspace, true);
  assert.equal(result.body.debrief.status, "settled");
  assert.equal(result.body.debrief.runSummary.endingId, result.body.debrief.scenario.endingId);
  assert.equal(result.body.debrief.scenario.endingPresentation.source, "canonical_gemini_narrative");
  assert.match(result.body.debrief.scenario.endingPresentation.copy, /水仙號的引擎噴口/);
  assert.ok(result.body.health.hp);
  assert.ok(result.body.resources.wallet);
  assert.equal(result.body.actions.find((action) => action.id === "rest").enabled, true);
  assert.equal(result.body.actions.find((action) => action.id === "view_debrief").enabled, true);
  assert.equal("referenceState" in result.body, false, "hub payload 不得原樣暴露 referenceState");
});

test("POST godspace/enter：active session 被擋下，settled session 可重複合法返回且不重複入帳", async () => {
  const active = await createV2();
  const blocked = await readJson(await enterGodspace({
    request: postRequest("https://test.local/api/godspace/enter", { sessionId: active.id, source: "manual" }),
    env: {},
  }));
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.ok, false);
  assert.equal(blocked.body.code, "NOT_IN_GODSPACE");

  await settleFixture(active);
  const first = await readJson(await enterGodspace({
    request: postRequest("https://test.local/api/godspace/enter", { sessionId: active.id, source: "settlement" }),
    env: {},
  }));
  const second = await readJson(await enterGodspace({
    request: postRequest("https://test.local/api/godspace/enter", { sessionId: active.id, source: "resume" }),
    env: {},
  }));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(first.body.lifecycle.status, "settled");
  assert.equal(second.body.lifecycle.status, "settled");
  assert.deepEqual(first.body.debrief.runSummary, second.body.debrief.runSummary);
});

test("GET godspace：沒有副本的 session 回傳 no_scenario hub，且 owner 仍受 session 存取規則保護", async () => {
  const response = await createSession({
    request: postRequest("https://test.local/api/session", { character: emptyCharacter("尚未輪迴者") }),
    env: {},
  });
  const data = await response.json();
  const store = resolveSessionStore({});
  const noScenarioSession = await store.get(data.session.id);
  noScenarioSession.scenario = null;
  await store.put(noScenarioSession);
  const result = await readJson(await getGodspace({
    request: new Request(`https://test.local/api/godspace?sessionId=${data.session.id}`),
    env: {},
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.lifecycle.status, "no_scenario");
  assert.equal(result.body.location, "主神空間");
  assert.equal(result.body.debrief, null);
  assert.equal(result.body.actions.find((action) => action.id === "start_scenario").enabled, true);
});

test("POST rest：死亡角色不能用主神完全恢復繞過 revival API", async () => {
  const session = await createV2();
  await settleFixture(session);
  session.character.derived.hp = {
    ...session.character.derived.hp,
    intact: 0,
    B: 0,
    L: 0,
    A: session.character.derived.hp.max,
  };
  const store = resolveSessionStore({});
  await store.put(session);
  const result = await readJson(await rest({
    request: postRequest("https://test.local/api/rest", { sessionId: session.id }),
    env: {},
  }));
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(result.body.code, "REVIVAL_REQUIRED");
  assert.equal(result.body.downState.dead, true);
});
