// [設計] 內建副本包註冊表 —— 目前只有一個內建範例，但先用註冊表的形狀寫，
// 之後要加第二個/第三個內建副本，或接上工坊審核後的使用者上傳副本，都只是往這個表多塞一筆，
// 不需要改 functions/api/session.js 或 turn.js 的邏輯。
//
// 每個副本包載入時就先跑一次 validateScenarioPack()：寧可讓部署當下就炸掉，
// 也不要讓一個結構壞掉的副本包留到玩家實際玩到那個節點才發現壞掉。

import { validateScenarioPack } from "./schema.js";
import { ECHO_INSTITUTE_SCENARIO } from "./examples/echoInstitute.js";
import { NOSTROMO_SCENARIO } from "./examples/alienNostromo.js";

// 排在最前面的是新手副本(諾斯托羅莫號)：它是 DEFAULT_SCENARIO_ID，也就是玩家建完卡
// 沒有特別選副本時直接進去的那一個。它比 echoInstitute 多了固定開頭與迫近度設定，
// 教學意圖最完整，所以放第一個。
const ALL_PACKS = [NOSTROMO_SCENARIO, ECHO_INSTITUTE_SCENARIO];

export const SCENARIO_REGISTRY = {};
for (const pack of ALL_PACKS) {
  const check = validateScenarioPack(pack);
  if (!check.valid) {
    throw new Error(`內建副本包「${pack.id}」結構不合法：${check.errors.join("；")}`);
  }
  SCENARIO_REGISTRY[pack.id] = pack;
}

/** 沒有指定 scenarioId 時的預設副本 —— 新手副本《異形》諾斯托羅莫號。 */
export const DEFAULT_SCENARIO_ID = NOSTROMO_SCENARIO.id;

/** @returns {object|null} */
export function getScenarioPack(id) {
  return SCENARIO_REGISTRY[id] ?? null;
}

/** 列出所有可選副本的精簡資訊，給前端「選擇副本」畫面用，不含完整節點圖(節點圖是敘事雷)。 */
export function listScenarios() {
  return Object.values(SCENARIO_REGISTRY).map((pack) => ({
    id: pack.id,
    difficulty: pack.difficulty ?? null,
    chapterCount: pack.entries.length,
    nodeCount: pack.entries.reduce((sum, ch) => sum + (ch.nodes?.length ?? 0), 0),
    title: pack.entries[0]?.name ?? pack.id,
  }));
}
