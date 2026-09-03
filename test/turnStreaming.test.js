import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import { DEFAULT_SCENARIO_ID } from "../content/scenario/registry.js";

const DRAFT = {
  concept: { name: "串流測試者", gender: "不透露" },
  attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
  skills: { 格鬥: 1, 射擊: 0, 體魄: 1, 潛行: 0, 求生: 0, 偵察: 2, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 0 },
};

function envWithReply() {
  const calls = [];
  return {
    calls,
    AI: {
      run: async (model, payload) => {
        calls.push({ model, payload });
        return {
          response: JSON.stringify({
            st_thought: "這是 private thought，不得進入公開 response。",
            narration: "串流測試的敘事已經抵達。",
            options: [
              { label: "觀察入口", attribute: "感知", skill: "偵察", difficulty: "容易" },
              { label: "檢查設備", attribute: "智力", skill: "技藝", difficulty: "普通" },
              { label: "保持戒備", attribute: "意志", skill: null, difficulty: "普通" },
              { label: "繼續前進", attribute: "敏捷", skill: "體魄", difficulty: "普通" },
            ],
          }),
        };
      },
    },
  };
}

function plainRequest(env, body) {
  return { request: { json: async () => body }, env };
}

function streamRequest(env, body) {
  return {
    request: new Request("https://test.local/api/turn", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/x-ndjson",
      },
      body: JSON.stringify(body),
    }),
    env,
  };
}

async function readJson(response) {
  return { status: response.status, body: JSON.parse(await response.text()) };
}

test("/api/turn NDJSON：先送 lifecycle，最後才送完整安全 payload 與 narration delta", async () => {
  const env = envWithReply();
  const session = await readJson(await sessionPost(plainRequest(env, {
    draft: DRAFT,
    sceneContext: "測試走廊",
    scenarioId: "scenario.echo-institute-01",
  })));
  assert.equal(session.status, 200, JSON.stringify(session.body));
  const sessionId = session.body.session.id;

  const response = await turnPost(streamRequest(env, { sessionId }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/x-ndjson/);

  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const types = events.map((event) => event.type);
  assert.deepEqual(types.slice(0, 3), ["accepted", "rules_resolved", "narrator_writing"]);
  assert.ok(types.includes("narration_start"));
  assert.ok(types.includes("narration_delta"));
  assert.ok(types.includes("narration_end"));
  assert.equal(types.at(-1), "complete");

  const deltas = events.filter((event) => event.type === "narration_delta").map((event) => event.delta).join("");
  assert.equal(deltas, "串流測試的敘事已經抵達。");
  const complete = events.at(-1);
  assert.equal(complete.payload.narration, deltas);
  assert.equal("stThought" in complete.payload, false);
  assert.equal("st_thought" in complete.payload, false);
});


// [2026-09-03] canonical 回合改成「事實由引擎裁定、句子由模型重寫」之後，這個回合會
// 呼叫 AI；串流的 lifecycle 事件與 delta 拼接契約不受影響，這裡鎖的正是後者。
test("canonical 回合的 NDJSON 仍完成完整 lifecycle，delta 拼起來等於最終敘事", async () => {
  const env = envWithReply();
  const session = await readJson(await sessionPost(plainRequest(env, {
    draft: DRAFT,
    scenarioId: DEFAULT_SCENARIO_ID,
  })));
  assert.equal(session.status, 200, JSON.stringify(session.body));
  const openingResponse = await turnPost(streamRequest(env, { sessionId: session.body.session.id }));
  const openingEvents = (await openingResponse.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const opening = openingEvents.at(-1).payload;
  assert.equal(opening.ok, true);

  const response = await turnPost(streamRequest(env, {
    sessionId: session.body.session.id,
    chosenOption: opening.options[0],
  }));
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const complete = events.at(-1);
  assert.equal(complete.type, "complete");
  assert.equal(complete.payload.ok, true);
  assert.equal(complete.payload.degraded.llmCalled, true);
  assert.match(complete.payload.degraded.narrationSource, /^canonical_.*_rewritten$/);
  assert.equal(env.calls.length, 1);
  assert.ok(events.some((event) => event.type === "narrator_writing"));
  const deltas = events.filter((event) => event.type === "narration_delta").map((event) => event.delta).join("");
  assert.equal(deltas, complete.payload.narration);
});

test("普通 JSON Accept 仍維持既有 JSON response 相容性", async () => {
  const env = envWithReply();
  const session = await readJson(await sessionPost(plainRequest(env, {
    draft: DRAFT,
    scenarioId: "scenario.echo-institute-01",
  })));
  const response = await turnPost(plainRequest(env, { sessionId: session.body.session.id }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  const body = JSON.parse(await response.text());
  assert.equal(body.ok, true, JSON.stringify(body));
  assert.equal(body.narration, "串流測試的敘事已經抵達。");
});
