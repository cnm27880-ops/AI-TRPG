// Cloudflare Pages Function —— 建卡。
// 路由：GET /api/character（取得建卡規則常數）、POST /api/character（驗證建卡草稿）
//
// 前端建卡畫面靠這兩個端點運作：
//   GET  拿到預算數字、屬性/技能分類表、上限值 —— 前端不自己抄一份常數，
//        否則規則改了但前端沒改，玩家看到的預算會跟後端驗的不一樣。
//   POST 每次玩家調整加點就打一次，即時顯示「還剩幾點」與錯誤；
//        最後送出時同一個端點回傳組好的完整角色卡。

import { buildCharacter, buildCharacterFromLifePath, chargenRules } from "../../content/characterBuilder.js";

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

  // 兩種輸入：
  //   lifePath —— 生平問答（前端實際走的路徑，見 content/chargen/lifePath.js）
  //   draft    —— 現成的配點草稿（測試/匯入用的低階入口）
  // 前者只是後者的前置換算，驗證與組裝完全共用同一段程式碼。
  const result = body?.lifePath
    ? buildCharacterFromLifePath(body.lifePath)
    : buildCharacter(body?.draft ?? body ?? {});

  // 驗證失敗也回200：這個端點在建卡過程中會被連續呼叫（每次加點都打一次），
  // 「還沒填完」是正常狀態不是錯誤。呼叫端看 valid 欄位判斷，不看HTTP狀態碼。
  return json({
    ok: true,
    valid: result.valid,
    errors: result.errors,
    budgets: result.budgets,
    character: result.character ?? null,
    // 生平問答才有：拼好的小傳與「你擅長什麼」的白話描述，給建卡畫面直接顯示。
    lifePath: result.lifePath ?? null,
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
