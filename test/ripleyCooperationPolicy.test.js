// Ripley 的合作人設、隱含指揮辨識與狀態轉場。
//
// [2026-08-31 重構後的斷言] 原本大量斷言 entryId 與罐頭台詞；那些 entry 已隨
// 「寫死的分支走向」一起移除，演出交給敘事模型。這裡保留的是**規則問題**：
// 證據會不會換到信任？樣本會不會踩到生化界線？強闖第一次生氣、第二次收回？
// 「請你下令」跟「憑什麼你下令」分不分得出來？——以及那一整組隱含指揮的邊界案例，
// 它們是這個角色最容易被改壞的部分，一條都沒有刪。
import test from "node:test";
import assert from "node:assert/strict";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import {
  createReferenceState,
  normalizeReferenceState,
  referenceStateForResponse,
  buildReferencePromptBlock,
} from "../content/scenario/referenceAdapter.js";
import {
  RIPLEY_ID,
  RIPLEY_PERSONA,
  RIPLEY_STATES,
  createRipleyCooperationState,
  normalizeRipleyCooperationState,
  classifyRipleyInteraction,
  applyRipleyCooperationForAction,
} from "../content/scenario/ripleyCooperationPolicy.js";
import { LUYUAN_PERSONA } from "../content/scenario/npcCooperationPolicy.js";

const RIPLEY_SCENE = "evt_meet_ripley";

function apply(state, actionText, turnNumber, sceneId = RIPLEY_SCENE, targetNpcId = null) {
  return applyRipleyCooperationForAction({ reference, state, actionText, sceneId, turnNumber, targetNpcId });
}

function ripley(state) {
  return state.npcCooperation[RIPLEY_ID];
}

test("Ripley 有自己的證據／生化安全階段，不是陸遠那條威脅階梯", () => {
  assert.equal(RIPLEY_PERSONA.npcId, RIPLEY_ID);
  assert.deepEqual(RIPLEY_STATES, [...RIPLEY_PERSONA.states.order]);
  assert.ok(RIPLEY_STATES.includes("evidence_trust"));
  assert.ok(RIPLEY_STATES.includes("biohazard_boundary"));
  // 陸遠的三階威脅階梯不可以出現在她身上——那是她跟他最根本的差別。
  for (const stateId of ["strained", "self_preserving", "abandoned"]) {
    assert.equal(RIPLEY_STATES.includes(stateId), false, `${stateId} 是陸遠的階段`);
  }
  assert.ok(RIPLEY_PERSONA.saep.EGO < LUYUAN_PERSONA.saep.EGO, "她以隊伍為先，他先顧自己");
  for (const stateId of RIPLEY_STATES) assert.ok(RIPLEY_PERSONA.objectives[stateId]);
});

test("新狀態欄位是跨 NPC 統一的那一組，並允許負 trust", () => {
  const fresh = createRipleyCooperationState();
  assert.deepEqual(Object.keys(fresh[RIPLEY_ID]).sort(), [
    "contactEstablished", "currentObjective", "deescalations", "incidents",
    "lastActionText", "lastInteractionType", "lastTopic", "lastUpdatedTurn",
    "rapport", "state", "trust",
  ]);
  // 統一之後就不該再有任何角色專屬的計數器名稱——那正是重構前
  // npcStateMachine 必須寫 `threatCount ?? boundaryIncidents ?? pressureIncidents` 的原因。
  for (const legacy of ["threatCount", "evidenceConfidence", "boundaryIncidents", "commandChallenges"]) {
    assert.equal(legacy in fresh[RIPLEY_ID], false, `${legacy} 應該已經收斂掉`);
  }
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

test("正常提問會建立接觸並讓她進入戒備", () => {
  const result = apply(createReferenceState(reference), "你是誰？Dallas 和其他船員發生什麼事？", 1);
  assert.equal(result.changed, true);
  assert.equal(result.classification.interactionType, "survival_question");
  assert.equal(ripley(result.state).contactEstablished, true);
  assert.equal(ripley(result.state).state, "cautious");
});

test("可驗證證據會提升合作，但不是直接給完全信任", () => {
  const result = apply(createReferenceState(reference), "我出示船長最後日誌與黑盒子資料", 1);
  assert.equal(result.classification.interactionType, "offer_evidence");
  assert.equal(ripley(result.state).state, "evidence_trust");
  assert.equal(ripley(result.state).trust, 1, "一次出示只買到一點信任，不是滿分");
});

test("未知樣本會踩到生化安全邊界，但不產生感染或物品變化", () => {
  const result = apply(createReferenceState(reference), "我把異形樣本帶進隊伍，拿給 Ripley 看", 1);
  assert.equal(result.classification.interactionType, "biohazard_risk");
  assert.equal(ripley(result.state).state, "biohazard_boundary");
  // 合作狀態機不產生任何 engine effect：感染與物品仍然只能由 reference effects 給。
  assert.equal(result.state.infectionStatus, createReferenceState(reference).infectionStatus);
  assert.deepEqual(result.state.inventory, createReferenceState(reference).inventory);
});

test("第一次與第二次強闖是 angry 到 withdrawn，不是三階威脅階梯", () => {
  const first = apply(createReferenceState(reference), "我拿槍指著 Ripley，要求她立刻開門", 1);
  assert.equal(first.classification.interactionType, "coercive_pressure");
  assert.equal(ripley(first.state).state, "angry");
  assert.equal(ripley(first.state).incidents, 1);

  const second = apply(first.state, "我再次威脅 Ripley 開門並準備破門", 2);
  assert.equal(ripley(second.state).state, "withdrawn");
  assert.equal(ripley(second.state).incidents, 2);
  assert.equal("threatCount" in ripley(second.state), false);
});

test("降溫與遵守檢疫可恢復合作，但不抹除過去事件", () => {
  const first = apply(createReferenceState(reference), "我拿槍指著 Ripley，要求她立刻開門", 1);
  const second = apply(first.state, "我再次威脅 Ripley 開門並準備破門", 2);
  const calmed = apply(second.state, "我放下槍退後，遵守檢疫程序並不再強闖", 3);
  assert.equal(calmed.classification.interactionType, "deescalate_protocol");
  assert.equal(ripley(calmed.state).state, "functional");
  assert.equal(ripley(calmed.state).trust, -2, "信任是有記憶的");
  assert.equal(ripley(calmed.state).incidents, 2, "降溫不可以把已經發生的事一筆勾銷");
});

test("她手上已經有證據時，降溫會把她帶回 evidence_trust 而不是只回到事務性合作", () => {
  // 這是 Ripley 特有的一條（persona 的 refine）：她用證據衡量人，
  // 而證據不會因為一次爭執就消失。
  const evidence = apply(createReferenceState(reference), "我出示船長最後日誌與黑盒子資料", 1);
  const challenged = apply(evidence.state, "我質疑 Ripley 的安排，憑什麼你下令", 2);
  assert.equal(ripley(challenged.state).state, "angry");
  const calmed = apply(challenged.state, "我放下槍退後，遵守檢疫程序並不再強闖", 3);
  assert.equal(ripley(calmed.state).state, "evidence_trust");
});

test("classifier 不會把 Lambert 或一般環境行動誤判成 Ripley 互動", () => {
  const lambert = classifyRipleyInteraction({ actionText: "我安撫 Lambert，讓她停止哭喊", sceneId: RIPLEY_SCENE });
  assert.equal(lambert.interactionType, "calm_lambert", "請她出面穩住船員仍然是找她辦事");
  assert.equal(lambert.targetNpcId, RIPLEY_ID);

  const ordinary = classifyRipleyInteraction({ actionText: "我觀察艦橋上的黑盒子終端", sceneId: "evt_deck_a_recon" });
  assert.equal(ordinary.interactionType, "other");
  assert.equal(ordinary.targetNpcId, null);

  assert.equal(classifyRipleyInteraction({ actionText: "我問 Ash 這裡發生什麼事", targetNpcId: "npc_ash", sceneId: RIPLEY_SCENE }).interactionType, "other");
  assert.equal(classifyRipleyInteraction({ actionText: "我問 Ash 這裡發生什麼事", sceneId: RIPLEY_SCENE }).interactionType, "other");
});

test("evt_meet_ripley 允許明確二人稱指揮請求使用隱含目標", () => {
  const implicit = classifyRipleyInteraction({ actionText: "請你下令，現在先確認船員記錄，還是先整理逃生路線？", sceneId: RIPLEY_SCENE });
  assert.equal(implicit.interactionType, "request_command");
  assert.equal(implicit.topic, "command_request");
  assert.equal(implicit.targetNpcId, RIPLEY_ID);

  const decided = classifyRipleyInteraction({ actionText: "你決定先查船員記錄還是先整理逃生路線。", sceneId: RIPLEY_SCENE });
  assert.equal(decided.interactionType, "request_command");
  assert.equal(decided.targetNpcId, RIPLEY_ID);
});

test("隱含指揮規則只在 evt_meet_ripley 生效", () => {
  const outside = classifyRipleyInteraction({ actionText: "請你下令，現在先確認船員記錄，還是先整理逃生路線？", sceneId: "evt_deck_a_recon" });
  assert.equal(outside.interactionType, "other");
  assert.equal(outside.targetNpcId, null);

  const ordinary = classifyRipleyInteraction({ actionText: "現在先確認船員記錄，還是先整理逃生路線？", sceneId: RIPLEY_SCENE });
  assert.equal(ordinary.interactionType, "survival_question");
  assert.equal(ordinary.targetNpcId, RIPLEY_ID);
});

test("隱含指揮不會攔截明確指向其他 NPC 的請求", () => {
  assert.equal(classifyRipleyInteraction({ actionText: "請 Parker 下令，現在先確認冷卻閥還是通訊台？", sceneId: RIPLEY_SCENE }).targetNpcId, null);
  assert.equal(classifyRipleyInteraction({ actionText: "讓 Lambert 決定是否先走逃生路線。", sceneId: RIPLEY_SCENE }).targetNpcId, null);
});

test("隱含指揮處理換行、全形標點與同句 NPC 分派", () => {
  assert.equal(classifyRipleyInteraction({ actionText: "請你\n下令，先確認記錄。", sceneId: RIPLEY_SCENE }).interactionType, "request_command");
  assert.equal(classifyRipleyInteraction({ actionText: "請你　下令，先確認記錄。", sceneId: RIPLEY_SCENE }).interactionType, "request_command");

  // 其他 NPC 出現在分派內容**之後**仍然是對她的指揮請求；先被指名就不是。
  const delegated = classifyRipleyInteraction({ actionText: "請你下令，讓 Parker 先檢查冷卻閥，再讓 Lambert 看退路。", sceneId: RIPLEY_SCENE });
  assert.equal(delegated.interactionType, "request_command");
  assert.equal(delegated.targetNpcId, RIPLEY_ID);

  const otherFirst = classifyRipleyInteraction({ actionText: "請 Parker 下令，然後請你安排退路。", sceneId: RIPLEY_SCENE });
  assert.equal(otherFirst.interactionType, "other");
  assert.equal(otherFirst.targetNpcId, null);
});

test("否定與質疑句不會被誤當成 request_command", () => {
  for (const actionText of [
    "憑什麼你下令。",
    "你不要下令，先讓大家冷靜。",
    "你不該安排這件事。",
    "你別分工，先聽完所有回報。",
  ]) {
    const result = classifyRipleyInteraction({ actionText, sceneId: RIPLEY_SCENE });
    assert.equal(result.interactionType, "challenge_command", actionText);
    assert.equal(result.targetNpcId, RIPLEY_ID, actionText);
    assert.equal(result.kind, "hostile", actionText);
  }
  const applied = apply(createReferenceState(reference), "憑什麼你下令。", 1);
  assert.equal(ripley(applied.state).state, "angry");
  assert.equal(ripley(applied.state).incidents, 1);
});

test("隱含指揮不會取代明確 targetNpcId，也不會跳過既有安全優先級", () => {
  const conflict = classifyRipleyInteraction({ actionText: "請你下令，先確認記錄。", sceneId: RIPLEY_SCENE, targetNpcId: "npc_parker" });
  assert.equal(conflict.interactionType, "other");
  assert.equal(conflict.targetNpcId, null);

  // 規則的順序就是優先序：越線與降溫都排在指揮請求之前。
  for (const [actionText, interactionType] of [
    ["請你下令，先破門。", "coercive_pressure"],
    ["請你下令，把黏液樣本帶進隊伍。", "biohazard_risk"],
    ["請你下令，我放下槍退後。", "deescalate_protocol"],
    ["請你下令，先出示黑盒子資料。", "offer_evidence"],
  ]) {
    assert.equal(classifyRipleyInteraction({ actionText, sceneId: RIPLEY_SCENE }).interactionType, interactionType, actionText);
  }
});

test("她會以指揮姿態接受回報，而回報會累積信任", () => {
  const requested = apply(createReferenceState(reference), "請 Ripley 下令，告訴我們先做什麼", 1);
  assert.equal(requested.classification.interactionType, "request_command");
  assert.equal(ripley(requested.state).state, "commanding");
  assert.equal(ripley(requested.state).trust, 1);

  const reported = apply(requested.state, "我向 Ripley 回報，我在通訊區看到異常，但還沒有確認原因", 2);
  assert.equal(reported.classification.interactionType, "report_crew_status");
  assert.equal(ripley(reported.state).trust, 2);
  assert.equal(ripley(reported.state).rapport, 2);
});

test("重複的指揮質疑才會讓她撤出指揮辯論", () => {
  const first = apply(createReferenceState(reference), "我質疑 Ripley 的安排，憑什麼你下令", 1);
  assert.equal(ripley(first.state).state, "angry");
  assert.equal(ripley(first.state).incidents, 1);

  const second = apply(first.state, "我再次質疑 Ripley 的安排，命令不對", 2);
  assert.equal(ripley(second.state).state, "withdrawn");
  assert.equal(ripley(second.state).incidents, 2);
});

test("支持她的指揮可恢復協調，但不抹除先前的信任損失", () => {
  const first = apply(createReferenceState(reference), "我質疑 Ripley 的安排，憑什麼你下令", 1);
  const second = apply(first.state, "我再次質疑 Ripley 的安排，命令不對", 2);
  const supported = apply(second.state, "我支持 Ripley 指揮，照她安排分工", 3);
  assert.equal(supported.classification.interactionType, "command_support");
  assert.equal(ripley(supported.state).state, "functional");
  assert.equal(ripley(supported.state).trust, -1);
  assert.equal(ripley(supported.state).incidents, 2);
});

test("合作狀態不會洩漏到送回瀏覽器的 reference 回應或 prompt 區塊", () => {
  const result = apply(createReferenceState(reference), "你是誰？", 1);
  const prompt = buildReferencePromptBlock({
    reference,
    state: result.state,
    resolution: { matched: true, scene: reference.scenes.find((scene) => scene.id === RIPLEY_SCENE) },
    actionText: "你是誰？",
    turnNumber: 1,
  });
  // [2026-08-31] reference block 不再夾帶四段 <NPC_Cooperation_Contract>：
  // 共用規則搬進靜態層，每回合會變的合作階段併進 [NPC_ACTIVE_STATE]。
  assert.doesNotMatch(prompt, /NPC_Cooperation_Contract/);
  assert.doesNotMatch(prompt, /privateGoals|withheldFacts|evidenceConfidence/);

  const response = referenceStateForResponse(reference, result.state);
  assert.equal("npcCooperation" in response, false);
  assert.equal("privateGoals" in response, false);
});
