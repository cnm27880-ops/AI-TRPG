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
//   - NVIDIA NIM (build.nvidia.com)：https://build.nvidia.com/ —— OpenAI相容，免費申請金鑰即可用，
//     過去有總量上限(個人1000/企業5000次)，但查證當下(2026-08-16)已取消，改成**只受RPM限制**
//     (預設40 RPM，可申請調高到200 RPM)，不需要信用卡。這跟下面LLM_PROVIDERS.md解釋過的
//     「來路不明的免金鑰代理」是兩回事——這是NVIDIA官方自己的服務、你自己申請的金鑰，
//     跟Gemini/DeepSeek屬於同一類「正當的官方免費額度」，不是那種會無預警消失的第三方轉發。
//   - OpenRouter：https://openrouter.ai/docs/api-reference/overview —— OpenAI相容。
//     注意免費模型(`:free`結尾)的slug**每週都在變**，所以這裡故意不給預設模型，
//     強制你自己去 https://openrouter.ai/models 挑一個當下真的存在的，避免寫死一個會失效的值。
//   - Cloudflare Workers AI：https://developers.cloudflare.com/workers-ai/platform/pricing/
// ============================================================================

/**
 * 「結構化輸出」的支援方式。
 *
 * [2026-08-16] 這是把保底選項觸發率壓下來的關鍵：與其祈禱模型照著 prompt 裡的範例寫 JSON，
 * 不如在請求裡附一份 schema，由供應商端保證輸出格式。三種線路格式的欄位名都不一樣，
 * 所以這裡登記「這一家用哪一種」，實際組裝在 client.js。
 *
 * null = 不確定這家支不支援，就不要送——送了不支援的欄位有些端點會直接回400，
 * 那等於把一個本來會動的設定弄壞。這比「少一點保險」嚴重得多，所以預設保守。
 * 玩家自己知道他的端點支援時，可以用環境變數 LLM_JSON_MODE=on 強制打開。
 */
export const JSON_MODES = {
  OPENAI_SCHEMA: "openai-schema",
  GEMINI_SCHEMA: "gemini-schema",
  WORKERS_AI_SCHEMA: "workers-ai-schema",
};

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
    defaultModel: "gemini-3.7-flash",
    apiKeyEnv: "GEMINI_API_KEY",
    docs: "https://ai.google.dev/gemini-api/docs/pricing",
    freeTier: "有免費額度（需要自己申請金鑰）",
    jsonMode: "gemini-schema",
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
    jsonMode: "openai-schema",
  },

  // --- SiliconFlow 硅基流動（聚合平台，有一批常駐免費模型） ---
  siliconflow: {
    label: "SiliconFlow 硅基流動 ",
    protocol: PROTOCOLS.OPENAI_CHAT,
    // 查證2026-08-16官方 quickstart：https://docs.siliconflow.com/en/userguide/quickstart
    // 官方英文站給的是 .com；另有 .cn 站(api.siliconflow.cn/v1)，兩邊帳號與金鑰是分開的。
    // 你申請的是哪一邊就用哪一邊——用錯會是 401，不是 404，錯誤訊息不會告訴你是站別問題。
    // 要改用 .cn 設環境變數 LLM_BASE_URL=https://api.siliconflow.cn/v1 即可，不用改這裡。
    baseUrl: "https://api.siliconflow.com/v1",
    // [注意] 免費模型清單會輪替，這個值是查證當下(2026-08-16)第三方追蹤站列出的常駐免費模型之一。
    // 官方沒有一個「保證永遠免費」的承諾，所以**部署前請自己到 cloud.siliconflow.com/models
    // 對一次目前真的免費的 slug**，不要假設這一行永遠有效。要換設 LLM_MODEL 即可。
    defaultModel: "Qwen/Qwen3-30B-A3B-Instruct",
    apiKeyEnv: "SiliconFlow_API_KEY",
    docs: "https://docs.siliconflow.com/en/userguide/quickstart",
    // 2026-08-16 由使用者的主控台截圖確認(不是第三方轉述)：免費模型的限流是
    // 500 RPM / 2,000,000 TPM，而且 L0~L5 六個用量級別完全相同——官方文件說
    // 「免費模型的限流固定、付費模型才隨級別變動」，各級別相同正好佐證這是免費模型的頁面。
    // 那張表**沒有每日請求數這一欄**。
    // 實測本專案一回合約 4,300 tokens(prompt 3,938 + completion 約 350)，
    // 換算下來 RPM 與 TPM 兩邊的天花板都落在每分鐘 460~500 個回合左右，
    // 單人遊戲(一分鐘頂多打幾個回合)有兩個數量級的餘裕。
    freeTier:
      "有一批常駐免費模型。免費模型限流固定為 500 RPM / 2,000,000 TPM，各用量級別相同，" +
      "主控台未列每日請求上限。以本專案一回合約4,300 tokens估算，單人遊戲遠遠用不完。",
    // 官方有 JSON schema 專頁(docs.siliconflow.cn/en/userguide/guides/json-mode)，
    // 明講設 response_format 為 {type:"json_schema", json_schema:{...}} 可啟用結構化輸出。
    // [例外] 官方同一頁註明 DeepSeek 的 R1 系列與 V3 不支援 JSON mode——
    // 如果你把 LLM_MODEL 換成那些模型，結構化輸出會失效(client.js 收到400會自動退回純prompt模式，
    // 遊戲照樣能玩，只是保底選項的觸發率會回升)。
    jsonMode: "openai-schema",
  },

  // --- NVIDIA NIM（build.nvidia.com，官方，免費申請、無總量上限只受RPM限制） ---
  nvidia: {
    label: "NVIDIA NIM",
    protocol: PROTOCOLS.OPENAI_CHAT,
    baseUrl: "https://integrate.api.nvidia.com/v1",
    // 查證當下(2026-08-16)幾個適合「敘事+嚴格JSON輸出」的候選：
    //   meta/llama-3.3-70b-instruct —— 推理/指令遵循較強，這裡選它當預設。
    //   nvidia/mistral-nemotron —— 官方特別強調agentic/function-calling/指令遵循，也是好選擇。
    // 要換用 LLM_MODEL 覆蓋即可，不用改這裡。
    defaultModel: "meta/llama-3.3-70b-instruct",
    apiKeyEnv: "NVIDIA_API_KEY",
    docs: "https://build.nvidia.com/",
    // NIM 的結構化輸出支援度依模型而異，不是每個都吃 response_format，所以預設不送。
    // 你的模型支援的話設 LLM_JSON_MODE=on 打開。
    jsonMode: null,
    freeTier: "免費申請即可用，不需信用卡；過去有總量上限，查證當下已取消，僅受RPM限制(預設40，可申請調高)",
  },

  // --- OpenRouter（第三方聚合，一把金鑰打很多家模型） ---
  openrouter: {
    label: "OpenRouter",
    protocol: PROTOCOLS.OPENAI_CHAT,
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "z-ai/glm-5.2:free",
    apiKeyEnv: "API_KEY",
    docs: "https://openrouter.ai/models",
    jsonMode: "openai-schema",
    freeTier: "有一批 `:free` 結尾的免費模型，但slug會變動，需自行到models頁確認",
    // OpenRouter建議(非必要)帶上這兩個header，用來在它的排行榜顯示來源
    extraHeaders: { "HTTP-Referer": "https://github.com/cnm27880-ops/AI-TRPG", "X-Title": "AI-TRPG" },
  },

  // --- Cloudflare Workers AI（免金鑰，靠部署平台的binding） ---
  "workers-ai": {
    label: "Cloudflare Workers AI（免費）",
    protocol: PROTOCOLS.WORKERS_AI,
    baseUrl: null, // 不走HTTP，走 env.AI binding
    // [決策記錄 2026-08-15] 原本這裡是 "@cf/meta/llama-3.1-8b-instruct"，實際部署到Cloudflare
    // Pages後直接打/api/turn發現它已經被Cloudflare下架("was deprecated on 2026-05-30")，
    // 代表模型型錄變動比想像中快，不能只信任文件查證日期。這裡換成同系列的 -fast 變體，
    // 但**這個值一樣有可能在未來某天又被下架**——如果之後又遇到「敘事生成失敗」且錯誤訊息
    // 提到某個模型被deprecated，直接照錯誤訊息去 docs 連結查目前可用的模型改這裡即可，
    // 不需要動其他程式碼。也可以完全不改這裡，改設環境變數 LLM_MODEL 覆蓋(見下面 resolveProvider)。
    defaultModel: "@cf/meta/llama-3.1-8b-instruct-fast",
    apiKeyEnv: null, // 這正是重點：不需要任何API金鑰
    docs: "https://developers.cloudflare.com/workers-ai/models/",
    jsonMode: "workers-ai-schema",
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
    // 自訂端點五花八門，不能假設它支援。支援的話設 LLM_JSON_MODE=on。
    jsonMode: null,
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

  return { id: providerId, ...provider, model, baseUrl, apiKey, jsonMode: resolveJsonMode(provider, env) };
}

/**
 * 決定這次要不要送結構化輸出、以及用哪一種寫法。
 *
 * LLM_JSON_MODE 的三個值：
 *   "off"  一律不送（某個端點吃這個欄位會出事時的逃生門）
 *   "on"   即使供應商表上寫 null 也強制送（自訂端點的使用者自己知道支不支援）
 *   不設   照供應商表（保守：不確定的一律不送）
 */
function resolveJsonMode(provider, env) {
  const flag = String(env.LLM_JSON_MODE ?? "").toLowerCase();
  if (flag === "off") return null;
  if (flag === "on") return provider.jsonMode ?? defaultJsonModeForProtocol(provider.protocol);
  return provider.jsonMode ?? null;
}

function defaultJsonModeForProtocol(protocol) {
  if (protocol === "gemini") return "gemini-schema";
  if (protocol === "workers-ai") return "workers-ai-schema";
  return "openai-schema";
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
  if (env.SILICONFLOW_API_KEY) return "siliconflow";
  if (env.NVIDIA_API_KEY) return "nvidia";
  if (env.OPENROUTER_API_KEY) return "openrouter";
  if (env.LLM_API_KEY && env.LLM_BASE_URL) return "custom";
  if (env.AI) return "workers-ai";
  return null;
}

function trimTrailingSlash(url) {
  return typeof url === "string" ? url.replace(/\/+$/, "") : url;
}
