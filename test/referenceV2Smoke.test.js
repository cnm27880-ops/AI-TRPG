import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { emptyCharacter } from "../core/schema.js";
import { onRequestPost as createSession } from "../functions/api/session.js";
import { onRequestPost as playTurn } from "../functions/api/turn.js";
import { onRequestPost as travel } from "../functions/api/travel.js";
import { onRequestPost as combatStart } from "../functions/api/combat/start.js";
import { onRequestPost as combatAct } from "../functions/api/combat/act.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";
import { getScenarioPack } from "../content/scenario/registry.js";

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
    ? "固定測試敘事：光束沿著拖痕前進，玩家仍在休眠室確認了離開路線。"
    : callNumber === 2
      ? "固定測試敘事：陸遠把槍口壓低，告訴玩家不要往亮著的門走。"
      : callNumber === 3
        ? "固定測試敘事：陸遠帶玩家沿著 A 甲板前往科學實驗區，Ash 已經在分析台前等候。"
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
  assert.deepEqual(opening.body.scenario.reference.exploration.unresolvedQuestions.map((question) => question.id), ["q_player_manifest"]);
  assert.deepEqual(opening.body.scenario.reference.npcs, [], "尚未接觸人物前不應公開整份 NPC roster");
  assert.equal(opening.body.scenario.reference.dmPrompt.mode, "free_action");
  assert.equal(opening.body.scenario.reference.dmPrompt.question, "你打算怎麼做？");
  assert.ok(opening.body.scenario.reference.dmPrompt.referenceHints.length <= 3);
  assert.equal(JSON.stringify(opening.body.scenario.reference).includes("privateGoals"), false);
  assert.equal(JSON.stringify(opening.body.scenario.reference).includes("生化人"), false);
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
  assert.match(afterRecon.body.narration, /光束|拖痕|休眠室/);
  assert.equal(afterRecon.body.scenario.reference.eventId, "evt_cryo_clearance");
  assert.equal(afterRecon.body.scenario.reference.npcs.length, 0, "仍在休眠室時不應提前公開未接觸人物");
  assert.equal(afterRecon.body.options.some((option) => option.reference?.sceneId === "evt_cryo_clearance"), true);
  assert.equal(afterRecon.body.options.every((option) => option.requiresCheck === false || Number.isInteger(option.dc)), true);
  assert.match(mock.prompts[0], /evt_cryo_clearance/);
  assert.match(mock.prompts[0], /app_cryo_recon/);
  assert.match(mock.prompts[0], /已套用狀態效果/);

  const leaveAction = afterRecon.body.options.find((option) => option.reference?.approachId === "app_cryo_leave");
  assert.ok(leaveAction, "休眠室調查後應提供明確離開 approach");
  const afterLeave = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: leaveAction }),
    env,
  }));
  assert.equal(afterLeave.status, 200, JSON.stringify(afterLeave.body));
  assert.equal(afterLeave.body.ok, true);
  assert.equal(afterLeave.body.scenario.reference.eventId, "evt_deck_a_recon");
  assert.equal(afterLeave.body.scenario.reference.location, "loc_deck_a");
  const deckLuyuan = afterLeave.body.scenario.reference.npcs.find((npc) => npc.id === "npc_luyuan");
  assert.equal(deckLuyuan?.name, "陸遠", "進入 A 甲板後才公開現場的陸遠");
  assert.equal(deckLuyuan?.trustLabel, "待接觸");
  assert.equal("privateGoals" in (deckLuyuan ?? {}), false);
  assert.equal(afterLeave.body.options.some((option) => option.reference?.approachId === "app_deck_luyuan_contact"), true);
  assert.match(mock.prompts[1], /evt_cryo_clearance/);
  assert.match(mock.prompts[1], /app_cryo_leave/);

  const luyuanAction = afterLeave.body.options.find((option) => option.reference?.approachId === "app_deck_luyuan_contact");
  assert.ok(luyuanAction, "A 甲板應提供與陸遠交換情報的 approach");
  const afterLuyuan = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: luyuanAction }),
    env,
  }));
  assert.equal(afterLuyuan.status, 200, JSON.stringify(afterLuyuan.body));
  assert.equal(afterLuyuan.body.ok, true);
  assert.match(afterLuyuan.body.narration, /陸遠/);
  assert.equal(afterLuyuan.body.scenario.reference.eventId, "evt_deck_a_recon");
  assert.equal(afterLuyuan.body.scenario.reference.sceneTurnCount, 1);

  const scienceRoute = afterLuyuan.body.options.find((option) => option.reference?.approachId === "app_deck_to_science");
  assert.ok(scienceRoute, "A 甲板應提供前往科學實驗區的 approach");
  const afterScience = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: scienceRoute }),
    env,
  }));
  assert.equal(afterScience.status, 200, JSON.stringify(afterScience.body));
  assert.equal(afterScience.body.ok, true);
  assert.equal(afterScience.body.scenario.reference.eventId, "evt_meet_ash");
  assert.match(afterScience.body.narration, /Ash|科學實驗區/);

  const ashAction = afterScience.body.options.find((option) => option.reference?.approachId === "app_ash_talk_quarantine");
  assert.ok(ashAction, "進入科學區後才應提供 Ash 檢疫交涉 approach");
  const afterAsh = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: ashAction }),
    env,
  }));
  assert.equal(afterAsh.status, 200, JSON.stringify(afterAsh.body));
  assert.equal(afterAsh.body.ok, true);
  assert.ok(afterAsh.body.checkResult, "Ash 交涉應該經過既有骰子引擎");
  assert.match(afterAsh.body.narration, /Ash/);
  assert.equal(afterAsh.body.scenario.reference.eventId, "evt_meet_ash");
  assert.equal(afterAsh.body.scenario.reference.sceneTurnCount, 1);
  assert.match(mock.prompts[2], /evt_deck_a_recon/);
  assert.match(mock.prompts[2], /陸遠/);
  assert.match(mock.prompts[3], /evt_meet_ash/);
  assert.match(mock.prompts[3], /evt_meet_ash|937/);

  const saved = await resolveSessionStore(env).get(sessionId);
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
  assert.equal(referenceActions.length, 5);
  assert.equal(saved.history.length >= 5, true);

  console.log(JSON.stringify({
    sessionId,
    llmCalls: mock.prompts.length,
    openingEvent: opening.body.scenario?.reference?.eventId ?? null,
    afterReconEvent: afterRecon.body.scenario.reference.eventId,
    afterLeaveEvent: afterLeave.body.scenario.reference.eventId,
    afterLuyuanEvent: afterLuyuan.body.scenario.reference.eventId,
    afterScienceEvent: afterScience.body.scenario.reference.eventId,
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
  assert.equal(free.body.scenario.reference.dmPrompt.mode, "free_action");
  assert.ok(free.body.scenario.reference.dmPrompt.referenceHints.length <= 3);
  assert.equal(JSON.stringify(free.body.scenario.reference.dmPrompt).includes("privateGoals"), false);
  const freeInputPrompt = mock.prompts.at(-1);
  assert.match(freeInputPrompt, /未命中任何 approach 的自由行動/);
  assert.match(freeInputPrompt, /引擎本回合的判定分級/);
  assert.match(freeInputPrompt, /門已打開／鎖死/);
  assert.match(freeInputPrompt, /只能寫成這次嘗試的可觀察成功部分/);
});


test("V2 free action accepts exactly 1000 Unicode characters and rejects 1001 before mutation", async (t) => {
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
      character: emptyCharacter("自由行動字數測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  }));
  assert.equal(created.status, 200);
  const sessionId = created.body.session.id;
  await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId }), env }));
  const store = resolveSessionStore(env);
  const before = await store.get(sessionId);
  const tooLong = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", { sessionId, playerAction: "甲".repeat(1001) }),
    env,
  }));
  assert.equal(tooLong.status, 422, JSON.stringify(tooLong.body));
  assert.equal(tooLong.body.ok, false);
  assert.equal(tooLong.body.code, "PLAYER_ACTION_TOO_LONG");
  assert.equal(tooLong.body.maxCharacters, 1000);
  assert.equal(tooLong.body.actualCharacters, 1001);
  assert.deepEqual(await store.get(sessionId), before, "超長輸入不得先寫入 session 或推進回合");
  assert.equal(mock.prompts.length, 0, "固定開場後超長輸入不應呼叫 LLM");

  const exactlyMax = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", { sessionId, playerAction: "觀察" + "甲".repeat(998) }),
    env,
  }));
  assert.equal(exactlyMax.status, 200, JSON.stringify(exactlyMax.body));
  assert.equal(exactlyMax.body.ok, true);
  assert.equal(mock.prompts.length, 1, "1000 字輸入應正常進入一次敘事呼叫");
});


test("V2 travel endpoint is server-authoritative and does not call the LLM", async () => {
  const mock = await startMockLlm();
  const env = {
    LLM_PROVIDER: "custom",
    LLM_API_KEY: "fixed-test-key",
    LLM_BASE_URL: mock.url,
    LLM_MODEL: "fixed-test-model",
    LLM_JSON_MODE: "off",
  };
  try {
    const created = await readJson(await createSession({
      request: jsonRequest("https://test.local/api/session", {
        character: emptyCharacter("travel 測試者"),
        scenarioId: "scenario.nostromo-01-v2",
      }),
      env,
    }));
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const sessionId = created.body.session.id;

    const opening = await readJson(await playTurn({
      request: jsonRequest("https://test.local/api/turn", { sessionId }),
      env,
    }));
    const afterLeave = await readJson(await travel({
      request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_deck_a", requestId: "travel-idem-1" }),
      env,
    }));
    assert.equal(afterLeave.status, 200, JSON.stringify(afterLeave.body));
    assert.equal(afterLeave.body.replayed, false);
    assert.equal(afterLeave.body.travel.from, "loc_cryo");
    const afterLeaveReplay = await readJson(await travel({
      request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_deck_a", requestId: "travel-idem-1" }),
      env,
    }));
    assert.equal(afterLeaveReplay.status, 200, JSON.stringify(afterLeaveReplay.body));
    assert.equal(afterLeaveReplay.body.replayed, true);
    assert.equal(afterLeaveReplay.body.turnCount, afterLeave.body.turnCount);
    assert.equal(afterLeaveReplay.body.travel.timeBudget.spentRounds, afterLeave.body.travel.timeBudget.spentRounds);
    const afterReplaySession = await resolveSessionStore(env).get(sessionId);
    assert.equal(afterReplaySession.log.events.filter((event) => event.type === "travel").length, 1);
    assert.equal(afterReplaySession.log.events.filter((event) => event.type === "time_spent").length, 1);
    assert.equal(afterLeave.body.travel.to, "loc_deck_a");
    assert.equal(afterLeave.body.scenario.reference.eventId, "evt_deck_a_recon");
    assert.equal(mock.prompts.length, 0, "初始 route travel 不應呼叫 LLM");

    const luyuan = afterLeave.body.options.find((option) => option.reference?.approachId === "app_deck_luyuan_contact");
    const afterLuyuan = await readJson(await playTurn({
      request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: luyuan }),
      env,
    }));
    assert.equal(afterLuyuan.status, 200, JSON.stringify(afterLuyuan.body));
    const scienceRoute = afterLuyuan.body.scenario.reference.exploration.nearbyRoutes.find(
      (route) => route.to === "loc_science"
    );
    const requestReuse = await readJson(await travel({
      request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_science", requestId: "travel-idem-1" }),
      env,
    }));
    assert.equal(requestReuse.status, 409);
    assert.equal(requestReuse.body.code, "TRAVEL_REQUEST_REUSED");
    assert.equal(scienceRoute.actionReady, true);
    assert.equal(scienceRoute.timeCost, 1);

    const beforeLlmCalls = mock.prompts.length;
    const moved = await readJson(await travel({
      request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_science" }),
      env,
    }));
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.ok, true);
    assert.equal(moved.body.travel.from, "loc_deck_a");
    assert.equal(moved.body.travel.to, "loc_science");
    assert.equal(moved.body.travel.timeCost, 1);
    assert.equal(moved.body.travel.timeBudget.spentRounds, 3);
    assert.equal(moved.body.scenario.reference.location, "loc_science");
    assert.equal(moved.body.scenario.reference.eventId, "evt_meet_ash");
    assert.equal(moved.body.scenario.reference.exploration.unresolvedQuestions.some((question) => question.id === "q_ash_identity"), true);
    assert.equal(mock.prompts.length, beforeLlmCalls, "travel 不應呼叫 LLM");

    const rejected = await readJson(await travel({
      request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_narcissus" }),
      env,
    }));
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.code, "NOT_ADJACENT");
  } finally {
    await new Promise((resolve) => mock.server.close(resolve));
  }
});


test("V2 travel endpoint refuses pending combat, pending turn, and expired time", async () => {
  const env = {};
  const created = await readJson(await createSession({
    request: jsonRequest("https://test.local/api/session", {
      character: emptyCharacter("travel guard 測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  }));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const sessionId = created.body.session.id;
  const store = resolveSessionStore(env);
  const saved = await store.get(sessionId);
  const originalLocation = saved.scenario.referenceState.currentLocation;

  saved.scenario.progress = {
    ...saved.scenario.progress,
    pendingCombat: true,
  };
  await store.put(saved);
  const combatBlocked = await readJson(await travel({
    request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_deck_a" }),
    env,
  }));
  assert.equal(combatBlocked.status, 409);
  assert.equal(combatBlocked.body.code, "COMBAT_REQUIRED");
  assert.equal((await store.get(sessionId)).scenario.referenceState.currentLocation, originalLocation);

  const pending = await store.get(sessionId);
  pending.scenario.progress = { ...pending.scenario.progress, pendingCombat: false };
  pending.pendingTurn = { requestId: "turn:pending", chosenOption: null, playerAction: "等待" };
  await store.put(pending);
  const turnBlocked = await readJson(await travel({
    request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_deck_a" }),
    env,
  }));
  assert.equal(turnBlocked.status, 409);
  assert.equal(turnBlocked.body.code, "PENDING_TURN");

  const expired = await store.get(sessionId);
  expired.pendingTurn = null;
  expired.scenario.progress = {
    ...expired.scenario.progress,
    timeBudget: { ...expired.scenario.progress.timeBudget, spentRounds: expired.scenario.progress.timeBudget.totalRounds },
  };
  await store.put(expired);
  const timeBlocked = await readJson(await travel({
    request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_deck_a" }),
    env,
  }));
  assert.equal(timeBlocked.status, 409);
  assert.equal(timeBlocked.body.code, "TIME_EXPIRED");
  assert.equal((await store.get(sessionId)).scenario.referenceState.currentLocation, originalLocation);
});


test("V2 API smoke: medical, cargo, tool cabinet, and Ripley routes remain playable and server-owned", async (t) => {
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
      character: emptyCharacter("V2 Phase 2 路線測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  }));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const sessionId = created.body.session.id;

  const opening = await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId }), env }));
  assert.equal(opening.body.ok, true);
  const toDeck = await readJson(await travel({ request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_deck_a" }), env }));
  assert.equal(toDeck.status, 200, JSON.stringify(toDeck.body));
  assert.equal(toDeck.body.scenario.reference.eventId, "evt_deck_a_recon");
  assert.equal(mock.prompts.length, 0, "純 travel 不應呼叫 LLM");

  const luyuan = toDeck.body.options.find((option) => option.reference?.approachId === "app_deck_luyuan_contact");
  assert.ok(luyuan);
  const afterLuyuan = await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: luyuan }), env }));
  assert.equal(afterLuyuan.body.ok, true);

  const toMedbay = await readJson(await travel({ request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_medbay" }), env }));
  assert.equal(toMedbay.status, 200, JSON.stringify(toMedbay.body));
  assert.equal(toMedbay.body.travel.from, "loc_deck_a");
  assert.equal(toMedbay.body.travel.to, "loc_medbay");
  assert.equal(toMedbay.body.scenario.reference.eventId, "evt_medbay_ruins");
  assert.match(toMedbay.body.travel.arrivalText, /醫療區的自動感應門卡在半開位置/);
  assert.equal(mock.prompts.length, 1, "travel 到醫療區不應呼叫 LLM");

  const medbayAction = toMedbay.body.options.find((option) => option.reference?.approachId === "app_medbay_scavenge");
  assert.ok(medbayAction);
  const afterMedbay = await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: medbayAction }), env }));
  assert.equal(afterMedbay.body.ok, true, JSON.stringify(afterMedbay.body));
  assert.equal(afterMedbay.body.scenario.reference.eventId, "evt_medbay_ruins");
  assert.equal(afterMedbay.body.scenario.reference.location, "loc_medbay");
  assert.equal(afterMedbay.body.scenario.reference.exploration.currentLocation.id, "loc_medbay");

  const backToDeck = await readJson(await travel({ request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_deck_a" }), env }));
  assert.equal(backToDeck.status, 200, JSON.stringify(backToDeck.body));
  const toCargo = await readJson(await travel({ request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_cargo" }), env }));
  assert.equal(toCargo.status, 200, JSON.stringify(toCargo.body));
  assert.equal(toCargo.body.scenario.reference.eventId, "evt_cargo_stalk");
  assert.match(toCargo.body.travel.arrivalText, /貨艙開闊如同一座廢棄工廠/);

  const cargoAction = toCargo.body.options.find((option) => option.reference?.approachId === "app_cargo_recon_corpse");
  assert.ok(cargoAction);
  const afterCargo = await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: cargoAction }), env }));
  assert.equal(afterCargo.body.ok, true, JSON.stringify(afterCargo.body));
  assert.equal(afterCargo.body.scenario.reference.eventId, "evt_cargo_stalk");
  const toToolsAction = afterCargo.body.options.find((option) => option.reference?.approachId === "app_cargo_to_tools");
  assert.ok(toToolsAction, "完成貨艙排查後應出現前往工具櫃的 server approach");
  const afterToolsEntry = await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: toToolsAction }), env }));
  assert.equal(afterToolsEntry.body.ok, true, JSON.stringify(afterToolsEntry.body));
  assert.equal(afterToolsEntry.body.scenario.reference.eventId, "evt_cargo_tool_scavenge");
  assert.match(mock.prompts.at(-1), /evt_cargo_tool_scavenge|工具櫃/);

  const abandonTool = afterToolsEntry.body.options.find((option) => option.reference?.approachId === "app_cargo_tool_abandon");
  assert.ok(abandonTool);
  const afterTool = await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: abandonTool }), env }));
  assert.equal(afterTool.body.ok, true, JSON.stringify(afterTool.body));
  const afterToolSession = await resolveSessionStore(env).get(sessionId);
  assert.ok(afterToolSession.scenario.referenceState.flags.includes("flag_cargo_tool_done"));
  const cargoBack = await readJson(await travel({ request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_deck_a" }), env }));
  assert.equal(cargoBack.status, 200, JSON.stringify(cargoBack.body));
  assert.equal(cargoBack.body.scenario.reference.location, "loc_deck_a");

  const beforeBridge = cargoBack.body.scenario.reference.npcs;
  assert.equal(beforeBridge.some((npc) => npc.id === "npc_ripley"), false);
  const toBridge = await readJson(await travel({ request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_bridge" }), env }));
  assert.equal(toBridge.status, 200, JSON.stringify(toBridge.body));
  assert.equal(toBridge.body.scenario.reference.eventId, "evt_meet_ripley");
  assert.ok(toBridge.body.scenario.reference.npcs.some((npc) => npc.id === "npc_ripley"));
  assert.ok(toBridge.body.scenario.reference.npcs.some((npc) => npc.id === "npc_lambert"));
  assert.equal(JSON.stringify(toBridge.body.scenario.reference).includes("privateGoals"), false);

  const hold = toBridge.body.options.find((option) => option.reference?.approachId === "app_ripley_hold_position");
  assert.ok(hold);
  const afterHold = await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: hold }), env }));
  assert.equal(afterHold.body.ok, true, JSON.stringify(afterHold.body));
  assert.equal(afterHold.body.scenario.reference.eventId, "evt_meet_ripley");

  const bridgeBack = await readJson(await travel({ request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_deck_a" }), env }));
  assert.equal(bridgeBack.status, 200, JSON.stringify(bridgeBack.body));
  const replayBridge = await readJson(await travel({ request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_bridge" }), env }));
  assert.equal(replayBridge.status, 409, JSON.stringify(replayBridge.body));
  assert.equal(replayBridge.body.code, "TRAVEL_LOCKED");
  assert.equal(mock.prompts.length >= 4, true, "只有實際 turn 才應增加 LLM 呼叫");
});


test("V2 API smoke: core infiltration and engineering prep precede 937 and overload", async (t) => {
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
      character: emptyCharacter("V2 Phase 3 前置測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  }));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const sessionId = created.body.session.id;
  const store = resolveSessionStore(env);
  const saved = await store.get(sessionId);
  saved.scenario.referenceState = {
    ...saved.scenario.referenceState,
    currentSceneId: "evt_meet_ash",
    currentLocation: "loc_science",
    flags: ["flag_luyuan_met", "flag_937_path_known"],
    inventory: ["item_access_card", "item_wrench_tool"],
    visitedLocations: ["loc_cryo", "loc_deck_a", "loc_science"],
  };
  await store.put(saved);

  const toCore = await readJson(await travel({ request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_mother_core" }), env }));
  assert.equal(toCore.status, 200, JSON.stringify(toCore.body));
  assert.equal(toCore.body.scenario.reference.eventId, "evt_mother_chamber_infiltrate");
  assert.match(toCore.body.travel.arrivalText, /純白色的環形加壓走廊/);
  assert.deepEqual(toCore.body.travel.arrivalSourceEventIds, ["evt_mother_chamber_infiltrate"]);
  assert.equal(mock.prompts.length, 0, "進入主機前置場景的 travel 不應呼叫 LLM");

  const card = toCore.body.options.find((option) => option.reference?.approachId === "app_mother_door_card");
  assert.ok(card);
  const afterDoor = await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: card }), env }));
  assert.equal(afterDoor.status, 200, JSON.stringify(afterDoor.body));
  assert.equal(afterDoor.body.scenario.reference.eventId, "evt_order_937_reveal");
  assert.match(mock.prompts.at(-1), /evt_mother_chamber_infiltrate|圓形金屬門/);

  const afterDoorSession = await store.get(sessionId);
  afterDoorSession.scenario.referenceState.flags = [...new Set([
    ...afterDoorSession.scenario.referenceState.flags,
    "flag_order_937_revealed",
  ])];
  await store.put(afterDoorSession);
  const toEngine = await readJson(await travel({ request: jsonRequest("https://test.local/api/travel", { sessionId, to: "loc_engine" }), env }));
  assert.equal(toEngine.status, 200, JSON.stringify(toEngine.body));
  assert.equal(toEngine.body.scenario.reference.eventId, "evt_engine_coolant_prep");
  assert.match(toEngine.body.travel.arrivalText, /刺骨的冷氣瞬間被滾燙的機油熱浪取代/);
  assert.equal(mock.prompts.length, 1, "工程區 travel 仍不應呼叫 LLM");

  const parker = toEngine.body.options.find((option) => option.reference?.approachId === "app_engine_prep_parker");
  assert.ok(parker);
  const afterPrep = await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: parker }), env }));
  assert.equal(afterPrep.status, 200, JSON.stringify(afterPrep.body));
  assert.equal(afterPrep.body.scenario.reference.eventId, "evt_engine_coolant_prep");
  const startOverload = afterPrep.body.options.find((option) => option.reference?.approachId === "app_engine_start_overload");
  assert.ok(startOverload, "工程準備結果後才出現啟動超載的 approach");
  const afterStart = await readJson(await playTurn({ request: jsonRequest("https://test.local/api/turn", { sessionId, chosenOption: startOverload }), env }));
  assert.equal(afterStart.status, 200, JSON.stringify(afterStart.body));
  assert.equal(afterStart.body.scenario.reference.eventId, "evt_trigger_overload");
  assert.equal(afterStart.body.scenario.reference.location, "loc_engine");
});


test("V2 turn settlement returns the same public canonical ending presentation as Godspace", async (t) => {
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
      character: emptyCharacter("V2 settlement contract 測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  }));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const sessionId = created.body.session.id;
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  const pack = getScenarioPack("scenario.nostromo-01-v2");
  const nodes = Object.fromEntries(pack.entries.flatMap((entry) => entry.nodes).map((node) => [
    node.id,
    { completed: true, divergenceTier: 0 },
  ]));
  session.scenario.progress = {
    ...session.scenario.progress,
    nodes,
    settledAt: null,
    runSummary: null,
  };
  session.scenario.referenceState = {
    ...session.scenario.referenceState,
    currentSceneId: "evt_hypersleep_return",
    currentLocation: "loc_narcissus",
    endingId: "end_solo_survivor",
    flags: ["flag_hypersleep_entered"],
  };
  await store.put(session);

  const settled = await readJson(await playTurn({
    request: jsonRequest("https://test.local/api/turn", { sessionId, playerAction: "查看已封存紀錄" }),
    env,
  }));
  assert.equal(settled.status, 200, JSON.stringify(settled.body));
  assert.ok(settled.body.scenario.settlement, "一般回合結算必須回傳 settlement");
  assert.equal(settled.body.scenario.settlement.endingPresentation.source, "canonical_gemini_narrative");
  assert.match(settled.body.scenario.settlement.endingPresentation.copy, /水仙號的引擎噴口/);
  assert.equal(JSON.stringify(settled.body.scenario.settlement).includes("gmTruth"), false);
  assert.equal(JSON.stringify(settled.body.scenario.settlement).includes("privateGoals"), false);
});


test("V2 combat settlement also returns the canonical ending presentation", async () => {
  const env = {};
  const created = await readJson(await createSession({
    request: jsonRequest("https://test.local/api/session", {
      character: emptyCharacter("V2 combat settlement 測試者"),
      scenarioId: "scenario.nostromo-01-v2",
    }),
    env,
  }));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const sessionId = created.body.session.id;
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  const pack = getScenarioPack("scenario.nostromo-01-v2");
  const nodes = Object.fromEntries(pack.entries.flatMap((entry) => entry.nodes).map((node) => [
    node.id,
    { completed: ["n1", "n2", "n3"].includes(node.id), divergenceTier: 0 },
  ]));
  session.scenario.progress = {
    ...session.scenario.progress,
    nodes,
    settledAt: null,
    runSummary: null,
  };
  session.scenario.referenceState = {
    ...session.scenario.referenceState,
    currentSceneId: "evt_narcissus_final_purge",
    currentLocation: "loc_narcissus_airlock",
    flags: ["flag_suit_ready", "flag_tether_ready"],
    airlockPhase: "positioned",
    shipStatus: "overload_started",
    endingId: "end_solo_survivor",
  };
  await store.put(session);

  const started = await readJson(await combatStart({
    request: jsonRequest("https://test.local/api/combat/start", { sessionId }),
    env,
  }));
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const combatSession = await store.get(sessionId);
  combatSession.combat.order = ["player", "enemy"];
  combatSession.combat.turnIndex = 0;
  combatSession.combat.enemy.hpState = {
    ...combatSession.combat.enemy.hpState,
    intact: 0,
    B: 0,
    L: 0,
    A: 0,
    dead: true,
    unconscious: false,
  };
  await store.put(combatSession);

  const victory = await readJson(await combatAct({
    request: jsonRequest("https://test.local/api/combat/act", { sessionId, weaponKey: "unarmed" }),
    env,
  }));
  assert.equal(victory.status, 200, JSON.stringify(victory.body));
  assert.equal(victory.body.combatOver.winner, "player");
  assert.equal(victory.body.scenario.settlement.endingPresentation.source, "canonical_gemini_narrative");
  assert.match(victory.body.scenario.settlement.endingPresentation.copy, /水仙號的引擎噴口/);
  assert.equal(JSON.stringify(victory.body.scenario.settlement).includes("gmTruth"), false);
  assert.equal(JSON.stringify(victory.body.scenario.settlement).includes("privateGoals"), false);
});
