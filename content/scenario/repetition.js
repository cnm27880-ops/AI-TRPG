// [設計] 套路遞減 —— 同一個「屬性＋技能」連續用，會愈來愈難。
//
// 為什麼需要這個模組（實際測玩回饋，逐字）：
//   「只要玩家把單一屬性+單一技能點高，就能一直用同一個檢定通關，
//     因為我的敏捷+潛行最高，我每次都按相關的選項」
//
// 診斷：這不是「玩家太聰明」，是**引擎沒有給重複行為任何代價**。
// 一張卡把敏捷點到5、潛行點到3，骰池就是8顆；其他組合大多只有2~4顆。
// 而 content/turnOptions.js 又要求AI「至少兩個選項要用到角色有訓練的技能」——
// 於是每一回合的四個選項裡，一定有一個是玩家的最強組合，而且永遠是最划算的那個。
// 玩家最後不是在讀故事做選擇，是在四個數字裡挑最大的那個（回饋原文：
// 「我就是看選項哪個數字高就按哪個」）。
//
// 修法刻意**不是**削弱專精，也不是禁止重複：那會懲罰「把角色練成專家」這件事本身，
// 而專精在TRPG裡是正當且有趣的build。真正的問題是「同一招重複用不需要付出任何東西」。
// 所以這裡做的是遞減報酬：
//   同一個組合連續第2次用 -> 沒有懲罰（重複一次是合理的戰術）
//   連續第3次 -> DC +1
//   連續第4次 -> DC +2
//   連續第5次以後 -> DC +3（封頂，不會無限疊到玩家完全不能動）
// 換一個做法就立刻歸零。專精玩家仍然強，但他必須偶爾換手，而「換手」正是
// 讓玩家重新去讀敘事、重新思考處境的那個瞬間。
//
// 世界觀上的解釋（會餵給AI，讓它把數字寫成劇情）：對手會學習你的模式。
// 同一條通風管你爬第三次，牠已經在出口等你了。
//
// 這是 [設計]，規則書沒有這套機制。數值是草案，改的時候要連 test/repetition.test.js 一起改。

/**
 * 連續次數 -> DC懲罰。**索引即「這是連續第幾次」**，所以第0格是佔位、永遠用不到。
 * 超出表尾一律用最後一格（封頂）。
 */
const PENALTY_BY_STREAK = [0, 0, 0, 1, 2, 3];

/** 懲罰封頂值，前端顯示與說明文字共用同一個來源。 */
export const MAX_RETREAD_PENALTY = PENALTY_BY_STREAK[PENALTY_BY_STREAK.length - 1];

/** 連續幾次之內不罰（用來寫提示文字，不要在別的地方寫死數字）。 */
export const RETREAD_FREE_USES = PENALTY_BY_STREAK.findIndex((p) => p > 0) - 1;

/**
 * 一次檢定的「套路指紋」。
 *
 * 用「屬性＋技能」而不是只用技能：敏捷+潛行 跟 意志+潛行 是兩種不同的做法
 * （摸黑繞路 vs. 硬撐著不動），不該被當成同一招。純屬性檢定（沒有技能）也有指紋，
 * 否則玩家只要每次都選「純意志」就完全繞過這個機制。
 */
export function usageKey(params) {
  if (!params?.attribute) return null;
  return `${params.attribute}+${params.skill ?? "—"}`;
}

/** 建立一份全新的套路紀錄。 */
export function createUsageStreak() {
  return { key: null, count: 0 };
}

/** 舊存檔沒有這個欄位、或資料壞掉時，一律當成全新紀錄，不讓遊戲卡住。 */
export function normalizeStreak(streak) {
  if (!streak || typeof streak !== "object" || typeof streak.key !== "string") {
    return createUsageStreak();
  }
  const count = Number(streak.count);
  return { key: streak.key, count: Number.isInteger(count) && count > 0 ? count : 0 };
}

/**
 * 如果玩家「接下來」用這個組合，會吃到多少DC懲罰。
 *
 * 這個函式同時服務兩個地方，而且必須是同一個答案，否則玩家會覺得被騙：
 *   1. 回合結算時真的加到DC上（functions/api/turn.js）
 *   2. 選項按鈕上預先顯示「連續第3次 · DC+1」（public/app.js）
 *
 * @param {object} streak 目前的套路紀錄
 * @param {{attribute: string, skill?: string}} params 這次要做的檢定
 * @returns {{consecutive: number, dcPenalty: number, key: string|null}}
 *   consecutive 是「把這一次算進去之後」的連續次數（第1次就是1），
 *   直接對應玩家看到的「連續第N次」，不用呼叫端自己加一。
 */
export function retreadPenalty(streak, params) {
  const key = usageKey(params);
  if (!key) return { consecutive: 0, dcPenalty: 0, key: null };

  const current = normalizeStreak(streak);
  const consecutive = current.key === key ? current.count + 1 : 1;
  const dcPenalty = PENALTY_BY_STREAK[Math.min(consecutive, PENALTY_BY_STREAK.length - 1)];

  return { consecutive, dcPenalty, key };
}

/** 把這一次檢定記進套路紀錄（純函式，回傳新的紀錄）。換組合就從1重新算。 */
export function trackUsage(streak, params) {
  const { key, consecutive } = retreadPenalty(streak, params);
  if (!key) return normalizeStreak(streak);
  return { key, count: consecutive };
}

/**
 * 組給AI的指令：讓「數字上變難」在故事裡也說得通。
 *
 * 只在真的有懲罰時才回傳文字（沒懲罰時回 null，呼叫端就不會在prompt裡放空段落）。
 * 刻意要求AI寫「對手/環境如何針對這個做法」，而不是寫「你變累了」——後者是在說玩家不行，
 * 前者是在說世界會回應你，讀起來完全是兩件事。
 */
export function buildRetreadDirective(penalty, params, subject = "威脅") {
  if (!penalty || penalty.dcPenalty <= 0) return null;

  const combo = `${params.attribute}${params.skill ? `＋${params.skill}` : ""}`;
  return (
    `【同一套路連續第 ${penalty.consecutive} 次：${combo}】` +
    `引擎已經把這次判定的難度調高了 ${penalty.dcPenalty}（這是既定事實，不是你決定的）。\n` +
    `敘事上必須寫出**世界學會了這一招**：${subject}或環境針對這個做法做出了反制` +
    `（守在你慣用的路線上、把那條路封起來、預判你的下一步），` +
    `而不是寫成玩家自己變累或變笨。同時要讓玩家看得出來「換個方法」是有意義的——` +
    `在敘事裡留一個明顯屬於別種解法的破口（一件工具、一個可以交涉的對象、一條需要蠻力的捷徑）。`
  );
}

/** 給前端顯示用的簡短標籤（沒懲罰時回 null，按鈕上就不會多一個沒意義的標記）。 */
export function retreadLabel(penalty) {
  if (!penalty || penalty.dcPenalty <= 0) return null;
  return `連續第${penalty.consecutive}次 · DC+${penalty.dcPenalty}`;
}
