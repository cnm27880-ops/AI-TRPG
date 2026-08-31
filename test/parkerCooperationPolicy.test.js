// Parker 的合作人設與狀態轉場。
//
// [2026-08-31 重構後的斷言] 原本斷言的是 entryId 與罐頭台詞；那些 entry 已隨
// 「寫死的分支走向」一起移除。這裡改問規則層面的同一批問題：
// 具體維修提議會不會換到合作？伸手要工具會不會踩到他的資源邊界？
// 拿槍逼他會不會第一次生氣、第二次收工？降溫會不會抹掉紀錄？
import test from "node:test";
import assert from "node:assert/strict";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import {
  PARKER_ID,
  PARKER_PERSONA,
  PARKER_STATES,
  createParkerCooperationState,
  normalizeParkerCooperationState,
  classifyParkerInteraction,
  applyParkerCooperationForAction,
} from "../content/scenario/parkerCooperationPolicy.js";
import { LUYUAN_PERSONA } from "../content/scenario/npcCooperationPolicy.js";

const ENGINE_SCENE = "evt_trigger_overload";
const OTHER_SCENE = "evt_deck_a_recon";

function apply(state, actionText, turnNumber, sceneId = ENGINE_SCENE, targetNpcId = null) {
  return applyParkerCooperationForAction({ reference, state, actionText, sceneId, turnNumber, targetNpcId });
}

function parkerState(state) {
  return state.npcCooperation[PARKER_ID];
}

test("Parker 用自己的工程／可靠工作階段，不是陸遠那條威脅階梯", () => {
  assert.equal(PARKER_PERSONA.npcId, PARKER_ID);
  assert.deepEqual(PARKER_STATES, [...PARKER_PERSONA.states.order]);
  const shared = PARKER_STATES.filter((id) => LUYUAN_PERSONA.states.order.includes(id));
  assert.deepEqual(shared, ["functional"], "只有最中性的 functional 可以共用");
  for (const stateId of PARKER_STATES) assert.ok(PARKER_PERSONA.objectives[stateId]);
  // 他對亂動設備的容忍度低於陸遠對拖時間的容忍度，這是他最好認的一個特徵。
  assert.ok(PARKER_PERSONA.saep.PAT < LUYUAN_PERSONA.saep.PAT);
});

test("新狀態與舊存檔正規化保留 bounded 欄位並允許負 trust", () => {
  const created = { npcCooperation: createParkerCooperationState() };
  assert.equal(parkerState(created).state, "unmet");
  const normalized = normalizeParkerCooperationState({
    [PARKER_ID]: { state: "invalid", trust: -20, incidents: 20, lastUpdatedTurn: -4 },
  });
  assert.equal(normalized[PARKER_ID].state, "unmet");
  assert.equal(normalized[PARKER_ID].trust, -9);
  assert.equal(normalized[PARKER_ID].incidents, 9);
  assert.equal(normalized[PARKER_ID].lastUpdatedTurn, 0);
});

test("工程區求生提問會辨識出工程話題並讓他進入 busy", () => {
  const classification = classifyParkerInteraction({ actionText: "我問 Parker 工程區現在怎麼回事", sceneId: ENGINE_SCENE });
  assert.equal(classification.interactionType, "survival_question");
  assert.equal(classification.topic, "engineering_status");
  assert.equal(parkerState(apply({}, "我問 Parker 工程區現在怎麼回事", 1).state).state, "busy");
});

test("純敘述文字不會因為含有「自毀」兩個字就被當成提問", () => {
  // 這是重構時真的踩到的一個回歸：把「超載話題」與「疑問語氣」兩個條件併成一個
  // 正則之後，NPC 的角色描述「工程師／自毀程序協助者」也會被判成玩家在問問題。
  const classification = classifyParkerInteraction({ actionText: "工程師／自毀程序協助者", sceneId: ENGINE_SCENE });
  assert.equal(classification.interactionType, "other");
});

test("具體維修提議會換到可回報的工作關係", () => {
  const result = apply({}, "我來檢查冷卻閥並回報壓力", 1);
  assert.equal(result.classification.interactionType, "offer_repair");
  assert.equal(result.classification.kind, "cooperation");
  assert.equal(parkerState(result.state).state, "functional");
  assert.equal(parkerState(result.state).rapport, 1);
});

test("伸手要工具會踩到資源邊界，而不是自行發放物品", () => {
  const result = apply({}, "我需要借用 Parker 的扳手", 1);
  assert.equal(result.classification.interactionType, "resource_pressure");
  assert.equal(parkerState(result.state).state, "resource_guarded");
  // 合作狀態機不產生任何 engine effect：物品仍然只能由 reference effects 給。
  assert.equal(result.state.inventory, undefined);
});

test("第一次施壓直率拒絕，第二次施壓改為撤回工程支援", () => {
  const first = apply({}, "我拿槍指著 Parker，逼他立刻拉閥", 1);
  assert.equal(first.classification.interactionType, "coercive_pressure");
  assert.equal(parkerState(first.state).state, "angry");
  assert.equal(parkerState(first.state).incidents, 1);

  const second = apply(first.state, "我再次威脅 Parker，叫他滾開", 2);
  assert.equal(parkerState(second.state).state, "withdrawn");
  assert.equal(parkerState(second.state).incidents, 2);
});

test("未說明的亂動閥門會被標成工程干擾風險，但不創造設備結果", () => {
  const result = apply({}, "我故意亂拉閥門，想把程序弄亂", 1);
  assert.equal(result.classification.interactionType, "sabotage_risk");
  assert.equal(parkerState(result.state).state, "resource_guarded");
  assert.equal(result.state.flags, undefined);
});

test("停止施壓並回報工作可恢復有限合作，但不抹除既有事件", () => {
  const hostile = apply({}, "我拿槍指著 Parker，逼他立刻拉閥", 1);
  const repeated = apply(hostile.state, "我再次威脅 Parker，叫他滾開", 2);
  const calm = apply(repeated.state, "我停手，先回報閥門狀況並照程序做", 3);
  assert.equal(calm.classification.interactionType, "deescalate_and_work");
  assert.equal(parkerState(calm.state).state, "functional");
  assert.equal(parkerState(calm.state).incidents, 2, "降溫不可以把已經發生的事一筆勾銷");
});

test("他生氣之後不再接工作：轉場的 onlyFrom 會擋掉", () => {
  const hostile = apply({}, "我拿槍指著 Parker，逼他立刻拉閥", 1);
  const repair = apply(hostile.state, "我來檢查冷卻閥並回報壓力", 2);
  assert.equal(repair.changed, false);
  assert.equal(parkerState(hostile.state).state, "angry");
});

test("其他副本、其他 NPC 或無關地點不會誤觸發", () => {
  assert.equal(classifyParkerInteraction({ actionText: "我問 Ripley 工程區發生什麼事", sceneId: ENGINE_SCENE }).interactionType, "other");
  assert.equal(apply({}, "我檢查工程設備", 1, OTHER_SCENE).changed, false);

  // 明確 targetNpcId 可以跨過場景 gate——那是引擎自己指定的對象，不是猜的。
  const explicit = apply({ npcCooperation: createParkerCooperationState() }, "我問 Parker 閥門怎麼辦", 1, ENGINE_SCENE, PARKER_ID);
  assert.equal(explicit.changed, true);
  assert.equal(parkerState(explicit.state).state, "busy");

  const otherPack = applyParkerCooperationForAction({
    reference: { sourcePackId: "scenario.other" },
    state: {},
    actionText: "我問 Parker 閥門怎麼辦",
    sceneId: ENGINE_SCENE,
    turnNumber: 1,
    targetNpcId: PARKER_ID,
  });
  assert.equal(otherPack.changed, false);
});
