// [設計] 用量帳本 —— 「今天總共跑了幾回合、燒了多少 token」。
//
// 存在 KV，一天一筆（key: usage:YYYY-MM-DD）。刻意做成日彙總，而不是逐回合明細：
//   - 逐筆明細會隨玩家數線性成長，而且 KV 沒辦法用欄位查詢，之後要看趨勢只能整批讀回來
//   - 這個面板要回答的問題是「一天多少錢」「一回合平均多少」，日彙總就夠了
//   - 明細裡會有 sessionId 與 provider，那是玩家行為資料；不留就不會外洩
//
// 寫入是**盡力而為**：帳本壞掉不可以影響玩家的回合。任何一步失敗都只記 log 就算了，
// 這是這個模組唯一需要記住的規則——它是儀表板，不是遊戲狀態。

/** KV key 前綴。 */
export const USAGE_KEY_PREFIX = "usage:";

/** 帳本保留幾天。超過的不會被主動刪（KV 沒有便宜的批次刪除），但也不會被讀出來。 */
export const USAGE_RETENTION_DAYS = 60;

/** 一天一筆的空帳。欄位刻意扁平，方便直接相加。 */
export function emptyDailyUsage(date) {
  return {
    date,
    turns: 0,
    // 有回報 usage 的回合數。跟 turns 不一樣：有些供應商不回報，那些回合不進 token 統計，
    // 但仍然算一回合。兩個數字都留著，才看得出「這份統計涵蓋了多少比例的回合」。
    measuredTurns: 0,
    promptTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    // 依供應商分開記，用來看 fallback 有沒有在偷偷換家。
    byProvider: {},
  };
}

/** YYYY-MM-DD（UTC）。用 UTC 而不是本地時區：Cloudflare 的 worker 沒有固定時區。 */
export function usageDateKey(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

function normalizeDaily(raw, date) {
  const base = emptyDailyUsage(date);
  if (!raw || typeof raw !== "object") return base;
  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  return {
    date,
    turns: num(raw.turns),
    measuredTurns: num(raw.measuredTurns),
    promptTokens: num(raw.promptTokens),
    cachedTokens: num(raw.cachedTokens),
    outputTokens: num(raw.outputTokens),
    byProvider:
      raw.byProvider && typeof raw.byProvider === "object" && !Array.isArray(raw.byProvider)
        ? raw.byProvider
        : {},
  };
}

/**
 * 記一回合。
 *
 * @param {object} store content/storage/sessionStore.js 的 store（要有 getRaw/putRaw）
 * @param {object} entry
 * @param {string} entry.provider 這次實際服務的供應商
 * @param {string|null} entry.model
 * @param {{promptTokens: number, outputTokens: number, cachedTokens: number|null}|null} entry.tokens
 *   content/llm/usage.js 的 extractTokenUsage() 產物；null = 這家沒回報
 * @returns {Promise<boolean>} 有沒有成功寫進去（失敗不丟錯）
 */
export async function recordTurnUsage(store, { provider, model = null, tokens = null, now = new Date() } = {}) {
  if (!store?.getRaw || !store?.putRaw) return false;
  const date = usageDateKey(now);
  const key = USAGE_KEY_PREFIX + date;

  try {
    const daily = normalizeDaily(await store.getRaw(key), date);
    daily.turns += 1;

    if (tokens) {
      daily.measuredTurns += 1;
      daily.promptTokens += Math.max(0, Number(tokens.promptTokens) || 0);
      daily.outputTokens += Math.max(0, Number(tokens.outputTokens) || 0);
      daily.cachedTokens += Math.max(0, Number(tokens.cachedTokens) || 0);
    }

    const providerKey = String(provider ?? "unknown");
    const bucket = daily.byProvider[providerKey] ?? { turns: 0, promptTokens: 0, outputTokens: 0, model: null };
    bucket.turns += 1;
    if (tokens) {
      bucket.promptTokens += Math.max(0, Number(tokens.promptTokens) || 0);
      bucket.outputTokens += Math.max(0, Number(tokens.outputTokens) || 0);
    }
    if (model) bucket.model = model;
    daily.byProvider[providerKey] = bucket;

    await store.putRaw(key, daily);
    return true;
  } catch (err) {
    // 帳本壞掉不可以影響玩家的回合。這是這個模組唯一需要記住的規則。
    console.warn("[USAGE_LEDGER] 寫入失敗，本回合不記帳", JSON.stringify({ message: err?.message ?? String(err) }));
    return false;
  }
}

/**
 * 讀回最近 N 天，最新的在前面。讀不到的那幾天回空帳（而不是缺一格），
 * 這樣前端畫圖時不需要處理「某些日期不存在」。
 */
export async function readUsageRange(store, { days = 14, now = new Date() } = {}) {
  const span = Math.max(1, Math.min(USAGE_RETENTION_DAYS, Math.floor(days) || 1));
  const out = [];
  if (!store?.getRaw) return out;

  for (let i = 0; i < span; i += 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const date = usageDateKey(d);
    let raw = null;
    try {
      raw = await store.getRaw(USAGE_KEY_PREFIX + date);
    } catch {
      raw = null;
    }
    out.push(normalizeDaily(raw, date));
  }
  return out;
}

/** 把一段日子加總成一筆。 */
export function sumUsage(dailyList) {
  const total = emptyDailyUsage("total");
  for (const d of dailyList ?? []) {
    total.turns += d.turns;
    total.measuredTurns += d.measuredTurns;
    total.promptTokens += d.promptTokens;
    total.cachedTokens += d.cachedTokens;
    total.outputTokens += d.outputTokens;
    for (const [provider, bucket] of Object.entries(d.byProvider ?? {})) {
      const acc = total.byProvider[provider] ?? { turns: 0, promptTokens: 0, outputTokens: 0, model: null };
      acc.turns += bucket.turns ?? 0;
      acc.promptTokens += bucket.promptTokens ?? 0;
      acc.outputTokens += bucket.outputTokens ?? 0;
      if (bucket.model) acc.model = bucket.model;
      total.byProvider[provider] = acc;
    }
  }
  return total;
}
