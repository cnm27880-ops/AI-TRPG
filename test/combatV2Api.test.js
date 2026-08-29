// Combat V2 —— API 安全與一致性測試（規格第11.4節，7 條全部覆蓋）。
//
// 這一份問的是純函式測試看不到的那件事：**伺服器有沒有真的不相信前端。**
// 每一條都是「前端送了一份被竄改過的 payload，伺服器有沒有照自己的規則做事」。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as startPost } from "../functions/api/combat/v2/start.js";
import { onRequestGet as stateGet } from "../functions/api/combat/v2/state.js";
import { onRequestPost as turnPost } from "../functions/api/combat/v2/turn.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";
import { playerCharacter } from "./helpers/combatV2Fixture.js";

const env = {};
const req = (body) => ({ request: { json: async () => body }, env });
const getReq = (url) => ({ request: { url }, env });
const read = async (res) => JSON.parse(await res.text());

/** 開一場戰鬥，回傳 { sessionId, battle }。seed 固定，測試才不用碰運氣。 */
async function startBattle({ seed = 20260829, encounterId } = {}) {
  const created = await read(await sessionPost(req({ character: playerCharacter(), sceneContext: "測試" })));
  const sessionId = created.sessionId ?? created.session?.id;
  const res = await startPost(req({ sessionId, seed, encounterId }));
  const payload = await read(res);
  assert.equal(payload.ok, true, JSON.stringify(payload));
  return { sessionId, battle: payload.battle };
}

/** 從公開選單挑一張目前可用的卡。 */
function pickAvailable(battle, actionId) {
  const action = battle.availableActions.find((a) => a.id === actionId);
  assert.ok(action, `選單裡沒有 ${actionId}`);
  assert.equal(action.available, true, `${actionId} 應該是可用的：${action.unavailableReason}`);
  return action;
}

test("開戰回傳的 battle 是公開白名單形狀，不含 seed／敵人 HP／AI", async () => {
  const { battle } = await startBattle();
  const raw = JSON.stringify(battle);
  for (const forbidden of ["seed", "rngCursor", "hpState", "\"ai\"", "requestLog", "telegraphs"]) {
    assert.equal(raw.includes(forbidden), false, `公開 payload 不得含「${forbidden}」`);
  }
  assert.equal(battle.round, 1);
  assert.equal(battle.phase, "player_selection");
  assert.deepEqual(battle.playerActionBudget.remaining, { swift: 1, move: 1, standard: 1 });
  // 敵人只給等級，不給數字。
  assert.ok(["未受傷", "受傷", "重創", "瀕死", "已倒下"].includes(battle.enemies[0].healthTier));
  assert.equal(battle.enemies[0].hp, undefined);
});

test("11.4.1 前端竄改 action cost 時，server 仍使用 server 定義的 cost", async () => {
  const { sessionId, battle } = await startBattle();
  // 前端聲稱射擊只是一個迅捷動作，還附上自己算的 cost。
  const tampered = [
    { actionId: "firearm_shot", targetId: "enemy_01", actionType: "swift", cost: { swift: 1, move: 0, standard: 0 } },
  ];

  // 用 preview 看伺服器**實際**打算扣什麼（結算完會進下一輪，額度就重置了，看不到）。
  const preview = await read(await turnPost(req({
    sessionId, stateVersion: battle.stateVersion, preview: true, selectedActions: tampered,
  })));
  assert.equal(preview.valid, true);
  assert.deepEqual(
    preview.playerActionBudget.remaining,
    { swift: 1, move: 1, standard: 0 },
    "扣的是標準動作，不是前端說的迅捷"
  );
  assert.deepEqual(preview.playerActionBudget.spent.map((s) => s.pool), ["standard"]);

  // 而且前端聲稱的 cost 不會讓它多做一件事：迅捷還在，所以再加一個迅捷行動仍然合法；
  // 再加一個標準行動則不合法。
  const stillLegal = await read(await turnPost(req({
    sessionId, stateVersion: battle.stateVersion, preview: true,
    selectedActions: [...tampered, { actionId: "hunker_down" }],
  })));
  assert.equal(stillLegal.valid, true);
  const overBudget = await read(await turnPost(req({
    sessionId, stateVersion: battle.stateVersion, preview: true,
    selectedActions: [...tampered, { actionId: "use_medkit" }],
  })));
  assert.equal(overBudget.valid, false);
  assert.equal(overBudget.code, "INSUFFICIENT_ACTIONS");
});

test("11.4.2 前端竄改命中結果與傷害時，server 忽略", async () => {
  const { sessionId, battle } = await startBattle();
  const enemyBefore = battle.enemies[0].healthTier;
  const res = await turnPost(req({
    sessionId,
    stateVersion: battle.stateVersion,
    requestId: "tamper-hit",
    selectedActions: [
      {
        actionId: "firearm_shot",
        targetId: "enemy_01",
        // 這些欄位在伺服器端**沒有任何一行程式碼會讀**。
        parameters: { hit: true, damage: 999, roll: 10, successes: 20 },
        hit: true,
        damage: 999,
      },
    ],
  }));
  const payload = await read(res);
  assert.equal(payload.ok, true);
  assert.notEqual(payload.battle.enemies[0].healthTier, "已倒下", "999 點傷害不該生效");
  // 對照組：同一個 seed、不帶竄改欄位，結果必須完全一樣。
  const clean = await startBattle();
  const cleanRes = await read(await turnPost(req({
    sessionId: clean.sessionId,
    stateVersion: clean.battle.stateVersion,
    requestId: "clean",
    selectedActions: [{ actionId: "firearm_shot", targetId: "enemy_01" }],
  })));
  assert.deepEqual(
    payload.resolution.playerActions.map((a) => a.publicText),
    cleanRes.resolution.playerActions.map((a) => a.publicText),
    "竄改欄位不得改變任何結果"
  );
});

test("11.4.3 前端竄改距離時，server 仍以 server state 為準", async () => {
  const { sessionId, battle } = await startBattle();
  assert.equal(battle.distance.current, "medium");
  // 前端聲稱自己在近距離，想按近戰。
  const res = await turnPost(req({
    sessionId,
    stateVersion: battle.stateVersion,
    requestId: "tamper-range",
    selectedActions: [{ actionId: "melee_strike", targetId: "enemy_01", distance: "close", currentRange: "close" }],
  }));
  assert.equal(res.status, 422);
  const payload = await read(res);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /需要近距離/);
  // 狀態一個字都沒動。
  assert.equal(payload.battle.stateVersion, battle.stateVersion);
  assert.deepEqual(payload.battle.playerActionBudget.remaining, { swift: 1, move: 1, standard: 1 });
});

test("11.4.4 stateVersion 過期時回傳 409，並附上最新狀態", async () => {
  const { sessionId, battle } = await startBattle();
  await turnPost(req({ sessionId, stateVersion: battle.stateVersion, requestId: "r1", selectedActions: [{ actionId: "hunker_down" }] }));

  const stale = await turnPost(req({
    sessionId,
    stateVersion: battle.stateVersion,   // 已經過期
    requestId: "r2",
    selectedActions: [{ actionId: "hunker_down" }],
  }));
  assert.equal(stale.status, 409);
  const payload = await read(stale);
  assert.equal(payload.code, "STATE_VERSION_CONFLICT");
  assert.ok(payload.battle, "409 必須附上最新公開狀態，讓前端能重畫");
  assert.ok(payload.battle.stateVersion > battle.stateVersion);
});

test("缺少 stateVersion 的請求直接回 400，不猜測玩家的意思", async () => {
  const { sessionId } = await startBattle();
  const res = await turnPost(req({ sessionId, requestId: "no-version", selectedActions: [{ actionId: "hunker_down" }] }));
  assert.equal(res.status, 400);
  assert.equal((await read(res)).code, "MISSING_STATE_VERSION");
});

test("11.4.5 相同 requestId 重送不會重複結算（HP、彈藥、動作都不再被扣）", async () => {
  const { sessionId, battle } = await startBattle();
  const body = {
    sessionId,
    stateVersion: battle.stateVersion,
    requestId: "idempotent-1",
    selectedActions: [{ actionId: "firearm_shot", targetId: "enemy_01" }],
  };
  const first = await read(await turnPost(req(body)));
  assert.equal(first.ok, true);
  const ammoAfterFirst = first.battle.loadout.weapons.find((w) => w.key === "pistol").ammo.loaded;

  const second = await read(await turnPost(req(body)));
  assert.equal(second.ok, true);
  assert.equal(second.replayed, true, "重送應該被標記為重播");
  assert.equal(second.battle.stateVersion, first.battle.stateVersion, "狀態版本不得再前進");
  assert.equal(second.battle.loadout.weapons.find((w) => w.key === "pistol").ammo.loaded, ammoAfterFirst, "彈藥不得再被扣");
  assert.equal(second.battle.round, first.battle.round);
  assert.deepEqual(second.resolution.playerActions.map((a) => a.publicText), first.resolution.playerActions.map((a) => a.publicText));
});

test("11.4.7 結算途中重複按下確認不會造成雙重扣血或雙重扣彈藥（同時送兩次同一個 requestId）", async () => {
  const { sessionId, battle } = await startBattle();
  const body = {
    sessionId,
    stateVersion: battle.stateVersion,
    requestId: "double-click",
    selectedActions: [{ actionId: "firearm_shot", targetId: "enemy_01" }],
  };
  const [a, b] = await Promise.all([read(await turnPost(req(body))), read(await turnPost(req(body)))]);
  const ammo = (r) => r.battle.loadout.weapons.find((w) => w.key === "pistol").ammo.loaded;
  assert.equal(ammo(a), ammo(b));
  assert.equal(a.battle.stateVersion, b.battle.stateVersion);
  // 開場 7 發，這一輪只該打掉 1 發。
  assert.equal(ammo(a), 6);
});

test("11.4.6 戰鬥結束後重送請求不會改變狀態", async () => {
  const { sessionId } = await startBattle();
  const store = resolveSessionStore(env);
  // 直接把敵人設成已倒下再結算一輪，讓戰鬥收在「玩家獲勝」。
  const session = await store.get(sessionId);
  const enemy = session.combatV2.participants.find((p) => p.id === "enemy_01");
  enemy.hpState = { max: 12, intact: 0, B: 0, L: 0, A: 12, dead: true, unconscious: true, worsening: false };
  await store.put(session);

  const after = await read(await turnPost(req({
    sessionId,
    stateVersion: session.combatV2.stateVersion,
    requestId: "finisher",
    selectedActions: [{ actionId: "hunker_down" }],
  })));
  assert.equal(after.battle.active, false);
  assert.equal(after.battle.outcome.winner, "player");

  const again = await turnPost(req({
    sessionId,
    stateVersion: after.battle.stateVersion,
    requestId: "after-end",
    selectedActions: [{ actionId: "hunker_down" }],
  }));
  assert.equal(again.status, 409);
  const payload = await read(again);
  assert.equal(payload.code, "BATTLE_ENDED");
  assert.equal(payload.battle.stateVersion, after.battle.stateVersion, "狀態不得再前進");
});

test("不存在的 action 回 422 且不改變狀態（規格第10節）", async () => {
  const { sessionId, battle } = await startBattle();
  const res = await turnPost(req({
    sessionId,
    stateVersion: battle.stateVersion,
    requestId: "ghost",
    selectedActions: [{ actionId: "summon_meteor" }],
  }));
  assert.equal(res.status, 422);
  const payload = await read(res);
  assert.equal(payload.code, "UNKNOWN_ACTION");
  assert.equal(payload.battle.stateVersion, battle.stateVersion);
});

test("動作額度不足時回 422，而且不做部分扣除", async () => {
  const { sessionId, battle } = await startBattle();
  pickAvailable(battle, "firearm_shot");
  const res = await turnPost(req({
    sessionId,
    stateVersion: battle.stateVersion,
    requestId: "over-budget",
    selectedActions: [
      { actionId: "firearm_shot", targetId: "enemy_01" },   // standard
      { actionId: "suppressing_fire", targetId: "enemy_01" }, // fullRound：需要 standard + move
    ],
  }));
  assert.equal(res.status, 422);
  const payload = await read(res);
  assert.equal(payload.code, "INSUFFICIENT_ACTIONS");
  assert.deepEqual(payload.battle.playerActionBudget.remaining, { swift: 1, move: 1, standard: 1 }, "一格都不得扣");
});

test("preview 模式只驗證、不改狀態，並回傳推算後的選單", async () => {
  const { sessionId, battle } = await startBattle();
  const preview = await read(await turnPost(req({
    sessionId,
    stateVersion: battle.stateVersion,
    preview: true,
    selectedActions: [{ actionId: "advance", targetId: "enemy_01" }],
  })));
  assert.equal(preview.ok, true);
  assert.equal(preview.valid, true);
  assert.deepEqual(preview.playerActionBudget.remaining, { swift: 1, move: 0, standard: 1 });
  const shot = preview.availableActions.find((a) => a.id === "firearm_shot");
  assert.equal(shot.available, false, "接近之後這一輪的射擊會在近距離發生");

  const state = await read(await stateGet(getReq(`https://x/api/combat/v2/state?sessionId=${sessionId}`)));
  assert.equal(state.battle.stateVersion, battle.stateVersion, "preview 不得改變狀態版本");
  assert.deepEqual(state.battle.playerActionBudget.remaining, { swift: 1, move: 1, standard: 1 });
});

test("preview 對不合法的選擇回 valid:false，而不是 HTTP 錯誤（那是預覽，不是失敗）", async () => {
  const { sessionId, battle } = await startBattle();
  const preview = await read(await turnPost(req({
    sessionId,
    stateVersion: battle.stateVersion,
    preview: true,
    selectedActions: [{ actionId: "melee_strike", targetId: "enemy_01" }],
  })));
  assert.equal(preview.ok, true);
  assert.equal(preview.valid, false);
  assert.match(preview.error, /需要近距離/);
});

test("GET state 是斷線重連的權威來源，回的是同一份公開狀態", async () => {
  const { sessionId, battle } = await startBattle();
  const state = await read(await stateGet(getReq(`https://x/api/combat/v2/state?sessionId=${sessionId}&battleId=${battle.battleId}`)));
  assert.equal(state.ok, true);
  assert.equal(state.battle.battleId, battle.battleId);
  assert.equal(state.battle.stateVersion, battle.stateVersion);
  assert.ok(state.battle.availableActions.length > 0);
});

test("別人的 battleId 對不上時回 409，不洩漏其他戰鬥的資料", async () => {
  const { sessionId } = await startBattle();
  const res = await stateGet(getReq(`https://x/api/combat/v2/state?sessionId=${sessionId}&battleId=battle_someone_else`));
  assert.equal(res.status, 409);
  const payload = await read(res);
  assert.equal(payload.battle, undefined);
});

test("同一場存檔不能同時開兩場 V2 戰鬥", async () => {
  const { sessionId } = await startBattle();
  const res = await startPost(req({ sessionId }));
  assert.equal(res.status, 409);
  assert.equal((await read(res)).code, "BATTLE_IN_PROGRESS");
});

test("V2 戰鬥寫的是 session.combatV2，完全不碰舊的 session.combat", async () => {
  const { sessionId } = await startBattle();
  const session = await resolveSessionStore(env).get(sessionId);
  assert.ok(session.combatV2, "V2 狀態應該在 combatV2");
  assert.equal(session.combatV2.engine, "combat-v2");
  assert.equal(session.combat ?? null, null, "舊的 session.combat 不得被 V2 動到");
});

test("敘事層拿到的 narrationContext 只有已裁定的結果，沒有可以改的數字", async () => {
  const { sessionId, battle } = await startBattle();
  const payload = await read(await turnPost(req({
    sessionId,
    stateVersion: battle.stateVersion,
    requestId: "narration",
    selectedActions: [{ actionId: "firearm_shot", targetId: "enemy_01" }],
  })));
  const ctx = payload.narrationContext;
  assert.ok(ctx.constraints.includes("不得更改"));
  const raw = JSON.stringify(ctx);
  for (const forbidden of ["defenseDC", "rolls", "successes", "hpState", "seed"]) {
    assert.equal(raw.includes(forbidden), false, `敘事上下文不得含「${forbidden}」`);
  }
});
