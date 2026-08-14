// Cloudflare Pages Function — [設計] 部署骨架範例，不是規則書內容。
// 路由：POST /api/combat/resolve
// 用途：把一次完整的攻擊行動(命中判定->傷害減免->扣血)包成API，直接呼叫
// core/combat/resolveCombatAction.js。前端/Gemini只要把這次攻擊的參數丟過來，
// 不需要、也不被允許自己算成功數或傷害——理由同 functions/api/check.js 檔頭註解。
//
// 這個端點不會自動套用傳奇屬性加值(attackBonusSuccesses/extraDamageCap)，呼叫端要自己先用
// core/legendaryAttributes.js 算好再傳進來，理由見 core/combat/resolveCombatAction.js 的檔頭註解。

import { resolveCombatAction } from "../../../core/combat/resolveCombatAction.js";

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("請求body必須是合法JSON", 400);
  }

  try {
    const result = resolveCombatAction(body ?? {});
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return jsonError(`戰鬥行動計算失敗：${err.message}`, 400);
  }
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
