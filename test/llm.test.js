// content/llm/ 的測試 —— 全部用假的 fetchFn / 假的 AI binding 依賴注入，不需要任何真金鑰，
// 也不會真的連上網路。測的是「HTTP請求組裝對不對」與「失敗時有沒有明確報錯」。
//
// 這裡沒辦法測的事(誠實列出)：這些端點/模型名稱在真實世界是不是還存在、金鑰有沒有效、
// 第三方中轉是不是真的相容OpenAI格式。那些只能靠實際部署後打一次來驗證，見 LLM_PROVIDERS.md。
import test from "node:test";
import assert from "node:assert/strict";
import {
  callLlm,
  LlmError,
  DEFAULT_MAX_TOKENS,
  MAX_LLM_OUTPUT_TOKENS,
  MAX_LLM_PROMPT_CHARS,
  MAX_LLM_SYSTEM_CHARS,
  extractWorkersAiText,
  callLlmWithFallback,
  isRetryableLlmError,
  resolveAutoRetryConfig,
  autoRetryDelayMs,
} from "../content/llm/client.js";
import {
  PROVIDERS,
  PROVIDER_IDS,
  resolveProvider,
  pickProvider,
  resolveServerProviderChain,
} from "../content/llm/providers.js";

/** 做一個假的fetch，記錄呼叫參數並回傳指定的JSON */
function fakeFetch(responseJson, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    return {
      ok,
      status,
      json: async () => responseJson,
      text: async () => JSON.stringify(responseJson),
    };
  };
  fn.calls = calls;
  return fn;
}

function sequenceFetch(responses) {
  const calls = [];
  let index = 0;
  const fn = async (url, options) => {
    calls.push({ url, options });
    const next = responses[Math.min(index++, responses.length - 1)];
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      json: async () => next.body ?? {},
      text: async () => JSON.stringify(next.body ?? {}),
    };
  };
  fn.calls = calls;
  return fn;
}

const OPENAI_OK = { choices: [{ message: { content: "測試敘事文字" } }] };
const GEMINI_OK = { candidates: [{ content: { parts: [{ text: "測試敘事文字" }] } }] };

// --- 供應商註冊表本身 ---

test("每個供應商的設定都完整(有label/protocol/docs)，避免新增時漏填欄位", () => {
  for (const id of PROVIDER_IDS) {
    const p = PROVIDERS[id];
    assert.ok(p.label, `${id} 缺 label`);
    assert.ok(p.protocol, `${id} 缺 protocol`);
    assert.ok(p.docs, `${id} 缺 docs(出處連結，之後要重新核對端點時需要)`);
  }
});

test("resolveProvider：優先序是 呼叫端傳入 > 環境變數 > 供應商預設值", () => {
  const env = { LLM_MODEL: "env-model", GEMINI_API_KEY: "env-key" };

  const fromDefault = resolveProvider("gemini", {});
  assert.equal(fromDefault.model, PROVIDERS.gemini.defaultModel);

  const fromEnv = resolveProvider("gemini", env);
  assert.equal(fromEnv.model, "env-model");
  assert.equal(fromEnv.apiKey, "env-key");

  const fromOverride = resolveProvider("gemini", env, { model: "explicit-model" });
  assert.equal(fromOverride.model, "explicit-model");
});

test("resolveProvider：baseUrl結尾的斜線會被去掉，避免組出 //chat/completions", () => {
  const cfg = resolveProvider("custom", { LLM_BASE_URL: "https://example.com/v1/" });
  assert.equal(cfg.baseUrl, "https://example.com/v1");
});

test("resolveProvider：未知供應商要丟出有幫助的錯誤(列出可用選項與custom的走法)", () => {
  assert.throws(() => resolveProvider("不存在的供應商", {}), /custom/);
});

test("pickProvider：依環境自動挑選，明確指定的LLM_PROVIDER最優先", () => {
  assert.equal(pickProvider({ LLM_PROVIDER: "deepseek", GEMINI_API_KEY: "k" }), "deepseek");
  assert.equal(pickProvider({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" }), "groq");
  assert.equal(pickProvider({ GEMINI_API_KEY: "k" }), "gemini");
  assert.equal(pickProvider({ DEEPSEEK_API_KEY: "k" }), "deepseek");
  assert.equal(pickProvider({ MISTRAL_API_KEY: "k" }), "mistral");
  assert.equal(pickProvider({ NVIDIA_API_KEY: "k" }), "nvidia");
  assert.equal(pickProvider({ OPENROUTER_API_KEY: "k" }), "openrouter");
  assert.equal(pickProvider({ LLM_API_KEY: "k", LLM_BASE_URL: "https://x/v1" }), "custom");
});

test("pickProvider：什麼金鑰都沒有但有AI binding時，退到免金鑰的Workers AI", () => {
  assert.equal(pickProvider({ AI: { run: () => {} } }), "workers-ai");
});

test("pickProvider：什麼都沒有時回傳null(讓呼叫端明確報錯，不是偷偷用假資料)", () => {
  assert.equal(pickProvider({}), null);
});

test("server fallback chain：免費 provider 按 Groq → Workers AI → SiliconFlow → NVIDIA → Mistral，付費 provider 預設不加入", () => {
  const chain = resolveServerProviderChain({
    GROQ_API_KEY: "groq-key",
    AI: { run: () => {} },
    SILICONFLOW_API_KEY: "siliconflow-key",
    NVIDIA_API_KEY: "nvidia-key",
    MISTRAL_API_KEY: "mistral-key",
    GEMINI_API_KEY: "gemini-key",
  });
  assert.deepEqual(chain.map((entry) => entry.id), ["groq", "workers-ai", "siliconflow", "nvidia", "mistral"]);

  const paidChain = resolveServerProviderChain({
    GROQ_API_KEY: "groq-key",
    GEMINI_API_KEY: "gemini-key",
    LLM_ALLOW_PAID_FALLBACK: "true",
  });
  assert.deepEqual(paidChain.map((entry) => entry.id), ["groq", "gemini"]);
});

test("server fallback chain：每個 fallback 可指定模型，且不沿用 primary 的 LLM_MODEL", () => {
  const chain = resolveServerProviderChain({
    LLM_PROVIDER: "groq",
    LLM_MODEL: "primary-model",
    GROQ_API_KEY: "groq-key",
    MISTRAL_API_KEY: "mistral-key",
    LLM_FALLBACK_PROVIDERS: "mistral=mistral-small-latest",
  });
  assert.deepEqual(chain, [
    { id: "groq", model: "primary-model" },
    { id: "mistral", model: "mistral-small-latest" },
  ]);
});

test("callLlmWithFallback：primary 429 時切到下一家，回傳實際成功 provider", async () => {
  const ff = sequenceFetch([
    { ok: false, status: 429, body: { error: "rate limited" } },
    { ok: true, status: 200, body: OPENAI_OK },
  ]);
  const result = await callLlmWithFallback({
    env: { GROQ_API_KEY: "groq-key", MISTRAL_API_KEY: "mistral-key" },
    prompt: "x",
    fetchFn: ff,
  });
  assert.equal(result.provider, "mistral");
  assert.equal(ff.calls.length, 2);
  assert.equal(ff.calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(ff.calls[1].url, "https://api.mistral.ai/v1/chat/completions");
});

test("callLlmWithFallback：Groq 429 後可退到免金鑰 Workers AI", async () => {
  const ff = sequenceFetch([{ ok: false, status: 429, body: { error: "rate limited" } }]);
  const calls = [];
  const result = await callLlmWithFallback({
    env: {
      GROQ_API_KEY: "groq-key",
      AI: {
        run: async (model, payload) => {
          calls.push({ model, payload });
          return { response: JSON.stringify(OPENAI_OK) };
        },
      },
    },
    prompt: "x",
    fetchFn: ff,
  });
  assert.equal(result.provider, "workers-ai");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, PROVIDERS["workers-ai"].defaultModel);
});

test("server fallback chain：明確列出付費 provider 但未開閘門時拒絕設定", () => {
  assert.throws(
    () => resolveServerProviderChain({
      GROQ_API_KEY: "groq-key",
      DEEPSEEK_API_KEY: "deepseek-key",
      LLM_FALLBACK_PROVIDERS: "deepseek=deepseek-v4-flash",
    }),
    /LLM_ALLOW_PAID_FALLBACK/
  );
});

test("server fallback chain：自動挑選內建 provider 時不繼承 custom 的 LLM_BASE_URL", async () => {
  const ff = sequenceFetch([{ ok: true, status: 200, body: OPENAI_OK }]);
  await callLlmWithFallback({
    env: {
      GROQ_API_KEY: "groq-key",
      LLM_BASE_URL: "https://attacker-configured-proxy.invalid/v1",
    },
    prompt: "x",
    fetchFn: ff,
  });
  assert.equal(ff.calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
});

test("callLlmWithFallback：401 不切換 provider，避免掩蓋錯誤金鑰或錯誤設定", async () => {
  const ff = fakeFetch({ error: "bad key" }, { ok: false, status: 401 });
  await assert.rejects(
    () => callLlmWithFallback({
      env: { GROQ_API_KEY: "bad-key", MISTRAL_API_KEY: "mistral-key" },
      prompt: "x",
      fetchFn: ff,
    }),
    (err) => err.status === 401 && err.provider === "groq"
  );
  assert.equal(ff.calls.length, 1);
});

test("callLlmWithFallback：不接受 provider／apiKey/baseUrl override，避免 BYOK 混入 server chain", async () => {
  await assert.rejects(
    () => callLlmWithFallback({ provider: "custom", apiKey: "user-key", prompt: "x" }),
    (err) => err instanceof LlmError && err.stage === "config"
  );
});

// --- OpenAI相容線路(DeepSeek / OpenRouter / 第三方中轉共用) ---

test("DeepSeek：打到 /chat/completions，帶Bearer金鑰與system/user兩則訊息", async () => {
  const ff = fakeFetch(OPENAI_OK);
  const result = await callLlm({
    provider: "deepseek",
    env: { DEEPSEEK_API_KEY: "ds-key" },
    systemInstruction: "你是說書人",
    prompt: "玩家開槍",
    fetchFn: ff,
  });

  assert.equal(result.text, "測試敘事文字");
  assert.equal(result.provider, "deepseek");
  assert.equal(result.model, PROVIDERS.deepseek.defaultModel);

  const { url, options } = ff.calls[0];
  assert.equal(url, "https://api.deepseek.com/v1/chat/completions");
  assert.equal(options.headers.authorization, "Bearer ds-key");

  const sent = JSON.parse(options.body);
  assert.equal(sent.model, PROVIDERS.deepseek.defaultModel);
  assert.deepEqual(sent.messages, [
    { role: "system", content: "你是說書人" },
    { role: "user", content: "玩家開槍" },
  ]);
});

test("Groq：打到官方 OpenAI-compatible endpoint，使用預設 structured-output 模型", async () => {
  const ff = fakeFetch(OPENAI_OK);
  const result = await callLlm({
    provider: "groq",
    env: { GROQ_API_KEY: "groq-key" },
    prompt: "玩家開門",
    fetchFn: ff,
  });
  assert.equal(result.provider, "groq");
  assert.equal(result.model, PROVIDERS.groq.defaultModel);
  assert.equal(ff.calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(ff.calls[0].options.headers.authorization, "Bearer groq-key");
});

test("Mistral：打到官方 chat completions endpoint，帶Bearer金鑰", async () => {
  const ff = fakeFetch(OPENAI_OK);
  const result = await callLlm({
    provider: "mistral",
    env: { MISTRAL_API_KEY: "mistral-key" },
    prompt: "玩家開門",
    fetchFn: ff,
  });
  assert.equal(result.provider, "mistral");
  assert.equal(result.model, PROVIDERS.mistral.defaultModel);
  assert.equal(ff.calls[0].url, "https://api.mistral.ai/v1/chat/completions");
  assert.equal(ff.calls[0].options.headers.authorization, "Bearer mistral-key");
});

test("NVIDIA NIM：打到 /chat/completions，帶Bearer金鑰，走OpenAI相容線路", async () => {
  const ff = fakeFetch(OPENAI_OK);
  const result = await callLlm({
    provider: "nvidia",
    env: { NVIDIA_API_KEY: "nv-key" },
    systemInstruction: "你是說書人",
    prompt: "玩家開槍",
    fetchFn: ff,
  });

  assert.equal(result.text, "測試敘事文字");
  assert.equal(result.provider, "nvidia");
  assert.equal(result.model, PROVIDERS.nvidia.defaultModel);

  const { url, options } = ff.calls[0];
  assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
  assert.equal(options.headers.authorization, "Bearer nv-key");
});

test("OpenRouter：帶上官方建議的HTTP-Referer/X-Title，LLM_MODEL 蓋得過預設模型", async () => {
  const ff = fakeFetch(OPENAI_OK);

  // [2026-08-18] OpenRouter原本刻意沒有預設模型，後來由使用者指定了一個。
  // `:free` 系列的slug會輪替，所以「環境變數蓋得過預設值」這條路必須一直有效——
  // 型錄上的名字變了的時候，那是唯一不用改程式碼就能救回來的方式。
  await callLlm({ provider: "openrouter", env: { OPENROUTER_API_KEY: "k" }, prompt: "x", fetchFn: ff });
  assert.equal(JSON.parse(ff.calls[0].options.body).model, PROVIDERS.openrouter.defaultModel);

  await callLlm({
    provider: "openrouter",
    env: { OPENROUTER_API_KEY: "k", LLM_MODEL: "some-model:free" },
    prompt: "x",
    fetchFn: ff,
  });
  assert.equal(ff.calls[1].options.headers["X-Title"], "AI-TRPG");
  assert.equal(JSON.parse(ff.calls[1].options.body).model, "some-model:free");
});

test("沒有預設模型的供應商(custom)：沒指定模型時要報錯而不是亂猜一個", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await assert.rejects(
    () =>
      callLlm({
        provider: "custom",
        env: { LLM_API_KEY: "k", LLM_BASE_URL: "https://中轉.example/v1" },
        prompt: "x",
        fetchFn: ff,
      }),
    /LLM_MODEL/
  );
});

test("金鑰環境變數：舊名稱(別名)也讀得到，已經照舊名設好secret的部署不會斷掉", async () => {
  const ff = fakeFetch(OPENAI_OK);
  // 這兩個舊名是2026-08-18那次手改留下來的，正名之後仍然要能動——
  // 環境變數設在Cloudflare主控台裡，改程式碼不會同步改到那一份。
  await callLlm({ provider: "siliconflow", env: { SiliconFlow_API_KEY: "sf" }, prompt: "x", fetchFn: ff });
  assert.equal(ff.calls[0].options.headers.authorization, "Bearer sf");

  await callLlm({ provider: "openrouter", env: { API_KEY: "or" }, prompt: "x", fetchFn: ff });
  assert.equal(ff.calls[1].options.headers.authorization, "Bearer or");
});

test("pickProvider：金鑰用舊名稱設的部署也要挑得到同一家", () => {
  assert.equal(pickProvider({ SiliconFlow_API_KEY: "k" }), "siliconflow");
  assert.equal(pickProvider({ API_KEY: "k" }), "openrouter");
});

test("custom：任意第三方OpenAI相容接口只靠環境變數就能接上，不用改程式碼", async () => {
  const ff = fakeFetch(OPENAI_OK);
  const result = await callLlm({
    provider: "custom",
    env: {
      LLM_BASE_URL: "https://my-relay.example.com/v1",
      LLM_MODEL: "gpt-4o-mini",
      LLM_API_KEY: "relay-key",
    },
    prompt: "x",
    fetchFn: ff,
  });

  assert.equal(result.text, "測試敘事文字");
  assert.equal(ff.calls[0].url, "https://my-relay.example.com/v1/chat/completions");
  assert.equal(ff.calls[0].options.headers.authorization, "Bearer relay-key");
});

test("custom：沒設定baseUrl時錯誤訊息要講清楚該設哪個環境變數", async () => {
  await assert.rejects(
    () => callLlm({ provider: "custom", env: { LLM_MODEL: "m", LLM_API_KEY: "k" }, prompt: "x" }),
    /LLM_BASE_URL/
  );
});

test("OpenAI相容線路：缺金鑰要指名該設哪個環境變數", async () => {
  await assert.rejects(
    () => callLlm({ provider: "deepseek", env: {}, prompt: "x" }),
    /DEEPSEEK_API_KEY/
  );
});

test("OpenAI相容線路：回應格式不符時要點出「第三方中轉可能沒真的相容」這個常見原因", async () => {
  const ff = fakeFetch({ unexpected: "shape" });
  await assert.rejects(
    () => callLlm({ provider: "deepseek", env: { DEEPSEEK_API_KEY: "k" }, prompt: "x", fetchFn: ff }),
    /相容/
  );
});

test("OpenAI相容線路：非2xx要丟出含HTTP狀態碼的錯誤，不是靜默失敗", async () => {
  const ff = fakeFetch({ error: "bad key" }, { ok: false, status: 401 });
  await assert.rejects(
    () => callLlm({ provider: "deepseek", env: { DEEPSEEK_API_KEY: "k" }, prompt: "x", fetchFn: ff }),
    /HTTP 401/
  );
});

test("isRetryableLlmError：只把暫時性 provider failure 判為可切換", () => {
  assert.equal(isRetryableLlmError({ stage: "http", status: 429 }), true);
  assert.equal(isRetryableLlmError({ stage: "timeout" }), true);
  assert.equal(isRetryableLlmError({ stage: "binding" }), true);
  assert.equal(isRetryableLlmError({ stage: "shape" }), true);
  assert.equal(isRetryableLlmError({ stage: "http", status: 401 }), false);
  assert.equal(isRetryableLlmError({ stage: "http", status: 400 }), false);
  assert.equal(isRetryableLlmError({ stage: "config" }), false);
  assert.equal(isRetryableLlmError({ stage: "ssrf-blocked" }), false);
});

test("bounded retry 設定：重試 timeout 不超過原始 timeout，且 delay 有硬上限", () => {
  assert.deepEqual(resolveAutoRetryConfig({}), { maxDelayMs: 5000, retryTimeoutMs: 30000 });
  assert.deepEqual(resolveAutoRetryConfig({ LLM_REQUEST_TIMEOUT_MS: "120000" }), { maxDelayMs: 5000, retryTimeoutMs: 30000 });
  assert.deepEqual(resolveAutoRetryConfig({ LLM_REQUEST_TIMEOUT_MS: "20000", LLM_AUTO_RETRY_TIMEOUT_MS: "60000" }), { maxDelayMs: 5000, retryTimeoutMs: 20000 });
  assert.deepEqual(resolveAutoRetryConfig({ LLM_AUTO_RETRY_MAX_DELAY_MS: "90000" }).maxDelayMs, 30000);
  assert.equal(autoRetryDelayMs({ stage: "timeout" }, {}), 250);
  assert.equal(autoRetryDelayMs({ stage: "http", status: 429, retryAfterMs: 1000 }, {}), 1000);
  assert.equal(autoRetryDelayMs({ stage: "http", status: 429, retryAfterMs: 6000 }, {}), null);
});

// --- Gemini線路 ---

test("Gemini：打到 models/{model}:generateContent，用x-goog-api-key而不是Bearer", async () => {
  const ff = fakeFetch(GEMINI_OK);
  const result = await callLlm({
    provider: "gemini",
    env: { GEMINI_API_KEY: "g-key" },
    systemInstruction: "你是說書人",
    prompt: "玩家開槍",
    fetchFn: ff,
  });

  assert.equal(result.text, "測試敘事文字");
  const { url, options } = ff.calls[0];
  assert.match(url, /generativelanguage\.googleapis\.com/);
  assert.match(url, /:generateContent$/);
  assert.equal(options.headers["x-goog-api-key"], "g-key");

  const sent = JSON.parse(options.body);
  assert.equal(sent.system_instruction.parts[0].text, "你是說書人");
  assert.equal(sent.contents[0].parts[0].text, "玩家開槍");
});

// --- Cloudflare Workers AI（binding，不走HTTP） ---

test("Workers AI：透過env.AI.run呼叫，不需要任何API金鑰", async () => {
  const calls = [];
  const env = {
    AI: {
      run: async (model, payload) => {
        calls.push({ model, payload });
        return { response: "測試敘事文字" };
      },
    },
  };

  const result = await callLlm({
    provider: "workers-ai",
    env,
    systemInstruction: "你是說書人",
    prompt: "玩家開槍",
  });

  assert.equal(result.text, "測試敘事文字");
  assert.equal(calls[0].model, PROVIDERS["workers-ai"].defaultModel);
  assert.deepEqual(calls[0].payload.messages, [
    { role: "system", content: "你是說書人" },
    { role: "user", content: "玩家開槍" },
  ]);
});

test("Workers AI：沒有binding時要明確說出該怎麼修，不是丟undefined錯誤", async () => {
  await assert.rejects(
    () => callLlm({ provider: "workers-ai", env: {}, prompt: "x" }),
    /wrangler/
  );
});

test("callLlm：沒有prompt要丟錯", async () => {
  await assert.rejects(() => callLlm({ provider: "gemini", env: { GEMINI_API_KEY: "k" } }));
});

// ---------------------------------------------------------------------------
// 失敗時的結構化錯誤（2026-08-16 新增，見任務A）
//
// 這一組測試的用意不是「錯誤訊息長什麼樣」，而是「失敗原因有沒有被完整帶出來」。
// 先前失敗一律丟普通 Error，只有一句 message；呼叫端(functions/api/turn.js)想在
// Cloudflare 的 log 裡記下「哪一家、哪個模型、HTTP幾號」時無從取得，只能整包吞掉，
// 結果就是金鑰失效/額度用盡這種最常見的狀況在伺服器端完全查不到。
// ---------------------------------------------------------------------------

test("LlmError：HTTP錯誤要帶出 provider / model / status / 回應本文，不能只剩一句message", async () => {
  const ff = fakeFetch({ error: { message: "Insufficient Balance" } }, { ok: false, status: 402 });
  const err = await callLlm({
    provider: "deepseek",
    env: { DEEPSEEK_API_KEY: "k" },
    prompt: "玩家開槍",
    fetchFn: ff,
  }).then(() => null, (e) => e);

  assert.ok(err instanceof LlmError, "失敗要丟 LlmError 而不是普通 Error");
  assert.equal(err.provider, "deepseek");
  assert.equal(err.model, PROVIDERS.deepseek.defaultModel);
  assert.equal(err.status, 402, "HTTP狀態碼要留著——這是分辨『金鑰無效(401)』與『額度用盡(402/429)』的唯一依據");
  assert.equal(err.stage, "http");
  assert.match(err.bodySnippet, /Insufficient Balance/, "供應商的錯誤本文要留下來，否則沒人知道為什麼被拒絕");
});

test("LlmError：缺金鑰屬於設定問題(stage=config)，不是HTTP錯誤，status要是null", async () => {
  const err = await callLlm({ provider: "deepseek", env: {}, prompt: "x" }).then(() => null, (e) => e);
  assert.ok(err instanceof LlmError);
  assert.equal(err.stage, "config", "設定問題要跟供應商回錯分開——前者重試沒有意義");
  assert.equal(err.status, null);
});

test("LlmError：回應形狀不符(stage=shape)也要帶出原始回應，才能判斷是不是第三方中轉不相容", async () => {
  const ff = fakeFetch({ 這不是: "OpenAI格式" });
  const err = await callLlm({
    provider: "openrouter",
    env: { OPENROUTER_API_KEY: "k", LLM_MODEL: "some/model" },
    prompt: "x",
    fetchFn: ff,
  }).then(() => null, (e) => e);

  assert.equal(err.stage, "shape");
  assert.match(err.bodySnippet, /這不是/);
});

test("LlmError：Workers AI 的 binding 自己丟錯(例如模型被下架)時也要包成 LlmError 帶出模型名", async () => {
  const env = { AI: { run: async () => { throw new Error("was deprecated on 2026-05-30"); } } };
  const err = await callLlm({ provider: "workers-ai", env, prompt: "x" }).then(() => null, (e) => e);

  assert.ok(err instanceof LlmError);
  assert.equal(err.stage, "binding");
  assert.equal(err.model, PROVIDERS["workers-ai"].defaultModel, "要指名是哪個模型壞掉，否則看log的人不知道該去改哪一個值");
  assert.match(err.message, /deprecated/);
});

// ---------------------------------------------------------------------------
// 輸出長度上限（2026-08-16 線上實測發現的bug）
//
// 部署到 Cloudflare Pages 後連續多輪實測 /api/turn：敘事穩定地寫到100~110個中文字
// 就斷掉、options 完全沒出現、選項整組退回保底文字。那不是「模型不會寫JSON」，
// 是沒有指定 max_tokens 時端點預設只給 256 個 token，中文又特別吃 token，
// 模型還沒輪到寫 "options" 就被切斷。這一組測試釘住「三種線路格式都要把上限送出去」。
// ---------------------------------------------------------------------------

test("max_tokens：OpenAI相容格式要把上限放進請求body，不能讓端點用它自己的預設值", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({ provider: "deepseek", env: { DEEPSEEK_API_KEY: "k" }, prompt: "x", fetchFn: ff });
  const sent = JSON.parse(ff.calls[0].options.body);
  assert.equal(sent.max_tokens, DEFAULT_MAX_TOKENS);
});

test("max_tokens：Gemini用的欄位是 generationConfig.maxOutputTokens(名字跟OpenAI不一樣)", async () => {
  const ff = fakeFetch(GEMINI_OK);
  await callLlm({ provider: "gemini", env: { GEMINI_API_KEY: "k" }, prompt: "x", fetchFn: ff });
  const sent = JSON.parse(ff.calls[0].options.body);
  assert.equal(sent.generationConfig.maxOutputTokens, DEFAULT_MAX_TOKENS);
});

test("max_tokens：Workers AI 也要帶上（這就是線上真的被截斷的那一條路）", async () => {
  const calls = [];
  const env = { AI: { run: async (model, payload) => { calls.push(payload); return { response: "x" }; } } };
  await callLlm({ provider: "workers-ai", env, prompt: "x" });
  assert.equal(calls[0].max_tokens, DEFAULT_MAX_TOKENS);
});

test("max_tokens：環境變數 LLM_MAX_TOKENS 可以覆寫，呼叫端傳入又贏過環境變數", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({ provider: "deepseek", env: { DEEPSEEK_API_KEY: "k", LLM_MAX_TOKENS: "512" }, prompt: "x", fetchFn: ff });
  assert.equal(JSON.parse(ff.calls[0].options.body).max_tokens, 512);

  const ff2 = fakeFetch(OPENAI_OK);
  await callLlm({
    provider: "deepseek",
    env: { DEEPSEEK_API_KEY: "k", LLM_MAX_TOKENS: "512" },
    prompt: "x",
    maxTokens: 4096,
    fetchFn: ff2,
  });
  assert.equal(JSON.parse(ff2.calls[0].options.body).max_tokens, 4096);
});

test("max_tokens：環境變數是垃圾值時退回預設，不可以把 NaN 送給供應商", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({ provider: "deepseek", env: { DEEPSEEK_API_KEY: "k", LLM_MAX_TOKENS: "很多" }, prompt: "x", fetchFn: ff });
  assert.equal(JSON.parse(ff.calls[0].options.body).max_tokens, DEFAULT_MAX_TOKENS);
});

test("max_tokens：request與環境變數都不能超過server硬上限", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({
    provider: "deepseek",
    env: { DEEPSEEK_API_KEY: "k", LLM_MAX_TOKENS: "999999" },
    prompt: "x",
    maxTokens: 999999,
    fetchFn: ff,
  });
  assert.equal(JSON.parse(ff.calls[0].options.body).max_tokens, MAX_LLM_OUTPUT_TOKENS);
});

test("prompt資源界線：system instruction與prompt超長時會按Unicode字元截斷後才送出", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({
    provider: "deepseek",
    env: { DEEPSEEK_API_KEY: "k" },
    prompt: "玩家行動😀".repeat(MAX_LLM_PROMPT_CHARS),
    systemInstruction: "規則契約😀".repeat(MAX_LLM_SYSTEM_CHARS),
    fetchFn: ff,
  });
  const sent = JSON.parse(ff.calls[0].options.body);
  const system = sent.messages.find((message) => message.role === "system")?.content ?? "";
  const user = sent.messages.find((message) => message.role === "user")?.content ?? "";
  assert.ok(Array.from(system).length <= MAX_LLM_SYSTEM_CHARS);
  assert.ok(Array.from(user).length <= MAX_LLM_PROMPT_CHARS);
});

// ---------------------------------------------------------------------------
// Workers AI 的回應形狀（2026-08-16 線上實測第二層發現）
//
// 修好 max_tokens 截斷之後，同一個端點開始回 502「response欄位不存在」，
// 但原始回應裡 response 明明就在——只是變成了**物件**：Workers AI 會在模型輸出
// 剛好是合法JSON時幫你解析好。這個分支以前永遠碰不到，因為輸出一直被截斷、
// 從來沒有合法過。一個bug擋住了另一個bug。
// ---------------------------------------------------------------------------

test("Workers AI：response 是字串時照舊直接使用", () => {
  assert.equal(extractWorkersAiText({ response: "純文字敘事" }), "純文字敘事");
});

test("Workers AI：response 是物件時(輸出剛好是合法JSON)要轉回JSON字串，不能當成格式錯誤", () => {
  const parsed = { narration: "敘事", options: [{ label: "選項" }] };
  const text = extractWorkersAiText({ response: parsed });
  assert.equal(typeof text, "string");
  assert.deepEqual(JSON.parse(text), parsed, "轉回字串之後下游 parseTurnResponse 要能原樣解析回來");
});

test("Workers AI：新的OpenAI形狀envelope(choices[])也要認得", () => {
  const raw = { choices: [{ message: { content: "{\"narration\":\"敘事\"}" } }] };
  assert.equal(extractWorkersAiText(raw), "{\"narration\":\"敘事\"}");
});

test("Workers AI：三種來源同時存在時，優先用最接近模型原始輸出的那一個", () => {
  const raw = {
    response: "原始文字",
    choices: [{ message: { content: "envelope文字" } }],
  };
  assert.equal(extractWorkersAiText(raw), "原始文字");
});

test("Workers AI：真的取不出文字時回 null(由呼叫端丟出帶原始回應的錯誤)", () => {
  assert.equal(extractWorkersAiText({ 完全不認識的形狀: 1 }), null);
  assert.equal(extractWorkersAiText(null), null);
});

test("Workers AI 端對端：response 是物件時 callLlm 要成功回傳，不是丟 shape 錯誤", async () => {
  const env = {
    AI: {
      run: async () => ({
        choices: [{ message: { content: "{\"narration\":\"從envelope來的\"}" } }],
        response: { narration: "被Cloudflare解析過的" },
      }),
    },
  };
  const result = await callLlm({ provider: "workers-ai", env, prompt: "x" });
  assert.equal(typeof result.text, "string");
  assert.match(result.text, /從envelope來的/, "有原始文字時優先用它");
});

// ---------------------------------------------------------------------------
// 結構化輸出（2026-08-16）—— 把「祈禱模型照prompt寫JSON」換成「格式由協定保證」。
// 線上實測 8B 模型光靠 prompt 大約每四輪會有一輪寫出不合法的JSON。
// ---------------------------------------------------------------------------

const SCHEMA = { type: "object", properties: { narration: { type: "string" } }, required: ["narration"] };

test("結構化輸出：OpenAI相容格式用 response_format.json_schema", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({ provider: "deepseek", env: { DEEPSEEK_API_KEY: "k" }, prompt: "x", responseSchema: SCHEMA, fetchFn: ff });
  const sent = JSON.parse(ff.calls[0].options.body);
  assert.equal(sent.response_format.type, "json_schema");
  assert.deepEqual(sent.response_format.json_schema.schema, SCHEMA);
});

test("結構化輸出：Gemini 用 generationConfig 的 responseMimeType + responseSchema", async () => {
  const ff = fakeFetch(GEMINI_OK);
  await callLlm({ provider: "gemini", env: { GEMINI_API_KEY: "k" }, prompt: "x", responseSchema: SCHEMA, fetchFn: ff });
  const sent = JSON.parse(ff.calls[0].options.body);
  assert.equal(sent.generationConfig.responseMimeType, "application/json");
  assert.equal(sent.generationConfig.responseSchema.type, "object");
  assert.deepEqual(sent.generationConfig.responseSchema.properties, SCHEMA.properties);
});

test("結構化輸出：Gemini 會補上 propertyOrdering(欄位順序在它眼裡不是靠 properties 決定的)", async () => {
  // 這是「思維鏈要排在敘事之前」能不能成立的關鍵：沒有 propertyOrdering，
  // Gemini 不保證先生成 st_thought，那條「先盤算再下筆」的設計就只是我們自己以為有效。
  const ff = fakeFetch(GEMINI_OK);
  const schema = {
    type: "object",
    properties: {
      st_thought: { type: "string" },
      narration: { type: "string" },
      options: { type: "array", items: { type: "object", properties: { label: { type: "string" }, hint: { type: "string" } } } },
    },
  };
  await callLlm({ provider: "gemini", env: { GEMINI_API_KEY: "k" }, prompt: "x", responseSchema: schema, fetchFn: ff });
  const sent = JSON.parse(ff.calls[0].options.body).generationConfig.responseSchema;

  assert.deepEqual(sent.propertyOrdering, ["st_thought", "narration", "options"]);
  assert.deepEqual(sent.properties.options.items.propertyOrdering, ["label", "hint"], "巢狀的物件也要補");
  // 原本那份 schema 不可以被就地改掉（它是模組層級的常數，被改到就會汙染其他呼叫端）。
  assert.equal(schema.propertyOrdering, undefined);
});

test("結構化輸出：OpenAI 相容端點不加 propertyOrdering(多餘關鍵字有機會被直接回400)", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({ provider: "deepseek", env: { DEEPSEEK_API_KEY: "k" }, prompt: "x", responseSchema: SCHEMA, fetchFn: ff });
  const sent = JSON.parse(ff.calls[0].options.body);
  assert.equal(sent.response_format.json_schema.schema.propertyOrdering, undefined);
});

test("結構化輸出：Workers AI 用 response_format.json_schema", async () => {
  const calls = [];
  const env = { AI: { run: async (m, p) => { calls.push(p); return { response: "x" }; } } };
  await callLlm({ provider: "workers-ai", env, prompt: "x", responseSchema: SCHEMA });
  assert.equal(calls[0].response_format.type, "json_schema");
});

test("結構化輸出：供應商標記為不支援(custom/nvidia)時不可以送出去，免得把能動的設定弄壞", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({
    provider: "custom",
    env: { LLM_API_KEY: "k", LLM_BASE_URL: "https://x/v1", LLM_MODEL: "m" },
    prompt: "x",
    responseSchema: SCHEMA,
    fetchFn: ff,
  });
  assert.equal(JSON.parse(ff.calls[0].options.body).response_format, undefined);
});

test("結構化輸出：LLM_JSON_MODE=on 可以替自訂端點強制打開", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({
    provider: "custom",
    env: { LLM_API_KEY: "k", LLM_BASE_URL: "https://x/v1", LLM_MODEL: "m", LLM_JSON_MODE: "on" },
    prompt: "x",
    responseSchema: SCHEMA,
    fetchFn: ff,
  });
  assert.equal(JSON.parse(ff.calls[0].options.body).response_format.type, "json_schema");
});

test("結構化輸出：LLM_JSON_MODE=off 是逃生門，支援的供應商也要停用", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({
    provider: "deepseek",
    env: { DEEPSEEK_API_KEY: "k", LLM_JSON_MODE: "off" },
    prompt: "x",
    responseSchema: SCHEMA,
    fetchFn: ff,
  });
  assert.equal(JSON.parse(ff.calls[0].options.body).response_format, undefined);
});

test("結構化輸出：端點回400時要退回不帶schema再試一次，不能讓整個回合失敗", async () => {
  const calls = [];
  let n = 0;
  const fetchFn = async (url, options) => {
    calls.push(JSON.parse(options.body));
    n += 1;
    if (n === 1) return { ok: false, status: 400, json: async () => ({}), text: async () => "unknown field response_format" };
    return { ok: true, status: 200, json: async () => OPENAI_OK, text: async () => "" };
  };

  const result = await callLlm({
    provider: "deepseek",
    env: { DEEPSEEK_API_KEY: "k" },
    prompt: "x",
    responseSchema: SCHEMA,
    fetchFn,
  });

  assert.equal(result.text, "測試敘事文字", "退回之後這一回合仍然要成功");
  assert.equal(calls.length, 2);
  assert.ok(calls[0].response_format, "第一次帶schema");
  assert.equal(calls[1].response_format, undefined, "第二次不帶");
});

test("結構化輸出：沒帶schema時的400不可以觸發重試(那是真的錯誤)", async () => {
  let n = 0;
  const fetchFn = async () => {
    n += 1;
    return { ok: false, status: 400, json: async () => ({}), text: async () => "bad request" };
  };
  await assert.rejects(
    () => callLlm({ provider: "deepseek", env: { DEEPSEEK_API_KEY: "k" }, prompt: "x", fetchFn }),
    /HTTP 400/
  );
  assert.equal(n, 1, "只該打一次");
});

// --- SiliconFlow 硅基流動 ---

test("SiliconFlow：走OpenAI相容格式，Bearer認證，打到 .com 站的 /chat/completions", async () => {
  const ff = fakeFetch(OPENAI_OK);
  const result = await callLlm({
    provider: "siliconflow",
    env: { SILICONFLOW_API_KEY: "sf-key" },
    prompt: "玩家推開門",
    fetchFn: ff,
  });

  assert.equal(result.text, "測試敘事文字");
  assert.equal(ff.calls[0].url, "https://api.siliconflow.com/v1/chat/completions");
  assert.equal(ff.calls[0].options.headers.authorization, "Bearer sf-key");
});

test("SiliconFlow：.cn 站的使用者可以用 LLM_BASE_URL 切換(兩站帳號金鑰是分開的)", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({
    provider: "siliconflow",
    env: { SILICONFLOW_API_KEY: "k", LLM_BASE_URL: "https://api.siliconflow.cn/v1" },
    prompt: "x",
    fetchFn: ff,
  });
  assert.match(ff.calls[0].url, /api\.siliconflow\.cn/);
});

test("SiliconFlow：支援結構化輸出(官方JSON schema頁)，所以要送出 response_format", async () => {
  const ff = fakeFetch(OPENAI_OK);
  await callLlm({
    provider: "siliconflow",
    env: { SILICONFLOW_API_KEY: "k" },
    prompt: "x",
    responseSchema: SCHEMA,
    fetchFn: ff,
  });
  assert.equal(JSON.parse(ff.calls[0].options.body).response_format.type, "json_schema");
});

test("pickProvider：有 SILICONFLOW_API_KEY 時自動選 siliconflow", () => {
  assert.equal(pickProvider({ SILICONFLOW_API_KEY: "k" }), "siliconflow");
  // 明示永遠勝過猜測
  assert.equal(pickProvider({ SILICONFLOW_API_KEY: "k", LLM_PROVIDER: "gemini" }), "gemini");
});
