import { readFile, writeFile } from "node:fs/promises";
import { emptyCharacter } from "../core/schema.js";
import { onRequestPost as createSession, onRequestGet as getSession } from "../functions/api/session.js";
import { onRequestPost as playTurn } from "../functions/api/turn.js";

function loadDotEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
      })
  );
}

function request(body) {
  return new Request("https://real-gemini-test.local/api/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json(response) {
  return { status: response.status, body: await response.json() };
}

function compactTurn(label, response) {
  const body = response.body;
  return {
    label,
    status: response.status,
    ok: body.ok ?? false,
    provider: body.provider ?? null,
    model: body.model ?? null,
    narration: body.narration ?? null,
    narrationSource: body.degraded?.narrationSource ?? null,
    narrativeSafety: body.degraded?.narrativeSafety ?? null,
    freeActionContract: body.degraded?.freeActionContract ?? null,
    llmCallsUsed: body.degraded?.narrativeSafety?.rewriteAttempted ? 2 : (body.provider ? 1 : 0),
    finishReason: body.degraded?.finishReason ?? null,
    truncated: body.degraded?.truncated ?? null,
    check: body.checkResult ? {
      attribute: body.checkResult.attribute,
      skill: body.checkResult.skill,
      difficulty: body.checkResult.difficulty,
      successes: body.checkResult.totalSuccesses,
    } : null,
    outcome: body.outcome?.tier ?? null,
    eventId: body.scenario?.reference?.eventId ?? null,
    location: body.scenario?.reference?.location ?? null,
    sceneTurnCount: body.scenario?.reference?.sceneTurnCount ?? null,
    narrativeMode: body.narrativeMode ?? body.scenario?.narrativeMode ?? null,
    threat: body.scenario?.threat ? {
      level: body.scenario.threat.level,
      delta: body.scenario.threat.delta ?? null,
      contact: body.scenario.threat.contact ?? false,
    } : null,
    threatAssessment: body.scenario?.threatAssessment ?? null,
    options: (body.options ?? []).map((option) => ({
      label: option.label,
      hint: option.hint,
      source: option.source ?? null,
      approachId: option.reference?.approachId ?? null,
      requiresCheck: option.requiresCheck,
    })),
    warnings: body.scenario?.warnings ?? body.warnings ?? [],
    error: body.error ?? null,
  };
}

function findOption(body, approachId) {
  return (body.options ?? []).find((option) => option.reference?.approachId === approachId);
}

const env = loadDotEnv(await readFile(new URL("../.dev.vars", import.meta.url), "utf8"));
if (process.env.REAL_GEMINI_JSON_MODE) env.LLM_JSON_MODE = process.env.REAL_GEMINI_JSON_MODE;
if (process.env.REAL_GEMINI_TIMEOUT_MS) env.LLM_REQUEST_TIMEOUT_MS = process.env.REAL_GEMINI_TIMEOUT_MS;
if (!env.LLM_API_KEY || !env.LLM_BASE_URL || !env.LLM_MODEL) {
  throw new Error(".dev.vars 必須包含 LLM_API_KEY、LLM_BASE_URL 與 LLM_MODEL");
}

const results = [];
const created = await json(await createSession({
  request: new Request("https://real-gemini-test.local/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ character: emptyCharacter("Gemini 真實測試者"), scenarioId: "scenario.nostromo-01-v2" }),
  }),
  env,
}));
if (created.status !== 200 || !created.body.ok) throw new Error(`建立測試 session 失敗：${created.body.error ?? JSON.stringify(created.body)}`);
const sessionId = created.body.session.id;

const opening = await json(await playTurn({ request: request({ sessionId }), env }));
results.push(compactTurn("opening_fixed", opening));
const recon = findOption(opening.body, "app_cryo_recon");
if (!recon) throw new Error("開場沒有找到 app_cryo_recon");

const afterRecon = await json(await playTurn({ request: request({ sessionId, chosenOption: recon }), env }));
results.push(compactTurn("cryo_recon_real_gemini", afterRecon));

const luyuanContact = findOption(afterRecon.body, "app_deck_luyuan_contact");
if (!luyuanContact) throw new Error(`偵察後沒有找到陸遠交涉 approach；目前事件是 ${afterRecon.body.scenario?.reference?.eventId}`);
const afterDeck = await json(await playTurn({ request: request({ sessionId, chosenOption: luyuanContact }), env }));
results.push(compactTurn("deck_luyuan_contact_real_gemini", afterDeck));

const scienceRoute = findOption(afterDeck.body, "app_deck_to_science");
if (!scienceRoute) throw new Error(`A甲板沒有找到前往科學區的 approach；目前事件是 ${afterDeck.body.scenario?.reference?.eventId}`);
const afterScience = await json(await playTurn({ request: request({ sessionId, chosenOption: scienceRoute }), env }));
results.push(compactTurn("enter_science_real_gemini", afterScience));

const ashTalk = findOption(afterScience.body, "app_ash_talk_quarantine");
if (!ashTalk) throw new Error(`進入科學區後沒有找到 Ash 交涉 approach；目前事件是 ${afterScience.body.scenario?.reference?.eventId}`);
const afterAsh = await json(await playTurn({ request: request({ sessionId, chosenOption: ashTalk }), env }));
results.push(compactTurn("ash_quarantine_dialogue", afterAsh));

const free = await json(await playTurn({
  request: request({ sessionId, playerAction: "我敲擊實驗台邊緣三下，然後不說話，等待船艦或 Ash 先暴露反應。" }),
  env,
}));
results.push(compactTurn("ash_unmatched_free_action", free));

const major = await json(await playTurn({
  request: request({ sessionId, playerAction: "我抓起桌邊的工具，拆解旁側維修面板，準備從維修通道繞開封鎖並帶走需要的資料。" }),
  env,
}));
results.push(compactTurn("ash_major_free_action", major));

const loaded = await json(await getSession({ request: new Request(`https://real-gemini-test.local/api/session?id=${sessionId}`), env }));
const summary = {
  generatedAt: new Date().toISOString(),
  sessionId,
  configuredProvider: env.LLM_PROVIDER ?? "auto",
  configuredModel: env.LLM_MODEL,
  configuredBaseUrl: env.LLM_BASE_URL,
  jsonMode: env.LLM_JSON_MODE ?? "provider-default",
  callsWithLLM: results.reduce((sum, result) => sum + (result.llmCallsUsed ?? (result.provider ? 1 : 0)), 0),
  turns: results,
  persisted: loaded.status === 200 && loaded.body.ok ? {
    historyLength: loaded.body.session.history?.length ?? 0,
    referenceActionCount: loaded.body.session.log?.events?.filter((event) => event.type === "reference_action").length ?? 0,
    currentEventId: loaded.body.session.scenario?.referenceState?.currentSceneId ?? null,
    currentSceneTurnCount: loaded.body.session.scenario?.referenceState?.sceneTurnCount ?? null,
  } : { error: loaded.body.error ?? "讀取失敗" },
};
await writeFile(new URL("../REAL_GEMINI_V2_INTERACTION_RESULTS.json", import.meta.url), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  ok: true,
  sessionId,
  configuredProvider: summary.configuredProvider,
  configuredModel: summary.configuredModel,
  callsWithLLM: summary.callsWithLLM,
  turns: results.map(({ label, status, ok, eventId, location, sceneTurnCount, outcome, threat, threatAssessment, narration, narrationSource, narrativeSafety, freeActionContract, llmCallsUsed, finishReason, truncated, error }) => ({ label, status, ok, eventId, location, sceneTurnCount, outcome, threat, threatAssessment, narration, narrationSource, narrativeSafety, freeActionContract, llmCallsUsed, finishReason, truncated, error })),
  persisted: summary.persisted,
  resultFile: "REAL_GEMINI_V2_INTERACTION_RESULTS.json",
}, null, 2));
