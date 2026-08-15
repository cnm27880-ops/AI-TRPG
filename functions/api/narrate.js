// Cloudflare Pages Function — [設計] 部署骨架範例，示範怎麼把「判定結果」跟「Gemini敘事」串起來。
// 路由：POST /api/narrate
//
// 這個端點示範完整流程：
//   1) 呼叫 core/check.js 的 performCheck() 算出判定結果(純運算，跟AI無關)
//   2) 用 core/narration.js 的 classifyOutcome() 把結果轉成敘事分級指令
//   3) 用 content/gemini/promptContract.js 組出prompt
//   4) 呼叫 content/gemini/client.js 打Gemini API，拿回敘事文字
//
// 這個端點**需要**環境變數 GEMINI_API_KEY (透過 `wrangler pages secret put GEMINI_API_KEY`
// 設定，細節見repo根目錄的 GEMINI_INTEGRATION.md)，這個repo裡沒有、也不該有真的金鑰。
//
// [風險提示] 這個端點沒辦法在這個沙盒環境裡實際測試(沒有金鑰也沒有網路連到Gemini)，
// 部署後第一次呼叫請先用小規模測試(例如curl打一次)確認整條鏈路正常，不要直接串正式前端。

import { performCheck } from "../../core/check.js";
import { classifyOutcome } from "../../core/narration.js";
import { buildTurnPrompt, SYSTEM_INSTRUCTION } from "../../content/gemini/promptContract.js";
import { callGemini } from "../../content/gemini/client.js";
import { inferCheckParams } from "../../content/checkIntent.js";

export async function onRequestPost(context) {
  const apiKey = context.env?.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonError(
      "伺服器沒有設定GEMINI_API_KEY環境變數，請照GEMINI_INTEGRATION.md設定secret後再部署",
      500
    );
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("請求body必須是合法JSON", 400);
  }

  const { character, checkParams, playerAction, sceneContext, recentEvents } = body ?? {};
  if (!character || !playerAction) {
    return jsonError("body必須包含 character(人物卡物件) 與 playerAction(玩家行動描述)", 400);
  }

  // checkParams 是選填的：前端不該自己決定「這個行動要用哪個屬性搭哪個技能」，那是規則層面的決定
  // (見 content/checkIntent.js 檔頭)。呼叫端沒指定時，由引擎這邊推導；有指定時(例如之後接上
  // 「讓AI在有限選項裡挑檢定」的端點，或戰鬥中由劇本指定)才用呼叫端給的值。
  const resolvedParams = checkParams ?? inferCheckParams(playerAction, { character });

  let checkResult;
  try {
    checkResult = performCheck(character, resolvedParams);
  } catch (err) {
    return jsonError(`判定計算失敗：${err.message}`, 400);
  }

  const outcome = classifyOutcome(checkResult);
  const prompt = buildTurnPrompt({ playerAction, outcome, sceneContext, recentEvents });

  try {
    const { text } = await callGemini({
      apiKey,
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
    });
    return new Response(
      JSON.stringify({ ok: true, checkParams: resolvedParams, checkResult, outcome, narration: text }),
      { headers: { "content-type": "application/json; charset=utf-8" } }
    );
  } catch (err) {
    // Gemini呼叫失敗時，仍然把算好的判定結果回傳，讓前端至少知道規則層面發生了什麼，
    // 不會因為AI敘事失敗就連帶掩蓋掉「其實判定已經算完了」這件事。
    return new Response(
      JSON.stringify({
        ok: false,
        checkParams: resolvedParams,
        checkResult,
        outcome,
        error: `Gemini敘事失敗：${err.message}`,
      }),
      { status: 502, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
