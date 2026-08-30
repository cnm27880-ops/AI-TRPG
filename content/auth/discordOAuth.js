// [設計] Discord 登入（OAuth2）—— 跟 googleOidc.js 同一種純邏輯層，不含任何框架、不裝任何 SDK。
// 理由跟那份檔案的檔頭一樣：Cloudflare Pages Functions 跑的是 Workers runtime，
// 保證有 fetch 與 Web Crypto，不保證能跑 Node 專用套件；自己串可以讓整條路徑用
// 依賴注入（塞假的 fetchFn）離線測試。
//
// ============================================================================
// [跟 Google 那份的關鍵差異 —— 這裡才是真正需要讀的部分]
//
// Discord 的 OAuth2 **不是** OpenID Connect：它不支援 `openid` scope，
// 換回來的只有一個不透明的 access_token，沒有可以驗 claims 的 id_token(JWT)。
// 所以這裡的流程比 Google 那份多一步：換到 access_token 之後，還要再用它
// 呼叫 Discord 的 /users/@me 拿使用者資料。信任基礎跟 googleOidc.js 檔頭說的
// 「伺服器端直接跟供應商換」是同一種——這支 fetch 是我們的伺服器直接對 Discord API
// 發出、TLS 保護、剛換到的 access_token 只可能是這次授權碼換來的，不需要額外簽章驗證。
//
// state（CSRF）與 PKCE(S256) 兩條防線跟 Google 一樣重要，也是同一組實作——
// 直接從 googleOidc.js 匯入，不重寫一份一樣的密碼學工具。
//
// [prompt=none 的取捨] Discord 支援用 prompt=none 讓「已登入 Discord 且先前同意過
// 這個應用」的玩家跳過同意畫面。但玩家如果沒登入 Discord、或是第一次授權，
// Discord 不會顯示同意畫面，而是直接把 error=login_required / consent_required
// 導回 callback——如果我們對所有人都無條件用 prompt=none，第一次登入的人會
// 永遠卡在「登入失敗」，永遠看不到同意畫面。所以 buildAuthorizeUrl() 讓呼叫端
// 決定要不要帶 prompt=none，discord-callback.js 偵測到這兩種錯誤時會自動重新
// 導向一次不帶 prompt=none 的登入，讓玩家看到正常的同意畫面。
// ============================================================================

import { randomToken, deriveCodeChallenge } from "./googleOidc.js";

export { randomToken, deriveCodeChallenge };

const DISCORD_AUTHORIZE_ENDPOINT = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN_ENDPOINT = "https://discord.com/api/oauth2/token";
const DISCORD_USER_ENDPOINT = "https://discord.com/api/users/@me";

/**
 * 組出要把使用者導去的 Discord 授權網址。
 *
 * @param {object} params
 * @param {string} params.clientId Discord Developer Portal 建立的應用 Client ID
 * @param {string} params.redirectUri 必須跟後台登記的完全一致
 * @param {string} params.state 一次性亂數，callback 時要比對（CSRF防線）
 * @param {string} params.codeChallenge deriveCodeChallenge() 的結果（PKCE防線）
 * @param {boolean} [params.skipConsentPrompt] true 時帶 prompt=none（見檔頭說明的取捨）
 */
export function buildAuthorizeUrl({ clientId, redirectUri, state, codeChallenge, skipConsentPrompt = false }) {
  if (!clientId) throw new Error("buildAuthorizeUrl需要clientId（環境變數 DISCORD_CLIENT_ID）");
  if (!redirectUri) throw new Error("buildAuthorizeUrl需要redirectUri");
  if (!state) throw new Error("buildAuthorizeUrl需要state（CSRF防線，不可省略）");
  if (!codeChallenge) throw new Error("buildAuthorizeUrl需要codeChallenge（PKCE防線，不可省略）");

  const url = new URL(DISCORD_AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  // identify 拿得到 id/username/avatar，email 拿得到信箱——這個遊戲只需要知道
  // 「你是誰」，不多要 guilds/bot 之類的權限，避免玩家在同意畫面上卻步。
  url.searchParams.set("scope", "identify email");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (skipConsentPrompt) url.searchParams.set("prompt", "none");
  return url.toString();
}

/**
 * 拿授權碼去跟 Discord 換 access_token。
 * @returns {Promise<{accessToken: string, raw: object}>}
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

  const response = await fetchFn(DISCORD_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await safeReadText(response);
    // 錯誤訊息只記進log給開發者看，不原樣顯示給玩家（回應可能含敏感內容）。
    throw new Error(`Discord token endpoint 回傳錯誤(HTTP ${response.status})：${text}`);
  }

  const raw = await response.json();
  if (typeof raw?.access_token !== "string") {
    throw new Error(`Discord 沒有回傳 access_token，回應內容：${JSON.stringify(raw)}`);
  }
  return { accessToken: raw.access_token, raw };
}

/**
 * 拿 access_token 去跟 Discord 的 /users/@me 換使用者資料，並整理成跟
 * googleOidc.verifyIdTokenClaims() 一樣的形狀（sub/email/name/picture），
 * 讓上層（callback、sessionToken）不用分辨這個使用者是從哪個 provider 來的。
 *
 * @returns {Promise<{sub: string, email: string|null, emailVerified: boolean, name: string|null, picture: string|null, provider: "discord"}>}
 */
export async function fetchDiscordUser(accessToken, { fetchFn = fetch } = {}) {
  const response = await fetchFn(DISCORD_USER_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await safeReadText(response);
    throw new Error(`Discord user endpoint 回傳錯誤(HTTP ${response.status})：${text}`);
  }
  const raw = await response.json();
  if (!raw?.id) throw new Error(`Discord 使用者資料缺少 id，回應內容：${JSON.stringify(raw)}`);
  return normalizeDiscordUser(raw);
}

/**
 * sub 刻意加上 "discord:" 前綴——Discord 的使用者 id 跟 Google 的 sub 都是純數字
 * 字串，直接混用有極小機率撞在一起，兩個不同 provider 的人就會共用同一份存檔。
 * 前綴讓兩個 provider 的命名空間永遠不會重疊，Google 那邊完全不用改。
 */
export function normalizeDiscordUser(raw) {
  return {
    sub: `discord:${raw.id}`,
    email: raw.email ?? null,
    emailVerified: raw.verified === true,
    name: raw.global_name || raw.username || null,
    picture: discordAvatarUrl(raw),
    provider: "discord",
  };
}

/** Discord 大頭貼網址；沒設自訂頭像的人退回官方預設頭像。 */
export function discordAvatarUrl(user) {
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
  }
  // 舊帳號有 discriminator 时用 discriminator % 5；新版使用者名稱系統沒有這個欄位
  // (discriminator === "0")，改用 Discord 文件給的公式 (user_id >> 22) % 6。
  const index =
    user.discriminator && user.discriminator !== "0"
      ? Number(user.discriminator) % 5
      : Number((BigInt(user.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "(無法讀取錯誤內容)";
  }
}
