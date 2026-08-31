// [設計] 「誰是管理員」—— 只有一條規則，刻意寫得很短。
//
// 管理員 = 環境變數 ADMIN_DISCORD_IDS 白名單裡的 Discord 使用者。
// 沿用既有的 Discord OAuth（content/auth/sessionToken.js 的 getCurrentUser），
// 不另外發明第二套驗證：多一條驗證路徑就多一個要顧的攻擊面，而管理面板是
// 整個站上唯一能看到營運數字的地方，不值得為了方便多開一扇門。
//
// [為什麼不用「網址帶密鑰」] 那種做法的金鑰會出現在網址列、瀏覽器歷史紀錄、
// 以及任何一張截圖裡。管理面板是最容易被隨手截圖分享的頁面，正好是最不該把
// 憑證放進網址的地方。

import { getCurrentUser } from "./sessionToken.js";
import { DISCORD_SUB_PREFIX } from "./discordOAuth.js";

/** 有沒有設定白名單。沒設定時**沒有任何人**是管理員（不是「所有人都是」）。 */
export function isAdminConfigured(env = {}) {
  return typeof env.ADMIN_DISCORD_IDS === "string" && env.ADMIN_DISCORD_IDS.trim().length > 0;
}

/**
 * 解析白名單。接受兩種寫法：純 Discord 數字 id，或帶 `discord:` 前綴的 sub。
 * 兩種都收是因為使用者從 Discord 複製到的是純數字，而程式內部用的是帶前綴的 sub——
 * 只收一種的話，設錯的人會看到一個完全正常、但永遠回 404 的頁面，很難查。
 */
export function parseAdminIds(env = {}) {
  if (!isAdminConfigured(env)) return [];
  return env.ADMIN_DISCORD_IDS.split(/[,\s]+/u)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((id) => (id.startsWith(DISCORD_SUB_PREFIX) ? id : `${DISCORD_SUB_PREFIX}${id}`));
}

/**
 * 這個請求是不是管理員發的。
 * @returns {Promise<{isAdmin: boolean, user: object|null, reason: string|null}>}
 */
export async function resolveAdmin(request, env = {}) {
  if (!isAdminConfigured(env)) {
    return { isAdmin: false, user: null, reason: "not-configured" };
  }
  const user = await getCurrentUser(request, env);
  if (!user?.sub) return { isAdmin: false, user: null, reason: "not-logged-in" };
  const allowed = parseAdminIds(env);
  if (!allowed.includes(user.sub)) return { isAdmin: false, user, reason: "not-allowlisted" };
  return { isAdmin: true, user, reason: null };
}

/**
 * 非管理員一律回 404，不是 403。
 *
 * 403 等於告訴對方「這個網址是真的，只是你沒有權限」——那是一份免費的情報，
 * 會讓人知道值得繼續嘗試。404 讓管理面板對非管理員來說跟不存在的頁面沒有分別。
 */
export function adminNotFound() {
  return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
