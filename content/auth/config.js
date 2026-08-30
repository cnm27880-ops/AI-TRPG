// [設計] Discord 登入的設定判斷 —— 「這個部署到底有沒有把登入設好」。
//
// 放在 content/ 而不是 functions/api/auth/：Cloudflare Pages 會把 functions/ 底下的
// **每一個檔案**當成一條路由，共用模組放在那裡會多開一個沒有意義的網址。
// functions/ 只放端點，可重用的邏輯一律放 content/（跟這個專案其他部分的分層一致）。

/** 登入需要的三個環境變數，缺一不可。 */
const REQUIRED_VARS = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "AUTH_SESSION_SECRET"];

/** 這個部署有沒有把 Discord 登入設定完整。 */
export function isDiscordAuthConfigured(env = {}) {
  return REQUIRED_VARS.every((name) => Boolean(env[name]));
}

/**
 * 設定不完整時回一段「講得出缺什麼、以及怎麼補」的訊息；設定好了就回 null。
 *
 * 刻意把缺少的變數名字列出來：這種設定問題最常見的情況是「三個設了兩個」，
 * 只說一句「登入未設定」會讓人重頭檢查一遍。
 */
export function discordAuthConfigError(env = {}) {
  const missing = REQUIRED_VARS.filter((name) => !env[name]);
  if (missing.length === 0) return null;
  return (
    `這個部署還沒有設定好 Discord 登入，缺少：${missing.join("、")}。` +
    `設定方式見 DEPLOYMENT.md 的「Discord 登入」一節` +
    `（DISCORD_CLIENT_ID 與 DISCORD_CLIENT_SECRET 來自 Discord Developer Portal 的 OAuth2 應用，` +
    `AUTH_SESSION_SECRET 是你自己產生的一段隨機字串）。`
  );
}

/**
 * 決定要送給 Discord 的 redirect_uri。
 *
 * 這個值**必須跟 Discord Developer Portal 裡登記的完全一致**，差一個斜線、
 * 差 http/https 都會被 Discord 直接拒絕（錯誤訊息是「無效的 OAuth2 redirect_uri」，
 * 不會告訴你差在哪裡）。
 *
 * 預設從這次請求的網址推導，好處是 preview 部署（每次一個新網域）不用一直改設定；
 * 但 Discord 的白名單不吃萬用字元，所以**正式環境請明確設定 DISCORD_AUTH_REDIRECT_URI**，
 * 讓它不受任何反向代理改寫 Host 標頭的影響。
 */
export function resolveDiscordRedirectUri(request, env = {}) {
  if (env.DISCORD_AUTH_REDIRECT_URI) return env.DISCORD_AUTH_REDIRECT_URI;
  return new URL("/api/auth/discord-callback", new URL(request.url).origin).toString();
}
