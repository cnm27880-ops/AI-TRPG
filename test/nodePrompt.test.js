// content/scenario/nodePrompt.js 的測試。
import test from "node:test";
import assert from "node:assert/strict";
import { buildNodeGuidance, validateNodeComplete } from "../content/scenario/nodePrompt.js";

const normalNode = {
  id: "n1",
  title: "節點一",
  canonSummary: "主角在這裡發現了線索。",
  isFinale: false,
};

const finaleNode = {
  id: "n4",
  title: "最終戰",
  canonSummary: "主角與敵人正面對決。",
  isFinale: true,
  bossEncounter: { name: "boss", attributes: {}, skills: {}, weaponKey: "unarmed" },
};

test("buildNodeGuidance：一般節點會要求AI在完成時回傳nodeComplete", () => {
  const text = buildNodeGuidance(normalNode);
  assert.match(text, /節點一/);
  assert.match(text, /nodeComplete/);
  assert.match(text, /divergenceTier/);
});

test("buildNodeGuidance：最終戰節點明確禁止AI用nodeComplete結算", () => {
  const text = buildNodeGuidance(finaleNode);
  assert.match(text, /最終戰/);
  assert.match(text, /不要.*nodeComplete|不要在輸出JSON裡加入 nodeComplete/);
});

test("buildNodeGuidance：主線全部完成(node=null)時給出收尾指引，不要求nodeComplete", () => {
  const text = buildNodeGuidance(null);
  assert.match(text, /已經全部完成/);
});

test("validateNodeComplete：null/undefined 一律視為「這回合沒有完成」", () => {
  assert.equal(validateNodeComplete(null), null);
  assert.equal(validateNodeComplete(undefined), null);
});

test("validateNodeComplete：合法整數分級(0~4)通過查驗", () => {
  for (let tier = 0; tier <= 4; tier++) {
    assert.deepEqual(validateNodeComplete({ divergenceTier: tier }), { tier });
  }
});

test("validateNodeComplete：超出範圍/非整數/非物件一律當作沒有信號，不丟錯", () => {
  assert.equal(validateNodeComplete({ divergenceTier: 5 }), null);
  assert.equal(validateNodeComplete({ divergenceTier: -1 }), null);
  assert.equal(validateNodeComplete({ divergenceTier: 1.5 }), null);
  assert.equal(validateNodeComplete({ divergenceTier: "high" }), null);
  assert.equal(validateNodeComplete("不是物件"), null);
  assert.equal(validateNodeComplete(42), null);
  assert.equal(validateNodeComplete({}), null);
});
