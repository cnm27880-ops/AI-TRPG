import test from "node:test";
import assert from "node:assert/strict";
import {
  STARTING_SPECIALTIES,
  startingSpecialtyFeats,
  startingSpecialtyNarrationDirective,
  startingSpecialtiesForClient,
} from "../content/chargen/startingSpecialties.js";

function characterWith(...specialties) {
  return { feats: startingSpecialtyFeats(specialties) };
}

test("十項起始專長使用指定名稱、描述並一對一覆蓋 canonical skills", () => {
  assert.equal(STARTING_SPECIALTIES.length, 10);
  assert.deepEqual(STARTING_SPECIALTIES.map(({ id, name, skill }) => ({ id, name, skill })), [
    { id: "melee_reflex", name: "街頭鬥狠", skill: "格鬥" },
    { id: "firearm_aim", name: "軍械直覺", skill: "射擊" },
    { id: "agile_movement", name: "跑酷身手", skill: "體魄" },
    { id: "quiet_steps", name: "無聲匿跡", skill: "潛行" },
    { id: "survival_sense", name: "荒野本能", skill: "求生" },
    { id: "crisis_observer", name: "危險預感", skill: "偵察" },
    { id: "hands_on", name: "百工為家", skill: "技藝" },
    { id: "first_aid", name: "急救技術", skill: "醫療" },
    { id: "occult_literacy", name: "玄秘怪談", skill: "秘識" },
    { id: "situational_talk", name: "洞悉人心", skill: "交涉" },
  ]);
  assert.match(STARTING_SPECIALTIES[0].description, /碎玻璃/);
  assert.match(STARTING_SPECIALTIES[9].description, /微微抽搐的眼角/);
  const client = startingSpecialtiesForClient();
  assert.equal(client.every((item) => item.bonusText === `${item.skill}相關檢定 +1 顆骰`), true);
  assert.equal(client.some((item) => Object.hasOwn(item, "narrationHint")), false);
});

test("專長敘事只在成功／大成功且實際 skill 對應已選 feat 時產生", () => {
  const character = characterWith(STARTING_SPECIALTIES[0]);
  const success = startingSpecialtyNarrationDirective(character, { skill: "格鬥", outcomeTier: "成功" });
  const critical = startingSpecialtyNarrationDirective(character, { skill: "格鬥", outcomeTier: "大成功" });
  assert.match(success, /喉嚨|關節|碎玻璃/);
  assert.match(critical, /喉嚨|關節|碎玻璃/);
  assert.doesNotMatch(success, /街頭鬥狠/);
  assert.match(success, /一到兩句/);
});

test("專長敘事不會在失敗、驚險成功、未選或無關技能時觸發", () => {
  const character = characterWith(STARTING_SPECIALTIES[0]);
  assert.equal(startingSpecialtyNarrationDirective(character, { skill: "格鬥", outcomeTier: "失敗" }), null);
  assert.equal(startingSpecialtyNarrationDirective(character, { skill: "格鬥", outcomeTier: "驚險成功" }), null);
  assert.equal(startingSpecialtyNarrationDirective(character, { skill: "射擊", outcomeTier: "成功" }), null);
  assert.equal(startingSpecialtyNarrationDirective({ feats: [] }, { skill: "格鬥", outcomeTier: "成功" }), null);
  assert.equal(startingSpecialtyNarrationDirective(character, { outcomeTier: "成功" }), null);
});

test("專長敘事只認 server 生成的起始專長 feat，不接受同技能的自造名稱", () => {
  const forged = {
    feats: [{
      id: "forged-feat",
      name: "街頭鬥狠",
      description: "偽造",
      effect: { type: "skillBonus", skill: "格鬥", amount: 1 },
    }],
  };
  assert.equal(startingSpecialtyNarrationDirective(forged, { skill: "格鬥", outcomeTier: "成功" }), null);
});
