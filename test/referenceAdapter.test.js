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
import {
  resolveTravelAction,
  applyTravelAction,
} from "../content/scenario/explorationState.js";

test("reference public response exposes bounded DM hints without internal rule data", () => {
  const state = createReferenceState(reference);
  const response = referenceStateForResponse(reference, state);
  assert.equal(response.dmPrompt.mode, "free_action");
  assert.equal(response.dmPrompt.question, null, "泛用 DM 問句由 narration 提供，safe view 不應再提供第二個問句");
  assert.match(response.dmPrompt.hint, /行動方向/);
  assert.match(response.dmPrompt.hint, /不是限制/);
  assert.ok(Array.isArray(response.dmPrompt.referenceHints));
  assert.ok(response.dmPrompt.referenceHints.length <= 3);
  assert.ok(response.dmPrompt.referenceHints.every((hint) => typeof hint === "string" && hint.length <= 24));
  const serializedPrompt = JSON.stringify(response.dmPrompt);
  assert.doesNotMatch(serializedPrompt, /gmTruth|privateGoals|knowledge|difficulty|attribute|skill|effects/);
});

test("reference adapter builds opening approaches and matches a chosen option", () => {
  const character = emptyCharacter("測試者");
  const state = createReferenceState(reference);
  const options = buildReferenceOptions(reference, state);

  assert.equal(state.currentSceneId, "evt_cryo_clearance");
  assert.equal(state.currentLocation, "loc_cryo");
  assert.equal(options.length, 4);
  assert.deepEqual(options.map((option) => option.reference.approachId), [
    "app_cryo_recon",
    "app_cryo_seal",
    "app_cryo_answer_mother",
    "app_cryo_leave",
  ]);
  assert.equal(options[0].reference.approachId, "app_cryo_recon");
  assert.equal(options[0].dc, 1);

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

test("reference success stays in cryo, then enters A deck before Ash", () => {
  const character = emptyCharacter("測試者");
  const state = createReferenceState(reference);
  const options = buildReferenceOptions(reference, state);
  const resolution = resolveReferenceAction({ reference, state, chosenOption: options[0], character });
  const recon = applyReferenceResult({ reference, state, resolution, outcomeTier: "成功" });

  assert.equal(recon.applied, true);
  assert.equal(recon.state.currentSceneId, "evt_cryo_clearance");
  assert.equal(recon.state.currentLocation, "loc_cryo");
  assert.ok(recon.state.inventory.includes("item_flashlight"));
  assert.ok(recon.state.clues.includes("clue_alien_trace"));
  assert.ok(recon.state.flags.includes("flag_cryo_cleared"));
  assert.ok(recon.state.flags.includes("flag_cryo_recon_done"));
  assert.equal(recon.effects.timeCost, 1);
  assert.equal(recon.effects.threatDelta, 0);
  assert.equal(recon.nodeComplete, null);
  assert.equal(buildReferenceOptions(reference, recon.state).some((option) => option.reference.approachId === "app_cryo_recon"), false);

  const leave = buildReferenceOptions(reference, recon.state).find((option) => option.reference.approachId === "app_cryo_leave");
  const leaveResolution = resolveReferenceAction({ reference, state: recon.state, chosenOption: leave, character });
  const deck = applyReferenceResult({ reference, state: recon.state, resolution: leaveResolution, outcomeTier: "成功" });
  assert.equal(deck.state.currentSceneId, "evt_deck_a_recon");
  assert.equal(deck.state.currentLocation, "loc_deck_a");
  assert.equal(deck.nodeComplete, null, "離開休眠室只應進入 A 甲板，不應提前完成主線節點");

  const contact = buildReferenceOptions(reference, deck.state).find((option) => option.reference.approachId === "app_deck_luyuan_contact");
  const contactResolution = resolveReferenceAction({ reference, state: deck.state, chosenOption: contact, character });
  const met = applyReferenceResult({ reference, state: deck.state, resolution: contactResolution, outcomeTier: "自動" });
  assert.ok(met.state.flags.includes("flag_luyuan_met"));
  assert.equal(met.state.npcStatuses.npc_luyuan, "met");

  const science = buildReferenceOptions(reference, met.state).find((option) => option.reference.approachId === "app_deck_to_science");
  const scienceResolution = resolveReferenceAction({ reference, state: met.state, chosenOption: science, character });
  const exited = applyReferenceResult({ reference, state: met.state, resolution: scienceResolution, outcomeTier: "自動" });
  assert.equal(exited.state.currentSceneId, "evt_meet_ash");
  assert.equal(exited.state.currentLocation, "loc_science");
  assert.equal(exited.nodeComplete, null, "前往 Ash 場景不應提前完成主線節點");
});

test("multi-turn Ash scene stays in place and advances only on an explicit exit result", () => {
  const character = emptyCharacter("測試者");
  const openingState = createReferenceState(reference);
  const openingOption = buildReferenceOptions(reference, openingState)[0];
  const openingResolution = resolveReferenceAction({ reference, state: openingState, chosenOption: openingOption, character });
  const recon = applyReferenceResult({ reference, state: openingState, resolution: openingResolution, outcomeTier: "成功" });
  const leaveOption = buildReferenceOptions(reference, recon.state).find((option) => option.reference.approachId === "app_cryo_leave");
  const leaveResolution = resolveReferenceAction({ reference, state: recon.state, chosenOption: leaveOption, character });
  const deck = applyReferenceResult({ reference, state: recon.state, resolution: leaveResolution, outcomeTier: "成功" });
  const contactOption = buildReferenceOptions(reference, deck.state).find((option) => option.reference.approachId === "app_deck_luyuan_contact");
  const contactResolution = resolveReferenceAction({ reference, state: deck.state, chosenOption: contactOption, character });
  const met = applyReferenceResult({ reference, state: deck.state, resolution: contactResolution, outcomeTier: "自動" });
  const scienceOption = buildReferenceOptions(reference, met.state).find((option) => option.reference.approachId === "app_deck_to_science");
  const scienceResolution = resolveReferenceAction({ reference, state: met.state, chosenOption: scienceOption, character });
  const entered = applyReferenceResult({ reference, state: met.state, resolution: scienceResolution, outcomeTier: "自動" });
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

test("public reference response only exposes contacted NPCs and safe relationship labels", () => {
  const state = createReferenceState(reference);
  const response = referenceStateForResponse(reference, state);

  // 初始休眠室不應把整份 NPC authoring roster 倒給玩家，也不應提前曝光 Ash 的身分。
  assert.deepEqual(response.npcs, []);
  assert.equal(response.exploration.nearbyNpcs.length, 0);

  const metState = {
    ...state,
    currentSceneId: "evt_deck_a_recon",
    currentLocation: "loc_deck_a",
    flags: ["flag_luyuan_met"],
    npcStatuses: { ...state.npcStatuses, npc_luyuan: "met" },
    npcTrust: { npc_luyuan: 3 },
  };
  const metResponse = referenceStateForResponse(reference, metState);
  const luyuan = metResponse.npcs.find((npc) => npc.id === "npc_luyuan");
  assert.equal(luyuan.name, "陸遠");
  assert.equal(luyuan.status, "met");
  assert.equal(luyuan.statusLabel, "已接觸");
  assert.equal(luyuan.trust, 3);
  assert.equal(luyuan.trustLabel, "緊密");
  assert.equal(luyuan.trustTone, "strong");
  assert.deepEqual(Object.keys(luyuan).sort(), [
    "id", "name", "role", "status", "statusLabel", "trust", "trustLabel", "trustTone",
  ].sort());
  assert.equal("knowledge" in luyuan, false);
  assert.equal("privateGoals" in luyuan, false);

  const ashBeforeReveal = referenceStateForResponse(reference, {
    ...metState,
    currentSceneId: "evt_meet_ash",
    currentLocation: "loc_science",
    npcStatuses: { ...metState.npcStatuses, npc_ash: "alive" },
  }).npcs.find((npc) => npc.id === "npc_ash");
  assert.equal(ashBeforeReveal.role, "科學官");
  assert.equal(ashBeforeReveal.role.includes("生化人"), false);

  const ashAfterReveal = referenceStateForResponse(reference, {
    ...metState,
    currentSceneId: "evt_meet_ash",
    currentLocation: "loc_science",
    flags: [...metState.flags, "flag_ash_synthetic_known"],
    npcStatuses: { ...metState.npcStatuses, npc_ash: "suspicious" },
  }).npcs.find((npc) => npc.id === "npc_ash");
  assert.equal(ashAfterReveal.role.includes("生化人疑雲已確認"), true);
});

test("exploration response exposes current location and known adjacent routes only", () => {
  const state = createReferenceState(reference);
  const response = referenceStateForResponse(reference, state);
  assert.equal(response.exploration.currentLocation.id, "loc_cryo");
  assert.equal(response.exploration.currentLocation.status, "visited");
  assert.deepEqual(response.exploration.visitedLocations, ["loc_cryo"]);
  assert.deepEqual(response.exploration.nearbyRoutes.map((route) => route.to), [
    "loc_deck_a", "loc_service_corridor",
  ]);
  assert.equal(response.exploration.nearbyRoutes[0].actionReady, true);
  assert.equal(response.exploration.knownLocations.some((location) => location.id === "loc_science"), false);
  assert.equal(JSON.stringify(response).includes("privateGoals"), false);
  assert.equal(JSON.stringify(response).includes("生化人"), false);
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
  assert.deepEqual(state.visitedLocations, ["loc_cryo"]);
});


test("reference results create public discoveries and unresolved questions without leaking GM truth", () => {
  const character = emptyCharacter("測試者");
  const state = createReferenceState(reference);
  assert.deepEqual(state.unresolvedQuestions.map((question) => question.id), ["q_player_manifest"]);
  assert.deepEqual(state.recentDiscoveries, []);

  const reconOption = buildReferenceOptions(reference, state).find(
    (option) => option.reference.approachId === "app_cryo_recon"
  );
  const resolution = resolveReferenceAction({ reference, state, chosenOption: reconOption, character });
  const applied = applyReferenceResult({ reference, state, resolution, outcomeTier: "成功" });
  const exploration = referenceStateForResponse(reference, applied.state).exploration;

  assert.ok(exploration.recentDiscoveries.some((item) => item.kind === "event_result"));
  assert.ok(exploration.recentDiscoveries.some((item) => item.id === "clue:clue_alien_trace"));
  assert.equal(exploration.unresolvedQuestions.find((item) => item.id === "q_alien_route")?.status, "updated");
  assert.equal(JSON.stringify(exploration).includes("fixedTruths"), false);
  assert.equal(JSON.stringify(exploration).includes("privateGoals"), false);
});

test("Ash question resolves only after the reference flag confirms the identity", () => {
  const character = emptyCharacter("測試者");
  const state = {
    ...createReferenceState(reference),
    currentSceneId: "evt_meet_ash",
    currentLocation: "loc_science",
    flags: ["flag_luyuan_met"],
    npcStatuses: { ...createReferenceState(reference).npcStatuses, npc_luyuan: "met", npc_ash: "alive" },
    unresolvedQuestions: [{ id: "q_player_manifest", text: "為什麼休眠名冊裡沒有我的名字？", status: "open", evidence: [] }, {
      id: "q_ash_identity",
      text: "Ash 為什麼能在這艘船上保持不尋常的權限？",
      status: "open",
      evidence: [],
    }],
  };
  const option = buildReferenceOptions(reference, state).find(
    (item) => item.reference.approachId === "app_ash_observe_abnormal"
  );
  const resolution = resolveReferenceAction({ reference, state, chosenOption: option, character });
  const applied = applyReferenceResult({ reference, state, resolution, outcomeTier: "大成功" });
  const question = applied.state.unresolvedQuestions.find((item) => item.id === "q_ash_identity");
  assert.equal(applied.state.flags.includes("flag_ash_synthetic_known"), true);
  assert.equal(question.status, "answered");
  assert.equal(question.answer.includes("普通人類"), true);
});

test("travel resolver only authorizes adjacent forward routes with fixed gates", () => {
  const initial = createReferenceState(reference);
  const toDeck = resolveTravelAction(reference, initial, "loc_deck_a");
  assert.equal(toDeck.ok, true);
  assert.equal(toDeck.timeCost, 1);
  const noisy = resolveTravelAction(reference, { ...initial, flags: ["flag_noise_made"] }, "loc_deck_a");
  assert.equal(noisy.risk.threatDelta, 1);
  assert.equal(noisy.risk.level, "elevated");

  const deckReady = {
    ...initial,
    flags: ["flag_cryo_left"],
  };
  const deck = applyTravelAction(reference, deckReady, toDeck);
  assert.equal(deck.state.currentLocation, "loc_deck_a");
  assert.equal(deck.state.currentSceneId, "evt_deck_a_recon");
  assert.ok(deck.state.visitedLocations.includes("loc_deck_a"));

  const bypass = resolveTravelAction(reference, deck.state, "loc_science");
  assert.equal(bypass.ok, false);
  assert.equal(bypass.code, "TRAVEL_LOCKED");

  const met = { ...deck.state, flags: [...deck.state.flags, "flag_luyuan_met"] };
  const toScience = resolveTravelAction(reference, met, "loc_science");
  assert.equal(toScience.ok, true);
  const science = applyTravelAction(reference, met, toScience);
  assert.equal(science.state.currentSceneId, "evt_meet_ash");
  assert.equal(science.state.currentLocation, "loc_science");
  assert.equal(science.state.unresolvedQuestions.some((question) => question.id === "q_ash_identity"), true);

  const nonAdjacent = resolveTravelAction(reference, science.state, "loc_narcissus");
  assert.equal(nonAdjacent.ok, false);
  assert.equal(nonAdjacent.code, "NOT_ADJACENT");
});


test("canonical narrative source replaces player text without changing reference effects", () => {
  const character = emptyCharacter("測試者");
  const state = createReferenceState(reference);
  const options = buildReferenceOptions(reference, state);
  const resolution = resolveReferenceAction({
    reference,
    state,
    chosenOption: options.find((option) => option.reference.approachId === "app_cryo_recon"),
    character,
  });
  const applied = applyReferenceResult({ reference, state, resolution, outcomeTier: "成功" });

  assert.equal(applied.applied, true);
  assert.match(applied.resultText, /金屬扣針/);
  assert.match(applied.resultText, /非人物種/);
  assert.equal(applied.state.lastResultText, applied.resultText);
  assert.ok(applied.state.clues.includes("clue_alien_trace"));
  assert.equal(applied.effects.timeCost, 1);
  assert.equal(applied.effects.threatDelta, 0);
});

test("canonical scene entry is returned by an authorized travel action", () => {
  const state = createReferenceState(reference);
  const resolution = resolveTravelAction(reference, state, "loc_deck_a");
  assert.equal(resolution.ok, true);

  const travel = applyTravelAction(reference, state, resolution);
  assert.equal(travel.applied, true);
  assert.equal(travel.nextSceneId, "evt_deck_a_recon");
  assert.match(travel.arrivalText, /橋樓主走廊內亮著斷續的應急紅光/);
  assert.match(travel.arrivalText, /黑盒子終端指示燈/);
});

test("Ash canonical result remains progressive while the server controls disclosure flags", () => {
  const state = {
    ...createReferenceState(reference),
    currentSceneId: "evt_meet_ash",
    currentLocation: "loc_science",
    flags: ["flag_cryo_left", "flag_luyuan_met", "flag_deck_science_route"],
    visitedLocations: ["loc_cryo", "loc_deck_a", "loc_science"],
  };
  const character = emptyCharacter("測試者");
  const options = buildReferenceOptions(reference, state);
  const resolution = resolveReferenceAction({
    reference,
    state,
    chosenOption: options.find((option) => option.reference.approachId === "app_ash_observe_abnormal"),
    character,
  });
  const applied = applyReferenceResult({ reference, state, resolution, outcomeTier: "成功" });

  assert.equal(applied.applied, true);
  assert.match(applied.resultText, /頸側大動脈/);
  assert.ok(applied.state.clues.includes("clue_ash_synthetic"));
  assert.ok(applied.state.flags.includes("flag_ash_synthetic_known") === false);
});


test("remaining scenes preserve original event sources and safe public boundaries", () => {
  const expectedSceneSources = [
    ["evt_medbay_ruins", "evt_medbay_ruins"],
    ["evt_cargo_stalk", "evt_cargo_stalk"],
    ["evt_cargo_tool_scavenge", "evt_cargo_tool_scavenge"],
    ["evt_meet_ripley", "evt_meet_ripley"],
    ["evt_mother_chamber_infiltrate", "evt_mother_chamber_infiltrate"],
    ["evt_engine_coolant_prep", "evt_engine_coolant_prep"],
    ["evt_order_937_reveal", "evt_order_937_reveal"],
    ["evt_trigger_overload", "evt_trigger_overload"],
    ["evt_vent_ambush_escape", "evt_vent_ambush_escape"],
    ["evt_narcissus_shadow_wake", "evt_narcissus_shadow_wake"],
    ["evt_narcissus_final_purge", "evt_narcissus_flush_airlock"],
    ["evt_hypersleep_return", "evt_hypersleep_return"],
  ];
  for (const [sceneId, sourceEventId] of expectedSceneSources) {
    const scene = reference.scenes.find((item) => item.id === sceneId);
    assert.equal(scene?.narrativeSource?.eventId, sourceEventId);
    assert.ok(scene?.narrativeSource?.entryText?.length > 40, `${sceneId} 應保留原始 entry`);
    assert.ok(Object.keys(scene?.narrativeSource?.outcomes ?? {}).length > 0, `${sceneId} 應有可用原始結果映射`);
  }

  const fragments = reference.scenes.flatMap((scene) => scene.narrativeSource?.fragments ?? []);
  for (const eventId of ["evt_narcissus_undock"]) {
    const fragment = fragments.find((item) => item.eventId === eventId);
    assert.ok(fragment, `缺少 ${eventId} 原始 fragment`);
    assert.ok(fragment.entryText.length > 0, `${eventId} 應保留原始 entry`);
  }
  for (const eventId of ["evt_medbay_ruins", "evt_cargo_stalk", "evt_cargo_tool_scavenge", "evt_meet_ripley", "evt_mother_chamber_infiltrate", "evt_engine_coolant_prep"]) {
    assert.equal(fragments.some((item) => item.eventId === eventId), false, `${eventId} 不應仍只是 fragment`);
  }

  assert.equal(reference.endings.filter((ending) => ending.narrativeSource?.text).length, 8);
  const publicState = referenceStateForResponse(reference, createReferenceState(reference));
  assert.equal("canonicalNarrative" in publicState, false);
  assert.equal("narrativeSource" in publicState, false);
  assert.equal(JSON.stringify(publicState).includes("privateGoals"), false);
});

test("remaining outcome mappings use original text while keeping current V2 action IDs", () => {
  const expected = [
    ["evt_order_937_reveal", "app_order_query", "成功", /你的手指在沉重的機械鍵盤上飛速敲擊/],
    ["evt_trigger_overload", "app_overload_manual", "成功", /你大吼一聲，雙手抓住冰冷而滑膩的金屬連桿/],
    ["evt_vent_ambush_escape", "app_escape_shoot_suppress", "成功", /沙漠之鷹.*連扣三槍/],
    ["evt_narcissus_shadow_wake", "app_shadow_stealth_suit", "成功", /你屏住每一次呼吸/],
    ["evt_narcissus_final_purge", "app_purge_classic", "成功", /你用盡全身力氣一把拉下/],
    ["evt_hypersleep_return", "app_return_direct_sleep", "自動", /你已經耗盡了最後一絲體力/],
  ];
  for (const [sceneId, approachId, tier, pattern] of expected) {
    const scene = reference.scenes.find((item) => item.id === sceneId);
    const text = scene?.narrativeSource?.outcomes?.[approachId]?.[tier];
    assert.ok(text, `${sceneId}/${approachId}/${tier} 缺少 canonical result`);
    assert.match(text, pattern);
  }
});

test("Narcissus travel includes original undock passage before the shadow-wake scene", () => {
  const state = {
    ...createReferenceState(reference),
    currentSceneId: "evt_vent_ambush_escape",
    currentLocation: "loc_narcissus_airlock",
    flags: ["flag_escaped_to_narcissus"],
    visitedLocations: ["loc_cryo", "loc_deck_a", "loc_narcissus_airlock"],
  };
  const resolution = resolveTravelAction(reference, state, "loc_narcissus");
  assert.equal(resolution.ok, true);
  assert.equal(resolution.transitionSourceEventId, "evt_narcissus_undock");
  const travel = applyTravelAction(reference, state, resolution);
  assert.equal(travel.nextSceneId, "evt_narcissus_shadow_wake");
  assert.deepEqual(travel.arrivalSourceEventIds, ["evt_narcissus_undock", "evt_narcissus_shadow_wake"]);
  assert.match(travel.arrivalText, /MANUAL DOCKING CLAMP LOCKED/);
  assert.match(travel.arrivalText, /那些原本死寂的黑色電纜之間/);
  assert.match(travel.arrivalText, /它沒有眼睛，但你無比清楚地感覺到/);
});


test("playable medical route exposes canonical scene and applies medkit or frostbite effects", () => {
  const character = emptyCharacter("測試者");
  const base = createReferenceState(reference);
  const deck = applyTravelAction(reference, { ...base, flags: ["flag_cryo_left", "flag_luyuan_met"] }, resolveTravelAction(reference, { ...base, flags: ["flag_cryo_left", "flag_luyuan_met"] }, "loc_deck_a")).state;
  const toMedbay = resolveTravelAction(reference, deck, "loc_medbay");
  assert.equal(toMedbay.ok, true);
  const medbayTravel = applyTravelAction(reference, deck, toMedbay);
  assert.equal(medbayTravel.state.currentSceneId, "evt_medbay_ruins");
  assert.match(medbayTravel.arrivalText, /醫療區的自動感應門卡在半開位置/);

  const option = buildReferenceOptions(reference, medbayTravel.state).find(
    (item) => item.reference.approachId === "app_medbay_scavenge"
  );
  const resolution = resolveReferenceAction({ reference, state: medbayTravel.state, chosenOption: option, character });
  const applied = applyReferenceResult({ reference, state: medbayTravel.state, resolution, outcomeTier: "成功" });
  assert.match(applied.resultText, /完整的深空外科縫合包/);
  assert.ok(applied.state.inventory.includes("item_emergency_medkit"));
  assert.ok(applied.state.flags.includes("flag_medbay_checked"));
  assert.equal(applied.effects.timeCost, 1);
  assert.equal(applied.effects.threatDelta, 0);

  const critical = applyReferenceResult({ reference, state: medbayTravel.state, resolution, outcomeTier: "慘烈失敗" });
  assert.ok(critical.state.injuries.includes("frostbite_minor"));
  assert.equal(critical.effects.threatDelta, 2);
});

test("cargo stalk unlocks tool cabinet as a separate scene and does not bypass the event", () => {
  const base = createReferenceState(reference);
  const state = {
    ...base,
    currentSceneId: "evt_deck_a_recon",
    currentLocation: "loc_deck_a",
    flags: ["flag_cryo_left", "flag_luyuan_met"],
    visitedLocations: ["loc_cryo", "loc_deck_a"],
  };
  const toCargo = resolveTravelAction(reference, state, "loc_cargo");
  assert.equal(toCargo.ok, true);
  assert.equal(toCargo.nextScene.id, "evt_cargo_stalk");
  const cargoState = applyTravelAction(reference, state, toCargo).state;
  assert.equal(cargoState.currentSceneId, "evt_cargo_stalk");
  assert.equal(buildReferenceOptions(reference, cargoState).some((item) => item.reference.approachId === "app_cargo_to_tools"), false);

  const character = emptyCharacter("測試者");
  const stalkOption = buildReferenceOptions(reference, cargoState).find(
    (item) => item.reference.approachId === "app_cargo_recon_corpse"
  );
  const stalkResolution = resolveReferenceAction({ reference, state: cargoState, chosenOption: stalkOption, character });
  const stalkResult = applyReferenceResult({ reference, state: cargoState, resolution: stalkResolution, outcomeTier: "成功" });
  assert.ok(stalkResult.state.clues.includes("clue_brett_fate"));
  assert.ok(stalkResult.state.flags.includes("flag_cargo_stalk_done"));
  assert.equal(stalkResult.sceneAdvanced, false);

  const toolOption = buildReferenceOptions(reference, stalkResult.state).find(
    (item) => item.reference.approachId === "app_cargo_to_tools"
  );
  assert.ok(toolOption);
  const toolResolution = resolveReferenceAction({ reference, state: stalkResult.state, chosenOption: toolOption, character });
  const toolResult = applyReferenceResult({ reference, state: stalkResult.state, resolution: toolResolution, outcomeTier: "自動" });
  assert.equal(toolResult.state.currentSceneId, "evt_cargo_tool_scavenge");
  assert.equal(toolResult.state.currentLocation, "loc_cargo");
  assert.match(toolResult.resultText, /工具櫃/);
});

test("Ripley and Lambert are public only at the contact scene, then the bridge route closes", () => {
  const base = createReferenceState(reference);
  const state = {
    ...base,
    currentSceneId: "evt_deck_a_recon",
    currentLocation: "loc_deck_a",
    flags: ["flag_cryo_left", "flag_luyuan_met"],
    visitedLocations: ["loc_cryo", "loc_deck_a"],
  };
  const before = referenceStateForResponse(reference, state);
  assert.equal(before.npcs.some((npc) => npc.id === "npc_ripley"), false);
  const toBridge = resolveTravelAction(reference, state, "loc_bridge");
  assert.equal(toBridge.ok, true);
  const bridge = applyTravelAction(reference, state, toBridge);
  assert.equal(bridge.state.currentSceneId, "evt_meet_ripley");
  const bridgeView = referenceStateForResponse(reference, bridge.state);
  assert.ok(bridgeView.npcs.some((npc) => npc.id === "npc_ripley"));
  assert.ok(bridgeView.npcs.some((npc) => npc.id === "npc_lambert"));
  assert.equal(JSON.stringify(bridgeView).includes("privateGoals"), false);

  const character = emptyCharacter("測試者");
  const option = buildReferenceOptions(reference, bridge.state).find(
    (item) => item.reference.approachId === "app_ripley_calm_lambert"
  );
  const resolution = resolveReferenceAction({ reference, state: bridge.state, chosenOption: option, character });
  const applied = applyReferenceResult({ reference, state: bridge.state, resolution, outcomeTier: "成功" });
  assert.ok(applied.state.flags.includes("flag_ripley_met"));
  assert.equal(applied.state.npcStatuses.npc_lambert, "met");
  assert.ok(applied.state.clues.includes("clue_narcissus_prep"));
  assert.match(applied.resultText, /水仙號的預熱參數/);

  const back = resolveTravelAction(reference, applied.state, "loc_deck_a");
  assert.equal(back.ok, true);
  const deck = applyTravelAction(reference, applied.state, back).state;
  const replay = resolveTravelAction(reference, deck, "loc_bridge");
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "TRAVEL_LOCKED");
  assert.deepEqual(replay.blockedFlags, ["flag_ripley_session_opened"]);
});

test("travel flagsAbsent gate blocks completed medical and Ripley routes", () => {
  const base = createReferenceState(reference);
  const medbayDone = { ...base, currentSceneId: "evt_deck_a_recon", currentLocation: "loc_deck_a", flags: ["flag_luyuan_met", "flag_medbay_checked"] };
  const medbayRoute = resolveTravelAction(reference, medbayDone, "loc_medbay");
  assert.equal(medbayRoute.ok, false);
  assert.equal(medbayRoute.code, "TRAVEL_LOCKED");
  assert.deepEqual(medbayRoute.blockedFlags, ["flag_medbay_checked"]);

  const ripleyDone = { ...base, currentSceneId: "evt_deck_a_recon", currentLocation: "loc_deck_a", flags: ["flag_luyuan_met", "flag_ripley_session_opened"] };
  const ripleyRoute = resolveTravelAction(reference, ripleyDone, "loc_bridge");
  assert.equal(ripleyRoute.ok, false);
  assert.equal(ripleyRoute.code, "TRAVEL_LOCKED");
  assert.deepEqual(ripleyRoute.blockedFlags, ["flag_ripley_session_opened"]);
});


test("core infiltration is a playable predecessor before the 937 reveal", () => {
  const base = createReferenceState(reference);
  const state = {
    ...base,
    currentSceneId: "evt_meet_ash",
    currentLocation: "loc_science",
    flags: ["flag_cryo_left", "flag_luyuan_met", "flag_937_path_known"],
    visitedLocations: ["loc_cryo", "loc_deck_a", "loc_science"],
  };
  const toCore = resolveTravelAction(reference, state, "loc_mother_core");
  assert.equal(toCore.ok, true);
  assert.equal(toCore.nextScene.id, "evt_mother_chamber_infiltrate");
  const coreTravel = applyTravelAction(reference, state, toCore);
  assert.match(coreTravel.arrivalText, /純白色的環形加壓走廊/);
  assert.equal(coreTravel.state.currentSceneId, "evt_mother_chamber_infiltrate");

  const character = emptyCharacter("主機測試者");
  const hack = buildReferenceOptions(reference, coreTravel.state).find(
    (item) => item.reference?.approachId === "app_mother_door_hack"
  );
  assert.ok(hack);
  const resolution = resolveReferenceAction({ reference, state: coreTravel.state, chosenOption: hack, character });
  const opened = applyReferenceResult({ reference, state: coreTravel.state, resolution, outcomeTier: "成功" });
  assert.equal(opened.state.currentSceneId, "evt_order_937_reveal");
  assert.equal(opened.state.currentLocation, "loc_mother_core");
  assert.match(opened.resultText, /圓形金屬門/);
  assert.equal(opened.effects.timeCost, 1);
  assert.equal(opened.effects.threatDelta, 0);
});

test("engineering preparation is a playable predecessor and cannot bypass overload preparation", () => {
  const base = createReferenceState(reference);
  const state = {
    ...base,
    currentSceneId: "evt_order_937_reveal",
    currentLocation: "loc_mother_core",
    flags: ["flag_luyuan_met", "flag_order_937_revealed"],
    inventory: ["item_wrench_tool"],
    visitedLocations: ["loc_cryo", "loc_deck_a", "loc_science", "loc_mother_core"],
  };
  const toEngine = resolveTravelAction(reference, state, "loc_engine");
  assert.equal(toEngine.ok, true);
  assert.equal(toEngine.nextScene.id, "evt_engine_coolant_prep");
  const engineState = applyTravelAction(reference, state, toEngine).state;
  assert.match(reference.scenes.find((scene) => scene.id === engineState.currentSceneId).narrativeSource.entryText, /刺骨的冷氣/);

  const character = emptyCharacter("工程測試者");
  const valves = buildReferenceOptions(reference, engineState).find(
    (item) => item.reference?.approachId === "app_engine_prep_valves"
  );
  assert.ok(valves);
  const resolution = resolveReferenceAction({ reference, state: engineState, chosenOption: valves, character });
  const prepared = applyReferenceResult({ reference, state: engineState, resolution, outcomeTier: "成功" });
  assert.equal(prepared.sceneAdvanced, false);
  assert.ok(prepared.state.flags.includes("flag_engine_prep_done"));
  assert.ok(prepared.state.flags.includes("flag_engine_valves_ready"));
  assert.match(prepared.resultText, /四根閥門/);

  const start = buildReferenceOptions(reference, prepared.state).find(
    (item) => item.reference?.approachId === "app_engine_start_overload"
  );
  assert.ok(start, "工程準備完成後才提供啟動事件 14 的 approach");
  const startResolution = resolveReferenceAction({ reference, state: prepared.state, chosenOption: start, character });
  const overload = applyReferenceResult({ reference, state: prepared.state, resolution: startResolution, outcomeTier: "自動" });
  assert.equal(overload.state.currentSceneId, "evt_trigger_overload");
  assert.equal(overload.state.currentLocation, "loc_engine");
  assert.equal(overload.effects.timeCost, 0);
});
