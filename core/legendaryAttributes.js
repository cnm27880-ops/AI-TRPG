// 傳奇屬性效果總表 —— [規則書] 出處：屬性概述.htm，逐字取自使用者提供的原文(2026會話中貼上)。
//
// 九個屬性的傳奇效果都以 n = legendaryAttributeBonus(屬性值) 為基礎(見 core/dice.js)，
// 但各自解鎖的加值形狀不一樣：
//   - 大部分是線性(每點+n)：檢定附加成功、DP加值、防御附加成功、閃避/洞察防御、先攻、意志值等。
//   - 力量的「傷害上限提升」跟耐力的「生命值額外增加」是三角形數列疊加(1+2+...+n)，
//     書中原文明確寫「再提升X，即共計提升(1+2+...=)Y」，不是線性的。
//   - 力量的「負重增加」跟耐力的「不吃不喝不睡週數」是每級翻倍的查表值，不是公式，直接照書列表。
//   - 耐力的「屏息時間倍數」(2/4/8/12/32倍)不符合任何乾淨的翻倍或線性公式，這裡照書中原文
//     原封不動列出來，不自行「修順」成漂亮數字——如果這是原始資料的手誤，需要你回頭確認，
//     不是我們這邊算錯。
//
// 這個檔案只負責把「傳奇屬性解鎖了什麼」列成可查詢的資料，不負責把這些效果實際套用到
// 判定/戰鬥/生命值系統——大多數效果依附的系統(意志力/機運骰/重骰資源池/XP紅利/語言技能)
// 目前都還沒做，這裡先把資料存下來，避免這段書中原文之後又要重新找一次。

import { legendaryAttributeBonus } from "./dice.js";

function triangular(n) {
  return (n * (n + 1)) / 2;
}

export const LEGENDARY_ATTRIBUTE_EFFECTS = {
  力量: {
    checkBonusSuccesses: (n) => n,
    carryCapacityBonusKg: (n) => 500 * 2 ** (n - 1), // 500/1000/2000/4000/8000
    throwDistanceMultiplier: (n) => n + 1, // 2/3/4/5/6倍
    checkDPBonus: (n) => n,
    // [決策記錄 2026-08-15] 這條原本要疊加在 core/combat/attackTypes.js 的傷害上限公式上，
    // 但新的單一DC戰鬥數學(見 core/combat/defense.js)已經不再對傷害設上限，這個數值目前
    // 沒有地方可以套用了，保留純粹是規則書原文記錄，之後若恢復傷害上限機制可以復用。
    damageCapBonus: (n) => triangular(n), // 1/3/6/10/15
  },
  敏捷: {
    checkBonusSuccesses: (n) => n,
    defenseBonusSuccesses: (n) => n,
    dodgeDefense: (n) => n, // 對應 core/combat/defense.js 的 dodge
    baseSpeedBonusMeters: (n) => 3 * n, // 3/6/9/12/15
  },
  耐力: {
    checkBonusSuccesses: (n) => n,
    hpBonus: (n) => triangular(n), // 1/3/6/10/15
    noFoodSleepWeeks: (n) => 2 ** (n - 1), // 1/2/4/8/16週
    // [原文如此，未修順] 屏息時間倍數不符合乾淨公式，照書原封不動列出，懷疑可能是原始資料手誤
    // (跳過16直接到12再跳到32)，之後如果你確認是筆誤，回來改這裡就好。
    breathHoldMultiplier: (n) => [2, 4, 8, 12, 32][n - 1] ?? null,
  },
  智力: {
    checkBonusSuccesses: (n) => n,
    bonusXpPerMovie: (n) => 3 * n, // 3/6/9/12/15，書中特別強調「紅利無法產生紅利」
    languageLevelUps: (n) => n, // 每點可以再讓一種語言+1級，累計n次
  },
  感知: {
    checkBonusSuccesses: (n) => n,
    defenseBonusSuccesses: (n) => n, // 之前 core/combat/defense.js 漏算的就是這個來源
    insightDefense: (n) => n, // 對應 defense.js 的 insight，書中特別註明「可疊加，且可與其他來源疊加」
    senseRangeBonusMeters: (n) => 20 * n, // 20/40/60/80/100
  },
  決心: {
    checkBonusSuccesses: (n) => n,
    willpowerBonus: (n) => n, // 書中沒有用「再提升/共計」的累加語氣，是線性n，不是三角形數列
    willCheckDPBonus: (n) => n,
  },
  風度: {
    checkBonusSuccesses: (n) => n,
    // 機運骰/基因鎖檢定「結果」上+n，但明確排除觸發加骰(不會因為+n之後變成10而加骰)
    fortuneDieResultBonus: (n) => n,
    perfectBonusIncrease: (n) => n, // 意志力基礎用法的完美加值
  },
  操控: {
    checkBonusSuccesses: (n) => n,
    rerollsPerMovie: (n) => n, // 每部影片n次重骰機會，擲完不滿意可以用，取較好結果
  },
  沉著: {
    checkBonusSuccesses: (n) => n,
    willpowerBonus: (n) => n,
    initiativeBonus: (n) => 2 * n, // 2/4/6/8/10，對應 core/combat/turnOrder.js 的先攻值組成之一
  },
};

/**
 * 查一個屬性在目前屬性值下解鎖的全部傳奇效果數值。
 * @param {keyof typeof LEGENDARY_ATTRIBUTE_EFFECTS} attributeKey
 * @param {number} attributeValue 屬性的目前值(不是n，這裡會自己算n)
 */
export function getLegendaryEffects(attributeKey, attributeValue) {
  const table = LEGENDARY_ATTRIBUTE_EFFECTS[attributeKey];
  if (!table) {
    throw new Error(`不合法的屬性：${attributeKey}，合法值：${Object.keys(LEGENDARY_ATTRIBUTE_EFFECTS).join("/")}`);
  }
  const n = legendaryAttributeBonus(attributeValue);
  const effects = { n };
  for (const [effectName, fn] of Object.entries(table)) {
    effects[effectName] = fn(n);
  }
  return effects;
}
