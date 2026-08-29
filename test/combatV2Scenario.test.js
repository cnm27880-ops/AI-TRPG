// Combat V2 —— 戰後接線的測試：副本最終戰結算與敘事層 prompt。
//
// 這兩件事都是「戰鬥打完之後」才發生的，而它們決定了一場 V2 戰鬥有沒有真的接進遊戲：
//   - 打贏最終戰卻沒有 XP、沒有節點完成提示，跟沒打贏長得一模一樣（見 test/silentFailures.test.js）
//   - 敘事層拿不到已裁定的結果，就只能自己編一段跟規則無關的戰鬥描寫
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as v2Start } from "../functions/api/combat/v2/start.js";
import { onRequestPost as v2Turn } from "../functions/api/combat/v2/turn.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";
import { getScenarioPack } from "../content/scenario/registry.js";
import { completeNode, findActiveNode, initScenarioProgress } from "../content/scenario/progress.js";
import { buildCombatV2NarrationPrompt } from "../content/gemini/promptContract.js";
import { buildNarrationContext } from "../core/combat/v2/publicState.js";
import { resolveTurn } from "../core/combat/v2/resolveTurn.js";
import { makeBattle, playerCharacter } from "./helpers/combatV2Fixture.js";

const LEGACY_SCENARIO_ID = "scenario.echo-institute-01";
const env = {};
const req = (body) => ({ request: { json: async () => body }, env });
const read = async (res) => JSON.parse(await res.text());

async function startBattle() {
  const created = await read(await sessionPost(req({ character: playerCharacter(), sceneContext: "測試" })));
  const sessionId = created.sessionId ?? created.session?.id;
  const payload = await read(await v2Start(req({ sessionId, seed: 20260829 })));
  assert.equal(payload.ok, true, JSON.stringify(payload));
  return { sessionId, battle: payload.battle };
}

// --- 敘事層 prompt ---

test("敘事 prompt 只含已裁定的結果，沒有骰點、DC 或精確 HP", () => {
  const battle = makeBattle();
  const result = resolveTurn(battle, [
    { actionId: "advance", targetId: "enemy_01" },
    { actionId: "melee_strike", targetId: "enemy_01" },
  ]);
  const prompt = buildCombatV2NarrationPrompt(buildNarrationContext(battle, result.resolution));

  assert.match(prompt, /<Combat_V2_Round>/);
  assert.match(prompt, /不可以更改命中與否/);
  for (const forbidden of ["defenseDC", "DC ", "骰", "successes", "intact", "seed"]) {
    assert.equal(prompt.includes(forbidden), false, `敘事 prompt 不得含「${forbidden}」`);
  }
});

test("敘事 prompt 把一整輪寫成一段，依實際結算順序列出玩家與敵方的行動", () => {
  const battle = makeBattle();
  const result = resolveTurn(battle, [
    { actionId: "advance", targetId: "enemy_01" },
    { actionId: "melee_strike", targetId: "enemy_01" },
  ]);
  const prompt = buildCombatV2NarrationPrompt(buildNarrationContext(battle, result.resolution));
  const moveAt = prompt.indexOf("接近到近距離");
  const strikeAt = prompt.indexOf("近戰攻擊");
  assert.ok(moveAt > 0 && strikeAt > moveAt, "移動要排在攻擊前面，跟實際結算順序一致");
  assert.match(prompt, /【敵方這一輪的行動】/);
  assert.match(prompt, /連貫的戰鬥敘事/);
});

test("空的 context 不會炸，回空字串（沒有戰鬥就沒有戰鬥敘事）", () => {
  assert.equal(buildCombatV2NarrationPrompt(null), "");
});

test("turn 端點會把組好的 prompt 一起回傳，呼叫端不用自己拼", async () => {
  const { sessionId, battle } = await startBattle();
  const payload = await read(await v2Turn(req({
    sessionId,
    stateVersion: battle.stateVersion,
    requestId: "narration-prompt",
    selectedActions: [{ actionId: "firearm_shot", targetId: "enemy_01" }],
  })));
  assert.equal(payload.ok, true);
  assert.match(payload.narrationPrompt, /<Combat_V2_Round>/);
  assert.ok(payload.narrationContext);
});

// --- 副本最終戰結算 ---

test("V2 打贏最終戰會結算節點、發獎勵點數並跑通關結算（跟舊戰鬥系統同一段程式碼）", async () => {
  const created = await read(await sessionPost(req({ character: playerCharacter(), sceneContext: "測試" })));
  const sessionId = created.sessionId ?? created.session?.id;
  const store = resolveSessionStore(env);

  // 把存檔推到「最終戰是目前活躍節點」的狀態：這則測試要驗的是**戰後結算**，
  // 不是主線推進（那有 test/scenarioIntegration.test.js 在管）。用引擎自己的
  // initScenarioProgress/completeNode 一步步推，而不是手工捏一個 progress——
  // 手捏的形狀跟 findActiveNode 的期待對不上時，測試會紅在一個跟它要驗的事無關的地方。
  const pack = getScenarioPack(LEGACY_SCENARIO_ID);
  let progress = initScenarioProgress(pack);
  for (let guard = 0; guard < 20; guard++) {
    const node = findActiveNode(pack, progress);
    if (!node || node.isFinale) break;
    progress = completeNode(pack, progress, node.id, 0).progress;
  }
  const finaleNode = findActiveNode(pack, progress);
  assert.ok(finaleNode?.isFinale, "應該推進到最終戰節點");

  const session = await store.get(sessionId);
  session.scenario = { packId: pack.id, progress };
  await store.put(session);

  const started = await read(await v2Start(req({ sessionId, seed: 7 })));
  assert.equal(started.ok, true, JSON.stringify(started));

  const withBattle = await store.get(sessionId);
  assert.equal(
    withBattle.combatV2.scenarioFinaleNodeId,
    finaleNode.id,
    "開戰時要記下這場是哪一個最終戰節點，否則打贏了也不知道要結算什麼"
  );

  // 讓敵人直接倒下，把變因限制在「打贏之後有沒有結算」。
  const enemy = withBattle.combatV2.participants.find((p) => p.id === "enemy_01");
  enemy.hpState = { max: 12, intact: 0, B: 0, L: 0, A: 12, dead: true, unconscious: true, worsening: false };
  await store.put(withBattle);

  const finished = await read(await v2Turn(req({
    sessionId,
    stateVersion: withBattle.combatV2.stateVersion,
    requestId: "finale",
    selectedActions: [{ actionId: "hunker_down" }],
  })));

  assert.equal(finished.battle.active, false);
  assert.equal(finished.battle.outcome.winner, "player");
  assert.ok(finished.scenario?.nodeCompleted, "打贏最終戰應該自動結算節點");
  assert.equal(finished.scenario.nodeCompleted.nodeId, finaleNode.id);

  const finalSession = await store.get(sessionId);
  assert.equal(finalSession.scenario.progress.nodes[finaleNode.id].completed, true);
  assert.ok(finalSession.wallet.points > 0, "節點完成應該把獎勵點數加進錢包");
  assert.ok(finalSession.wallet.xp > 0, "打完最終戰=通關，應該同時跑過通關XP結算");
  assert.ok(finalSession.scenario.progress.settledAt, "通關結算只能發生一次，要留下時間戳");
});

test("最終戰結算失敗時不靜音：回應要帶出原因（跟舊戰鬥系統同一條保護）", async () => {
  const { sessionId } = await startBattle();
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);

  session.scenario = { packId: LEGACY_SCENARIO_ID, progress: { nodes: {} } };
  session.combatV2.scenarioFinaleNodeId = "不存在的節點";
  const enemy = session.combatV2.participants.find((p) => p.id === "enemy_01");
  enemy.hpState = { max: 12, intact: 0, B: 0, L: 0, A: 12, dead: true, unconscious: true, worsening: false };
  await store.put(session);

  const finished = await read(await v2Turn(req({
    sessionId,
    stateVersion: session.combatV2.stateVersion,
    requestId: "broken-finale",
    selectedActions: [{ actionId: "hunker_down" }],
  })));
  assert.equal(finished.ok, true);
  assert.ok(finished.scenario?.warnings?.length, "結算失敗必須帶出原因，不能靜靜地回 scenario:null");
  assert.match(finished.scenario.warnings.join(), /最終戰/);
});

test("不是最終戰的普通遭遇打贏後不會亂結算任何節點", async () => {
  const { sessionId, battle } = await startBattle();
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  assert.equal(session.combatV2.scenarioFinaleNodeId, undefined, "沒有副本進度就不該掛節點");

  const enemy = session.combatV2.participants.find((p) => p.id === "enemy_01");
  enemy.hpState = { max: 12, intact: 0, B: 0, L: 0, A: 12, dead: true, unconscious: true, worsening: false };
  await store.put(session);

  const finished = await read(await v2Turn(req({
    sessionId,
    stateVersion: battle.stateVersion,
    requestId: "plain-win",
    selectedActions: [{ actionId: "hunker_down" }],
  })));
  assert.equal(finished.battle.outcome.winner, "player");
  assert.equal(finished.scenario, undefined, "普通遭遇不該產生副本結算結果");
});

test("戰鬥結束時型態會帶回戰鬥外那一份（收兵，跟舊流程同一個約定）", async () => {
  const { sessionId, battle } = await startBattle();
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  const enemy = session.combatV2.participants.find((p) => p.id === "enemy_01");
  enemy.hpState = { max: 12, intact: 0, B: 0, L: 0, A: 12, dead: true, unconscious: true, worsening: false };
  await store.put(session);

  await v2Turn(req({
    sessionId,
    stateVersion: battle.stateVersion,
    requestId: "recover-forms",
    selectedActions: [{ actionId: "hunker_down" }],
  }));
  const after = await store.get(sessionId);
  assert.ok(after.forms, "session.forms 要在收兵時接回戰鬥中的那一份");
  assert.equal(after.combatV2.active, false);
});

test("存檔裡不留第二份角色卡（battle.character 是暫時的工作參照）", async () => {
  const { sessionId } = await startBattle();
  const session = await resolveSessionStore(env).get(sessionId);
  assert.equal(
    session.combatV2.character,
    undefined,
    "角色卡的唯一真相是 session.character；存進戰鬥狀態會多出一份會過期的複本"
  );
});
