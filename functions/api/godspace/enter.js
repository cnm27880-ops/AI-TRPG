// 路由：POST /api/godspace/enter { sessionId, source? }（合法返回主神空間）
//
// [2026-08-27 修正] 前端的「返回主神空間」一直是打 POST /api/godspace/enter
// （見 public/app.js 的 enterGodspaceFromSettlement），但整個 functions/ 底下
// 只有 functions/api/godspace.js，而 Cloudflare Pages Functions 是**檔案路徑即路由**：
// 那個檔案只接得到 /api/godspace，接不到 /api/godspace/enter。
// 於是這個請求在正式部署上不會進到任何 function，會落到靜態資源那一層拿回 index.html，
// 前端的 response.json() 直接丟解析錯誤——玩家看到的是
// 「不能返回主神空間：Unexpected token '<'」，副本結算之後就卡在結算頁出不來。
//
// 測試沒抓到是因為 test/godspace.test.js 是直接 import handler 再自己組一個
// https://test.local/api/godspace/enter 的 Request 丟進去，繞過了路由這一層。
// test/routing.test.js 現在會檢查「前端打的每一個 /api 路徑都有對應的 function 檔」。
//
// 這裡不重寫任何邏輯，只把既有的 handler 掛到正確的路徑上。
export { onRequestPost } from "../godspace.js";
