// [設計] Google 登入（OpenID Connect）—— 純邏輯層，不含任何框架、不裝任何 SDK。
//
// 為什麼自己實作而不是用 Auth0/Clerk/Supabase：跟 content/llm/client.js 同一個理由——
// Cloudflare Pages Functions 跑的是 Workers runtime，不保證能跑 Node 專用套件，
// 但保證有 fetch 與 Web Crypto。OIDC 的授權碼流程本身並不複雜，自己串可以讓
// 這一整條路徑都能用依賴注入（塞假的 fetchFn）離線測試，跟這個repo一路的做法一致，
// 也不會多一個「哪天改計價或關服就得整個重做」的外部依賴。
//
// ============================================================================
// [安全設計說明 —— 這一段請在改動前先讀完]
//
// 採用的是 **Authorization Code Flow + PKCE**，這是目前 OAuth 2.1 / OIDC 對
// 網頁應用的建議做法。三個關鍵防線，每一條都對應一種真實的攻擊：
//
//   1. state —— 防 CSRF。攻擊者可以誘導你的瀏覽器帶著「他的」授權碼回到 callback，
//      讓你在不知情的狀況下登入他的帳號（session fixation）。state 是我們自己產生、
//      放在 HttpOnly cookie 裡的一次性亂數，回來時必須一致。
//   2. PKCE(code_verifier / code_challenge) —— 防授權碼被攔截後盜用。
//      即使有人拿到 redirect 回來的 code，沒有 verifier 也換不到 token。
//   3. id_token 的 claims 檢查 —— 防「拿別的應用程式的token來冒充」。
//      aud 必須是我們自己的 client_id、iss 必須是 Google、exp 不能過期。
//
// [關於 id_token 的簽章驗證 —— 這裡刻意不做，理由寫清楚]
// 我們是在**伺服器端**直接向 Google 的 token endpoint 用 HTTPS 換取 id_token
// （不是從瀏覽器的 URL fragment 拿的）。OIDC Core 3.1.3.7 與 Google 官方文件都明確說明：
// 這種情況下 token 來自 TLS 保護的、與 Google 直接建立的連線，
// **不需要再在本地驗證 RS256 簽章**。所以這裡只驗 claims，不抓 JWKS。
//
// 這個結論**只在「伺服器端直接換取」這個前提下成立**。如果之後有人把流程改成
// 前端拿 token 再送給後端（implicit flow 或 Google Identity Services 的
// credential 回傳），那個前提就消失了，**必須補上 JWKS 簽章驗證**，
// 否則任何人都能自己造一個 id_token 冒充任意使用者。
// ============================================================================

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Google 簽發的 id_token 允許的 iss（兩種寫法官方都會出現）。 */
const VALID_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/** id_token 的 exp 容許的時鐘誤差（秒）。伺服器之間差幾秒是正常的。 */
const CLOCK_SKEW_SECONDS = 60;

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

/**
 * 組出要把使用者導去的 Google 授權網址。
 *
 * @param {object} params
 * @param {string} params.clientId Google Cloud Console 建立的 OAuth 用戶端 ID
 * @param {string} params.redirectUri 必須跟 Console 裡登記的完全一致，差一個斜線都會被拒絕
 * @param {string} params.state 一次性亂數，callback 時要比對
 * @param {string} params.codeChallenge deriveCodeChallenge() 的結果
 */
export function buildAuthorizeUrl({ clientId, redirectUri, state, codeChallenge }) {
  if (!clientId) throw new Error("buildAuthorizeUrl需要clientId（環境變數 GOOGLE_CLIENT_ID）");
  if (!redirectUri) throw new Error("buildAuthorizeUrl需要redirectUri");
  if (!state) throw new Error("buildAuthorizeUrl需要state（CSRF防線，不可省略）");
  if (!codeChallenge) throw new Error("buildAuthorizeUrl需要codeChallenge（PKCE防線，不可省略）");

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  // openid 是 OIDC 必要的；email/profile 是為了拿到顯示名稱與頭像。
  // 刻意**不要**多要任何其他權限——這個遊戲只需要知道「你是誰」，
  // 不需要讀你的信箱或雲端硬碟，多要權限只會讓玩家在同意畫面上卻步。
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * 拿授權碼去跟 Google 換 token。
 *
 * @returns {Promise<{idToken: string, raw: object}>}
 */
export async function exchangeCodeForTokens({
  code,
  codeVerifier,
  clientId,
  clientSecret,
  redirectUri,
  fetchFn = fetch,
}) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const response = await fetchFn(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await safeReadText(response);
    // 這裡的錯誤訊息會被記進log給開發者看，不會原樣顯示給玩家
    // （token endpoint 的回應可能含有敏感內容）。
    throw new Error(`Google token endpoint 回傳錯誤(HTTP ${response.status})：${text}`);
  }

  const raw = await response.json();
  if (typeof raw?.id_token !== "string") {
    throw new Error(`Google 沒有回傳 id_token，回應內容：${JSON.stringify(raw)}`);
  }
  return { idToken: raw.id_token, raw };
}

/**
 * 解出 id_token 的 payload 並驗證 claims。
 *
 * **不驗簽章**——理由見檔頭的安全設計說明（token 是伺服器端直接跟 Google 拿的）。
 * 但 claims 一定要驗：aud 擋掉「拿別的應用的token來用」，
 * iss 擋掉「偽造成 Google 的簽發者」，exp 擋掉過期的 token 被重放。
 *
 * @returns {{sub: string, email: string|null, name: string|null, picture: string|null}}
 */
export function verifyIdTokenClaims(idToken, { clientId, now = Date.now() } = {}) {
  const payload = decodeJwtPayload(idToken);

  if (!VALID_ISSUERS.has(payload.iss)) {
    throw new Error(`id_token 的簽發者不是Google（iss=${payload.iss}）`);
  }
  if (payload.aud !== clientId) {
    // 這條最重要：沒有它的話，任何人都可以拿他自己應用程式的Google token登入這裡。
    throw new Error("id_token 不是簽發給這個應用程式的（aud 不符）");
  }
  const nowSeconds = Math.floor(now / 1000);
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
    throw new Error("id_token 已過期");
  }
  if (!payload.sub) {
    throw new Error("id_token 缺少 sub（使用者的唯一識別碼）");
  }

  return {
    // sub 是 Google 給這個使用者的永久唯一ID。**用它當主鍵，不要用 email**——
    // email 是可以更改的，改了之後如果拿 email 當主鍵，玩家的存檔就會全部找不到。
    sub: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified === true,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

/** 把 JWT 中間那段 base64url payload 解出來。不驗簽章（見上方說明）。 */
export function decodeJwtPayload(token) {
  if (typeof token !== "string") throw new Error("id_token 不是字串");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("id_token 格式不正確（不是三段式JWT）");
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    throw new Error("id_token 的 payload 不是合法JSON");
  }
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

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "(無法讀取錯誤內容)";
  }
}
