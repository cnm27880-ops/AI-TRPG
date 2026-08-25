// 行動意圖 -> 檢定參數（10 核心技能對照）
//
// 自由輸入不是「每句話都擲骰」。低風險的詢問、搭話、回答與環顧周遭
// 直接走 FREE_ACTION；只有明確的高風險目的才進入技能檢定。Reference
// approach 仍由 referenceAdapter 優先裁定，這裡只負責 unmatched generic input。

export const FALLBACK_INTENT = { attribute: "感知" };
export const FREE_ACTION_INTENT = Object.freeze({
  actionType: "free_action",
  requiresCheck: false,
  matched: false,
});
export const DEFAULT_DC = 3;

export const INTENT_TABLE = [
  { keywords: ["砍", "刺", "劈", "拳", "踢", "揍", "格鬥", "肉搏", "匕首", "刀", "近戰"], attribute: "力量", skill: "格鬥" },
  // 不使用單獨的「槍」：提到持槍 NPC、槍套或槍聲不等於玩家正在射擊。
  { keywords: ["射擊", "開槍", "開火", "槍擊", "瞄準", "扣扳機", "射殺", "擊中", "弓", "箭", "狙擊", "遠程"], attribute: "敏捷", skill: "射擊" },
  { keywords: ["跑", "衝刺", "跳", "攀爬", "翻越", "游泳", "投擲", "體能"], attribute: "敏捷", skill: "體魄" },
  { keywords: ["躲藏", "潛行", "隱藏", "暗中", "掩護", "撬鎖", "開鎖", "扒竊", "無聲"], attribute: "敏捷", skill: "潛行" },
  { keywords: ["求生", "開車", "駕駛", "追逐", "生火", "辨向", "馴獸", "露營"], attribute: "敏捷", skill: "求生" },
  { keywords: ["觀察", "調查", "搜索", "搜查", "檢查", "找線索", "警戒", "識破", "查明", "分析"], attribute: "感知", skill: "偵察" },
  { keywords: ["電腦", "駭入", "破解", "系統", "終端", "拆彈", "修理", "改裝", "科技"], attribute: "智力", skill: "技藝" },
  { keywords: ["治療", "急救", "包紮", "止血", "手術", "解毒", "醫療"], attribute: "智力", skill: "醫療" },
  { keywords: ["神秘", "符文", "魔法", "弱點", "怪物", "文獻", "咒術", "解讀", "歷史"], attribute: "智力", skill: "秘識" },
  { keywords: ["說服", "交涉", "談判", "安撫", "威脅", "恐嚇", "騙", "偽裝", "套話", "謊言"], attribute: "意志", skill: "交涉" },
  { keywords: ["忍住", "抵抗", "撐住", "意志", "冷靜"], attribute: "意志" },
];

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

  if (isLowRiskFreeAction(text)) {
    return { ...FREE_ACTION_INTENT };
  }

  const hit = INTENT_TABLE.find((entry) => entry.keywords.some((k) => text.includes(k)));
  const intent = hit ?? FALLBACK_INTENT;

  const params = {
    actionType: "check",
    requiresCheck: true,
    attribute: intent.attribute,
    dc: defaultDc,
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
