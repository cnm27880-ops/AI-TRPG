// Server-authoritative V2 exploration travel。
// 客戶端只能提出目的地；目前位置、路線、前置條件、時間與威脅全部由這裡查驗。
// 移動不呼叫 LLM，也不讓玩家用自由文字改寫 location 或 reference state。

import { resolveSessionStore, pushHistory } from "../../content/storage/sessionStore.js";
import { getCurrentUser } from "../../content/auth/sessionToken.js";
import { canAccessSession } from "../../content/auth/ownership.js";
import { getDownState } from "../../content/downState.js";
import { appendChronicle } from "../../content/storage/chronicle.js";
import { appendEvent, EVENT_TYPES } from "../../core/eventLog.js";
import { getScenarioPack, getScenarioReference, isRetiredScenarioId } from "../../content/scenario/registry.js";
import { spendChapterTime } from "../../content/scenario/progress.js";
import { isExpired, timeStatus } from "../../content/scenario/timeBudget.js";
import { applyDirectThreatDelta, threatSummary } from "../../content/scenario/threat.js";
import { scenarioHudView } from "../../content/scenario/hudView.js";
import {
  normalizeReferenceState,
  referenceStateForResponse,
  buildReferenceOptions,
} from "../../content/scenario/referenceAdapter.js";
import {
  resolveTravelAction,
  applyTravelAction,
  publicExplorationDiscoveries,
  publicUnresolvedQuestions,
  travelRiskLabel,
} from "../../content/scenario/explorationState.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function error(body, status) {
  return json({ ok: false, ...body }, status);
}

function publicTimeBudget(budget) {
  if (!budget) return null;
  return {
    totalRounds: budget.totalRounds,
    spentRounds: budget.spentRounds,
    remainingRounds: Math.max(0, budget.totalRounds - budget.spentRounds),
    status: timeStatus(budget),
    expired: isExpired(budget),
  };
}

function changedQuestionStates(before, after) {
  const beforeMap = new Map((before ?? []).map((item) => [item.id, item.status]));
  return (after ?? [])
    .filter((item) => beforeMap.get(item.id) !== item.status)
    .map((item) => ({ id: item.id, status: item.status }));
}

export async function onRequestPost(context) {
  const env = context.env ?? {};
  const store = resolveSessionStore(env);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return error({ error: "請求 body 必須是合法 JSON" }, 400);
  }

  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  if (!sessionId || !to) return error({ error: "body 必須包含 sessionId 與目的地 to" }, 400);
  if (to.length > 80) return error({ error: "目的地格式不合法" }, 400);

  const session = await store.get(sessionId);
  if (!session) return error({ error: `找不到存檔 ${sessionId}` }, 404);
  if (!canAccessSession(session, await getCurrentUser(context.request, env))) {
    return error({ error: `找不到存檔 ${sessionId}` }, 404);
  }
  if (isRetiredScenarioId(session.scenario?.packId)) {
    return error({
      retiredScenario: true,
      scenarioId: session.scenario.packId,
      error: "這份存檔使用已退役的 V1 異形副本，不能進入舊文字流程；請重新開始 V2《異形：生化深淵》。",
    }, 410);
  }

  const pack = session.scenario ? getScenarioPack(session.scenario.packId) : null;
  const reference = getScenarioReference(pack);
  if (!pack || !reference || reference.sourcePackId !== "scenario.nostromo-01-v2") {
    return error({ error: "目前只有 V2 異形副本支援 server-authoritative exploration travel。" }, 409);
  }
  if (session.pendingTurn) {
    return error({
      code: "PENDING_TURN",
      error: "上一個敘事回合尚未完成，請先重試或完成上一回合，不能先移動。",
      pendingTurn: true,
    }, 409);
  }
  if (session.combat?.active || session.scenario.progress?.pendingCombat) {
    return error({
      code: "COMBAT_REQUIRED",
      combatRequired: true,
      error: "異形已經接觸玩家，必須先進入戰鬥，不能繼續普通移動。",
    }, 409);
  }

  const downState = getDownState(session.character);
  if (!downState.canAct) {
    return error({
      code: downState.dead ? "REVIVAL_REQUIRED" : "DOWNED",
      error: downState.reason,
      downState,
      revival: downState.dead ? "角色已死亡，不能在副本中繼續移動。" : null,
    }, 409);
  }

  const progress = session.scenario.progress;
  const budget = progress?.timeBudget ?? null;
  if (!budget) return error({ code: "NO_TIME_BUDGET", error: "這個副本沒有可用的時間預算。" }, 409);
  if (isExpired(budget)) {
    return error({ code: "TIME_EXPIRED", error: "副本效率回合已耗盡，不能再移動。", timeBudget: publicTimeBudget(budget) }, 409);
  }

  const referenceState = normalizeReferenceState(reference, session.scenario.referenceState);
  const resolution = resolveTravelAction(reference, referenceState, to);
  if (!resolution.ok) {
    return error({
      code: resolution.code,
      error: resolution.error,
      ...(resolution.missingFlags?.length ? { missingFlags: resolution.missingFlags } : {}),
      scenario: {
        ...scenarioHudView(pack, progress),
        reference: referenceStateForResponse(reference, referenceState),
      },
    }, 409);
  }

  const remaining = budget.totalRounds - budget.spentRounds;
  if (remaining < resolution.timeCost) {
    return error({
      code: "TIME_INSUFFICIENT",
      error: `移動需要 ${resolution.timeCost} 回合，但目前只剩 ${Math.max(0, remaining)} 回合。`,
      timeBudget: publicTimeBudget(budget),
    }, 409);
  }

  const beforeQuestions = referenceState.unresolvedQuestions ?? [];
  const beforeDiscoveries = referenceState.recentDiscoveries ?? [];
  const travelResult = applyTravelAction(reference, referenceState, resolution);
  if (!travelResult.applied) return error({ error: travelResult.error }, 409);

  const nextProgressBeforeThreat = spendChapterTime(progress, resolution.timeCost, "船艦移動");
  const threatChange = applyDirectThreatDelta(nextProgressBeforeThreat.threat, resolution.risk.threatDelta);
  const nextProgress = {
    ...nextProgressBeforeThreat,
    threat: threatChange.track,
    pendingCombat: Boolean(nextProgressBeforeThreat.pendingCombat || threatChange.contact),
  };
  const nextReferenceState = travelResult.state;
  const nextOptions = buildReferenceOptions(reference, nextReferenceState);
  const turn = (session.turns ?? 0) + 1;
  const timestamp = new Date().toISOString();
  const targetName = resolution.target.name ?? resolution.to;
  const travelAction = `移動至${targetName}`;
  const systemNarration = travelResult.arrivalText ?? resolution.nextScene?.narrativeSource?.entryText ?? `你抵達${targetName}。`;
  const warnings = [...resolution.risk.notes];
  if (isExpired(nextProgress.timeBudget)) warnings.push("這次移動用盡了副本效率回合；下一步必須接受時間耗盡的後果。");
  if (threatChange.contact) warnings.push("迫近度已達接觸上限；必須先處理戰鬥，不能繼續普通探索。");

  session.turns = turn;
  session.scenario = {
    ...session.scenario,
    progress: nextProgress,
    referenceState: nextReferenceState,
  };
  session.history = pushHistory(session.history, { action: travelAction, narration: systemNarration });
  session.scene = { context: systemNarration, options: nextOptions };
  session.chronicle = appendChronicle(session.chronicle, {
    turn,
    action: travelAction,
    narration: systemNarration,
    timestamp,
    chapterIndex: nextProgress.chapterIndex,
    nodeId: scenarioHudView(pack, nextProgress)?.activeNode?.id ?? null,
    scenarioId: pack.id,
  });

  appendEvent(
    session.log,
    EVENT_TYPES.TRAVEL,
    {
      from: resolution.from,
      to: resolution.to,
      location: targetName,
      timeCost: resolution.timeCost,
      riskLevel: resolution.risk.level,
      threatDelta: threatChange.delta,
      nextSceneId: travelResult.nextSceneId,
    },
    { timestamp, scenarioId: pack.id, turn }
  );
  appendEvent(
    session.log,
    EVENT_TYPES.TIME_SPENT,
    { amount: resolution.timeCost, activity: travelAction },
    { timestamp, scenarioId: pack.id, turn }
  );

  const newDiscoveries = (nextReferenceState.recentDiscoveries ?? []).filter(
    (item) => !beforeDiscoveries.some((old) => old.id === item.id)
  );
  for (const discovery of newDiscoveries) {
    appendEvent(
      session.log,
      EVENT_TYPES.DISCOVERY,
      { id: discovery.id, kind: discovery.kind, title: discovery.title, source: discovery.source ?? null },
      { timestamp, scenarioId: pack.id, turn }
    );
  }
  const questionUpdates = changedQuestionStates(beforeQuestions, nextReferenceState.unresolvedQuestions);
  if (questionUpdates.length) {
    appendEvent(
      session.log,
      EVENT_TYPES.QUESTION_UPDATE,
      { questions: questionUpdates },
      { timestamp, scenarioId: pack.id, turn }
    );
  }

  await store.put(session);

  const hud = scenarioHudView(pack, nextProgress);
  const scenario = {
    ...hud,
    reference: referenceStateForResponse(reference, nextReferenceState),
    threat: {
      ...threatSummary(nextProgress.threat, pack.threatTrack),
      delta: threatChange.delta,
      before: threatChange.before,
      escalated: threatChange.escalated,
    },
    ...(warnings.length ? { warnings } : {}),
    ...(nextProgress.pendingCombat ? { combatRequired: true } : {}),
  };

  return json({
    ok: true,
    sessionId: session.id,
    persistent: store.persistent,
    turnCount: turn,
    character: session.character,
    scenario,
    options: nextOptions,
    narration: systemNarration,
    travel: {
      from: resolution.from,
      to: resolution.to,
      label: targetName,
      timeCost: resolution.timeCost,
      timeBudget: publicTimeBudget(nextProgress.timeBudget),
      risk: {
        level: resolution.risk.level,
        threatDelta: threatChange.delta,
        label: travelRiskLabel(resolution),
      },
      nextSceneId: travelResult.nextSceneId,
      arrivalText: systemNarration,
      arrivalSourceEventIds: travelResult.arrivalSourceEventIds,
    },
    ...(nextProgress.pendingCombat ? { combatRequired: true } : {}),
  });
}
