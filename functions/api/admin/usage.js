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
  const raw = Number(url.searchParams.get("days"));
  if (!Number.isFinite(raw)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(MAX_DAYS, Math.floor(raw)));
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

  const withCost = (entry) => {
    const c = estimateCost(entry, pricing);
    return {
      ...entry,
      // 命中率：分母是「有回報的 prompt token」，不是全部回合。
      cacheHitRatio: entry.promptTokens ? entry.cachedTokens / entry.promptTokens : null,
      cost: c ? c.total : null,
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
