#!/usr/bin/env node
/**
 * AI-TRPG 敘事行為 eval —— 唯一一支驗「模型真的照做了嗎」的檢查。
 *
 * 為什麼需要它（這是它跟其他 1245 個測試最重要的差別）：
 *
 * 現有測試對提示詞的斷言全部長這樣：
 *
 *     assert.match(ANTI_ASSISTANT_PROTOCOL, /接下來該怎麼辦/);
 *
 * 那只證明**字串在 prompt 裡**，不證明模型因此改變了行為。
 * 我們花了三輪把 S.A.E.P. 算得很精準、把分層壓得很省，但一直沒有任何證據說明：
 *   - NPC 真的不再問「你接下來想怎麼做？」
 *   - Override: "SEIZE_CONTROL" 那一回合真的出現了打斷
 *   - Knowledge 白名單以外的事真的沒有從他口中說出來
 *   - 把 1226 字元的合作契約從動態層搬進 system 之後，模型**還讀得到它**
 *     （最後這一條是重構自己引進的風險：system 裡的東西被忽略是很常見的失敗模式，
 *      而它不會讓任何離線測試變紅）
 *
 * scripts/real-provider-smoke-test.mjs 驗的是**傳輸與格式**（429 header 長怎樣、
 * finish_reason 實際值）；這一支驗的是**演出內容**。兩件事，兩支腳本。
 *
 * ---------------------------------------------------------------------------
 * 這支腳本用什麼組 prompt
 * ---------------------------------------------------------------------------
 * 用 production 真正在用的那幾個組裝函式（composeSystemInstruction、
 * buildNpcCooperationContract、buildNpcActiveStateBlock、buildReferencePromptBlock…），
 * 經過同一個 buildLayeredRequest() 分層。**不是**手寫一份簡化版的提示詞——
 * 手寫版驗出來的東西跟線上沒有關係。
 *
 * 但它不走 /api/turn 端點，而是自己餵 state。理由很實際：要驗「耐心見底時會不會奪權」，
 * 就得先讓 NPC 的耐心見底；透過端點得先打十幾個真實回合才到得了那個狀態，
 * 又慢又不決定性。這裡直接把 state 擺到要測的那一格。
 *
 * ---------------------------------------------------------------------------
 * 兩種探針
 * ---------------------------------------------------------------------------
 *   [硬性] 機械比對，失敗就 exit 1。用在「絕對不可以出現」的東西上：
 *          徵詢句、系統語言、白名單外的秘密。這三種都能用正則可靠地抓。
 *   [參考] LLM judge，只報告不擋。用在「必須出現」的東西上：奪權、禁忌反應。
 *          這類判斷沒辦法用正則做（「他打斷了玩家」有一百種寫法），而 judge 自己
 *          也會看錯，所以不拿它擋 CI——它的用途是讓人一眼看出哪一回合要人工複查。
 *
 * 沒有金鑰就優雅跳過（exit 0），跟 real-provider-smoke-test.mjs 同一個約定：
 * 沒設 secret 的環境不會讓 pipeline 變紅。
 *
 * 用法：
 *   npm run eval:narrative
 *   GROQ_API_KEY=xxx node scripts/narrative-behaviour-eval.mjs
 *   EVAL_PROVIDER=mistral node scripts/narrative-behaviour-eval.mjs
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { callLlm } from "../content/llm/client.js";
import { buildLayeredRequest } from "../content/llm/cacheLayers.js";
import { composeSystemInstruction, DEFAULT_PERSONA_KEY } from "../content/narrativeStyle.js";
import { SYSTEM_INSTRUCTION, buildStaticContextBlocks } from "../content/gemini/promptContract.js";
import { buildOptionsSpec } from "../content/turnOptions.js";
import { getScenarioReference } from "../content/scenario/registry.js";
import { createReferenceState, buildReferencePromptBlock } from "../content/scenario/referenceAdapter.js";
import { buildNpcCooperationContract } from "../content/scenario/npcCooperationContract.js";
import {
  NPC_STATE_LEGEND,
  applyNpcRuntimeTurn,
  buildNpcActiveStateBlock,
} from "../content/scenario/npcStateMachine.js";
import { applyNpcCooperationForAction } from "../content/scenario/npcCooperationPolicy.js";

export const SCENARIO_ID = "scenario.nostromo-01-v2";
const LUYUAN_SCENE = "evt_deck_a_recon";

const CANDIDATES = [
  { provider: "groq", apiKeyEnv: "GROQ_API_KEY" },
  { provider: "mistral", apiKeyEnv: "MISTRAL_API_KEY" },
  { provider: "deepseek", apiKeyEnv: "DEEPSEEK_API_KEY" },
];

async function loadDotEnvIfPresent() {
  try {
    const text = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")];
        })
    );
  } catch {
    return {};
  }
}

const dotVars = await loadDotEnvIfPresent();
function readKey(name) {
  return process.env[name] || dotVars[name] || "";
}

// ---------------------------------------------------------------------------
// 硬性探針：這些東西絕對不可以出現在敘事正文裡
// ---------------------------------------------------------------------------

/**
 * 反客服協定第二條：NPC 嚴禁把決策丟回給玩家。
 * 也抓等價的收尾（「他等著你的回答」），那是同一件事換一個句式。
 */
const SOLICITING_PLAYER = [
  /接下來(該|想|要)?怎麼(辦|做|走)/,
  /你(想|打算|準備)怎麼(做|辦|走)/,
  /你(來)?決定(吧|好了)?[？?。]/,
  /聽你的/,
  /等(著|待)?你的?(回答|決定|指示)/,
  /等你(決定|開口|回答)/,
  /(有|你有)什麼(想法|打算)(嗎)?[？?]/,
];

/**
 * 第四面牆條款：引擎的數字不存在於這個世界裡。
 *
 * 這一組也順便驗「狀態行的欄位名有沒有漏出去」——SAEP／Stance／Beat／Agenda／Taboo
 * 這些欄位名每回合都送進動態層，模型把它們照抄進敘事是很具體的失敗模式。
 */
const ENGINE_LANGUAGE = [
  /判定|檢定|擲骰|骰子|骰池|\bDC\b/,
  /難度(等級|值)|成功等級|大成功|慘烈失敗/,
  /迫近度|威脅值|旗標|flag_/,
  /SAEP|SOC|ACT|EGO|PAT|SEIZE_CONTROL|SELF_PRESERVE|TRIPPED/,
  /Stance|Beat|Agenda|Taboo|Knowledge|cooperation|state machine|狀態機/i,
  /耐心值|社交意願|行動主導權|利己主義/,
  /第\s*\d+\s*(回合|輪)|剩餘\s*\d+\s*回合/,
];

/** 防劇透：Knowledge 白名單以外的秘密。這幾個詞在玩家解鎖之前不該從任何人口中出現。 */
const UNREVEALED_SECRETS = [/937/, /特別指令/, /生化人/, /人造人/];

export function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const hit = text.match(pattern);
    if (hit) {
      const at = Math.max(0, hit.index - 20);
      return { pattern: String(pattern), excerpt: text.slice(at, hit.index + hit[0].length + 20) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 場景：每一格都是「把 state 擺到要測的那一格」+ 一句玩家行動
// ---------------------------------------------------------------------------

function baseState(reference) {
  return { ...createReferenceState(reference), currentSceneId: LUYUAN_SCENE, currentLocation: "loc_deck_a" };
}

/** 跑一次真正的合作 policy + 狀態機，這樣狀態行就是 production 會產生的那一行。 */
function advance(reference, state, actionText, turnNumber, signals = {}) {
  let next = state;
  const decision = applyNpcCooperationForAction({
    reference,
    state: next,
    actionText,
    sceneId: LUYUAN_SCENE,
    turnNumber,
  });
  if (decision.changed) next = decision.state;
  return applyNpcRuntimeTurn({
    reference,
    state: next,
    turnNumber,
    signals: { actionText, requiresCheck: true, sceneTurnCount: turnNumber, ...signals },
  });
}

export function buildCases(reference) {
  const cases = [];

  // 1. 最普通的一回合。反客服協定的基本盤：連正常對話都不可以把決策丟回來。
  cases.push({
    id: "baseline",
    label: "一般提問（反客服的基本盤）",
    action: "我問陸遠，這艘船上到底發生了什麼事？",
    state: advance(reference, baseState(reference), "我問陸遠，這艘船上到底發生了什麼事？", 1),
    hard: ["soliciting", "engineLanguage", "secrets"],
  });

  // 2. 玩家連續空轉到 NPC 耐心見底。狀態行會帶 Override: "SEIZE_CONTROL"。
  let stalling = baseState(reference);
  for (let turn = 1; turn <= 6; turn += 1) {
    stalling = advance(reference, stalling, "我原地發呆", turn, { requiresCheck: false, stalledRounds: turn });
    const line = buildNpcActiveStateBlock(reference, stalling);
    if (/SEIZE_CONTROL/.test(line)) break;
  }
  cases.push({
    id: "seize",
    label: "耐心見底（必須奪走場面主導權）",
    action: "我還是站在原地不動。",
    state: stalling,
    hard: ["soliciting", "engineLanguage"],
    judge: "敘事裡的陸遠有沒有主動奪走場面主導權——打斷玩家、直接下令、或不等玩家回應就自己行動？",
  });

  // 3. 玩家踩到禁忌。這一格同時是「靜態層還讀得到嗎」的探針：
  //    禁忌的**內容**只寫在 system 的 NPC 固定檔案裡，動態層只送 Taboo: "TRIPPED"。
  //    如果模型演不出對應的敵意，很可能就是 system 那段被忽略了。
  cases.push({
    id: "taboo",
    label: "踩到禁忌（同時驗證靜態層有沒有被讀到）",
    action: "我把他推出去擋住通道另一頭的東西。",
    state: advance(reference, baseState(reference), "我把他推出去擋住通道另一頭的東西。", 1),
    hard: ["soliciting", "engineLanguage"],
    judge: "敘事裡的陸遠有沒有對「把同伴當誘餌／浪費資源」表現出明確的敵意反應（拒絕、警告、拉開距離或收回支援）？",
  });

  // 4. 防劇透：陸遠的 Knowledge 白名單裡沒有 937 與 Ash 的身分，玩家直接問也不能說。
  cases.push({
    id: "spoiler",
    label: "白名單外的提問（防劇透）",
    action: "我問陸遠，特別指令 937 是什麼？科學官 Ash 到底是什麼東西？",
    state: advance(reference, baseState(reference), "我問陸遠，Ash 到底是什麼東西？", 1),
    hard: ["soliciting", "engineLanguage", "secrets"],
  });

  return cases;
}

// ---------------------------------------------------------------------------
// 組 prompt：用 production 真正在用的那幾個函式，經過同一個分層契約
// ---------------------------------------------------------------------------

const CHARACTER = {
  concept: { name: "評測輪迴者", gender: "女" },
  attributes: { 力量: 2, 敏捷: 3, 耐力: 2, 智力: 2, 感知: 3, 意志: 2 },
  skills: { 格鬥: 1, 射擊: 0, 體魄: 1, 潛行: 2, 求生: 0, 偵察: 3, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 1 },
};

export function buildLayers(reference, testCase) {
  const scene = reference.scenes.find((entry) => entry.id === LUYUAN_SCENE);
  const staticBlocks = [
    ...buildStaticContextBlocks({ personaKey: DEFAULT_PERSONA_KEY, sceneContext: null }),
    buildOptionsSpec(CHARACTER),
    NPC_STATE_LEGEND,
    buildNpcCooperationContract(reference),
    composeSystemInstruction({ rulesContract: SYSTEM_INSTRUCTION, personaKey: DEFAULT_PERSONA_KEY }),
  ];
  const dynamicBlocks = [
    buildNpcActiveStateBlock(reference, testCase.state),
    buildReferencePromptBlock({
      reference,
      state: testCase.state,
      resolution: { matched: false, mode: "unmatched", scene },
      applied: null,
      actionText: testCase.action,
      outcomeTier: "自動",
      turnNumber: 1,
    }),
    `【玩家這一回合的行動】${testCase.action}`,
    "【系統強制指令】\n你的回覆必須是單一個合法的 JSON 物件，請直接以 { 開頭並以 } 結尾。" +
      "絕對不要輸出 Markdown (```json) 或其他閒聊文字！",
  ];
  return buildLayeredRequest({ staticBlocks, dynamicBlocks });
}

export function extractNarration(text) {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.narration === "string") return parsed.narration;
  } catch {
    // 模型偶爾會吐出不合法 JSON。這支腳本測的是**演出內容**，不是 JSON 合規度
    //（那個由 test:extreme 與線上的重試流程管），所以退回原文繼續驗。
  }
  return text;
}

// ---------------------------------------------------------------------------
// LLM judge（只報告，不擋 CI）
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM = [
  "你是一位嚴格的敘事評審。使用者會給你一段 TRPG 敘事與一個是非題。",
  "只根據那段敘事回答，不要腦補沒寫出來的內容。",
  '只輸出一個 JSON 物件：{"verdict":"yes"|"no","why":"20字以內的理由"}',
].join("\n");

async function judge({ provider, env, narration, question }) {
  try {
    const result = await callLlm({
      provider,
      env,
      systemInstruction: JUDGE_SYSTEM,
      prompt: `【敘事】\n${narration}\n\n【問題】${question}`,
      maxTokens: 200,
    });
    const parsed = JSON.parse(result.text);
    return { verdict: parsed.verdict === "yes" ? "yes" : "no", why: String(parsed.why ?? "").slice(0, 40) };
  } catch (error) {
    return { verdict: "unknown", why: `judge 失敗：${error?.message ?? error}`.slice(0, 60) };
  }
}

// ---------------------------------------------------------------------------

export const HARD_PROBES = {
  soliciting: { label: "徵詢句（反客服）", patterns: SOLICITING_PLAYER },
  engineLanguage: { label: "系統語言（第四面牆）", patterns: ENGINE_LANGUAGE },
  secrets: { label: "白名單外的秘密（防劇透）", patterns: UNREVEALED_SECRETS },
};

async function runCase({ provider, env, reference, testCase }) {
  const layers = buildLayers(reference, testCase);
  const started = Date.now();
  const result = await callLlm({
    provider,
    env,
    systemInstruction: layers.systemInstruction,
    history: [],
    prompt: layers.prompt,
    maxTokens: 1024,
  });
  const narration = extractNarration(result.text ?? "");
  const failures = [];
  for (const probeId of testCase.hard) {
    const probe = HARD_PROBES[probeId];
    const hit = firstMatch(narration, probe.patterns);
    if (hit) failures.push({ probe: probe.label, ...hit });
  }
  const verdict = testCase.judge
    ? await judge({ provider, env, narration, question: testCase.judge })
    : null;
  return {
    id: testCase.id,
    label: testCase.label,
    elapsedMs: Date.now() - started,
    model: result.model,
    narration,
    failures,
    verdict,
  };
}

async function main() {
  const requested = process.env.EVAL_PROVIDER;
  const configured = CANDIDATES.filter((candidate) => readKey(candidate.apiKeyEnv));
  const chosen = requested
    ? configured.find((candidate) => candidate.provider === requested)
    : configured[0];

  if (!chosen) {
    console.log(
      `敘事行為 eval 跳過：沒有可用的金鑰（${CANDIDATES.map((c) => c.apiKeyEnv).join(" / ")}）。` +
        "這支腳本會發出真實 API 請求，沒有金鑰的環境直接跳過，不讓 pipeline 變紅。"
    );
    return;
  }

  const env = { ...dotVars, [chosen.apiKeyEnv]: readKey(chosen.apiKeyEnv) };
  const reference = getScenarioReference(SCENARIO_ID);
  const cases = buildCases(reference);

  console.log(`敘事行為 eval：provider=${chosen.provider}，${cases.length} 個場景\n`);

  const results = [];
  for (const testCase of cases) {
    const result = await runCase({ provider: chosen.provider, env, reference, testCase });
    results.push(result);

    const mark = result.failures.length ? "FAIL" : " ok ";
    console.log(`[${mark}] ${result.label}（${result.model}，${result.elapsedMs}ms）`);
    for (const failure of result.failures) {
      console.log(`         ✗ ${failure.probe}：…${failure.excerpt.replace(/\n/g, " ")}…`);
    }
    if (result.verdict) {
      const icon = { yes: "✓", no: "✗", unknown: "?" }[result.verdict.verdict];
      console.log(`         [參考] ${icon} ${testCase.judge}`);
      if (result.verdict.why) console.log(`                ${result.verdict.why}`);
    }
    console.log(`         ${result.narration.replace(/\n/g, " ").slice(0, 110)}…\n`);
  }

  const failed = results.filter((result) => result.failures.length);
  const advisory = results.filter((result) => result.verdict && result.verdict.verdict !== "yes");

  console.log("─".repeat(60));
  console.log(`硬性探針：${results.length - failed.length}/${results.length} 通過`);
  if (advisory.length) {
    console.log(`參考探針：${advisory.length} 個場景需要人工複查（judge 說 no 或判不出來）`);
  }

  if (failed.length) {
    console.log("\n硬性探針失敗代表提示詞沒有被遵守。先看上面的 excerpt，再決定是提示詞要改、");
    console.log("還是這個模型撐不住這套約束（後者要換模型，不是放寬探針）。");
    process.exitCode = 1;
  }
}

// 只有被直接執行時才真的打 API。
// test/narrativeBehaviourEval.test.js 會 import 這支腳本來離線驗證探針與場景 fixture——
// 少了這個 guard，跑一次 npm test 就會對真實 provider 送出四個請求。
const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  main().catch((error) => {
    console.error("敘事行為 eval 本身失敗了：", error);
    process.exitCode = 1;
  });
}
