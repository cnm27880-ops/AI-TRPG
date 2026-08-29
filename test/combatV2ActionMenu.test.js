// Combat V2 —— 動態行動選單的測試（規格第11.3節，7 條全部覆蓋）。
//
// 這一份的重點是「選單是不是誠實的」：它顯示可用的東西必須真的做得到，
// 它顯示不可用的東西必須附上玩家看得懂的原因，而且**任何情況下都不能洩漏秘密資料**。
import test from "node:test";
import assert from "node:assert/strict";
import { getAvailableCombatActions, groupActionsByType, projectRanges } from "../core/combat/v2/availableActions.js";
import { ACTION_CATALOG, getActionDefinition } from "../core/combat/v2/actionCatalog.js";
import { costOf, poolsLockedBy } from "../core/combat/v2/actionTypes.js";
import { spendAction } from "../core/combat/v2/actionBudget.js";
import { resolveTurn } from "../core/combat/v2/resolveTurn.js";
import { applyDamage } from "../core/health.js";
import { makeBattle, findAction } from "./helpers/combatV2Fixture.js";

test("11.3.1 action generator 只回傳目前角色能看到的 action，而且每一條都有完整 schema", () => {
  const menu = getAvailableCombatActions({ battle: makeBattle() });
  assert.ok(menu.length > 0);
  for (const action of menu) {
    assert.equal(typeof action.id, "string");
    assert.equal(typeof action.label, "string");
    assert.ok(["offense", "movement", "defense", "tactics", "environment", "item", "special"].includes(action.category));
    assert.ok(["swift", "move", "standard", "fullRound", "fullTurn"].includes(action.actionType));
    assert.deepEqual(action.cost, costOf(action.actionType), `${action.id} 的 cost 必須由 actionType 導出`);
    assert.equal(typeof action.display.description, "string");
    assert.equal(typeof action.available, "boolean");
    assert.equal(typeof action.resolutionKey, "string");
    if (!action.available) assert.equal(typeof action.unavailableReason, "string");
  }
});

test("選單順序是決定性的：同一份狀態連續問兩次得到同一份順序", () => {
  const battle = makeBattle();
  const a = getAvailableCombatActions({ battle }).map((x) => x.id);
  const b = getAvailableCombatActions({ battle }).map((x) => x.id);
  assert.deepEqual(a, b);
});

test("11.3.2 已消耗的動作不再被標示為可用", () => {
  const battle = makeBattle();
  battle.budgets.player = spendAction(battle.budgets.player, "standard").budget;
  const shot = findAction(getAvailableCombatActions({ battle }), "firearm_shot");
  assert.equal(shot.available, false);
  assert.match(shot.unavailableReason, /標準動作已使用/);

  // 迅捷行動仍然可用——標準動作用掉不代表整回合結束。
  assert.equal(findAction(getAvailableCombatActions({ battle }), "hunker_down").available, true);
});

test("11.3.3 不符合距離的 action 顯示公開原因（不是內部代碼）", () => {
  const menu = getAvailableCombatActions({ battle: makeBattle({ startRange: "far" }) });
  const melee = findAction(menu, "melee_strike");
  assert.equal(melee.available, false);
  assert.equal(melee.unavailableReason, "需要近距離（目前在遠距離）");
});

test("11.3.4 沒有武器或彈藥時，射擊不可用，而且兩者的原因不一樣", () => {
  // 有槍沒子彈
  const noAmmo = makeBattle();
  noAmmo.loadout = { ...noAmmo.loadout, ammo: { ...noAmmo.loadout.ammo, pistol: { loaded: 0, magazine: 7, spareMagazines: 0 } } };
  const shot = findAction(getAvailableCombatActions({ battle: noAmmo }), "firearm_shot");
  assert.equal(shot.available, false);
  assert.match(shot.unavailableReason, /彈藥不足/);

  // 完全沒有槍
  const noGun = makeBattle();
  noGun.loadout = { ...noGun.loadout, weapons: noGun.loadout.weapons.filter((w) => w.category !== "firearm"), ammo: {} };
  const noGunShot = findAction(getAvailableCombatActions({ battle: noGun }), "firearm_shot");
  assert.equal(noGunShot.available, false);
  assert.equal(noGunShot.unavailableReason, "需要一把可用槍械");
});

test("彈藥不足以支撐壓制射擊時，單發射擊仍然可用", () => {
  const battle = makeBattle();
  battle.loadout = { ...battle.loadout, ammo: { ...battle.loadout.ammo, pistol: { loaded: 1, magazine: 7, spareMagazines: 1 } } };
  const menu = getAvailableCombatActions({ battle });
  assert.equal(findAction(menu, "firearm_shot").available, true);
  const suppress = findAction(menu, "suppressing_fire");
  assert.equal(suppress.available, false);
  assert.match(suppress.unavailableReason, /需要 3 發/);
});

test("11.3.5 目標死亡後，針對該目標的 action 不可用", () => {
  const battle = makeBattle({ encounterId: "cargo_bay_crossfire" });
  const enemy = battle.participants.find((p) => p.id === "enemy_01");
  enemy.hpState = applyDamage(enemy.hpState, 99, "A");

  const menu = getAvailableCombatActions({ battle });
  // 倒下的敵人整個從目標清單消失，只剩下另一隻。
  assert.equal(menu.some((a) => a.targetId === "enemy_01"), false);
  assert.ok(menu.some((a) => a.targetId === "enemy_02"));
});

test("敵人全部倒下時，針對敵人的 action 仍然出現，但標示「沒有可攻擊的目標」", () => {
  const battle = makeBattle();
  const enemy = battle.participants.find((p) => p.id === "enemy_01");
  enemy.hpState = applyDamage(enemy.hpState, 99, "A");
  const shot = findAction(getAvailableCombatActions({ battle }), "firearm_shot");
  assert.equal(shot.available, false);
  assert.equal(shot.unavailableReason, "沒有可攻擊的目標");
});

test("11.3.6 fullRound／fullTurn 選擇會鎖定正確的低階動作", () => {
  const battle = makeBattle();
  // 整輪：鎖住 move 與 standard，swift 仍可用
  const afterFullRound = spendAction(battle.budgets.player, "fullRound").budget;
  const menuAfterFullRound = getAvailableCombatActions({ battle, budgetOverride: afterFullRound });
  assert.equal(findAction(menuAfterFullRound, "firearm_shot").available, false, "standard 已鎖");
  assert.equal(findAction(menuAfterFullRound, "advance").available, false, "move 已鎖");
  assert.equal(findAction(menuAfterFullRound, "hunker_down").available, true, "swift 仍可用");
  assert.deepEqual(poolsLockedBy("fullRound"), ["move", "standard"]);

  // 全回合：三個都鎖
  const afterFullTurn = spendAction(battle.budgets.player, "fullTurn").budget;
  const menuAfterFullTurn = getAvailableCombatActions({ battle, budgetOverride: afterFullTurn });
  assert.equal(menuAfterFullTurn.some((a) => a.available), false, "全回合之後不該還有任何可選行動");
});

test("11.3.7 action generator 不洩漏秘密 DC、AI 內部資料或敵人精確 HP", () => {
  const battle = makeBattle();
  const serialized = JSON.stringify(getAvailableCombatActions({ battle }));
  for (const forbidden of ["defenseDC", "\"dc\"", "ai\":", "ambush", "hpState", "seed", "rngCursor", "weight"]) {
    assert.equal(serialized.includes(forbidden), false, `選單不得含「${forbidden}」`);
  }
  // requirements 走白名單：只有玩家本來就知道的條件會出去。
  const shot = findAction(getAvailableCombatActions({ battle }), "firearm_shot");
  assert.deepEqual(Object.keys(shot.requirements).sort(), ["ammunition", "weaponCategory"]);
});

test("選單依動作類型分組，五類都在（分組也是伺服器算的）", () => {
  const groups = groupActionsByType(getAvailableCombatActions({ battle: makeBattle() }));
  for (const type of ["swift", "move", "standard", "fullRound", "fullTurn"]) {
    assert.ok(groups[type]?.length > 0, `${type} 應該至少有一個行動`);
  }
});

test("每一條目錄定義都有結算函式與公開說明（資料完整性）", () => {
  for (const entry of ACTION_CATALOG) {
    assert.ok(entry.display.description, `${entry.id} 缺少說明`);
    assert.ok(entry.resolutionKey.startsWith("resolve_"), `${entry.id} 的 resolutionKey 不合命名慣例`);
    assert.equal(getActionDefinition(entry.id), entry);
  }
  // 七個分類都要有實際條目，否則規格第6.1節的分類表只是紙上談兵。
  const categories = new Set(ACTION_CATALOG.map((e) => e.category));
  for (const category of ["offense", "movement", "defense", "tactics", "environment", "item"]) {
    assert.ok(categories.has(category), `分類 ${category} 沒有任何行動`);
  }
});

test("選了移動之後，選單用「移動後的距離」重算——不會讓玩家選到必定落空的組合", () => {
  const battle = makeBattle({ startRange: "medium" });
  const pending = [{ definitionId: "advance", targetId: "enemy_01" }];
  assert.deepEqual(projectRanges(battle, pending), { ranges: { enemy_01: "close" }, changed: true });

  const menu = getAvailableCombatActions({ battle, pending });
  const shot = findAction(menu, "firearm_shot");
  assert.equal(shot.available, false, "接近之後這一輪的射擊會在近距離發生");
  assert.match(shot.unavailableReason, /本回合選擇的移動/);
  assert.equal(findAction(menu, "melee_strike").available, true, "反過來近戰變成可用");
});

test("環境物件用過一次之後就標記為已使用", () => {
  const battle = makeBattle({ startRange: "close" });
  resolveTurn(battle, [{ actionId: "env_cut_lights", targetId: "control_panel" }]);
  const again = findAction(getAvailableCombatActions({ battle }), "env_cut_lights");
  assert.equal(again.available, false);
  assert.match(again.unavailableReason, /已經被使用過/);
});
