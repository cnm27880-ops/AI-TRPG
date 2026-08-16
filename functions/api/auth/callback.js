// Cloudflare Pages Function —— Google 導回來的落地點。
// 路由：GET /api/auth/callback?code=...&state=...
//
// 驗 state（CSRF）→ 用 code + PKCE verifier 換 id_token → 驗 claims → 簽發我們自己的登入票。

import {
  exchangeCodeForTokens,
  verifyIdTokenClaims,
} from "../../../content/auth/googleOidc.js";
import {
  signSessionToken,
  buildCookie,
  buildClearCookie,
  readCookie,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  LOGIN_STATE_COOKIE,
} from "../../../content/auth/sessionToken.js";
import { resolveRedirectUri, authConfigError } from "../../../content/auth/config.js";

export async function onRequestGet(context) {
  const env = context.env ?? {};
  const configError = authConfigError(env);
  if (configError) return htmlError(configError, 503);

  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  // 玩家在Google的同意畫面按了「取消」就會走到這裡。這不是錯誤，是使用者的決定，
  // 所以不要顯示一個嚇人的錯誤頁，安靜地送他回遊戲就好。
  if (oauthError) {
    return redirectHome("/?login=cancelled", [buildClearCookie(LOGIN_STATE_COOKIE)]);
  }
  if (!code || !returnedState) {
    return htmlError("Google 的回應缺少必要參數（code 或 state）。請重新登入一次。", 400);
  }

  const stored = readLoginState(context.request);
  if (!stored) {
    return htmlError(
      "找不到登入流程的暫存資料。可能是登入頁面開太久（超過10分鐘）、或瀏覽器擋掉了 cookie。請重新登入一次。",
      400
    );
  }
  // 這一比對就是 CSRF 防線：攻擊者沒辦法讓你的瀏覽器帶著「他的」state cookie。
  if (stored.state !== returnedState) {
    console.warn("[AUTH_STATE_MISMATCH]", JSON.stringify({ where: "GET /api/auth/callback" }));
    return htmlError("登入驗證失敗（state 不符）。基於安全考量已中止這次登入，請重新登入一次。", 400);
  }

  let user;
  try {
    const { idToken } = await exchangeCodeForTokens({
      code,
      codeVerifier: stored.codeVerifier,
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: resolveRedirectUri(context.request, env),
    });
    user = verifyIdTokenClaims(idToken, { clientId: env.GOOGLE_CLIENT_ID });
  } catch (err) {
    // 詳細原因只進 log，不顯示給玩家——token endpoint 的回應可能含敏感內容。
    console.error("[AUTH_EXCHANGE_FAILED]", JSON.stringify({
      where: "GET /api/auth/callback",
      message: err?.message ?? String(err),
    }));
    return htmlError("跟 Google 交換登入憑證時失敗。請稍後再試一次。", 502);
  }

  const token = await signSessionToken(
    { sub: user.sub, email: user.email, name: user.name, picture: user.picture },
    env.AUTH_SESSION_SECRET
  );

  return redirectHome("/?login=ok", [
    buildCookie(SESSION_COOKIE, token, SESSION_TTL_SECONDS),
    buildClearCookie(LOGIN_STATE_COOKIE),
  ]);
}

function readLoginState(request) {
  const raw = readCookie(request.headers.get("cookie"), LOGIN_STATE_COOKIE);
  if (!raw) return null;
  try {
    const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded));
    if (!parsed?.state || !parsed?.codeVerifier) return null;
    return parsed;
  } catch {
    return null;
  }
}

function redirectHome(location, cookies) {
  const headers = new Headers({ location });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
}

function htmlError(message, status) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem;line-height:1.7">` +
      `<h2>登入失敗</h2><p>${escapeHtml(message)}</p><p><a href="/">回到遊戲</a></p></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
