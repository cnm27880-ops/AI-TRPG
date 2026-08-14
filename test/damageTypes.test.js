// [規則書] 傷害類型與減免系統測試——出處見 core/combat/damageTypes.js 頭部註解。
import test from "node:test";
import assert from "node:assert/strict";
import { applyDamageMitigation, takeHighest, DAMAGE_CATEGORY_RULES } from "../core/combat/damageTypes.js";

test("takeHighest：多個來源取最高，不能疊加(📖書中原文範例：2點+3點全傷害吸收，只有3點生效)", () => {
  assert.equal(takeHighest([2, 3]), 3);
  assert.equal(takeHighest([]), 0);
});

test("免疫：直接歸零並跳過其他所有步驟", () => {
  const result = applyDamageMitigation({ amount: 100, category: "物理", isImmune: true, resistanceOrDR: 0 });
  assert.equal(result.finalDamage, 0);
  assert.equal(result.stoppedAt, "immunity");
});

test("忽略門檻：傷害小於等於門檻時整筆歸零(第一種忽略)", () => {
  const result = applyDamageMitigation({ amount: 3, category: "物理", ignoreThreshold: 3 });
  assert.equal(result.finalDamage, 0);
  assert.equal(result.stoppedAt, "ignoreThreshold");
});

test("忽略點數：每次受到傷害忽略X點(第二種忽略)", () => {
  const result = applyDamageMitigation({ amount: 10, category: "物理", ignoreAmount: 4 });
  assert.equal(result.finalDamage, 6);
});

test("物理傷害：📖書中範例——5DR吸收3點物理傷害吸收+5點全傷害吸收，取高5點生效", () => {
  const result = applyDamageMitigation({
    amount: 10,
    category: "物理",
    physicalAbsorption: 5,
    fullAbsorption: 3,
  });
  assert.equal(result.finalDamage, 5); // 10 - takeHighest([5,3]) = 10-5=5
});

test("物理傷害：硬度+吸收+DR依序疊加生效", () => {
  const result = applyDamageMitigation({
    amount: 20,
    category: "物理",
    hardness: 2,
    physicalAbsorption: 3,
    resistanceOrDR: 4,
  });
  assert.equal(result.finalDamage, 20 - 2 - 3 - 4); // 11
});

test("毒素傷害：硬度/DR/忽略/抵消對它完全無效，只有免疫能擋(📖書中原文明講)", () => {
  const result = applyDamageMitigation({
    amount: 10,
    category: "毒素",
    hardness: 100,
    resistanceOrDR: 100,
    ignoreAmount: 100,
    negation: 100,
  });
  assert.equal(result.finalDamage, 10); // 全部減免手段都不生效
});

test("毒素傷害：免疫仍然有效(唯一能擋毒素的手段)", () => {
  const result = applyDamageMitigation({ amount: 10, category: "毒素", isImmune: true });
  assert.equal(result.finalDamage, 0);
});

test("精神傷害：硬度/DR/能量抗力/物理傷害吸收無效，但全傷害吸收仍然有效(📖書中原文對照)", () => {
  const withHardnessAndDR = applyDamageMitigation({
    amount: 10,
    category: "精神",
    hardness: 100,
    resistanceOrDR: 100,
    physicalAbsorption: 100,
  });
  assert.equal(withHardnessAndDR.finalDamage, 10); // 都無效

  const withFullAbsorption = applyDamageMitigation({
    amount: 10,
    category: "精神",
    fullAbsorption: 4,
  });
  assert.equal(withFullAbsorption.finalDamage, 6); // 全傷害吸收有效
});

test("力場傷害：一般DR無效，但DR/-(無弱點)仍然如常生效(📖書中原文特別註明的例外)", () => {
  const normalDR = applyDamageMitigation({
    amount: 10,
    category: "力場",
    resistanceOrDR: 5,
    unconditionalPhysicalDR: false,
  });
  assert.equal(normalDR.finalDamage, 10); // 一般DR無效

  const unconditionalDR = applyDamageMitigation({
    amount: 10,
    category: "力場",
    resistanceOrDR: 5,
    unconditionalPhysicalDR: true,
  });
  assert.equal(unconditionalDR.finalDamage, 5); // DR/-如常生效
});

test("能量傷害：一般子類型(火焰)會被硬度減免", () => {
  const result = applyDamageMitigation({
    amount: 10,
    category: "能量",
    energySubtype: "火焰",
    hardness: 3,
  });
  assert.equal(result.finalDamage, 7);
});

test("能量傷害：雷電/腐蝕/音波/光能對生物無視硬度(📖書中原文明講「無視目標的硬度」)", () => {
  for (const subtype of ["雷電", "腐蝕", "音波", "光能"]) {
    const result = applyDamageMitigation({
      amount: 10,
      category: "能量",
      energySubtype: subtype,
      hardness: 100,
    });
    assert.equal(result.finalDamage, 10, `${subtype}應該無視硬度`);
  }
});

test("能量傷害：能量抗力生效，但物理傷害吸收對能量傷害無效", () => {
  const result = applyDamageMitigation({
    amount: 10,
    category: "能量",
    energySubtype: "寒冰",
    resistanceOrDR: 3,
    physicalAbsorption: 100, // 對能量傷害應該完全不生效
    fullAbsorption: 2,
  });
  assert.equal(result.finalDamage, 10 - 2 - 3); // 5，物理傷害吸收(100)完全沒被採用
});

test("傷害轉化：轉化函式會在抗力/減免之前生效", () => {
  const result = applyDamageMitigation({
    amount: 10,
    category: "物理",
    convert: (amount) => amount / 2, // 假設某能力把傷害折半
    resistanceOrDR: 2,
  });
  assert.equal(result.finalDamage, 10 / 2 - 2); // 先轉化(5)，再扣DR(2)=3
});

test("傷害抵消：在整個流程的最後一步生效", () => {
  const result = applyDamageMitigation({
    amount: 10,
    category: "物理",
    hardness: 1,
    resistanceOrDR: 1,
    negation: 3,
  });
  assert.equal(result.finalDamage, 10 - 1 - 1 - 3); // 5
});

test("傷害不能是負數輸入", () => {
  assert.throws(() => applyDamageMitigation({ amount: -1, category: "物理" }));
});

test("不合法的傷害大類要丟錯", () => {
  assert.throws(() => applyDamageMitigation({ amount: 1, category: "龍息傷害" }));
});

test("最終傷害不會是負數(減免總和超過傷害本身時歸零，不會變成負傷害/回血)", () => {
  const result = applyDamageMitigation({
    amount: 5,
    category: "物理",
    hardness: 3,
    physicalAbsorption: 3,
    resistanceOrDR: 3,
  });
  assert.equal(result.finalDamage, 0);
});

test("DAMAGE_CATEGORY_RULES：六大類傷害都有完整定義，涵蓋所有減免手段欄位", () => {
  const expectedKeys = [
    "immunity", "ignore", "hardness", "physicalAbsorption",
    "fullAbsorption", "energyResistance", "physicalDR", "negation",
  ];
  for (const [category, rules] of Object.entries(DAMAGE_CATEGORY_RULES)) {
    for (const key of expectedKeys) {
      assert.ok(key in rules, `${category} 缺少 ${key} 欄位`);
    }
  }
});
