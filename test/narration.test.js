// [設計] 驗證敘事分級契約——這裡沒有規則書範例可比對，全部是內部一致性測試，
// 確保「分級門檻本身是連續且不重疊的」，這比隨便測幾個數字更能抓到邊界漏洞。
import test from "node:test";
import assert from "node:assert/strict";
import { classifyOutcome, toPromptDirective, OUTCOME_TIERS } from "../core/narration.js";

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

// ---------------------------------------------------------------------------
// 失敗轉折契約（Phase 5.3 任務3）
//
// 這幾個測試鎖的是**指令文字本身**，不是行為。看起來像在測字串，但這些字串就是
// 這個模組唯一的產出：它們是餵給模型的強制指令，被誰順手改短一句，
// 遊戲就會靜靜地退回「失敗＝原地再試一次」那個版本，而且沒有任何測試會紅。
// ---------------------------------------------------------------------------

test("OUTCOME_TIERS 有被導出，且六級的 id/minMargin 沒有重複或亂序", () => {
  const ids = OUTCOME_TIERS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (let i = 1; i < OUTCOME_TIERS.length; i++) {
    assert.ok(
      OUTCOME_TIERS[i].minMargin < OUTCOME_TIERS[i - 1].minMargin,
      "門檻必須由高到低排列，否則 find() 會選到錯的一級"
    );
  }
});

test("三個失敗分級都帶著「嚴禁原地重試」這條禁令", () => {
  for (const id of ["些微失敗", "失敗", "慘烈失敗"]) {
    const tier = OUTCOME_TIERS.find((t) => t.id === id);
    assert.match(tier.directive, /嚴禁讓玩家待在原地用同樣的方法再試一次/, `${id} 少了原地重試禁令`);
  }
});

test("失敗指令要求「位置/方法/在場的人」三者至少改變一樣(可檢查的要求)", () => {
  const tier = OUTCOME_TIERS.find((t) => t.id === "失敗");
  assert.match(tier.directive, /玩家所在的位置/);
  assert.match(tier.directive, /剛才那個方法還能不能用/);
  assert.match(tier.directive, /現場多了／少了誰/);
});

test("失敗指令把失敗寫成兩種形狀：完成但引發更糟後果 / 徹底失敗且更危險", () => {
  const tier = OUTCOME_TIERS.find((t) => t.id === "失敗");
  assert.match(tier.directive, /動作其實完成了，但引發了更糟的後果/);
  assert.match(tier.directive, /動作徹底失敗，而且處境變得更危險/);
  // 反面示範要留著：模型看得懂「不要寫成這樣」比「要寫成那樣」更準。
  assert.match(tier.directive, /重新調整呼吸準備再試一次/);
});

test("「失敗」這一級明確跟迫近度機制呼應(threat.js 會在同一回合把威脅推近)", () => {
  const tier = OUTCOME_TIERS.find((t) => t.id === "失敗");
  assert.match(tier.directive, /迫近度/);
});

test("「慘烈失敗」要求把玩家物理上移出原本的位置", () => {
  const tier = OUTCOME_TIERS.find((t) => t.id === "慘烈失敗");
  assert.match(tier.directive, /物理上移出原本的位置/);
  assert.match(tier.directive, /不是同一扇門/);
});

test("自動失敗與大失敗(命定)也吃到同一條原地重試禁令", () => {
  for (const result of [{ margin: 0, autoFail: true }, { margin: 0, fumble: true }]) {
    const outcome = classifyOutcome(result);
    assert.match(outcome.directive, /嚴禁讓玩家待在原地用同樣的方法再試一次/);
  }
});

test("成功那一側**不吃**失敗禁令(不要把成功也寫成必須換地方)", () => {
  for (const id of ["大成功", "成功", "驚險成功"]) {
    const tier = OUTCOME_TIERS.find((t) => t.id === id);
    assert.ok(
      !/嚴禁讓玩家待在原地/.test(tier.directive),
      `${id} 不該帶失敗專用禁令——成功的代價寫在「驚險成功」那一級就夠了`
    );
  }
});

test("classifyOutcome 回傳的 directive 跟 OUTCOME_TIERS 裡那一級是同一份文字", () => {
  const outcome = classifyOutcome({ margin: -4 });
  assert.equal(outcome.tier, "失敗");
  assert.equal(outcome.directive, OUTCOME_TIERS.find((t) => t.id === "失敗").directive);
});
