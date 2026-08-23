// [設計] 副本節點推進狀態機 —— 把 content/scenario/schema.js 的靜態節點圖，
// 跟一份存檔(session)實際跑到哪裡串起來。
//
// 設計原則：這裡的函式全部是純函式(輸入舊狀態、輸出新狀態，不修改傳入的物件)，
// 跟這個專案一路的 event-log 風格一致，也方便測試。
//
// 節點怎麼算「可以推進」：同一章節內，nodes 陣列依序檢查，第一個「尚未完成」且
// 「所有前置節點都已完成」的節點，就是目前的 activeNode。章節內的節點順序即是
// 作者(人類/工坊審核者)決定的敘事順序，引擎不自作主張重排。
//
// 跨章節：一個章節的節點全部完成後，才會進到下一章節找 activeNode；
// 全部章節都完成時 findActiveNode 回傳 null，呼叫端(turn.js)就知道副本已經跑完主線。

import { createTimeBudget, spendTime, isExpired, timeStatus } from "./timeBudget.js";
import { computeNodeReward, computeNodeDC, summarizeChapter, summarizeCampaign } from "./divergence.js";
import { createThreatTrack, applyOutcomeToThreat, dischargeThreat, normalizeTrack } from "./threat.js";
import { createUsageStreak, normalizeStreak, retreadPenalty, trackUsage } from "./repetition.js";

/**
 * 建立一份全新副本進度。
 * @param {object} pack 已通過 validateScenarioPack() 的副本包
 */
export function initScenarioProgress(pack) {
  const nodes = {};
  for (const chapter of pack.entries) {
    for (const node of chapter.nodes ?? []) {
      nodes[node.id] = { completed: false, divergenceTier: null };
    }
  }
  const firstChapter = pack.entries[0];
  return {
    packId: pack.id,
    chapterIndex: 0,
    nodes,
    timeBudget: firstChapter?.timeLimitRounds ? createTimeBudget(firstChapter.timeLimitRounds) : null,
    expiredAt: null, // 章節時間預算耗盡的那一刻記錄一次，避免每回合重複觸發劣化敘事指令
    // 迫近度軌（見 threat.js）：判定成敗會累積在這裡，這是「成功和失敗有決定性差異」
    // 的載體——語氣指令留不到下一回合，但這個數字會。
    threat: createThreatTrack(0),
    pendingCombat: false,
    // 套路紀錄（見 repetition.js）：同一個「屬性＋技能」連續用會愈來愈難，
    // 擋掉「把單一屬性技能點高就能一路按同一個選項通關」。
    usageStreak: createUsageStreak(),
  };
}

function flattenNodes(pack) {
  const map = {};
  for (const chapter of pack.entries) {
    for (const node of chapter.nodes ?? []) map[node.id] = node;
  }
  return map;
}

function isUnlocked(node, progress) {
  return (node.prerequisites ?? []).every((preId) => progress.nodes[preId]?.completed);
}

/**
 * 找出目前應該推進的節點。回傳 null 代表整個副本主線都完成了。
 * @param {object} pack
 * @param {object} progress initScenarioProgress() 的形狀
 */
export function findActiveNode(pack, progress) {
  const chapter = pack.entries[progress.chapterIndex];
  if (!chapter) return null;

  for (const node of chapter.nodes ?? []) {
    // onExpireNodeId 指向的是「時間預算耗盡才會走到」的劣化結局節點，不是主線節點圖的一部分。
    // 它通常沒有前置節點(才能在任何時間點被時間到觸發)，如果不排除，一般的節點掃描
    // 會把它當成「隨時都可以推進」的正常節點，讓玩家不需要真的逾時就能拿到劣化結局。
    if (node.id === chapter.onExpireNodeId) continue;

    const state = progress.nodes[node.id];
    if (!state?.completed && isUnlocked(node, progress)) {
      return node;
    }
  }
  return null; // 這一章節點全部完成，呼叫端可以自行決定是否呼叫 advanceChapter()
}

/**
 * 目前章節的節點是否已經全部完成(用來判斷要不要呼叫 advanceChapter)。
 * onExpireNodeId 指向的劣化結局節點不算在內(理由同 findActiveNode)：它是「時間到才會走的
 * 替代路線」，正常破關不會經過它，硬性要求它也完成的話章節永遠不會被判定完成。
 */
export function isChapterComplete(pack, progress) {
  const chapter = pack.entries[progress.chapterIndex];
  if (!chapter) return true;
  return (chapter.nodes ?? [])
    .filter((n) => n.id !== chapter.onExpireNodeId)
    .every((n) => progress.nodes[n.id]?.completed);
}

/** 進到下一章節，重新起算時間預算(若下一章節有設定的話)。沒有下一章節時原樣傳回。 */
export function advanceChapter(pack, progress) {
  const nextIndex = progress.chapterIndex + 1;
  const nextChapter = pack.entries[nextIndex];
  if (!nextChapter) return progress;
  return {
    ...progress,
    chapterIndex: nextIndex,
    timeBudget: nextChapter.timeLimitRounds ? createTimeBudget(nextChapter.timeLimitRounds) : null,
    expiredAt: null,
  };
}

/**
 * 結算一個節點的完成：查驗節點確實存在、確實可推進(前置都完成)、確實還沒完成過，
 * 再依「劇情扭轉度」分級查表算出實際獎勵/難度(見 divergence.js)。
 *
 * @param {object} pack
 * @param {object} progress
 * @param {string} nodeId
 * @param {number} divergenceTier 0~4，呼叫端(turn.js)必須先用 nodePrompt.js 的
 *   validateNodeComplete() 查驗過AI給的信號，這裡不再重新查驗合法範圍以外的容錯。
 * @returns {{ ok: true, progress: object, node: object, reward: number, dc: number } | { ok: false, error: string }}
 */
export function completeNode(pack, progress, nodeId, divergenceTier) {
  const nodesById = flattenNodes(pack);
  const node = nodesById[nodeId];
  if (!node) return { ok: false, error: `副本包裡沒有節點「${nodeId}」` };

  const state = progress.nodes[nodeId];
  if (!state) return { ok: false, error: `節點「${nodeId}」不屬於這份進度紀錄(可能是不同副本包)` };
  if (state.completed) return { ok: false, error: `節點「${nodeId}」已經完成過，不能重複結算` };
  if (!isUnlocked(node, progress)) {
    return { ok: false, error: `節點「${nodeId}」的前置節點還沒有全部完成，不能推進` };
  }

  const reward = computeNodeReward(node.baseRewardPoints, divergenceTier);
  const dc = computeNodeDC(node.baseDC, divergenceTier);

  const nextProgress = {
    ...progress,
    nodes: { ...progress.nodes, [nodeId]: { completed: true, divergenceTier } },
  };

  return { ok: true, progress: nextProgress, node, reward, dc };
}

/**
 * completeNode() + 章節完成時自動進下一章節，包成一次呼叫給API層用
 * (turn.js的敘事節點結算、combat/act.js的最終戰勝利結算，兩邊都需要同一套流程)。
 */
export function completeNodeAndAdvance(pack, progress, nodeId, divergenceTier) {
  const result = completeNode(pack, progress, nodeId, divergenceTier);
  if (!result.ok) return result;

  let nextProgress = result.progress;
  if (isChapterComplete(pack, nextProgress)) {
    nextProgress = advanceChapter(pack, nextProgress);
  }
  return { ...result, progress: nextProgress };
}

/** 每回合花費時間預算(推進主線或培養好感度都算)。章節沒有設時間限制時原樣傳回，不丟錯。 */
export function spendChapterTime(progress, amount, activity) {
  if (!progress.timeBudget) return progress;
  const nextBudget = spendTime(progress.timeBudget, amount, activity);
  const nowExpired = isExpired(nextBudget);
  return {
    ...progress,
    timeBudget: nextBudget,
    expiredAt: nowExpired && !progress.expiredAt ? new Date().toISOString() : progress.expiredAt,
  };
}

/** 這一次時間花費是不是「剛好」讓章節從未逾時變成逾時(用來決定要不要在prompt裡加劣化指令，只觸發一次)。 */
export function justExpired(beforeProgress, afterProgress) {
  return !beforeProgress.expiredAt && Boolean(afterProgress.expiredAt);
}

/**
 * 玩家在同一個節點上「已經卡了幾回合都沒有結算」——純粹是給prompt看的統計，
 * 節點到底能不能結算仍然完全由AI的敘事判斷(nodePrompt.js)決定，這裡不會替AI
 * 自動結算，只是讓AI在guidance文字裡「看得到自己卡了多久」，方便加重語氣。
 *
 * 呼叫端(turn.js)在每回合玩家真的採取行動、但這個節點沒有被結算時呼叫。
 * 節點一換(activeNodeId跟紀錄的不一樣)，計數自然重新從1開始。
 */
export function bumpNodeStall(progress, activeNodeId) {
  if (!activeNodeId) return progress;
  const current = progress.nodeStall;
  const rounds = current && current.nodeId === activeNodeId ? current.rounds + 1 : 1;
  return { ...progress, nodeStall: { nodeId: activeNodeId, rounds } };
}

/**
 * 把這一回合的判定結果套進迫近度軌（見 threat.js）。
 *
 * 包一層在這裡而不是讓 turn.js 直接呼叫 threat.js，理由跟 spendChapterTime 一樣：
 * 「進度物件長什麼樣」只有這個模組該知道，API層只管「這回合擲了什麼、結果如何」。
 * 舊存檔沒有 threat 欄位時 normalizeTrack() 會自動補一條全新的軌道，不會壞掉。
 *
 * @returns {{progress: object, change: object}} change 見 threat.js 的 applyOutcomeToThreat()
 */
export function applyThreatOutcome(progress, outcome) {
  const result = applyOutcomeToThreat(progress.threat, outcome);
  return { progress: { ...progress, threat: result.track }, change: result };
}

/** 讀出目前的迫近度軌（舊存檔會自動補一條全新的）。 */
export function getThreatTrack(progress) {
  return normalizeTrack(progress?.threat);
}

/**
 * 這個檢定組合「接下來」會吃到多少套路懲罰（見 repetition.js）。
 * 純查詢、不改狀態——選項按鈕要在玩家按下去**之前**就顯示這個數字，
 * 所以它必須能在不推進任何狀態的情況下被問到。
 */
export function peekRetread(progress, checkParams) {
  return retreadPenalty(progress?.usageStreak, checkParams ?? {});
}

/** 把這一次真的擲出去的檢定記進套路紀錄。 */
export function trackCheckUsage(progress, checkParams) {
  return { ...progress, usageStreak: trackUsage(progress?.usageStreak, checkParams ?? {}) };
}

/** 讀出目前的套路紀錄（舊存檔會自動補一份空的）。 */
export function getUsageStreak(progress) {
  return normalizeStreak(progress?.usageStreak);
}

/** 開戰時呼叫：追兵變成正面衝突，迫近度回落（見 threat.js 的 dischargeThreat）。 */
export function dischargeThreatOnEncounter(progress) {
  return { ...progress, threat: dischargeThreat(progress?.threat), pendingCombat: false };
}

/** 讀出目前活躍節點已經卡了幾回合(還沒卡過就是0)，給 buildNodeGuidance() 用。 */
export function getNodeStallRounds(progress, activeNodeId) {
  if (!activeNodeId || !progress.nodeStall || progress.nodeStall.nodeId !== activeNodeId) return 0;
  return progress.nodeStall.rounds;
}

/**
 * 組給API回應用的進度摘要：各章節完成度/扭轉度百分比 + 目前章節的時間狀態。
 * 前端HUD可以直接拿這包資料畫進度條，不用自己重算。
 */
export function getProgressSummary(pack, progress) {
  const chapters = pack.entries.map((chapter, index) => {
    // 劣化結局節點不計入進度條分母，理由同 findActiveNode/isChapterComplete：
    // 正常破關路線不會走到它，算進分母只會讓進度條永遠卡在100%以下。
    const nodeStates = (chapter.nodes ?? [])
      .filter((n) => n.id !== chapter.onExpireNodeId)
      .map((n) => progress.nodes[n.id]);
    return summarizeChapter(chapter.id ?? String(index), chapter.name ?? chapter.title, nodeStates);
  });

  const campaign = summarizeCampaign(chapters);
  const currentChapter = pack.entries[progress.chapterIndex];

  return {
    ...campaign,
    currentChapterIndex: progress.chapterIndex,
    timeStatus: progress.timeBudget ? timeStatus(progress.timeBudget) : null,
    timeBudget: progress.timeBudget
      ? { totalRounds: progress.timeBudget.totalRounds, spentRounds: progress.timeBudget.spentRounds }
      : null,
    chapterComplete: currentChapter ? isChapterComplete(pack, progress) : true,
    scenarioComplete: progress.chapterIndex >= pack.entries.length - 1 && isChapterComplete(pack, progress),
  };
}
