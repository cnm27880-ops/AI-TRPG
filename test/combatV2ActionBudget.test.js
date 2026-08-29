// Combat V2 —— 動作經濟的單元測試（規格第11.1節，16 條全部覆蓋）。
//
// 這一份跟 test/actionEconomy.test.js **是兩套不同系統的測試**，不是新舊版本：
// 舊的測 core/combat/actionEconomy.js 的 boolean 旗標模型（含反射/自由/專注動作），
// 這一份測 core/combat/v2/actionBudget.js 的計數池模型。兩者都要通過，
// 分野見 core/combat/V2_ISOLATION.md。
import test from "node:test";
import assert from "node:assert/strict";
import {
  createActionBudget,
  conversionRecords,
  grantAction,
  hasAnyActionLeft,
  planSpend,
  publicBudget,
  remainingActions,
  spendAction,
  spendBatch,
} from "../core/combat/v2/actionBudget.js";
import { BASE_BUDGET, canConvert, costOf, poolsLockedBy } from "../core/combat/v2/actionTypes.js";

// --- 1. 每回合的基礎額度 ---

test("11.1.1 每回合正確建立 1 swift、1 move、1 standard", () => {
  assert.deepEqual(remainingActions(createActionBudget()), { swift: 1, move: 1, standard: 1 });
  assert.deepEqual({ ...BASE_BUDGET }, { swift: 1, move: 1, standard: 1 });
});

test("11.1.2 迅捷動作只能使用一次", () => {
  const once = spendAction(createActionBudget(), "swift");
  assert.equal(once.ok, true);
  // 第二次會自動去借移動動作（合法的轉化），所以要把三個池子都用光才看得到拒絕。
  const drained = spendAction(spendAction(once.budget, "swift").budget, "swift");
  assert.equal(drained.ok, true, "move 與 standard 都能轉化為 swift");
  const fourth = spendAction(drained.budget, "swift");
  assert.equal(fourth.ok, false);
  assert.match(fourth.reason, /迅捷動作已使用/);
});

test("11.1.3 移動動作只能使用一次（用完之後只剩下轉化來源）", () => {
  const first = spendAction(createActionBudget(), "move");
  assert.deepEqual(remainingActions(first.budget), { swift: 1, move: 0, standard: 1 });
  const second = spendAction(first.budget, "move");
  assert.equal(second.ok, true, "standard 可以轉化為 move");
  assert.deepEqual(remainingActions(second.budget), { swift: 1, move: 0, standard: 0 });
  const third = spendAction(second.budget, "move");
  assert.equal(third.ok, false);
});

test("11.1.4 標準動作只能使用一次，而且沒有任何池子能轉出標準動作", () => {
  const first = spendAction(createActionBudget(), "standard");
  assert.equal(first.ok, true);
  const second = spendAction(first.budget, "standard");
  assert.equal(second.ok, false, "swift/move 都不能升級成 standard");
  assert.deepEqual(remainingActions(second.budget), { swift: 1, move: 1, standard: 0 });
});

// --- 2. 單向轉化 ---

test("11.1.5 move 可以轉化為 swift，原本的 swift 仍然保留", () => {
  const spend = spendAction(createActionBudget(), "swift", { from: "move" });
  assert.equal(spend.ok, true);
  assert.deepEqual(remainingActions(spend.budget), { swift: 1, move: 0, standard: 1 });
});

test("11.1.6 standard 可以轉化為 move，原本的 move 仍然保留", () => {
  const spend = spendAction(createActionBudget(), "move", { from: "standard" });
  assert.equal(spend.ok, true);
  assert.deepEqual(remainingActions(spend.budget), { swift: 1, move: 1, standard: 0 });
});

test("11.1.7 standard 可以直接轉化為 swift，move 與 swift 都仍然保留", () => {
  const spend = spendAction(createActionBudget(), "swift", { from: "standard" });
  assert.equal(spend.ok, true);
  assert.deepEqual(remainingActions(spend.budget), { swift: 1, move: 1, standard: 0 });
});

test("11.1.8 不允許 swift 轉 move", () => {
  assert.equal(canConvert("swift", "move"), false);
  const spend = spendAction(createActionBudget(), "move", { from: "swift" });
  assert.equal(spend.ok, false);
  assert.match(spend.reason, /不能轉化/);
  assert.deepEqual(remainingActions(spend.budget), { swift: 1, move: 1, standard: 1 }, "失敗不得扣任何額度");
});

test("11.1.9 不允許 move 轉 standard", () => {
  assert.equal(canConvert("move", "standard"), false);
  const spend = spendAction(createActionBudget(), "standard", { from: "move" });
  assert.equal(spend.ok, false);
  assert.deepEqual(remainingActions(spend.budget), { swift: 1, move: 1, standard: 1 });
});

test("轉化只能由高階往低階，反向一律不成立", () => {
  assert.equal(canConvert("standard", "move"), true);
  assert.equal(canConvert("standard", "swift"), true);
  assert.equal(canConvert("move", "swift"), true);
  assert.equal(canConvert("swift", "standard"), false);
});

test("規格第2.1節第5、6點：轉化後低階動作仍可再用一次（本回合可完成兩個移動類行動）", () => {
  let budget = createActionBudget();
  budget = spendAction(budget, "move", { from: "standard" }).budget; // 標準轉移動
  const second = spendAction(budget, "move"); // 原本的移動仍在
  assert.equal(second.ok, true);
  assert.deepEqual(remainingActions(second.budget), { swift: 1, move: 0, standard: 0 });
});

// --- 3. 整輪 / 全回合 ---

test("11.1.10 fullRound 同時消耗 move 與 standard，且不碰 swift", () => {
  const spend = spendAction(createActionBudget(), "fullRound");
  assert.equal(spend.ok, true);
  assert.deepEqual(remainingActions(spend.budget), { swift: 1, move: 0, standard: 0 });
  assert.deepEqual(costOf("fullRound"), { swift: 0, move: 1, standard: 1 });
});

test("11.1.11 fullTurn 同時消耗 swift、move 與 standard", () => {
  const spend = spendAction(createActionBudget(), "fullTurn");
  assert.equal(spend.ok, true);
  assert.deepEqual(remainingActions(spend.budget), { swift: 0, move: 0, standard: 0 });
});

test("11.1.12 fullRound 條件不足時完全不消耗任何資源", () => {
  const afterMove = spendAction(createActionBudget(), "move").budget;
  const spend = spendAction(afterMove, "fullRound");
  assert.equal(spend.ok, false);
  assert.deepEqual(
    remainingActions(spend.budget),
    { swift: 1, move: 0, standard: 1 },
    "standard 不得被先扣掉"
  );
});

test("11.1.13 fullTurn 條件不足時完全不消耗任何資源", () => {
  const afterSwift = spendAction(createActionBudget(), "swift").budget;
  const spend = spendAction(afterSwift, "fullTurn");
  assert.equal(spend.ok, false);
  assert.deepEqual(remainingActions(spend.budget), { swift: 0, move: 1, standard: 1 });
});

test("整輪/全回合不走轉化：沒有任何池子能生出一個 standard", () => {
  const noStandard = spendAction(createActionBudget(), "standard").budget;
  assert.equal(planSpend(noStandard, "fullRound").ok, false);
  assert.equal(planSpend(noStandard, "fullTurn").ok, false);
});

test("11.1.14 fullRound 使用後仍能使用剩餘 swift", () => {
  const after = spendAction(createActionBudget(), "fullRound").budget;
  assert.equal(hasAnyActionLeft(after), true);
  const swift = spendAction(after, "swift");
  assert.equal(swift.ok, true);
  assert.equal(hasAnyActionLeft(swift.budget), false);
});

test("11.1.15 有額外動作來源時，fullRound／fullTurn 不會錯誤地強制結束整回合", () => {
  const granted = grantAction(createActionBudget(), "standard", 1, "測試用額外動作");
  const afterFullTurn = spendAction(granted, "fullTurn");
  assert.equal(afterFullTurn.ok, true);
  // 回合結不結束由結算後**真正剩下的額度**決定，不是由 actionType 決定（規格第2.4節）。
  assert.equal(hasAnyActionLeft(afterFullTurn.budget), true);
  assert.deepEqual(remainingActions(afterFullTurn.budget), { swift: 0, move: 0, standard: 1 });
  assert.equal(spendAction(afterFullTurn.budget, "standard").ok, true);
});

test("11.1.16 所有轉化都留下來源紀錄", () => {
  let budget = createActionBudget();
  budget = spendAction(budget, "swift", { from: "standard" }, { actionId: "hunker_down", round: 1 }).budget;
  budget = spendAction(budget, "swift", { from: "move" }, { actionId: "focus_aim", round: 1 }).budget;
  const records = conversionRecords(budget);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.conversion), ["standard->swift", "move->swift"]);
  assert.deepEqual(records.map((r) => r.actionId), ["hunker_down", "focus_aim"]);
  assert.ok(records.every((r) => r.round === 1));
});

test("沒有轉化的消耗不會被誤記成轉化", () => {
  const budget = spendAction(createActionBudget(), "standard", {}, { actionId: "firearm_shot" }).budget;
  assert.equal(conversionRecords(budget).length, 0);
  assert.equal(budget.spent[0].converted, false);
  assert.equal(budget.spent[0].conversion, null);
});

// --- 4. 批次消耗（玩家一次選好幾個行動）---

test("一批選擇裡任何一項排不進去，整批都不扣（不得部分扣除）", () => {
  const batch = spendBatch(createActionBudget(), [
    { actionType: "standard", actionId: "firearm_shot" },
    { actionType: "fullRound", actionId: "suppressing_fire" },
  ]);
  assert.equal(batch.ok, false);
  assert.equal(batch.failedActionId, "suppressing_fire");
  assert.deepEqual(remainingActions(batch.budget), { swift: 1, move: 1, standard: 1 });
});

test("合法的一批選擇會依序扣完，並留下每一項的紀錄", () => {
  const batch = spendBatch(
    createActionBudget(),
    [
      { actionType: "swift", actionId: "focus_aim", label: "集中火力" },
      { actionType: "move", actionId: "advance", label: "接近" },
      { actionType: "standard", actionId: "melee_strike", label: "近戰攻擊" },
    ],
    { round: 3 }
  );
  assert.equal(batch.ok, true);
  assert.deepEqual(remainingActions(batch.budget), { swift: 0, move: 0, standard: 0 });
  assert.deepEqual(batch.records.map((r) => r.actionId), ["focus_aim", "advance", "melee_strike"]);
});

// --- 5. 動作類型的常數契約 ---

test("整輪鎖住移動與標準，全回合鎖住三個（UI 的 locked 狀態來源）", () => {
  assert.deepEqual(poolsLockedBy("fullRound"), ["move", "standard"]);
  assert.deepEqual(poolsLockedBy("fullTurn"), ["swift", "move", "standard"]);
  assert.deepEqual(poolsLockedBy("standard"), [], "基礎動作不鎖任何東西");
});

test("整輪與全回合不是額外的資源池：publicBudget 只給三個基礎池", () => {
  const view = publicBudget(createActionBudget());
  assert.deepEqual(Object.keys(view.remaining).sort(), ["move", "standard", "swift"]);
  assert.equal(view.remaining.fullRound, undefined);
  assert.equal(view.remaining.fullTurn, undefined);
});

test("額外動作來源會出現在公開額度裡，讓 UI 有辦法顯示「你多了一個標準動作」", () => {
  const view = publicBudget(grantAction(createActionBudget(), "move", 2, "測試"));
  assert.equal(view.remaining.move, 3);
  assert.equal(view.granted.move, 2);
});
