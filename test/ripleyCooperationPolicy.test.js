import assert from "node:assert/strict";
import test from "node:test";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import contentPackage from "../content/scenario/examples/alienNostromo_v2_contentPackage.js";
import {
  createReferenceState,
  normalizeReferenceState,
  referenceStateForResponse,
  buildReferencePromptBlock,
} from "../content/scenario/referenceAdapter.js";
import {
  RIPLEY_ID,
  createRipleyCooperationState,
  normalizeRipleyCooperationState,
  classifyRipleyInteraction,
  applyRipleyCooperationForAction,
  buildRipleyCooperationPromptBlock,
  ripleyCooperationEntries,
} from "../content/scenario/ripleyCooperationPolicy.js";

const RIPLEY_SCENE = "evt_meet_ripley";

function apply(state, actionText, turnNumber, extra = {}) {
  return applyRipleyCooperationForAction({
    reference,
    state,
    actionText,
    sceneId: RIPLEY_SCENE,
    turnNumber,
    ...extra,
  });
}

test("Ripley profile 有獨立的 evidence／生物安全模型，不複製陸遠威脅欄位", () => {
  assert.equal(ripleyCooperationEntries.length, 18);
  assert.equal(new Set(ripleyCooperationEntries.map((entry) => entry.category)).size, 5);
  const fresh = createRipleyCooperationState();
  assert.deepEqual(fresh[RIPLEY_ID], {
    state: "unmet",
    trust: 0,
    evidenceConfidence: 0,
    crewSafetyRisk: 0,
    biohazardConcern: 0,
    protocolAlignment: 0,
    boundaryIncidents: 0,
    commandConfidence: 0,
    crewCohesion: 1,
    commandChallenges: 0,
    reliableReports: 0,
    contactEstablished: false,
    tasksAccepted: 0,
    lastDecision: "assess_unidentified_survivors",
    currentObjective: "assess_unidentified_survivors",
    lastInteractionType: null,
    lastEntryId: null,
    lastActionText: null,
    lastUpdatedTurn: 0,
  });
  assert.equal("threatCount" in fresh[RIPLEY_ID], false);
  assert.equal(normalizeRipleyCooperationState({ [RIPLEY_ID]: { trust: -20 } })[RIPLEY_ID].trust, -9);
});

test("reference state 會同時建立並保留陸遠與 Ripley 的獨立 state", () => {
  const fresh = createReferenceState(reference);
  assert.equal(fresh.npcCooperation.npc_luyuan.state, "briefing");
  assert.equal(fresh.npcCooperation[RIPLEY_ID].state, "unmet");
  const normalized = normalizeReferenceState(reference, {
    ...fresh,
    npcCooperation: { npc_luyuan: { state: "strained", trust: -2 } },
  });
  assert.equal(normalized.npcCooperation.npc_luyuan.state, "strained");
  assert.equal(normalized.npcCooperation[RIPLEY_ID].state, "unmet");
});

test("Ripley 的正常提問會提供必要事實與下一步", () => {
  const result = apply(createReferenceState(reference), "你是誰？Dallas 和其他船員發生什麼事？", 1);
  assert.equal(result.changed, true);
  assert.equal(result.entry.entryId, "ripley_briefing_identity_01");
  assert.equal(result.state.npcCooperation[RIPLEY_ID].contactEstablished, true);
  const prompt = buildRipleyCooperationPromptBlock(reference, result.state, {
    actionText: "你是誰？Dallas 和其他船員發生什麼事？",
    sceneId: RIPLEY_SCENE,
    turnNumber: 1,
  });
  assert.match(prompt, /必要事實/);
  assert.match(prompt, /可執行的下一步/);
  assert.doesNotMatch(prompt, /privateGoals|withheldFacts|evidenceConfidence/);
});

test("Ripley 會根據可驗證證據提升合作，而不是直接給完全信任", () => {
  const result = apply(createReferenceState(reference), "我出示船長最後日誌與黑盒子資料", 1);
  assert.equal(result.classification.interactionType, "offer_evidence");
  assert.equal(result.entry.entryId, "ripley_cooperate_evidence_01");
  assert.equal(result.state.npcCooperation[RIPLEY_ID].state, "evidence_trust");
  assert.equal(result.state.npcCooperation[RIPLEY_ID].evidenceConfidence, 2);
  assert.equal(result.state.npcCooperation[RIPLEY_ID].trust, 1);
});

test("Ripley 對未知樣本採用生物安全邊界，不自行宣稱感染或沒收物品", () => {
  const result = apply(createReferenceState(reference), "我把異形樣本帶進隊伍，拿給 Ripley 看", 1);
  assert.equal(result.classification.interactionType, "biohazard_risk");
  assert.equal(result.entry.entryId, "ripley_boundary_biohazard_03");
  assert.equal(result.state.npcCooperation[RIPLEY_ID].state, "biohazard_boundary");
  assert.equal(result.state.npcCooperation[RIPLEY_ID].biohazardConcern, 2);
  const prompt = buildRipleyCooperationPromptBlock(reference, result.state, {
    actionText: "我把異形樣本帶進隊伍，拿給 Ripley 看",
    sceneId: RIPLEY_SCENE,
    turnNumber: 1,
  });
  assert.match(prompt, /先說明樣本|隔離/);
  assert.doesNotMatch(prompt, /claim_contamination|invent_infection|invent_item_loss/);
  assert.match(prompt, /不得自行創造|感染/);
});

test("Ripley 對第一次與第二次強闖採用 angry 到 withdrawn，不使用陸遠的三次威脅階梯", () => {
  const first = apply(createReferenceState(reference), "我拿槍指著 Ripley，要求她立刻開門", 1);
  assert.equal(first.classification.interactionType, "coercive_pressure");
  assert.equal(first.entry.entryId, "ripley_boundary_force_01");
  assert.equal(first.state.npcCooperation[RIPLEY_ID].state, "angry");
  assert.equal(first.state.npcCooperation[RIPLEY_ID].boundaryIncidents, 1);

  const second = apply(first.state, "我再次威脅 Ripley 開門並準備破門", 2);
  assert.equal(second.entry.entryId, "ripley_boundary_force_02");
  assert.equal(second.state.npcCooperation[RIPLEY_ID].state, "withdrawn");
  assert.equal(second.state.npcCooperation[RIPLEY_ID].boundaryIncidents, 2);
  assert.equal("threatCount" in second.state.npcCooperation[RIPLEY_ID], false);
  const prompt = buildRipleyCooperationPromptBlock(reference, second.state, {
    actionText: "我再次威脅 Ripley 開門並準備破門",
    sceneId: RIPLEY_SCENE,
    turnNumber: 2,
  });
  assert.match(prompt, /停止提供額外資料|安全邊界|不再和你爭辯/);
  assert.match(prompt, /禁止自行創造：傷勢、死亡、位置改變/);
});

test("Ripley 在降溫與遵守檢疫後恢復有限程序合作，但不抹除過去事件", () => {
  const first = apply(createReferenceState(reference), "我拿槍指著 Ripley，要求她立刻開門", 1);
  const second = apply(first.state, "我再次威脅 Ripley 開門並準備破門", 2);
  const calmed = apply(second.state, "我放下槍退後，遵守檢疫程序並不再強闖", 3);
  assert.equal(calmed.classification.interactionType, "deescalate_protocol");
  assert.equal(calmed.entry.entryId, "ripley_deescalate_protocol_01");
  assert.equal(calmed.state.npcCooperation[RIPLEY_ID].state, "functional");
  assert.equal(calmed.state.npcCooperation[RIPLEY_ID].trust, -2);
  assert.equal(calmed.state.npcCooperation[RIPLEY_ID].boundaryIncidents, 2);
});

test("Ripley classifier 不會把 Lambert 或一般環境行動誤判成 Ripley 互動", () => {
  const lambert = classifyRipleyInteraction({ actionText: "我安撫 Lambert，讓她停止哭喊", sceneId: RIPLEY_SCENE });
  assert.equal(lambert.interactionType, "calm_lambert");
  assert.equal(lambert.targetNpcId, RIPLEY_ID);
  const ordinary = classifyRipleyInteraction({ actionText: "我觀察艦橋上的黑盒子終端", sceneId: "evt_deck_a_recon" });
  assert.equal(ordinary.interactionType, "other");
  assert.equal(ordinary.targetNpcId, null);
  const ash = classifyRipleyInteraction({ actionText: "我問 Ash 這裡發生什麼事", targetNpcId: "npc_ash", sceneId: RIPLEY_SCENE });
  assert.equal(ash.interactionType, "other");
  const ashFromTurn = classifyRipleyInteraction({ actionText: "我問 Ash 這裡發生什麼事", sceneId: RIPLEY_SCENE });
  assert.equal(ashFromTurn.interactionType, "other");
});

test("Ripley cooperation prompt 僅在 Ripley 場景／明確目標時出現，且 public response 不洩漏內部 state", () => {
  const initial = createReferenceState(reference);
  const outside = buildRipleyCooperationPromptBlock(reference, initial, {
    actionText: "我觀察貨艙",
    sceneId: "evt_cargo_stalk",
    turnNumber: 1,
  });
  assert.equal(outside, "");
  const result = apply(initial, "你是誰？", 1);
  const prompt = buildReferencePromptBlock({
    reference,
    state: result.state,
    resolution: { matched: true, scene: reference.scenes.find((scene) => scene.id === RIPLEY_SCENE) },
    actionText: "你是誰？",
    turnNumber: 1,
  });
  assert.match(prompt, /<NPC_Cooperation_Contract npc="npc_ripley">/);
  assert.doesNotMatch(prompt, /privateGoals|withheldFacts|evidenceConfidence/);
  const response = referenceStateForResponse(reference, result.state);
  assert.equal("npcCooperation" in response, false);
  assert.equal("privateGoals" in response, false);
});

test("相同 Ripley action 在晚回合不會重播舊 directive", () => {
  const result = apply(createReferenceState(reference), "我拿槍指著 Ripley，要求她立刻開門", 1);
  const later = buildRipleyCooperationPromptBlock(reference, result.state, {
    actionText: "我拿槍指著 Ripley，要求她立刻開門",
    sceneId: RIPLEY_SCENE,
    turnNumber: 2,
  });
  assert.doesNotMatch(later, /本回合已由 server 選定的 Ripley 外在反應/);
});

test("Ripley 會以指揮信心與隊伍凝聚設定可回報的生存優先順序", () => {
  const requested = apply(createReferenceState(reference), "請 Ripley 下令，告訴我們先做什麼", 1);
  assert.equal(requested.classification.interactionType, "request_command");
  assert.equal(requested.entry.entryId, "ripley_command_set_priority_01");
  assert.equal(requested.state.npcCooperation[RIPLEY_ID].state, "commanding");
  assert.equal(requested.state.npcCooperation[RIPLEY_ID].commandConfidence, 2);
  assert.equal(requested.state.npcCooperation[RIPLEY_ID].crewCohesion, 2);
  assert.equal(requested.state.npcCooperation[RIPLEY_ID].trust, 1);
  assert.match(requested.entry.runtimeNarration, /順序|優先|回報/);
  assert.doesNotMatch(requested.entry.runtimeNarration, /已經移動|已經關閉|已完成/);

  const reported = apply(requested.state, "我向 Ripley 回報，我在通訊區看到異常，但還沒有確認原因", 2);
  assert.equal(reported.classification.interactionType, "report_crew_status");
  assert.equal(reported.entry.entryId, "ripley_command_report_02");
  assert.equal(reported.state.npcCooperation[RIPLEY_ID].reliableReports, 1);
  assert.equal(reported.state.npcCooperation[RIPLEY_ID].trust, 2);
});

test("Ripley 對指揮質疑會要求具體依據，重複無新資料才撤回指揮辯論", () => {
  const first = apply(createReferenceState(reference), "我質疑 Ripley 的安排，憑什麼你下令", 1);
  assert.equal(first.classification.interactionType, "challenge_command");
  assert.equal(first.entry.entryId, "ripley_command_challenge_03");
  assert.equal(first.state.npcCooperation[RIPLEY_ID].state, "angry");
  assert.equal(first.state.npcCooperation[RIPLEY_ID].commandChallenges, 1);

  const second = apply(first.state, "我再次質疑 Ripley 的安排，命令不對", 2);
  assert.equal(second.classification.interactionType, "challenge_command");
  assert.equal(second.entry.entryId, "ripley_command_challenge_04");
  assert.equal(second.state.npcCooperation[RIPLEY_ID].state, "withdrawn");
  assert.equal(second.state.npcCooperation[RIPLEY_ID].commandChallenges, 2);
  assert.match(second.entry.runtimeNarration, /優先順序|新.*資料|音量/);
});

test("玩家支持 Ripley 指揮時可恢復隊伍協調，但不抹除先前的信任損失", () => {
  const first = apply(createReferenceState(reference), "我質疑 Ripley 的安排，憑什麼你下令", 1);
  const second = apply(first.state, "我再次質疑 Ripley 的安排，命令不對", 2);
  const supported = apply(second.state, "我支持 Ripley 指揮，照她安排分工", 3);
  assert.equal(supported.classification.interactionType, "command_support");
  assert.equal(supported.entry.entryId, "ripley_command_support_05");
  assert.equal(supported.state.npcCooperation[RIPLEY_ID].state, "functional");
  assert.equal(supported.state.npcCooperation[RIPLEY_ID].trust, -1);
  assert.equal(supported.state.npcCooperation[RIPLEY_ID].commandChallenges, 2);
  assert.ok(supported.state.npcCooperation[RIPLEY_ID].crewCohesion > 0);
});

test("Ripley command directive 只在本回合命中，晚回合不重播且不暴露 raw state", () => {
  const result = apply(createReferenceState(reference), "請 Ripley 下令，告訴我們先做什麼", 1);
  const current = buildRipleyCooperationPromptBlock(reference, result.state, {
    actionText: "請 Ripley 下令，告訴我們先做什麼",
    sceneId: RIPLEY_SCENE,
    turnNumber: 1,
  });
  assert.match(current, /本回合已由 server 選定的 Ripley 外在反應/);
  assert.match(current, /指揮互動|設定優先順序/);
  assert.doesNotMatch(current, /commandConfidence\s*[:=]|crewCohesion\s*[:=]|privateAssessment|withheldFacts/);

  const later = buildRipleyCooperationPromptBlock(reference, result.state, {
    actionText: "請 Ripley 下令，告訴我們先做什麼",
    sceneId: RIPLEY_SCENE,
    turnNumber: 2,
  });
  assert.doesNotMatch(later, /本回合已由 server 選定的 Ripley 外在反應/);
});

assert.equal(contentPackage.approvedNpcCooperation.npc_ripley.entries.length, 18);
