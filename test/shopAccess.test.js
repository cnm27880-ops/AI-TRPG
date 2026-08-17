// 主神商店的地點門禁與 /api/shop 端點測試。
//
// 這一組守的是規則書第469行那條「兩種貨幣兩種待遇」的規則：
//   支線／獎勵點數 —— 只能在主神空間花
//   經驗(XP)      —— 兩邊都能花，但在副本中要付兩倍
// 使用者的要求是「跟無限恐怖一樣，副本結束才能買」，書上的規則比那句話更精確，
// 這裡實作的是書上的版本，XP 那一半是它的例外。

import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as shopGet, onRequestPost as shopPost } from "../functions/api/shop.js";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { resolveSessionStore, ensureSessionShape, SESSION_VERSION } from "../content/storage/sessionStore.js";
import { locationOf, priceAt, describeAccess, IN_MOVIE_XP_MULTIPLIER } from "../content/shop/access.js";
import { parsePrice, createWallet } from "../content/shop/wallet.js";
import { evaluatePurchase } from "../content/shop/catalog.js";
import { allGoods, SHOP_GOODS } from "../content/shop/registry.js";
import { emptyCharacter } from "../core/schema.js";

const DRAFT = {
  concept: { name: "測試輪迴者", gender: "男" },
  attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
  skills: { 格鬥: 3, 射擊: 0, 體魄: 1, 潛行: 0, 求生: 0, 偵察: 2, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 0 },
};
const req = (env, body) => ({ request: { json: async () => body }, env });
const getReq = (env, url) => ({ request: { url }, env });
const read = async (res) => ({ status: res.status, body: JSON.parse(await res.text()) });

async function newSession(env) {
  const res = await read(await sessionPost(req(env, { draft: DRAFT })));
  assert.equal(res.body.ok, true);
  return res.body.session.id;
}

// ---------------------------------------------------------------------------
// 存檔格式
// ---------------------------------------------------------------------------

test("新存檔一開始就有錢包與型態欄位，版本是2", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const session = await resolveSessionStore(env).get(sessionId);
  assert.equal(session.version, SESSION_VERSION);
  assert.deepEqual(session.wallet.tokens, {});
  assert.equal(session.wallet.points, 0);
  assert.deepEqual(session.forms.active, []);
});

test("舊存檔(version 1，沒有錢包)讀出來會就地補上欄位，不會炸也不會蓋掉既有資料", () => {
  const legacy = {
    id: "old",
    version: 1,
    character: emptyCharacter("舊角色"),
    history: [{ action: "看看四周", narration: "走廊很暗" }],
  };
  const fixed = ensureSessionShape(legacy);
  assert.equal(fixed.version, SESSION_VERSION);
  assert.ok(fixed.wallet, "應該補出錢包");
  assert.ok(fixed.forms, "應該補出型態狀態");
  assert.deepEqual(fixed.history, legacy.history, "既有欄位一律原樣保留");
  assert.equal(fixed.character.concept.name, "舊角色");
});

// ---------------------------------------------------------------------------
// 地點判定
// ---------------------------------------------------------------------------

const fakePack = {
  id: "p1",
  name: "測試副本",
  entries: [{ id: "ch1", nodes: [{ id: "n1" }, { id: "n2" }] }],
};
const getPack = (id) => (id === "p1" ? fakePack : null);

function progressWith(completed) {
  return {
    packId: "p1",
    chapterIndex: 0,
    nodes: { n1: { completed: completed.includes("n1") }, n2: { completed: completed.includes("n2") } },
  };
}

test("沒有副本 = 在主神空間", () => {
  assert.equal(locationOf({}, getPack).location, "主神空間");
});

test("副本進行中 = 恐怖片中；主線全完成 = 回到主神空間", () => {
  const inMovie = { scenario: { packId: "p1", progress: progressWith(["n1"]) } };
  assert.equal(locationOf(inMovie, getPack).location, "恐怖片中");

  const cleared = { scenario: { packId: "p1", progress: progressWith(["n1", "n2"]) } };
  assert.equal(locationOf(cleared, getPack).location, "主神空間");
});

test("副本包查不到時保守視為仍在副本中(不要因為一個壞掉的id就把商店打開)", () => {
  const broken = { scenario: { packId: "不存在", progress: progressWith([]) } };
  const at = locationOf(broken, getPack);
  assert.equal(at.location, "恐怖片中");
  assert.match(at.reason, /查不到/);
});

test("戰鬥中會被標記出來，而且描述文字說得出為什麼買不了", () => {
  const fighting = { scenario: { packId: "p1", progress: progressWith([]) }, combat: { active: true } };
  const at = locationOf(fighting, getPack);
  assert.equal(at.inCombat, true);
  assert.match(describeAccess(at), /戰鬥/);
});

// ---------------------------------------------------------------------------
// 兩種貨幣兩種待遇(規則書第469行)
// ---------------------------------------------------------------------------

test("副本中：支線與獎勵點數的商品買不了", () => {
  for (const raw of ["D+500", "200", "C+3000"]) {
    const at = priceAt(parsePrice(raw), "恐怖片中");
    assert.equal(at.blockers.length, 1, `${raw} 應該被擋`);
    assert.equal(at.blockers[0].code, "不在主神空間");
  }
});

test("副本中：XP 商品買得到，但要付兩倍", () => {
  const at = priceAt(parsePrice("3XP"), "恐怖片中");
  assert.deepEqual(at.blockers, [], "XP 商品在副本中不該被擋");
  assert.equal(at.price.xp, 3 * IN_MOVIE_XP_MULTIPLIER);
  assert.equal(at.surcharged, true);
});

test("主神空間：什麼都不加價、什麼都不擋", () => {
  for (const raw of ["D+500", "200", "3XP"]) {
    const at = priceAt(parsePrice(raw), "主神空間");
    assert.deepEqual(at.blockers, []);
    assert.equal(at.surcharged, false);
  }
});

test("副本中而且在戰鬥：連 XP 商品都擋下(這是實作限制，理由要寫清楚)", () => {
  const at = priceAt(parsePrice("3XP"), "恐怖片中", { inCombat: true });
  assert.equal(at.blockers.length, 1);
  assert.equal(at.blockers[0].code, "戰鬥中");
  assert.match(at.blockers[0].message, /實作限制/);
});

test("evaluatePurchase 吃得到地點：同一件商品在兩個地點結果不同", () => {
  const 專長 = SHOP_GOODS.find((g) => g.category === "專長" && g.featLevel === 1);
  const character = emptyCharacter("測試");
  // 專長多半有屬性/技能前提，這則測試要比的是「地點」造成的差別，所以先把前提墊高
  character.attributes = { 力量: 4, 敏捷: 4, 耐力: 4, 智力: 4, 感知: 4, 意志: 4 };
  for (const skill of Object.keys(character.skills)) character.skills[skill] = 3;
  const wallet = createWallet({ xp: 100 });

  const inHub = evaluatePurchase(character, wallet, 專長, { location: "主神空間" });
  const inMovie = evaluatePurchase(character, wallet, 專長, { location: "恐怖片中" });
  assert.equal(inHub.ok, true, JSON.stringify(inHub.blockers));
  assert.equal(inMovie.ok, true, "XP商品在副本中仍然買得到");
  assert.equal(inMovie.price.xp, inHub.price.xp * 2, "但要付兩倍");

  const 物品 = SHOP_GOODS.find((g) => g.category === "物品");
  const blocked = evaluatePurchase(character, createWallet({ tokens: { D: 5 }, points: 9999 }), 物品, {
    location: "恐怖片中",
  });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.blockers.some((b) => b.code === "不在主神空間"));
});

// ---------------------------------------------------------------------------
// 貨架註冊表
// ---------------------------------------------------------------------------

test("執行期的貨架註冊表跟 content/packs 的 JSON 逐件一致(忘記同步就會紅)", async () => {
  const { readFileSync } = await import("node:fs");
  const files = [
    "items", "feats", "bloodline", "cybernetic", "dojutsu",
    "title", "school", "technique", "spell", "pools",
  ];
  const fromJson = files.flatMap(
    (f) => JSON.parse(readFileSync(new URL(`../content/packs/shop-starter-${f}.json`, import.meta.url))).entries
  );
  assert.deepEqual(SHOP_GOODS, fromJson, "shopStarterPacks.js 跟 shop-starter-*.json 走鐘了");
});

test("服務類商品要傳角色卡才算得出來(療傷價格取決於身上有幾點傷)", () => {
  const hurt = emptyCharacter("傷者");
  hurt.derived.hp = { ...hurt.derived.hp, intact: 0, A: 3 };
  const withServices = allGoods(hurt);
  assert.ok(withServices.some((g) => g.goodId === "service.惡性傷害修復"));
  assert.ok(allGoods().length < withServices.length, "不傳角色卡就只有靜態商品");
});

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

test("GET /api/shop：回貨架、錢包與現在人在哪", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const { body } = await read(await shopGet(getReq(env, `https://x/api/shop?sessionId=${sessionId}`)));

  assert.equal(body.ok, true);
  assert.ok(body.shelf.length > 0);
  assert.ok(body.access.location);
  assert.ok(body.access.description.length > 0, "要有一句話說明現在能不能買");
  assert.equal(body.wallet.points, 0);
  assert.ok(body.summary.模板能力, "貨架摘要要分類統計");
});

test("GET /api/shop：新建的存檔在副本裡，所以點數商品是買不了的狀態", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const { body } = await read(await shopGet(getReq(env, `https://x/api/shop?sessionId=${sessionId}`)));

  assert.equal(body.access.location, "恐怖片中", "建卡完就直接進副本了");
  const 物品 = body.shelf.find((s) => s.good.category === "物品");
  assert.equal(物品.purchasable, false);
  assert.ok(物品.blockers.some((b) => b.code === "不在主神空間"));
});

test("POST /api/shop：副本中買點數商品被擋，而且理由指名是地點", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  session.wallet = createWallet({ tokens: { D: 5 }, points: 9999, xp: 99 });
  await store.put(session);

  const 物品 = SHOP_GOODS.find((g) => g.category === "物品");
  const { body } = await read(await shopPost(req(env, { sessionId, goodId: 物品.goodId })));
  assert.equal(body.ok, false);
  assert.ok(body.blockers.some((b) => b.code === "不在主神空間"));
});

test("POST /api/shop：回到主神空間之後就買得到，而且角色卡與錢包都寫回存檔", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);

  // 把副本標記成通關 = 回到主神空間
  const pack = (await import("../content/scenario/registry.js")).getScenarioPack(session.scenario.packId);
  for (const chapter of pack.entries) {
    for (const node of chapter.nodes ?? []) session.scenario.progress.nodes[node.id] = { completed: true, divergenceTier: 2 };
  }
  session.scenario.progress.chapterIndex = pack.entries.length - 1;
  session.wallet = createWallet({ tokens: { D: 5 }, points: 9999 });
  await store.put(session);

  const 物品 = SHOP_GOODS.find((g) => g.category === "物品");
  const { body } = await read(await shopPost(req(env, { sessionId, goodId: 物品.goodId })));
  assert.equal(body.ok, true, JSON.stringify(body.blockers));
  assert.equal(body.access.location, "主神空間");
  assert.ok(body.receipt.pricePaid);

  const after = await store.get(sessionId);
  assert.ok(
    after.character.abilities.some((a) => a.goodId === 物品.goodId),
    "買到的東西要真的進角色卡"
  );
  assert.ok(after.wallet.points < 9999, "錢要真的被扣");
  assert.ok(
    after.log.events.some((e) => e.type === "purchase"),
    "購買要留在事件日誌裡"
  );
});

test("POST /api/shop：買不存在的商品回404，不是靜靜地什麼都不做", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const res = await read(await shopPost(req(env, { sessionId, goodId: "不存在的商品" })));
  assert.equal(res.status, 404);
  assert.equal(res.body.ok, false);
});

test("掛名商品在貨架上看得到，但買不了", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const { body } = await read(await shopGet(getReq(env, `https://x/api/shop?sessionId=${sessionId}`)));
  const pending = body.shelf.filter((s) => s.status === "掛名");
  assert.ok(pending.length > 0, "貨架上應該有掛名商品");
  for (const item of pending) {
    assert.equal(item.purchasable, false);
    assert.ok(item.blockers.some((b) => b.code === "掛名待補"));
  }
});
