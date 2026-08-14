import test from "node:test";
import assert from "node:assert/strict";
import { rollD10, rollDicePool, legendaryAttributeBonus, skillBonusSuccesses, resolveCheck } from "../core/dice.js";
import { attributeRaiseCost, skillRaiseCost, specializationCost, featCost } from "../core/xp.js";
import { emptyCharacter } from "../core/schema.js";
import { performCheck } from "../core/check.js";

test("rollD10 只會出現 1~10 之間的整數", () => {
  for (let i = 0; i < 2000; i++) {
    const r = rollD10();
    assert.ok(Number.isInteger(r) && r >= 1 && r <= 10, `骰出了不合法的值: ${r}`);
  }
});

test("rollDicePool: DP=0 或負數會改用機運骰(最多只擲出很少的骰子)", () => {
  const result = rollDicePool(0);
  assert.equal(result.isFortuneDie, true);
  assert.ok(result.rolls.length >= 1);
});

test("rollDicePool: 骰池統計特性——大量骰子時成功率應接近理論值(8/9/10共30%基礎成功率，含加骰會略高)", () => {
  const dp = 1000;
  const { successes } = rollDicePool(dp);
  const rate = successes / dp;
  // 理論上單骰基礎成功率 30%，加上10再骰的期望值加成，合理範圍抓寬鬆一點做統計健檢
  assert.ok(rate > 0.28 && rate < 0.42, `成功率 ${rate} 超出合理統計範圍，可能骰子邏輯有誤`);
});

test("legendaryAttributeBonus: 對應規則書「傳奇屬性」舉例 n=floor((值-1)/5)", () => {
  assert.equal(legendaryAttributeBonus(1), 0);
  assert.equal(legendaryAttributeBonus(5), 0);
  assert.equal(legendaryAttributeBonus(6), 1); // 規則書：屬性6開始獲得1點傳奇屬性
  assert.equal(legendaryAttributeBonus(11), 2); // 規則書範例
  assert.equal(legendaryAttributeBonus(16), 3); // 規則書範例
  assert.equal(legendaryAttributeBonus(21), 4);
});

test("skillBonusSuccesses: 技能等級5/10/11/13/15為門檻，最多5個附加成功", () => {
  assert.equal(skillBonusSuccesses(0), 0);
  assert.equal(skillBonusSuccesses(4), 0);
  assert.equal(skillBonusSuccesses(5), 1);
  assert.equal(skillBonusSuccesses(9), 1);
  assert.equal(skillBonusSuccesses(10), 2);
  assert.equal(skillBonusSuccesses(11), 3);
  assert.equal(skillBonusSuccesses(13), 4);
  assert.equal(skillBonusSuccesses(15), 5);
  assert.equal(skillBonusSuccesses(20), 5); // 突破15後不再額外增加
});

test("resolveCheck: 擲骰成功數為0時，附加成功不生效(核心規則「附加成功的使用」)", () => {
  // 用 dp=0(機運骰) 且不可能骰出成功的情境去逼近0成功，改用直接構造情境更可靠：
  // 這裡改成用單元邊界直接驗證公式行為：手動模擬 rawSuccesses=0 的情況
  const dp = 0; // 走機運骰，幾乎必定rawSuccesses=0
  let raw0Count = 0;
  for (let i = 0; i < 200; i++) {
    const r = resolveCheck({ dp, dc: 1, bonusSuccesses: 5 });
    if (r.rawSuccesses === 0) {
      raw0Count++;
      assert.equal(r.bonusSuccessesApplied, 0, "raw成功數為0時，附加成功應該不生效");
    }
  }
  assert.ok(raw0Count > 0, "測試沒有采樣到任何raw=0的情況，請提高採樣數");
});

test("XP花費公式：屬性/技能/專業/專長", () => {
  assert.equal(attributeRaiseCost(2), 8); // 2*4
  assert.equal(skillRaiseCost(0), 3); // 0->1 固定3XP
  assert.equal(skillRaiseCost(1), 0); // (1-1)*2=0，規則書公式字面上如此，1->2級確實不花XP
  assert.equal(skillRaiseCost(5), 8); // (5-1)*2
  assert.equal(specializationCost(), 1);
  assert.equal(featCost(2), 6); // 2*3
  assert.equal(featCost(2, { isLegacySquad: true }), 12); // 2*6
});

test("performCheck: 心智系技能為0時自動失敗", () => {
  const c = emptyCharacter("測試角色");
  c.attributes["智力"] = 3;
  c.skills["神秘學"] = 0;
  const result = performCheck(c, { attribute: "智力", skill: "神秘學", dc: 1 });
  assert.equal(result.autoFail, true);
});

test("performCheck: 生理系技能為0仍可嘗試，但損失1個成功數", () => {
  const c = emptyCharacter("測試角色");
  c.attributes["力量"] = 8; // 給高一點的DP，確保有機會擲出成功來檢驗扣減
  c.skills["肉搏"] = 0;
  const result = performCheck(c, { attribute: "力量", skill: "肉搏", dc: 0 });
  assert.equal(result.autoFail, false);
  assert.equal(result.flatPenaltyApplied, 1);
});

test("performCheck: 沒有登記過專業的技能，不套用減半規則(視為泛用技能)", () => {
  const c = emptyCharacter("測試角色");
  c.attributes["智力"] = 4;
  c.skills["科學"] = 4;
  const result = performCheck(c, { attribute: "智力", skill: "科學", dc: 0 });
  assert.ok(result.note.some((n) => n.includes("科學(4)")), "沒有登記專業時不應套用減半");
});

test("performCheck: 有登記專業但本次判定沒對到，技能減半", () => {
  const c = emptyCharacter("測試角色");
  c.attributes["智力"] = 4;
  c.skills["科學"] = 4;
  c.specializations["科學"] = ["化學"];
  const result = performCheck(c, { attribute: "智力", skill: "科學", specialization: "物理", dc: 0 });
  assert.ok(result.note.some((n) => n.includes("減半")), "應該套用減半規則");
});
