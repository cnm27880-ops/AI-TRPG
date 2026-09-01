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
 * @property {object[]} [completionEvidence] 選填。這個節點「真的完成了」需要哪些引擎事實。
 *   陣列成員之間是 AND，成員內部的 any* 欄位是 OR（求值器見 content/scenario/conditions.js）。
 *   只讀 referenceState（flags / clues / npcStatuses / 狀態軸），**不讀任何 AI 敘事文字**。
 *   不填代表沿用舊行為（由場景轉場推斷完成），沒有 reference 的副本一律不受影響。
 * @property {boolean} [isFinale] 選填。標記這是本章節的最終戰節點，必須搭配 bossEncounter。
 * @property {BossEncounter} [bossEncounter] 選填。isFinale=true 時必填，最終戰用的敵人樣板。
 */

/**
 * @typedef Chapter
 * @property {string} id
 * @property {string} title
 * @property {string} [openingScene] 選填。這個章節開場時的**事實**背景，會被塞進 sceneContext
 *   餵給AI當敘事依據(見 functions/api/session.js)。這是給AI看的資料，不是印給玩家看的文字。
 * @property {string} [openingNarration] 選填。**固定的故事開頭**：這段文字會一字不改地印給玩家，
 *   完全不經過AI(見 functions/api/turn.js 的開場短路)。用途是讓「玩家踏進副本的第一印象」
 *   品質固定、而且零延遲——交給AI寫的話，同一個副本每次開場的品質都不一樣，
 *   玩家還要盯著空畫面等模型跑完。有寫這個欄位就建議一起寫 openingOptions。
 * @property {object[]} [openingOptions] 選填。跟 openingNarration 配套的固定選項
 *   (形狀同AI產生的選項：{label, attribute, skill, difficulty})。開場不呼叫AI，選項必須自備。
 *   一樣會經過 content/turnOptions.js 的 validateOption() 查驗，不因為是人寫的就跳過規則檢查。
 * @property {Node[]} nodes
 * @property {number} [timeLimitRounds] 選填。這個章節的時間預算(見 content/scenario/timeBudget.js)，
 *   主線節點推進與NPC好感度養成共用同一筆預算。不填代表這個章節沒有時間限制。
 * @property {string} [onExpireNodeId] 選填。時間預算耗盡時觸發的劣化結局節點id，只在有 timeLimitRounds 時有意義。
 * @property {{pointsPerRemainingRound?: number, maxPoints?: number}} [speedReward] 選填。結算時由 server 依剩餘回合換算速度積分。
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

/**
 * @typedef {string} ArrivalNarration 選填的**副本層級**欄位 `pack.arrivalNarration`。
 *
 * 玩家按下建卡最後一題之後會先經過一段「甦醒」的過場（見 content/chargen/awakening.js）：
 * 通用的墜落與睜眼那一段所有副本共用，但**你醒在哪個房間**是副本自己的事，就是這個欄位。
 *
 * 兩條硬性要求：
 *   1. 必須以「你被一層半透明的防護罩罩住、暫時動不了」收尾——主神系統接著要在那裡
 *      唸出掃描結果與 5 點自由屬性，沒有這個收尾，那段對話會沒有地方站。
 *   2. **不可以跟本章的 openingNarration 重複同一個節拍**。這兩段是連著播的，
 *      如果 arrivalNarration 寫「你從休眠艙醒來」而 openingNarration 又寫一次
 *      「艙蓋在你上方彈開」，玩家會被叫醒兩次。openingNarration 應該從防護罩散開之後接下去。
 *
 * 不填的話會退回 content/chargen/awakening.js 的 DEFAULT_ARRIVAL（通用的主神空間白光房間）。
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
  if (pack.speedReward != null) {
    if (!pack.speedReward || typeof pack.speedReward !== "object") errors.push("speedReward 必須是物件");
    else {
      for (const key of ["pointsPerRemainingRound", "maxPoints"]) {
        if (pack.speedReward[key] != null && (!Number.isInteger(pack.speedReward[key]) || pack.speedReward[key] < 0)) {
          errors.push(`speedReward.${key} 必須是非負整數`);
        }
      }
    }
  }
  // 甦醒過場的房間描述。內容是自由文字（沒辦法自動驗「有沒有以防護罩收尾」），
  // 但型別要擋——寫成物件或空字串的話，玩家會在那一幕看到一段空白而不是錯誤。
  if (pack.arrivalNarration != null && typeof pack.arrivalNarration !== "string") {
    errors.push("arrivalNarration 必須是字串");
  } else if (typeof pack.arrivalNarration === "string" && !pack.arrivalNarration.trim()) {
    errors.push("arrivalNarration 不可以是空字串（不需要就整個不要寫，會退回通用的過場）");
  }

  const nodeIds = new Set();
  for (const chapter of pack.entries) {
    if (!chapter.name && !chapter.title) errors.push("章節缺少 name/title");
    if (chapter.timeLimitRounds != null && !(chapter.timeLimitRounds > 0)) {
      errors.push(`章節「${chapter.name ?? chapter.title}」的 timeLimitRounds 必須是正數`);
    }
    // 固定開頭與固定選項是配套的：只寫其中一個，開場那一回合就會變成
    // 「有敘事但沒選項」或「有選項但敘事是AI臨場寫的」，兩種都不是作者想要的結果。
    // 這種錯誤在部署當下就要炸掉，不要留到玩家開新遊戲才發現版面缺一半。
    if (chapter.openingNarration && !(chapter.openingOptions?.length > 0)) {
      errors.push(`章節「${chapter.name ?? chapter.title}」有 openingNarration 但沒有 openingOptions（固定開頭必須自備選項）`);
    }
    if (chapter.openingOptions && !chapter.openingNarration) {
      errors.push(`章節「${chapter.name ?? chapter.title}」有 openingOptions 但沒有 openingNarration`);
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
