// [設計] 一次 LLM 呼叫用掉了多少 token，以及那些 token 換算成錢是多少。
//
// 這個檔案存在的理由很直接：切到付費模型之後，「這個遊戲一回合多少錢」是一個
// 每天都會想知道、但沒有任何畫面會告訴你的數字。Cloudflare 的 log 只保留很短的時間，
// 供應商後台是總量、看不出「一回合」的粒度，而 prompt cache 的效果又完全反映在
// hit/miss 的比例上——沒有這一層，前面那整套分層等於做完了但沒有人在看儀表板。
//
// 兩個刻意的設計：
//
//   1) **費率不寫死在程式碼裡。** 各家的計價變動頻率很高，把一組沒有查證的數字
//      寫進原始碼，會變成一個「看起來很確定、實際上可能早就過期」的謊。
//      這跟 content/llm/providers.js 對 baseUrl/defaultModel 的處理原則一致。
//      費率一律從環境變數讀；沒設定就只顯示 token 數，不假裝算得出錢。
//
//   2) **成本可以「虛擬」計算。** 面板的用途是回答「如果正式站固定用 DeepSeek V4 Flash，
//      這樣玩一場要多少錢」，而開發期間實際打的可能是別家（例如測試用的 Gemini 中轉）。
//      所以換算一律用**實際發生的 token 數**乘上**V4F 的費率**，跟這次是誰服務的無關。
//      這樣測試期間看到的數字，就是正式上線後會看到的數字。

/**
 * 從供應商的原始回應裡撈出這次用掉的 token。
 *
 * 欄位名各家不同，這裡吸收掉差異：
 *   - OpenAI 相容（DeepSeek／硅基流動／Groq／多數中轉）：
 *       usage.prompt_tokens / usage.completion_tokens
 *       usage.prompt_cache_hit_tokens / usage.prompt_cache_miss_tokens（DeepSeek）
 *       usage.prompt_tokens_details.cached_tokens（OpenAI 系）
 *   - Gemini：usageMetadata.promptTokenCount / candidatesTokenCount / cachedContentTokenCount
 *
 * 撈不到就回 null，**不要回 0**：「這家沒回報」跟「這次用了 0 個 token」是兩件事，
 * 混為一談會讓面板上的數字看起來很漂亮，實際上只是沒有資料。
 *
 * @param {object} raw 供應商原始回應
 * @returns {{promptTokens: number, outputTokens: number, cachedTokens: number|null}|null}
 */
export function extractTokenUsage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const usage = raw.usage ?? raw.usageMetadata ?? null;
  if (!usage || typeof usage !== "object") return null;

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

  const promptTokens = num(usage.prompt_tokens) ?? num(usage.promptTokenCount);
  const outputTokens =
    num(usage.completion_tokens) ??
    num(usage.candidatesTokenCount) ??
    num(usage.output_tokens);
  if (promptTokens === null && outputTokens === null) return null;

  const cachedTokens =
    num(usage.prompt_cache_hit_tokens) ??
    num(usage.prompt_tokens_details?.cached_tokens) ??
    num(usage.cachedContentTokenCount) ??
    null;

  return {
    promptTokens: promptTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    // 命中數不能超過 prompt 總數；有些中轉的欄位會亂填，這裡夾一下免得算出負的 miss。
    cachedTokens:
      cachedTokens === null ? null : Math.max(0, Math.min(cachedTokens, promptTokens ?? cachedTokens)),
  };
}

/**
 * 費率設定。全部從環境變數讀，單位是「每一百萬 token 的價格」。
 *
 * 為什麼不給預設值：見檔頭第 1 點。查證過的數字請自己填進 Cloudflare 的環境變數，
 * 填法見 DEPLOYMENT.md。沒填就是沒填——面板會照實說「未設定費率」，只顯示 token 數。
 *
 *   ADMIN_PRICE_CACHE_HIT_PER_MTOK   輸入 token 命中快取的單價
 *   ADMIN_PRICE_CACHE_MISS_PER_MTOK  輸入 token 未命中的單價
 *   ADMIN_PRICE_OUTPUT_PER_MTOK      輸出 token 的單價
 *   ADMIN_PRICE_CURRENCY             幣別標籤，純顯示用，預設 USD
 *   ADMIN_PRICE_MODEL_LABEL          這組費率是哪個模型的，純顯示用
 */
export function resolvePricing(env = {}) {
  const rate = (key) => {
    const parsed = Number(env[key]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const cacheHit = rate("ADMIN_PRICE_CACHE_HIT_PER_MTOK");
  const cacheMiss = rate("ADMIN_PRICE_CACHE_MISS_PER_MTOK");
  const output = rate("ADMIN_PRICE_OUTPUT_PER_MTOK");

  // 三個都要有才算得出一個誠實的總額。少一個就整組當作沒設定——
  // 用「有的那兩個」去算會得到一個看起來合理、但少算了一整類成本的數字，
  // 那比沒有數字更危險。
  const configured = cacheHit !== null && cacheMiss !== null && output !== null;

  return {
    configured,
    cacheHit,
    cacheMiss,
    output,
    currency: typeof env.ADMIN_PRICE_CURRENCY === "string" && env.ADMIN_PRICE_CURRENCY.trim()
      ? env.ADMIN_PRICE_CURRENCY.trim()
      : "USD",
    modelLabel: typeof env.ADMIN_PRICE_MODEL_LABEL === "string" && env.ADMIN_PRICE_MODEL_LABEL.trim()
      ? env.ADMIN_PRICE_MODEL_LABEL.trim()
      : "（未標示模型）",
  };
}

const PER_MILLION = 1_000_000;

/**
 * 把 token 數換算成錢。
 *
 * 這是「虛擬成本」：不管這些 token 實際上是誰服務的，一律用 pricing 那組費率換算。
 * 開發期間用便宜（或免費）的供應商測試，看到的仍然是「正式上線後會付多少」。
 *
 * @param {{promptTokens: number, outputTokens: number, cachedTokens: number}} totals
 * @param {ReturnType<typeof resolvePricing>} pricing
 * @returns {{total: number, input: number, output: number, currency: string}|null}
 */
export function estimateCost(totals, pricing) {
  if (!pricing?.configured || !totals) return null;
  const cached = Math.max(0, Number(totals.cachedTokens) || 0);
  const promptTotal = Math.max(0, Number(totals.promptTokens) || 0);
  const missed = Math.max(0, promptTotal - cached);
  const out = Math.max(0, Number(totals.outputTokens) || 0);

  const input = (cached * pricing.cacheHit + missed * pricing.cacheMiss) / PER_MILLION;
  const output = (out * pricing.output) / PER_MILLION;
  return { total: input + output, input, output, currency: pricing.currency };
}

/**
 * 「如果完全沒有快取，這些 token 要花多少錢」——用來把快取省下來的錢算出來。
 *
 * 命中率是這整套分層唯一的產出，但「命中率 88%」對人沒有感覺，「這個月省了多少」才有。
 */
export function estimateCostWithoutCache(totals, pricing) {
  if (!pricing?.configured || !totals) return null;
  return estimateCost({ ...totals, cachedTokens: 0 }, pricing);
}
