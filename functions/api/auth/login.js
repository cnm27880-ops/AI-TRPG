// Cloudflare Pages Function —— 開始 Google 登入。
// 路由：GET /api/auth/login
//
// 做三件事：產生 state 與 PKCE verifier、把它們放進一個短命的 HttpOnly cookie、
// 然後把瀏覽器導去 Google。回來的處理在 callback.js。

import {
  randomToken,
  deriveCodeChallenge,
  buildAuthorizeUrl,
} from "../../../content/auth/googleOidc.js";
import {
  buildCookie,
  LOGIN_STATE_COOKIE,
  LOGIN_STATE_TTL_SECONDS,
} from "../../../content/auth/sessionToken.js";
import { resolveRedirectUri, authConfigError } from "../../../content/auth/config.js";

export async function onRequestGet(context) {
  const env = context.env ?? {};
  const configError = authConfigError(env);
  if (configError) return htmlError(configError, 503);

  const state = randomToken();
  const codeVerifier = randomToken();
  const codeChallenge = await deriveCodeChallenge(codeVerifier);

  // state 與 verifier 一起放在同一個 cookie 裡。放 cookie 而不是 KV 的理由跟
  // sessionToken.js 一樣：KV 是選配的，登入流程不該因為沒設 KV 就壞掉。
  // 這個 cookie 只活10分鐘，而且 callback 用完就清掉。
  const stateCookie = buildCookie(
    LOGIN_STATE_COOKIE,
    btoa(JSON.stringify({ state, codeVerifier })).replace(/=+$/, ""),
    LOGIN_STATE_TTL_SECONDS
  );

  const authorizeUrl = buildAuthorizeUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: resolveRedirectUri(context.request, env),
    state,
    codeChallenge,
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
