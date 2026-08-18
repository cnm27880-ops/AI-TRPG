// /api/combat/* 的「傷害嚴重度標籤」與「敵人意圖預告」接線測試（Phase 5.3 任務4／任務5）。
//
// 引擎那一層各自都有單元測試（test/resolveCombatAction.test.js、test/encounterState.test.js）。
// 這一份只問一件事：**API 有沒有把它們交出去**。這個專案反覆抓到的失敗模式就是
// 「引擎做得到、沒有人問它」——標籤算得再準，回應裡沒有這個欄位，前端與AI都看不到，
// 戰鬥描寫就還是那個乾癟的版本，而且沒有任何測試會紅。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as combatStart } from "../functions/api/combat/start.js";
import { onRequestPost as combatAct } from "../functions/api/combat/act.js";
import { onRequestPost as combatResolve } from "../functions/api/combat/resolve.js";
import { emptyCharacter } from "../core/schema.js";
import { computeDerivedStats } from "../core/derivedStats.js";
import { DAMAGE_SEVERITY_TAGS } from "../core/combat/resolveCombatAction.js";
import { PLACEHOLDER_ENEMY } from "../content/combat/placeholderEncounters.js";

const req = (env, body) => ({ request: { json: async () => body }, env });
const read = async (res) => JSON.parse(await res.text());

function 戰鬥用角色卡() {
  const c = emptyCharacter("戰鬥實測");
  c.attributes = { 力量: 4, 敏捷: 3, 耐力: 3, 智力: 2, 感知: 3, 意志: 2 };
  c.skills.格鬥 = 3;
  c.derived = computeDerivedStats(c.attributes);
  return c;
}

async function newSession(env) {
  const body = await read(await sessionPost(req(env, { character: 戰鬥用角色卡() })));
  assert.equal(body.ok, true, JSON.stringify(body));
  return body.session.id;
}

/** 先攻是擲骰決定的，而這裡問的不是先攻——直接把順位固定成玩家先手。 */
async function 讓玩家先手(env, sessionId) {
  const { resolveSessionStore } = await import("../content/storage/sessionStore.js");
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  session.combat.order = ["player", "enemy"];
  session.combat.turnIndex = 0;
  await store.put(session);
  return session;
}

test("/api/combat/start：開戰的回應就帶著這一輪的意圖預告(玩家第一次出手前就看得到)", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const started = await read(await combatStart(req(env, { sessionId })));

  assert.equal(started.ok, true, JSON.stringify(started));
  assert.ok(
    PLACEHOLDER_ENEMY.telegraphs.includes(started.combat.currentTelegraph),
    "預告必須是這隻敵人自己的文案，不是隨便一句話"
  );
});

test("/api/combat/act：雙方的攻擊結果都帶著傷害嚴重度標籤", async () => {
  const env = {};
  const sessionId = await newSession(env);
  await combatStart(req(env, { sessionId }));
  await 讓玩家先手(env, sessionId);

  const res = await read(await combatAct(req(env, { sessionId, weaponKey: "unarmed" })));
  assert.equal(res.ok, true, JSON.stringify(res));

  const tags = Object.values(DAMAGE_SEVERITY_TAGS);
  assert.ok(tags.includes(res.playerAttack.damageSeverityTag), "玩家攻擊要帶標籤");
  if (res.enemyAttack) {
    assert.ok(tags.includes(res.enemyAttack.damageSeverityTag), "敵人攻擊也要帶標籤");
  }
});

test("/api/combat/act：回傳的敘事指令要求AI照標籤描寫視覺與聽覺細節", async () => {
  const env = {};
  const sessionId = await newSession(env);
  await combatStart(req(env, { sessionId }));
  await 讓玩家先手(env, sessionId);

  const res = await read(await combatAct(req(env, { sessionId, weaponKey: "unarmed" })));
  const prompt = res.narrationPrompts[0];

  assert.match(prompt, /視覺與聽覺細節/);
  assert.ok(prompt.includes(res.playerAttack.damageSeverityTag), "指令裡要帶著這一擊實際的標籤");
});

test("/api/combat/act：敵人反擊的敘事指令會承接這一輪玩家看過的那句預告", async () => {
  const env = {};
  const sessionId = await newSession(env);
  await combatStart(req(env, { sessionId }));
  const session = await 讓玩家先手(env, sessionId);
  const telegraphBefore = session.combat.currentTelegraph;

  const res = await read(await combatAct(req(env, { sessionId, weaponKey: "unarmed" })));
  assert.equal(res.telegraph, telegraphBefore, "回應要說得出這一輪玩家看到的是哪一句");

  if (res.enemyAttack) {
    const enemyPrompt = res.narrationPrompts.at(-1);
    assert.ok(enemyPrompt.includes(telegraphBefore), "敵人的敘事指令要帶著牠剛才的預告動作");
    assert.match(enemyPrompt, /不可以當作沒發生過/);
  }
});

test("/api/combat/act：戰鬥沒結束時，下一輪的預告已經抽好回傳給前端", async () => {
  const env = {};
  const sessionId = await newSession(env);
  await combatStart(req(env, { sessionId }));
  await 讓玩家先手(env, sessionId);

  const res = await read(await combatAct(req(env, { sessionId, weaponKey: "unarmed" })));
  if (res.combat.active) {
    assert.ok(
      PLACEHOLDER_ENEMY.telegraphs.includes(res.nextTelegraph),
      "玩家按下一次攻擊之前，就要知道敵人正在做什麼"
    );
    assert.equal(res.nextTelegraph, res.combat.currentTelegraph);
  }
});

test("/api/combat/resolve：無狀態端點也回傳標籤與組好的敘事指令", async () => {
  const env = {};
  const res = await read(
    await combatResolve(
      req(env, {
        attackType: "肉搏",
        attackParams: { strength: 10, unarmedSkill: 3, weaponDamage: 1 },
        defenderAttributes: { 敏捷: 1, 感知: 1 },
        defenderHpState: { max: 20, intact: 20, B: 0, L: 0, A: 0 },
        severity: "B",
        attackerLabel: "你",
        targetLabel: "掠奪者",
        telegraph: "掠奪者正在為霰彈槍重新上膛，黃銅彈殼叮噹落地",
      })
    )
  );

  assert.equal(res.ok, true, JSON.stringify(res));
  assert.ok(Object.values(DAMAGE_SEVERITY_TAGS).includes(res.result.damageSeverityTag));
  assert.match(res.narrationPrompt, /掠奪者/);
  assert.match(res.narrationPrompt, /霰彈槍重新上膛/);
});

test("事件日誌的戰鬥摘要帶著標籤(它是餵回給AI的事實記憶)", async () => {
  const env = {};
  const sessionId = await newSession(env);
  await combatStart(req(env, { sessionId }));
  await 讓玩家先手(env, sessionId);
  await combatAct(req(env, { sessionId, weaponKey: "unarmed" }));

  const { resolveSessionStore } = await import("../content/storage/sessionStore.js");
  const { summarizeForJournal } = await import("../core/eventLog.js");
  const session = await resolveSessionStore(env).get(sessionId);
  const combatSummaries = summarizeForJournal(session.log).filter((e) => e.type === "combat_action");

  assert.ok(combatSummaries.length > 0);
  assert.ok(
    combatSummaries.some((e) => Object.values(DAMAGE_SEVERITY_TAGS).some((t) => e.summary.includes(t))),
    "戰鬥事件的摘要要看得到傷害標籤"
  );
});
