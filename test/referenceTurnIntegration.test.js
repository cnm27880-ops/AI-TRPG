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
