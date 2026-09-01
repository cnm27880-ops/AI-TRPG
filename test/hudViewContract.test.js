// [2026-09-01 第一階段] HUD 資料契約的回歸測試。
//
// 這一組釘住的是**形狀與邊界**，不是像素：
//   1. 四層物件都在，而且每一層的資料來源都是伺服器已經記下的事實。
//   2. 主線百分比不再出現在玩家面板的 payload 裡（但仍然算得出來給後台用）。
//   3. 劇情階段對**節點**不對章節——Alien V2 只有一個章節，對章節算永遠是 1/1。
//   4. 重大劇情只投影已揭露的節點，hidden 的整條不出現、gmTruth 一個字都不出去。
import test from "node:test";
import assert from "node:assert/strict";
import { NOSTROMO_SCENARIO_V2 as alienPack } from "../content/scenario/examples/alienNostromo_v2.js";
import alienReference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import { ECHO_INSTITUTE_SCENARIO } from "../content/scenario/examples/echoInstitute.js";
import { initScenarioProgress, completeNode, getProgressSummary } from "../content/scenario/progress.js";
import { createReferenceState, normalizeReferenceState } from "../content/scenario/referenceAdapter.js";
import { scenarioHudView, publicMajorStoryNodes } from "../content/scenario/hudView.js";

function alienState() {
  return normalizeReferenceState(alienReference, createReferenceState(alienReference));
}

function hud(progress, referenceState = alienState()) {
  return scenarioHudView(alienPack, progress, { reference: alienReference, referenceState });
}

/** 走完 n1 與 n2，讓階段軌前進兩格。證據閘門要餵真的證據。 */
function afterTwoNodes() {
  let progress = initScenarioProgress(alienPack);
  progress = completeNode(alienPack, progress, "n1", 0, {
    evidenceState: { flags: ["flag_luyuan_met"], clues: ["clue_alien_trace"] },
  }).progress;
  progress = completeNode(alienPack, progress, "n2", 0, {
    evidenceState: { flags: [], clues: ["clue_order_937"] },
  }).progress;
  return progress;
}

test("四層契約都在，而且主線任務讀的是副本宣告的 mainQuest 而不是船名", () => {
  const view = hud(initScenarioProgress(alienPack));
  for (const key of ["mainQuest", "storyPhase", "activeNode", "majorStoryNodes", "rewardSummary"]) {
    assert.ok(key in view, `HUD 契約缺少 ${key}`);
  }
  // briefing.title 是「USCSS 諾斯托羅莫號」——那是船名，不是任務名。
  assert.equal(view.mainQuest.title, "逃離諾斯托羅莫號");
  assert.notEqual(view.mainQuest.title, alienPack.briefing.title);
  assert.equal(view.mainQuest.status, "active");
  assert.deepEqual(view.mainQuest.reward, { tokens: { D: 1 }, points: 1500 });
});

test("倒數的單位是回合，不是小時——引擎沒有小時這個數字", () => {
  const view = hud(initScenarioProgress(alienPack));
  assert.equal(view.mainQuest.timeUnit, "rounds");
  assert.equal(view.mainQuest.timeRemaining, alienPack.entries[0].timeLimitRounds);
  // 把回合換算成小時等於憑空生一個引擎沒有的數字，那是 AGENTS.md 第 1 條要擋的事。
  assert.doesNotMatch(JSON.stringify(view.mainQuest), /hour|小時/);
});

test("劇情階段對節點不對章節，而且劣化結局節點不算在分母裡", () => {
  const chapter = alienPack.entries[0];
  assert.equal(alienPack.entries.length, 1, "Alien V2 只有一個章節——這正是不能對章節算的理由");
  assert.ok(chapter.nodes.some((node) => node.id === chapter.onExpireNodeId));

  const start = hud(initScenarioProgress(alienPack)).storyPhase;
  assert.equal(start.total, 4, "n-expire 不計入分母");
  assert.equal(start.index, 1);
  assert.equal(start.title, "覺醒", "階段名用 phaseLabel，不是給作者看的節點標題");
  assert.deepEqual(start.phases.map((phase) => phase.status), ["current", "upcoming", "upcoming", "upcoming"]);
  assert.equal(start.phases.some((phase) => phase.id === chapter.onExpireNodeId), false);

  const later = hud(afterTwoNodes()).storyPhase;
  assert.equal(later.index, 3);
  assert.equal(later.id, "n3");
  assert.deepEqual(later.phases.map((phase) => phase.status), ["done", "done", "current", "upcoming"]);
});

test("主線百分比不再出現在玩家面板的 payload，但伺服器仍然算得出來", () => {
  const progress = afterTwoNodes();
  const view = hud(progress);
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /overallCompletionPct/, "玩家面板不該再看到主線百分比");
  assert.doesNotMatch(serialized, /completionPct/, "各章節的百分比同樣不送");

  // 但 progress 本身要留著：時間狀態、章節索引與 scenarioComplete 前端仍然需要。
  assert.ok(view.progress);
  assert.ok("timeStatus" in view.progress);
  assert.ok("scenarioComplete" in view.progress);

  // 後台統計與除錯仍然拿得到——getProgressSummary() 一個字都沒改。
  assert.equal(typeof getProgressSummary(alienPack, progress).overallCompletionPct, "number");
});

test("重大劇情只投影已揭露的節點，hidden 的整條不出現", () => {
  const reference = {
    majorStoryNodes: [
      { id: "msn_luyuan_fate", title: "陸遠的命運", irreversible: true, reward: { points: 500 } },
      { id: "msn_937", title: "937 指令的真相", reward: { points: 300 } },
      { id: "msn_ash_fate", title: "Ash 的命運" },
    ],
  };
  const referenceState = {
    majorStoryState: {
      msn_luyuan_fate: { visibility: "discovered", status: "resolved", resolution: "survived", rewardGranted: true },
      msn_937: { visibility: "discovered", status: "unresolved" },
      msn_ash_fate: { visibility: "hidden", status: "unresolved" },
    },
  };
  const projected = publicMajorStoryNodes(reference, referenceState);

  assert.deepEqual(projected.map((node) => node.id), ["msn_luyuan_fate", "msn_937"]);
  // hidden 是整條消失，不是灰掉——灰掉等於告訴玩家「這裡有一個你還不知道的秘密」。
  assert.equal(JSON.stringify(projected).includes("msn_ash_fate"), false);

  assert.deepEqual(projected[0], {
    id: "msn_luyuan_fate",
    title: "陸遠的命運",
    visibility: "discovered",
    status: "resolved",
    resolution: "survived",
    irreversible: true,
    turningReward: { points: 500, status: "granted" },
  });
  // 還沒解決的節點不送 resolution 欄位，前端才不用分辨兩種「沒有」。
  assert.equal("resolution" in projected[1], false);
  assert.equal(projected[1].turningReward.status, "unclaimed");
});

test("第二階段之前沒有 majorStoryState，投影是空陣列而不是壞掉", () => {
  assert.deepEqual(hud(initScenarioProgress(alienPack)).majorStoryNodes, []);
  assert.deepEqual(publicMajorStoryNodes(null, null), []);
  assert.deepEqual(publicMajorStoryNodes({ majorStoryNodes: [{ id: "x", title: "X" }] }, {}), []);
});

test("獎勵摘要三層分開，而且結算前後的狀態說得清楚", () => {
  const before = hud(initScenarioProgress(alienPack)).rewardSummary;
  assert.deepEqual(before.mainline, { tokens: { D: 1 }, points: 1500, status: "locked" });
  assert.deepEqual(before.turningPoints, { points: 0 });
  assert.deepEqual(before.ending, { xp: null, status: "pending" });

  // 第三階段的獎勵帳本寫進來之後，扭轉分數要加總——而且只加 turning_point 那一類。
  const withLedger = {
    ...initScenarioProgress(alienPack),
    rewardLedger: {
      "turning:msn_luyuan_fate:survived": { type: "turning_point", points: 500 },
      "turning:msn_937:revealed": { type: "turning_point", points: 300 },
      "mainline:quest_escape_nostromo": { type: "mainline", points: 1500 },
    },
  };
  assert.equal(hud(withLedger).rewardSummary.turningPoints.points, 800, "主線那筆不可以被算進扭轉分數");

  // 通關結算之後：XP 才有數字，主線獎勵才算發出去。
  const settled = { ...initScenarioProgress(alienPack), settledAt: "2026-09-01T00:00:00Z", runSummary: { xp: 42 } };
  const after = hud(settled).rewardSummary;
  assert.equal(after.mainline.status, "granted");
  assert.deepEqual(after.ending, { xp: 42, status: "granted" });
});

test("沒有 mainQuest／沒有 reference 的舊副本仍然畫得出 HUD，只是少了那幾層", () => {
  // echoInstitute 既沒有宣告 mainQuest，也沒有 briefing，更沒有 reference sidecar——
  // 是這個 repo 裡「完全沒升級過」的那一個副本，剛好可以測退化路徑。
  const progress = initScenarioProgress(ECHO_INSTITUTE_SCENARIO);
  const view = scenarioHudView(ECHO_INSTITUTE_SCENARIO, progress);
  assert.ok(view, "沒升級過的副本不該回 null");

  // 兩個來源都沒有時給一個明確的 null，而不是一個標題是 undefined 的半成品物件：
  // 前端只要判斷「有沒有這一層」，不必再去猜裡面哪些欄位可信。
  assert.equal(view.mainQuest, null);
  assert.deepEqual(view.majorStoryNodes, [], "沒有 reference 就沒有重大劇情可投影");
  assert.ok(view.storyPhase, "階段軌只需要節點，沒有 reference 也算得出來");
  // 分母同樣排除劣化結局節點——這條規則不是 Alien 專屬的。
  const chapter = ECHO_INSTITUTE_SCENARIO.entries[0];
  const expected = (chapter.nodes ?? []).filter((node) => node.id !== chapter.onExpireNodeId).length;
  assert.equal(view.storyPhase.total, expected);
  assert.ok(expected < (chapter.nodes ?? []).length, "這個副本應該有劣化結局節點，才測得到排除邏輯");
  // 獎勵摘要仍然成形，只是主線那一層是空的。
  assert.deepEqual(view.rewardSummary.mainline, { tokens: {}, points: 0, status: "locked" });
});

test("有 briefing 但沒有 mainQuest 的副本，退回 briefing 而不是整層消失", () => {
  // 侏羅紀還沒宣告 mainQuest，但它有 briefing——這是升級過程中的中間狀態，
  // 不該讓 HUD 第一層整層不見。
  const pack = { ...alienPack, mainQuest: undefined };
  const view = scenarioHudView(pack, initScenarioProgress(pack));
  assert.equal(view.mainQuest.title, alienPack.briefing.title);
  assert.equal(view.mainQuest.description, alienPack.briefing.objective);
  assert.equal(view.mainQuest.reward, null, "沒宣告獎勵就是沒有，不要編一個 0 分出來當真");
});

test("pack 不存在時仍然回 null（沒有副本就不該畫這條 HUD）", () => {
  assert.equal(scenarioHudView(null, {}), null);
  assert.equal(scenarioHudView(undefined, {}, { reference: alienReference }), null);
});
