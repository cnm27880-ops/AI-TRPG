// [規則書] 先攻/行動順序測試——出處見 core/combat/turnOrder.js 頭部註解。
import test from "node:test";
import assert from "node:assert/strict";
import { determineTurnOrder } from "../core/combat/turnOrder.js";

test("determineTurnOrder：先攻權高的先動(📖對照書中範例：蘇子20>時月19>字母15>影牙巨龍14>白夜6)", () => {
  const combatants = [
    { id: "影牙巨龍", initiative: 14 },
    { id: "字母", initiative: 15 },
    { id: "蘇子", initiative: 20 },
    { id: "白夜", initiative: 6 },
    { id: "時月", initiative: 19 },
  ];
  const { order } = determineTurnOrder(combatants);
  assert.deepEqual(order, ["蘇子", "時月", "字母", "影牙巨龍", "白夜"]);
});

test("determineTurnOrder：突襲輪發起者必定第一個行動，無視先攻結果高低", () => {
  const combatants = [
    { id: "A", initiative: 25 },
    { id: "發起者", initiative: 1, isAmbushInitiator: true },
  ];
  const { order } = determineTurnOrder(combatants);
  assert.equal(order[0], "發起者");
});

test("determineTurnOrder：先攻同分時，沉著較高者先動", () => {
  const combatants = [
    { id: "A", initiative: 10, composure: 3 },
    { id: "B", initiative: 10, composure: 5 },
  ];
  const { order } = determineTurnOrder(combatants);
  assert.deepEqual(order, ["B", "A"]);
});

test("determineTurnOrder：先攻與沉著都同分時，敏捷較高者先動", () => {
  const combatants = [
    { id: "A", initiative: 10, composure: 3, agility: 4 },
    { id: "B", initiative: 10, composure: 3, agility: 6 },
  ];
  const { order } = determineTurnOrder(combatants);
  assert.deepEqual(order, ["B", "A"]);
});

test("determineTurnOrder：先攻/沉著/敏捷全部同分時，回報需要額外決定順序，不擅自擲骰決定", () => {
  const combatants = [
    { id: "A", initiative: 10, composure: 3, agility: 4 },
    { id: "B", initiative: 10, composure: 3, agility: 4 },
  ];
  const { needsManualTieBreak } = determineTurnOrder(combatants);
  assert.equal(needsManualTieBreak.length, 1);
});
