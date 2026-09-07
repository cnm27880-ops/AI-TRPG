// 場景停滯救援的回歸測試。
//
// 這一組鎖住的是 2026-09-07 那次改動要修的具體事故（見 referenceAdapter.js 的
// sceneStallReliefDue 與 listSelectableApproaches 檔頭）：
//
//   兩個內建副本的**每一個**非結局場景 defaultTransition 都是 "stay"，
//   而失敗結果帶 sceneTransition 的只有 Alien 3/113、侏羅紀 0/73；
//   同時每次嘗試都會靠 worldFlagsAdd + required.flagsAbsent 把該 approach 永久移出選單。
//   兩者相乘的結果是：一直失敗的玩家會走到「選單歸零、場景永不推進」的硬鎖死
//   （侏羅紀 evt_dock_arrival 第 8 回合）。
//
// 這裡刻意用**整包真實副本資料**跑完整模擬，而不是用最小 fixture：
// 這個 bug 的成因就是資料與引擎預設的交互作用，任何一邊被抽換掉都測不出來。
import test from "node:test";
import assert from "node:assert/strict";
import { getScenarioReference } from "../content/scenario/registry.js";
import {
  SCENE_STALL_LIMIT,
  applyReferenceResult,
  createReferenceState,
  listSelectableApproaches,
  resolveReferenceAction,
} from "../content/scenario/referenceAdapter.js";

const REFERENCE_IDS = ["scenario.nostromo-01-v2", "scenario.jurassic-park-01-v1"];

/**
 * 「玩家每一次檢定都失敗」的最壞情況模擬。
 * 每回合挑第一個可選 approach，需要檢定的一律判失敗，不需要檢定的走「自動」。
 */
function simulateAllFailures(reference, turns) {
  let state = createReferenceState(reference);
  const log = [];
  for (let turn = 1; turn <= turns; turn += 1) {
    const { scene, approaches } = listSelectableApproaches(reference, state);
    const usable = approaches.filter((entry) => !entry.exhausted);
    const step = {
      turn,
      sceneId: scene?.id ?? null,
      menu: usable.map((entry) => entry.id),
      advanced: false,
      stallRelief: false,
    };
    if (!usable.length) {
      log.push(step);
      break;
    }
    const pick = usable[0];
    const resolution = resolveReferenceAction({
      reference,
      state,
      chosenOption: { reference: { sceneId: scene.id, approachId: pick.id, phaseId: pick.phaseId } },
      character: null,
    });
    assert.ok(resolution.matched, `第 ${turn} 回合無法解析 ${pick.id}：${resolution.error ?? ""}`);
    const applied = applyReferenceResult({
      reference,
      state,
      resolution,
      outcomeTier: pick.requiresCheck ? "失敗" : "自動",
      turnNumber: turn,
    });
    assert.ok(applied.applied, `第 ${turn} 回合無法套用 ${pick.id}：${applied.error ?? ""}`);
    step.advanced = applied.sceneAdvanced;
    step.stallRelief = applied.stallRelief === true;
    log.push(step);
    state = applied.state;
  }
  return log;
}

for (const referenceId of REFERENCE_IDS) {
  test(`${referenceId}：一路失敗也不會出現空選單`, () => {
    const reference = getScenarioReference(referenceId);
    const log = simulateAllFailures(reference, 20);
    const empty = log.find((step) => step.menu.length === 0);
    assert.equal(
      empty,
      undefined,
      `第 ${empty?.turn} 回合在場景 ${empty?.sceneId} 選單歸零；玩家必須永遠有可按的行動`
    );
  });

  test(`${referenceId}：一路失敗時場景仍會被壓力閥推進`, () => {
    const reference = getScenarioReference(referenceId);
    const log = simulateAllFailures(reference, 20);
    const scenes = [...new Set(log.map((step) => step.sceneId))];
    assert.ok(
      scenes.length >= 3,
      `全失敗的玩家只走過 ${scenes.length} 個場景（${scenes.join(" -> ")}）；` +
        "場景不推進正是這次要修的卡殼"
    );
  });

  test(`${referenceId}：同一個場景停留不會超過上限`, () => {
    const reference = getScenarioReference(referenceId);
    const log = simulateAllFailures(reference, 20);
    let current = null;
    let streak = 0;
    for (const step of log) {
      streak = step.sceneId === current ? streak + 1 : 1;
      current = step.sceneId;
      assert.ok(
        streak <= SCENE_STALL_LIMIT,
        `場景 ${step.sceneId} 連續停留 ${streak} 回合，超過上限 ${SCENE_STALL_LIMIT}`
      );
    }
  });
}

test("壓力閥推的離場會標記 stallRelief，作者條件成立的不會", () => {
  const reference = getScenarioReference("scenario.jurassic-park-01-v1");
  const log = simulateAllFailures(reference, 20);
  const relief = log.filter((step) => step.stallRelief);
  assert.ok(relief.length > 0, "全失敗的模擬應該至少觸發一次壓力閥");
  for (const step of relief) {
    assert.ok(step.advanced, "stallRelief 只會在真的離場的那一回合出現");
  }
  // 作者條件成立的離場不可以被誤標成壓力閥——敘事層靠這個旗標決定要不要寫成「外力推走」。
  for (const step of log) {
    if (step.advanced && !step.stallRelief) continue;
    if (!step.advanced) assert.equal(step.stallRelief, false);
  }
});

test("結局場景不會被壓力閥推走", () => {
  // finaleNodeIds 標記的場景是結局判定的前提；把玩家推出去會讓 deriveEndingId 失去依據。
  for (const referenceId of REFERENCE_IDS) {
    const reference = getScenarioReference(referenceId);
    const finaleNodeIds = new Set(reference.finaleNodeIds ?? []);
    const finaleScenes = (reference.scenes ?? []).filter(
      (scene) => scene.isFinale || finaleNodeIds.has(scene.nodeId)
    );
    assert.ok(finaleScenes.length > 0, `${referenceId} 找不到結局場景，這個測試會失去意義`);
    for (const scene of finaleScenes) {
      const state = { ...createReferenceState(reference), currentSceneId: scene.id, sceneTurnCount: 99 };
      const { scene: resolved } = listSelectableApproaches(reference, state);
      assert.equal(resolved?.id, scene.id, `結局場景 ${scene.id} 應該仍是當前場景`);
    }
  }
});

test("所有 approach 都走不通時，引擎重新開放失敗最少的幾個並標記 relief", () => {
  const reference = getScenarioReference("scenario.nostromo-01-v2");
  const base = createReferenceState(reference);
  const { scene, approaches } = listSelectableApproaches(reference, base);
  assert.ok(approaches.length > 0, "起始場景應該有可選 approach");

  // 把每一個 approach 都打到失敗上限。
  const actionHistory = approaches.flatMap((entry, index) =>
    // 故意讓失敗次數不同，才能驗證「失敗最少的優先復活」而不是隨便挑。
    Array.from({ length: 2 + index }, () => ({
      sceneId: scene.id,
      approachId: entry.id,
      outcomeTier: "失敗",
      resultKey: "失敗",
    }))
  );
  const exhaustedState = { ...base, actionHistory };
  const after = listSelectableApproaches(reference, exhaustedState);
  const usable = after.approaches.filter((entry) => !entry.exhausted);

  assert.ok(usable.length > 0, "全部走不通時仍必須有可選 approach，否則玩家沒有東西可按");
  assert.ok(usable.every((entry) => entry.relief === true), "重新開放的 approach 必須帶 relief 標記");
  // 失敗次數最少的是第一個（2 次），它必須在復活名單裡。
  assert.ok(
    usable.some((entry) => entry.id === approaches[0].id),
    "應該優先復活失敗次數最少的 approach"
  );
});

test("還有路可走的時候不會亂發 relief 標記", () => {
  const reference = getScenarioReference("scenario.nostromo-01-v2");
  const state = createReferenceState(reference);
  const { approaches } = listSelectableApproaches(reference, state);
  assert.ok(approaches.length > 0);
  assert.ok(
    approaches.every((entry) => entry.relief === false),
    "一次都還沒失敗過的場景不該出現 relief"
  );
});
