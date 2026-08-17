// 行動經濟 —— [規則書] 出處：場景與動作規則.htm「戰鬥標準」段落，
// rules2.35.txt 第4464~4464行。
//
// 一個參戰單位若獲得「完整的一輪」，本回合可以使用：
//   自由動作(free)：無限多個(除了說話以外，大多不能在自己的行動之外進行；ST可以限制每回合上限；
//                    同一個「行為」只能用一個自由動作，這裡用 key 判斷是不是同一個行為)
//   迅捷動作(swift)：最多1個
//   移動動作(move)：最多1個，可以轉化為迅捷動作(反之不行)
//   標準動作(standard)：最多1個，可以轉化為移動動作、甚至再轉化為迅捷動作(反之都不行)
//   整輪動作(fullRound)：=一個移動+一個標準的組合，使用後兩者都會失去
//   全回合動作(fullTurn)：=一個迅捷+一個移動+一個標準的組合，使用後三者都會失去
// 另外還有：
//   反射動作(reflex)：只有特殊能力才能使用，可以在任意時刻(包括對方回合)做出，做出後，
//                       若無特殊說明，會失去「下一輪」的全部迅捷動作；一般每輪限1個。
//   準備動作(prepared)：花費一個標準/移動/迅捷/自由動作宣言，在觸發條件出現時執行「準備好的動作」，
//                       宣言時用掉的動作等級，下一輪對應的動作等級會被跳過(視為透支)。
//   專注(focus)：一次只能維持一個專注效果，每輪開始時要決定是否維持，維持的話對應動作直接失去。
//
// 這個模組只管「這回合/下回合還剩下哪些動作額度可以用」，不管每個動作實際去做了什麼
// (那是呼叫端——實際的戰鬥流程/UI——的事)。

/**
 * 建立一輪的動作額度。
 * @param {{ swiftLostFromReflex?: boolean }} [opts] swiftLostFromReflex：上一輪有沒有用過反射動作，
 *   若有，這一輪一開始迅捷動作就視為已經用掉(書中原文的懲罰)。
 */
export function createActionBudget(opts = {}) {
  return {
    standardAvailable: true,
    moveAvailable: true,
    swiftAvailable: !opts.swiftLostFromReflex,
    reflexAvailable: true,
    usedFreeActionKeys: [],
    focusMaintained: null,
    swiftLostFromReflex: false, // 這一輪如果用了反射動作，這裡會變true，供下一輪 createActionBudget 使用
  };
}

/** 使用一個標準動作。 */
export function useStandard(budget) {
  if (!budget.standardAvailable) throw new Error("本回合標準動作已經用掉了");
  return { ...budget, standardAvailable: false };
}

/**
 * 使用一個移動動作。
 * @param {object} budget
 * @param {{ fromStandard?: boolean }} [opts] fromStandard：把標準動作的額度降級當移動動作用
 *   (書中原文：標準動作可以轉化為移動動作)。
 */
export function useMove(budget, opts = {}) {
  if (opts.fromStandard) {
    if (!budget.standardAvailable) throw new Error("標準動作額度已經用掉了，無法降級為移動動作");
    return { ...budget, standardAvailable: false };
  }
  if (!budget.moveAvailable) throw new Error("本回合移動動作已經用掉了");
  return { ...budget, moveAvailable: false };
}

/**
 * 使用一個迅捷動作。
 * @param {object} budget
 * @param {{ from?: "swift"|"move"|"standard" }} [opts] from：可以用移動動作額度降級(書中原文：
 *   移動動作可以轉化為迅捷動作)，也可以再往上追溯到標準動作額度(標準->移動->迅捷可以連續轉化)。
 */
export function useSwift(budget, opts = {}) {
  const from = opts.from ?? "swift";
  if (from === "standard") {
    if (!budget.standardAvailable) throw new Error("標準動作額度已經用掉了，無法降級為迅捷動作");
    return { ...budget, standardAvailable: false };
  }
  if (from === "move") {
    if (!budget.moveAvailable) throw new Error("移動動作額度已經用掉了，無法降級為迅捷動作");
    return { ...budget, moveAvailable: false };
  }
  if (!budget.swiftAvailable) throw new Error("本回合迅捷動作已經用掉了");
  return { ...budget, swiftAvailable: false };
}

/** 使用一個整輪動作(移動+標準組合，兩者都會失去)。 */
export function useFullRound(budget) {
  if (!budget.standardAvailable || !budget.moveAvailable) {
    throw new Error("整輪動作需要標準動作與移動動作都還沒用過");
  }
  return { ...budget, standardAvailable: false, moveAvailable: false };
}

/** 使用一個全回合動作(迅捷+移動+標準組合，三者都會失去)。 */
export function useFullTurn(budget) {
  if (!budget.standardAvailable || !budget.moveAvailable || !budget.swiftAvailable) {
    throw new Error("全回合動作需要標準/移動/迅捷動作都還沒用過");
  }
  return { ...budget, standardAvailable: false, moveAvailable: false, swiftAvailable: false };
}

/**
 * 使用一個自由動作。同一個「行為」(actionKey) 每回合只能用一次自由動作，
 * ST 可以額外限制每回合自由動作的總數上限(maxPerTurn)。
 */
export function useFree(budget, actionKey, { maxPerTurn = Infinity } = {}) {
  if (budget.usedFreeActionKeys.includes(actionKey)) {
    throw new Error(`本回合已經對「${actionKey}」這個行為使用過自由動作了`);
  }
  if (budget.usedFreeActionKeys.length >= maxPerTurn) {
    throw new Error(`本回合自由動作已達上限(${maxPerTurn})`);
  }
  return { ...budget, usedFreeActionKeys: [...budget.usedFreeActionKeys, actionKey] };
}

/**
 * 使用一個反射動作。可以在任意時刻(包括對方回合)使用，一般每輪限1個(除非有特殊能力)。
 * 使用後會標記 swiftLostFromReflex=true，下一輪呼叫 createActionBudget 時要把這個傳進去，
 * 讓下一輪的迅捷動作視為已經用掉(書中原文的懲罰)。
 */
export function useReflex(budget) {
  if (!budget.reflexAvailable) throw new Error("本回合反射動作已經用掉了");
  return { ...budget, reflexAvailable: false, swiftLostFromReflex: true };
}

/**
 * 開始維持一個專注效果。一次只能維持一個(書中原文：一個人只能同時維持一個專注效果)，
 * 開啟本身需要對應的動作(呼叫端自己先用掉那個動作額度，這裡只負責記錄「現在專注在什麼上」)。
 */
export function startFocus(budget, focusName) {
  if (budget.focusMaintained != null) {
    throw new Error(`已經在維持「${budget.focusMaintained}」，無法同時開啟第二個專注效果`);
  }
  return { ...budget, focusMaintained: focusName };
}

/** 停止維持專注效果(不論是主動放棄還是效果結束)。 */
export function stopFocus(budget) {
  return { ...budget, focusMaintained: null };
}
