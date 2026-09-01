// content/scenario/progress.js 的測試。
import test from "node:test";
import assert from "node:assert/strict";
import {
  initScenarioProgress,
  findActiveNode,
  isChapterComplete,
  advanceChapter,
  completeNode,
  completeNodeAndAdvance,
  spendChapterTime,
  justExpired,
  getProgressSummary,
} from "../content/scenario/progress.js";
import { validateScenarioPack } from "../content/scenario/schema.js";
import { NOSTROMO_SCENARIO_V2 as alienPackData } from "../content/scenario/examples/alienNostromo_v2.js";

/** 真副本包。證據閘門的價值取決於資料有沒有真的宣告 completionEvidence，所以要對著它測。 */
function alienPack() {
  return alienPackData;
}

function demoPack({ withExpire = true, withSecondChapter = false } = {}) {
  const ch1Nodes = [
    { id: "n1", title: "節點一", canonSummary: "...", prerequisites: [], baseRewardPoints: 100, baseDC: 1 },
    { id: "n2", title: "節點二", canonSummary: "...", prerequisites: ["n1"], baseRewardPoints: 200, baseDC: 2 },
    {
      id: "n3",
      title: "最終戰",
      canonSummary: "...",
      prerequisites: ["n2"],
      baseRewardPoints: 300,
      baseDC: 3,
      isFinale: true,
      bossEncounter: { name: "測試boss", attributes: { 力量: 1 }, skills: {}, weaponKey: "unarmed" },
    },
  ];
  if (withExpire) {
    ch1Nodes.push({
      id: "n-expire",
      title: "劣化結局",
      canonSummary: "...",
      prerequisites: [],
      baseRewardPoints: 10,
      baseDC: 1,
    });
  }

  const entries = [
    {
      id: "ch1",
      name: "第一章",
      timeLimitRounds: 5,
      onExpireNodeId: withExpire ? "n-expire" : undefined,
      nodes: ch1Nodes,
    },
  ];

  if (withSecondChapter) {
    entries.push({
      id: "ch2",
      name: "第二章",
      nodes: [{ id: "n4", title: "節點四", canonSummary: "...", prerequisites: [], baseRewardPoints: 50, baseDC: 1 }],
    });
  }

  return { id: "scenario.test", type: "副本", version: "1.0.0", entries };
}

test("demoPack 本身要通過 validateScenarioPack(避免測試在驗證不合法的資料)", () => {
  const check = validateScenarioPack(demoPack());
  assert.equal(check.valid, true, check.errors.join("；"));
});

test("initScenarioProgress：所有節點初始都是未完成，第一章有時間預算就建立", () => {
  const progress = initScenarioProgress(demoPack());
  assert.equal(progress.packId, "scenario.test");
  assert.equal(progress.chapterIndex, 0);
  assert.deepEqual(progress.nodes.n1, { completed: false, divergenceTier: null });
  assert.deepEqual(progress.nodes.n2, { completed: false, divergenceTier: null });
  assert.deepEqual(progress.nodes["n-expire"], { completed: false, divergenceTier: null });
  assert.equal(progress.timeBudget.totalRounds, 5);
});

test("findActiveNode：依序回傳前置條件都滿足的第一個未完成節點", () => {
  const pack = demoPack();
  let progress = initScenarioProgress(pack);
  assert.equal(findActiveNode(pack, progress).id, "n1");

  progress = completeNode(pack, progress, "n1", 0).progress;
  assert.equal(findActiveNode(pack, progress).id, "n2");
});

test("findActiveNode：劣化結局節點(onExpireNodeId)不會被當成正常可推進節點回傳", () => {
  // 這是回歸測試：劣化結局節點沒有prerequisites，若不特別排除，會被findActiveNode
  // 誤判成「隨時都可以推進」的正常節點，讓玩家不用真的逾時就能拿到劣化結局。
  const pack = demoPack();
  const progress = initScenarioProgress(pack);
  const active = findActiveNode(pack, progress);
  assert.equal(active.id, "n1", "不應該回傳n-expire");
});

test("findActiveNode：主線節點全部完成後回傳null，不會誤回傳劣化結局節點", () => {
  const pack = demoPack();
  let progress = initScenarioProgress(pack);
  progress = completeNode(pack, progress, "n1", 0).progress;
  progress = completeNode(pack, progress, "n2", 0).progress;
  progress = completeNode(pack, progress, "n3", 0).progress;
  assert.equal(findActiveNode(pack, progress), null);
});

test("isChapterComplete：劣化結局節點不計入「章節是否完成」的判斷", () => {
  const pack = demoPack();
  let progress = initScenarioProgress(pack);
  assert.equal(isChapterComplete(pack, progress), false);

  progress = completeNode(pack, progress, "n1", 0).progress;
  progress = completeNode(pack, progress, "n2", 0).progress;
  progress = completeNode(pack, progress, "n3", 0).progress;
  assert.equal(isChapterComplete(pack, progress), true, "n-expire永遠不完成也不該擋住章節完成判定");
});

test("completeNode：前置節點沒完成時擋下，不能跳著結算", () => {
  const pack = demoPack();
  const progress = initScenarioProgress(pack);
  const result = completeNode(pack, progress, "n2", 0);
  assert.equal(result.ok, false);
  assert.match(result.error, /前置節點/);
});

test("completeNode：同一個節點不能重複結算", () => {
  const pack = demoPack();
  let progress = initScenarioProgress(pack);
  progress = completeNode(pack, progress, "n1", 0).progress;
  const result = completeNode(pack, progress, "n1", 0);
  assert.equal(result.ok, false);
  assert.match(result.error, /已經完成過/);
});

test("completeNode：扭轉度分級影響獎勵(查 divergence.js 的表，不是引擎自己編)", () => {
  const pack = demoPack();
  const progress = initScenarioProgress(pack);
  const tier0 = completeNode(pack, progress, "n1", 0);
  const tier2 = completeNode(pack, progress, "n1", 2);
  assert.equal(tier0.reward, 100); // 1.0倍
  assert.equal(tier2.reward, 140); // 1.4倍
  assert.ok(tier2.reward > tier0.reward);
});

test("completeNodeAndAdvance：章節內節點全部完成時自動進下一章節", () => {
  const pack = demoPack({ withSecondChapter: true });
  let progress = initScenarioProgress(pack);
  progress = completeNodeAndAdvance(pack, progress, "n1", 0).progress;
  progress = completeNodeAndAdvance(pack, progress, "n2", 0).progress;
  assert.equal(progress.chapterIndex, 0, "最終戰節點還沒完成前不該換章節");

  progress = completeNodeAndAdvance(pack, progress, "n3", 0).progress;
  assert.equal(progress.chapterIndex, 1, "最終戰完成後章節全部達成，應該自動進到第二章");
  assert.equal(findActiveNode(pack, progress).id, "n4");
});

test("completeNodeAndAdvance：沒有下一章節時停在原地，不會丟錯", () => {
  const pack = demoPack({ withSecondChapter: false });
  let progress = initScenarioProgress(pack);
  progress = completeNodeAndAdvance(pack, progress, "n1", 0).progress;
  progress = completeNodeAndAdvance(pack, progress, "n2", 0).progress;
  progress = completeNodeAndAdvance(pack, progress, "n3", 0).progress;
  assert.equal(progress.chapterIndex, 0);
});

test("spendChapterTime：章節沒有時間限制時原樣傳回，不丟錯", () => {
  const pack = demoPack({ withSecondChapter: true });
  let progress = initScenarioProgress(pack);
  progress = completeNodeAndAdvance(pack, progress, "n1", 0).progress;
  progress = completeNodeAndAdvance(pack, progress, "n2", 0).progress;
  progress = completeNodeAndAdvance(pack, progress, "n3", 0).progress; // 進到第二章，沒有timeLimitRounds
  assert.equal(progress.timeBudget, null);
  assert.doesNotThrow(() => spendChapterTime(progress, 1, "測試"));
});

test("justExpired：只在「這一次花費」讓狀態從未逾時變逾時時才回傳true", () => {
  const pack = demoPack();
  let progress = initScenarioProgress(pack);
  let before = progress;
  progress = spendChapterTime(progress, 3, "推進");
  assert.equal(justExpired(before, progress), false);

  before = progress;
  progress = spendChapterTime(progress, 2, "推進"); // 3+2=5，剛好耗盡5點預算
  assert.equal(justExpired(before, progress), true);

  before = progress;
  progress = spendChapterTime(progress, 1, "推進"); // 已經逾時過了，不該再觸發一次
  assert.equal(justExpired(before, progress), false);
});

test("getProgressSummary：完成所有主線節點後進度應該是100%，不被劣化結局節點卡住", () => {
  const pack = demoPack();
  let progress = initScenarioProgress(pack);
  progress = completeNodeAndAdvance(pack, progress, "n1", 0).progress;
  progress = completeNodeAndAdvance(pack, progress, "n2", 0).progress;
  progress = completeNodeAndAdvance(pack, progress, "n3", 0).progress;

  const summary = getProgressSummary(pack, progress);
  assert.equal(summary.overallCompletionPct, 100);
  assert.equal(summary.chapterComplete, true);
  assert.equal(summary.scenarioComplete, true);
  assert.equal(summary.chapters[0].totalNodes, 3, "劣化結局節點不該算進分母");
});

test("getProgressSummary：回報時間狀態，供前端HUD直接顯示", () => {
  const pack = demoPack();
  let progress = initScenarioProgress(pack);
  progress = spendChapterTime(progress, 4, "推進"); // 5點預算花4點，剩20% -> 吃緊(門檻剛好20%)
  const summary = getProgressSummary(pack, progress);
  assert.equal(summary.timeStatus, "吃緊");
  assert.equal(summary.timeBudget.spentRounds, 4);
});

// ---------------------------------------------------------------------------
// [2026-09-01] 節點完成證據閘門（第零階段）
//
// 修的是一個一直沒有人看見的洞：在此之前，「節點完成」的唯一判準是
// referenceAdapter 的「場景推進了、而且下一個場景屬於別的節點」——全部是位置與
// 轉場事實，一項證據都沒查。Alien V2 裡的實際後果是「從科學區走進母核心」就結算了
// n1（150 點入帳），「走出母核心去機艙」就結算了 n2（400 點入帳，一行 937 都沒讀）。
//
// 這三條測試釘住的是閘門的三種狀態：沒宣告時完全不變、宣告了但證據不足要擋、
// 宣告了卻沒人傳 state 進來時**也要擋**（fail-closed）。
// ---------------------------------------------------------------------------

function evidencePack() {
  return {
    id: "pack.evidence",
    type: "副本",
    entries: [
      {
        id: "ch1",
        name: "第一章",
        nodes: [
          {
            id: "n1",
            title: "揭露型節點",
            canonSummary: "...",
            prerequisites: [],
            baseRewardPoints: 100,
            baseDC: 1,
            completionEvidence: [
              { anyFlags: ["flag_contact"] },
              { anyClues: ["clue_a", "clue_b"] },
            ],
          },
          { id: "n2", title: "沒宣告證據的節點", canonSummary: "...", prerequisites: ["n1"], baseRewardPoints: 200, baseDC: 2 },
        ],
      },
    ],
  };
}

test("completionEvidence：證據不成立時擋下結算——抵達地點不等於完成劇情", () => {
  const pack = evidencePack();
  const progress = initScenarioProgress(pack);

  // 旗標有了、線索還沒有：陣列成員之間是 AND，缺一條就不算完成。
  const partial = completeNode(pack, progress, "n1", 0, {
    evidenceState: { flags: ["flag_contact"], clues: [] },
  });
  assert.equal(partial.ok, false);
  assert.match(partial.error, /完成證據還不成立/);

  // 兩條都成立才放行。線索欄位是 anyClues，兩個來源任一即可。
  const full = completeNode(pack, progress, "n1", 0, {
    evidenceState: { flags: ["flag_contact"], clues: ["clue_b"] },
  });
  assert.equal(full.ok, true);
  assert.equal(full.reward, 100);
});

test("completionEvidence：宣告了證據卻沒有人傳 state 進來時是擋下，不是放行", () => {
  // fail-closed。這條閘門有三個呼叫端（turn.js / travel.js / finaleSettlement.js），
  // 預設放行的話「忘記傳參數」會變成一條安靜的繞道，而那正是它要修的那種 bug。
  const pack = evidencePack();
  const progress = initScenarioProgress(pack);
  const result = completeNode(pack, progress, "n1", 0);
  assert.equal(result.ok, false);
  assert.match(result.error, /沒有提供副本狀態/);
});

test("completionEvidence：沒宣告的節點行為完全不變(舊副本與沒有 reference 的副本不受影響)", () => {
  const pack = evidencePack();
  let progress = initScenarioProgress(pack);
  progress = completeNode(pack, progress, "n1", 0, {
    evidenceState: { flags: ["flag_contact"], clues: ["clue_a"] },
  }).progress;

  // n2 沒有 completionEvidence：連 evidenceState 都不用傳，照舊放行。
  const result = completeNode(pack, progress, "n2", 0);
  assert.equal(result.ok, true);
  assert.equal(result.reward, 200);
});

test("completionEvidence：Alien V2 的 n1/n2 不再能靠「走過一道門」結算", () => {
  // 這一條直接對著真副本測，因為閘門的價值完全取決於資料有沒有真的宣告它。
  const pack = alienPack();
  const progress = initScenarioProgress(pack);

  // 玩家人在母核心、什麼都沒查到：以前這就足以在離場時結算 n1。
  const empty = { flags: [], clues: [], currentLocation: "loc_mother_core" };
  assert.equal(completeNode(pack, progress, "n1", 3, { evidenceState: empty }).ok, false);

  // 見過陸遠 + 手上有一條痕跡線索 = n1 的目標真的達成了。
  const oriented = { flags: ["flag_luyuan_met"], clues: ["clue_alien_trace"] };
  assert.equal(completeNode(pack, progress, "n1", 0, { evidenceState: oriented }).ok, true);
});
