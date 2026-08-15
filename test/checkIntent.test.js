// content/checkIntent.js 的測試 —— [設計] 模組，所以測的是「鎖住目前這版的行為」，
// 不是比對規則書範例(規則書沒有這個機制)。
//
// 最重要的一條是「表裡的技能名必須真的存在於規則書技能表」：這個表是手寫的，
// 打錯一個字不會在前端看出來，但會讓 performCheck() 在正式環境直接丟錯。
import test from "node:test";
import assert from "node:assert/strict";
import { inferCheckParams, INTENT_TABLE, FALLBACK_INTENT, DEFAULT_DC } from "../content/checkIntent.js";
import { ATTRIBUTES, SKILLS, emptyCharacter } from "../core/schema.js";
import { performCheck } from "../core/check.js";

const ALL_SKILLS = Object.values(SKILLS).flat();
const ALL_ATTRIBUTES = ATTRIBUTES.map((a) => a.key);

test("對照表裡的每個屬性名都真的存在於規則書九維屬性表", () => {
  for (const entry of [...INTENT_TABLE, FALLBACK_INTENT]) {
    assert.ok(
      ALL_ATTRIBUTES.includes(entry.attribute),
      `對照表寫了不存在的屬性「${entry.attribute}」`
    );
  }
});

test("對照表裡的每個技能名都真的存在於規則書技能表", () => {
  for (const entry of INTENT_TABLE) {
    if (!entry.skill) continue;
    assert.ok(
      ALL_SKILLS.includes(entry.skill),
      `對照表寫了不存在的技能「${entry.skill}」`
    );
  }
});

test("對照表產生的每一組參數，都能被 performCheck() 實際吃下去而不丟錯", () => {
  // 這是這個檔案最有價值的一條：直接拿引擎當驗證器，確保前後端契約真的對得上。
  const character = emptyCharacter("測試輪迴者");
  for (const skill of ALL_SKILLS) character.skills[skill] = 1; // 避免撞到技能0的自動失敗分支

  for (const entry of INTENT_TABLE) {
    for (const keyword of entry.keywords) {
      const params = inferCheckParams(keyword, { character });
      assert.doesNotThrow(
        () => performCheck(character, params),
        `關鍵字「${keyword}」產生的參數 ${JSON.stringify(params)} 讓引擎丟錯了`
      );
    }
  }
});

test("沒命中任何關鍵字時退回退路檢定，並標記 matched=false", () => {
  const params = inferCheckParams("我站在原地什麼都不做");
  assert.equal(params.matched, false);
  assert.equal(params.attribute, FALLBACK_INTENT.attribute);
  assert.equal(params.skill, undefined, "退路檢定是純屬性檢定，不該帶技能");
  assert.equal(params.dc, DEFAULT_DC);
});

test("命中關鍵字時標記 matched=true 並帶出對應技能", () => {
  const params = inferCheckParams("我舉起步槍瞄準它的頭");
  assert.equal(params.matched, true);
  assert.equal(params.attribute, "敏捷");
  assert.equal(params.skill, "射擊");
});

test("角色卡沒有登記該技能時，退回純屬性檢定而不是硬塞一個技能進去", () => {
  // 模擬一張把「射擊」整個拿掉的角色卡(例如未來出現只有自創技能的角色)
  const character = emptyCharacter();
  delete character.skills["射擊"];

  const params = inferCheckParams("我開槍", { character });
  assert.equal(params.attribute, "敏捷");
  assert.equal(params.skill, undefined, "角色沒有這個技能就不該帶skill，否則performCheck會丟錯");
  assert.doesNotThrow(() => performCheck(character, params));
});

// [已知落差] 這兩則測試假設 content/checkIntent.js 的 INTENT_TABLE 每一條都能指定一個
// 「表定專業」，讓 inferCheckParams() 能推論出 specialization 欄位，再交給 performCheck()
// 套用「無對應專業減半」。但目前 INTENT_TABLE 只有 attribute+skill 兩個欄位(見該檔案)，
// inferCheckParams() 完全不產生 specialization；就算產生了，performCheck() 也還沒實作
// 減半邏輯(同一個缺口見 test/engine.test.js 裡被跳過的那一則，理由寫在那邊)。
// 跳過並留下這個註記，而不是悄悄改斷言去配合「其實沒做」的行為。
test.skip("角色沒登記對應專業時不帶specialization，讓引擎照『無對應專業減半』規則處理", () => {
  const character = emptyCharacter();
  character.skills["射擊"] = 2;
  character.specializations["射擊"] = ["手槍"]; // 有登記專業，但不是表裡指定的「步槍」

  const params = inferCheckParams("我開槍", { character });
  assert.equal(params.specialization, undefined);

  // 引擎這時應該套用減半規則(2 -> 1)，note 裡會記錄這件事
  const result = performCheck(character, params);
  assert.ok(
    result.note.some((n) => n.includes("無對應專業")),
    `應該要套用無對應專業減半，實際note：${JSON.stringify(result.note)}`
  );
});

test.skip("角色有登記對應專業時會帶上specialization，且引擎不套用減半", () => {
  const character = emptyCharacter();
  character.skills["射擊"] = 2;
  character.specializations["射擊"] = ["步槍"];

  const params = inferCheckParams("我開槍", { character });
  assert.equal(params.specialization, "步槍");

  const result = performCheck(character, params);
  assert.ok(!result.note.some((n) => n.includes("無對應專業")));
});

test("defaultDc 可以被呼叫端覆蓋(難度該由劇本/場景決定，不是從玩家句子推出來的)", () => {
  const params = inferCheckParams("我開槍", { defaultDc: 7 });
  assert.equal(params.dc, 7);
});

test("空字串/undefined 不會丟錯，一律退回退路檢定", () => {
  for (const input of ["", null, undefined]) {
    const params = inferCheckParams(input);
    assert.equal(params.matched, false);
    assert.equal(params.attribute, FALLBACK_INTENT.attribute);
  }
});
