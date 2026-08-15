// [設計] 單一護甲值傷害吸收的測試——見 core/combat/armor.js 檔頭的2026-08-15決策記錄
// （取代原本的八步驟傷害減免流程）。
import test from "node:test";
import assert from "node:assert/strict";
import { applyArmor } from "../core/combat/armor.js";

test("applyArmor：護甲值從基礎傷害裡扣除", () => {
  assert.equal(applyArmor(10, 3), 7);
});

test("applyArmor：護甲值大於等於基礎傷害時，實質傷害歸零而不是負數", () => {
  assert.equal(applyArmor(3, 10), 0);
  assert.equal(applyArmor(5, 5), 0);
});

test("applyArmor：沒有護甲值時，全部基礎傷害直接生效", () => {
  assert.equal(applyArmor(6), 6);
});

test("applyArmor：負的護甲值視為0，不會反過來增加傷害", () => {
  assert.equal(applyArmor(6, -5), 6);
});

test("applyArmor：基礎傷害是負數時丟出錯誤", () => {
  assert.throws(() => applyArmor(-1, 0), /不能是負數/);
});
