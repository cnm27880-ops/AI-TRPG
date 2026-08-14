// [設計] 劇情扭轉度系統測試——沒有規則書範例可比對，重點是驗證「分級表本身自洽」
// 以及「彙總計算(進度條資料)在手算的小案例上是對的」。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DIVERGENCE_TIERS,
  computeNodeReward,
  computeNodeDC,
  summarizeChapter,
  summarizeCampaign,
} from "../content/scenario/divergence.js";
import { validateScenarioPack } from "../content/scenario/schema.js";
import { validatePackStructure } from "../content/loader.js";

const judge1Pack = JSON.parse(
  readFileSync(new URL("../content/packs/example-scenario-judge1.json", import.meta.url))
);

test("分級表：扭轉度越高，獎勵倍率與難度加值都必須單調遞增(不能出現扭轉越大反而獎勵變少的情況)", () => {
  for (let i = 1; i < DIVERGENCE_TIERS.length; i++) {
    assert.ok(DIVERGENCE_TIERS[i].rewardMultiplier > DIVERGENCE_TIERS[i - 1].rewardMultiplier);
    assert.ok(DIVERGENCE_TIERS[i].dcModifier >= DIVERGENCE_TIERS[i - 1].dcModifier);
  }
});

test("computeNodeReward/computeNodeDC：完全遵循原劇情(tier0)應該不改變基礎值", () => {
  assert.equal(computeNodeReward(1000, 0), 1000);
  assert.equal(computeNodeDC(5, 0), 5);
});

test("computeNodeReward/computeNodeDC：手算範例——大幅偏離(tier3, 1.8倍/+4難度)", () => {
  assert.equal(computeNodeReward(1000, 3), 1800);
  assert.equal(computeNodeDC(5, 3), 9);
});

test("computeNodeReward：不合法的分級要直接丟錯，不能默默當作tier0處理", () => {
  assert.throws(() => computeNodeReward(1000, 99));
});

test("summarizeChapter：手算範例——3個節點，2個完成，扭轉度分別是0與2，平均應為1", () => {
  const nodes = [
    { completed: true, divergenceTier: 0 },
    { completed: true, divergenceTier: 2 },
    { completed: false, divergenceTier: null },
  ];
  const summary = summarizeChapter("ch1", "第一章", nodes);
  assert.equal(summary.completedNodes, 2);
  assert.equal(summary.totalNodes, 3);
  assert.equal(summary.completionPct, 67); // round(2/3*100)
  assert.equal(summary.avgDivergenceTier, 1);
  assert.equal(summary.divergencePct, 25); // round(1/4*100)
});

test("summarizeCampaign：單章節時，整體完成度跟章節完成度一致", () => {
  const chapterSummary = summarizeChapter("ch1", "第一章", [
    { completed: true, divergenceTier: 1 },
    { completed: true, divergenceTier: 1 },
  ]);
  const campaign = summarizeCampaign([chapterSummary]);
  assert.equal(campaign.overallCompletionPct, 100);
  assert.equal(campaign.overallDivergencePct, 25); // tier1/maxTier4 = 25%
});

test("範例副本包(審判者1)：pack結構與副本專屬結構都要驗證通過", () => {
  const structResult = validatePackStructure(judge1Pack);
  assert.equal(structResult.valid, true, structResult.errors.join(";"));

  // validatePackStructure 檢查的是entries陣列元素要有name——章節用title不用name，
  // 這裡改用副本專屬的validateScenarioPack驗證章節/節點的圖結構本身
  const scenarioResult = validateScenarioPack(judge1Pack);
  assert.equal(scenarioResult.valid, true, scenarioResult.errors.join(";"));
});
