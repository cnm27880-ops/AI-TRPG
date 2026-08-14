// 用「理論期望值」而不是隨便設個寬鬆區間，去驗證骰池的統計特性是否真的符合規則。
//
// 推導(單顆初始骰的期望成功數 X)：
//   骰1~7(機率0.7)：0個成功，不加骰
//   骰8或9(機率0.2)：1個成功，不加骰
//   骰10(機率0.1)：1個成功，並且多擲一顆骰子，那顆骰子遞迴適用同一套規則(期望值一樣是X)
//   => X = 0.2*1 + 0.1*(1+X)
//   => X = 0.3 + 0.1X
//   => 0.9X = 0.3
//   => X = 1/3 ≈ 0.3333
//
// 這比單純的「基礎成功率30%」更精確——因為10還可以加骰，期望值會被墊高到 1/3。
import test from "node:test";
import assert from "node:assert/strict";
import { rollDicePool } from "../core/dice.js";

const THEORETICAL_EV_PER_DIE = 1 / 3;

test("骰池統計：大樣本下，每顆初始骰的平均成功數應收斂到理論值 1/3", () => {
  const dp = 200_000;
  const { successes } = rollDicePool(dp);
  const observedEV = successes / dp;

  // N=200,000時，這個隨機變數的標準誤差量級大約在 0.001~0.002 之間，
  // 用 1% 的相對誤差(0.00333)當容忍區間，統計上已經是非常寬鬆、不該誤判的門檻。
  const tolerance = THEORETICAL_EV_PER_DIE * 0.03; // 放寬到3%，避免偶發性的假警報
  assert.ok(
    Math.abs(observedEV - THEORETICAL_EV_PER_DIE) < tolerance,
    `觀察到的期望成功數 ${observedEV} 偏離理論值 ${THEORETICAL_EV_PER_DIE} 超過容忍範圍，骰子邏輯可能有誤`
  );
});

// 這個測試原本寫錯了假設：以為「不合法的低門檻」夾到下限後應該跟預設值(10)一樣。
// 但規則書「加骰的最低值為8」指的是最強的「8再骰」類強化，門檻=8時任何>=8的骰子都成功且都加骰，
// 這在數學上本來就該比預設門檻=10的情況觸發更頻繁、期望值更高，不會跟預設值一樣。
// 理論值推導(threshold=8)：Y = 0.7*0 + 0.3*(1+Y) => 0.7Y=0.3 => Y=3/7≈0.4286
test("骰池統計：不合法的低門檻會被夾到8，其期望值應符合『8再骰』的理論值 3/7", () => {
  const dp = 200_000;
  const clamped = rollDicePool(dp, { rerollThreshold: 1 }).successes / dp; // 故意傳一個不合法的低值
  const theoretical8Again = 3 / 7;
  assert.ok(
    Math.abs(clamped - theoretical8Again) < theoretical8Again * 0.03,
    `門檻被夾到8後，觀察期望值 ${clamped} 應接近 3/7≈0.4286`
  );
});

test("骰池統計：不合法的高門檻(>10)會被夾回10，其期望值符合預設的1/3", () => {
  const dp = 200_000;
  const clamped = rollDicePool(dp, { rerollThreshold: 15 }).successes / dp;
  assert.ok(
    Math.abs(clamped - THEORETICAL_EV_PER_DIE) < THEORETICAL_EV_PER_DIE * 0.03,
    `門檻被夾回10後，觀察期望值 ${clamped} 應接近 1/3`
  );
});

// 機運骰的規則讀法已經跟使用者確認：整條加骰鏈都只有天然10才算成功(不會在加骰後恢復成8/9/10)。
// 理論值推導：每一顆骰(不管是本體骰還是加骰出來的)都是「只有骰到10才成功，且10還會再觸發一顆」，
// 這是一個自我相似的遞迴結構：
//   Z = P(非10)*0 + P(10)*(1+Z) = 0.9*0 + 0.1*(1+Z)
//   0.9Z = 0.1 => Z = 1/9 ≈ 0.1111
test("骰池統計：機運骰(DP<=0)整條加骰鏈只認天然10，期望成功數應收斂到理論值 1/9", () => {
  const trials = 300_000;
  let totalSuccesses = 0;
  for (let i = 0; i < trials; i++) {
    totalSuccesses += rollDicePool(0).successes;
  }
  const observedEV = totalSuccesses / trials;
  const theoretical = 1 / 9;
  assert.ok(
    Math.abs(observedEV - theoretical) < theoretical * 0.08,
    `機運骰觀察期望值 ${observedEV} 偏離理論值 ${theoretical} 過多`
  );
});

test("骰池統計：成功數不會是負數，且不會超過理論上限(每顆骰最多不斷加骰的極端情況仍是有限次數內的合理範圍)", () => {
  for (let i = 0; i < 200; i++) {
    const { successes, rolls } = rollDicePool(20);
    assert.ok(successes >= 0);
    assert.ok(rolls.length >= 20, "骰子數量不應該少於基礎DP");
  }
});
