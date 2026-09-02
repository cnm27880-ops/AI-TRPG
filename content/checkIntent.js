// 行動意圖 -> 檢定參數（10 核心技能對照）
//
// 自由輸入不是「每句話都擲骰」。低風險的詢問、搭話、回答與環顧周遭
// 直接走 FREE_ACTION；只有明確的高風險目的才進入技能檢定。Reference
// approach 仍由 referenceAdapter 優先裁定，這裡只負責 unmatched generic input。

/**
 * [2026-08-31] 這個模組的判準改了，值得寫下來，因為改的是一個實測出來的爛體驗。
 *
 * 舊行為：沒有命中關鍵字表的輸入，一律退回「感知純屬性 + DEFAULT_DC 3」。
 * 問題是 DC 3 在 content/turnOptions.js 的難度表裡是**「困難」**
 * （「條件不利，需要相當的專長才有把握」），而純屬性的骰池通常只有 2~3 顆。
 * 實測一萬次：「我很害怕」98.3% 失敗、「原地翻跟斗」97.8% 失敗、「唱歌」98.0% 失敗。
 * 更糟的是所有 unmatched 都退回**同一個**「感知」，於是 content/scenario/repetition.js
 * 的套路遞減把它們算成「連續用同一招」，DC 還會一路往上加。
 * 玩家越是打短句、打情緒、打搞怪，遊戲就越懲罰他——正好是最需要被接住的那群人。
 *
 * 新判準只有一句話：
 *
 *   **這句話裡有沒有一個「會失敗」的目標？**
 *
 * 有 -> 擲骰（走 INTENT_TABLE，查不到就用 FALLBACK_INTENT，但難度是「普通」不是「困難」）
 * 沒有 -> 不擲骰（NO_TARGET_ACTION_RULES）
 *
 * 「我很害怕」沒有目標——害怕不會失敗。
 * 「原地翻跟斗」沒有目標——翻不好也就是難看。
 * 「在異形面前叫外送」沒有可失敗的目標——本來就沒有人會來，那是敘事，不是判定。
 * 「用翻跟斗閃過酸液」有目標——失敗會燙傷，這個要擲。
 * 「我很害怕，所以我衝出去」有目標——「衝出去」會失敗，所以 blocked 詞表要擋住它。
 *
 * 這個判準對**短輸入**特別準，因為短輸入通常就是沒有目標。長度從來不是問題，目標才是。
 */
export const FALLBACK_INTENT = { attribute: "感知" };
export const FREE_ACTION_INTENT = Object.freeze({
  actionType: "free_action",
  requiresCheck: false,
  matched: false,
});
/**
 * 關鍵字推導出來的行動預設難度。
 *
 * 這裡是 2（「普通」），不是 3（「困難」）：3 是**副本作者或 AI 明確指定**才該出現的難度，
 * 不是「引擎猜不出來時」的預設。猜測不該比作者的設計更嚴苛。
 */
export const DEFAULT_DC = 2;
/** 有目標、但查不到技能時的難度（「容易」）。理由見 inferCheckParams() 裡的說明。 */
export const FALLBACK_DC = 1;

export const INTENT_TABLE = [
  { keywords: ["砍", "刺", "劈", "拳", "踢", "揍", "格鬥", "肉搏", "匕首", "刀", "近戰"], attribute: "力量", skill: "格鬥" },
  // 不使用單獨的「槍」：提到持槍 NPC、槍套或槍聲不等於玩家正在射擊。
  { keywords: ["射擊", "開槍", "開火", "槍擊", "瞄準", "扣扳機", "射殺", "擊中", "弓", "箭", "狙擊", "遠程"], attribute: "敏捷", skill: "射擊" },
  // 「跳」曾經單獨列在這裡，但它太寬：「跳一段奇怪的舞」會被當成運動檢定（實測 86% 失敗）。
  // 改成只認帶方向或目標的複合詞。反過來，「翻」「滾」「撞」「踹」這些真正會失敗的動作
  // 以前不在表裡（表裡只有「翻越」），於是「用翻跟斗閃過酸液」這種該擲的反而沒擲。
  { keywords: ["跑", "衝刺", "衝過", "衝向", "跳過", "跳下", "跳上", "跳躍", "起跳", "攀爬", "攀上", "翻越", "翻過", "翻滾", "滾開", "撞開", "撞破", "踹", "踢開", "游泳", "投擲", "拋", "扛", "搬", "舉起", "閃過", "閃開", "閃避", "避開", "躲過", "接住", "撐住", "體能"], attribute: "敏捷", skill: "體魄" },
  { keywords: ["躲藏", "躲到", "躲進", "躲開", "潛行", "隱藏", "暗中", "掩護", "撬鎖", "撬開", "撬", "開鎖", "扒竊", "無聲"], attribute: "敏捷", skill: "潛行" },
  { keywords: ["求生", "開車", "駕駛", "追逐", "生火", "辨向", "馴獸", "露營"], attribute: "敏捷", skill: "求生" },
  { keywords: ["觀察", "調查", "搜索", "搜查", "檢查", "找線索", "警戒", "識破", "查明", "分析"], attribute: "感知", skill: "偵察" },
  { keywords: ["電腦", "駭入", "破解", "系統", "終端", "拆彈", "修理", "改裝", "科技"], attribute: "智力", skill: "技藝" },
  { keywords: ["治療", "急救", "包紮", "止血", "手術", "解毒", "醫療"], attribute: "智力", skill: "醫療" },
  // [2026-09-02] 「怪物」曾經單獨列在這裡，但它太寬：恐怖題材的副本裡，玩家幾乎
  // 每一句驚呼、對話或感嘆都可能提到「怪物」（「這到底是什麼怪物啊」「小心怪物」），
  // 這些是情緒反應或對話，不是「我要用秘識分析牠」的意圖。實測案例：玩家對 NPC 說
  // 「這到底是什麼怪物啊……那個，大佬，再來該怎麼做啊？」——純粹在問下一步該怎麼做——
  // 卻被這個關鍵字命中成秘識檢定，若角色秘識是 0 級（心智系技能未訓練規則上自動失敗，
  // 見 core/check.js），玩家問路就變成一次無端的「自動失敗」，敘事因此被迫圍繞一個
  // 判定編一段跟玩家原意完全無關的結果。跟「跳」的教訓一樣：拿掉這個到處都會出現的
  // 名詞，真正想分析弱點或查文獻的意圖，「弱點」「文獻」「解讀」等關鍵字已經接得住。
  { keywords: ["神秘", "符文", "魔法", "弱點", "文獻", "咒術", "解讀", "歷史"], attribute: "智力", skill: "秘識" },
  { keywords: ["說服", "交涉", "談判", "安撫", "威脅", "恐嚇", "騙", "偽裝", "套話", "謊言"], attribute: "意志", skill: "交涉" },
  { keywords: ["忍住", "抵抗", "撐住", "意志", "冷靜"], attribute: "意志" },
];

/**
 * 「沒有可失敗的目標」的行動。命中這裡就不擲骰。
 *
 * 每一條都配一組 blocked：情緒或表演**後面接一個真的行動**時，那句話就有目標了，
 * 不能因為開頭是「我很害怕」就整句免判定。這是這張表唯一的漏洞來源，
 * 所以 blocked 詞表寧可寬一點——誤判成要擲骰，最多是多擲一次；
 * 誤判成不用擲骰，等於玩家找到一句咒語就能繞過規則。
 *
 * 寫法沿用底下 LOW_RISK_FREE_ACTION_RULES 的 pattern + blocked 形狀，不另創第二套。
 *
 * [約束] 同一個詞不可以同時出現在這裡與 INTENT_TABLE。這幾條規則跑在查表之前，
 * 重複的詞會讓 INTENT_TABLE 那一條永遠查不到（實例：「冷靜」本來兩邊都有，
 * 結果 INTENT_TABLE 的意志組整條被遮蔽；現在這裡只認「冷靜下來」）。
 * test/checkIntent.test.js 有一條測試會遍歷 INTENT_TABLE 的每個關鍵字，會抓到這種遮蔽。
 */
const HAS_TARGET_MARKERS =
  /攻擊|砍|刺|揍|踢|踹|開槍|射|衝(?:出|進|向|過)|跑(?:出|進|向|過|走)|逃|追|撲|抓住|搶|奪|打開|拉開|推開|撬|破壞|撞|爬|翻(?:越|過)|跳(?:過|下|上)|躲|藏|潛|說服|威脅|恐嚇|欺騙|騙|談判|交涉|搜|調查|檢查|修|駭|破解|治療|包紮|拿走|取走|偷|閃(?:過|開|避)|避開|躲過|擋(?:住|下)|接住|撐住|抵抗|忍住/u;

const NO_TARGET_ACTION_RULES = [
  {
    // 情緒與心理狀態：害怕不會「失敗」，它是一個狀態，不是一次嘗試。
    pattern: /(?:我)?(?:很|好|超|有點|有些|真的)?(?:害怕|恐懼|緊張|不安|焦慮|生氣|憤怒|難過|傷心|想哭|哭了?|發抖|顫抖)/u,
    blocked: HAS_TARGET_MARKERS,
  },
  {
    // 姿態與表情：蹲下、抱頭、發呆——動作有，但沒有一個會失敗的目標。
    pattern: /(?:抱頭|蹲下|坐下|癱坐|發呆|愣住|嘆氣|苦笑|傻笑|大笑|閉上?眼|摀住?(?:耳朵|眼睛|嘴)|搖頭|點頭|深呼吸|喘氣|吞口水|冷靜下來)/u,
    blocked: HAS_TARGET_MARKERS,
  },
  {
    // 無害的表演與怪動作：翻跟斗、跳舞、唱歌。這是玩家在玩，不是在闖關。
    pattern: /(?:翻跟斗|翻筋斗|跟頭|跳舞|跳一段|唱歌|哼歌|吹口哨|鼓掌|拍手|伸懶腰|原地(?:轉圈|旋轉|踏步)|扮鬼臉|比中指|敬禮|揮手)/u,
    blocked: HAS_TARGET_MARKERS,
  },
  {
    // 純粹的想法陳述，沒有動作：「我覺得這裡怪怪的」「我不知道該怎麼辦」。
    pattern: /^(?:我)?(?:覺得|認為|想著|不知道|沒有(?:頭緒|想法)|好奇|懷疑)[^。！？!?]{0,20}$/u,
    blocked: HAS_TARGET_MARKERS,
  },
];

function isNoTargetAction(text) {
  return NO_TARGET_ACTION_RULES.some(({ pattern, blocked }) => pattern.test(text) && !blocked.test(text));
}

const LOW_RISK_FREE_ACTION_RULES = [
  {
    pattern: /(?:問|詢問|搭話|交談|對話|回答|回應|解釋|了解)(?:[^。！？!?]{0,18})(?:情況|狀況|發生什麼|怎麼回事|是誰|為什麼)?/u,
    blocked: /說服|談判|威脅|恐嚇|欺騙|騙取|偽裝|安撫|命令|逼迫/u,
  },
  {
    pattern: /(?:轉頭)?(?:看看|環顧|環視|掃視|查看)(?:四周|周圍|周遭|附近|現場|環境)/u,
    blocked: /搜索|搜查|調查|找線索|識破|查明|分析|潛行|躲藏|攻擊|射擊|開槍/u,
  },
  {
    pattern: /(?:聽聽|聆聽|留意|注意)(?:周圍|附近|四周|周遭|動靜|聲音)/u,
    blocked: /搜索|搜查|調查|找線索|識破|查明|分析|潛行|躲藏|攻擊|射擊|開槍/u,
  },
];

function isLowRiskFreeAction(text) {
  return LOW_RISK_FREE_ACTION_RULES.some(({ pattern, blocked }) => pattern.test(text) && !blocked.test(text));
}

export function inferCheckParams(actionText, options = {}) {
  const { character, defaultDc = DEFAULT_DC } = options;
  const text = String(actionText ?? "").trim();

  if (isLowRiskFreeAction(text) || isNoTargetAction(text)) {
    return { ...FREE_ACTION_INTENT };
  }

  const hit = INTENT_TABLE.find((entry) => entry.keywords.some((k) => text.includes(k)));

  // 沒有命中任何關鍵字，而且句子裡也找不到一個會失敗的目標 -> 這不是一次判定，是一段演出。
  //
  // 這是舊版最貴的一行的替代品。舊版在這裡硬給一個「感知 + 困難」，等於對每一個
  // 引擎看不懂的句子宣告失敗；而且因為全部退回同一個屬性，套路遞減還會讓難度越疊越高。
  // 引擎看不懂一句話，不代表玩家做錯了什麼。看不懂就交給敘事，不要編一個必敗的判定出來。
  if (!hit && !HAS_TARGET_MARKERS.test(text)) {
    return { ...FREE_ACTION_INTENT };
  }

  const intent = hit ?? FALLBACK_INTENT;

  const params = {
    actionType: "check",
    requiresCheck: true,
    attribute: intent.attribute,
    // 有目標、但引擎查不到對應技能時（FALLBACK_INTENT 是純屬性、沒有技能加值），
    // 難度降到 FALLBACK_DC。純屬性骰池通常只有 2~3 顆，DEFAULT_DC 在這種情況下
    // 仍然是 87% 失敗——那跟舊版的「必敗」只差一個量級，不是差在對不對。
    // 引擎不確定玩家想用什麼技能時，該讓的是難度，不是玩家。
    dc: hit ? defaultDc : FALLBACK_DC,
    matched: Boolean(hit),
  };

  if (intent.skill) {
    const hasSkill = !character || character.skills?.[intent.skill] != null;
    if (hasSkill) {
      params.skill = intent.skill;
    }
  }

  return params;
}
