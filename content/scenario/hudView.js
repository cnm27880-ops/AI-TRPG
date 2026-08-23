// [設計] 副本 HUD 的「一份資料，兩個出口」。
//
// 前端頂欄那一條（當前目標 / 副本簡介 / 主線進度 / 迫近度 / 時間預算）是由
// public/app.js 的 updateScenarioHud() 畫的，而它的資料一直只有一個來源：
// POST /api/turn 的回應。於是玩家**重整頁面、按「接續輪迴任務」回來的時候，
// 整條 HUD 是空的**——不知道現在的目標是什麼、進度到哪、時間還剩多少，
// 一直要等到他再送出一個回合才會長出來。
//
// 這跟 2026-08-16 修掉的「重整之後戰鬥面板消失」是同一種洞：狀態明明完整存在存檔裡，
// 只是沒有人在讀取存檔的那條路徑上把它算出來。所以這裡把那份形狀抽成一個函式，
// 讓 /api/turn 與 /api/session 共用——共用才有意義，各寫一份遲早又會長歪。

import { findActiveNode, getProgressSummary } from "./progress.js";
import { threatSummary } from "./threat.js";

/**
 * 組出前端 HUD 需要的副本狀態。
 *
 * @param {object} pack 副本包（content/scenario/registry.js 的 getScenarioPack）
 * @param {object} progress 這份存檔的副本進度（session.scenario.progress）
 * @returns {object|null} pack 不存在時回 null（沒有副本就不該畫這條 HUD）
 */
export function scenarioHudView(pack, progress) {
  if (!pack) return null;
  const activeNode = findActiveNode(pack, progress);
  return {
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
    briefing: pack.briefing ?? null,
    nodeCompleted: null,
    progress: getProgressSummary(pack, progress),
    threat: threatSummary(progress?.threat, pack.threatTrack),
    ...(progress?.runSummary ? { runSummary: progress.runSummary } : {}),
  };
}
