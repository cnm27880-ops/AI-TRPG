// [規則書] 建卡.htm 第1030~1768行「羅蘭」完整建卡範例，逐項手算驗證過後拿來當測試的ground truth。
import test from "node:test";
import assert from "node:assert/strict";
import {
  attributeChargenCost,
  skillChargenCost,
  validateAttributeBudget,
  validateSkillBudget,
  validateSpecializations,
  validateFeatBudget,
  ATTRIBUTE_CAP,
  SKILL_CAP,
  FREE_SPECIALIZATIONS,
  FEAT_POINTS,
} from "../core/characterCreation.js";

test("attributeChargenCost：1~5級的花費(4→5那一級要花2點)", () => {
  assert.equal(attributeChargenCost(1), 0);
  assert.equal(attributeChargenCost(2), 1);
  assert.equal(attributeChargenCost(3), 2);
  assert.equal(attributeChargenCost(4), 3);
  assert.equal(attributeChargenCost(5), 5); // 3(到4) + 2(4→5突破) = 5
});

test("attributeChargenCost：超過建卡上限或小於1要丟錯", () => {
  assert.throws(() => attributeChargenCost(0));
  assert.throws(() => attributeChargenCost(ATTRIBUTE_CAP + 1));
});

test("skillChargenCost：0~3級固定1級1點，沒有突增", () => {
  assert.equal(skillChargenCost(0), 0);
  assert.equal(skillChargenCost(1), 1);
  assert.equal(skillChargenCost(2), 2);
  assert.equal(skillChargenCost(3), 3);
});

test("skillChargenCost：超過建卡上限或小於0要丟錯", () => {
  assert.throws(() => skillChargenCost(-1));
  assert.throws(() => skillChargenCost(SKILL_CAP + 1));
});

// ---- 羅蘭範例：屬性 ----
// 書中原文：生理3點/心智2點/互動1點，最終屬性 力量3/敏捷1/耐力4/智力1/感知1/決心4/風度1/操控1/沉著2
// 手算：cost(3)+cost(1)*4+cost(4)*2+cost(2) = 2+0+0+0+0+3+3+0+1 = 9 = 6(類別)+3(自由)
test("validateAttributeBudget：羅蘭範例——總花費剛好等於總預算(9點)，完全合法", () => {
  const categoryAllocation = { 生理: 3, 心智: 2, 互動: 1 };
  const finalAttributes = {
    力量: 3, 敏捷: 1, 耐力: 4,
    智力: 1, 感知: 1, 決心: 4,
    風度: 1, 操控: 1, 沉著: 2,
  };
  const result = validateAttributeBudget(categoryAllocation, finalAttributes);
  assert.equal(result.valid, true);
  assert.equal(result.totalCost, 9);
  assert.equal(result.totalBudget, 9);
  assert.equal(result.remaining, 0);
  assert.deepEqual(result.errors, []);
});

test("validateAttributeBudget：花費超過總預算要回報不合法並列出原因", () => {
  const categoryAllocation = { 生理: 3, 心智: 2, 互動: 1 };
  const finalAttributes = {
    力量: 5, 敏捷: 5, 耐力: 5, // 隨便爆花
    智力: 1, 感知: 1, 決心: 1,
    風度: 1, 操控: 1, 沉著: 1,
  };
  const result = validateAttributeBudget(categoryAllocation, finalAttributes);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("validateAttributeBudget：類別預算分配不是{3,2,1}的排列要回報不合法", () => {
  const categoryAllocation = { 生理: 3, 心智: 3, 互動: 1 }; // 心智重複用了3，不合法
  const finalAttributes = {
    力量: 1, 敏捷: 1, 耐力: 1, 智力: 1, 感知: 1, 決心: 1, 風度: 1, 操控: 1, 沉著: 1,
  };
  const result = validateAttributeBudget(categoryAllocation, finalAttributes);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("排列")));
});

// ---- 羅蘭範例：技能(建卡當下、專長調整前的快照) ----
// 書中原文：6點分配給生理技能、5點分配給互動技能、4點分配給心智技能
// 最終技能(專長調整前)：運動3/肉搏3/求生2/白刃3/調查3/神秘學1/感受1/表達1/交際3
// 手算：3+3+2+3+3+1+1+1+3 = 20 = 15(類別)+5(自由)
test("validateSkillBudget：羅蘭範例(專長調整前的快照)——總花費剛好等於總預算(20點)", () => {
  const categoryAllocation = { 生理: 6, 互動: 5, 心智: 4 };
  const finalSkills = {
    運動: 3, 肉搏: 3, 求生: 2, 白刃: 3,
    調查: 3, 神秘學: 1,
    感受: 1, 表達: 1, 交際: 3,
  };
  const result = validateSkillBudget(categoryAllocation, finalSkills);
  assert.equal(result.valid, true);
  assert.equal(result.totalCost, 20);
  assert.equal(result.totalBudget, 20);
  assert.equal(result.remaining, 0);
});

test("validateSkillBudget：未列到的技能視為0級，不影響花費計算", () => {
  const categoryAllocation = { 生理: 6, 互動: 5, 心智: 4 };
  const finalSkills = { 運動: 1 };
  const result = validateSkillBudget(categoryAllocation, finalSkills);
  assert.equal(result.totalCost, 1);
  assert.equal(result.valid, true);
});

// ---- 羅蘭範例：專業 ----
// 書中原文：運動掛「游泳」「輕投擲武器」兩個專業，白刃掛「重劍」一個專業，總共3個，剛好用完免費配額
test("validateSpecializations：羅蘭範例——3個專業全部掛在等級≥1的技能上，合法", () => {
  const specializations = { 運動: ["游泳", "輕投擲武器"], 白刃: ["重劍"] };
  const finalSkills = { 運動: 3, 白刃: 3 };
  const result = validateSpecializations(specializations, finalSkills);
  assert.equal(result.valid, true);
  assert.equal(result.totalSpecs, 3);
  assert.equal(result.remaining, 0);
});

test("validateSpecializations：專業掛在0級技能上要回報不合法", () => {
  const specializations = { 神秘學: ["占卜"] };
  const finalSkills = { 神秘學: 0 };
  const result = validateSpecializations(specializations, finalSkills);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("神秘學")));
});

test("validateSpecializations：專業總數超過3個要回報不合法", () => {
  const specializations = { 運動: ["a", "b"], 白刃: ["c", "d"] };
  const finalSkills = { 運動: 3, 白刃: 3 };
  const result = validateSpecializations(specializations, finalSkills);
  assert.equal(result.valid, false);
  assert.equal(result.totalSpecs, 4);
});

// ---- 羅蘭範例：專長 ----
// 書中原文：死硬(4級)+特殊身份(1級)=5=專長點數上限；語言：英語(2級)，羅蘭最終智力=1，語言額度=2×1=2
test("validateFeatBudget：羅蘭範例——一般專長剛好用完5點，語言專長剛好用完額度", () => {
  const feats = [{ name: "死硬", level: 4 }, { name: "特殊身份", level: 1 }];
  const languageFeats = [{ name: "英語", level: 2 }];
  const result = validateFeatBudget(feats, { intelligence: 1, languageFeats });
  assert.equal(result.valid, true);
  assert.equal(result.totalCost, FEAT_POINTS);
  assert.equal(result.remaining, 0);
  assert.equal(result.languageCost, 2);
  assert.equal(result.languageBudget, 2);
  assert.equal(result.languageRemaining, 0);
});

test("validateFeatBudget：一般專長超支跟語言專長超支分開回報", () => {
  const feats = [{ name: "死硬", level: 6 }]; // 超過5點專長點數
  const languageFeats = [{ name: "英語", level: 5 }]; // 智力1只給2點語言額度
  const result = validateFeatBudget(feats, { intelligence: 1, languageFeats });
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
});
