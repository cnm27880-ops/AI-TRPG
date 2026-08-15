// 行動意圖 -> 檢定參數（10 核心技能對照）

export const FALLBACK_INTENT = { attribute: "感知" };
export const DEFAULT_DC = 3;

export const INTENT_TABLE = [
  { keywords: ["砍", "刺", "劈", "拳", "踢", "揍", "格鬥", "肉搏", "匕首", "刀", "近戰"], attribute: "力量", skill: "格鬥" },
  { keywords: ["射擊", "開火", "開槍", "槍", "瞄準", "扣扳機", "弓", "箭", "狙擊", "遠程"], attribute: "敏捷", skill: "射擊" },
  { keywords: ["跑", "衝刺", "跳", "攀爬", "翻越", "游泳", "投擲", "體能"], attribute: "敏捷", skill: "體魄" },
  { keywords: ["躲藏", "潛行", "隱藏", "暗中", "掩護", "撬鎖", "開鎖", "扒竊", "無聲"], attribute: "敏捷", skill: "潛行" },
  { keywords: ["求生", "開車", "駕駛", "追逐", "生火", "辨向", "馴獸", "露營"], attribute: "敏捷", skill: "求生" },
  { keywords: ["觀察", "調查", "搜索", "搜查", "檢查", "找線索", "警戒", "識破"], attribute: "感知", skill: "偵察" },
  { keywords: ["電腦", "駭入", "破解", "系統", "終端", "拆彈", "修理", "改裝", "科技"], attribute: "智力", skill: "技藝" },
  { keywords: ["治療", "急救", "包紮", "止血", "手術", "解毒", "醫療"], attribute: "智力", skill: "醫療" },
  { keywords: ["神秘", "符文", "魔法", "弱點", "怪物", "文獻", "咒術", "解讀", "歷史"], attribute: "智力", skill: "秘識" },
  { keywords: ["說服", "交涉", "談判", "安撫", "威脅", "恐嚇", "騙", "偽裝", "套話", "謊言"], attribute: "意志", skill: "交涉" },
  { keywords: ["忍住", "抵抗", "撐住", "意志", "冷靜"], attribute: "意志" },
];

export function inferCheckParams(actionText, options = {}) {
  const { character, defaultDc = DEFAULT_DC } = options;
  const text = String(actionText ?? "");

  const hit = INTENT_TABLE.find((entry) => entry.keywords.some((k) => text.includes(k)));
  const intent = hit ?? FALLBACK_INTENT;

  const params = { attribute: intent.attribute, dc: defaultDc, matched: Boolean(hit) };

  if (intent.skill) {
    const hasSkill = !character || character.skills?.[intent.skill] != null;
    if (hasSkill) {
      params.skill = intent.skill;
    }
  }

  return params;
}
