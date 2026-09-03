// Scenario reference adapter —— 把 AI GM reference JSON 接到既有回合引擎。
//
// 分工：
//   reference JSON：世界真相、地圖、NPC、事件、前置條件、結果文字與 effects。
//   adapter：驗證當前事件、把玩家行動對到合法 approach、套用 effects、推進事件。
//   core/check.js：骰池、骰子、成功數與 DC。
//   LLM：只在沒有已授權原文的合理自由行動中提供受限 bridge；正常 reference result 由 server 直接演出。
//
// 注意：referenceState 存在 session.scenario.referenceState，不放進 progress。
// progress 仍然只負責章節、節點、時間、迫近度與套路，避免破壞舊存檔。

import { dcToDifficulty, difficultyToDc, validateOption } from "../turnOptions.js";
import { inferCheckParams } from "../checkIntent.js";
import { matchReferenceCondition } from "./conditions.js";
import { evaluateMajorStoryNodes, normalizeMajorStoryState } from "./majorStoryNodes.js";
import { applyDamage } from "../../core/health.js";
import {
  synchronizeExplorationState,
  recordReferenceDiscoveries,
  publicExplorationDiscoveries,
  publicUnresolvedQuestions,
  resolveTravelAction,
} from "./explorationState.js";
import {
  narrativeLocationView,
  narrativeMajorSceneVariant,
  buildNarrativeNpcPromptBlock,
} from "./narrativePackageAdapter.js";
// [2026-08-31] 這裡以前還 import 四個 build*CooperationPromptBlock，把四段
// 600 字的動態區塊拼進 reference block。那些區塊有九成是逐字相同的規則文字，
// 已經搬進靜態層（npcCooperationContract.js）；每回合真的會變的合作階段
// 併進了 npcStateMachine.js 的 [NPC_ACTIVE_STATE] 那一行（Stance / Beat）。
import {
  createNpcCooperationState,
  normalizeNpcCooperationState,
} from "./npcCooperationPolicy.js";
import {
  createRipleyCooperationState,
  normalizeRipleyCooperationState,
} from "./ripleyCooperationPolicy.js";
import {
  createParkerCooperationState,
  normalizeParkerCooperationState,
} from "./parkerCooperationPolicy.js";
import {
  createLambertCooperationState,
  normalizeLambertCooperationState,
} from "./lambertCooperationPolicy.js";
import {
  createNpcRuntimeState,
  normalizeNpcRuntimeState,
} from "./npcStateMachine.js";

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

function narrativeEntryText(scene) {
  return scene?.narrativeSource?.entryText ?? scene?.entryNarration ?? "";
}

function narrativeResultText(scene, approach, outcomeTier, selected) {
  const sourceOutcomes = scene?.narrativeSource?.outcomes?.[approach?.id] ?? {};
  return sourceOutcomes[outcomeTier] ?? sourceOutcomes[selected?.key] ?? selected?.result?.text ?? "";
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

/** 引擎已知的狀態軸；reference 只能覆寫這些欄位的起始值與 effects。 */
const STATE_AXIS_KEYS = Object.freeze(["infectionStatus", "sampleStatus", "shipStatus", "airlockPhase"]);

/**
 * NPC 的**終局**狀態：落進來就不能再被 effects 改回去。
 *
 * 為什麼 survived 也算終局：它是「這個人成功離開副本」的結論，由最終戰的 effects 寫入，
 * 而 deriveEndingId() 拿它判 end_heroic_rescue。允許它被降級，等於允許結局被後續回合改寫。
 * 復活如果哪天真的要做，那必須是一個**正式的事件**（像 core/deathAndRevival.js 那樣），
 * 不是某個 approach 的失敗結果順手把狀態寫回 alive。
 */
const TERMINAL_NPC_STATUSES = Object.freeze(new Set(["dead", "destroyed", "survived"]));

export function isTerminalNpcStatus(status) {
  return TERMINAL_NPC_STATUSES.has(status);
}

/**
 * reference 可宣告的狀態條件（結局規則、最終戰完成條件、節點完成證據共用）。
 *
 * [2026-09-01] 本體搬到 content/scenario/conditions.js —— 節點完成證據需要同一套求值器，
 * 而 progress.js 不應該為了一個純謂詞去 import 這個 1400 行的模組。
 * 這裡保留同名 re-export，既有的 import 路徑與測試都不受影響。
 */
export { matchReferenceCondition };

export function createReferenceState(reference, { initialInventory = [] } = {}) {
  const scene = firstScene(reference);
  const initialState = {
    version: 1,
    referenceId: reference?.sourcePackId ?? null,
    currentSceneId: scene?.id ?? null,
    currentLocation: scene?.location ?? null,
    completedSceneIds: [],
    unlockedEventIds: [],
    flags: [],
    visitedLocations: scene?.location ? [scene.location] : [],
    locationVisitCounts: scene?.location ? { [scene.location]: 1 } : {},
    inventory: unique(
      Array.isArray(initialInventory) && initialInventory.length
        ? initialInventory
        : (Array.isArray(reference?.startingInventory) ? reference.startingInventory : [])
    ),
    damagedItems: [],
    clues: [],
    recentDiscoveries: [],
    unresolvedQuestions: [],
    npcStatuses: initialNpcStatuses(reference),
    npcTrust: {},
    npcCooperation: {
      ...createNpcCooperationState(),
      ...createRipleyCooperationState(),
      ...createParkerCooperationState(),
      ...createLambertCooperationState(),
    },
    // S.A.E.P. 狀態機的每回合數值（見 npcStateMachine.js）。跟 npcCooperation 分開存：
    // cooperation 是「這個 NPC 授權了哪些外在反應」，runtime 是「他現在什麼心情」，
    // 前者由劇本資料驅動、後者由引擎事實驅動，混在同一個物件裡兩邊都會變得難改。
    npcRuntime: createNpcRuntimeState(reference),
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
    // 重大劇情節點的狀態（見 majorStoryNodes.js）。跟 flags 分開存：flags 是世界事實，
    // 這裡是「引擎對那些事實下的結論」，而且結論一旦定案就鎖住、不再每回合重算。
    majorStoryState: normalizeMajorStoryState(reference, null),
    // 副本可以覆寫狀態軸的起始值（例如侏羅紀副本一開場就是 shipStatus:"blackout"）。
    // 只允許覆寫引擎已知的軸，避免副本資料偷渡新的 runtime 欄位。
    ...Object.fromEntries(
      Object.entries(reference?.initialStateAxes ?? {}).filter(([key]) => STATE_AXIS_KEYS.includes(key))
    ),
  };
  return synchronizeExplorationState(reference, initialState);
}

/** 舊存檔沒有 referenceState，或 reference 換版時，補成可用形狀；只補欄位，不重置已有狀態。 */
export function normalizeReferenceState(reference, rawState) {
  const fresh = createReferenceState(reference);
  if (!rawState || typeof rawState !== "object" || rawState.referenceId !== fresh.referenceId) return fresh;
  const normalized = {
    ...fresh,
    ...rawState,
    referenceId: fresh.referenceId,
    completedSceneIds: unique(rawState.completedSceneIds),
    unlockedEventIds: unique(rawState.unlockedEventIds),
    flags: unique(rawState.flags),
    visitedLocations: unique([
      ...(Array.isArray(rawState.visitedLocations) ? rawState.visitedLocations : []),
      rawState.currentLocation,
      fresh.currentLocation,
    ]),
    locationVisitCounts: {
      ...fresh.locationVisitCounts,
      ...normalizeLocationVisitCounts(rawState.locationVisitCounts),
    },
    inventory: unique(rawState.inventory),
    damagedItems: unique(rawState.damagedItems),
    clues: unique(rawState.clues),
    recentDiscoveries: Array.isArray(rawState.recentDiscoveries) ? rawState.recentDiscoveries.slice(-24) : [],
    unresolvedQuestions: Array.isArray(rawState.unresolvedQuestions) ? rawState.unresolvedQuestions.slice(-24) : [],
    npcStatuses: cloneObject(rawState.npcStatuses, fresh.npcStatuses),
    npcTrust: cloneObject(rawState.npcTrust, {}),
    npcCooperation: {
      ...normalizeNpcCooperationState(rawState.npcCooperation),
      ...normalizeRipleyCooperationState(rawState.npcCooperation),
      ...normalizeParkerCooperationState(rawState.npcCooperation),
      ...normalizeLambertCooperationState(rawState.npcCooperation),
    },
    npcRuntime: normalizeNpcRuntimeState(reference, rawState.npcRuntime),
    injuries: unique(rawState.injuries),
    sceneTurnCount: Number.isInteger(rawState.sceneTurnCount) && rawState.sceneTurnCount >= 0
      ? rawState.sceneTurnCount
      : 0,
    actionHistory: Array.isArray(rawState.actionHistory) ? rawState.actionHistory.slice(-24) : [],
    majorStoryState: normalizeMajorStoryState(reference, rawState.majorStoryState),
  };
  return synchronizeExplorationState(reference, normalized);
}

function flagSet(state) {
  return new Set(state?.flags ?? []);
}

function normalizeLocationVisitCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([locationId, count]) => typeof locationId === "string" && Number.isInteger(count) && count >= 0)
      .slice(-24)
  );
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

/**
 * V2 DM 模式的公開方向提示。這裡只取目前可用 approach 的 intent/label，
 * 不公開 approach id、屬性、技能、DC、effects 或任何未達公開條件的資料。
 * 提示不是限制，前端也不應把它畫成必須點選的決策卡。
 */
export function buildReferenceHints(reference, state, { limit = 3 } = {}) {
  const { entries } = currentApproaches(reference, state);
  const seen = new Set();
  const hints = [];
  for (const { approach } of entries) {
    const hint = approachHint(approach).trim();
    if (!hint || seen.has(hint)) continue;
    seen.add(hint);
    hints.push(hint);
    if (hints.length >= Math.max(0, Math.min(3, limit))) break;
  }
  return hints;
}

export function buildDmPrompt(reference, state) {
  return {
    mode: "free_action",
    // 保留欄位形狀供舊 client 相容，但不再提供第二個泛用 DM 問句。
    // 正式問句應由 narration 自然收束產生；前端只顯示下方的行動方向提示。
    question: null,
    hint: "可參考的行動方向如下；你也可以描述其他合理行動，提示不是限制。",
    referenceHints: buildReferenceHints(reference, state),
  };
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

/**
 * [2026-09-03] 同一個 approach 在同一個場景已經被試過幾次、其中失敗幾次。
 *
 * 資料來源是既有的 state.actionHistory（applyReferenceResult() 每次裁定都會追加一筆），
 * 不新增任何 state 欄位——舊存檔不用轉檔，也不會多一個要同步維護的真理來源。
 *
 * 為什麼需要這個數字：實測劇情包（USCSS 諾斯托羅莫號，第 11~13 回）出現同一個
 * approach「以檢疫協議交涉」連續失敗三次、每一次印出**逐字相同**的結果文字。
 * 成因是 approach 的前置條件（flagsAbsent: flag_ash_talked）在失敗時不會成立，
 * 於是它永遠留在選單上、永遠回同一段罐頭。統計出「這一招已經失敗 N 次」之後：
 *   - buildReferencePromptBlock() 把它寫進提示，要求 AI 換角度、不要重述同一段；
 *   - listSelectableApproaches() 把連續失敗達上限的 approach 標成 exhausted，
 *     AI 不再把它做成選項——選單才會真的隨著局勢改變。
 */
export function approachAttemptStats(state, sceneId, approachId) {
  const history = Array.isArray(state?.actionHistory) ? state.actionHistory : [];
  let attempts = 0;
  let failures = 0;
  let lastResultKey = null;
  for (const entry of history) {
    if (entry?.sceneId !== sceneId || entry?.approachId !== approachId) continue;
    attempts += 1;
    lastResultKey = entry.resultKey ?? entry.outcomeTier ?? null;
    if (FAILURE_RESULT_KEYS.has(String(lastResultKey))) failures += 1;
  }
  return { attempts, failures, lastResultKey };
}

/** 算「這次沒成」的結果分級。大成功／成功／自動一律不算失敗。 */
const FAILURE_RESULT_KEYS = new Set(["失敗", "大失敗"]);

/**
 * 同一個 approach 累計失敗到這個次數，就不再放進可選清單。
 *
 * 2 是刻意的：第一次失敗是「這條路這次沒走通」，第二次失敗才確立「這條路走不通」。
 * 再往上加只是讓玩家重複讀同一段失敗文字——那正是這一輪要修掉的體感問題。
 * 這是 [設計]，規則書沒有這一條；改數字要連 test/referenceOptions.test.js 一起改。
 */
export const APPROACH_FAILURE_LIMIT = 2;

/**
 * 目前場景真的能選的 approach（含嘗試統計）。
 *
 * 這是「AI 產生選項」與「引擎查驗選項」共用的**同一份**清單——AI 只能從這裡挑 id，
 * 挑到清單外的 id 一律當成它自創的自由選項，換不到作者寫好的結果與 effects。
 */
export function listSelectableApproaches(reference, state, { limit = 8 } = {}) {
  const { scene, phase, entries } = currentApproaches(reference, state);
  if (!scene) return { scene: null, phase: null, approaches: [] };
  const approaches = entries.slice(0, Math.max(1, limit)).map(({ approach, phaseId }) => {
    const stats = approachAttemptStats(state, scene.id, approach.id);
    return {
      id: approach.id,
      label: approach.label,
      intent: approach.intent ?? null,
      requiresCheck: approach.requiresCheck === true,
      attribute: approach.requiresCheck === true ? approach.attribute : null,
      skill: approach.requiresCheck === true ? approach.skill ?? null : null,
      difficulty: approach.requiresCheck === true ? approach.difficulty : null,
      phaseId: phaseId ?? phase?.id ?? null,
      ...stats,
      exhausted: stats.failures >= APPROACH_FAILURE_LIMIT,
    };
  });
  return { scene, phase, approaches };
}

/**
 * 把 AI 這一回合寫出來的選項綁回引擎資料。
 *
 * 分工跟 content/turnOptions.js 檔頭那條分界線完全一致：
 *   AI 負責 label 與 hint——「這個行動用什麼字講出來」是說書人的工作；
 *   引擎負責 attribute／skill／difficulty／dc 與 reference 綁定——AI 若在這幾格填了值
 *   一律不採用，全部從 reference 資料重建。AI 說某個選項對應 app_ash_talk_quarantine，
 *   引擎仍會自己去查那個 id 現在可不可選、它的檢定組合是什麼。
 *
 * approachId 不在可選清單裡（AI 自創、幻覺 id、或已 exhausted 的招）一律降級成自由選項：
 * source="ai_free"、沒有 reference 綁定，送出後走既有的自由行動路徑，
 * 由 content/checkIntent.js 推論檢定——它拿不到作者寫好的 effects，
 * 所以一個幻覺 id 換不到任何世界狀態改變。
 */
export function bindAiReferenceOptions({ reference, state, aiOptions, character = null, limit = 4 } = {}) {
  const { scene, approaches } = listSelectableApproaches(reference, state);
  if (!scene) return [];
  const byId = new Map(approaches.filter((entry) => !entry.exhausted).map((entry) => [entry.id, entry]));
  const usedApproachIds = new Set();
  const seenLabels = new Set();
  const options = [];

  for (const raw of Array.isArray(aiOptions) ? aiOptions : []) {
    if (options.length >= limit) break;
    const label = String(raw?.label ?? "").trim().slice(0, 30);
    if (!label) continue;
    // 同一句話出現兩次是模型偶發的重複，不是兩個選項。
    const labelKey = label.replace(/\s+/g, "");
    if (seenLabels.has(labelKey)) continue;
    seenLabels.add(labelKey);

    const hint = String(raw?.hint ?? "").trim().slice(0, 24) || null;
    const wantedId = typeof raw?.approachId === "string" ? raw.approachId.trim() : "";
    const bound = wantedId && !usedApproachIds.has(wantedId) ? byId.get(wantedId) : null;

    if (bound) {
      usedApproachIds.add(bound.id);
      options.push({
        label,
        hint: hint ?? bound.intent ?? null,
        requiresCheck: bound.requiresCheck,
        attribute: bound.attribute,
        skill: bound.skill,
        difficulty: bound.difficulty,
        dc: bound.requiresCheck ? difficultyToDc(bound.difficulty) : null,
        source: "ai_reference",
        reference: { sceneId: scene.id, approachId: bound.id, phaseId: bound.phaseId },
      });
      continue;
    }

    // AI 自創的行動。檢定由引擎推論，不是 AI 自己填的——選項卡上顯示的「感知＋偵察」
    // 才會跟玩家按下去之後真正擲的那一組相同。這是資訊公開的前提：
    // 公開的數字必須就是實際會用的那一個，否則公開反而是騙人。
    const inferred = inferCheckParams(label, character ? { character } : {});
    const requiresCheck = Boolean(inferred?.requiresCheck && inferred?.attribute);
    options.push({
      label,
      hint,
      requiresCheck,
      attribute: requiresCheck ? inferred.attribute : null,
      skill: requiresCheck ? inferred.skill ?? null : null,
      difficulty: requiresCheck ? dcToDifficulty(inferred.dc) : null,
      dc: requiresCheck ? inferred.dc ?? null : null,
      source: "ai_free",
      reference: null,
    });
  }
  return options;
}

/** 由 reference event 產生目前能做的簡要選項。順序完全依作者資料，不依骰池排序。 */
export function buildReferenceOptions(reference, state, { limit = 4 } = {}) {
  const { scene, phase, entries } = currentApproaches(reference, state);
  if (!scene) return [];
  return entries.slice(0, limit).map(({ approach, phaseId }) => publicReferenceOption(approach, scene.id, phaseId ?? phase?.id ?? null));
}

function referenceTerms(text) {
  const source = String(text ?? "");
  const terms = new Set();
  // 中文用連續二字詞；拉丁字母改用完整 token，避免 generic English words
  // （例如 referenceState 的「re」）與 NPC 名稱 Lambert/Ripley 產生假命中。
  const hanRuns = source.match(/[\u3400-\u9fff\u{20000}-\u{2ffff}]+/gu) ?? [];
  for (const run of hanRuns) {
    for (let i = 0; i < run.length - 1; i += 1) terms.add(run.slice(i, i + 2));
  }
  const latinTokens = source.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? [];
  for (const token of latinTokens) terms.add(token.toLowerCase());
  return terms;
}

const EMPTY_SET = Object.freeze(new Set());

/** 目前場景開場白（entryNarration）出現過的詞——玩家複述這些詞不代表在挑對應 approach。 */
function sceneFurnitureTerms(scene) {
  return referenceTerms(narrativeEntryText(scene));
}

/** 這個 reference 裡所有 NPC 的名字——即使開場白提過，指名道姓仍是強訊號，不算場景雜訊。 */
function referenceNpcNameTerms(reference) {
  const names = (reference?.npcs ?? []).map((npc) => npc?.name).filter(Boolean).join(" ");
  return referenceTerms(names);
}

/**
 * [2026-09-03] 兩個新門檻是實測抓到的一個誤觸發案例逼出來的，值得寫下取捨過程。
 *
 * 休眠室唯一 approach「撿起手電筒照拖痕」（intent：確認痕跡通往哪裡）。玩家其實是
 * 在回應 NPC「別看血跡，看著天花板」，照做時提到「撿起手電筒」——只是複述場景
 * 開場白已經講過的道具，跟「追查拖痕」的目的完全無關。但舊版只看原始 bigram 分數
 * （門檻僅 2），「撿起手電筒」這四個字就命中 label 一半以上的 bigram，直接觸發了
 * 跟玩家意圖無關的酸蝕黏液劇本，蓋掉了玩家真正想做的事。
 *
 * 第一版修法試過「比例」（命中 bigram / label 全部 bigram），失敗了：label 越長，
 * 门槛就要求越高比例，而 label 的長短是作者行文風格決定的，跟玩家講話像不像這個
 * approach 完全無關。實測第二個案例戳破了這個假設——「我安撫 Lambert，請 Ripley
 * 說明下一步」要命中「透過對講機用冷靜專業的語氣安撫崩潰的 Lambert」，label 長達
 * 17 字，玩家一句話的比例怎麼样都拉不上去，比例門檻反而擋掉了這個本來就該命中的
 * 合法案例。純粹比較 bigram 數量/比例，沒辦法同時擋掉第一案、放行第二案——兩邊的
 * 表面訊號其實一樣模糊（[動詞]+[名詞受詞]），差別只在於「手電筒」是這個場景開場
 * 白就講過的道具、「Lambert」是這個 approach 真正要安撫的對象。
 *
 * 所以改成兩條真正不同性質的證據，任一條成立就算數：
 *
 *   (a) 場景過濾後的 bigram 分數：跟這個場景 entryNarration 撞詞的 label bigram
 *       不計分——因為玩家提到場景已經講過的道具/描述，不代表他在挑這個 approach；
 *       但 NPC 的名字例外，不因為開場白提過這個名字就不算數，指名道姓通常正是
 *       在挑「跟這個人互動」的那個 approach。
 *   (b) checkIntent 的推論：approach 需要判定時，如果玩家這句話用 content/checkIntent.js
 *       （骰池判定用的同一套規則）獨立推得出跟這個 approach 完全相同的屬性/技能，
 *       這是比字面重疊更硬的證據——兩套完全獨立的判準都認為玩家在做同一件事。
 */
const FREE_TEXT_MIN_SCORE = 10;

function matchScore(input, approach, { furnitureTerms = EMPTY_SET, npcNameTerms = EMPTY_SET } = {}) {
  const text = String(input ?? "").replace(/\s+/g, "");
  if (!text) return 0;
  const label = String(approach?.label ?? "").replace(/\s+/g, "");
  const intent = String(approach?.intent ?? "").replace(/\s+/g, "");
  if ((label && text.includes(label)) || (intent && text.includes(intent))) {
    // 玩家逐字打出 label 或 intent：意圖不可能更明確，直接視為滿分命中。
    return Infinity;
  }
  const inputTerms = referenceTerms(text);
  const labelTerms = referenceTerms(label);
  const intentTerms = referenceTerms(intent);
  let score = 0;
  for (const term of labelTerms) {
    if (!inputTerms.has(term)) continue;
    const isSceneFurniture = furnitureTerms.has(term) && !npcNameTerms.has(term);
    if (!isSceneFurniture) score += 2;
  }
  for (const term of intentTerms) if (inputTerms.has(term)) score += 1;
  return score;
}

/** checkIntent 獨立推出跟這個 approach 相同的屬性（與技能，若 approach 有指定技能）。 */
function checkIntentCorroborates(playerAction, approach, character) {
  if (!approach?.requiresCheck || !approach?.attribute) return false;
  const inferred = inferCheckParams(playerAction, { character });
  if (!inferred?.requiresCheck || inferred.attribute !== approach.attribute) return false;
  return !approach.skill || inferred.skill === approach.skill;
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
    const { scene: currentScene, entries } = currentApproaches(reference, state);
    const furnitureTerms = sceneFurnitureTerms(currentScene);
    const npcNameTerms = referenceNpcNameTerms(reference);
    const candidates = entries
      .map(({ approach, phaseId }) => {
        const score = matchScore(playerAction, approach, { furnitureTerms, npcNameTerms });
        const corroborated = checkIntentCorroborates(playerAction, approach, character);
        return { approach, phaseId, score, corroborated };
      })
      // corroborated 只當「補強證據」用，不能單獨成立：純粹字數很長、剛好開頭撞上
      // 一個技能關鍵字（例如「觀察」開頭接一千個無意義字元）不該無視後面全部內容，
      // 靠兩個字直接鎖定一個 approach，所以仍要求 score > 0，確定文字上跟這個
      // approach 的 label/intent 有實質重疊，而不是只有 checkIntent 單方面say yes。
      .filter(({ score, corroborated }) => score >= FREE_TEXT_MIN_SCORE || (corroborated && score > 0))
      // corroborated 命中直接視為最高信心，排序上優先於單純 bigram 分數。
      .sort((a, b) => (b.corroborated - a.corroborated) || (b.score - a.score));
    if (candidates.length && (candidates.length === 1 || candidates[0].corroborated !== candidates[1].corroborated || candidates[0].score > candidates[1].score)) {
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

/**
 * 依 server 已完成的 canonical 判定組裝這一回合的公開演出。
 *
 * 這個 helper 只挑文字，不重新判定 outcome、effects、威脅、位置、NPC 狀態或結局。
 * `applied` 必須來自 applyReferenceResult()；未命中的自由行動、缺少原文的結果
 * 或未授權 overlay 都回傳 null，交由 turn route 的 bridge／安全敘事處理。
 */
// [2026-08-28新增] canonical result 與 NPC overlay／下一場景 entry 併接時的保守去重。
//
// 背景：resolveCanonicalNarrative() 原本只做完全字串相等比對，擋不住「意思相同、
// 用詞不同」的重述——real Gemini 測試實際抓到一個案例：陸遠的 overlay 已經在講
// 「船上的東西靠聲音和震動移動、別困在沒有第二出口的房間」，這兩件事 canonical
// result 本來就講過。已經把陸遠那筆 overlay 資料本身修正過，但這裡仍然加一層
// 通用防線，之後任何新副本、新 overlay 都受保護，不用每次都手動抓重複。
//
// 只用 deterministic 的字元 bigram overlap 比對，不呼叫 LLM 判斷語意——理由跟
// referenceTerms() 一致：這是會影響「這段文字算不算合法演出」的判斷，必須可重現、
// 可測試，不能交給模型臨場決定。
function normalizeForOverlap(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[，。！？「」『』：；、,.!?:;"'()（）\[\]【】]/gu, "");
}

function splitSentences(text) {
  return String(text ?? "")
    .split(/(?<=[。！？\n])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function bigramSet(text) {
  const normalized = normalizeForOverlap(text);
  const grams = new Set();
  for (let i = 0; i < normalized.length - 1; i += 1) grams.add(normalized.slice(i, i + 2));
  if (grams.size === 0 && normalized.length > 0) grams.add(normalized);
  return grams;
}

function overlapRatio(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const gram of smaller) if (larger.has(gram)) shared += 1;
  return shared / smaller.size;
}

/**
 * 只在候選文字對既有段落「有新意」時才附加；重複句子會被逐句過濾掉，
 * 不會整段丟棄，也不會改寫 canonical result 本身一個字。
 */
export function appendDistinctNarrativePart(parts, candidate, { threshold = 0.78 } = {}) {
  const candidateText = String(candidate ?? "").trim();
  if (!candidateText) return parts;
  const baseSentences = parts.flatMap((part) => splitSentences(part)).map(bigramSet);
  const freshSentences = splitSentences(candidateText).filter((sentence) => {
    const grams = bigramSet(sentence);
    return !baseSentences.some((baseGrams) => overlapRatio(grams, baseGrams) >= threshold);
  });
  if (!freshSentences.length) return parts;
  return [...parts, freshSentences.join("")];
}

export function resolveCanonicalNarrative({
  reference,
  state,
  resolution,
  applied,
  actionText = "",
  outcomeTier = null,
  includeNextSceneEntry = true,
} = {}) {
  if (!reference || !state || !applied?.applied || !String(applied.resultText ?? "").trim()) return null;

  const sceneId = resolution?.scene?.id ?? null;
  const approachId = resolution?.approach?.id ?? null;
  const selectedTier = applied.resultKey ?? outcomeTier ?? null;
  const overlay = sceneId && approachId && selectedTier
    ? narrativeMajorSceneVariant(reference, {
        sceneId,
        approachId,
        outcomeTier: selectedTier,
        actionText,
      })
    : null;

  let parts = [String(applied.resultText).trim()];
  let overlayApplied = false;
  if (overlay?.text) {
    const withOverlay = appendDistinctNarrativePart(parts, overlay.text.trim());
    if (withOverlay.length > parts.length) {
      parts = withOverlay;
      overlayApplied = true;
    }
  }

  let sceneEntryIncluded = false;
  const nextSceneId = applied.nextSceneId ?? null;
  if (
    includeNextSceneEntry &&
    applied.sceneAdvanced &&
    nextSceneId &&
    nextSceneId !== sceneId
  ) {
    const nextScene = findScene(reference, nextSceneId);
    const entryText = narrativeEntryText(nextScene).trim();
    if (entryText) {
      const withEntry = appendDistinctNarrativePart(parts, entryText);
      if (withEntry.length > parts.length) {
        parts = withEntry;
        sceneEntryIncluded = true;
      }
    }
  }

  const source = overlayApplied && sceneEntryIncluded
    ? "canonical_result_with_overlay_and_scene_entry"
    : overlayApplied
      ? "canonical_result_with_overlay"
      : sceneEntryIncluded
        ? "canonical_result_with_scene_entry"
        : "canonical_result";

  return {
    source,
    text: parts.join("\n\n"),
    sceneId,
    approachId,
    outcomeTier: selectedTier,
    overlayId: overlay?.id ?? null,
    nextSceneId,
    sceneEntryIncluded,
  };
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
  frostbite_minor: { amount: 1, type: "B", label: "輕度凍傷" },
  impact_hand_minor: { amount: 1, type: "B", label: "手部撞擊傷" },
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
    visitedLocations: [...(state.visitedLocations ?? []), state.currentLocation].filter(Boolean),
    inventory: [...state.inventory],
    damagedItems: [...state.damagedItems],
    clues: [...state.clues],
    recentDiscoveries: [...(state.recentDiscoveries ?? [])],
    unresolvedQuestions: [...(state.unresolvedQuestions ?? [])],
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
  for (const [npcId, status] of Object.entries(effects.npcStatusChanges ?? {})) {
    if (isTerminalNpcStatus(next.npcStatuses[npcId]) && next.npcStatuses[npcId] !== status) {
      // [2026-09-01] 這一行以前是無條件覆寫，於是資料裡的一筆矛盾就能讓人復活：
      // evt_ash_ambush / app_ash_shoot 的「大成功」設 npc_ash=destroyed，
      // 「慘烈失敗」設 npc_ash=alive——只要能再射一次，Ash 就活過來了。
      //
      // 死亡是不可逆的（討論稿 §十.4）。允許 dead→alive 的話，重大劇情節點與結局條件
      // （deriveEndingId 讀 npcStatuses）全部建在一個可以被後續 effect 抹掉的事實上。
      // 靜默丟棄同樣不行——那會讓副本作者永遠看不到自己的資料互相矛盾，所以留一筆
      // 可搜尋的 log，格式跟 [SCENARIO_SETTLEMENT_BLOCKED] 一致。
      console.warn("[NPC_STATUS_DOWNGRADE_BLOCKED]", JSON.stringify({
        where: "applyBasicEffects",
        npcId,
        current: next.npcStatuses[npcId],
        attempted: status,
        hint: "終局狀態(dead/destroyed/survived)不可被後續 effect 覆寫；請修正 reference 資料",
      }));
      continue;
    }
    next.npcStatuses[npcId] = status;
  }
  for (const [npcId, delta] of Object.entries(effects.npcTrustDelta ?? {})) {
    next.npcTrust[npcId] = Number(next.npcTrust[npcId] ?? 0) + Number(delta ?? 0);
  }
  for (const key of [...STATE_AXIS_KEYS, "playerLocation"]) {
    if (effects[key] !== undefined) {
      const target = key === "playerLocation" ? "currentLocation" : key;
      next[target] = effects[key];
      if (key === "playerLocation" && effects[key]) {
        next.visitedLocations = unique([...next.visitedLocations, effects[key]]);
      }
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
  // 副本可以用資料宣告自己的結局判定順序；沒有宣告時沿用 Alien V2 的內建規則。
  if (Array.isArray(reference?.endingRules) && reference.endingRules.length) {
    const matched = reference.endingRules.find(
      (rule) => rule?.endingId && matchReferenceCondition(rule, state)
    );
    return matched?.endingId ?? null;
  }
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

/**
 * 套用一個已經由引擎判定的 reference result，回傳 immutable state 與節點/場景推進訊號。
 *
 * @param {number} [turnNumber] 只用來記錄重大劇情節點的 resolvedAtTurn（稽核用）。
 *   不傳就是 0——節點仍然會正確定案，只是查不到「哪一回合定的」。
 */
export function applyReferenceResult({ reference, state, resolution, outcomeTier, turnNumber = 0 }) {
  if (!resolution?.matched) return { applied: false, state, error: "沒有可套用的 reference action" };
  const selected = resultForOutcome(resolution.approach, outcomeTier);
  if (!selected) {
    return { applied: false, state, error: `事件「${resolution.approach.id}」沒有結果「${outcomeTier}」的文字或後果資料` };
  }

  const resultText = narrativeResultText(resolution.scene, resolution.approach, outcomeTier, selected);
  const narrativeResult = { ...selected.result, text: resultText };
  const conditionalEffects = conditionalEffectsFor(selected.result, state);
  let nextState = applyBasicEffects(state, selected.result.effects ?? {});
  for (const effects of conditionalEffects) nextState = applyBasicEffects(nextState, effects);
  const discoveryEffects = {
    ...(selected.result.effects ?? {}),
    cluesAdd: unique([
      ...(selected.result.effects?.cluesAdd ?? []),
      ...conditionalEffects.flatMap((effects) => effects.cluesAdd ?? []),
    ]),
  };

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
  nextState.visitedLocations = unique([
    ...(nextState.visitedLocations ?? []),
    nextState.currentLocation,
  ]);

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
    lastResultText: resultText || null,
    actionHistory: [...(nextState.actionHistory ?? []), actionEntry].slice(-24),
  };
  nextState = recordReferenceDiscoveries(reference, nextState, {
    scene: resolution.scene,
    approach: resolution.approach,
    result: narrativeResult,
    effects: discoveryEffects,
    outcomeTier: selected.key,
  });

  // [2026-09-01 第二階段] 重大劇情節點的重新評估。
  //
  // 位置是刻意的：這裡是**所有狀態變更的匯流點**——基礎 effects、conditionalEffects、
  // 狀態軸、NPC 狀態與探索紀錄全部套用完之後。掛在 turn.js 只會蓋到一般回合那條路徑，
  // travel 與戰鬥收尾就漏了。
  //
  // evaluateMajorStoryNodes() 的簽章裡沒有任何參數可以傳敘事文字，所以
  // 「AI 寫了陸遠死了」在結構上就不可能讓節點解決（見該模組檔頭）。
  const majorStory = evaluateMajorStoryNodes(reference, nextState, { turnNumber });
  nextState = { ...nextState, majorStoryState: majorStory.majorStoryState };

  const nextNode = nextScene?.nodeId ?? null;
  // 這個場景離場時關掉哪個節點：優先採用作者在 sceneExit.completeNode 明寫的那個。
  //
  // [2026-09-01] 這個欄位在 6 個場景裡都寫了，但在此之前**從來沒有人讀過它**——
  // 引擎一直用 scene.nodeId 去推。兩者在 Alien V2 剛好每一筆都相同，所以接回來不改變
  // 任何現有行為；接它的理由是「作者明寫的東西不該是死資料」，而且下一個副本很可能
  // 需要「這個場景結束時關掉的是另一個節點」，那時候隱含規則會安靜地推錯。
  const settledNodeId = resolution.scene.sceneExit?.completeNode ?? resolution.scene.nodeId;
  const nodeComplete =
    !isFinaleScene(reference, resolution.scene) &&
    sceneAdvanced &&
    nextNode !== settledNodeId
      ? { nodeId: settledNodeId, divergenceTier: OUTCOME_TO_DIVERGENCE[outcomeTier] ?? 0 }
      : null;

  const endingId = selected.result.effects?.terminalOutcome ?? null;
  if (endingId) nextState.endingId = endingId;
  const finaleComplete =
    isFinaleScene(reference, resolution.scene) &&
    (reference?.finaleCompletion
      ? matchReferenceCondition(reference.finaleCompletion, nextState)
      : nextState.airlockPhase === "secured" && nextState.flags.includes("flag_xenomorph_killed"));

  return {
    applied: true,
    state: nextState,
    resultText,
    resultKey: selected.key,
    effects: selected.result.effects ?? {},
    effectSummary: effectSummary(selected.result.effects),
    sceneCompleted: sceneAdvanced,
    sceneAdvanced,
    sceneTurnCount: nextState.sceneTurnCount,
    transition: selected.result.effects?.sceneTransition ?? (sceneAdvanced ? "advance" : "stay"),
    nextSceneId: nextState.currentSceneId,
    // 這一回合真的變動的重大節點。沒有變動就是空陣列，呼叫端據此決定要不要送那一段提示。
    majorStoryChanges: majorStory.changes,
    nodeComplete,
    finaleComplete,
    endingId,
  };
}

/**
 * 【歷史層】一個場景的固定簡報：整個場景都不會變的那一段。
 *
 * [2026-08-31] 這些行原本在 buildReferencePromptBlock() 裡，跟著每回合的狀態一起重送。
 * 實測連續兩回合的 reference block 有 97% 逐字相同，而它 1906 字元——
 * 也就是每回合花一千八百多個字元重送一段沒有變的東西。
 *
 * 但它**不能**進靜態層：它是「場景範圍」的固定值，不是「整場遊戲」的。
 * 放進 system 的話，每換一次場景就會讓整個靜態前綴加上全部歷史一起失效，
 * 一場遊戲換十幾次場景，比每回合付 1900 字元還貴。
 *
 * 正確的位置是歷史層：換場景時追加一次，之後就永遠命中前綴（見 cacheLayers.js 的
 * historyToMessages）。這也是為什麼這個函式**只能吃 reference 與 sceneId**——
 * 它一旦吃 state，舊場景的簡報就會隨著玩家撿到線索而改變，整條歷史前綴跟著失效。
 *
 * @param {object} reference canonical reference
 * @param {string} sceneId 事件 id
 * @returns {string} 找不到場景時回傳 ""
 */
export function buildSceneBriefBlock(reference, sceneId) {
  const scene = findScene(reference, sceneId);
  if (!scene) return "";
  const lines = [
    "<Scene_Brief>",
    `【進入事件 ${scene.id}：這一段是本場景的固定背景，之後不再重述】`,
    `事件目的：${scene.purpose ?? "推進目前場景"}`,
    `事件真相：${(scene.gmTruth ?? []).join("；") || "依 reference 資料與已保存狀態裁定"}`,
    `玩家目前可知：${(scene.entryKnowledge ?? []).join("；") || "依故事歷史"}`,
    `本事件節拍：${(scene.beats ?? []).join(" → ") || "依玩家行動推進"}`,
  ];
  // 環境素材取**不吃 state 的那一半**：空間、氣氛、地標、可見危險整個場景都一樣。
  // 回訪變化（revisitVariant）吃訪問次數，留在動態層。
  const locationView = narrativeLocationView(reference, null, scene.location, { visited: true });
  if (locationView) {
    lines.push(
      "",
      `空間：${locationView.description}`,
      ...(locationView.atmosphere ? [`氣氛：${locationView.atmosphere}`] : []),
      ...(locationView.landmarks?.length ? [`地標：${locationView.landmarks.map((item) => item.text ?? item).join("；")}`] : []),
      ...(locationView.hazardHints?.length ? [`可見危險：${locationView.hazardHints.join("；")}`] : []),
      "這些文字只能補充畫面與感官；不能自行宣稱新增物品、傷勢、位置、旗標、威脅或事件結果。",
    );
  }
  lines.push("</Scene_Brief>");
  return lines.join("\n");
}

export function buildReferencePromptBlock({
  reference,
  state,
  resolution = null,
  applied = null,
    actionText = "",
    outcomeTier = null,
    turnNumber = 0,
  }) {
  const currentScene = findScene(reference, state?.currentSceneId) ?? firstScene(reference);
  const scene = resolution?.matched ? resolution.scene : currentScene;
  if (!scene) return "";
  const { phase, entries } = currentApproaches(reference, state);
  const lines = [
    "<Reference_Event>",
    "【副本事件資料（系統真相，不是玩家可以改寫的設定）】",
    // 事件目的／真相／可知／節拍與環境素材已經搬進歷史層的 <Scene_Brief>
    // （見 buildSceneBriefBlock 的說明）：它們整個場景都不會變，每回合重送是白付。
    // 這裡只留每回合真的會動的東西。
    `事件ID：${scene.id}`,
    `所在房間：${state.currentLocation ?? scene.location ?? "未知"}`,
    `目前階段：${phase?.id ?? "一般事件"}`,
    `目前場景回合：${state?.sceneTurnCount ?? 0}（事件卡預設可持續多回合，除非離場條件成立）`,
    ...(applied && currentScene?.id !== scene.id
      ? [
          `下一事件：${currentScene?.id ?? "依狀態決定"}`,
          `下一事件固定進入文字：${narrativeEntryText(currentScene) || "依目前事件資料演出抵達場景"}`,
        ]
      : []),
    `玩家最近確認的探索紀錄：${publicExplorationDiscoveries(state).map((item) => `${item.title}：${item.text}`).join("；") || "尚無"}`,
    `玩家未解問題：${publicUnresolvedQuestions(state).filter((item) => item.status !== "answered").map((item) => item.text).join("；") || "尚無"}`,
    "",
    "可供玩家參考的 approach（不是限制；合理的其他行動可以由 adapter 以最接近的方法裁定）：",
  ];
  const attemptedApproaches = [];
  for (const { approach } of entries) {
    const stats = approachAttemptStats(state, scene.id, approach.id);
    const exhausted = stats.failures >= APPROACH_FAILURE_LIMIT;
    // 嘗試次數要跟 approach 印在同一行：模型讀到「這一招已經失敗 2 次」才有機會
    // 換個角度重寫，而不是第三次再端出同一段話（見 approachAttemptStats 的說明）。
    const history = stats.attempts
      ? `；玩家已試過 ${stats.attempts} 次（失敗 ${stats.failures} 次）${exhausted ? "，已判定為走不通：不要再把它做成選項，也不要重述前幾次的失敗文字" : "，再寫一次必須換角度、換措辭"}`
      : "";
    if (stats.attempts) attemptedApproaches.push(`${approach.label}（${stats.attempts}次）`);
    lines.push(
      `- ${approach.id}：${approach.label}；目的：${approach.intent ?? "推進局面"}；` +
        `${approach.requiresCheck === false ? "無需檢定" : `檢定 ${approach.attribute}+${approach.skill ?? "純屬性"}，難度 ${approach.difficulty}`} ` +
        `；前置：${JSON.stringify(approach.required ?? {})}${history}`
    );
  }
  if (attemptedApproaches.length) {
    lines.push(`玩家在這個場景已經試過：${attemptedApproaches.join("、")}。這些嘗試都已經發生過，敘事必須承接它們，不可以寫得像第一次遇到。`);
  }
  if (resolution?.matched && applied) {
    lines.push("", "【這一回合已由 adapter 裁定的 reference 結果】");
    lines.push(`採用方法：${resolution.approach.id}`);
    lines.push(`結果分級：${applied.resultKey}`);
    lines.push(`本回合已定案的事實（素材，不是要你照抄的成品）：${applied.resultText}`);
    lines.push(`已套用狀態效果：${JSON.stringify(applied.effectSummary)}`);
    // [2026-09-03] 這一段的措辭是刻意改過的，改動理由值得留下來。
    //
    // 舊版寫的是「只能在這些固定結果之上擴寫」，而 turn.js 那時根本沒有把這段送給模型——
    // 命中 approach 的回合直接把 resultText 逐字印給玩家（canonicalDirectSend）。
    // 後果在實測劇情包裡看得一清二楚：同一個 approach 失敗三次，玩家連續讀到三段
    // 逐字相同的文字。現在改成「事實由引擎給、句子由你寫」：
    //   - 事實不可增刪：不能多一個引擎沒授權的物品／傷勢／旗標，也不能少掉已定案的結果；
    //   - 句子必須重寫：同一個事實在第二次、第三次發生時要用不同的鏡頭與措辭。
    // 引擎仍然一個數字都不讓模型碰——effects 早在呼叫模型之前就套用完畢了。
    lines.push("這段固定結果是**事實清單**，不是要你照抄的成品：請用你自己的文字把它演出來。事實本身不可增刪（不可新增資料中不存在的物品、NPC、真相或狀態效果，也不可略過已定案的結果）；若固定結果與玩家輸入的自我宣稱衝突，以固定結果為準。");
    lines.push("如果上面標示玩家已經試過這個 approach，這一次的敘事必須明顯不同於前幾次：換鏡頭、換切入點、讓在場 NPC 有新的反應或不耐煩，嚴禁重述同一段話。");
    const majorVariant = narrativeMajorSceneVariant(reference, {
      sceneId: resolution.scene?.id,
      approachId: resolution.approach?.id,
      outcomeTier: applied.resultKey ?? outcomeTier,
      actionText,
    });
    if (majorVariant) {
      lines.push(
        "",
        "<Major_Scene_Narrative_Overlay>",
        "【已通過 canonical binding 的重大場景演出素材】",
        `演出綁定：${majorVariant.sceneId}／${majorVariant.approachId}／${majorVariant.outcomeTier}`,
        `演出素材：${majorVariant.text}`,
        "這段文字只能補充已套用固定結果的鏡頭、感官與對話；不可把它當成新的裁定，不可新增物品、傷勢、NPC 行動、旗標、威脅、位置、時間效果或結局。若演出素材與 Engine_Result 衝突，以 Engine_Result 與已套用 effects 為準。",
        "</Major_Scene_Narrative_Overlay>",
      );
    }
  } else if (resolution?.mode === "unmatched") {
    lines.push("", "【這一回合是未命中任何 approach 的自由行動：限制性裁定】");
    lines.push(`玩家原始行動：${String(actionText).slice(0, 240) || "（未提供）"}`);
    lines.push(`引擎本回合的判定分級：${outcomeTier ?? "未提供"}`);
    lines.push("這次自由輸入只被引擎視為一個『嘗試』；本回合沒有 reference effect 授權新的持久世界改變。若上方沒有已套用狀態效果，就不能把嘗試寫成已完成的物理結果。");
    lines.push("可以寫：工具施力時的阻力、卡住、聲音、光線、氣味、NPC對嘗試的可觀察反應，以及引擎已明示的判定分級。必須保留操作尚未完成的空間，讓玩家仍能決定下一步。");
    lines.push("禁止寫成既定事實：門已開或已鎖死、通道已打通或已封死、玩家已取得或遺失物品、NPC已執行未列在 reference 的特殊指令、異形已直接接觸／衝出、路徑已經確定可通，以及任何未由 reference 或 engine effect 授權的傷害、旗標、位置、數字或精確距離。");
  }
  // 環境素材的固定部分（空間、氣氛、地標、可見危險）在歷史層的 <Scene_Brief> 裡。
  // 這裡只留吃 state 的那一項：回訪變化會隨訪問次數與旗標改變，屬於動態層。
  //
  // 玩家離開場景的預設房間、走到同一場景的另一個房間時，這裡也會補一次該房間的
  // 固定描述——簡報只涵蓋場景的預設房間，補這一段才不會讓畫面斷掉。
  const locationView = narrativeLocationView(reference, state, state?.currentLocation, { visited: true });
  const offBriefLocation = Boolean(state?.currentLocation) && state.currentLocation !== scene.location;
  if (locationView && (locationView.revisitVariant || offBriefLocation)) {
    lines.push(
      "",
      "<Exploration_Environment>",
      ...(offBriefLocation
        ? [
            "【玩家目前所在房間的公開環境素材】",
            `空間：${locationView.description}`,
            ...(locationView.atmosphere ? [`氣氛：${locationView.atmosphere}`] : []),
            ...(locationView.landmarks?.length ? [`地標：${locationView.landmarks.map((item) => item.text ?? item).join("；")}`] : []),
            ...(locationView.hazardHints?.length ? [`可見危險：${locationView.hazardHints.join("；")}`] : []),
          ]
        : []),
      ...(locationView.revisitVariant ? [`本次回訪變化（只可在確實回訪或狀態已成立時使用）：${locationView.revisitVariant}`] : []),
      "這些文字只能補充畫面與感官；不能自行宣稱新增物品、傷勢、位置、旗標、威脅或事件結果。",
      "</Exploration_Environment>",
    );
  }
  const npcVoiceBlock = buildNarrativeNpcPromptBlock(reference, state);
  if (npcVoiceBlock) lines.push("", npcVoiceBlock);
  lines.push("", buildReferenceOptionsSpec(reference, state));
  lines.push("</Reference_Event>");
  return lines.join("\n");
}

/**
 * 要求模型產出「下一步選項」的規格。放在動態層（跟著 <Reference_Event> 一起送）是必然的：
 * 它列出的 approach id 每一回合都可能不同，寫進 system 會讓整段靜態前綴每回合失效
 * （見 CLAUDE.md 的 Prompt 快取三層契約）。
 *
 * 這裡只描述「怎麼寫」，不描述「怎麼算」：模型挑 approachId、寫 label 與 hint，
 * 屬性／技能／難度／DC 一律由 bindAiReferenceOptions() 從 reference 資料重建。
 */
export function buildReferenceOptionsSpec(reference, state, { count = 4 } = {}) {
  const { scene, approaches } = listSelectableApproaches(reference, state);
  const usable = approaches.filter((entry) => !entry.exhausted);
  const exhausted = approaches.filter((entry) => entry.exhausted);
  const lines = [
    "<Next_Options>",
    `【你還要產出 ${count} 個「下一步」選項】`,
    "選項的文字由你自己寫——不要照抄下面 approach 的 label，那是給你看的內部資料，不是玩家該讀到的句子。",
    "每個選項三格：",
    '- label：玩家會說出口的行動，18 字以內，寫成人話（例如「假裝接受檢疫、退到門邊」），不要寫「進行交涉檢定」這種系統語言。',
    "- hint：做這件事想得到什麼，14 字以內。不要寫成功率，不要重複 label 的字面。",
    "- approachId：這個選項對應下面哪一個 approach 的 id；你自己想的新行動填 null。",
    "",
    scene ? `這一回合可以綁定的 approach（只有這些 id 有效，填其他 id 會被當成 null 處理）：` : "這一回合沒有可綁定的 approach，全部填 null。",
    ...usable.map((entry) =>
      `- ${entry.id}：${entry.intent ?? entry.label}${entry.attempts ? `（玩家已試 ${entry.attempts} 次）` : ""}`
    ),
    ...(usable.length ? [] : ["（無）"]),
  ];
  if (exhausted.length) {
    lines.push(
      "",
      `已經走不通、禁止再做成選項的 approach：${exhausted.map((entry) => entry.id).join("、")}。`,
      "玩家已經在這幾招上失敗過了；再端出同一個選項只會讓他重讀同一段失敗。請改成別的角度。",
    );
  }
  lines.push(
    "",
    "寫選項時請遵守：",
    `- ${count} 個選項要是 ${count} 種**不同的解決思路**（正面處理／迂迴／溝通／觀察搜證），不可以是同一件事的不同說法。`,
    "- 至少 1 個、最多 2 個選項填 null（你自己想的新行動）。全部綁 approach 會讓選單永遠是同一批；全部填 null 則會浪費作者寫好的劇情分支。",
    "- 玩家上一回合剛失敗過的做法，如果還要再給一次，label 必須換一種切入方式，不可以跟上一回合的選項逐字相同。",
    "- 局勢變了（NPC 態度、威脅逼近、拿到新線索），選項就要跟著變。選單是這一刻的處境，不是一張固定菜單。",
    "</Next_Options>",
  );
  return lines.join("\n");
}

function npcTrustView(value, status = "unknown") {
  if (!Number.isFinite(value)) {
    return status === "met"
      ? { value: null, label: "剛建立聯繫", tone: "neutral" }
      : { value: null, label: "待接觸", tone: "muted" };
  }
  if (value <= -3) return { value, label: "敵對", tone: "danger" };
  if (value <= -1) return { value, label: "疏離", tone: "warn" };
  if (value === 0) return { value, label: "觀望", tone: "neutral" };
  if (value <= 2) return { value, label: "信任", tone: "good" };
  return { value, label: "緊密", tone: "strong" };
}

function npcHasPublicContact(npc, state) {
  const id = npc?.id;
  const status = state?.npcStatuses?.[id] ?? npc?.initialStatus ?? "unknown";
  if (["met", "injured", "critical", "destroyed", "dead", "survived", "suspicious"].includes(status)) return true;

  const flags = flagSet(state);
  // 副本可以在 reference.npcs[].contactFlags / presenceScenes 自行宣告接觸條件；
  // 沒有宣告時沿用 Alien V2 的內建對照表。
  const declaredFlags = Array.isArray(npc?.contactFlags) ? npc.contactFlags : null;
  const declaredScenes = Array.isArray(npc?.presenceScenes) ? npc.presenceScenes : null;
  if (declaredFlags || declaredScenes) {
    return (
      (declaredFlags ?? []).some((flag) => flags.has(flag)) ||
      (declaredScenes ?? []).includes(state?.currentSceneId)
    );
  }
  const contactFlags = {
    npc_luyuan: ["flag_luyuan_met"],
    npc_ash: [
      "flag_ash_talked", "flag_ash_suspicious", "flag_ash_synthetic_known",
      "flag_ash_hostile_pending", "flag_ash_ambush_unlocked", "flag_ash_destroyed",
      "flag_ash_damaged", "flag_ash_hostile", "flag_ash_delayed",
    ],
    npc_ripley: ["flag_ripley_met", "flag_ripley_assisted"],
    npc_parker: ["flag_parker_assisted"],
    npc_lambert: ["flag_lambert_met"],
  }[id] ?? [];
  if (contactFlags.some((flag) => flags.has(flag))) return true;

  // 當前 reference scene 本身就是玩家已經抵達的接觸場景；這只公開該場景的主要人物。
  const sceneId = state?.currentSceneId;
  return (
    (id === "npc_luyuan" && sceneId === "evt_deck_a_recon") ||
    (id === "npc_ash" && ["evt_meet_ash", "evt_ash_ambush"].includes(sceneId)) ||
    (id === "npc_ripley" && sceneId === "evt_meet_ripley") ||
    (id === "npc_lambert" && sceneId === "evt_meet_ripley") ||
    (id === "npc_parker" && ["evt_trigger_overload", "evt_engine_coolant_prep"].includes(sceneId))
  );
}

function publicNpcRole(npc, state) {
  if (npc?.id !== "npc_ash") return npc?.role ?? "副本人物";
  const flags = flagSet(state);
  if (flags.has("flag_ash_synthetic_known")) return "科學官／生化人疑雲已確認";
  return "科學官";
}

function publicNpcRoster(reference, state) {
  const trustMap = state?.npcTrust ?? {};
  const statusMap = state?.npcStatuses ?? {};
  return (reference?.npcs ?? [])
    .filter((npc) => npc?.id && npc?.name && npcHasPublicContact(npc, state))
    .map((npc) => {
      const rawTrust = Object.hasOwn(trustMap, npc.id) ? Number(trustMap[npc.id]) : NaN;
      const status = statusMap[npc.id] ?? npc.initialStatus ?? "unknown";
      const trust = npcTrustView(rawTrust, status);
      return {
        id: npc.id,
        name: npc.name,
        role: publicNpcRole(npc, state),
        status,
        statusLabel: NPC_STATUS_LABELS[status] ?? status,
        trust: trust.value,
        trustLabel: trust.label,
        trustTone: trust.tone,
      };
    });
}

const LOCATION_PURPOSES = Object.freeze({
  loc_cryo: "確認甦醒現場與異形留下的痕跡",
  loc_service_corridor: "尋找安全路線並避開管線威脅",
  loc_deck_a: "整理船況，決定下一個調查方向",
  loc_medbay: "搜查醫療殘骸，取得急救物資與生物線索",
  loc_bridge: "查閱船員記錄與航行資料，與仍在副控室的人接觸",
  loc_science: "查詢生物資料，觀察 Ash 與實驗樣本",
  loc_mother_core: "查明主機指令與 937 的來源",
  loc_cargo: "搜尋工具，確認貨艙內的活動痕跡",
  loc_engine: "處理冷卻系統並決定是否啟動超載",
  loc_lower_deck: "在倒數與威脅下尋找通往接駁艇的路線",
  loc_narcissus_airlock: "準備進入或操作水仙號接駁氣閘",
  loc_narcissus: "完成脫離、處理異形並準備休眠",
});

const SCENE_LABELS = Object.freeze({
  evt_cryo_clearance: "休眠室甦醒與現場排查",
  evt_deck_a_recon: "A 甲板調查與陸遠接觸",
  evt_medbay_ruins: "醫療區殘骸與搜刮",
  evt_cargo_stalk: "中央貨艙的陰影低語",
  evt_cargo_tool_scavenge: "貨艙工具櫃與焊槍爭奪",
  evt_meet_ripley: "橋樓代理指揮官的戒備",
  evt_meet_ash: "第一次與 Ash 接觸",
  evt_mother_chamber_infiltrate: "潛入主機核心房",
  evt_order_937_reveal: "特別指令 937 的揭露",
  evt_ash_ambush: "Ash 的背叛與突襲",
  evt_engine_coolant_prep: "工程區冷卻系統探查",
  evt_trigger_overload: "工程區與自毀倒數",
  evt_vent_ambush_escape: "倒數中的通風管追擊",
  evt_narcissus_shadow_wake: "水仙號內的異形甦醒",
  evt_narcissus_final_purge: "氣閘邊緣的最後處置",
  evt_hypersleep_return: "休眠與主神傳送",
});

function publicLocation(reference, locationId, visited, current, state) {
  const location = (reference?.map ?? []).find((entry) => entry.id === locationId);
  if (!location) return null;
  const isVisited = visited.includes(locationId);
  const packageView = narrativeLocationView(reference, state, locationId, { visited: isVisited });
  return {
    id: location.id,
    name: location.name,
    status: isVisited ? "visited" : location.connections?.includes(current) ? "known" : "unexplored",
    description:
      packageView?.description ??
      (isVisited
        ? location.playerVisible?.firstArrival ?? (location.features ?? []).slice(0, 3).join("、")
        : "尚未親自確認；目前只知道這是副本地圖上的一個區域。"),
    purpose:
      packageView?.purpose ??
      location.playerVisible?.playerPurpose ??
      LOCATION_PURPOSES[location.id] ??
      "調查此區域並確認可用路線",
    ...(packageView?.atmosphere ?? location.playerVisible?.atmosphere
      ? { atmosphere: packageView?.atmosphere ?? location.playerVisible?.atmosphere }
      : {}),
    ...(packageView?.landmarks?.length
      ? { landmarks: packageView.landmarks }
      : location.playerVisible?.knownLandmarks?.length && isVisited
        ? { landmarks: location.playerVisible.knownLandmarks }
        : {}),
    ...(packageView?.hazardHints?.length
      ? { hazardHints: packageView.hazardHints }
      : location.playerVisible?.visibleHazardHints?.length && isVisited
        ? { hazardHints: location.playerVisible.visibleHazardHints }
        : {}),
    ...(packageView?.revisitVariant ? {
      revisitVariant: packageView.revisitVariant,
      revisitVariantLabel: packageView.revisitVariantLabel,
    } : {}),
  };
}

export function buildExplorationView(reference, state) {
  const current = state?.currentLocation ?? findScene(reference, state?.currentSceneId)?.location ?? null;
  const visited = unique([...(state?.visitedLocations ?? []), current]);
  const currentMap = (reference?.map ?? []).find((entry) => entry.id === current);
  const currentScene = findScene(reference, state?.currentSceneId);
  const nearbyIds = unique(currentMap?.connections ?? []);
  const knownIds = unique([...visited, ...nearbyIds]);
  const knownLocations = knownIds.map((id) => publicLocation(reference, id, visited, current, state)).filter(Boolean);
  const nearbyRoutes = nearbyIds.map((id) => {
    const location = publicLocation(reference, id, visited, current, state);
    const travel = resolveTravelAction(reference, state, id);
    return {
      to: id,
      label: location?.name ?? id,
      purpose: location?.purpose ?? "確認這條路線的狀況",
      status: travel.ok ? "available" : "locked",
      actionReady: travel.ok,
      timeCost: travel.ok ? travel.timeCost : null,
      riskLevel: travel.ok ? travel.risk.level : null,
      riskLabel: travel.ok ? travel.risk.labels.join("、") : null,
      lockReason: travel.ok ? null : travel.error,
    };
  });

  return {
    currentLocation: publicLocation(reference, current, visited, current, state),
    currentEvent: currentScene
      ? { id: currentScene.id, label: currentScene.title ?? SCENE_LABELS[currentScene.id] ?? "目前事件" }
      : null,
    objective:
      currentMap?.playerVisible?.playerPurpose ??
      LOCATION_PURPOSES[current] ??
      "確認目前環境並決定下一步",
    visitedLocations: visited,
    knownLocations,
    nearbyRoutes,
    nearbyNpcs: publicNpcRoster(reference, state).filter((npc) => {
      const declared = (reference?.npcs ?? []).find((entry) => entry?.id === npc.id)?.presenceScenes;
      if (Array.isArray(declared)) {
        return declared.includes(state?.currentSceneId) || state?.npcStatuses?.[npc.id] !== "alive";
      }
      const sceneIds = {
        npc_luyuan: ["evt_deck_a_recon", "evt_ash_ambush", "evt_hypersleep_return"],
        npc_ash: ["evt_meet_ash", "evt_ash_ambush"],
        npc_ripley: ["evt_meet_ripley"],
        npc_lambert: ["evt_meet_ripley"],
        npc_parker: ["evt_trigger_overload", "evt_engine_coolant_prep", "evt_vent_ambush_escape"],
      }[npc.id];
      return sceneIds?.includes(state?.currentSceneId) || state?.npcStatuses?.[npc.id] !== "alive";
    }),
    recentDiscoveries: publicExplorationDiscoveries(state),
    unresolvedQuestions: publicUnresolvedQuestions(state),
    environmentState: {
      featureSummary: currentMap?.features?.slice(0, 3) ?? [],
      hazardSummary: visited.includes(current) ? (currentMap?.hazards?.slice(0, 2) ?? []) : [],
      ...(narrativeLocationView(reference, state, current, { visited: true }) ?? {}),
    },
  };
}

const NPC_STATUS_LABELS = Object.freeze({
  alive: "存活",
  met: "已接觸",
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
    dmPrompt: buildDmPrompt(reference, state),
    npcs: publicNpcRoster(reference, state),
    exploration: buildExplorationView(reference, state),
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
  // 副本可以用資料宣告戰鬥勝利後要套用的世界狀態；沒有宣告時沿用 Alien V2 的內建收尾。
  const declared = reference?.finaleVictory ?? null;
  if (declared) {
    const applied = applyBasicEffects(state, declared.effects ?? {});
    const nextScene = findScene(reference, declared.nextSceneId);
    return synchronizeExplorationState(reference, {
      ...applied,
      currentSceneId: nextScene?.id ?? applied.currentSceneId,
      currentLocation: nextScene?.location ?? applied.currentLocation,
      lastApproachId: declared.lastApproachId ?? "combat.finale",
      lastOutcomeTier: declared.lastOutcomeTier ?? "戰鬥勝利",
      completedSceneIds: unique([...applied.completedSceneIds, ...(declared.completedSceneIds ?? [])]),
    });
  }
  const next = applyBasicEffects(state, {
    worldFlagsAdd: ["flag_xenomorph_killed"],
    airlockPhase: "secured",
    shipStatus: state?.shipStatus === "overload_started" ? "overload_started" : state?.shipStatus,
    playerLocation: "loc_narcissus",
  });
  const returnScene = findScene(reference, "evt_hypersleep_return");
  return synchronizeExplorationState(reference, {
    ...next,
    currentSceneId: returnScene?.id ?? next.currentSceneId,
    currentLocation: returnScene?.location ?? next.currentLocation,
    lastApproachId: "combat.n4",
    lastOutcomeTier: "戰鬥勝利",
    completedSceneIds: unique([...next.completedSceneIds, "evt_narcissus_shadow_wake", "evt_narcissus_final_purge"]),
  });
}

export function divergenceTierForReferenceOutcome(outcomeTier) {
  return OUTCOME_TO_DIVERGENCE[outcomeTier] ?? 0;
}

export function referenceAvailable(reference, state) {
  return Boolean(reference && state && findScene(reference, state.currentSceneId));
}
