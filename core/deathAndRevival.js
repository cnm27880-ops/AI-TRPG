// 死亡與復活機制
// [規則書] 出處：特殊兌換(主神修復.htm)，rules2.35.txt 第7743~7743行。
//
// 書中原文機制：
//   - 每個角色一輩子擁有一次「直接透過主神」復活的保證機會。
//   - 若該角色再次死亡，這個保證管道失效，只能透過劇情中取得的特定劇情道具，
//     或觸發特定劇情效果才能復活；每一種復活方式對同一個角色都只能使用一次(所以一輩子最多兩次)。
//   - 復活費用 = 角色身上還沒花掉的分數 + 已經花掉去兌換血統/技能樹/物品等的所有分數，兩者總和。
//     書中範例：D+1000未花 + D+600血統 + 3000屬性 = 復活需要 DD+4600。
//   - 復活後，所有「非永久」的buff/debuff會被移除；永久性效果(永久屬性提升、
//     永久血量上限下降等)復活後依然生效。
//
// [設計-簡化，已與使用者確認] 這個引擎不採用書中「第二次復活需要特定劇情道具/劇情效果觸發」的
// 硬性門檻——原因是這個門檻綁定的是每部影片/每個劇本專屬的特定道具(例如《太陽金經》)，這個引擎
// 目前沒有做「劇本限定稀有道具」的資料結構，強行要求會讓復活機制卡在還沒做的內容上。改為：
// 兩次復活都直接照同一個公式收費即可，只要付得起就能復活。復活次數上限仍是 2 次(書中原意不變，
// 只是拿掉了「必須先集齊特定道具」這個取得門檻)，用完兩次之後，第三次死亡就是真死，
// 無法再復活，需要重新創角。
//
// 已知限制：復活費用公式需要「角色身上未花分數」與「已花分數明細」兩筆資料，但目前
// core/schema.js 的 emptyCharacter() 只有 xp:{earned,spent} 這組「經驗值」帳本，還沒有
// 建卡時的「分數(支線/開局點數)」帳本——那屬於還沒開工的「建卡點數預算驗證」(Phase 3/4)。
// 所以這裡的函式故意不直接吃 character 物件，而是吃呼叫端自己組好的 wallet 參數，
// 等點數帳本系統做出來之後，由呼叫端負責把 character 轉成這個 wallet 形狀。

export const MAX_REVIVALS = 2;

/**
 * 復活費用 = 未花分數 + 已花分數總和(逐項加總，不管是血統/技能/物品，一律算進去)。
 * @param {{ unspentPoints: number, spentLedger: Record<string, number> }} wallet
 */
export function computeRevivalCost(wallet) {
  const unspent = wallet.unspentPoints ?? 0;
  if (unspent < 0) throw new Error("未花分數不能是負數");
  const spentTotal = Object.values(wallet.spentLedger ?? {}).reduce((sum, v) => {
    if (v < 0) throw new Error("已花分數的單項紀錄不能是負數");
    return sum + v;
  }, 0);
  return unspent + spentTotal;
}

/**
 * 嘗試復活一個角色。
 * @param {{ reviveCount: number }} character 角色目前的復活次數紀錄
 * @param {{ unspentPoints: number, spentLedger: Record<string, number> }} wallet
 * @param {number} availableFunds 角色/玩家目前實際可動用來支付復活費用的分數
 * @returns {{ revived: boolean, permaDeath: boolean, cost?: number, shortfall?: number, reviveCount?: number, reason?: string }}
 */
export function attemptRevival(character, wallet, availableFunds) {
  if (character.reviveCount >= MAX_REVIVALS) {
    return {
      revived: false,
      permaDeath: true,
      reason: `已用完 ${MAX_REVIVALS} 次復活機會，無法再復活`,
    };
  }
  const cost = computeRevivalCost(wallet);
  if (availableFunds < cost) {
    return {
      revived: false,
      permaDeath: true,
      cost,
      shortfall: cost - availableFunds,
      reason: "湊不出復活費用",
    };
  }
  return {
    revived: true,
    permaDeath: false,
    cost,
    reviveCount: character.reviveCount + 1,
  };
}

/**
 * 復活後的效果清空規則(書中原文)：非永久buff/debuff全部移除，永久效果保留。
 * @param {{ temporary?: object[], permanent?: object[] }} effects
 */
export function clearTemporaryEffectsOnRevival(effects) {
  return { temporary: [], permanent: effects.permanent ?? [] };
}
