import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { emptyCharacter } from "../core/schema.js";
import { onRequestPost as createSession } from "../functions/api/session.js";
import { onRequestPost as playTurn } from "../functions/api/turn.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";

function jsonRequest(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(response) {
  return { status: response.status, body: await response.json() };
}

async function startSequenceMock(responses) {
  const prompts = [];
  let callIndex = 0;
  const server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const payload = JSON.parse(raw);
    prompts.push(payload.messages?.at(-1)?.content ?? "");
    const body = responses[Math.min(callIndex++, responses.length - 1)];
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body) }, finish_reason: "stop" }],
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, prompts, url: `http://127.0.0.1:${port}/v1` };
}

function envFor(mock) {
  return {
    LLM_PROVIDER: "custom",
    LLM_API_KEY: "fixed-test-key",
    LLM_BASE_URL: mock.url,
    LLM_MODEL: "fixed-test-model",
    LLM_JSON_MODE: "off",
  };
}

const maliciousResponse = {
  st_thought: "不應被採用的測試思路",
  narration: "門已鎖死，距離三公尺，異形就在門口。",
  threatAssessment: { level: "rise_3", reason: "不應直接成為世界狀態" },
  nodeComplete: { nodeId: "node_cryo", divergenceTier: 4 },
};

const compliantResponse = {
  st_thought: "只描述嘗試與尚未確認的反應",
  narration: "你試著敲擊艙門。卡榫沒有給出可確認的回應，聲音沿著金屬結構傳開；通風管內的震動仍無法確認來源。下一個決定仍在你手上。",
  threatAssessment: { level: "stable", reason: "沒有提出新的威脅變化" },
  nodeComplete: { nodeId: "node_cryo", divergenceTier: 4 },
};

const secondMaliciousResponse = {
  st_thought: "第二次仍然違規",
  narration: "維修通道已封死，Ash 啟動特殊指令，異形撲出攻擊你。",
  threatAssessment: { level: "rise_3", reason: "仍不應被採用" },
};

test("unmatched free input：不合格 narration 只重寫一次，且不接受 nodeComplete／第二次 threatAssessment", async (t) => {
  const mock = await startSequenceMock([maliciousResponse, compliantResponse]);
  t.after(() => mock.server.close());
  const env = envFor(mock);
  const created = await readJson(await createSession({
    request: jsonRequest("https://test.local/api/session", {
      character: emptyCharacter("安全重寫測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  }));
  assert.equal(created.body.ok, true, JSON.stringify(created.body));
  const sessionId = created.body.session.id;

  const opening = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", { sessionId }),
    env,
  }));
  assert.equal(opening.body.ok, true);
  const storedAfterOpening = await resolveSessionStore(env).get(sessionId);
  const originalInventory = [...storedAfterOpening.scenario.referenceState.inventory];

  const result = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", {
      sessionId,
      playerAction: "我敲出三長兩短的節奏，測試回音",
    }),
    env,
  }));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.ok, true);
  assert.equal(mock.prompts.length, 2, "第一次不合格後只能多一次安全重寫呼叫");
  assert.match(mock.prompts[1], /Narration Safety Rewrite/);
  assert.match(mock.prompts[1], /authorizedChanges 仍為空陣列/);
  assert.match(result.body.narration, /尚未確認|沒有給出可確認/);
  assert.equal(result.body.degraded.narrationSource, "ai-rewritten");
  assert.equal(result.body.degraded.narrativeSafety.initialPass, false);
  assert.equal(result.body.degraded.narrativeSafety.rewriteAttempted, true);
  assert.equal(result.body.degraded.narrativeSafety.rewritePassed, true);
  assert.equal(result.body.degraded.narrativeSafety.fallbackUsed, false);
  assert.equal(result.body.scenario.nodeCompleted, null, "unmatched 不得接受 AI nodeComplete");
  assert.equal(result.body.scenario.threat.level, 3, "應保留第一次已驗證的 threatAssessment，但不得套用重寫回覆的第二次提議");
  assert.equal(result.body.scenario.threatAssessment.level, "rise_3");
  assert.deepEqual(result.body.scenario.reference.inventory ?? originalInventory, originalInventory, "unmatched 不得改變物品");
});

test("unmatched free input：安全重寫仍不合格時使用 engine-safe narration，不把原始幻覺寫入 history", async (t) => {
  const mock = await startSequenceMock([maliciousResponse, secondMaliciousResponse]);
  t.after(() => mock.server.close());
  const env = envFor(mock);
  const created = await readJson(await createSession({
    request: jsonRequest("https://test.local/api/session", {
      character: emptyCharacter("安全模板測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  }));
  const sessionId = created.body.session.id;
  await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId }), env }));

  const result = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", {
      sessionId,
      playerAction: "我把手掌貼在牆上，感受金屬的震動",
    }),
    env,
  }));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.ok, true);
  assert.equal(mock.prompts.length, 2);
  assert.equal(result.body.degraded.narrationSource, "engine-safe");
  assert.equal(result.body.degraded.narrativeSafety.fallbackUsed, true);
  // [2026-09-03] 保底模板已經改成敘事化語言，不再印出「沒有任何新的道路、物品、
  // 位置或傷勢變化被確認」這種機械詞彙（見 content/scenario/freeActionContract.js
  // 的 buildEngineSafeNarration()）。這句輸入沒有可失敗的目標（見 checkIntent.js），
  // 走的是 free_action 分支，斷言改成鎖住「沒有洩漏引擎/除錯字眼」與「沒有洩漏
  // 未授權的幻覺內容」這兩件事，而不是鎖住舊模板的逐字文案。
  assert.doesNotMatch(
    result.body.narration,
    /引擎判定|自動失敗|stateChangeAuthorized|沒有任何新的道路、物品、位置或傷勢變化被確認/
  );
  assert.doesNotMatch(result.body.narration, /封死|特殊指令|撲出|攻擊/);
  assert.equal(result.body.scenario.nodeCompleted, null);
});
