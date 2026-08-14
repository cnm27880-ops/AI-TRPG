// 不依賴規則書特定範例、而是驗證「不管怎麼用都不該違反」的邏輯不變量。
// 這類測試的價值在於捕捉「範例剛好對了，但其他情況會爆炸」的隱藏 bug。
import test from "node:test";
import assert from "node:assert/strict";
import { createHpState, applyDamage } from "../core/health.js";
import { attributeRaiseCost, skillRaiseCost, featCost } from "../core/xp.js";
import { legendaryAttributeBonus, skillBonusSuccesses } from "../core/dice.js";

test("不變量：生命值四個欄位的總和永遠等於max(傷害只是搬動點數，不會憑空增減)", () => {
  for (let trial = 0; trial < 500; trial++) {
    const max = 5 + Math.floor(Math.random() * 40);
    let hp = createHpState(max);
    const types = ["B", "L", "A"];
    for (let step = 0; step < 15; step++) {
      const type = types[Math.floor(Math.random() * 3)];
      const amount = Math.floor(Math.random() * 6);
      hp = applyDamage(hp, amount, type);
      const total = hp.intact + hp.B + hp.L + hp.A;
      assert.equal(total, max, `第${step}步後總和不等於max：${JSON.stringify(hp)}`);
      assert.ok(hp.intact >= 0 && hp.B >= 0 && hp.L >= 0 && hp.A >= 0, "任何欄位都不該是負數");
    }
  }
});

test("不變量：傷害套用後，intact 只會減少或不變，不會無故增加", () => {
  let hp = createHpState(10);
  let prevIntact = hp.intact;
  for (let i = 0; i < 10; i++) {
    hp = applyDamage(hp, 1, "B");
    assert.ok(hp.intact <= prevIntact);
    prevIntact = hp.intact;
  }
});

test("不變量：XP花費公式對任何合法輸入都不應該是負數", () => {
  for (let v = 1; v <= 30; v++) {
    assert.ok(attributeRaiseCost(v) >= 0, `attributeRaiseCost(${v}) 是負的`);
  }
  for (let lvl = 0; lvl <= 15; lvl++) {
    assert.ok(skillRaiseCost(lvl) >= 0, `skillRaiseCost(${lvl}) 是負的`);
  }
  for (let lvl = 1; lvl <= 5; lvl++) {
    assert.ok(featCost(lvl) >= 0);
  }
});

test("不變量：技能升級越高總花費越貴(單調遞增，不會出現升級反而變便宜的情況)", () => {
  let cumulative = 0;
  let prevCumulative = -1;
  for (let lvl = 0; lvl <= 15; lvl++) {
    cumulative += skillRaiseCost(lvl);
    assert.ok(cumulative >= prevCumulative, `累積花費在等級${lvl}時出現下降`);
    prevCumulative = cumulative;
  }
});

test("不變量：傳奇屬性/技能附加成功都是「數值越高，加值只會持平或變高」的單調函式", () => {
  let prevAttrBonus = -1;
  for (let v = 1; v <= 40; v++) {
    const b = legendaryAttributeBonus(v);
    assert.ok(b >= prevAttrBonus, `屬性${v}的傳奇加值比屬性${v - 1}還低`);
    prevAttrBonus = b;
  }
  let prevSkillBonus = -1;
  for (let lvl = 0; lvl <= 20; lvl++) {
    const b = skillBonusSuccesses(lvl);
    assert.ok(b >= prevSkillBonus, `技能等級${lvl}的附加成功比${lvl - 1}還低`);
    prevSkillBonus = b;
  }
});
