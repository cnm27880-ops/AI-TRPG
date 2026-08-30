// [設計] Discord bot 打 /api/bot/* 這幾支端點時的身分驗證 —— 一把共用的靜態密鑰
// (BOT_API_SECRET)，不是 OAuth、也不是玩家的登入票。
//
// 為什麼不用 content/auth/sessionToken.js 那套：那套驗的是「這個瀏覽器是哪個玩家」，
// 靠的是使用者登入時的同意流程。Discord bot 是**伺服器對伺服器**的呼叫，沒有使用者
// 在場按下同意，也沒有瀏覽器能收 HttpOnly cookie——它需要的是「這支呼叫真的來自
// 我們自己的 bot 進程」，用一把只有 bot 與這個 Cloudflare Pages 部署知道的共用密鑰
// 最直接，做法上等同於一把長效 API key。
//
// 用常數時間比較而不是 `===`：密鑰外洩的代價很高（拿到它就能查任何玩家的角色資料），
// 值得比照 content/auth/sessionToken.js 用常數時間比較的謹慎程度，即使這裡不是
// HMAC 簽章、時序側通道能洩漏的資訊量遠比那裡小。

/** 這個部署有沒有設定 BOT_API_SECRET（沒設定就不能開放 /api/bot/* 這幾支端點）。 */
export function isBotApiConfigured(env = {}) {
  return Boolean(env.BOT_API_SECRET);
}

/**
 * 這支請求帶的密鑰對不對。沒設定 BOT_API_SECRET 時一律回 false——
 * 不能因為忘記設定就讓端點對任何人開放。
 */
export function verifyBotSecret(providedSecret, env = {}) {
  const expected = env.BOT_API_SECRET;
  if (!expected || typeof providedSecret !== "string") return false;
  return constantTimeEqual(providedSecret, expected);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
