// V2 探索狀態：玩家可見的線索、未解問題與地圖移動規則。
//
// 分工：reference authoring 只提供 clue/question 文案與世界真相；本模組只把
// server 已確認的 effects 轉成可公開的探索紀錄，並驗證相鄰路線與環境風險。
// 不把 NPC privateGoals、gmTruth、question catalog 的未達成答案送到前端。

const QUESTION_STATUS_LABELS = Object.freeze({
  open: "未解",
  updated: "有新線索",
  answered: "已有答案",
  closed: "暫時擱置",
});

const TRAVEL_COST = 1;


const TRAVEL_RISK_RULES = Object.freeze([
  {
    id: "low_light_without_flashlight",
    locations: ["loc_service_corridor", "loc_lower_deck"],
    absentItems: ["item_flashlight"],
    threatDelta: 1,
    label: "低照度與管線聲",
    note: "你缺少可靠照明，移動時更容易暴露聲音與位置。",
  },
  {
    id: "intermittent_deck_lighting",
    locations: ["loc_deck_a"],
    flags: ["flag_noise_made"],
    threatDelta: 1,
    label: "照明與聲音風險",
    note: "間歇燈光下的金屬回音把你的動線放大了。",
  },
  {
    id: "overload_engine_heat",
    locations: ["loc_engine", "loc_lower_deck"],
    flags: ["flag_overload_active"],
    threatDelta: 1,
    label: "超載後的高溫與震動",
    note: "反應爐超載讓這條路線變得更危險。",
  },
  {
    id: "alien_followed_to_narcissus",
    locations: ["loc_narcissus_airlock", "loc_narcissus"],
    flags: ["flag_alien_followed"],
    threatDelta: 2,
    label: "異形追入逃生路線",
    note: "你無法把追蹤者留在母船上；逃生路線本身已經進入接觸風險。",
  },
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(asArray(values).filter(Boolean))];
}

function narrativeText(value) {
  if (Array.isArray(value)) return value.filter((part) => typeof part === "string" && part.trim()).join("\n\n");
  return typeof value === "string" ? value : "";
}

function flagsOf(state) {
  return new Set(asArray(state?.flags));
}

function questionConditionMatches(condition, reference, state) {
  if (!condition || typeof condition !== "object") return false;
  const flags = flagsOf(state);
  if (condition.allFlags?.length && !condition.allFlags.every((flag) => flags.has(flag))) return false;
  if (condition.anyFlags?.length && !condition.anyFlags.some((flag) => flags.has(flag))) return false;
  if (condition.allClues?.length && !condition.allClues.every((clue) => state?.clues?.includes(clue))) return false;
  if (condition.anyClues?.length && !condition.anyClues.some((clue) => state?.clues?.includes(clue))) return false;
  if (condition.locations?.length && !condition.locations.includes(state?.currentLocation)) return false;
  if (condition.scenes?.length && !condition.scenes.includes(state?.currentSceneId)) return false;
  if (condition.anyScenes?.length && !condition.anyScenes.includes(state?.currentSceneId)) return false;
  if (condition.referenceEvents?.length && !condition.referenceEvents.includes(state?.currentSceneId)) return false;
  return true;
}

function questionEvidence(question, state) {
  const known = new Set(asArray(state?.clues));
  return unique(question?.evidenceClues).filter((clueId) => known.has(clueId));
}

function normalizeQuestionRecord(question, raw = {}) {
  const status = QUESTION_STATUS_LABELS[raw.status] ? raw.status : "open";
  return {
    id: question.id,
    text: question.text,
    status,
    statusLabel: QUESTION_STATUS_LABELS[status],
    evidence: unique(raw.evidence),
    ...(status === "answered" && question.answer ? { answer: question.answer } : {}),
    ...(raw.updatedAt ? { updatedAt: raw.updatedAt } : {}),
  };
}

export function synchronizeExplorationState(reference, state) {
  const now = new Date().toISOString();
  const existing = new Map(
    asArray(state?.unresolvedQuestions).filter((item) => item?.id).map((item) => [item.id, item])
  );
  const questions = [];

  for (const question of asArray(reference?.unresolvedQuestions)) {
    if (!question?.id || !question.text) continue;
    const previous = existing.get(question.id);
    const shouldOpen = Boolean(question.openOnStart)
      || questionConditionMatches(question.openWhen, reference, state)
      || question.openWhenFlags?.some((flag) => flagsOf(state).has(flag));
    const evidence = unique([...(previous?.evidence ?? []), ...questionEvidence(question, state)]);
    const canAnswer = questionConditionMatches(question.answerWhen, reference, state)
      || question.answerWhenFlags?.some((flag) => flagsOf(state).has(flag));

    if (!previous && !shouldOpen) continue;
    let status = previous?.status ?? "open";
    if (canAnswer && question.answer) status = "answered";
    else if (evidence.length && status === "open") status = "updated";

    const record = normalizeQuestionRecord(question, {
      ...previous,
      status,
      evidence,
      updatedAt: evidence.length || status === "answered" ? now : previous?.updatedAt,
    });
    if (status === "answered" && question.answer) record.answer = question.answer;
    questions.push(record);
  }

  return {
    ...state,
    recentDiscoveries: asArray(state?.recentDiscoveries).slice(-24),
    unresolvedQuestions: questions.slice(-24),
  };
}

export function recordReferenceDiscoveries(reference, state, { scene, approach, result, effects } = {}) {
  const next = {
    ...state,
    recentDiscoveries: asArray(state?.recentDiscoveries).slice(),
  };
  const sequence = asArray(state?.actionHistory).length + 1;
  const location = next.currentLocation ?? scene?.location ?? null;

  if (result?.text) {
    next.recentDiscoveries.push({
      id: `result:${scene?.id ?? "scene"}:${approach?.id ?? "action"}:${sequence}`,
      kind: "event_result",
      title: "事件結果",
      text: String(result.text),
      source: approach?.id ?? scene?.id ?? "reference",
      location,
    });
  }

  for (const clueId of unique(effects?.cluesAdd)) {
    const clue = asArray(reference?.clues).find((item) => item?.id === clueId);
    if (!clue) continue;
    const existing = next.recentDiscoveries.find((item) => item.id === `clue:${clueId}`);
    if (existing) continue;
    next.recentDiscoveries.push({
      id: `clue:${clueId}`,
      kind: "clue",
      title: clue.name ?? "新線索",
      text: clue.reveals ?? "你取得了一項尚待分析的線索。",
      source: scene?.id ?? "reference",
      location,
    });
  }

  next.recentDiscoveries = next.recentDiscoveries.slice(-24);
  return synchronizeExplorationState(reference, next);
}

export function publicExplorationDiscoveries(state) {
  return asArray(state?.recentDiscoveries).slice(-8).map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    text: item.text,
    location: item.location ?? null,
  }));
}

export function publicUnresolvedQuestions(state) {
  return asArray(state?.unresolvedQuestions).map((item) => ({
    id: item.id,
    text: item.text,
    status: item.status,
    statusLabel: item.statusLabel ?? QUESTION_STATUS_LABELS[item.status] ?? "未解",
    evidence: unique(item.evidence),
    ...(item.status === "answered" && item.answer ? { answer: item.answer } : {}),
  }));
}

function transitionFor(reference, from, to) {
  return asArray(reference?.travelTransitions).find(
    (transition) => transition?.from === from && transition?.to === to
  ) ?? null;
}

function transitionMissingFlags(transition, state) {
  const flags = flagsOf(state);
  return asArray(transition?.required?.flags).filter((flag) => !flags.has(flag));
}

function riskFor(reference, state, targetLocationId) {
  const items = new Set(asArray(state?.inventory));
  const flags = flagsOf(state);
  const matched = TRAVEL_RISK_RULES.filter((rule) => {
    if (!rule.locations.includes(targetLocationId)) return false;
    if (rule.absentItems?.some((item) => items.has(item))) return false;
    if (rule.flags?.some((flag) => !flags.has(flag))) return false;
    return true;
  });
  const threatDelta = matched.reduce((sum, rule) => sum + rule.threatDelta, 0);
  return {
    level: threatDelta >= 2 ? "high" : threatDelta === 1 ? "elevated" : "low",
    threatDelta,
    labels: matched.map((rule) => rule.label),
    notes: matched.map((rule) => rule.note),
  };
}

function targetSceneFor(reference, state, transition) {
  const targetId = transition?.entryEventId;
  if (!targetId) return null;
  const scene = asArray(reference?.scenes).find((item) => item.id === targetId);
  if (!scene) return null;
  if (scene.unlockOnly && !state?.unlockedEventIds?.includes(scene.id)) return null;
  return scene;
}

export function resolveTravelAction(reference, state, targetLocationId) {
  const currentLocation = state?.currentLocation ?? null;
  const target = asArray(reference?.map).find((item) => item?.id === targetLocationId);
  if (!currentLocation) return { ok: false, code: "NO_CURRENT_LOCATION", error: "目前位置未知，不能執行移動。" };
  if (!target) return { ok: false, code: "UNKNOWN_LOCATION", error: "目的地不存在於目前副本地圖。" };
  if (target.id === currentLocation) return { ok: false, code: "ALREADY_THERE", error: "玩家已經在這個地點。" };
  const current = asArray(reference?.map).find((item) => item?.id === currentLocation);
  if (!current?.connections?.includes(target.id)) {
    return { ok: false, code: "NOT_ADJACENT", error: "目的地不是目前位置的相鄰路線，不能直接移動。" };
  }
  const transition = transitionFor(reference, currentLocation, target.id);
  if (!transition) {
    return {
      ok: false,
      code: "TRAVEL_NOT_AUTHORIZED",
      error: "這條相鄰路線目前沒有被主線事件授權；請先完成當前事件或使用可用行動。",
    };
  }
  const missingFlags = transitionMissingFlags(transition, state);
  if (missingFlags.length) {
    return {
      ok: false,
      code: "TRAVEL_LOCKED",
      error: "這條路線的前置條件尚未成立。",
      missingFlags,
    };
  }
  const risk = riskFor(reference, state, target.id);
  const nextScene = targetSceneFor(reference, state, transition);
  if (!nextScene) {
    return {
      ok: false,
      code: "TRAVEL_SCENE_REQUIRED",
      error: "這條路線尚未有可接續的 reference 探索事件；請使用目前事件提供的行動。",
    };
  }
  return {
    ok: true,
    from: currentLocation,
    to: target.id,
    target,
    timeCost: TRAVEL_COST,
    risk,
    routeEffects: {
      flagsAdd: unique(transition.effects?.flagsAdd),
      cluesAdd: unique(transition.effects?.cluesAdd),
    },
    nextScene,
  };
}

export function applyTravelAction(reference, state, resolution) {
  if (!resolution?.ok) return { applied: false, state, error: resolution?.error ?? "移動查驗失敗" };
  let next = synchronizeExplorationState(reference, {
    ...state,
    currentLocation: resolution.to,
    visitedLocations: unique([...(state?.visitedLocations ?? []), resolution.to]),
    flags: unique([...(state?.flags ?? []), ...(resolution.routeEffects?.flagsAdd ?? [])]),
    clues: unique([...(state?.clues ?? []), ...(resolution.routeEffects?.cluesAdd ?? [])]),
    currentSceneId: resolution.nextScene?.id ?? state.currentSceneId,
    sceneTurnCount: resolution.nextScene?.id && resolution.nextScene.id !== state.currentSceneId ? 0 : state.sceneTurnCount,
  });
  if (resolution.routeEffects?.cluesAdd?.length) {
    next = recordReferenceDiscoveries(reference, next, {
      scene: resolution.nextScene,
      approach: { id: `travel:${resolution.from}>${resolution.to}` },
      effects: { cluesAdd: resolution.routeEffects.cluesAdd },
    });
  }
  const arrivalText = narrativeText(
    resolution.nextScene?.narrativeSource?.entryText ?? resolution.nextScene?.entryNarration ?? null
  ) || null;
  return {
    applied: true,
    state: next,
    arrivalText,
    nextSceneId: resolution.nextScene?.id ?? state.currentSceneId,
  };
}

export function travelCost() {
  return TRAVEL_COST;
}

export function travelRiskLabel(resolution) {
  if (!resolution?.risk?.threatDelta) return "路線暫未觀察到額外威脅上升";
  return `環境風險：${resolution.risk.labels.join("、")}（迫近度 +${resolution.risk.threatDelta}）`;
}
