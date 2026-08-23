import fs from "node:fs";
import assert from "node:assert/strict";
import { validateScenarioPack } from "./content/scenario/schema.js";
import { NOSTROMO_SCENARIO_V2 } from "./content/scenario/examples/alienNostromo_v2.js";
import { validateOptions } from "./content/turnOptions.js";

const reference = JSON.parse(
  fs.readFileSync("./content/scenario/examples/alienNostromo_v2_gm_reference.json", "utf8")
);

const packCheck = validateScenarioPack(NOSTROMO_SCENARIO_V2);
assert.equal(packCheck.valid, true, `scenario pack invalid: ${packCheck.errors.join("; ")}`);
assert.equal(NOSTROMO_SCENARIO_V2.entries.length, 1);
assert.equal(NOSTROMO_SCENARIO_V2.entries[0].timeLimitRounds, 50);
assert.deepEqual(NOSTROMO_SCENARIO_V2.speedReward, { pointsPerRemainingRound: 1, maxPoints: 50 });
assert.equal(NOSTROMO_SCENARIO_V2.entries[0].onExpireNodeId, "n-expire");

const chapter = NOSTROMO_SCENARIO_V2.entries[0];
const nodeIds = chapter.nodes.map((node) => node.id);
assert.equal(new Set(nodeIds).size, nodeIds.length, "duplicate node id");
assert.deepEqual(nodeIds, ["n1", "n2", "n3", "n4", "n-expire"]);
assert.equal(chapter.nodes.find((node) => node.id === "n4").isFinale, true);
assert.ok(chapter.nodes.find((node) => node.id === "n4").bossEncounter);

const openingChecked = validateOptions(chapter.openingOptions, {
  skills: { 偵察: 1, 體魄: 1, 交涉: 1, 潛行: 1 },
});
assert.equal(openingChecked.options.length, 4);
assert.equal(openingChecked.fallbackCount, 0, `opening fallback: ${openingChecked.warnings.join("; ")}`);
assert.equal(openingChecked.freeOptionCount, 1);
assert.equal(openingChecked.checkOptionCount, 3);

assert.equal(reference.directRuntimeLoad, false);
assert.equal(reference.sourcePackId, NOSTROMO_SCENARIO_V2.id);
assert.deepEqual(reference.authoringRules.allowedOutcomeTiers, [
  "大成功", "成功", "驚險成功", "些微失敗", "失敗", "慘烈失敗", "自動失敗", "大失敗(命定)"
]);

const knownItems = new Set(reference.items.map((item) => item.id));
const knownClues = new Set(reference.clues.map((clue) => clue.id));
const knownNpcs = new Set(reference.npcs.map((npc) => npc.id));
const knownLocations = new Set(reference.map.map((location) => location.id));
const knownSceneIds = new Set(reference.scenes.map((scene) => scene.id));
for (const id of reference.startingInventory ?? []) {
  if (!knownItems.has(id)) errors.push(`unknown starting inventory item ${id}`);
}
const knownFlags = new Set();
const knownStatuses = new Set([
  ...reference.stateSchema.npcStatus,
  ...reference.stateSchema.infectionStatus,
  ...reference.stateSchema.sampleStatus,
  ...reference.stateSchema.shipStatus,
  ...reference.stateSchema.airlockPhase,
  ...reference.stateSchema.injuryIds,
]);

const errors = [];
const resultIds = [];
function visitRequirements(required, where) {
  if (!required || typeof required !== "object") return;
  for (const id of required.items ?? []) if (!knownItems.has(id)) errors.push(`${where}: unknown required item ${id}`);
  for (const id of required.locations ?? []) if (!knownLocations.has(id)) errors.push(`${where}: unknown required location ${id}`);
  for (const id of Object.keys(required.npcStatuses ?? {})) if (!knownNpcs.has(id)) errors.push(`${where}: unknown required npc ${id}`);
  for (const id of required.flags ?? []) if (!id.startsWith("flag_")) errors.push(`${where}: malformed required flag ${id}`);
}

function visitEffects(effects, where) {
  if (!effects || typeof effects !== "object") return;
  for (const key of ["itemsAdd", "itemsRemove", "itemsDamage"]) {
    for (const id of effects[key] ?? []) if (!knownItems.has(id)) errors.push(`${where}: unknown item ${id}`);
  }
  for (const id of effects.cluesAdd ?? []) if (!knownClues.has(id)) errors.push(`${where}: unknown clue ${id}`);
  for (const id of effects.unlockEvents ?? []) if (!id.startsWith("evt_")) errors.push(`${where}: malformed event ${id}`);
  for (const id of effects.worldFlagsAdd ?? []) knownFlags.add(id);
  for (const id of effects.worldFlagsRemove ?? []) knownFlags.add(id);
  for (const [id, statuses] of Object.entries(effects.npcStatusChanges ?? {})) {
    if (!knownNpcs.has(id)) errors.push(`${where}: unknown npc ${id}`);
    if (!reference.stateSchema.npcStatus.includes(statuses)) errors.push(`${where}: unknown npc status ${statuses}`);
  }
  for (const [id, delta] of Object.entries(effects.npcTrustDelta ?? {})) {
    if (!knownNpcs.has(id)) errors.push(`${where}: unknown npc ${id}`);
    if (!Number.isFinite(Number(delta))) errors.push(`${where}: invalid npc trust delta ${id}=${delta}`);
  }
  for (const id of effects.injuriesAdd ?? []) if (!reference.stateSchema.injuryIds.includes(id)) errors.push(`${where}: unknown injury ${id}`);
  if (effects.playerLocation && !knownLocations.has(effects.playerLocation)) errors.push(`${where}: unknown location ${effects.playerLocation}`);
  if (effects.infectionStatus && !reference.stateSchema.infectionStatus.includes(effects.infectionStatus)) errors.push(`${where}: unknown infection status ${effects.infectionStatus}`);
  if (effects.sampleStatus && !reference.stateSchema.sampleStatus.includes(effects.sampleStatus)) errors.push(`${where}: unknown sample status ${effects.sampleStatus}`);
  if (effects.shipStatus && !reference.stateSchema.shipStatus.includes(effects.shipStatus)) errors.push(`${where}: unknown ship status ${effects.shipStatus}`);
  if (effects.airlockPhase && !reference.stateSchema.airlockPhase.includes(effects.airlockPhase)) errors.push(`${where}: unknown airlock phase ${effects.airlockPhase}`);
  if (effects.nextEvent && !knownSceneIds.has(effects.nextEvent)) errors.push(`${where}: unknown next event ${effects.nextEvent}`);
  if (effects.terminalOutcome && !reference.endings.some((ending) => ending.id === effects.terminalOutcome)) errors.push(`${where}: unknown ending ${effects.terminalOutcome}`);
}

for (const scene of reference.scenes) {
  if (!scene.id.startsWith("evt_")) errors.push(`scene id malformed: ${scene.id}`);
  if (scene.sceneExit?.canReturn !== false) errors.push(`${scene.id}: scene must be one-way (sceneExit.canReturn=false)`);
  for (const target of [scene.nextEvent, scene.sceneExit?.nextEvent, ...Object.values(scene.sceneExit?.nextByLocation ?? {})].filter(Boolean)) {
    if (!knownSceneIds.has(target)) errors.push(`${scene.id}: unknown scene transition target ${target}`);
  }
  for (const approach of scene.approaches ?? []) {
    if (!approach.id.startsWith("app_")) errors.push(`approach id malformed: ${scene.id}/${approach.id}`);
    if (approach.requiresCheck === false && (approach.attribute !== null || approach.skill !== null || approach.difficulty !== null)) {
      errors.push(`${scene.id}/${approach.id}: free action fields must be null`);
    }
    visitRequirements(approach.required, `${scene.id}/${approach.id}`);
    if (approach.requiresCheck === true) {
      if (!Object.hasOwn(reference.authoringRules.difficultyToDc, approach.difficulty)) errors.push(`${scene.id}/${approach.id}: bad difficulty`);
      if (!approach.attribute || approach.skill === undefined) errors.push(`${scene.id}/${approach.id}: incomplete check fields`);
    }
    for (const [tier, result] of Object.entries(approach.outcomes ?? {})) {
      resultIds.push(`${scene.id}.${approach.id}.${tier}`);
      visitEffects(result.effects, `${scene.id}/${approach.id}/${tier}`);
      for (const [index, conditional] of (result.conditionalEffects ?? []).entries()) {
        if (conditional.ifFlags) for (const id of conditional.ifFlags) if (!id.startsWith("flag_")) errors.push(`${scene.id}/${approach.id}/${tier}/conditional-${index}: malformed flag ${id}`);
        if (conditional.ifFlagsAbsent) for (const id of conditional.ifFlagsAbsent) if (!id.startsWith("flag_")) errors.push(`${scene.id}/${approach.id}/${tier}/conditional-${index}: malformed absent flag ${id}`);
        visitEffects(conditional.effects, `${scene.id}/${approach.id}/${tier}/conditional-${index}`);
      }
    }
  }
  for (const phase of scene.phases ?? []) {
    for (const approach of phase.approaches ?? []) {
      if (!approach.id.startsWith("app_")) errors.push(`approach id malformed: ${scene.id}/${approach.id}`);
      visitRequirements(approach.required, `${scene.id}/${approach.id}`);
      if (!Object.hasOwn(reference.authoringRules.difficultyToDc, approach.difficulty)) errors.push(`${scene.id}/${approach.id}: bad difficulty`);
      for (const [tier, result] of Object.entries(approach.outcomes ?? {})) {
        resultIds.push(`${scene.id}.${approach.id}.${tier}`);
        visitEffects(result.effects, `${scene.id}/${approach.id}/${tier}`);
        for (const [index, conditional] of (result.conditionalEffects ?? []).entries()) {
          if (conditional.ifFlags) for (const id of conditional.ifFlags) if (!id.startsWith("flag_")) errors.push(`${scene.id}/${approach.id}/${tier}/conditional-${index}: malformed flag ${id}`);
          if (conditional.ifFlagsAbsent) for (const id of conditional.ifFlagsAbsent) if (!id.startsWith("flag_")) errors.push(`${scene.id}/${approach.id}/${tier}/conditional-${index}: malformed absent flag ${id}`);
          visitEffects(conditional.effects, `${scene.id}/${approach.id}/${tier}/conditional-${index}`);
        }
      }
    }
  }
}

assert.equal(new Set(resultIds).size, resultIds.length, "duplicate result location");
assert.equal(errors.length, 0, errors.join("\n"));
assert.ok(resultIds.length >= 80, `too few reference results: ${resultIds.length}`);
assert.ok(reference.endings.length >= 8);
assert.equal(reference.scenes.find((scene) => scene.nodeId === "n4" && scene.id === "evt_narcissus_shadow_wake").sceneExit.completeNode, undefined);
assert.equal(reference.scenes.find((scene) => scene.nodeId === "n4" && scene.id === "evt_narcissus_final_purge").sceneExit.completeNode, undefined);
assert.equal(reference.scenes.find((scene) => scene.id === "evt_hypersleep_return").sceneExit.completeNode, undefined);
assert.equal(reference.scenes.find((scene) => scene.id === "evt_meet_ash").defaultTransition, "stay");
assert.ok(reference.scenes.find((scene) => scene.id === "evt_meet_ash").exitConditions?.length >= 1);
assert.equal((reference.scenes.flatMap((scene) => scene.approaches ?? []).flatMap((approach) => Object.values(approach.outcomes ?? [])).flatMap((result) => result.conditionalEffects ?? []).length), 2);
assert.ok(reference.endings.every((ending) => ending.worldDelta && ending.memorySeeds && ending.unresolvedThreads));

console.log(JSON.stringify({
  ok: true,
  packId: NOSTROMO_SCENARIO_V2.id,
  packErrors: packCheck.errors,
  nodes: nodeIds.length,
  scenes: reference.scenes.length,
  resultLocations: resultIds.length,
  endings: reference.endings.length,
  openingOptions: openingChecked.options.length,
  openingWarnings: openingChecked.warnings,
  registeredFlagsFound: knownFlags.size,
  referenceBytes: fs.statSync("./content/scenario/examples/alienNostromo_v2_gm_reference.json").size,
}));
