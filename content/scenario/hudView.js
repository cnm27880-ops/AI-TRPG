// [設計] 副本 HUD 的「一份資料，兩個出口」。
//
// 前端頂欄那一條（當前目標 / 副本簡介 / 迫近度 / 時間預算）是由
// public/app.js 的 updateScenarioHud() 畫的，而它的資料一直只有一個來源：
// POST /api/turn 的回應。於是玩家**重整頁面、按「接續輪迴任務」回來的時候，
// 整條 HUD 是空的**——不知道現在的目標是什麼、進度到哪、時間還剩多少，
// 一直要等到他再送出一個回合才會長出來。
//
// 這跟 2026-08-16 修掉的「重整之後戰鬥面板消失」是同一種洞：狀態明明完整存在存檔裡，
// 只是沒有人在讀取存檔的那條路徑上把它算出來。所以這裡把那份形狀抽成一個函式，
// 讓 /api/turn 與 /api/session 共用——共用才有意義，各寫一份遲早又會長歪。
//
// ---------------------------------------------------------------------------
// [2026-09-01 第一階段] 從「以 progress 為中心」改成四層契約
// ---------------------------------------------------------------------------
// 舊形狀把 progress.overallCompletionPct 當成玩家面板的主要進度表示，前端畫成
// 「主線 43%」加一條進度條。那個數字不適合給玩家看，理由不是精度問題而是語意問題：
//
//   1. 普通場景事件與重大劇情轉折的重量完全不同，但分母把它們算成一樣。
//   2. 完成節點數不能代表真相揭露程度或角色命運的變化。
//   3. 玩家會誤以為當前節點要逐步累積到 100%，實際上通常過一回合節點就結束了。
//   4. 救下陸遠、揭露 937、走過一個普通房間，不應該被視為同等進度。
//
// 所以玩家面板改成四層，每一層回答一個玩家真的會問的問題：
//
//   mainQuest        我這一趟到底要做什麼？做完有什麼？還剩多少時間？
//   storyPhase       我在這個故事的哪一段？（階段軌，不是百分比）
//   majorStoryNodes  哪些關鍵人物／真相已經定案了？（只列已揭露的）
//   rewardSummary    我已經拿到什麼、還有什麼沒領？
//
// overallCompletionPct 仍然由 progress.js 的 getProgressSummary() 算出來，
// 給後台統計與除錯用；它只是不再出現在玩家面板的 payload 裡（見 stripPlayerFacingPct）。

import { findActiveNode, getProgressSummary } from "./progress.js";
import { threatSummary } from "./threat.js";
import { remainingRounds } from "./timeBudget.js";
import { summarizeRewardLedger } from "./rewardLedger.js";

/** 主線任務的三種狀態。刻意只有三個：進行中／已完成／已失敗。 */
export const MAIN_QUEST_STATUSES = Object.freeze(["active", "completed", "failed"]);

/** 階段軌上每一格的狀態。前端用它決定 ●／◉／○ 三種符號。 */
export const STORY_PHASE_STATUSES = Object.freeze(["done", "current", "upcoming"]);

/**
 * 這個章節裡「算進階段軌」的節點。
 *
 * 排除 onExpireNodeId 的理由跟 progress.js 的 findActiveNode / isChapterComplete
 * 完全一樣：劣化結局節點是「時間到才會走的替代路線」，正常破關不會經過它。
 * 算進分母只會讓階段軌永遠差一格。
 */
function phaseNodes(pack, progress) {
  const chapter = pack?.entries?.[progress?.chapterIndex ?? 0];
  if (!chapter) return [];
  return (chapter.nodes ?? []).filter((node) => node.id !== chapter.onExpireNodeId);
}

/**
 * 劇情階段。
 *
 * **對節點，不對章節。** Alien V2 只有一個章節 ch1，底下掛 n1~n4，所以
 * progress.chapterIndex 永遠是 0——用章節算的話這條軌永遠停在「第 1 / 1 階段」。
 * 玩家心裡的「我走到第幾段了」對應的是節點。
 *
 * 階段名用節點的 phaseLabel（作者寫給玩家看的一句話），沒寫就退回節點標題。
 * 節點標題是寫給副本作者看的索引（「母親的特別指令」對還沒玩到那裡的人就是一句謎語），
 * 這跟 playerGoal 存在的理由是同一個。
 */
export function buildStoryPhase(pack, progress) {
  const nodes = phaseNodes(pack, progress);
  if (nodes.length === 0) return null;

  const activeNode = findActiveNode(pack, progress);
  // 用 activeNode 的位置而不是「已完成節點數」：非線性副本可能先完成後面的節點，
  // 數數量會讓階段軌跳格，而玩家看到的應該是「我現在站在哪一格」。
  const activeIndex = activeNode ? nodes.findIndex((node) => node.id === activeNode.id) : -1;
  // 找不到 activeNode 代表這一章的節點都完成了，指標停在最後一格。
  const currentIndex = activeIndex >= 0 ? activeIndex : nodes.length - 1;
  const allDone = activeIndex < 0;

  return {
    index: currentIndex + 1,
    total: nodes.length,
    id: nodes[currentIndex].id,
    title: nodes[currentIndex].phaseLabel ?? nodes[currentIndex].title,
    phases: nodes.map((node, index) => ({
      id: node.id,
      title: node.phaseLabel ?? node.title,
      status:
        progress?.nodes?.[node.id]?.completed || (allDone && index <= currentIndex)
          ? "done"
          : index === currentIndex
            ? "current"
            : "upcoming",
    })),
  };
}

/**
 * 主線任務。
 *
 * 資料來自副本自己宣告的 `pack.mainQuest`；沒宣告時退回 briefing，這樣沒有升級過的
 * 副本（echoInstitute、侏羅紀）仍然畫得出這一層，只是沒有獎勵資訊。
 *
 * **時間單位是回合，不是小時。** 引擎的時間預算從頭到尾都以回合計
 * （見 timeBudget.js），把它換算成「14 小時」等於憑空生一個引擎沒有的數字——
 * 那正是 AGENTS.md 第 1 條要擋的事。要顯示成時間感是前端的文案問題，不是這裡的。
 */
export function buildMainQuest(pack, progress, summary) {
  const declared = pack?.mainQuest ?? null;
  const title = declared?.title ?? pack?.briefing?.title ?? null;
  if (!title) return null;

  const budget = progress?.timeBudget ?? null;
  // 逾時之後主線就不可能正常完成了，但玩家仍然可以在劣化路線上活下來——
  // 所以是 failed 而不是「遊戲結束」。
  const status = summary?.scenarioComplete ? "completed" : progress?.expiredAt ? "failed" : "active";

  return {
    id: declared?.id ?? (pack?.id ? `quest:${pack.id}` : null),
    title,
    status,
    description: declared?.description ?? pack?.briefing?.objective ?? null,
    timeRemaining: budget ? remainingRounds(budget) : null,
    timeUnit: budget ? "rounds" : null,
    reward: declared?.reward ? { tokens: { ...(declared.reward.tokens ?? {}) }, points: declared.reward.points ?? 0 } : null,
  };
}

/**
 * 重大劇情節點的**公開投影**。
 *
 * 這裡只做投影，不做判定——判定是第二階段 evaluateMajorStoryNodes() 的事，
 * 而它只讀 engine state、不讀任何 AI 敘事文字。這個分界要留在型別上：
 * 這個函式拿不到敘事，也就不可能被敘事影響。
 *
 * 投影規則（形狀跟 referenceStateForResponse / publicNpcRoster 是同一套）：
 *   - 只列 visibility === "discovered" 的節點。hidden 的整條不出現，不是灰掉——
 *     灰掉等於告訴玩家「這裡有一個你還不知道的秘密」，那本身就是劇透。
 *   - 只送白名單欄位。條件、證據 id 與 gmTruth 一律不出去。
 *
 * 第二階段之前 referenceState 還沒有 majorStoryState，這裡回空陣列。
 * 空陣列不是缺陷，是「這個副本目前沒有已揭露的重大劇情」的正確表達。
 */
export function publicMajorStoryNodes(reference, referenceState) {
  const catalogue = Array.isArray(reference?.majorStoryNodes) ? reference.majorStoryNodes : [];
  const stored = referenceState?.majorStoryState ?? {};
  return catalogue
    .map((node) => ({ node, state: stored[node?.id] }))
    .filter(({ node, state }) => node?.id && state?.visibility === "discovered")
    .map(({ node, state }) => ({
      id: node.id,
      title: node.title ?? node.id,
      visibility: "discovered",
      status: state.status ?? "unresolved",
      // resolution 是「解決成哪一種結果」（survived / dead / revealed…）。
      // 還沒解決時不送這個欄位，而不是送 null——前端才不需要分辨兩種「沒有」。
      ...(state.status === "resolved" && state.resolution ? { resolution: state.resolution } : {}),
      ...(node.irreversible ? { irreversible: true } : {}),
      turningReward: {
        // 已解決 → 實際拿到的那一種 resolution 值多少（存檔裡的 rewardPoints）。
        // 未解決 → 這條線最高值多少，讓玩家知道值不值得追。兩者都不是這裡臨場算的：
        // 前者是引擎定案時寫下的事實，後者是副本作者宣告的上限。
        points: state.status === "resolved"
          ? Number(state.rewardPoints) || 0
          : Math.max(0, ...(node.resolutions ?? []).map((item) => Number(item?.points) || 0), 0),
        status: state.rewardGranted ? "granted" : "unclaimed",
      },
    }));
}

/**
 * 獎勵帳本摘要 —— 三層分開，不相加。
 *
 * | 類型 | 給什麼 | 什麼時候發 |
 * | :-- | :-- | :-- |
 * | mainline      | 支線 + 分數 | 完成主線任務 |
 * | turningPoints | 分數        | 首次改變重大劇情結果 |
 * | ending        | XP          | 最終結局結算 |
 *
 * 三者的來源都是**伺服器已經記下的事實**，不是這裡臨場算的：
 * mainline 讀副本宣告的獎勵與 settledAt，turningPoints 讀第三階段的獎勵帳本
 * （progress.rewardLedger，還沒有就是 0），ending 讀 runSummary 的 xp。
 *
 * [已知落差] 支線（tokens）目前**沒有任何地方真的發放**——wallet.js 的 earn()
 * 支援它，但零個呼叫端傳它。所以 mainline.tokens 現在表達的是「這個副本宣告的
 * 主線獎勵長什麼樣」，不是「玩家已經拿到了」；status 欄位負責講清楚這件事。
 * 真正的發放是第三階段獎勵帳本的工作。
 */
export function buildRewardSummary(pack, progress, summary) {
  const declared = pack?.mainQuest?.reward ?? null;
  const settled = Boolean(progress?.settledAt);
  // [2026-09-01 第三階段] 三層全部改讀獎勵帳本。在此之前 turningPoints 是就地
  // 掃 progress.rewardLedger、而 mainline 純粹是宣告值——帳本裡已經發出去的
  // 節點獎勵與速度獎勵在玩家面板上完全看不到。
  const earned = summarizeRewardLedger(progress);

  return {
    mainline: {
      // 副本宣告的**主線完成獎勵**：這是「做完會拿到什麼」。
      tokens: { ...(declared?.tokens ?? {}) },
      points: Number(declared?.points) || 0,
      // 帳本裡已經真的入帳的主線分數與支線：節點獎勵、主線完成獎勵、速度獎勵都算在內。
      // 兩者刻意分開——「這條線值多少」跟「我已經拿到多少」不是同一個問題。
      earnedTokens: { ...earned.mainline.tokens },
      earnedPoints: earned.mainline.points,
      // 主線完成獎勵在通關結算那一刻才入帳，所以 settledAt 就是它的開關。
      status: settled ? "granted" : summary?.scenarioComplete ? "pending" : "locked",
    },
    turningPoints: { points: earned.turning_point.points },
    ending: {
      xp: settled ? Number(progress?.runSummary?.xp) || 0 : null,
      status: settled ? "granted" : "pending",
    },
  };
}

/**
 * 把玩家面板不該再看到的百分比從 progress 摘要裡拿掉。
 *
 * 為什麼是「拿掉欄位」而不是「不回傳 progress」：progress 裡還有時間狀態、
 * 章節索引與 scenarioComplete，那些前端仍然需要。整包拿掉會連帶打掉倒數與
 * 「主線已完成」那兩條分支。
 *
 * getProgressSummary() 本身完全不動——伺服器內部的統計、除錯與未來的排行榜
 * 仍然拿得到 overallCompletionPct（見 Q4 的結論）。這裡只管玩家看得到的那一份。
 */
function stripPlayerFacingPct(summary) {
  if (!summary) return summary;
  const { overallCompletionPct, chapters, ...rest } = summary;
  return {
    ...rest,
    chapters: (chapters ?? []).map(({ completionPct, ...chapter }) => chapter),
  };
}

/**
 * 組出前端 HUD 需要的副本狀態。
 *
 * @param {object} pack 副本包（content/scenario/registry.js 的 getScenarioPack）
 * @param {object} progress 這份存檔的副本進度（session.scenario.progress）
 * @param {object} [options]
 * @param {object|null} [options.reference] AI GM reference sidecar。重大劇情節點的
 *   名稱與獎勵住在這裡；沒有 reference 的副本那一層就是空的。
 * @param {object|null} [options.referenceState] 這份存檔的 referenceState。
 *   重大劇情節點的**狀態**住在這裡。兩者缺一，majorStoryNodes 就是空陣列。
 * @returns {object|null} pack 不存在時回 null（沒有副本就不該畫這條 HUD）
 */
export function scenarioHudView(pack, progress, { reference = null, referenceState = null } = {}) {
  if (!pack) return null;
  const activeNode = findActiveNode(pack, progress);
  const summary = getProgressSummary(pack, progress);
  return {
    // ---- 第一層：主線任務 ----
    mainQuest: buildMainQuest(pack, progress, summary),
    // ---- 第二層：劇情階段與目前目標 ----
    storyPhase: buildStoryPhase(pack, progress),
    activeNode: activeNode
      ? {
          id: activeNode.id,
          title: activeNode.title,
          // 玩家看得到的目標。節點標題是寫給副本作者看的索引，
          // 對還沒玩到那裡的人就是一句謎語。
          goal: activeNode.playerGoal ?? null,
          isFinale: Boolean(activeNode.isFinale),
        }
      : null,
    // ---- 第三層：重大劇情（只有已揭露的）----
    majorStoryNodes: publicMajorStoryNodes(reference, referenceState),
    // ---- 第四層：獎勵紀錄 ----
    rewardSummary: buildRewardSummary(pack, progress, summary),

    briefing: pack.briefing ?? null,
    nodeCompleted: null,
    // 時間狀態、章節索引與 scenarioComplete 仍然在這裡；百分比已經拿掉。
    progress: stripPlayerFacingPct(summary),
    threat: threatSummary(progress?.threat, pack.threatTrack),
    ...(progress?.runSummary ? { runSummary: progress.runSummary } : {}),
  };
}
