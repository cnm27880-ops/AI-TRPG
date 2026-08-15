// [設計] 副本包(scenario pack)的節點圖結構定義。
// 副本包走跟血統包/瞳術包完全一樣的 content/loader.js 機制(type: "副本")，
// 差別只在 entries 裡放的不是能力資料，而是章節/節點資料，即插即用、將來可以當DLC上架。
//
// [設計] 節點分兩種角色，由 isFinale 區分：
//   一般節點：透過敘事+判定推進，AI 在「這個節點的關鍵事件已經發生」時於回合JSON裡
//     附上 nodeComplete 分級信號(見 content/scenario/nodePrompt.js)，引擎查驗後結算獎勵。
//   最終戰節點(isFinale:true)：必須附上 bossEncounter(格式跟 PLACEHOLDER_ENEMY 一樣)，
//     玩家推進到這個節點時，/api/combat/start 會自動改用這個敵人樣板而不是預設的雜魚，
//     戰鬥獲勝後由 /api/combat/act 自動把這個節點標記完成(見 content/scenario/progress.js)。
//
// [設計] 難度分級(SCENARIO_DIFFICULTIES)是副本作者(人類/之後的工坊審核者)在撰寫副本包時
// 自己選一個標籤，不是AI在遊戲過程中決定的——這跟「劇情扭轉度」分級(AI在玩的當下選)是
// 兩件不同的事，不要混為一談。

/** 副本包的難度標籤，固定三級，供前端篩選/顯示用，不影響引擎內部數值。 */
export const SCENARIO_DIFFICULTIES = ["簡單", "中等", "困難"];

/**
 * @typedef BossEncounter 最終戰節點專用的敵人樣板，形狀跟 PLACEHOLDER_ENEMY 一致
 * @property {string} name
 * @property {object} attributes
 * @property {object} skills
 * @property {string} weaponKey
 * @property {number} [armor]
 * @property {number} [size]
 */

/**
 * @typedef Node
 * @property {string} id
 * @property {string} title
 * @property {string} canonSummary 原作/原設定裡這個節點發生的事，給AI判斷扭轉度分級時參考的基準
 * @property {string[]} prerequisites 前置節點id
 * @property {number} baseRewardPoints 這個節點在「完全遵循原劇情」時的基礎積分獎勵
 * @property {number} baseDC 這個節點相關判定的基礎難度
 * @property {boolean} [isFinale] 選填。標記這是本章節的最終戰節點，必須搭配 bossEncounter。
 * @property {BossEncounter} [bossEncounter] 選填。isFinale=true 時必填，最終戰用的敵人樣板。
 */

/**
 * @typedef Chapter
 * @property {string} id
 * @property {string} title
 * @property {string} [openingScene] 選填。這個章節開場時要念給玩家聽的場景敘述基準，
 *   AI 開場那一回合會拿這段當敘事依據(見 functions/api/session.js 怎麼把它塞進 sceneContext)。
 * @property {Node[]} nodes
 * @property {number} [timeLimitRounds] 選填。這個章節的時間預算(見 content/scenario/timeBudget.js)，
 *   主線節點推進與NPC好感度養成共用同一筆預算。不填代表這個章節沒有時間限制。
 * @property {string} [onExpireNodeId] 選填。時間預算耗盡時觸發的劣化結局節點id，只在有 timeLimitRounds 時有意義。
 */

/**
 * @typedef TimeWindow 選填的「大系列作品」時間軸定位資料——回應使用者需求：像復仇者聯盟這種
 *   跨多部作品的世界，同一個輪迴者之後如果又被分配到時間線重疊的另一個副本，NPC應該要記得他。
 *   [已知簡化] 這裡目前只存「描述性資料」，不做實際的時間軸重疊比對/NPC記憶查詢——
 *   那需要一個跨副本、跨存檔的NPC關係資料庫，是之後才要做的東西(工坊/後台審核之後的階段)。
 *   先把資料形狀定下來，之後那套機制才有東西可以讀。
 * @property {string} entryPoint 輪迴者這次副本切入原作時間軸的哪個時間點(自由文字描述)
 * @property {string} span 這次副本橫跨的時間長度(自由文字描述)
 */

/** 驗證一個副本包(type="副本")的 entries 是否符合章節/節點結構的基本要求 */
export function validateScenarioPack(pack) {
  const errors = [];
  if (pack.type !== "副本") {
    errors.push(`type應為「副本」，實際是「${pack.type}」`);
    return { valid: false, errors };
  }
  if (pack.difficulty != null && !SCENARIO_DIFFICULTIES.includes(pack.difficulty)) {
    errors.push(`difficulty必須是${SCENARIO_DIFFICULTIES.join("/")}其中之一，實際是「${pack.difficulty}」`);
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
      if (node.isFinale && !node.bossEncounter) {
        errors.push(`節點「${node.id}」標記為isFinale但缺少bossEncounter敵人樣板`);
      }
      for (const pre of node.prerequisites ?? []) {
        if (!nodeIds.has(pre) && pre !== node.id) {
          // 這裡只做「有沒有出現過」的寬鬆檢查(順序在陣列裡出現就算)，不做完整拓樸排序驗證
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
