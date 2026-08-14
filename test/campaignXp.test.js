// [規則書] 經驗值系統.htm —— 驗證固定分配與動態分配公式
import test from "node:test";
import assert from "node:assert/strict";
import { fixedSessionXp, dynamicSessionXp } from "../core/campaignXp.js";

test("固定分配：基礎經驗永遠是10，其餘欄位0分時總分等於10", () => {
  const { total, breakdown } = fixedSessionXp({});
  assert.equal(breakdown.baseXP, 10);
  assert.equal(total, 10);
});

test("固定分配：RP表現各分級對照書中點數(0/1/2/3)", () => {
  assert.equal(fixedSessionXp({ roleplay: "無" }).breakdown.roleplay, 0);
  assert.equal(fixedSessionXp({ roleplay: "普通" }).breakdown.roleplay, 1);
  assert.equal(fixedSessionXp({ roleplay: "出色" }).breakdown.roleplay, 2);
  assert.equal(fixedSessionXp({ roleplay: "優異" }).breakdown.roleplay, 3);
});

test("固定分配：突出扮演表現(3~10點)級距邊界正確", () => {
  const low = fixedSessionXp({ arcPerformance: "有", arcPerformanceLevel: 1 });
  const high = fixedSessionXp({ arcPerformance: "有", arcPerformanceLevel: 5 });
  assert.equal(low.breakdown.arcPerformance, 3);
  assert.equal(high.breakdown.arcPerformance, 10);
});

test("固定分配：九死一生逃生(1~3點，3級距)級距邊界正確，不會被錯誤內插", () => {
  const l1 = fixedSessionXp({ nearDeathEscape: "有", nearDeathEscapeLevel: 1 });
  const l2 = fixedSessionXp({ nearDeathEscape: "有", nearDeathEscapeLevel: 2 });
  const l3 = fixedSessionXp({ nearDeathEscape: "有", nearDeathEscapeLevel: 3 });
  assert.equal(l1.breakdown.nearDeathEscape, 1);
  assert.equal(l2.breakdown.nearDeathEscape, 2);
  assert.equal(l3.breakdown.nearDeathEscape, 3);
});

test("固定分配：美德/惡德每次觸發分別+3/+1", () => {
  const result = fixedSessionXp({ virtueTriggers: 2, viceTriggers: 1 });
  assert.equal(result.breakdown.virtueBonus, 6);
  assert.equal(result.breakdown.viceBonus, 1);
});

test("動態分配：基礎值——書中範例『6個PC，每個PC獲得1點基礎值』", () => {
  const r = dynamicSessionXp({ partySize: 6, performanceRank: null, survivingCount: 6 });
  assert.equal(r.breakdown.baseValue, 1);
});

test("動態分配：基礎值——5人或以下應該是0", () => {
  const r = dynamicSessionXp({ partySize: 5, performanceRank: null, survivingCount: 5 });
  assert.equal(r.breakdown.baseValue, 0);
});

test("動態分配：表現獎勵——書中範例『4個PC，最好3點/2點/1點/最差0點』", () => {
  const ranks = [1, 2, 3, 4].map(
    (rank) => dynamicSessionXp({ partySize: 4, performanceRank: rank, survivingCount: 4 }).breakdown
      .performanceBonus
  );
  assert.deepEqual(ranks, [3, 2, 1, 0]);
});

test("動態分配：表現獎勵——書中範例『6個PC，第一名5點經驗』", () => {
  const r = dynamicSessionXp({ partySize: 6, performanceRank: 1, survivingCount: 6 });
  assert.equal(r.breakdown.performanceBonus, 5);
});

test("動態分配：單人遊戲下會附帶warning，提醒改用固定分配", () => {
  const r = dynamicSessionXp({ partySize: 1, performanceRank: 1, survivingCount: 1 });
  assert.equal(r.breakdown.baseValue, 0);
  assert.equal(r.breakdown.performanceBonus, 0); // survivingCount-1-(rank-1) = 1-1-0 = 0
  assert.ok(r.warning, "單人模式應該要有警告訊息");
});
