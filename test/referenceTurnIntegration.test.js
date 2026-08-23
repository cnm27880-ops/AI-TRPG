import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { onRequestGet as getSession, onRequestPost as createSession } from "../functions/api/session.js";
import { onRequestPost as playTurn } from "../functions/api/turn.js";

function request(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

  const loaded = await getSession({
    request: new Request(`https://test.local/api/session?id=${sessionId}`),
    env,
  });
  const loadedBody = await loaded.json();
  assert.equal(loadedBody.ok, true);
  assert.equal(loadedBody.session.scenario.referenceState.lastApproachId, "app_cryo_recon");
  assert.equal(loadedBody.session.scenario.referenceState.lastOutcomeTier !== null, true);
  assert.equal(loadedBody.session.scenario.referenceState.currentSceneId, "evt_meet_ash");
  assert.equal(loadedBody.session.log.events.some((entry) => entry.type === "reference_action"), true);
});
