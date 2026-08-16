// [設計] 副本節點 -> prompt 指引，以及「節點完成信號」的查驗。
//
// 分界線(跟 content/turnOptions.js 同一套原則)：
//   AI 負責「判斷這個節點的關鍵事件這回合是否已經發生、以及發生的過程跟原設定差多少」，
//   這是敘事判斷，交給AI合理。
//   引擎負責「差多少 -> 獎勵/難度多少」——這是查表，AI一個數字都不碰
//   (見 content/scenario/divergence.js 的固定分級表)。
//
// AI 在回合JSON裡多帶一個頂層欄位 nodeComplete：
//   - 這個節點的關鍵事件還沒發生：nodeComplete 填 null
//   - 已經發生：nodeComplete 填 { "divergenceTier": 0~4 }，分級定義見 divergence.js 檔頭註解
// 這裡只負責「组指引文字」跟「查驗AI回傳的信號合不合法」，不負責查表換算(那是 progress.js 的事)。

import { DIVERGENCE_TIERS } from "./divergence.js";

const MAX_TIER = DIVERGENCE_TIERS.length - 1;

/** 卡關到第幾回合才開始加重語氣、以及加到最重語氣的門檻。 */
const STALL_WARN_AT = 2;
const STALL_URGENT_AT = 4;

/**
 * 組出「目前活躍節點」的指引文字，附加在回合prompt後面。
 * @param {object|null} node content/scenario/schema.js 的 Node 形狀，null代表主線已跑完
 * @param {number} [stalledRounds] 這個節點已經卡了幾回合都沒結算(見 progress.js 的
 *   getNodeStallRounds())，用來把「不要原地踏步」的提醒隨著卡關時間拉長而加重語氣，
 *   而不是每一回合都用同一句溫和提醒——固定強度的提醒對AI而言很容易被當背景噪音略過。
 */
export function buildNodeGuidance(node, stalledRounds = 0) {
  if (!node) {
    return `【劇情節點】這個副本的主線節點已經全部完成，接下來請自由收尾這場輪迴任務，
不需要再回傳 nodeComplete 欄位。`;
  }

  const stallWarning =
    stalledRounds >= STALL_URGENT_AT
      ? `\n\n【卡關警告：已連續 ${stalledRounds} 回合沒有推進】這個節點已經卡了太多回合，絕對不可以再讓場景停留在
同一個僵局裡。這一回合請主動引入新的變化(意外狀況、新的線索、環境改變、敵人動作)來打破僵局，
把敘事往前推，不要再重複描寫玩家嘗試同一件事、或讓玩家停在原地觀望。`
      : stalledRounds >= STALL_WARN_AT
      ? `\n\n【提醒：已經 ${stalledRounds} 回合沒有推進這個節點】不要再寫跟前面回合幾乎一樣的場景與動作，
這一回合的敘事必須讓情境出現實質變化，往這個節點的關鍵事件靠近一步。`
      : "";

  if (node.isFinale) {
    // 最終戰節點刻意**不**開放 nodeComplete 信號：這個節點只能透過玩家實際打贏
    // /api/combat/* 的戰鬥來結算(見 functions/api/combat/act.js)，不能靠敘事文字帶過，
    // 否則等於讓AI用嘴巴打贏一場理應由引擎骰子決定勝負的戰鬥。
    return `【劇情節點：${node.title}（最終戰）】
這個節點在原設定裡的走向：
${node.canonSummary}

請把敘事帶向與敵人正面對決、一觸即發的處境，但**不要**描寫戰鬥的過程或結果，
也**不要**在輸出JSON裡加入 nodeComplete 欄位——這個節點只能由玩家實際在戰鬥系統裡
打贏敵人才會結算，不是由你的敘事文字決定勝負。${stallWarning}`;
  }

  return `【劇情節點：${node.title}】
這個節點在原設定裡的走向(給你判斷「扭轉度」的基準，不代表玩家必須複製這個過程，
只是超出這個基準越多，等一下要標的分級就越高)：
${node.canonSummary}

如果這一回合的敘事已經讓這個節點的關鍵事件實際發生(不管玩家是照原設定走、還是走出完全不同的過程)，
請在輸出JSON裡多加一個頂層欄位 "nodeComplete"，並從以下分級裡選一個最貼近的：
${DIVERGENCE_TIERS.map((t) => `  ${t.tier} = ${t.label}`).join("\n")}
格式：{"divergenceTier": 分級數字}

如果這個節點的關鍵事件這回合還沒發生(還在鋪陳、玩家還在猶豫、還沒到關鍵時刻)，
"nodeComplete" 請填 null，不要提早結算。每回合最多只能完成一個節點。${stallWarning}`;
}

/**
 * 查驗AI回傳的 nodeComplete 信號。**AI說了不算**：分級必須是表裡合法的整數，
 * 格式錯誤或超出範圍一律當作「這回合沒有完成」處理，不會讓遊戲卡住，也不會讓AI亂填的
 * 數字直接進到獎勵計算。
 * @param {unknown} raw parsed.data.nodeComplete
 * @returns {{ tier: number } | null}
 */
export function validateNodeComplete(raw) {
  if (raw == null) return null;
  if (typeof raw !== "object") return null;

  const tier = Number(raw.divergenceTier);
  if (!Number.isInteger(tier) || tier < 0 || tier > MAX_TIER) return null;

  return { tier };
}
