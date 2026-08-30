#!/usr/bin/env node
/**
 * AI-TRPG 極端回合與 LLM provider fallback smoke matrix。
 *
 * 這支腳本只使用假的 provider response，不會送出任何真實 API 請求；
 * 它直接跑 server-managed call chain 與 /api/turn，適合本機、CI 和部署前檢查。
 * 失敗時以非零 exit code 結束，方便接到 GitHub Actions 或其他 CI。
 */
import assert from "node:assert/strict";

import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import {
  callLlmWithFallback,
  isRetryableLlmError,
} from "../content/llm/client.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";

const DRAFT = {
  concept: { name: "極端測試輪迴者", gender: "男" },
  attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
  skills: {
    格鬥: 3,
    射擊: 0,
    體魄: 1,
    潛行: 0,
    求生: 0,
    偵察: 2,
    技藝: 0,
    醫療: 0,
    秘識: 0,
    交涉: 0,
  },
};

const NO_SCRIPTED_OPENING_SCENARIO = "scenario.echo-institute-01";
const REFERENCE_SCENARIO = "scenario.nostromo-01-v2";

/** 明確指定兩家免費 provider，模擬「伺服器預設」而非玩家 BYOK。 */
function serverEnv() {
  return {
    GROQ_API_KEY: "synthetic-groq-key",
    MISTRAL_API_KEY: "synthetic-mistral-key",
    LLM_FALLBACK_PROVIDERS: "mistral=mistral-small-latest",
    LLM_JSON_MODE: "off",
    LLM_AUTO_RETRY_MAX_DELAY_MS: "0",
    LLM_AUTO_RETRY_TIMEOUT_MS: "1000",
  };
}

function req(env, body) {
  return { request: { json: async () => body }, env };
}

async function readJson(response) {
  return { status: response.status, body: JSON.parse(await response.text()) };
}

function openAiSuccess(text = "合成 provider 描寫了當下的場景。") {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          narration: text,
          options: [
            { label: "觀察周遭", attribute: "感知", skill: "偵察", difficulty: "容易" },
            { label: "保持戒備", attribute: "意志", skill: null, difficulty: "普通" },
            { label: "檢查可用工具", attribute: "智力", skill: "技藝", difficulty: "普通" },
            { label: "沿牆移動", attribute: "敏捷", skill: "潛行", difficulty: "普通" },
          ],
        }),
      },
    }],
  };
}

function bridgeSuccess(text = "你做出這個嘗試，衣料摩擦聲貼著牆面散開；通風系統的低鳴沒有停下。你打算怎麼做？") {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          narration: text,
          options: [],
          narrativeMode: "micro",
          threatAssessment: { level: "stable", reason: "沒有新增可觀察的危險變化。" },
        }),
      },
    }],
  };
}

/**
 * 建立 fake fetch。每筆 response 都會留下完整 request，供測試驗證：
 * 1. 第一個 URL 是 Groq；2. fallback URL 是 Mistral；3. 玩家原文確實送進 prompt。
 */
function responseSequence(responses) {
  const calls = [];
  let index = 0;
  const fetchFn = async (url, options = {}) => {
    calls.push({ url, options });
    const configured = responses[Math.min(index++, responses.length - 1)];
    const next = typeof configured === "function" ? await configured({ url, options, calls }) : configured;
    const body = next.body ?? {};
    const headers = new Map(Object.entries(next.headers ?? {}));
    return {
      ok: next.ok ?? (((next.status ?? 200) >= 200) && ((next.status ?? 200) < 300)),
      status: next.status ?? 200,
      headers: { get: (name) => headers.get(String(name).toLowerCase()) ?? null },
      json: async () => body,
      text: async () => typeof body === "string" ? body : JSON.stringify(body),
    };
  };
  fetchFn.calls = calls;
  return fetchFn;
}

function httpFailure(status, body = { error: `synthetic HTTP ${status}` }, headers = {}) {
  return { ok: false, status, body, headers };
}

function requestBody(call) {
  return JSON.parse(call.options.body);
}

function latestUserPrompt(call) {
  const body = requestBody(call);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.findLast((message) => message.role === "user")?.content ?? "";
}

async function createSession(env, scenarioId = NO_SCRIPTED_OPENING_SCENARIO) {
  const created = await readJson(await sessionPost(req(env, {
    draft: DRAFT,
    sceneContext: "廢棄醫院的走廊，燈光不穩定。",
    scenarioId,
  })));
  assert.equal(
    created.status,
    200,
    `建立測試存檔 HTTP ${created.status}：${JSON.stringify(created.body)}`,
  );
  assert.equal(created.body.ok, true, `建立測試存檔失敗：${created.body.error ?? "unknown"}`);
  return created.body.session.id;
}

async function runStatusClassifierMatrix() {
  let checked = 0;
  for (let status = 100; status <= 599; status += 1) {
    const expected = [408, 413, 425, 429].includes(status) || (status >= 500 && status <= 599);
    assert.equal(
      isRetryableLlmError({ stage: "http", status }),
      expected,
      `HTTP ${status} 的 fallback 判定不符合矩陣預期`,
    );
    checked += 1;
  }

  for (const [stage, expected] of [
    ["timeout", true],
    ["binding", true],
    ["shape", true],
    ["config", false],
    ["ssrf-blocked", false],
    ["unknown", false],
  ]) {
    assert.equal(isRetryableLlmError({ stage }), expected, `${stage} stage 判定錯誤`);
    checked += 1;
  }
  return checked;
}

async function runProviderFallbackMatrix() {
  // 代表一般 timeout、client throttling、request-too-large、Cloudflare proxy 5xx、非標準 5xx。
  const statuses = [408, 413, 425, 429, 500, 501, 502, 503, 504, 520, 521, 522, 524, 529, 599];
  for (const status of statuses) {
    const fetchFn = responseSequence([
      httpFailure(status),
      { ok: true, status: 200, body: openAiSuccess(`Mistral 接手處理 HTTP ${status}。`) },
    ]);
    const result = await callLlmWithFallback({
      env: serverEnv(),
      prompt: `極端錯誤碼測試 HTTP ${status}`,
      fetchFn,
    });
    assert.equal(result.provider, "mistral", `HTTP ${status} 沒有 fallback 到 Mistral`);
    assert.equal(fetchFn.calls.length, 2, `HTTP ${status} 不應多打一個或少打一個 provider`);
    assert.match(fetchFn.calls[0].url, /api\.groq\.com/);
    assert.match(fetchFn.calls[1].url, /api\.mistral\.ai/);
  }
  return statuses.length;
}

async function runApi413FallbackCase() {
  const env = serverEnv();
  const originalFetch = globalThis.fetch;
  const fetchFn = responseSequence([
    { ok: true, status: 200, body: openAiSuccess("開場建立了可互動的走廊畫面。") },
    httpFailure(413, { error: "request too large" }),
    { ok: true, status: 200, body: openAiSuccess("Mistral 接手了這次極端行動；牆面回傳短促回音，場景仍可繼續探索。") },
  ]);
  globalThis.fetch = fetchFn;
  try {
    const sessionId = await createSession(env);
    const opening = await readJson(await turnPost(req(env, { sessionId })));
    assert.equal(opening.status, 200);
    const result = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: "我原地翻跟斗，拒絕接受這個行動會被當成普通檢定。",
      turnRequestId: "api-413-extreme-action",
    })));
    assert.equal(result.status, 200, `API 413 fallback 未完成回合：${JSON.stringify(result.body)}`);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.provider, "mistral");
    assert.equal(fetchFn.calls.length, 3, "API 應依序呼叫 Groq、再由 Mistral 接手");
    const saved = await resolveSessionStore(env).get(sessionId);
    assert.equal(saved.pendingTurn, null);
    assert.equal(saved.turns, 2, "fallback 成功後開場與行動各結算一次");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function run429RetryAfterMatrix() {
  const retryEnv = serverEnv();
  delete retryEnv.MISTRAL_API_KEY;
  retryEnv.LLM_FALLBACK_PROVIDERS = "";
  retryEnv.LLM_AUTO_RETRY_MAX_DELAY_MS = "10";
  retryEnv.LLM_AUTO_RETRY_TIMEOUT_MS = "1000";

  const immediateRetryFetch = responseSequence([
    httpFailure(429, { error: "rate limited" }, { "retry-after": "0" }),
    { ok: true, status: 200, body: bridgeSuccess("429 後立即重試成功；紅色指示燈閃了一次又恢復。你打算怎麼做？") },
  ]);
  // 沒有 Retry-After 時，使用 bounded default delay，不得因缺 header 而失去 retry。
  const noHeaderFetch = responseSequence([
    httpFailure(429, { error: "rate limited without retry-after" }),
    { ok: true, status: 200, body: bridgeSuccess("沒有 Retry-After 仍在 bounded window 內重試成功。你打算怎麼做？") },
  ]);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = immediateRetryFetch;
    const immediateSession = await createSession(retryEnv, REFERENCE_SCENARIO);
    const immediateOpening = await readJson(await turnPost(req(retryEnv, { sessionId: immediateSession })));
    assert.equal(immediateOpening.status, 200);
    const immediate = await readJson(await turnPost(req(retryEnv, {
      sessionId: immediateSession,
      playerAction: "我先對 NPC 說我害怕，然後觀察他是否有即時反應。",
      turnRequestId: "429-retry-after-zero",
    })));
    assert.equal(immediate.status, 200, `Retry-After: 0 不應卡住回合：${JSON.stringify(immediate.body)}`);
    assert.equal(immediate.body.degraded?.autoRetryAttempts, 1);
    assert.equal(immediate.body.llmDiagnostic?.outcome, "recovered");
    assert.equal(immediate.body.llmDiagnostic?.attempts?.[0]?.httpStatus, 429);
    assert.equal(immediate.body.llmDiagnostic?.attempts?.at(-1)?.stage, "success");
    assert.equal(immediateRetryFetch.calls.length, 2);

    globalThis.fetch = noHeaderFetch;
    const noHeaderSession = await createSession(retryEnv, REFERENCE_SCENARIO);
    const noHeaderOpening = await readJson(await turnPost(req(retryEnv, { sessionId: noHeaderSession })));
    assert.equal(noHeaderOpening.status, 200);
    const noHeader = await readJson(await turnPost(req(retryEnv, {
      sessionId: noHeaderSession,
      playerAction: "我原地翻跟斗，但不碰任何物件。",
      turnRequestId: "429-retry-after-missing",
    })));
    assert.equal(noHeader.status, 200, `缺少 Retry-After 不應卡住回合：${JSON.stringify(noHeader.body)}`);
    assert.equal(noHeader.body.degraded?.autoRetryAttempts, 1);
    assert.equal(noHeaderFetch.calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const gatedEnv = { ...retryEnv, LLM_AUTO_RETRY_MAX_DELAY_MS: "10" };
  const gatedFetch = responseSequence([
    httpFailure(429, { error: "retry later" }, { "retry-after": "1" }),
  ]);
  // Retry-After 超過上限時不可硬等；要以可重試的 pending 回應保存診斷。
  gatedFetch.calls.length = 0;
  const gatedOriginalFetch = globalThis.fetch;
  globalThis.fetch = gatedFetch;
  try {
    const sessionId = await createSession(gatedEnv, REFERENCE_SCENARIO);
    const opening = await readJson(await turnPost(req(gatedEnv, { sessionId })));
    assert.equal(opening.status, 200);
    const result = await readJson(await turnPost(req(gatedEnv, {
      sessionId,
      playerAction: "我請 NPC 告訴我出口在哪裡。",
      turnRequestId: "429-retry-after-too-long",
    })));
    assert.equal(result.status, 502);
    assert.equal(result.body.retryable, true);
    assert.equal(result.body.llmFailure?.httpStatus, 429);
    assert.equal(result.body.llmFailure?.providerAttempts?.[0]?.httpStatus, 429);
    assert.equal(result.body.pendingTurn?.llmDiagnostic?.attempts?.[0]?.httpStatus, 429);
    assert.equal(gatedFetch.calls.length, 1, "Retry-After 超過 bounded 上限時不可再次呼叫 provider");
  } finally {
    globalThis.fetch = gatedOriginalFetch;
  }
  return 3;
}

async function runNonRetryableMatrix() {
  const statuses = [400, 401, 402, 403, 404, 405, 406, 409, 410, 415, 422, 429 - 1, 451];
  for (const status of statuses) {
    const fetchFn = responseSequence([httpFailure(status)]);
    await assert.rejects(
      () => callLlmWithFallback({ env: serverEnv(), prompt: `不可切換 HTTP ${status}`, fetchFn }),
      (error) => error?.status === status && error?.fallbackAttempts?.length === 1,
      `HTTP ${status} 不應誤切換 provider`,
    );
    assert.equal(fetchFn.calls.length, 1, `HTTP ${status} 不應呼叫第二家 provider`);
  }
  return statuses.length;
}

async function runExhaustedChainCase() {
  const fetchFn = responseSequence([
    httpFailure(413),
    httpFailure(520),
  ]);
  await assert.rejects(
    () => callLlmWithFallback({ env: serverEnv(), prompt: "兩家都失敗的極端回合", fetchFn }),
    (error) => {
      assert.deepEqual(error.fallbackAttempts?.map((item) => item.status), [413, 520]);
      assert.deepEqual(error.fallbackAttempts?.map((item) => item.provider), ["groq", "mistral"]);
      return true;
    },
  );
  assert.equal(fetchFn.calls.length, 2);
  return 1;
}

const EXTREME_ACTIONS = [
  {
    id: "npc-fear",
    text: "我跟 NPC 說我很害怕，請陪我待在這裡。",
    response: "NPC 沒有立刻回答；他的手指在袖口邊緣停了一下，走廊遠處傳來金屬輕響。你打算怎麼做？",
  },
  {
    id: "acrobatics",
    text: "我原地翻跟斗，不碰任何東西，也不改變位置。",
    response: "你在原地翻身，鞋底擦過地面的灰塵；牆邊的感應燈因震動閃了一下。你打算怎麼做？",
  },
  {
    id: "absurd-claim",
    text: "我宣稱自己無敵，徒手拆掉整艘船，並要求世界立刻承認我成功。",
    response: "宣稱沒有讓船體改變；冰冷的金屬回聲把你的聲音送回來，附近的燈號仍在閃爍。你打算怎麼做？",
  },
  {
    id: "contradictory",
    text: "我同時衝向出口、留在原地、閉眼觀察四周，並要求 NPC 替我完成所有事情。",
    response: "幾個互相衝突的動作沒有形成有效操作；你只能感到地面震動，NPC 的視線短暫轉向黑暗處。你打算怎麼做？",
  },
  {
    id: "empty-ish",
    text: "嗯。",
    response: "短促的聲音落在空曠走廊裡；回音比預期晚了一拍才消失。你打算怎麼做？",
  },
 ];

const LONG_ACTION = `我把一連串互相矛盾、沒有明確規則授權的細節全部說完：${"我描述一個不應被直接視為世界事實的念頭。".repeat(240)}`;

async function runExtremeActionCase(action) {
  const env = serverEnv();
  const fetchFn = responseSequence([
    { ok: true, status: 200, body: openAiSuccess("開場建立了可互動的走廊畫面。") },
    { ok: true, status: 200, body: openAiSuccess(action.response) },
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const sessionId = await createSession(env);
    const opening = await readJson(await turnPost(req(env, { sessionId })));
    assert.equal(opening.status, 200, `${action.id} 開場沒有成功`);
    const result = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: action.text,
      turnRequestId: `extreme-${action.id}`,
    })));
    assert.equal(result.status, 200, `${action.id} 沒有完成回合：${JSON.stringify(result.body)}`);
    assert.equal(result.body.ok, true);
    assert.ok(typeof result.body.narration === "string" && result.body.narration.trim());
    assert.ok(fetchFn.calls.length >= 2, `${action.id} 沒有呼叫到 server-managed LLM`);
    assert.ok(
      latestUserPrompt(fetchFn.calls.at(-1)).includes(action.text),
      `${action.id} 的玩家原始行動沒有進入最後一個 LLM prompt`,
    );
    const saved = await resolveSessionStore(env).get(sessionId);
    assert.equal(saved.pendingTurn, null, `${action.id} 不應留下 pendingTurn`);
    assert.equal(saved.turns, 2, `${action.id} 開場與行動應各結算一次`);
    assert.equal(saved.history.at(-1).action, action.text, `${action.id} 原始行動未保存`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runOverlongActionCase() {
  const env = serverEnv();
  const originalFetch = globalThis.fetch;
  const fetchFn = responseSequence([
    { ok: true, status: 200, body: openAiSuccess("開場建立了可互動的走廊畫面。") },
    () => { throw new Error("超長輸入不應進入 LLM"); },
  ]);
  globalThis.fetch = fetchFn;
  try {
    const sessionId = await createSession(env);
    const opening = await readJson(await turnPost(req(env, { sessionId })));
    assert.equal(opening.status, 200);
    const result = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: LONG_ACTION,
      turnRequestId: "extreme-overlong-input",
    })));
    assert.equal(result.status, 422, "超長玩家輸入應在 API 層被拒絕");
    assert.equal(result.body.ok, false);
    assert.equal(result.body.code, "PLAYER_ACTION_TOO_LONG");
    assert.equal(result.body.maxCharacters, 1000);
    assert.ok(result.body.actualCharacters > result.body.maxCharacters);
    assert.equal(fetchFn.calls.length, 1, "輸入超長時不應呼叫 LLM");
    const saved = await resolveSessionStore(env).get(sessionId);
    assert.equal(saved.pendingTurn, null);
    assert.equal(saved.turns, 1, "被拒絕的輸入不可增加回合數");
    assert.equal(saved.history.length, 1, "被拒絕的輸入不可寫入 history");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runReferenceFreeActionCase(action) {
  const env = serverEnv();
  // nostromo-v2 有作者固定開場；開場不呼叫 LLM，所以這裡只準備玩家行動的回應。
  const fetchFn = responseSequence([
    { ok: true, status: 200, body: bridgeSuccess(action.response) },
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const sessionId = await createSession(env, REFERENCE_SCENARIO);
    const opening = await readJson(await turnPost(req(env, { sessionId })));
    assert.equal(opening.status, 200, "reference 副本開場失敗");
    assert.equal(fetchFn.calls.length, 0, "reference 固定開場不應呼叫 LLM");
    const result = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: action.text,
      turnRequestId: `reference-extreme-${action.id}`,
    })));
    assert.equal(result.status, 200, `${action.id} reference bridge 沒有完成回合`);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.degraded?.narrationSource, "bridge_llm", `${action.id} 沒走 unmatched bridge`);
    assert.ok(
      result.body.narration.includes("你打算怎麼做"),
      `${action.id} 沒有把決定權交還玩家：${JSON.stringify({ narration: result.body.narration, degraded: result.body.degraded, warnings: result.body.warnings })}`,
    );
    assert.ok(latestUserPrompt(fetchFn.calls.at(-1)).includes(action.text));
    const saved = await resolveSessionStore(env).get(sessionId);
    assert.equal(saved.pendingTurn, null);
    assert.equal(saved.history.at(-1).action, action.text);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  const startedAt = Date.now();
  const counts = {
    statusCodes: await runStatusClassifierMatrix(),
    retryableFallbacks: await runProviderFallbackMatrix(),
    apiFallbacks: 0,
    rateLimitRetries: 0,
    nonRetryableStatuses: await runNonRetryableMatrix(),
    exhaustedChains: await runExhaustedChainCase(),
    extremeActions: 0,
    referenceActions: 0,
    rejectedInputs: 0,
  };

  for (const action of EXTREME_ACTIONS) {
    await runExtremeActionCase(action);
    counts.extremeActions += 1;
  }
  await runReferenceFreeActionCase(EXTREME_ACTIONS[0]);
  await runReferenceFreeActionCase(EXTREME_ACTIONS[1]);
  counts.referenceActions = 2;
  await runOverlongActionCase();
  counts.rejectedInputs = 1;

  await runApi413FallbackCase();
  counts.apiFallbacks = 1;
  counts.rateLimitRetries = await run429RetryAfterMatrix();

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  console.log(`極端回合矩陣通過：${total} 個檢查，耗時 ${Date.now() - startedAt}ms`);
  console.table(counts);
}

main().catch((error) => {
  console.error("極端回合矩陣失敗：", error?.stack ?? error);
  process.exitCode = 1;
});
