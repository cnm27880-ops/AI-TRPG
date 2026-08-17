// [設計] 劇情節點與「劇情扭轉度」系統 —— 規則書完全沒有這套東西，是使用者這次提出的全新需求：
// 「劇情跟原本設定差越多，獎勵越豐厚，但劇情阻力(骰子難度)也越高，而且獎勵幅度需要嚴格數值規則」
//
// 設計原則(遵守 ARCHITECTURE.md 最高原則4)：AI 只能在「有限分級」裡挑一個扭轉度分級，
// 不能自己決定「這次獎勵給多少」。分級 -> 倍率/難度調整，全部是這裡的固定表。
//
// 分級的判斷基準(給 AI 的分級指引，之後會放進 prompt)：
//   0 完全遵循原劇情：關鍵事件、關鍵角色生死、關鍵抉擇都跟原作一致
//   1 小幅偏離：結果一樣，但過程/手段不同，沒有產生新的後續影響
//   2 中度偏離：結果本身改變了，但影響被限制在這個節點內，沒有波及其他節點
//   3 大幅偏離：結果改變，且產生了原作沒有的後續連鎖影響，會波及至少一個其他節點
//   4 完全脫離原劇情：這個節點的前提本身被推翻(例如原本該死的角色被救走、原本的敵人變盟友)

export const DIVERGENCE_TIERS = [
  { tier: 0, label: "完全遵循原劇情", rewardMultiplier: 1.0, dcModifier: 0 },
  { tier: 1, label: "小幅偏離", rewardMultiplier: 1.15, dcModifier: 1 },
  { tier: 2, label: "中度偏離", rewardMultiplier: 1.4, dcModifier: 2 },
  { tier: 3, label: "大幅偏離", rewardMultiplier: 1.8, dcModifier: 4 },
  { tier: 4, label: "完全脫離原劇情", rewardMultiplier: 2.5, dcModifier: 6 },
];

export const MAX_TIER = DIVERGENCE_TIERS.length - 1;

function tierInfo(tier) {
  const t = DIVERGENCE_TIERS[tier];
  if (!t) throw new Error(`不合法的扭轉度分級：${tier}，合法範圍0~${MAX_TIER}`);
  return t;
}

/** 這個節點的實際獎勵 = 基礎獎勵 * 該分級的倍率，四捨五入到整數 */
export function computeNodeReward(basePoints, tier) {
  return Math.round(basePoints * tierInfo(tier).rewardMultiplier);
}

/** 這個節點(或受它影響的後續判定)的難度 = 基礎DC + 該分級的難度加值 */
export function computeNodeDC(baseDC, tier) {
  return baseDC + tierInfo(tier).dcModifier;
}

/**
 * 一個章節(chapter)的進度與扭轉度彙總，給頂部進度條用。
 * @param {Array<{ completed: boolean, divergenceTier: number|null }>} nodes
 */
export function summarizeChapter(chapterId, title, nodes) {
  const totalNodes = nodes.length;
  const completedNodes = nodes.filter((n) => n.completed).length;
  const completedWithTier = nodes.filter((n) => n.completed && n.divergenceTier != null);

  const avgDivergenceTier =
    completedWithTier.length === 0
      ? 0
      : completedWithTier.reduce((sum, n) => sum + n.divergenceTier, 0) / completedWithTier.length;

  return {
    chapterId,
    title,
    totalNodes,
    completedNodes,
    completionPct: totalNodes === 0 ? 0 : Math.round((completedNodes / totalNodes) * 100),
    avgDivergenceTier: Math.round(avgDivergenceTier * 100) / 100,
    divergencePct: Math.round((avgDivergenceTier / MAX_TIER) * 100),
  };
}

/** 整個戰役(多章節)的彙總，就是頂部進度條實際要顯示的資料 */
export function summarizeCampaign(chapters) {
  const totalNodes = chapters.reduce((s, c) => s + c.totalNodes, 0);
  const completedNodes = chapters.reduce((s, c) => s + c.completedNodes, 0);
  const weightedDivergence = chapters.reduce((s, c) => s + c.avgDivergenceTier * c.completedNodes, 0);

  return {
    chapters,
    overallCompletionPct: totalNodes === 0 ? 0 : Math.round((completedNodes / totalNodes) * 100),
    overallDivergencePct:
      completedNodes === 0 ? 0 : Math.round((weightedDivergence / completedNodes / MAX_TIER) * 100),
  };
}
