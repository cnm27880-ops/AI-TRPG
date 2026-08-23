// Scenario reference adapter —— 把 AI GM reference JSON 接到既有回合引擎。
//
// 分工：
//   reference JSON：世界真相、地圖、NPC、事件、前置條件、結果文字與 effects。
//   adapter：驗證當前事件、把玩家行動對到合法 approach、套用 effects、推進事件。
//   core/check.js：骰池、骰子、成功數與 DC。
//   LLM：只把 adapter 已經裁定的結果寫成敘事與簡要選項。
//
// 注意：referenceState 存在 session.scenario.referenceState，不放進 progress。
// progress 仍然只負責章節、節點、時間、迫近度與套路，避免破壞舊存檔。

import { difficultyToDc, validateOption } from "../turnOptions.js";
import { applyDamage } from "../../core/health.js";

const SUCCESS_TIERS = new Set(["大成功", "成功", "驚險成功"]);
const FAILURE_TIERS = new Set(["些微失敗", "失敗", "慘烈失敗", "自動失敗", "大失敗(命定)"]);

export const NARRATIVE_MODES = Object.freeze(["micro", "normal", "major", "reveal", "combat"]);
export const THREAT_ASSESSMENT_LEVELS = Object.freeze([
  "relief_2",
  "relief_1",
  "stable",
  "rise_1",
  "rise_2",
  "rise_3",
  "immediate_combat",
]);

const THREAT_ASSESSMENT_DELTAS = Object.freeze({
  relief_2: -2,
  relief_1: -1,
  stable: 0,
  rise_1: 1,
  rise_2: 2,
  rise_3: 3,
  immediate_combat: 7,
});

export function narrativeModeOf(value, fallback = "normal") {
  return NARRATIVE_MODES.includes(value) ? value : fallback;
}

export function threatAssessmentDelta(level) {
  return THREAT_ASSESSMENT_DELTAS[level] ?? null;
}

function narrativeModeForFreeAction(actionText = "") {
  const text = String(actionText).trim();
  if (!text) return "micro";
  if (text.length >= 90 || /逃生|拆解|修復|啟動|關閉|救出|拖走|迎戰|攻擊|衝過|穿越|破解|揭露|搬運|掩護/.test(text)) return "major";
  if (text.length >= 42 || /調查|分析|交涉|說服|搜尋|觀察.*資料|確認.*出口/.test(text)) return "normal";
  return "micro";
}

export function narrativeModeForScene(scene, result = null, { freeAction = false, actionText = "" } = {}) {
  const explicit = result?.effects?.narrativeMode ?? scene?.narrativeMode;
  if (NARRATIVE_MODES.includes(explicit)) return explicit;
  const phase = String(scene?.phase ?? "");
  if (scene?.phases?.length || phase === "confrontation" || phase === "finale") return "combat";
  if (phase === "revelation") return "reveal";
  if (phase === "countdown" || phase === "escape" || phase === "awakening") return "major";
  if (freeAction) return narrativeModeForFreeAction(actionText);
  return "normal";
}

function assessmentConditionsMatch(conditions, state) {
  return (conditions ?? []).some((condition) => {
    const flags = flagSet(state);
    if (condition.anyFlags?.length) return condition.anyFlags.some((flag) => flags.has(flag));
    if (condition.allFlags?.length) return condition.allFlags.every((flag) => flags.has(flag));
    return false;
  });
}

/** AI 只能提議有限級別；實際 delta 必須通過場景 policy 與引擎 clamp。 */
export function validateThreatAssessment(reference, state, rawAssessment) {
  const level = typeof rawAssessment === "string" ? rawAssessment : rawAssessment?.level;
  if (!THREAT_ASSESSMENT_LEVELS.includes(level)) {
    return { accepted: false, level: "stable", delta: 0, reason: "level 不在允許的 threatAssessment enum" };
  }
  const scene = findScene(reference, state?.currentSceneId);
  const policy = scene?.threatPolicy ?? {};
  const allowed = Array.isArray(policy.allowedLevels) && policy.allowedLevels.length
    ? policy.allowedLevels
    : THREAT_ASSESSMENT_LEVELS.filter((candidate) => candidate !== "immediate_combat");
  if (!allowed.includes(level)) {
    return { accepted: false, level: "stable", delta: 0, reason: `目前場景不允許 ${level}` };
  }
  if (level === "immediate_combat") {
    const conditions = policy.immediateCombatConditions ?? [];
    if (!conditions.length || !assessmentConditionsMatch(conditions, state)) {
      return { accepted: false, level: "stable", delta: 0, reason: "immediate_combat 缺少作者指定的固定條件" };
    }
  }
  const suppliedReason = String(rawAssessment?.reason ?? "").trim().slice(0, 160);
  return {
    accepted: true,
    level,
    delta: threatAssessmentDelta(level),
    reason: suppliedReason || "AI 未提供理由；採用通過場景 policy 的 threatAssessment 提議",
  };
}

const OUTCOME_TO_DIVERGENCE = Object.freeze({
  大成功: 0,
  成功: 0,
  驚險成功: 1,
  些微失敗: 2,
  失敗: 3,
  慘烈失敗: 4,
  自動失敗: 3,
  "大失敗(命定)": 4,
  自動: 0,
});

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function cloneObject(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return { ...value };
}

function allApproaches(scene) {
  const direct = (scene?.approaches ?? []).map((approach) => ({ approach, phaseId: null }));
  const phased = (scene?.phases ?? []).flatMap((phase) =>
    (phase.approaches ?? []).map((approach) => ({ approach, phaseId: phase.id }))
  );
  return [...direct, ...phased];
}

function allScenes(reference) {
  return Array.isArray(reference?.scenes) ? reference.scenes : [];
}

function findScene(reference, sceneId) {
  return allScenes(reference).find((scene) => scene.id === sceneId) ?? null;
}

function firstScene(reference) {
  return allScenes(reference)[0] ?? null;
}

function isFinaleScene(reference, scene) {
  return Boolean(scene?.isFinale) || Boolean(reference?.finaleNodeIds?.includes(scene?.nodeId));
}

function initialNpcStatuses(reference) {
  return Object.fromEntries(
    (reference?.npcs ?? [])
      .filter((npc) => npc?.id)
      .map((npc) => [npc.id, npc.initialStatus ?? "alive"])
  );
}

export function createReferenceState(reference, { initialInventory = [] } = {}) {
  const scene = firstScene(reference);
  return {
    version: 1,
    referenceId: reference?.sourcePackId ?? null,
    currentSceneId: scene?.id ?? null,
    currentLocation: scene?.location ?? null,
    completedSceneIds: [],
    unlockedEventIds: [],
    flags: [],
    inventory: unique(
      Array.isArray(initialInventory) && initialInventory.length
        ? initialInventory
        : (Array.isArray(reference?.startingInventory) ? reference.startingInventory : [])
    ),
    damagedItems: [],
    clues: [],
    npcStatuses: initialNpcStatuses(reference),
    npcTrust: {},
    injuries: [],
    infectionStatus: "unknown",
    sampleStatus: "none",
    shipStatus: "stable",
    airlockPhase: "unseen",
    lastApproachId: null,
    lastOutcomeTier: null,
    lastResultText: null,
    sceneTurnCount: 0,
    actionHistory: [],
    endingId: null,
  };
}

/** 舊存檔沒有 referenceState，或 reference 換版時，補成可用形狀；只補欄位，不重置已有狀態。 */
export function normalizeReferenceState(reference, rawState) {
  const fresh = createReferenceState(reference);
  if (!rawState || typeof rawState !== "object" || rawState.referenceId !== fresh.referenceId) return fresh;
  return {
    ...fresh,
    ...rawState,
    referenceId: fresh.referenceId,
    completedSceneIds: unique(rawState.completedSceneIds),
    unlockedEventIds: unique(rawState.unlockedEventIds),
    flags: unique(rawState.flags),
    inventory: unique(rawState.inventory),
    damagedItems: unique(rawState.damagedItems),
    clues: unique(rawState.clues),
    npcStatuses: cloneObject(rawState.npcStatuses, fresh.npcStatuses),
    npcTrust: cloneObject(rawState.npcTrust, {}),
    injuries: unique(rawState.injuries),
    sceneTurnCount: Number.isInteger(rawState.sceneTurnCount) && rawState.sceneTurnCount >= 0
      ? rawState.sceneTurnCount
      : 0,
    actionHistory: Array.isArray(rawState.actionHistory) ? rawState.actionHistory.slice(-24) : [],
  };
}

function flagSet(state) {
  return new Set(state?.flags ?? []);
}

function hasRequiredItems(state, required = {}) {
  const inventory = new Set(state?.inventory ?? []);
  return (required.items ?? []).every((itemId) => inventory.has(itemId));
}

function hasRequiredLocations(state, required = {}) {
  if (!required.locations?.length) return true;
  return required.locations.includes(state?.currentLocation);
}

function hasRequiredFlags(state, required = {}) {
  const flags = flagSet(state);
  return (required.flags ?? []).every((flag) => flags.has(flag));
}

function hasRequiredNpcStatuses(state, required = {}) {
  return Object.entries(required.npcStatuses ?? {}).every(([npcId, allowed]) => {
    const values = Array.isArray(allowed) ? allowed : [allowed];
    return values.includes(state?.npcStatuses?.[npcId]);
  });
}

function hasRequiredFlagsAbsent(state, required = {}) {
  const flags = flagSet(state);
  return (required.flagsAbsent ?? []).every((flag) => !flags.has(flag));
}

function phaseRequirementsMet(phase, state) {
  return (phase?.requiredStates ?? []).every((expression) => {
    const [key, expected] = String(expression).split("=");
    return String(state?.[key]) === expected;
  });
}

export function isApproachAvailable(approach, state, phase = null) {
  const required = approach?.required ?? {};
  return (
    phaseRequirementsMet(phase, state) &&
    hasRequiredItems(state, required) &&
    hasRequiredLocations(state, required) &&
    hasRequiredFlags(state, required) &&
    hasRequiredFlagsAbsent(state, required) &&
    hasRequiredNpcStatuses(state, required)
  );
}

function activePhase(scene, state) {
  const phases = scene?.phases ?? [];
  if (!phases.length) return null;
  // 有明確 requiredStates 的 phase 優先；否則第一個無前置條件的 phase 才是起始階段。
  // 這避免 n4 永遠選到 position，讓 airlockPhase=positioned 的 purge approach 永遠不可見。
  const stateDriven = phases.find(
    (phase) => (phase.requiredStates?.length ?? 0) > 0 && phaseRequirementsMet(phase, state)
  );
  if (stateDriven) return stateDriven;
  return phases.find((phase) => !(phase.requiredStates?.length)) ?? phases[0];
}

function currentApproaches(reference, state) {
  const scene = findScene(reference, state?.currentSceneId) ?? firstScene(reference);
  if (!scene) return { scene: null, phase: null, entries: [] };
  const phase = activePhase(scene, state);
  const entries = phase
    ? (phase.approaches ?? []).map((approach) => ({ approach, phaseId: phase.id }))
    : (scene.approaches ?? []).map((approach) => ({ approach, phaseId: null }));
  return {
    scene,
    phase,
    entries: entries.filter(({ approach }) => isApproachAvailable(approach, state, phase)),
  };
}

function approachHint(approach) {
  return String(approach?.intent ?? approach?.label ?? "想推進目前局面").slice(0, 24);
}

function publicReferenceOption(approach, sceneId, phaseId) {
  return {
    label: approach.label,
    hint: approachHint(approach),
    requiresCheck: approach.requiresCheck === true,
    attribute: approach.requiresCheck === true ? approach.attribute : null,
    skill: approach.requiresCheck === true ? approach.skill ?? null : null,
    difficulty: approach.requiresCheck === true ? approach.difficulty : null,
    dc: approach.requiresCheck === true ? difficultyToDc(approach.difficulty) : null,
    source: "reference",
    reference: {
      sceneId,
      approachId: approach.id,
      phaseId: phaseId ?? null,
    },
  };
}

/** 由 reference event 產生目前能做的簡要選項。順序完全依作者資料，不依骰池排序。 */
export function buildReferenceOptions(reference, state, { limit = 4 } = {}) {
  const { scene, phase, entries } = currentApproaches(reference, state);
  if (!scene) return [];
  return entries.slice(0, limit).map(({ approach, phaseId }) => publicReferenceOption(approach, scene.id, phaseId ?? phase?.id ?? null));
}

function referenceTerms(text) {
  const source = String(text ?? "").replace(/\s+/g, "");
  const terms = new Set();
  if (source.length >= 2) {
    for (let i = 0; i < source.length - 1; i += 1) terms.add(source.slice(i, i + 2));
  }
  return terms;
}

function matchScore(input, approach) {
  const text = String(input ?? "").replace(/\s+/g, "");
  if (!text) return 0;
  const label = String(approach?.label ?? "").replace(/\s+/g, "");
  const intent = String(approach?.intent ?? "").replace(/\s+/g, "");
  if (label && text.includes(label)) return 100;
  if (intent && text.includes(intent)) return 90;
  const inputTerms = referenceTerms(text);
  let score = 0;
  for (const term of referenceTerms(label)) if (inputTerms.has(term)) score += 2;
  for (const term of referenceTerms(intent)) if (inputTerms.has(term)) score += 1;
  return score;
}

function findApproach(reference, state, selection) {
  const { scene, phase, entries } = currentApproaches(reference, state);
  if (!scene || !selection) return null;
  if (selection.sceneId && selection.sceneId !== scene.id) return null;
  const match = entries.find(({ approach, phaseId }) => {
    return approach.id === selection.approachId && (selection.phaseId == null || selection.phaseId === phaseId);
  });
  return match ? { scene, phase, ...match } : null;
}

/**
 * 將 chosenOption 的 reference metadata 或玩家自由輸入解析成目前 event 的合法 approach。
 * chosenOption.reference 只是索引，不是信任資料；最後仍以當前 session state 查找並重建欄位。
 */
export function resolveReferenceAction({ reference, state, chosenOption, playerAction, character }) {
  if (!reference || !state) return { mode: "inactive", matched: false };

  let selection = chosenOption?.reference ?? null;
  let source = selection ? "option" : "free_input";
  if (!selection && playerAction) {
    const candidates = currentApproaches(reference, state).entries
      .map(({ approach, phaseId }) => ({ approach, phaseId, score: matchScore(playerAction, approach) }))
      .filter((candidate) => candidate.score >= 2)
      .sort((a, b) => b.score - a.score);
    if (candidates.length && (candidates.length === 1 || candidates[0].score > candidates[1].score)) {
      selection = {
        sceneId: state.currentSceneId,
        approachId: candidates[0].approach.id,
        phaseId: candidates[0].phaseId,
      };
    }
  }

  if (!selection) return { mode: "unmatched", matched: false, source };
  const found = findApproach(reference, state, selection);
  if (!found) {
    return {
      mode: "invalid",
      matched: false,
      source,
      error: "這個行動不屬於目前事件，或它需要的前置條件尚未成立。",
    };
  }

  const { approach, scene, phase, phaseId } = found;
  const rawOption = publicReferenceOption(approach, scene.id, phaseId ?? phase?.id ?? null);
  const checked = validateOption(rawOption, character);
  if (!checked.ok) {
    return { mode: "invalid", matched: false, source, error: `reference approach 不符合規則：${checked.error}` };
  }

  return {
    mode: "matched",
    matched: true,
    source,
    scene,
    phase,
    phaseId: phaseId ?? phase?.id ?? null,
    approach,
    option: checked.option,
    checkParams: checked.option.requiresCheck === false
      ? null
      : { attribute: checked.option.attribute, skill: checked.option.skill, dc: checked.option.dc },
    freeAction: checked.option.requiresCheck === false,
  };
}

function tierFallbackOrder(tier) {
  if (tier === "自動") return ["自動", "成功", "驚險成功"];
  if (SUCCESS_TIERS.has(tier)) return [tier, "成功", "驚險成功", "大成功"];
  if (FAILURE_TIERS.has(tier)) return [tier, "失敗", "些微失敗", "慘烈失敗"];
  return [tier, "成功", "失敗"];
}

export function resultForOutcome(approach, outcomeTier) {
  const outcomes = approach?.outcomes ?? {};
  const key = tierFallbackOrder(outcomeTier).find((candidate) => outcomes[candidate]);
  return key ? { key, result: outcomes[key] } : null;
}

const INJURY_DAMAGE_MAP = Object.freeze({
  acid_burn_minor: { amount: 1, type: "B", label: "輕微酸蝕" },
  acid_burn_major: { amount: 1, type: "L", label: "嚴重酸蝕" },
  fracture_arm: { amount: 1, type: "L", label: "手臂骨折" },
  fracture_leg: { amount: 1, type: "L", label: "腿部骨折" },
  burn_minor: { amount: 1, type: "B", label: "輕微灼傷" },
  burn_major: { amount: 1, type: "L", label: "嚴重灼傷" },
  bleeding_major: { amount: 1, type: "L", label: "大量出血" },
  suffocation_major: { amount: 1, type: "L", label: "窒息傷" },
  unconscious: { amount: 1, type: "A", label: "失去意識" },
});

/** 將 reference 的 injuriesAdd 轉成現有角色傷勢軌；未知 ID 只留在 referenceState，不擅自猜數值。 */
export function applyReferenceCharacterEffects(character, effects = {}) {
  const ids = effects.injuriesAdd ?? [];
  if (!character || !ids.length) return { character, damageEvents: [], warnings: [] };
  const damageEvents = [];
  const warnings = [];
  let hp = character.derived?.hp;
  if (!hp) return { character, damageEvents, warnings: ["角色沒有 derived.hp，reference 傷勢只保存為事件狀態"] };

  for (const injuryId of ids) {
    const damage = INJURY_DAMAGE_MAP[injuryId];
    if (!damage) {
      warnings.push(`未註冊的 reference 傷勢「${injuryId}」，只保存為 referenceState.injuries`);
      continue;
    }
    hp = applyDamage(hp, damage.amount, damage.type);
    damageEvents.push({ injuryId, amount: damage.amount, damageType: damage.type, label: damage.label });
  }
  character.derived.hp = hp;
  return { character, damageEvents, warnings };
}

function applyBasicEffects(state, effects = {}) {
  const next = {
    ...state,
    flags: [...state.flags],
    inventory: [...state.inventory],
    damagedItems: [...state.damagedItems],
    clues: [...state.clues],
    injuries: [...state.injuries],
    npcStatuses: { ...state.npcStatuses },
    npcTrust: { ...state.npcTrust },
  };

  next.inventory = unique([...next.inventory, ...(effects.itemsAdd ?? [])]);
  next.unlockedEventIds = unique([...next.unlockedEventIds, ...(effects.unlockEvents ?? [])]);
  const remove = new Set(effects.itemsRemove ?? []);
  next.inventory = next.inventory.filter((id) => !remove.has(id));
  next.damagedItems = unique([...next.damagedItems, ...(effects.itemsDamage ?? [])]);
  next.clues = unique([...next.clues, ...(effects.cluesAdd ?? [])]);
  next.flags = unique([
    ...next.flags.filter((flag) => !(effects.worldFlagsRemove ?? []).includes(flag)),
    ...(effects.worldFlagsAdd ?? []),
  ]);
  next.injuries = unique([...next.injuries, ...(effects.injuriesAdd ?? [])]);
  for (const [npcId, status] of Object.entries(effects.npcStatusChanges ?? {})) next.npcStatuses[npcId] = status;
  for (const [npcId, delta] of Object.entries(effects.npcTrustDelta ?? {})) {
    next.npcTrust[npcId] = Number(next.npcTrust[npcId] ?? 0) + Number(delta ?? 0);
  }
  for (const key of ["infectionStatus", "sampleStatus", "shipStatus", "airlockPhase", "playerLocation"]) {
    if (effects[key] !== undefined) {
      const target = key === "playerLocation" ? "currentLocation" : key;
      next[target] = effects[key];
    }
  }
  return next;
}

function conditionalEffectsFor(result, state) {
  const flags = flagSet(state);
  return (result?.conditionalEffects ?? [])
    .filter((conditional) => {
      const has = (conditional.ifFlags ?? []).every((flag) => flags.has(flag));
      const absent = (conditional.ifFlagsAbsent ?? []).every((flag) => !flags.has(flag));
      return has && absent;
    })
    .map((conditional) => conditional.effects ?? {});
}

function isSceneUnlocked(scene, state) {
  if (!scene?.unlockOnly) return true;
  return state?.unlockedEventIds?.includes(scene.id) ?? false;
}

function nextSceneFor(reference, scene, state, effects = {}) {
  const scenes = allScenes(reference);
  const index = scenes.findIndex((item) => item.id === scene?.id);
  if (index < 0) return null;
  const locationTarget = scene.sceneExit?.nextByLocation?.[state.currentLocation];
  const targetId = effects.nextEvent ?? effects.sceneTransitionTarget ?? locationTarget ?? scene.nextEvent ?? scene.sceneExit?.nextEvent;
  if (targetId) {
    const explicit = findScene(reference, targetId);
    if (explicit && isSceneUnlocked(explicit, state)) return explicit;
  }
  const normalLocations = scene.sceneExit?.normal ?? [];
  if (normalLocations.length) {
    const byLocation = scenes.slice(index + 1).find(
      (candidate) => normalLocations.includes(candidate.location) && isSceneUnlocked(candidate, state)
    );
    if (byLocation) return byLocation;
  }
  return scenes.slice(index + 1).find((candidate) => isSceneUnlocked(candidate, state)) ?? null;
}

function conditionMatches(condition, scene, state) {
  if (!condition || typeof condition !== "object") return false;
  const flags = flagSet(state);
  if (condition.anyFlags?.length && condition.anyFlags.some((flag) => flags.has(flag))) return true;
  if (condition.allFlags?.length && condition.allFlags.every((flag) => flags.has(flag))) return true;
  if (condition.items?.length && condition.items.every((item) => state.inventory?.includes(item))) return true;
  if (condition.anyItems?.length && condition.anyItems.some((item) => state.inventory?.includes(item))) return true;
  if (condition.locations?.length && condition.locations.includes(state.currentLocation)) return true;
  if (condition.stateEquals && Object.entries(condition.stateEquals).every(([key, expected]) => String(state?.[key]) === String(expected))) return true;
  if (condition.playerLeavesLocation && state.currentLocation !== scene.location) return true;
  return false;
}

function shouldAdvanceScene(scene, state, result) {
  if (!scene) return false;
  const explicitResultTransition = result?.effects?.sceneTransition;
  if (["advance", "branch", "force_escape"].includes(explicitResultTransition)) return true;

  // 位置改變是引擎已裁定的事實，不可被場景的 defaultTransition: stay 吞掉。
  if (result?.effects?.playerLocation && result.effects.playerLocation !== scene.location) return true;
  const conditions = scene.exitConditions ?? scene.sceneExit?.conditions ?? [];
  if (conditions.some((condition) => conditionMatches(condition, scene, state))) return true;

  if (explicitResultTransition === "stay") return false;
  const sceneDefaultTransition = scene.sceneTransition ?? scene.defaultTransition ?? scene.sceneExit?.defaultTransition;
  if (["advance", "branch", "force_escape"].includes(sceneDefaultTransition)) return true;
  if (sceneDefaultTransition === "stay") return false;
  if (scene.phases?.length) {
    return state.airlockPhase === "secured" || state.flags.includes("flag_xenomorph_killed") || Boolean(result?.effects?.terminalOutcome);
  }
  // 多回合 reference scene 的安全預設：一次 action 只改變局面，不自動離場。
  return false;
}

function sceneIsLastForNode(reference, scene) {
  const scenes = allScenes(reference);
  const index = scenes.findIndex((item) => item.id === scene?.id);
  if (index < 0 || !scene?.nodeId) return false;
  const next = scenes[index + 1];
  return !next || next.nodeId !== scene.nodeId;
}

export function deriveEndingId(reference, state) {
  const flags = flagSet(state);
  const npcSurvived = Object.values(state?.npcStatuses ?? {}).some((status) => status === "survived");
  if (flags.has("flag_player_dead_combat")) return "end_death_alien_feast";
  if (flags.has("flag_player_dead_overload")) return "end_death_overload_vaporized";
  if (flags.has("flag_player_dead_vacuum")) return "end_death_vacuum_breach";
  if (flags.has("flag_expire_triggered") && state?.currentLocation !== "loc_narcissus") return "end_expire_ruins";
  if (!flags.has("flag_hypersleep_entered")) return null;
  if (state?.infectionStatus === "infected") return "end_dark_infection";
  if (npcSurvived) return "end_heroic_rescue";
  if (state?.sampleStatus === "preserved") return "end_corporate_agent";
  return "end_solo_survivor";
}

function effectSummary(effects = {}) {
  return {
    itemsAdded: effects.itemsAdd ?? [],
    itemsRemoved: effects.itemsRemove ?? [],
    cluesAdded: effects.cluesAdd ?? [],
    flagsAdded: effects.worldFlagsAdd ?? [],
    flagsRemoved: effects.worldFlagsRemove ?? [],
    unlockedEvents: effects.unlockEvents ?? [],
    injuriesAdded: effects.injuriesAdd ?? [],
    location: effects.playerLocation ?? null,
    npcStatusChanges: effects.npcStatusChanges ?? {},
    npcTrustDelta: effects.npcTrustDelta ?? {},
    infectionStatus: effects.infectionStatus ?? null,
    sampleStatus: effects.sampleStatus ?? null,
    shipStatus: effects.shipStatus ?? null,
    airlockPhase: effects.airlockPhase ?? null,
    sceneTransition: effects.sceneTransition ?? null,
    sceneTransitionTarget: effects.sceneTransitionTarget ?? null,
    nextEvent: effects.nextEvent ?? null,
    narrativeMode: narrativeModeOf(effects.narrativeMode, "normal"),
    threatDelta: effects.threatDelta ?? 0,
  };
}

/** 套用一個已經由引擎判定的 reference result，回傳 immutable state 與節點/場景推進訊號。 */
export function applyReferenceResult({ reference, state, resolution, outcomeTier }) {
  if (!resolution?.matched) return { applied: false, state, error: "沒有可套用的 reference action" };
  const selected = resultForOutcome(resolution.approach, outcomeTier);
  if (!selected) {
    return { applied: false, state, error: `事件「${resolution.approach.id}」沒有結果「${outcomeTier}」的文字或後果資料` };
  }

  let nextState = applyBasicEffects(state, selected.result.effects ?? {});
  for (const effects of conditionalEffectsFor(selected.result, nextState)) nextState = applyBasicEffects(nextState, effects);

  const derivedEndingId = deriveEndingId(reference, nextState);
  if (derivedEndingId) nextState.endingId = derivedEndingId;

  const completedSceneIds = new Set(nextState.completedSceneIds);
  const sceneTurnCount = (state.sceneTurnCount ?? 0) + 1;
  let nextScene = null;
  const sceneAdvanced = shouldAdvanceScene(resolution.scene, nextState, selected.result);
  if (sceneAdvanced) {
    completedSceneIds.add(resolution.scene.id);
    nextScene = nextSceneFor(reference, resolution.scene, nextState, selected.result.effects ?? {});
    if (nextScene) {
      nextState.currentSceneId = nextScene.id;
      nextState.currentLocation = nextScene.location ?? nextState.currentLocation;
    }
  }

  const actionEntry = {
    sceneId: resolution.scene.id,
    approachId: resolution.approach.id,
    phaseId: resolution.phaseId,
    outcomeTier,
    resultKey: selected.key,
    effects: effectSummary(selected.result.effects),
  };
  nextState = {
    ...nextState,
    completedSceneIds: [...completedSceneIds],
    unlockedEventIds: unique(nextState.unlockedEventIds),
    sceneTurnCount: sceneAdvanced ? 0 : sceneTurnCount,
    lastApproachId: resolution.approach.id,
    lastOutcomeTier: outcomeTier,
    lastResultText: selected.result.text ?? null,
    actionHistory: [...(nextState.actionHistory ?? []), actionEntry].slice(-24),
  };

  const nextNode = nextScene?.nodeId ?? null;
  const nodeComplete =
    !isFinaleScene(reference, resolution.scene) &&
    sceneAdvanced &&
    nextNode !== resolution.scene.nodeId
      ? { nodeId: resolution.scene.nodeId, divergenceTier: OUTCOME_TO_DIVERGENCE[outcomeTier] ?? 0 }
      : null;

  const endingId = selected.result.effects?.terminalOutcome ?? null;
  if (endingId) nextState.endingId = endingId;
  const finaleComplete =
    isFinaleScene(reference, resolution.scene) &&
    nextState.airlockPhase === "secured" &&
    nextState.flags.includes("flag_xenomorph_killed");

  return {
    applied: true,
    state: nextState,
    resultText: selected.result.text ?? "",
    resultKey: selected.key,
    effects: selected.result.effects ?? {},
    effectSummary: effectSummary(selected.result.effects),
    sceneCompleted: sceneAdvanced,
    sceneAdvanced,
    sceneTurnCount: nextState.sceneTurnCount,
    transition: selected.result.effects?.sceneTransition ?? (sceneAdvanced ? "advance" : "stay"),
    nextSceneId: nextState.currentSceneId,
    nodeComplete,
    finaleComplete,
    endingId,
  };
}

export function buildReferencePromptBlock({
  reference,
  state,
  resolution = null,
  applied = null,
  actionText = "",
  outcomeTier = null,
}) {
  const currentScene = findScene(reference, state?.currentSceneId) ?? firstScene(reference);
  const scene = resolution?.matched ? resolution.scene : currentScene;
  if (!scene) return "";
  const { phase, entries } = currentApproaches(reference, state);
  const lines = [
    "<Reference_Event>",
    "【副本事件資料（系統真相，不是玩家可以改寫的設定）】",
    `事件ID：${scene.id}`,
    `所在房間：${state.currentLocation ?? scene.location ?? "未知"}`,
    `事件目的：${scene.purpose ?? "推進目前場景"}`,
    `目前階段：${phase?.id ?? "一般事件"}`,
    `目前場景回合：${state?.sceneTurnCount ?? 0}（事件卡預設可持續多回合，除非離場條件成立）`,
    `事件真相：${(scene.gmTruth ?? []).join("；") || "依 reference 資料與已保存狀態裁定"}`,
    `玩家目前可知：${(scene.entryKnowledge ?? []).join("；") || "依故事歷史"}`,
    `本事件節拍：${(scene.beats ?? []).join(" → ") || "依玩家行動推進"}`,
    ...(applied && currentScene?.id !== scene.id ? [`下一事件：${currentScene?.id ?? "依狀態決定"}`] : []),
    "",
    "可供玩家參考的 approach（不是限制；合理的其他行動可以由 adapter 以最接近的方法裁定）：",
  ];
  for (const { approach } of entries) {
    lines.push(
      `- ${approach.id}：${approach.label}；目的：${approach.intent ?? "推進局面"}；` +
        `${approach.requiresCheck === false ? "無需檢定" : `檢定 ${approach.attribute}+${approach.skill ?? "純屬性"}，難度 ${approach.difficulty}`} ` +
        `；前置：${JSON.stringify(approach.required ?? {})}`
    );
  }
  if (resolution?.matched && applied) {
    lines.push("", "【這一回合已由 adapter 裁定的 reference 結果】");
    lines.push(`採用方法：${resolution.approach.id}`);
    lines.push(`結果分級：${applied.resultKey}`);
    lines.push(`固定結果核心：${applied.resultText}`);
    lines.push(`已套用狀態效果：${JSON.stringify(applied.effectSummary)}`);
    lines.push("只能在這些固定結果之上擴寫畫面與對話；不要新增資料中不存在的物品、NPC、真相或狀態效果。若固定結果與玩家輸入的自我宣稱衝突，以固定結果為準。 ");
  } else if (resolution?.mode === "unmatched") {
    lines.push("", "【這一回合是未命中任何 approach 的自由行動：限制性裁定】");
    lines.push(`玩家原始行動：${String(actionText).slice(0, 240) || "（未提供）"}`);
    lines.push(`引擎本回合的判定分級：${outcomeTier ?? "未提供"}`);
    lines.push("這次自由輸入只被引擎視為一個『嘗試』；本回合沒有 reference effect 授權新的持久世界改變。若上方沒有已套用狀態效果，就不能把嘗試寫成已完成的物理結果。");
    lines.push("可以寫：工具施力時的阻力、卡住、聲音、光線、氣味、NPC對嘗試的可觀察反應，以及引擎已明示的判定分級。必須保留操作尚未完成的空間，讓玩家仍能決定下一步。");
    lines.push("禁止寫成既定事實：門已開或已鎖死、通道已打通或已封死、玩家已取得或遺失物品、NPC已執行未列在 reference 的特殊指令、異形已直接接觸／衝出、路徑已經確定可通，以及任何未由 reference 或 engine effect 授權的傷害、旗標、位置、數字或精確距離。");
  }
  lines.push("</Reference_Event>");
  return lines.join("\n");
}

function npcTrustView(value) {
  if (!Number.isFinite(value)) return { value: null, label: "待接觸", tone: "muted" };
  if (value <= -3) return { value, label: "敵對", tone: "danger" };
  if (value <= -1) return { value, label: "疏離", tone: "warn" };
  if (value === 0) return { value, label: "觀望", tone: "neutral" };
  if (value <= 2) return { value, label: "信任", tone: "good" };
  return { value, label: "緊密", tone: "strong" };
}

function publicNpcRoster(reference, state) {
  const trustMap = state?.npcTrust ?? {};
  const statusMap = state?.npcStatuses ?? {};
  return (reference?.npcs ?? [])
    .filter((npc) => npc?.id && npc?.name)
    .map((npc) => {
      const rawTrust = Object.hasOwn(trustMap, npc.id) ? Number(trustMap[npc.id]) : NaN;
      const trust = npcTrustView(rawTrust);
      const status = statusMap[npc.id] ?? npc.initialStatus ?? "unknown";
      return {
        id: npc.id,
        name: npc.name,
        role: npc.role ?? "副本人物",
        status,
        statusLabel: NPC_STATUS_LABELS[status] ?? status,
        trust: trust.value,
        trustLabel: trust.label,
        trustTone: trust.tone,
      };
    });
}

const NPC_STATUS_LABELS = Object.freeze({
  alive: "存活",
  injured: "受傷",
  critical: "危急",
  suspicious: "戒備",
  destroyed: "已摧毀",
  dead: "死亡",
  survived: "生還",
  unknown: "未知",
});

export function referenceStateForResponse(reference, state) {
  const scene = findScene(reference, state?.currentSceneId);
  return {
    enabled: true,
    eventId: scene?.id ?? null,
    location: state?.currentLocation ?? scene?.location ?? null,
    phase: activePhase(scene, state)?.id ?? null,
    sceneTurnCount: state?.sceneTurnCount ?? 0,
    narrativeMode: narrativeModeForScene(scene),
    lastApproachId: state?.lastApproachId ?? null,
    lastOutcomeTier: state?.lastOutcomeTier ?? null,
    endingId: state?.endingId ?? null,
    npcs: publicNpcRoster(reference, state),
  };
}

export function referenceEventSummary(reference, state) {
  const scene = findScene(reference, state?.currentSceneId);
  return scene
    ? { eventId: scene.id, title: scene.purpose ?? scene.id, location: state.currentLocation ?? scene.location ?? null }
    : null;
}

/**
 * 現有 combat/act.js 完成 n4 後呼叫的 reference 收尾。
 * 戰鬥勝負仍完全由 combat engine 決定；這裡只把已確定的勝利轉成副本世界狀態。
 */
export function applyReferenceFinaleVictory(reference, state) {
  const next = applyBasicEffects(state, {
    worldFlagsAdd: ["flag_xenomorph_killed"],
    airlockPhase: "secured",
    shipStatus: state?.shipStatus === "overload_started" ? "overload_started" : state?.shipStatus,
    playerLocation: "loc_narcissus",
  });
  const returnScene = findScene(reference, "evt_hypersleep_return");
  return {
    ...next,
    currentSceneId: returnScene?.id ?? next.currentSceneId,
    currentLocation: returnScene?.location ?? next.currentLocation,
    lastApproachId: "combat.n4",
    lastOutcomeTier: "戰鬥勝利",
    completedSceneIds: unique([...next.completedSceneIds, "evt_narcissus_shadow_wake", "evt_narcissus_final_purge"]),
  };
}

export function divergenceTierForReferenceOutcome(outcomeTier) {
  return OUTCOME_TO_DIVERGENCE[outcomeTier] ?? 0;
}

export function referenceAvailable(reference, state) {
  return Boolean(reference && state && findScene(reference, state.currentSceneId));
}
