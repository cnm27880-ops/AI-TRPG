// 「失敗會不會把這條路永久關掉」的資料不變式。
//
// 背景（2026-09-07 排查）：引擎有 APPROACH_FAILURE_LIMIT = 2 的重試預算，
// 註解寫得很清楚——「第一次失敗是這條路這次沒走通，第二次失敗才確立這條路走不通」。
// 但 Alien 副本的 20 個 approach 在**六個結果分級每一級**都加同一個 *_done / *_attempted
// 旗標，而那個旗標正是它自己的 required.flagsAbsent。於是失敗一次就永久消失，
// 引擎那份重試預算從來沒有機會生效——資料跟引擎互相矛盾，兩邊都不會報錯。
// 這是「選單只減不增」與「檢定失敗就卡殼」的資料層主因。
//
// ---
//
// 為什麼用**白名單**而不是自動判準：
//
// 「失敗把路關掉」本身不是錯的，有時候正是好設計：撬鎖失敗把門弄卡死、
// 發電機炸掉、抽水泵卡住——失敗要有重量，這種一次性後果讓選擇有代價。
//
// 錯的是**純記帳**的那種：flag_cryo_recon_done 在六個分級每一級都加，
// 連慘烈失敗都算「偵察完成了」，於是玩家連重試都不行。
//
// 這兩者的差別是語意上的（這個旗標描述的是世界變了，還是只是「我做過了」），
// 從結構上分不出來——我試過「是不是每一級都加」「有沒有被別處讀」，
// 兩種判準都會把 flag_lab_corridor_reached（些微失敗仍然抵達走廊）誤判成違規，
// 而且都擋不住「只把記帳旗標塞回某一個失敗分級」這種真實的退化。
//
// 所以改成白名單：每一筆「失敗會關掉自己」都要寫在下面並附理由。
// 新增一筆會讓測試變紅，直到有人來這裡寫下為什麼——那正是我們要的那個停頓。
import test from "node:test";
import assert from "node:assert/strict";
import { SCENARIO_REGISTRY, getScenarioReference } from "../content/scenario/registry.js";

const FAILURE_TIER = /失敗/;

/**
 * 允許「失敗即關閉」的清單：approachId -> 為什麼這個失敗該讓路永久消失。
 *
 * 判準只有一條：**這個旗標描述的是世界真的變了，而不是「玩家嘗試過了」。**
 * 門卡死、發電機燒毀、保險絲燒斷都是世界變了；「偵察完成」「交涉嘗試過」不是。
 */
const DELIBERATE_ONE_SHOT = new Map([
  ["app_cargo_tool_smash", "慘烈失敗把工具櫃砸毀，整個取工具的問題以破壞性方式收場（flag_cargo_tool_done 同時關掉同場景其他三條取工具的路）"],
  ["app_dock_hack_lock", "破解失敗把門鎖弄卡死（flag_power_door_jammed），這條路實體上不存在了"],
  ["app_dock_survey_jeep", "勘查失敗確認道路被土石流阻斷（flag_road_blocked_mudslide）"],
  ["app_dock_stealth_lab", "些微失敗仍然抵達實驗室走廊（flag_lab_corridor_reached）——關掉是因為目的已達成，不是因為失敗"],
  ["app_dock_radio_broadcast", "廣播失敗引來注意（flag_radio_noise_alert），再播一次沒有意義且更危險"],
  ["app_tunnel_climb_to_helipad", "慘烈失敗讓停機坪閘門上鎖（flag_helipad_gate_locked）"],
  ["app_tunnel_pump_water", "抽水泵卡死（flag_tunnel_pump_jammed），機具壞了就是壞了"],
  ["app_power_restart_generator", "大失敗(命定)把發電機弄毀（flag_generator_destroyed）"],
  ["app_power_bypass_circuit", "保險絲燒斷（flag_battery_fuse_blown），同一條電路不能再試"],
]);

function approachesOf(scene) {
  return [...(scene.approaches ?? []), ...(scene.phases ?? []).flatMap((phase) => phase.approaches ?? [])];
}

for (const scenarioId of Object.keys(SCENARIO_REGISTRY)) {
  const reference = getScenarioReference(scenarioId);
  if (!reference) continue;

  test(`${scenarioId}：每一個「失敗即永久關閉」都必須是刻意的`, () => {
    const found = [];
    for (const scene of reference.scenes ?? []) {
      for (const approach of approachesOf(scene)) {
        const gate = new Set(approach.required?.flagsAbsent ?? []);
        if (!gate.size) continue;
        for (const [tier, outcome] of Object.entries(approach.outcomes ?? {})) {
          if (!FAILURE_TIER.test(tier)) continue;
          const closers = (outcome.effects?.worldFlagsAdd ?? []).filter((flag) => gate.has(flag));
          if (closers.length) found.push({ id: approach.id, scene: scene.id, tier, closers });
        }
      }
    }

    const undocumented = found.filter((entry) => !DELIBERATE_ONE_SHOT.has(entry.id));
    assert.deepEqual(
      undocumented.map((entry) => `${entry.scene}/${entry.id}/${entry.tier} -> ${entry.closers.join("、")}`),
      [],
      "以下 approach 失敗一次就永久消失，玩家連重試都不行。\n" +
        "如果那是刻意的（失敗真的毀掉了這條路），請加進 DELIBERATE_ONE_SHOT 並寫下理由；\n" +
        "如果只是記帳旗標（*_done / *_attempted），請把它從失敗分級的 worldFlagsAdd 移除：\n  "
    );
  });

  test(`${scenarioId}：白名單不可以留下已經不存在的項目`, () => {
    // 白名單放著過期項目，下次真的出問題時就沒有人會信任它。
    const closing = new Set();
    for (const scene of reference.scenes ?? []) {
      for (const approach of approachesOf(scene)) {
        const gate = new Set(approach.required?.flagsAbsent ?? []);
        if (!gate.size) continue;
        for (const [tier, outcome] of Object.entries(approach.outcomes ?? {})) {
          if (!FAILURE_TIER.test(tier)) continue;
          if ((outcome.effects?.worldFlagsAdd ?? []).some((flag) => gate.has(flag))) closing.add(approach.id);
        }
      }
    }
    const idsInThisScenario = new Set((reference.scenes ?? []).flatMap((s) => approachesOf(s).map((a) => a.id)));
    for (const [id] of DELIBERATE_ONE_SHOT) {
      if (!idsInThisScenario.has(id)) continue; // 屬於另一個副本
      assert.ok(closing.has(id), `白名單裡的 ${id} 已經不會在失敗時關閉自己了，請把它移除`);
    }
  });

  test(`${scenarioId}：一般的檢定 approach 失敗後仍留在選單上`, async () => {
    const { createReferenceState, listSelectableApproaches, applyReferenceResult, resolveReferenceAction } =
      await import("../content/scenario/referenceAdapter.js");
    const state = createReferenceState(reference);
    const { scene, approaches } = listSelectableApproaches(reference, state);
    // 白名單裡的一次性 approach 本來就該消失，拿它測重試是測錯東西。
    const check = approaches.find((entry) => entry.requiresCheck && !entry.exhausted && !DELIBERATE_ONE_SHOT.has(entry.id));
    if (!check) return;

    const resolution = resolveReferenceAction({
      reference,
      state,
      chosenOption: { reference: { sceneId: scene.id, approachId: check.id, phaseId: check.phaseId } },
      character: null,
    });
    assert.ok(resolution.matched);
    const applied = applyReferenceResult({ reference, state, resolution, outcomeTier: "失敗", turnNumber: 1 });
    assert.ok(applied.applied, applied.error ?? "");
    if (applied.sceneAdvanced) return; // 作者條件讓場景離場，這個斷言沒有意義

    const after = listSelectableApproaches(reference, applied.state);
    const stillThere = after.approaches.find((entry) => entry.id === check.id);
    assert.ok(
      stillThere,
      `${check.id} 失敗一次就從選單消失了；引擎的 APPROACH_FAILURE_LIMIT 應該要讓它還能再試一次`
    );
    assert.equal(stillThere.failures, 1, "失敗次數要被記錄，選項文字才知道要換角度");
  });
}
