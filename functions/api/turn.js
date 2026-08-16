// Cloudflare Pages Function —— 遊戲主迴圈端點。
// 路由：POST /api/turn
//
// 這是玩家實際在玩的那條路徑，一次呼叫完成一個完整回合：
//
//   讀取存檔(角色卡 + 事件日誌 + 最近幾輪敘事)
//     -> 引擎查驗這個選項的檢定合不合規則（AI說了不算，見 content/turnOptions.js）
//     -> 引擎擲骰、算成功數、比DC（core/check.js，AI一個數字都不碰）
//     -> 引擎把結果轉成敘事分級指令（core/narration.js）
//     -> AI 依照那個分級寫敘事，並提出下一輪的4個選項與各自的檢定組合
//     -> 引擎再查驗那4個選項
//     -> 把這一輪的判定寫進事件日誌、敘事推進短期記憶、存回存檔
//
// **記憶**：prompt 會帶兩種記憶，兩者用途不同、缺一不可（見 promptContract.js 的說明）：
//   - 最近幾輪的敘事原文(history)：讓劇情、場景、NPC 保持連貫
//   - 事件日誌摘要(log)：讓 AI 知道哪些判定已經發生過，且**不可改寫**
//
// 三種輸入模式：
//   1) 開場（沒有 playerAction 也沒有 chosenOption）：不擲骰，只要 AI 描述場景 + 給4個選項
//   2) 玩家選了 AI 給的選項（chosenOption）：用該選項自帶的屬性/技能/難度擲骰
//   3) 玩家自訂行動（playerAction）：沒有現成的檢定組合，退回 content/checkIntent.js 的關鍵字推導
//
// 角色卡一律以**存檔裡的那份**為準，不吃前端送來的角色卡——否則玩家改一下 localStorage
// 就能把屬性改成99。沒有 sessionId 時才退回 body 裡的 character（無存檔的相容模式）。

import { performCheck } from "../../core/check.js";
import { classifyOutcome } from "../../core/narration.js";
import { SYSTEM_INSTRUCTION, buildTurnPrompt, buildDmMemo } from "../../content/gemini/promptContract.js";
import { inferCheckParams } from "../../content/checkIntent.js";
import { callLlm } from "../../content/llm/client.js";
import { pickProvider, PROVIDER_IDS } from "../../content/llm/providers.js";
import { composeSystemInstruction, DEFAULT_STYLE_ID } from "../../content/narrativeStyle.js";
import { appendEvent, EVENT_TYPES, summarizeForJournal } from "../../core/eventLog.js";
import {
  resolveSessionStore,
  pushHistory,
  historyToPromptText,
} from "../../content/storage/sessionStore.js";
import {
  buildOptionsSpec,
  parseTurnResponse,
  extractNarrationFallback,
  validateOption,
  validateOptions,
  optionToCheckParams,
} from "../../content/turnOptions.js";
import { getScenarioPack } from "../../content/scenario/registry.js";
import { findActiveNode, completeNodeAndAdvance, spendChapterTime, justExpired, getProgressSummary } from "../../content/scenario/progress.js";
import { buildNodeGuidance, validateNodeComplete } from "../../content/scenario/nodePrompt.js";

/** 事件日誌摘要要餵幾筆給AI。太多會塞爆context也燒錢，太少會忘記自己做過什麼。 */
const EVENT_MEMORY_LIMIT = 12;

export async function onRequestPost(context) {
  const env = context.env ?? {};
  const store = resolveSessionStore(env);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("請求body必須是合法JSON", 400);
  }

  const { sessionId, chosenOption, playerAction, sceneContext, style, provider: bodyProvider, apiKey: bodyApiKey } = body ?? {};
  const warnings = [];

  if (bodyProvider && !PROVIDER_IDS.includes(bodyProvider)) {
    return jsonError(
      `未知的LLM供應商「${bodyProvider}」，可用的有：${PROVIDER_IDS.join(" / ")}`,
      400
    );
  }

  // ---------------------------------------------------------------------
  // 載入存檔。角色卡以存檔為準，不信任前端送來的角色卡。
  // ---------------------------------------------------------------------
  let session = null;
  if (sessionId) {
    session = await store.get(sessionId);
    if (!session) {
      return jsonError(`找不到存檔 ${sessionId}，請先呼叫 POST /api/session 建立`, 404);
    }
  }

  const character = session?.character ?? body?.character;
  if (!character) {
    return jsonError("body必須包含 sessionId(有存檔時) 或 character(無存檔的相容模式)", 400);
  }
  if (!session) {
    warnings.push("這一回合沒有使用存檔：結果不會被保存，AI也讀不到之前的劇情（會失憶）");
  } else if (!store.persistent) {
    // 這個警告很重要：記憶體版存檔在 Workers 上隨時會消失，玩家會以為自己在存檔卻突然歸零。
    warnings.push(
      "存檔目前存在記憶體裡，隨時可能消失。正式使用請在 wrangler.toml 設定 KV binding（見 DEPLOYMENT.md）"
    );
  }

  // ---------------------------------------------------------------------
  // 第一段：規則層。完全不碰AI，就算AI等一下整個掛掉，這段算出來的東西依然正確。
  // ---------------------------------------------------------------------
  let checkParams = null;
  let checkResult = null;
  let outcome = null;
  let actionText = null;

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
  // 第二段：敘事層。從這裡開始才需要AI。
  // ---------------------------------------------------------------------
  // 玩家在前端設定裡明確選了供應商時優先於伺服器端的猜測/預設(見 content/llm/providers.js
  // resolveProvider() 的覆寫優先序)；沒選就照舊完全交給伺服器判斷，行為不變。
  const provider = bodyProvider || (env.LLM_PROVIDER ?? pickProvider(env));
  if (!provider) {
    return jsonPartial(
      {
        error:
          "沒有可用的LLM供應商。請設定任一組金鑰(GEMINI_API_KEY / DEEPSEEK_API_KEY / " +
          "OPENROUTER_API_KEY / LLM_API_KEY+LLM_BASE_URL)，或在 wrangler.toml 加上 " +
          '[ai] binding = "AI" 使用免金鑰的 Cloudflare Workers AI。設定步驟見 LLM_PROVIDERS.md。' +
          `可用的供應商id：${PROVIDER_IDS.join(" / ")}`,
      },
      { session, checkParams, checkResult, outcome, warnings, store },
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

  // --- 記憶：從存檔裡取出來，餵進 prompt ---
  const recentNarration = historyToPromptText(session?.history);
  const recentEvents = session
    ? summarizeForJournal(session.log).slice(-EVENT_MEMORY_LIMIT)
    : [];

  // [新增] 生成 DM 備忘錄狀態表
  const dmMemo = buildDmMemo(character, session);

  // --- 副本節點：這回合「應該推進哪個節點」，餵進 prompt 讓AI知道關鍵事件是什麼 ---
  const scenarioPack = session?.scenario ? getScenarioPack(session.scenario.packId) : null;
  const activeNode = scenarioPack ? findActiveNode(scenarioPack, session.scenario.progress) : null;
  if (session?.scenario && !scenarioPack) {
    warnings.push(`存檔記錄的副本「${session.scenario.packId}」目前找不到對應的內建副本包，本回合略過節點指引`);
  }

  const prompt = buildPrompt({
    actionText,
    outcome,
    sceneContext: sceneContext ?? session?.scene?.context,
    recentEvents,
    recentNarration,
    character,
    nodeGuidance: scenarioPack ? buildNodeGuidance(activeNode) : null,
    dmMemo, // [新增] 將表格傳遞給組裝器
  });

  let text;
  let model;
  try {
    const res = await callLlm({ provider, env, systemInstruction, prompt, apiKey: bodyApiKey || undefined });
    text = res.text;
    model = res.model;
  } catch (err) {
    return jsonPartial(
      { provider, error: `敘事生成失敗（${provider}）：${err.message}` },
      { session, checkParams, checkResult, outcome, warnings, store },
      502
    );
  }

  // ---------------------------------------------------------------------
  // 第三段：拆解AI回覆、查驗選項。
  // ---------------------------------------------------------------------
  const parsed = parseTurnResponse(text);
  let narration = text;
  let options = [];

  if (parsed.ok) {
    if (typeof parsed.data.narration === "string") narration = parsed.data.narration;
    const validated = validateOptions(parsed.data.options, character);
    options = validated.options;
    validated.warnings.forEach((w) => warnings.push(w));
  } else {
    // 降級處理：敘事文字先試著用正則挖出 narration 欄位的純文字
    // （常見成因是輸出被截斷、JSON缺了結尾括號），挖不到才退回顯示整段原始文字。
    // 選項則整批退回 validateOptions()（見該函式），一樣用通用選項墊滿四個，
    // 玩家不會看到「本回合沒有選項」的空版面——這是使用者明確要求的一致性保底。
    const fallbackNarration = extractNarrationFallback(text);
    if (fallbackNarration) {
      narration = fallbackNarration;
    } else {
      // 連 narration 欄位都挖不到：至少把AI幻覺出的數字/選項清單切掉，
      // 不要讓「1. 謹慎觀察...」這種選項列表被當成故事內容印給玩家看。
      narration = text.split(/(?:^|\n)\s*(?:1\.|選項[一1])\s/)[0].trim();
    }
    warnings.push(`${parsed.error}（已降級為純敘事，改用通用選項墊滿本回合選項）`);
    options = validateOptions(null, character).options;
  }

  // ---------------------------------------------------------------------
  // 第三段之後、寫回存檔之前：副本節點結算(這場存檔有掛副本進度時才會跑)。
  //
  // 「AI說了不算」在這裡的意思是：AI只能標記 nodeComplete(見 nodePrompt.js)，
  // 實際能不能結算(前置節點是否真的都完成、有沒有重複結算)、獎勵算多少，
  // 一律由 content/scenario/progress.js 查驗與查表，不接受AI自己講一個數字。
  // ---------------------------------------------------------------------
  let scenarioResult = null;
  if (session?.scenario && scenarioPack) {
    let progress = session.scenario.progress;

    // 時間預算：只有玩家真的採取行動的回合才算(開場敘事那一回合玩家還沒做任何選擇)。
    const tookAction = Boolean(chosenOption || playerAction);
    if (tookAction) {
      const before = progress;
      progress = spendChapterTime(progress, 1, actionText ?? "推進劇情");
      if (justExpired(before, progress)) {
        warnings.push("這個章節的時間預算已經耗盡，接下來的敘事應該會轉向劣化結局，請留意場景描述。");
      }
    }

    let nodeCompleted = null;
    // isFinale節點刻意不接受敘事信號結算(見 nodePrompt.js 給AI的指引)：只能透過玩家
    // 實際打贏 /api/combat/* 來完成(見 functions/api/combat/act.js)。這裡是最後一道防線，
    // 就算AI沒理會prompt指示硬塞了nodeComplete，也不會被引擎採用。
    if (activeNode && !activeNode.isFinale && parsed.ok) {
      const signal = validateNodeComplete(parsed.data.nodeComplete);
      if (signal) {
        const result = completeNodeAndAdvance(scenarioPack, progress, activeNode.id, signal.tier);
        if (result.ok) {
          progress = result.progress;
          character.xp.earned += result.reward;
          const ts = new Date().toISOString();
          appendEvent(
            session.log,
            EVENT_TYPES.NODE_COMPLETE,
            { nodeId: activeNode.id, title: activeNode.title, divergenceTier: signal.tier, reward: result.reward },
            { timestamp: ts }
          );
          appendEvent(
            session.log,
            EVENT_TYPES.XP_GRANT,
            { total: result.reward, reason: `完成節點「${activeNode.title}」` },
            { timestamp: ts }
          );
          nodeCompleted = { nodeId: activeNode.id, title: activeNode.title, divergenceTier: signal.tier, reward: result.reward };
        } else {
          // 查驗失敗不當成硬錯誤：AI可能判斷錯了時機，忽略這次信號，遊戲照常繼續。
          warnings.push(`副本節點結算被引擎擋下：${result.error}`);
        }
      }
    }

    session.scenario = { packId: scenarioPack.id, progress };

    // 注意：這裡重新用「結算完這回合之後」的 progress 算一次 activeNode，不是沿用
    // 這回合開頭那個(拿去組prompt指引的)舊值——如果這回合剛好完成了一個節點，
    // 玩家應該立刻在這次回應裡看到「下一個節點/最終戰」，不用再多打一輪才看到更新。
    const nextActiveNode = findActiveNode(scenarioPack, progress);
    scenarioResult = {
      activeNode: nextActiveNode
        ? { id: nextActiveNode.id, title: nextActiveNode.title, isFinale: Boolean(nextActiveNode.isFinale) }
        : null,
      nodeCompleted,
      progress: getProgressSummary(scenarioPack, progress),
    };
  }

  // ---------------------------------------------------------------------
  // 第四段：寫回存檔。這是「AI下一回合還記得這件事」的關鍵。
  // ---------------------------------------------------------------------
  if (session) {
    if (checkResult) {
      appendEvent(
        session.log,
        EVENT_TYPES.CHECK,
        {
          label: actionText,
          success: checkResult.success,
          margin: checkResult.margin,
          tier: outcome?.tier,
          note: checkResult.note,
          totalSuccesses: checkResult.totalSuccesses,
          dc: checkResult.dc,
        },
        { timestamp: new Date().toISOString() }
      );
    }
    session.history = pushHistory(session.history, { action: actionText, narration });
    session.scene = { context: sceneContext ?? session.scene?.context ?? "", options };
    await store.put(session);
  }

  return json({
    ok: true,
    provider,
    model,
    sessionId: session?.id ?? null,
    persistent: store.persistent,
    checkParams,
    checkResult,
    outcome,
    narration,
    options,
    scenario: scenarioResult,
    turnCount: session?.log?.events?.length ?? 0,
    warnings,
  });
}

/**
 * 組這一回合要送給AI的訊息。
 * 開場模式沒有判定結果，所以不能用 buildTurnPrompt()（它會要求 outcome 必填）。
 */
function buildPrompt({ actionText, outcome, sceneContext, recentEvents, recentNarration, character, nodeGuidance, dmMemo }) {
  const optionsSpec = buildOptionsSpec(character);
  const tail = nodeGuidance ? `\n\n${nodeGuidance}` : "";
  const dmMemoBlock = dmMemo ? `\n\n${dmMemo}` : ""; // [新增] 表格區塊

  // 把JSON格式的強制指令釘在整個prompt的最後一行：模型看到的最後一句話就是這個，
  // 前面內容再長也不會被忘記——比只放在system instruction裡更難被忽略。
  const jsonReminder = `\n\n【系統強制指令】\n你的回覆必須是單一個合法的 JSON 物件，請直接以 { 開頭並以 } 結尾。絕對不要輸出 Markdown (\`\`\`json) 或其他閒聊文字！`;

  if (!outcome) {
    const lines = [];
    if (sceneContext) lines.push(`【場景背景】${sceneContext}`);
    if (dmMemo) lines.push(dmMemo); // [新增] 開場也需要看到狀態表
    if (recentNarration) {
      lines.push("【前情提要】以下是這場遊戲到目前為止的經過，請保持一致性：");
      lines.push(recentNarration);
    }
    if (recentEvents?.length) {
      lines.push("【已經發生過的判定結果(事實，不可改寫)】");
      for (const e of recentEvents) lines.push(`- ${e.summary}`);
    }
    lines.push(
      recentNarration
        ? "【接續】玩家剛回到這場遊戲，請簡短重述目前的處境，不要重新開場。這一回合沒有擲骰，不要描寫任何行動的成敗。"
        : "【這是本場遊戲的開場】請描寫玩家角色目前所在的場景，建立氣氛與可以互動的線索。" +
            "這一回合沒有擲骰，不要描寫任何行動的成敗。"
    );
    return `${lines.join("\n")}\n\n${optionsSpec}${tail}${jsonReminder}`;
  }

  const turnPrompt = buildTurnPrompt({
    playerAction: actionText,
    outcome,
    sceneContext,
    recentEvents,
    recentNarration,
  });

  // [修改] 把狀態表格接在後面
  return `${turnPrompt}${dmMemoBlock}\n\n${optionsSpec}${tail}${jsonReminder}`;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** 敘事層失敗時的回應：規則層算好的東西一律照常附上。 */
function jsonPartial(extra, { session, checkParams, checkResult, outcome, warnings, store }, status) {
  return json(
    {
      ok: false,
      ...extra,
      sessionId: session?.id ?? null,
      persistent: store?.persistent ?? false,
      checkParams,
      checkResult,
      outcome,
      options: [],
      warnings,
    },
    status
  );
}

function jsonError(message, status) {
  return json({ ok: false, error: message }, status);
}
