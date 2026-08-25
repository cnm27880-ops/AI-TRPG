// [設計] 單敵人戰鬥遭遇狀態機的測試——見 content/combat/encounterState.js 檔頭說明。
import test from "node:test";
import assert from "node:assert/strict";
import {
  createEncounter,
  resolvePlayerAttack,
  resolveEnemyAttack,
  resolveLeadingEnemyTurns,
  isCombatOver,
  pickTelegraph,
} from "../content/combat/encounterState.js";
import { PLACEHOLDER_ENEMY } from "../content/combat/placeholderEncounters.js";
import { getScenarioPack } from "../content/scenario/registry.js";
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

test("起始專長的技能 +1 會進入徒手與手槍的 attackDP", () => {
  function observedAttackDP(character, weaponKey) {
    const combat = createEncounter(character);
    combat.order = ["player", "enemy"];
    combat.turnIndex = 0;
    let observed;
    resolvePlayerAttack(combat, character, weaponKey, {
      rollFn: (dp) => {
        observed = dp;
        return { successes: 0, rolls: [], isFortuneDie: false, fumble: false };
      },
    });
    return observed;
  }

  const base = testCharacter();
  const withStartingSpecialty = testCharacter();
  withStartingSpecialty.skills.格鬥 += 1;
  withStartingSpecialty.skills.射擊 += 1;

  assert.equal(observedAttackDP(withStartingSpecialty, "unarmed"), observedAttackDP(base, "unarmed") + 1);
  assert.equal(observedAttackDP(withStartingSpecialty, "pistol"), observedAttackDP(base, "pistol") + 1);
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

// ---------------------------------------------------------------------------
// 敵人意圖預告（Phase 5.3 任務5）
//
// 重點是**時機**：預告必須在「玩家還沒選行動」的時候就已經存在，否則它只是事後說明。
// 所以測的是「開戰當下就有」與「跨到新的一輪時換一句」，而不是「抽到哪一句」。
// ---------------------------------------------------------------------------

const TELEGRAPH_ENEMY = {
  name: "測試怪",
  attributes: { 力量: 2, 敏捷: 1, 耐力: 2, 智力: 1, 感知: 1, 意志: 1 },
  skills: { 格鬥: 1 },
  weaponKey: "unarmed",
  armor: 0,
  size: 5,
  telegraphs: ["預告A", "預告B", "預告C", "預告D"],
};

test("pickTelegraph：依注入的亂數取對應的一句，空表/沒有資料回 null", () => {
  const list = ["A", "B", "C", "D"];
  assert.equal(pickTelegraph(list, () => 0), "A");
  assert.equal(pickTelegraph(list, () => 0.5), "C");
  // 邊界：亂數回 1（理論上 Math.random 不會，但注入的來源可能會）不可以取到 undefined
  assert.equal(pickTelegraph(list, () => 1), "D");
  assert.equal(pickTelegraph([], () => 0), null);
  assert.equal(pickTelegraph(undefined, () => 0), null);
});

test("createEncounter：開戰當下就抽好第一句預告(玩家第一次做決定前就看得到)", () => {
  const combat = createEncounter(testCharacter(), TELEGRAPH_ENEMY, { pickFn: () => 0 });
  assert.equal(combat.currentTelegraph, "預告A");
  assert.deepEqual(combat.enemy.telegraphs, TELEGRAPH_ENEMY.telegraphs);
});

test("createEncounter：敵人沒有預告資料時 currentTelegraph 是 null，戰鬥照常進行", () => {
  const noTelegraph = { ...TELEGRAPH_ENEMY, telegraphs: undefined };
  const combat = createEncounter(testCharacter(), noTelegraph);
  assert.equal(combat.currentTelegraph, null);
  assert.deepEqual(combat.enemy.telegraphs, []);
  assert.equal(combat.active, true);
});

test("跨到新的一輪時換一句預告(而且是在行動順位回到玩家之前換的)", () => {
  const character = testCharacter();
  const combat = createEncounter(character, TELEGRAPH_ENEMY, { pickFn: () => 0 });
  combat.order = ["player", "enemy"];
  combat.turnIndex = 0;
  assert.equal(combat.currentTelegraph, "預告A");

  // 玩家出手 -> 輪到敵人（還在同一輪，預告不該變）
  resolvePlayerAttack(combat, character, "unarmed", { rollFn: fixedRoll(0), pickFn: () => 0.5 });
  assert.equal(combat.round, 1);
  assert.equal(combat.currentTelegraph, "預告A", "同一輪之內不可以換預告");

  // 敵人出手 -> 回到玩家，新的一輪開始，這時候才換
  resolveEnemyAttack(combat, character, { rollFn: fixedRoll(0), pickFn: () => 0.5 });
  assert.equal(combat.round, 2);
  assert.equal(combat.order[combat.turnIndex], "player", "換完預告才輪到玩家");
  assert.equal(combat.currentTelegraph, "預告C");
});

test("預告完全不影響戰鬥數學：帶預告與不帶預告的同一次攻擊結果一致", () => {
  const character = testCharacter();
  const withTelegraph = createEncounter(character, TELEGRAPH_ENEMY, { pickFn: () => 0 });
  const without = createEncounter(character, { ...TELEGRAPH_ENEMY, telegraphs: [] });
  for (const combat of [withTelegraph, without]) {
    combat.order = ["player", "enemy"];
    combat.turnIndex = 0;
  }

  const a = resolvePlayerAttack(withTelegraph, character, "unarmed", { rollFn: fixedRoll(6) });
  const b = resolvePlayerAttack(without, character, "unarmed", { rollFn: fixedRoll(6) });

  assert.equal(a.result.hit, b.result.hit);
  assert.equal(a.result.finalDamage, b.result.finalDamage);
  assert.deepEqual(withTelegraph.enemy.hpState, without.enemy.hpState);
});

test("戰鬥紀錄帶著傷害嚴重度標籤(前端與AI用的是同一份文字)", () => {
  const character = testCharacter();
  const combat = createEncounter(character, TELEGRAPH_ENEMY, { pickFn: () => 0 });
  combat.order = ["player", "enemy"];
  combat.turnIndex = 0;

  const { result } = resolvePlayerAttack(combat, character, "unarmed", { rollFn: fixedRoll(6) });
  const entry = combat.log.find((e) => e.actor === "player");

  assert.ok(entry.damageSeverityTag, "戰鬥紀錄要帶標籤");
  assert.equal(entry.damageSeverityTag, result.damageSeverityTag);
});

test("內建佔位敵人與副本敵人都有預告文案(不然這個功能在實際遊戲裡看不到)", () => {
  assert.ok(PLACEHOLDER_ENEMY.telegraphs.length >= 2);
  const pack = getScenarioPack("scenario.nostromo-01-v2");
  assert.ok(pack.threatEncounter.telegraphs.length >= 2, "異形要有預告文案");
});
