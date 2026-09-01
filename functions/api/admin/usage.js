// Cloudflare Pages Function —— 管理員專用的用量與成本面板資料。
// 路由：GET /api/admin/usage?days=14
//
// 非管理員一律 404（見 content/auth/admin.js 的說明：403 等於免費送出一份情報）。
//
// 這支端點只回**彙總數字**：回合數、token 數、以及換算後的成本。
// 沒有 sessionId、沒有玩家 id、沒有任何一句敘事——營運數字不需要那些，
// 而不回傳就不會外洩。

import { resolveAdmin, adminNotFound, isAdminConfigured } from "../../../content/auth/admin.js";
import { resolveSessionStore } from "../../../content/storage/sessionStore.js";
import { readUsageRange, sumUsage } from "../../../content/storage/usageLedger.js";
import { resolvePricing, estimateCost, estimateCostWithoutCache } from "../../../content/llm/usage.js";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 60;

function parseDays(url) {
  // [2026-09-01] 這裡以前是 `Number(url.searchParams.get("days"))`。
  // 參數不存在時 searchParams.get() 回 null，而 **Number(null) 是 0**，
  // 0 通過 Number.isFinite()，所以 DEFAULT_DAYS 那一行從來沒有被走到過——
  // 沒帶 ?days= 的請求（也就是面板自己發的預設請求）一律被夾成 1 天，
  // 面板只看得到「今天」。這種壞法沒有錯誤訊息也不會讓端點變紅：
  // 它照樣回 200，只是把十四天的營運數字悄悄縮成一天。
  const raw = url.searchParams.get("days");
  if (raw === null || raw.trim() === "") return DEFAULT_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(MAX_DAYS, Math.floor(parsed)));
}

/** 平均值：分母是 0 時回 null，不要回 0——「沒有資料」跟「平均是 0」不一樣。 */
function perTurn(value, turns) {
  if (!turns) return null;
  return value / turns;
}

export async function onRequestGet(context) {
  const env = context.env ?? {};
  const { isAdmin } = await resolveAdmin(context.request, env);
  if (!isAdmin) return adminNotFound();

  const url = new URL(context.request.url);
  const days = parseDays(url);
  const store = resolveSessionStore(env);
  const daily = await readUsageRange(store, { days });
  const total = sumUsage(daily);
  const pricing = resolvePricing(env);

  const cost = estimateCost(total, pricing);
  const costWithoutCache = estimateCostWithoutCache(total, pricing);

  // 估算命中率／省下的錢：只算「供應商沒回報、用字元比例推算」的那一小塊回合，
  // 跟上面 cost/costWithoutCache（真實回報）分開算，絕對不相加——見
  // content/storage/usageLedger.js 的 estimatedCachedTokens 說明。
  const estimatedTotals = { promptTokens: total.estimatedPromptTokens, outputTokens: 0, cachedTokens: total.estimatedCachedTokens };
  const estimatedCost = estimateCost(estimatedTotals, pricing);
  const estimatedCostWithoutCache = estimateCostWithoutCache(estimatedTotals, pricing);

  const withCost = (entry) => {
    const c = estimateCost(entry, pricing);
    return {
      ...entry,
      // 命中率：分母是「有回報的 prompt token」，不是全部回合。
      cacheHitRatio: entry.promptTokens ? entry.cachedTokens / entry.promptTokens : null,
      cost: c ? c.total : null,
      // 推算值，非供應商回報——見上面 estimatedTotals 的說明，跟 cacheHitRatio 分開看。
      estimatedCacheHitRatio: entry.estimatedPromptTokens
        ? entry.estimatedCachedTokens / entry.estimatedPromptTokens
        : null,
    };
  };

  return new Response(
    JSON.stringify({
      ok: true,
      // 存檔存在記憶體時，帳本會跟著容器一起消失。面板要照實說，不然數字歸零時
      // 看起來會像是「今天沒有人玩」。
      persistent: store.persistent !== false,
      days,
      pricing: {
        configured: pricing.configured,
        currency: pricing.currency,
        modelLabel: pricing.modelLabel,
        cacheHitPerMTok: pricing.cacheHit,
        cacheMissPerMTok: pricing.cacheMiss,
        outputPerMTok: pricing.output,
      },
      total: {
        ...withCost(total),
        costWithoutCache: costWithoutCache ? costWithoutCache.total : null,
        cacheSaving:
          cost && costWithoutCache ? costWithoutCache.total - cost.total : null,
        // 推算省下的錢：只涵蓋「供應商沒回報、用字元比例猜」的那些回合，不是真實數字，
        // 不算進上面的 cacheSaving。前端必須用不同的視覺樣式標示，不能跟 cacheSaving 並排成同一件事。
        estimatedCacheSaving:
          estimatedCost && estimatedCostWithoutCache
            ? estimatedCostWithoutCache.total - estimatedCost.total
            : null,
        perTurn: {
          promptTokens: perTurn(total.promptTokens, total.measuredTurns),
          outputTokens: perTurn(total.outputTokens, total.measuredTurns),
          cost: cost ? perTurn(cost.total, total.measuredTurns) : null,
        },
      },
      daily: daily.map(withCost),
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        // 營運數字不進任何快取（包含瀏覽器與 CDN）。
        "cache-control": "no-store",
      },
    }
  );
}

/**
 * 前端要知道「這個站有沒有啟用管理面板」，但**不可以**知道「你是不是管理員」以外的事。
 * 這支只回一個布林，而且對所有人都回 200——它本身不是機密，
 * 機密是上面那支端點的內容。
 */
export async function onRequestHead(context) {
  const env = context.env ?? {};
  const { isAdmin } = await resolveAdmin(context.request, env);
  return new Response(null, {
    status: isAdmin ? 204 : 404,
    headers: { "x-admin-configured": isAdminConfigured(env) ? "1" : "0" },
  });
}
