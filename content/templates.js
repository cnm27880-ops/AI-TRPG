// [規則書] 撰寫規則.htm(rules2.35.txt 約第9898行起)——各類「資源」的官方撰寫模板
// 這是使用者說的「資源模板」，之後所有 500+ 頁型錄要轉成 JSON 內容包時，都拿這裡當作
// 「嚴格分級對應規則」的比對基準，而不是照單全收每一頁條目自己寫的價格(這些老條目常常
// 沒跟上模板更新，見 content/packs/example-bloodline-wolverine.json 的實測案例)。
//
// 每個模板的結構：
//   ranks: 依序排列的等級代號
//   price: 每級的「額外」花費(不是累加後的總價，跟書上寫法一致，D是從0開始買，C是在D的基礎上加購)
//   attributePerRank: 每級提供多少屬性點數可分配
//   attributeCapPerRank: 單項屬性在該級的上限
//   baseTraitsPerRank: 每級基礎可購買的「特性」數量

export const BLOODLINE_TEMPLATE = {
  id: "血統模板",
  ranks: ["D", "C", "B", "A", "AA", "S"],
  price: { D: 600, C: 1200, B: 3600, A: 7200, AA: 10800, S: 14400 },
  attributePerRank: { D: 4, C: 6, B: 8, A: 12, AA: 18, S: 24 },
  attributeCapPerRank: { D: 2, C: 3, B: 4, A: 6, AA: 6, S: 8 },
  baseTraitsPerRank: { D: 2, C: 2, B: 3, A: 3, AA: 5, S: 3 },
  notes: "AA級與S級血統不可同時擁有；一次性血統獲得同級2特性。",
};

export const CYBERNETIC_TEMPLATE = {
  id: "改造模板",
  ranks: ["D", "C", "B", "A", "S"],
  price: { D: 500, C: 1000, B: 2000, A: 4000, S: 8000 },
  attributePerRank: { D: 4, C: 6, B: 8, A: 12, S: 24 },
  attributeCapPerRank: { D: 2, C: 3, B: 4, A: 6, S: 8 },
  baseTraitsPerRank: { D: 2, C: 2, B: 2, A: 2, S: 2 },
};

export const DOJUTSU_TEMPLATE = {
  // 瞳術模板：無需從D級開始撰寫
  id: "瞳術模板",
  ranks: ["D", "C", "B", "A", "S"],
  price: { D: 600, C: 1200, B: 2400, A: 3600, S: 7200 },
  attributePerRank: { D: 4, C: 6, B: 8, A: 12, S: 24 },
  attributeCapPerRank: { D: 2, C: 3, B: 4, A: 6, S: 8 },
  baseTraitsPerRank: { D: 2, C: 2, B: 2, A: 2, S: 2 },
};

export const TITLE_TEMPLATE = {
  // 稱號模板，跟流派模板的定價、基礎特性數完全一樣，共用同一份資料
  id: "稱號/流派模板",
  ranks: ["D", "C", "B", "A", "AA", "S"],
  price: { D: 1000, C: 2000, B: 4000, A: 8000, AA: 12000, S: 16000 },
  baseTraitsPerRank: { D: 4, C: 4, B: 4, A: 4, AA: 7, S: 4 },
  notes: "不建議開放S級稱號；提供的加值默認為修行加值。",
};

export const TECHNIQUE_TEMPLATE = {
  // 技藝類(技能/招式/技藝)
  id: "技藝模板",
  ranks: ["D", "C", "B", "A", "S"],
  price: { D: 500, C: 1000, B: 2000, A: 4000, S: 8000 },
  baseTraitsPerRank: { D: 3, C: 3, B: 3, A: 3, S: 3 },
  notes: "分數翻倍可增加1個特性；支線翻倍可增加1.5個特性(最多翻倍一次)。",
};

export const SPELL_TEMPLATE = {
  id: "法術模板",
  ranks: ["D", "C", "B", "A", "S"],
  price: { D: 500, C: 1000, B: 3000, A: 6000, S: 10000 },
  powerValuePerRank: { D: 2, C: 4, B: 6, A: 10, S: 16 },
  baseTraitsPerRank: { D: 3, C: 3, B: 3, A: 3, S: 3 },
};

export const TEMPLATES_BY_TYPE = {
  血統: BLOODLINE_TEMPLATE,
  改造: CYBERNETIC_TEMPLATE,
  瞳術: DOJUTSU_TEMPLATE,
  稱號: TITLE_TEMPLATE,
  流派: TITLE_TEMPLATE,
  技藝: TECHNIQUE_TEMPLATE,
  法術: SPELL_TEMPLATE,
  // 尚未模板化(結構較特殊，非單純DCBAS定價表)，Phase 3 再處理：
  // 魔導書(每級內容各自寫死)、修真(九層交錯定價)、物品(多種價格軸)、載具(依生物/機械分流)、專長系列
};

export function getTemplate(resourceType) {
  const template = TEMPLATES_BY_TYPE[resourceType];
  if (!template) {
    throw new Error(
      `resourceType「${resourceType}」還沒有模板化(可能是魔導書/修真/物品/載具/專長，這些是Phase 3才處理的非典型定價結構)`
    );
  }
  return template;
}
