// Cloudflare Pages Function —— 給 Discord bot 查詢玩家「輪迴者檔案」用。
// 路由：GET /api/bot/status?discordId=xxx
//
// 這不是玩家會直接打的端點——呼叫端是 bot 進程本身（伺服器對伺服器），驗證方式見
// content/discord/botAuth.js。玩家要不要讓自己的角色資料能被 bot 查到，取決於他
// 有沒有用 Discord 帳號登入過這個網站（見 functions/api/auth/discord-callback.js）：
// 沒登入過的 Discord 使用者，這裡一律回 linked:false，不會去猜或用其他方式找存檔。

import { resolveSessionStore } from "../../../content/storage/sessionStore.js";
import { listSessionsForOwner } from "../../../content/auth/ownership.js";
import { isRetiredScenarioId } from "../../../content/scenario/registry.js";
import { isBotApiConfigured, verifyBotSecret } from "../../../content/discord/botAuth.js";
import { buildDiscordStatusView } from "../../../content/discord/statusView.js";

const DISCORD_SUB_PREFIX = "discord:";

export async function onRequestGet(context) {
  const env = context.env ?? {};
  if (!isBotApiConfigured(env)) {
    return json({ ok: false, error: "這個部署還沒有設定 BOT_API_SECRET，/api/bot/* 端點目前關閉。" }, 503);
  }
  if (!verifyBotSecret(context.request.headers.get("x-bot-secret"), env)) {
    return json({ ok: false, error: "未授權" }, 401);
  }

  const discordId = new URL(context.request.url).searchParams.get("discordId");
  if (!discordId) return json({ ok: false, error: "必須指定 discordId" }, 400);

  const store = resolveSessionStore(env);
  const ownerId = `${DISCORD_SUB_PREFIX}${discordId}`;
  const ids = await listSessionsForOwner(store, ownerId);
  if (!ids.length) return json({ ok: true, linked: false });

  // 索引依認領順序 push，最新的排最後面（跟 functions/api/session.js 的
  // summarizeSessions() 同一個排序方式）；已退役副本的舊存檔跳過，找下一份。
  for (const id of [...ids].reverse()) {
    const session = await store.get(id);
    if (!session) continue;
    if (isRetiredScenarioId(session.scenario?.packId)) continue;
    return json({ ok: true, linked: true, status: buildDiscordStatusView(session) });
  }
  return json({ ok: true, linked: false });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
