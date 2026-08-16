// [設計] 統一的LLM呼叫層 —— 不管底下是哪一家，對呼叫端都長同一個樣子。
//
// 為什麼不用官方SDK：Cloudflare Pages Functions跑的是Workers runtime，不保證能跑Node專用的
// SDK套件，但保證有標準的 fetch()。用fetch直接打REST端點是最不會因為SDK相容性炸掉的做法，
// 也讓測試可以用依賴注入(塞假的fetchFn)完全離線驗證，跟這個repo一路的測試方式一致。
//
// 錯誤處理原則(跟整個專案一致)：任何一步不如預期就**明確丟錯**，絕不回傳undefined或
// 靜默塞一段預設文字。敘事層寧可讓玩家看到「AI服務失敗」，也不能生出一段沒有來源的文字——
// 因為玩家分不出「AI寫的」跟「程式湊的」，那會侵蝕整個遊戲的可信度。

import { PROTOCOLS, resolveProvider } from "./providers.js";

/**
 * LLM呼叫失敗時丟出的錯誤型別。
 *
 * [2026-08-16 決策] 原本這裡一律丟普通的 Error，只有一句人類看得懂的 message。
 * 那對「玩家看到的錯誤訊息」來說夠了，但對**排查**完全不夠：呼叫端(functions/api/turn.js)
 * 想在 Cloudflare 的 log 裡留下「哪一家、哪個模型、HTTP幾號、回應本文長什麼樣」時，
 * 只能拿字串去做正則比對——那種東西壞掉的時候不會有人發現。
 *
 * 所以失敗原因改用結構化欄位往外拋，message 維持原樣（前端顯示的文字不變），
 * 呼叫端要記 log 時直接讀欄位即可。這正是「錯誤不能被降級成無來源內容」原則的延伸：
 * 錯誤本身也不能在傳遞過程中被降級成一坨無法查詢的字串。
 *
 * @property {string} provider 供應商id
 * @property {string|null} model 這次實際要用的模型名（解析不到供應商設定時是 null）
 * @property {number|null} status HTTP狀態碼；不是HTTP錯誤(例如缺金鑰、binding不存在)時是 null
 * @property {string} stage 失敗發生在哪一步：config / http / shape / binding
 * @property {string|null} bodySnippet 供應商回應本文的前幾百字，用來看是配額用盡還是金鑰無效
 */
export class LlmError extends Error {
  constructor(message, { provider, model = null, status = null, stage, bodySnippet = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "LlmError";
    this.provider = provider;
    this.model = model;
    this.status = status;
    this.stage = stage;
    this.bodySnippet = bodySnippet;
  }
}

/** 錯誤本文只留前幾百字：完整的錯誤JSON可能很長，塞進log只會讓真正的重點被淹掉。 */
const BODY_SNIPPET_LIMIT = 400;

function snippet(text) {
  if (typeof text !== "string") return null;
  return text.length > BODY_SNIPPET_LIMIT ? `${text.slice(0, BODY_SNIPPET_LIMIT)}…(已截斷)` : text;
}

/**
 * 呼叫LLM產生一段文字。
 *
 * @param {object} params
 * @param {string} params.provider 供應商id（見 providers.js 的 PROVIDERS）
 * @param {object} [params.env] 部署環境變數（Cloudflare是 context.env），用來取金鑰/覆寫模型
 * @param {string} params.prompt 這次要送出的使用者訊息文字
 * @param {string} [params.systemInstruction] 系統提示（規則契約，見 promptContract.js）
 * @param {string} [params.model] 覆寫模型名稱
 * @param {string} [params.baseUrl] 覆寫baseUrl（接第三方中轉時用）
 * @param {string} [params.apiKey] 覆寫金鑰
 * @param {typeof fetch} [params.fetchFn] 依賴注入，測試時塞假的fetch
 * @returns {Promise<{text: string, provider: string, model: string, raw: object}>}
 */
export async function callLlm({
  provider,
  env = {},
  prompt,
  systemInstruction,
  model,
  baseUrl,
  apiKey,
  fetchFn,
}) {
  if (!prompt) throw new Error("callLlm需要prompt(這次要送的使用者訊息文字)");

  const cfg = resolveProvider(provider, env, { model, baseUrl, apiKey });

  if (!cfg.model) {
    throw new LlmError(
      `供應商「${cfg.id}」沒有預設模型，必須自己指定。` +
        `請設定環境變數 LLM_MODEL，或在呼叫時傳入 model。` +
        `（可用的模型請看 ${cfg.docs}）`,
      { provider: cfg.id, stage: "config" }
    );
  }

  switch (cfg.protocol) {
    case PROTOCOLS.WORKERS_AI:
      return callWorkersAi(cfg, { env, prompt, systemInstruction });
    case PROTOCOLS.GEMINI:
      return callGeminiProtocol(cfg, { prompt, systemInstruction, fetchFn });
    case PROTOCOLS.OPENAI_CHAT:
      return callOpenAiChat(cfg, { prompt, systemInstruction, fetchFn });
    default:
      throw new LlmError(`供應商「${cfg.id}」的線路格式「${cfg.protocol}」還沒有實作`, {
        provider: cfg.id,
        model: cfg.model,
        stage: "config",
      });
  }
}

// ---------------------------------------------------------------------------
// OpenAI相容格式 —— DeepSeek / OpenRouter / Groq / 硅基流動 / 各種第三方中轉共用這一段
// ---------------------------------------------------------------------------

async function callOpenAiChat(cfg, { prompt, systemInstruction, fetchFn = fetch }) {
  if (!cfg.baseUrl) {
    throw new LlmError(
      `供應商「${cfg.id}」沒有baseUrl。若是自訂第三方接口，請設定環境變數 LLM_BASE_URL ` +
        `（例如 https://你的中轉網域/v1，注意要包含 /v1 而不要包含 /chat/completions）`,
      { provider: cfg.id, model: cfg.model, stage: "config" }
    );
  }
  if (!cfg.apiKey) {
    throw new LlmError(
      `供應商「${cfg.id}」需要API金鑰，但沒有讀到。` +
        `請設定環境變數 ${cfg.apiKeyEnv ?? "LLM_API_KEY"}（部署到Cloudflare請用 wrangler pages secret put）`,
      { provider: cfg.id, model: cfg.model, stage: "config" }
    );
  }

  const messages = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
  messages.push({ role: "user", content: prompt });

  const response = await fetchFn(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
      ...(cfg.extraHeaders ?? {}),
    },
    body: JSON.stringify({ model: cfg.model, messages }),
  });

  if (!response.ok) {
    const body = await safeReadText(response);
    throw new LlmError(`${cfg.label} 回傳錯誤(HTTP ${response.status})：${body}`, {
      provider: cfg.id,
      model: cfg.model,
      status: response.status,
      stage: "http",
      bodySnippet: snippet(body),
    });
  }

  const raw = await response.json();
  const text = raw?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new LlmError(
      `${cfg.label} 回應格式不符預期(choices[0].message.content不存在)。` +
        `如果這是第三方中轉接口，代表它其實沒有完全相容OpenAI格式。回應內容：${JSON.stringify(raw)}`,
      {
        provider: cfg.id,
        model: cfg.model,
        status: response.status,
        stage: "shape",
        bodySnippet: snippet(JSON.stringify(raw)),
      }
    );
  }

  return { text, provider: cfg.id, model: cfg.model, raw };
}

// ---------------------------------------------------------------------------
// Gemini原生格式（generateContent）
// ---------------------------------------------------------------------------

async function callGeminiProtocol(cfg, { prompt, systemInstruction, fetchFn = fetch }) {
  if (!cfg.apiKey) {
    throw new LlmError(
      `${cfg.label} 需要API金鑰，但沒有讀到。請設定環境變數 ${cfg.apiKeyEnv}` +
        `（申請與設定步驟見 GEMINI_INTEGRATION.md）`,
      { provider: cfg.id, model: cfg.model, stage: "config" }
    );
  }

  const body = {
    system_instruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    contents: [{ parts: [{ text: prompt }] }],
  };

  const response = await fetchFn(`${cfg.baseUrl}/models/${cfg.model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const body = await safeReadText(response);
    throw new LlmError(`${cfg.label} 回傳錯誤(HTTP ${response.status})：${body}`, {
      provider: cfg.id,
      model: cfg.model,
      status: response.status,
      stage: "http",
      bodySnippet: snippet(body),
    });
  }

  const raw = await response.json();
  const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new LlmError(
      `${cfg.label} 回應格式不符預期(candidates[0].content.parts[0].text不存在)，` +
        `可能是API版本變動或內容被安全機制擋下。回應內容：${JSON.stringify(raw)}`,
      {
        provider: cfg.id,
        model: cfg.model,
        status: response.status,
        stage: "shape",
        bodySnippet: snippet(JSON.stringify(raw)),
      }
    );
  }

  return { text, provider: cfg.id, model: cfg.model, raw };
}

// ---------------------------------------------------------------------------
// Cloudflare Workers AI（不走HTTP，走binding）
// ---------------------------------------------------------------------------

async function callWorkersAi(cfg, { env, prompt, systemInstruction }) {
  if (!env?.AI || typeof env.AI.run !== "function") {
    throw new LlmError(
      "找不到Cloudflare Workers AI binding(env.AI)。" +
        "請確認 wrangler.toml 裡有 [ai] binding = \"AI\" 這一段，並且是部署在Cloudflare上執行" +
        "（本機請用 npx wrangler pages dev，直接開index.html檔案是不會有binding的）。",
      { provider: cfg.id, model: cfg.model, stage: "binding" }
    );
  }

  const messages = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
  messages.push({ role: "user", content: prompt });

  // binding 自己丟出來的錯(模型被下架、額度用盡)也要包成 LlmError，否則呼叫端拿到的
  // 是一個沒有 provider/model 欄位的裸 Error，log 裡就看不出是哪一家哪個模型壞掉。
  let raw;
  try {
    raw = await env.AI.run(cfg.model, { messages });
  } catch (err) {
    throw new LlmError(`Workers AI 呼叫失敗（模型 ${cfg.model}）：${err.message}`, {
      provider: cfg.id,
      model: cfg.model,
      stage: "binding",
      bodySnippet: snippet(String(err?.message ?? err)),
      cause: err,
    });
  }

  const text = raw?.response;
  if (typeof text !== "string") {
    throw new LlmError(
      `Workers AI 回應格式不符預期(response欄位不存在)，可能是這個模型的輸出格式不同。` +
        `回應內容：${JSON.stringify(raw)}`,
      {
        provider: cfg.id,
        model: cfg.model,
        stage: "shape",
        bodySnippet: snippet(JSON.stringify(raw)),
      }
    );
  }

  return { text, provider: cfg.id, model: cfg.model, raw };
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "(無法讀取錯誤內容)";
  }
}
