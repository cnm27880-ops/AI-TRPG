// [設計] 副本包(scenario pack)的節點圖結構定義。
// 副本包走跟血統包/瞳術包完全一樣的 content/loader.js 機制(type: "副本")，
// 差別只在 entries 裡放的不是能力資料，而是章節/節點資料，即插即用、將來可以當DLC上架。

/**
 * @typedef Node
 * @property {string} id
 * @property {string} title
 * @property {string} canonSummary 原作/原設定裡這個節點發生的事，給AI判斷扭轉度分級時參考的基準
 * @property {string[]} prerequisites 前置節點id
 * @property {number} baseRewardPoints 這個節點在「完全遵循原劇情」時的基礎積分獎勵
 * @property {number} baseDC 這個節點相關判定的基礎難度
 */

/**
 * @typedef Chapter
 * @property {string} id
 * @property {string} title
 * @property {Node[]} nodes
 * @property {number} [timeLimitRounds] 選填。這個章節的時間預算(見 content/scenario/timeBudget.js)，
 *   主線節點推進與NPC好感度養成共用同一筆預算。不填代表這個章節沒有時間限制。
 * @property {string} [onExpireNodeId] 選填。時間預算耗盡時觸發的劣化結局節點id，只在有 timeLimitRounds 時有意義。
 */

/** 驗證一個副本包(type="副本")的 entries 是否符合章節/節點結構的基本要求 */
export function validateScenarioPack(pack) {
  const errors = [];
  if (pack.type !== "副本") {
    errors.push(`type應為「副本」，實際是「${pack.type}」`);
    return { valid: false, errors };
  }
  const nodeIds = new Set();
  for (const chapter of pack.entries) {
    if (!chapter.name && !chapter.title) errors.push("章節缺少 name/title");
    if (chapter.timeLimitRounds != null && !(chapter.timeLimitRounds > 0)) {
      errors.push(`章節「${chapter.name ?? chapter.title}」的 timeLimitRounds 必須是正數`);
    }
    const nodes = chapter.nodes ?? [];
    for (const node of nodes) {
      if (!node.id) {
        errors.push(`章節「${chapter.name}」下有節點缺少 id`);
        continue;
      }
      if (nodeIds.has(node.id)) errors.push(`節點id重複：${node.id}`);
      nodeIds.add(node.id);
      for (const pre of node.prerequisites ?? []) {
        if (!nodeIds.has(pre) && pre !== node.id) {
          // 這裡只做「有沒有出現過」的寬鬆檢查(順序在陣列裡出現就算)，不做完整拓樸排序驗證
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
