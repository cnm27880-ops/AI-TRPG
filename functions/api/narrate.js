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
//   NARRATOR_PERSONA 敘事者人格面具（見 content/narrativeStyle.js 的 NARRATOR_PERSONAS）
//
// 什麼金鑰都沒設定時，會退到 Cloudflare Workers AI（免金鑰，靠 wrangler.toml 的 [ai] binding），
// 讓你不用先申請任何東西就能把整條鏈路跑起來。細節見 LLM_PROVIDERS.md。

import { performCheck } from "../../core/check.js";
import { classifyOutcome } from "../../core/narration.js";
import { buildTurnPrompt, SYSTEM_INSTRUCTION } from "../../content/gemini/promptContract.js";
import { inferCheckParams } from "../../content/checkIntent.js";
import {
  MAX_SCENE_CONTEXT_CHARS,
  clampTextByCodePoints,
  MAX_FREE_ACTION_CHARS,
  countActionCharacters,
} from "../../content/turnOptions.js";
import { applyCheckModifiers } from "../../content/shop/effects.js";
import { callLlm } from "../../content/llm/client.js";
import { pickProvider, PROVIDER_IDS, PROVIDERS } from "../../content/llm/providers.js";
import {
  composeSystemInstruction,
  DEFAULT_STYLE_ID,
  DEFAULT_PERSONA_KEY,
} from "../../content/narrativeStyle.js";

/**
 * 跟 functions/api/turn.js 的 logLlmFailure() 是同一件事。
 * 兩個端點刻意各留一份而不抽共用檔：它們的 where 欄位不同，而這個函式的全部內容
 * 就是那幾個欄位——抽成共用模組之後反而要多傳一個參數進去，沒有比較清楚。
 * 但兩邊的前綴必須一致（[LLM_FAILURE]），否則 log 就 grep 不到同一組。
 */
function logLlmFailure(err, { provider }) {
  console.error("[LLM_FAILURE]", JSON.stringify({
    where: "POST /api/narrate",
    provider: err?.provider ?? provider,
    model: err?.model ?? null,
    stage: err?.stage ?? "unknown",
    httpStatus: err?.status ?? null,
    message: err?.message ?? String(err),
    bodySnippet: err?.bodySnippet ?? null,
  }));
}

export async function onRequestPost(context) {
  const env = context.env ?? {};

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("請求body必須是合法JSON", 400);
  }

  const {
    character,
    checkParams,
    playerAction,
    sceneContext: rawSceneContext,
    recentEvents,
    style,
    persona,
    provider: bodyProvider,
    apiKey: bodyApiKey,
    baseUrl: bodyBaseUrl,
    model: bodyModel,
  } = body ?? {};
  if (!character || !playerAction) {
    return jsonError("body必須包含 character(人物卡物件) 與 playerAction(玩家行動描述)", 400);
  }

  // 跟 /api/turn 同一條規則：長度限制要在引擎/LLM之前擋下，按 Unicode code point 計算。
  const actualCharacters = countActionCharacters(playerAction);
  if (actualCharacters > MAX_FREE_ACTION_CHARS) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `自由行動不能超過 ${MAX_FREE_ACTION_CHARS} 字，目前有 ${actualCharacters} 字。`,
        code: "PLAYER_ACTION_TOO_LONG",
        maxCharacters: MAX_FREE_ACTION_CHARS,
        actualCharacters,
      }),
      { status: 422, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
  // sceneContext 一樣是可控文字、會被塞進prompt，安全截斷而不是報錯(這裡沒有存檔可寫，
  // 主要風險是prompt大小/成本，不是「持久化偽造狀態」)。
  const sceneContext = clampTextByCodePoints(rawSceneContext, MAX_SCENE_CONTEXT_CHARS);

  // 供應商覆寫與半設定狀態的攔截 —— 跟 /api/turn 同一套規則。
  // (2026-08-16：這個端點先前完全不接受前端覆寫，跟 turn.js 已經開始長不一樣了)
  if (bodyProvider && !PROVIDER_IDS.includes(bodyProvider)) {
    return jsonError(`未知的LLM供應商「${bodyProvider}」，可用的有：${PROVIDER_IDS.join(" / ")}`, 400);
  }
  if (bodyProvider) {
    const cfg = PROVIDERS[bodyProvider];
    if (cfg.apiKeyEnv && !bodyApiKey) {
      return jsonError(`選了供應商「${cfg.label}」就必須提供API金鑰，否則請改用伺服器預設。`, 400);
    }
    if (cfg.baseUrl === null && cfg.apiKeyEnv && !bodyBaseUrl && !env.LLM_BASE_URL) {
      return jsonError(`供應商「${cfg.label}」必須自己指定 Base URL（例如 https://你的服務/v1）。`, 400);
    }
    if (!cfg.defaultModel && !bodyModel && !env.LLM_MODEL) {
      return jsonError(`供應商「${cfg.label}」沒有預設模型，必須自己指定模型名稱（見 ${cfg.docs}）。`, 400);
    }
  }

  // --- 規則層：先把數字算出來。這一段完全不碰AI，AI失敗也不影響它的正確性。 ---
  const baseParams = checkParams ?? inferCheckParams(playerAction, { character });
  // 商店買到的檢定加值(專長/物品)在這裡併進判定參數，不然買了等於沒買。
  // 進行中的型態吃不到，理由同 /api/check：這是無存檔的示範端點，型態活在存檔裡。
  const { params: resolvedParams } = applyCheckModifiers(character, baseParams);

  let checkResult;
  try {
    checkResult = performCheck(character, resolvedParams);
  } catch (err) {
    return jsonError(`判定計算失敗：${err.message}`, 400);
  }

  const outcome = classifyOutcome(checkResult);

  // --- 敘事層：從這裡開始才需要AI。上面算好的結果一律照原樣回傳，不受AI成敗影響。 ---
  const provider = bodyProvider || (env.LLM_PROVIDER ?? pickProvider(env));
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
      // 敘事者人格面具，跟文筆設定檔同一個優先序：body > 環境變數 > 預設。
      personaKey: persona ?? env.NARRATOR_PERSONA ?? DEFAULT_PERSONA_KEY,
      styleId: style ?? env.NARRATIVE_STYLE ?? DEFAULT_STYLE_ID,
    });
  } catch (err) {
    return jsonError(`文筆設定檔錯誤：${err.message}`, 400);
  }

  // recentEvents 在這個端點是呼叫端直接提供的(跟 /api/turn 不同——那邊是伺服器從
  // event log 算出來的，呼叫端碰不到)，一樣要設應用層上限，否則一個超大陣列/超長
  // summary 會被整段塞進prompt，拉高成本也拉高單次請求的處理時間。
  const MAX_RECENT_EVENTS = 20;
  const MAX_EVENT_SUMMARY_CHARS = 200;
  const boundedRecentEvents = Array.isArray(recentEvents)
    ? recentEvents.slice(-MAX_RECENT_EVENTS).map((e) => ({
        ...e,
        summary: clampTextByCodePoints(typeof e?.summary === "string" ? e.summary : "", MAX_EVENT_SUMMARY_CHARS),
      }))
    : [];

  const prompt = buildTurnPrompt({ playerAction, outcome, sceneContext, recentEvents: boundedRecentEvents });


  try {
    const { text, model } = await callLlm({
      provider,
      env,
      systemInstruction,
      prompt,
      apiKey: bodyApiKey || undefined,
      baseUrl: bodyBaseUrl || undefined,
      model: bodyModel || undefined,
    });
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
    logLlmFailure(err, { provider });
    return jsonWithCheck(
      {
        provider,
        model: err?.model ?? null,
        error: `敘事生成失敗（${provider}）：${err.message}`,
        llmFailure: { stage: err?.stage ?? "unknown", httpStatus: err?.status ?? null },
      },
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
