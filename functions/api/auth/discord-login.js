// Cloudflare Pages Function —— 開始 Discord 登入。
// 路由：GET /api/auth/discord-login
//
// 結構跟 login.js（Google）完全對應：產生 state 與 PKCE verifier、放進短命的
// HttpOnly cookie、把瀏覽器導去 Discord。回來的處理在 discord-callback.js。

import {
  randomToken,
  deriveCodeChallenge,
  buildAuthorizeUrl,
} from "../../../content/auth/discordOAuth.js";
import {
  buildCookie,
  LOGIN_STATE_COOKIE,
  LOGIN_STATE_TTL_SECONDS,
} from "../../../content/auth/sessionToken.js";
import { resolveDiscordRedirectUri, discordAuthConfigError } from "../../../content/auth/config.js";

export async function onRequestGet(context) {
  const env = context.env ?? {};
  const configError = discordAuthConfigError(env);
  if (configError) return htmlError(configError, 503);

  const url = new URL(context.request.url);
  // discord-callback.js 在 prompt=none 被 Discord 拒絕（login_required /
  // consent_required）時，會帶著 ?prompt=consent 導回這裡重試一次——這次不省略
  // 同意畫面，保證這一輪一定能拿到結果，不會無窮迴圈。
  const skipConsentPrompt = url.searchParams.get("prompt") !== "consent";

  const state = randomToken();
  const codeVerifier = randomToken();
  const codeChallenge = await deriveCodeChallenge(codeVerifier);

  // state 與 verifier 一起放在同一個 cookie 裡，理由跟 login.js 一樣：
  // KV 是選配的，登入流程不該因為沒設 KV 就壞掉。這個 cookie 只活10分鐘。
  const stateCookie = buildCookie(
    LOGIN_STATE_COOKIE,
    btoa(JSON.stringify({ state, codeVerifier })).replace(/=+$/, ""),
    LOGIN_STATE_TTL_SECONDS
  );

  const authorizeUrl = buildAuthorizeUrl({
    clientId: env.DISCORD_CLIENT_ID,
    redirectUri: resolveDiscordRedirectUri(context.request, env),
    state,
    codeChallenge,
    skipConsentPrompt,
  });

  return new Response(null, {
    status: 302,
    headers: { location: authorizeUrl, "set-cookie": stateCookie },
  });
}

function htmlError(message, status) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem;line-height:1.7">` +
      `<h2>無法開始登入</h2><p>${escapeHtml(message)}</p>` +
      `<p><a href="/">回到遊戲</a></p></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
