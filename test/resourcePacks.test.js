// [規則書內容轉換] 7個資源分類(血統/改造/瞳術/稱號/流派/技藝/法術)各3個D級範例，
// 直接從rules2.35.txt摘錄真實條目轉成pack JSON(不是自己編的homebrew內容)，用途：
// 使用者測試建卡流程時有實際資源可以選，見每個pack檔案裡的sourceRef跟note。
//
// 這裡的測試分兩層：
//   1) 結構驗證：7個pack都要通過validatePackStructure，合併成一個registry不該撞名。
//   2) 定價稽核：對每個「書裡有明確寫價格」的條目，用auditAgainstTemplate跟模板比對，
//      鎖定已經發現的3組落差(改造全部3個D級都是1000不是500、技藝的太玄鑲華劍譜是600不是500、
//      法術的阿尼馬格斯是1000不是500)，不是漏測，是如實記錄「書中舊資源常常沒跟上模板」
//      這個現象——跟金剛狼血統範例的性質一樣，見loader.test.js。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validatePackStructure, mergePacks, auditAgainstTemplate } from "../content/loader.js";

const PACK_FILES = [
  "d-tier-samples-bloodline.json",
  "d-tier-samples-cybernetic.json",
  "d-tier-samples-dojutsu.json",
  "d-tier-samples-title.json",
  "d-tier-samples-school.json",
  "d-tier-samples-technique.json",
  "d-tier-samples-spell.json",
];

const packs = PACK_FILES.map((f) =>
  JSON.parse(readFileSync(new URL(`../content/packs/${f}`, import.meta.url)))
);

test("7個D級範例包的結構都合法(id/type/version/entries齊全，entries內name不重複)", () => {
  for (const pack of packs) {
    const result = validatePackStructure(pack);
    assert.equal(result.valid, true, `${pack.id}：${result.errors.join("；")}`);
  }
});

test("7個D級範例包每個都剛好有3個entries", () => {
  for (const pack of packs) {
    assert.equal(pack.entries.length, 3, `${pack.id} 應該有3個entries`);
  }
});

test("mergePacks：7個包合併不會互相撞名，也不會跟現有的金剛狼血統範例撞名", () => {
  const wolverinePack = JSON.parse(
    readFileSync(new URL("../content/packs/example-bloodline-wolverine.json", import.meta.url))
  );
  const { registry, errors } = mergePacks([...packs, wolverinePack]);
  assert.deepEqual(errors, []);
  assert.equal(Object.keys(registry["血統"]).length, 3 + 3); // 3個新範例 + 金剛狼(D/C/B三個rank各自是不同entry name)
  assert.equal(Object.keys(registry["改造"]).length, 3);
  assert.equal(Object.keys(registry["瞳術"]).length, 3);
  assert.equal(Object.keys(registry["稱號"]).length, 3);
  assert.equal(Object.keys(registry["流派"]).length, 3);
  assert.equal(Object.keys(registry["技藝"]).length, 3);
  assert.equal(Object.keys(registry["法術"]).length, 3);
});

function findEntry(type, name) {
  const pack = packs.find((p) => p.type === type);
  const entry = pack.entries.find((e) => e.name === name);
  assert.ok(entry, `找不到 ${type}/${name}`);
  return entry;
}

// ---- 血統：阿蘭斯屬性點數與Orphnoch價格都跟模板一致 ----
test("auditAgainstTemplate：血統-阿蘭斯的4點屬性分配跟模板(D級4點)一致", () => {
  const entry = findEntry("血統", "阿蘭斯-D級：阿蘭斯公民");
  const audit = auditAgainstTemplate("血統", "D", { attributePoints: entry.attributePoints });
  assert.equal(audit.matches, true, audit.discrepancies.join("；"));
});

test("auditAgainstTemplate：血統-Orphnoch的D級價格(600)跟模板(D級600)一致", () => {
  const entry = findEntry("血統", "Orphnoch血統-D級：原生體Orphnoch");
  const audit = auditAgainstTemplate("血統", "D", { price: entry.price });
  assert.equal(audit.matches, true, audit.discrepancies.join("；"));
});

// ---- 改造：3個D級範例書中原文都是1000，模板規定500，全部不符 ----
test("auditAgainstTemplate：改造3個D級範例的價格(1000)都跟模板(D級應為500)不符——真實存在的落差", () => {
  const pack = packs.find((p) => p.type === "改造");
  for (const entry of pack.entries) {
    const audit = auditAgainstTemplate("改造", "D", { price: entry.price });
    assert.equal(audit.matches, false, `${entry.name} 預期跟模板不符`);
    assert.ok(audit.discrepancies.some((d) => d.includes("價格不符")));
  }
});

// ---- 瞳術：審判眼跟毀滅之眼價格(600)跟模板一致，寫輪眼沒有價格可稽核 ----
test("auditAgainstTemplate：瞳術-審判眼與毀滅之眼的D級價格(600)跟模板一致", () => {
  for (const name of ["審判眼-D級", "毀滅之眼-D級"]) {
    const entry = findEntry("瞳術", name);
    const audit = auditAgainstTemplate("瞳術", "D", { price: entry.price });
    assert.equal(audit.matches, true, audit.discrepancies.join("；"));
  }
});

test("瞳術-寫輪眼的D級段落書中原文沒有標價格，如實記錄成null而不是猜一個數字", () => {
  const entry = findEntry("瞳術", "寫輪眼-D級");
  assert.equal(entry.price, null);
});

// ---- 稱號/流派：全部6個範例都是D+1000，跟共用模板一致 ----
test("auditAgainstTemplate：稱號3個D級範例的價格(1000)都跟模板一致", () => {
  const pack = packs.find((p) => p.type === "稱號");
  for (const entry of pack.entries) {
    const audit = auditAgainstTemplate("稱號", "D", { price: entry.price });
    assert.equal(audit.matches, true, `${entry.name}：${audit.discrepancies.join("；")}`);
  }
});

test("auditAgainstTemplate：流派3個D級範例的價格(1000)都跟模板一致", () => {
  const pack = packs.find((p) => p.type === "流派");
  for (const entry of pack.entries) {
    const audit = auditAgainstTemplate("流派", "D", { price: entry.price });
    assert.equal(audit.matches, true, `${entry.name}：${audit.discrepancies.join("；")}`);
  }
});

// ---- 技藝：太玄鑲華劍譜(600)不符模板(500)，另外兩個(500)符合 ----
test("auditAgainstTemplate：技藝-太玄鑲華劍譜的價格(600)跟模板(D級應為500)不符——真實存在的落差", () => {
  const entry = findEntry("技藝", "太玄鑲華劍譜-D級");
  const audit = auditAgainstTemplate("技藝", "D", { price: entry.price });
  assert.equal(audit.matches, false);
  assert.ok(audit.discrepancies.some((d) => d.includes("價格不符")));
});

test("auditAgainstTemplate：技藝-葵花寶典第一重與饕餮盛宴的價格(500)跟模板一致", () => {
  for (const name of ["葵花寶典第一重-D級", "饕餮盛宴-D級"]) {
    const entry = findEntry("技藝", name);
    const audit = auditAgainstTemplate("技藝", "D", { price: entry.price });
    assert.equal(audit.matches, true, `${name}：${audit.discrepancies.join("；")}`);
  }
});

// ---- 法術：阿尼馬格斯(1000)不符模板(500)，另外兩個(500)符合 ----
test("auditAgainstTemplate：法術-阿尼馬格斯的價格(1000)跟模板(D級應為500)不符——真實存在的落差", () => {
  const entry = findEntry("法術", "阿尼馬格斯（Animagus）-D級");
  const audit = auditAgainstTemplate("法術", "D", { price: entry.price });
  assert.equal(audit.matches, false);
  assert.ok(audit.discrepancies.some((d) => d.includes("價格不符")));
});

test("auditAgainstTemplate：法術-變身術與暗示術的價格(500)跟模板一致", () => {
  for (const name of ["變身術-D級", "暗示術-D級"]) {
    const entry = findEntry("法術", name);
    const audit = auditAgainstTemplate("法術", "D", { price: entry.price });
    assert.equal(audit.matches, true, `${name}：${audit.discrepancies.join("；")}`);
  }
});
