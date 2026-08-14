// [規則書] 行動經濟測試——出處見 core/combat/actionEconomy.js 頭部註解。
import test from "node:test";
import assert from "node:assert/strict";
import {
  createActionBudget,
  useStandard,
  useMove,
  useSwift,
  useFullRound,
  useFullTurn,
  useFree,
  useReflex,
  startFocus,
  stopFocus,
} from "../core/combat/actionEconomy.js";

test("createActionBudget：一輪預設可以用1個標準+1個移動+1個迅捷+1個反射", () => {
  const budget = createActionBudget();
  assert.equal(budget.standardAvailable, true);
  assert.equal(budget.moveAvailable, true);
  assert.equal(budget.swiftAvailable, true);
  assert.equal(budget.reflexAvailable, true);
});

test("useStandard：用過一次之後不能再用第二次", () => {
  let budget = createActionBudget();
  budget = useStandard(budget);
  assert.equal(budget.standardAvailable, false);
  assert.throws(() => useStandard(budget));
});

test("useMove：標準動作可以轉化為移動動作(降級)，此時不影響原本的移動額度", () => {
  let budget = createActionBudget();
  budget = useMove(budget, { fromStandard: true });
  assert.equal(budget.standardAvailable, false);
  assert.equal(budget.moveAvailable, true); // 原本的移動額度還在，代表這回合可以移動兩次
});

test("useSwift：移動動作可以轉化為迅捷動作，標準動作也可以連續轉化到迅捷", () => {
  let budget = createActionBudget();
  budget = useSwift(budget, { from: "move" });
  assert.equal(budget.moveAvailable, false);
  assert.equal(budget.swiftAvailable, true); // 原本的迅捷額度沒被動到

  let budget2 = createActionBudget();
  budget2 = useSwift(budget2, { from: "standard" });
  assert.equal(budget2.standardAvailable, false);
  assert.equal(budget2.moveAvailable, true);
  assert.equal(budget2.swiftAvailable, true);
});

test("useMove：反向轉化(迅捷轉移動)不允許，規則書明講「反之不行」", () => {
  // 這裡沒有提供「迅捷轉移動」的API，因為規則書明確禁止，呼叫端根本沒有這個選項可用
  let budget = createActionBudget();
  budget = useSwift(budget);
  assert.equal(budget.moveAvailable, true); // 用掉迅捷不影響移動額度，兩者是單向轉化關係
});

test("useFullRound：需要標準與移動都還沒用過，用完後兩者都失去", () => {
  let budget = createActionBudget();
  budget = useFullRound(budget);
  assert.equal(budget.standardAvailable, false);
  assert.equal(budget.moveAvailable, false);
  assert.equal(budget.swiftAvailable, true); // 迅捷不受影響
});

test("useFullRound：標準或移動任一已經用掉時不能再用整輪動作", () => {
  let budget = createActionBudget();
  budget = useStandard(budget);
  assert.throws(() => useFullRound(budget));
});

test("useFullTurn：需要標準/移動/迅捷都還沒用過，用完後三者全部失去", () => {
  let budget = createActionBudget();
  budget = useFullTurn(budget);
  assert.equal(budget.standardAvailable, false);
  assert.equal(budget.moveAvailable, false);
  assert.equal(budget.swiftAvailable, false);
});

test("useFree：同一個行為(actionKey)每回合只能用一次自由動作", () => {
  let budget = createActionBudget();
  budget = useFree(budget, "丟下武器");
  assert.throws(() => useFree(budget, "丟下武器"));
});

test("useFree：不同行為的自由動作可以各自使用，且不限次數(除非設定maxPerTurn)", () => {
  let budget = createActionBudget();
  budget = useFree(budget, "說話");
  budget = useFree(budget, "拉槍栓");
  assert.equal(budget.usedFreeActionKeys.length, 2);
});

test("useFree：ST可以限制每回合自由動作的總數上限", () => {
  let budget = createActionBudget();
  budget = useFree(budget, "a", { maxPerTurn: 1 });
  assert.throws(() => useFree(budget, "b", { maxPerTurn: 1 }));
});

test("useReflex：用過之後標記swiftLostFromReflex，供下一輪扣掉迅捷動作", () => {
  let budget = createActionBudget();
  budget = useReflex(budget);
  assert.equal(budget.reflexAvailable, false);
  assert.equal(budget.swiftLostFromReflex, true);

  const nextRoundBudget = createActionBudget({ swiftLostFromReflex: budget.swiftLostFromReflex });
  assert.equal(nextRoundBudget.swiftAvailable, false);
});

test("startFocus/stopFocus：一次只能維持一個專注效果", () => {
  let budget = createActionBudget();
  budget = startFocus(budget, "幻視瞳觀察");
  assert.throws(() => startFocus(budget, "另一個專注效果"));
  budget = stopFocus(budget);
  budget = startFocus(budget, "另一個專注效果");
  assert.equal(budget.focusMaintained, "另一個專注效果");
});
