// 整合測試：模擬一小段「實際跑團」流程，把 schema/check/health/xp 串在一起用，
// 確保各模組組合起來時行為合理，不只是各自獨立測試都過而已。
import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { performCheck } from "../core/check.js";
import { createHpState, applyDamage } from "../core/health.js";
import { attributeRaiseCost, skillRaiseCost } from "../core/xp.js";

test("整合：建立一個測試角色、做幾次判定、受傷、升級技能，全程狀態合理", () => {
  const hero = emptyCharacter("測試輪迴者");
  hero.attributes["力量"] = 4;
  hero.attributes["敏捷"] = 6; // 讓她跨過傳奇屬性門檻(6)，測試整合時附加成功有沒有真的生效
  hero.attributes["決心"] = 3;
  hero.skills["白刃"] = 3;
  hero.skills["躲藏"] = 0; // 刻意留一個0級技能，測試生理技能0的懲罰有沒有在整合流程裡生效
  hero.derived.hp = createHpState(20);
  hero.xp.earned = 50;

  // 1) 一次白刃攻擊判定，DC設低一點確保容易觀察
  const attack = performCheck(hero, { attribute: "力量", skill: "白刃", dc: 2 });
  assert.equal(attack.autoFail, false);
  assert.ok(attack.totalSuccesses >= 0);

  // 2) 一次敏捷相關的躲避判定，敏捷6應該要有1點傳奇屬性加值，且躲藏0要扣1成功
  const dodge = performCheck(hero, { attribute: "敏捷", skill: "躲藏", dc: 1 });
  assert.equal(dodge.flatPenaltyApplied, 1, "躲藏0應該要扣1成功");
  assert.ok(dodge.bonusSuccessesRaw >= 1, "敏捷6應該至少有1點傳奇屬性附加成功");

  // 3) 受到一次11點沖擊傷害，確認生命值系統整合起來運作正常
  hero.derived.hp = applyDamage(hero.derived.hp, 11, "B");
  const totalAfterDamage =
    hero.derived.hp.intact + hero.derived.hp.B + hero.derived.hp.L + hero.derived.hp.A;
  assert.equal(totalAfterDamage, 20, "受傷後生命值總量應該還是20(沒有憑空增減)");
  assert.equal(hero.derived.hp.intact, 9, "20-11=9點完好");

  // 4) 花費XP把白刃從3級升到4級，確認費用公式跟角色XP池有正確互動
  const cost = skillRaiseCost(hero.skills["白刃"]); // (3-1)*2=4
  assert.equal(cost, 4);
  assert.ok(hero.xp.earned - hero.xp.spent >= cost, "角色的XP應該要夠付這次升級");
  hero.skills["白刃"] += 1;
  hero.xp.spent += cost;
  assert.equal(hero.skills["白刃"], 4);
  assert.equal(hero.xp.spent, 4);

  // 5) 順便驗證屬性升級公式跟角色XP互動也正常
  const attrCost = attributeRaiseCost(hero.attributes["力量"]); // 4*4=16
  assert.equal(attrCost, 16);
});

test("整合：心智技能為0時，performCheck直接回autoFail，不會誤觸發後續的傷害/骰子邏輯", () => {
  const hero = emptyCharacter("測試輪迴者2");
  hero.attributes["智力"] = 3;
  hero.skills["神秘學"] = 0;
  const result = performCheck(hero, { attribute: "智力", skill: "神秘學", dc: 1 });
  assert.equal(result.autoFail, true);
  assert.equal(result.rolls, undefined, "autoFail時不應該有骰子結果欄位");
});
