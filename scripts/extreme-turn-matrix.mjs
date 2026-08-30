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

/** 只用單一 groq provider 做 bounded auto-retry 測試共用的環境（不混入 provider fallback）。 */
function boundedRetryEnv(overrides = {}) {
  const env = serverEnv();
  delete env.MISTRAL_API_KEY;
  env.LLM_FALLBACK_PROVIDERS = "";
  env.LLM_AUTO_RETRY_MAX_DELAY_MS = "10";
  env.LLM_AUTO_RETRY_TIMEOUT_MS = "1000";
  return { ...env, ...overrides };
}

/**
 * P1：擴充 Retry-After 格式矩陣。
 *
 * 已有的測試涵蓋了 "0"、缺少 header、與超過上限的一般數字；這裡把 HTTP-date 格式、
 * 負數、浮點數、非數字字串、以及極大數值都補齊——這些全部要嘛落在 client.js 的
 * `retryAfterMsFromHeaders()` 的 Date.parse() 備援路徑，要嘛落在「解析不出來就當作沒有
 * Retry-After，改用 bounded default」這條路徑，任何一種都不該讓回合卡死或直接爆炸。
 */
async function runRetryAfterCase({ id, headerValue, expectImmediateRetry, maxDelayMs = 10 }) {
  const env = boundedRetryEnv({ LLM_AUTO_RETRY_MAX_DELAY_MS: String(maxDelayMs) });
  const responses = expectImmediateRetry
    ? [
        httpFailure(429, { error: "rate limited" }, { "retry-after": headerValue }),
        { ok: true, status: 200, body: bridgeSuccess(`Retry-After 格式案例(${id})重試成功。你打算怎麼做？`) },
      ]
    : [httpFailure(429, { error: "rate limited" }, { "retry-after": headerValue })];
  const fetchFn = responseSequence(responses);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const sessionId = await createSession(env, REFERENCE_SCENARIO);
    const opening = await readJson(await turnPost(req(env, { sessionId })));
    assert.equal(opening.status, 200);
    const result = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: `我測試 Retry-After 格式案例：${id}。`,
      turnRequestId: `retry-after-format-${id}`,
    })));
    if (expectImmediateRetry) {
      assert.equal(result.status, 200, `${id}：應在 bounded window 內立即重試成功：${JSON.stringify(result.body)}`);
      assert.equal(result.body.degraded?.autoRetryAttempts, 1, `${id}：應該恰好重試一次`);
      assert.equal(fetchFn.calls.length, 2, `${id}：應該剛好打兩次（原始 + 重試）`);
    } else {
      assert.equal(result.status, 502, `${id}：Retry-After 超過上限時不該硬等，應直接進 pending gate：${JSON.stringify(result.body)}`);
      assert.equal(fetchFn.calls.length, 1, `${id}：超過上限時不該再打第二次`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runRetryAfterFormatMatrix() {
  const nearNowDate = new Date(Date.now()).toUTCString();
  const farFutureDate = new Date(Date.now() + 3_600_000).toUTCString();
  const cases = [
    // 負數：不是合法的等待秒數，應視同「沒有 Retry-After」，改用 bounded default，不可讓回合卡死。
    { id: "negative-seconds", headerValue: "-5", expectImmediateRetry: true, maxDelayMs: 5000 },
    // 浮點數：Number("0.001") 是合法數字，四捨五入成毫秒後應該落在 bounded window 內。
    { id: "float-seconds", headerValue: "0.001", expectImmediateRetry: true, maxDelayMs: 5000 },
    // 非數字字串：Number()/Date.parse() 都會是 NaN，一樣退回 bounded default。
    { id: "non-numeric-garbage", headerValue: "soon-ish", expectImmediateRetry: true, maxDelayMs: 5000 },
    // HTTP-date 格式（RFC 7231），且時間點就在當下：應該透過 Date.parse() 備援算出很小的延遲。
    { id: "http-date-near-now", headerValue: nearNowDate, expectImmediateRetry: true, maxDelayMs: 5000 },
    // HTTP-date 但排到一小時後：超過 bounded 上限，不可硬等一小時。
    { id: "http-date-far-future", headerValue: farFutureDate, expectImmediateRetry: false, maxDelayMs: 10 },
    // 極大數值：供應商標錯或惡意回應都可能發生，一樣要落在 bounded gate，不可以真的等這麼久。
    { id: "huge-numeric-seconds", headerValue: "999999999", expectImmediateRetry: false, maxDelayMs: 10 },
  ];
  for (const testCase of cases) await runRetryAfterCase(testCase);
  return cases.length;
}

/**
 * P1：「多次 retry 不得超過全回合上限」—— bounded auto-retry 每個 turn 最多只能用一次，
 * 就算後續的「JSON格式重試」又踩到一次暫時性失敗，也不能再觸發第二次網路層 retry。
 *
 * 情境設計：第一次呼叫 429（觸發自動重試），重試後 HTTP 成功但內容不是合法JSON
 * （觸發既有的「重講一次」JSON修復機制），JSON修復的那次呼叫又踩到 429——此時
 * retryState 已經用掉了，不能再等待重試，必須讓這次真的失敗、直接照舊降級流程
 * 處理，而不是再等一次、也不可以让整個請求掛起或無限重試。
 */
async function runBoundedRetryCapCase() {
  const env = boundedRetryEnv();
  const fetchFn = responseSequence([
    httpFailure(429, { error: "rate limited" }, { "retry-after": "0" }),
    // 網路層重試成功了(HTTP 200)，但內容本身不是合法JSON——觸發「重講一次」機制。
    { ok: true, status: 200, body: { choices: [{ message: { content: "這不是JSON，只是一段沒頭沒尾的散文。" } }] } },
    // JSON修復的重試又踩到 429；這次不能再觸發網路層 auto-retry(已經用掉了)。
    httpFailure(429, { error: "rate limited again" }, { "retry-after": "0" }),
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const sessionId = await createSession(env, REFERENCE_SCENARIO);
    const opening = await readJson(await turnPost(req(env, { sessionId })));
    assert.equal(opening.status, 200);
    const result = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: "我測試 bounded retry 上限：連續兩次暫時性失敗不能疊加成兩次重試。",
      turnRequestId: "bounded-retry-cap",
    })));
    // 整體仍然完成（HTTP 200）：JSON修復失敗時既有邏輯會保留降級後的敘事，不會讓請求掛掉。
    assert.equal(result.status, 200, `bounded retry 上限案例應該以降級內容完成回合：${JSON.stringify(result.body)}`);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.degraded?.autoRetryAttempts, 1, "即使踩到兩次暫時性失敗，公開的retry次數也不能超過1");
    // 注意：retriedForInvalidJson 只在「重講一次」真的拿到新回覆時才是true(見turn.js)；
    // 這裡JSON修復呼叫本身直接失敗(沒有拿到新內容可解析)，所以維持既有的false語意，
    // 不是這個測試要驗證的重點——重點是parseFailed、呼叫次數與retry次數上限。
    assert.equal(result.body.degraded?.retriedForInvalidJson, false);
    assert.equal(result.body.degraded?.parseFailed, true, "JSON修復重試本身失敗，這一輪最終仍是解析失敗");
    // 3次＝原始呼叫 + 1次網路層auto-retry + 1次JSON修復重試；修復重試失敗後不可再觸發第4次呼叫。
    assert.equal(fetchFn.calls.length, 3, "bounded retry 上限案例的LLM呼叫總數必須恰好是3次，不能再往上疊加");
  } finally {
    globalThis.fetch = originalFetch;
  }
  return 1;
}

/**
 * P1：清除或標記過期的 lastLlmDiagnostic —— 上一輪 fallback 恢復留下的診斷，
 * 不能在下一輪主要 provider 正常完成後繼續殘留，否則 Discord `/status` 會一直
 * 顯示已經不存在的問題，讓看診斷的人誤以為現在還在 fallback。
 */
async function runLastLlmDiagnosticClearsCase() {
  const env = serverEnv();
  const fetchFn = responseSequence([
    { ok: true, status: 200, body: openAiSuccess("開場由 Groq 直接完成，沒有任何 fallback。") },
    httpFailure(413, { error: "request too large" }),
    { ok: true, status: 200, body: openAiSuccess("這一輪由 Mistral 接手，留下 fallback 診斷。") },
    { ok: true, status: 200, body: openAiSuccess("這一輪 Groq 直接完成，不該再看到上一輪的診斷。") },
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const sessionId = await createSession(env);
    const opening = await readJson(await turnPost(req(env, { sessionId })));
    assert.equal(opening.status, 200);

    const fallbackTurn = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: "第一次行動，Groq 這次會失敗、由 Mistral 接手。",
      turnRequestId: "diagnostic-clear-fallback-turn",
    })));
    assert.equal(fallbackTurn.status, 200);
    assert.equal(fallbackTurn.body.provider, "mistral");
    const afterFallback = await resolveSessionStore(env).get(sessionId);
    assert.ok(afterFallback.lastLlmDiagnostic, "fallback 成功後應該留下診斷");
    assert.equal(afterFallback.lastLlmDiagnostic.outcome, "recovered");

    const cleanTurn = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: "第二次行動，這次 Groq 直接完成，不需要任何 fallback。",
      turnRequestId: "diagnostic-clear-clean-turn",
    })));
    assert.equal(cleanTurn.status, 200);
    assert.equal(cleanTurn.body.provider, "groq");
    const afterClean = await resolveSessionStore(env).get(sessionId);
    assert.equal(afterClean.lastLlmDiagnostic, null, "沒有 fallback 的正常回合，必須清掉上一輪殘留的診斷");
  } finally {
    globalThis.fetch = originalFetch;
  }
  return 1;
}

/**
 * P1：malformed response 矩陣 —— HTTP 200 不代表內容可信。
 *
 * 涵蓋：合法JSON但narration是空字串（且測試「重講一次」能不能自我修復，以及兩次都
 * 空白時是否老實標成降級）、body缺少choices欄位（要能觸發provider fallback，不是
 * 整條chain提早中止）、finish_reason=length但JSON恰好還是能解析（要照樣標記
 * truncated，不能因為JSON解析成功就假裝這次輸出沒有被截斷）。
 */
async function runMalformedResponseMatrix() {
  let checked = 0;

  // A1：空 narration，但「重講一次」那次拿到正常內容——確認既有的JSON修復機制
  // 同樣能救援「合法JSON但內容空白」這種情況，不是只救援「JSON壞掉」。
  {
    const env = serverEnv();
    const fetchFn = responseSequence([
      { ok: true, status: 200, body: openAiSuccess("開場建立了可互動的走廊畫面。") },
      { ok: true, status: 200, body: openAiSuccess("") },
      { ok: true, status: 200, body: openAiSuccess("重講一次之後拿到的正常敘事內容。") },
    ]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchFn;
    try {
      const sessionId = await createSession(env);
      const opening = await readJson(await turnPost(req(env, { sessionId })));
      assert.equal(opening.status, 200);
      const result = await readJson(await turnPost(req(env, {
        sessionId,
        playerAction: "測試空narration能不能靠重講一次救回來。",
        turnRequestId: "malformed-empty-narration-recovers",
      })));
      assert.equal(result.status, 200);
      assert.equal(result.body.ok, true);
      assert.equal(result.body.degraded.retriedForInvalidJson, true, "空narration應該觸發既有的重講一次機制");
      assert.equal(result.body.degraded.parseFailed, false, "重講一次成功後不該再標成解析失敗");
      assert.equal(result.body.narration, "重講一次之後拿到的正常敘事內容。");
      assert.equal(fetchFn.calls.length, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
    checked += 1;
  }

  // A2：連續兩次都是空 narration——確認最終老實標成降級，不能把空白內容當成成功敘事。
  {
    const env = serverEnv();
    const fetchFn = responseSequence([
      { ok: true, status: 200, body: openAiSuccess("開場建立了可互動的走廊畫面。") },
      { ok: true, status: 200, body: openAiSuccess("") },
      { ok: true, status: 200, body: openAiSuccess("") },
    ]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchFn;
    try {
      const sessionId = await createSession(env);
      const opening = await readJson(await turnPost(req(env, { sessionId })));
      assert.equal(opening.status, 200);
      const result = await readJson(await turnPost(req(env, {
        sessionId,
        playerAction: "測試連續兩次空narration會不會被誤判成成功敘事。",
        turnRequestId: "malformed-empty-narration-persists",
      })));
      assert.equal(result.status, 200, "降級仍要維持一致的版面，不能整個請求失敗");
      assert.equal(result.body.ok, true);
      assert.equal(result.body.degraded.parseFailed, true, "連續空白內容必須老實標成解析失敗，不能誤判成有效敘事");
      assert.ok(result.body.narration.trim().length > 0, "就算降級，版面也不能真的是一片空白");
      assert.equal(result.body.options.length, 4);
      assert.ok(result.body.options.every((o) => o.source === "fallback"));
      assert.equal(fetchFn.calls.length, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
    checked += 1;
  }

  // B：body缺少choices欄位——要能正確判定成 stage=shape 並換下一家provider，而不是
  // 整條fallback chain因為一個沒有status欄位的原生錯誤而提早中止。
  {
    const env = serverEnv();
    const fetchFn = responseSequence([
      { ok: true, status: 200, body: openAiSuccess("開場建立了可互動的走廊畫面。") },
      { ok: true, status: 200, body: { id: "resp_1", object: "chat.completion" } }, // 沒有 choices
      { ok: true, status: 200, body: openAiSuccess("Mistral 接手，因為 Groq 這次的回應缺少 choices。") },
    ]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchFn;
    try {
      const sessionId = await createSession(env);
      const opening = await readJson(await turnPost(req(env, { sessionId })));
      assert.equal(opening.status, 200);
      const result = await readJson(await turnPost(req(env, {
        sessionId,
        playerAction: "測試缺少choices欄位能不能正確fallback。",
        turnRequestId: "malformed-missing-choices",
      })));
      assert.equal(result.status, 200, `缺少choices不該讓整個請求失敗：${JSON.stringify(result.body)}`);
      assert.equal(result.body.ok, true);
      assert.equal(result.body.provider, "mistral", "缺少choices應該換下一家provider，不是整條chain中止");
      assert.equal(fetchFn.calls.length, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
    checked += 1;
  }

  // C：HTTP 200 但body是空字串——同樣要能觸發fallback。
  {
    const env = serverEnv();
    const calls = [];
    const fetchFn = async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        return { ok: true, status: 200, json: async () => openAiSuccess("開場建立了可互動的走廊畫面。"), text: async () => "" };
      }
      if (url.includes("groq")) {
        return { ok: true, status: 200, json: async () => { throw new SyntaxError("empty body"); }, text: async () => "" };
      }
      return { ok: true, status: 200, json: async () => openAiSuccess("Mistral 接手，因為 Groq 這次回傳空字串。"), text: async () => "" };
    };
    fetchFn.calls = calls;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchFn;
    try {
      const sessionId = await createSession(env);
      const opening = await readJson(await turnPost(req(env, { sessionId })));
      assert.equal(opening.status, 200);
      const result = await readJson(await turnPost(req(env, {
        sessionId,
        playerAction: "測試HTTP 200但空字串body能不能正確fallback。",
        turnRequestId: "malformed-empty-body",
      })));
      assert.equal(result.status, 200, `空字串body不該讓整個請求失敗：${JSON.stringify(result.body)}`);
      assert.equal(result.body.ok, true);
      assert.equal(result.body.provider, "mistral");
      assert.equal(calls.length, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
    checked += 1;
  }

  // D：finish_reason=length，但這次JSON剛好還能完整解析——truncated仍必須誠實標成true，
  // 不能因為「這次剛好解析成功」就假裝輸出沒有被截斷。
  {
    const env = serverEnv();
    const truncatedButParseable = openAiSuccess("內容看起來完整，但供應商回報這其實是被截斷的。");
    truncatedButParseable.choices[0].finish_reason = "length";
    const fetchFn = responseSequence([
      { ok: true, status: 200, body: openAiSuccess("開場建立了可互動的走廊畫面。") },
      { ok: true, status: 200, body: truncatedButParseable },
    ]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchFn;
    try {
      const sessionId = await createSession(env);
      const opening = await readJson(await turnPost(req(env, { sessionId })));
      assert.equal(opening.status, 200);
      const result = await readJson(await turnPost(req(env, {
        sessionId,
        playerAction: "測試finish_reason=length時就算JSON能解析也要標記truncated。",
        turnRequestId: "malformed-finish-reason-length",
      })));
      assert.equal(result.status, 200);
      assert.equal(result.body.ok, true);
      assert.equal(result.body.degraded.parseFailed, false, "這次JSON確實能解析");
      assert.equal(result.body.degraded.truncated, true, "finish_reason=length必須誠實標記，不能因為JSON解析成功就假裝沒被截斷");
      assert.equal(result.body.degraded.finishReason, "length");
    } finally {
      globalThis.fetch = originalFetch;
    }
    checked += 1;
  }

  return checked;
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

/** 三家 server-managed provider 的環境：模擬「連免費 fallback 都用完了」的極端狀況。 */
function threeProviderServerEnv() {
  return {
    ...serverEnv(),
    SILICONFLOW_API_KEY: "synthetic-siliconflow-key",
    LLM_FALLBACK_PROVIDERS: "mistral=mistral-small-latest,siliconflow=Qwen/Qwen3-30B-A3B-Instruct",
  };
}

/**
 * P0：所有 server-managed provider 都失敗、且連續多家都回 413／429 這個組合。
 *
 * 只測 callLlmWithFallback() 沒辦法涵蓋一個很現實的風險：三家全滅之後，/api/turn
 * 這一層有沒有老實把完整診斷保存進 pendingTurn、有沒有因為某處重複呼叫而多打一次
 * 已經確定失敗的 provider、以及在同一個 requestId 重試時是否會再打三家一次
 * （而不是先看 pendingTurn 是否還在同一個 baseTurn 上直接擋下）。
 */
async function runAllProvidersExhaustedApiCase() {
  const env = threeProviderServerEnv();
  const fetchFn = responseSequence([
    { ok: true, status: 200, body: openAiSuccess("開場建立了可互動的走廊畫面。") },
    httpFailure(413, { error: "request too large" }),
    httpFailure(429, { error: "rate limited" }, { "retry-after": "0" }),
    httpFailure(500, { error: "upstream error" }),
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const sessionId = await createSession(env);
    const opening = await readJson(await turnPost(req(env, { sessionId })));
    assert.equal(opening.status, 200);
    const result = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: "我同時測試三家 provider 全部失敗的極端狀況。",
      turnRequestId: "all-providers-exhausted",
    })));
    assert.equal(result.status, 502, `三家都失敗時應該回502：${JSON.stringify(result.body)}`);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.retryable, true);
    // 三個 attempt 都要留著：呼叫端要能一眼看出「哪一家、哪個HTTP碼」，不能因為
    // 最後一家失敗就把前兩家的診斷蓋掉或截斷。
    const attempts = result.body.llmFailure?.providerAttempts ?? [];
    assert.deepEqual(attempts.map((a) => a.provider), ["groq", "mistral", "siliconflow"]);
    assert.deepEqual(attempts.map((a) => a.httpStatus), [413, 429, 500]);
    assert.equal(result.body.pendingTurn?.llmDiagnostic?.attempts?.length, 3);
    // 開場1次 + 這次3家各1次 = 4；三家都失敗不能多打或少打任何一家。
    assert.equal(fetchFn.calls.length, 4, "三家全滅時應該恰好各打一次，不多不少");

    const saved = await resolveSessionStore(env).get(sessionId);
    assert.equal(saved.turns, 1, "三家全滅時規則層不能被當成已結算，回合數不能增加");
    assert.equal(saved.pendingTurn?.requestId, "all-providers-exhausted");

    // 用同一個 requestId 重試（retryPending），但這次沒有任何 provider 會成功——
    // 驗證「上一次已經三家都打過」不會被忽略、重試不會把三家全部再打一輪。
    const retried = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: "我同時測試三家 provider 全部失敗的極端狀況。",
      turnRequestId: "all-providers-exhausted",
      retryPending: true,
    })));
    assert.equal(retried.status, 502, `retryPending 應該再走一次完整 chain 並仍然失敗：${JSON.stringify(retried.body)}`);
    assert.equal(fetchFn.calls.length, 7, "retryPending 重新嘗試時，三家 provider 應該各再打一次（不多打）");
    const afterRetry = await resolveSessionStore(env).get(sessionId);
    assert.equal(afterRetry.turns, 1, "retryPending 失敗後仍然不能誤增回合數");
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  // [P1 擴充] 零寬字元：trim() 不會清掉 U+200B，所以這段文字對JS來說「非空白」，
  // 必須能正常一路送到LLM，不能因為視覺上看起來像空白就被引擎用不同方式處理。
  {
    id: "zero-width-only",
    text: "​​​​​",
    response: "沒有任何動作被清楚表達；周遭的寂靜持續了一會兒，遠處管線傳來滴水聲。你打算怎麼做？",
  },
  // [P1 擴充] 單一超短字元：不是空字串，但短到只有一個字，考驗關鍵字推導與prompt組裝
  // 不會因為輸入太短就出錯。
  {
    id: "single-char",
    text: "走",
    response: "你邁開步伐，鞋底摩擦地面的聲音在走廊裡格外清晰。你打算怎麼做？",
  },
  // [P1 擴充] 混合中/英/日/韓文：確認多語言混排不會讓字數計算或prompt組裝出錯。
  {
    id: "mixed-language",
    text: "I slowly 走向 ドア 그리고 조용히 待著，watching для any 動靜。",
    response: "混雜的低語沒有驚動任何人；門後的陰影維持原樣，沒有新的聲音出現。你打算怎麼做？",
  },
  // [P1 擴充] Emoji 洗版：多組多重碼位(surrogate pair / ZWJ序列)的emoji，
  // 確認 countActionCharacters()／prompt 組裝在astral平面字元下不會算錯或壞掉。
  {
    id: "emoji-spam",
    text: "🔥💀👻🚀🧟‍♂️👨‍👩‍👧‍👦🐉🎃💥⚡".repeat(6),
    response: "一連串誇張的手勢沒有改變任何實際狀況；走廊的燈光照舊明滅。你打算怎麼做？",
  },
  // [P1 擴充] 重複輸入：同一個字重複洗版，確認引擎不會把它誤判成特殊指令或當機。
  {
    id: "repeated-char-spam",
    text: "啊".repeat(300),
    response: "持續的喊聲在走廊裡迴盪，直到你自己的呼吸聲蓋過了它。你打算怎麼做？",
  },
  // [P0/P1 擴充] astral平面字元(surrogate pair)的長字串：600個emoji按code point算是600字
  // (在限制以內)，但如果字數計算不小心按UTF-16長度算會變成1200(會被誤判超長而拒絕)。
  // 這裡確認「code point數在限制內」的astral字串仍然能正常送進LLM，不會被誤傷。
  {
    id: "long-emoji-codepoint-count",
    text: "🔥".repeat(600),
    response: "大量重複的符號沒有引發任何額外效果；場景維持原樣。你打算怎麼做？",
  },
 ];

const LONG_ACTION = `我把一連串互相矛盾、沒有明確規則授權的細節全部說完：${"我描述一個不應被直接視為世界事實的念頭。".repeat(240)}`;

// [P0/P1 擴充] 超長 Unicode 字串不能只用 BMP 的中文字測——astral平面的emoji在UTF-16裡
// 是兩個code unit(surrogate pair)，如果字數計算不小心按UTF-16長度算會多算一倍，也可能
// 反過來被除以2少算，讓上限形同虛設(允許超過預期的內容送進LLM)。這裡確認真的超過
// 1000個code point的emoji字串一樣會被擋下，不會因為換成astral字元就繞過上限。
const OVERLONG_EMOJI_ACTION = "🔥".repeat(1500);

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

/** 超過1000個code point的emoji字串：確認長度限制是照Unicode code point算，不是UTF-16長度。 */
async function runOverlongEmojiActionCase() {
  const env = serverEnv();
  const originalFetch = globalThis.fetch;
  const fetchFn = responseSequence([
    { ok: true, status: 200, body: openAiSuccess("開場建立了可互動的走廊畫面。") },
    () => { throw new Error("超長emoji輸入不應進入 LLM"); },
  ]);
  globalThis.fetch = fetchFn;
  try {
    const sessionId = await createSession(env);
    const opening = await readJson(await turnPost(req(env, { sessionId })));
    assert.equal(opening.status, 200);
    const result = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: OVERLONG_EMOJI_ACTION,
      turnRequestId: "extreme-overlong-emoji-input",
    })));
    assert.equal(result.status, 422, "超過1000個code point的emoji輸入應在API層被拒絕");
    assert.equal(result.body.code, "PLAYER_ACTION_TOO_LONG");
    assert.equal(result.body.actualCharacters, 1500, "字數必須照code point算(1500)，不是UTF-16長度(3000)");
    assert.equal(fetchFn.calls.length, 1, "輸入超長時不應呼叫 LLM");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

/** 純空白(含全形空白/換行/tab)行動：trim()後是空字串，必須明確擋下，不能被靜默當成合法自由行動。 */
async function runWhitespaceActionCase() {
  const env = serverEnv();
  const originalFetch = globalThis.fetch;
  const fetchFn = responseSequence([
    { ok: true, status: 200, body: openAiSuccess("開場建立了可互動的走廊畫面。") },
    () => { throw new Error("純空白輸入不應進入 LLM"); },
  ]);
  globalThis.fetch = fetchFn;
  try {
    const sessionId = await createSession(env);
    const opening = await readJson(await turnPost(req(env, { sessionId })));
    assert.equal(opening.status, 200);
    const result = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: "   \n\t　　  \n",
      turnRequestId: "extreme-whitespace-input",
    })));
    assert.equal(result.status, 400, "純空白行動必須被明確擋下");
    assert.equal(result.body.ok, false);
    assert.match(result.body.error, /空字串/);
    assert.equal(fetchFn.calls.length, 1, "純空白輸入不應呼叫 LLM");
    const saved = await resolveSessionStore(env).get(sessionId);
    assert.equal(saved.turns, 1, "被拒絕的空白輸入不可增加回合數");
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
    retryAfterFormats: 0,
    boundedRetryCap: 0,
    allProvidersExhausted: 0,
    lastDiagnosticClears: 0,
    malformedResponses: 0,
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
  await runOverlongEmojiActionCase();
  await runWhitespaceActionCase();
  counts.rejectedInputs = 3;

  await runApi413FallbackCase();
  counts.apiFallbacks = 1;
  counts.rateLimitRetries = await run429RetryAfterMatrix();
  counts.retryAfterFormats = await runRetryAfterFormatMatrix();
  counts.boundedRetryCap = await runBoundedRetryCapCase();
  counts.allProvidersExhausted = await runAllProvidersExhaustedApiCase();
  counts.lastDiagnosticClears = await runLastLlmDiagnosticClearsCase();
  counts.malformedResponses = await runMalformedResponseMatrix();

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  console.log(`極端回合矩陣通過：${total} 個檢查，耗時 ${Date.now() - startedAt}ms`);
  console.table(counts);
}

main().catch((error) => {
  console.error("極端回合矩陣失敗：", error?.stack ?? error);
  process.exitCode = 1;
});
