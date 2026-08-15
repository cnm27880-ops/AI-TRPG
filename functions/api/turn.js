// Cloudflare Pages Function —— 遊戲主迴圈端點。
// 路由：POST /api/turn
//
// 這是玩家實際在玩的那條路徑，一次呼叫完成一個完整回合：
//
//   玩家選了選項(或自己打字)
//     -> 引擎查驗這個選項的檢定合不合規則（AI說了不算，見 content/turnOptions.js）
//     -> 引擎擲骰、算成功數、比DC（core/check.js，AI一個數字都不碰）
//     -> 引擎把結果轉成敘事分級指令（core/narration.js）
//     -> AI 依照那個分級寫敘事，並提出下一輪的4個選項與各自的檢定組合
//     -> 引擎再查驗那4個選項 -> 回傳給前端
//
// 三種輸入模式：
//   1) 開場（沒有 playerAction 也沒有 chosenOption）：不擲骰，只要 AI 描述場景 + 給4個選項
//   2) 玩家選了 AI 給的選項（chosenOption）：用該選項自帶的屬性/技能/難度擲骰
//   3) 玩家自訂行動（playerAction）：沒有現成的檢定組合，退回 content/checkIntent.js 的關鍵字推導
//
// [安全性] 模式2的 chosenOption 是從前端送回來的，所以**一定要在伺服器端重新查驗一次**，
// 不能因為「這是我們自己剛剛發出去的選項」就信任它——前端的東西玩家隨時可以改。
// 重新查驗的成本極低（純比對表格），而且這是唯一能保證「難度不會被改成容易」的做法。

import { performCheck } from "../../core/check.js";
import { classifyOutcome } from "../../core/narration.js";
import { SYSTEM_INSTRUCTION, buildTurnPrompt } from "../../content/gemini/promptContract.js";
import { inferCheckParams } from "../../content/checkIntent.js";
import { callLlm } from "../../content/llm/client.js";
import { pickProvider, PROVIDER_IDS } from "../../content/llm/providers.js";
import { composeSystemInstruction, DEFAULT_STYLE_ID } from "../../content/narrativeStyle.js";
import {
  buildOptionsSpec,
  parseTurnResponse,
  validateOption,
  validateOptions,
  optionToCheckParams,
} from "../../content/turnOptions.js";

export async function onRequestPost(context) {
  const env = context.env ?? {};

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("請求body必須是合法JSON", 400);
  }

  const { character, chosenOption, playerAction, sceneContext, recentEvents, style } = body ?? {};
  if (!character) {
    return jsonError("body必須包含 character(人物卡物件)", 400);
  }

  // ---------------------------------------------------------------------
  // 第一段：規則層。完全不碰AI，就算AI等一下整個掛掉，這段算出來的東西依然正確。
  // ---------------------------------------------------------------------
  let checkParams = null;
  let checkResult = null;
  let outcome = null;
  let actionText = null;
  const warnings = [];

  if (chosenOption) {
    // 伺服器端重新查驗，不信任前端送回來的內容
    const verified = validateOption(chosenOption, character);
    if (!verified.ok) {
      return jsonError(`選項查驗失敗：${verified.error}`, 400);
    }
    verified.warnings.forEach((w) => warnings.push(`本次選項：${w}`));

    actionText = verified.option.label;
    checkParams = optionToCheckParams(verified.option);
  } else if (playerAction) {
    actionText = String(playerAction).trim();
    if (!actionText) return jsonError("playerAction不可以是空字串", 400);
    // 自訂行動沒有現成的檢定組合，退回關鍵字推導（見 content/checkIntent.js 的已知簡化）
    checkParams = inferCheckParams(actionText, { character });
    if (!checkParams.matched) {
      warnings.push("自訂行動沒有命中任何關鍵字，已退回純感知檢定");
    }
  }
  // 都沒有 = 開場模式，不擲骰

  if (checkParams) {
    try {
      checkResult = performCheck(character, checkParams);
    } catch (err) {
      return jsonError(`判定計算失敗：${err.message}`, 400);
    }
    outcome = classifyOutcome(checkResult);
  }

  // ---------------------------------------------------------------------
  // 第二段：敘事層。從這裡開始才需要AI。上面算好的結果一律照原樣回傳，不受AI成敗影響。
  // ---------------------------------------------------------------------
  const provider = env.LLM_PROVIDER ?? pickProvider(env);
  if (!provider) {
    return jsonPartial(
      {
        error:
          "沒有可用的LLM供應商。請設定任一組金鑰(GEMINI_API_KEY / DEEPSEEK_API_KEY / " +
          "OPENROUTER_API_KEY / LLM_API_KEY+LLM_BASE_URL)，或在 wrangler.toml 加上 " +
          '[ai] binding = "AI" 使用免金鑰的 Cloudflare Workers AI。設定步驟見 LLM_PROVIDERS.md。' +
          `可用的供應商id：${PROVIDER_IDS.join(" / ")}`,
      },
      { checkParams, checkResult, outcome, warnings },
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

  const prompt = buildPrompt({ actionText, outcome, sceneContext, recentEvents, character });

  let text;
  let model;
  try {
    const res = await callLlm({ provider, env, systemInstruction, prompt });
    text = res.text;
    model = res.model;
  } catch (err) {
    return jsonPartial(
      { provider, error: `敘事生成失敗（${provider}）：${err.message}` },
      { checkParams, checkResult, outcome, warnings },
      502
    );
  }

  // ---------------------------------------------------------------------
  // 第三段：把AI的回覆拆成「敘事」跟「下一輪的選項」，並查驗選項。
  // ---------------------------------------------------------------------
  const parsed = parseTurnResponse(text);

  if (!parsed.ok) {
    // 降級處理：JSON解析失敗時，把整段文字當敘事用，選項留空。
    // 玩家還是能用第五個「自訂行動」繼續玩，不會卡死——這比整個回合失敗好。
    warnings.push(`${parsed.error}（已降級為純敘事，本回合沒有選項）`);
    return json({
      ok: true,
      provider,
      model,
      checkParams,
      checkResult,
      outcome,
      narration: text,
      options: [],
      warnings,
    });
  }

  const narration = typeof parsed.data.narration === "string" ? parsed.data.narration : text;
  const { options, warnings: optionWarnings } = validateOptions(parsed.data.options, character);
  optionWarnings.forEach((w) => warnings.push(w));

  return json({
    ok: true,
    provider,
    model,
    checkParams,
    checkResult,
    outcome,
    narration,
    options,
    warnings,
  });
}

/**
 * 組這一回合要送給AI的訊息。
 * 開場模式沒有判定結果，所以不能用 buildTurnPrompt()（它會要求 outcome 必填）。
 */
function buildPrompt({ actionText, outcome, sceneContext, recentEvents, character }) {
  const optionsSpec = buildOptionsSpec(character);

  if (!outcome) {
    const lines = [];
    if (sceneContext) lines.push(`【場景背景】${sceneContext}`);
    if (recentEvents?.length) {
      lines.push("【最近發生的事】");
      for (const e of recentEvents) lines.push(`- ${e.summary}`);
    }
    lines.push(
      "【這是本場遊戲的開場】請描寫玩家角色目前所在的場景，建立氣氛與可以互動的線索。" +
        "這一回合沒有擲骰，不要描寫任何行動的成敗。"
    );
    return `${lines.join("\n")}\n\n${optionsSpec}`;
  }

  return `${buildTurnPrompt({ playerAction: actionText, outcome, sceneContext, recentEvents })}\n\n${optionsSpec}`;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** 敘事層失敗時的回應：規則層算好的東西一律照常附上。 */
function jsonPartial(extra, { checkParams, checkResult, outcome, warnings }, status) {
  return json({ ok: false, ...extra, checkParams, checkResult, outcome, options: [], warnings }, status);
}

function jsonError(message, status) {
  return json({ ok: false, error: message }, status);
}
