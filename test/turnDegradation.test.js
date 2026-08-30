// /api/turn 的「內容來源」端對端測試 —— 這一組直接測 2026-08-16 任務A的那個bug。
//
// 症狀：玩家連續測試多輪，四個選項的文字**逐字**相同。
// 根本原因：AI沒有照JSON格式輸出時，parseTurnResponse() 失敗，選項整組退回
//   content/turnOptions.js 的 FALLBACK_OPTIONS（那是一組固定文字），而這件事
//   只在回應的 warnings 陣列裡留一句話——沒有任何呼叫端在讀 warnings，也沒有任何
//   伺服器端的 log，所以它可以連續發生幾十輪都沒人發現。回應本身是 HTTP 200 ok:true，
//   跟正常回合長得一模一樣。
//
// 所以這裡測的不是「保底選項會不會出現」（那是使用者要求的行為，版面一定要有四顆按鈕），
// 而是「保底選項出現時，回應裡有沒有留下**看得出來**的痕跡」。
//
// 一律用假的 env.AI binding 注入腳本，不需要金鑰也不會連網。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import { FALLBACK_OPTIONS, OPTION_COUNT } from "../content/turnOptions.js";
import { PROVIDERS } from "../content/llm/providers.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";

const DRAFT = {
  concept: { name: "測試輪迴者", gender: "男" },
  attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
  skills: { 格鬥: 3, 射擊: 0, 體魄: 1, 潛行: 0, 求生: 0, 偵察: 2, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 0 },
};

/** 假的 AI binding：每次呼叫回傳腳本裡的下一段文字（用完就一直回最後一段）。 */
function scriptedEnv(replies) {
  let i = 0;
  const calls = [];
  const env = {
    AI: {
      run: async (model, payload) => {
        calls.push({ model, payload });
        const reply = replies[Math.min(i, replies.length - 1)];
        i++;
        if (typeof reply === "function") return reply();
        return { response: reply };
      },
    },
  };
  env.calls = calls;
  return env;
}

function req(env, body) {
  return { request: { json: async () => body }, env };
}

async function readJson(res) {
  return { status: res.status, body: JSON.parse(await res.text()) };
}

/**
 * 這一組測試全部在測「AI回覆壞掉時的降級行為」，所以每個回合都必須真的走到LLM那一段。
 *
 * [2026-08-16] 刻意指定 echoInstitute 這個副本，而不是用預設副本：預設副本(新手副本
 * 諾斯托羅莫號)的第一章帶了固定開頭(openingNarration/openingOptions)，開場那一回合
 * 會在 functions/api/turn.js 直接短路回傳、**完全不呼叫AI**——那正是它存在的理由，
 * 但也代表拿它來測AI降級會什麼都測不到。echoInstitute 沒有固定開頭，開場照樣呼叫AI。
 */
const NO_SCRIPTED_OPENING_SCENARIO = "scenario.echo-institute-01";

async function newSession(env) {
  const res = await readJson(
    await sessionPost(
      req(env, { draft: DRAFT, sceneContext: "廢棄醫院的走廊", scenarioId: NO_SCRIPTED_OPENING_SCENARIO })
    )
  );
  assert.equal(res.body.ok, true, `建立存檔失敗：${res.body.error}`);
  return res.body.session.id;
}

async function newReferenceSession(env) {
  const res = await readJson(
    await sessionPost(
      req(env, { draft: DRAFT, scenarioId: "scenario.nostromo-01-v2" })
    )
  );
  assert.equal(res.body.ok, true, `建立 V2 存檔失敗：${res.body.error}`);
  return res.body.session.id;
}

function safeBridgeReply(label = "bridge") {
  return JSON.stringify({
    narration: `你${label}，但這個嘗試暫時沒有改變周遭局勢。通風系統的低鳴仍在持續。`,
    options: [],
    narrativeMode: "micro",
    threatAssessment: { level: "stable", reason: "沒有新增可觀察的危險變化。" },
  });
}

function responseSequence(responses) {
  const calls = [];
  let index = 0;
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    const next = responses[Math.min(index++, responses.length - 1)];
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      json: async () => next.body ?? {},
      text: async () => JSON.stringify(next.body ?? {}),
    };
  };
  fetchFn.calls = calls;
  return fetchFn;
}

/** 一段格式正確、每輪內容都不同的AI回覆。 */
function goodReply(n) {
  return JSON.stringify({
    narration: `第${n}輪的敘事：你推開一扇門，走進新的房間。`,
    options: [
      { label: `第${n}輪-檢查地上的痕跡`, attribute: "感知", skill: "偵察", difficulty: "容易" },
      { label: `第${n}輪-撞開鐵門`, attribute: "力量", skill: "格鬥", difficulty: "困難" },
      { label: `第${n}輪-向對面喊話`, attribute: "意志", skill: null, difficulty: "普通" },
      { label: `第${n}輪-沿牆邊摸過去`, attribute: "敏捷", skill: "體魄", difficulty: "普通" },
    ],
  });
}

test("/api/turn：server-managed primary 429 時切到下一家，規則層只執行一次且公開實際 provider", async () => {
  const originalFetch = globalThis.fetch;
  const fetchFn = responseSequence([
    { ok: false, status: 429, body: { error: "rate limited" } },
    { ok: true, status: 200, body: {
      choices: [{ message: { content: JSON.stringify({
        narration: "候補 provider 已完成本回合敘事。",
        options: [
          { label: "觀察走廊", attribute: "感知", skill: "偵察", difficulty: "容易" },
          { label: "推開鐵門", attribute: "力量", skill: "格鬥", difficulty: "困難" },
          { label: "保持安靜", attribute: "意志", skill: null, difficulty: "普通" },
          { label: "沿牆移動", attribute: "敏捷", skill: "體魄", difficulty: "普通" },
        ],
      }) } }],
    } },
  ]);
  globalThis.fetch = fetchFn;
  try {
    const env = {
      GROQ_API_KEY: "groq-key",
      MISTRAL_API_KEY: "mistral-key",
      LLM_FALLBACK_PROVIDERS: "mistral=mistral-small-latest",
    };
    const sessionId = await newSession(env);
    const result = await readJson(await turnPost(req(env, { sessionId })));
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.provider, "mistral");
    assert.equal(fetchFn.calls.length, 2);
    assert.equal(fetchFn.calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(fetchFn.calls[1].url, "https://api.mistral.ai/v1/chat/completions");

    const store = resolveSessionStore(env);
    const saved = await store.get(sessionId);
    assert.equal(saved.turns, 1, "fallback 成功後只應提交一個回合");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("/api/turn：server-managed primary 413 時切到下一家，不能把 request-too-large 當成整回合終止", async () => {
  const originalFetch = globalThis.fetch;
  const fetchFn = responseSequence([
    { ok: false, status: 413, body: { error: "request too large" } },
    { ok: true, status: 200, body: {
      choices: [{ message: { content: JSON.stringify({
        narration: "候補 provider 描寫了翻滾造成的衣料摩擦聲；走廊燈光在你抬頭時短暫熄滅。你接下來打算怎麼做？",
        options: [],
      }) } }],
    } },
  ]);
  globalThis.fetch = fetchFn;
  try {
    const env = {
      GROQ_API_KEY: "groq-key",
      MISTRAL_API_KEY: "mistral-key",
      LLM_FALLBACK_PROVIDERS: "mistral=mistral-small-latest",
    };
    const sessionId = await newSession(env);
    const result = await readJson(await turnPost(req(env, {
      sessionId,
      playerAction: "我原地翻跟斗",
      turnRequestId: "http-413-fallback-1",
    })));
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.provider, "mistral");
    assert.equal(fetchFn.calls.length, 2);
    const saved = await resolveSessionStore(env).get(sessionId);
    assert.equal(saved.turns, 1, "fallback 成功後只應提交一個回合");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 這個bug本身
// ---------------------------------------------------------------------------

test("AI回散文(不是JSON)時：選項確實整組退回保底，但回應必須明確標示出來", async () => {
  const env = scriptedEnv(["你推開門，鏽味嗆進喉嚨。走廊盡頭有一盞燈在閃。"]);
  const sessionId = await newSession(env);
  const { status, body } = await readJson(await turnPost(req(env, { sessionId })));

  // 行為本身沒變：版面一定有四顆按鈕（使用者明確要求的一致性保底）
  assert.equal(status, 200);
  assert.equal(body.options.length, OPTION_COUNT);
  assert.deepEqual(
    body.options.map((o) => o.label),
    FALLBACK_OPTIONS.map((o) => o.label),
    "AI沒給合法選項時，四個選項就是那組固定文字——這正是玩家觀察到的『逐字重複』"
  );

  // 變的是：這件事現在講得出來
  assert.equal(body.degraded.parseFailed, true);
  assert.equal(body.degraded.aiOptionCount, 0);
  assert.equal(body.degraded.fallbackOptionCount, OPTION_COUNT);
  for (const opt of body.options) {
    assert.equal(opt.source, "fallback", "每個保底選項都要標記來源，前端才能標示給玩家看");
  }
  assert.match(body.warnings.join(), /全部/);
});

test("AI回合法JSON時：degraded 不能誤報，選項要標成 ai", async () => {
  const env = scriptedEnv([goodReply(1)]);
  const sessionId = await newSession(env);
  const { body } = await readJson(await turnPost(req(env, { sessionId })));

  assert.equal(body.degraded.parseFailed, false);
  assert.equal(body.degraded.aiOptionCount, OPTION_COUNT);
  assert.equal(body.degraded.fallbackOptionCount, 0);
  assert.ok(body.options.every((o) => o.source === "ai"));
});

test("AI只給3個選項時：要跟『整組保底』分得開(aiOptionCount=3，不是0)", async () => {
  const env = scriptedEnv([
    JSON.stringify({
      narration: "走廊很長。",
      options: [
        { label: "檢查門把", attribute: "感知", skill: "偵察", difficulty: "容易" },
        { label: "撞開門", attribute: "力量", skill: "格鬥", difficulty: "困難" },
        { label: "喊話", attribute: "意志", skill: null, difficulty: "普通" },
      ],
    }),
  ]);
  const sessionId = await newSession(env);
  const { body } = await readJson(await turnPost(req(env, { sessionId })));

  assert.equal(body.degraded.aiOptionCount, 3);
  assert.equal(body.degraded.fallbackOptionCount, 1);
  assert.equal(body.options.filter((o) => o.source === "ai").length, 3);
  assert.equal(body.options.filter((o) => o.source === "fallback").length, 1);
});

test("連續5輪都拿到合法JSON時，選項不會逐字重複(這是修好之後應該看到的樣子)", async () => {
  const env = scriptedEnv([1, 2, 3, 4, 5].map((n) => goodReply(n)));
  const sessionId = await newSession(env);

  const seen = [];
  let prev = null;
  for (let round = 0; round < 5; round++) {
    const body = prev
      ? { sessionId, chosenOption: prev[0] }
      : { sessionId };
    const res = await readJson(await turnPost(req(env, body)));
    assert.equal(res.body.ok, true, `第${round + 1}輪失敗：${res.body.error}`);
    assert.equal(res.body.degraded.fallbackOptionCount, 0, `第${round + 1}輪不該出現保底選項`);
    seen.push(res.body.options.map((o) => o.label).join("|"));
    prev = res.body.options;
  }

  assert.equal(new Set(seen).size, 5, "五輪的選項組合必須各不相同，不能每輪都是同一組文字");
});

// ---------------------------------------------------------------------------
// LLM失敗時的回應（前端要能分辨「設定錯了」跟「供應商暫時掛了」）
// ---------------------------------------------------------------------------

test("LLM呼叫失敗時回502，並帶出 stage/httpStatus 讓前端決定要不要建議重試", async () => {
  const env = scriptedEnv([() => { throw new Error("was deprecated on 2026-05-30"); }]);
  const sessionId = await newSession(env);
  const { status, body } = await readJson(await turnPost(req(env, { sessionId })));

  assert.equal(status, 502);
  assert.equal(body.ok, false);
  // [安全][2026-08-24 second pass] body.error 不再直接帶出 LlmError.message 的原文——
  // 那個欄位可能整段帶著第三方供應商的原始回應本文，不該原樣送回瀏覽器
  // (見 content/llm/client.js 的 describeLlmFailure())。真正的原因寫進 server log，
  // 前端要分辨失敗原因看的是下面的 stage/httpStatus，這也是這則測試標題講的重點。
  assert.match(body.error, /敘事生成失敗/);
  assert.ok(!body.error.includes("deprecated"), "供應商回應原文不能出現在公開回應裡");
  assert.equal(body.llmFailure.stage, "binding");
  assert.equal(body.model, PROVIDERS["workers-ai"].defaultModel, "要指名哪個模型壞掉");
  assert.equal(body.retryable, true, "有存檔時應保存可重試回合");
    assert.ok(body.pendingTurn?.requestId);
});

test("V2 unmatched bridge：暫時性 provider failure 會在同一請求內自動重試一次", async () => {
  const env = scriptedEnv([
    () => { throw new Error("temporary upstream timeout"); },
    safeBridgeReply("重新整理袖口"),
  ]);
  env.LLM_JSON_MODE = "off";
  env.LLM_AUTO_RETRY_TIMEOUT_MS = "1000";
  const sessionId = await newReferenceSession(env);
  const opening = await readJson(await turnPost(req(env, { sessionId })));
  assert.equal(opening.status, 200);
  const result = await readJson(await turnPost(req(env, {
    sessionId,
    playerAction: "Count the rivets on my boots and wait silently.",
    turnRequestId: "auto-retry-success-1",
  })));
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.degraded.narrationSource, "bridge_llm");
  assert.equal(result.body.degraded.autoRetryAttempts, 1);
  assert.equal(result.body.pendingTurn ?? null, null);
  assert.equal(env.calls.length, 2, "第一次暫時失敗後只能再自動呼叫一次");

  const store = resolveSessionStore(env);
  const saved = await store.get(sessionId);
  assert.equal(saved.pendingTurn, null);
  assert.equal(saved.turns, 2, "開場與 bridge 回合各只結算一次");
  assert.equal(saved.history.length, 2, "自動 retry 不得重複寫入 history");
});

test("V2 unmatched bridge：兩次暫時性失敗後保留 pending，新行動回傳409且不重骰", async () => {
  const env = scriptedEnv([
    () => { throw new Error("temporary upstream timeout"); },
    () => { throw new Error("temporary upstream timeout again"); },
  ]);
  env.LLM_JSON_MODE = "off";
  env.LLM_AUTO_RETRY_TIMEOUT_MS = "1000";
  const sessionId = await newReferenceSession(env);
  const opening = await readJson(await turnPost(req(env, { sessionId })));
  assert.equal(opening.status, 200);
  const failed = await readJson(await turnPost(req(env, {
    sessionId,
    playerAction: "Count the rivets on my boots and wait silently.",
    turnRequestId: "auto-retry-failed-1",
  })));
  assert.equal(failed.status, 502);
  assert.equal(failed.body.retryable, true);
  assert.equal(failed.body.llmFailure.autoRetryAttempts, 1);
  assert.equal(failed.body.pendingTurn.requestId, "auto-retry-failed-1");
  assert.equal(env.calls.length, 2);

  const blocked = await readJson(await turnPost(req(env, {
    sessionId,
    playerAction: "I try a different action while the narrator is unavailable.",
    turnRequestId: "auto-retry-failed-new-action",
  })));
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.ok, false);
  assert.match(blocked.body.error, /規則結果已經保存|系統會自動接續|pending|重播/);
  assert.equal(env.calls.length, 2, "pending gate 不得讓新行動再次呼叫 LLM");
});

test("LLM在規則層後失敗：retryPending 必須沿用同一骰面且只結算一次", async () => {
  const env = scriptedEnv([
    goodReply(0),
    () => {
      const error = new Error("upstream 429");
      error.status = 429;
      error.stage = "upstream";
      throw error;
    },
    goodReply(1),
  ]);
  // Workers AI 對 schema 不支援時本來會自動再呼叫一次；本測試要鎖定真正的
  // provider failure，因此關閉那個既有相容 fallback。
  env.LLM_JSON_MODE = "off";
  const sessionId = await newSession(env);

  const opening = await readJson(await turnPost(req(env, { sessionId })));
  assert.equal(opening.body.ok, true);
  const chosenOption = opening.body.options[0];
  const failed = await readJson(await turnPost(req(env, {
    sessionId,
    chosenOption,
    turnRequestId: "audit-retry-1",
  })));

  assert.equal(failed.status, 502);
  assert.equal(failed.body.ok, false);
  assert.equal(failed.body.retryable, true);
  assert.ok(failed.body.checkResult, "規則層結果必須在失敗回應中保留");
  assert.equal(failed.body.pendingTurn.requestId, "audit-retry-1");

  const store = resolveSessionStore(env);
  const afterFailure = await store.get(sessionId);
  const savedRolls = afterFailure.pendingTurn.checkResult.rolls;
  const savedSpent = afterFailure.scenario.progress.timeBudget.spentRounds;
  assert.equal(afterFailure.turns, 1, "敘事尚未完成時不能先增加回合數");
  assert.equal(afterFailure.history.length, 1, "敘事尚未完成時不能先寫 history");
  assert.equal(afterFailure.log.events.length, 0, "敘事尚未完成時不能先寫 check event");

  const retried = await readJson(await turnPost(req(env, {
    sessionId,
    chosenOption,
    turnRequestId: "audit-retry-1",
    retryPending: true,
  })));
  assert.equal(retried.status, 200);
  assert.equal(retried.body.ok, true);
  assert.equal(retried.body.reusedCheck, true);
  assert.deepEqual(retried.body.checkResult.rolls, savedRolls, "重試不得重新擲骰");

  const completed = await store.get(sessionId);
  assert.equal(completed.pendingTurn, null, "成功寫回後不可留下可重播狀態");
  assert.equal(completed.turns, 2, "開場與玩家回合各只增加一次");
  assert.equal(completed.history.length, 2, "retry 只能新增一筆敘事");
  assert.equal(completed.chronicle.length, 2, "retry 只能新增一筆完整劇情");
  assert.equal(completed.log.events.filter((event) => event.type === "check").length, 1, "check event 只能寫一次");
  assert.equal(completed.scenario.progress.timeBudget.spentRounds, savedSpent, "retry 不得重扣章節時間");
  assert.equal(env.calls.length, 3, "開場、初次行動、retry 各一次 LLM 呼叫");
});

test("明確 retryPending 但沒有待完成回合時，回傳清楚的409而不執行新規則", async () => {
  const env = scriptedEnv([goodReply(0)]);
  const sessionId = await newSession(env);
  const response = await readJson(await turnPost(req(env, {
    sessionId,
    retryPending: true,
    turnRequestId: "no-pending",
  })));
  assert.equal(response.status, 409);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /沒有可重試/);
  assert.equal(env.calls.length, 0);
});

// ---------------------------------------------------------------------------
// 「選了供應商卻沒填金鑰」的半設定狀態（任務A第4點）
// ---------------------------------------------------------------------------

test("前端送來供應商但沒帶金鑰時，直接擋在最前面並指名缺什麼，不會偷偷改用伺服器的金鑰", async () => {
  const env = scriptedEnv([goodReply(1)]);
  env.GEMINI_API_KEY = "伺服器自己的金鑰"; // 這把金鑰不可以被拿來頂替玩家沒填的那把
  const sessionId = await newSession(env);

  const { status, body } = await readJson(
    await turnPost(req(env, { sessionId, provider: "gemini", apiKey: "" }))
  );

  assert.equal(status, 400);
  assert.match(body.error, /API金鑰/);
  assert.match(body.error, /使用伺服器預設/, "要告訴玩家怎麼修，不是只說哪裡錯");
  assert.equal(env.calls.length, 0, "這種請求根本不該打到LLM");
});

test("workers-ai 不需要金鑰，不可以被上面那道檢查誤擋", async () => {
  const env = scriptedEnv([goodReply(1)]);
  const sessionId = await newSession(env);
  const { body } = await readJson(await turnPost(req(env, { sessionId, provider: "workers-ai" })));
  assert.equal(body.ok, true);
});

test("沒有選供應商(用伺服器預設)時，一切照舊，不受新檢查影響", async () => {
  const env = scriptedEnv([goodReply(1)]);
  const sessionId = await newSession(env);
  const { body } = await readJson(await turnPost(req(env, { sessionId })));
  assert.equal(body.ok, true);
  assert.equal(body.provider, "workers-ai");
});

// ---------------------------------------------------------------------------
// 自訂OpenAI相容接口（任務C）—— 前端填的 baseUrl / model 要真的送得到 callLlm
// ---------------------------------------------------------------------------

test("custom 供應商：前端填的 baseUrl / model 要一路傳到實際的HTTP請求上", async () => {
  const captured = [];
  const env = {
    // custom 走 openai-chat，會用全域 fetch；這裡直接換掉全域的來攔截。
    AI: undefined,
  };
  const sessionId = await newSession({ AI: { run: async () => ({ response: goodReply(1) }) } });

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    captured.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: goodReply(1) } }] }),
      text: async () => "",
    };
  };
  try {
    const { body } = await readJson(
      await turnPost(
        req(env, {
          sessionId,
          provider: "custom",
          apiKey: "my-key",
          baseUrl: "https://my-vllm.example.com/v1/",
          model: "my-local-model",
        })
      )
    );
    assert.equal(body.ok, true, `失敗：${body.error}`);
    assert.equal(body.model, "my-local-model");
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(captured.length, 1);
  assert.equal(
    captured[0].url,
    "https://my-vllm.example.com/v1/chat/completions",
    "結尾多餘的斜線要被吃掉，不能組出 //chat/completions"
  );
  assert.equal(captured[0].options.headers.authorization, "Bearer my-key");
  assert.equal(JSON.parse(captured[0].options.body).model, "my-local-model");
});

test("custom 供應商沒填 baseUrl 時要在最前面擋下，錯誤訊息要指名該去哪裡填", async () => {
  const env = scriptedEnv([goodReply(1)]);
  const sessionId = await newSession(env);
  const { status, body } = await readJson(
    await turnPost(req(env, { sessionId, provider: "custom", apiKey: "k", model: "m" }))
  );
  assert.equal(status, 400);
  assert.match(body.error, /Base URL/);
  assert.equal(env.calls.length, 0);
});

test("沒有預設模型的供應商，沒填模型名稱時要擋下並附上型錄連結", async () => {
  // [2026-08-18] 這條原本用 openrouter 當例子（它當時刻意沒有預設模型），
  // 後來 openrouter 被指定了預設模型，這個請求就會**真的打到網路上**——
  // 單元測試打外網不但慢，還會因為別人的服務回401而變成假的失敗。
  // 改用同樣沒有預設模型、而且一定不會連線的 custom，測的規則完全一樣。
  const env = scriptedEnv([goodReply(1)]);
  const sessionId = await newSession(env);
  const { status, body } = await readJson(
    await turnPost(
      req(env, { sessionId, provider: "custom", apiKey: "k", baseUrl: "https://中轉.example/v1" })
    )
  );
  assert.equal(status, 400);
  assert.match(body.error, /模型/);
  assert.match(body.error, /沒有預設模型/);
  assert.equal(env.calls.length, 0);
});
