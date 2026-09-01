import assert from "node:assert/strict";
import test from "node:test";
import { emptyCharacter } from "../core/schema.js";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import {
  applyReferenceFinaleVictory,
  applyReferenceResult,
  buildReferenceOptions,
  createReferenceState,
  deriveEndingId,
  resolveReferenceAction,
} from "../content/scenario/referenceAdapter.js";
import {
  resolveTravelAction,
  applyTravelAction,
} from "../content/scenario/explorationState.js";

const character = emptyCharacter("V2 路線測試者");

function applyApproach(state, approachId, outcomeTier = "成功") {
  const option = buildReferenceOptions(reference, state, { limit: 20 }).find(
    (candidate) => candidate.reference?.approachId === approachId
  );
  assert.ok(option, `${state.currentSceneId} 應提供 ${approachId}`);
  const resolution = resolveReferenceAction({ reference, state, chosenOption: option, character });
  assert.equal(resolution.matched, true, `${approachId} 應能通過 reference validation`);
  const applied = applyReferenceResult({ reference, state, resolution, outcomeTier });
  assert.equal(applied.applied, true, `${approachId}/${outcomeTier} 應有固定結果`);
  return applied;
}

test("V2 完整成功路線：從休眠室走到水仙號休眠結算場景", () => {
  let state = createReferenceState(reference, {
    initialInventory: ["item_desert_eagle", "item_access_card"],
  });

  state = applyApproach(state, "app_cryo_recon", "成功").state;
  assert.equal(state.currentSceneId, "evt_cryo_clearance", "調查休眠室後仍應留在原場景");
  assert.ok(state.flags.includes("flag_cryo_recon_done"));

  state = applyApproach(state, "app_cryo_leave", "成功").state;
  assert.equal(state.currentSceneId, "evt_deck_a_recon", "離開休眠室後應先進入 A 甲板");
  assert.equal(state.currentLocation, "loc_deck_a");

  state = applyApproach(state, "app_deck_luyuan_contact", "自動").state;
  assert.equal(state.currentSceneId, "evt_deck_a_recon", "陸遠交涉是 A 甲板內的多回合行動");
  assert.ok(state.flags.includes("flag_luyuan_met"));
  assert.equal(state.npcStatuses.npc_luyuan, "met");

  state = applyApproach(state, "app_deck_to_science", "自動").state;
  assert.equal(state.currentSceneId, "evt_meet_ash", "明確前往科學區後才進入 Ash 場景");
  assert.equal(state.currentLocation, "loc_science");

  state = applyApproach(state, "app_ash_talk_quarantine", "成功").state;
  assert.equal(state.currentSceneId, "evt_meet_ash");
  assert.ok(state.flags.includes("flag_ash_talked"));

  state = applyApproach(state, "app_ash_terminal_peek", "成功").state;
  assert.equal(state.currentSceneId, "evt_mother_chamber_infiltrate", "窺見 937 後應進入主機門禁 scene，而不是跳過它");
  assert.ok(state.flags.includes("flag_937_path_known"));
  assert.equal(state.currentLocation, "loc_mother_core");

  state = applyApproach(state, "app_mother_door_card", "自動").state;
  assert.equal(state.currentSceneId, "evt_order_937_reveal", "開啟核心氣密門後才進入 937 調查場景");
  state = applyApproach(state, "app_order_copy_watch", "成功").state;
  assert.equal(state.currentSceneId, "evt_engine_coolant_prep", "取得 937 證據後應先進入工程準備段");
  assert.ok(state.flags.includes("flag_937_evidence_saved"));

  state = applyApproach(state, "app_engine_prep_parker", "成功").state;
  assert.equal(state.currentSceneId, "evt_engine_coolant_prep");
  assert.ok(state.flags.includes("flag_engine_prep_done"));
  state = applyApproach(state, "app_engine_start_overload", "自動").state;
  assert.equal(state.currentSceneId, "evt_trigger_overload", "完成工程準備後才進入自毀倒數");

  state = applyApproach(state, "app_overload_manual", "成功").state;
  assert.equal(state.currentSceneId, "evt_vent_ambush_escape");
  assert.equal(state.shipStatus, "overload_started");

  state = applyApproach(state, "app_escape_sprint_dodge", "成功").state;
  assert.equal(state.currentSceneId, "evt_narcissus_shadow_wake");
  assert.equal(state.currentLocation, "loc_narcissus");

  state = applyApproach(state, "app_shadow_find_coolant", "自動").state;
  assert.ok(state.inventory.includes("item_coolant_spray"));
  assert.equal(state.currentSceneId, "evt_narcissus_shadow_wake", "取得冷卻噴霧後仍應留在假安全場景");

  state = applyApproach(state, "app_shadow_stealth_suit", "成功").state;
  assert.equal(state.currentSceneId, "evt_narcissus_shadow_wake", "取得宇航服後仍應留在假安全場景");
  assert.equal(state.airlockPhase, "approach");

  state = applyApproach(state, "app_shadow_enter_airlock", "自動").state;
  assert.equal(state.currentSceneId, "evt_narcissus_final_purge");
  assert.equal(state.currentLocation, "loc_narcissus_airlock");

  state = applyApproach(state, "app_flush_coolant", "成功").state;
  assert.equal(state.currentSceneId, "evt_narcissus_final_purge", "先定位／準備時應留在最終戰場景");
  assert.equal(state.airlockPhase, "positioned");

  const purge = applyApproach(state, "app_purge_classic", "成功");
  state = purge.state;
  assert.equal(purge.finaleComplete, true);
  assert.equal(state.currentSceneId, "evt_hypersleep_return");
  assert.ok(state.flags.includes("flag_xenomorph_killed"));

  state = applyApproach(state, "app_return_direct_sleep", "自動").state;
  assert.ok(state.flags.includes("flag_hypersleep_entered"));

  // [2026-09-01] 這條斷言以前是 end_solo_survivor，改掉的理由要寫清楚：
  //
  // 這條路線從頭到尾都帶著陸遠（app_deck_luyuan_contact 之後他一路同行、從未受害），
  // 所以「有人會帶著對 937、Ash 與異形的第一手記憶一起離開」是這一場的**事實**。
  // 兩個結局宣告的條件本來就把話講死了：
  //   end_solo_survivor  要求「no NPC with status survived」——沒有人能替你作證
  //   end_heroic_rescue  要求 npc_luyuan.status == survived
  //
  // 舊的 end_solo_survivor 不是設計，是一個缺陷的產物：在此之前整份 reference
  // 沒有任何一條路徑能把陸遠寫成 survived（只有最終戰的 app_purge_teamwork 一個
  // 特定 approach 可以），所以玩家就算一路把他平安帶到休眠艙，結局仍然說「你是
  // 孤獨生還者」。補上休眠掃描之後，這條路線終於拿到它本來就該拿到的結局。
  //
  // 新斷言連因帶果一起釘：先確認狀態，再確認結局。只驗結局的話，
  // 下次有人把掃描拆掉，錯誤訊息只會說「結局不對」，看不出是誰的狀態沒寫進去。
  assert.equal(state.npcStatuses.npc_luyuan, "survived", "一路同行且未受害的陸遠應該一起離開");
  assert.ok(state.flags.includes("flag_luyuan_survived"));
  assert.equal(deriveEndingId(reference, state), "end_heroic_rescue");
});

test("V2 路線：陸遠死在途中時，結局回到 end_solo_survivor", () => {
  // 上面那條改了斷言，所以這條必須存在：證明 end_solo_survivor 沒有變成到不了的結局，
  // 只是它現在真的需要「沒有人陪你離開」——那才是它的文案在講的事。
  let state = createReferenceState(reference, {
    initialInventory: ["item_desert_eagle", "item_access_card"],
  });
  state = applyApproach(state, "app_cryo_leave", "成功").state;
  state = applyApproach(state, "app_deck_luyuan_contact", "自動").state;
  assert.equal(state.npcStatuses.npc_luyuan, "met");

  // 直接跳到通風管逃生那一幕，用慘烈失敗讓他死在路上。
  state = {
    ...state,
    currentSceneId: "evt_vent_ambush_escape",
    currentLocation: "loc_lower_deck",
    shipStatus: "overload_started",
  };
  state = applyApproach(state, "app_escape_sprint_dodge", "慘烈失敗").state;
  assert.equal(state.npcStatuses.npc_luyuan, "dead");

  state = {
    ...state,
    currentSceneId: "evt_hypersleep_return",
    currentLocation: "loc_narcissus",
    flags: [...state.flags, "flag_xenomorph_killed"],
  };
  state = applyApproach(state, "app_return_direct_sleep", "自動").state;

  // 休眠掃描不得把他撈回來——死亡是單向的。
  assert.equal(state.npcStatuses.npc_luyuan, "dead");
  assert.equal(state.flags.includes("flag_luyuan_survived"), false);
  assert.equal(deriveEndingId(reference, state), "end_solo_survivor");
});

test("V2 最終戰勝利後仍保留感染與樣本分支，不能在擊殺當下提前結算", () => {
  const beforeVictory = {
    ...createReferenceState(reference, { initialInventory: ["item_xenomorph_tissue"] }),
    currentSceneId: "evt_narcissus_final_purge",
    currentLocation: "loc_narcissus_airlock",
    airlockPhase: "positioned",
    shipStatus: "overload_started",
    flags: ["flag_suit_ready", "flag_tether_ready"],
  };
  const afterVictory = applyReferenceFinaleVictory(reference, beforeVictory);

  assert.equal(afterVictory.currentSceneId, "evt_hypersleep_return");
  assert.equal(afterVictory.currentLocation, "loc_narcissus");
  assert.ok(afterVictory.flags.includes("flag_xenomorph_killed"));
  assert.equal(afterVictory.endingId, null);
  assert.equal(deriveEndingId(reference, afterVictory), null);

  const preserveOption = buildReferenceOptions(reference, afterVictory, { limit: 20 }).find(
    (candidate) => candidate.reference?.approachId === "app_return_preserve_sample"
  );
  assert.ok(preserveOption);
  const preserveResolution = resolveReferenceAction({
    reference,
    state: afterVictory,
    chosenOption: preserveOption,
    character,
  });
  const preserved = applyReferenceResult({
    reference,
    state: afterVictory,
    resolution: preserveResolution,
    outcomeTier: "成功",
  }).state;
  assert.equal(preserved.sampleStatus, "preserved");
  assert.equal(preserved.endingId, "end_corporate_agent");
});

test("V2 死亡與感染結局由固定狀態推導，不依賴 AI 敘事", () => {
  const base = createReferenceState(reference);
  assert.equal(
    deriveEndingId(reference, { ...base, flags: ["flag_player_dead_vacuum"] }),
    "end_death_vacuum_breach"
  );
  assert.equal(
    deriveEndingId(reference, { ...base, flags: ["flag_hypersleep_entered"], infectionStatus: "infected" }),
    "end_dark_infection"
  );
  assert.equal(
    deriveEndingId(reference, { ...base, flags: ["flag_expire_triggered"], currentLocation: "loc_science" }),
    "end_expire_ruins"
  );
});

test("V2 reference 會初始化標準起始裝備，並提供焊槍替代逃生路線", () => {
  const state = createReferenceState(reference);
  assert.ok(state.inventory.includes("item_desert_eagle"));
  assert.ok(state.inventory.includes("item_emergency_medkit"));

  const lowerDeck = {
    ...state,
    currentSceneId: "evt_vent_ambush_escape",
    currentLocation: "loc_lower_deck",
    flags: ["flag_overload_active"],
  };
  const afterToolkit = applyApproach(lowerDeck, "app_escape_recover_toolkit", "自動").state;
  assert.ok(afterToolkit.inventory.includes("item_blowtorch"));
  assert.equal(afterToolkit.currentSceneId, "evt_vent_ambush_escape");

  const afterFirewall = applyApproach(afterToolkit, "app_escape_firewall", "成功").state;
  assert.equal(afterFirewall.currentSceneId, "evt_narcissus_shadow_wake");
  assert.equal(afterFirewall.currentLocation, "loc_narcissus");
});

test("V2 Ash 交火的樣本狀態會同步成可保存的組織物品", () => {
  const state = {
    ...createReferenceState(reference),
    currentSceneId: "evt_ash_ambush",
    currentLocation: "loc_science",
    flags: ["flag_ash_ambush_unlocked"],
  };
  const afterShot = applyApproach(state, "app_ash_shoot", "驚險成功").state;
  assert.equal(afterShot.sampleStatus, "tissue");
  assert.ok(afterShot.inventory.includes("item_xenomorph_tissue"));
});
