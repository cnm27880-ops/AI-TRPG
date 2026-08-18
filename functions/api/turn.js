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
import {
  SYSTEM_INSTRUCTION,
  buildTurnPrompt,
  buildFreeActionPrompt,
  buildDmMemo,
} from "../../content/gemini/promptContract.js";
import { inferCheckParams } from "../../content/checkIntent.js";
import { applyCheckModifiers } from "../../content/shop/effects.js";
import { narrativeFeatHints, moralityHints } from "../../content/characterBuilder.js";
import { callLlm } from "../../content/llm/client.js";
import { pickProvider, PROVIDER_IDS, PROVIDERS } from "../../content/llm/providers.js";
import {
  composeSystemInstruction,
  DEFAULT_STYLE_ID,
  DEFAULT_PERSONA_KEY,
  PERSONA_KEYS,
} from "../../content/narrativeStyle.js";
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
  TURN_RESPONSE_SCHEMA,
} from "../../content/turnOptions.js";
import { getScenarioPack } from "../../content/scenario/registry.js";
import { creditNodeReward, settleScenario } from "../../content/scenario/settlement.js";
import {
  findActiveNode,
  completeNodeAndAdvance,
  spendChapterTime,
  justExpired,
  getProgressSummary,
  bumpNodeStall,
  getNodeStallRounds,
  applyThreatOutcome,
  peekRetread,
  trackCheckUsage,
} from "../../content/scenario/progress.js";
import { buildRetreadDirective, retreadLabel } from "../../content/scenario/repetition.js";
import { buildNodeGuidance, validateNodeComplete } from "../../content/scenario/nodePrompt.js";
import { buildThreatDirective, threatSummary } from "../../content/scenario/threat.js";
import { getDownState, revivalQuote } from "../../content/downState.js";
import { getCurrentUser } from "../../content/auth/sessionToken.js";
import { canAccessSession } from "../../content/auth/ownership.js";
import { sceneKeyOf } from "../../content/shop/access.js";
import { formsForScene } from "../../content/shop/forms.js";

/** 事件日誌摘要要餵幾筆給AI。太多會塞爆context也燒錢，太少會忘記自己做過什麼。 */
const EVENT_MEMORY_LIMIT = 12;

/**
 * 把LLM失敗寫進 Cloudflare Functions 的 log。
 *
 * [2026-08-16 新增] 在這之前，敘事層失敗只會變成一個回傳給前端的502，伺服器端**一個字都沒留**。
 * 也就是說「金鑰打錯、額度用盡、模型被下架」這幾種最常見的狀況，用
 * `npx wrangler pages deployment tail` 是完全查不到的，只能靠玩家回報「畫面怪怪的」。
 * 這裡刻意用 console.error 印出單行前綴 [LLM_FAILURE]，方便之後直接在 tail 輸出裡 grep。
 */
function logLlmFailure(err, { provider, sessionId }) {
  console.error("[LLM_FAILURE]", JSON.stringify({
    where: "POST /api/turn",
    sessionId: sessionId ?? null,
    provider: err?.provider ?? provider,
    model: err?.model ?? null,
    stage: err?.stage ?? "unknown",
    httpStatus: err?.status ?? null,
    message: err?.message ?? String(err),
    bodySnippet: err?.bodySnippet ?? null,
  }));
}

/**
 * 把「這一輪其實吃了保底內容」寫進 log。
 *
 * 跟上面那個不同：LLM有回應、HTTP也成功，只是內容不能用。這是任務A實際查到的根本原因
 * ——它以HTTP 200 ok:true 回傳，看起來一切正常，只有選項每輪逐字相同這一個線索。
 */
function logDegradedTurn(detail) {
  console.warn("[LLM_DEGRADED]", JSON.stringify({ where: "POST /api/turn", ...detail }));
}

export async function onRequestPost(context) {
  const env = context.env ?? {};
  const store = resolveSessionStore(env);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("請求body必須是合法JSON", 400);
  }

  const {
    sessionId,
    chosenOption,
    playerAction,
    sceneContext,
    style,
    // 敘事者人格面具（見 content/narrativeStyle.js 的 NARRATOR_PERSONAS）。
    // 跟 style 同一個層級：玩家在設定裡選，沒選就用環境變數，再沒有就用預設。
    persona,
    provider: bodyProvider,
    apiKey: bodyApiKey,
    baseUrl: bodyBaseUrl,
    model: bodyModel,
    maxTokens: bodyMaxTokens,
  } = body ?? {};
  const warnings = [];

  if (persona && !PERSONA_KEYS.includes(persona)) {
    return jsonError(
      `未知的敘事者人格面具「${persona}」，可用的有：${PERSONA_KEYS.join(" / ")}`,
      400
    );
  }

  if (bodyProvider && !PROVIDER_IDS.includes(bodyProvider)) {
    return jsonError(
      `未知的LLM供應商「${bodyProvider}」，可用的有：${PROVIDER_IDS.join(" / ")}`,
      400
    );
  }

  // [2026-08-16 新增] 「玩家在設定裡選了供應商，但金鑰欄位留空」的攔截。
  //
  // 舊行為：金鑰留空就送 apiKey=undefined，伺服器改讀自己的環境變數金鑰。
  // 那等於玩家以為自己在用A家、實際上跑的是伺服器設定的B家（或伺服器根本沒設，
  // 於是深入到 client.js 才丟出一句「沒有讀到金鑰」的錯，前端還不顯示）。
  // 這種「半設定狀態」一律在最前面擋掉，並直接告訴玩家缺什麼。
  // 前端也有同一道檢查(public/index.html 的 saveSettings 與 app.js 的 runTurn)，
  // 這裡是伺服器端的最後一道，因為前端可以被繞過、localStorage也可能殘留舊值。
  if (bodyProvider) {
    const providerCfg = PROVIDERS[bodyProvider];
    if (providerCfg.apiKeyEnv && !bodyApiKey) {
      return jsonError(
        `你在設定裡選了「${providerCfg.label}」，但沒有提供API金鑰。` +
          `請到「系統與文筆設定」把金鑰填好，或把供應商改回「（使用伺服器預設）」。`,
        400
      );
    }
    if (providerCfg.baseUrl === null && providerCfg.apiKeyEnv && !bodyBaseUrl && !env.LLM_BASE_URL) {
      return jsonError(
        `供應商「${providerCfg.label}」必須自己指定 Base URL（例如 https://你的服務/v1）。` +
          `請到「系統與文筆設定」填寫。`,
        400
      );
    }
    if (!providerCfg.defaultModel && !bodyModel && !env.LLM_MODEL) {
      return jsonError(
        `供應商「${providerCfg.label}」沒有預設模型，必須自己指定模型名稱。` +
          `可用的模型請看 ${providerCfg.docs}，填在「系統與文筆設定」的模型欄位。`,
        400
      );
    }
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
    // 存檔歸屬檢查：有主人的存檔只有本人能玩。沒有這一道的話，任何人只要拿到
    // 別人的 sessionId 就能替別人推進劇情、消耗他的時間預算。
    if (!canAccessSession(session, await getCurrentUser(context.request, env))) {
      return jsonError(`找不到存檔 ${sessionId}，請先呼叫 POST /api/session 建立`, 404);
    }
  }

  const character = session?.character ?? body?.character;
  if (!character) {
    return jsonError("body必須包含 sessionId(有存檔時) 或 character(無存檔的相容模式)", 400);
  }

  // 戰鬥外進行中的型態(變身/開眼/爆發)。**每一輪開始就先對一次場景鑰匙**：
  // 使用者定義的場景是「當下所在的地點」，而節點推進就是換地點，所以上一輪推進節點之後，
  // 這一輪的第一件事就是讓上一個地點啟動的型態到期。無存檔的相容模式沒有型態可言。
  let activeFormSources = [];
  if (session) {
    const synced = formsForScene(session.forms, sceneKeyOf(session, getScenarioPack));
    session.forms = synced.formsState;
    activeFormSources = synced.extraSources;
    for (const form of synced.expired) {
      warnings.push(`「${form.label}」因為離開了啟動時所在的地點而結束`);
    }
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
  // 傷勢閘門：角色昏迷/死亡時不能繼續照常行動。
  //
  // [2026-08-16 新增] 在這之前 core/health.js 算出來的 dead/unconscious 旗標
  // **完全沒有任何呼叫端在讀**，所以玩家在戰鬥中被打死之後，照樣可以繼續選選項、
  // 繼續擲骰、繼續推進劇情，畫面上一切正常。規則層算對了但結果沒有生效，
  // 這正是這次排查要清掉的那種模式。
  //
  // 刻意只擋「玩家主動行動」的回合，不擋開場/接續敘事（那一回合不擲骰，
  // 讓AI描述角色倒下的處境是合理的，也是玩家重整頁面回來時該看到的東西）。
  // ---------------------------------------------------------------------
  const downState = getDownState(character);
  if (!downState.canAct && (chosenOption || playerAction)) {
    return json(
      {
        ok: false,
        error: downState.reason,
        downState,
        revival: downState.dead ? revivalQuote(character) : null,
        sessionId: session?.id ?? null,
        persistent: store.persistent,
        options: [],
        warnings,
      },
      409
    );
  }

  // ---------------------------------------------------------------------
  // 副本包：節點指引、節點結算、迫近度風味、固定開頭全都要用到，所以在最前面就取出來，
  // 底下各段直接共用同一份（以前是在組prompt那一段才取，導致開場短路拿不到它）。
  // ---------------------------------------------------------------------
  const scenarioPack = session?.scenario ? getScenarioPack(session.scenario.packId) : null;
  if (session?.scenario && !scenarioPack) {
    warnings.push(`存檔記錄的副本「${session.scenario.packId}」目前找不到對應的內建副本包，本回合略過節點指引`);
  }
  let scenarioProgress = session?.scenario && scenarioPack ? session.scenario.progress : null;
  const currentChapter = scenarioPack?.entries?.[scenarioProgress?.chapterIndex ?? 0] ?? null;

  // ---------------------------------------------------------------------
  // 固定開頭短路：這一回合完全不呼叫AI。
  //
  // 條件是「開場模式（沒選項也沒自訂行動）+ 這場遊戲還沒有任何歷史 + 副本章節自備了
  // openingNarration/openingOptions」。命中時直接把作者寫好的開場文字與四個選項回傳。
  //
  // 為什麼值得為它多寫一段特例（測玩回饋的兩個問題它一次解決）：
  //   1. 品質固定：開場是玩家對這個副本的第一印象，不該每次進來都賭模型今天寫得好不好。
  //   2. 零延遲：開場那一次呼叫本來是玩家等最久的一次（建完卡 -> 空白畫面 -> 等模型），
  //      現在是一次純本地回應，按下按鈕當下就有東西可讀。
  // 玩家的第一個選擇之後就完全回到正常流程，AI照樣接手，什麼都沒被拿掉。
  // ---------------------------------------------------------------------
  const isOpening = !chosenOption && !playerAction;
  if (isOpening && !session?.history?.length && currentChapter?.openingNarration) {
    const scripted = validateOptions(currentChapter.openingOptions, character);
    scripted.warnings.forEach((w) => warnings.push(`固定開頭選項：${w}`));
    // source 從 "ai" 改標成 "scripted"：這些選項既不是AI生的、也不是引擎的保底通用選項，
    // 前端不該把它們標成「保底」（那個標籤的意思是「跟本回合劇情無關」，固定開頭正好相反）。
    const options = scripted.options.map((o) => (o.source === "ai" ? { ...o, source: "scripted" } : o));

    session.history = pushHistory(session.history, { action: null, narration: currentChapter.openingNarration });
    session.scene = { context: sceneContext ?? session.scene?.context ?? "", options };
    await store.put(session);

    const activeNode = scenarioPack ? findActiveNode(scenarioPack, scenarioProgress) : null;
    return json({
      ok: true,
      provider: null,
      model: null,
      sessionId: session.id,
      persistent: store.persistent,
      checkParams: null,
      checkResult: null,
      outcome: null,
      narration: currentChapter.openingNarration,
      options,
      degraded: {
        parseFailed: false,
        narrationSource: "scripted",
        aiOptionCount: 0,
        fallbackOptionCount: scripted.fallbackCount,
        truncated: false,
        finishReason: null,
      },
      downState,
      scenario: scenarioPack
        ? {
            activeNode: activeNode
              ? {
                  id: activeNode.id,
                  title: activeNode.title,
                  goal: activeNode.playerGoal ?? null,
                  isFinale: Boolean(activeNode.isFinale),
                }
              : null,
            nodeCompleted: null,
            progress: getProgressSummary(scenarioPack, scenarioProgress),
            threat: threatSummary(scenarioProgress?.threat, scenarioPack.threatTrack),
            briefing: scenarioPack.briefing ?? null,
          }
        : null,
      turnCount: session.log?.events?.length ?? 0,
      warnings,
    });
  }

  // ---------------------------------------------------------------------
  // 第一段：規則層。完全不碰AI，就算AI等一下整個掛掉，這段算出來的東西依然正確。
  // ---------------------------------------------------------------------
  let checkParams = null;
  let checkResult = null;
  let outcome = null;
  let actionText = null;
  // 這一回合是不是「純敘事行動」（玩家選了 requiresCheck:false 的選項）。
  // 跟開場模式不一樣：開場沒有玩家行動，這裡有行動、只是不擲骰。
  let freeAction = false;

  if (chosenOption) {
    // 伺服器端重新查驗，不信任前端送回來的內容
    const verified = validateOption(chosenOption, character);
    if (!verified.ok) {
      return jsonError(`選項查驗失敗：${verified.error}`, 400);
    }
    verified.warnings.forEach((w) => warnings.push(`本次選項：${w}`));
    actionText = verified.option.label;
    // [2026-08-18] 純敘事選項在這裡分流，**完全不進判定流程**（見 content/turnOptions.js）。
    //
    // 分流點放在查驗之後是刻意的：requiresCheck 一律以**伺服器重新查驗過**的那份為準，
    // 不是前端送什麼就算什麼。否則玩家只要把任何一個選項的 requiresCheck 改成 false，
    // 就能讓一個「極難」的行動變成免擲骰通過——那就等於把難度系統關掉。
    // （查驗本身不會創造這個欄位，它來自AI原本產生的那個選項，前端只是原樣送回。
    //   這個已知限制跟改難度分級是同一類，見 validateOption() 的說明。）
    if (verified.option.requiresCheck === false) {
      freeAction = true;
    } else {
      checkParams = optionToCheckParams(verified.option);
    }
  } else if (playerAction) {
    actionText = String(playerAction).trim();
    if (!actionText) return jsonError("playerAction不可以是空字串", 400);
    checkParams = inferCheckParams(actionText, { character });
    if (!checkParams.matched) {
      warnings.push("自訂行動沒有命中任何關鍵字，已退回純感知檢定");
    }
  }
  // 都沒有 = 開場模式，不擲骰

  // ---------------------------------------------------------------------
  // 套路遞減：同一個「屬性＋技能」連續用，DC 會愈來愈高（見 content/scenario/repetition.js）。
  //
  // 這是「把單一屬性技能點高就能一路按同一個選項通關」那個回饋的正解。懲罰在**擲骰之前**
  // 加進DC，而且用的是伺服器自己的紀錄，不是前端傳來的數字——前端顯示的預告只是預告。
  // ---------------------------------------------------------------------
  let retread = null;
  if (checkParams && scenarioProgress) {
    retread = peekRetread(scenarioProgress, checkParams);
    if (retread.dcPenalty > 0) {
      checkParams = {
        ...checkParams,
        baseDc: checkParams.dc ?? 0,
        dc: (checkParams.dc ?? 0) + retread.dcPenalty,
        retread: { consecutive: retread.consecutive, dcPenalty: retread.dcPenalty },
      };
      warnings.push(
        `同一套路連續第${retread.consecutive}次（${checkParams.attribute}${checkParams.skill ? "+" + checkParams.skill : ""}），本次DC+${retread.dcPenalty}`
      );
    }
    scenarioProgress = trackCheckUsage(scenarioProgress, checkParams);
  }

  if (checkParams) {
    // 商店買到的檢定加值(專長/物品/型態)在這裡併進判定參數。擺在套路遞減之後，
    // 因為那個是加在 DC 上的、這個是加在骰池上的，兩者互不覆蓋。
    //
    // [2026-08-17] extraSources 是戰鬥外進行中的型態。在這一行出現之前，`session.forms`
    // 沒有任何讀取端——變身在敘事迴圈裡完全不生效，只有戰鬥畫面吃得到。
    // formsForScene() 會先對一次場景鑰匙，所以玩家換了地點之後型態自然查不到了。
    const modified = applyCheckModifiers(character, checkParams, { extraSources: activeFormSources });
    checkParams = modified.params;
    if (modified.modifiers) {
      warnings.push(`持有能力加值：${modified.modifiers.sources.join("、")}`);
    }
    try {
      checkResult = performCheck(character, checkParams);
    } catch (err) {
      return jsonError(`判定計算失敗：${err.message}`, 400);
    }
    outcome = classifyOutcome(checkResult);
  }

  // ---------------------------------------------------------------------
  // 迫近度軌：這一回合的成敗**立刻**換算成一個會被存進存檔的數字（見 content/scenario/threat.js）。
  //
  // 這是「成功和失敗要有決定性差異」那個回饋的正解。在這之前，成敗唯一的下場是
  // core/narration.js 的一句語氣指令，而那句話下一回合就消失了——於是第三回合的處境
  // 跟第一回合一模一樣，玩家當然感覺不到差別。現在成敗會累積：連兩次失敗就跨一個階段，
  // 階段一變，餵給AI的強制指令就整段換掉，場景不可能再寫成原樣。
  //
  // 順序很重要：必須在組prompt之前算完，這一回合的敘事才能反映這一回合的判定。
  // ---------------------------------------------------------------------
  let threatChange = null;
  if (scenarioProgress && outcome) {
    const applied = applyThreatOutcome(scenarioProgress, outcome);
    scenarioProgress = applied.progress;
    threatChange = applied.change;
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
      personaKey: persona ?? env.NARRATOR_PERSONA ?? DEFAULT_PERSONA_KEY,
      styleId: style ?? env.NARRATIVE_STYLE ?? DEFAULT_STYLE_ID,
      // 美德/惡德放在最前面：那是這個角色的核心，專長特質是細節。
      // 兩者都走 characterHints（文筆層），不進規則契約層——它們是「這個人容易對什麼有反應」，
      // 不是判定規則，放進契約層有機會被模型讀成「遇到這類情節就必須怎樣」的硬指令。
      characterHints: [...moralityHints(character), ...narrativeFeatHints(character)],
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
  const activeNode = scenarioPack ? findActiveNode(scenarioPack, scenarioProgress) : null;
  // 這個節點已經卡了幾回合都沒結算，餵進 buildNodeGuidance() 讓提醒語氣隨著卡關時間拉長而加重
  // (見 progress.js 的 getNodeStallRounds() 說明)。
  const stalledRounds = activeNode ? getNodeStallRounds(scenarioProgress, activeNode.id) : 0;

  const prompt = buildPrompt({
    actionText,
    outcome,
    freeAction,
    personaKey: persona ?? env.NARRATOR_PERSONA ?? null,
    sceneContext: sceneContext ?? session?.scene?.context,
    recentEvents,
    recentNarration,
    character,
    nodeGuidance: scenarioPack ? buildNodeGuidance(activeNode, stalledRounds) : null,
    dmMemo, // [新增] 將表格傳遞給組裝器
    // 迫近度指令：這一回合的判定已經把威脅推近/拉遠了，AI必須照著那個階段寫。
    threatDirective: scenarioProgress
      ? buildThreatDirective(scenarioProgress.threat, scenarioPack?.threatTrack, threatChange)
      : null,
    // 套路指令：DC已經被引擎調高了，敘事要把它寫成「世界學會了這一招」而不是玩家變弱。
    retreadDirective: retread
      ? buildRetreadDirective(retread, checkParams, scenarioPack?.threatTrack?.subject)
      : null,
  });

  let text;
  let model;
  let finishReason = null;
  try {
    const res = await callLlm({
      provider,
      env,
      systemInstruction,
      prompt,
      apiKey: bodyApiKey || undefined,
      baseUrl: bodyBaseUrl || undefined,
      model: bodyModel || undefined,
      maxTokens: bodyMaxTokens || undefined,
      // 結構化輸出：由供應商端保證回覆格式合法，而不是祈禱模型照著prompt裡的範例寫。
      // 供應商不支援時 callLlm 會自動忽略，行為跟沒傳一樣（見 providers.js 的 JSON_MODES）。
      responseSchema: TURN_RESPONSE_SCHEMA,
    });
    text = res.text;
    model = res.model;
    finishReason = res.finishReason ?? null;
  } catch (err) {
    logLlmFailure(err, { provider, sessionId: session?.id });
    return jsonPartial(
      {
        provider,
        model: err?.model ?? null,
        error: `敘事生成失敗（${provider}）：${err.message}`,
        llmFailure: { stage: err?.stage ?? "unknown", httpStatus: err?.status ?? null },
      },
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
  // 這一輪的「內容來源」摘要。會原封不動回傳給前端，讓玩家/開發者一眼看出
  // 這一輪到底是AI生的還是引擎墊的，不用再靠肉眼比對選項文字有沒有重複。
  // finish_reason = "length"(OpenAI相容) / "MAX_TOKENS"(Gemini) 代表模型是「寫到一半被切斷」，
  // 不是「不會寫JSON」。這兩件事的處理方式完全不同(前者調高上限就好，後者要換模型或加schema)，
  // 所以不能對玩家講同一句話——先前就是因為只說「不是合法JSON」，害我第一次診斷猜錯方向。
  const truncated = isTruncated(finishReason);

  const degraded = {
    parseFailed: !parsed.ok,
    narrationSource: "ai",
    aiOptionCount: 0,
    fallbackOptionCount: 0,
    freeOptionCount: 0,
    truncated,
    finishReason,
  };

  // [2026-08-18] 思維鏈欄位（見 content/turnOptions.js 的 TURN_RESPONSE_SCHEMA）。
  //
  // 這一格**不是給玩家看的**，也**不會進存檔的 history**：它是模型在動筆之前的盤算，
  // 讀起來像後台筆記（「這次是些微失敗，要關掉通風管這條路，並讓她受一道傷」），
  // 印給玩家看等於先劇透這一回合的結局。回傳它只有一個用途：開發時能看出
  // 「模型到底有沒有照著判定結果想事情」，那是調這一層唯一有效的線索。
  //
  // 它也**不是**真理來源：裡面就算寫了數字也一律不採用，判定結果永遠以 checkResult 為準。
  let stThought = null;

  if (parsed.ok) {
    if (typeof parsed.data.narration === "string") narration = parsed.data.narration;
    if (typeof parsed.data.st_thought === "string" && parsed.data.st_thought.trim()) {
      stThought = parsed.data.st_thought.trim();
    }
    const validated = validateOptions(parsed.data.options, character);
    options = validated.options;
    validated.warnings.forEach((w) => warnings.push(w));
    degraded.aiOptionCount = validated.aiOptionCount;
    degraded.fallbackOptionCount = validated.fallbackCount;
    degraded.freeOptionCount = validated.freeOptionCount;
  } else {
    // 降級處理：敘事文字先試著用正則挖出 narration 欄位的純文字
    // （常見成因是輸出被截斷、JSON缺了結尾括號），挖不到才退回顯示整段原始文字。
    // 選項則整批退回 validateOptions()（見該函式），一樣用通用選項墊滿四個，
    // 玩家不會看到「本回合沒有選項」的空版面——這是使用者明確要求的一致性保底。
    const fallbackNarration = extractNarrationFallback(text);
    if (fallbackNarration) {
      narration = fallbackNarration;
      degraded.narrationSource = "ai-extracted";
    } else {
      // 連 narration 欄位都挖不到：至少把AI幻覺出的數字/選項清單切掉，
      // 不要讓「1. 謹慎觀察...」這種選項列表被當成故事內容印給玩家看。
      narration = text.split(/(?:^|\n)\s*(?:1\.|選項[一1])\s/)[0].trim();
      degraded.narrationSource = "ai-raw";
    }
    warnings.push(
      truncated
        ? `AI的回覆在寫到一半時被切斷（finish_reason=${finishReason}），所以JSON不完整。` +
            `這通常代表輸出長度上限太小——請調高 LLM_MAX_TOKENS，或在「系統與文筆設定」把「單次回覆長度上限」調大。` +
            `（會思考的模型特別吃這個額度，因為思考的token也算在上限裡）`
        : `${parsed.error}（已降級為純敘事，改用通用選項墊滿本回合選項）`
    );
    // 解析失敗時把AI原文的前段帶回前端。
    // [2026-08-16] 這一格是被實際經驗逼出來的：先前查這個bug時，回應裡只有「解析失敗」
    // 四個字，看不到模型到底寫了什麼，於是第一次的診斷猜錯了方向（以為是模型不會寫JSON，
    // 實際上是輸出被截斷）。原文是判斷「截斷 vs 格式錯 vs 多包了一層說明文字」的唯一依據，
    // 只在失敗時才出現，正常回合不會多這個欄位。
    degraded.rawSnippet = String(text).slice(0, 300);
    const validated = validateOptions(null, character);
    options = validated.options;
    validated.warnings.forEach((w) => warnings.push(w));
    degraded.aiOptionCount = validated.aiOptionCount;
    degraded.fallbackOptionCount = validated.fallbackCount;
    degraded.freeOptionCount = validated.freeOptionCount;
  }

  // 有任何一個選項是引擎墊的就留 log。整組都是保底(aiOptionCount === 0)時附上AI原文的前段，
  // 因為那正是要拿來判斷「模型是不是根本不會照JSON格式輸出」的唯一線索。
  if (degraded.fallbackOptionCount > 0) {
    logDegradedTurn({
      sessionId: session?.id ?? null,
      provider,
      model,
      parseFailed: degraded.parseFailed,
      aiOptionCount: degraded.aiOptionCount,
      fallbackOptionCount: degraded.fallbackOptionCount,
      allOptionsAreFallback: degraded.aiOptionCount === 0,
      ...(degraded.aiOptionCount === 0
        ? { rawTextSnippet: String(text).slice(0, 400) }
        : {}),
    });
  }

  // ---------------------------------------------------------------------
  // 第三段之後、寫回存檔之前：副本節點結算(這場存檔有掛副本進度時才會跑)。
  //
  // 「AI說了不算」在這裡的意思是：AI只能標記 nodeComplete(見 nodePrompt.js)，
  // 實際能不能結算(前置節點是否真的都完成、有沒有重複結算)、獎勵算多少，
  // 一律由 content/scenario/progress.js 查驗與查表，不接受AI自己講一個數字。
  // ---------------------------------------------------------------------
  let scenarioResult = null;
  // 副本相關的警告要跟一般 warnings 分開帶回前端：玩家可能已經在敘事上完成了一個節點，
  // 但進度條沒動——他有權知道為什麼。一般 warnings 是給開發者看的(進console)，
  // 這一類是給玩家看的(進故事流)，兩者的受眾不同，混在一起只會兩邊都看不到。
  const scenarioWarnings = [];
  if (session?.scenario && scenarioPack) {
    // 從 scenarioProgress 接手（迫近度那一段已經先改過它一次），不要回頭讀 session.scenario.progress，
    // 否則這一回合算出來的迫近度會在寫回存檔時被舊值蓋掉。
    let progress = scenarioProgress;

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
          // 節點獎勵是**獎勵點數**(schema 寫的是「基礎積分獎勵」)，不是XP。
          // 在錢包進存檔之前這裡沒有地方放它，只好塞進 character.xp；現在放回該去的地方。
          // XP 改由副本通關時結算，見 content/scenario/settlement.js 的檔頭。
          const credited = creditNodeReward(session.wallet, result.reward, activeNode.title);
          session.wallet = credited.wallet;
          const ts = new Date().toISOString();
          appendEvent(
            session.log,
            EVENT_TYPES.NODE_COMPLETE,
            { nodeId: activeNode.id, title: activeNode.title, divergenceTier: signal.tier, reward: result.reward },
            { timestamp: ts }
          );
          appendEvent(
            session.log,
            EVENT_TYPES.POINTS_GRANT,
            { total: credited.credited, reason: `完成節點「${activeNode.title}」` },
            { timestamp: ts }
          );
          nodeCompleted = { nodeId: activeNode.id, title: activeNode.title, divergenceTier: signal.tier, reward: result.reward };
        } else {
          // 查驗失敗不當成硬錯誤：AI可能判斷錯了時機，忽略這次信號，遊戲照常繼續。
          // 但要讓玩家看得到——不然他只會覺得「我明明做完了，進度條為什麼不動」。
          console.warn("[SCENARIO_SETTLEMENT_BLOCKED]", JSON.stringify({
            where: "POST /api/turn",
            sessionId: session.id,
            packId: scenarioPack.id,
            nodeId: activeNode.id,
            reason: result.error,
          }));
          scenarioWarnings.push(`本回合的節點結算被引擎擋下：${result.error}`);
        }
      }
    }

    // 玩家真的採取了行動、但這個節點這回合沒有被結算：累計「卡關回合數」，
    // 下一回合的 nodeGuidance 就能看到這個數字、加重「不要原地踏步」的提醒語氣。
    if (tookAction && !nodeCompleted && activeNode) {
      progress = bumpNodeStall(progress, activeNode.id);
    }

    // 副本通關結算：算XP進錢包，並且商店的門在這一刻打開(見 content/shop/access.js)。
    // settleScenario() 自己用 progress.settledAt 擋重複，所以每回合呼叫是安全的——
    // 通關之後玩家還會繼續在主神空間逛，這裡每一輪都會再走一次。
    if (getProgressSummary(scenarioPack, progress).scenarioComplete) {
      const settlement = settleScenario(scenarioPack, progress, character, session.wallet);
      if (settlement.settled) {
        session.wallet = settlement.wallet;
        progress = settlement.progress;
        appendEvent(
          session.log,
          EVENT_TYPES.XP_GRANT,
          { total: settlement.xp, reason: `副本「${scenarioPack.briefing?.title ?? scenarioPack.id}」通關結算`, breakdown: settlement.breakdown },
          { timestamp: new Date().toISOString() }
        );
        scenarioWarnings.push(
          `副本通關結算：獲得 ${settlement.xp} XP。回到主神空間，商店已開放。`
        );
      }
    }

    session.scenario = { packId: scenarioPack.id, progress };

    // 注意：這裡重新用「結算完這回合之後」的 progress 算一次 activeNode，不是沿用
    // 這回合開頭那個(拿去組prompt指引的)舊值——如果這回合剛好完成了一個節點，
    // 玩家應該立刻在這次回應裡看到「下一個節點/最終戰」，不用再多打一輪才看到更新。
    const nextActiveNode = findActiveNode(scenarioPack, progress);
    scenarioResult = {
      activeNode: nextActiveNode
        ? {
            id: nextActiveNode.id,
            title: nextActiveNode.title,
            // 玩家看得到的目標。節點標題（「母親的特別指令」）對還沒玩到那裡的人
            // 是一句謎語，光看標題不知道要幹嘛——測玩回饋正是卡在這裡。
            goal: nextActiveNode.playerGoal ?? null,
            isFinale: Boolean(nextActiveNode.isFinale),
          }
        : null,
      // 副本簡介：常駐顯示，讓玩家玩到第十回合還記得自己在哪艘船上、為什麼不能待著不動。
      briefing: scenarioPack.briefing ?? null,
      nodeCompleted,
      progress: getProgressSummary(scenarioPack, progress),
      // 迫近度：前端拿它畫HUD，玩家看得到「這一格是我剛剛失敗推上來的」。
      threat: {
        ...threatSummary(progress.threat, scenarioPack.threatTrack),
        ...(threatChange
          ? { delta: threatChange.delta, before: threatChange.before, escalated: threatChange.escalated }
          : {}),
      },
      ...(scenarioWarnings.length ? { warnings: scenarioWarnings } : {}),
    };
  }

  // 選項標上「如果現在選它，會吃到多少套路懲罰」。必須在存檔與回應之前做，
  // 因為玩家要在**按下去之前**就看得到代價——按完才發現DC變高，那是懲罰玩家不是設計。
  options = annotateRetread(options, session?.scenario?.progress ?? scenarioProgress);

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
    // 這一輪的內容來源。前端靠它顯示「保底內容」提示（見 public/app.js 的 renderTurnQuality）。
    degraded,
    // 說書人的後台盤算（思維鏈）。**前端不可以把它印進故事流**，它只是開發用的檢視窗口。
    stThought,
    // 角色目前的傷勢閘門狀態。每一回合都附上，前端才能持續顯示昏迷/死亡，
    // 而不是只有在玩家撞到閘門的那一次才知道。
    downState: getDownState(character),
    scenario: scenarioResult,
    turnCount: session?.log?.events?.length ?? 0,
    warnings,
  });
}

/**
 * 組這一回合要送給AI的訊息。
 * 開場模式沒有判定結果，所以不能用 buildTurnPrompt()（它會要求 outcome 必填）。
 */
function buildPrompt({
  actionText,
  outcome,
  freeAction = false,
  personaKey = null,
  sceneContext,
  recentEvents,
  recentNarration,
  character,
  nodeGuidance,
  dmMemo,
  threatDirective,
  retreadDirective,
}) {
  const optionsSpec = buildOptionsSpec(character);
  const threatBlock = threatDirective ? `\n\n${threatDirective}` : "";
  const retreadBlock = retreadDirective ? `\n\n${retreadDirective}` : "";
  const tail = `${threatBlock}${retreadBlock}${nodeGuidance ? `\n\n${nodeGuidance}` : ""}`;
  const dmMemoBlock = dmMemo ? `\n\n${dmMemo}` : ""; // [新增] 表格區塊

  // 把JSON格式的強制指令釘在整個prompt的最後一行：模型看到的最後一句話就是這個，
  // 前面內容再長也不會被忘記——比只放在system instruction裡更難被忽略。
  const jsonReminder = `\n\n【系統強制指令】\n你的回覆必須是單一個合法的 JSON 物件，請直接以 { 開頭並以 } 結尾。絕對不要輸出 Markdown (\`\`\`json) 或其他閒聊文字！`;

  // 純敘事行動（requiresCheck:false）：有玩家行動、沒有判定結果。
  // 不能走底下的開場分支（那一段會完全忽略 actionText，把玩家的選擇吃掉），
  // 也不能走 buildTurnPrompt（它要求 outcome 必填，硬給就是引擎在編一個不存在的判定）。
  if (!outcome && freeAction && actionText) {
    const freePrompt = buildFreeActionPrompt({
      playerAction: actionText,
      sceneContext,
      recentEvents,
      recentNarration,
      ...(personaKey ? { personaKey } : {}),
    });
    return `${freePrompt}${dmMemoBlock}\n\n${optionsSpec}${tail}${jsonReminder}`;
  }

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
    ...(personaKey ? { personaKey } : {}),
  });

  // [修改] 把狀態表格接在後面
  return `${turnPrompt}${dmMemoBlock}\n\n${optionsSpec}${tail}${jsonReminder}`;
}

/**
 * 幫每個選項標上「如果現在選它，會吃到多少套路懲罰」（見 content/scenario/repetition.js）。
 *
 * 只標有懲罰的那些，沒懲罰的選項原樣傳回——按鈕上多一個「DC+0」的標籤只是雜訊。
 * 這份預告用的是伺服器自己的紀錄，實際擲骰時會再算一次，兩邊同一個函式，不會對不上。
 */
function annotateRetread(options, progress) {
  if (!progress || !Array.isArray(options)) return options;
  return options.map((opt) => {
    const preview = peekRetread(progress, { attribute: opt.attribute, skill: opt.skill });
    if (preview.dcPenalty <= 0) return opt;
    return {
      ...opt,
      retread: {
        consecutive: preview.consecutive,
        dcPenalty: preview.dcPenalty,
        label: retreadLabel(preview),
      },
      effectiveDc: (opt.dc ?? 0) + preview.dcPenalty,
    };
  });
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

/**
 * 這次的回覆是不是「寫到一半被切斷」。
 *
 * 各家的欄位值不一樣但意思相同：OpenAI相容是 finish_reason: "length"，
 * Gemini 是 finishReason: "MAX_TOKENS"。兩者都代表「模型還想繼續寫，是我們不給它額度」。
 */
function isTruncated(finishReason) {
  if (typeof finishReason !== "string") return false;
  const normalized = finishReason.toLowerCase();
  return normalized === "length" || normalized === "max_tokens";
}
