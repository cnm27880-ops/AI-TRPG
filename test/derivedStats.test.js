// [規則書] 衍生屬性測試 —— 公式逐條直接對照書中原文。
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
import { computeDefenseProfile } from "../core/combat/defense.js";
import { emptyCharacter } from "../core/schema.js";

test("📖 生命值 = 耐力 + 體積（第1787行）", () => {
  assert.equal(maxHitPoints(3, 5), 8);
  assert.equal(maxHitPoints(3), 8, "體積預設應該是普通成年人的5");
  assert.equal(maxHitPoints(5, 6), 11);
});

test("📖 普通成年人體積為5（第1758行）", () => {
  assert.equal(DEFAULT_SIZE, 5);
});

test("📖 意志值 = 決心 + 沉著 + 傳奇決心 + 傳奇沉著（建卡頁欄位）", () => {
  // 決心3、沉著3：兩個都還沒到傳奇門檻(6)，所以傳奇加值都是0
  assert.equal(maxWillpower(3, 3), 6);
  // 決心6：傳奇決心 = floor((6-1)/5) = 1
  assert.equal(maxWillpower(6, 3), 6 + 3 + 1 + 0);
  // 決心11、沉著6：傳奇2 + 傳奇1
  assert.equal(maxWillpower(11, 6), 11 + 6 + 2 + 1);
});

test("📖 先攻值 = 敏捷 + 沉著（建卡頁欄位）", () => {
  assert.equal(initiativeScore(6, 3), 9);
});

test("📖 基礎防御 = 敏捷和感知中較低者（第1784行）", () => {
  assert.equal(baseDefense(4, 7), 4);
  assert.equal(baseDefense(7, 4), 4);
  assert.equal(baseDefense(5, 5), 5);
});

test("🔧 基礎防御必須跟 core/combat/defense.js 算出同一個值(兩邊不可以只改一邊)", () => {
  for (const [agility, perception] of [[4, 7], [7, 4], [11, 6], [1, 1], [16, 3]]) {
    assert.equal(
      baseDefense(agility, perception),
      computeDefenseProfile({ agility, perception }).base,
      `敏捷${agility}/感知${perception} 時兩個模組算出來的基礎防御不一致`
    );
  }
});

test("📖 敏感範圍 = 感知 × 10 米（第1793行）", () => {
  assert.equal(sensoryRangeMeters(4), 40);
});

test("computeDerivedStats：組出完整的衍生屬性，傷勢軌初始為全部完好", () => {
  const c = emptyCharacter();
  c.attributes["耐力"] = 3;
  c.attributes["決心"] = 3;
  c.attributes["沉著"] = 3;
  c.attributes["敏捷"] = 6;
  c.attributes["感知"] = 4;

  const d = computeDerivedStats(c.attributes);

  assert.equal(d.hp.max, 8); // 耐力3 + 體積5
  assert.equal(d.hp.intact, 8, "剛建好的角色應該全部是完好生命");
  assert.equal(d.hp.B + d.hp.L + d.hp.A, 0);
  assert.equal(d.willpower.max, 6);
  assert.equal(d.willpower.current, 6);
  assert.equal(d.initiative, 9); // 敏捷6 + 沉著3
  assert.equal(d.baseDefense, 4); // min(6, 4)
  assert.equal(d.sensoryRangeMeters, 40);
  assert.equal(d.size, DEFAULT_SIZE);
});

test("computeDerivedStats：生命值總量守恆(intact+B+L+A=max)，接得上 core/health.js", () => {
  const d = computeDerivedStats({ 耐力: 4, 決心: 2, 沉著: 2, 敏捷: 3, 感知: 3 });
  assert.equal(d.hp.intact + d.hp.B + d.hp.L + d.hp.A, d.hp.max);
});

test("computeDerivedStats：體積可以是4或6，超出範圍要丟錯", () => {
  assert.equal(computeDerivedStats({ 耐力: 3, 決心: 1, 沉著: 1, 敏捷: 1, 感知: 1 }, { size: 4 }).hp.max, 7);
  assert.equal(computeDerivedStats({ 耐力: 3, 決心: 1, 沉著: 1, 敏捷: 1, 感知: 1 }, { size: 6 }).hp.max, 9);
  assert.throws(
    () => computeDerivedStats({ 耐力: 3, 決心: 1, 沉著: 1, 敏捷: 1, 感知: 1 }, { size: 7 }),
    /體積/
  );
});

test("computeDerivedStats：缺少必要屬性要丟錯，不能靜默算出NaN", () => {
  assert.throws(() => computeDerivedStats({ 耐力: 3 }), /決心/);
  assert.throws(() => computeDerivedStats({}), /耐力/);
});
