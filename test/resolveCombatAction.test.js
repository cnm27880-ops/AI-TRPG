// [設計] 整合測試——把 attack.js + armor.js + health.js 串起來的 resolveCombatAction()。
// 見 core/combat/defense.js 檔頭的2026-08-15決策記錄（單一DC+單一護甲值戰鬥數學）。
// 用 rollFn 依賴注入塞固定骰子結果，確保「一次完整攻擊」從命中判定到扣血的每一步都接對了。
import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveCombatAction,
  damageSeverityTag,
  DAMAGE_SEVERITY_TAGS,
} from "../core/combat/resolveCombatAction.js";
import { createHpState } from "../core/health.js";

function fixedRoll(successes) {
  return () => ({ successes, rolls: [], isFortuneDie: false, fumble: false });
}

test("resolveCombatAction：命中時，基礎傷害=成功數-防御DC，直接扣血（無護甲時全額生效）", () => {
  const result = resolveCombatAction({
    attackType: "肉搏",
    attackParams: { strength: 10, unarmedSkill: 3, weaponDamage: 1 }, // DP=14
    defenderAttributes: { 敏捷: 1, 感知: 1 }, // DC = min(1,1) = 1
    defenderHpState: createHpState(20),
    severity: "B",
    rollFn: fixedRoll(6),
  });

  assert.equal(result.hit, true); // 6 > 1
  assert.equal(result.finalDamage, 6 - 1); // 成功數6 - DC1 = 5，無護甲全額生效
  assert.equal(result.newHpState.B, 5);
  assert.equal(result.newHpState.intact, 15);
});

test("resolveCombatAction：未命中時完全不扣血，hpState原封不動回傳", () => {
  const hp = createHpState(20);
  const result = resolveCombatAction({
    attackType: "白刃",
    attackParams: { strength: 1, meleeWeaponSkill: 0, weaponDamage: 1 },
    defenderAttributes: { 敏捷: 1, 感知: 1 },
    defenderCombatProfile: { skillCorrection: 999 }, // 保證DC極高，不命中
    defenderHpState: hp,
    severity: "L",
    rollFn: fixedRoll(5),
  });

  assert.equal(result.hit, false);
  assert.equal(result.newHpState, hp); // 同一個物件，完全沒被動過
});

test("resolveCombatAction：護甲值會在傷害送進health.js之前先扣掉", () => {
  const result = resolveCombatAction({
    attackType: "白刃",
    attackParams: { strength: 10, meleeWeaponSkill: 5, weaponDamage: 2 },
    defenderAttributes: { 敏捷: 1, 感知: 1 }, // DC=1
    defenderCombatProfile: { armor: 4 },
    defenderHpState: createHpState(20),
    severity: "L",
    rollFn: fixedRoll(10),
  });

  assert.equal(result.hit, true);
  assert.equal(result.finalDamage, 10 - 1 - 4); // 成功數10 - DC1 = 9基礎傷害，再扣護甲4
  assert.equal(result.newHpState.L, 5);
});

test("resolveCombatAction：護甲值大於等於基礎傷害時，實質傷害歸零但仍算命中", () => {
  const result = resolveCombatAction({
    attackType: "肉搏",
    attackParams: { strength: 10, unarmedSkill: 5, weaponDamage: 2 },
    defenderAttributes: { 敏捷: 1, 感知: 1 }, // DC=1
    defenderCombatProfile: { armor: 999 },
    defenderHpState: createHpState(20),
    severity: "B",
    rollFn: fixedRoll(10),
  });

  assert.equal(result.hit, true); // 命中了，只是傷害被護甲完全吸收
  assert.equal(result.finalDamage, 0);
  assert.equal(result.newHpState.intact, 20); // 完全沒受傷
});

test("resolveCombatAction：沒有武器別傷害上限，高附加成功可以造成很高的基礎傷害", () => {
  const result = resolveCombatAction({
    attackType: "肉搏",
    attackParams: { strength: 3, unarmedSkill: 0, weaponDamage: 1 },
    attackBonusSuccesses: 20,
    defenderAttributes: { 敏捷: 1, 感知: 1 }, // DC=1
    defenderHpState: createHpState(20),
    severity: "B",
    rollFn: fixedRoll(5),
  });

  assert.equal(result.finalDamage, 5 + 20 - 1); // 5(原始)+20(附加)-1(DC)，不封頂
});

test("resolveCombatAction：距離減值會反映在遠程攻擊的effectiveDP上，但防御DC不再扣DP", () => {
  let capturedDP = null;
  resolveCombatAction({
    attackType: "槍械",
    attackParams: { agility: 5, gunSkill: 3, weaponDamage: 2 }, // DP = 10
    distance: 25,
    weaponRange: 10, // 25在20~30之間，超2倍射程 = 4DP減值
    defenderAttributes: { 敏捷: 1, 感知: 1 },
    defenderHpState: createHpState(20),
    severity: "L",
    rollFn: (dp) => {
      capturedDP = dp;
      return { successes: 0, rolls: [], isFortuneDie: false, fumble: false };
    },
  });
  assert.equal(capturedDP, 10 - 4); // 攻擊DP(10) - 距離減值(4)，防御值不再扣DP
});

test("resolveCombatAction：defenderCombatProfile缺欄位時全部視為0(空手空防具仍可正常運作)", () => {
  const result = resolveCombatAction({
    attackType: "肉搏",
    attackParams: { strength: 5, unarmedSkill: 0, weaponDamage: 0 },
    defenderAttributes: { 敏捷: 1, 感知: 1 },
    defenderHpState: createHpState(20),
    severity: "B",
    rollFn: fixedRoll(5),
  });
  assert.equal(result.hit, true);
  assert.equal(result.finalDamage, 5 - 1); // DC=min(1,1)=1，無護甲
});

// ---- 真骰子版本，確認真的接上 core/dice.js ----
test("resolveCombatAction(真骰子)：跑得動、回傳結構完整", () => {
  const result = resolveCombatAction({
    attackType: "白刃",
    attackParams: { strength: 8, meleeWeaponSkill: 4, weaponDamage: 3 },
    defenderAttributes: { 敏捷: 3, 感知: 3 },
    defenderHpState: createHpState(20),
    severity: "L",
  });
  assert.ok(typeof result.hit === "boolean");
  assert.ok(result.newHpState.max === 20);
});

// ---------------------------------------------------------------------------
// 傷害嚴重度標籤（Phase 5.3 任務4）
//
// 標籤是給敘事層看的視覺提示。這組測試守的是兩件事：
//   1. 分級對得上（幾點傷該配哪一句）
//   2. 它**完全不參與運算**——加上這個欄位之後，HP 轉換結果必須跟以前一字不差
// ---------------------------------------------------------------------------

test("damageSeverityTag：未命中與「命中但被護甲吃光」是兩個不同的標籤", () => {
  assert.equal(damageSeverityTag({ hit: false }).key, "miss");
  assert.equal(damageSeverityTag({ hit: true, damage: 0, severity: "B" }).key, "absorbed");
  assert.equal(damageSeverityTag({ hit: true, damage: 0, severity: "B" }).tag, "[火花四濺 / 毫髮無傷]");
});

test("damageSeverityTag：1~2點是輕傷、3~4點是重傷、5點以上是致命", () => {
  assert.equal(damageSeverityTag({ hit: true, damage: 1, severity: "B" }).key, "light");
  assert.equal(damageSeverityTag({ hit: true, damage: 2, severity: "B" }).key, "light");
  assert.equal(damageSeverityTag({ hit: true, damage: 3, severity: "L" }).key, "serious");
  assert.equal(damageSeverityTag({ hit: true, damage: 4, severity: "L" }).key, "serious");
  assert.equal(damageSeverityTag({ hit: true, damage: 5, severity: "B" }).key, "critical");
  assert.equal(damageSeverityTag({ hit: true, damage: 12, severity: "L" }).key, "critical");
});

test("damageSeverityTag：惡性傷(A)不論點數多少都算致命重創", () => {
  // A傷會直接吃掉完好格且不可回復（見 core/health.js 的轉換表），
  // 所以「1點A傷」在畫面上不該跟「1點瘀青」寫成同一種東西。
  assert.equal(damageSeverityTag({ hit: true, damage: 1, severity: "A" }).key, "critical");
});

test("damageSeverityTag 的文字就是 DAMAGE_SEVERITY_TAGS 那張表(不要有第二份字串)", () => {
  for (const key of Object.keys(DAMAGE_SEVERITY_TAGS)) {
    assert.ok(DAMAGE_SEVERITY_TAGS[key].startsWith("["), `${key} 的標籤要用方括號包起來`);
  }
  assert.equal(
    damageSeverityTag({ hit: true, damage: 3, severity: "L" }).tag,
    DAMAGE_SEVERITY_TAGS.serious
  );
});

test("resolveCombatAction：命中時回傳的結果帶著標籤，且跟實質傷害對得上", () => {
  const result = resolveCombatAction({
    attackType: "肉搏",
    attackParams: { strength: 10, unarmedSkill: 3, weaponDamage: 1 },
    defenderAttributes: { 敏捷: 1, 感知: 1 }, // DC=1
    defenderHpState: createHpState(20),
    severity: "B",
    rollFn: fixedRoll(6),
  });

  assert.equal(result.finalDamage, 5);
  assert.equal(result.damageSeverity, "critical");
  assert.equal(result.damageSeverityTag, DAMAGE_SEVERITY_TAGS.critical);
});

test("resolveCombatAction：護甲把傷害吃光時是「火花四濺」，不是「未命中」", () => {
  const result = resolveCombatAction({
    attackType: "白刃",
    attackParams: { strength: 4, meleeWeaponSkill: 1, weaponDamage: 1 },
    defenderAttributes: { 敏捷: 1, 感知: 1 }, // DC=1
    defenderCombatProfile: { armor: 99 },
    defenderHpState: createHpState(20),
    severity: "L",
    rollFn: fixedRoll(4),
  });

  assert.equal(result.hit, true);
  assert.equal(result.finalDamage, 0);
  assert.equal(result.damageSeverity, "absorbed");
});

test("resolveCombatAction：未命中時也帶標籤(前端/AI 兩條路都不用自己判斷 null)", () => {
  const result = resolveCombatAction({
    attackType: "白刃",
    attackParams: { strength: 1, meleeWeaponSkill: 0, weaponDamage: 1 },
    defenderAttributes: { 敏捷: 1, 感知: 1 },
    defenderCombatProfile: { skillCorrection: 999 },
    defenderHpState: createHpState(20),
    severity: "L",
    rollFn: fixedRoll(5),
  });

  assert.equal(result.hit, false);
  assert.equal(result.damageSeverity, "miss");
});

test("標籤完全不影響傷害運算：同一次攻擊的 HP 結果跟只看數字時一模一樣", () => {
  const params = {
    attackType: "肉搏",
    attackParams: { strength: 6, unarmedSkill: 2, weaponDamage: 0 },
    defenderAttributes: { 敏捷: 2, 感知: 2 },
    defenderCombatProfile: { armor: 1 },
    defenderHpState: createHpState(10),
    severity: "L",
    rollFn: fixedRoll(7),
  };
  const result = resolveCombatAction(params);

  // 手算：成功數7 - 防禦DC2 = 5 基礎傷害，扣護甲1 = 4 點 L 傷。
  assert.equal(result.finalDamage, 4);
  assert.equal(result.newHpState.L, 4);
  assert.equal(result.newHpState.intact, 6);
  // 標籤存在，但上面三個數字沒有因為它而改變。
  assert.equal(result.damageSeverity, "serious");
});
