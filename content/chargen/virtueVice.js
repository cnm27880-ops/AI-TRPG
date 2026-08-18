// [規則書＋設計] 七美德 / 七惡德 —— 權威清單，以及「五題綜合判定」的計分核心。
//
// 名單來源是規則書「A級人民英雄 - 以身作則」那張表(rules-2.35.txt 約 170111 行)，
// 那是全書唯一一處把十四項一次列全的地方，所以拿它當權威：
//   美德：慈愛 信念 剛毅 希望 正義 穩重 節制
//   惡德：驕傲 嫉妒 憤怒 貪欲 懶惰 色欲 縱欲
// 用字一律照規則書（是「貪欲」不是「貪婪」、是「嫉妒」不是「妒忌」），因為書中有一大票
// 特性把美德/惡德寫進前提（例如 57417 行「擁有嫉妒/縱欲/懶惰其一」），日後接那些特性時
// 字串要對得起來。玩家看到的選項文案可以用口語，但**存進角色卡的一律是這裡的 key**。
//
// ---------------------------------------------------------------------------
// 為什麼是「五題綜合判定」而不是「哪一題選到就是哪個」
//
// 使用者的要求(逐字)：「所以應該是用五道題目綜合判斷七美德/七惡德，有點類似心理測驗」。
//
// 起因是更早的版本會壞掉：五題裡有兩題給惡德、兩題給美德，一題一個對應，結果是
// **玩家一次拿到兩個惡德兩個美德**，而規則書的基準線是各一個（65770 行「你額外獲得一個惡德」、
// 79532 行「你獲得希望作為額外的美德」——會特別寫「額外」，就表示原本各只有一個）。
// 中間試過「取第一題」「讓玩家二選一」「分支漏斗」，前者會讓另外兩題的七項裡有一半
// 永遠不可能被選到，後者則是逼玩家把自己剛選的東西丟掉一半。
//
// 現在的做法：**每個選項同時往美德與惡德兩張分表加分**，五題全部參與，最後各取總分最高的一項。
// 這才是心理測驗跟填表的差別——不是「兩題測惡德、兩題測美德」，是每一個選擇都同時照亮跟投影。
// 玩家不知道自己在被算什麼，主神系統掃描完才告訴他他是誰，那正好是這個世界觀該有的樣子。
//
// 三條寫權重的規則（之後加題目請照這個寫）：
//
// 1. **主權重 3、次權重 1~2**。答得一致的人一定拿到他最明顯的那一個，不會有
//    「我明明一直選懶惰卻拿到色欲」的背叛感；只有答得分散的人才由總分決定，
//    而那本來就該由總分決定。
// 2. **每一項至少要有三題餵得到分**。只有一題餵的項目在總分制裡幾乎贏不了
//    （別題隨便一個主權重3就追平），會變成一個名義上存在、實際上抽不到的結果。
//    這件事有測試在管，見 test/virtueVice.test.js 的分布報告。
// 3. **惡德題也要給美德分，美德題也要給惡德分**。「躺著什麼都不做」該給【節制】1分——
//    你至少沒有去傷害誰；「咬緊牙關死撐」該給【驕傲】2分——不認輸的那部分就是自尊。
//    沒有這一層，五題就退化回兩題測惡德兩題測美德，只是分數寫得比較複雜而已。
// ---------------------------------------------------------------------------

/**
 * 七美德。description 是給玩家看的一句話，rulebook 是規則書「以身作則」條目的原意，
 * 留著給日後接規則效果時對照用（現在不吃這欄）。
 */
export const VIRTUES = [
  { key: "慈愛", description: "你用愛包容一切。看到有人蹲在地上，你會先蹲下去。", rulebook: "你用愛包容一切" },
  { key: "信念", description: "你相信你能夠克服一切，即使你說不出憑什麼。", rulebook: "你相信你能夠克服一切" },
  { key: "剛毅", description: "任何困難都不能絆倒你。你只是不肯鬆手而已。", rulebook: "任何困難都不能絆倒你" },
  { key: "希望", description: "只要還有一絲希望，你就決不會倒下。", rulebook: "只要還有一絲希望，你就決不會倒下" },
  { key: "正義", description: "正義感給你源源不斷的動力。你受不了看著壞事發生。", rulebook: "正義感給你源源不斷的動力" },
  { key: "穩重", description: "冷靜讓你能夠在戰場活得更久。你從不第一個衝出去。", rulebook: "冷靜讓你能夠在戰場活得更久" },
  { key: "節制", description: "你能冷靜地克制所有的誘惑。你替自己畫過線，而且沒有跨過去。", rulebook: "你能冷靜地克制所有的誘惑" },
];

/** 七惡德。順序即規則書順序，也是所有平手判定的最後一道 tie-break。 */
export const VICES = [
  { key: "驕傲", description: "你打從心底認為自己值得更多，而世界欠你一個交代。", rulebook: "只要你的檢定沒有失敗，你可以將失敗轉為成功" },
  { key: "嫉妒", description: "你一直在算別人手上有什麼，然後算自己還差多少。", rulebook: "從生理、心智、互動屬性中選擇一列強化" },
  { key: "憤怒", description: "你身上有一團火，它從來沒有真的熄過。", rulebook: "針對一次檢定，你可以檢定兩次" },
  { key: "貪欲", description: "你囤積、你抓取，哪怕那些東西你根本不需要。", rulebook: "檢定成功後，下次同樣檢定獲得附加成功" },
  { key: "懶惰", description: "你知道該做什麼，但你選擇讓時間自己過去。", rulebook: "你將你的傳奇沉著加入你的防御附加成功" },
  { key: "色欲", description: "你需要有人靠近你，哪怕那個人是誰其實沒那麼重要。", rulebook: "指定一個目標，檢定與防御得到洞察加值" },
  { key: "縱欲", description: "你用塞滿身體來蓋過空掉的那一塊。", rulebook: "每次檢定成功，你都能恢復1點任意傷害" },
];

export const VIRTUE_KEYS = VIRTUES.map((v) => v.key);
export const VICE_KEYS = VICES.map((v) => v.key);

const VIRTUE_BY_KEY = Object.fromEntries(VIRTUES.map((v) => [v.key, v]));
const VICE_BY_KEY = Object.fromEntries(VICES.map((v) => [v.key, v]));

export function getVirtue(key) {
  return VIRTUE_BY_KEY[key] ?? null;
}
export function getVice(key) {
  return VICE_BY_KEY[key] ?? null;
}

/**
 * 把選中的選項加總成兩張分表，並記錄「每一題各給了誰幾分」。
 *
 * perQuestion 不是除錯資料，是平手判定要用的（見 pickWinner）。總分制一定會出現平手——
 * 五題、主權重都是3，撞在一起是常態不是例外——所以平手規則必須是設計的一部分，
 * 不能落到「看物件屬性的列舉順序」那種沒有人查得出來的地方。
 *
 * @param {Array<{questionId: string, virtues?: object, vices?: object}>} options collectLifePath() 選中的選項
 */
export function scoreMorality(options = []) {
  const virtues = Object.fromEntries(VIRTUE_KEYS.map((k) => [k, 0]));
  const vices = Object.fromEntries(VICE_KEYS.map((k) => [k, 0]));
  const perQuestion = {};

  for (const option of options) {
    const qid = option.questionId;
    perQuestion[qid] ??= { virtues: {}, vices: {} };
    for (const [key, points] of Object.entries(option.virtues ?? {})) {
      if (!(key in virtues)) continue; // 不在七美德裡的字直接忽略，測試會抓出來
      virtues[key] += points;
      perQuestion[qid].virtues[key] = (perQuestion[qid].virtues[key] ?? 0) + points;
    }
    for (const [key, points] of Object.entries(option.vices ?? {})) {
      if (!(key in vices)) continue;
      vices[key] += points;
      perQuestion[qid].vices[key] = (perQuestion[qid].vices[key] ?? 0) + points;
    }
  }

  return { virtues, vices, perQuestion };
}

/**
 * 從一張分表挑出贏家。四層判定，每一層都是明講的，沒有一層依賴列舉順序：
 *
 *   1. 總分高者勝。
 *   2. 平手時，**最後一題**（按下 YES 的那一刻）給分多者勝——那是這個人最終的自我定義。
 *   3. 再平手，**第一題**（凌晨兩點獨自一人）給分多者勝——沒有人看著的時候最誠實。
 *   4. 還平手，照規則書順序。這一層幾乎不會走到，但它讓整件事完全決定性。
 *
 * @param {Record<string, number>} totals
 * @param {Record<string, Record<string, number>>} perQuestion questionId -> {key: 分}
 * @param {string[]} order 規則書順序（同時是最後一道 tie-break）
 * @param {string} firstQuestionId
 * @param {string} lastQuestionId
 * @param {Set<string>} [exclude] 挑亞軍時把冠軍排除掉
 */
function pickWinner(totals, perQuestion, order, firstQuestionId, lastQuestionId, exclude = new Set()) {
  let best = null;
  for (let index = 0; index < order.length; index++) {
    const key = order[index];
    if (exclude.has(key)) continue;
    const candidate = {
      key,
      total: totals[key] ?? 0,
      last: perQuestion[lastQuestionId]?.[key] ?? 0,
      first: perQuestion[firstQuestionId]?.[key] ?? 0,
      index,
    };
    if (
      !best ||
      candidate.total > best.total ||
      (candidate.total === best.total &&
        (candidate.last > best.last ||
          (candidate.last === best.last && candidate.first > best.first)))
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * 五題的答案 -> 一個美德 + 一個惡德（規則書意義上的那一對），外加各自的亞軍。
 *
 * 亞軍(shadowVirtue/shadowVice)**不是**規則書意義的美德/惡德，角色卡上也不用這個名字稱呼它，
 * 它只是「這個人身上還有這個東西」的敘事提示，餵給AI用。規則書的 1+1 在這裡是嚴格成立的。
 *
 * @param {Array} options collectLifePath() 選中的選項（含 questionId）
 * @param {string[]} questionOrder 題目id的順序，用來認出第一題與最後一題
 */
export function resolveMorality(options = [], questionOrder = []) {
  const { virtues, vices, perQuestion } = scoreMorality(options);
  const firstQuestionId = questionOrder[0];
  const lastQuestionId = questionOrder[questionOrder.length - 1];

  const virtueScores = Object.fromEntries(
    Object.entries(perQuestion).map(([qid, v]) => [qid, v.virtues])
  );
  const viceScores = Object.fromEntries(
    Object.entries(perQuestion).map(([qid, v]) => [qid, v.vices])
  );

  const virtue = pickWinner(virtues, virtueScores, VIRTUE_KEYS, firstQuestionId, lastQuestionId);
  const vice = pickWinner(vices, viceScores, VICE_KEYS, firstQuestionId, lastQuestionId);
  const shadowVirtue = pickWinner(
    virtues, virtueScores, VIRTUE_KEYS, firstQuestionId, lastQuestionId, new Set([virtue.key])
  );
  const shadowVice = pickWinner(
    vices, viceScores, VICE_KEYS, firstQuestionId, lastQuestionId, new Set([vice.key])
  );

  return {
    virtue: virtue.key,
    vice: vice.key,
    shadowVirtue: shadowVirtue.key,
    shadowVice: shadowVice.key,
    scores: { virtues, vices },
  };
}

// ---------------------------------------------------------------------------
// 美德 × 惡德 = 性格核心
//
// 使用者的要求(逐字)：「透過美德/惡德組合出一個角色特性之類的」。
//
// 7×7 = 49 組不手寫——手寫 49 段一定會有三十段是敷衍的，而且之後調任何一項都要重寫。
// 做法是**模板打底 + 少數手寫彩蛋**：絕大多數組合走 composeCore() 的模板句，
// 十個特別有戲的組合另外手寫。玩家抽到彩蛋會覺得系統認識他，抽到模板也讀得通。
//
// 刻意**不呼叫LLM**，理由跟 lifePath.js 的 composeBackground() 同一條：這句話要在
// 主神掃描的那一瞬間出現，呼叫LLM會把那個瞬間變成等三十秒的空白。
// ---------------------------------------------------------------------------

/** 手寫彩蛋。key 是 `${美德}|${惡德}`。沒列到的組合走模板。 */
const HANDWRITTEN_CORES = {
  "剛毅|驕傲": { name: "不肯低頭的人", description: "你撐得住任何事，唯獨撐不住「被人看見自己撐不住」。" },
  "剛毅|憤怒": { name: "不肯熄火的人", description: "你靠著一團火撐到今天，而你已經分不清那是動力還是燃燒。" },
  "節制|縱欲": { name: "把線畫在懸崖邊的人", description: "你比誰都清楚自己會失控，所以你把規矩訂得比誰都嚴。" },
  "慈愛|色欲": { name: "分不清疼惜與需要的人", description: "你對誰都好，但你自己也說不準那是為了他還是為了不要一個人。" },
  "穩重|嫉妒": { name: "什麼都算過的人", description: "你冷靜、你周全，因為你一直在跟一個不在場的人比。" },
  "希望|懶惰": { name: "相信明天會好的人", description: "你真心相信事情會轉好——所以你今天可以先不動。" },
  "正義|憤怒": { name: "拿著刀的好人", description: "你為別人出頭，而動手的那一刻你其實鬆了一口氣。" },
  "信念|驕傲": { name: "確信自己沒錯的人", description: "你的信念撐住了你，也讓你聽不進任何相反的話。" },
  "慈愛|縱欲": { name: "不會說不的人", description: "你把手上的東西一直分出去，包括你根本沒有的那些。" },
  "剛毅|懶惰": { name: "撐著但不動的人", description: "你什麼都扛得住，代價是你哪裡也去不了。" },
};

/**
 * 組出這個角色的性格核心。
 * @returns {{name: string, description: string}}
 */
export function composeCore(virtueKey, viceKey) {
  const handwritten = HANDWRITTEN_CORES[`${virtueKey}|${viceKey}`];
  if (handwritten) return { ...handwritten };

  return {
    name: `${virtueKey}與${viceKey}之間`,
    description:
      `你的【${virtueKey}】讓你撐到了現在，` +
      `你的【${viceKey}】讓你不確定自己撐下來到底是為了什麼。`,
  };
}
