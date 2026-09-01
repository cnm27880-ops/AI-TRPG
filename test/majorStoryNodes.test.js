// [2026-09-01 第二階段] 重大劇情節點評估器的回歸測試。
//
// 這一組釘住的是**權限邊界與單向性**，不是分數對不對：
//   1. 評估器拿不到敘事——這是型別層級的保證，不是靠檢查擋的。
//   2. hidden → discovered、unresolved → resolved|missed 都是單向，定案就鎖住。
//   3. 抵達地點、AI 文字、玩家宣稱都不能解決節點；只有引擎 state 可以。
//   4. 已揭露才投影給玩家；沒揭露就錯過的節點連「你錯過了」都不該說。
import test from "node:test";
import assert from "node:assert/strict";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import { emptyCharacter } from "../core/schema.js";
import {
  createReferenceState,
  normalizeReferenceState,
  buildReferenceOptions,
  resolveReferenceAction,
  applyReferenceResult,
} from "../content/scenario/referenceAdapter.js";
import {
  evaluateMajorStoryNodes,
  normalizeMajorStoryState,
  buildMajorStoryNodeBlock,
  MAJOR_STORY_NODE_LEGEND,
} from "../content/scenario/majorStoryNodes.js";
import { publicMajorStoryNodes } from "../content/scenario/hudView.js";

const EXPECTED_NODES = [
  "msn_937",
  "msn_luyuan_fate",
  "msn_ash_fate",
  "msn_brett_fate",
  "msn_xenomorph_fate",
  "msn_sample_fate",
  "msn_infection",
];

/** 只餵 engine state，跑一次評估。 */
function evaluate(state, turnNumber = 1) {
  return evaluateMajorStoryNodes(reference, { flags: [], clues: [], npcStatuses: {}, ...state }, { turnNumber });
}

/** 連續評估：把上一次的結果接回 state，模擬真的一回合一回合走。 */
function advance(state, patches) {
  let current = { flags: [], clues: [], npcStatuses: {}, majorStoryState: null, ...state };
  const log = [];
  patches.forEach((patch, index) => {
    current = { ...current, ...patch };
    const result = evaluateMajorStoryNodes(reference, current, { turnNumber: index + 1 });
    current = { ...current, majorStoryState: result.majorStoryState };
    log.push(result.changes);
  });
  return { state: current, log };
}

test("副本宣告了七個重大節點，而且每一個 resolution 的分數都是作者定的常數", () => {
  assert.deepEqual(reference.majorStoryNodes.map((node) => node.id), EXPECTED_NODES);
  const points = Object.fromEntries(
    reference.majorStoryNodes.map((node) => [
      node.id,
      Object.fromEntries((node.resolutions ?? []).map((item) => [item.id, item.points])),
    ])
  );
  assert.equal(points.msn_luyuan_fate.survived, 500);
  assert.deepEqual(
    [points.msn_937.partial, points.msn_937.revealed, points.msn_937.evidence_saved],
    [100, 300, 500]
  );
  assert.equal(points.msn_ash_fate.destroyed, 300);
  assert.equal(points.msn_brett_fate.confirmed_dead, 0, "劇情必然，不設獎勵");
  assert.equal(points.msn_xenomorph_fate.killed, 1000);
  assert.equal(points.msn_sample_fate.preserved, 400);
  assert.equal(points.msn_infection.cleared, 500);
});

test("評估器的簽章裡沒有敘事——AI 說陸遠死了，節點也不會動", () => {
  // 這一條測的是型別，不是行為：evaluateMajorStoryNodes(reference, state) 只有兩個參數，
  // 沒有任何地方可以塞敘事文字進去。所以「AI 宣稱某事發生了」在結構上就無法生效。
  assert.equal(evaluateMajorStoryNodes.length, 2, "多一個參數就要問清楚它是不是敘事的後門");

  const narratedButNotApplied = {
    flags: ["flag_luyuan_met"],
    npcStatuses: { npc_luyuan: "met" },
    // 引擎沒有任何 effect 說他死了；下面兩個欄位是 AI 這一回合寫的字，
    // 評估器讀不到它們，也不該讀。
    lastResultText: "陸遠倒在通風管口，血從他的戰術背心底下滲出來。他死了。",
  };
  const result = evaluate(narratedButNotApplied);
  assert.equal(result.majorStoryState.msn_luyuan_fate.status, "unresolved");
  assert.equal(result.majorStoryState.msn_luyuan_fate.visibility, "discovered", "見過他就算揭露");
});

test("揭露是單向的，而且要有引擎事實當證據", () => {
  const before = evaluate({});
  assert.equal(before.majorStoryState.msn_luyuan_fate.visibility, "hidden");
  assert.deepEqual(before.changes, [], "什麼都沒發生就不該有變動");

  const { state, log } = advance({}, [
    { flags: ["flag_luyuan_met"], npcStatuses: { npc_luyuan: "met" } },
    {}, // 同樣的狀態再跑一次
  ]);
  assert.equal(log[0][0].to, "discovered");
  assert.deepEqual(log[0][0].evidence, ["flag_luyuan_met"], "證據要記下來，事後才查得到為什麼揭露");
  assert.deepEqual(log[1], [], "已經揭露過就不該再報一次變動");
  assert.equal(state.majorStoryState.msn_luyuan_fate.visibility, "discovered");
});

test("解決是單向的：定案之後不再重新推測，也不會被後續狀態改寫", () => {
  const { state, log } = advance({}, [
    { flags: ["flag_luyuan_met"], npcStatuses: { npc_luyuan: "met" } },
    { npcStatuses: { npc_luyuan: "dead" } },
    // 就算後面有人把狀態改回去（例如一筆矛盾的資料），已定案的節點也不動。
    { npcStatuses: { npc_luyuan: "survived" } },
  ]);
  assert.equal(log[1][0].to, "resolved");
  assert.equal(log[1][0].resolution, "dead");
  assert.deepEqual(log[2], [], "已經定案的節點不該再產生變動");
  assert.equal(state.majorStoryState.msn_luyuan_fate.resolution, "dead");
  assert.equal(state.majorStoryState.msn_luyuan_fate.resolvedAtTurn, 2);
});

test("937：先讀到摘要不會提早鎖死節點，之後仍然可以升級成完整證據", () => {
  const { state, log } = advance({}, [
    // 自動列印的摘要：揭露，但不解決——partial 標了 onlyOnClose。
    { flags: ["flag_937_partial"], clues: ["clue_order_937"] },
    // 深度檢索大成功：帶得走的證據。
    { flags: ["flag_937_partial", "flag_order_937_revealed", "flag_937_evidence_saved"] },
  ]);
  assert.equal(log[0][0].to, "discovered");
  assert.equal(log[0].length, 1, "第一回合只揭露，不解決");
  assert.equal(log[1][0].resolution, "evidence_saved");
  assert.equal(log[1][0].points, 500, "先中先贏：帶得走的證據勝過完整內容");
  assert.equal(state.majorStoryState.msn_937.rewardPoints, 500);
});

test("937：窗口關閉時，只讀到片段的人補判成 partial", () => {
  const { state, log } = advance({}, [
    { flags: ["flag_937_partial"], clues: ["clue_order_937"] },
    { shipStatus: "overload_started" }, // 超載啟動＝再也回不了主機核心
  ]);
  assert.equal(log[1][0].resolution, "partial");
  assert.equal(log[1][0].points, 100);
  assert.equal(state.majorStoryState.msn_937.status, "resolved");
});

test("937：完全沒讀到就逃走，節點錯失且不會顯示給玩家", () => {
  const { state, log } = advance({}, [{ flags: ["flag_escaped_to_narcissus"] }]);
  const missed = log[0].find((change) => change.id === "msn_937");
  assert.equal(missed.to, "missed");

  const entry = state.majorStoryState.msn_937;
  assert.equal(entry.status, "missed");
  assert.equal(entry.visibility, "hidden", "從沒揭露過就錯過");
  // 玩家從不知道它存在，跳出「你錯過了 937」本身就是劇透。
  assert.equal(
    publicMajorStoryNodes(reference, state).some((node) => node.id === "msn_937"),
    false
  );
});

test("同一回合既達成又關窗時，解決勝出——玩家是在最後一刻做到的", () => {
  const { log } = advance({}, [
    { flags: ["flag_alien_alert"] },
    // 殺掉異形與進入休眠同一回合發生：窗口關閉，但 killed 也成立。
    { flags: ["flag_alien_alert", "flag_xenomorph_killed", "flag_hypersleep_entered"] },
  ]);
  const change = log[1].find((item) => item.id === "msn_xenomorph_fate");
  assert.equal(change.to, "resolved");
  assert.equal(change.resolution, "killed");
  assert.equal(change.points, 1000);
});

test("跑一條真實路線：節點依序揭露，937 在深度檢索時定案", async () => {
  const character = emptyCharacter("第二階段路線測試者");
  let state = normalizeReferenceState(reference, createReferenceState(reference));
  let turn = 0;
  const seen = [];

  function act(sceneId, location, approachId, tier) {
    turn += 1;
    state = { ...state, currentSceneId: sceneId, currentLocation: location };
    const option = buildReferenceOptions(reference, state).find((item) => item.reference.approachId === approachId);
    assert.ok(option, `${sceneId} 應提供 ${approachId}`);
    const resolution = resolveReferenceAction({ reference, state, chosenOption: option, character });
    const applied = applyReferenceResult({ reference, state, resolution, outcomeTier: tier, turnNumber: turn });
    assert.equal(applied.applied, true, applied.error);
    state = applied.state;
    seen.push(...applied.majorStoryChanges);
  }

  act("evt_cryo_clearance", "loc_cryo", "app_cryo_recon", "成功");
  act("evt_deck_a_recon", "loc_deck_a", "app_deck_luyuan_contact", "自動");
  act("evt_order_937_reveal", "loc_mother_core", "app_order_manual_read", "自動");
  act("evt_order_937_reveal", "loc_mother_core", "app_order_query", "大成功");

  // 評估器掛在 applyReferenceResult 這個匯流點上，所以一般回合這條路徑一定會跑到。
  assert.deepEqual(
    seen.filter((change) => change.to === "discovered").map((change) => change.id),
    ["msn_xenomorph_fate", "msn_luyuan_fate", "msn_937"]
  );
  const resolved = seen.find((change) => change.to === "resolved");
  assert.equal(resolved.id, "msn_937");
  assert.equal(resolved.resolution, "evidence_saved");
  assert.equal(state.majorStoryState.msn_937.status, "resolved");
});

test("動態區塊：沒有變動就不送 CHANGED，未定案清單則每回合都送", () => {
  const state = advance({}, [{ flags: ["flag_luyuan_met"], npcStatuses: { npc_luyuan: "met" } }]).state;

  const quiet = buildMajorStoryNodeBlock(reference, state, []);
  assert.doesNotMatch(quiet, /MAJOR_NODES_CHANGED/, "沒變動就不要洗版");
  assert.match(quiet, /MAJOR_NODES_LOCKED/, "禁令每回合都要在");
  assert.match(quiet, /陸遠的命運/);

  const noisy = buildMajorStoryNodeBlock(reference, state, [
    { id: "msn_937", title: "937 指令的真相", from: "unresolved", to: "resolved", resolution: "revealed", points: 300 },
  ]);
  assert.match(noisy, /MAJOR_NODES_CHANGED/);
  assert.match(noisy, /937 指令的真相：unresolved → resolved\(revealed\)/);
  // 證據 id 與分數是伺服器的稽核資料，不是模型的演出素材。
  assert.doesNotMatch(noisy, /flag_|clue_|300/);
});

test("靜態層的讀法講明了 AI 不能決定什麼，而且整場逐字不變", () => {
  assert.match(MAJOR_STORY_NODE_LEGEND, /只由引擎裁定/);
  assert.match(MAJOR_STORY_NODE_LEGEND, /尚未定案/);
  assert.match(MAJOR_STORY_NODE_LEGEND, /你可以自由描寫節點\*\*內部\*\*的過程/);
  assert.match(MAJOR_STORY_NODE_LEGEND, /不可以把「重大劇情節點」/);
  // 它不吃任何參數，所以不可能夾帶這一局的狀態進靜態層。
  assert.equal(typeof MAJOR_STORY_NODE_LEGEND, "string");
});

test("舊存檔沒有 majorStoryState 時補成可用形狀，已定案的結果一個字都不動", () => {
  const fresh = normalizeMajorStoryState(reference, null);
  assert.deepEqual(Object.keys(fresh).sort(), [...EXPECTED_NODES].sort());
  assert.equal(fresh.msn_937.status, "unresolved");

  const carried = normalizeMajorStoryState(reference, {
    msn_937: { visibility: "discovered", status: "resolved", resolution: "revealed", rewardPoints: 300, resolvedAtTurn: 7 },
    msn_ghost: { visibility: "discovered", status: "resolved" }, // reference 已經沒有這個節點了
  });
  assert.equal(carried.msn_937.resolution, "revealed");
  assert.equal(carried.msn_937.rewardPoints, 300);
  assert.equal(carried.msn_937.resolvedAtTurn, 7);
  assert.equal("msn_ghost" in carried, false, "目錄裡沒有的節點不該被帶進來");
});

test("扭轉獎勵這一階段只計算不發放——rewardGranted 恆為 false", () => {
  // 實際入帳是第三階段獎勵帳本的工作。這裡先把「值多少分」記下來，
  // HUD 上會顯示 unclaimed，那是誠實的現況，不是漏掉。
  const { state } = advance({}, [{ flags: ["flag_alien_alert", "flag_xenomorph_killed"] }]);
  const entry = state.majorStoryState.msn_xenomorph_fate;
  assert.equal(entry.status, "resolved");
  assert.equal(entry.rewardPoints, 1000);
  assert.equal(entry.rewardGranted, false);
});
