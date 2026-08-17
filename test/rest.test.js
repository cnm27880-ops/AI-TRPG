// 休息 —— 資源怎麼回來。見 core/rest.js 檔頭。
//
// 這份測試守的重點跟能量池那一組是同一個：**恢復的數字要來自書上或使用者的決定，
// 不是憑空給的**。所以下面每一則不是問「有沒有變多」，是問「變多的量是不是那個公式算的」。

import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { computeDerivedStats } from "../core/derivedStats.js";
import { openPool, spendEnergy, baseCapacity } from "../core/energyPools.js";
import { applyDamage } from "../core/health.js";
import { fullRecovery, meditate, describeRest, IN_MOVIE_REST_ROUNDS } from "../core/rest.js";

/** 敏捷3 感知3 耐力3 → 劍氣上限6、查克拉上限6、內力上限6 */
function hero() {
  const c = emptyCharacter("休息測試員");
  c.attributes = { 力量: 3, 敏捷: 3, 耐力: 3, 智力: 2, 感知: 3, 意志: 3 };
  c.derived = computeDerivedStats(c.attributes);
  return c;
}

/** 一個池子見底、意志力見底、身上有傷的角色。 */
function 疲憊的角色() {
  const c = hero();
  c.derived.energyPools = openPool({}, "查克拉", c.attributes, "忍者");
  c.derived.energyPools = spendEnergy(c.derived.energyPools, "查克拉", 5).pools; // 6 → 1
  c.derived.willpower = { ...c.derived.willpower, current: 1 };
  c.derived.hp = applyDamage(applyDamage(c.derived.hp, 2, "B"), 1, "L");
  return c;
}

// ---------------------------------------------------------------------------
// 主神空間：完全恢復（使用者決定 2026-08-17）
// ---------------------------------------------------------------------------

test("主神空間完全恢復：生命、意志力、所有能量池一次全滿", () => {
  const c = 疲憊的角色();
  const { character, recovered } = fullRecovery(c);

  assert.equal(character.derived.hp.B, 0, "沖擊傷害清空");
  assert.equal(character.derived.hp.L, 0, "嚴重傷害清空");
  assert.equal(character.derived.hp.intact, character.derived.hp.max, "完好格回到滿");
  assert.equal(character.derived.willpower.current, character.derived.willpower.max);
  assert.equal(character.derived.energyPools.查克拉.current, 6, "耐力3+感知3");
  assert.equal(recovered.kind, "完全恢復");
});

test("完全恢復不改動傳入的角色卡(跟商店與型態同一個不可變約定)", () => {
  const c = 疲憊的角色();
  const before = c.derived.energyPools.查克拉.current;
  fullRecovery(c);
  assert.equal(c.derived.energyPools.查克拉.current, before);
  assert.equal(c.derived.willpower.current, 1);
});

test("完全恢復的池子上限仍然照關鍵屬性重算(買了屬性之後上限會變大)", () => {
  const c = 疲憊的角色();
  c.attributes.耐力 = 5; // 上限應該變成 5+3=8
  const { character } = fullRecovery(c);
  assert.equal(character.derived.energyPools.查克拉.max, baseCapacity("查克拉", c.attributes));
  assert.equal(character.derived.energyPools.查克拉.current, 8, "全滿是滿到新的上限");
});

// ---------------------------------------------------------------------------
// 副本中：打坐（書上原文：做一次關鍵屬性判定，恢復等同成功數）
// ---------------------------------------------------------------------------

test("打坐的骰池＝這個池子的兩個關鍵屬性之和(跟決定上限的是同一個和)", () => {
  const c = 疲憊的角色();
  const { recovered } = meditate(c);
  assert.equal(recovered.pools.查克拉.dp, 6, "耐力3+感知3");
  assert.deepEqual(recovered.pools.查克拉.keyAttributes, ["耐力", "感知"]);
});

test("打坐擲不出任何成功數時，真的什麼都沒恢復(這是書上的規則，不是bug)", () => {
  const c = 疲憊的角色();
  // successThreshold 11：沒有任何骰面到得了，成功數必定是 0
  const { character, recovered } = meditate(c, { diceOpts: { successThreshold: 11 } });
  assert.equal(recovered.pools.查克拉.gained, 0);
  assert.equal(character.derived.energyPools.查克拉.current, 1, "還是見底");
});

test("打坐恢復的量等於成功數，而且不會超過上限", () => {
  const c = 疲憊的角色();
  // successThreshold 1：每一顆骰都算成功，必定恢復到滿(骰池6 > 缺口5)
  const { character, recovered } = meditate(c, { diceOpts: { successThreshold: 1 } });
  assert.equal(character.derived.energyPools.查克拉.current, 6, "補滿就停，不會溢出");
  assert.ok(recovered.pools.查克拉.gained > 0);
  assert.equal(
    character.derived.energyPools.查克拉.current,
    recovered.pools.查克拉.before + recovered.pools.查克拉.gained
  );
});

test("打坐恢復1點沖擊傷害(走既有的 shortRest)，但**不恢復意志力**", () => {
  const c = 疲憊的角色();
  const beforeB = c.derived.hp.B;
  const { character, recovered } = meditate(c);
  assert.equal(character.derived.hp.B, beforeB - 1);
  assert.equal(character.derived.hp.L, c.derived.hp.L, "嚴重傷害不是打坐能處理的");
  assert.equal(character.derived.willpower.current, 1, "意志力不恢復");
  assert.equal(recovered.willpower, null, "而且要明確標示成沒有恢復，不是漏算");
});

test("打坐的時間代價是使用者決定的3回合", () => {
  assert.equal(IN_MOVIE_REST_ROUNDS, 3);
  assert.equal(meditate(疲憊的角色()).recovered.roundsSpent, 3);
});

test("身上沒有能量池的角色也能打坐(只是只有生命會動)", () => {
  const c = hero();
  c.derived.hp = applyDamage(c.derived.hp, 1, "B");
  const { character, recovered } = meditate(c);
  assert.equal(character.derived.hp.B, 0);
  assert.deepEqual(recovered.pools, {});
});

test("存檔裡有沒登錄關鍵屬性的池子時，說得出「無法打坐」而不是靜靜跳過", () => {
  const c = hero();
  c.derived.energyPools = { 不明能量: { max: 5, current: 1, sources: ["x"], reopens: 0 } };
  const { character, recovered } = meditate(c);
  assert.equal(character.derived.energyPools.不明能量.current, 1);
  assert.match(recovered.pools.不明能量.note, /沒有登錄關鍵屬性/);
});

test("describeRest 講得出人看得懂的一句話", () => {
  const full = describeRest(fullRecovery(疲憊的角色()).recovered);
  assert.match(full, /完全恢復/);
  assert.match(full, /查克拉/);
  const sit = describeRest(meditate(疲憊的角色(), { diceOpts: { successThreshold: 11 } }).recovered);
  assert.match(sit, /打坐了3回合/);
  assert.match(sit, /沒有恢復/);
});
