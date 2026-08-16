// content/llm/ 的測試 —— 全部用假的 fetchFn / 假的 AI binding 依賴注入，不需要任何真金鑰，
// 也不會真的連上網路。測的是「HTTP請求組裝對不對」與「失敗時有沒有明確報錯」。
//
// 這裡沒辦法測的事(誠實列出)：這些端點/模型名稱在真實世界是不是還存在、金鑰有沒有效、
// 第三方中轉是不是真的相容OpenAI格式。那些只能靠實際部署後打一次來驗證，見 LLM_PROVIDERS.md。
import test from "node:test";
import assert from "node:assert/strict";
import { callLlm, LlmError, DEFAULT_MAX_TOKENS } from "../content/llm/client.js";
import { PROVIDERS, PROVIDER_IDS, resolveProvider, pickProvider } from "../content/llm/providers.js";

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
  assert.equal(pickProvider({ GEMINI_API_KEY: "k" }), "gemini");
  assert.equal(pickProvider({ DEEPSEEK_API_KEY: "k" }), "deepseek");
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

test("OpenRouter：帶上官方建議的HTTP-Referer/X-Title，且未指定模型時要明確報錯", async () => {
  const ff = fakeFetch(OPENAI_OK);

  // OpenRouter沒有預設模型(免費模型slug會變動)，沒指定就該報錯而不是亂猜一個
  await assert.rejects(
    () => callLlm({ provider: "openrouter", env: { OPENROUTER_API_KEY: "k" }, prompt: "x", fetchFn: ff }),
    /LLM_MODEL/
  );

  await callLlm({
    provider: "openrouter",
    env: { OPENROUTER_API_KEY: "k", LLM_MODEL: "some-model:free" },
    prompt: "x",
    fetchFn: ff,
  });
  assert.equal(ff.calls[0].options.headers["X-Title"], "AI-TRPG");
  assert.equal(JSON.parse(ff.calls[0].options.body).model, "some-model:free");
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
