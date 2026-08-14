// 死亡與復活測試。
// computeRevivalCost 的📖書內範例：D+1000未花 + D+600血統 + 3000屬性 = DD+4600。
// 這裡的測試用「D」當作1000分的計價單位換算成純數字分數來驗證(書中D/C/B/A/S只是分數的
// 級距標示法，數值本身仍是普通加總，這個引擎內部一律用純數字分數運算，不用D/C/B/A/S字串)。
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REVIVALS,
  computeRevivalCost,
  attemptRevival,
  clearTemporaryEffectsOnRevival,
} from "../core/deathAndRevival.js";

test("computeRevivalCost：📖書中範例——D+1000未花+D+600血統+3000屬性=4600", () => {
  const wallet = {
    unspentPoints: 1000,
    spentLedger: { 血統: 600, 屬性: 3000 },
  };
  assert.equal(computeRevivalCost(wallet), 4600);
});

test("computeRevivalCost：未花分數為負數要丟錯(資料錯誤，不該默默算出負費用)", () => {
  assert.throws(() => computeRevivalCost({ unspentPoints: -1, spentLedger: {} }));
});

test("computeRevivalCost：已花分數明細裡有負數也要丟錯", () => {
  assert.throws(() =>
    computeRevivalCost({ unspentPoints: 0, spentLedger: { 血統: -100 } })
  );
});

test("attemptRevival：付得起就復活成功，reviveCount+1", () => {
  const character = { reviveCount: 0 };
  const wallet = { unspentPoints: 0, spentLedger: { 血統: 600 } };
  const result = attemptRevival(character, wallet, 1000);
  assert.equal(result.revived, true);
  assert.equal(result.permaDeath, false);
  assert.equal(result.cost, 600);
  assert.equal(result.reviveCount, 1);
});

test("attemptRevival：付不起就是真死(permaDeath)，並回報缺口金額", () => {
  const character = { reviveCount: 0 };
  const wallet = { unspentPoints: 0, spentLedger: { 血統: 600 } };
  const result = attemptRevival(character, wallet, 100);
  assert.equal(result.revived, false);
  assert.equal(result.permaDeath, true);
  assert.equal(result.shortfall, 500);
});

test(`attemptRevival：已經復活滿 ${MAX_REVIVALS} 次的角色，無論身上有多少錢都無法再復活`, () => {
  const character = { reviveCount: MAX_REVIVALS };
  const wallet = { unspentPoints: 999999, spentLedger: {} };
  const result = attemptRevival(character, wallet, 999999);
  assert.equal(result.revived, false);
  assert.equal(result.permaDeath, true);
  assert.ok(result.reason.includes("已用完"));
});

test("attemptRevival：兩次復活機會都是同一個公式收費(依使用者決定，不要求特定劇情道具)", () => {
  const wallet = { unspentPoints: 0, spentLedger: { 血統: 200 } };
  const first = attemptRevival({ reviveCount: 0 }, wallet, 200);
  const second = attemptRevival({ reviveCount: 1 }, wallet, 200);
  assert.equal(first.revived, true);
  assert.equal(second.revived, true);
  assert.equal(first.cost, second.cost);
});

test("clearTemporaryEffectsOnRevival：非永久效果清空，永久效果保留", () => {
  const effects = {
    temporary: [{ name: "力量藥劑", duration: 3 }],
    permanent: [{ name: "永久力量+2" }],
  };
  const result = clearTemporaryEffectsOnRevival(effects);
  assert.deepEqual(result.temporary, []);
  assert.deepEqual(result.permanent, [{ name: "永久力量+2" }]);
});
