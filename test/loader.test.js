import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validatePackStructure, mergePacks, auditAgainstTemplate } from "../content/loader.js";

const wolverinePack = JSON.parse(
  readFileSync(new URL("../content/packs/example-bloodline-wolverine.json", import.meta.url))
);

test("validatePackStructure：合法的pack(金剛狼範例包)應該通過結構驗證", () => {
  const result = validatePackStructure(wolverinePack);
  assert.equal(result.valid, true, result.errors.join("；"));
});

test("validatePackStructure：缺欄位、未知type、重複entry name都要被抓出來", () => {
  const bad = { id: "x", type: "不存在的分類", entries: [{ name: "A" }, { name: "A" }] };
  const result = validatePackStructure(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("version")));
  assert.ok(result.errors.some((e) => e.includes("未知的 type")));
  assert.ok(result.errors.some((e) => e.includes("重複")));
});

test("mergePacks：同type下跨包撞名會被擋下並記錄成錯誤，不會靜默覆蓋", () => {
  const packA = { id: "a", type: "血統", version: "1", entries: [{ name: "X" }] };
  const packB = { id: "b", type: "血統", version: "1", entries: [{ name: "X" }] };
  const { registry, errors } = mergePacks([packA, packB]);
  assert.equal(Object.keys(registry["血統"]).length, 1);
  assert.ok(errors.some((e) => e.includes("重複定義")));
});

test("mergePacks：重複載入同一個pack id要被擋下", () => {
  const { errors } = mergePacks([wolverinePack, wolverinePack]);
  assert.ok(errors.some((e) => e.includes("重複載入")));
});

test("auditAgainstTemplate：金剛狼D級的實際定價(500)跟目前血統模板(應為600)不符——重現使用者提醒過的『舊資源亂寫』情況", () => {
  const wolverineD = wolverinePack.entries.find((e) => e.rank === "D");
  const audit = auditAgainstTemplate("血統", "D", { price: wolverineD.price });
  assert.equal(audit.matches, false);
  assert.ok(audit.discrepancies[0].includes("500"));
  assert.ok(audit.discrepancies[0].includes("600"));
});

test("auditAgainstTemplate：金剛狼的定價其實完美符合『改造模板』——顯示這條資源可能該被歸類為改造而非血統", () => {
  for (const entry of wolverinePack.entries) {
    const audit = auditAgainstTemplate("改造", entry.rank, { price: entry.price });
    assert.equal(audit.matches, true, `${entry.name}: ${audit.discrepancies.join(";")}`);
  }
});

test("auditAgainstTemplate：完全符合模板定價的條目應該回報matches=true、無差異", () => {
  const audit = auditAgainstTemplate("血統", "D", { price: 600 });
  assert.equal(audit.matches, true);
  assert.equal(audit.discrepancies.length, 0);
});
