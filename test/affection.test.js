// [設計] 好感度分級系統測試——沒有規則書範例可比對，重點是分級表自洽(單調遞增)、
// 查表函式在邊界值上正確、以及跨級判斷正確。
import test from "node:test";
import assert from "node:assert/strict";
import { AFFECTION_TIERS, tierForPoints, applyAffectionDelta } from "../content/affection.js";

test("分級表：好感度分數的門檻與判定加值都必須單調遞增", () => {
  for (let i = 1; i < AFFECTION_TIERS.length; i++) {
    assert.ok(AFFECTION_TIERS[i].minPoints > AFFECTION_TIERS[i - 1].minPoints);
    assert.ok(AFFECTION_TIERS[i].checkBonus > AFFECTION_TIERS[i - 1].checkBonus);
  }
});

test("tierForPoints：邊界值剛好等於門檻時，要落在較高的那一級", () => {
  assert.equal(tierForPoints(20).label, "友好");
  assert.equal(tierForPoints(19).label, "中立");
  assert.equal(tierForPoints(0).label, "中立");
  assert.equal(tierForPoints(-1).label, "冷漠");
});

test("tierForPoints：極端值也要落在合法範圍內(不會超出表格兩端)", () => {
  assert.equal(tierForPoints(-999999).label, "敵對");
  assert.equal(tierForPoints(999999).label, "崇敬");
});

test("applyAffectionDelta：好感度上升跨過門檻時，tierChanged 應為 true", () => {
  const result = applyAffectionDelta(15, 10); // 15 -> 25，跨過友好門檻(20)
  assert.equal(result.points, 25);
  assert.equal(result.tier.label, "友好");
  assert.equal(result.tierChanged, true);
});

test("applyAffectionDelta：好感度變動沒有跨過門檻時，tierChanged 應為 false", () => {
  const result = applyAffectionDelta(5, 3); // 5 -> 8，仍在中立範圍
  assert.equal(result.tierChanged, false);
});
