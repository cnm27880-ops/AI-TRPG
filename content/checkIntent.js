// [設計] 行動意圖 -> 檢定參數 的對照層 —— 規則書沒有這個東西，是接前端時必須補上的一塊。
//
// 為什麼需要它：玩家在網頁上輸入的是自然語言(「我舉槍瞄準那隻怪物的頭」)，但 core/check.js 的
// performCheck() 需要的是明確的 { attribute, skill, specialization, dc }。中間這段轉換一定要有人做。
//
// 為什麼放在這裡、而不是放在前端 JS：ARCHITECTURE.md 的最高原則第1條是「AI不做算術」，
// 其精神是**規則層面的決定不能散落在引擎以外的地方**。「這個行動該用哪個屬性搭哪個技能」
// 就是一個規則層面的決定(選錯技能，成功率會差很多，甚至觸發技能0的自動失敗懲罰)，
// 所以它必須跟其他規則模組一樣：住在可以被 node --test 測到的地方、有測試鎖住行為、
// 出處標記清楚。放在前端就等於「瀏覽器裡有一份沒人測得到的規則」，那是這個專案明文避免的事。
//
// [已知簡化 —— 這是目前整條鏈路上最粗糙的一環，之後應該換掉]
// 現在用的是「關鍵字比對」，不是真正的語意理解。它會漏(玩家講了同義詞但不在表裡)、也會誤判
// (一句話同時提到「跑」跟「開槍」)。真正該做的是多一次AI呼叫：先讓Gemini在**有限選項**裡挑
// 一個檢定(屬性九選一、技能從角色卡現有技能裡挑一個)，再把它的選擇餵給引擎算。
// 注意這仍然完全符合最高原則——AI是在「有限選項的分級量表裡挑一個」(原則第4條的作法)，
// 不是自己編數字。這個表的存在是為了在那個AI端點做出來之前，前端就能先跑起來，
// 同時也可以繼續當成「AI選錯或AI服務掛掉時」的退路。
//
// [已知簡化] DC(難度)目前一律給預設值3，因為「這個行動有多難」本來就該由劇本節點或AI依場景決定，
// 不是能從玩家的句子關鍵字推出來的。呼叫端可以用 defaultDc 覆蓋。

/** 沒有任何關鍵字命中時使用的退路檢定。 */
export const FALLBACK_INTENT = { attribute: "感知" };

/** 預設難度。規則書沒有「預設DC」這種東西，這是接線用的暫定值。 */
export const DEFAULT_DC = 3;

/**
 * 關鍵字對照表。
 * 每一列的 skill 都必須是 core/schema.js 的 SKILLS 表裡真實存在的技能名，
 * 否則 performCheck() 會因為「人物卡沒有技能X」而丟錯——test/checkIntent.test.js 有鎖這件事。
 */
export const INTENT_TABLE = [
  { keywords: ["射擊", "開火", "開槍", "槍", "瞄準", "扣扳機"], attribute: "感知", skill: "槍械", specialization: "步槍" },
  { keywords: ["弓", "箭", "弩"], attribute: "感知", skill: "弓箭" },
  // 投擲的屬性/技能組合不是我自己挑的：core/combat/attackTypes.js 的「投擲_輕」DP公式是
  // 敏捷 + 運動(athleticsSkill) + 武器傷害，出處是 rules2.35.txt 第11562~11843行。
  // (「投擲_重」改用力量+運動，那是戰鬥流程要區分的事，這個意圖表只做粗略導向。)
  { keywords: ["投擲", "丟", "扔", "拋", "手榴彈", "甩出"], attribute: "敏捷", skill: "運動" },
  { keywords: ["躲藏", "潛行", "隱藏", "藏起", "掩護", "摸過去"], attribute: "敏捷", skill: "躲藏" },
  { keywords: ["閃避", "翻滾", "跳", "爬", "跑", "衝刺", "游"], attribute: "敏捷", skill: "運動" },
  { keywords: ["砍", "刺", "劈", "揮刀", "揮劍", "白刃", "近戰"], attribute: "力量", skill: "白刃" },
  { keywords: ["拳", "踢", "揍", "肉搏", "扭打", "撲"], attribute: "力量", skill: "肉搏" },
  { keywords: ["開車", "駕駛", "騎"], attribute: "敏捷", skill: "駕駛" },
  { keywords: ["撬", "解鎖", "扒", "偷", "手法"], attribute: "敏捷", skill: "手上功夫" },
  { keywords: ["觀察", "調查", "搜索", "搜查", "檢查", "掃描", "找線索", "翻找"], attribute: "感知", skill: "調查", specialization: "痕跡辨識" },
  { keywords: ["電腦", "駭", "終端", "系統", "破解"], attribute: "智力", skill: "電腦" },
  { keywords: ["治療", "急救", "包紮", "止血"], attribute: "智力", skill: "醫學" },
  { keywords: ["回想", "知識", "辨識", "研究"], attribute: "智力", skill: "學識" },
  { keywords: ["儀式", "咒", "符文", "神秘"], attribute: "智力", skill: "神秘學" },
  { keywords: ["說服", "交涉", "談判", "攀談", "安撫", "勸"], attribute: "風度", skill: "交際" },
  { keywords: ["威脅", "恐嚇", "逼問", "施壓"], attribute: "操控", skill: "脅迫" },
  { keywords: ["騙", "掩飾", "偽裝", "假裝"], attribute: "操控", skill: "掩飾" },
  { keywords: ["察言", "讀心", "感覺", "直覺", "警戒"], attribute: "感知", skill: "感受" },
  { keywords: ["忍住", "抵抗", "撐住", "意志"], attribute: "決心" },
];

/**
 * 把玩家的自然語言行動轉成 performCheck() 需要的參數。
 *
 * @param {string} actionText 玩家輸入的行動描述
 * @param {object} [options]
 * @param {object} [options.character] 角色卡。有給的話會做兩件事：
 *   (a) 角色卡沒有這個技能就退回純屬性檢定，避免因為表裡寫了一個角色沒有的自創技能而讓引擎丟錯；
 *   (b) 本次挑中的專業如果角色沒登記，就不傳 specialization(讓引擎照「無對應專業」規則減半，
 *       而不是傳一個假的專業名進去)。
 * @param {number} [options.defaultDc] 難度，預設 DEFAULT_DC
 * @returns {{attribute: string, skill?: string, specialization?: string, dc: number, matched: boolean}}
 *   matched 表示是否真的命中關鍵字表(false 代表用的是退路檢定)，呼叫端可以據此決定要不要提示玩家。
 */
export function inferCheckParams(actionText, options = {}) {
  const { character, defaultDc = DEFAULT_DC } = options;
  const text = String(actionText ?? "");

  const hit = INTENT_TABLE.find((entry) => entry.keywords.some((k) => text.includes(k)));
  const intent = hit ?? FALLBACK_INTENT;

  const params = { attribute: intent.attribute, dc: defaultDc, matched: Boolean(hit) };

  if (intent.skill) {
    // 角色卡上沒有登記這個技能時，退回純屬性檢定。
    // 不自己把技能補成0，因為「有這個技能但等級0」跟「沒有這個技能」在規則上是兩件事：
    // 前者要套用技能0的懲罰(心智系甚至直接自動失敗)，後者 performCheck() 會直接丟錯。
    const hasSkill = !character || character.skills?.[intent.skill] != null;
    if (hasSkill) {
      params.skill = intent.skill;

      if (intent.specialization) {
        const owned = character?.specializations?.[intent.skill] ?? [];
        // 沒給character時保守起見照樣帶上(呼叫端自己負責)，有給character就據實比對
        if (!character || owned.includes(intent.specialization)) {
          params.specialization = intent.specialization;
        }
      }
    }
  }

  return params;
}
