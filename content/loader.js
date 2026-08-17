// [設計] 內容包(content pack)載入器 —— 血統包/瞳術包/道具包/副本包全部走同一套機制。
// 這是回應使用者「即插即用、分類插件包、之後接後台」的需求：
// 每包是一個獨立 JSON 檔，有 manifest(id/type/version/來源頁)，載入器負責結構驗證與合併，
// 不合法或撞名的包會被擋下來，不會讓一個壞掉的包默默污染整個資料庫。

import { getTemplate, TEMPLATES_BY_TYPE } from "./templates.js";

const REQUIRED_PACK_FIELDS = ["id", "type", "version", "entries"];
const KNOWN_TYPES = new Set([
  ...Object.keys(TEMPLATES_BY_TYPE),
  "魔導書",
  "修真",
  "物品",
  "載具",
  "專長",
  "副本", // scenario pack，見 content/scenario/
  "契約", // contract pack(主神商店奴隸/員工契約)，見 content/contracts/，數值目前留白
  // shop pack(主神商店貨架)，見 content/shop/。跟上面那些 type 的關係要講清楚：
  // 上面是「型錄長什麼樣」的原文存檔(entries 的特性是自由文字)，「商品」是「商店賣什麼」
  // ——同一批原文經過 content/shop/effects.js 的詞彙表轉換之後的結果。兩者刻意分開，
  // 因為轉換是有損的，型錄那份必須保留原文才能回頭核對。
  "商品",
]);

/**
 * 驗證單一 pack 的結構是否合法(不做template比對，只檢查manifest本身)。
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePackStructure(pack) {
  const errors = [];
  for (const field of REQUIRED_PACK_FIELDS) {
    if (pack[field] == null) errors.push(`缺少必要欄位「${field}」`);
  }
  if (pack.type && !KNOWN_TYPES.has(pack.type)) {
    errors.push(`未知的 type「${pack.type}」，合法值：${[...KNOWN_TYPES].join("/")}`);
  }
  if (pack.entries && !Array.isArray(pack.entries)) {
    errors.push("entries 必須是陣列");
  }
  if (Array.isArray(pack.entries)) {
    const seen = new Set();
    pack.entries.forEach((entry, i) => {
      if (!entry.name) errors.push(`entries[${i}] 缺少 name`);
      if (entry.name && seen.has(entry.name)) errors.push(`entries 內有重複的 name「${entry.name}」`);
      if (entry.name) seen.add(entry.name);
    });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 把多個 pack 合併成一個註冊表，跨包撞名(同type下同name)會被視為錯誤擋下。
 * @param {object[]} packs
 * @returns {{ registry: Record<string, Record<string, object>>, errors: string[] }}
 */
export function mergePacks(packs) {
  const registry = {}; // { [type]: { [entryName]: entry } }
  const errors = [];
  const seenPackIds = new Set();

  for (const pack of packs) {
    const structCheck = validatePackStructure(pack);
    if (!structCheck.valid) {
      errors.push(`pack「${pack.id ?? "(未知id)"}」結構錯誤：${structCheck.errors.join("；")}`);
      continue;
    }
    if (seenPackIds.has(pack.id)) {
      errors.push(`pack id「${pack.id}」重複載入`);
      continue;
    }
    seenPackIds.add(pack.id);

    registry[pack.type] ??= {};
    for (const entry of pack.entries) {
      if (registry[pack.type][entry.name]) {
        errors.push(`type「${pack.type}」下的「${entry.name}」在多個pack中重複定義(pack: ${pack.id})`);
        continue;
      }
      registry[pack.type][entry.name] = { ...entry, __sourcePack: pack.id };
    }
  }

  return { registry, errors };
}

/**
 * 把一個資源條目的某個等級，拿去跟模板比對，回傳差異清單(不是硬性擋下，是稽核用)。
 * 這是使用者要的「嚴格分級對應規則」的稽核工具：舊型錄條目常常沒跟上模板，
 * 需要人工/AI決定要不要依模板「正規化」這條資料，而不是自動覆蓋。
 * @param {string} resourceType 例如 "血統"
 * @param {string} rank 例如 "D"
 * @param {{ price?: number, attributePoints?: number, traits?: number }} declared 條目自己宣稱的數值
 */
export function auditAgainstTemplate(resourceType, rank, declared) {
  const template = getTemplate(resourceType); // 未模板化的type會直接throw，呼叫端應先try/catch
  const discrepancies = [];

  if (!template.price[rank]) {
    discrepancies.push(`模板沒有定義「${rank}」級`);
    return { matches: false, discrepancies };
  }

  if (declared.price != null && declared.price !== template.price[rank]) {
    discrepancies.push(
      `價格不符：條目寫${declared.price}，模板規定${rank}級應為${template.price[rank]}`
    );
  }
  if (
    template.attributePerRank &&
    declared.attributePoints != null &&
    declared.attributePoints !== template.attributePerRank[rank]
  ) {
    discrepancies.push(
      `屬性點數不符：條目寫${declared.attributePoints}，模板規定${rank}級應為${template.attributePerRank[rank]}`
    );
  }
  if (
    template.baseTraitsPerRank &&
    declared.traits != null &&
    declared.traits !== template.baseTraitsPerRank[rank]
  ) {
    discrepancies.push(
      `特性數不符：條目寫${declared.traits}，模板規定${rank}級應為${template.baseTraitsPerRank[rank]}`
    );
  }

  return { matches: discrepancies.length === 0, discrepancies };
}
