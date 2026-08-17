// [設計] 商店貨架註冊表 —— 執行期真的會被 functions/api/shop.js 讀到的那一份商品清單。
//
// 為什麼是 .js 而不是直接讀 content/packs/shop-starter-*.json：
// 這個專案有一條既有的政策（寫在 content/scenario/examples/echoInstitute.js 的檔頭）——
// **執行期會被 functions/ 匯入的資料一律是普通 JS 模組匯出物件**，因為 Cloudflare Workers
// 沒有檔案系統，而 `import x from "./x.json"` 在 Node 測試環境與 Workers 打包器兩邊的
// 支援狀況不一致。副本包(echoInstitute/alienNostromo)、佔位敵人、建卡原型全都遵守這條。
//
// 所以這裡沿用同一個做法：JSON 檔仍然是**轉換工作的產出格式與審閱對象**
// (CONVERSION_RULES.md 講的就是那些檔案)，而這個模組是它們的執行期副本。
//
// 兩份會不會走鐘？不會，`test/shopPacks.test.js` 有一則測試逐件比對 JSON 與這個模組，
// 對不上就紅。改商品時**改 JSON，然後同步這裡**，測試會抓住忘記同步的情況。

import { SHOP_STARTER_PACKS } from "../packs/shopStarterPacks.js";
import { buildServiceGoods } from "./pricing.js";

export const SHOP_PACKS = SHOP_STARTER_PACKS;

/** 所有商品攤平成一個陣列，順序＝包的順序。 */
export const SHOP_GOODS = SHOP_PACKS.flatMap((pack) => pack.entries);

/** 商品ID → 商品。 */
export const GOODS_BY_ID = Object.fromEntries(SHOP_GOODS.map((g) => [g.goodId, g]));

/**
 * 貨架上的全部東西 = 型錄轉換出來的商品 ＋ 公式定價的服務(療傷/洗點/精神時光屋)。
 * 服務類要傳角色卡進來，因為它們的價格是動態的(療傷價格取決於身上有幾點傷)——
 * 這正是它們跟靜態商品包的差別，見 content/shop/pricing.js 的 buildServiceGoods()。
 */
export function allGoods(character) {
  return [...SHOP_GOODS, ...(character ? buildServiceGoods(character) : [])];
}

export function getGood(goodId, character) {
  if (GOODS_BY_ID[goodId]) return GOODS_BY_ID[goodId];
  if (!character) return null;
  return buildServiceGoods(character).find((g) => g.goodId === goodId) ?? null;
}
