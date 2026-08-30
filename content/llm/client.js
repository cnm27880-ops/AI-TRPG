// [設計] 統一的LLM呼叫層 —— 不管底下是哪一家，對呼叫端都長同一個樣子。
//
// 為什麼不用官方SDK：Cloudflare Pages Functions跑的是Workers runtime，不保證能跑Node專用的
// SDK套件，但保證有標準的 fetch()。用fetch直接打REST端點是最不會因為SDK相容性炸掉的做法，
// 也讓測試可以用依賴注入(塞假的fetchFn)完全離線驗證，跟這個repo一路的測試方式一致。
//
// 錯誤處理原則(跟整個專案一致)：任何一步不如預期就**明確丟錯**，絕不回傳undefined或
// 靜默塞一段預設文字。敘事層寧可讓玩家看到「AI服務失敗」，也不能生出一段沒有來源的文字——
// 因為玩家分不出「AI寫的」跟「程式湊的」，那會侵蝕整個遊戲的可信度。

import { PROTOCOLS, resolveProvider, resolveServerProviderChain } from "./providers.js";
import { assertSafeOutboundUrl } from "./urlSafety.js";

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
  constructor(message, { provider, model = null, status = null, stage, bodySnippet = null, retryAfterMs = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "LlmError";
    this.provider = provider;
    this.model = model;
    this.status = status;
    this.stage = stage;
    this.bodySnippet = bodySnippet;
    this.retryAfterMs = Number.isFinite(Number(retryAfterMs)) ? Math.max(0, Math.trunc(Number(retryAfterMs))) : null;
  }
}

/** 錯誤本文只留前幾百字：完整的錯誤JSON可能很長，塞進log只會讓真正的重點被淹掉。 */
const BODY_SNIPPET_LIMIT = 400;

/**
 * [安全] 把一次LLM呼叫失敗，翻成一句**不含第三方供應商原始回應內容**的簡短說明。
 *
 * LlmError.message 的用途是給 server log 看的，可能整段帶著供應商回應本文
 * (例如 callOpenAiChat：`${cfg.label} 回傳錯誤(HTTP ${status})：${body}`，body是
 * 完整原始回應，不是 bodySnippet 那個已截斷版本)——這對排查很重要，但不該原樣
 * 出現在回傳給瀏覽器的 JSON 裡。呼叫端(functions/api/turn.js、narrate.js)的公開
 * 錯誤訊息一律呼叫這個函式，完整原因(err.message/err.bodySnippet)只寫進 server log。
 */
export function describeLlmFailure(err) {
  switch (err?.stage) {
    case "timeout":
      return "請求逾時，供應商未在時限內回應";
    case "config":
      return "供應商設定不完整";
    case "http":
      return `供應商回傳錯誤${Number.isFinite(err?.status) ? `(HTTP ${err.status})` : ""}`;
    case "shape":
      return "供應商回應格式不符預期";
    case "binding":
      return "Cloudflare Workers AI 呼叫失敗";
    case "ssrf-blocked":
      return "目標端點不被允許";
    default:
      return "AI服務暫時無法使用";
  }
}

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
/** 單次 LLM 輸出硬上限；request 與環境變數都不能把 Worker 成本無限放大。 */
export const MAX_LLM_OUTPUT_TOKENS = 4096;
/** system instruction 與 user prompt 的應用層字數上限，按 Unicode code point 計算。 */
export const MAX_LLM_SYSTEM_CHARS = 24000;
export const MAX_LLM_PROMPT_CHARS = 48000;

/** 解析這次要用的輸出上限：呼叫端 > 環境變數 > 預設值，最後套 server 硬上限。 */
function resolveMaxTokens(maxTokens, env) {
  const raw = maxTokens ?? env?.LLM_MAX_TOKENS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_TOKENS;
  return Math.min(MAX_LLM_OUTPUT_TOKENS, Math.max(1, Math.floor(parsed)));
}

function clampLlmInput(value, limit, label) {
  if (typeof value !== "string") return "";
  const chars = Array.from(value);
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  if (chars.length <= safeLimit) return value;
  if (safeLimit <= 12) return chars.slice(0, safeLimit).join("");
  const marker = `\n【${label}過長，中段已省略】\n`;
  const available = Math.max(0, safeLimit - Array.from(marker).length);
  const head = Math.ceil(available * 0.7);
  const tail = Math.max(0, available - head);
  return chars.slice(0, head).join("") + marker + (tail ? chars.slice(-tail).join("") : "");
}

function snippet(text) {
  if (typeof text !== "string") return null;
  return text.length > BODY_SNIPPET_LIMIT ? `${text.slice(0, BODY_SNIPPET_LIMIT)}…(已截斷)` : text;
}

/** 讀取 HTTP Retry-After，但永遠只保留毫秒數，不把供應商 header 原文送進公開 response。 */
function retryAfterMsFromHeaders(headers) {
  if (!headers || typeof headers.get !== "function") return null;
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
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
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("callLlm需要prompt(這次要送的使用者訊息文字)");
  }

  const boundedPrompt = clampLlmInput(prompt, MAX_LLM_PROMPT_CHARS, "prompt");
  const boundedSystemInstruction = typeof systemInstruction === "string"
    ? clampLlmInput(systemInstruction, MAX_LLM_SYSTEM_CHARS, "system instruction")
    : systemInstruction;
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
      return callWorkersAi(cfg, { env, prompt: boundedPrompt, systemInstruction: boundedSystemInstruction, maxTokens: limit, responseSchema, timeoutMs: requestTimeoutMs(env) });
    case PROTOCOLS.GEMINI:
      return callGeminiProtocol(cfg, { prompt: boundedPrompt, systemInstruction: boundedSystemInstruction, maxTokens: limit, responseSchema, fetchFn, timeoutMs: requestTimeoutMs(env) });
    case PROTOCOLS.OPENAI_CHAT:
      return callOpenAiChat(cfg, { prompt: boundedPrompt, systemInstruction: boundedSystemInstruction, maxTokens: limit, responseSchema, fetchFn, timeoutMs: requestTimeoutMs(env) });
    default:
      throw new LlmError(`供應商「${cfg.id}」的線路格式「${cfg.protocol}」還沒有實作`, {
        provider: cfg.id,
        model: cfg.model,
        stage: "config",
      });
  }
}

/**
 * 判斷一次 provider 失敗是否值得交給下一個 server-managed provider。
 *
 * 可切換：413／429／408／425／5xx、timeout、Workers binding failure、回應 shape 不符。
 * 413 代表這家供應商拒絕目前 request 的大小或 context 形狀；不同 provider 的 context
 * 限制與 schema 支援不同，因此 server-managed chain 應讓候補家接手，而不是把回合卡死。
 * 不可切換：400／401／403／404、SSRF block、其他 config 錯誤。這樣不會把錯誤的模型名、
 * 金鑰或安全設定，悄悄掩蓋成「另一家剛好能用」。
 */
export function isRetryableLlmError(err) {
  if (err?.stage === "timeout" || err?.stage === "binding" || err?.stage === "shape") return true;
  if (err?.stage !== "http") return false;
  const status = Number(err.status);
  // 5xx 不是固定幾個供應商錯誤：Cloudflare 常見 520／522／524、代理自訂的 5xx，
  // 都代表上游暫時不可用或無法替這次請求完成，應交給下一個 server-managed provider。
  if (Number.isInteger(status) && status >= 500 && status <= 599) return true;
  return new Set([408, 413, 425, 429]).has(status);
}

export const DEFAULT_AUTO_RETRY_MAX_DELAY_MS = 5_000;
export const DEFAULT_AUTO_RETRY_TIMEOUT_MS = 30_000;

/**
 * 單請求 bounded retry 的設定解析。只給 bridge 呼叫端使用；不會無限等待或無限重試。
 * retry timeout 不超過原始 request timeout，避免一次 timeout 後再完整等待另一個 90 秒。
 */
export function resolveAutoRetryConfig(env = {}) {
  const delayRaw = Number(env.LLM_AUTO_RETRY_MAX_DELAY_MS);
  const timeoutRaw = Number(env.LLM_AUTO_RETRY_TIMEOUT_MS);
  const maxDelayMs = Number.isFinite(delayRaw) && delayRaw >= 0
    ? Math.min(30_000, Math.trunc(delayRaw))
    : DEFAULT_AUTO_RETRY_MAX_DELAY_MS;
  const configuredTimeout = Number(env.LLM_REQUEST_TIMEOUT_MS);
  const originalTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.max(1_000, Math.min(300_000, Math.trunc(configuredTimeout)))
    : 90_000;
  const retryTimeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0
    ? Math.min(originalTimeoutMs, Math.max(1_000, Math.min(60_000, Math.trunc(timeoutRaw))))
    : Math.min(originalTimeoutMs, DEFAULT_AUTO_RETRY_TIMEOUT_MS);
  return { maxDelayMs, retryTimeoutMs };
}

/** 計算這次是否值得再試；Retry-After 過長時直接交給 pending gate，不硬等。 */
export function autoRetryDelayMs(err, env = {}) {
  const { maxDelayMs } = resolveAutoRetryConfig(env);
  const hasRetryAfter = err?.retryAfterMs !== null && err?.retryAfterMs !== undefined;
  const retryAfterMs = Number(err?.retryAfterMs);
  if (hasRetryAfter && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return retryAfterMs <= maxDelayMs ? Math.trunc(retryAfterMs) : null;
  }
  return Math.min(250, maxDelayMs);
}

function attachFallbackAttempts(err, attempts) {
  if (err && typeof err === "object") err.fallbackAttempts = attempts;
  return err;
}

/**
 * server-managed provider chain。
 *
 * 這個 helper 刻意不接受 provider/apiKey/baseUrl override：玩家 BYOK 與 custom 必須
 * 走單一 callLlm()，不能因為第一家失敗就消耗部署者的其他金鑰。chain 由 providers.js
 * 依免費優先順序與 LLM_ALLOW_PAID_FALLBACK 解析；一個 request 最多每家嘗試一次。
 */
export async function callLlmWithFallback(params = {}) {
  const {
    env = {},
    provider: forbiddenProvider,
    apiKey: forbiddenApiKey,
    baseUrl: forbiddenBaseUrl,
    ...shared
  } = params;
  if (forbiddenProvider || forbiddenApiKey || forbiddenBaseUrl) {
    throw new LlmError("server fallback 不接受玩家或呼叫端的 provider／金鑰／Base URL 覆寫", {
      provider: forbiddenProvider ?? null,
      model: shared.model ?? null,
      stage: "config",
    });
  }

  const chain = resolveServerProviderChain(env);
  if (!chain.length) {
    throw new LlmError("沒有可用的 server-managed LLM provider", {
      provider: null,
      model: null,
      stage: "config",
    });
  }

  const primaryId = chain[0].id;
  const attempts = [];
  let lastError = null;
  for (const candidate of chain) {
    // LLM_MODEL／LLM_BASE_URL 是 server primary 的覆寫，不可污染另一家 fallback。
    const candidateEnv = candidate.id === primaryId
      ? ((candidate.id === "custom" || env.LLM_PROVIDER === candidate.id)
          ? env
          : { ...env, LLM_BASE_URL: undefined })
      : { ...env, LLM_MODEL: undefined, LLM_BASE_URL: undefined };
    try {
      return await callLlm({
        ...shared,
        env: candidateEnv,
        provider: candidate.id,
        ...(candidate.model ? { model: candidate.model } : {}),
      });
    } catch (err) {
      lastError = err;
      attempts.push({
        provider: err?.provider ?? candidate.id,
        model: err?.model ?? candidate.model ?? null,
        stage: err?.stage ?? "unknown",
        status: err?.status ?? null,
      });
      if (!isRetryableLlmError(err) || candidate === chain[chain.length - 1]) {
        throw attachFallbackAttempts(err, attempts);
      }
      console.warn("[LLM_FALLBACK]", JSON.stringify({
        failedProvider: err?.provider ?? candidate.id,
        failedModel: err?.model ?? candidate.model ?? null,
        stage: err?.stage ?? "unknown",
        status: err?.status ?? null,
        nextProvider: chain[chain.indexOf(candidate) + 1]?.id ?? null,
      }));
    }
  }
  throw attachFallbackAttempts(lastError ?? new LlmError("所有 LLM provider 都失敗", { stage: "http" }), attempts);
}

// ---------------------------------------------------------------------------
// OpenAI相容格式 —— DeepSeek / OpenRouter / Groq / SiliconFlow / NVIDIA NIM / Mistral / 各種第三方中轉共用這一段
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

function requestTimeoutMs(env = {}) {
  const value = Number(env.LLM_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(value) || value <= 0) return 90_000;
  return Math.max(1_000, Math.min(300_000, Math.trunc(value)));
}

const MAX_OUTBOUND_REDIRECTS = 3;

/**
 * [安全][效能] 所有出站HTTP呼叫共用的 fetch 包裝，三件事一次做完：
 *
 *   1. SSRF 檢查 —— 呼叫前用 urlSafety.js 驗證目標，攔掉私網/loopback/metadata endpoint。
 *      不管是不是測試注入的假 fetchFn 都會執行；測試用的URL全是公開https網域，不會被擋。
 *   2. Server-controlled timeout —— 用 AbortController，逾時就中止連線，不讓 worker
 *      因為對方不回應而無限掛著（Workers 本身也有執行時間上限，但那是「被砍」，
 *      不是「明確回報逾時原因」，兩者對排查來說天差地遠）。
 *   3. 手動處理重定向 —— redirect:"manual" 自己接住 3xx，每一跳都重新做SSRF檢查再繼續，
 *      不能讓「第一段URL檢查通過」變成「之後被 3xx 導去內網也照樣連過去」的漏洞。
 *
 * 只有真的走網路(fetchFn === fetch)時才套用第2、3點：測試注入的假fetchFn不會真的連網，
 * 硬套用timeout/重定向機制只會要求每個測試去模擬一堆跟「這次要驗證的行為」無關的細節。
 */
function checkOutboundUrl(url, { provider, model }) {
  try {
    assertSafeOutboundUrl(url);
  } catch (err) {
    throw new LlmError(err.message, { provider, model, stage: "ssrf-blocked", cause: err });
  }
}

/**
 * @param {boolean} [enforceSsrf] 要不要對這個URL做SSRF檢查。
 *
 * [設計] 只有「這次請求的 body 明確指定了 baseUrl」才檢查（見 providers.js 的
 * baseUrlOverridden 說明）。伺服器操作者自己在環境變數 LLM_BASE_URL 設一個
 * 本機/內網位址是刻意的信任決定（本機開發、自架反向代理、整合測試起一個本機
 * mock server 都是這個情境），不是攻擊面；請求端在 body 裡塞內網位址才是SSRF。
 * 兩種情況的 baseUrl 可能長得一模一樣，差別只在「誰決定的」。
 */
async function safeFetch(fetchFn, url, options, { timeoutMs = 90_000, provider, model, enforceSsrf = false } = {}) {
  if (enforceSsrf) checkOutboundUrl(url, { provider, model });

  if (fetchFn !== fetch || typeof AbortController !== "function") {
    return fetchFn(url, options);
  }

  let currentUrl = url;
  for (let hop = 0; hop <= MAX_OUTBOUND_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchFn(currentUrl, { ...options, redirect: "manual", signal: controller.signal });
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new LlmError(`請求超過 ${timeoutMs}ms 未回應`, { provider, model, stage: "timeout", cause: err });
      }
      throw new LlmError(`連線失敗：${err?.message ?? err}`, { provider, model, stage: "http", cause: err });
    } finally {
      clearTimeout(timer);
    }
    const isRedirect = response.status >= 300 && response.status < 400;
    const location = isRedirect && typeof response.headers?.get === "function" ? response.headers.get("location") : null;
    if (!location) return response;
    currentUrl = new URL(location, currentUrl).toString();
    if (enforceSsrf) checkOutboundUrl(currentUrl, { provider, model });
  }
  throw new LlmError("重定向次數過多，已中止請求（可能的重定向迴圈或導向攻擊）", {
    provider,
    model,
    stage: "http",
  });
}

/**
 * 幫沒有 fetch/AbortController 可用的呼叫方式（Cloudflare Workers AI 的 binding，
 * 不走HTTP）補上 server-controlled timeout。binding 本身沒有簽章可以中止，
 * 逾時了實際呼叫仍在背景跑，但至少不會讓這個請求無限期掛著等它。
 */
async function withTimeout(promiseFactory, timeoutMs, { provider, model } = {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new LlmError(`請求超過 ${timeoutMs}ms 未回應`, { provider, model, stage: "timeout" }));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promiseFactory(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function logSchemaFallback(cfg, detail) {
  console.warn("[LLM_JSON_MODE_UNSUPPORTED]", JSON.stringify({
    provider: cfg.id,
    model: cfg.model,
    detail,
    hint: "這個端點不接受結構化輸出欄位，已自動退回純prompt模式。要省下這一次重試請設 LLM_JSON_MODE=off",
  }));
}

async function callOpenAiChat(cfg, { prompt, systemInstruction, maxTokens, responseSchema, fetchFn = fetch, timeoutMs = 90_000 }) {
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

  const send = async (withSchema) => {
    const options = {
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
    };
    return safeFetch(fetchFn, `${cfg.baseUrl}/chat/completions`, options, {
      timeoutMs,
      provider: cfg.id,
      model: cfg.model,
      enforceSsrf: cfg.baseUrlOverridden,
    });
  };

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
      retryAfterMs: retryAfterMsFromHeaders(response.headers),
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

/**
 * Gemini 專用：替每一層 object 補上 propertyOrdering。
 *
 * [2026-08-18] 為什麼需要這個：這個專案的回合 schema 把思維鏈 st_thought 排在 narration
 * 之前，用意是逼模型「先盤算再下筆」（見 content/turnOptions.js 的 TURN_RESPONSE_SCHEMA）。
 * 但 JSON Schema 的 properties 在 Gemini 眼裡是**無序**的，只有 propertyOrdering 才會被
 * 當成生成順序——沒有這一步，「先想再寫」在 Gemini 上就只是我們自己以為有效。
 *
 * 只在 Gemini 這條線路做：OpenAI 相容端點對 schema 的多餘關鍵字有可能直接回 400，
 * 那會讓整個結構化輸出退回關閉狀態（見底下的 shouldRetryWithoutSchema），
 * 為了一個它們不看的欄位冒這個險不划算。
 *
 * 純函式，不修改傳進來的 schema。
 */
function withPropertyOrdering(schema) {
  if (Array.isArray(schema)) return schema.map(withPropertyOrdering);
  if (!schema || typeof schema !== "object") return schema;

  const next = { ...schema };
  if (next.items) next.items = withPropertyOrdering(next.items);
  if (next.properties && typeof next.properties === "object") {
    const keys = Object.keys(next.properties);
    next.properties = Object.fromEntries(
      keys.map((k) => [k, withPropertyOrdering(next.properties[k])])
    );
    // 已經自己指定順序的 schema 不覆蓋——那是作者刻意寫的，比我們推的準。
    if (!next.propertyOrdering) next.propertyOrdering = keys;
  }
  return next;
}

async function callGeminiProtocol(cfg, { prompt, systemInstruction, maxTokens, responseSchema, fetchFn = fetch, timeoutMs = 90_000 }) {
  if (!cfg.apiKey) {
    throw new LlmError(
      `${cfg.label} 需要API金鑰，但沒有讀到。請設定環境變數 ${cfg.apiKeyEnv}` +
        `（申請與設定步驟見 GEMINI_INTEGRATION.md）`,
      { provider: cfg.id, model: cfg.model, stage: "config" }
    );
  }

  const useSchema = responseSchema && cfg.jsonMode === "gemini-schema";
  const orderedSchema = useSchema ? withPropertyOrdering(responseSchema) : null;

  const buildBody = (withSchema) => ({
    system_instruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    contents: [{ parts: [{ text: prompt }] }],
    // Gemini 用 generationConfig.maxOutputTokens，欄位名跟 OpenAI 的 max_tokens 不同；
    // 結構化輸出也在同一個物件裡，用 responseMimeType + responseSchema 兩個欄位。
    generationConfig: {
      maxOutputTokens: maxTokens,
      ...(withSchema
        ? { responseMimeType: "application/json", responseSchema: orderedSchema }
        : {}),
    },
  });

  const send = (withSchema) =>
    safeFetch(
      fetchFn,
      `${cfg.baseUrl}/models/${cfg.model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
        body: JSON.stringify(buildBody(withSchema)),
      },
      { timeoutMs, provider: cfg.id, model: cfg.model, enforceSsrf: cfg.baseUrlOverridden }
    );

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
      retryAfterMs: retryAfterMsFromHeaders(response.headers),
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

async function callWorkersAi(cfg, { env, prompt, systemInstruction, maxTokens, responseSchema, timeoutMs = 90_000 }) {
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
    raw = await withTimeout(() => env.AI.run(cfg.model, payload(useSchema)), timeoutMs, {
      provider: cfg.id,
      model: cfg.model,
    });
  } catch (err) {
    // binding 沒有 HTTP 狀態碼可看，只能靠錯誤訊息判斷是不是「不吃 response_format」。
    // 判斷不準也沒關係：最壞的情況是多試一次不帶 schema 的請求，不會讓結果變差。
    // 逾時(err.stage==="timeout")不算「不吃schema」，不需要也不應該重試——
    // 對方本來就沒回應，多打一次只是把逾時等待時間翻倍。
    if (useSchema && err?.stage !== "timeout") {
      logSchemaFallback(cfg, String(err?.message ?? err));
      try {
        raw = await withTimeout(() => env.AI.run(cfg.model, payload(false)), timeoutMs, {
          provider: cfg.id,
          model: cfg.model,
        });
      } catch (retryErr) {
        throw new LlmError(`Workers AI 呼叫失敗（模型 ${cfg.model}）：${retryErr.message}`, {
          provider: cfg.id,
          model: cfg.model,
          stage: retryErr?.stage === "timeout" ? "timeout" : "binding",
          bodySnippet: snippet(String(retryErr?.message ?? retryErr)),
          cause: retryErr,
        });
      }
    } else {
      throw new LlmError(`Workers AI 呼叫失敗（模型 ${cfg.model}）：${err.message}`, {
        provider: cfg.id,
        model: cfg.model,
        stage: err?.stage === "timeout" ? "timeout" : "binding",
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
