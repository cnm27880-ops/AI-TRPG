// Cloudflare Pages Function —— 角色日誌回顧。
// 路由：GET /api/journal?sessionId=xxx（可加 &limit=N 只要最近 N 筆）
//
// 為什麼有這個端點（2026-08-20）：側欄早就有一個「日誌」分頁（public/index.html 的
// #journal-feed），資料層也早就寫好了（core/eventLog.js 的 summarizeForJournal()，
// 而且有測試），**但沒有任何人把兩邊接起來**——那個分頁從上線到現在一直是一片空白，
// 連「目前沒有紀錄」都不寫。這是這個專案反覆出現的同一種洞：引擎做得到，沒有人問它。
//
// 摘要一律由 core/eventLog.js 產生，這個檔案不自己組任何字串：日誌上的文字跟餵給AI的
// 事實記憶（functions/api/turn.js 用的是同一個函式）必須是同一份，否則玩家看到的
// 跟說書人記得的會慢慢對不起來。

import { resolveSessionStore } from "../../content/storage/sessionStore.js";
import { summarizeForJournal } from "../../core/eventLog.js";
import { getCurrentUser } from "../../content/auth/sessionToken.js";
import { canAccessSession } from "../../content/auth/ownership.js";

/** 一次最多回幾筆。日誌是只增不減的，長局的存檔可以累積上千筆。 */
const DEFAULT_LIMIT = 200;

export async function onRequestGet(context) {
  const store = resolveSessionStore(context.env ?? {});
  const url = new URL(context.request.url);
  const id = url.searchParams.get("sessionId") ?? url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "必須指定 sessionId" }, 400);

  const session = await store.get(id);
  if (!session) return json({ ok: false, error: `找不到存檔 ${id}` }, 404);
  // 跟其他端點一樣刻意回 404 而不是 403：回 403 等於確認了這個ID真的存在。
  if (!canAccessSession(session, await getCurrentUser(context.request, context.env ?? {}))) {
    return json({ ok: false, error: `找不到存檔 ${id}` }, 404);
  }

  const requested = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : DEFAULT_LIMIT;

  const all = summarizeForJournal(session.log ?? { events: [] });
  // 回最近的 limit 筆，順序維持由舊到新（畫面是時間軸，倒著印會很難讀）。
  const entries = all.slice(-limit);

  return json({
    ok: true,
    persistent: store.persistent,
    total: all.length,
    entries,
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
