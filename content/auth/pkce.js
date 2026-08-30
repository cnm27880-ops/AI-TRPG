// [設計] OAuth 2.1 Authorization Code Flow + PKCE 用的密碼學小工具——state、
// code_verifier/code_challenge、base64url 編解碼。這些跟「Discord」或任何特定
// 供應商都無關，是 Authorization Code Flow 本身的標準機制，所以獨立成一個檔案，
// 讓 content/auth/discordOAuth.js 與 content/auth/sessionToken.js 共用同一份，
// 不需要各自重寫一次一樣的密碼學邏輯。
//
// [安全設計說明]
//   1. state —— 防 CSRF。攻擊者可以誘導你的瀏覽器帶著「他的」授權碼回到 callback，
//      讓你在不知情的狀況下登入他的帳號（session fixation）。state 是我們自己產生、
//      放在 HttpOnly cookie 裡的一次性亂數，回來時必須一致。
//   2. PKCE(code_verifier / code_challenge) —— 防授權碼被攔截後盜用。
//      即使有人拿到 redirect 回來的 code，沒有 verifier 也換不到 token。

/**
 * 產生一段密碼學安全的隨機字串，當作 state 或 PKCE 的 code_verifier。
 * 用 base64url 是因為這兩個值都要放進 URL 查詢字串。
 */
export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** PKCE 的 S256 challenge = base64url(sha256(verifier))。 */
export async function deriveCodeChallenge(codeVerifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// base64url 工具（Workers 與 Node 都有 atob/btoa，但它們只吃標準base64）
// ---------------------------------------------------------------------------

export function base64UrlEncode(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
