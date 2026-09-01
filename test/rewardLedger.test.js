// [2026-09-01 第三階段] 獎勵帳本的回歸測試。
//
// 這一組釘住的是**冪等性與三層分離**：
//   1. 同一個 rewardId 只發一次，第二次是安靜的 no-op 而不是重複入帳。
//   2. 支線、分數與 XP 分屬三層，永遠不相加成一個總數。
//   3. 支線真的進得了錢包——在這之前 earn() 支援 tokens，但零個呼叫端傳它。
//   4. 未知的獎勵類型當場丟錯，不要記一筆沒有分類的帳。
import test from "node:test";
import assert from "node:assert/strict";
import { NOSTROMO_SCENARIO_V2 as alienPack } from "../content/scenario/examples/alienNostromo_v2.js";
import alienReference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import { emptyCharacter } from "../core/schema.js";
import { createWallet } from "../content/shop/wallet.js";
import { initScenarioProgress, completeNode } from "../content/scenario/progress.js";
import { creditNodeReward, settleScenario } from "../content/scenario/settlement.js";
import { createReferenceState, normalizeReferenceState } from "../content/scenario/referenceAdapter.js";
import { evaluateMajorStoryNodes } from "../content/scenario/majorStoryNodes.js";
import {
  grantOnce,
  rewardIds,
  isRewardGranted,
  readRewardLedger,
  summarizeRewardLedger,
  pendingTurningPointRewards,
  REWARD_TYPES,
} from "../content/scenario/rewardLedger.js";

function fresh() {
  return { progress: initScenarioProgress(alienPack), wallet: createWallet() };
}

test("同一個 rewardId 只發一次，第二次是 no-op", () => {
  let { progress, wallet } = fresh();
  const grant = { rewardId: "node:n1", type: "mainline", points: 150, turn: 3, label: "空船" };

  const first = grantOnce(progress, wallet, grant);
  assert.equal(first.granted, true);
  assert.equal(first.wallet.points, 150);

  const second = grantOnce(first.progress, first.wallet, { ...grant, turn: 9 });
  assert.equal(second.granted, false, "第二次不該再入帳");
  assert.equal(second.wallet.points, 150, "錢包一分都不能多");
  assert.equal(second.wallet, first.wallet, "沒發就原樣傳回，不要多造一個物件");
  assert.equal(readRewardLedger(second.progress)["node:n1"].grantedAtTurn, 3, "第一次的稽核紀錄不可被覆蓋");
});

test("金額全部是 0 就不記帳——那不是「發過了」，是「這件事本來就沒有獎勵」", () => {
  const { progress, wallet } = fresh();
  // Brett 的下落是劇情必然，所以不設獎勵。記下來只會讓帳本長滿空條目。
  const result = grantOnce(progress, wallet, {
    rewardId: rewardIds.turning("msn_brett_fate", "confirmed_dead"),
    type: "turning_point",
    points: 0,
  });
  assert.equal(result.granted, false);
  assert.deepEqual(readRewardLedger(result.progress), {});
  assert.equal(isRewardGranted(result.progress, rewardIds.turning("msn_brett_fate", "confirmed_dead")), false);
});

test("沒有 rewardId 或類型不合法就當場丟錯，不要記一筆沒有分類的帳", () => {
  const { progress, wallet } = fresh();
  assert.throws(() => grantOnce(progress, wallet, { type: "mainline", points: 1 }), /rewardId/);
  assert.throws(() => grantOnce(progress, wallet, { rewardId: "x", type: "獎金", points: 1 }), /未知的獎勵類型/);
  assert.deepEqual(REWARD_TYPES, ["mainline", "turning_point", "ending"]);
});

test("rewardId 是決定性的：同一件事算幾次都是同一個 id", () => {
  // id 裡不可以有時間戳或回合數，否則同一筆獎勵每回合都會變成「新的一筆」。
  assert.equal(rewardIds.node("n1"), "node:n1");
  assert.equal(rewardIds.turning("msn_937", "revealed"), "turning:msn_937:revealed");
  assert.equal(rewardIds.mainQuest("quest_escape_nostromo"), "mainline:quest_escape_nostromo");
  assert.equal(rewardIds.ending("scenario.nostromo-01-v2"), "ending:scenario.nostromo-01-v2");
  // 決定性本身就直接測：同樣的輸入呼叫兩次必須逐字相同。
  // （原本這裡用 regex 找 "turn" 這個字，但 `turning:` 本來就含有它——
  //   那條斷言問的是措辭，不是性質。）
  for (const build of Object.values(rewardIds)) {
    assert.equal(build("a", "b"), build("a", "b"));
    assert.doesNotMatch(build("a", "b"), /\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}/, "id 不可以夾帶時間戳");
  }
});

test("creditNodeReward 走帳本：重複結算同一個節點不會重複入帳", () => {
  let { progress, wallet } = fresh();
  progress = completeNode(alienPack, progress, "n1", 0, {
    evidenceState: { flags: ["flag_luyuan_met"], clues: ["clue_alien_trace"] },
  }).progress;

  let credited = creditNodeReward(progress, wallet, { nodeId: "n1", points: 150, label: "空船", turn: 3 });
  assert.equal(credited.credited, 150);
  assert.equal(credited.wallet.points, 150);

  credited = creditNodeReward(credited.progress, credited.wallet, { nodeId: "n1", points: 150, turn: 9 });
  assert.equal(credited.credited, 0, "第二次回報 0，呼叫端才知道沒發");
  assert.equal(credited.wallet.points, 150);
});

test("扭轉獎勵：待發清單只讀已定案的節點，發過就不再出現", () => {
  let { progress, wallet } = fresh();
  let referenceState = normalizeReferenceState(alienReference, {
    ...createReferenceState(alienReference),
    flags: ["flag_alien_alert", "flag_xenomorph_killed"],
  });
  referenceState = {
    ...referenceState,
    majorStoryState: evaluateMajorStoryNodes(alienReference, referenceState, { turnNumber: 10 }).majorStoryState,
  };

  const pending = pendingTurningPointRewards(alienReference, referenceState, progress);
  assert.deepEqual(pending.map((item) => item.nodeId), ["msn_xenomorph_fate"]);
  assert.equal(pending[0].points, 1000);
  assert.equal(pending[0].rewardId, "turning:msn_xenomorph_fate:killed");

  const granted = grantOnce(progress, wallet, {
    rewardId: pending[0].rewardId,
    type: "turning_point",
    points: pending[0].points,
    turn: 10,
  });
  progress = granted.progress;
  wallet = granted.wallet;
  assert.equal(wallet.points, 1000);
  assert.deepEqual(pendingTurningPointRewards(alienReference, referenceState, progress), [], "發過就不該再排隊");
});

test("扭轉獎勵：還沒定案的節點不排隊，0 分的節點也不排隊", () => {
  const { progress } = fresh();
  let referenceState = normalizeReferenceState(alienReference, {
    ...createReferenceState(alienReference),
    // 只是揭露，還沒定案。
    flags: ["flag_luyuan_met", "clue_brett_fate"],
    clues: ["clue_brett_fate"],
  });
  referenceState = {
    ...referenceState,
    majorStoryState: evaluateMajorStoryNodes(alienReference, referenceState, { turnNumber: 2 }).majorStoryState,
  };
  assert.equal(referenceState.majorStoryState.msn_luyuan_fate.visibility, "discovered");
  assert.equal(referenceState.majorStoryState.msn_luyuan_fate.status, "unresolved");
  assert.deepEqual(pendingTurningPointRewards(alienReference, referenceState, progress), []);
});

test("通關結算：主線支線＋分數、速度獎勵與 XP 分屬三層，而且支線真的進錢包", () => {
  let { progress, wallet } = fresh();
  for (const id of ["n1", "n2", "n3", "n4"]) {
    progress = { ...progress, nodes: { ...progress.nodes, [id]: { completed: true, divergenceTier: 0 } } };
  }
  const settlement = settleScenario(alienPack, progress, emptyCharacter("帳本測試者"), wallet, { turn: 34 });
  assert.equal(settlement.settled, true);

  // 支線是這一輪才真的接上的：earn() 一直支援 tokens，但在此之前零個呼叫端傳它。
  assert.deepEqual(settlement.wallet.tokens, { D: 1 }, "規則書的兩種貨幣裡有一種從來沒進過玩家口袋");
  assert.deepEqual(settlement.mainQuestReward, { tokens: { D: 1 }, points: 1500 });

  const totals = summarizeRewardLedger(settlement.progress);
  assert.deepEqual(totals.mainline.tokens, { D: 1 });
  assert.equal(totals.mainline.points, 1500 + settlement.speedBonusPoints, "主線完成獎勵與速度獎勵同屬主線層");
  assert.equal(totals.turning_point.points, 0);
  assert.equal(totals.ending.xp, settlement.xp);
  // 三層永遠不相加成一個總數——它們的用途與花費地點完全不同。
  assert.equal("points" in totals.ending, false);
  assert.equal("xp" in totals.mainline, false);

  const ledger = readRewardLedger(settlement.progress);
  assert.equal(ledger["mainline:quest_escape_nostromo"].grantedAtTurn, 34, "稽核紀錄要記得住哪一回合發的");
});

test("通關結算只會結一次，帳本也只會有一份", () => {
  let { progress, wallet } = fresh();
  for (const id of ["n1", "n2", "n3", "n4"]) {
    progress = { ...progress, nodes: { ...progress.nodes, [id]: { completed: true, divergenceTier: 0 } } };
  }
  const first = settleScenario(alienPack, progress, emptyCharacter("重複結算測試者"), wallet, { turn: 34 });
  const second = settleScenario(alienPack, first.progress, emptyCharacter("重複結算測試者"), first.wallet, { turn: 40 });
  assert.equal(second.settled, false, "settledAt 那道鎖仍然在");
  assert.equal(second.wallet.points, first.wallet.points);

  // 就算 settledAt 被繞過（例如舊存檔或別條路徑），帳本仍然擋得住重複入帳。
  const bypassed = settleScenario(
    alienPack,
    { ...first.progress, settledAt: null },
    emptyCharacter("繞過測試者"),
    first.wallet,
    { turn: 41 }
  );
  assert.equal(bypassed.settled, true, "這一層確實被繞過了");
  assert.equal(bypassed.wallet.points, first.wallet.points, "但錢包一分都不能多");
  assert.deepEqual(bypassed.wallet.tokens, first.wallet.tokens, "支線也不能多發一個");
  assert.equal(bypassed.wallet.xp, first.wallet.xp);
});
