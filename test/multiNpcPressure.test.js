// 多 NPC 同回合的壓力測試。
//
// [2026-08-31 重構後的斷言] entryId 換成 interactionType：那些寫死的 entry 已經移除，
// 但這一組真正在問的問題沒有變——同一句話同時踩到兩個 NPC 時，兩個人會不會各自
// 進到**自己的**階段，而不是互相覆蓋 state。那才是這個檔案存在的理由。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import { createReferenceState, referenceStateForResponse, buildReferencePromptBlock } from "../content/scenario/referenceAdapter.js";
import { applyNpcCooperationForAction } from "../content/scenario/npcCooperationPolicy.js";
import { applyRipleyCooperationForAction } from "../content/scenario/ripleyCooperationPolicy.js";
import { applyParkerCooperationForAction } from "../content/scenario/parkerCooperationPolicy.js";
import { applyLambertCooperationForAction } from "../content/scenario/lambertCooperationPolicy.js";
import { NPC_PERSONAS } from "../content/scenario/npcPersonaRegistry.js";
import { buildNpcCooperationContract } from "../content/scenario/npcCooperationContract.js";

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
  assert.equal(cooperation(result.state, "npc_luyuan").lastInteractionType, null);
  assert.equal(cooperation(result.state, "npc_ripley").lastInteractionType, null);
  assert.equal(cooperation(result.state, "npc_parker").lastInteractionType, "coercive_pressure");
  assert.equal(cooperation(result.state, "npc_parker").state, "angry");
  assert.equal(cooperation(result.state, "npc_parker").incidents, 1);
  assert.equal(cooperation(result.state, "npc_lambert").lastInteractionType, "pressure_or_dismissal");
  assert.equal(cooperation(result.state, "npc_lambert").state, "panic");
  assert.equal(cooperation(result.state, "npc_lambert").incidents, 1);
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

  assert.equal(cooperation(second.state, "npc_parker").lastInteractionType, "coercive_pressure");
  assert.equal(cooperation(second.state, "npc_parker").state, "withdrawn");
  assert.equal(cooperation(second.state, "npc_parker").incidents, 2);
  assert.equal(cooperation(second.state, "npc_lambert").lastInteractionType, "pressure_or_dismissal");
  assert.equal(cooperation(second.state, "npc_lambert").state, "withdrawn");
  assert.equal(cooperation(second.state, "npc_lambert").incidents, 2);
  assert.equal(cooperation(second.state, "npc_ripley").lastInteractionType, null);
  assert.equal(cooperation(second.state, "npc_luyuan").lastInteractionType, null);
});

test("多 NPC 優先級：威脅分類優先於一般合作，但降壓分類優先於恐慌／壓力", () => {
  const pressure = applyAll(
    createReferenceState(reference),
    "我需要 Parker 的扳手，同時對 Lambert 大吼叫她閉嘴",
    ENGINE_SCENE,
    1,
  );
  assert.equal(cooperation(pressure.state, "npc_parker").lastInteractionType, "resource_pressure");
  assert.equal(cooperation(pressure.state, "npc_lambert").lastInteractionType, "pressure_or_dismissal");

  const calmed = applyAll(
    pressure.state,
    "我停手，退後降低音量，給 Lambert 空間，並回報 Parker 閥門狀況",
    ENGINE_SCENE,
    2,
  );
  assert.equal(cooperation(calmed.state, "npc_parker").lastInteractionType, "deescalate_and_work");
  assert.equal(cooperation(calmed.state, "npc_lambert").lastInteractionType, "deescalate");
  assert.equal(cooperation(calmed.state, "npc_lambert").state, "stabilizing");
});

test("跨 NPC 協調：安撫 Lambert 並請 Ripley 指揮時，兩個 decision 會依序保存", () => {
  const result = applyAll(
    createReferenceState(reference),
    "我安撫 Lambert，請 Ripley 說明下一步",
    RIPLEY_SCENE,
    1,
  );
  assert.equal(cooperation(result.state, "npc_ripley").lastInteractionType, "calm_lambert");
  assert.equal(cooperation(result.state, "npc_lambert").lastInteractionType, "offer_reassurance");
  assert.equal(cooperation(result.state, "npc_ripley").state, "functional");
  assert.equal(cooperation(result.state, "npc_lambert").state, "stabilizing");
  assert.equal(cooperation(result.state, "npc_parker").lastInteractionType, null);
  assert.equal(cooperation(result.state, "npc_luyuan").lastInteractionType, null);
});

test("turn.js 與 reference prompt 共同維持明確的四位 NPC 順序", () => {
  const turnSource = readFileSync(new URL("../functions/api/turn.js", import.meta.url), "utf8");
  const start = turnSource.indexOf("const cooperationPolicies = [");
  const end = turnSource.indexOf("for (const applyPolicy of cooperationPolicies)", start);
  assert.ok(start >= 0 && end > start);
  const policyNames = [...turnSource.slice(start, end).matchAll(/apply([A-Za-z]+)ForAction/g)].map((match) => match[1]);
  assert.deepEqual(policyNames, ["NpcCooperation", "RipleyCooperation", "ParkerCooperation", "LambertCooperation"]);

  // [2026-08-31] referenceAdapter 不再拼接四段 <NPC_Cooperation_Contract>：
  // 共用規則搬進靜態層（npcCooperationContract.js），每回合會變的合作階段
  // 併進 npcStateMachine 的 [NPC_ACTIVE_STATE]。這裡改成檢查靜態契約的人設順序——
  // 靜態層的內容只要順序變動就整段 cache miss，所以順序仍然要被釘住。
  const personaOrder = NPC_PERSONAS.map((persona) => persona.npcId);
  assert.deepEqual(personaOrder.slice(0, 4), ["npc_luyuan", "npc_ripley", "npc_parker", "npc_lambert"]);

  // 靜態契約的順序來自 reference.npcs（每個副本各自的固定陣列），不是登記處的順序——
  // 侏羅紀那三名 NPC 不在登記處裡，但一樣要有固定檔案。
  const contract = buildNpcCooperationContract(reference);
  const contractOrder = reference.npcs.map((npc) => contract.indexOf(npc.id));
  assert.ok(contractOrder.every((index) => index >= 0), "reference 宣告的每個 NPC 都要有固定檔案");
  for (let i = 1; i < contractOrder.length; i += 1) {
    assert.ok(contractOrder[i] > contractOrder[i - 1], "順序必須跟著 reference.npcs 的固定陣列，不可以是 Object.keys()");
  }
  // 同一份 reference 產生的契約必須逐字相同——這是它能待在 system message 的前提。
  assert.equal(contract, buildNpcCooperationContract(reference));

  const state = applyAll(createReferenceState(reference), "我安撫 Lambert，請 Ripley 說明下一步，也請 Parker 回報工程", RIPLEY_SCENE, 1).state;
  const prompt = buildReferencePromptBlock({
    reference,
    state,
    resolution: { matched: true, scene: reference.scenes.find((scene) => scene.id === RIPLEY_SCENE) },
    actionText: "我安撫 Lambert，請 Ripley 說明下一步，也請 Parker 回報工程",
    turnNumber: 1,
  });
  assert.doesNotMatch(prompt, /NPC_Cooperation_Contract/, "合作契約已經是靜態層的一段，不該再出現在每回合的 reference block");
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
  assert.equal("lastInteractionType" in publicState, false);
});

test("明確點名某個 NPC 的話，不會同時記到旁邊那個人頭上", () => {
  // [2026-08-31] 這是一個沉默的誤判：四份人設各自維護一份「玩家在對誰說話」的動詞清單，
  // 而它們已經漂開了（陸遠那份有「威脅」，Lambert 那份沒有）。後果是
  // 「我再次威脅 Parker，叫他滾開」在 Ripley 的場景裡被算成**對 Lambert 大吼**，
  // 於是她無緣無故進入 panic。動詞清單收成一份聯集之後才修掉。
  const state = applyAll(createReferenceState(reference), "我再次威脅 Parker，叫他滾開", RIPLEY_SCENE, 1);
  for (const npcId of ["npc_ripley", "npc_lambert", "npc_luyuan"]) {
    assert.equal(cooperation(state.state, npcId).lastInteractionType, null, `${npcId} 不該被算進去`);
  }

  // 同一句話同時點名兩個人時，兩個人都要算——別名優先於「在對別人說話」的判斷。
  const both = applyAll(createReferenceState(reference), "我威脅 Parker 立刻拉閥，同時對 Lambert 大吼叫她閉嘴", ENGINE_SCENE, 1);
  assert.equal(cooperation(both.state, "npc_parker").lastInteractionType, "coercive_pressure");
  assert.equal(cooperation(both.state, "npc_lambert").lastInteractionType, "pressure_or_dismissal");
  assert.equal(cooperation(both.state, "npc_ripley").lastInteractionType, null);
});
