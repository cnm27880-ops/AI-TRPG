// content/checkIntent.js 的測試 —— [設計] 模組，所以測的是「鎖住目前這版的行為」，
// 不是比對規則書範例(規則書沒有這個機制)。
//
// 最重要的一條是「表裡的技能名必須真的存在於規則書技能表」：這個表是手寫的，
// 打錯一個字不會在前端看出來，但會讓 performCheck() 在正式環境直接丟錯。
import test from "node:test";
import assert from "node:assert/strict";
import { inferCheckParams, INTENT_TABLE, FALLBACK_INTENT, DEFAULT_DC, FALLBACK_DC } from "../content/checkIntent.js";
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

// [2026-08-31] 這兩條測試的斷言換了，因為 fallback 的語意換了。
//
// 舊行為：沒命中關鍵字 -> 感知純屬性 + DC 3。DC 3 在難度表裡是「困難」，
// 而純屬性骰池只有 2~3 顆，實測「我很害怕」98.3% 失敗。玩家每打一句
// 引擎看不懂的話，就被宣告一次失敗；而且全部退回同一個屬性，套路遞減還會再加難度。
//
// 新行為分兩種情況，所以測試也分兩條：
//   1. 沒有可失敗的目標 -> 根本不擲骰（下面這一條）
//   2. 有目標、但查不到技能 -> 純屬性檢定，難度降到 FALLBACK_DC（再下面那一條）
test("句子裡沒有可失敗的目標時，根本不進判定", () => {
  for (const input of ["我站在原地什麼都不做", "我很害怕", "原地翻跟斗", "唱歌"]) {
    const params = inferCheckParams(input);
    assert.equal(params.requiresCheck, false, `「${input}」不該被逼著擲骰`);
    assert.equal(params.actionType, "free_action");
    assert.equal(params.matched, false);
  }
});

test("有目標但查不到技能時，退回純屬性檢定，而且難度是「容易」不是「困難」", () => {
  // 「抓住」在 HAS_TARGET_MARKERS 裡（失敗會有後果），但不在 INTENT_TABLE 裡。
  const params = inferCheckParams("我伸手抓住那條晃來晃去的管線");
  assert.equal(params.requiresCheck, true);
  assert.equal(params.matched, false);
  assert.equal(params.attribute, FALLBACK_INTENT.attribute);
  assert.equal(params.skill, undefined, "退路檢定是純屬性檢定，不該帶技能");
  assert.equal(params.dc, FALLBACK_DC, "引擎猜不出技能時，該讓的是難度，不是玩家");
  assert.ok(FALLBACK_DC < DEFAULT_DC, "退路難度必須低於一般推導難度");
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

// [2026-08-16 決策] 專業(specialization)在輕量化規則裡**明確不做**，不是待辦。
//
// 這裡原本有兩則 test.skip，假設 INTENT_TABLE 每條都能指定「表定專業」、
// performCheck() 會套用「無對應專業減半」。實際上三層都沒有做：INTENT_TABLE 沒有這個欄位、
// inferCheckParams() 不產生它、performCheck() 也不讀它——但 content/turnOptions.js 卻會
// 查驗並往下傳，而且警告文字還寫著「引擎會依規則將技能等級減半」。程式碼在說謊。
//
// 建卡改成後台自動配點之後，玩家沒有任何購買專業的入口，為一個取得不到的資源實作整套規則
// 沒有意義。所以決定拆掉而不是接上，並用下面這則**會執行**的測試把決定鎖住——
// 留著 skip 的測試等於留著一個「總有一天要做」的暗示，而那不是現在的決定。
// 規則書原文的專業機制記錄在 RULES_DIGEST.md 的「已知落差」，要做的時候從那裡接回來。
test("輕量化規則不產生也不接受 specialization（決定不做，不是漏做）", () => {
  const character = emptyCharacter();
  character.skills["射擊"] = 2;
  character.specializations["射擊"] = ["手槍"];

  const params = inferCheckParams("我開槍", { character });
  assert.equal(params.specialization, undefined, "推導出來的檢定參數不該帶專業");

  // 就算硬塞一個進去，判定結果也必須跟沒塞一模一樣——這條是防止之後有人
  // 「順手」在 performCheck 裡加半套實作卻沒接完，又變回會說謊的狀態。
  const withSpec = performCheck(character, { attribute: "敏捷", skill: "射擊", specialization: "步槍", dc: 0 });
  const withoutSpec = performCheck(character, { attribute: "敏捷", skill: "射擊", dc: 0 });
  assert.equal(withSpec.dp, withoutSpec.dp);
  assert.deepEqual(withSpec.note, withoutSpec.note);
});

test("defaultDc 可以被呼叫端覆蓋(難度該由劇本/場景決定，不是從玩家句子推出來的)", () => {
  const params = inferCheckParams("我開槍", { defaultDc: 7 });
  assert.equal(params.dc, 7);
});

test("空字串/undefined 不會丟錯，而且不會變成一次必敗的判定", () => {
  for (const input of ["", null, undefined]) {
    const params = inferCheckParams(input);
    assert.equal(params.matched, false);
    // 空輸入沒有目標，所以不擲骰。以前它會變成一次「困難」的感知檢定——
    // 對一個根本沒有內容的輸入宣告失敗，是最沒有道理的一種失敗。
    assert.equal(params.requiresCheck, false);
  }
});

test("提到持槍 NPC 不會被誤判為玩家射擊", () => {
  const params = inferCheckParams("我向那個持槍男人搭話，想了解現在到底是什麼情況？");
  assert.equal(params.requiresCheck, false);
  assert.equal(params.actionType, "free_action");
  assert.equal(params.skill, undefined);
});

test("環顧周遭與聆聽動靜屬於低風險免骰行動", () => {
  for (const input of [
    "我轉頭看看四周，確認除了自己之外還有誰",
    "我環顧周遭，留意附近的動靜",
  ]) {
    const params = inferCheckParams(input);
    assert.equal(params.requiresCheck, false, input);
    assert.equal(params.actionType, "free_action", input);
  }
});

test("明確攻擊行動仍然進入射擊檢定", () => {
  const params = inferCheckParams("我舉槍瞄準異形並開槍");
  assert.equal(params.requiresCheck, true);
  assert.equal(params.attribute, "敏捷");
  assert.equal(params.skill, "射擊");
});
