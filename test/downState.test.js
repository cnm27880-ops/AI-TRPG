// 傷勢閘門與復活流程 —— 2026-08-16 排查清單第3項。
//
// 這一組測試釘住的是一個「規則層算對了，但結果沒有生效」的bug：
// core/health.js 的 evaluateStatus() 一直都會算出 dead / unconscious，
// core/deathAndRevival.js 也早就有完整的復活規則與測試，但這兩者在整個
// functions/ 與 content/ 底下**一次都沒有被引用過**。玩家在戰鬥裡被打死之後，
// 照樣可以選選項、擲骰、推進劇情，畫面上一切正常。
//
// 所以下面測的重點是「接線有沒有真的接上」，不是規則本身（規則有自己的測試）。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost, onRequestGet as sessionGet } from "../functions/api/session.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import { onRequestPost as combatStart } from "../functions/api/combat/start.js";
import { onRequestPost as revivePost, onRequestGet as reviveGet } from "../functions/api/revive.js";
import { getDownState, revivalQuote, reviveCharacter } from "../content/downState.js";
import { emptyCharacter } from "../core/schema.js";
import { applyDamage, createHpState } from "../core/health.js";
import { MAX_REVIVALS } from "../core/deathAndRevival.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";

const DRAFT = {
  concept: { name: "測試輪迴者", gender: "男" },
  attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
  skills: { 格鬥: 3, 射擊: 0, 體魄: 1, 潛行: 0, 求生: 0, 偵察: 2, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 0 },
};

const GOOD_REPLY = JSON.stringify({
  narration: "敘事",
  options: [
    { label: "選項一", attribute: "感知", skill: "偵察", difficulty: "容易" },
    { label: "選項二", attribute: "力量", skill: "格鬥", difficulty: "普通" },
    { label: "選項三", attribute: "意志", skill: null, difficulty: "普通" },
    { label: "選項四", attribute: "敏捷", skill: "體魄", difficulty: "困難" },
  ],
});

function makeEnv() {
  return { AI: { run: async () => ({ response: GOOD_REPLY }) } };
}

const req = (env, body) => ({ request: { json: async () => body }, env });
const getReq = (env, url) => ({ request: { url }, env });
const read = async (res) => ({ status: res.status, body: JSON.parse(await res.text()) });

async function newSession(env) {
  const res = await read(await sessionPost(req(env, { draft: DRAFT })));
  assert.equal(res.body.ok, true);
  return res.body.session.id;
}

/** 把存檔裡的角色打到指定狀態。直接改存檔比打一場真的戰鬥穩定得多。 */
async function damageSessionCharacter(env, sessionId, mutate) {
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  mutate(session.character);
  // 測試直接操作 authoritative storage；公開 session API 不應提供可回存的 raw reference。
  await store.put(session);
}

// ---------------------------------------------------------------------------
// content/downState.js 本身
// ---------------------------------------------------------------------------

test("getDownState：完好的角色可以行動", () => {
  const hero = emptyCharacter("完好");
  const state = getDownState(hero);
  assert.equal(state.canAct, true);
  assert.equal(state.reason, null);
});

test("getDownState：intact歸零且有傷勢時判定為昏迷，不能行動", () => {
  const hero = emptyCharacter("昏迷");
  hero.derived.hp = applyDamage(createHpState(6), 6, "B");
  const state = getDownState(hero);
  assert.equal(state.unconscious, true);
  assert.equal(state.canAct, false);
  assert.match(state.reason, /昏迷/);
});

test("getDownState：全惡性傷判定為死亡", () => {
  const hero = emptyCharacter("死亡");
  hero.derived.hp = applyDamage(createHpState(6), 6, "A");
  const state = getDownState(hero);
  assert.equal(state.dead, true);
  assert.equal(state.canAct, false);
});

test("reviveCharacter：付得起就復活，扣款、記次數、傷勢清空三件事都要發生", () => {
  const hero = emptyCharacter("復活測試");
  hero.derived.hp = applyDamage(createHpState(6), 6, "A");
  hero.xp.earned = 100;
  hero.xp.spent = 0; // 未花100、已花0 → 費用 100+0=100，剛好付得起

  const result = reviveCharacter(hero);
  assert.equal(result.ok, true);
  assert.equal(result.cost, 100);
  assert.equal(hero.reviveCount, 1, "復活次數要記上去，否則永遠復活不完");
  assert.equal(hero.xp.spent, 100, "費用要真的扣掉");
  assert.equal(getDownState(hero).canAct, true, "復活後要能行動");
  assert.equal(hero.derived.hp.intact, hero.derived.hp.max, "傷勢軌要清乾淨");
});

test("reviveCharacter：付不起時什麼都不改，並回報還差多少", () => {
  const hero = emptyCharacter("窮");
  hero.derived.hp = applyDamage(createHpState(6), 6, "A");
  hero.xp.earned = 10;
  hero.xp.spent = 50; // 未花0(下限)、已花50 → 費用50，可動用0

  const result = reviveCharacter(hero);
  assert.equal(result.ok, false);
  assert.equal(result.permaDeath, true);
  assert.equal(result.shortfall, 50);
  assert.equal(hero.reviveCount, 0, "失敗不可以扣次數");
  assert.equal(hero.xp.spent, 50, "失敗不可以扣款");
});

test("reviveCharacter：復活次數用完之後是真死，理由要跟『付不起』分得開", () => {
  const hero = emptyCharacter("用完");
  hero.derived.hp = applyDamage(createHpState(6), 6, "A");
  hero.xp.earned = 99999;
  hero.reviveCount = MAX_REVIVALS;

  const result = reviveCharacter(hero);
  assert.equal(result.ok, false);
  assert.equal(result.permaDeath, true);
  assert.match(result.reason, /復活機會/);
  assert.ok(!/湊不出/.test(result.reason), "這是次數用完，不是付不起——兩者對玩家的意義完全不同");
});

test("revivalQuote：不改任何狀態，純查詢", () => {
  const hero = emptyCharacter("查詢");
  hero.xp.earned = 30;
  hero.xp.spent = 10;
  const quote = revivalQuote(hero);
  assert.equal(quote.cost, 30, "未花20 + 已花10 = 30");
  assert.equal(quote.available, 20);
  assert.equal(quote.affordable, false);
  assert.equal(hero.xp.spent, 10, "查詢不可以有副作用");
});

// ---------------------------------------------------------------------------
// 接線：API 層真的有在擋
// ---------------------------------------------------------------------------

test("/api/turn：昏迷的角色送出行動時要被擋下(409)，不能繼續照常擲骰推劇情", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env);
  await damageSessionCharacter(env, sessionId, (c) => {
    c.derived.hp = applyDamage(createHpState(c.derived.hp.max), c.derived.hp.max, "B");
  });

  const { status, body } = await read(
    await turnPost(req(env, { sessionId, playerAction: "站起來繼續走" }))
  );
  assert.equal(status, 409);
  assert.equal(body.ok, false);
  assert.equal(body.downState.canAct, false);
  assert.match(body.error, /昏迷/);
  assert.deepEqual(body.options, [], "不能行動時不該還給選項讓玩家繼續點");
});

test("/api/turn：開場/接續敘事不受閘門影響(玩家重整回來要看得到自己倒下的處境)", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env);
  await damageSessionCharacter(env, sessionId, (c) => {
    c.derived.hp = applyDamage(createHpState(c.derived.hp.max), c.derived.hp.max, "B");
  });

  const { status, body } = await read(await turnPost(req(env, { sessionId })));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.downState.canAct, false, "敘事放行，但狀態仍要如實回報給前端");
});

test("/api/turn：健康的角色每回合都會帶回 downState(前端才能持續顯示)", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env);
  const { body } = await read(await turnPost(req(env, { sessionId })));
  assert.equal(body.downState.canAct, true);
});

test("/api/combat/start：昏迷/死亡的角色不能開新戰鬥", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env);
  await damageSessionCharacter(env, sessionId, (c) => {
    c.derived.hp = applyDamage(createHpState(c.derived.hp.max), c.derived.hp.max, "A");
  });

  const { status, body } = await read(await combatStart(req(env, { sessionId })));
  assert.equal(status, 409);
  assert.equal(body.downState.canAct, false);
});

test("/api/session GET：帶回 downState 與 revival，玩家重整回來立刻知道自己倒下了", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env);
  await damageSessionCharacter(env, sessionId, (c) => {
    c.derived.hp = applyDamage(createHpState(c.derived.hp.max), c.derived.hp.max, "A");
  });

  const { body } = await read(await sessionGet(getReq(env, `https://x/api/session?id=${sessionId}`)));
  assert.equal(body.downState.dead, true);
  assert.ok(body.revival, "死亡時要一起給復活報價，前端不用再打一次");
  const saved = await resolveSessionStore(env).get(sessionId);
  assert.equal(saved.scenario != null, true);
});

test("/api/revive：死亡→復活→可以繼續玩，而且事件日誌留下紀錄", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env);
  await damageSessionCharacter(env, sessionId, (c) => {
    c.derived.hp = applyDamage(createHpState(c.derived.hp.max), c.derived.hp.max, "A");
    c.xp.earned = 100;
  });

  const quote = await read(await reviveGet(getReq(env, `https://x/api/revive?id=${sessionId}`)));
  assert.equal(quote.body.revival.affordable, true);

  const { status, body } = await read(await revivePost(req(env, { sessionId })));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.reviveCount, 1);
  assert.equal(body.downState.canAct, true);

  // 復活之後閘門要真的放行
  const turn = await read(await turnPost(req(env, { sessionId, playerAction: "繼續前進" })));
  assert.equal(turn.body.ok, true, "復活後應該可以正常行動");

  const after = await resolveSessionStore(env).get(sessionId);
  assert.ok(
    after.log.events.some((e) => e.type === "revival"),
    "復活要進事件日誌(它同時是餵給AI的事實記憶)"
  );
});

test("/api/revive：沒死的角色呼叫復活要被拒絕，不能拿來當免費補血", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env);
  const { status, body } = await read(await revivePost(req(env, { sessionId })));
  assert.equal(status, 409);
  assert.match(body.error, /沒有死亡/);
});
