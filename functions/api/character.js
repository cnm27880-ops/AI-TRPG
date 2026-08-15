// Cloudflare Pages Function —— 建卡。
// 路由：GET /api/character（取得建卡規則常數）、POST /api/character（驗證建卡草稿）
//
// 前端建卡畫面靠這兩個端點運作：
//   GET  拿到預算數字、屬性/技能分類表、上限值 —— 前端不自己抄一份常數，
//        否則規則改了但前端沒改，玩家看到的預算會跟後端驗的不一樣。
//   POST 每次玩家調整加點就打一次，即時顯示「還剩幾點」與錯誤；
//        最後送出時同一個端點回傳組好的完整角色卡。

import { buildCharacter, chargenRules } from "../../content/characterBuilder.js";

export async function onRequestGet() {
  return json({ ok: true, rules: chargenRules() });
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const result = buildCharacter(body?.draft ?? body ?? {});

  // 驗證失敗也回200：這個端點在建卡過程中會被連續呼叫（每次加點都打一次），
  // 「還沒填完」是正常狀態不是錯誤。呼叫端看 valid 欄位判斷，不看HTTP狀態碼。
  return json({
    ok: true,
    valid: result.valid,
    errors: result.errors,
    budgets: result.budgets,
    character: result.character ?? null,
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
