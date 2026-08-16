// content/scenario/repetition.js 的測試。
//
// 這個模組回應的是一句很具體的測玩回饋：「只要玩家把單一屬性+單一技能點高，
// 就能一直用同一個檢定通關」。所以這裡測的重點是**行為**而不是數字：
// 一直用同一招會愈來愈難、換一招就立刻歸零、而且懲罰有封頂（不會把玩家鎖死）。
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RETREAD_PENALTY,
  usageKey,
  createUsageStreak,
  normalizeStreak,
  retreadPenalty,
  trackUsage,
  buildRetreadDirective,
  retreadLabel,
} from "../content/scenario/repetition.js";

const 潛行 = { attribute: "敏捷", skill: "潛行" };
const 偵察 = { attribute: "感知", skill: "偵察" };

/** 連續用同一組合 n 次，回傳最後的紀錄。 */
function repeat(params, times, streak = createUsageStreak()) {
  let current = streak;
  for (let i = 0; i < times; i++) current = trackUsage(current, params);
  return current;
}

test("第一次與第二次用同一招都不罰（重複一次是合理的戰術，不該被懲罰）", () => {
  assert.equal(retreadPenalty(createUsageStreak(), 潛行).dcPenalty, 0);
  assert.equal(retreadPenalty(repeat(潛行, 1), 潛行).dcPenalty, 0);
});

test("連續第三次開始加難度，而且愈用愈難", () => {
  const third = retreadPenalty(repeat(潛行, 2), 潛行);
  const fourth = retreadPenalty(repeat(潛行, 3), 潛行);

  assert.equal(third.consecutive, 3);
  assert.equal(third.dcPenalty, 1);
  assert.equal(fourth.dcPenalty, 2);
  assert.ok(fourth.dcPenalty > third.dcPenalty);
});

test("懲罰有封頂，不會把只練一條線的玩家鎖死", () => {
  const penalty = retreadPenalty(repeat(潛行, 20), 潛行);
  assert.equal(penalty.dcPenalty, MAX_RETREAD_PENALTY);
  assert.ok(MAX_RETREAD_PENALTY <= 3, "封頂太高等於直接禁止專精，那不是這個機制的目的");
});

test("換一個做法就立刻歸零——這是這個機制真正要引導的行為", () => {
  const afterSpam = repeat(潛行, 5);
  assert.equal(retreadPenalty(afterSpam, 偵察).dcPenalty, 0, "換技能不該被上一招的紀錄拖累");

  const afterSwitch = trackUsage(afterSpam, 偵察);
  assert.equal(retreadPenalty(afterSwitch, 潛行).dcPenalty, 0, "中間插一招之後，舊招也重新開始算");
});

test("同一個技能配不同屬性算兩種做法（摸黑繞路 vs 硬撐著不動是兩件事）", () => {
  const afterAgility = repeat(潛行, 3);
  const willpowerStealth = retreadPenalty(afterAgility, { attribute: "意志", skill: "潛行" });
  assert.equal(willpowerStealth.dcPenalty, 0);
});

test("純屬性檢定也有指紋，不能靠「不帶技能」繞過這個機制", () => {
  const pureWill = { attribute: "意志" };
  assert.ok(usageKey(pureWill));
  assert.equal(retreadPenalty(repeat(pureWill, 2), pureWill).dcPenalty, 1);
});

test("沒有屬性的殘缺參數不會炸，也不會產生懲罰", () => {
  assert.equal(usageKey({}), null);
  assert.equal(retreadPenalty(createUsageStreak(), {}).dcPenalty, 0);
  assert.deepEqual(trackUsage(createUsageStreak(), {}), createUsageStreak());
});

test("舊存檔沒有這個欄位、或資料壞掉時，一律當成全新紀錄", () => {
  assert.deepEqual(normalizeStreak(undefined), createUsageStreak());
  assert.deepEqual(normalizeStreak({ key: 123, count: "x" }), createUsageStreak());
  assert.equal(normalizeStreak({ key: "敏捷+潛行", count: -3 }).count, 0);
});

test("給AI的指令要求把難度寫成「世界學會了這一招」，而不是玩家變弱", () => {
  const penalty = retreadPenalty(repeat(潛行, 3), 潛行);
  const text = buildRetreadDirective(penalty, 潛行, "異形");

  assert.match(text, /連續第 4 次/);
  assert.match(text, /異形/);
  assert.match(text, /不是你決定的/, "難度是引擎算的，要講明白");
  assert.match(text, /換個方法/, "要提示玩家還有別條路，否則只是純懲罰");
  // 沒有懲罰時不該產生任何指令（prompt 裡不要放空段落）
  assert.equal(buildRetreadDirective(retreadPenalty(createUsageStreak(), 潛行), 潛行), null);
});

test("前端標籤只在真的有懲罰時才出現", () => {
  assert.equal(retreadLabel(retreadPenalty(createUsageStreak(), 潛行)), null);
  assert.match(retreadLabel(retreadPenalty(repeat(潛行, 2), 潛行)), /連續第3次 · DC\+1/);
});
