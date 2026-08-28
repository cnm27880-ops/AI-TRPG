// 《努布拉島：維修站撤離》V1 的副本專屬 validator。
// 報告格式依 docs/SCENARIO_VALIDATION_SPEC.md 第 3 節；CI 以 packErrors.length === 0 為必要條件。
//
//   node validate_jurassic_v1.mjs
//
// 這支腳本只讀資料，不啟動 runtime：它檢查的是「這份 reference 能不能被引擎安全載入」，
// 而不是「玩起來好不好玩」。後者由 test/jurassicParkV1.test.js 的流程測試負責。

import fs from "node:fs";
import assert from "node:assert/strict";
import { validateScenarioPack } from "./content/scenario/schema.js";
import { ISLA_NUBLAR_SCENARIO_V1 } from "./content/scenario/examples/jurassicPark_v1.js";
import runtimeReference from "./content/scenario/examples/jurassicPark_v1_gm_reference.js";
import { validateOptions } from "./content/turnOptions.js";

const REFERENCE_PATH = "./content/scenario/examples/jurassicPark_v1_gm_reference.json";
const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, "utf8"));

const packCheck = validateScenarioPack(ISLA_NUBLAR_SCENARIO_V1);
const errors = [];
const push = (message) => errors.push(message);

// --- 結構層：pack 與 sidecar 是否對得起來 -------------------------------------
assert.deepEqual(runtimeReference, reference, "Cloudflare sidecar 與 authoring JSON 不同步，請重新產生 .js");
if (reference.sourcePackId !== ISLA_NUBLAR_SCENARIO_V1.id) push("reference.sourcePackId 與 pack.id 不一致");
if (reference.directRuntimeLoad !== false) push("reference 不可標記為 directRuntimeLoad");

const chapter = ISLA_NUBLAR_SCENARIO_V1.entries[0];
const nodeIds = chapter.nodes.map((node) => node.id);
if (new Set(nodeIds).size !== nodeIds.length) push("pack 節點 id 重複");
if (!nodeIds.includes(chapter.onExpireNodeId)) push("onExpireNodeId 不存在於節點清單");

const openingChecked = validateOptions(chapter.openingOptions, {
  skills: { 技藝: 1, 偵察: 1, 潛行: 1, 交涉: 1 },
});
const openingWarnings = [...openingChecked.warnings];
if (openingChecked.fallbackCount > 0) push(`開場選項有 ${openingChecked.fallbackCount} 個被退回預設值`);

// --- ID 索引 ------------------------------------------------------------------
const knownItems = new Set(reference.items.map((item) => item.id));
const knownClues = new Set(reference.clues.map((clue) => clue.id));
const knownNpcs = new Set(reference.npcs.map((npc) => npc.id));
const knownLocations = new Set(reference.map.map((location) => location.id));
const knownScenes = new Set(reference.scenes.map((scene) => scene.id));
const knownEndings = new Set(reference.endings.map((ending) => ending.id));
const knownQuestions = new Set(reference.unresolvedQuestions.map((question) => question.id));
const packNodeIds = new Set(nodeIds);

for (const [label, ids] of [
  ["location", reference.map.map((x) => x.id)],
  ["route", reference.travelTransitions.map((x) => x.id)],
  ["scene", reference.scenes.map((x) => x.id)],
  ["npc", reference.npcs.map((x) => x.id)],
  ["item", reference.items.map((x) => x.id)],
  ["clue", reference.clues.map((x) => x.id)],
  ["question", reference.unresolvedQuestions.map((x) => x.id)],
  ["ending", reference.endings.map((x) => x.id)],
]) {
  if (new Set(ids).size !== ids.length) push(`${label} id 重複`);
}

for (const id of reference.startingInventory ?? []) {
  if (!knownItems.has(id)) push(`startingInventory 指向不存在的物品 ${id}`);
}
for (const id of reference.finaleNodeIds ?? []) {
  if (!packNodeIds.has(id)) push(`finaleNodeIds 指向不存在的節點 ${id}`);
}

// --- 地圖與路線 ---------------------------------------------------------------
for (const location of reference.map) {
  for (const target of location.connections ?? []) {
    if (!knownLocations.has(target)) push(`${location.id}: connections 指向不存在的地點 ${target}`);
    const back = reference.map.find((entry) => entry.id === target);
    if (back && !(back.connections ?? []).includes(location.id)) {
      push(`${location.id} ↔ ${target}: 地圖連線不是雙向`);
    }
  }
  if (!location.playerVisible?.firstArrival) push(`${location.id}: 缺少 playerVisible.firstArrival`);
  if (!location.playerVisible?.playerPurpose) push(`${location.id}: 缺少 playerVisible.playerPurpose`);
}

for (const route of reference.travelTransitions) {
  if (!knownLocations.has(route.from)) push(`${route.id}: from 不存在 ${route.from}`);
  if (!knownLocations.has(route.to)) push(`${route.id}: to 不存在 ${route.to}`);
  const from = reference.map.find((entry) => entry.id === route.from);
  if (from && !(from.connections ?? []).includes(route.to)) push(`${route.id}: 與地圖 connections 不一致`);
  if (!knownScenes.has(route.entryEventId)) push(`${route.id}: entryEventId 不存在 ${route.entryEventId}`);
  for (const flag of [...(route.required?.flags ?? []), ...(route.required?.flagsAbsent ?? [])]) {
    if (!flag.startsWith("flag_")) push(`${route.id}: 旗標命名不合法 ${flag}`);
  }
  for (const id of route.effects?.cluesAdd ?? []) {
    if (!knownClues.has(id)) push(`${route.id}: 指向不存在的線索 ${id}`);
  }
}

// --- 事件、進路與結果 ---------------------------------------------------------
const knownFlags = new Set();
const resultIds = [];
const effectConflicts = [];
const invalidCanonicalIds = [];
const allowedTiers = new Set(reference.authoringRules.allowedOutcomeTiers);
const axisSchemas = {
  infectionStatus: reference.stateSchema.infectionStatus,
  sampleStatus: reference.stateSchema.sampleStatus,
  shipStatus: reference.stateSchema.shipStatus,
  airlockPhase: reference.stateSchema.airlockPhase,
};

function visitRequirements(required, where) {
  if (!required || typeof required !== "object") return;
  for (const id of required.items ?? []) if (!knownItems.has(id)) push(`${where}: 前置物品不存在 ${id}`);
  for (const id of required.locations ?? []) if (!knownLocations.has(id)) push(`${where}: 前置地點不存在 ${id}`);
  for (const id of Object.keys(required.npcStatuses ?? {})) if (!knownNpcs.has(id)) push(`${where}: 前置 NPC 不存在 ${id}`);
  for (const flag of [...(required.flags ?? []), ...(required.flagsAbsent ?? [])]) {
    if (!flag.startsWith("flag_")) push(`${where}: 旗標命名不合法 ${flag}`);
    knownFlags.add(flag);
  }
}

function visitEffects(effects, where) {
  if (!effects || typeof effects !== "object") return;
  for (const key of ["itemsAdd", "itemsRemove", "itemsDamage"]) {
    for (const id of effects[key] ?? []) if (!knownItems.has(id)) invalidCanonicalIds.push(`${where}: ${key} ${id}`);
  }
  for (const id of effects.cluesAdd ?? []) if (!knownClues.has(id)) invalidCanonicalIds.push(`${where}: cluesAdd ${id}`);
  for (const flag of [...(effects.worldFlagsAdd ?? []), ...(effects.worldFlagsRemove ?? [])]) {
    if (!flag.startsWith("flag_")) push(`${where}: 旗標命名不合法 ${flag}`);
    knownFlags.add(flag);
  }
  for (const [id, status] of Object.entries(effects.npcStatusChanges ?? {})) {
    if (!knownNpcs.has(id)) invalidCanonicalIds.push(`${where}: npcStatusChanges ${id}`);
    if (!reference.stateSchema.npcStatus.includes(status)) push(`${where}: 未定義的 NPC 狀態 ${status}`);
  }
  for (const [id, delta] of Object.entries(effects.npcTrustDelta ?? {})) {
    if (!knownNpcs.has(id)) invalidCanonicalIds.push(`${where}: npcTrustDelta ${id}`);
    if (!Number.isFinite(Number(delta))) push(`${where}: 信任變化不是數字 ${id}=${delta}`);
  }
  for (const id of effects.injuriesAdd ?? []) {
    if (!reference.stateSchema.injuryIds.includes(id)) push(`${where}: 未定義的傷勢 ${id}`);
  }
  for (const [key, values] of Object.entries(axisSchemas)) {
    if (effects[key] && !values.includes(effects[key])) push(`${where}: ${key} 不在 stateSchema 內 (${effects[key]})`);
  }
  if (effects.playerLocation && !knownLocations.has(effects.playerLocation)) {
    invalidCanonicalIds.push(`${where}: playerLocation ${effects.playerLocation}`);
  }
  if (effects.nextEvent && !knownScenes.has(effects.nextEvent)) invalidCanonicalIds.push(`${where}: nextEvent ${effects.nextEvent}`);
  if (effects.terminalOutcome && !knownEndings.has(effects.terminalOutcome)) {
    invalidCanonicalIds.push(`${where}: terminalOutcome ${effects.terminalOutcome}`);
  }
  if (effects.timeCost != null && !(Number.isInteger(effects.timeCost) && effects.timeCost >= 0)) {
    push(`${where}: timeCost 必須是非負整數`);
  }
}

for (const scene of reference.scenes) {
  if (!scene.id.startsWith("evt_")) push(`事件 id 命名不合法：${scene.id}`);
  if (!packNodeIds.has(scene.nodeId)) push(`${scene.id}: nodeId 不存在於 pack (${scene.nodeId})`);
  if (!knownLocations.has(scene.location)) push(`${scene.id}: location 不存在 (${scene.location})`);
  if (!scene.entryNarration) push(`${scene.id}: 缺少 entryNarration`);
  for (const target of [
    scene.nextEvent,
    scene.sceneExit?.nextEvent,
    ...Object.values(scene.sceneExit?.nextByLocation ?? {}),
  ].filter(Boolean)) {
    if (!knownScenes.has(target)) push(`${scene.id}: 場景轉場指向不存在的事件 ${target}`);
  }
  for (const approach of scene.approaches ?? []) {
    if (!approach.id.startsWith("app_")) push(`進路 id 命名不合法：${scene.id}/${approach.id}`);
    const where = `${scene.id}/${approach.id}`;
    visitRequirements(approach.required, where);
    if (approach.requiresCheck === false) {
      if (approach.attribute !== null || approach.skill !== null || approach.difficulty !== null) {
        push(`${where}: 自由行動的檢定欄位必須是 null`);
      }
    } else {
      if (!Object.hasOwn(reference.authoringRules.difficultyToDc, approach.difficulty)) push(`${where}: 難度不合法 ${approach.difficulty}`);
      if (!approach.attribute || !approach.skill) push(`${where}: 檢定欄位不完整`);
    }
    const tiers = Object.keys(approach.outcomes ?? {});
    if (!tiers.length) push(`${where}: 沒有任何結果階層`);
    for (const tier of tiers) {
      if (!allowedTiers.has(tier)) push(`${where}: 非正式結果階層 ${tier}`);
      const result = approach.outcomes[tier];
      resultIds.push(`${scene.id}.${approach.id}.${tier}`);
      if (!String(result.text ?? "").trim()) push(`${where}/${tier}: 缺少結果文字`);
      visitEffects(result.effects, `${where}/${tier}`);
      // 失敗必須改變局面：旗標、傷勢、位置或威脅至少要動一項。
      if (["些微失敗", "失敗", "慘烈失敗", "大失敗(命定)"].includes(tier)) {
        const effects = result.effects ?? {};
        const changed =
          (effects.worldFlagsAdd ?? []).length ||
          (effects.injuriesAdd ?? []).length ||
          (effects.itemsDamage ?? []).length ||
          effects.playerLocation ||
          Number(effects.threatDelta ?? 0) !== 0 ||
          Number(effects.timeCost ?? 0) > 0;
        if (!changed) effectConflicts.push(`${where}/${tier}: 失敗沒有造成任何局勢改變`);
      }
    }
  }
}

// --- 線索、問題與結局 ---------------------------------------------------------
const questionMappingWarnings = [];
const cluesFromEffects = new Set();
for (const scene of reference.scenes) {
  for (const approach of scene.approaches ?? []) {
    for (const result of Object.values(approach.outcomes ?? {})) {
      for (const id of result.effects?.cluesAdd ?? []) cluesFromEffects.add(id);
    }
  }
}
for (const route of reference.travelTransitions) {
  for (const id of route.effects?.cluesAdd ?? []) cluesFromEffects.add(id);
}
const unmappedNarrativeIds = [];
for (const clue of reference.clues) {
  if (!cluesFromEffects.has(clue.id)) unmappedNarrativeIds.push(`clue ${clue.id} 沒有任何 canonical cluesAdd 來源`);
  if (!clue.reveals) push(`clue ${clue.id}: 缺少 reveals 發現文字`);
  for (const binding of clue.sourceBindings ?? []) {
    if (!knownScenes.has(binding.sceneId)) push(`clue ${clue.id}: sourceBindings 指向不存在的事件 ${binding.sceneId}`);
  }
  for (const id of clue.questionUpdates ?? []) {
    if (!knownQuestions.has(id)) questionMappingWarnings.push(`clue ${clue.id}: questionUpdates 指向不存在的問題 ${id}`);
  }
}
for (const question of reference.unresolvedQuestions) {
  for (const id of question.evidenceClues ?? []) {
    if (!knownClues.has(id)) questionMappingWarnings.push(`${question.id}: evidenceClues 指向不存在的線索 ${id}`);
  }
  for (const id of [...(question.openWhen?.allClues ?? []), ...(question.answerWhen?.allClues ?? [])]) {
    if (!knownClues.has(id)) questionMappingWarnings.push(`${question.id}: 條件指向不存在的線索 ${id}`);
  }
  if (!question.answer) questionMappingWarnings.push(`${question.id}: 沒有 answer，永遠不會被標成 answered`);
}

for (const rule of reference.endingRules ?? []) {
  if (!knownEndings.has(rule.endingId)) push(`endingRules 指向不存在的結局 ${rule.endingId}`);
}
const rulesCovered = new Set((reference.endingRules ?? []).map((rule) => rule.endingId));
for (const ending of reference.endings) {
  if (!rulesCovered.has(ending.id)) push(`結局 ${ending.id} 沒有任何 endingRules 可以推導出來`);
  if (!ending.text) push(`結局 ${ending.id} 缺少文字`);
  if (!ending.worldDelta || !ending.memorySeeds || !ending.unresolvedThreads) {
    push(`結局 ${ending.id} 缺少跨副本世界狀態欄位`);
  }
  for (const delta of ending.npcDeltas ?? []) {
    if (!knownNpcs.has(delta.npcId)) push(`結局 ${ending.id}: npcDeltas 指向不存在的 NPC ${delta.npcId}`);
  }
}

// --- 公開資訊安全層 -----------------------------------------------------------
const publicLeakWarnings = [];
const secretPhrases = [];
for (const npc of reference.npcs) {
  for (const secret of npc.knowledge?.secret ?? []) secretPhrases.push({ npcId: npc.id, secret });
  if (!npc.knowledge?.observed || !npc.knowledge?.secret) push(`NPC ${npc.id}: 知識沒有分層`);
  for (const stage of npc.exposureStages ?? []) {
    if (stage.stage !== "surface" && !(stage.requiredFlags ?? []).length) {
      publicLeakWarnings.push(`NPC ${npc.id} 的 ${stage.stage} 階層沒有旗標門檻`);
    }
  }
}
// 玩家可見文字（地點、事件進入、結果、線索）不得直接複述 NPC 的秘密。
const publicText = [
  ...reference.map.flatMap((location) => Object.values(location.playerVisible ?? {}).flat().filter((v) => typeof v === "string")),
  ...reference.scenes.map((scene) => scene.entryNarration),
  ...reference.scenes.flatMap((scene) =>
    (scene.approaches ?? []).flatMap((approach) => Object.values(approach.outcomes ?? {}).map((result) => result.text))
  ),
  ...reference.clues.map((clue) => clue.reveals),
].filter(Boolean).join("\n");
for (const { npcId, secret } of secretPhrases) {
  if (publicText.includes(secret)) publicLeakWarnings.push(`NPC ${npcId} 的秘密原文出現在玩家可見文字裡`);
}
for (const scene of reference.scenes) {
  for (const truth of scene.gmTruth ?? []) {
    if (String(scene.entryNarration ?? "").includes(truth)) publicLeakWarnings.push(`${scene.id}: gmTruth 原文出現在 entryNarration`);
  }
}

// --- 覆蓋率 -------------------------------------------------------------------
const coverageWarnings = [];
const reachableScenes = new Set([reference.scenes[0].id]);
for (const route of reference.travelTransitions) reachableScenes.add(route.entryEventId);
for (const scene of reference.scenes) {
  for (const approach of scene.approaches ?? []) {
    for (const result of Object.values(approach.outcomes ?? {})) {
      if (result.effects?.nextEvent) reachableScenes.add(result.effects.nextEvent);
    }
  }
  if (scene.sceneExit?.nextEvent) reachableScenes.add(scene.sceneExit.nextEvent);
  for (const target of Object.values(scene.sceneExit?.nextByLocation ?? {})) reachableScenes.add(target);
}
for (const scene of reference.scenes) {
  if (!reachableScenes.has(scene.id) && !scene.unlockOnly) coverageWarnings.push(`事件 ${scene.id} 沒有任何可抵達路徑`);
}
for (const location of reference.map) {
  const arrivals = reference.travelTransitions.filter((route) => route.to === location.id);
  if (!arrivals.length && location.id !== reference.scenes[0].location) {
    coverageWarnings.push(`地點 ${location.id} 沒有任何可抵達的 route`);
  }
}

const report = {
  packId: ISLA_NUBLAR_SCENARIO_V1.id,
  canonicalVersion: reference.canonicalVersion,
  narrativeVersion: reference.narrativeVersion,
  packErrors: [...packCheck.errors, ...errors],
  locations: reference.map.length,
  routes: reference.travelTransitions.length,
  chapters: ISLA_NUBLAR_SCENARIO_V1.entries.length,
  nodes: nodeIds.length,
  scenes: reference.scenes.length,
  resultLocations: resultIds.length,
  npcs: reference.npcs.length,
  items: reference.items.length,
  clues: reference.clues.length,
  questions: reference.unresolvedQuestions.length,
  endings: reference.endings.length,
  openingWarnings,
  publicLeakWarnings,
  unmappedNarrativeIds,
  invalidCanonicalIds,
  effectConflicts,
  questionMappingWarnings,
  coverageWarnings,
  registeredFlags: knownFlags.size,
  referenceBytes: fs.statSync(REFERENCE_PATH).size,
};

console.log(JSON.stringify(report, null, 2));

assert.equal(new Set(resultIds).size, resultIds.length, "result 位置重複");
assert.equal(report.packErrors.length, 0, report.packErrors.join("\n"));
assert.equal(report.invalidCanonicalIds.length, 0, report.invalidCanonicalIds.join("\n"));
assert.equal(report.effectConflicts.length, 0, report.effectConflicts.join("\n"));
assert.equal(report.publicLeakWarnings.length, 0, report.publicLeakWarnings.join("\n"));
assert.equal(report.unmappedNarrativeIds.length, 0, report.unmappedNarrativeIds.join("\n"));
assert.equal(report.questionMappingWarnings.length, 0, report.questionMappingWarnings.join("\n"));
assert.equal(report.coverageWarnings.length, 0, report.coverageWarnings.join("\n"));
