// 《努布拉島：維修站撤離》V1 —— 第二個內建副本的接入測試。
//
// 這支測試守住三件事：
//   1. 副本包與 reference sidecar 本身結構合法、彼此同步（壞掉的話 registry import 就會炸）。
//   2. 主線真的走得完：節點會依序結算、最終戰完成信號會出現、六個結局都能由 state 推導。
//   3. 引擎這次為了第二副本做的「資料驅動化」沒有把異形副本的既有行為改掉。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ISLA_NUBLAR_SCENARIO_V1 } from "../content/scenario/examples/jurassicPark_v1.js";
import runtimeReference from "../content/scenario/examples/jurassicPark_v1_gm_reference.js";
import alienReference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import { validateScenarioPack } from "../content/scenario/schema.js";
import { validateOptions } from "../content/turnOptions.js";
import { getScenarioPack, getScenarioReference, listScenarios } from "../content/scenario/registry.js";
import {
  createReferenceState,
  buildReferenceOptions,
  resolveReferenceAction,
  applyReferenceResult,
  applyReferenceFinaleVictory,
  deriveEndingId,
  buildExplorationView,
  referenceStateForResponse,
} from "../content/scenario/referenceAdapter.js";
import { resolveTravelAction, applyTravelAction } from "../content/scenario/explorationState.js";
import { deriveQualityScore } from "../content/scenario/settlement.js";
import {
  narrativePackageFor,
  buildNarrativeNpcPromptBlock,
  narrativePackageCoverage,
} from "../content/scenario/narrativePackageAdapter.js";

const REFERENCE = runtimeReference;

const CHARACTER = {
  attributes: { 力量: 3, 敏捷: 3, 耐力: 3, 智力: 3, 感知: 3, 意志: 3 },
  skills: { 技藝: 2, 偵察: 2, 潛行: 2, 交涉: 2, 體魄: 2, 求生: 2, 格鬥: 2, 射擊: 2, 秘識: 2 },
  derived: { hp: { B: 0, L: 0, A: 0, max: { B: 7, L: 7, A: 7 } } },
};

function act(state, approachId, outcomeTier) {
  const option = buildReferenceOptions(REFERENCE, state, { limit: 12 })
    .find((entry) => entry.reference.approachId === approachId);
  assert.ok(option, `進路 ${approachId} 在目前狀態下不可用`);
  const resolution = resolveReferenceAction({
    reference: REFERENCE,
    state,
    chosenOption: option,
    playerAction: "",
    character: CHARACTER,
  });
  assert.equal(resolution.matched, true, `進路 ${approachId} 無法被 adapter 命中`);
  const applied = applyReferenceResult({ reference: REFERENCE, state, resolution, outcomeTier });
  assert.equal(applied.applied, true, applied.error ?? "");
  return applied;
}

function travel(state, to) {
  const resolution = resolveTravelAction(REFERENCE, state, to);
  assert.equal(resolution.ok, true, `移動到 ${to} 被擋下：${resolution.error ?? ""}`);
  return { resolution, state: applyTravelAction(REFERENCE, state, resolution).state };
}

test("副本包通過 validateScenarioPack，並保有時間預算與最終戰節點", () => {
  const check = validateScenarioPack(ISLA_NUBLAR_SCENARIO_V1);
  assert.equal(check.valid, true, check.errors.join("；"));

  const chapter = ISLA_NUBLAR_SCENARIO_V1.entries[0];
  assert.equal(chapter.timeLimitRounds, 40);
  assert.equal(chapter.onExpireNodeId, "n-expire");
  assert.deepEqual(ISLA_NUBLAR_SCENARIO_V1.speedReward, { pointsPerRemainingRound: 1, maxPoints: 40 });

  const finale = chapter.nodes.filter((node) => node.isFinale);
  assert.equal(finale.length, 1);
  assert.ok(finale[0].bossEncounter?.name);
  assert.deepEqual(REFERENCE.finaleNodeIds, [finale[0].id]);
});

test("固定開場的四個選項全部通過 validateOption，不需要退回預設值", () => {
  const chapter = ISLA_NUBLAR_SCENARIO_V1.entries[0];
  const checked = validateOptions(chapter.openingOptions, {
    skills: { 技藝: 1, 偵察: 1, 潛行: 1, 交涉: 1 },
  });
  assert.equal(checked.options.length, 4);
  assert.equal(checked.fallbackCount, 0, checked.warnings.join("；"));
  // 甦醒過場與開場不可以把玩家叫醒兩次。
  assert.ok(ISLA_NUBLAR_SCENARIO_V1.arrivalNarration.includes("防護罩"));
  assert.ok(chapter.openingNarration.startsWith("淡藍色的半透明防護罩悄然碎裂"));
});

test("authoring JSON 與 Cloudflare runtime sidecar 保持同步", () => {
  const source = JSON.parse(
    fs.readFileSync(new URL("../content/scenario/examples/jurassicPark_v1_gm_reference.json", import.meta.url), "utf8")
  );
  assert.deepEqual(runtimeReference, source);
});

test("registry 同時提供副本包與對應的 GM reference", () => {
  const pack = getScenarioPack("scenario.jurassic-park-01-v1");
  assert.equal(pack?.id, ISLA_NUBLAR_SCENARIO_V1.id);
  assert.equal(getScenarioReference(pack)?.sourcePackId, pack.id);
  assert.ok(listScenarios().some((entry) => entry.id === pack.id));
  // 選擇畫面不可以洩漏節點劇透。
  for (const entry of listScenarios()) assert.equal("canonSummary" in entry, false);
});

test("起始狀態沿用 reference 宣告的狀態軸與初始物資", () => {
  const state = createReferenceState(REFERENCE);
  assert.equal(state.currentSceneId, "evt_dock_arrival");
  assert.equal(state.currentLocation, "loc_maintenance_dock");
  assert.equal(state.shipStatus, "blackout", "副本應該從斷電狀態開始，而不是引擎預設的 stable");
  assert.equal(state.sampleStatus, "none");
  assert.deepEqual(state.inventory, ["item_rain_gear", "item_halogen_torch", "item_maintenance_keycard_b"]);
});

test("主線可以走完：n1 → n2 → n3 依序結算，最終戰由登機完成", () => {
  let state = createReferenceState(REFERENCE);

  const openDoor = act(state, "app_dock_hack_lock", "成功");
  assert.deepEqual(openDoor.nodeComplete, { nodeId: "n1", divergenceTier: 0 });
  assert.equal(openDoor.nextSceneId, "evt_power_room_entry");
  state = openDoor.state;

  const power = act(state, "app_power_restart_generator", "大成功");
  assert.deepEqual(power.nodeComplete, { nodeId: "n2", divergenceTier: 0 });
  assert.equal(power.state.shipStatus, "powered");
  assert.ok(power.state.clues.includes("clue_grid_shutdown_log"));
  state = power.state;

  const lab = act(state, "app_lab_distract_cryo", "成功");
  assert.deepEqual(lab.nodeComplete, { nodeId: "n3", divergenceTier: 0 });
  assert.equal(lab.state.sampleStatus, "preserved");
  assert.ok(lab.state.inventory.includes("item_cryo_canister"));
  state = lab.state;

  state = act(state, "app_tunnel_climb_to_helipad", "成功").state;
  const boarding = act(state, "app_helipad_flare_distract", "成功");
  assert.equal(boarding.finaleComplete, true, "登機後最終戰節點應該可以結算");
  assert.equal(boarding.state.endingId, "end_perfect_evacuation");
});

test("六個結局全部能由 server state 推導，且沒有無法推導的登機狀態", () => {
  const derive = (flags, extra = {}) => deriveEndingId(REFERENCE, { flags, npcStatuses: {}, ...extra });
  assert.equal(derive(["flag_player_dead", "flag_player_on_heli"]), "end_consumed_by_island");
  assert.equal(derive(["flag_time_expired", "flag_shelter_secured"]), "end_stranded_survival");
  assert.equal(derive(["flag_helipad_defended", "flag_survivors_rescued"]), "end_heroic_sacrifice");
  assert.equal(
    derive(["flag_player_on_heli", "flag_embryos_secured", "flag_survivors_rescued", "flag_biosyn_contact_made"]),
    "end_corporate_contraband"
  );
  assert.equal(
    derive(["flag_player_on_heli", "flag_embryos_secured", "flag_survivors_rescued"]),
    "end_perfect_evacuation"
  );
  assert.equal(derive(["flag_player_on_heli"]), "end_samples_lost_survived");
  assert.equal(derive([]), null, "還沒有任何結局條件時不可以硬湊一個結局");

  const declared = new Set(REFERENCE.endings.map((ending) => ending.id));
  for (const rule of REFERENCE.endingRules) assert.ok(declared.has(rule.endingId));
});

test("戰鬥勝利的最終戰收尾由 reference 資料決定，不再寫死異形副本的狀態", () => {
  const state = {
    ...createReferenceState(REFERENCE),
    currentSceneId: "evt_helipad_final",
    currentLocation: "loc_south_helipad",
    flags: ["flag_survivors_rescued", "flag_embryos_secured"],
  };
  const after = applyReferenceFinaleVictory(REFERENCE, state);
  assert.equal(after.currentSceneId, "evt_evacuation_departure");
  assert.equal(after.airlockPhase, "secured");
  assert.ok(after.flags.includes("flag_player_on_heli"));
  assert.ok(after.completedSceneIds.includes("evt_helipad_final"));
  assert.equal(deriveEndingId(REFERENCE, after), "end_perfect_evacuation");
});

test("探索移動：只走地圖相鄰路線，未達成前置的路線會被鎖住", () => {
  let state = createReferenceState(REFERENCE);

  const blocked = resolveTravelAction(REFERENCE, state, "loc_service_tunnel");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "TRAVEL_LOCKED");
  assert.deepEqual(blocked.missingFlags, ["flag_dock_manhole_opened"]);

  const notAdjacent = resolveTravelAction(REFERENCE, { ...state, currentLocation: "loc_power_junction_b" }, "loc_south_helipad");
  assert.equal(notAdjacent.ok, false);
  assert.equal(notAdjacent.code, "NOT_ADJACENT");

  state = act(state, "app_dock_open_manhole", "成功").state;
  const opened = travel(state, "loc_service_tunnel");
  assert.equal(opened.resolution.nextScene.id, "evt_service_tunnel_transit");
  assert.equal(opened.state.currentLocation, "loc_service_tunnel");
});

test("路線風險由 reference 的 travelRiskRules 決定：開車衝山路比爬管廊危險", () => {
  const base = createReferenceState(REFERENCE);
  const fromTunnel = resolveTravelAction(
    REFERENCE,
    { ...base, currentLocation: "loc_service_tunnel", currentSceneId: "evt_service_tunnel_transit", inventory: ["item_halogen_torch"] },
    "loc_south_helipad"
  );
  const fromDock = resolveTravelAction(
    REFERENCE,
    { ...base, flags: ["flag_jeep_repaired"], inventory: ["item_halogen_torch"] },
    "loc_south_helipad"
  );
  assert.equal(fromTunnel.ok, true);
  assert.equal(fromDock.ok, true);
  assert.equal(fromTunnel.risk.threatDelta, 1);
  assert.equal(fromDock.risk.threatDelta, 2);
  assert.ok(fromDock.risk.labels.includes("山路衝刺"));
});

test("沒有照明時，露天與管廊路線的風險會上升", () => {
  const base = createReferenceState(REFERENCE);
  const withTorch = resolveTravelAction(
    REFERENCE,
    { ...base, currentLocation: "loc_power_junction_b", currentSceneId: "evt_power_room_entry" },
    "loc_maintenance_dock"
  );
  const withoutTorch = resolveTravelAction(
    REFERENCE,
    { ...base, currentLocation: "loc_power_junction_b", currentSceneId: "evt_power_room_entry", inventory: [] },
    "loc_maintenance_dock"
  );
  assert.equal(withTorch.risk.threatDelta, 0);
  assert.equal(withoutTorch.risk.threatDelta, 1);
});

test("公開探索視圖只給玩家可見資料，不洩漏 gmTruth 與 NPC 秘密", () => {
  const state = createReferenceState(REFERENCE);
  const view = buildExplorationView(REFERENCE, state);
  assert.equal(view.currentLocation.id, "loc_maintenance_dock");
  assert.equal(view.currentLocation.purpose, "尋找安全的建築入口，排除外部威脅，取得可用工具或車輛。");
  assert.equal(view.currentEvent.label, "裝卸坪破局與入口選擇");

  const serialized = JSON.stringify(referenceStateForResponse(REFERENCE, state));
  for (const scene of REFERENCE.scenes) {
    for (const truth of scene.gmTruth ?? []) assert.equal(serialized.includes(truth), false, `洩漏 gmTruth：${truth}`);
  }
  for (const npc of REFERENCE.npcs) {
    for (const secret of npc.knowledge?.secret ?? []) {
      assert.equal(serialized.includes(secret), false, `洩漏 NPC 秘密：${secret}`);
    }
  }
  // 一開場還沒接觸任何人，NPC 名冊應該是空的。
  assert.deepEqual(referenceStateForResponse(REFERENCE, state).npcs, []);
});

test("NPC 只有在 reference 宣告的接觸條件成立後才會出現在名冊", () => {
  const state = createReferenceState(REFERENCE);
  const contacted = {
    ...state,
    flags: ["flag_radio_contact_established"],
  };
  const roster = referenceStateForResponse(REFERENCE, contacted).npcs.map((npc) => npc.id);
  assert.ok(roster.includes("npc_engineer_morales"));
  assert.equal(roster.includes("npc_researcher_karen"), false, "還沒抵達實驗室就不該公開研究員");
});

test("帶出事故證據會計入品質分數（結算旗標不再只認異形副本）", () => {
  const progress = { nodes: {} };
  const withEvidence = deriveQualityScore(ISLA_NUBLAR_SCENARIO_V1, progress, {
    flags: ["flag_evidence_secured"],
    sampleStatus: "preserved",
    npcStatuses: {},
  });
  const withoutEvidence = deriveQualityScore(ISLA_NUBLAR_SCENARIO_V1, progress, {
    flags: [],
    sampleStatus: "preserved",
    npcStatuses: {},
  });
  assert.equal(withEvidence - withoutEvidence, 20);
});

test("NPC 演出素材包已註冊，但目前是空殼：不影響回合、也不會噴錯", () => {
  const state = createReferenceState(REFERENCE);
  const pack = narrativePackageFor(REFERENCE);
  assert.equal(pack?.sourcePackId, "scenario.jurassic-park-01-v1");
  assert.deepEqual(pack.npcs, [], "Gemini 對白尚未貼入前，npcs 應該是空陣列");
  // 空殼不該讓 prompt block 噴錯，只是先回傳空字串（等同於完全沒有這份資料時的行為）。
  const contacted = { ...state, flags: ["flag_radio_contact_established"] };
  assert.equal(buildNarrativeNpcPromptBlock(REFERENCE, contacted), "");
  assert.equal(narrativePackageCoverage(REFERENCE).npcs, 0);
});

test("回歸：異形副本沒有宣告 endingRules，仍走內建判定", () => {
  assert.equal(alienReference.endingRules, undefined);
  assert.equal(
    deriveEndingId(alienReference, { flags: ["flag_hypersleep_entered"], npcStatuses: {}, sampleStatus: "preserved" }),
    "end_corporate_agent"
  );
  assert.equal(deriveEndingId(alienReference, { flags: ["flag_player_dead_combat"], npcStatuses: {} }), "end_death_alien_feast");
  // 異形副本也沒有宣告 travelCompletesNodes，移動不應該自己結算節點。
  assert.equal(alienReference.travelCompletesNodes, undefined);
});
