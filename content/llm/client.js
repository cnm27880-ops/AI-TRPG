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

/**
 * 輸出長度上限的預設值。
 *
 * [2026-08-16 決策記錄 —— 這個常數是一個實際線上bug的修正，不是隨手填的數字]
 * 部署到 Cloudflare Pages 之後實測 /api/turn，連續多輪都是：敘事寫到一半斷掉、
 * options 完全沒出現、parseTurnResponse() 解析失敗、選項整組退回保底文字。
 * 敘事長度非常穩定地落在100~110個中文字就斷——那不是模型「不會寫JSON」，
 * 是**輸出被截斷**：Workers AI 這類端點沒有指定 max_tokens 時預設只給 256 個 token，
 * 而中文在 Llama 系列的分詞器上大約是 1 個字 2 個 token，
 * 100多個中文字剛好就把 256 個 token 用完，模型還沒輪到寫 "options" 就被切斷了。
 *
 * 這一格沒設定，會讓整條敘事鏈路看起來像是「AI不聽話」，實際上是我們沒給它寫完的空間。
 * 本專案的 prompt 要求 150~400 字敘事 + 4 個選項的 JSON，抓 2048 有充足餘裕；
 * 要改用環境變數 LLM_MAX_TOKENS 覆寫即可，不用改程式。
 */
export const DEFAULT_MAX_TOKENS = 2048;

/** 解析這次要用的輸出上限：呼叫端 > 環境變數 > 預設值（跟 resolveProvider 同一個優先序）。 */
function resolveMaxTokens(maxTokens, env) {
  const raw = maxTokens ?? env?.LLM_MAX_TOKENS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_TOKENS;
}

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
 * @param {number} [params.maxTokens] 覆寫輸出長度上限（見 DEFAULT_MAX_TOKENS 的說明，
 *   那個常數修正的是一個實際線上bug：不指定的話輸出會被截斷在256個token）
 * @param {object} [params.responseSchema] 期望回覆的 JSON Schema。有給、而且這家供應商
 *   支援結構化輸出時，會依它的線路格式送出去，由供應商端保證輸出合法（見 providers.js
 *   的 JSON_MODES）。供應商不支援就自動忽略，行為跟沒給一樣。
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
  maxTokens,
  responseSchema,
  fetchFn,
}) {
  if (!prompt) throw new Error("callLlm需要prompt(這次要送的使用者訊息文字)");

  const cfg = resolveProvider(provider, env, { model, baseUrl, apiKey });
  const limit = resolveMaxTokens(maxTokens, env);

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
      return callWorkersAi(cfg, { env, prompt, systemInstruction, maxTokens: limit, responseSchema });
    case PROTOCOLS.GEMINI:
      return callGeminiProtocol(cfg, { prompt, systemInstruction, maxTokens: limit, responseSchema, fetchFn });
    case PROTOCOLS.OPENAI_CHAT:
      return callOpenAiChat(cfg, { prompt, systemInstruction, maxTokens: limit, responseSchema, fetchFn });
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

/**
 * 結構化輸出送出去之後，如果端點回 400，代表它不吃這個欄位。
 *
 * 這種情況要**退回不帶 schema 再試一次**，而不是讓整個回合失敗——
 * 「多了一層保險反而把本來會動的設定弄壞」是絕對不能接受的結果，
 * 尤其 custom 端點五花八門，我們不可能事先知道每一家支不支援。
 * 退化時留 log，讓看log的人知道這家要設 LLM_JSON_MODE=off 才不會每次都白試一輪。
 */
function shouldRetryWithoutSchema(status, sentSchema) {
  return Boolean(sentSchema) && status === 400;
}

function logSchemaFallback(cfg, detail) {
  console.warn("[LLM_JSON_MODE_UNSUPPORTED]", JSON.stringify({
    provider: cfg.id,
    model: cfg.model,
    detail,
    hint: "這個端點不接受結構化輸出欄位，已自動退回純prompt模式。要省下這一次重試請設 LLM_JSON_MODE=off",
  }));
}

async function callOpenAiChat(cfg, { prompt, systemInstruction, maxTokens, responseSchema, fetchFn = fetch }) {
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

  const useSchema = responseSchema && cfg.jsonMode === "openai-schema";

  const send = (withSchema) =>
    fetchFn(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
        ...(cfg.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        max_tokens: maxTokens,
        ...(withSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: { name: "turn_response", schema: responseSchema },
              },
            }
          : {}),
      }),
    });

  let response = await send(useSchema);

  if (!response.ok && shouldRetryWithoutSchema(response.status, useSchema)) {
    logSchemaFallback(cfg, `HTTP 400：${snippet(await safeReadText(response))}`);
    response = await send(false);
  }

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

  return {
    text,
    provider: cfg.id,
    model: cfg.model,
    finishReason: raw?.choices?.[0]?.finish_reason ?? null,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Gemini原生格式（generateContent）
// ---------------------------------------------------------------------------

async function callGeminiProtocol(cfg, { prompt, systemInstruction, maxTokens, responseSchema, fetchFn = fetch }) {
  if (!cfg.apiKey) {
    throw new LlmError(
      `${cfg.label} 需要API金鑰，但沒有讀到。請設定環境變數 ${cfg.apiKeyEnv}` +
        `（申請與設定步驟見 GEMINI_INTEGRATION.md）`,
      { provider: cfg.id, model: cfg.model, stage: "config" }
    );
  }

  const useSchema = responseSchema && cfg.jsonMode === "gemini-schema";

  const buildBody = (withSchema) => ({
    system_instruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    contents: [{ parts: [{ text: prompt }] }],
    // Gemini 用 generationConfig.maxOutputTokens，欄位名跟 OpenAI 的 max_tokens 不同；
    // 結構化輸出也在同一個物件裡，用 responseMimeType + responseSchema 兩個欄位。
    generationConfig: {
      maxOutputTokens: maxTokens,
      ...(withSchema
        ? { responseMimeType: "application/json", responseSchema }
        : {}),
    },
  });

  const send = (withSchema) =>
    fetchFn(`${cfg.baseUrl}/models/${cfg.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify(buildBody(withSchema)),
    });

  let response = await send(useSchema);

  if (!response.ok && shouldRetryWithoutSchema(response.status, useSchema)) {
    logSchemaFallback(cfg, `HTTP 400：${snippet(await safeReadText(response))}`);
    response = await send(false);
  }

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

  return {
    text,
    provider: cfg.id,
    model: cfg.model,
    finishReason: raw?.candidates?.[0]?.finishReason ?? null,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Cloudflare Workers AI（不走HTTP，走binding）
// ---------------------------------------------------------------------------

async function callWorkersAi(cfg, { env, prompt, systemInstruction, maxTokens, responseSchema }) {
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
  const useSchema = responseSchema && cfg.jsonMode === "workers-ai-schema";
  const payload = (withSchema) => ({
    messages,
    max_tokens: maxTokens,
    ...(withSchema
      ? { response_format: { type: "json_schema", json_schema: responseSchema } }
      : {}),
  });

  let raw;
  try {
    raw = await env.AI.run(cfg.model, payload(useSchema));
  } catch (err) {
    // binding 沒有 HTTP 狀態碼可看，只能靠錯誤訊息判斷是不是「不吃 response_format」。
    // 判斷不準也沒關係：最壞的情況是多試一次不帶 schema 的請求，不會讓結果變差。
    if (useSchema) {
      logSchemaFallback(cfg, String(err?.message ?? err));
      try {
        raw = await env.AI.run(cfg.model, payload(false));
      } catch (retryErr) {
        throw new LlmError(`Workers AI 呼叫失敗（模型 ${cfg.model}）：${retryErr.message}`, {
          provider: cfg.id,
          model: cfg.model,
          stage: "binding",
          bodySnippet: snippet(String(retryErr?.message ?? retryErr)),
          cause: retryErr,
        });
      }
    } else {
      throw new LlmError(`Workers AI 呼叫失敗（模型 ${cfg.model}）：${err.message}`, {
        provider: cfg.id,
        model: cfg.model,
        stage: "binding",
        bodySnippet: snippet(String(err?.message ?? err)),
        cause: err,
      });
    }
  }

  const text = extractWorkersAiText(raw);
  if (text === null) {
    throw new LlmError(
      `Workers AI 回應格式不符預期(取不出文字內容)，可能是這個模型的輸出格式不同。` +
        `回應內容：${JSON.stringify(raw)}`,
      {
        provider: cfg.id,
        model: cfg.model,
        stage: "shape",
        bodySnippet: snippet(JSON.stringify(raw)),
      }
    );
  }

  return {
    text,
    provider: cfg.id,
    model: cfg.model,
    // Workers AI 現在也會回 OpenAI 形狀的 envelope，finish_reason 就在裡面
    finishReason: raw?.choices?.[0]?.finish_reason ?? null,
    raw,
  };
}

/**
 * 從 Workers AI 的回應裡取出文字。**這個函式存在的理由是一個線上實測踩到的坑。**
 *
 * [2026-08-16 決策記錄]
 * 原本這裡只認 `raw.response` 而且要求它必須是字串。修好 max_tokens 截斷問題之後，
 * 同一個端點突然開始回 502「response欄位不存在」——但把原始回應印出來一看，
 * response 明明就在，只是**變成了物件**：
 *
 *   { choices: [{ message: { content: "{\"narration\":…}" } }],
 *     response: { narration: "…", options: […] },     ← 物件，不是字串
 *     model: "@cf/meta/llama-3.1-8b-fast-v2", usage: {…} }
 *
 * 原因是 Workers AI 會在模型輸出剛好是合法JSON時**幫你解析好**，response 就成了物件；
 * 輸出不是合法JSON時才維持字串。所以這個分支以前永遠碰不到——因為輸出一直被截斷、
 * 從來沒有合法過。修好上一個bug才讓它浮出來，這正是「一個bug擋住另一個bug」的典型。
 * 順帶一提，這個端點現在也會回 OpenAI 形狀的 choices[]，可見型錄與回應格式都在變動。
 *
 * 三種來源都接受，優先序是「越接近模型原始輸出的越優先」：
 *   1. response 是字串        —— 模型的原始文字
 *   2. choices[0].message.content —— OpenAI形狀envelope裡的原始文字
 *   3. response 是物件        —— Cloudflare 幫忙解析過的結果，轉回JSON字串給下游
 * 下游 parseTurnResponse() 吃的是字串，第3種轉回字串之後行為完全一致。
 *
 * @returns {string|null} 取不出來時回 null，由呼叫端丟出帶有原始回應的錯誤
 */
export function extractWorkersAiText(raw) {
  if (typeof raw?.response === "string") return raw.response;

  const choiceContent = raw?.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string") return choiceContent;

  if (raw?.response && typeof raw.response === "object") {
    return JSON.stringify(raw.response);
  }

  return null;
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "(無法讀取錯誤內容)";
  }
}
