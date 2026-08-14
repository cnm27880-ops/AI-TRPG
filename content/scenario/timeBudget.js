// [設計] 劇情時間預算 —— 回應使用者需求：「劇情任務都有時間限制，推進回合會減少時間」。
//
// 設計：一個章節(或一個有時限的任務段落)開局時設定一筆「時間預算」(單位是抽象的
// 「回合」，對應規則書「場景與動作規則.htm」定義的抽象時間標準)。玩家不管是推進主線節點，
// 還是花時間培養NPC好感度，都是從同一筆預算裡扣——這就是使用者要的「資源競爭」：
// 兩件事共用同一個倒數計時器，不是分開計算的兩筆預算。
//
// 這完全是 [設計]，規則書沒有這套機制，是這次新提出的需求，數值(狀態分級門檻)是草案可調整。

/**
 * @param {number} totalRounds 這個章節/任務的總時間預算
 */
export function createTimeBudget(totalRounds) {
  if (!(totalRounds > 0)) throw new Error("時間預算必須是正數");
  return { totalRounds, spentRounds: 0, log: [] };
}

/**
 * 花費時間預算(不管是推進主線還是培養好感度，都呼叫這個函式)。
 * 回傳一個新的 budget(不修改原本的物件，維持event-log式的不可變風格)。
 * @param {{totalRounds:number, spentRounds:number, log:object[]}} budget
 * @param {number} amount 這次花費的回合數，必須是正數
 * @param {string} activity 花費在什麼活動上(例如"推進主線節點j1-ch1-n2"或"培養NPC好感度")
 */
export function spendTime(budget, amount, activity) {
  if (!(amount > 0)) throw new Error("花費時間必須是正數");
  return {
    totalRounds: budget.totalRounds,
    spentRounds: budget.spentRounds + amount,
    log: [...budget.log, { amount, activity }],
  };
}

export function remainingRounds(budget) {
  return Math.max(0, budget.totalRounds - budget.spentRounds);
}

export function isExpired(budget) {
  return budget.spentRounds >= budget.totalRounds;
}

// 狀態分級門檻，依「剩餘時間佔總預算的百分比」由高到低排列，第一個滿足的就是目前狀態。
// 這張表也是為了避免AI自己判斷"時間還夠不夠用"，狀態只能從這裡查，不能臨場喊。
export const TIME_STATUS_TIERS = [
  { status: "充裕", minRemainingPct: 50 },
  { status: "吃緊", minRemainingPct: 20 },
  { status: "危急", minRemainingPct: 1 },
  { status: "逾時", minRemainingPct: -Infinity },
];

export function timeStatus(budget) {
  const pct = (remainingRounds(budget) / budget.totalRounds) * 100;
  for (const tier of TIME_STATUS_TIERS) {
    if (pct >= tier.minRemainingPct) return tier.status;
  }
  return "逾時";
}
