// Cloudflare Pages Function — [設計] 部署骨架範例，不是規則書內容。
// 路由：POST /api/combat/resolve
// 用途：把一次完整的攻擊行動(命中判定->傷害減免->扣血)包成API，直接呼叫
// core/combat/resolveCombatAction.js。前端/Gemini只要把這次攻擊的參數丟過來，
// 不需要、也不被允許自己算成功數或傷害——理由同 functions/api/check.js 檔頭註解。
//
// 這個端點不會自動套用傳奇屬性加值(attackBonusSuccesses/extraDamageCap)，呼叫端要自己先用
// core/legendaryAttributes.js 算好再傳進來，理由見 core/combat/resolveCombatAction.js 的檔頭註解。

import { resolveCombatAction } from "../../../core/combat/resolveCombatAction.js";
import { buildCombatNarrationPrompt } from "../../../content/gemini/promptContract.js";

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("請求body必須是合法JSON", 400);
  }

  try {
    const result = resolveCombatAction(body ?? {});
    // [2026-08-18] 傷害嚴重度標籤與它的敘事指令一起回傳（見 Phase 5.3 任務4）。
    //
    // 為什麼在這裡就把 prompt 組好，而不是讓呼叫端自己拼：標籤是引擎算的、
    // 「請根據這個標籤描寫視覺與聽覺細節」那句話也該跟著引擎走。散到每個呼叫端各拼一次，
    // 遲早有一個地方忘記帶標籤，而那種漏接是完全靜音的——畫面看起來一切正常，
    // 只是戰鬥描寫又回到乾癟的那一版。
    //
    // 這個端點是無狀態的（不讀存檔），所以敵人的意圖預告要由呼叫端自己帶 telegraph 進來。
    const narrationPrompt = buildCombatNarrationPrompt({
      attackerLabel: body?.attackerLabel ?? "攻擊方",
      targetLabel: body?.targetLabel ?? "目標",
      weaponLabel: body?.weaponLabel ?? null,
      hit: result.hit,
      damage: result.finalDamage,
      damageSeverityTag: result.damageSeverityTag,
      telegraph: body?.telegraph ?? null,
    });
    return new Response(JSON.stringify({ ok: true, result, narrationPrompt }), {
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
