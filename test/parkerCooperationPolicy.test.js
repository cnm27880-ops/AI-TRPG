import test from "node:test";
import assert from "node:assert/strict";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import {
  PARKER_ID,
  parkerCooperationProfile,
  parkerCooperationEntries,
  createParkerCooperationState,
  normalizeParkerCooperationState,
  classifyParkerInteraction,
  applyParkerCooperationForAction,
  buildParkerCooperationPromptBlock,
} from "../content/scenario/parkerCooperationPolicy.js";

const ENGINE_SCENE = "evt_engine_coolant_prep";
const OTHER_SCENE = "evt_deck_a_recon";

function apply(state, actionText, turnNumber, sceneId = ENGINE_SCENE, targetNpcId = null) {
  return applyParkerCooperationForAction({ reference, state, actionText, sceneId, turnNumber, targetNpcId });
}

function parkerState(state) {
  return state.npcCooperation[PARKER_ID];
}

test("Parker profile 使用機械工程／可靠工作模型，不複製陸遠威脅欄位", () => {
  const profile = parkerCooperationProfile();
  assert.equal(profile.npcId, PARKER_ID);
  assert.equal(profile.role, "工程師／自毀程序協助者");
  assert.deepEqual(Object.keys(profile.objectives).length > 0, true);
  assert.equal(parkerCooperationEntries.length, 13);
  assert.deepEqual(
    [...new Set(parkerCooperationEntries.map((entry) => entry.category))].sort(),
    ["boundary", "briefing", "cooperation", "deescalation"],
  );
  for (const entry of parkerCooperationEntries) assert.equal(entry.npcAction.statePatch, null);
});

test("Parker 新狀態與舊存檔正規化保留 bounded 欄位並允許負 trust", () => {
  const created = { npcCooperation: createParkerCooperationState() };
  assert.equal(parkerState(created).state, "unmet");
  const normalized = normalizeParkerCooperationState({
    [PARKER_ID]: { state: "invalid", trust: -20, patience: 20, lastUpdatedTurn: -4 },
  });
  assert.equal(normalized[PARKER_ID].state, "unmet");
  assert.equal(normalized[PARKER_ID].trust, -9);
  assert.equal(normalized[PARKER_ID].patience, 9);
  assert.equal(normalized[PARKER_ID].lastUpdatedTurn, 0);
});

test("工程區求生提問會提供 Parker 身分、工程事實與可執行下一步", () => {
  const classification = classifyParkerInteraction({ actionText: "我問 Parker 工程區現在怎麼回事", sceneId: ENGINE_SCENE });
  assert.equal(classification.interactionType, "survival_question");
  assert.equal(classification.topic, "engineering_status");
  const result = apply({}, "我問 Parker 工程區現在怎麼回事", 1);
  assert.equal(result.entry.entryId, "parker_briefing_engineer_01");
  assert.match(result.entry.runtimeNarration, /工程區|閥門|蒸氣|工作/);
  assert.match(result.entry.continuationPrompt, /可以|行動/);
});

test("具體維修提議會提高工程可靠度並分派可回報工作", () => {
  const result = apply({}, "我來檢查冷卻閥並回報壓力", 1);
  assert.equal(result.classification.interactionType, "offer_repair");
  assert.equal(result.entry.entryId, "parker_cooperate_repair_01");
  assert.equal(parkerState(result.state).taskReliability, 2);
  assert.equal(parkerState(result.state).state, "functional");
});

test("工具要求會進入 Parker 的資源邊界，而非自行發放或扣除物品", () => {
  const result = apply({}, "我需要借用 Parker 的扳手", 1);
  assert.equal(result.classification.interactionType, "resource_pressure");
  assert.equal(result.entry.entryId, "parker_boundary_resource_01");
  assert.equal(parkerState(result.state).state, "resource_guarded");
  assert.deepEqual(result.entry.npcAction.statePatch, null);
  assert.match(result.entry.runtimeNarration, /用途|替代|工具/);
});

test("Parker 第一次施壓直率拒絕，第二次施壓改為撤回工程支援", () => {
  const first = apply({}, "我拿槍指著 Parker，逼他立刻拉閥", 1);
  assert.equal(first.classification.interactionType, "coercive_pressure");
  assert.equal(first.entry.entryId, "parker_boundary_coercion_02");
  assert.equal(parkerState(first.state).state, "angry");
  assert.equal(parkerState(first.state).boundaryIncidents, 1);

  const second = apply(first.state, "我再次威脅 Parker，叫他滾開", 2);
  assert.equal(second.entry.entryId, "parker_boundary_repeat_03");
  assert.equal(parkerState(second.state).state, "withdrawn");
  assert.equal(parkerState(second.state).boundaryIncidents, 2);
  assert.notEqual(first.entry.runtimeNarration, second.entry.runtimeNarration);
  assert.match(second.entry.runtimeNarration, /停止|支援|自己決定/);
});

test("未說明的亂動閥門會被標成工程干擾風險，但不創造設備結果", () => {
  const result = apply({}, "我故意亂拉閥門，想把程序弄亂", 1);
  assert.equal(result.classification.interactionType, "sabotage_risk");
  assert.equal(result.entry.entryId, "parker_boundary_sabotage_04");
  assert.equal(result.entry.npcAction.statePatch, null);
  assert.doesNotMatch(result.entry.runtimeNarration, /已經壞掉|已爆炸|已啟動|已損壞/);
});

test("停止施壓並回報工作可恢復有限合作，但不抹除既有事件", () => {
  const hostile = apply({}, "我拿槍指著 Parker，逼他立刻拉閥", 1);
  const repeated = apply(hostile.state, "我再次威脅 Parker，叫他滾開", 2);
  const calm = apply(repeated.state, "我停手，先回報閥門狀況並照程序做", 3);
  assert.equal(calm.classification.interactionType, "deescalate_and_work");
  assert.equal(calm.entry.entryId, "parker_deescalate_01");
  assert.equal(parkerState(calm.state).state, "functional");
  assert.equal(parkerState(calm.state).boundaryIncidents, 2);
});

test("相同 Parker action 在晚回合不會重播舊 directive，且 prompt 不含私密欄位", () => {
  const first = apply({}, "我來檢查冷卻閥並回報壓力", 1);
  const sameLater = buildParkerCooperationPromptBlock(reference, first.state, {
    actionText: "我來檢查冷卻閥並回報壓力",
    sceneId: ENGINE_SCENE,
    turnNumber: 2,
  });
  assert.doesNotMatch(sameLater, /本回合已由 server 選定的 Parker 外在反應/);
  assert.doesNotMatch(sameLater, /privateAssessment|withheldFacts|trust\s*[:=]|mechanicalNeed\s*[:=]/);

  const current = buildParkerCooperationPromptBlock(reference, first.state, {
    actionText: "我來檢查冷卻閥並回報壓力",
    sceneId: ENGINE_SCENE,
    turnNumber: 1,
  });
  assert.match(current, /本回合已由 server 選定的 Parker 外在反應/);
  assert.match(current, /不得自行創造|不能自行/);
});

test("Parker 不會在其他副本、其他 NPC 或無關地點誤觸發", () => {
  const ordinary = classifyParkerInteraction({ actionText: "我問 Ripley 工程區發生什麼事", sceneId: ENGINE_SCENE });
  assert.equal(ordinary.interactionType, "other");
  const otherScene = apply({}, "我檢查工程設備", 1, OTHER_SCENE);
  assert.equal(otherScene.changed, false);
  const otherPack = apply({ npcCooperation: createParkerCooperationState() }, "我問 Parker 閥門怎麼辦", 1, ENGINE_SCENE, PARKER_ID);
  assert.equal(otherPack.changed, true);
  const nonAlien = apply({}, "我問 Parker 閥門怎麼辦", 1, ENGINE_SCENE, PARKER_ID);
  const nonAlienResult = applyParkerCooperationForAction({ reference: { sourcePackId: "scenario.other" }, state: {}, actionText: "我問 Parker 閥門怎麼辦", sceneId: ENGINE_SCENE, turnNumber: 1, targetNpcId: PARKER_ID });
  assert.equal(nonAlienResult.changed, false);
  assert.equal(otherPack.state.npcCooperation[PARKER_ID].state, "busy");
  assert.equal(nonPackState(nonAlien), "busy");
});

function nonPackState(result) {
  return result.state?.npcCooperation?.[PARKER_ID]?.state;
}
