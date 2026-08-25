import contentPackage from "./examples/alienNostromo_v2_contentPackage.js";

const SUPPORTED_SOURCE_PACK_ID = "scenario.nostromo-01-v2";
const NPC_ID = "npc_luyuan";
const MAX_ACTION_TEXT = 240;
const COOPERATION_STATES = Object.freeze([
  "briefing",
  "provisional",
  "functional",
  "strained",
  "self_preserving",
  "abandoned",
]);

const INITIAL_COOPERATION = Object.freeze({
  state: "briefing",
  trust: 1,
  perceivedThreat: 0,
  utility: 1,
  briefingGiven: false,
  warningsIssued: 0,
  tasksAssigned: 0,
  tasksCompleted: 0,
  helpProvided: 0,
  lastDecision: "give_minimum_survival_briefing",
  currentObjective: "give_minimum_survival_briefing",
  threatCount: 0,
  consecutiveThreats: 0,
  interactionCount: 0,
  lastInteractionType: null,
  lastEntryId: null,
  lastActionText: null,
  lastUpdatedTurn: 0,
});

const THREAT_INTERACTIONS = new Set([
  "attempt_grab_weapon",
  "sudden_rush",
  "physical_push",
  "verbal_intimidation",
]);

const SAFE_ACTION_INTERACTIONS = new Set([
  "survival_question",
  "offer_scout",
  "offer_repair_or_operate",
  "offer_carry_supplies",
  "offer_rear_guard",
  "express_distrust",
  "reject_path",
  "declare_solo",
  "passive_questioning",
  "player_step_back",
  "admit_panic",
  "apologize_and_cooperate",
  "complete_assigned_task",
]);

const DEESCALATION_INTERACTIONS = new Set([
  "player_step_back",
  "admit_panic",
  "apologize_and_cooperate",
  "complete_assigned_task",
]);

function textOf(value) {
  return String(value ?? "").trim().slice(0, MAX_ACTION_TEXT);
}

function containsAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function currentPack(reference) {
  if (reference?.sourcePackId !== SUPPORTED_SOURCE_PACK_ID) return null;
  return contentPackage.approvedNpcCooperation?.[NPC_ID] ?? null;
}

function currentState(state) {
  const raw = state?.npcCooperation?.[NPC_ID];
  if (!raw || typeof raw !== "object") return { ...INITIAL_COOPERATION };
  const normalized = {
    ...INITIAL_COOPERATION,
    ...raw,
  };
  if (!COOPERATION_STATES.includes(normalized.state)) normalized.state = "briefing";
  if (!Number.isFinite(Number(normalized.trust))) normalized.trust = INITIAL_COOPERATION.trust;
  else normalized.trust = Math.max(-9, Math.min(9, Math.trunc(Number(normalized.trust))));
  for (const key of ["perceivedThreat", "utility", "warningsIssued", "tasksAssigned", "tasksCompleted", "helpProvided", "threatCount", "consecutiveThreats", "interactionCount", "lastUpdatedTurn"]) {
    if (!Number.isFinite(Number(normalized[key]))) normalized[key] = INITIAL_COOPERATION[key];
    else normalized[key] = Math.max(0, Math.trunc(Number(normalized[key])));
  }
  return normalized;
}

export function createNpcCooperationState() {
  return { [NPC_ID]: { ...INITIAL_COOPERATION } };
}

export function normalizeNpcCooperationState(raw) {
  const entry = raw?.[NPC_ID];
  if (!entry || typeof entry !== "object") return createNpcCooperationState();
  const normalized = currentState({ npcCooperation: { [NPC_ID]: entry } });
  return { [NPC_ID]: normalized };
}

function targetIsLuyuan({ actionText, targetNpcId = null, sceneId }) {
  if (targetNpcId && targetNpcId !== NPC_ID) return false;
  if (targetNpcId === NPC_ID) return true;
  const text = textOf(actionText);
  const explicitlyLuyuan = /陸遠|老手|持槍男人|那個男人|男人的(?:手槍|武器)/.test(text);
  const explicitlyOtherNpcTarget = /(?:問|詢問|向|對|跟|告訴|要求|攻擊|指向|靠近|撲向|聯絡|找|安撫|幫助|威脅|大吼)\s*(?:Ripley|雷普利|Parker|帕克|Lambert|蘭伯特|Ash|艾許)/.test(text);
  if (explicitlyOtherNpcTarget && !explicitlyLuyuan) return false;
  if (explicitlyLuyuan) return true;
  if (sceneId !== "evt_deck_a_recon") return false;
  return /你是誰|為什麼|怎麼回事|發生什麼|哪裡|如何|去哪|往哪|逃生|跟上|探路|殿後|我來|我可以|我們走|一起|搶|奪|撲|推|抓|壓制|威脅|恐嚇|後退|退後|退開|放下手|停手|停止攻擊|道歉|害怕|失控/.test(text);
}

function topicForQuestion(text) {
  if (/你是誰|叫什麼|身分|名字/.test(text)) return "identity";
  if (/為什麼在這裡|怎麼來|怎麼會在|被誰送|出現在這裡|來到這裡/.test(text)) return "displacement_reason";
  if (/發生什麼|怎麼回事|船上|原船員|船員|到底出了什麼事/.test(text)) return "ship_status";
  if (/怪物|異形|生物|那東西|威脅|通風管/.test(text)) return "threat_nature";
  if (/去哪|往哪|出口|逃生|水仙|接駁|離開/.test(text)) return "evacuation_route";
  return "survival_general";
}

/**
 * Deterministic classification only. It never decides damage, combat, location or result.
 * Threat patterns are intentionally specific so observation/questions are not treated as attacks.
 */
export function classifyNpcInteraction({ actionText = "", targetNpcId = null, sceneId = null } = {}) {
  const text = textOf(actionText);
  if (!text || !targetIsLuyuan({ actionText: text, targetNpcId, sceneId })) {
    return { interactionType: "other", topic: null, targetNpcId: null, isThreat: false };
  }

  if (containsAny(text, [
    /搶(?:走)?(?:他的)?槍/,
    /奪(?:取|走)?(?:他的)?槍/,
    /伸手.{0,8}槍/,
    /拿走.{0,8}槍/,
    /搶武器/,
    /搶.{0,10}槍/,
    /奪.{0,10}槍/,
  ])) {
    return { interactionType: "attempt_grab_weapon", topic: "weapon_snatch", targetNpcId: NPC_ID, isThreat: true };
  }
  if (containsAny(text, [/撲向?(?:陸遠|他|男人)/, /朝(?:陸遠|他|男人)撲/, /衝向(?:陸遠|他|男人)/, /撲上去/, /撲去/])) {
    return { interactionType: "sudden_rush", topic: "physical_rush", targetNpcId: NPC_ID, isThreat: true };
  }
  if (containsAny(text, [/推(?:倒|他|向)/, /抓住(?:陸遠|他)/, /扭住/, /壓制/, /動手(?:打|攻擊)?/, /攻擊(?:陸遠|他)/])) {
    return { interactionType: "physical_push", topic: "push_or_grapple", targetNpcId: NPC_ID, isThreat: true };
  }
  if (containsAny(text, [/威脅(?:陸遠|他)/, /恐嚇(?:陸遠|他)/, /殺了你/, /要你死/, /對他開槍/, /拿槍指著(?:陸遠|他)/])) {
    return { interactionType: "verbal_intimidation", topic: "threaten_violence", targetNpcId: NPC_ID, isThreat: true };
  }

  if (containsAny(text, [/後退/, /退後/, /退開/, /收手/, /放下手/, /我停手/, /停止攻擊/])) {
    return { interactionType: "player_step_back", topic: "stand_down", targetNpcId: NPC_ID, isThreat: false };
  }
  if (containsAny(text, [/我只是害怕/, /我太慌/, /我失控了/, /因為害怕/, /不是故意/])) {
    return { interactionType: "admit_panic", topic: "panic_explanation", targetNpcId: NPC_ID, isThreat: false };
  }
  if (containsAny(text, [/道歉/, /對不起/, /抱歉/])) {
    return { interactionType: "apologize_and_cooperate", topic: "apology", targetNpcId: NPC_ID, isThreat: false };
  }
  if (containsAny(text, [/完成(?:你|陸遠)?(?:交代|指示)/, /照做了/, /我做完了/, /任務完成/, /我處理好了/])) {
    return { interactionType: "complete_assigned_task", topic: "task_compliance", targetNpcId: NPC_ID, isThreat: false };
  }

  if (containsAny(text, [/我先探路/, /我去探路/, /我來偵察/, /讓我看看前面/, /我可以探路/, /我先看路/])) {
    return { interactionType: "offer_scout", topic: "reconnaissance", targetNpcId: NPC_ID, isThreat: false };
  }
  if (containsAny(text, [/我來修/, /我可以修/, /我操作/, /我來操作/, /我看看控制台/, /我來開門/, /我處理終端/])) {
    return { interactionType: "offer_repair_or_operate", topic: "technical_operation", targetNpcId: NPC_ID, isThreat: false };
  }
  if (containsAny(text, [/我來搬/, /我可以搬/, /我拿物資/, /我拿箱子/, /我負責搬/])) {
    return { interactionType: "offer_carry_supplies", topic: "logistics", targetNpcId: NPC_ID, isThreat: false };
  }
  if (containsAny(text, [/我殿後/, /我守後面/, /我看後方/, /我掩護/, /我負責後方/])) {
    return { interactionType: "offer_rear_guard", topic: "formation_support", targetNpcId: NPC_ID, isThreat: false };
  }

  if (containsAny(text, [/不信你/, /不相信你/, /我不信任/, /你在騙/, /你憑什麼/])) {
    return { interactionType: "express_distrust", topic: "distrust", targetNpcId: NPC_ID, isThreat: false };
  }
  if (containsAny(text, [/不走這條/, /我不去/, /改道/, /走另一條/, /拒絕前進/, /不跟你走/])) {
    return { interactionType: "reject_path", topic: "path_disagreement", targetNpcId: NPC_ID, isThreat: false };
  }
  if (containsAny(text, [/我自己走/, /我單獨/, /我一個人/, /我們分開/, /我要離隊/, /不跟隊/])) {
    return { interactionType: "declare_solo", topic: "solo_exploration", targetNpcId: NPC_ID, isThreat: false };
  }
  if (containsAny(text, [/一直問/, /先回答我/, /我還要問/, /繼續追問/, /我不動/, /站在原地/])) {
    return { interactionType: "passive_questioning", topic: "endless_questions", targetNpcId: NPC_ID, isThreat: false };
  }

  if (/[?？]|你是誰|為什麼|怎麼回事|發生什麼|哪裡|如何|什麼/.test(text)) {
    return { interactionType: "survival_question", topic: topicForQuestion(text), targetNpcId: NPC_ID, isThreat: false };
  }

  return { interactionType: "other", topic: null, targetNpcId: NPC_ID, isThreat: false };
}

function categoryFor(classification, nextThreatCount) {
  if (DEESCALATION_INTERACTIONS.has(classification.interactionType)) return "deescalation";
  if (THREAT_INTERACTIONS.has(classification.interactionType)) {
    if (nextThreatCount >= 3) return "selfPreserving";
    if (nextThreatCount === 2) return "secondThreat";
    return "firstThreat";
  }
  if (classification.interactionType === "survival_question") return "briefing";
  if (classification.interactionType.startsWith("offer_")) return "cooperation";
  if (["express_distrust", "reject_path", "declare_solo", "passive_questioning"].includes(classification.interactionType)) return "refusal";
  return null;
}

function rangeIncludes(range, value) {
  if (!Array.isArray(range) || range.length !== 2) return true;
  return value >= Number(range[0]) && value <= Number(range[1]);
}

function stateAllowed(entry, state) {
  const allowed = entry?.trigger?.cooperationStates;
  return !Array.isArray(allowed) || allowed.includes(state.state);
}

function findEntry(pack, classification, state) {
  if (!pack) return null;
  const nextThreatCount = state.threatCount + (classification.isThreat ? 1 : 0);
  const category = categoryFor(classification, nextThreatCount);
  if (!category) return null;
  const candidates = pack.entries.filter((entry) => {
    if (entry?.category !== category) return false;
    if (entry?.trigger?.interactionType !== classification.interactionType) return false;
    if (!stateAllowed(entry, state)) return false;
    if (!rangeIncludes(entry?.trigger?.threatCountRange, nextThreatCount)) return false;
    if (category === "briefing" && Array.isArray(entry.trigger.topics) && !entry.trigger.topics.includes(classification.topic)) return false;
    return true;
  });
  return candidates[0] ?? null;
}

function fallbackQuestionDirective(state, classification) {
  if (classification.interactionType !== "survival_question") return null;
  return {
    entryId: null,
    category: "briefing",
    decision: {
      objective: "answer_necessary_survival_question_without_revealing_secrets",
      allowedNpcActions: ["answer_part_of_the_question", "identify_immediate_danger", "give_one_actionable_next_step"],
      forbiddenNpcActions: ["invent_engine_effect", "reveal_unconfirmed_secret", "force_player_choice", "direct_player_kill"],
    },
    npcAction: {
      actionClass: "brief_and_redirect",
      publicDescription: "陸遠仍須回答與當前生存直接相關的必要部分，並把玩家導向下一個可執行行動。",
    },
    narration: null,
    continuationPrompt: "玩家可以跟上、繼續追問或採取其他合理行動。",
  };
}

function patchState(state, classification, entry, turnNumber) {
  const next = { ...state, interactionCount: state.interactionCount + 1 };
  const isThreat = classification.isThreat;
  if (isThreat) {
    next.threatCount = Math.min(9, state.threatCount + 1);
    next.consecutiveThreats = Math.min(9, state.consecutiveThreats + 1);
    next.perceivedThreat = Math.min(9, state.perceivedThreat + 2);
    next.trust = Math.max(-9, state.trust - 1);
  } else if (DEESCALATION_INTERACTIONS.has(classification.interactionType)) {
    next.consecutiveThreats = 0;
    next.perceivedThreat = Math.max(0, state.perceivedThreat - 1);
  } else if (SAFE_ACTION_INTERACTIONS.has(classification.interactionType)) {
    next.consecutiveThreats = 0;
  }

  if (entry?.category === "briefing") next.briefingGiven = true;
  if (entry?.category === "firstThreat") next.warningsIssued = Math.min(9, state.warningsIssued + 1);
  if (entry?.category === "cooperation") next.tasksAssigned = Math.min(9, state.tasksAssigned + 1);
  if (classification.interactionType === "complete_assigned_task") next.tasksCompleted = Math.min(9, state.tasksCompleted + 1);
  if (entry?.category === "deescalation") next.helpProvided = Math.min(9, state.helpProvided + 1);

  if (entry?.decision?.cooperationStateAfter && COOPERATION_STATES.includes(entry.decision.cooperationStateAfter)) {
    next.state = entry.decision.cooperationStateAfter;
  } else if (isThreat && next.threatCount >= 3) {
    next.state = "abandoned";
  }
  next.lastInteractionType = classification.interactionType;
  next.lastEntryId = entry?.entryId ?? null;
  next.lastDecision = entry?.decision?.objective ?? "maintain_current_cooperation_boundary";
  next.currentObjective = entry?.decision?.objective ?? next.currentObjective;
  next.lastActionText = classification.actionText ?? null;
  next.lastUpdatedTurn = Number.isInteger(turnNumber) ? turnNumber : 0;
  return next;
}

export function applyNpcCooperationForAction({
  reference,
  state,
  actionText = "",
  sceneId = null,
  turnNumber = 0,
  targetNpcId = null,
} = {}) {
  const pack = currentPack(reference);
  const existing = currentState(state);
  const classification = classifyNpcInteraction({ actionText, targetNpcId, sceneId });
  classification.actionText = textOf(actionText);
  if (!pack || !classification.targetNpcId) {
    return { state, classification, entry: null, directive: null, changed: false };
  }
  const entry = findEntry(pack, classification, existing) ?? fallbackQuestionDirective(existing, classification);
  if (!entry) return { state, classification, entry: null, directive: null, changed: false };
  const nextNpcState = patchState(existing, classification, entry, turnNumber);
  const nextState = {
    ...state,
    npcCooperation: {
      ...(state?.npcCooperation ?? {}),
      [NPC_ID]: nextNpcState,
    },
  };
  return {
    state: nextState,
    classification,
    entry,
    directive: entry,
    changed: true,
  };
}

function publicAllowedActions(entry) {
  return (entry?.decision?.allowedNpcActions ?? []).slice(0, 8);
}

// Gemini 原文保留在資料模組中作為 source material；runtime 只使用這個最小 review layer。
// 這不是改寫 canonical truth，而是阻止「敘事已發生」語句越過 engine 邊界。
function reviewedRuntimeText(value) {
  return String(value ?? "")
    // 這些替換只作用於送進敘事模型的 runtime 素材；資料模組內的 Gemini 原文不被覆蓋。
    .replace(/極速後撤穿過自動氣閘門/g, "迅速後撤並保持通道隔離意圖")
    .replace(/已穿過分區氣閘並解除一切引導責任/g, "已宣布解除一切引導責任")
    .replace(/穿過(?:了)?(?:分區)?氣閘(?:門)?/g, "朝既定撤離方向準備前進")
    .replace(/跨步退到氣閘門框後方/g, "迅速拉開距離並保持戒備")
    .replace(/跨過氣閘門檻/g, "保持在目前通道邊界")
    .replace(/站在通道另一端/g, "維持在通道一側")
    .replace(/撤出通道中軸線/g, "避免靠近")
    .replace(/退入走廊轉角的防護門後/g, "朝轉角方向保持可觀察的戒備姿態")
    .replace(/退入轉角掩體/g, "朝轉角方向拉開距離意圖")
    .replace(/退到門口警戒/g, "轉而保持入口方向的警戒意圖")
    .replace(/退到數米外|數米之外/g, "明確拉開安全距離")
    .replace(/氣閘門框後方|門框後方/g, "通道一側")
    .replace(/退到隊伍最後面去|退至隊伍後方|退到後方|退回隊伍位置/g, "與隊伍保持後方間隔")
    .replace(/站在能最快關閉通路的控制台旁/g, "在控制區附近保持戒備姿態")
    .replace(/站在能最快要求暫不觸碰通路控制的控制區附近/g, "在控制區附近保持戒備姿態")
    .replace(/控制台旁/g, "控制區附近")
    .replace(/最快關閉通路的控制台旁/g, "可能影響通路的控制區附近")
    .replace(/關閉(?:了)?(?:通路|氣閘門)/g, "要求暫不觸碰通路控制")
    .replace(/唯一的?(?:活路|生路)/g, "目前優先撤離方向")
    .replace(/不會再分享任何物資與情報/g, "不再主動提供物資或情報支援")
    .replace(/不會給(?:你)?任何物資/g, "不再主動提供物資支援")
    .replace(/物資與情報支援/g, "物資或情報支援")
    .replace(/彈藥帶與物資包重新扣緊，徹底隔絕了你接觸任何工具的可能/g, "確認自身裝備，停止主動提供工具支援")
    .replace(/直接向著撤離點前進/g, "明確表示接下來優先考慮撤離")
    .replace(/步伐沉穩地向前推進/g, "維持準備前進的姿態")
    .replace(/獨自推進/g, "不再主動等候")
    .replace(/站在能最快關閉通路的控制台旁/g, "在可能影響通路的控制區附近保持戒備")
    .replace(/站位始終處於你能觸及的範圍之外/g, "不讓你輕易接近")
    .replace(/退入掩體並放棄對你的救援責任/g, "宣布停止主動救援並維持戒備間隔")
    .replace(/已穿過分區氣閘並解除一切引導責任/g, "已宣布解除一切引導責任")
    .replace(/已退入轉角掩體並放棄對你的救援責任/g, "已宣布放棄對你的救援責任")
    .replace(/已退入掩體並宣告解除保護/g, "已宣告解除保護並要求保持距離")
    .replace(/跟隨其後方遠處/g, "保持遠距離觀察")
    .replace(/準備進入氣閘/g, "準備依 canonical 路線行動")
    .replace(/邁步踏上金屬格柵/g, "指向既定前進標記")
    .replace(/跨步移到了通道的側前方/g, "示意採取側前方的隊形意圖")
    .replace(/他會在後方架槍替你掩護/g, "他表示會從原地提供有限掩護意圖")
    .replace(/替你掩護/g, "表示會提供有限掩護意圖")
    .trim();
}

/**
 * Server-only prompt block. It intentionally omits privateAssessment, withheldFacts and raw state internals.
 * The original compact/full narration is retained; the model may adapt the join but not invent effects.
 */
export function buildNpcCooperationPromptBlock(reference, state, {
  actionText = "",
  sceneId = null,
  turnNumber = 0,
} = {}) {
  const pack = currentPack(reference);
  if (!pack) return "";
  const coop = currentState(state);
  const classification = classifyNpcInteraction({ actionText, sceneId });
  const currentAction = textOf(actionText);
  const hasCurrentDecision = Boolean(
    currentAction &&
    coop.lastActionText &&
    coop.lastActionText === currentAction &&
    Number.isInteger(turnNumber) &&
    coop.lastUpdatedTurn === turnNumber
  );
  const entry = hasCurrentDecision && coop.lastEntryId
    ? pack.entries.find((candidate) => candidate.entryId === coop.lastEntryId) ?? null
    : null;
  const fallback = hasCurrentDecision && classification.interactionType === "survival_question"
    ? fallbackQuestionDirective(coop, classification)
    : null;
  const selected = entry ?? fallback;

  const lines = [
    "<NPC_Cooperation_Contract>",
    "【陸遠的 server-authoritative 協作狀態（只供本回合敘事）】",
    "陸遠是有獨立目標與風險判斷的資深同行者；他不是等待玩家提問才反應的背景角色。",
    `目前合作狀態：${coop.state}`,
    `目前任務方向：${coop.currentObjective}`,
    `已發生的威脅次數：${coop.threatCount}`,
    `本回合玩家互動類型：${classification.interactionType}`,
    "可把 NPC 的自主性表現在回答必要問題、主動指出下一步、分派工作、調整隊形、限制情報或選擇自保；不能因這段資料自行新增任何 engine effect。",
  ];

  if (selected) {
    lines.push(
      "",
      "【本回合已由 server 選定的陸遠外在反應】",
      `反應目的：${selected.decision?.objective ?? "維持目前合作邊界"}`,
      `允許的外在反應：${publicAllowedActions(selected).join("、") || "維持已知姿態並回答必要部分"}`,
      `可見行動方向：${reviewedRuntimeText(selected.npcAction?.publicDescription ?? "依目前合作狀態採取合理可觀察反應")}`,
      ...(selected.narration?.full ? [
        "經安全審查的原始演出素材（保留語氣與事件意義，但不得當作新增 engine truth）：",
        reviewedRuntimeText(selected.narration.full),
      ] : []),
      ...(selected.continuationPrompt ? [`玩家選擇仍然保留：${reviewedRuntimeText(selected.continuationPrompt)}`] : []),
      ...(selected.category === "briefing" ? [
        "這是生存提問：敘事至少要說出一項與當前處境相關的必要事實，並給出一個可執行的下一步；陸遠可以冷淡或保留秘密，但不能只喝斥後停在原地。",
      ] : []),
    );
  } else if (classification.interactionType === "survival_question") {
    lines.push(
      "",
      "【必要問題回答規則】",
      "這是與當前生存直接相關的問題。陸遠可以省略秘密，但必須回答至少一項必要事實，並給出一個可執行的下一步；不可只用空泛喝斥結束互動。",
    );
  }

  lines.push(
    "只能把上述已選定反應寫成自然敘事；不得把 cooperation state、威脅次數、objective、policy 或 server 說出口。",
    "不得自行創造：玩家或 NPC 的傷勢、死亡、位置改變、物品取得／遺失、威脅值、旗標、戰鬥結果、主神獎勵、未授權秘密或新的 canonical event。",
    "玩家仍可拒絕、改道、繼續提問或採取任何合理自由行動；NPC 的自主性只改變其已授權的合作方式與可觀察反應。",
    "若本回合沒有已選定固定演出，不要假裝 NPC 已完成未授權的重大行動；只寫必要回答、姿態與一個合理的下一步。",
    "</NPC_Cooperation_Contract>",
  );
  return lines.join("\n");
}

export { COOPERATION_STATES, NPC_ID };
