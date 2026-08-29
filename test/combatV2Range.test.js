// Combat V2 —— 距離系統與回合狀態的測試（規格第11.2節，8 條全部覆蓋）。
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMBAT_RANGES,
  canChangeRange,
  isValidRange,
  rangeBlockReason,
  rangeKey,
  stepRange,
  stepsBetween,
} from "../core/combat/v2/range.js";
import { getRange, primaryRange, beginNextRound } from "../core/combat/v2/battleState.js";
import { getAvailableCombatActions } from "../core/combat/v2/availableActions.js";
import { resolveTurn, validateSelection, TurnValidationError } from "../core/combat/v2/resolveTurn.js";
import { makeBattle, findAction, playerCharacter } from "./helpers/combatV2Fixture.js";

test("11.2.1 close、medium、far 三段距離合法，其他一律不合法", () => {
  assert.deepEqual(COMBAT_RANGES, ["close", "medium", "far"]);
  for (const range of COMBAT_RANGES) assert.equal(isValidRange(range), true);
  assert.equal(isValidRange("point_blank"), false);
  assert.equal(isValidRange(""), false);
  assert.equal(isValidRange(undefined), false);
});

test("11.2.2 普通移動不能跨越兩格距離", () => {
  assert.equal(stepsBetween("close", "far"), 2);
  assert.equal(canChangeRange("close", "far").ok, false);
  assert.match(canChangeRange("close", "far").reason, /一次移動只能改變一格/);
  assert.equal(canChangeRange("close", "medium").ok, true);
  // 能力明確允許時才可以跨格（規格第4節第2點的例外）。
  assert.equal(canChangeRange("close", "far", { maxSteps: 2 }).ok, true);
});

test("stepRange 走到底就停在底，不會走出三段之外", () => {
  assert.equal(stepRange("close", "closer"), "close");
  assert.equal(stepRange("far", "away"), "far");
  assert.equal(stepRange("far", "closer", 2), "close");
});

test("距離是對稱的：rangeKey(a,b) 與 rangeKey(b,a) 是同一格", () => {
  assert.equal(rangeKey("player", "enemy_01"), rangeKey("enemy_01", "player"));
});

test("11.2.3 近戰只能在 close 使用", () => {
  const battle = makeBattle();            // 開場在 medium
  const menu = getAvailableCombatActions({ battle });
  const melee = findAction(menu, "melee_strike");
  assert.equal(melee.available, false);
  assert.match(melee.unavailableReason, /需要近距離/);
  assert.deepEqual(melee.validRanges, ["close"]);
});

test("11.2.4 中遠程攻擊只能在允許距離使用", () => {
  const battle = makeBattle({ startRange: "close" });
  const shot = findAction(getAvailableCombatActions({ battle }), "firearm_shot");
  assert.equal(shot.available, false);
  assert.match(shot.unavailableReason, /需要中距離或遠距離/);

  const atMedium = makeBattle({ startRange: "medium" });
  assert.equal(findAction(getAvailableCombatActions({ battle: atMedium }), "firearm_shot").available, true);
});

test("11.2.5 距離不符時 server 拒絕請求，即使前端硬送", () => {
  const battle = makeBattle({ startRange: "medium" });
  assert.throws(
    () => validateSelection(battle, [{ actionId: "melee_strike", targetId: "enemy_01" }]),
    (err) => err instanceof TurnValidationError && /需要近距離/.test(err.message)
  );
});

test("11.2.6 環境條件可以限制某個 action（控制面板只能在近距離操作）", () => {
  const atMedium = findAction(getAvailableCombatActions({ battle: makeBattle({ startRange: "medium" }) }), "env_cut_lights");
  assert.equal(atMedium.available, false);
  assert.match(atMedium.unavailableReason, /控制面板/);

  const atClose = findAction(getAvailableCombatActions({ battle: makeBattle({ startRange: "close" }) }), "env_cut_lights");
  assert.equal(atClose.available, true);
});

test("11.2.7 敵方移動後會重新計算距離", () => {
  // 近戰型敵人在 far 時會逼近。玩家做一件不影響距離的事，敵人就該往前一格。
  const battle = makeBattle({ startRange: "far" });
  resolveTurn(battle, [{ actionId: "hunker_down" }]);
  assert.equal(getRange(battle, "player", "enemy_01"), "medium", "敵人應該逼近一格");
  assert.equal(primaryRange(battle), "medium");
});

test("敵人一輪只走一格：移動動作用完就沒有第二次", () => {
  const battle = makeBattle({ startRange: "far" });
  resolveTurn(battle, [{ actionId: "hunker_down" }]);
  assert.equal(getRange(battle, "player", "enemy_01"), "medium");
  assert.notEqual(getRange(battle, "player", "enemy_01"), "close", "不得一輪跨兩格");
});

test("11.2.8 距離變更會進入公開紀錄，而且是玩家看得懂的文字", () => {
  const battle = makeBattle({ startRange: "medium" });
  resolveTurn(battle, [{ actionId: "advance", targetId: "enemy_01" }]);
  const moveLines = battle.publicLog.filter((entry) => entry.kind === "action" || entry.kind === "move");
  assert.ok(moveLines.some((line) => /中距離接近到近距離/.test(line.text)), JSON.stringify(moveLines));
  // 公開紀錄不得含任何內部數值。
  assert.ok(!JSON.stringify(battle.publicLog).match(/DC|骰|seed|dp/i));
});

test("移動會離開掩體：躲在貨櫃後面不能滿場跑", () => {
  const battle = makeBattle({ startRange: "medium" });
  resolveTurn(battle, [{ actionId: "take_cover", targetId: "container_stack" }]);
  const player = battle.participants.find((p) => p.id === "player");
  assert.ok(player.statuses.some((s) => s.id === "cover"), "先取得掩體");
  // 第一輪結算後敵人已經逼近，所以這裡用「拉開距離」——重點是**任何移動**都會離開掩體。
  resolveTurn(battle, [{ actionId: "withdraw", targetId: "enemy_01" }]);
  assert.equal(player.statuses.some((s) => s.id === "cover"), false, "移動之後掩體消失");
  assert.equal(player.coverFeatureId, null);
});

test("回合狀態機：結算後進入下一輪並重置額度，狀態版本遞增", () => {
  const battle = makeBattle();
  const before = battle.stateVersion;
  resolveTurn(battle, [{ actionId: "hunker_down" }]);
  assert.equal(battle.round, 2);
  assert.equal(battle.phase, "player_selection");
  assert.deepEqual(battle.budgets.player.pools, { swift: 1, move: 1, standard: 1 });
  assert.ok(battle.stateVersion > before);
});

test("beginNextRound 會清掉只持續本輪的狀態", () => {
  const battle = makeBattle();
  resolveTurn(battle, [{ actionId: "hunker_down" }]);   // 內含 beginNextRound
  const player = battle.participants.find((p) => p.id === "player");
  assert.equal(player.statuses.some((s) => s.id === "hunkered"), false, "低身形只持續本輪");
});

test("rangeBlockReason 回的是人話，不是內部代碼", () => {
  assert.equal(rangeBlockReason(["close"], "far"), "需要近距離（目前在遠距離）");
  assert.equal(rangeBlockReason([], "far"), null, "沒有距離限制的行動不受限");
  assert.equal(rangeBlockReason(["far"], "far"), null);
});
