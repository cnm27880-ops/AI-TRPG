// Cloudflare Pages Function —— Discord 導回來的落地點。
// 路由：GET /api/auth/discord-callback?code=...&state=...
//
// 驗 state（CSRF）→ 用 code + PKCE verifier 換 access_token → 呼叫 /users/@me
// 拿使用者資料 → 簽發我們自己的登入票。結構跟 callback.js（Google）對應，
// 差異只在 Discord 沒有 id_token 可以驗 claims，換成多打一支 API（見
// content/auth/discordOAuth.js 檔頭說明）。

import {
  exchangeCodeForTokens,
  fetchDiscordUser,
} from "../../../content/auth/discordOAuth.js";
import {
  signSessionToken,
  buildCookie,
  buildClearCookie,
  readCookie,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  LOGIN_STATE_COOKIE,
} from "../../../content/auth/sessionToken.js";
import { resolveDiscordRedirectUri, discordAuthConfigError } from "../../../content/auth/config.js";

export async function onRequestGet(context) {
  const env = context.env ?? {};
  const configError = discordAuthConfigError(env);
  if (configError) return htmlError(configError, 503);

  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  // prompt=none 在「玩家沒登入 Discord」或「還沒同意過這個應用」時，Discord 不會
  // 顯示同意畫面，直接帶著這兩種錯誤導回來——這不是玩家拒絕，是我們為了讓「已經
  // 登入過的人跳過同意畫面」這個體驗優化沒有命中。重新導去一次不省略同意畫面的
  // 登入，玩家看到的畫面就跟從來沒有 prompt=none 時一樣，只是多轉一次。
  if (oauthError === "login_required" || oauthError === "consent_required") {
    return redirectTo("/api/auth/discord-login?prompt=consent", [buildClearCookie(LOGIN_STATE_COOKIE)]);
  }
  // 玩家在Discord的同意畫面按了「取消」（access_denied）就會走到這裡。這不是錯誤，
  // 是使用者的決定，所以不要顯示嚇人的錯誤頁，安靜地送他回遊戲就好。
  if (oauthError) {
    return redirectTo("/?login=cancelled", [buildClearCookie(LOGIN_STATE_COOKIE)]);
  }
  if (!code || !returnedState) {
    return htmlError("Discord 的回應缺少必要參數（code 或 state）。請重新登入一次。", 400);
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
    console.warn("[AUTH_STATE_MISMATCH]", JSON.stringify({ where: "GET /api/auth/discord-callback" }));
    return htmlError("登入驗證失敗（state 不符）。基於安全考量已中止這次登入，請重新登入一次。", 400);
  }

  let user;
  try {
    const { accessToken } = await exchangeCodeForTokens({
      code,
      codeVerifier: stored.codeVerifier,
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      redirectUri: resolveDiscordRedirectUri(context.request, env),
    });
    user = await fetchDiscordUser(accessToken);
  } catch (err) {
    // 詳細原因只進 log，不顯示給玩家——回應內容可能含敏感資訊。
    console.error("[AUTH_EXCHANGE_FAILED]", JSON.stringify({
      where: "GET /api/auth/discord-callback",
      message: err?.message ?? String(err),
    }));
    return htmlError("跟 Discord 交換登入憑證時失敗。請稍後再試一次。", 502);
  }

  const token = await signSessionToken(
    { sub: user.sub, email: user.email, name: user.name, picture: user.picture, provider: "discord" },
    env.AUTH_SESSION_SECRET
  );

  return redirectTo("/?login=ok", [
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

function redirectTo(location, cookies) {
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
