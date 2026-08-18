// [設計＋規則書] 副本結算 —— 玩家的錢從哪裡來。
//
// [決策記錄 2026-08-17] 這個模組修掉一個一直存在的語意錯位。副本節點的獎勵欄位叫
// `baseRewardPoints`，schema 註解寫的是「基礎**積分**獎勵」，divergence.js 算的是
// 「獎勵倍率」——三個地方都在講**獎勵點數**(主神商店的貨幣)。但 turn.js 與 combat/act.js
// 收到這個數字之後做的是 `character.xp.earned += result.reward`，把它當成 XP 入帳，
// UI 也寫「獲得 N 點經驗」。
//
// 為什麼會這樣：在錢包進存檔之前，**沒有地方可以放獎勵點數**，所以只好塞進 XP。
// 現在存檔有 wallet 了，就把它放回該去的地方。這條修正的後果是 XP 少了唯一的來源，
// 所以同一輪要把「副本通關結算 XP」接起來——那本來就是規則書的設計
// (core/campaignXp.js 的 fixedSessionXp，寫好、測好，但在此之前**一次都沒有被呼叫過**，
// 這是這個專案第三個「寫好了但沒有人呼叫」的模組)。
//
// 於是兩種貨幣各有各的來源，剛好對上無限恐怖的節奏：
//
//   副本進行中，完成節點 → 獎勵點數進錢包（買東西的錢，但要回主神空間才花得掉）
//   副本通關            → XP 結算（隨時可以花，副本中花要兩倍，見 shop/access.js）
//
// XP 結算的分級**全部從引擎已有的事實推出來**，沒有一項是 AI 臨場給的數字——
// 這是本專案第4條最高原則在結算上的落實，對照表見 deriveSessionTiers()。

import { fixedSessionXp } from "../../core/campaignXp.js";
import { earn } from "../shop/wallet.js";
import { MAX_TIER } from "./divergence.js";

/**
 * 完成一個節點的獎勵入帳：**獎勵點數**，不是 XP。
 * @param {object} wallet content/shop/wallet.js 的錢包
 * @param {number} points completeNode() 回傳的 reward
 * @param {string} label 入帳理由(會寫進錢包的收入明細)
 */
export function creditNodeReward(wallet, points, label) {
  if (!(points > 0)) return { wallet, credited: 0 };
  return { wallet: earn(wallet, { points }), credited: points };
}

/**
 * 把副本進度換算成 fixedSessionXp() 要的分級。
 *
 * 每一項都對應到一個引擎自己算得出來的事實。**沒有任何一項是問 AI 拿的**：
 *
 * | fixedSessionXp 的欄位 | 這裡用什麼事實推 |
 * | :-- | :-- |
 * | participated       | 有完成任何節點就是有參與 |
 * | roleplay           | 已完成節點的**平均扭轉度**(0~4)。扭轉度是 AI 從固定五級表裡挑的， |
 * |                    | 早就在 divergence.js 當獎勵倍率用了，不是這裡新開的口子 |
 * | enduredHardship    | 結算當下身上還有嚴重(L)或惡性(A)傷 —— core/health.js 的事實 |
 * | heroicAct          | 有任何一個節點打到最高扭轉度 |
 * | defeatedStrongEnemy| 有完成標記 isFinale 的最終戰節點 |
 *
 * 美德/惡德(virtueTriggers/viceTriggers)**仍然一律 0**，這是刻意的。
 *
 * [2026-08-18] 角色現在確實有美德與惡德了（見 content/chargen/virtueVice.js，建卡時由五題
 * 綜合判定），所以「有沒有這筆資料」不再是缺口。缺的是另一件事：**沒有任何引擎事實
 * 能推出「玩家這一場觸發過美德」**。上面每一欄都對應到引擎自己算得出來的東西
 * （節點完成度、扭轉度、傷勢、最終戰旗標），觸發美德惡德不是——它是一個關於
 * 「玩家的行動有沒有體現這個性格」的判斷。
 *
 * 要接的話只有兩條路，兩條都需要先做決定，所以現在不動：
 *   a. 讓AI在每回合的回傳裡多報一個布林值（像 divergenceTier 那樣從固定表裡挑），引擎自己累加
 *   b. 讓玩家主動宣告「我這個行動是在貫徹我的美德」，由引擎記次數
 * 在其中一條做好之前填任何數字都是編的，那正是本檔案第4條最高原則要擋的事。
 */
export function deriveSessionTiers(pack, progress, character) {
  const nodeStates = Object.entries(progress?.nodes ?? {})
    .map(([id, state]) => ({ id, ...state }))
    .filter((n) => n.completed);

  const withTier = nodeStates.filter((n) => n.divergenceTier != null);
  const avgTier =
    withTier.length === 0
      ? 0
      : withTier.reduce((sum, n) => sum + n.divergenceTier, 0) / withTier.length;

  // 平均扭轉度 0~4 → 四級演出評價。門檻取整數級距，不做小數判斷。
  let roleplay = "無";
  if (avgTier >= 3) roleplay = "優異";
  else if (avgTier >= 2) roleplay = "出色";
  else if (avgTier >= 1) roleplay = "普通";

  const hp = character?.derived?.hp ?? {};
  const woundedBadly = (hp.L ?? 0) > 0 || (hp.A ?? 0) > 0;
  // 傷勢愈重級距愈高(1~5)，用 L+A 的總點數分級，這是 core/health.js 直接看得到的數字。
  const woundPoints = (hp.L ?? 0) + (hp.A ?? 0);
  const hardshipLevel = Math.max(1, Math.min(5, woundPoints));

  const finaleIds = new Set(
    (pack?.entries ?? []).flatMap((chapter) =>
      (chapter.nodes ?? []).filter((n) => n.isFinale).map((n) => n.id)
    )
  );
  const beatFinale = nodeStates.some((n) => finaleIds.has(n.id));

  return {
    participated: nodeStates.length > 0,
    roleplay,
    enduredHardship: woundedBadly ? "有" : "無",
    enduredHardshipLevel: hardshipLevel,
    heroicAct: withTier.some((n) => n.divergenceTier >= MAX_TIER),
    defeatedStrongEnemy: beatFinale ? "有" : "無",
    defeatedStrongEnemyLevel: 1,
    virtueTriggers: 0,
    viceTriggers: 0,
  };
}

/**
 * 副本通關結算：算出 XP 並存進錢包。
 *
 * **一份存檔只結算一次**，靠 progress.settledAt 這個時間戳擋住重複結算——
 * 通關之後玩家還會繼續在主神空間逛商店，每一次 /api/turn 都會重新看到
 * 「副本已完成」，沒有這道閘門就會每回合再發一次獎勵。
 *
 * @returns {{ settled: boolean, wallet: object, progress: object, xp?: number, breakdown?: object, tiers?: object }}
 */
export function settleScenario(pack, progress, character, wallet) {
  if (!progress) return { settled: false, wallet, progress };
  if (progress.settledAt) return { settled: false, wallet, progress, reason: "這個副本已經結算過了" };

  const tiers = deriveSessionTiers(pack, progress, character);
  const { total, breakdown } = fixedSessionXp(tiers);

  return {
    settled: true,
    xp: total,
    breakdown,
    tiers,
    wallet: earn(wallet, { xp: total }),
    progress: { ...progress, settledAt: new Date().toISOString() },
  };
}
