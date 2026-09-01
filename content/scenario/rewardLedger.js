// [設計] 副本獎勵帳本 —— 三層獎勵的唯一發放閘門。
//
// ---------------------------------------------------------------------------
// 為什麼需要一個帳本
// ---------------------------------------------------------------------------
// 在它存在之前，錢包有**三個各自為政的寫入點**：
//
//   functions/api/turn.js            節點完成 → earn(wallet, { points })
//   functions/api/travel.js          節點完成 → earn(wallet, { points })
//   content/combat/finaleSettlement  最終戰節點完成 → earn(wallet, { points })
//   content/scenario/settlement.js   通關結算 → earn(wallet, { xp, points })
//
// 每一個都自己判斷「這筆該不該發」，而判斷的依據各不相同：節點靠
// progress.nodes[id].completed、通關靠 progress.settledAt。只要哪一天多一種獎勵
// （例如重大劇情節點的扭轉獎勵），就得再發明第四種「發過了沒」的記法——
// 而漏掉的症狀是**同一筆獎勵被發兩次**，玩家不會回報，帳也對不出來。
//
// 所以這裡把「發不發」收斂成一件事：**這個 rewardId 在帳本裡有沒有出現過。**
// 冪等性直接來自 key 是否存在，不需要任何額外的旗標或時間戳比對。
//
// ---------------------------------------------------------------------------
// 三層獎勵，來源不同、幣別不同、時機不同
// ---------------------------------------------------------------------------
//
//   type              給什麼        什麼時候發
//   mainline          支線 + 分數   推進／完成主線（節點、主線任務、速度獎勵）
//   turning_point     分數          首次改變一個重大劇情節點的結果
//   ending            XP            最終結局結算
//
// 這個分法是規則書兩種貨幣的直接對應（見 content/shop/wallet.js）：
// 支線與分數是「主神空間的錢」，XP 是「自己鑽研來的東西」，兩者的取得方式
// 本來就不同。把它們混在同一筆發放裡，是 2026-08-17 那次語意錯位的成因。
//
// ---------------------------------------------------------------------------
// 這個模組不決定「值多少」
// ---------------------------------------------------------------------------
// 分數與 XP 一律由呼叫端算好帶進來（divergence.js 的倍率表、majorStoryNodes.js
// 的 resolution points、campaignXp.js 的固定表）。這裡只負責「發一次、記下來」。

import { earn } from "../shop/wallet.js";

/** 帳本認得的三種獎勵。不在這個表裡的一律拒發——寧可開不起來，也不要記一筆沒有分類的帳。 */
export const REWARD_TYPES = Object.freeze(["mainline", "turning_point", "ending"]);

/**
 * 各種獎勵的 rewardId 命名法。
 *
 * 全部是**決定性的**：同一件事在任何時候算出來的 id 都一樣，這是冪等性的前提。
 * 不要在 id 裡放時間戳或回合數——那會讓同一筆獎勵每回合都變成「新的一筆」。
 */
export const rewardIds = Object.freeze({
  /** 一般劇情節點完成。扭轉度不進 id：同一個節點只會完成一次，分級只影響金額。 */
  node: (nodeId) => `node:${nodeId}`,
  /** 重大劇情節點的扭轉獎勵。resolution 進 id，因為同一個節點只會定案成一種結果。 */
  turning: (nodeId, resolution) => `turning:${nodeId}:${resolution}`,
  /** 主線任務完成獎勵（支線 + 分數）。 */
  mainQuest: (questId) => `mainline:${questId}`,
  /** 通關的速度獎勵。 */
  speed: (packId) => `speed:${packId}`,
  /** 最終結局的 XP。 */
  ending: (packId) => `ending:${packId}`,
});

function normalizeAmount(value) {
  const amount = Math.trunc(Number(value) || 0);
  return amount > 0 ? amount : 0;
}

function normalizeTokenGrant(tokens) {
  const out = {};
  for (const [tier, count] of Object.entries(tokens ?? {})) {
    const amount = normalizeAmount(count);
    if (amount > 0) out[tier] = amount;
  }
  return out;
}

/** 讀出帳本（舊存檔沒有這個欄位就是空的）。 */
export function readRewardLedger(progress) {
  const ledger = progress?.rewardLedger;
  return ledger && typeof ledger === "object" ? ledger : {};
}

/** 這筆獎勵發過了沒。純查詢，不改狀態。 */
export function isRewardGranted(progress, rewardId) {
  return Object.hasOwn(readRewardLedger(progress), rewardId);
}

/**
 * 發一筆獎勵，而且**只發一次**。
 *
 * @param {object} progress 這份存檔的副本進度（帳本住在 progress.rewardLedger）
 * @param {object} wallet content/shop/wallet.js 的錢包
 * @param {object} grant
 * @param {string} grant.rewardId 決定性的唯一 id，見 rewardIds
 * @param {"mainline"|"turning_point"|"ending"} grant.type
 * @param {object} [grant.tokens] 支線，形狀同 wallet 的 tokens
 * @param {number} [grant.points] 獎勵點數
 * @param {number} [grant.xp] 經驗值
 * @param {number} [grant.turn] 記進 grantedAtTurn，稽核用
 * @param {string} [grant.label] 人看的理由（寫進事件日誌用，不影響金額）
 * @returns {{progress: object, wallet: object, granted: boolean, entry: object|null}}
 *   granted=false 代表這筆已經發過了（或金額是 0），wallet 與 progress 原樣傳回。
 */
export function grantOnce(progress, wallet, { rewardId, type, tokens, points, xp, turn = 0, label = null } = {}) {
  if (!rewardId || typeof rewardId !== "string") {
    throw new Error("grantOnce 需要一個 rewardId —— 沒有 id 就沒有冪等性可言");
  }
  if (!REWARD_TYPES.includes(type)) {
    throw new Error(`未知的獎勵類型「${type}」，合法值：${REWARD_TYPES.join("/")}`);
  }

  const ledger = readRewardLedger(progress);
  // 冪等性的全部：key 在不在。不需要比對金額或時間，也不該比對——
  // 同一個 rewardId 就是同一筆獎勵，金額算出來不一樣只代表上游有 bug。
  if (Object.hasOwn(ledger, rewardId)) {
    return { progress, wallet, granted: false, entry: ledger[rewardId] };
  }

  const grantTokens = normalizeTokenGrant(tokens);
  const grantPoints = normalizeAmount(points);
  const grantXp = normalizeAmount(xp);
  // 金額全部是 0 的話不記帳：那不是「發過了」，是「這件事本來就沒有獎勵」
  // （例如 Brett 的下落，劇情必然所以不設獎勵）。記下來只會讓帳本長滿空條目。
  if (Object.keys(grantTokens).length === 0 && grantPoints === 0 && grantXp === 0) {
    return { progress, wallet, granted: false, entry: null };
  }

  const entry = {
    type,
    ...(Object.keys(grantTokens).length ? { tokens: grantTokens } : {}),
    ...(grantPoints ? { points: grantPoints } : {}),
    ...(grantXp ? { xp: grantXp } : {}),
    grantedAtTurn: Number.isInteger(turn) ? turn : 0,
    ...(label ? { label } : {}),
  };

  return {
    progress: { ...progress, rewardLedger: { ...ledger, [rewardId]: entry } },
    wallet: earn(wallet, { tokens: grantTokens, points: grantPoints, xp: grantXp }),
    granted: true,
    entry,
  };
}

/**
 * 依類型加總帳本。給 HUD 的 rewardSummary 用。
 *
 * 三種類型分開加，**永遠不相加成一個總數**——那是討論稿 §七 那張表的重點：
 * 支線、分數與 XP 的用途與花費地點完全不同，混成一個數字對玩家沒有意義。
 */
export function summarizeRewardLedger(progress) {
  const totals = {
    mainline: { tokens: {}, points: 0 },
    turning_point: { points: 0 },
    ending: { xp: 0 },
  };
  for (const entry of Object.values(readRewardLedger(progress))) {
    const bucket = totals[entry?.type];
    if (!bucket) continue;
    if (bucket.points !== undefined) bucket.points += normalizeAmount(entry.points);
    if (bucket.xp !== undefined) bucket.xp += normalizeAmount(entry.xp);
    for (const [tier, count] of Object.entries(entry.tokens ?? {})) {
      bucket.tokens[tier] = (bucket.tokens[tier] ?? 0) + normalizeAmount(count);
    }
  }
  return totals;
}

/**
 * 把已經定案、但還沒發過扭轉獎勵的重大劇情節點結成一批待發清單。
 *
 * 只讀 referenceState.majorStoryState（那是 evaluateMajorStoryNodes 寫下的事實），
 * 不重新判定任何節點——判定是那個模組的事，這裡只問「哪些該給錢了」。
 *
 * @returns {Array<{rewardId, nodeId, resolution, points, label}>}
 */
export function pendingTurningPointRewards(reference, referenceState, progress) {
  const catalogue = Array.isArray(reference?.majorStoryNodes) ? reference.majorStoryNodes : [];
  const stored = referenceState?.majorStoryState ?? {};
  const pending = [];
  for (const node of catalogue) {
    const entry = stored[node?.id];
    if (!node?.id || entry?.status !== "resolved" || !entry.resolution) continue;
    const points = normalizeAmount(entry.rewardPoints);
    if (points === 0) continue;
    const rewardId = rewardIds.turning(node.id, entry.resolution);
    if (isRewardGranted(progress, rewardId)) continue;
    pending.push({
      rewardId,
      nodeId: node.id,
      resolution: entry.resolution,
      points,
      label: node.title ?? node.id,
    });
  }
  return pending;
}
