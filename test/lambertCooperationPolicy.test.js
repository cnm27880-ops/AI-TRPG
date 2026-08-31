// Lambert 的合作人設與狀態轉場。
//
// [2026-08-31 重構後的斷言] 這一組原本大量斷言 entryId 與罐頭台詞
// （`assert.equal(result.entry.entryId, "lambert_pressure_shout_01")`）。
// 那些 entry 已經移除：它們是寫死的分支走向，而演出現在交給敘事模型。
//
// 新的斷言問的是**同一批問題的規則版本**：大吼會不會讓她進恐慌？再吼一次會不會讓她封閉？
// 降溫會不會抹掉她的記憶？別人的名字會不會誤觸發她？——這些才是引擎該保證的東西。
// 被拿掉的只有「她會不會講出那一句預先寫好的台詞」，而那本來就不該由測試釘住。
import test from "node:test";
import assert from "node:assert/strict";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import {
  LAMBERT_ID,
  LAMBERT_PERSONA,
  LAMBERT_STATES,
  createLambertCooperationState,
  normalizeLambertCooperationState,
  classifyLambertInteraction,
  applyLambertCooperationForAction,
} from "../content/scenario/lambertCooperationPolicy.js";
import { LUYUAN_PERSONA } from "../content/scenario/npcCooperationPolicy.js";

const LAMBERT_SCENE = "evt_meet_ripley";
const OTHER_SCENE = "evt_deck_a_recon";

function apply(state, actionText, turnNumber, sceneId = LAMBERT_SCENE, targetNpcId = null) {
  return applyLambertCooperationForAction({ reference, state, actionText, sceneId, turnNumber, targetNpcId });
}

function lambertState(state) {
  return state.npcCooperation[LAMBERT_ID];
}

test("Lambert 用自己的恐慌／安全感階段，不是陸遠那條威脅階梯", () => {
  assert.equal(LAMBERT_PERSONA.npcId, LAMBERT_ID);
  assert.deepEqual(LAMBERT_STATES, [...LAMBERT_PERSONA.states.order]);
  // 兩個角色的階段名稱不可以重疊成同一套——重疊就代表人設被抄成同一個人。
  const shared = LAMBERT_STATES.filter((id) => LUYUAN_PERSONA.states.order.includes(id));
  assert.deepEqual(shared, ["functional"], "只有最中性的 functional 可以共用");
  // 每個階段都要有自己的 objective，否則 prompt 會出現空的 Agenda。
  for (const stateId of LAMBERT_STATES) assert.ok(LAMBERT_PERSONA.objectives[stateId]);
  // 她的主導權基線必須低於陸遠：那是這兩個角色最核心的差別。
  assert.ok(LAMBERT_PERSONA.saep.ACT < LUYUAN_PERSONA.saep.ACT);
});

test("新狀態與舊存檔正規化保留 bounded 欄位並允許負 trust", () => {
  const created = { npcCooperation: createLambertCooperationState() };
  assert.equal(lambertState(created).state, "unmet");
  const normalized = normalizeLambertCooperationState({
    [LAMBERT_ID]: { state: "invalid", trust: -20, incidents: 20, lastUpdatedTurn: -4 },
  });
  assert.equal(normalized[LAMBERT_ID].state, "unmet", "認不得的狀態要退回初始，不可以原樣送進 prompt");
  assert.equal(normalized[LAMBERT_ID].trust, -9);
  assert.equal(normalized[LAMBERT_ID].incidents, 9);
  assert.equal(normalized[LAMBERT_ID].lastUpdatedTurn, 0);
});

test("問她逃生路線會把她推向 seeking_safety，其他提問只是把焦慮講出來", () => {
  const classification = classifyLambertInteraction({ actionText: "我問 Lambert 水仙號的逃生路線", sceneId: LAMBERT_SCENE });
  assert.equal(classification.interactionType, "survival_question");
  assert.equal(classification.topic, "escape_route");
  assert.equal(classification.kind, "briefing");

  const escape = apply({}, "我問 Lambert 水仙號的逃生路線", 1);
  assert.equal(lambertState(escape.state).state, "seeking_safety");

  const other = apply({}, "我問 Lambert 這裡是怎麼回事", 1);
  assert.equal(lambertState(other.state).state, "anxious");
});

test("安撫與可見陪同會讓她穩下來", () => {
  const result = apply({}, "我安撫 Lambert，陪她慢慢呼吸並留在她視線內", 1);
  assert.equal(result.classification.interactionType, "offer_reassurance");
  assert.equal(result.classification.kind, "cooperation");
  assert.equal(lambertState(result.state).state, "stabilizing");
  assert.equal(lambertState(result.state).rapport, 1);
});

test("第一次被大吼進入 panic，第二次施壓改為 withdrawn", () => {
  const first = apply({}, "我對 Lambert 大吼，叫她閉嘴", 1);
  assert.equal(first.classification.interactionType, "pressure_or_dismissal");
  assert.equal(lambertState(first.state).state, "panic");
  assert.equal(lambertState(first.state).incidents, 1);

  const second = apply(first.state, "我再次對 Lambert 大吼，逼她回答", 2);
  assert.equal(lambertState(second.state).state, "withdrawn");
  assert.equal(lambertState(second.state).incidents, 2);
});

test("連續的異形聲音只提高壓力，不會讓她跳過階段直接封閉", () => {
  const first = apply({}, "我聽見金屬刮擦聲，告訴 Lambert", 1);
  assert.equal(first.classification.interactionType, "panic_trigger");
  assert.equal(lambertState(first.state).state, "panic");

  const second = apply(first.state, "我又聽見尖叫聲，Lambert 趕快躲起來", 2);
  assert.equal(lambertState(second.state).state, "overloaded");
  assert.equal(lambertState(second.state).incidents, 2);
});

test("降壓後可以恢復有限溝通，但不抹除已經發生過的壓力紀錄", () => {
  const hostile = apply({}, "我對 Lambert 大吼，叫她閉嘴", 1);
  const repeated = apply(hostile.state, "我再次對 Lambert 大吼，逼她回答", 2);

  const calm = apply(repeated.state, "我退後、降低音量，給 Lambert 一點空間", 3);
  assert.equal(calm.classification.interactionType, "deescalate");
  assert.equal(lambertState(calm.state).state, "stabilizing");
  // 這是這一組最重要的一條：階段回得來，紀錄回不去。
  assert.equal(lambertState(calm.state).incidents, 2, "降溫不可以把已經發生的事一筆勾銷");

  const reopened = apply(repeated.state, "我把導航問題縮成一件事，請 Lambert 協助", 3);
  assert.equal(lambertState(reopened.state).state, "functional");
});

test("還沒接觸過就先降溫不會憑空推進合作階段", () => {
  // 舊實作用「這筆 entry 不掛在 unmet 上」表達；現在是轉場的 onlyFrom。
  const result = apply({}, "我退後、降低音量，給 Lambert 一點空間", 1);
  assert.equal(result.changed, false);
});

test("明確指向其他 NPC 或一般環境行動不會誤更新她的狀態", () => {
  assert.equal(classifyLambertInteraction({ actionText: "我問 Ripley 這裡發生什麼事", sceneId: LAMBERT_SCENE }).interactionType, "other");
  assert.equal(classifyLambertInteraction({ actionText: "我找 Parker 處理閥門", sceneId: LAMBERT_SCENE }).interactionType, "other");
  assert.equal(classifyLambertInteraction({ actionText: "我觀察副控室的通訊設備", sceneId: OTHER_SCENE }).interactionType, "other");
});

test("policy 只對 Alien V2 生效", () => {
  const otherPack = applyLambertCooperationForAction({
    reference: { sourcePackId: "scenario.other" },
    state: {},
    actionText: "我安撫 Lambert",
    sceneId: LAMBERT_SCENE,
    turnNumber: 1,
  });
  assert.equal(otherPack.changed, false);
});
