// [設計] 內建副本包註冊表 —— 目前只有一個內建範例，但先用註冊表的形狀寫，
// 之後要加第二個/第三個內建副本，或接上工坊審核後的使用者上傳副本，都只是往這個表多塞一筆，
// 不需要改 functions/api/session.js 或 turn.js 的邏輯。
//
// 每個副本包載入時就先跑一次 validateScenarioPack()：寧可讓部署當下就炸掉，
// 也不要讓一個結構壞掉的副本包留到玩家實際玩到那個節點才發現壞掉。

import { validateScenarioPack } from "./schema.js";
import { ECHO_INSTITUTE_SCENARIO } from "./examples/echoInstitute.js";
import { NOSTROMO_SCENARIO } from "./examples/alienNostromo.js";
import { NOSTROMO_SCENARIO_V2 } from "./examples/alienNostromo_v2.js";
import NOSTROMO_REFERENCE from "./examples/alienNostromo_v2_gm_reference.js";

// 舊版諾斯托羅莫號仍保留在註冊表，供舊存檔與明確指定的相容測試使用。
// 新建角色若沒有另外指定副本，現在一律進入 Alien V2；它才是目前正式測試中的主線版本。
const ALL_PACKS = [NOSTROMO_SCENARIO_V2, NOSTROMO_SCENARIO, ECHO_INSTITUTE_SCENARIO];

const SCENARIO_REFERENCES = Object.freeze({
  "reference.alien-nostromo-01-v2": NOSTROMO_REFERENCE,
});

export const SCENARIO_REGISTRY = {};
for (const pack of ALL_PACKS) {
  const check = validateScenarioPack(pack);
  if (!check.valid) {
    throw new Error(`內建副本包「${pack.id}」結構不合法：${check.errors.join("；")}`);
  }
  SCENARIO_REGISTRY[pack.id] = pack;
}

/** 沒有指定 scenarioId 時的新建預設副本 —— Alien V2《異形：生化深淵》。 */
export const DEFAULT_SCENARIO_ID = NOSTROMO_SCENARIO_V2.id;

/** @returns {object|null} */
export function getScenarioPack(id) {
  return SCENARIO_REGISTRY[id] ?? null;
}

/** 取得副本的 AI GM reference sidecar；沒有 reference 的舊副本回傳 null。 */
export function getScenarioReference(idOrPack) {
  const pack = typeof idOrPack === "string" ? getScenarioPack(idOrPack) : idOrPack;
  const referenceId = pack?.gmReferenceId;
  return referenceId ? SCENARIO_REFERENCES[referenceId] ?? null : null;
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
