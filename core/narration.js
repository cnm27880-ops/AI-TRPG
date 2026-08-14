// [設計] 敘事結果分級契約 —— 規則書本身只定義「成功/失敗與margin」，沒有定義敘事該多誇張，
// 這個模組是我們自己補上的，目的是直接回應使用者的需求：
// 「AI除了看玩家的行動，也要看骰子做判斷，要是玩家說他很厲害，結果骰子失敗超徹底，那就尷尬了」
//
// 用法：每次 performCheck() 跑完，把結果丟進 classifyOutcome()，拿到一個「分級」跟「敘事指令」。
// 這個「敘事指令」是要放進餵給 AI 的 prompt 裡的一段話，用來鎖住 AI 的敘事基調，
// AI 不能因為玩家寫了「我超強」就无視這個分級亂寫劇情。
//
// 分級門檻目前是這個專案自己訂的草案，數字本身沒有規則書依據，之後可以依實際測玩調整，
// 但調整時一樣要更新 test/narration.test.js 鎖住新版行為，不能無測試地隨便改。

const TIERS = [
  {
    id: "大成功",
    minMargin: 5,
    directive:
      "行動完全壓倒性成功，可以描寫超出玩家預期的漂亮成果，允許出現意外的額外收穫或帥氣描寫。",
  },
  {
    id: "成功",
    minMargin: 1,
    directive: "行動確實成功，正常描寫達成目標的過程，不需要誇大也不需要貶低。",
  },
  {
    id: "驚險成功",
    minMargin: 0,
    directive: "行動剛好壓線成功，敘事應該帶出「差一點就不行」的驚險感，可以描寫小瑕疵或代價。",
  },
  {
    id: "些微失敗",
    minMargin: -3,
    directive: "行動沒有達成，但不是慘敗，描寫合理的受挫或部分進展，避免誇張的災難描寫。",
  },
  {
    id: "失敗",
    minMargin: -6,
    directive: "行動明確失敗，應該有實際代價或處境惡化，不能寫成「其實還好」。",
  },
  {
    id: "慘烈失敗",
    minMargin: -Infinity,
    directive: "行動嚴重失敗，必須描寫顯著的負面後果(受傷/暴露/資源損失等)，不可輕描淡寫帶過。",
  },
];

/**
 * @param {object} checkResult performCheck() 或 resolveCheck() 的回傳值
 * @returns {{ tier: string, directive: string, fumble: boolean, autoFail: boolean }}
 */
export function classifyOutcome(checkResult) {
  if (checkResult.autoFail) {
    return {
      tier: "自動失敗",
      directive: "角色缺乏對應能力，這次行動連嘗試的基礎都不具備，必須明確描寫做不到，不能靠敘事矇混過關。",
      fumble: false,
      autoFail: true,
    };
  }

  if (checkResult.fumble) {
    return {
      tier: "大失敗(命定)",
      directive: "骰子觸發了大失敗，這是命運級的重大差錯，敘事上必須讓事情往最壞的方向發展一步，交由你決定具體後果但不能是輕微的。",
      fumble: true,
      autoFail: false,
    };
  }

  const margin = checkResult.margin;
  const tier = TIERS.find((t) => margin >= t.minMargin);
  return { tier: tier.id, directive: tier.directive, fumble: false, autoFail: false };
}

/** 把分級結果格式化成一段可以直接塞進 AI prompt 的文字，方便串接 */
export function toPromptDirective(outcome) {
  return `[判定結果：${outcome.tier}] ${outcome.directive}`;
}
