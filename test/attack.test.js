// [規則書] 命中判定核心測試。
// 大部分測試用 rollFn 依賴注入塞固定骰子結果，驗證「命中判定+傷害計算」的邏輯本身是對的，
// 不用依賴真骰子的機率(避免測試偶爾隨機失敗)；最後補幾個用真骰子的統計性測試驗證有真的接上。
import test from "node:test";
import assert from "node:assert/strict";
import { resolveAttack } from "../core/combat/attack.js";
import { rollDicePool } from "../core/dice.js";

function fixedRoll(successes, extra = {}) {
  return () => ({ successes, rolls: [], isFortuneDie: false, fumble: false, ...extra });
}

test("resolveAttack：effectiveDP = 攻擊DP - 目標防御值 - 距離減值", () => {
  let capturedDP = null;
  const rollFn = (dp) => {
    capturedDP = dp;
    return { successes: 0, rolls: [], isFortuneDie: false, fumble: false };
  };
  resolveAttack({
    attackDP: 10,
    rangeDPPenalty: 2,
    targetDefense: { total: 3, bonusSuccesses: 0 },
    damageCap: 5,
    rollFn,
  });
  assert.equal(capturedDP, 10 - 3 - 2);
});

test("resolveAttack：原始成功數大於目標防御附加成功數才算命中(📖第13687行)", () => {
  const miss = resolveAttack({
    attackDP: 10,
    targetDefense: { total: 0, bonusSuccesses: 3 },
    damageCap: 10,
    rollFn: fixedRoll(3), // 3 不大於 3，不命中
  });
  assert.equal(miss.hit, false);
  assert.equal(miss.damage, 0);

  const hit = resolveAttack({
    attackDP: 10,
    targetDefense: { total: 0, bonusSuccesses: 3 },
    damageCap: 10,
    rollFn: fixedRoll(4), // 4 大於 3，命中
  });
  assert.equal(hit.hit, true);
});

test("resolveAttack：命中後，總成功數(原始+附加成功)當傷害，但不超過傷害上限", () => {
  const result = resolveAttack({
    attackDP: 20,
    attackBonusSuccesses: 5,
    targetDefense: { total: 0, bonusSuccesses: 0 },
    damageCap: 8,
    rollFn: fixedRoll(6), // 6(原始) + 5(附加) = 11，超過上限8
  });
  assert.equal(result.hit, true);
  assert.equal(result.totalSuccesses, 11);
  assert.equal(result.damage, 8);
});

test("resolveAttack：沒有超過傷害上限時，傷害=實際總成功數", () => {
  const result = resolveAttack({
    attackDP: 20,
    attackBonusSuccesses: 2,
    targetDefense: { total: 0, bonusSuccesses: 0 },
    damageCap: 100,
    rollFn: fixedRoll(3),
  });
  assert.equal(result.damage, 5); // 3+2
});

test("resolveAttack：原始成功數為0時，即使意外命中(防御附加成功為負)，附加成功也不生效", () => {
  const result = resolveAttack({
    attackDP: 5,
    attackBonusSuccesses: 10,
    targetDefense: { total: 0, bonusSuccesses: -1 }, // 0 > -1，異常但合法的邊界情況
    damageCap: 100,
    rollFn: fixedRoll(0),
  });
  assert.equal(result.hit, true);
  assert.equal(result.bonusSuccessesApplied, 0);
  assert.equal(result.damage, 0);
});

test("resolveAttack：未命中時完全不計算傷害上限相關欄位，damage固定為0", () => {
  const result = resolveAttack({
    attackDP: 10,
    attackBonusSuccesses: 99,
    targetDefense: { total: 0, bonusSuccesses: 5 },
    damageCap: 3,
    rollFn: fixedRoll(2),
  });
  assert.equal(result.hit, false);
  assert.equal(result.damage, 0);
});

// ---- 以下用真骰子(真正的 rollDicePool)確認真的有接上，不是靠注入的假函式蒙混過關 ----

test("resolveAttack(真骰子)：DP被防御值扣到<=0時，會退回機運骰模式(isFortuneDie=true)", () => {
  const result = resolveAttack({
    attackDP: 5,
    targetDefense: { total: 20, bonusSuccesses: 0 },
    damageCap: 10,
  });
  assert.equal(result.effectiveDP, -15);
  assert.equal(result.isFortuneDie, true);
});

test("resolveAttack(真骰子)：DP遠大於防御值時，統計上大多數情況會命中且造成接近上限的傷害", () => {
  let hits = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const result = resolveAttack({
      attackDP: 30,
      targetDefense: { total: 0, bonusSuccesses: 0 },
      damageCap: 999,
    });
    if (result.hit) hits += 1;
  }
  assert.ok(hits / trials > 0.9, `命中率應該非常高，實際是 ${hits}/${trials}`);
});
