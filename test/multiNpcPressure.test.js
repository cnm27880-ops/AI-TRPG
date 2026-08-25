import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import { createReferenceState, referenceStateForResponse, buildReferencePromptBlock } from "../content/scenario/referenceAdapter.js";
import { applyNpcCooperationForAction } from "../content/scenario/npcCooperationPolicy.js";
import { applyRipleyCooperationForAction } from "../content/scenario/ripleyCooperationPolicy.js";
import { applyParkerCooperationForAction } from "../content/scenario/parkerCooperationPolicy.js";
import { applyLambertCooperationForAction } from "../content/scenario/lambertCooperationPolicy.js";

const ENGINE_SCENE = "evt_engine_coolant_prep";
const RIPLEY_SCENE = "evt_meet_ripley";
const POLICIES = [
  applyNpcCooperationForAction,
  applyRipleyCooperationForAction,
  applyParkerCooperationForAction,
  applyLambertCooperationForAction,
];

function applyAll(state, actionText, sceneId, turnNumber) {
  let current = state;
  const decisions = [];
  for (const applyPolicy of POLICIES) {
    const decision = applyPolicy({
      reference,
      state: current,
      actionText,
      sceneId,
      turnNumber,
    });
    decisions.push(decision);
    if (decision.changed) current = decision.state;
  }
  return { state: current, decisions };
}

function cooperation(state, npcId) {
  return state.npcCooperation[npcId];
}

test("極端多 NPC 壓力：同一回合威脅 Parker 與大吼 Lambert，各自進入專屬第一階段", () => {
  const initial = createReferenceState(reference);
  const result = applyAll(
    initial,
    "我威脅 Parker 立刻拉閥，同時對 Lambert 大吼叫她閉嘴",
    ENGINE_SCENE,
    1,
  );

  assert.equal(result.decisions.filter((decision) => decision.changed).length, 2);
  assert.equal(cooperation(result.state, "npc_luyuan").lastEntryId, null);
  assert.equal(cooperation(result.state, "npc_ripley").lastEntryId, null);
  assert.equal(cooperation(result.state, "npc_parker").lastEntryId, "parker_boundary_coercion_02");
  assert.equal(cooperation(result.state, "npc_parker").state, "angry");
  assert.equal(cooperation(result.state, "npc_parker").boundaryIncidents, 1);
  assert.equal(cooperation(result.state, "npc_lambert").lastEntryId, "lambert_pressure_shout_01");
  assert.equal(cooperation(result.state, "npc_lambert").state, "panic");
  assert.equal(cooperation(result.state, "npc_lambert").pressureIncidents, 1);
});

test("極端多 NPC 壓力續行：第二次施壓升級各自策略，不會互相覆蓋 state", () => {
  const first = applyAll(
    createReferenceState(reference),
    "我威脅 Parker 立刻拉閥，同時對 Lambert 大吼叫她閉嘴",
    ENGINE_SCENE,
    1,
  );
  const second = applyAll(
    first.state,
    "我再次威脅 Parker 立刻拉閥，同時再次對 Lambert 大吼，逼她回答",
    ENGINE_SCENE,
    2,
  );

  assert.equal(cooperation(second.state, "npc_parker").lastEntryId, "parker_boundary_repeat_03");
  assert.equal(cooperation(second.state, "npc_parker").state, "withdrawn");
  assert.equal(cooperation(second.state, "npc_parker").boundaryIncidents, 2);
  assert.equal(cooperation(second.state, "npc_lambert").lastEntryId, "lambert_pressure_threat_02");
  assert.equal(cooperation(second.state, "npc_lambert").state, "withdrawn");
  assert.equal(cooperation(second.state, "npc_lambert").pressureIncidents, 2);
  assert.equal(cooperation(second.state, "npc_ripley").lastEntryId, null);
  assert.equal(cooperation(second.state, "npc_luyuan").lastEntryId, null);
});

test("多 NPC 優先級：威脅分類優先於一般合作，但降壓分類優先於恐慌／壓力", () => {
  const pressure = applyAll(
    createReferenceState(reference),
    "我需要 Parker 的扳手，同時對 Lambert 大吼叫她閉嘴",
    ENGINE_SCENE,
    1,
  );
  assert.equal(cooperation(pressure.state, "npc_parker").lastEntryId, "parker_boundary_resource_01");
  assert.equal(cooperation(pressure.state, "npc_lambert").lastEntryId, "lambert_pressure_shout_01");

  const calmed = applyAll(
    pressure.state,
    "我停手，退後降低音量，給 Lambert 空間，並回報 Parker 閥門狀況",
    ENGINE_SCENE,
    2,
  );
  assert.equal(cooperation(calmed.state, "npc_parker").lastEntryId, "parker_deescalate_01");
  assert.equal(cooperation(calmed.state, "npc_lambert").lastEntryId, "lambert_deescalate_space_01");
  assert.equal(cooperation(calmed.state, "npc_lambert").state, "stabilizing");
});

test("跨 NPC 協調：安撫 Lambert 並請 Ripley 指揮時，兩個 decision 會依序保存", () => {
  const result = applyAll(
    createReferenceState(reference),
    "我安撫 Lambert，請 Ripley 說明下一步",
    RIPLEY_SCENE,
    1,
  );
  assert.equal(cooperation(result.state, "npc_ripley").lastEntryId, "ripley_cooperate_lambert_02");
  assert.equal(cooperation(result.state, "npc_lambert").lastEntryId, "lambert_cooperate_reassurance_01");
  assert.equal(cooperation(result.state, "npc_ripley").state, "functional");
  assert.equal(cooperation(result.state, "npc_lambert").state, "stabilizing");
  assert.equal(cooperation(result.state, "npc_parker").lastEntryId, null);
  assert.equal(cooperation(result.state, "npc_luyuan").lastEntryId, null);
});

test("turn.js 與 reference prompt 共同維持明確的四位 NPC 順序", () => {
  const turnSource = readFileSync(new URL("../functions/api/turn.js", import.meta.url), "utf8");
  const start = turnSource.indexOf("const cooperationPolicies = [");
  const end = turnSource.indexOf("for (const applyPolicy of cooperationPolicies)", start);
  assert.ok(start >= 0 && end > start);
  const policyNames = [...turnSource.slice(start, end).matchAll(/apply([A-Za-z]+)ForAction/g)].map((match) => match[1]);
  assert.deepEqual(policyNames, ["NpcCooperation", "RipleyCooperation", "ParkerCooperation", "LambertCooperation"]);

  const adapterSource = readFileSync(new URL("../content/scenario/referenceAdapter.js", import.meta.url), "utf8");
  const adapterStart = adapterSource.indexOf("const npcCooperationBlocks = [");
  const adapterEnd = adapterSource.indexOf("].filter(Boolean);", adapterStart);
  assert.ok(adapterStart >= 0 && adapterEnd > adapterStart);
  const blockNames = [...adapterSource.slice(adapterStart, adapterEnd).matchAll(/build([A-Za-z]+)CooperationPromptBlock/g)].map((match) => match[1]);
  assert.deepEqual(blockNames, ["Npc", "Ripley", "Parker", "Lambert"]);

  const state = applyAll(createReferenceState(reference), "我安撫 Lambert，請 Ripley 說明下一步，也請 Parker 回報工程", RIPLEY_SCENE, 1).state;
  const prompt = buildReferencePromptBlock({
    reference,
    state,
    resolution: { matched: true, scene: reference.scenes.find((scene) => scene.id === RIPLEY_SCENE) },
    actionText: "我安撫 Lambert，請 Ripley 說明下一步，也請 Parker 回報工程",
    turnNumber: 1,
  });
  const promptOrder = [
    '<NPC_Cooperation_Contract npc="npc_ripley">',
    '<NPC_Cooperation_Contract npc="npc_parker">',
    '<NPC_Cooperation_Contract npc="npc_lambert">',
  ].map((marker) => prompt.indexOf(marker));
  assert.ok(promptOrder.every((index) => index >= 0));
  assert.ok(promptOrder[1] > promptOrder[0] && promptOrder[2] > promptOrder[1]);
});

test("四位 NPC 同回合 public response 仍不暴露 cooperation metadata", () => {
  const result = applyAll(
    createReferenceState(reference),
    "我威脅 Parker 立刻拉閥，同時對 Lambert 大吼叫她閉嘴",
    ENGINE_SCENE,
    1,
  );
  const publicState = referenceStateForResponse(reference, result.state);
  assert.equal("npcCooperation" in publicState, false);
  assert.equal("privateAssessment" in publicState, false);
  assert.equal("withheldFacts" in publicState, false);
  assert.equal("lastEntryId" in publicState, false);
});
