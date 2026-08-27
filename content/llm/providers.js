// [設計] LLM供應商註冊表 —— 把「不同家API的差異」全部集中在這一個檔案。
//
// 設計重點：市面上的LLM API其實只有兩種線路格式(wire protocol)，不是每家一種：
//   1) "openai-chat" —— OpenAI的 /chat/completions 格式。DeepSeek、OpenRouter、Groq、
//      硅基流動、NVIDIA NIM、Mistral、智譜、以及**絕大多數第三方中轉/代理接口**都宣稱相容這個格式，
//      所以它們共用同一份請求/回應轉換程式碼，差別只有 baseUrl / 模型名 / 金鑰。
//   2) "gemini" —— Google自己的 generateContent 格式(system_instruction + contents)。
// 另外有一個不走HTTP的特例："workers-ai"，用Cloudflare的binding直接呼叫(見 client.js)。
// server-managed request 可透過 resolveServerProviderChain() 依免費優先順序切換；
// 玩家 BYOK 仍然走單一 provider，不會混入 server chain。
//
// 所以要「多支援一家第三方API」通常**不需要寫任何程式碼**，只要在部署環境設好
// LLM_BASE_URL / LLM_MODEL / LLM_API_KEY 三個變數，用內建的 "custom" 供應商就好。
//
// ============================================================================
// [可信度說明 —— 這一段請在部署前自己重新核對一次]
// 下面每一筆的 baseUrl 與 defaultModel 都是 2026-08-27 查官方文件當下的值，並附上出處。
// 這類資訊(尤其模型名稱)變動頻率很高，本專案的原則是「會變動的資訊不能杜撰成確定事實」，
// 所以這裡老實標註查證日期與來源，而不是假裝它們永遠正確：
//
//   - Gemini：https://ai.google.dev/gemini-api/docs/pricing
//     官方文件目前把 generateContent 標為 legacy、建議新專案改用 Interactions API，
//     但**明確聲明 generateContent 仍然完整支援**，且對「單次、無狀態、低延遲」的呼叫
//     (正好就是本專案每回合敘事的形狀)官方的建議就是繼續用 generateContent。
//     所以這裡刻意不急著遷移——遷移沒有好處，只有破壞既有測試的風險。
//   - DeepSeek：https://api-docs.deepseek.com/ —— 官方明講相容OpenAI格式，Bearer認證。
//   - NVIDIA NIM (build.nvidia.com)：https://build.nvidia.com/ —— OpenAI相容，Developer Program 提供
//     hosted NIM 原型使用；RPM、credits 與模型可用性依帳戶／模型變動，不能假設是無限免費或 production SLA。
//   - OpenRouter：https://openrouter.ai/docs/api-reference/overview —— OpenAI相容。
//     注意免費模型(`:free`結尾)的slug**每週都在變**，收到 429 或 404 時應改用另一個現存 slug。
//   - Cloudflare Workers AI：https://developers.cloudflare.com/workers-ai/platform/pricing/
//   - Groq：https://console.groq.com/docs/rate-limits —— OpenAI-compatible Free Plan，依模型受 RPM/RPD/TPM/TPD 限制。
//   - Mistral：https://docs.mistral.ai/admin/billing-usage/usage-limits —— 官方 Free mode，額度依帳戶。
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
    fallbackClass: "paid",
  },

  // --- Groq（官方，OpenAI-compatible，Free Plan） ---
  groq: {
    label: "Groq",
    protocol: PROTOCOLS.OPENAI_CHAT,
    baseUrl: "https://api.groq.com/openai/v1",
    // 官方 rate-limit 文件目前列 openai/gpt-oss-120b 為 Free Plan 30 RPM / 1K RPD / 8K TPM。
    // 免費模型與限流會變動；正式部署前應以帳戶 Limits page 為準。
    defaultModel: "openai/gpt-oss-120b",
    apiKeyEnv: "GROQ_API_KEY",
    docs: "https://console.groq.com/docs/rate-limits",
    freeTier: "Free Plan；模型依帳戶有 RPM/RPD/TPM/TPD 限制，429 會提供 retry-after headers",
    jsonMode: "openai-schema",
    fallbackClass: "free",
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
    fallbackClass: "paid",
  },

  // --- SiliconFlow 硅基流動（聚合平台，有一批常駐免費模型） ---
  siliconflow: {
    label: "SiliconFlow 硅基流動",
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
    // [2026-08-20 修正] 這裡一度被改成 "SiliconFlow_API_KEY"（大小寫混寫），
    // 但 pickProvider() 與 LLM_PROVIDERS.md／DEPLOYMENT.md 全都寫 SILICONFLOW_API_KEY。
    // 環境變數名稱是大小寫敏感的，於是「自動挑到 siliconflow → 卻讀不到金鑰」，
    // 每一回合都以「需要API金鑰，但沒有讀到」收場。正名回全大寫，
    // 舊名留在 apiKeyEnvAliases 裡，已經照舊名設好secret的部署不會因為這次修正而斷掉。
    apiKeyEnv: "SILICONFLOW_API_KEY",
    apiKeyEnvAliases: ["SiliconFlow_API_KEY"],
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
    fallbackClass: "free",
  },

  // --- NVIDIA NIM（build.nvidia.com，官方 hosted NIM，免費原型使用） ---
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
    freeTier: "NVIDIA Developer Program 提供 hosted NIM 原型使用；RPM、credits 與模型可用性依帳戶／模型而變",
    fallbackClass: "free",
  },

  // --- Mistral（官方 Free mode） ---
  mistral: {
    label: "Mistral",
    protocol: PROTOCOLS.OPENAI_CHAT,
    baseUrl: "https://api.mistral.ai/v1",
    // Free mode 的實際 included usage 與 limits 以 Mistral Admin Panel 為準。
    defaultModel: "mistral-small-latest",
    apiKeyEnv: "MISTRAL_API_KEY",
    docs: "https://docs.mistral.ai/admin/billing-usage/usage-limits",
    freeTier: "Free mode 有每月 included usage；實際模型與 rate limits 以 Admin Panel 顯示為準",
    jsonMode: "openai-schema",
    fallbackClass: "free",
  },

  // --- OpenRouter（第三方聚合，一把金鑰打很多家模型） ---
  openrouter: {
    label: "OpenRouter",
    protocol: PROTOCOLS.OPENAI_CHAT,
    baseUrl: "https://openrouter.ai/api/v1",
    // [2026-08-18] 這裡原本刻意留空(免費模型的slug會變動)，由使用者自己指定；
    // 現在填的是使用者選定的預設值。2026-08-20 對過 openrouter.ai/api/v1/models
    // 確認這個slug當下存在，但 `:free` 系列本來就會輪替——之後若收到 404，
    // 到 https://openrouter.ai/models 挑一個新的改這裡，或直接設環境變數 LLM_MODEL。
    defaultModel: "z-ai/glm-5.2:free",
    // [2026-08-20 修正] 這裡一度被改成泛用的 "API_KEY"，跟 pickProvider() 與文件
    // 用的 OPENROUTER_API_KEY 對不起來，結果是自動挑到 openrouter 卻讀不到金鑰。
    // 正名回 OPENROUTER_API_KEY，並把 "API_KEY" 留作相容別名。
    apiKeyEnv: "OPENROUTER_API_KEY",
    apiKeyEnvAliases: ["API_KEY"],
    docs: "https://openrouter.ai/models",
    jsonMode: "openai-schema",
    freeTier: "有一批 `:free` 結尾的免費模型，但slug會變動，需自行到models頁確認",
    fallbackClass: "paid",
    // OpenRouter建議(非必要)帶上這兩個header，用來在它的排行榜顯示來源
    extraHeaders: { "HTTP-Referer": "https://github.com/cnm27880-ops/AI-TRPG", "X-Title": "AI-TRPG" },
  },

  // --- Cloudflare Workers AI（免金鑰，靠部署平台的binding） ---
  "workers-ai": {
    label: "Cloudflare Workers AI（免費）",
    protocol: PROTOCOLS.WORKERS_AI,
    baseUrl: null, // 不走HTTP，走 env.AI binding
    // [決策記錄 2026-08-27] 舊的 Llama 3.1 model 已在 Cloudflare catalog 標示 deprecated；
    // 改用目前 catalog 可查到的 Qwen3 30B A3B FP8。Workers AI model catalog 會變動，
    // 如果未來遇到 model deprecated，直接以官方 catalog 的現行 ID 覆蓋 LLM_MODEL 即可，
    // 不需要改其他 provider protocol。也可以用 LLM_MODEL 指定帳戶已確認的模型。
    defaultModel: "@cf/qwen/qwen3-30b-a3b-fp8",
    apiKeyEnv: null, // 這正是重點：不需要任何API金鑰
    docs: "https://developers.cloudflare.com/workers-ai/models/",
    jsonMode: "workers-ai-schema",
    freeTier: "每天10,000 Neurons免費額度（查證當下），超過要升級Workers付費方案",
    fallbackClass: "free",
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
    fallbackClass: "custom",
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
  const apiKey = overrides.apiKey ?? readApiKey(provider, env) ?? env.LLM_API_KEY;

  return {
    id: providerId,
    ...provider,
    model,
    baseUrl,
    apiKey,
    jsonMode: resolveJsonMode(provider, env),
    // [安全] baseUrl 是不是由**這次請求**(而不是伺服器的環境變數/內建預設值)指定的。
    // 伺服器操作者自己在 LLM_BASE_URL 設一個本機/內網位址（本機開發、自架反向代理）
    // 是刻意的信任決定；請求端(玩家瀏覽器)在 body 裡塞一個內網位址則是SSRF——
    // 兩者長得一樣(都是「baseUrl 指向內網」)，差別只在「誰決定的」，這個欄位
    // 就是用來讓 content/llm/client.js 分辨要不要對這個 baseUrl 做SSRF檢查。
    baseUrlOverridden: Boolean(overrides.baseUrl),
  };
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

  // server 預設優先選免費／平台既有額度：Groq → Workers AI → SiliconFlow → NVIDIA → Mistral。
  // Workers AI 不需要 key，因此放在 Groq key 之後、其他需要 key 的 provider 之前。
  if (readApiKey(PROVIDERS.groq, env)) return "groq";
  if (env.AI && typeof env.AI.run === "function") return "workers-ai";
  for (const id of ["siliconflow", "nvidia", "mistral", "gemini", "deepseek", "openrouter"]) {
    if (readApiKey(PROVIDERS[id], env)) return id;
  }
  if (env.LLM_API_KEY && env.LLM_BASE_URL) return "custom";
  return null;
}

export const FREE_FALLBACK_PROVIDER_ORDER = ["groq", "workers-ai", "siliconflow", "nvidia", "mistral"];
export const PAID_FALLBACK_PROVIDER_ORDER = ["gemini", "deepseek", "openrouter"];

/** 判斷 server 是否真的有能力呼叫某個 provider；custom 不可自動混入 fallback。 */
export function isProviderConfigured(providerId, env = {}) {
  const provider = PROVIDERS[providerId];
  if (!provider || providerId === "custom") return false;
  if (provider.protocol === PROTOCOLS.WORKERS_AI) {
    return Boolean(env.AI && typeof env.AI.run === "function");
  }
  return Boolean(readApiKey(provider, env));
}

/**
 * 解析 server-managed provider chain。
 *
 * LLM_FALLBACK_PROVIDERS 可明確指定：
 *   groq=openai/gpt-oss-120b,workers-ai=@cf/qwen/qwen3-30b-a3b-fp8
 *
 * 未指定時使用免費優先順序；付費 provider 只有在 LLM_ALLOW_PAID_FALLBACK=true
 * 時才會自動加入。這層不處理玩家 BYOK，custom 也永遠不能放入自動候補鏈。
 */
export function resolveServerProviderChain(env = {}) {
  const primaryId = env.LLM_PROVIDER || pickProvider(env);
  if (!primaryId) return [];
  if (!PROVIDERS[primaryId]) {
    throw new Error(`未知的主要 LLM provider：「${primaryId}」`);
  }

  const primary = { id: primaryId, model: env.LLM_MODEL || undefined };
  const allowPaidFallback = String(env.LLM_ALLOW_PAID_FALLBACK ?? "").toLowerCase() === "true";
  const explicitSpec = typeof env.LLM_FALLBACK_PROVIDERS === "string" && env.LLM_FALLBACK_PROVIDERS.trim();
  const fallbackEntries = explicitSpec
    ? parseFallbackProviderSpec(env.LLM_FALLBACK_PROVIDERS)
    : [
        ...FREE_FALLBACK_PROVIDER_ORDER.map((id) => ({ id })),
        ...(allowPaidFallback ? PAID_FALLBACK_PROVIDER_ORDER.map((id) => ({ id })) : []),
      ];

  const chain = [primary];
  const seen = new Set([primaryId]);
  for (const entry of fallbackEntries) {
    if (seen.has(entry.id)) continue;
    const provider = PROVIDERS[entry.id];
    if (!provider) continue;
    if (entry.id === "custom") {
      throw new Error("custom 不能放進 server fallback chain；請把它作為單一 provider 使用");
    }
    if (provider.fallbackClass !== "free" && !allowPaidFallback) {
      throw new Error(`fallback provider「${entry.id}」可能產生付費用量；請設定 LLM_ALLOW_PAID_FALLBACK=true 後再啟用`);
    }
    seen.add(entry.id);
    // 未設定 key／binding 的 provider 不放進 chain，避免先打到一個確定的 config error
    // 而把後面的可用免費 provider 擋住。
    if (!isProviderConfigured(entry.id, env)) continue;
    chain.push({ id: entry.id, model: entry.model });
  }
  return chain;
}

function parseFallbackProviderSpec(rawValue) {
  const entries = String(rawValue)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf("=");
      const id = (separator >= 0 ? entry.slice(0, separator) : entry).trim();
      const model = separator >= 0 ? entry.slice(separator + 1).trim() : undefined;
      if (!PROVIDERS[id]) throw new Error(`LLM fallback provider 不存在：「${id}」`);
      return { id, model: model || undefined };
    });
  if (entries.length > 5) throw new Error("LLM fallback provider 最多只能設定 5 家");
  return entries;
}

/**
 * 這一家的金鑰可以放在哪幾個環境變數名底下。
 *
 * 為什麼需要「別名」：環境變數名稱是大小寫敏感的，而部署到 Cloudflare 之後
 * 那些 secret 是設在主控台／wrangler 裡的，改程式碼裡的名字等於要求對方
 * 同步去改一份看不見的設定——沒改到就是整站的敘事全部失敗，而且錯誤訊息
 * 只會說「沒有讀到金鑰」。所以正名之後把舊名留著一起讀，兩邊都能動。
 */
export function apiKeyEnvNames(provider) {
  if (!provider?.apiKeyEnv) return [];
  return [provider.apiKeyEnv, ...(provider.apiKeyEnvAliases ?? [])];
}

/** 從 env 依序試每一個可用的名稱，回傳第一個真的有值的金鑰。 */
function readApiKey(provider, env) {
  for (const name of apiKeyEnvNames(provider)) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function trimTrailingSlash(url) {
  return typeof url === "string" ? url.replace(/\/+$/, "") : url;
}
