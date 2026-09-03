// 副本系統的端對端整合測試 —— 直接呼叫 functions/api/*.js 的 handler(不是只測底下的
// content/core模組)，因為這次接線的bug(劣化結局節點被誤判成可推進節點、最終戰節點能被
// 敘事信號跳過打贏、boss的armor沒被複製進combat.enemy)全部都是「單一模組測試綠燈，
// 但兩個模組接在一起時才會炸」的類型，只測 content/scenario/progress.js 本身測不出來。
//
// LLM呼叫透過假的 env.AI binding 注入固定腳本，不需要真的網路呼叫也不需要金鑰。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost, onRequestGet as sessionGet } from "../functions/api/session.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import { onRequestPost as restPost } from "../functions/api/rest.js";
import { onRequestPost as combatStart } from "../functions/api/combat/v2/start.js";
import { onRequestPost as combatTurn } from "../functions/api/combat/v2/turn.js";
import { resolveSessionStore, newSessionId } from "../content/storage/sessionStore.js";
import { DEFAULT_SCENARIO_ID, getScenarioPack } from "../content/scenario/registry.js";

const LEGACY_SCENARIO_ID = "scenario.echo-institute-01";

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

test("generic 副本整合：三個主線節點依序完成，最終戰只能透過戰鬥結算", async () => {
  // 這組測試驗證 generic nodeComplete／combat 串接，因此明確使用沒有 reference
  // 的 Echo 範例；V2 異形的 reference pacing 由 referenceV2* 測試覆蓋。
  const env = makeEnv([
    { narration: "節點一完成", nodeComplete: { divergenceTier: 0 } },
    { narration: "節點二完成", nodeComplete: { divergenceTier: 1 } },
    { narration: "節點三完成", nodeComplete: { divergenceTier: 2 } },
    { narration: "AI試圖用嘴巴打贏最終戰(應該被引擎擋下)", nodeComplete: { divergenceTier: 4 } },
  ]);

  // 這是舊版節點／戰鬥整合的完整流程 fixture；V2 的 reference runtime 由專屬 smoke 覆蓋。
  let r = await readJson(await sessionPost(req(env, { draft: DRAFT, scenarioId: LEGACY_SCENARIO_ID })));
  assert.equal(r.ok, true);
  const sessionId = r.session.id;
  assert.equal((await resolveSessionStore(env).get(sessionId)).scenario.packId, LEGACY_SCENARIO_ID);

  // Echo 沒有 scripted opening；第一次 turn 由 generic AI nodeComplete 完成 n1。
  r = await readJson(await turnPost(req(env, { sessionId })));
  assert.equal(r.ok, true);
  assert.ok(r.scenario.nodeCompleted, "generic opening 應完成第一個節點");
  assert.equal(r.scenario.nodeCompleted.nodeId, "n1");
  const firstNodeId = r.scenario.nodeCompleted.nodeId;

  // 其餘兩個主線節點依序完成，最終戰節點留給 combat。
  const completedIds = [firstNodeId];
  for (let n = 1; n < 3; n++) {
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

  // 開戰：應該自動採用最終戰節點掛的boss樣板，而不是預設雜魚。
  // 這裡不再需要「按遭遇戰鬥」——戰鬥由局勢觸發，前端在最終戰節點會自動打這個端點。
  r = await readJson(await combatStart(req(env, { sessionId, seed: 21 })));
  assert.equal(r.ok, true, JSON.stringify(r));

  const store = resolveSessionStore(env);
  const withBattle = await store.get(sessionId);
  assert.equal(withBattle.combatV2.scenarioFinaleNodeId, finaleNodeId, "開戰要記下這場是哪個最終戰節點");

  const finaleTemplate = getScenarioPack(LEGACY_SCENARIO_ID)
    .entries.flatMap((ch) => ch.nodes)
    .find((n) => n.isFinale).bossEncounter;
  const boss = withBattle.combatV2.participants.find((p) => p.side === "enemy");
  assert.equal(boss.name, finaleTemplate.name, "最終戰不該用預設雜魚樣板");
  // armor 拿副本包裡寫的那個值來比，不要寫死數字：換一個預設副本就會失效，
  // 而這條測試要鎖的是「boss樣板的armor有沒有被複製過去」，不是「armor剛好等於幾」。
  assert.equal(boss.armor, finaleTemplate.armor, "boss樣板的armor要真的被帶進戰鬥");

  // 讓戰鬥在一輪內確定分出勝負：直接把 boss 設成倒下，不依賴真實骰子結果。
  // 這則測試要驗的是「打贏最終戰會不會結算節點」，不是命中率。
  boss.hpState = { ...boss.hpState, intact: 0, B: 0, L: 0, A: boss.hpState.max, dead: true, unconscious: true };
  await store.put(withBattle);

  const lastResult = await readJson(await combatTurn(req(env, {
    sessionId,
    stateVersion: withBattle.combatV2.stateVersion,
    requestId: "finale-blow",
    selectedActions: [{ actionId: "hunker_down" }],
  })));
  const combatOver = { over: !lastResult.battle.active, winner: lastResult.battle.outcome?.winner };

  assert.equal(combatOver?.winner, "player", "測試調整過血量，玩家應該必勝");
  assert.ok(lastResult.scenario?.nodeCompleted, "打贏最終戰應該自動結算節點");
  assert.equal(lastResult.scenario.nodeCompleted.nodeId, finaleNodeId);

  const finalSession = await store.get(sessionId);
  assert.equal(finalSession.scenario.progress.nodes[finaleNodeId].completed, true);

  // [2026-08-17 修正] 節點獎勵是**獎勵點數**(schema 寫的是「基礎積分獎勵」)，不是XP。
  // 這則斷言本來寫的是 character.xp.earned > 0，那是因為在錢包進存檔之前，獎勵點數
  // 沒有地方可以放，只好塞進XP。現在兩種貨幣各有各的來源，見 content/scenario/settlement.js。
  assert.ok(finalSession.wallet.points > 0, "節點完成應該把獎勵點數加進錢包");
  assert.ok(finalSession.wallet.xp > 0, "打完最終戰=通關，應該同時跑過通關XP結算");
  assert.ok(finalSession.scenario.progress.settledAt, "通關結算只能發生一次，要留下時間戳");
});

test("副本整合：沒有指定scenarioId時預設用內建範例副本，且會用開場場景當作sceneContext", async () => {
  const env = makeEnv([{ narration: "開場" }]);
  const r = await readJson(await sessionPost(req(env, { draft: DRAFT })));
  assert.equal((await resolveSessionStore(env).get(r.session.id)).scenario.packId, DEFAULT_SCENARIO_ID);
  assert.ok(r.session.scene.context.length > 0, "應該要用章節的openingScene當作初始場景描述");
});

test("副本整合：指定不存在的scenarioId要被明確擋下，不會靜默退回預設", async () => {
  const env = makeEnv([]);
  const r = await readJson(await sessionPost(req(env, { draft: DRAFT, scenarioId: "scenario.not-exist" })));
  assert.equal(r.ok, false);
  assert.match(r.error, /找不到副本/);
});

test("退役 V1 存檔不能再進入舊文字流程，必須重新開始 V2", async () => {
  const env = {};
  const created = await readJson(await sessionPost(req(env, { draft: DRAFT, scenarioId: "scenario.nostromo-01-v2" })));
  assert.equal(created.ok, true);
  const sessionId = created.session.id;
  const store = resolveSessionStore(env);
  const saved = await store.get(sessionId);
  saved.scenario.packId = "scenario.nostromo-01";
  await store.put(saved);

  const loaded = await sessionGet({ request: new Request(`https://test.local/api/session?id=${sessionId}`), env });
  const loadedBody = await loaded.json();
  assert.equal(loaded.status, 410);
  assert.equal(loadedBody.retiredScenario, true);

  const turn = await turnPost(req(env, { sessionId }));
  const turnBody = await turn.json();
  assert.equal(turn.status, 410);
  assert.equal(turnBody.retiredScenario, true);
});

test("副本整合：讀取存檔時就要一起回副本HUD，不能等到玩家再打一個回合才長出來", async () => {
  // [2026-08-20] 這是重整頁面按「接續輪迴任務」那條路徑。先前 /api/session 只回存檔本身，
  // HUD 需要的形狀（當前目標／簡介／主線進度／迫近度）只有 /api/turn 才會算，
  // 於是接續遊戲的玩家看到的是一條空的頂欄——最需要「我現在要幹嘛」的那一刻反而沒有。
  const env = makeEnv([{ narration: "開場" }]);
  const created = await readJson(await sessionPost(req(env, { draft: DRAFT })));
  const sessionId = created.session.id;

  const res = await readJson(
    await sessionGet({ request: { url: `https://x/api/session?id=${sessionId}`, headers: { get: () => null } }, env })
  );

  assert.equal(res.ok, true, JSON.stringify(res));
  assert.ok(res.scenario, "讀取存檔時沒有回副本HUD");
  assert.ok(res.scenario.activeNode?.goal, "HUD 要有玩家看得懂的當前目標，不是只有節點標題");
  assert.ok(res.scenario.briefing, "HUD 要有副本簡介");
  assert.ok(res.scenario.progress, "HUD 要有主線進度");
  assert.ok(res.scenario.threat, "HUD 要有迫近度");
});

test("回合數：頂欄那個「回合」要數敘事推進了幾輪，不是事件日誌有幾筆", async () => {
  // [2026-08-20] 原本回的是 session.log.events.length。一場戰鬥打十下、休息一次，
  // 那個數字就跳十幾格，跟玩家實際玩過幾輪完全對不上（休息甚至根本不是一個回合）。
  const env = makeEnv([{ narration: "第一輪" }, { narration: "第二輪" }]);
  const created = await readJson(await sessionPost(req(env, { draft: DRAFT })));
  const sessionId = created.session.id;

  const t1 = await readJson(await turnPost(req(env, { sessionId })));
  // [2026-09-03] 這裡原本寫「推開艙門」，靠字面上跟 app_cryo_seal 的 label
  // 「把艙門推回去」共用「艙門」這個名詞湊巧命中——但兩者動作方向其實相反
  // （推開 vs 推回去關上），只是舊版自由輸入比對門檻太鬆才會被判定成同一件事。
  // 比對邏輯收緊後這句話不再誤觸發，這裡改用 approach 自己的 label 逐字比對，
  // 不再依賴會隨比對演算法調整而變動的巧合命中。
  const t2 = await readJson(await turnPost(req(env, { sessionId, playerAction: "把艙門推回去" })));
  assert.equal(t1.turnCount, 1);
  assert.equal(t2.turnCount, 2);

  // 休息會寫進事件日誌，但它不是一個敘事回合——計數不可以被它推上去。
  await restPost(req(env, { sessionId }));
  const t3 = await readJson(await turnPost(req(env, { sessionId, playerAction: "繼續往前" })));
  assert.equal(t3.turnCount, 3, "休息不該讓回合數多跳");

  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  assert.ok(
    session.log.events.length > session.turns,
    "這則測試要有意義，事件筆數本來就該多於回合數（否則兩者分不出差別）"
  );
});
