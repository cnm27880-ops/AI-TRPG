// [設計] 建卡配點成本表 —— 屬性與技能的遞增成本曲線，以及兩軸的預算。
//
// 單獨拆成一個檔案的理由很實際：content/chargen/allocate.js（自動配點）與
// content/characterBuilder.js（驗證與組裝）**都**需要這張表。如果表留在 characterBuilder，
// 兩個模組會互相 import 形成循環——ESM 撐得住，但那是一種「現在剛好沒炸」的狀態，
// 之後任何人在 allocate.js 的模組頂層讀一個 characterBuilder 的常數就會變成 TDZ 錯誤。
// 成本表本來就是一份誰都可以讀的靜態資料，放在最底層最正確。
//
// 曲線的由來
//
// 起因是實際測玩回饋（逐字）：
//   「只要玩家把單一屬性+單一技能點高，就能一直用同一個檢定通關，
//     因為我的敏捷+潛行最高，我每次都按相關的選項」
//
// 舊制是**線性**的：屬性從1加到5花4點、5個屬性各加1也花4點，兩者代價一模一樣。
// 在骰池制底下這不是平衡的選擇，是一個明顯的最佳解——骰池愈大成功率愈高，
// 而「把點全押在一個組合上」不需要付出任何額外代價，理性玩家沒有理由不這樣做。
//
// 改成遞增之後（每一級的邊際成本）：
//   屬性 1->2:1  2->3:1  3->4:2  4->5:3   （累計 0/1/2/4/7）
//   技能 0->1:1  1->2:1  2->3:2            （累計 0/1/2/4）
// 專精仍然做得到，而且仍然強——但把敏捷點到5要花掉7點（總預算8點），
// 玩家會清楚感覺到「這一點是拿其他五個屬性換來的」。這不是削弱專精，
// 是讓專精變成一個**有代價的選擇**，而不是一個沒有理由不選的選項。
//
// 預算跟著調高（屬性6->8、技能8->10），讓四個內建模板維持原本的配點不變——
// 這次要改的是「極端專精的代價」，不是「所有角色都變弱」。
//
// 數值是草案，之後依實際測玩調整；改的時候要連 test/characterBuilder.test.js 一起改。
// ---------------------------------------------------------------------------

/** 屬性每一級的邊際成本（索引 = 從幾升到幾+1）。基礎值1不用花點。 */
const ATTRIBUTE_STEP_COST = { 2: 1, 3: 1, 4: 2, 5: 3 };
/** 技能每一級的邊際成本。基礎值0不用花點。 */
const SKILL_STEP_COST = { 1: 1, 2: 1, 3: 2 };

export const ATTRIBUTE_BUDGET = 8;
export const SKILL_BUDGET = 10;

/** 把一個數值從基礎值升到 value 的**累計**成本。查表加總，不用公式，方便日後隨意調整曲線。 */
function cumulativeCost(value, stepCost, startValue) {
  let total = 0;
  for (let level = startValue + 1; level <= value; level++) total += stepCost[level] ?? 0;
  return total;
}

/** 屬性從1升到 value 的累計點數成本。 */
export function attributeCost(value) {
  return cumulativeCost(value, ATTRIBUTE_STEP_COST, 1);
}

/** 技能從0升到 value 的累計點數成本。 */
export function skillCost(value) {
  return cumulativeCost(value, SKILL_STEP_COST, 0);
}

/**
 * 「再加一級」要花幾點。前端用它在加點按鈕旁邊標出下一點的價格——
 * 玩家必須在按下去之前就看到「這一點要3點」，否則遞增成本只會變成一個
 * 「我按了才發現點數不夠」的挫折來源，而不是一個可以規劃的取捨。
 */
export function nextStepCost(kind, currentValue) {
  const table = kind === "attr" ? ATTRIBUTE_STEP_COST : SKILL_STEP_COST;
  return table[currentValue + 1] ?? null;
}


