// Cloudflare Pages Function —— 「我現在是誰」。
// 路由：GET /api/auth/me
//
// 沒登入時回 200 + {ok:true, user:null}，不是 401：對前端來說「訪客」是正常狀態之一，
// 不是錯誤。用 401 會讓前端每次載入都在 console 看到紅字。

import { getCurrentUser } from "../../../content/auth/sessionToken.js";
import { isDiscordAuthConfigured } from "../../../content/auth/config.js";
import { DISCORD_SUB_PREFIX } from "../../../content/auth/discordOAuth.js";

export async function onRequestGet(context) {
  const env = context.env ?? {};
  const user = await getCurrentUser(context.request, env);
  // 目前唯一的登入方式就是 Discord，sub 一律帶 DISCORD_SUB_PREFIX 前綴（見
  // content/auth/discordOAuth.js 的 normalizeDiscordUser()）；用前綴本身判斷，
  // 不需要另外存一個「provider」欄位去講一件只有一種可能的事。
  const discordUserId = user?.sub?.startsWith(DISCORD_SUB_PREFIX)
    ? user.sub.slice(DISCORD_SUB_PREFIX.length)
    : null;

  return new Response(
    JSON.stringify({
      ok: true,
      // 沒設定好 Discord 登入時告訴前端，讓它直接把登入按鈕藏起來，
      // 而不是給玩家一顆按下去一定會失敗的按鈕。
      discordEnabled: isDiscordAuthConfigured(env),
      user: user ? { ...user, discord_user_id: discordUserId } : null,
    }),
    { headers: { "content-type": "application/json; charset=utf-8" } }
  );
}
