// [規則書] 傳奇屬性效果總表測試——逐條比對使用者提供的原文數字，尤其是力量/耐力的
// 三角形數列疊加(容易被誤implement成線性)，跟耐力屏息倍數這種不規則查表值。
import test from "node:test";
import assert from "node:assert/strict";
import { LEGENDARY_ATTRIBUTE_EFFECTS, getLegendaryEffects } from "../core/legendaryAttributes.js";

test("力量：傷害上限提升是三角形數列(1/3/6/10/15)，不是線性(1/2/3/4/5)", () => {
  const f = LEGENDARY_ATTRIBUTE_EFFECTS.力量.damageCapBonus;
  assert.deepEqual([1, 2, 3, 4, 5].map(f), [1, 3, 6, 10, 15]);
});

test("力量：負重增加是每級翻倍查表(500/1000/2000/4000/8000)", () => {
  const f = LEGENDARY_ATTRIBUTE_EFFECTS.力量.carryCapacityBonusKg;
  assert.deepEqual([1, 2, 3, 4, 5].map(f), [500, 1000, 2000, 4000, 8000]);
});

test("力量：投擲距離倍數=n+1(2/3/4/5/6倍)", () => {
  const f = LEGENDARY_ATTRIBUTE_EFFECTS.力量.throwDistanceMultiplier;
  assert.deepEqual([1, 2, 3, 4, 5].map(f), [2, 3, 4, 5, 6]);
});

test("耐力：生命值額外增加也是三角形數列(1/3/6/10/15)", () => {
  const f = LEGENDARY_ATTRIBUTE_EFFECTS.耐力.hpBonus;
  assert.deepEqual([1, 2, 3, 4, 5].map(f), [1, 3, 6, 10, 15]);
});

test("耐力：不吃不喝不睡週數是翻倍查表(1/2/4/8/16週)", () => {
  const f = LEGENDARY_ATTRIBUTE_EFFECTS.耐力.noFoodSleepWeeks;
  assert.deepEqual([1, 2, 3, 4, 5].map(f), [1, 2, 4, 8, 16]);
});

test("耐力：屏息時間倍數照書中原文列出(2/4/8/12/32)，不強行修順成漂亮公式", () => {
  const f = LEGENDARY_ATTRIBUTE_EFFECTS.耐力.breathHoldMultiplier;
  assert.deepEqual([1, 2, 3, 4, 5].map(f), [2, 4, 8, 12, 32]);
});

test("敏捷：閃避防御與防御附加成功是同一個n，但是分開的兩個欄位", () => {
  const table = LEGENDARY_ATTRIBUTE_EFFECTS.敏捷;
  assert.equal(table.dodgeDefense(3), 3);
  assert.equal(table.defenseBonusSuccesses(3), 3);
});

test("感知：洞察防御與防御附加成功也是同一個n，這是之前defense.js漏算的來源", () => {
  const table = LEGENDARY_ATTRIBUTE_EFFECTS.感知;
  assert.equal(table.insightDefense(2), 2);
  assert.equal(table.defenseBonusSuccesses(2), 2);
});

test("沉著：先攻加值=2n(2/4/6/8/10)", () => {
  const f = LEGENDARY_ATTRIBUTE_EFFECTS.沉著.initiativeBonus;
  assert.deepEqual([1, 2, 3, 4, 5].map(f), [2, 4, 6, 8, 10]);
});

test("智力：每部影片經驗紅利=3n(3/6/9/12/15)", () => {
  const f = LEGENDARY_ATTRIBUTE_EFFECTS.智力.bonusXpPerMovie;
  assert.deepEqual([1, 2, 3, 4, 5].map(f), [3, 6, 9, 12, 15]);
});

test("getLegendaryEffects：依屬性值自動算出n，再查出全部效果(📖書中11->2、16->3範例)", () => {
  const effects = getLegendaryEffects("力量", 16);
  assert.equal(effects.n, 3);
  assert.equal(effects.damageCapBonus, 6); // triangular(3)
  assert.equal(effects.carryCapacityBonusKg, 2000);
});

test("getLegendaryEffects：屬性值低於6時n=0，所有效果都應該是0或對應的0級查表值", () => {
  const effects = getLegendaryEffects("敏捷", 5);
  assert.equal(effects.n, 0);
  assert.equal(effects.dodgeDefense, 0);
});

test("getLegendaryEffects：不合法的屬性名稱要丟錯", () => {
  assert.throws(() => getLegendaryEffects("龍息", 10));
});
