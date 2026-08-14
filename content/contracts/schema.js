// [設計] 主神商店契約系統骨架 —— 回應使用者需求：「未來的主神商店會有奴隸契約還是什麼
// 員工契約之類的，只有購買之後才能把好感度達標的NPC帶出世界外」。
//
// 現階段只搭資料結構與驗證，不填實際數值(價格/效果留白)，等使用者確定要做這塊的時候再補。
// 走跟血統包/瞳術包/副本包一樣的 content/loader.js 機制(type: "契約")，一樣是即插即用。

/**
 * @typedef Contract
 * @property {string} name
 * @property {"奴隸契約"|"員工契約"} contractType
 * @property {number} requiredAffectionTier 需要好感度達到的最低分級(對應 content/affection.js 的 tier)
 * @property {number|null} price 購買契約需要的分數，留白(null)代表數值還沒定
 * @property {string} effectDescription 契約效果的文字描述(留白時可以是"待設計")
 */

const VALID_CONTRACT_TYPES = new Set(["奴隸契約", "員工契約"]);

/**
 * 驗證一個契約包(type="契約")的 entries 是否符合基本結構要求。
 * 這裡刻意寬鬆：price 允許是 null(代表數值待補)，但 contractType 跟
 * requiredAffectionTier 這種結構性欄位必須存在且合法，不能連骨架都不完整。
 */
export function validateContractPack(pack) {
  const errors = [];
  if (pack.type !== "契約") {
    errors.push(`type應為「契約」，實際是「${pack.type}」`);
    return { valid: false, errors };
  }
  for (const entry of pack.entries ?? []) {
    if (!VALID_CONTRACT_TYPES.has(entry.contractType)) {
      errors.push(`「${entry.name}」的 contractType 不合法：${entry.contractType}，合法值：${[...VALID_CONTRACT_TYPES].join("/")}`);
    }
    if (typeof entry.requiredAffectionTier !== "number") {
      errors.push(`「${entry.name}」缺少合法的 requiredAffectionTier`);
    }
    if (!("price" in entry)) {
      errors.push(`「${entry.name}」缺少 price 欄位(數值未定時請明確寫 null，不要整個欄位省略)`);
    }
  }
  return { valid: errors.length === 0, errors };
}
