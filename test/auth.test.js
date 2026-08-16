// Google 登入（OIDC）與存檔歸屬的測試。
//
// 這是整個專案裡唯一一段「寫錯會讓別人讀到你的東西」的程式碼，所以測試的重點
// 全部放在**攻擊情境**上，而不是「正常流程會動」：
//   - 別人的 id_token 拿來冒充（aud 不符）
//   - 偽造的簽發者（iss 不符）
//   - 過期 token 重放
//   - 竄改登入 cookie
//   - 拿到別人的 sessionId 就想讀他的存檔
//   - 搶奪別人已經認領過的存檔
import test from "node:test";
import assert from "node:assert/strict";
import {
  randomToken,
  deriveCodeChallenge,
  buildAuthorizeUrl,
  verifyIdTokenClaims,
  base64UrlEncode,
} from "../content/auth/googleOidc.js";
import {
  signSessionToken,
  verifySessionToken,
  readCookie,
  buildCookie,
  buildClearCookie,
  getCurrentUser,
  SESSION_COOKIE,
} from "../content/auth/sessionToken.js";
import {
  canAccessSession,
  claimSession,
  indexSessionForOwner,
  listSessionsForOwner,
  unindexSessionForOwner,
} from "../content/auth/ownership.js";
import { memorySessionStore, createSession } from "../content/storage/sessionStore.js";

const CLIENT_ID = "1234.apps.googleusercontent.com";
const SECRET = "測試用的-session-secret-夠長夠隨機";

/** 做一個假的 id_token（只組結構，不簽章——驗證端本來就不驗簽，見 googleOidc.js 檔頭）。 */
function fakeIdToken(payload) {
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  return `${header}.${body}.fake-signature`;
}

function validPayload(overrides = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "google-user-1",
    email: "player@example.com",
    email_verified: true,
    name: "測試玩家",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PKCE 與授權網址
// ---------------------------------------------------------------------------

test("randomToken：每次都不一樣，而且夠長（拿來當state/verifier要能抗猜測）", () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(randomToken());
  assert.equal(seen.size, 50, "產生的隨機值不可以重複");
  assert.ok(randomToken().length >= 40);
});

test("deriveCodeChallenge：同一個verifier固定得到同一個challenge，不同的則不同", async () => {
  const a = await deriveCodeChallenge("verifier-a");
  assert.equal(a, await deriveCodeChallenge("verifier-a"));
  assert.notEqual(a, await deriveCodeChallenge("verifier-b"));
  assert.ok(!/[+/=]/.test(a), "必須是 base64url（要放進網址）");
});

test("buildAuthorizeUrl：帶齊 PKCE 與 state，而且只要求最小權限", () => {
  const url = new URL(buildAuthorizeUrl({
    clientId: CLIENT_ID,
    redirectUri: "https://example.com/api/auth/callback",
    state: "s1",
    codeChallenge: "c1",
  }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "s1");
  // 只要 openid email profile —— 多要權限會讓玩家在同意畫面卻步，也違反最小權限原則
  assert.equal(url.searchParams.get("scope"), "openid email profile");
});

test("buildAuthorizeUrl：少了 state 或 codeChallenge 一律丟錯（這兩條是安全防線，不可省略）", () => {
  const base = { clientId: CLIENT_ID, redirectUri: "https://x/cb", state: "s", codeChallenge: "c" };
  assert.throws(() => buildAuthorizeUrl({ ...base, state: undefined }), /state/);
  assert.throws(() => buildAuthorizeUrl({ ...base, codeChallenge: undefined }), /codeChallenge/);
  assert.throws(() => buildAuthorizeUrl({ ...base, clientId: undefined }), /clientId/);
});

// ---------------------------------------------------------------------------
// id_token 的 claims 驗證 —— 攻擊情境
// ---------------------------------------------------------------------------

test("verifyIdTokenClaims：正常的token可以通過，並回傳sub當主鍵", () => {
  const user = verifyIdTokenClaims(fakeIdToken(validPayload()), { clientId: CLIENT_ID });
  assert.equal(user.sub, "google-user-1");
  assert.equal(user.email, "player@example.com");
  assert.equal(user.name, "測試玩家");
});

test("verifyIdTokenClaims：aud 不符要擋下（否則任何人都能拿別的應用的Google token登入這裡）", () => {
  const other = fakeIdToken(validPayload({ aud: "別人的-client-id.apps.googleusercontent.com" }));
  assert.throws(() => verifyIdTokenClaims(other, { clientId: CLIENT_ID }), /aud/);
});

test("verifyIdTokenClaims：iss 不是Google要擋下", () => {
  const forged = fakeIdToken(validPayload({ iss: "https://evil.example.com" }));
  assert.throws(() => verifyIdTokenClaims(forged, { clientId: CLIENT_ID }), /簽發者/);
});

test("verifyIdTokenClaims：過期的token要擋下（防重放）", () => {
  const expired = fakeIdToken(validPayload({ exp: Math.floor(Date.now() / 1000) - 3600 }));
  assert.throws(() => verifyIdTokenClaims(expired, { clientId: CLIENT_ID }), /過期/);
});

test("verifyIdTokenClaims：容許小幅時鐘誤差（伺服器之間差幾秒是正常的）", () => {
  const justExpired = fakeIdToken(validPayload({ exp: Math.floor(Date.now() / 1000) - 10 }));
  assert.doesNotThrow(() => verifyIdTokenClaims(justExpired, { clientId: CLIENT_ID }));
});

test("verifyIdTokenClaims：缺 sub 要擋下（沒有唯一識別碼就沒辦法決定存檔屬於誰）", () => {
  const noSub = fakeIdToken(validPayload({ sub: undefined }));
  assert.throws(() => verifyIdTokenClaims(noSub, { clientId: CLIENT_ID }), /sub/);
});

test("verifyIdTokenClaims：亂七八糟的字串不可以讓程式崩潰，要丟出看得懂的錯", () => {
  assert.throws(() => verifyIdTokenClaims("不是JWT", { clientId: CLIENT_ID }), /三段式|格式/);
  assert.throws(() => verifyIdTokenClaims("a.b.c", { clientId: CLIENT_ID }), /payload|JSON/);
});

// ---------------------------------------------------------------------------
// 登入票（HMAC 簽章 cookie）
// ---------------------------------------------------------------------------

test("登入票：簽發之後驗得回來", async () => {
  const token = await signSessionToken({ sub: "u1", name: "阿露" }, SECRET);
  const payload = await verifySessionToken(token, SECRET);
  assert.equal(payload.sub, "u1");
  assert.equal(payload.name, "阿露");
});

test("登入票：被竄改過就驗不過（這是整套機制的核心）", async () => {
  const token = await signSessionToken({ sub: "u1" }, SECRET);
  const [body, sig] = token.split(".");
  // 把 payload 換成別人的身分，簽章原封不動
  const forgedBody = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ sub: "受害者", exp: Math.floor(Date.now() / 1000) + 999 }))
  );
  assert.equal(await verifySessionToken(`${forgedBody}.${sig}`, SECRET), null);
});

test("登入票：換一把secret就驗不過（防止別的部署簽的票拿來用）", async () => {
  const token = await signSessionToken({ sub: "u1" }, SECRET);
  assert.equal(await verifySessionToken(token, "另一把完全不同的secret"), null);
});

test("登入票：過期就驗不過", async () => {
  const token = await signSessionToken({ sub: "u1" }, SECRET, { now: Date.now() - 400 * 24 * 3600 * 1000 });
  assert.equal(await verifySessionToken(token, SECRET), null);
});

test("登入票：垃圾輸入一律回null而不是丟錯（訪客是正常狀態，不是錯誤路徑）", async () => {
  for (const bad of [null, undefined, "", "沒有點", "a.b.c.d", 123]) {
    assert.equal(await verifySessionToken(bad, SECRET), null);
  }
});

test("登入票：沒設定 AUTH_SESSION_SECRET 時一律視為未登入，不可以讓整個網站爆掉", async () => {
  assert.equal(await verifySessionToken("任何東西", undefined), null);
});

// ---------------------------------------------------------------------------
// Cookie 工具
// ---------------------------------------------------------------------------

test("buildCookie：一定要有 HttpOnly / Secure / SameSite（三個都是防線，不可少）", () => {
  const c = buildCookie("__Host-x", "v", 100);
  assert.match(c, /HttpOnly/);
  assert.match(c, /Secure/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Path=\//);
});

test("buildClearCookie：Max-Age=0 讓瀏覽器立刻丟掉", () => {
  assert.match(buildClearCookie("__Host-x"), /Max-Age=0/);
});

test("readCookie：能從一整串 Cookie 標頭裡挑出正確那一個（不可以被前綴相同的騙到）", () => {
  const header = "other=1; __Host-wxh_session=abc123; __Host-wxh_session_extra=zzz";
  assert.equal(readCookie(header, "__Host-wxh_session"), "abc123");
  assert.equal(readCookie(header, "不存在"), null);
  assert.equal(readCookie(null, "x"), null);
});

test("getCurrentUser：請求物件沒有headers時當成未登入，不可以丟錯", async () => {
  assert.equal(await getCurrentUser({}, { AUTH_SESSION_SECRET: SECRET }), null);
  assert.equal(await getCurrentUser({ headers: {} }, { AUTH_SESSION_SECRET: SECRET }), null);
});

test("getCurrentUser：帶著合法cookie就認得出來", async () => {
  const token = await signSessionToken({ sub: "u9", name: "露葵" }, SECRET);
  const request = { headers: { get: (h) => (h === "cookie" ? `${SESSION_COOKIE}=${token}` : null) } };
  const user = await getCurrentUser(request, { AUTH_SESSION_SECRET: SECRET });
  assert.equal(user.sub, "u9");
  assert.equal(user.name, "露葵");
});

// ---------------------------------------------------------------------------
// 存檔歸屬 —— 這一組直接對應「別人能不能讀我的存檔」
// ---------------------------------------------------------------------------

const alice = { sub: "alice" };
const bob = { sub: "bob" };

test("匿名存檔：知道ID的人都能讀（沒登入也要能玩）", () => {
  const s = createSession({ id: "s1", character: {} });
  assert.equal(s.ownerId, null);
  assert.equal(canAccessSession(s, null), true);
  assert.equal(canAccessSession(s, alice), true);
});

test("有主人的存檔：只有本人能讀，別人與訪客一律擋下", () => {
  const s = createSession({ id: "s1", character: {}, ownerId: "alice" });
  assert.equal(canAccessSession(s, alice), true);
  assert.equal(canAccessSession(s, bob), false, "拿到別人的sessionId也不可以讀得到");
  assert.equal(canAccessSession(s, null), false);
});

test("認領：登入時把手上的匿名存檔綁到帳號（已經在玩的人進度不會不見）", () => {
  const s = createSession({ id: "s1", character: {} });
  assert.equal(claimSession(s, alice).claimed, true);
  assert.equal(s.ownerId, "alice");
  assert.equal(canAccessSession(s, bob), false);
});

test("認領：已經有主人的存檔不可以被別人搶走", () => {
  const s = createSession({ id: "s1", character: {}, ownerId: "alice" });
  const result = claimSession(s, bob);
  assert.equal(result.claimed, false);
  assert.match(result.reason, /已經屬於另一個帳號/);
  assert.equal(s.ownerId, "alice", "原主人不可以被改掉");
});

test("認領：沒登入不能認領", () => {
  const s = createSession({ id: "s1", character: {} });
  assert.equal(claimSession(s, null).claimed, false);
  assert.equal(s.ownerId, null);
});

test("帳號存檔索引：登記、列出、移除都正確，而且不會重複登記", async () => {
  const store = memorySessionStore(new Map());
  await indexSessionForOwner(store, "alice", "s1");
  await indexSessionForOwner(store, "alice", "s2");
  await indexSessionForOwner(store, "alice", "s1"); // 重複登記
  assert.deepEqual(await listSessionsForOwner(store, "alice"), ["s1", "s2"]);

  await unindexSessionForOwner(store, "alice", "s1");
  assert.deepEqual(await listSessionsForOwner(store, "alice"), ["s2"]);

  assert.deepEqual(await listSessionsForOwner(store, "從來沒存過的人"), []);
});

test("帳號索引不可以混進一般存檔的列表裡", async () => {
  const store = memorySessionStore(new Map());
  await store.put(createSession({ id: "s1", character: {} }));
  await indexSessionForOwner(store, "alice", "s1");
  assert.deepEqual(await store.list(), ["s1"], "owner: 開頭的索引key不是存檔，不該出現在存檔列表");
});

// ---------------------------------------------------------------------------
// 端對端：直接打 API，確認歸屬控制真的接上了
//
// 上面測的是 canAccessSession() 這個函式本身。這一組測的是**它有沒有真的被呼叫**
// ——「規則寫對了但沒有人呼叫它」正是這個專案先前踩過的坑（core/health.js 的死亡旗標
// 寫得好好的，卻沒有任何呼叫端在讀）。
// ---------------------------------------------------------------------------

import { onRequestPost as sessionPost, onRequestGet as sessionGet } from "../functions/api/session.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";

const DRAFT = {
  concept: { name: "測試輪迴者", gender: "男" },
  attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
  skills: { 格鬥: 3, 射擊: 0, 體魄: 1, 潛行: 0, 求生: 0, 偵察: 2, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 0 },
};

const GOOD_REPLY = JSON.stringify({
  narration: "敘事",
  options: [
    { label: "一", attribute: "感知", skill: "偵察", difficulty: "容易" },
    { label: "二", attribute: "力量", skill: "格鬥", difficulty: "普通" },
    { label: "三", attribute: "意志", skill: null, difficulty: "普通" },
    { label: "四", attribute: "敏捷", skill: "體魄", difficulty: "困難" },
  ],
});

function authEnv() {
  return { AUTH_SESSION_SECRET: SECRET, AI: { run: async () => ({ response: GOOD_REPLY }) } };
}

/** 做一個「帶著某人登入cookie」的請求物件。 */
async function reqAs(env, body, user) {
  const headers = { get: () => null };
  if (user) {
    const token = await signSessionToken({ sub: user.sub }, SECRET);
    headers.get = (h) => (h === "cookie" ? `${SESSION_COOKIE}=${token}` : null);
  }
  return { env, request: { headers, json: async () => body } };
}

async function getReqAs(env, url, user) {
  const headers = { get: () => null };
  if (user) {
    const token = await signSessionToken({ sub: user.sub }, SECRET);
    headers.get = (h) => (h === "cookie" ? `${SESSION_COOKIE}=${token}` : null);
  }
  return { env, request: { headers, url } };
}

const readRes = async (res) => ({ status: res.status, body: JSON.parse(await res.text()) });

test("端對端：alice 登入後建立的存檔，bob 拿到ID也讀不到（回404不是403）", async () => {
  const env = authEnv();
  const created = await readRes(await sessionPost(await reqAs(env, { draft: DRAFT }, alice)));
  assert.equal(created.body.ok, true);
  const id = created.body.session.id;
  assert.equal(created.body.session.ownerId, "alice", "登入時建立的存檔要直接掛在帳號底下");

  const asAlice = await readRes(await sessionGet(await getReqAs(env, `https://x/api/session?id=${id}`, alice)));
  assert.equal(asAlice.body.ok, true);

  const asBob = await readRes(await sessionGet(await getReqAs(env, `https://x/api/session?id=${id}`, bob)));
  assert.equal(asBob.status, 404, "不可以回403——那等於確認了這個ID存在");
  assert.equal(asBob.body.ok, false);

  const asGuest = await readRes(await sessionGet(await getReqAs(env, `https://x/api/session?id=${id}`, null)));
  assert.equal(asGuest.status, 404);
});

test("端對端：bob 也不能拿別人的存檔去打 /api/turn 推進劇情", async () => {
  const env = authEnv();
  const created = await readRes(await sessionPost(await reqAs(env, { draft: DRAFT }, alice)));
  const id = created.body.session.id;

  const bobTurn = await readRes(await turnPost(await reqAs(env, { sessionId: id }, bob)));
  assert.equal(bobTurn.status, 404, "存取控制必須在 /api/turn 也生效，不能只擋 /api/session");
});

test("端對端：匿名時建立的存檔，登入後第一次讀取就被認領成自己的", async () => {
  const env = authEnv();
  const created = await readRes(await sessionPost(await reqAs(env, { draft: DRAFT }, null)));
  const id = created.body.session.id;
  assert.equal(created.body.session.ownerId, null, "沒登入時建立的是匿名存檔");

  const afterLogin = await readRes(await sessionGet(await getReqAs(env, `https://x/api/session?id=${id}`, alice)));
  assert.equal(afterLogin.body.ok, true);
  assert.equal(afterLogin.body.session.ownerId, "alice", "登入後應該自動認領");

  // 認領之後就輪到別人讀不到了
  const asBob = await readRes(await sessionGet(await getReqAs(env, `https://x/api/session?id=${id}`, bob)));
  assert.equal(asBob.status, 404);

  // 而且它要出現在 alice 的存檔清單裡
  const list = await readRes(await sessionGet(await getReqAs(env, "https://x/api/session", alice)));
  assert.ok(list.body.ids.includes(id), "認領後要進到這個帳號的存檔索引");
});

test("端對端：沒登入時一切照舊（匿名玩家仍然可以正常建立與讀取自己的存檔）", async () => {
  const env = authEnv();
  const created = await readRes(await sessionPost(await reqAs(env, { draft: DRAFT }, null)));
  const id = created.body.session.id;
  const read = await readRes(await sessionGet(await getReqAs(env, `https://x/api/session?id=${id}`, null)));
  assert.equal(read.body.ok, true, "登入是選配的，不登入不能被擋住");
});
