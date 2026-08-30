// Cloudflare Pages Function —— 「我現在是誰」。
// 路由：GET /api/auth/me
//
// 沒登入時回 200 + {ok:true, user:null}，不是 401：對前端來說「訪客」是正常狀態之一，
// 不是錯誤。用 401 會讓前端每次載入都在 console 看到紅字。

import { getCurrentUser } from "../../../content/auth/sessionToken.js";
import { isAuthConfigured, isDiscordAuthConfigured } from "../../../content/auth/config.js";

const DISCORD_SUB_PREFIX = "discord:";

export async function onRequestGet(context) {
  const env = context.env ?? {};
  const user = await getCurrentUser(context.request, env);
  const discordUserId = user?.provider === "discord" ? user.sub.slice(DISCORD_SUB_PREFIX.length) : null;

  return new Response(
    JSON.stringify({
      ok: true,
      // 沒設定好某個登入來源時告訴前端，讓它直接把對應的登入按鈕藏起來，
      // 而不是給玩家一顆按下去一定會失敗的按鈕。
      // enabled 保留給還在讀舊欄位名稱的前端版本，語意等於 googleEnabled。
      enabled: isAuthConfigured(env),
      googleEnabled: isAuthConfigured(env),
      discordEnabled: isDiscordAuthConfigured(env),
      user: user ? { ...user, discord_user_id: discordUserId } : null,
    }),
    { headers: { "content-type": "application/json; charset=utf-8" } }
  );
}
