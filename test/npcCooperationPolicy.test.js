// 陸遠的合作人設與威脅階梯。
//
// [2026-08-31 重構後的斷言] 這一組原本斷言 32 筆 entry 的存在、它們的 entryId
// 與罐頭台詞。那張表已隨「寫死的分支走向」一起移除（原始 Gemini 劇本文字仍保存在
// examples/alienNostromo_v2_luyuanCooperation.js 作為寫作參考，但不再進 runtime）。
//
// 保留下來的是規則問題，而且一條都沒有少：
// 搶槍會不會被跟「問他槍是哪來的」分開？三次威脅會不會走完 strained →
// self_preserving → abandoned？道歉會不會回到合作但不抹掉紀錄？
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import luyuanSourceMaterial from "../content/scenario/examples/alienNostromo_v2_luyuanCooperation.js";
import {
  createReferenceState,
  normalizeReferenceState,
  referenceStateForResponse,
  buildReferencePromptBlock,
} from "../content/scenario/referenceAdapter.js";
import {
  NPC_ID,
  LUYUAN_PERSONA,
  COOPERATION_STATES,
  createNpcCooperationState,
  normalizeNpcCooperationState,
  classifyNpcInteraction,
  applyNpcCooperationForAction,
} from "../content/scenario/npcCooperationPolicy.js";

const START_SCENE = "evt_deck_a_recon";
const Luyuan = NPC_ID;

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

function coop(state) {
  return state.npcCooperation[Luyuan];
}

test("陸遠的人設涵蓋六個合作階段，每一階都有自己的 objective", () => {
  assert.equal(LUYUAN_PERSONA.npcId, Luyuan);
  assert.deepEqual(COOPERATION_STATES, [
    "briefing", "provisional", "functional", "strained", "self_preserving", "abandoned",
  ]);
  for (const stateId of COOPERATION_STATES) assert.ok(LUYUAN_PERSONA.objectives[stateId], stateId);
  // 每一條分類規則都必須宣告 kind——漏宣告會讓那種互動在耐心值計算裡被當成中性，
  // 而那是一種只表現成「這個 NPC 特別好脾氣」的安靜錯誤。
  for (const rule of LUYUAN_PERSONA.rules) {
    assert.ok(["briefing", "cooperation", "friction", "hostile", "deescalation"].includes(rule.kind), rule.interactionType);
  }
});

test("原始 Gemini 劇本文字仍保存為寫作參考，但已不在 runtime 路徑上", () => {
  // 這份素材是使用者提供的 canonical 文字，不刪；但它不再被任何 runtime 模組 import，
  // 也不再每回合送進 prompt。這條斷言擋的是「有人順手把它接回去」。
  assert.equal(luyuanSourceMaterial.entries.length, 32);
  const adapter = new URL("../content/scenario/referenceAdapter.js", import.meta.url);
  const engine = new URL("../content/scenario/npcCooperationEngine.js", import.meta.url);
  for (const url of [adapter, engine]) {
    assert.doesNotMatch(readFileSync(url, "utf8"), /luyuanCooperation/);
  }
});

test("新狀態與舊存檔正規化會建立 bounded 的陸遠 cooperation state", () => {
  const fresh = createNpcCooperationState();
  assert.equal(fresh[Luyuan].state, "briefing");
  assert.equal(fresh[Luyuan].trust, 1);
  const legacy = normalizeNpcCooperationState(undefined);
  assert.equal(legacy[Luyuan].state, "briefing");
  // 認不得的狀態與超界的數字都要被夾回來，不可以原樣送進 prompt。
  const dirty = normalizeNpcCooperationState({ [Luyuan]: { state: "invalid", trust: -30, incidents: 99 } });
  assert.equal(dirty[Luyuan].state, "briefing");
  assert.equal(dirty[Luyuan].trust, -9);
  assert.equal(dirty[Luyuan].incidents, 9);
  assert.equal(normalizeNpcCooperationState({ [Luyuan]: { incidents: "壞掉的值" } })[Luyuan].incidents, 0);
});

test("重構前的存檔會把角色專屬的越線計數搬進統一的 incidents", () => {
  // 不搬移的話計數會歸零：合作階段還在（self_preserving 仍是 self_preserving），
  // 但威脅階梯的位置沒了，下一次威脅會落回第一階——玩家會看到「NPC 忽然原諒我了」。
  const migrated = normalizeNpcCooperationState({
    [Luyuan]: { state: "self_preserving", trust: -3, threatCount: 2, contactEstablished: true },
  });
  assert.equal(migrated[Luyuan].state, "self_preserving");
  assert.equal(migrated[Luyuan].incidents, 2);
  assert.equal(migrated[Luyuan].trust, -3);
  assert.equal(migrated[Luyuan].contactEstablished, true);

  // 搬進來之後階梯要接得上：第三次威脅仍然是 abandoned，不會退回 strained。
  const next = applyNpcCooperationForAction({
    reference,
    state: { npcCooperation: migrated },
    actionText: "繼續朝他撲去",
    sceneId: START_SCENE,
    turnNumber: 4,
  });
  assert.equal(coop(next.state).state, "abandoned");
});

test("求生提問會建立接觸並推進到 provisional", () => {
  const result = apply(createReferenceState(reference), "你是誰，我為什麼會在這裡？", 1);
  assert.equal(result.changed, true);
  assert.equal(result.classification.interactionType, "survival_question");
  assert.equal(result.classification.topic, "identity");
  assert.equal(coop(result.state).state, "provisional");
  assert.equal(coop(result.state).contactEstablished, true);
});

test("引擎認不出在問什麼的雜問不會被當成已經簡報過", () => {
  // 舊實作用「找不到對應 entry 就走 fallback，而 fallback 沒有 stateAfter」表達；
  // 現在是轉場的 onlyTopics。他仍然要回答必要的部分，但這不算完成簡報。
  const result = apply(createReferenceState(reference), "這裡怎麼這麼冷？", 1);
  assert.equal(result.classification.interactionType, "survival_question");
  assert.equal(result.classification.topic, "survival_general");
  assert.equal(coop(result.state).state, "briefing");
});

test("詢問陸遠手上的槍不會被分類成搶槍", () => {
  const classification = classifyNpcInteraction({
    actionText: "我問陸遠手上的槍是哪裡來的？",
    targetNpcId: Luyuan,
    sceneId: START_SCENE,
  });
  assert.notEqual(classification.interactionType, "attempt_grab_weapon");
  assert.equal(classification.interactionType, "survival_question");
  assert.equal(classification.kind, "briefing");
});

test("三次威脅走完 strained → self_preserving → abandoned", () => {
  const first = apply(createReferenceState(reference), "試著搶奪男人的手槍", 1);
  assert.equal(first.classification.interactionType, "attempt_grab_weapon");
  assert.equal(first.classification.kind, "hostile");
  assert.equal(coop(first.state).state, "strained");
  assert.equal(coop(first.state).incidents, 1);

  const second = apply(first.state, "繼續朝他撲去", 2);
  assert.equal(second.classification.interactionType, "sudden_rush");
  assert.equal(coop(second.state).state, "self_preserving");
  assert.equal(coop(second.state).incidents, 2);

  const third = apply(second.state, "繼續朝他撲去", 3);
  assert.equal(coop(third.state).state, "abandoned");
  assert.equal(coop(third.state).incidents, 3);
  assert.equal(coop(third.state).trust, -2);
});

test("退後或道歉會回到合作，但不把 trust 或紀錄恢復成初始值", () => {
  const first = apply(createReferenceState(reference), "試著搶奪男人的手槍", 1);
  const second = apply(first.state, "繼續朝他撲去", 2);
  const calmed = apply(second.state, "我退後並道歉，表示我只是害怕", 3);
  assert.equal(calmed.classification.kind, "deescalation");
  assert.equal(coop(calmed.state).state, "functional");
  assert.equal(coop(calmed.state).incidents, 2, "降溫不可以把已經發生的事一筆勾銷");
  assert.equal(coop(calmed.state).trust, -1);
  assert.equal(coop(calmed.state).deescalations, 1);
});

test("還沒吵架就先道歉不會憑空推進合作階段", () => {
  const result = apply(createReferenceState(reference), "我退後並道歉，表示我只是害怕", 1);
  assert.equal(result.changed, false);
});

test("他已經放棄帶你之後就不再回應威脅", () => {
  let state = createReferenceState(reference);
  for (const [turn, text] of [[1, "試著搶奪男人的手槍"], [2, "繼續朝他撲去"], [3, "繼續朝他撲去"]]) {
    state = apply(state, text, turn).state;
  }
  assert.equal(coop(state).state, "abandoned");
  const afterwards = apply(state, "繼續朝他撲去", 4);
  assert.equal(afterwards.changed, false, "abandoned 是終點，不會再被同一招推動");
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

test("reference public response 與 prompt 都不暴露 npcCooperation 或私密欄位", () => {
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
  // [2026-08-31] reference block 不再夾帶 <NPC_Cooperation_Contract>：
  // 共用規則搬進靜態層，每回合會變的合作階段併進 [NPC_ACTIVE_STATE]。
  assert.doesNotMatch(prompt, /NPC_Cooperation_Contract/);
  assert.doesNotMatch(prompt, /privateAssessment|withheldFacts/);
});
