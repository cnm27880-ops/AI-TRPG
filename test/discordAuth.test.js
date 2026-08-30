// Discord 登入（OAuth2）的測試。
//
// 跟 test/auth.test.js 同樣的重點：這條路徑寫錯會讓別人讀到別人的存檔，
// 所以除了「正常流程會動」，也測：
//   - state / PKCE 兩條防線不可以省略
//   - token / user endpoint 回傳異常時要丟出看得懂的錯，不能讓呼叫端拿到半個使用者
//   - prompt=none 這個體驗優化不能被誤用成「预设值」而悄悄套用
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchDiscordUser,
  normalizeDiscordUser,
  discordAvatarUrl,
} from "../content/auth/discordOAuth.js";
import { getCurrentUser, signSessionToken } from "../content/auth/sessionToken.js";
import {
  isDiscordAuthConfigured,
  discordAuthConfigError,
  resolveDiscordRedirectUri,
} from "../content/auth/config.js";

const CLIENT_ID = "discord-client-id";
const SECRET = "測試用的-session-secret-夠長夠隨機";

// ---------------------------------------------------------------------------
// 授權網址
// ---------------------------------------------------------------------------

test("buildAuthorizeUrl：帶齊 PKCE 與 state，只要求 identify email 兩個最小權限", () => {
  const url = new URL(buildAuthorizeUrl({
    clientId: CLIENT_ID,
    redirectUri: "https://example.com/api/auth/discord-callback",
    state: "s1",
    codeChallenge: "c1",
  }));
  assert.equal(url.origin + url.pathname, "https://discord.com/api/oauth2/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "s1");
  assert.equal(url.searchParams.get("scope"), "identify email");
});

test("buildAuthorizeUrl：預設不帶 prompt=none（呼叫端要自己決定要不要跳過同意畫面）", () => {
  const url = new URL(buildAuthorizeUrl({
    clientId: CLIENT_ID, redirectUri: "https://x/cb", state: "s", codeChallenge: "c",
  }));
  assert.equal(url.searchParams.get("prompt"), null);
});

test("buildAuthorizeUrl：skipConsentPrompt=true 才帶 prompt=none", () => {
  const url = new URL(buildAuthorizeUrl({
    clientId: CLIENT_ID, redirectUri: "https://x/cb", state: "s", codeChallenge: "c", skipConsentPrompt: true,
  }));
  assert.equal(url.searchParams.get("prompt"), "none");
});

test("buildAuthorizeUrl：少了 state 或 codeChallenge 或 clientId 一律丟錯", () => {
  const base = { clientId: CLIENT_ID, redirectUri: "https://x/cb", state: "s", codeChallenge: "c" };
  assert.throws(() => buildAuthorizeUrl({ ...base, state: undefined }), /state/);
  assert.throws(() => buildAuthorizeUrl({ ...base, codeChallenge: undefined }), /codeChallenge/);
  assert.throws(() => buildAuthorizeUrl({ ...base, clientId: undefined }), /clientId/);
  assert.throws(() => buildAuthorizeUrl({ ...base, redirectUri: undefined }), /redirectUri/);
});

// ---------------------------------------------------------------------------
// token 交換 —— 用注入的假 fetchFn，離線測試
// ---------------------------------------------------------------------------

test("exchangeCodeForTokens：正常換到 access_token", async () => {
  const fetchFn = async (url, init) => {
    assert.equal(url, "https://discord.com/api/oauth2/token");
    assert.equal(init.method, "POST");
    const body = new URLSearchParams(init.body);
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code_verifier"), "verifier-1");
    return { ok: true, json: async () => ({ access_token: "at-1", token_type: "Bearer" }) };
  };
  const { accessToken } = await exchangeCodeForTokens({
    code: "code-1", codeVerifier: "verifier-1", clientId: CLIENT_ID, clientSecret: "secret", redirectUri: "https://x/cb", fetchFn,
  });
  assert.equal(accessToken, "at-1");
});

test("exchangeCodeForTokens：Discord回錯誤狀態碼要丟出看得懂的錯，不能吞掉", async () => {
  const fetchFn = async () => ({ ok: false, status: 400, text: async () => "invalid_grant" });
  await assert.rejects(
    () => exchangeCodeForTokens({ code: "c", codeVerifier: "v", clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x/cb", fetchFn }),
    /HTTP 400/
  );
});

test("exchangeCodeForTokens：回應裡沒有access_token也要丟錯，不能讓呼叫端拿到undefined當token在用", async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ token_type: "Bearer" }) });
  await assert.rejects(
    () => exchangeCodeForTokens({ code: "c", codeVerifier: "v", clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x/cb", fetchFn }),
    /access_token/
  );
});

// ---------------------------------------------------------------------------
// /users/@me —— 使用者資料正規化
// ---------------------------------------------------------------------------

test("fetchDiscordUser：正常拿到使用者資料，整理成登入票要放的形狀", async () => {
  const fetchFn = async (url, init) => {
    assert.equal(url, "https://discord.com/api/users/@me");
    assert.equal(init.headers.authorization, "Bearer at-1");
    return {
      ok: true,
      json: async () => ({ id: "123456789012345678", username: "player1", global_name: "阿露", avatar: "abc123", email: "p@example.com", verified: true }),
    };
  };
  const user = await fetchDiscordUser("at-1", { fetchFn });
  assert.equal(user.sub, "discord:123456789012345678");
  assert.equal(user.name, "阿露", "global_name優先於username");
  assert.equal(user.email, "p@example.com");
  assert.equal(user.emailVerified, true);
  assert.match(user.picture, /^https:\/\/cdn\.discordapp\.com\/avatars\/123456789012345678\/abc123\.png/);
});

test("fetchDiscordUser：HTTP錯誤要丟出看得懂的錯", async () => {
  const fetchFn = async () => ({ ok: false, status: 401, text: async () => "invalid token" });
  await assert.rejects(() => fetchDiscordUser("bad-token", { fetchFn }), /HTTP 401/);
});

test("fetchDiscordUser：缺少id要丟錯（沒有唯一識別碼就沒辦法決定存檔屬於誰）", async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ username: "沒有id的怪回應" }) });
  await assert.rejects(() => fetchDiscordUser("t", { fetchFn }), /id/);
});

test("normalizeDiscordUser：sub 一律加上 discord: 前綴，不是Discord的裸id", () => {
  const rawId = "108623491234567890123";
  const user = normalizeDiscordUser({ id: rawId, username: "u", verified: false });
  assert.equal(user.sub, `discord:${rawId}`);
  assert.notEqual(user.sub, rawId);
});

test("normalizeDiscordUser：沒有global_name時退回username，兩個都沒有時name是null", () => {
  const a = normalizeDiscordUser({ id: "1", username: "fallback_name" });
  assert.equal(a.name, "fallback_name");
  const b = normalizeDiscordUser({ id: "1", username: "" });
  assert.equal(b.name, null);
});

test("discordAvatarUrl：有自訂頭像時用CDN網址，動圖(a_開頭)給gif不給png", () => {
  const staticUrl = discordAvatarUrl({ id: "1", avatar: "abc" });
  assert.match(staticUrl, /\.png/);
  const animatedUrl = discordAvatarUrl({ id: "1", avatar: "a_abc" });
  assert.match(animatedUrl, /\.gif/);
});

test("discordAvatarUrl：沒有自訂頭像時退回官方預設頭像，不能丟錯或回undefined", () => {
  const legacyUser = { id: "1", discriminator: "1234" };
  assert.match(discordAvatarUrl(legacyUser), /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/\d\.png$/);

  const newUsernameUser = { id: "123456789012345678", discriminator: "0" };
  assert.match(discordAvatarUrl(newUsernameUser), /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/\d\.png$/);
});

// ---------------------------------------------------------------------------
// 設定判斷與 redirect_uri
// ---------------------------------------------------------------------------

test("isDiscordAuthConfigured／discordAuthConfigError：三個環境變數缺一都算沒設定好", () => {
  assert.equal(isDiscordAuthConfigured({}), false);
  assert.match(discordAuthConfigError({}), /DISCORD_CLIENT_ID/);

  const full = { DISCORD_CLIENT_ID: "a", DISCORD_CLIENT_SECRET: "b", AUTH_SESSION_SECRET: "c" };
  assert.equal(isDiscordAuthConfigured(full), true);
  assert.equal(discordAuthConfigError(full), null);
});

test("resolveDiscordRedirectUri：預設從請求網址推導，設定 DISCORD_AUTH_REDIRECT_URI 就用那個值", () => {
  const request = { url: "https://example.com/anything" };
  assert.equal(resolveDiscordRedirectUri(request, {}), "https://example.com/api/auth/discord-callback");

  const withOverride = { DISCORD_AUTH_REDIRECT_URI: "https://正式站/api/auth/discord-callback" };
  assert.equal(resolveDiscordRedirectUri(request, withOverride), "https://正式站/api/auth/discord-callback");
});

test("getCurrentUser：Discord登入的票，sub保留discord:前綴", async () => {
  const token = await signSessionToken({ sub: "discord:999", name: "小怪" }, SECRET);
  const request = { headers: { get: (h) => (h === "cookie" ? `__Host-wxh_session=${token}` : null) } };
  const user = await getCurrentUser(request, { AUTH_SESSION_SECRET: SECRET });
  assert.equal(user.sub, "discord:999");
  assert.equal(user.name, "小怪");
});
