// [設計] 登入的設定判斷 —— 「這個部署到底有沒有把登入設好」。
//
// 放在 content/ 而不是 functions/api/auth/：Cloudflare Pages 會把 functions/ 底下的
// **每一個檔案**當成一條路由，共用模組放在那裡會多開一個沒有意義的網址。
// functions/ 只放端點，可重用的邏輯一律放 content/（跟這個專案其他部分的分層一致）。
//
// [2026-08-30 新增 Discord] 兩個登入來源各自要求各自的三個環境變數，但共用同一把
// AUTH_SESSION_SECRET——它只是拿來簽登入票的 HMAC 金鑰，跟「玩家是從哪個平台登入的」
// 無關，沒有理由為 Discord 再另外要求設一把。

/** Google 登入需要的三個環境變數，缺一不可。 */
const GOOGLE_REQUIRED_VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AUTH_SESSION_SECRET"];

/** Discord 登入需要的三個環境變數，缺一不可。 */
const DISCORD_REQUIRED_VARS = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "AUTH_SESSION_SECRET"];

/** 這個部署有沒有把 Google 登入設定完整。 */
export function isAuthConfigured(env = {}) {
  return GOOGLE_REQUIRED_VARS.every((name) => Boolean(env[name]));
}

/** 這個部署有沒有把 Discord 登入設定完整。 */
export function isDiscordAuthConfigured(env = {}) {
  return DISCORD_REQUIRED_VARS.every((name) => Boolean(env[name]));
}

/**
 * 設定不完整時回一段「講得出缺什麼、以及怎麼補」的訊息；設定好了就回 null。
 *
 * 刻意把缺少的變數名字列出來：這種設定問題最常見的情況是「三個設了兩個」，
 * 只說一句「登入未設定」會讓人重頭檢查一遍。
 */
export function authConfigError(env = {}) {
  const missing = GOOGLE_REQUIRED_VARS.filter((name) => !env[name]);
  if (missing.length === 0) return null;
  return (
    `這個部署還沒有設定好 Google 登入，缺少：${missing.join("、")}。` +
    `設定方式見 DEPLOYMENT.md 的「Google 登入」一節` +
    `（GOOGLE_CLIENT_ID 與 GOOGLE_CLIENT_SECRET 來自 Google Cloud Console 的 OAuth 用戶端，` +
    `AUTH_SESSION_SECRET 是你自己產生的一段隨機字串）。`
  );
}

/** 跟 authConfigError() 同樣的邏輯，換成 Discord 那三個環境變數。 */
export function discordAuthConfigError(env = {}) {
  const missing = DISCORD_REQUIRED_VARS.filter((name) => !env[name]);
  if (missing.length === 0) return null;
  return (
    `這個部署還沒有設定好 Discord 登入，缺少：${missing.join("、")}。` +
    `設定方式見 DEPLOYMENT.md 的「Discord 登入」一節` +
    `（DISCORD_CLIENT_ID 與 DISCORD_CLIENT_SECRET 來自 Discord Developer Portal 的 OAuth2 應用，` +
    `AUTH_SESSION_SECRET 跟 Google 登入共用同一把，已經設定過 Google 登入的部署不用另外設定）。`
  );
}

/**
 * 決定要送給登入提供者的 redirect_uri。
 *
 * 這個值**必須跟該平台後台登記的完全一致**，差一個斜線、差 http/https、差 www
 * 都會被直接拒絕（而且錯誤訊息通常不容易看懂）。
 *
 * 預設從這次請求的網址推導，好處是 preview 部署（每次一個新網域）不用一直改設定；
 * 但白名單通常不吃萬用字元，所以**正式環境請明確設定對應的 env override**，
 * 讓它不受任何反向代理改寫 Host 標頭的影響。
 *
 * @param {object} [opts]
 * @param {string} [opts.path] callback 路徑，預設是 Google 那條（相容舊呼叫端）。
 * @param {string} [opts.overrideEnvVar] 明確指定 redirect_uri 的環境變數名稱。
 */
export function resolveRedirectUri(
  request,
  env = {},
  { path = "/api/auth/callback", overrideEnvVar = "AUTH_REDIRECT_URI" } = {}
) {
  if (env[overrideEnvVar]) return env[overrideEnvVar];
  return new URL(path, new URL(request.url).origin).toString();
}

/** resolveRedirectUri() 的 Discord 版本：預設 callback 路徑與 env override 都換成 Discord 專用的。 */
export function resolveDiscordRedirectUri(request, env = {}) {
  return resolveRedirectUri(request, env, {
    path: "/api/auth/discord-callback",
    overrideEnvVar: "DISCORD_AUTH_REDIRECT_URI",
  });
}
