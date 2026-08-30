// [設計] 登入後的「你是誰」憑證 —— HMAC 簽章的 cookie，不是資料庫 session。
//
// 為什麼用簽章 cookie 而不是「把 session 存進 KV，cookie 只放一個亂數ID」：
//   這個專案的 KV binding **是選配的**（見 content/storage/sessionStore.js：沒有 KV 時
//   會退到記憶體版，而記憶體版在 Workers 上隨時會消失）。如果登入狀態依賴 KV，
//   那麼「沒設定 KV 的部署」會變成「登入之後隨時被登出」，而且原因極難查。
//   簽章 cookie 是自我驗證的，不需要任何儲存後端就能正確運作。
//
// 代價要誠實說清楚：簽章 cookie **沒辦法在過期前主動撤銷**。使用者按登出只是清掉
// 自己瀏覽器上的 cookie，那張票本身在到期前仍然有效。對一個單人遊戲來說這個取捨
// 可以接受（沒有「把某個使用者踢出去」的需求）。如果之後有了那種需求，
// 作法是加一個 KV 的撤銷清單，而不是把整套換掉。
//
// 用 Web Crypto 的 HMAC-SHA256：Workers 與現代 Node 都有 crypto.subtle，
// 不需要任何套件，測試也能直接跑。

import { base64UrlEncode, base64UrlDecode } from "./googleOidc.js";

/** 登入狀態的有效期。30天是「不要一直要求重新登入」與「票不要活太久」的折衷。 */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** cookie 名稱。前綴 __Host- 會讓瀏覽器強制要求 Secure + Path=/ 且不允許指定 Domain，
 *  等於由瀏覽器幫忙擋掉一整類「子網域寫入 cookie」的攻擊。 */
export const SESSION_COOKIE = "__Host-wxh_session";

/** 登入流程進行中的暫存 cookie（存 state 與 PKCE verifier），只需要活幾分鐘。 */
export const LOGIN_STATE_COOKIE = "__Host-wxh_login";
export const LOGIN_STATE_TTL_SECONDS = 10 * 60;

async function importKey(secret) {
  if (!secret) {
    throw new Error(
      "缺少 AUTH_SESSION_SECRET。請用 `npx wrangler pages secret put AUTH_SESSION_SECRET` 設定一段夠長的隨機字串" +
        "（例如 `openssl rand -base64 32` 的輸出）。沒有它就沒辦法安全地簽發登入憑證。"
    );
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * 簽發一張登入票。
 * @param {object} payload 要放進票裡的資料（會被任何人讀到，**不要放機密**）
 * @param {string} secret AUTH_SESSION_SECRET
 */
export async function signSessionToken(payload, secret, { now = Date.now() } = {}) {
  const body = { ...payload, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS };
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(body)));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  return `${encoded}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * 驗證一張登入票。任何一步不對就回 null —— 呼叫端一律當成「沒有登入」處理。
 *
 * 刻意不丟錯：cookie 壞掉、過期、被改過，對呼叫端來說都是同一件事（這個人沒登入），
 * 而且這是每個請求都會走的路徑，用例外控制流程會讓正常的「訪客」變成錯誤路徑。
 */
export async function verifySessionToken(token, secret, { now = Date.now() } = {}) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let key;
  try {
    key = await importKey(secret);
  } catch {
    return null; // 沒設 secret：一律視為未登入，不要讓整個網站爆掉
  }

  let valid;
  try {
    // crypto.subtle.verify 是常數時間比較，不會有時序側通道的問題
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(encoded)
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded)));
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp < Math.floor(now / 1000)) return null;
  return payload;
}

/**
 * 組一個 Set-Cookie 標頭值。
 *
 * HttpOnly：JavaScript 讀不到，就算頁面上有 XSS 也偷不走登入票。
 * SameSite=Lax：擋跨站請求自動帶上 cookie（CSRF），但保留「從外部連結點進來仍是登入狀態」。
 *   OAuth 的 callback 是 GET 導航，Lax 允許，所以登入流程不會被擋。
 * Secure + Path=/：__Host- 前綴的強制要求。
 */
export function buildCookie(name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join("; ");
}

/** 讓瀏覽器立刻丟掉某個 cookie。 */
export function buildClearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** 從 Cookie 標頭裡取出某一個值。 */
export function readCookie(cookieHeader, name) {
  if (typeof cookieHeader !== "string") return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

/**
 * 從請求裡讀出目前登入的使用者，沒登入就回 null。
 *
 * 拿不到 headers 時一律當成「未登入」而不是丟錯：這個函式在每一個端點的最前面都會被呼叫，
 * 讓它因為請求物件的形狀不如預期就把整個 API 打掛是不划算的。
 * 「讀不到 cookie」跟「沒有 cookie」對存取控制來說本來就是同一個結論——都不是登入狀態，
 * 所以這個寬容不會放行任何本來該擋的東西。
 */
export async function getCurrentUser(request, env) {
  const cookieHeader = typeof request?.headers?.get === "function" ? request.headers.get("cookie") : null;
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifySessionToken(token, env?.AUTH_SESSION_SECRET);
  if (!payload?.sub) return null;
  // provider 只有 Discord 的登入票會寫（見 functions/api/auth/discord-callback.js）；
  // Google 那條路徑一直沒有這個欄位，缺少時當成 "google" 而不是留空——
  // 這樣舊票（部署這個欄位之前簽出去的）跟新的 Google 票行為一致，不用強迫重新登入。
  const provider = payload.provider === "discord" ? "discord" : "google";
  return {
    sub: payload.sub,
    email: payload.email ?? null,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
    provider,
  };
}
