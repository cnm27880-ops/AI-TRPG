// [設計] LLM供應商註冊表 —— 把「不同家API的差異」全部集中在這一個檔案。
//
// 設計重點：市面上的LLM API其實只有兩種線路格式(wire protocol)，不是每家一種：
//   1) "openai-chat" —— OpenAI的 /chat/completions 格式。DeepSeek、OpenRouter、Groq、
//      硅基流動、智譜、以及**絕大多數第三方中轉/代理接口**都宣稱相容這個格式，
//      所以它們共用同一份請求/回應轉換程式碼，差別只有 baseUrl / 模型名 / 金鑰。
//   2) "gemini" —— Google自己的 generateContent 格式(system_instruction + contents)。
// 另外有一個不走HTTP的特例："workers-ai"，用Cloudflare的binding直接呼叫(見 client.js)。
//
// 所以要「多支援一家第三方API」通常**不需要寫任何程式碼**，只要在部署環境設好
// LLM_BASE_URL / LLM_MODEL / LLM_API_KEY 三個變數，用內建的 "custom" 供應商就好。
//
// ============================================================================
// [可信度說明 —— 這一段請在部署前自己重新核對一次]
// 下面每一筆的 baseUrl 與 defaultModel 都是 2026-08-15 查官方文件當下的值，並附上出處。
// 這類資訊(尤其模型名稱)變動頻率很高，本專案的原則是「會變動的資訊不能杜撰成確定事實」，
// 所以這裡老實標註查證日期與來源，而不是假裝它們永遠正確：
//
//   - Gemini：https://ai.google.dev/gemini-api/docs/pricing
//     官方文件目前把 generateContent 標為 legacy、建議新專案改用 Interactions API，
//     但**明確聲明 generateContent 仍然完整支援**，且對「單次、無狀態、低延遲」的呼叫
//     (正好就是本專案每回合敘事的形狀)官方的建議就是繼續用 generateContent。
//     所以這裡刻意不急著遷移——遷移沒有好處，只有破壞既有測試的風險。
//   - DeepSeek：https://api-docs.deepseek.com/ —— 官方明講相容OpenAI格式，Bearer認證。
//   - OpenRouter：https://openrouter.ai/docs/api-reference/overview —— OpenAI相容。
//     注意免費模型(`:free`結尾)的slug**每週都在變**，所以這裡故意不給預設模型，
//     強制你自己去 https://openrouter.ai/models 挑一個當下真的存在的，避免寫死一個會失效的值。
//   - Cloudflare Workers AI：https://developers.cloudflare.com/workers-ai/platform/pricing/
// ============================================================================

/** 各家API的線路格式。新增供應商時先問：它是不是OpenAI相容？是的話用 openai-chat 就好。 */
export const PROTOCOLS = {
  OPENAI_CHAT: "openai-chat",
  GEMINI: "gemini",
  WORKERS_AI: "workers-ai",
};

export const PROVIDERS = {
  // --- Google Gemini（官方） ---
  gemini: {
    label: "Google Gemini（官方）",
    protocol: PROTOCOLS.GEMINI,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    // 查證當下官方quickstart示範的是 gemini-3.6-flash，且pricing頁列它有免費額度。
    // 舊的 gemini-2.5-flash 查證當下仍然存在且仍有免費額度，要沿用也可以，改這個常數即可。
    defaultModel: "gemini-3.6-flash",
    apiKeyEnv: "GEMINI_API_KEY",
    docs: "https://ai.google.dev/gemini-api/docs/pricing",
    freeTier: "有免費額度（需要自己申請金鑰）",
  },

  // --- DeepSeek（官方） ---
  deepseek: {
    label: "DeepSeek（官方）",
    protocol: PROTOCOLS.OPENAI_CHAT,
    baseUrl: "https://api.deepseek.com/v1",
    // 查證當下官方文件列出的兩個模型是 deepseek-v4-flash / deepseek-v4-pro。
    // flash是比較便宜的一層，敘事這種用途通常夠用；要換成pro改這裡或設 LLM_MODEL。
    defaultModel: "deepseek-v4-flash",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    docs: "https://api-docs.deepseek.com/",
    freeTier: "無常態免費額度，依官方計價（新帳號是否送額度請自行確認）",
  },

  // --- OpenRouter（第三方聚合，一把金鑰打很多家模型） ---
  openrouter: {
    label: "OpenRouter（聚合，含免費模型）",
    protocol: PROTOCOLS.OPENAI_CHAT,
    baseUrl: "https://openrouter.ai/api/v1",
    // 刻意留空：免費模型的slug每週在變，寫死一個等於保證未來某天壞掉且錯誤訊息很難懂。
    defaultModel: null,
    apiKeyEnv: "OPENROUTER_API_KEY",
    docs: "https://openrouter.ai/models",
    freeTier: "有一批 `:free` 結尾的免費模型，但slug會變動，需自行到models頁確認",
    // OpenRouter建議(非必要)帶上這兩個header，用來在它的排行榜顯示來源
    extraHeaders: { "HTTP-Referer": "https://github.com/cnm27880-ops/AI-TRPG", "X-Title": "AI-TRPG" },
  },

  // --- Cloudflare Workers AI（免金鑰，靠部署平台的binding） ---
  "workers-ai": {
    label: "Cloudflare Workers AI（免金鑰）",
    protocol: PROTOCOLS.WORKERS_AI,
    baseUrl: null, // 不走HTTP，走 env.AI binding
    defaultModel: "@cf/meta/llama-3.1-8b-instruct",
    apiKeyEnv: null, // 這正是重點：不需要任何API金鑰
    docs: "https://developers.cloudflare.com/workers-ai/models/",
    freeTier: "每天10,000 Neurons免費額度（查證當下），超過要升級Workers付費方案",
  },

  // --- 任意第三方/自架接口（只要是OpenAI相容就能用，不必改程式碼） ---
  custom: {
    label: "自訂OpenAI相容接口（第三方中轉／自架）",
    protocol: PROTOCOLS.OPENAI_CHAT,
    baseUrl: null, // 一定要由 LLM_BASE_URL 提供
    defaultModel: null, // 一定要由 LLM_MODEL 提供
    apiKeyEnv: "LLM_API_KEY",
    docs: "（依你使用的服務而定）",
    freeTier: "依服務而定",
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

/**
 * 取得供應商設定，並套用環境變數的覆寫。
 *
 * 覆寫優先序（高到低）：呼叫端明確傳入 > 環境變數 > 供應商預設值。
 * 這個順序讓你「換模型」不用改程式碼、也不用重新部署程式，改一個環境變數就好。
 *
 * @param {string} providerId
 * @param {object} [env] 部署環境的變數物件（Cloudflare Pages Functions 是 context.env）
 * @param {object} [overrides] 呼叫端明確指定的 { model, baseUrl, apiKey }
 */
export function resolveProvider(providerId, env = {}, overrides = {}) {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    throw new Error(
      `未知的LLM供應商「${providerId}」，可用的有：${PROVIDER_IDS.join(" / ")}。` +
        `如果你要接的是清單以外的服務，多數第三方接口都相容OpenAI格式，` +
        `直接用 custom 並設定 LLM_BASE_URL / LLM_MODEL / LLM_API_KEY 即可。`
    );
  }

  const model = overrides.model ?? env.LLM_MODEL ?? provider.defaultModel;
  const baseUrl = trimTrailingSlash(overrides.baseUrl ?? env.LLM_BASE_URL ?? provider.baseUrl);
  const apiKey =
    overrides.apiKey ??
    (provider.apiKeyEnv ? env[provider.apiKeyEnv] : undefined) ??
    env.LLM_API_KEY;

  return { id: providerId, ...provider, model, baseUrl, apiKey };
}

/**
 * 在沒有明確指定 LLM_PROVIDER 時，依照「目前環境到底設了什麼」自動挑一個能用的供應商。
 *
 * 這個順序是刻意的：
 *   1. 使用者明確設定的 LLM_PROVIDER 最優先（明示永遠勝過猜測）。
 *   2. 接著看哪一把金鑰真的存在。有設金鑰代表使用者刻意要用那一家。
 *   3. 全都沒有時，退到 Cloudflare Workers AI —— 它是這個專案唯一「不需要任何金鑰」的選項
 *      （靠Pages/Workers的AI binding，用你自己的Cloudflare帳號額度），
 *      所以它適合當「什麼都還沒設定就想先玩玩看」的預設值。
 *   4. 連AI binding都沒有（例如本機直接開檔案、或忘了在wrangler設定裡加 [ai]）就明確報錯，
 *      **不會**偷偷改用假資料或隨機文字——寧可壞掉，也不能產生沒有來源的內容。
 */
export function pickProvider(env = {}) {
  if (env.LLM_PROVIDER) return env.LLM_PROVIDER;
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.DEEPSEEK_API_KEY) return "deepseek";
  if (env.OPENROUTER_API_KEY) return "openrouter";
  if (env.LLM_API_KEY && env.LLM_BASE_URL) return "custom";
  if (env.AI) return "workers-ai";
  return null;
}

function trimTrailingSlash(url) {
  return typeof url === "string" ? url.replace(/\/+$/, "") : url;
}
