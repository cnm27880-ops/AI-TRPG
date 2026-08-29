// Cloudflare Pages Function —— Combat V2：取得目前戰鬥狀態（規格第8.2節）。
// 路由：GET /api/combat/v2/state?sessionId=...&battleId=...
//
// 規格寫的是 GET /api/combat/:battleId。這裡改成固定路徑 + query 參數，能力完全等價
// （規格第8節開頭允許調整命名），理由是本專案有一條契約測試會把前端字面上打過的每一個
// /api 路徑對回 functions/ 底下的檔案（見 test/frontendRegressions.test.js）——
// 動態路徑段會讓那條測試從此永遠對不上，等於用一個真的會抓到問題的測試換一個路徑寫法。
//
// 這個端點是**斷線重連的權威來源**（規格第10節最後一列）：前端重整之後不重播任何本地
// 狀態，一律以這裡回的為準。

import { resolveSessionStore } from "../../../../content/storage/sessionStore.js";
import { battleResponse, json, loadOwnedSession } from "../../../../content/combat/v2/apiSupport.js";

export async function onRequestGet(context) {
  const store = resolveSessionStore(context.env ?? {});
  const url = new URL(context.request.url);
  const sessionId = url.searchParams.get("sessionId");
  const battleId = url.searchParams.get("battleId");

  const loaded = await loadOwnedSession(context, store, sessionId);
  if (!loaded.ok) return loaded.response;
  const battle = loaded.session.combatV2;

  if (!battle) {
    return json({ ok: false, code: "NO_BATTLE", error: "這場存檔目前沒有 Combat V2 戰鬥。" }, 404);
  }
  // battleId 是選填的核對用參數：帶了就要對得上，避免前端把舊分頁的戰鬥狀態
  // 套到一場新的戰鬥上。
  if (battleId && battle.battleId !== battleId) {
    return json({ ok: false, code: "BATTLE_MISMATCH", error: "這個 battleId 不是目前進行中的戰鬥。", battle: undefined }, 409);
  }

  return json(battleResponse(battle, { persistent: store.persistent, character: loaded.session.character }));
}
