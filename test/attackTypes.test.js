// [規則書] 攻擊方式公式表測試——逐一比對 rules2.35.txt 裡七種攻擊方式各自的DP/傷害上限公式。
import test from "node:test";
import assert from "node:assert/strict";
import { ATTACK_TYPES, getAttackType, rangePenalty, isWithinMaxRange } from "../core/combat/attackTypes.js";

test("肉搏：DP=力量+肉搏技能+天生武器傷害值，傷害上限同公式", () => {
  const t = getAttackType("肉搏");
  const params = { strength: 5, unarmedSkill: 3, weaponDamage: 2 };
  assert.equal(t.dp(params), 10);
  assert.equal(t.damageCap(params), 10);
});

test("白刃：DP=力量+白刃技能+武器傷害值", () => {
  const t = getAttackType("白刃");
  const params = { strength: 4, meleeWeaponSkill: 6, weaponDamage: 3 };
  assert.equal(t.dp(params), 13);
  assert.equal(t.damageCap(params), 13);
});

test("投擲(輕)：DP用敏捷，傷害上限用力量(兩者不同屬性)", () => {
  const t = getAttackType("投擲_輕");
  const params = { agility: 6, strength: 4, athleticsSkill: 2, weaponDamage: 1 };
  assert.equal(t.dp(params), 9); // 6+2+1
  assert.equal(t.damageCap(params), 7); // 1+2+4
});

test("投擲(重)：DP跟傷害上限都用力量(跟投擲輕不同，兩者都不看敏捷)", () => {
  const t = getAttackType("投擲_重");
  const params = { strength: 5, athleticsSkill: 2, weaponDamage: 2 };
  assert.equal(t.dp(params), 9); // 5+2+2
  assert.equal(t.damageCap(params), 9); // 2+2+5
});

test("弓箭：DP=敏捷+弓箭技能+武器傷害，傷害上限=武器傷害*2+弓箭技能+弓的力量要求(📖書中原文公式)", () => {
  const t = getAttackType("弓箭");
  const params = { agility: 5, bowSkill: 3, weaponDamage: 2, bowStrengthRequirement: 4 };
  assert.equal(t.dp(params), 10);
  assert.equal(t.damageCap(params), 2 * 2 + 3 + 4); // 11
});

test("槍械：DP=敏捷+槍械技能+武器傷害，傷害上限=武器傷害*2+槍械技能(不含力量)", () => {
  const t = getAttackType("槍械");
  const params = { agility: 5, gunSkill: 4, weaponDamage: 3 };
  assert.equal(t.dp(params), 12);
  assert.equal(t.damageCap(params), 3 * 2 + 4); // 10
});

test("炮：DP用智力而非敏捷(跟其他遠程武器不同，📖書中原文特別寫智力)", () => {
  const t = getAttackType("炮");
  const params = { intelligence: 6, gunSkill: 2, weaponDamage: 5 };
  assert.equal(t.dp(params), 13);
  assert.equal(t.damageCap(params), 5 * 2 + 2); // 12
});

test("getAttackType：不合法的攻擊方式要丟錯", () => {
  assert.throws(() => getAttackType("龍息"));
});

test("rangePenalty：距離在1倍射程內無減值", () => {
  assert.equal(rangePenalty(10, 10), 0);
  assert.equal(rangePenalty(5, 10), 0);
});

test("rangePenalty：每超過1倍射程，多2DP減值(📖書中原文)", () => {
  assert.equal(rangePenalty(11, 10), 2); // 超過1倍(10~20之間)
  assert.equal(rangePenalty(21, 10), 4); // 超過2倍
});

test("rangePenalty：射程必須是正數，距離不能是負數", () => {
  assert.throws(() => rangePenalty(10, 0));
  assert.throws(() => rangePenalty(-1, 10));
});

test("isWithinMaxRange：弓箭最大距離=8倍射程單位(📖書中原文)", () => {
  assert.equal(isWithinMaxRange("弓箭", 80, 10), true);
  assert.equal(isWithinMaxRange("弓箭", 81, 10), false);
});

test("isWithinMaxRange：投擲武器最大距離=射程*力量值(📖書中原文，力量越高扔得越遠)", () => {
  assert.equal(isWithinMaxRange("投擲_輕", 50, 10, { strength: 5 }), true);
  assert.equal(isWithinMaxRange("投擲_輕", 51, 10, { strength: 5 }), false);
});

test("isWithinMaxRange：近戰攻擊不適用射程上限判斷", () => {
  assert.equal(isWithinMaxRange("肉搏", 9999, 1), true);
});
