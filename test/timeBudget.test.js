// [設計] 劇情時間預算測試——重點是「主線與好感度共用同一筆預算」這個核心行為，
// 以及狀態分級查表本身自洽(單調)、不可變性(spendTime不修改原本物件)。
import test from "node:test";
import assert from "node:assert/strict";
import {
  createTimeBudget,
  spendTime,
  remainingRounds,
  isExpired,
  timeStatus,
  TIME_STATUS_TIERS,
} from "../content/scenario/timeBudget.js";

test("createTimeBudget：非正數要丟錯", () => {
  assert.throws(() => createTimeBudget(0));
  assert.throws(() => createTimeBudget(-5));
});

test("spendTime：花費會正確累加，且不修改原本的 budget 物件(不可變)", () => {
  const budget = createTimeBudget(10);
  const after = spendTime(budget, 3, "推進主線節點");
  assert.equal(budget.spentRounds, 0); // 原物件沒被動到
  assert.equal(after.spentRounds, 3);
  assert.equal(remainingRounds(after), 7);
});

test("spendTime：主線推進與NPC好感度養成共用同一筆預算——這是核心需求", () => {
  let budget = createTimeBudget(10);
  budget = spendTime(budget, 4, "推進主線節點j1-ch1-n2");
  budget = spendTime(budget, 3, "培養NPC好感度");
  assert.equal(budget.spentRounds, 7);
  assert.equal(remainingRounds(budget), 3);
  assert.equal(budget.log.length, 2);
});

test("spendTime：花費非正數要丟錯", () => {
  const budget = createTimeBudget(10);
  assert.throws(() => spendTime(budget, 0, "x"));
  assert.throws(() => spendTime(budget, -1, "x"));
});

test("isExpired：花費達到或超過總預算時視為逾時", () => {
  let budget = createTimeBudget(5);
  assert.equal(isExpired(budget), false);
  budget = spendTime(budget, 5, "推進主線");
  assert.equal(isExpired(budget), true);
});

test("timeStatus：狀態分級表門檻必須嚴格遞減(由充裕到逾時)", () => {
  for (let i = 1; i < TIME_STATUS_TIERS.length; i++) {
    assert.ok(TIME_STATUS_TIERS[i].minRemainingPct < TIME_STATUS_TIERS[i - 1].minRemainingPct);
  }
});

test("timeStatus：手算範例——10回合預算，花4回合剩60%應為充裕", () => {
  let budget = createTimeBudget(10);
  budget = spendTime(budget, 4, "x");
  assert.equal(timeStatus(budget), "充裕");
});

test("timeStatus：手算範例——10回合預算，花9回合剩10%應為危急", () => {
  let budget = createTimeBudget(10);
  budget = spendTime(budget, 9, "x");
  assert.equal(timeStatus(budget), "危急");
});

test("timeStatus：花完全部預算應為逾時", () => {
  let budget = createTimeBudget(10);
  budget = spendTime(budget, 10, "x");
  assert.equal(timeStatus(budget), "逾時");
});
