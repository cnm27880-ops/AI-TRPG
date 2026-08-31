// 管理面板（/api/admin/usage）與用量帳本的測試。
//
// 這一組最重要的不是數字對不對，是**誰看得到**。管理面板是整個站上唯一會吐出
// 營運數字的端點，權限寫錯不會有任何徵兆——它照樣回 200，只是回給了不該看的人。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as adminUsageGet } from "../functions/api/admin/usage.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";
import { signSessionToken, SESSION_COOKIE } from "../content/auth/sessionToken.js";
import { parseAdminIds, isAdminConfigured, resolveAdmin } from "../content/auth/admin.js";
import {
  recordTurnUsage,
  readUsageRange,
  sumUsage,
  usageDateKey,
  emptyDailyUsage,
} from "../content/storage/usageLedger.js";
import { extractTokenUsage, resolvePricing, estimateCost } from "../content/llm/usage.js";

const SECRET = "測試用的-session-secret-夠長夠隨機";
const ADMIN_ID = "123456789012345678";
const OTHER_ID = "987654321098765432";

/** 做一個帶著某人登入 cookie 的 GET 請求。 */
async function reqAs(discordId, { url = "https://test.local/api/admin/usage" } = {}) {
  const cookie = discordId
    ? `${SESSION_COOKIE}=${await signSessionToken({ sub: `discord:${discordId}`, name: "測試者" }, SECRET)}`
    : "";
  return {
    url,
    headers: { get: (h) => (h.toLowerCase() === "cookie" ? cookie : null) },
  };
}

function baseEnv(extra = {}) {
  return { AUTH_SESSION_SECRET: SECRET, ADMIN_DISCORD_IDS: ADMIN_ID, ...extra };
}

const read = async (res) => ({ status: res.status, body: res.status === 204 ? null : JSON.parse(await res.text()) });

// ---------------------------------------------------------------------------
// 權限
// ---------------------------------------------------------------------------

test("[安全] 沒登入的人拿到 404，不是 403", async () => {
  // 403 等於告訴對方「這個網址是真的，只是你沒權限」——那是一份免費的情報。
  const res = await adminUsageGet({ request: await reqAs(null), env: baseEnv() });
  assert.equal(res.status, 404);
});

test("[安全] 登入了但不在白名單的人，也拿到 404", async () => {
  const res = await adminUsageGet({ request: await reqAs(OTHER_ID), env: baseEnv() });
  assert.equal(res.status, 404);
});

test("[安全] 沒設定 ADMIN_DISCORD_IDS 時，沒有任何人是管理員", async () => {
  // 這一條是刻意的預設值選擇：白名單沒設定，代表「還沒開放」，不是「開放給所有人」。
  const env = { AUTH_SESSION_SECRET: SECRET };
  assert.equal(isAdminConfigured(env), false);
  const res = await adminUsageGet({ request: await reqAs(ADMIN_ID), env });
  assert.equal(res.status, 404);
});

test("[安全] 竄改過的登入 cookie 不會變成管理員", async () => {
  const good = await signSessionToken({ sub: `discord:${OTHER_ID}` }, SECRET);
  // 把 payload 換成管理員，簽章保持原樣。
  const [, , sig] = good.split(".");
  const forgedPayload = btoa(JSON.stringify({ sub: `discord:${ADMIN_ID}`, exp: Date.now() + 3600_000 }));
  const request = {
    url: "https://test.local/api/admin/usage",
    headers: { get: (h) => (h.toLowerCase() === "cookie" ? `${SESSION_COOKIE}=x.${forgedPayload}.${sig}` : null) },
  };
  const res = await adminUsageGet({ request, env: baseEnv() });
  assert.equal(res.status, 404);
});

test("白名單裡的管理員拿得到資料", async () => {
  const res = await adminUsageGet({ request: await reqAs(ADMIN_ID), env: baseEnv() });
  const { status, body } = await read(res);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.daily));
  assert.equal(res.headers.get("cache-control"), "no-store", "營運數字不進任何快取");
});

test("白名單同時接受純 Discord id 與帶前綴的 sub", async () => {
  // 從 Discord 複製到的是純數字，程式內部用的是 discord: 前綴。只收一種的話，
  // 設錯的人會看到一個完全正常、但永遠 404 的頁面，非常難查。
  assert.deepEqual(parseAdminIds({ ADMIN_DISCORD_IDS: "111" }), ["discord:111"]);
  assert.deepEqual(parseAdminIds({ ADMIN_DISCORD_IDS: "discord:111" }), ["discord:111"]);
  assert.deepEqual(parseAdminIds({ ADMIN_DISCORD_IDS: "111, 222  333" }), [
    "discord:111", "discord:222", "discord:333",
  ]);
  const { isAdmin } = await resolveAdmin(await reqAs(ADMIN_ID), baseEnv({ ADMIN_DISCORD_IDS: `discord:${ADMIN_ID}` }));
  assert.equal(isAdmin, true);
});

test("[安全] 回應裡不含 sessionId、玩家 id 或任何敘事", async () => {
  const res = await adminUsageGet({ request: await reqAs(ADMIN_ID), env: baseEnv() });
  const text = JSON.stringify((await read(res)).body);
  for (const leak of ["sessionId", "ownerId", "narration", "discord:", "playerAction"]) {
    assert.ok(!text.includes(leak), `營運面板不該回傳 ${leak}`);
  }
});

// ---------------------------------------------------------------------------
// 帳本
// ---------------------------------------------------------------------------

/** 最小的假 store：只要有 getRaw/putRaw 就夠了。 */
function fakeStore() {
  const map = new Map();
  return {
    persistent: true,
    async getRaw(k) { return map.get(k) ?? null; },
    async putRaw(k, v) { map.set(k, v); },
    _map: map,
  };
}

test("帳本：一天一筆，逐回合累加", async () => {
  const store = fakeStore();
  const now = new Date("2026-08-31T10:00:00Z");
  await recordTurnUsage(store, { provider: "deepseek", model: "v4f", tokens: { promptTokens: 1000, outputTokens: 300, cachedTokens: 800 }, now });
  await recordTurnUsage(store, { provider: "deepseek", model: "v4f", tokens: { promptTokens: 1200, outputTokens: 250, cachedTokens: 1000 }, now });

  const [today] = await readUsageRange(store, { days: 1, now });
  assert.equal(today.date, usageDateKey(now));
  assert.equal(today.turns, 2);
  assert.equal(today.measuredTurns, 2);
  assert.equal(today.promptTokens, 2200);
  assert.equal(today.cachedTokens, 1800);
  assert.equal(today.outputTokens, 550);
  assert.equal(today.byProvider.deepseek.turns, 2);
});

test("帳本：供應商沒回報 usage 時，回合仍然計數，但不進 token 統計", async () => {
  // 「沒回報」跟「用了 0 個 token」是兩件事。混為一談會讓面板上的數字很漂亮，
  // 但那只是沒有資料。
  const store = fakeStore();
  const now = new Date("2026-08-31T10:00:00Z");
  await recordTurnUsage(store, { provider: "workers-ai", tokens: null, now });
  const [today] = await readUsageRange(store, { days: 1, now });
  assert.equal(today.turns, 1, "回合要算");
  assert.equal(today.measuredTurns, 0, "但沒有計量");
  assert.equal(today.promptTokens, 0);
});

test("帳本：寫入失敗不可以讓回合失敗", async () => {
  const broken = { persistent: true, async getRaw() { throw new Error("KV 掛了"); }, async putRaw() {} };
  const ok = await recordTurnUsage(broken, { provider: "deepseek", tokens: { promptTokens: 1, outputTokens: 1, cachedTokens: 0 } });
  assert.equal(ok, false, "回 false，但不丟錯——帳本是儀表板，不是遊戲狀態");
});

test("帳本：估算值進 estimatedCachedTokens，絕對不加進真實的 cachedTokens", async () => {
  // 「沒回報、用字元比例猜」跟「供應商真的回報」是兩件事，混在同一個欄位會讓
  // 帳本上看起來像是有真實依據的數字，實際上是猜的。
  const store = fakeStore();
  const now = new Date("2026-08-31T10:00:00Z");
  await recordTurnUsage(store, {
    provider: "custom-relay",
    tokens: { promptTokens: 2000, outputTokens: 50, cachedTokens: null },
    cacheEstimate: { hit: 1800, miss: 200, total: 2000, ratio: 0.9, estimated: true },
    now,
  });
  const [today] = await readUsageRange(store, { days: 1, now });
  assert.equal(today.turns, 1);
  assert.equal(today.measuredTurns, 1, "有回報 promptTokens/outputTokens，算有計量");
  assert.equal(today.cachedTokens, 0, "真實命中欄位沒回報，不能被推算值填進去");
  assert.equal(today.estimatedTurns, 1);
  assert.equal(today.estimatedPromptTokens, 2000);
  assert.equal(today.estimatedCachedTokens, 1800);
});

test("帳本：有真實 cachedTokens 時，就算傳了 cacheEstimate 也不記進估算欄位", async () => {
  const store = fakeStore();
  const now = new Date("2026-08-31T10:00:00Z");
  await recordTurnUsage(store, {
    provider: "deepseek",
    tokens: { promptTokens: 2000, outputTokens: 50, cachedTokens: 1900 },
    cacheEstimate: { hit: 1800, miss: 200, total: 2000, ratio: 0.9, estimated: true },
    now,
  });
  const [today] = await readUsageRange(store, { days: 1, now });
  assert.equal(today.cachedTokens, 1900, "真實值優先，估算值在這種情況下根本不該被呼叫端傳進來，但即使傳了也不能覆蓋真實欄位");
  assert.equal(today.estimatedTurns, 0);
  assert.equal(today.estimatedCachedTokens, 0);
});

/** 跟 test/sessionStore.test.js 同一個假 KV 實作，讓 admin usage handler 走真正的 resolveSessionStore(KV) 路徑。 */
function fakeKv() {
  const map = new Map();
  return {
    async get(key, type) {
      const raw = map.get(key);
      if (raw == null) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
    async list({ prefix, limit } = {}) {
      const keys = [...map.keys()].filter((k) => !prefix || k.startsWith(prefix)).slice(0, limit);
      return { keys: keys.map((name) => ({ name })) };
    },
  };
}

test("面板：estimatedCacheSaving 跟 cacheSaving 分開算，互不影響，且不用於同一筆命中率", async () => {
  const kv = fakeKv();
  const env = baseEnv({
    SAVES: kv,
    ADMIN_PRICE_CACHE_HIT_PER_MTOK: "1",
    ADMIN_PRICE_CACHE_MISS_PER_MTOK: "10",
    ADMIN_PRICE_OUTPUT_PER_MTOK: "100",
  });
  const store = resolveSessionStore(env);
  const now = new Date("2026-08-31T10:00:00Z");

  // 一筆真實回報（DeepSeek 官方回 prompt_cache_hit_tokens），一筆只有字元比例推算值（第三方中轉沒回報）。
  await recordTurnUsage(store, {
    provider: "deepseek",
    tokens: { promptTokens: 1_000_000, outputTokens: 0, cachedTokens: 800_000 },
    now,
  });
  await recordTurnUsage(store, {
    provider: "custom-relay",
    tokens: { promptTokens: 1_000_000, outputTokens: 0, cachedTokens: null },
    cacheEstimate: { hit: 900_000, miss: 100_000, total: 1_000_000, ratio: 0.9, estimated: true },
    now,
  });

  const res = await adminUsageGet({ request: await reqAs(ADMIN_ID), env });
  const { status, body } = await read(res);
  assert.equal(status, 200);

  // 真實命中率只算 DeepSeek 那一筆：800,000 / 2,000,000（兩筆的 promptTokens 加總）。
  assert.equal(body.total.cacheHitRatio, 0.4);
  // 估算命中率只算沒回報的那一筆：900,000 / 1,000,000，不會被真實那筆稀釋，也不會被算進 cacheHitRatio。
  assert.equal(body.total.estimatedCacheHitRatio, 0.9);

  // 真實省下的錢：只用 cachedTokens=800,000／promptTokens=2,000,000 換算，不含估算的那一筆。
  assert.ok(body.total.cacheSaving > 0);
  // 估算省下的錢：獨立欄位，只用估算那一筆的 900,000/1,000,000 換算，兩者不相等也不相加。
  assert.ok(body.total.estimatedCacheSaving > 0);
  assert.notEqual(body.total.cacheSaving, body.total.estimatedCacheSaving);
});

test("帳本：讀不到的日期回空帳，不是缺一格", async () => {
  const days = await readUsageRange(fakeStore(), { days: 5, now: new Date("2026-08-31T00:00:00Z") });
  assert.equal(days.length, 5);
  assert.deepEqual(days[4], emptyDailyUsage("2026-08-27"));
});

// ---------------------------------------------------------------------------
// token 抽取與費率
// ---------------------------------------------------------------------------

test("extractTokenUsage：認得 OpenAI 相容、DeepSeek 與 Gemini 三種形狀", () => {
  assert.deepEqual(
    extractTokenUsage({ usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_cache_hit_tokens: 768 } }),
    { promptTokens: 1000, outputTokens: 200, cachedTokens: 768 }
  );
  assert.deepEqual(
    extractTokenUsage({ usage: { prompt_tokens: 400, completion_tokens: 90, prompt_tokens_details: { cached_tokens: 256 } } }),
    { promptTokens: 400, outputTokens: 90, cachedTokens: 256 }
  );
  assert.deepEqual(
    extractTokenUsage({ usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 150, cachedContentTokenCount: 640 } }),
    { promptTokens: 800, outputTokens: 150, cachedTokens: 640 }
  );
  // 沒回報 -> null，不是 0
  assert.equal(extractTokenUsage({}), null);
  assert.equal(extractTokenUsage(null), null);
  // 沒有快取欄位 -> cachedTokens 是 null（不知道），不是 0（知道是零）
  assert.equal(extractTokenUsage({ usage: { prompt_tokens: 10, completion_tokens: 2 } }).cachedTokens, null);
});

test("費率：三個欄位缺一個就整組視為未設定", () => {
  // 用「有的那兩個」去算會得到一個看起來合理、但少算一整類成本的數字，那比沒有數字更危險。
  assert.equal(resolvePricing({}).configured, false);
  assert.equal(resolvePricing({ ADMIN_PRICE_CACHE_HIT_PER_MTOK: "0.1", ADMIN_PRICE_OUTPUT_PER_MTOK: "1" }).configured, false);
  const full = resolvePricing({
    ADMIN_PRICE_CACHE_HIT_PER_MTOK: "0.02",
    ADMIN_PRICE_CACHE_MISS_PER_MTOK: "0.2",
    ADMIN_PRICE_OUTPUT_PER_MTOK: "0.4",
    ADMIN_PRICE_CURRENCY: "USD",
  });
  assert.equal(full.configured, true);
  assert.equal(full.currency, "USD");
});

test("成本是虛擬換算：命中與未命中分開計價，跟實際供應商無關", () => {
  const pricing = resolvePricing({
    ADMIN_PRICE_CACHE_HIT_PER_MTOK: "1",
    ADMIN_PRICE_CACHE_MISS_PER_MTOK: "10",
    ADMIN_PRICE_OUTPUT_PER_MTOK: "100",
  });
  // 1,000,000 輸入（其中 800,000 命中）＋ 1,000,000 輸出
  const cost = estimateCost({ promptTokens: 1_000_000, cachedTokens: 800_000, outputTokens: 1_000_000 }, pricing);
  assert.equal(cost.input, 0.8 * 1 + 0.2 * 10); // 2.8
  assert.equal(cost.output, 100);
  assert.equal(cost.total, 102.8);
  // 沒設費率就不假裝算得出來
  assert.equal(estimateCost({ promptTokens: 1, cachedTokens: 0, outputTokens: 1 }, resolvePricing({})), null);
});

test("彙總：sumUsage 把多天加起來，供應商分桶也要合併", () => {
  const total = sumUsage([
    { turns: 2, measuredTurns: 2, promptTokens: 100, cachedTokens: 60, outputTokens: 20, byProvider: { a: { turns: 2, promptTokens: 100, outputTokens: 20, model: "m1" } } },
    { turns: 3, measuredTurns: 1, promptTokens: 50, cachedTokens: 10, outputTokens: 5, byProvider: { a: { turns: 1, promptTokens: 50, outputTokens: 5 }, b: { turns: 2, promptTokens: 0, outputTokens: 0 } } },
  ]);
  assert.equal(total.turns, 5);
  assert.equal(total.measuredTurns, 3);
  assert.equal(total.promptTokens, 150);
  assert.equal(total.byProvider.a.turns, 3);
  assert.equal(total.byProvider.a.model, "m1");
  assert.equal(total.byProvider.b.turns, 2);
});
