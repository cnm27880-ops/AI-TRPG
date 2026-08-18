// Cloudflare Pages Function —— 建卡。
// 路由：GET /api/character（取得建卡規則常數）、POST /api/character（驗證建卡草稿）
//
// 前端建卡畫面靠這兩個端點運作：
//   GET  拿到預算數字、屬性/技能分類表、上限值 —— 前端不自己抄一份常數，
//        否則規則改了但前端沒改，玩家看到的預算會跟後端驗的不一樣。
//   POST 每次玩家調整加點就打一次，即時顯示「還剩幾點」與錯誤；
//        最後送出時同一個端點回傳組好的完整角色卡。

import { buildCharacter, buildCharacterFromLifePath, chargenRules } from "../../content/characterBuilder.js";
import { getScenarioPack, DEFAULT_SCENARIO_ID } from "../../content/scenario/registry.js";

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
  //   lifePath —— 建卡問答（前端實際走的路徑，見 content/chargen/lifePath.js）
  //   draft    —— 現成的配點草稿（測試/匯入用的低階入口）
  // 前者只是後者的前置換算，驗證與組裝完全共用同一段程式碼。
  //
  // lifePath 這條路會被前端呼叫兩次：五題答完時（不帶 reshape，拿甦醒那一幕的內容），
  // 以及玩家配完 5 點自由屬性時（帶 reshape，拿最終角色卡）。同一個端點，同一段驗證。
  //
  // 甦醒那一幕的房間描述是**副本**的資料（見 content/scenario/schema.js 的 ArrivalNarration），
  // 所以要先把副本查出來。查不到就不傳，awakening.js 會退回通用的過場而不是炸掉——
  // 這個端點只是預覽，不該因為副本id打錯就讓玩家卡在建卡畫面。
  const arrivalNarration = body?.lifePath
    ? getScenarioPack(body.scenarioId ?? DEFAULT_SCENARIO_ID)?.arrivalNarration
    : undefined;

  const result = body?.lifePath
    ? buildCharacterFromLifePath({ ...body.lifePath, arrivalNarration })
    : buildCharacter(body?.draft ?? body ?? {});

  // 驗證失敗也回200：這個端點在建卡過程中會被連續呼叫（每次加點都打一次），
  // 「還沒填完」是正常狀態不是錯誤。呼叫端看 valid 欄位判斷，不看HTTP狀態碼。
  return json({
    ok: true,
    valid: result.valid,
    errors: result.errors,
    budgets: result.budgets,
    character: result.character ?? null,
    // 建卡問答才有：拼好的小傳與「你擅長什麼」的白話描述，給建卡畫面直接顯示。
    lifePath: result.lifePath ?? null,
    // 甦醒那一幕（過場、房間、主神掃描結果、5點自由屬性的價目表與建議分配）。
    // 已經帶 reshape 送出的話會是 null——那一幕演過了，不用再演一次。
    awakening: result.awakening ?? null,
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
