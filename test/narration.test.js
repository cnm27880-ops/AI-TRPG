// [設計] 驗證敘事分級契約——這裡沒有規則書範例可比對，全部是內部一致性測試，
// 確保「分級門檻本身是連續且不重疊的」，這比隨便測幾個數字更能抓到邊界漏洞。
import test from "node:test";
import assert from "node:assert/strict";
import { classifyOutcome, toPromptDirective } from "../core/narration.js";

test("margin掃描：-20到+20之間每個整數都必須落在剛好一個分級，不會有漏網或重疊", () => {
  for (let margin = -20; margin <= 20; margin++) {
    const outcome = classifyOutcome({ margin, autoFail: false, fumble: false });
    assert.ok(outcome.tier, `margin=${margin} 沒有對應到任何分級`);
  }
});

test("margin分級邊界：0是驚險成功、1是成功、-1不是些微失敗以外的東西", () => {
  assert.equal(classifyOutcome({ margin: 0 }).tier, "驚險成功");
  assert.equal(classifyOutcome({ margin: 1 }).tier, "成功");
  assert.equal(classifyOutcome({ margin: 5 }).tier, "大成功");
  assert.equal(classifyOutcome({ margin: 4 }).tier, "成功");
  assert.equal(classifyOutcome({ margin: -1 }).tier, "些微失敗");
  assert.equal(classifyOutcome({ margin: -6 }).tier, "失敗");
  assert.equal(classifyOutcome({ margin: -7 }).tier, "慘烈失敗");
});

test("autoFail旗標優先於margin，且不會意外沿用上一次呼叫的分級", () => {
  const result = classifyOutcome({ margin: 99, autoFail: true });
  assert.equal(result.tier, "自動失敗");
});

test("fumble旗標優先於一般margin分級", () => {
  const result = classifyOutcome({ margin: 2, fumble: true });
  assert.equal(result.tier, "大失敗(命定)");
});

test("toPromptDirective：輸出是一段包含分級名稱與指令的字串，可以直接塞進prompt", () => {
  const text = toPromptDirective(classifyOutcome({ margin: 10 }));
  assert.ok(text.includes("大成功"));
  assert.ok(text.length > 10);
});
