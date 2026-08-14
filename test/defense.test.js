// [規則書] 防御值組裝測試——公式本身直接來自建卡頁欄位定義，用手算範例逐項比對。
import test from "node:test";
import assert from "node:assert/strict";
import { computeDefenseProfile } from "../core/combat/defense.js";

test("computeDefenseProfile：基礎防御取敏捷與感知較高者", () => {
  const result = computeDefenseProfile({ agility: 4, perception: 7 });
  assert.equal(result.base, 7);
});

test("computeDefenseProfile：閃避防御=傳奇敏捷、洞察防御=傳奇感知(n=floor((v-1)/5))", () => {
  const result = computeDefenseProfile({ agility: 16, perception: 11 });
  // 16 -> floor(15/5)=3；11 -> floor(10/5)=2 (跟屬性概述.htm的11->2、16->3範例一致)
  assert.equal(result.dodge, 3);
  assert.equal(result.insight, 2);
});

test("computeDefenseProfile：格擋防御=白刃+肉搏技能等級+盾牌防御相加", () => {
  const result = computeDefenseProfile({
    agility: 1,
    perception: 1,
    meleeWeaponSkill: 5,
    unarmedSkill: 3,
    shieldDefense: 2,
  });
  assert.equal(result.block, 10);
});

test("computeDefenseProfile：全力防御會再疊加一次基礎防御", () => {
  const withoutFullDefense = computeDefenseProfile({ agility: 5, perception: 3, fullDefense: false });
  const withFullDefense = computeDefenseProfile({ agility: 5, perception: 3, fullDefense: true });
  assert.equal(withFullDefense.total, withoutFullDefense.total + withoutFullDefense.base);
});

test("computeDefenseProfile：防御附加成功=傳奇敏捷n+傳奇感知n+其他來源(📖使用者提供的傳奇感知原文確認：兩個屬性都貢獻防御附加成功，不是只有敏捷)", () => {
  const result = computeDefenseProfile({ agility: 16, perception: 11, extraBonusSuccesses: 2 });
  assert.equal(result.dodge, 3);
  assert.equal(result.insight, 2);
  assert.equal(result.bonusSuccesses, 7); // 3(傳奇敏捷) + 2(傳奇感知) + 2(其他來源)
});

test("computeDefenseProfile：防御附加成功跟閃避/洞察防御是分開累加的三個數字(同一個n餵進三個欄位)", () => {
  const result = computeDefenseProfile({ agility: 6, perception: 1 });
  assert.equal(result.dodge, 1);
  assert.equal(result.insight, 0);
  assert.equal(result.bonusSuccesses, 1); // 只有敏捷貢獻，感知的n=0
});

test("computeDefenseProfile：手算範例——完整組合的total正確加總", () => {
  const result = computeDefenseProfile({
    agility: 11, // 傳奇敏捷2
    perception: 6, // 傳奇感知1
    meleeWeaponSkill: 4,
    unarmedSkill: 0,
    shieldDefense: 1,
    armorDefense: 3,
    naturalDefense: 2,
  });
  // base=max(11,6)=11, dodge=2, insight=1, block=4+0+1=5, armor=3, natural=2, fullDefenseBonus=0
  // total = 11+2+1+5+3+2+0 = 24
  assert.equal(result.total, 24);
});
