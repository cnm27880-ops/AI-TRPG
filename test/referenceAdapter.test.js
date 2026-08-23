import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { createThreatTrack } from "../content/scenario/threat.js";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import {
  createReferenceState,
  normalizeReferenceState,
  buildReferenceOptions,
  resolveReferenceAction,
  applyReferenceResult,
  applyReferenceCharacterEffects,
  narrativeModeForScene,
  validateThreatAssessment,
  referenceStateForResponse,
} from "../content/scenario/referenceAdapter.js";

test("reference adapter builds opening approaches and matches a chosen option", () => {
  const character = emptyCharacter("測試者");
  const state = createReferenceState(reference);
  const options = buildReferenceOptions(reference, state);

  assert.equal(state.currentSceneId, "evt_cryo_clearance");
  assert.equal(state.currentLocation, "loc_cryo");
  assert.equal(options.length, 3);
  assert.equal(options[0].reference.approachId, "app_cryo_recon");

  const resolution = resolveReferenceAction({
    reference,
    state,
    chosenOption: options[0],
    character,
  });
  assert.equal(resolution.matched, true);
  assert.equal(resolution.checkParams.attribute, "感知");
  assert.equal(resolution.checkParams.skill, "偵察");
  assert.equal(resolution.checkParams.dc, 1);
});

test("free input can match a reference approach without keyword checkIntent", () => {
  const character = emptyCharacter("測試者");
  const state = createReferenceState(reference);
  const resolution = resolveReferenceAction({
    reference,
    state,
    playerAction: "我撿起手電筒，沿著拖痕仔細照過去",
    character,
  });
  assert.equal(resolution.matched, true);
  assert.equal(resolution.approach.id, "app_cryo_recon");
});

test("reference success applies items, clues, scene transition and explicit threat delta", () => {
  const character = emptyCharacter("測試者");
  const state = createReferenceState(reference);
  const options = buildReferenceOptions(reference, state);
  const resolution = resolveReferenceAction({ reference, state, chosenOption: options[0], character });
  const applied = applyReferenceResult({ reference, state, resolution, outcomeTier: "成功" });

  assert.equal(applied.applied, true);
  assert.equal(applied.state.currentSceneId, "evt_meet_ash");
  assert.equal(applied.state.currentLocation, "loc_science");
  assert.ok(applied.state.inventory.includes("item_flashlight"));
  assert.ok(applied.state.clues.includes("clue_alien_trace"));
  assert.ok(applied.state.flags.includes("flag_cryo_cleared"));
  assert.equal(applied.effects.timeCost, 1);
  assert.equal(applied.effects.threatDelta, 0);
  assert.equal(applied.nodeComplete, null);
});

test("multi-turn Ash scene stays in place and advances only on an explicit exit result", () => {
  const character = emptyCharacter("測試者");
  const openingState = createReferenceState(reference);
  const openingOption = buildReferenceOptions(reference, openingState)[0];
  const openingResolution = resolveReferenceAction({ reference, state: openingState, chosenOption: openingOption, character });
  const entered = applyReferenceResult({ reference, state: openingState, resolution: openingResolution, outcomeTier: "成功" });
  assert.equal(entered.state.currentSceneId, "evt_meet_ash");

  const ashOption = buildReferenceOptions(reference, entered.state).find((option) => option.reference.approachId === "app_ash_talk_quarantine");
  const ashResolution = resolveReferenceAction({ reference, state: entered.state, chosenOption: ashOption, character });
  const stayed = applyReferenceResult({ reference, state: entered.state, resolution: ashResolution, outcomeTier: "成功" });
  assert.equal(stayed.state.currentSceneId, "evt_meet_ash");
  assert.equal(stayed.state.sceneTurnCount, 1);
  assert.equal(stayed.transition, "stay");

  const forced = applyReferenceResult({ reference, state: entered.state, resolution: ashResolution, outcomeTier: "慘烈失敗" });
  assert.equal(forced.state.currentSceneId, "evt_ash_ambush");
  assert.equal(forced.nextSceneId, "evt_ash_ambush");
  assert.equal(forced.state.sceneTurnCount, 0);
});

test("free action uses the automatic result and preserves zero time cost", () => {
  const character = emptyCharacter("測試者");
  const state = createReferenceState(reference);
  const options = buildReferenceOptions(reference, state);
  const free = options.find((option) => option.reference.approachId === "app_cryo_answer_mother");
  const resolution = resolveReferenceAction({ reference, state, chosenOption: free, character });
  const applied = applyReferenceResult({ reference, state, resolution, outcomeTier: "自動" });

  assert.equal(resolution.freeAction, true);
  assert.equal(applied.resultKey, "自動");
  assert.equal(applied.effects.timeCost, 0);
  assert.ok(applied.state.flags.includes("flag_mother_contacted"));
});

test("final purge produces a finale completion signal only after secured airlock and killed flag", () => {
  const character = emptyCharacter("測試者");
  const state = {
    ...createReferenceState(reference),
    currentSceneId: "evt_narcissus_final_purge",
    currentLocation: "loc_narcissus_airlock",
    flags: ["flag_suit_ready", "flag_tether_ready"],
    airlockPhase: "positioned",
    shipStatus: "overload_started",
  };
  const options = buildReferenceOptions(reference, state);
  const classic = options.find((option) => option.reference.approachId === "app_purge_classic");
  const resolution = resolveReferenceAction({ reference, state, chosenOption: classic, character });
  const applied = applyReferenceResult({ reference, state, resolution, outcomeTier: "成功" });

  assert.equal(applied.applied, true);
  assert.equal(applied.finaleComplete, true);
  assert.ok(applied.state.flags.includes("flag_xenomorph_killed"));
  assert.equal(applied.state.currentSceneId, "evt_hypersleep_return");
});

test("threatAssessment is bounded by scene policy and narrative mode follows action scale", () => {
  const state = createReferenceState(reference);
  const scene = reference.scenes.find((item) => item.id === "evt_meet_ash");
  assert.equal(narrativeModeForScene(scene, null, { freeAction: true, actionText: "我開門" }), "micro");
  assert.equal(narrativeModeForScene(scene, null, { freeAction: true, actionText: "我拆解反應爐並啟動緊急冷卻，掩護其他人撤離" }), "major");
  assert.equal(narrativeModeForScene(scene, null, { freeAction: true, actionText: "我調查終端資料" }), "normal");
  assert.equal(narrativeModeForScene(reference.scenes.find((item) => item.id === "evt_order_937_reveal")), "reveal");

  const rejected = validateThreatAssessment(reference, state, { level: "immediate_combat", reason: "模型自行判斷" });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.delta, 0);

  const policyReference = {
    ...reference,
    scenes: reference.scenes.map((item) => item.id === state.currentSceneId
      ? { ...item, threatPolicy: { allowedLevels: ["stable", "rise_1", "immediate_combat"], immediateCombatConditions: [{ anyFlags: ["flag_contact_authorized"] }] } }
      : item),
  };
  const allowedState = { ...state, flags: ["flag_contact_authorized"] };
  const accepted = validateThreatAssessment(policyReference, allowedState, { level: "immediate_combat", reason: "固定條件已成立" });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.delta, 7);

  const stableWithoutReason = validateThreatAssessment(reference, state, { level: "stable" });
  assert.equal(stableWithoutReason.accepted, true);
  assert.match(stableWithoutReason.reason, /AI 未提供理由/);
});

test("public reference response exposes safe NPC roster and trust labels only", () => {
  const state = createReferenceState(reference);
  const response = referenceStateForResponse(reference, state);
  const luyuan = response.npcs.find((npc) => npc.id === "npc_luyuan");

  assert.equal(response.npcs.length, reference.npcs.length);
  assert.equal(luyuan.name, "陸遠");
  assert.equal(luyuan.status, "alive");
  assert.equal(luyuan.statusLabel, "存活");
  assert.equal(luyuan.trust, null);
  assert.equal(luyuan.trustLabel, "待接觸");
  assert.equal(luyuan.trustTone, "muted");
  assert.deepEqual(Object.keys(luyuan).sort(), [
    "id", "name", "role", "status", "statusLabel", "trust", "trustLabel", "trustTone",
  ].sort());
  assert.equal("knowledge" in luyuan, false);
  assert.equal("privateGoals" in luyuan, false);

  const trusted = referenceStateForResponse(reference, {
    ...state,
    npcTrust: { npc_luyuan: 3 },
    npcStatuses: { ...state.npcStatuses, npc_luyuan: "injured" },
  }).npcs.find((npc) => npc.id === "npc_luyuan");
  assert.equal(trusted.statusLabel, "受傷");
  assert.equal(trusted.trust, 3);
  assert.equal(trusted.trustLabel, "緊密");
  assert.equal(trusted.trustTone, "strong");
});

test("known reference injuries affect the existing B/L/A hp tracks", () => {
  const character = emptyCharacter("測試者");
  const result = applyReferenceCharacterEffects(character, { injuriesAdd: ["burn_minor", "fracture_arm"] });
  assert.equal(result.warnings.length, 0);
  assert.equal(result.damageEvents.length, 2);
  assert.equal(character.derived.hp.B, 1);
  assert.equal(character.derived.hp.L, 1);
});

test("old or mismatched reference state is safely reinitialized", () => {
  const state = normalizeReferenceState(reference, { referenceId: "other", flags: ["bad"] });
  assert.equal(state.referenceId, reference.sourcePackId);
  assert.deepEqual(state.flags, []);
  assert.ok(state.currentSceneId);
});

test("reference state shape remains independent from the generic threat track", () => {
  const state = createReferenceState(reference);
  const track = createThreatTrack(2);
  assert.equal(track.level, 2);
  assert.equal(state.threatStage, undefined);
  assert.equal(state.currentLocation, "loc_cryo");
});
