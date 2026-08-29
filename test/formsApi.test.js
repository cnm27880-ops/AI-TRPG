// /api/forms 與 /api/combat/act 的型態接線測試（2026-08-17 第九輪）。
//
// 為什麼要有這一份：型態的規則本身在 test/shopForms.test.js 已經測透了，這一份問的是
// 另一個問題——**API 層有沒有把玩家的決定送進去、有沒有把引擎的收費送回來**。
// 這一輪在真的跑起來的 wrangler 上做端對端實測時，抓到的正是這一層的bug：
// `/api/forms` 擋下一次啟動時回的是 `ok:true`（`...formsPayload()` 帶著自己的 ok
// 被展開在 `ok:false` 後面，把它蓋掉了），於是前端的 `if (!res.ok)` 永遠不成立，
// 玩家按下一個按不動的按鈕會看到一句綠色的「啟動成功」。純函式測試看不到這種東西。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestGet as formsGet, onRequestPost as formsPost } from "../functions/api/forms.js";
import { onRequestPost as combatStart } from "../functions/api/combat/v2/start.js";
import { onRequestPost as combatTurn } from "../functions/api/combat/v2/turn.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";
import { emptyCharacter } from "../core/schema.js";
import { computeDerivedStats } from "../core/derivedStats.js";
import { openPool } from "../core/energyPools.js";
import { SHOP_GOODS } from "../content/shop/registry.js";

const req = (env, body) => ({ request: { json: async () => body }, env });
const getReq = (env, url) => ({ request: { url }, env });
const read = async (res) => JSON.parse(await res.text());

const 混元劍經 = SHOP_GOODS.find((g) => g.goodId === "pool.混元劍經.1");
const 葵花寶典 = SHOP_GOODS.find((g) => g.goodId === "technique.葵花寶典.1");
const 劍氣FormId = "pool.混元劍經.1:劍氣";
const 鬼魅身FormId = "technique.葵花寶典.1:鬼魅身";

/** 一張已經買好那兩件商品、池子也開好的角色卡(買賣流程有自己的測試，這裡不重跑)。 */
function 帶著兩個型態的角色卡({ 內力 = 2 } = {}) {
  const c = emptyCharacter("型態實測");
  c.attributes = { 力量: 3, 敏捷: 3, 耐力: 3, 智力: 2, 感知: 3, 意志: 2 };
  c.skills.格鬥 = 2;
  c.derived = computeDerivedStats(c.attributes);
  c.abilities = [
    { goodId: 混元劍經.goodId, name: 混元劍經.name, effects: 混元劍經.effects },
    { goodId: 葵花寶典.goodId, name: 葵花寶典.name, effects: 葵花寶典.effects },
  ];
  let pools = openPool({}, "劍氣", c.attributes, 混元劍經.goodId);
  pools = openPool(pools, "內力", c.attributes, 葵花寶典.goodId);
  pools.內力 = { ...pools.內力, current: 內力 };
  c.derived.energyPools = pools;
  return c;
}

/**
 * 把行動順位固定成「玩家先手」。先攻是擲骰決定的，而下面兩則測試問的不是先攻——
 * 用 `if (不是玩家先手) return` 跳過的話，那兩則測試會有一半的機率什麼都沒測，
 * 而且看起來還是綠的。
 */

/**
 * 這裡的測試角色卡(帶著兩個型態的角色卡())是刻意配出來驗證型態接線的組合，
 * 屬性總花費超過建卡的 8 點預算(POST /api/session 現在會把超支的 providedCharacter
 * 安全地重置成一張歸零的角色卡，見 content/characterBuilder.js 的 sanitizeProvidedCharacter)。
 * 這裡要測的是「型態花費/池子有沒有正確接線」，不是「建卡預算擋不擋得下超支角色」
 * (那件事已經在 test/security2026_08_24.test.js 測過)，所以先用一張合法角色卡建立
 * session，再直接改寫底層存檔——繞過的是 API 的公開驗證，不是引擎的計算邏輯。
 */
async function newSession(env, character) {
  const body = await read(await sessionPost(req(env, { character: emptyCharacter(character?.concept?.name ?? "測試") })));
  assert.equal(body.ok, true, JSON.stringify(body));
  const sessionId = body.session.id;
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  session.character = character;
  await store.put(session);
  return sessionId;
}

test("/api/forms 把「這次要決定什麼」一起交出去(支付範圍、二選一選項、維持成本)", async () => {
  const env = {};
  const sessionId = await newSession(env, 帶著兩個型態的角色卡());
  const view = await read(await formsGet(getReq(env, `https://x/api/forms?sessionId=${sessionId}`)));

  const 劍氣 = view.forms.find((f) => f.formId === 劍氣FormId);
  assert.deepEqual(劍氣.variable, { poolName: "劍氣", min: 1, max: 3 }, "上限是伺服器算的(敏捷或感知取低)");
  assert.deepEqual(劍氣.modes.map((m) => m.key), ["攻", "防"]);

  const 鬼魅身 = view.forms.find((f) => f.formId === 鬼魅身FormId);
  assert.deepEqual(鬼魅身.upkeep, { action: "自由", pool: { name: "內力", amount: 1 } });
});

test("/api/forms 擋下來的時候一定要回 ok:false(這是端對端實測抓到的bug)", async () => {
  const env = {};
  const sessionId = await newSession(env, 帶著兩個型態的角色卡());
  // 以「輪」計時的型態在戰鬥外啟動不了——沒有輪可以數
  const res = await read(await formsPost(req(env, { sessionId, formId: 劍氣FormId, amount: 2, mode: "攻" })));
  assert.equal(res.ok, false, "擋下來卻回 ok:true 的話，前端會顯示一句綠色的『啟動成功』");
  assert.ok(res.blockers.some((b) => b.code === "缺少輪數"));
  // 而且不可以偷偷扣錢
  const view = await read(await formsGet(getReq(env, `https://x/api/forms?sessionId=${sessionId}`)));
  assert.equal(view.energyPools.劍氣.current, view.energyPools.劍氣.max, "沒啟動成功就不該扣劍氣");
});

test("/api/combat/v2/turn：可變量型態付幾點，攻擊加值就是幾點(而且池子真的少了)", async () => {
  const env = {};
  const character = 帶著兩個型態的角色卡();
  const sessionId = await newSession(env, character);
  const started = await read(await combatStart(req(env, { sessionId, seed: 11 })));
  assert.equal(started.ok, true, JSON.stringify(started));

  const 劍氣攻 = `form:${劍氣FormId}@攻`;
  const base = {
    sessionId,
    battleId: started.battle.battleId,
    stateVersion: started.battle.stateVersion,
  };

  // 沒報支付點數：整批拒絕，而且**一格動作額度都不扣**。
  const 沒報數 = await combatTurn(req(env, {
    ...base,
    requestId: "no-amount",
    selectedActions: [{ actionId: 劍氣攻 }],
  }));
  assert.equal(沒報數.status, 422);
  const 沒報數body = JSON.parse(await 沒報數.text());
  assert.equal(沒報數body.code, "MISSING_PARAMETER", "沒報數不可以偷偷用最小值");
  assert.deepEqual(沒報數body.battle.playerActionBudget.remaining, { swift: 1, move: 1, standard: 1 });

  const 開眼 = await read(await combatTurn(req(env, {
    ...base,
    requestId: "pay-3",
    selectedActions: [{ actionId: 劍氣攻, parameters: { amount: 3 } }],
  })));
  assert.equal(開眼.ok, true, JSON.stringify(開眼));
  assert.match(開眼.resolution.playerActions[0].publicText, /支付 3 點/);
  assert.equal(
    開眼.character.derived.energyPools.劍氣.current,
    character.derived.energyPools.劍氣.max - 3,
    "池子要真的少 3 點"
  );
});

test("/api/combat/v2/turn：維持成本斷氣時，公開紀錄要說得出是哪一個型態、為什麼", async () => {
  const env = {};
  const sessionId = await newSession(env, 帶著兩個型態的角色卡({ 內力: 1 })); // 只夠啟動，維持不了
  const started = await read(await combatStart(req(env, { sessionId, seed: 12 })));
  assert.equal(started.ok, true, JSON.stringify(started));

  const 打完一輪 = await read(await combatTurn(req(env, {
    sessionId,
    battleId: started.battle.battleId,
    stateVersion: started.battle.stateVersion,
    requestId: "ghost-form",
    selectedActions: [{ actionId: `form:${鬼魅身FormId}` }],
  })));
  assert.equal(打完一輪.ok, true, JSON.stringify(打完一輪));
  assert.equal(打完一輪.character.derived.energyPools.內力.current, 0);

  // 跨到第 2 輪時收維持成本，收不到就當場結束——而且**要寫進公開紀錄**，
  // 不然玩家只會看到自己的防御莫名其妙變低。
  const log = 打完一輪.battle.publicLog.map((l) => l.text).join("\n");
  assert.match(log, /鬼魅身 結束/);
  assert.match(log, /內力不足/);
  assert.deepEqual(打完一輪.battle.player.forms, []);
});
