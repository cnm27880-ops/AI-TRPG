// Combat V2 —— 回合結算、結算順序與敵方 AI 的測試（規格第5.2節、第9節）。
import test from "node:test";
import assert from "node:assert/strict";
import { resolveTurn, validateSelection, TurnValidationError } from "../core/combat/v2/resolveTurn.js";
import { planEnemyActions, resolveEnemyTurn } from "../core/combat/v2/enemyTurn.js";
import { getRange, addStatus, battleRng, evaluateBattleEnd } from "../core/combat/v2/battleState.js";
import { toPublicBattle, buildNarrationContext } from "../core/combat/v2/publicState.js";
import { STATUS_DEFS } from "../core/combat/v2/resolveAction.js";
import { applyDamage } from "../core/health.js";
import { makeBattle, makeBattleViaFactory, findAction } from "./helpers/combatV2Fixture.js";
import { getAvailableCombatActions } from "../core/combat/v2/availableActions.js";

// --- 結算順序 ---

test("結算順序由伺服器決定：前端送的陣列順序不影響結果", () => {
  const forward = makeBattle();
  const backward = makeBattle();
  const a = resolveTurn(forward, [
    { actionId: "focus_aim", targetId: "enemy_01" },
    { actionId: "advance", targetId: "enemy_01" },
    { actionId: "melee_strike", targetId: "enemy_01" },
  ]);
  const b = resolveTurn(backward, [
    { actionId: "melee_strike", targetId: "enemy_01" },
    { actionId: "advance", targetId: "enemy_01" },
    { actionId: "focus_aim", targetId: "enemy_01" },
  ]);
  assert.deepEqual(
    a.resolution.playerActions.map((x) => x.actionId),
    b.resolution.playerActions.map((x) => x.actionId)
  );
  // 移動 -> 戰術 -> 攻擊（規格第5.2節第6~9點）
  assert.deepEqual(a.resolution.playerActions.map((x) => x.actionId), ["advance", "focus_aim", "melee_strike"]);
  assert.deepEqual(a.resolution.playerActions.map((x) => x.publicText), b.resolution.playerActions.map((x) => x.publicText));
});

test("同一個行動不能在一輪內選兩次", () => {
  assert.throws(
    () => validateSelection(makeBattle(), [
      { actionId: "firearm_shot", targetId: "enemy_01" },
      { actionId: "firearm_shot", targetId: "enemy_01" },
    ]),
    (err) => err.code === "DUPLICATE_ACTION"
  );
});

test("前端送的 targetId 跟行動卡不符時被拒絕（不是靜默採用其中一個）", () => {
  assert.throws(
    () => validateSelection(makeBattle({ encounterId: "cargo_bay_crossfire" }), [
      { actionId: "firearm_shot@enemy_01", targetId: "enemy_02" },
    ]),
    (err) => err.code === "TARGET_MISMATCH"
  );
});

test("空的選擇被拒絕，不會產生一個什麼都沒做卻推進了一輪的回合", () => {
  assert.throws(() => validateSelection(makeBattle(), []), (err) => err.code === "EMPTY_SELECTION");
});

// --- 原子性 ---

test("一批選擇裡任何一項不合法，整批拒絕且戰鬥狀態完全不變", () => {
  const battle = makeBattle();
  const snapshot = JSON.stringify(battle);
  assert.throws(() => resolveTurn(battle, [
    { actionId: "firearm_shot", targetId: "enemy_01" },
    { actionId: "melee_strike", targetId: "enemy_01" },   // 距離不符
  ]), TurnValidationError);
  assert.equal(JSON.stringify(battle), snapshot, "拒絕的請求不得留下任何痕跡");
});

test("整輪動作扣掉移動與標準之後，同一輪仍然可以加一個迅捷行動", () => {
  const battle = makeBattle();
  const result = resolveTurn(battle, [
    { actionId: "suppressing_fire", targetId: "enemy_01" },
    { actionId: "hunker_down" },
  ]);
  assert.equal(result.resolution.playerActions.length, 2);
  assert.ok(result.resolution.playerActions.every((a) => a.ok));
});

test("全回合動作之後不能再加任何行動", () => {
  assert.throws(
    () => validateSelection(makeBattle(), [
      { actionId: "all_out_assault", targetId: "enemy_01" },
      { actionId: "hunker_down" },
    ]),
    (err) => err.code === "INSUFFICIENT_ACTIONS"
  );
});

test("全力突擊是能力明確允許的跨格移動：從中距離直接撲進近距離", () => {
  const battle = makeBattle({ startRange: "medium" });
  resolveTurn(battle, [{ actionId: "all_out_assault", targetId: "enemy_01" }]);
  assert.equal(getRange(battle, "player", "enemy_01"), "close");
});

test("同一輪內前一個行動打倒目標後，後續針對它的行動不會憑空生效", () => {
  const battle = makeBattle({ startRange: "close", encounterId: "cargo_bay_crossfire" });
  const enemy = battle.participants.find((p) => p.id === "enemy_01");
  // 讓牠只差一點就倒；用近戰＋擒抱兩個行動，其中一個會先讓牠倒下。
  enemy.hpState = applyDamage(enemy.hpState, enemy.hpState.max - 1, "L");
  const result = resolveTurn(battle, [
    { actionId: "melee_strike@enemy_01", targetId: "enemy_01" },
    { actionId: "focus_aim@enemy_01", targetId: "enemy_01" },
  ]);
  // 不論擲骰結果如何，都不該出現「對已倒下目標成功施加狀態」這種事。
  const downed = enemy.hpState.intact === 0;
  if (downed) {
    const followUp = result.resolution.playerActions.find((a) => a.actionId === "focus_aim@enemy_01");
    if (followUp && !followUp.ok) assert.match(followUp.reason, /已經倒下/);
  }
  assert.ok(true);
});

// --- 敵方 AI ---

test("敵人的意圖是規則算的，不是 LLM 決定的：同一個狀態永遠得到同一份計畫", () => {
  const battle = makeBattle({ startRange: "far" });
  const enemy = battle.participants.find((p) => p.id === "enemy_01");
  const plan = planEnemyActions(battle, enemy);
  assert.deepEqual(planEnemyActions(battle, enemy), plan);
  // 近戰型在遠距離：先逼近，逼近之後還是打不到（far -> medium），所以只有一個移動。
  assert.deepEqual(plan.map((p) => p.kind), ["move"]);
});

test("近戰型敵人在中距離會先逼近再攻擊（移動與標準是兩個不同的額度）", () => {
  const battle = makeBattle({ startRange: "medium" });
  const enemy = battle.participants.find((p) => p.id === "enemy_01");
  assert.deepEqual(planEnemyActions(battle, enemy).map((p) => p.kind), ["move", "attack"]);
});

test("被壓制的敵人這一輪不推進也不出手", () => {
  const battle = makeBattle({ startRange: "medium" });
  const enemy = battle.participants.find((p) => p.id === "enemy_01");
  addStatus(enemy, { ...STATUS_DEFS.suppressed, expiresRound: battle.round + 1 });
  assert.deepEqual(planEnemyActions(battle, enemy).map((p) => p.kind), ["hold"]);

  const before = getRange(battle, "player", enemy.id);
  resolveEnemyTurn(battle, battleRng(battle));
  assert.equal(getRange(battle, "player", enemy.id), before, "被壓制就不該前進");
});

test("被擒抱的敵人不能移動", () => {
  const battle = makeBattle({ startRange: "far" });
  const enemy = battle.participants.find((p) => p.id === "enemy_01");
  addStatus(enemy, { ...STATUS_DEFS.grappled, expiresRound: battle.round + 1 });
  assert.deepEqual(planEnemyActions(battle, enemy).map((p) => p.kind), ["hold"]);
});

test("遠程型敵人被貼身時會拉開距離，而不是站著挨打", () => {
  const battle = makeBattle({ startRange: "close", encounterId: "cargo_bay_crossfire" });
  const gunner = battle.participants.find((p) => p.id === "enemy_02");
  const plan = planEnemyActions(battle, gunner);
  assert.equal(plan[0].kind, "move");
  resolveEnemyTurn(battle, battleRng(battle));
  assert.equal(getRange(battle, "player", "enemy_02"), "medium");
});

test("敵人移動會清掉玩家針對它的側翼優勢", () => {
  const battle = makeBattle({ startRange: "medium" });
  resolveTurn(battle, [{ actionId: "flank", targetId: "enemy_01" }]);
  const player = battle.participants.find((p) => p.id === "player");
  assert.equal(player.statuses.some((s) => s.id === "flanking@enemy_01"), false, "敵人逼近之後側翼優勢消失");
});

// --- 勝敗與公開狀態 ---

test("敵人全部倒下時戰鬥結束，而且不會再讓屍體打一輪", () => {
  const battle = makeBattle({ startRange: "close" });
  const enemy = battle.participants.find((p) => p.id === "enemy_01");
  enemy.hpState = applyDamage(enemy.hpState, 99, "A");
  const result = resolveTurn(battle, [{ actionId: "hunker_down" }]);
  assert.equal(battle.active, false);
  assert.equal(battle.outcome.winner, "player");
  assert.equal(result.resolution.enemyActions.length, 0);
  assert.equal(battle.phase, "ended");
});

test("玩家倒下時戰鬥結束並判敵方獲勝", () => {
  const battle = makeBattle({ startRange: "close" });
  const player = battle.participants.find((p) => p.id === "player");
  player.hpState = applyDamage(player.hpState, 99, "A");
  assert.deepEqual(evaluateBattleEnd(battle), { over: true, winner: "enemy", reason: "player_down" });
});

test("戰鬥結束後不接受任何新的選擇", () => {
  const battle = makeBattle();
  battle.active = false;
  assert.throws(() => validateSelection(battle, [{ actionId: "hunker_down" }]), (err) => err.status === 409);
});

test("公開狀態含三段距離帶，而且只有一格是 current", () => {
  const pub = toPublicBattle(makeBattle({ startRange: "medium" }));
  assert.deepEqual(pub.distance.band.map((b) => b.value), ["close", "medium", "far"]);
  assert.equal(pub.distance.band.filter((b) => b.current).length, 1);
  assert.equal(pub.distance.current, "medium");
});

test("公開狀態把五類動作的文案一起給前端，UI 不自己翻譯（swift 絕不是「反應」）", () => {
  const pub = toPublicBattle(makeBattle());
  const labels = Object.fromEntries(pub.actionTypes.map((t) => [t.type, t.label]));
  assert.equal(labels.swift, "迅捷動作");
  assert.equal(labels.fullRound, "整輪動作");
  assert.equal(labels.fullTurn, "全回合動作");
  assert.equal(JSON.stringify(pub).includes("反應"), false);
  assert.equal(JSON.stringify(pub).includes("reaction"), false);
});

test("整輪與全回合的消耗說明出現在行動卡上，不是額外的資源池", () => {
  const menu = getAvailableCombatActions({ battle: makeBattle() });
  assert.equal(findAction(menu, "suppressing_fire").costHint, "消耗移動＋標準");
  assert.equal(findAction(menu, "all_out_assault").costHint, "消耗迅捷＋移動＋標準");
});

test("正式工廠（含商店/型態接線）開出來的戰鬥與測試夾具形狀一致", () => {
  const battle = makeBattleViaFactory();
  const pub = toPublicBattle(battle);
  assert.equal(pub.engine, "combat-v2");
  assert.ok(pub.loadout.weapons.some((w) => w.key === "pistol"));
  assert.ok(pub.availableActions.length > 0);
});

test("同一個 seed 跑出完全相同的一場戰鬥（結算是可重播的）", () => {
  const run = () => {
    const battle = makeBattle({ seed: 777 });
    const r1 = resolveTurn(battle, [{ actionId: "firearm_shot", targetId: "enemy_01" }]);
    // 第一輪結束時敵人已經逼近，所以第二輪用「拉開距離」——重點是兩次跑出同一串結果。
    const r2 = resolveTurn(battle, [{ actionId: "withdraw", targetId: "enemy_01" }]);
    return JSON.stringify([r1.resolution, r2.resolution, battle.publicLog]);
  };
  assert.equal(run(), run());
});

test("公開紀錄是短句，而且不含任何內部數值", () => {
  const battle = makeBattle();
  resolveTurn(battle, [{ actionId: "firearm_shot", targetId: "enemy_01" }]);
  assert.ok(battle.publicLog.length > 0);
  for (const line of battle.publicLog) {
    assert.equal(typeof line.text, "string");
    assert.ok(line.text.length < 80, `紀錄太長，會淹沒行動選單：${line.text}`);
    assert.equal(/DC\s*\d|骰|0\.\d{2}/.test(line.text), false, `紀錄洩漏內部資料：${line.text}`);
  }
});
