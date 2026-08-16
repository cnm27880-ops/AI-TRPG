// [設計] 存檔的歸屬 —— 「這份存檔是誰的」以及「誰可以讀它」。
//
// 規則只有三條，刻意寫得很短，因為存取控制的規則一複雜就會有漏洞：
//
//   1. ownerId 為 null 的存檔是**匿名存檔**，任何知道 sessionId 的人都能讀。
//      這是為了讓沒登入也能玩（sessionId 本身就是一串 UUID，等於不公開的鑰匙）。
//   2. ownerId 有值的存檔**只有本人能讀**。
//   3. 匿名存檔可以被登入者「認領」一次，認領後就變成第 2 種，不能再被別人認領。
//
// 第 3 條是使用者選定的行為：登入時自動把手上那份存檔綁到帳號，
// 已經在玩的人不會覺得進度不見了。

/** 存檔ID索引在KV裡的key前綴：owner:<sub> -> [sessionId, ...] */
const OWNER_INDEX_PREFIX = "owner:";

/**
 * 這個使用者能不能讀這份存檔。
 * @param {object} session 存檔
 * @param {{sub: string}|null} user 目前登入的使用者，沒登入是 null
 */
export function canAccessSession(session, user) {
  if (!session) return false;
  if (!session.ownerId) return true; // 匿名存檔：知道ID就能讀
  return Boolean(user) && session.ownerId === user.sub;
}

/**
 * 認領一份匿名存檔。
 *
 * 只有「還沒有主人」的存檔可以被認領——已經有主人的存檔不會被搶走，
 * 否則任何人只要猜到（或看到）別人的 sessionId 就能把別人的進度佔為己有。
 *
 * @returns {{claimed: boolean, reason?: string}}
 */
export function claimSession(session, user) {
  if (!user?.sub) return { claimed: false, reason: "沒有登入，無法認領存檔" };
  if (!session) return { claimed: false, reason: "找不到這份存檔" };
  if (session.ownerId === user.sub) return { claimed: false, reason: "這份存檔已經是你的了" };
  if (session.ownerId) return { claimed: false, reason: "這份存檔已經屬於另一個帳號" };

  session.ownerId = user.sub;
  return { claimed: true };
}

/**
 * 把一份存檔登記進某個帳號的索引裡。
 *
 * 為什麼要另外維護索引，而不是掃過所有存檔去比對 ownerId：
 * KV 的 list 只能依 key 前綴列出來，沒辦法依值的欄位查詢；存檔一多就得整批讀回來比對，
 * 那是會隨玩家數線性變慢的做法。多寫一筆索引換取「登入後立刻列出我的存檔」是划算的。
 */
export async function indexSessionForOwner(store, ownerId, sessionId) {
  if (!ownerId || !store?.getRaw) return;
  const key = OWNER_INDEX_PREFIX + ownerId;
  const existing = (await store.getRaw(key)) ?? [];
  if (existing.includes(sessionId)) return;
  existing.push(sessionId);
  await store.putRaw(key, existing);
}

/** 列出某個帳號名下的所有存檔ID。 */
export async function listSessionsForOwner(store, ownerId) {
  if (!ownerId || !store?.getRaw) return [];
  return (await store.getRaw(OWNER_INDEX_PREFIX + ownerId)) ?? [];
}

/** 從索引裡移掉一份存檔（刪存檔時用）。 */
export async function unindexSessionForOwner(store, ownerId, sessionId) {
  if (!ownerId || !store?.getRaw) return;
  const key = OWNER_INDEX_PREFIX + ownerId;
  const existing = (await store.getRaw(key)) ?? [];
  await store.putRaw(key, existing.filter((id) => id !== sessionId));
}
