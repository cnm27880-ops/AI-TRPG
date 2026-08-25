import test from "node:test";
import assert from "node:assert/strict";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import {
  LAMBERT_ID,
  lambertCooperationProfile,
  lambertCooperationEntries,
  createLambertCooperationState,
  normalizeLambertCooperationState,
  classifyLambertInteraction,
  applyLambertCooperationForAction,
  buildLambertCooperationPromptBlock,
} from "../content/scenario/lambertCooperationPolicy.js";

const LAMBERT_SCENE = "evt_meet_ripley";
const OTHER_SCENE = "evt_deck_a_recon";

function apply(state, actionText, turnNumber, sceneId = LAMBERT_SCENE, targetNpcId = null) {
  return applyLambertCooperationForAction({ reference, state, actionText, sceneId, turnNumber, targetNpcId });
}

function lambertState(state) {
  return state.npcCooperation[LAMBERT_ID];
}

test("Lambert profile 使用恐慌／壓力／群體安全模型，不複製陸遠威脅欄位", () => {
  const profile = lambertCooperationProfile();
  assert.equal(profile.npcId, LAMBERT_ID);
  assert.equal(profile.role, "導航員／壓力反應明顯的船員");
  assert.ok(profile.objectives.length > 0);
  assert.equal(lambertCooperationEntries.length, 14);
  assert.deepEqual(
    [...new Set(lambertCooperationEntries.map((entry) => entry.category))].sort(),
    ["briefing", "cooperation", "deescalation", "pressure"],
  );
  for (const entry of lambertCooperationEntries) assert.equal(entry.npcAction.statePatch, null);
});

test("Lambert 新狀態與舊存檔正規化保留 bounded 欄位並允許負 trust", () => {
  const created = { npcCooperation: createLambertCooperationState() };
  assert.equal(lambertState(created).state, "unmet");
  const normalized = normalizeLambertCooperationState({
    [LAMBERT_ID]: { state: "invalid", trust: -20, fearLevel: 20, lastUpdatedTurn: -4 },
  });
  assert.equal(normalized[LAMBERT_ID].state, "unmet");
  assert.equal(normalized[LAMBERT_ID].trust, -9);
  assert.equal(normalized[LAMBERT_ID].fearLevel, 9);
  assert.equal(normalized[LAMBERT_ID].lastUpdatedTurn, 0);
});

test("Lambert 的正常提問會提供導航／處境事實與低壓下一步", () => {
  const classification = classifyLambertInteraction({ actionText: "我問 Lambert 水仙號的逃生路線", sceneId: LAMBERT_SCENE });
  assert.equal(classification.interactionType, "survival_question");
  assert.equal(classification.topic, "escape_route");
  const result = apply({}, "我問 Lambert 水仙號的逃生路線", 1);
  assert.equal(result.entry.entryId, "lambert_briefing_escape_02");
  assert.match(result.entry.runtimeNarration, /導航|水仙號|逃生/);
  assert.match(result.entry.continuationPrompt, /可以|行動/);
});

test("安撫與可見陪同會降低恐慌，但不宣稱危險已消失", () => {
  const result = apply({}, "我安撫 Lambert，陪她慢慢呼吸並留在她視線內", 1);
  assert.equal(result.classification.interactionType, "offer_reassurance");
  assert.equal(result.entry.entryId, "lambert_cooperate_reassurance_01");
  assert.equal(lambertState(result.state).state, "stabilizing");
  assert.equal(lambertState(result.state).fearLevel, 4);
  assert.doesNotMatch(result.entry.runtimeNarration, /安全了|危險消失|已經沒事/);
});

test("Lambert 第一次被大吼進入 panic，第二次施壓改為 withdrawn", () => {
  const first = apply({}, "我對 Lambert 大吼，叫她閉嘴", 1);
  assert.equal(first.classification.interactionType, "pressure_or_dismissal");
  assert.equal(first.entry.entryId, "lambert_pressure_shout_01");
  assert.equal(lambertState(first.state).state, "panic");
  assert.equal(lambertState(first.state).pressureIncidents, 1);

  const second = apply(first.state, "我再次對 Lambert 大吼，逼她回答", 2);
  assert.equal(second.entry.entryId, "lambert_pressure_threat_02");
  assert.equal(lambertState(second.state).state, "withdrawn");
  assert.equal(lambertState(second.state).pressureIncidents, 2);
  assert.notEqual(first.entry.runtimeNarration, second.entry.runtimeNarration);
  assert.match(second.entry.runtimeNarration, /停止|資料|空間/);
});

test("連續異形聲音只提高 Lambert 壓力，不宣稱異形定位、攻擊或失去行動能力", () => {
  const first = apply({}, "我聽見金屬刮擦聲，告訴 Lambert", 1);
  assert.equal(first.classification.interactionType, "panic_trigger");
  assert.equal(first.entry.entryId, "lambert_pressure_threat_03");
  assert.equal(lambertState(first.state).state, "panic");

  const second = apply(first.state, "我又聽見尖叫聲，Lambert 趕快躲起來", 2);
  assert.equal(second.entry.entryId, "lambert_pressure_threat_04");
  assert.equal(lambertState(second.state).state, "overloaded");
  assert.equal(lambertState(second.state).panicIncidents, 2);
  assert.doesNotMatch(second.entry.runtimeNarration, /昏迷|失去行動|確定在|已經攻擊/);
  assert.equal(second.entry.npcAction.statePatch, null);
});

test("降壓後 Lambert 可以恢復有限溝通，但不抹除恐慌記憶", () => {
  const hostile = apply({}, "我對 Lambert 大吼，叫她閉嘴", 1);
  const repeated = apply(hostile.state, "我再次對 Lambert 大吼，逼她回答", 2);
  const calm = apply(repeated.state, "我退後、降低音量，給 Lambert 一點空間", 3);
  assert.equal(calm.classification.interactionType, "deescalate");
  assert.equal(calm.entry.entryId, "lambert_deescalate_space_01");
  assert.equal(lambertState(calm.state).state, "stabilizing");
  assert.equal(lambertState(calm.state).pressureIncidents, 2);

  const reopened = apply(repeated.state, "我把導航問題縮成一件事，請 Lambert 協助", 3);
  assert.equal(reopened.entry.entryId, "lambert_deescalate_navigation_02");
  assert.equal(lambertState(reopened.state).state, "functional");
});

test("Lambert 明確被問到 Ripley 時不誤更新她的恐慌 state", () => {
  const ripley = classifyLambertInteraction({ actionText: "我問 Ripley 這裡發生什麼事", sceneId: LAMBERT_SCENE });
  assert.equal(ripley.interactionType, "other");
  const parker = classifyLambertInteraction({ actionText: "我找 Parker 處理閥門", sceneId: LAMBERT_SCENE });
  assert.equal(parker.interactionType, "other");
  const ordinary = classifyLambertInteraction({ actionText: "我觀察副控室的通訊設備", sceneId: OTHER_SCENE });
  assert.equal(ordinary.interactionType, "other");
});

test("Lambert cooperation prompt 只在相關場景／目標出現，且 exact-turn 與公開安全規則有效", () => {
  const first = apply({}, "我安撫 Lambert，陪她慢慢呼吸並留在她視線內", 1);
  const current = buildLambertCooperationPromptBlock(reference, first.state, {
    actionText: "我安撫 Lambert，陪她慢慢呼吸並留在她視線內",
    sceneId: LAMBERT_SCENE,
    turnNumber: 1,
  });
  assert.match(current, /本回合已由 server 選定的 Lambert 外在反應/);
  assert.match(current, /不得自行創造|不能自行/);
  assert.doesNotMatch(current, /privateAssessment|withheldFacts|trust\s*[:=]|fearLevel\s*[:=]/);

  const later = buildLambertCooperationPromptBlock(reference, first.state, {
    actionText: "我安撫 Lambert，陪她慢慢呼吸並留在她視線內",
    sceneId: LAMBERT_SCENE,
    turnNumber: 2,
  });
  assert.doesNotMatch(later, /本回合已由 server 選定的 Lambert 外在反應/);

  const other = buildLambertCooperationPromptBlock(reference, first.state, {
    actionText: "我問 Ripley 這裡發生什麼事",
    sceneId: OTHER_SCENE,
    turnNumber: 1,
  });
  assert.equal(other, "");
});
