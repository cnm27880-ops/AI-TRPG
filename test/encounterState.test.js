// [設計] 單敵人戰鬥遭遇狀態機的測試——見 content/combat/encounterState.js 檔頭說明。
import test from "node:test";
import assert from "node:assert/strict";
import {
  createEncounter,
  resolvePlayerAttack,
  resolveEnemyAttack,
  resolveLeadingEnemyTurns,
  isCombatOver,
} from "../content/combat/encounterState.js";
import { emptyCharacter } from "../core/schema.js";
import { computeDerivedStats } from "../core/derivedStats.js";

function fixedRoll(successes) {
  return () => ({ successes, rolls: [], isFortuneDie: false, fumble: false });
}

function testCharacter() {
  const character = emptyCharacter("測試輪迴者");
  character.attributes = { 力量: 3, 敏捷: 3, 耐力: 3, 智力: 1, 感知: 3, 意志: 1 };
  character.skills.格鬥 = 2;
  character.skills.射擊 = 2;
  character.derived = computeDerivedStats(character.attributes);
  return character;
}

test("createEncounter：建立雙方狀態，行動順序含兩個參戰單位", () => {
  const character = testCharacter();
  const combat = createEncounter(character);

  assert.equal(combat.active, true);
  assert.equal(combat.round, 1);
  assert.deepEqual([...combat.order].sort(), ["enemy", "player"]);
  assert.equal(combat.player.hpState.max, character.derived.hp.max);
  assert.ok(combat.enemy.hpState.max > 0);
});

test("resolvePlayerAttack：命中時扣敵人血量，未結束則輪到敵人行動", () => {
  const character = testCharacter();
  const combat = createEncounter(character);
  combat.order = ["player", "enemy"];
  combat.turnIndex = 0;

  const { result } = resolvePlayerAttack(combat, character, "unarmed", { rollFn: fixedRoll(6) });

  assert.equal(result.hit, true);
  assert.ok(combat.enemy.hpState.B > 0 || combat.enemy.hpState.L > 0 || combat.enemy.hpState.A > 0);
  if (combat.active) {
    assert.equal(combat.order[combat.turnIndex], "enemy");
  }
});

test("resolvePlayerAttack：把敵人打到昏迷時，戰鬥結束且玩家獲勝", () => {
  const character = testCharacter();
  const combat = createEncounter(character);
  combat.order = ["player", "enemy"];
  combat.turnIndex = 0;

  // 敵人 hpMax 很小（耐力2+體積5=7），連續高成功數攻擊足以打到昏迷
  for (let i = 0; i < 10 && combat.active; i++) {
    combat.order[combat.turnIndex] = "player"; // 強制一直輪到玩家，簡化測試
    resolvePlayerAttack(combat, character, "unarmed", { rollFn: fixedRoll(10) });
  }

  const status = isCombatOver(combat);
  assert.equal(status.over, true);
  assert.equal(status.winner, "player");
  assert.equal(combat.active, false);
});

test("resolveEnemyAttack：輪到敵人時可以攻擊玩家，結果同步進combat.player.hpState", () => {
  const character = testCharacter();
  const combat = createEncounter(character);
  combat.order = ["enemy", "player"];
  combat.turnIndex = 0;

  const before = { ...combat.player.hpState };
  const { result } = resolveEnemyAttack(combat, character, { rollFn: fixedRoll(6) });

  assert.equal(result.hit, true);
  assert.notDeepEqual(combat.player.hpState, before);
});

test("resolvePlayerAttack：不是玩家行動順位時丟出錯誤", () => {
  const character = testCharacter();
  const combat = createEncounter(character);
  combat.order = ["enemy", "player"];
  combat.turnIndex = 0;

  assert.throws(() => resolvePlayerAttack(combat, character, "unarmed"), /不是玩家的行動順位/);
});

test("resolveLeadingEnemyTurns：敵人贏得先攻時，開戰當下就先把敵人的開場攻擊解決掉", () => {
  const character = testCharacter();
  const combat = createEncounter(character);
  combat.order = ["enemy", "player"];
  combat.turnIndex = 0;

  // [2026-08-17 第九輪] 回傳形狀改成 { results, character }：跨輪要收維持成本，
  // 扣完的角色卡得有地方回去(見 encounterState.js 的 advanceTurn)。
  const { results, character: after } = resolveLeadingEnemyTurns(combat, character, { rollFn: fixedRoll(6) });

  assert.equal(results.length, 1);
  assert.equal(results[0].hit, true);
  assert.equal(combat.order[combat.turnIndex], "player"); // 解決完後輪到玩家
  assert.ok(after, "角色卡要跟著回傳，呼叫端才存得回去");
});

test("resolveLeadingEnemyTurns：玩家先攻時什麼都不做，回傳空陣列", () => {
  const character = testCharacter();
  const combat = createEncounter(character);
  combat.order = ["player", "enemy"];
  combat.turnIndex = 0;

  const { results, character: after } = resolveLeadingEnemyTurns(combat, character);

  assert.deepEqual(results, []);
  assert.equal(after, character, "什麼都沒發生時角色卡原封不動回傳同一份");
  assert.equal(combat.order[combat.turnIndex], "player");
});

test("resolvePlayerAttack：不合法的武器key丟出錯誤", () => {
  const character = testCharacter();
  const combat = createEncounter(character);
  combat.order = ["player", "enemy"];
  combat.turnIndex = 0;

  assert.throws(() => resolvePlayerAttack(combat, character, "railgun"), /不合法的武器/);
});
