// [設計] 命中判定核心測試（單一DC版）——見 core/combat/attack.js 檔頭的2026-08-15決策記錄。
// 大部分測試用 rollFn 依賴注入塞固定骰子結果，驗證「命中判定+基礎傷害計算」的邏輯本身是對的，
// 不用依賴真骰子的機率；最後補幾個用真骰子的統計性測試驗證有真的接上。
import test from "node:test";
import assert from "node:assert/strict";
import { resolveAttack } from "../core/combat/attack.js";

function fixedRoll(successes, extra = {}) {
  return () => ({ successes, rolls: [], isFortuneDie: false, fumble: false, ...extra });
}

test("resolveAttack：effectiveDP = 攻擊DP - 距離減值（防御不再扣DP）", () => {
  let capturedDP = null;
  const rollFn = (dp) => {
    capturedDP = dp;
    return { successes: 0, rolls: [], isFortuneDie: false, fumble: false };
  };
  resolveAttack({ attackDP: 10, rangeDPPenalty: 2, defenseDC: 3, rollFn });
  assert.equal(capturedDP, 10 - 2);
});

test("resolveAttack：原始成功數必須嚴格大於防御DC才算命中", () => {
  const miss = resolveAttack({ attackDP: 10, defenseDC: 3, rollFn: fixedRoll(3) }); // 3 不大於 3
  assert.equal(miss.hit, false);
  assert.equal(miss.baseDamage, 0);

  const hit = resolveAttack({ attackDP: 10, defenseDC: 3, rollFn: fixedRoll(4) }); // 4 大於 3
  assert.equal(hit.hit, true);
});

test("resolveAttack：命中時，基礎傷害 = 總成功數(原始+附加成功) - 防御DC", () => {
  const result = resolveAttack({
    attackDP: 20,
    attackBonusSuccesses: 5,
    defenseDC: 3,
    rollFn: fixedRoll(6), // 6(原始) + 5(附加) = 11總成功，11-3=8基礎傷害
  });
  assert.equal(result.hit, true);
  assert.equal(result.totalSuccesses, 11);
  assert.equal(result.baseDamage, 8);
});

test("resolveAttack：沒有武器別的傷害上限，基礎傷害可以超過過去舊版的封頂值", () => {
  const result = resolveAttack({
    attackDP: 50,
    attackBonusSuccesses: 20,
    defenseDC: 0,
    rollFn: fixedRoll(30),
  });
  assert.equal(result.baseDamage, 50); // 30+20-0，完全不封頂
});

test("resolveAttack：原始成功數為0時，即使意外命中(防御DC為負)，附加成功也不生效", () => {
  const result = resolveAttack({
    attackDP: 5,
    attackBonusSuccesses: 10,
    defenseDC: -1, // 0 > -1，異常但合法的邊界情況
    rollFn: fixedRoll(0),
  });
  assert.equal(result.hit, true);
  assert.equal(result.bonusSuccessesApplied, 0);
  assert.equal(result.baseDamage, 0 - -1); // 總成功數0，基礎傷害=0-(-1)=1
});

test("resolveAttack：未命中時完全不計算基礎傷害，baseDamage固定為0", () => {
  const result = resolveAttack({
    attackDP: 10,
    attackBonusSuccesses: 99,
    defenseDC: 5,
    rollFn: fixedRoll(2),
  });
  assert.equal(result.hit, false);
  assert.equal(result.baseDamage, 0);
});

// ---- 以下用真骰子(真正的 rollDicePool)確認真的有接上，不是靠注入的假函式蒙混過關 ----

test("resolveAttack(真骰子)：DP很低時，統計上大多數情況打不穿較高的防御DC", () => {
  let hits = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const result = resolveAttack({ attackDP: 3, defenseDC: 8 });
    if (result.hit) hits += 1;
  }
  assert.ok(hits / trials < 0.1, `命中率應該非常低，實際是 ${hits}/${trials}`);
});

test("resolveAttack(真骰子)：DP遠大於防御DC時，統計上大多數情況會命中", () => {
  let hits = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const result = resolveAttack({ attackDP: 30, defenseDC: 0 });
    if (result.hit) hits += 1;
  }
  assert.ok(hits / trials > 0.9, `命中率應該非常高，實際是 ${hits}/${trials}`);
});
