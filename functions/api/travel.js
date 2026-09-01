// Server-authoritative V2 exploration travel。
// 客戶端只能提出目的地；目前位置、路線、前置條件、時間與威脅全部由這裡查驗。
// 移動不呼叫 LLM，也不讓玩家用自由文字改寫 location 或 reference state。

import { resolveSessionStore, pushHistory, SessionConflictError } from "../../content/storage/sessionStore.js";
import { getCurrentUser } from "../../content/auth/sessionToken.js";
import { canAccessSession } from "../../content/auth/ownership.js";
import { getDownState } from "../../content/downState.js";
import { appendChronicle } from "../../content/storage/chronicle.js";
import { appendEvent, EVENT_TYPES } from "../../core/eventLog.js";
import { getScenarioPack, getScenarioReference, isRetiredScenarioId } from "../../content/scenario/registry.js";
import { spendChapterTime, completeNodeAndAdvance } from "../../content/scenario/progress.js";
import { creditNodeReward } from "../../content/scenario/settlement.js";
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
  const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
  if (!sessionId || !to) return error({ error: "body 必須包含 sessionId 與目的地 to" }, 400);
  if (to.length > 80) return error({ error: "目的地格式不合法" }, 400);
  if (requestId.length > 160) return error({ error: "requestId 格式不合法" }, 400);

  const session = await store.get(sessionId);
  if (!session) return error({ error: `找不到存檔 ${sessionId}` }, 404);
  if (!canAccessSession(session, await getCurrentUser(context.request, env))) {
    return error({ error: `找不到存檔 ${sessionId}` }, 404);
  }
  // 進入這個函式時的修訂號；寫回前用它偵測「讀取之後、寫入之前，存檔被別的
  // 請求(例如同時送出的 /api/turn 或另一次 /api/travel)改過」的併發衝突。
  const expectedRev = session.rev ?? 0;
  if (isRetiredScenarioId(session.scenario?.packId)) {
    return error({
      retiredScenario: true,
      scenarioId: session.scenario.packId,
      error: "這份存檔使用已退役的 V1 異形副本，不能進入舊文字流程；請重新開始 V2《異形：生化深淵》。",
    }, 410);
  }

  // response 遺失時，瀏覽器會以同一 requestId 重送；先回放已保存的公開結果，
  // 不再重新驗證當前位置或扣除第二次時間／威脅。這個檢查必須早於 combat／pending guard，
  // 因為玩家可能在第一次成功後才因網路延遲而重送。
  const replay = requestId && session.travelReplay?.requestId === requestId ? session.travelReplay : null;
  if (replay) {
    if (replay.to !== to || !replay.response || typeof replay.response !== "object") {
      return error({ code: "TRAVEL_REQUEST_REUSED", error: "同一 requestId 不能用於不同目的地。" }, 409);
    }
    return json({ ...replay.response, replayed: true, travelRequestId: requestId });
  }

  const pack = session.scenario ? getScenarioPack(session.scenario.packId) : null;
  const reference = getScenarioReference(pack);
  // 支援條件是資料層能力，不是副本白名單：只要 reference 帶著地圖與已授權的 route，
  // server-authoritative 探索移動就適用（第二副本之後不需要再改這裡）。
  const travelReady =
    Boolean(pack) &&
    reference?.sourcePackId === pack?.id &&
    Array.isArray(reference?.map) && reference.map.length > 0 &&
    Array.isArray(reference?.travelTransitions) && reference.travelTransitions.length > 0;
  if (!travelReady) {
    return error({ error: "這個副本沒有可供 server 驗證的探索地圖，無法使用探索移動。" }, 409);
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
      error: "威脅已經接觸玩家，必須先進入戰鬥，不能繼續普通移動。",
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
        ...scenarioHudView(pack, progress, { reference, referenceState }),
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

  const nextProgressBeforeThreat = spendChapterTime(progress, resolution.timeCost, "區域移動");
  const threatChange = applyDirectThreatDelta(nextProgressBeforeThreat.threat, resolution.risk.threatDelta);
  let nextProgress = {
    ...nextProgressBeforeThreat,
    threat: threatChange.track,
    pendingCombat: Boolean(nextProgressBeforeThreat.pendingCombat || threatChange.contact),
  };

  // [非線性副本] 有些副本的主線節點是「區域」而不是「單一事件鏈」：玩家可能先繞去別的模組，
  // 再回頭處理原本的節點。這種副本可以在 reference 宣告 travelCompletesNodes，
  // 讓「從某節點的場景走進另一個節點的場景」本身就是那個節點的完成信號。
  // 沒有宣告的副本（Alien V2）行為完全不變；前置與重複結算仍由 completeNodeAndAdvance 查驗。
  let travelNodeCompleted = null;
  const departingNodeId = resolution.fromScene?.nodeId ?? null;
  const arrivingNodeId = resolution.nextScene?.nodeId ?? null;
  if (reference?.travelCompletesNodes && departingNodeId && arrivingNodeId && departingNodeId !== arrivingNodeId) {
    const departingNode = (pack.entries ?? [])
      .flatMap((chapter) => chapter.nodes ?? [])
      .find((node) => node.id === departingNodeId && !node.isFinale);
    if (departingNode && !nextProgress.nodes?.[departingNode.id]?.completed) {
      // 移動同樣要過完成證據閘門。這條路徑目前只有宣告 travelCompletesNodes 的副本會走到
      // （Alien V2 沒有宣告），但預設 fail-closed，漏傳就是擋下，不會變成一條繞過閘門的捷徑。
      const settled = completeNodeAndAdvance(pack, nextProgress, departingNode.id, 0, {
        evidenceState: travelResult.state,
      });
      if (settled.ok) {
        nextProgress = settled.progress;
        const credited = creditNodeReward(nextProgress, session.wallet, {
          nodeId: departingNode.id,
          points: settled.reward,
          label: departingNode.title,
          turn,
        });
        nextProgress = credited.progress;
        session.wallet = credited.wallet;
        travelNodeCompleted = {
          nodeId: departingNode.id,
          title: departingNode.title,
          divergenceTier: 0,
          reward: settled.reward,
        };
      }
    }
  }
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
    // 只取 activeNode.id 寫進編年史，不需要重大節點那一層，所以不傳 reference。
    nodeId: scenarioHudView(pack, nextProgress)?.activeNode?.id ?? null,
    scenarioId: pack.id,
  });

  if (travelNodeCompleted) {
    appendEvent(
      session.log,
      EVENT_TYPES.NODE_COMPLETE,
      travelNodeCompleted,
      { timestamp, scenarioId: pack.id, turn }
    );
    appendEvent(
      session.log,
      EVENT_TYPES.POINTS_GRANT,
      { total: travelNodeCompleted.reward, reason: `完成節點「${travelNodeCompleted.title}」` },
      { timestamp, scenarioId: pack.id, turn }
    );
    warnings.push(`你離開了「${travelNodeCompleted.title}」的現場，這個階段已經結算。`);
  }

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
      requestId: requestId || null,
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

  const hud = scenarioHudView(pack, nextProgress, { reference, referenceState: nextReferenceState });
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

  const responseBody = {
    ok: true,
    sessionId: session.id,
    persistent: store.persistent,
    turnCount: turn,
    travelRequestId: requestId || null,
    replayed: false,
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
    ...(travelNodeCompleted ? { nodeCompleted: travelNodeCompleted } : {}),
    ...(nextProgress.pendingCombat ? { combatRequired: true } : {}),
  };
  if (requestId) {
    session.travelReplay = {
      requestId,
      to,
      response: responseBody,
      savedAt: timestamp,
    };
  }
  try {
    await store.put(session, { expectedRev });
  } catch (err) {
    if (err instanceof SessionConflictError) {
      return error({
        code: "SESSION_CONFLICT",
        error: "這份存檔剛被另一個請求更新（可能是重複送出），請重新整理後再試一次。",
      }, 409);
    }
    throw err;
  }
  return json(responseBody);
}
