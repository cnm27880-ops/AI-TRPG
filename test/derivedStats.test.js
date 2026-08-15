// [規則書][輕量化] 衍生屬性測試 —— 對照 RULES_DIGEST.md 第5節的六維輕量公式
// (原始規則書公式含九維裡的決心/沉著，本專案簡化後意志值=意志×2、先攻=敏捷+感知，
// 詳見 RULES_DIGEST.md「已知落差」)。
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SIZE,
  maxHitPoints,
  maxWillpower,
  initiativeScore,
  baseDefense,
  sensoryRangeMeters,
  computeDerivedStats,
} from "../core/derivedStats.js";
import { computeDefenseDC } from "../core/combat/defense.js";

test("生命值上限 = 耐力 + 體積（預設5）", () => {
  assert.equal(maxHitPoints(3, 5), 8);
  assert.equal(maxHitPoints(3), 8, "體積預設應該是普通成年人的5");
  assert.equal(maxHitPoints(5, 6), 11);
});

test("普通成年人體積預設為5", () => {
  assert.equal(DEFAULT_SIZE, 5);
});

test("意志值 = 意志 × 2（六維輕量版，不再是決心+沉著+傳奇加值）", () => {
  assert.equal(maxWillpower(1), 2);
  assert.equal(maxWillpower(3), 6);
  assert.equal(maxWillpower(6), 12);
});

test("先攻值 = 敏捷 + 感知", () => {
  assert.equal(initiativeScore(6, 3), 9);
});

test("基礎防御 = 敏捷和感知中較低者", () => {
  assert.equal(baseDefense(4, 7), 4);
  assert.equal(baseDefense(7, 4), 4);
  assert.equal(baseDefense(5, 5), 5);
});

test("🔧 基礎防御必須跟 core/combat/defense.js 算出同一個值(兩邊不可以只改一邊)", () => {
  for (const [agility, perception] of [[4, 7], [7, 4], [11, 6], [1, 1], [16, 3]]) {
    assert.equal(
      baseDefense(agility, perception),
      computeDefenseDC({ agility, perception }),
      `敏捷${agility}/感知${perception} 時兩個模組算出來的基礎防御不一致`
    );
  }
});

test("敏感範圍 = 感知 × 10 米", () => {
  assert.equal(sensoryRangeMeters(4), 40);
});

test("computeDerivedStats：組出完整的衍生屬性，傷勢軌初始為全部完好", () => {
  const attributes = { 力量: 1, 敏捷: 6, 耐力: 3, 智力: 1, 感知: 4, 意志: 3 };
  const d = computeDerivedStats(attributes);

  assert.equal(d.hp.max, 8); // 耐力3 + 體積5
  assert.equal(d.hp.intact, 8, "剛建好的角色應該全部是完好生命");
  assert.equal(d.hp.B + d.hp.L + d.hp.A, 0);
  assert.equal(d.willpower.max, 6); // 意志3 × 2
  assert.equal(d.willpower.current, 6);
  assert.equal(d.initiative, 10); // 敏捷6 + 感知4
  assert.equal(d.baseDefense, 4); // min(6, 4)
  assert.equal(d.sensoryRangeMeters, 40);
  assert.equal(d.size, DEFAULT_SIZE);
});

test("computeDerivedStats：生命值總量守恆(intact+B+L+A=max)，接得上 core/health.js", () => {
  const d = computeDerivedStats({ 耐力: 4, 意志: 2, 敏捷: 3, 感知: 3 });
  assert.equal(d.hp.intact + d.hp.B + d.hp.L + d.hp.A, d.hp.max);
});

test("computeDerivedStats：體積可以自訂(例如大型/小型角色的HP上限跟著變)", () => {
  assert.equal(computeDerivedStats({ 耐力: 3, 敏捷: 1, 感知: 1, 意志: 1 }, { size: 4 }).hp.max, 7);
  assert.equal(computeDerivedStats({ 耐力: 3, 敏捷: 1, 感知: 1, 意志: 1 }, { size: 6 }).hp.max, 9);
});

test("computeDerivedStats：缺少的屬性一律退回基準值1，不會算出NaN", () => {
  const d = computeDerivedStats({ 耐力: 3 });
  assert.equal(d.hp.max, 8); // 耐力3 + 體積5(預設)
  assert.equal(d.willpower.max, 2); // 意志缺省視為1 -> 1×2
  assert.equal(d.initiative, 2); // 敏捷缺省1 + 感知缺省1
  assert.ok(!Number.isNaN(d.hp.max) && !Number.isNaN(d.initiative) && !Number.isNaN(d.willpower.max));
});
