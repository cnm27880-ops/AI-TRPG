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


test("remaining scenes preserve original event fragments and safe public boundaries", () => {
  const expectedSceneSources = [
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
    assert.ok(scene?.narrativeSource?.entryText?.length > 80, `${sceneId} 應保留完整原始 entry`);
    assert.ok(Object.keys(scene?.narrativeSource?.outcomes ?? {}).length > 0, `${sceneId} 應有可用原始結果映射`);
  }

  const fragments = reference.scenes.flatMap((scene) => scene.narrativeSource?.fragments ?? []);
  for (const eventId of [
    "evt_medbay_ruins",
    "evt_cargo_stalk",
    "evt_cargo_tool_scavenge",
    "evt_meet_ripley",
    "evt_engine_coolant_prep",
    "evt_narcissus_undock",
  ]) {
    const fragment = fragments.find((item) => item.eventId === eventId);
    assert.ok(fragment, `缺少 ${eventId} 原始 fragment`);
    assert.ok(fragment.entryText.length > 0, `${eventId} 應保留原始 entry`);
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
