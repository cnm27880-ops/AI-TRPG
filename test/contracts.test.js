// [設計] 主神商店契約系統骨架測試——現階段數值留白，重點只驗證結構完整性，
// 不驗證任何價格/效果數字(因為根本還沒有數字)。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateContractPack } from "../content/contracts/schema.js";
import { validatePackStructure } from "../content/loader.js";

const placeholderPack = JSON.parse(
  readFileSync(new URL("../content/packs/example-contract-placeholder.json", import.meta.url))
);

test("契約包：type「契約」已經是loader認得的合法type", () => {
  const result = validatePackStructure(placeholderPack);
  assert.equal(result.valid, true, result.errors.join(";"));
});

test("validateContractPack：草案契約包本身結構要驗證通過(即使price是null)", () => {
  const result = validateContractPack(placeholderPack);
  assert.equal(result.valid, true, result.errors.join(";"));
});

test("validateContractPack：type不對要打回票", () => {
  const result = validateContractPack({ type: "血統", entries: [] });
  assert.equal(result.valid, false);
});

test("validateContractPack：contractType不合法要打回票", () => {
  const result = validateContractPack({
    type: "契約",
    entries: [{ name: "壞掉的契約", contractType: "不存在的類型", requiredAffectionTier: 1, price: null }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors[0].includes("contractType"));
});

test("validateContractPack：缺少requiredAffectionTier要打回票", () => {
  const result = validateContractPack({
    type: "契約",
    entries: [{ name: "壞掉的契約", contractType: "員工契約", price: null }],
  });
  assert.equal(result.valid, false);
});

test("validateContractPack：完全省略price欄位(不是明確寫null)也要打回票，避免誤以為忘記填", () => {
  const result = validateContractPack({
    type: "契約",
    entries: [{ name: "壞掉的契約", contractType: "員工契約", requiredAffectionTier: 1 }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("price")));
});
