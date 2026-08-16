// Cloudflare Pages Function —— 登出。
// 路由：POST /api/auth/logout
//
// 用 POST 不用 GET：登出是會改變狀態的操作，用 GET 的話別人只要讓你載入一張
// <img src="/api/auth/logout"> 就能把你登出。配合 SameSite=Lax 的 cookie，
// POST 也擋掉了跨站自動送出。
//
// [誠實說明] 這只是清掉瀏覽器上的 cookie。簽章票在到期前本身仍然有效
// （見 content/auth/sessionToken.js 檔頭的取捨說明）。

import { buildClearCookie, SESSION_COOKIE } from "../../../content/auth/sessionToken.js";

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": buildClearCookie(SESSION_COOKIE),
    },
  });
}
