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
// BYOK 呼叫端若明確指定 provider + 自己的設定，可以透過這個 legacy/demo 端點測試。
// 未指定 provider 時，匿名 request 預設會被擋下；只有部署者明確設定
// NARRATE_ALLOW_SERVER_LLM=true 才會使用 server-managed Gemini／Workers AI，避免額度被濫用。
// 正常 V2 遊玩使用 /api/turn，不受這個 demo gate 影響。細節見 LLM_PROVIDERS.md。

import { performCheck } from "../../core/check.js";
import { classifyOutcome } from "../../core/narration.js";
import {
  SYSTEM_INSTRUCTION,
  buildStaticContextBlocks,
  buildMemoryBlocks,
  buildDynamicTurnBlocks,
} from "../../content/gemini/promptContract.js";
import { inferCheckParams } from "../../content/checkIntent.js";
import {
  MAX_SCENE_CONTEXT_CHARS,
  clampTextByCodePoints,
  MAX_FREE_ACTION_CHARS,
  countActionCharacters,
} from "../../content/turnOptions.js";
import { applyCheckModifiers } from "../../content/shop/effects.js";
import { sanitizeProvidedCharacter } from "../../content/characterBuilder.js";
import { callLlm, callLlmWithFallback, describeLlmFailure } from "../../content/llm/client.js";
import { buildLlmDiagnostic } from "../../content/llm/diagnostics.js";
import { buildLayeredRequest } from "../../content/llm/cacheLayers.js";
import { pickProvider, PROVIDER_IDS, PROVIDERS } from "../../content/llm/providers.js";
import { resolveLlmRequestOverrides } from "../../content/llm/requestOverrides.js";
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
function logLlmFailure(err, { provider, diagnostic = null }) {
  const safeDiagnostic = diagnostic ?? buildLlmDiagnostic({
    attempts: err?.fallbackAttempts,
    provider: err?.provider ?? provider,
    model: err?.model ?? null,
    stage: err?.stage ?? "unknown",
    status: err?.status ?? null,
    outcome: "failed",
  });
  console.error("[LLM_FAILURE]", JSON.stringify({
    where: "POST /api/narrate",
    provider: safeDiagnostic.finalProvider ?? err?.provider ?? provider,
    providerLabel: safeDiagnostic.finalProviderLabel,
    model: safeDiagnostic.finalModel ?? err?.model ?? null,
    stage: err?.stage ?? "unknown",
    httpStatus: err?.status ?? null,
    fallbackAttempts: safeDiagnostic.attempts,
    diagnosticSummary: safeDiagnostic.summary,
    autoRetryAttempts: safeDiagnostic.autoRetryAttempts,
    message: err?.message ?? String(err),
    bodySnippet: err?.bodySnippet ?? null,
  }));
}

function logLlmFallbackRecovered(diagnostic) {
  if (!diagnostic) return;
  console.warn("[LLM_FALLBACK_RECOVERED]", JSON.stringify({
    where: "POST /api/narrate",
    provider: diagnostic.finalProvider,
    providerLabel: diagnostic.finalProviderLabel,
    model: diagnostic.finalModel,
    fallbackAttempts: diagnostic.attempts,
    diagnosticSummary: diagnostic.summary,
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
  const sceneContext = typeof rawSceneContext === "string"
    ? clampTextByCodePoints(rawSceneContext, MAX_SCENE_CONTEXT_CHARS)
    : undefined;
  // narrate 是無存檔的匿名示範端點，呼叫端提供的 character 仍然是不可信輸入。
  // 先走與 /api/session 相同的 server sanitizer，避免偽造能力、energyPools、衍生HP或
  // 超支配點影響規則層；這條路徑只接受合法基礎角色，商品能力必須走 server session。
  const safeCharacter = sanitizeProvidedCharacter(character);

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

  // /api/narrate 沒有 session ownership，也不是 V2 正常遊玩路徑；若它能自動選到
  // server provider，就會變成匿名者消耗部署方金鑰／Workers AI 額度的放大器。只有明確
  // 開啟旗標才允許 server-managed LLM；呼叫端自帶 provider + 自己的 key 仍可用於
  // legacy/demo BYOK。正式 V2 使用 /api/turn，不受這個 demo gate 影響。
  const serverManagedNarrate = !bodyProvider || bodyProvider === "workers-ai";
  if (serverManagedNarrate && env.NARRATE_ALLOW_SERVER_LLM !== "true") {
    return jsonError("匿名 narrate 示範端點未開放伺服器 LLM；請使用 V2 /api/turn，或由部署者設定 NARRATE_ALLOW_SERVER_LLM=true。", 403);
  }

  // --- 規則層：先把數字算出來。這一段完全不碰AI，AI失敗也不影響它的正確性。 ---
  const baseParams = checkParams ?? inferCheckParams(playerAction, { character: safeCharacter });
  // 商店買到的檢定加值(專長/物品)在這裡併進判定參數，不然買了等於沒買。
  // 進行中的型態吃不到，理由同 /api/check：這是無存檔的示範端點，型態活在存檔裡。
  const { params: resolvedParams } = applyCheckModifiers(safeCharacter, baseParams);

  let checkResult;
  try {
    checkResult = performCheck(safeCharacter, resolvedParams);
  } catch (err) {
    return jsonError(`判定計算失敗：${err.message}`, 400);
  }

  const outcome = classifyOutcome(checkResult);

  // --- 敘事層：從這裡開始才需要AI。上面算好的結果一律照原樣回傳，不受AI成敗影響。 ---
  const provider = bodyProvider || (env.LLM_PROVIDER ?? pickProvider(env));
  // [安全] 跟 /api/turn 同一套規則(見 content/llm/requestOverrides.js)：沒帶 provider
  // 就三個覆寫欄位全部忽略；帶了但不是 custom 就不能改寫 baseUrl。這個端點是匿名/
  // 無存檔的示範端點，比 /api/turn 更沒有身分可以追蹤，這一層防護更不能漏。
  const llmOverrides = resolveLlmRequestOverrides({ bodyProvider, bodyApiKey, bodyBaseUrl, bodyModel });
  if (bodyBaseUrl && bodyProvider !== "custom") {
    console.warn("[LLM_OVERRIDE_IGNORED]", JSON.stringify({
      where: "POST /api/narrate", reason: "baseUrl只在provider=custom時生效", bodyProvider: bodyProvider ?? null,
    }));
  }
  if (!provider) {
    return jsonWithCheck(
      {
        error:
          "沒有可用的LLM供應商。請設定任一組金鑰(GROQ_API_KEY / SILICONFLOW_API_KEY / " +
          "NVIDIA_API_KEY / MISTRAL_API_KEY / GEMINI_API_KEY / DEEPSEEK_API_KEY / " +
          "OPENROUTER_API_KEY / LLM_API_KEY+LLM_BASE_URL)，或在 wrangler.toml 加上 " +
          '[ai] binding = "AI" 使用免金鑰的 Cloudflare Workers AI。設定步驟見 LLM_PROVIDERS.md。' +
          `可用的供應商id：${PROVIDER_IDS.join(" / ")}`,
      },
      { resolvedParams, checkResult, outcome },
      503
    );
  }

  // 文筆層＋規則契約層。這是靜態層的一段，見 docs/PROMPT_CACHE_CONTRACT.md。
  let styleAndRules;
  try {
    styleAndRules = composeSystemInstruction({
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
        summary: clampTextByCodePoints(typeof e?.summary === "string" ? e.summary : "", MAX_EVENT_SUMMARY_CHARS),
      }))
    : [];

  // 三層契約（docs/PROMPT_CACHE_CONTRACT.md）：這個端點是無狀態的 demo/BYOK 入口，
  // 沒有 session 歷史，所以歷史層是空的——但靜態／動態的分界跟 /api/turn 一模一樣，
  // 而且必須一模一樣：專案裡只有一種組 LLM 請求的方式，多一種就會有一種被寫壞而沒人發現。
  const layers = buildLayeredRequest({
    staticBlocks: [
      // 場景背景在這個端點是呼叫端每次傳的，但同一個呼叫端連續請求通常是同一個場景，
      // 放靜態層仍然吃得到快取；放動態層則一定吃不到。
      ...buildStaticContextBlocks({ sceneContext }),
      // 規則契約放靜態層最後，優先序宣告才會是系統提示的最後一句（同 /api/turn）。
      styleAndRules,
    ],
    // 這個端點沒有 session，歷史層永遠是空的；仍然明確傳出去，讓呼叫形狀跟 /api/turn 一致。
    historyMessages: [],
    dynamicBlocks: [
      // 事件日誌是滑動窗口，每次呼叫的開頭都可能不同，所以歸動態層。
      ...buildMemoryBlocks({ recentEvents: boundedRecentEvents }),
      ...buildDynamicTurnBlocks({ playerAction, outcome }),
    ],
  });
  if (layers.leaks.length > 0) {
    console.warn("[PROMPT_CACHE_STATIC_LEAK]", JSON.stringify({
      where: "POST /api/narrate",
      leaks: layers.leaks.map((l) => l.id),
      hint: "見 docs/PROMPT_CACHE_CONTRACT.md：這些值必須下放到最後一個 user message",
    }));
  }


  const callNarrativeLlm = bodyProvider ? callLlm : callLlmWithFallback;
  try {
    const result = await callNarrativeLlm({
      ...(bodyProvider ? { provider } : {}),
      env,
      systemInstruction: layers.systemInstruction,
      history: layers.history,
      prompt: layers.prompt,
      ...(bodyProvider ? llmOverrides : {}),
    });
    const diagnostic = Array.isArray(result.fallbackAttempts) && result.fallbackAttempts.length
      ? buildLlmDiagnostic({
          attempts: result.fallbackAttempts,
          provider: result.provider ?? provider,
          model: result.model,
          outcome: "recovered",
        })
      : null;
    logLlmFallbackRecovered(diagnostic);
    return new Response(
      JSON.stringify({
        ok: true,
        provider: result.provider ?? provider,
        model: result.model,
        checkParams: resolvedParams,
        checkResult,
        outcome,
        narration: result.text,
      }),
      { headers: { "content-type": "application/json; charset=utf-8" } }
    );
  } catch (err) {
    // AI敘事失敗時，仍然把算好的判定結果回傳，讓前端至少知道規則層面發生了什麼，
    // 不會因為AI敘事失敗就連帶掩蓋掉「其實判定已經算完了」這件事。
    const diagnostic = buildLlmDiagnostic({
      attempts: err?.fallbackAttempts,
      provider: err?.provider ?? provider,
      model: err?.model ?? null,
      stage: err?.stage ?? "unknown",
      status: err?.status ?? null,
      outcome: "failed",
    });
    logLlmFailure(err, { provider: err?.provider ?? provider, diagnostic });
    return jsonWithCheck(
      {
        provider: err?.provider ?? provider,
        model: err?.model ?? null,
        // [安全][2026-08-24 second pass] 同 /api/turn：err.message 可能整段帶著第三方
        // 供應商的原始回應本文，不能原樣送回瀏覽器。完整原因已經在上面 logLlmFailure()
        // 寫進 server log。
        error: `敘事生成失敗（${err?.provider ?? provider}）：${describeLlmFailure(err)}`,
        llmFailure: {
          stage: err?.stage ?? "unknown",
          httpStatus: err?.status ?? null,
          providerAttempts: diagnostic.attempts,
          diagnosticSummary: diagnostic.summary,
        },
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
