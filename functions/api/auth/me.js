// Cloudflare Pages Function —— 「我現在是誰」。
// 路由：GET /api/auth/me
//
// 沒登入時回 200 + {ok:true, user:null}，不是 401：對前端來說「訪客」是正常狀態之一，
// 不是錯誤。用 401 會讓前端每次載入都在 console 看到紅字。

import { getCurrentUser } from "../../../content/auth/sessionToken.js";
import { isAuthConfigured } from "../../../content/auth/config.js";

export async function onRequestGet(context) {
  const env = context.env ?? {};
  const user = await getCurrentUser(context.request, env);
  return new Response(
    JSON.stringify({
      ok: true,
      // 沒設定好Google登入時告訴前端，讓它直接把登入按鈕藏起來，
      // 而不是給玩家一顆按下去一定會失敗的按鈕。
      enabled: isAuthConfigured(env),
      user,
    }),
    { headers: { "content-type": "application/json; charset=utf-8" } }
  );
}
