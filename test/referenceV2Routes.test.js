import assert from "node:assert/strict";
import test from "node:test";
import { emptyCharacter } from "../core/schema.js";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.json" with { type: "json" };
import {
  applyReferenceFinaleVictory,
  applyReferenceResult,
  buildReferenceOptions,
  createReferenceState,
  deriveEndingId,
  resolveReferenceAction,
} from "../content/scenario/referenceAdapter.js";

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
  assert.equal(state.currentSceneId, "evt_meet_ash");

  state = applyApproach(state, "app_ash_talk_quarantine", "成功").state;
  assert.equal(state.currentSceneId, "evt_meet_ash");
  assert.ok(state.flags.includes("flag_ash_talked"));

  state = applyApproach(state, "app_ash_terminal_peek", "成功").state;
  assert.equal(state.currentSceneId, "evt_order_937_reveal", "完成交涉並取得 937 路徑後應進入調查場景");
  assert.equal(state.currentLocation, "loc_mother_core", "進入 937 調查場景時位置也應切換到主機核心房");
  assert.ok(state.flags.includes("flag_937_path_known"));

  state = applyApproach(state, "app_order_copy_watch", "成功").state;
  assert.equal(state.currentSceneId, "evt_trigger_overload", "取得 937 證據後應離開調查場景進入超載段");
  assert.ok(state.flags.includes("flag_937_evidence_saved"));

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
