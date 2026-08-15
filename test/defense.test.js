// [設計] 單一綜合防御DC公式的測試——見 core/combat/defense.js 檔頭的2026-08-15決策記錄。
import test from "node:test";
import assert from "node:assert/strict";
import { computeDefenseDC } from "../core/combat/defense.js";

test("computeDefenseDC：基礎防御是敏捷與感知較低者", () => {
  assert.equal(computeDefenseDC({ agility: 3, perception: 5 }), 3);
  assert.equal(computeDefenseDC({ agility: 5, perception: 3 }), 3);
});

test("computeDefenseDC：技能補正與裝備防御會疊加到基礎防御上", () => {
  const dc = computeDefenseDC({ agility: 2, perception: 4, skillCorrection: 3, equipmentDefense: 2 });
  assert.equal(dc, 2 + 3 + 2);
});

test("computeDefenseDC：技能補正/裝備防御預設為0", () => {
  assert.equal(computeDefenseDC({ agility: 1, perception: 1 }), 1);
});
