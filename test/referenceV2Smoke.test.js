import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { emptyCharacter } from "../core/schema.js";
import { onRequestPost as createSession, onRequestGet as getSession } from "../functions/api/session.js";
import { onRequestPost as playTurn } from "../functions/api/turn.js";

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

function referenceActionsFrom(session) {
  return session.log.events.filter((event) => event.type === "reference_action");
}

function mockLlmResponse(callNumber) {
  const narration = callNumber === 1
    ? "固定測試敘事：休眠室的六座空艙與拖痕讓玩家醒來後立刻感到不對勁。"
    : callNumber === 2
      ? "固定測試敘事：光束沿著拖痕前進，玩家抵達科學實驗區，Ash 已經在分析台前等候。"
      : "固定測試敘事：Ash 的回答保持克制，但實驗室裡的沉默讓這次交涉變成一場真正的對峙。";
  return {
    st_thought: `固定測試模型第${callNumber}回合：只描述 adapter 已裁定的結果。`,
    narration,
    options: [
      {
        label: "固定測試用敘事選項",
        hint: "測試 adapter 接線",
        requiresCheck: false,
        attribute: null,
        skill: null,
        difficulty: null,
      },
    ],
    threatAssessment: { level: "rise_2", reason: "自由輸入造成可追蹤的聲響，但尚未直接接觸" },
  };
}

async function startMockLlm() {
  const prompts = [];
  let callNumber = 0;
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || !request.url.endsWith("/chat/completions")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const payload = JSON.parse(raw);
    prompts.push(payload.messages?.at(-1)?.content ?? "");
    callNumber += 1;
    const body = {
      choices: [{
        message: { content: JSON.stringify(mockLlmResponse(callNumber)) },
        finish_reason: "stop",
      }],
    };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, prompts, url: `http://127.0.0.1:${port}/v1` };
}

test("V2 smoke: fixed LLM runs from opening through Ash and preserves reference facts", async (t) => {
  const mock = await startMockLlm();
  t.after(() => mock.server.close());
  const env = {
    LLM_PROVIDER: "custom",
    LLM_API_KEY: "fixed-test-key",
    LLM_BASE_URL: mock.url,
    LLM_MODEL: "fixed-test-model",
    LLM_JSON_MODE: "off",
  };
  const character = emptyCharacter("V2 冒煙測試者");

  const created = await readJson(await createSession({
    request: jsonRequest("https://test.local/api/session", {
      character,
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  }));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.ok, true);
  const sessionId = created.body.session.id;

  const opening = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", { sessionId }),
    env,
  }));
  assert.equal(opening.status, 200, JSON.stringify(opening.body));
  assert.equal(opening.body.ok, true);
  assert.match(opening.body.narration, /休眠室/);
  assert.equal(opening.body.options.some((option) => option.reference?.approachId === "app_cryo_recon"), true);
  const openingLuyuan = opening.body.scenario.reference.npcs.find((npc) => npc.id === "npc_luyuan");
  assert.equal(openingLuyuan.name, "陸遠");
  assert.equal(openingLuyuan.trustLabel, "待接觸");
  assert.equal("privateGoals" in openingLuyuan, false);
  assert.equal("knowledge" in openingLuyuan, false);
  assert.equal(mock.prompts.length, 0, "固定開場應該不呼叫 LLM");

  const recon = opening.body.options.find((option) => option.reference?.approachId === "app_cryo_recon");
  const afterRecon = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: recon }),
    env,
  }));
  assert.equal(afterRecon.status, 200, JSON.stringify(afterRecon.body));
  assert.equal(afterRecon.body.ok, true);
  assert.ok(afterRecon.body.checkResult, "開場行動應該經過既有骰子引擎");
  assert.ok(afterRecon.body.outcome, "開場行動應該產生結果分級");
  assert.match(afterRecon.body.narration, /光束|拖痕|科學實驗區/);
  assert.equal(afterRecon.body.scenario.reference.eventId, "evt_meet_ash");
  assert.equal(afterRecon.body.scenario.reference.npcs.length >= 5, true);
  assert.equal(afterRecon.body.options.some((option) => option.reference?.sceneId === "evt_meet_ash"), true);
  assert.match(mock.prompts[0], /evt_cryo_clearance/);
  assert.match(mock.prompts[0], /app_cryo_recon/);
  assert.match(mock.prompts[0], /已套用狀態效果/);

  const ashAction = afterRecon.body.options.find((option) => option.reference?.approachId === "app_ash_talk_quarantine");
  assert.ok(ashAction, "抵達 Ash 場景後應提供檢疫交涉 approach");
  const afterAsh = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", {
      sessionId,
      chosenOption: ashAction,
    }),
    env,
  }));
  assert.equal(afterAsh.status, 200, JSON.stringify(afterAsh.body));
  assert.equal(afterAsh.body.ok, true);
  assert.ok(afterAsh.body.checkResult, "Ash 交涉應該經過既有骰子引擎");
  assert.match(afterAsh.body.narration, /Ash/);
  assert.equal(afterAsh.body.scenario.reference.eventId, "evt_meet_ash");
  assert.equal(afterAsh.body.scenario.reference.sceneTurnCount, 1);
  assert.match(mock.prompts[1], /evt_meet_ash/);
  assert.match(mock.prompts[1], /Ash 已收到 937 指令/);

  const loaded = await readJson(await getSession({
    request: new Request(`https://test.local/api/session?id=${sessionId}`),
    env,
  }));
  assert.equal(loaded.status, 200, JSON.stringify(loaded.body));
  const saved = loaded.body.session;
  const referenceState = saved.scenario.referenceState;
  assert.ok(referenceState.flags.includes("flag_cryo_cleared"), "偵察結果無論成功或失敗都應完成休眠室事件旗標");
  const reconResult = referenceActionsFrom(saved).find((event) => event.payload.approachId === "app_cryo_recon");
  assert.ok(reconResult, "應保存開場偵察的 reference_action");
  if (["大成功", "成功", "驚險成功"].includes(reconResult.payload.resultKey)) {
    assert.ok(referenceState.inventory.includes("item_flashlight"), "偵察成功分支應取得手電筒");
    assert.ok(referenceState.clues.includes("clue_alien_trace"), "偵察成功分支應取得異形痕跡線索");
  } else {
    assert.equal(referenceState.inventory.includes("item_flashlight"), false, "偵察失敗分支不應假裝取得手電筒");
  }
  assert.equal(referenceState.currentSceneId, afterAsh.body.scenario.reference.eventId);
  const referenceActions = referenceActionsFrom(saved);
  assert.equal(referenceActions.length, 2);
  assert.equal(saved.history.length >= 2, true);

  console.log(JSON.stringify({
    sessionId,
    llmCalls: mock.prompts.length,
    openingEvent: opening.body.scenario?.reference?.eventId ?? null,
    afterReconEvent: afterRecon.body.scenario.reference.eventId,
    afterAshEvent: afterAsh.body.scenario.reference.eventId,
    afterAshSceneTurnCount: afterAsh.body.scenario.reference.sceneTurnCount,
    checkOutcomes: [afterRecon.body.outcome.tier, afterAsh.body.outcome.tier],
    referenceFlags: referenceState.flags,
    referenceClues: referenceState.clues,
    referenceActions: referenceActions.map((event) => ({
      sceneId: event.payload.sceneId,
      approachId: event.payload.approachId,
      outcomeTier: event.payload.outcomeTier,
      resultKey: event.payload.resultKey,
    })),
  }, null, 2));
});


test("V2 reference free input accepts bounded threatAssessment and keeps reference options server-owned", async (t) => {
  const mock = await startMockLlm();
  t.after(() => mock.server.close());
  const env = {
    LLM_PROVIDER: "custom",
    LLM_API_KEY: "fixed-test-key",
    LLM_BASE_URL: mock.url,
    LLM_MODEL: "fixed-test-model",
    LLM_JSON_MODE: "off",
  };
  const created = await readJson(await createSession({
    request: jsonRequest("https://test.local/api/session", {
      character: emptyCharacter("自由輸入測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  }));
  assert.equal(created.body.ok, true);
  const sessionId = created.body.session.id;
  await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId }), env }));
  const free = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", { sessionId, playerAction: "我對著天花板唱歌，測試船艦是否有反應" }),
    env,
  }));
  assert.equal(free.status, 200, JSON.stringify(free.body));
  assert.equal(free.body.ok, true);
  assert.equal(free.body.scenario.threat.level, 2);
  assert.equal(free.body.scenario.threatAssessment.accepted, true);
  assert.equal(free.body.scenario.threatAssessment.level, "rise_2");
  assert.equal(free.body.options.every((option) => option.source === "reference"), true);
  const freeInputPrompt = mock.prompts.at(-1);
  assert.match(freeInputPrompt, /未命中任何 approach 的自由行動/);
  assert.match(freeInputPrompt, /引擎本回合的判定分級/);
  assert.match(freeInputPrompt, /門已打開／鎖死/);
  assert.match(freeInputPrompt, /只能寫成這次嘗試的可觀察成功部分/);
});
