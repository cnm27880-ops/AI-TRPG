// Cloudflare Pages Function —— 判定 + 敘事的主要端點。
// 路由：POST /api/narrate
//
// 完整流程：
//   1) 決定這次要擲什麼檢定(content/checkIntent.js)，或用呼叫端指定的 checkParams
//   2) 呼叫 core/check.js 的 performCheck() 算出判定結果(純運算，跟AI無關)
//   3) 用 core/narration.js 的 classifyOutcome() 把結果轉成敘事分級指令
//   4) 用 content/narrativeStyle.js 把「文筆層」跟「規則契約層」組成系統提示
//   5) 用 content/gemini/promptContract.js 組出這一回合的prompt
//   6) 用 content/llm/client.js 呼叫使用者設定的LLM供應商，拿回敘事文字
//
// 供應商由環境變數決定，不用改程式碼(見 content/llm/providers.js 的 pickProvider)：
//   LLM_PROVIDER   gemini / deepseek / openrouter / workers-ai / custom（不設就自動偵測）
//   LLM_MODEL      覆寫模型名稱
//   LLM_BASE_URL   接第三方OpenAI相容中轉時使用
//   GEMINI_API_KEY / DEEPSEEK_API_KEY / OPENROUTER_API_KEY / LLM_API_KEY
//   NARRATIVE_STYLE 文筆設定檔名稱（見 content/narrativeStyle.js 的 STYLE_PROFILES）
//
// 什麼金鑰都沒設定時，會退到 Cloudflare Workers AI（免金鑰，靠 wrangler.toml 的 [ai] binding），
// 讓你不用先申請任何東西就能把整條鏈路跑起來。細節見 LLM_PROVIDERS.md。

import { performCheck } from "../../core/check.js";
import { classifyOutcome } from "../../core/narration.js";
import { buildTurnPrompt, SYSTEM_INSTRUCTION } from "../../content/gemini/promptContract.js";
import { inferCheckParams } from "../../content/checkIntent.js";
import { callLlm } from "../../content/llm/client.js";
import { pickProvider, PROVIDER_IDS } from "../../content/llm/providers.js";
import { composeSystemInstruction, DEFAULT_STYLE_ID } from "../../content/narrativeStyle.js";

export async function onRequestPost(context) {
  const env = context.env ?? {};

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("請求body必須是合法JSON", 400);
  }

  const { character, checkParams, playerAction, sceneContext, recentEvents, style } = body ?? {};
  if (!character || !playerAction) {
    return jsonError("body必須包含 character(人物卡物件) 與 playerAction(玩家行動描述)", 400);
  }

  // --- 規則層：先把數字算出來。這一段完全不碰AI，AI失敗也不影響它的正確性。 ---
  const resolvedParams = checkParams ?? inferCheckParams(playerAction, { character });

  let checkResult;
  try {
    checkResult = performCheck(character, resolvedParams);
  } catch (err) {
    return jsonError(`判定計算失敗：${err.message}`, 400);
  }

  const outcome = classifyOutcome(checkResult);

  // --- 敘事層：從這裡開始才需要AI。上面算好的結果一律照原樣回傳，不受AI成敗影響。 ---
  const provider = env.LLM_PROVIDER ?? pickProvider(env);
  if (!provider) {
    return jsonWithCheck(
      {
        error:
          "沒有可用的LLM供應商。請設定任一組金鑰(GEMINI_API_KEY / DEEPSEEK_API_KEY / " +
          "OPENROUTER_API_KEY / LLM_API_KEY+LLM_BASE_URL)，或在 wrangler.toml 加上 " +
          '[ai] binding = "AI" 使用免金鑰的 Cloudflare Workers AI。設定步驟見 LLM_PROVIDERS.md。' +
          `可用的供應商id：${PROVIDER_IDS.join(" / ")}`,
      },
      { resolvedParams, checkResult, outcome },
      503
    );
  }

  let systemInstruction;
  try {
    systemInstruction = composeSystemInstruction({
      rulesContract: SYSTEM_INSTRUCTION,
      styleId: style ?? env.NARRATIVE_STYLE ?? DEFAULT_STYLE_ID,
    });
  } catch (err) {
    return jsonError(`文筆設定檔錯誤：${err.message}`, 400);
  }

  const prompt = buildTurnPrompt({ playerAction, outcome, sceneContext, recentEvents });

  try {
    const { text, model } = await callLlm({ provider, env, systemInstruction, prompt });
    return new Response(
      JSON.stringify({
        ok: true,
        provider,
        model,
        checkParams: resolvedParams,
        checkResult,
        outcome,
        narration: text,
      }),
      { headers: { "content-type": "application/json; charset=utf-8" } }
    );
  } catch (err) {
    // AI敘事失敗時，仍然把算好的判定結果回傳，讓前端至少知道規則層面發生了什麼，
    // 不會因為AI敘事失敗就連帶掩蓋掉「其實判定已經算完了」這件事。
    return jsonWithCheck(
      { provider, error: `敘事生成失敗（${provider}）：${err.message}` },
      { resolvedParams, checkResult, outcome },
      502
    );
  }
}

/** 回傳「規則層算好了、但敘事層失敗」的回應，判定結果一律照常附上。 */
function jsonWithCheck(extra, { resolvedParams, checkResult, outcome }, status) {
  return new Response(
    JSON.stringify({
      ok: false,
      ...extra,
      checkParams: resolvedParams,
      checkResult,
      outcome,
    }),
    { status, headers: { "content-type": "application/json; charset=utf-8" } }
  );
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
