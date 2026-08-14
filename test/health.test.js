// 驗證 core/health.js 是否精確重現規則書「生命.htm」裡的逐步範例：
// 20點生命 -> 3B傷 -> 4L傷 -> 5A傷 -> (10B傷+10L傷，B先處理) -> 最終應為 0完好+0B+14L+6A
import test from "node:test";
import assert from "node:assert/strict";
import { createHpState, applyDamage } from "../core/health.js";

test("規則書生命值範例：完整重現逐步結果", () => {
  let hp = createHpState(20);
  assert.deepEqual(pick(hp), { intact: 20, B: 0, L: 0, A: 0 });

  hp = applyDamage(hp, 3, "B");
  assert.deepEqual(pick(hp), { intact: 17, B: 3, L: 0, A: 0 }, "3點沖擊傷害後");

  hp = applyDamage(hp, 4, "L");
  assert.deepEqual(pick(hp), { intact: 13, B: 3, L: 4, A: 0 }, "4點嚴重傷害後");

  hp = applyDamage(hp, 5, "A");
  assert.deepEqual(pick(hp), { intact: 8, B: 3, L: 4, A: 5 }, "5點惡性傷害後");

  // 大招：10點沖擊 + 10點嚴重，規則書說「優先處理程度較輕的」，所以B先算
  hp = applyDamage(hp, 10, "B");
  assert.deepEqual(pick(hp), { intact: 0, B: 9, L: 6, A: 5 }, "10點沖擊傷害處理完畢後");

  hp = applyDamage(hp, 10, "L");
  assert.deepEqual(pick(hp), { intact: 0, B: 0, L: 14, A: 6 }, "10點嚴重傷害處理完畢後(最終結果)");
});

test("生理.htm 範例：A傷可以跳過L直接把B轉成A", () => {
  // 一個沒有完好、只剩B的角色，受到A傷時應該是 B->A，不是先流向L
  let hp = { max: 5, intact: 0, B: 3, L: 0, A: 0 };
  hp = applyDamage(hp, 2, "A");
  assert.deepEqual(pick(hp), { intact: 0, B: 1, L: 0, A: 2 });
});

test("evaluateStatus：全惡性視為死亡，最壞狀態為A時視為傷勢惡化中", () => {
  const hp = createHpState(5);
  const dead = applyDamage(hp, 5, "A");
  assert.equal(dead.dead, true);
  assert.equal(dead.worsening, false); // 已經死亡，不需要再惡化

  const dying = applyDamage(createHpState(5), 3, "A"); // 2完好+0B+0L+3A -> intact還有2，不算昏迷
  assert.equal(dying.unconscious, false);

  const dying2 = applyDamage(createHpState(3), 3, "A"); // 0完好+0B+0L+3A，全惡性且無完好 = 死亡
  assert.equal(dying2.dead, true);
});

function pick({ intact, B, L, A }) {
  return { intact, B, L, A };
}
