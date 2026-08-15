// 副本系統的端對端整合測試 —— 直接呼叫 functions/api/*.js 的 handler(不是只測底下的
// content/core模組)，因為這次接線的bug(劣化結局節點被誤判成可推進節點、最終戰節點能被
// 敘事信號跳過打贏、boss的armor沒被複製進combat.enemy)全部都是「單一模組測試綠燈，
// 但兩個模組接在一起時才會炸」的類型，只測 content/scenario/progress.js 本身測不出來。
//
// LLM呼叫透過假的 env.AI binding 注入固定腳本，不需要真的網路呼叫也不需要金鑰。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import { onRequestPost as combatStart } from "../functions/api/combat/start.js";
import { onRequestPost as combatAct } from "../functions/api/combat/act.js";
import { resolveSessionStore, newSessionId } from "../content/storage/sessionStore.js";
import { DEFAULT_SCENARIO_ID } from "../content/scenario/registry.js";

const DRAFT = {
  concept: { name: "測試輪迴者", gender: "男" },
  attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
  skills: { 格鬥: 3, 射擊: 0, 體魄: 1, 潛行: 0, 求生: 0, 偵察: 2, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 0 },
};

function makeEnv(scriptedTurns) {
  let i = 0;
  return {
    AI: {
      run: async () => {
        const beat = scriptedTurns[Math.min(i, scriptedTurns.length - 1)];
        i++;
        return {
          response: JSON.stringify({
            narration: beat.narration ?? "……",
            nodeComplete: beat.nodeComplete ?? null,
            options: [
              { label: "選項一", attribute: "感知", skill: "偵察", difficulty: "容易" },
              { label: "選項二", attribute: "智力", skill: "技藝", difficulty: "普通" },
              { label: "選項三", attribute: "意志", skill: null, difficulty: "普通" },
              { label: "選項四", attribute: "敏捷", skill: "體魄", difficulty: "困難" },
            ],
          }),
        };
      },
    },
  };
}

function req(env, body) {
  return { request: { json: async () => body }, env };
}

async function readJson(res) {
  return JSON.parse(await res.text());
}

test("副本整合：開場不消耗節點，三個主線節點依序完成，最終戰只能透過戰鬥結算", async () => {
  const env = makeEnv([
    { narration: "開場", nodeComplete: null },
    { narration: "節點一完成", nodeComplete: { divergenceTier: 0 } },
    { narration: "節點二完成", nodeComplete: { divergenceTier: 1 } },
    { narration: "節點三完成", nodeComplete: { divergenceTier: 2 } },
    { narration: "AI試圖用嘴巴打贏最終戰(應該被引擎擋下)", nodeComplete: { divergenceTier: 4 } },
  ]);

  let r = await readJson(await sessionPost(req(env, { draft: DRAFT })));
  assert.equal(r.ok, true);
  assert.equal(r.session.scenario.packId, DEFAULT_SCENARIO_ID);
  const sessionId = r.session.id;

  // 開場：不應該有任何節點被完成
  r = await readJson(await turnPost(req(env, { sessionId })));
  assert.equal(r.scenario.nodeCompleted, null);
  const firstNodeId = r.scenario.activeNode.id;

  // 三個主線節點依序完成
  const completedIds = [];
  for (let n = 0; n < 3; n++) {
    r = await readJson(await turnPost(req(env, { sessionId, playerAction: `推進第${n + 1}步` })));
    assert.equal(r.ok, true);
    assert.ok(r.scenario.nodeCompleted, `第${n + 1}次行動應該要完成一個節點`);
    completedIds.push(r.scenario.nodeCompleted.nodeId);
  }
  assert.deepEqual(new Set(completedIds).size, 3, "三個節點應該各自完成一次，不重複");
  assert.equal(completedIds[0], firstNodeId);

  // 現在活躍節點應該是最終戰
  assert.equal(r.scenario.activeNode.isFinale, true);
  const finaleNodeId = r.scenario.activeNode.id;

  // AI嘗試用敘事JSON跳過最終戰：必須被引擎擋下，活躍節點維持不變
  r = await readJson(await turnPost(req(env, { sessionId, playerAction: "我準備迎戰" })));
  assert.equal(r.scenario.nodeCompleted, null, "最終戰節點不該被敘事信號結算");
  assert.equal(r.scenario.activeNode.id, finaleNodeId);

  // 開戰：應該自動採用最終戰節點掛的boss樣板，而不是預設雜魚
  r = await readJson(await combatStart(req(env, { sessionId })));
  assert.equal(r.ok, true);
  assert.equal(r.combat.scenarioFinaleNodeId, finaleNodeId);
  assert.notEqual(r.combat.enemy.name, "掠奪者", "最終戰不該用預設雜魚樣板");
  assert.equal(r.combat.enemy.armor, 1, "boss樣板的armor要真的被帶進combat.enemy(先前的bug：armor被漏複製)");

  // 讓戰鬥在有限回合內確定分出勝負：直接調整雙方血量，不依賴真實骰子結果
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  session.combat.enemy.hpState = { max: session.combat.enemy.hpState.max, intact: 1, B: 0, L: 0, A: 0, dead: false, unconscious: false };
  session.character.derived.hp = { ...session.character.derived.hp, intact: session.character.derived.hp.max, B: 0, L: 0, A: 0 };
  session.combat.player.hpState = { ...session.character.derived.hp };
  await store.put(session);

  // 命中率取決於雙方屬性/技能的骰池(見 core/combat/defense.js 檔頭關於「單一DC」數學的說明)，
  // 不是每次攻擊都會命中，所以這裡跑夠多輪，而不是假設固定幾輪內一定分出勝負。
  // 敵人只有1點生命、玩家滿血，理論上玩家幾乎不可能輸，只是需要夠多次嘗試等到命中。
  let combatOver = null;
  let lastResult = null;
  for (let i = 0; i < 300 && !combatOver?.over; i++) {
    lastResult = await readJson(await combatAct(req(env, { sessionId, weaponKey: "unarmed" })));
    combatOver = lastResult.combatOver;
    if (!combatOver?.over) {
      // 敵人打不贏(這場測試沒把敵人的攻擊力調弱)，玩家的血量可能被磨掉，
      // 每輪結束前都補滿玩家血量，確保「敵人只剩1點血」才是真正決定勝負的變因。
      const s = await store.get(sessionId);
      if (s.combat?.active) {
        const full = { ...s.character.derived.hp, intact: s.character.derived.hp.max, B: 0, L: 0, A: 0 };
        s.character.derived.hp = full;
        s.combat.player.hpState = { ...full };
        await store.put(s);
      }
    }
  }
  assert.equal(combatOver?.winner, "player", "測試調整過血量，玩家應該必勝");
  assert.ok(lastResult.scenario?.nodeCompleted, "打贏最終戰應該自動結算節點");
  assert.equal(lastResult.scenario.nodeCompleted.nodeId, finaleNodeId);

  const finalSession = await store.get(sessionId);
  assert.equal(finalSession.scenario.progress.nodes[finaleNodeId].completed, true);
  assert.ok(finalSession.character.xp.earned > 0, "節點完成應該真的把獎勵加進角色的XP");
});

test("副本整合：沒有指定scenarioId時預設用內建範例副本，且會用開場場景當作sceneContext", async () => {
  const env = makeEnv([{ narration: "開場" }]);
  const r = await readJson(await sessionPost(req(env, { draft: DRAFT })));
  assert.equal(r.session.scenario.packId, DEFAULT_SCENARIO_ID);
  assert.ok(r.session.scene.context.length > 0, "應該要用章節的openingScene當作初始場景描述");
});

test("副本整合：指定不存在的scenarioId要被明確擋下，不會靜默退回預設", async () => {
  const env = makeEnv([]);
  const r = await readJson(await sessionPost(req(env, { draft: DRAFT, scenarioId: "scenario.not-exist" })));
  assert.equal(r.ok, false);
  assert.match(r.error, /找不到副本/);
});
