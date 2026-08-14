// [設計] 整合測試——把 attack.js + damageTypes.js + health.js 串起來的 resolveCombatAction()。
// 用 rollFn 依賴注入塞固定骰子結果，確保「一次完整攻擊」從命中判定到扣血的每一步都接對了。
import test from "node:test";
import assert from "node:assert/strict";
import { resolveCombatAction } from "../core/combat/resolveCombatAction.js";
import { createHpState } from "../core/health.js";

function fixedRoll(successes) {
  return () => ({ successes, rolls: [], isFortuneDie: false, fumble: false });
}

test("resolveCombatAction：命中且傷害穿透減免時，生命值正確扣減", () => {
  const result = resolveCombatAction({
    attackType: "肉搏",
    attackParams: { strength: 10, unarmedSkill: 3, weaponDamage: 1 },
    defenderAttributes: { 敏捷: 1, 感知: 1 },
    defenderHpState: createHpState(20),
    damageCategory: "物理",
    severity: "B",
    rollFn: fixedRoll(6),
  });

  assert.equal(result.hit, true);
  assert.equal(result.finalDamage, 6);
  assert.equal(result.newHpState.B, 6);
  assert.equal(result.newHpState.intact, 14);
});

test("resolveCombatAction：未命中時完全不扣血，hpState原封不動回傳", () => {
  const hp = createHpState(20);
  const result = resolveCombatAction({
    attackType: "白刃",
    attackParams: { strength: 1, meleeWeaponSkill: 0, weaponDamage: 1 },
    defenderAttributes: { 敏捷: 1, 感知: 1 },
    defenderCombatProfile: { extraDefenseBonusSuccesses: 999 }, // 保證不命中
    defenderHpState: hp,
    damageCategory: "物理",
    severity: "L",
    rollFn: fixedRoll(5),
  });

  assert.equal(result.hit, false);
  assert.equal(result.newHpState, hp); // 同一個物件，完全沒被動過
});

test("resolveCombatAction：防御方的物理減免會在傷害送進health.js之前先扣掉", () => {
  const result = resolveCombatAction({
    attackType: "白刃",
    attackParams: { strength: 10, meleeWeaponSkill: 5, weaponDamage: 2 },
    defenderAttributes: { 敏捷: 1, 感知: 1 },
    defenderCombatProfile: { physicalDR: 3, hardness: 2 },
    defenderHpState: createHpState(20),
    damageCategory: "物理",
    severity: "L",
    rollFn: fixedRoll(10),
  });

  assert.equal(result.hit, true);
  assert.equal(result.finalDamage, 10 - 2 - 3); // 硬度2+DR3
  assert.equal(result.newHpState.L, 5);
});

test("resolveCombatAction：防御方免疫這個傷害大類時，傷害直接歸零", () => {
  const result = resolveCombatAction({
    attackType: "肉搏",
    attackParams: { strength: 10, unarmedSkill: 5, weaponDamage: 2 },
    defenderAttributes: { 敏捷: 1, 感知: 1 },
    defenderCombatProfile: { immunities: ["物理"] },
    defenderHpState: createHpState(20),
    damageCategory: "物理",
    severity: "B",
    rollFn: fixedRoll(10),
  });

  assert.equal(result.hit, true); // 命中了，只是傷害被免疫擋掉
  assert.equal(result.finalDamage, 0);
  assert.equal(result.newHpState.intact, 20); // 完全沒受傷
});

test("resolveCombatAction：傷害上限(damageCap)+額外加成(extraDamageCap)會限制住實際傷害", () => {
  const result = resolveCombatAction({
    attackType: "肉搏",
    attackParams: { strength: 3, unarmedSkill: 0, weaponDamage: 1 }, // damageCap = 1+0+3 = 4
    attackBonusSuccesses: 20,
    extraDamageCap: 2, // 例如傳奇力量的加成，總上限變成 4+2=6
    defenderAttributes: { 敏捷: 1, 感知: 1 },
    defenderHpState: createHpState(20),
    damageCategory: "物理",
    severity: "B",
    rollFn: fixedRoll(5),
  });

  assert.equal(result.finalDamage, 6); // 5(原始)+20(附加)=25，但上限是6
});

test("resolveCombatAction：距離減值會反映在遠程攻擊的effectiveDP上", () => {
  let capturedDP = null;
  const result = resolveCombatAction({
    attackType: "槍械",
    attackParams: { agility: 5, gunSkill: 3, weaponDamage: 2 }, // DP = 10
    distance: 25,
    weaponRange: 10, // 超過1倍射程(10~20之間算超1倍，20~30算超2倍) -> 25在20~30之間，超2倍 = 4DP減值
    defenderAttributes: { 敏捷: 1, 感知: 1 },
    defenderHpState: createHpState(20),
    damageCategory: "物理",
    severity: "L",
    rollFn: (dp) => {
      capturedDP = dp;
      return { successes: 0, rolls: [], isFortuneDie: false, fumble: false };
    },
  });
  // 防御方 敏捷1/感知1 -> base defense = max(1,1) = 1(見defense.js)，傳奇加成為0(尚未達到門檻)
  assert.equal(capturedDP, 10 - 1 - 4); // 攻擊DP(10) - 防御(1) - 距離減值(4)
});

test("resolveCombatAction：全力防御會提高防御方的有效DP扣減量", () => {
  let dpNormal, dpFullDefense;
  resolveCombatAction({
    attackType: "肉搏",
    attackParams: { strength: 10, unarmedSkill: 0, weaponDamage: 0 },
    defenderAttributes: { 敏捷: 5, 感知: 1 },
    defenderHpState: createHpState(20),
    damageCategory: "物理",
    severity: "B",
    rollFn: (dp) => { dpNormal = dp; return { successes: 0, rolls: [], isFortuneDie: false, fumble: false }; },
  });
  resolveCombatAction({
    attackType: "肉搏",
    attackParams: { strength: 10, unarmedSkill: 0, weaponDamage: 0 },
    defenderAttributes: { 敏捷: 5, 感知: 1 },
    defenderFullDefense: true,
    defenderHpState: createHpState(20),
    damageCategory: "物理",
    severity: "B",
    rollFn: (dp) => { dpFullDefense = dp; return { successes: 0, rolls: [], isFortuneDie: false, fumble: false }; },
  });
  assert.ok(dpFullDefense < dpNormal, "全力防御應該讓攻擊方的有效DP更低");
});

// ---- 真骰子版本，確認真的接上 core/dice.js ----
test("resolveCombatAction(真骰子)：跑得動、回傳結構完整", () => {
  const result = resolveCombatAction({
    attackType: "白刃",
    attackParams: { strength: 8, meleeWeaponSkill: 4, weaponDamage: 3 },
    defenderAttributes: { 敏捷: 3, 感知: 3 },
    defenderHpState: createHpState(20),
    damageCategory: "物理",
    severity: "L",
  });
  assert.ok(typeof result.hit === "boolean");
  assert.ok(result.newHpState.max === 20);
});
