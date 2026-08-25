import assert from "node:assert/strict";
import test from "node:test";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import luyuanCooperation from "../content/scenario/examples/alienNostromo_v2_luyuanCooperation.js";
import {
  createReferenceState,
  normalizeReferenceState,
  referenceStateForResponse,
  buildReferencePromptBlock,
} from "../content/scenario/referenceAdapter.js";
import {
  createNpcCooperationState,
  normalizeNpcCooperationState,
  classifyNpcInteraction,
  applyNpcCooperationForAction,
  buildNpcCooperationPromptBlock,
} from "../content/scenario/npcCooperationPolicy.js";

const START_SCENE = "evt_deck_a_recon";
const Luyuan = "npc_luyuan";

test("Pilot Pack 保留 8 類各 4 筆 entry，所有 runtime action 均沒有 statePatch", () => {
  assert.equal(luyuanCooperation.entries.length, 32);
  const categoryCounts = Object.groupBy(luyuanCooperation.entries, (entry) => entry.category);
  assert.deepEqual(Object.fromEntries(Object.entries(categoryCounts).map(([category, entries]) => [category, entries.length])), {
    briefing: 4,
    cooperation: 4,
    refusal: 4,
    firstThreat: 4,
    secondThreat: 4,
    selfPreserving: 4,
    deescalation: 4,
    autonomousAction: 4,
  });
  assert.equal(luyuanCooperation.entries.every((entry) => entry.npcAction?.statePatch === null), true);
  assert.equal(luyuanCooperation.entries.every((entry) => entry.candidateCanonicalBindings?.length === 0), true);
  const triggerTypes = new Set(luyuanCooperation.entries.map((entry) => entry.trigger?.interactionType));
  for (const expected of [
    "survival_question",
    "offer_scout",
    "offer_repair_or_operate",
    "offer_carry_supplies",
    "offer_rear_guard",
    "express_distrust",
    "reject_path",
    "declare_solo",
    "passive_questioning",
    "attempt_grab_weapon",
    "sudden_rush",
    "physical_push",
    "verbal_intimidation",
    "player_step_back",
    "admit_panic",
    "apologize_and_cooperate",
    "complete_assigned_task",
    "post_answer_routine",
  ]) assert.equal(triggerTypes.has(expected), true, `${expected} 應有對應 entry`);
});

function apply(state, actionText, turnNumber, extra = {}) {
  return applyNpcCooperationForAction({
    reference,
    state,
    actionText,
    sceneId: START_SCENE,
    turnNumber,
    ...extra,
  });
}

test("新狀態與舊存檔正規化會建立 bounded 陸遠 cooperation state", () => {
  const fresh = createReferenceState(reference);
  assert.equal(fresh.npcCooperation[Luyuan].state, "briefing");
  assert.equal(fresh.npcCooperation[Luyuan].trust, 1);
  const legacy = normalizeReferenceState(reference, {
    ...fresh,
    npcCooperation: undefined,
  });
  assert.equal(legacy.npcCooperation[Luyuan].state, "briefing");
  assert.equal(normalizeNpcCooperationState({ [Luyuan]: { trust: -4 } })[Luyuan].trust, -4);
  assert.equal(normalizeNpcCooperationState({ [Luyuan]: { trust: -40 } })[Luyuan].trust, -9);
});

test("求生提問會得到 briefing directive，而非只有空泛喝斥", () => {
  const result = apply(createReferenceState(reference), "你是誰，我為什麼會在這裡？", 1);
  assert.equal(result.changed, true);
  assert.equal(result.entry.entryId, "luyuan_briefing_identity_01");
  assert.equal(result.state.npcCooperation[Luyuan].briefingGiven, true);
  assert.match(result.entry.narration.full, /叫陸遠|怪物|盯好|走廊/);
  assert.match(result.entry.continuationPrompt, /跟上|繼續提問|其他行動/);
  const prompt = buildNpcCooperationPromptBlock(reference, result.state, {
    actionText: "你是誰，我為什麼會在這裡？",
    sceneId: START_SCENE,
    turnNumber: 1,
  });
  assert.match(prompt, /必要事實|可執行的下一步/);
  assert.match(prompt, /經安全審查的原始演出素材/);
  assert.doesNotMatch(prompt, /privateAssessment|withheldFacts|raw state/);
});

test("詢問陸遠手上的槍不會被分類成搶槍", () => {
  const classification = classifyNpcInteraction({
    actionText: "我問陸遠手上的槍是哪裡來的？",
    targetNpcId: Luyuan,
    sceneId: START_SCENE,
  });
  assert.equal(classification.isThreat, false);
  assert.notEqual(classification.interactionType, "attempt_grab_weapon");
  assert.equal(classification.interactionType, "survival_question");
});

test("第一次搶槍進入 strained 警告，第二次撲向進入 self_preserving 合作降級", () => {
  const first = apply(createReferenceState(reference), "試著搶奪男人的手槍", 1);
  assert.equal(first.classification.interactionType, "attempt_grab_weapon");
  assert.equal(first.entry.entryId, "luyuan_threat1_grab_gun_01");
  assert.equal(first.state.npcCooperation[Luyuan].state, "strained");
  assert.equal(first.state.npcCooperation[Luyuan].threatCount, 1);
  assert.equal(first.state.npcCooperation[Luyuan].warningsIssued, 1);

  const second = apply(first.state, "繼續朝他撲去", 2);
  assert.equal(second.classification.interactionType, "sudden_rush");
  assert.equal(second.entry.entryId, "luyuan_threat2_repeat_rush_02");
  assert.equal(second.state.npcCooperation[Luyuan].state, "self_preserving");
  assert.equal(second.state.npcCooperation[Luyuan].threatCount, 2);
  const secondPrompt = buildNpcCooperationPromptBlock(reference, second.state, {
    actionText: "繼續朝他撲去",
    sceneId: START_SCENE,
    turnNumber: 2,
  });
  assert.match(secondPrompt, /停止資訊|合作|拉開|自保/);
  assert.match(secondPrompt, /不得自行創造：玩家或 NPC 的傷勢、死亡、位置改變/);
});

test("第三次持續威脅會切斷協作，但不授權傷害、死亡或戰鬥結果", () => {
  const first = apply(createReferenceState(reference), "試著搶奪男人的手槍", 1);
  const second = apply(first.state, "繼續朝他撲去", 2);
  const third = apply(second.state, "繼續朝他撲去", 3);
  assert.equal(third.entry.entryId, "luyuan_threat3_abandon_route_02");
  assert.equal(third.state.npcCooperation[Luyuan].state, "abandoned");
  assert.equal(third.state.npcCooperation[Luyuan].threatCount, 3);
  assert.equal(third.state.npcCooperation[Luyuan].consecutiveThreats, 3);
  const prompt = buildNpcCooperationPromptBlock(reference, third.state, {
    actionText: "繼續朝他撲去",
    sceneId: START_SCENE,
    turnNumber: 3,
  });
  assert.match(prompt, /切斷|自保|放棄/);
  assert.match(prompt, /不得自行創造：玩家或 NPC 的傷勢、死亡、位置改變/);
  assert.doesNotMatch(prompt, /statePatch|npcStatusChanges|itemsAdd|threatDelta/);
});

test("玩家退後或道歉會降低當下緊張，但不把 trust 恢復成初始值", () => {
  const first = apply(createReferenceState(reference), "試著搶奪男人的手槍", 1);
  const second = apply(first.state, "繼續朝他撲去", 2);
  const calmed = apply(second.state, "我退後並道歉，表示我只是害怕", 3);
  assert.equal(calmed.entry.category, "deescalation");
  assert.equal(calmed.entry.entryId, "luyuan_deesc_step_back_01");
  assert.equal(calmed.state.npcCooperation[Luyuan].state, "functional");
  assert.equal(calmed.state.npcCooperation[Luyuan].consecutiveThreats, 0);
  assert.equal(calmed.state.npcCooperation[Luyuan].threatCount, 2);
  assert.equal(calmed.state.npcCooperation[Luyuan].trust, -1);
});

test("相同 action 在較晚回合不會重播之前回合的 entry narration", () => {
  const first = apply(createReferenceState(reference), "試著搶奪男人的手槍", 1);
  const sameLater = buildNpcCooperationPromptBlock(reference, first.state, {
    actionText: "試著搶奪男人的手槍",
    sceneId: START_SCENE,
    turnNumber: 2,
  });
  assert.doesNotMatch(sameLater, /本回合已由 server 選定的陸遠外在反應/);
  assert.match(sameLater, /不能因這段資料自行新增任何 engine effect/);
});

test("policy 只對 Alien V2 的陸遠生效，普通自由行動與其他 NPC 不會被改寫", () => {
  const initial = createReferenceState(reference);
  const ordinary = apply(initial, "我觀察休眠艙與通風管道", 1);
  assert.equal(ordinary.changed, false);
  assert.equal(ordinary.classification.interactionType, "other");
  const ash = apply(initial, "我問 Ash 這裡發生什麼事？", 1, { targetNpcId: "npc_ash" });
  assert.equal(ash.changed, false);
  const otherPack = applyNpcCooperationForAction({
    reference: { ...reference, sourcePackId: "scenario.other" },
    state: initial,
    actionText: "你是誰？",
    sceneId: START_SCENE,
    turnNumber: 1,
  });
  assert.equal(otherPack.changed, false);
});

test("reference public response 不暴露 npcCooperation 或 policy 私密欄位", () => {
  const state = apply(createReferenceState(reference), "你是誰？", 1).state;
  const response = referenceStateForResponse(reference, state);
  assert.equal("npcCooperation" in response, false);
  assert.equal("privateAssessment" in response, false);
  assert.equal("withheldFacts" in response, false);
  const prompt = buildReferencePromptBlock({
    reference,
    state,
    resolution: { matched: false },
    applied: null,
    actionText: "你是誰？",
    turnNumber: 1,
  });
  assert.match(prompt, /<NPC_Cooperation_Contract>/);
  assert.doesNotMatch(prompt, /privateAssessment|withheldFacts/);
});
