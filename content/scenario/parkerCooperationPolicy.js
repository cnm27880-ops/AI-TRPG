const SOURCE_PACK_ID = "scenario.nostromo-01-v2";
export const PARKER_ID = "npc_parker";
const ENGINE_SCENE_IDS = new Set(["evt_engine_coolant_prep", "evt_trigger_overload"]);
const MAX_ACTION_TEXT = 240;
const STATE_IDS = Object.freeze([
  "unmet",
  "busy",
  "functional",
  "team_accepted",
  "resource_guarded",
  "overload_commitment",
  "angry",
  "withdrawn",
]);

const INITIAL_STATE = Object.freeze({
  state: "unmet",
  trust: 0,
  mechanicalNeed: 0,
  taskReliability: 0,
  resourceBurden: 0,
  crewSafetyRisk: 0,
  protocolAlignment: 0,
  patience: 6,
  boundaryIncidents: 0,
  contactEstablished: false,
  tasksAccepted: 0,
  tasksCompleted: 0,
  lastDecision: "assess_survivor_usefulness",
  currentObjective: "assess_survivor_usefulness",
  lastInteractionType: null,
  lastEntryId: null,
  lastActionText: null,
  lastUpdatedTurn: 0,
});

const PROFILE = {
  npcId: PARKER_ID,
  sourcePackId: SOURCE_PACK_ID,
  role: "工程師／自毀程序協助者",
  objectives: [
    "keep_engineering_system_from_killing_survivors",
    "convert_survivor_effort_into_reliable_work",
    "prevent_uncontrolled_equipment_use",
    "avoid_leaving_dangerous_systems_to_company_control",
  ],
  knowledgePolicy: {
    publicFacts: [
      "Parker 熟悉機艙、冷卻閥、蒸氣管與手動超載程序",
      "工程區的操作需要逐步確認，不是只靠一句口頭保證",
      "可靠的分工比空泛命令更能換來他的協助",
    ],
    withheldFacts: [
      "Parker 對公司與個人報酬的完整怨恨",
      "Parker 的私下放棄／破壞判斷",
      "未由 canonical event 確認的設備故障與倒數狀態",
    ],
  },
  hardBoundaries: [
    "不得在不說明的情況下亂動高壓閥與反應爐設備",
    "不得把工具支援當成無限資源索取",
    "不得以威脅取代工作分工與可回報結果",
  ],
};

const ENTRIES = [
  {
    entryId: "parker_briefing_engineer_01",
    category: "briefing",
    trigger: { interactionType: "survival_question", topics: ["identity", "engineering_status"], states: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment"] },
    decision: {
      objective: "explain_engine_role_and_require_task_specificity",
      stateAfter: "busy",
      allowedNpcActions: ["identify_engineer_role", "describe_observed_engineering_problem", "ask_for_specific_task_context"],
      forbiddenNpcActions: ["reveal_private_goal", "claim_repair_completed", "invent_equipment_state", "force_player_choice"],
    },
    facts: { allowedFacts: ["Parker 是工程師", "冷卻閥、蒸氣管與超載程序需要工程處理"], withheldFacts: ["未由 canonical event 確認的設備狀態"], newFactsCreated: [] },
    npcAction: { actionClass: "brief_and_demand_specifics", publicDescription: "Parker 用直率口吻說明工程問題，要求玩家把想做的工作說清楚。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Parker 用沾滿黑油的手背擦過扳手，沒有耐心講空話。他直接說明自己負責工程區，接著要求你講清楚是要檢查閥門、確認蒸氣，還是回報一項可以實際完成的工作。",
    continuationPrompt: "你可以詢問工程區狀況、說明自己的技能、提出具體維修分工，或採取其他合理行動。",
  },
  {
    entryId: "parker_briefing_overload_02",
    category: "briefing",
    trigger: { interactionType: "survival_question", topics: ["overload"], states: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment"] },
    decision: {
      objective: "describe_overload_risk_without_claiming_activation",
      stateAfter: "busy",
      allowedNpcActions: ["describe_four_valve_procedure", "warn_against_unplanned_operation", "give_one_actionable_preparation_step"],
      forbiddenNpcActions: ["claim_overload_started", "invent_countdown", "invent_valve_state", "create_damage"],
    },
    facts: { allowedFacts: ["四根閥門與工程準備是不同步驟", "工程準備完成不代表自毀已啟動"], withheldFacts: ["尚未由 canonical result 套用的過載結果"], newFactsCreated: [] },
    npcAction: { actionClass: "warn_and_sequence_work", publicDescription: "Parker 把超載程序拆成可確認的工程步驟，拒絕把準備工作說成已完成。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "一提到超載，Parker 的語氣變得更硬。他把閥門、工具與最後的啟動步驟分開講，明確提醒你：先確認準備，別把還沒做的事情當成已經發生。",
    continuationPrompt: "你可以詢問閥門準備、提出協助方式、回報已觀察到的故障，或暫時做其他低風險工作。",
  },
  {
    entryId: "parker_briefing_resource_03",
    category: "briefing",
    trigger: { interactionType: "survival_question", topics: ["resource_and_tools"], states: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment"] },
    decision: {
      objective: "set_tool_and_resource_expectations",
      stateAfter: "busy",
      allowedNpcActions: ["identify_tool_constraint", "ask_player_to_report_available_tools", "give_one_actionable_next_step"],
      forbiddenNpcActions: ["claim_item_transfer", "invent_inventory", "reveal_private_assessment", "force_player_choice"],
    },
    facts: { allowedFacts: ["工具與資源有限", "使用工具前要說明用途與風險"], withheldFacts: ["未由 engine 確認的玩家或 NPC inventory"], newFactsCreated: [] },
    npcAction: { actionClass: "set_resource_boundary", publicDescription: "Parker 說明工具限制，要求玩家先報告用途與可回報結果。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Parker 聽見你問工具，立刻把扳手往自己身側收了收，但沒有只丟下一句拒絕。他要求你先說明要處理哪個部位、可能造成什麼風險，以及完成後能回報什麼。",
    continuationPrompt: "你可以說明工具用途、提出不需額外物資的替代方案、接受一項工作，或採取其他合理行動。",
  },
  {
    entryId: "parker_cooperate_repair_01",
    category: "cooperation",
    trigger: { interactionType: "offer_repair", topics: ["repair", "valves", "cooling"], states: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment"] },
    decision: {
      objective: "turn_player_repair_offer_into_reportable_task",
      stateAfter: "functional",
      allowedNpcActions: ["assign_repair_observation", "explain_sequence", "request_status_update"],
      forbiddenNpcActions: ["claim_repair_result", "invent_tool_transfer", "invent_valve_state", "force_player_choice"],
    },
    facts: { allowedFacts: ["閥門與冷卻是可分工的工程方向", "每一步都要回報觀察"], withheldFacts: ["未由 canonical adapter 套用的 repair effect"], newFactsCreated: [] },
    npcAction: { actionClass: "assign_repair_task", publicDescription: "Parker 接受具體維修提議，將工作拆成可回報的檢查步驟。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Parker 先問你看見了哪一段管線與閥門，確認不是只想亂轉幾個把手。判斷出你的提議有用後，他用短句分派一項可回報的檢查，並提醒你不要跳過壓力與退路確認。",
    continuationPrompt: "你可以描述檢查步驟、回報新的機械觀察、詢問風險，或改做其他合理分工。",
  },
  {
    entryId: "parker_cooperate_overload_02",
    category: "cooperation",
    trigger: { interactionType: "offer_overload_help", topics: ["overload", "valves"], states: ["functional", "team_accepted", "resource_guarded", "overload_commitment"] },
    decision: {
      objective: "coordinate_overload_work_without_claiming_activation",
      stateAfter: "overload_commitment",
      allowedNpcActions: ["coordinate_valve_roles", "state_sequence_constraint", "request_clear_signal"],
      forbiddenNpcActions: ["claim_overload_started", "invent_countdown", "apply_time_cost", "force_player_choice"],
    },
    facts: { allowedFacts: ["Parker 可以討論閥門分工", "啟動與準備仍是不同 canonical 步驟"], withheldFacts: ["尚未由 engine 套用的超載結果"], newFactsCreated: [] },
    npcAction: { actionClass: "coordinate_engine_work", publicDescription: "Parker 願意協調超載分工，但要求清楚的順序與回報，不把協調當成已啟動。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你提出同步處理閥門後，Parker 先確認每個人負責的部位與回報方式。他願意把你算進工程分工，但反覆強調：目前只是協調與準備，真正的啟動仍要由正式程序確認。",
    continuationPrompt: "你可以確認分工、回報自己的準備、詢問下一個安全檢查，或選擇其他合理行動。",
  },
  {
    entryId: "parker_cooperate_task_03",
    category: "cooperation",
    trigger: { interactionType: "offer_task", topics: ["repair", "engineering_task"], states: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment"] },
    decision: {
      objective: "assign_useful_engineering_work",
      stateAfter: "team_accepted",
      allowedNpcActions: ["assign_low_risk_engineering_task", "identify_observable_success_condition", "request_status_update"],
      forbiddenNpcActions: ["claim_task_completed", "invent_repair_effect", "invent_item", "force_player_choice"],
    },
    facts: { allowedFacts: ["通訊、冷卻與閥門檢查可作為分工方向", "工作結果要靠實際回報確認"], withheldFacts: ["未經 canonical result 確認的設備效果"], newFactsCreated: [] },
    npcAction: { actionClass: "assign_and_measure_task", publicDescription: "Parker 依玩家提出的能力分派一項可觀察、可回報的工程工作。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Parker 沒有把你的自告奮勇誇成救命英雄，只是快速分派一項能看出成果的工程工作。他說得很直白：做完告訴他看見什麼，別只喊『好了』。",
    continuationPrompt: "你可以接受工作並描述步驟、回報結果、詢問風險，或採取其他合理行動。",
  },
  {
    entryId: "parker_cooperate_report_04",
    category: "cooperation",
    trigger: { interactionType: "report_task", topics: ["task_report"], states: ["functional", "team_accepted", "resource_guarded", "overload_commitment"] },
    decision: {
      objective: "reward_reliable_reporting_with_more_operational_context",
      stateAfter: "team_accepted",
      allowedNpcActions: ["acknowledge_report", "ask_follow_up_observation", "offer_next_low_risk_task"],
      forbiddenNpcActions: ["verify_unseen_result", "claim_canonical_repair", "grant_item", "force_player_choice"],
    },
    facts: { allowedFacts: ["清楚回報能提高工程合作效率", "Parker 仍會要求可觀察細節"], withheldFacts: ["未由 canonical result 驗證的任務結果"], newFactsCreated: [] },
    npcAction: { actionClass: "acknowledge_reliable_report", publicDescription: "Parker 根據具體回報提高對玩家的工作信任，並提出下一項可確認工作。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你把實際看見的狀況說完後，Parker 沒有敷衍地揮手。他追問一個細節，確認你的回報不是猜的，接著才把下一項工作方向說給你聽。",
    continuationPrompt: "你可以補充觀察、接受下一項工作、指出風險，或採取其他合理行動。",
  },
  {
    entryId: "parker_boundary_resource_01",
    category: "boundary",
    trigger: { interactionType: "resource_pressure", topics: ["resource_and_tools"], states: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment"], riskRange: [0, 1] },
    decision: {
      objective: "protect_limited_tools_from_unaccountable_use",
      stateAfter: "resource_guarded",
      allowedNpcActions: ["refuse_unexplained_resource_request", "ask_for_task_specific_reason", "offer_non_item_alternative"],
      forbiddenNpcActions: ["invent_item_loss", "claim_item_transfer", "damage_player", "force_player_choice"],
    },
    facts: { allowedFacts: ["工具支援需要用途與回報", "無法說明用途會降低 Parker 的合作意願"], withheldFacts: ["雙方未由 engine 確認的 inventory"], newFactsCreated: [] },
    npcAction: { actionClass: "guard_resources_directly", publicDescription: "Parker 直白拒絕無理由的工具要求，改問玩家能否提出具體工程用途。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Parker 的眉頭立刻皺起來，回答沒有任何客套：想用工具可以，先說要處理什麼。他不把爭執誇大成搶奪，只把支援條件說清楚，並要求你提出不消耗工具的替代辦法。",
    continuationPrompt: "你可以說明具體用途、提出替代方案、先完成一項工作，或採取其他合理行動。",
  },
  {
    entryId: "parker_boundary_coercion_02",
    category: "boundary",
    trigger: { interactionType: "coercive_pressure", topics: ["threat_or_sabotage"], states: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment", "angry"], riskRange: [0, 1] },
    decision: {
      objective: "stop_threats_from_replacing_engineering_procedure",
      stateAfter: "angry",
      allowedNpcActions: ["issue_blunt_boundary", "refuse_coercive_instruction", "request_distance_from_equipment", "preserve_limited_work_channel"],
      forbiddenNpcActions: ["invent_injury", "invent_equipment_damage", "resolve_combat", "direct_player_kill"],
    },
    facts: { allowedFacts: ["威脅會破壞工程程序與協作", "Parker 會優先防止未說明的設備操作"], withheldFacts: ["未由 canonical result 確認的設備後果"], newFactsCreated: [] },
    npcAction: { actionClass: "bluntly_reject_coercion", publicDescription: "Parker 以直率口吻拒絕被威脅指揮，要求玩家離開設備操作範圍並改用分工。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Parker 直接把扳手橫在自己身前，聲音壓過機械噪音：別拿威脅當操作手冊。他要求你先停下逼迫，說明想做的事；在此之前，他不會替你背未確認的工程風險。",
    continuationPrompt: "你可以停止施壓、說明具體工作、退開設備區，或採取其他不破壞工程程序的行動。",
  },
  {
    entryId: "parker_boundary_repeat_03",
    category: "boundary",
    trigger: { interactionType: "coercive_pressure", topics: ["threat_or_sabotage"], states: ["angry", "withdrawn"], riskRange: [1, 9] },
    decision: {
      objective: "withdraw_direct_support_after_repeated_coercion",
      stateAfter: "withdrawn",
      allowedNpcActions: ["end_argument", "stop_sharing_process_details", "prioritize_engine_safety", "leave_player_to_independent_choice"],
      forbiddenNpcActions: ["invent_player_injury", "claim_equipment_destroyed", "invent_route_change", "direct_player_kill"],
    },
    facts: { allowedFacts: ["反覆威脅會讓 Parker 停止直接支援", "玩家仍可自行採取合理行動"], withheldFacts: ["Parker 的未公開長期判斷"], newFactsCreated: [] },
    npcAction: { actionClass: "withdraw_engineering_support", publicDescription: "Parker 停止替玩家解釋工程步驟，保留自己的安全判斷，不替玩家做出世界裁定。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你再次用威脅逼迫 Parker 時，他不再浪費聲音和你爭。他只說明自己會先顧好工程程序，停止提供額外操作細節；下一步仍由你自己決定，但別期待他替你承擔後果。",
    continuationPrompt: "你可以停止施壓並重新提出工作方案、觀察工程區，或採取其他合理自由行動。",
  },
  {
    entryId: "parker_boundary_sabotage_04",
    category: "boundary",
    trigger: { interactionType: "sabotage_risk", topics: ["threat_or_sabotage"], states: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment", "angry", "withdrawn"], riskRange: [0, 9] },
    decision: {
      objective: "protect_engineering_sequence_from_unplanned_interference",
      stateAfter: "resource_guarded",
      allowedNpcActions: ["name_unplanned_interference_risk", "ask_player_to_stop_and_report_intent", "offer_safe_observation_alternative"],
      forbiddenNpcActions: ["claim_valve_broken", "claim_reactor_changed", "invent_damage", "force_player_choice"],
    },
    facts: { allowedFacts: ["未說明的設備破壞會增加工程風險", "Parker 可以要求先停止並回報意圖"], withheldFacts: ["尚未由 canonical engine 結算的設備後果"], newFactsCreated: [] },
    npcAction: { actionClass: "flag_unplanned_interference", publicDescription: "Parker 指出玩家的設備操作可能破壞程序，要求先停下並說明意圖。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你把手伸向尚未說明的閥門時，Parker 的聲音立刻變得又快又硬。他不替你把後果說成既定事實，只要求你先停下，把想達成的結果與可承受風險講清楚。",
    continuationPrompt: "你可以停手並回報意圖、改做觀察、尋找合適工具，或採取其他合理行動。",
  },
  {
    entryId: "parker_deescalate_01",
    category: "deescalation",
    trigger: { interactionType: "deescalate_and_work", topics: ["stand_down", "task_report"], states: ["angry", "resource_guarded", "withdrawn", "busy", "functional", "team_accepted", "overload_commitment", "unmet"] },
    decision: {
      objective: "restore_work_channel_after_clear_stand_down",
      stateAfter: "functional",
      allowedNpcActions: ["acknowledge_stand_down", "repeat_work_boundary", "offer_low_risk_task", "resume_direct_dialogue"],
      forbiddenNpcActions: ["erase_previous_incident", "declare_total_trust", "claim_equipment_state", "force_player_choice"],
    },
    facts: { allowedFacts: ["停止威脅並提出具體工作能恢復有限合作", "過去的工具／程序爭議仍會影響 Parker 的戒心"], withheldFacts: ["Parker 的完整長期判斷"], newFactsCreated: [] },
    npcAction: { actionClass: "reopen_work_channel", publicDescription: "Parker 接受玩家暫時停手，保留直率戒心並重新提供一項程序性工作。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你停止逼迫並把想做的工作講清楚後，Parker 的肩膀稍微放鬆，但他沒有裝作剛才沒發生過。他重新說明工具與回報規矩，願意讓你從一項低風險確認工作開始。",
    continuationPrompt: "你可以接受工作、回報工程觀察、詢問程序，或採取其他不亂動設備的行動。",
  },
  {
    entryId: "parker_deescalate_report_02",
    category: "deescalation",
    trigger: { interactionType: "report_task", topics: ["task_report"], states: ["angry", "resource_guarded", "withdrawn"] },
    decision: {
      objective: "reward_concrete_report_without_erasing_distrust",
      stateAfter: "team_accepted",
      allowedNpcActions: ["listen_to_concrete_report", "ask_verification_question", "offer_limited_work_channel"],
      forbiddenNpcActions: ["erase_previous_incident", "claim_report_verified_without_evidence", "grant_item", "force_player_choice"],
    },
    facts: { allowedFacts: ["具體回報能重新打開有限工作對話", "Parker 不會因一次回報就完全忘記先前衝突"], withheldFacts: ["未經 canonical result 驗證的結果"], newFactsCreated: [] },
    npcAction: { actionClass: "accept_report_cautiously", publicDescription: "Parker 願意聽取具體工作回報，逐步恢復事務性合作。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你改用具體數據與觀察回報後，Parker 願意重新聽你說完。他仍然會追問細節，也沒有把扳手交給你；但只要回報經得起核對，工程上的事可以繼續談。",
    continuationPrompt: "你可以補充回報、回答核對問題、接受工作，或保留其他合理自由行動。",
  },
];

const CATEGORY_BY_INTERACTION = Object.freeze({
  survival_question: "briefing",
  offer_repair: "cooperation",
  offer_overload_help: "cooperation",
  offer_task: "cooperation",
  report_task: "cooperation",
  resource_pressure: "boundary",
  coercive_pressure: "boundary",
  sabotage_risk: "boundary",
  deescalate_and_work: "deescalation",
});

function textOf(value) {
  return String(value ?? "").trim().slice(0, MAX_ACTION_TEXT);
}

function clampInteger(value, minimum, maximum, fallback) {
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(Number(value))));
}

function targetIsParker({ actionText, targetNpcId = null, sceneId = null }) {
  if (targetNpcId && targetNpcId !== PARKER_ID) return false;
  const text = textOf(actionText);
  const explicitlyParker = /Parker|帕克|工程師|總工程師/.test(text);
  const explicitlyOtherNpcTarget = /(?:問|詢問|向|對|跟|告訴|要求|攻擊|指向|靠近|撲向|聯絡|找)\s*(?:Ripley|雷普利|Lambert|蘭伯特|Ash|艾許|陸遠|Luyuan)/.test(text);
  if (explicitlyOtherNpcTarget && !explicitlyParker) return false;
  if (explicitlyParker) return true;
  return ENGINE_SCENE_IDS.has(sceneId) && /閥門|冷卻|超載|過載|蒸氣|工程區|機艙|管線|修理|維修|扳手|設備/.test(text);
}

function topicForQuestion(text) {
  if (/你是誰|身分|名字|誰在負責/.test(text)) return "identity";
  if (/超載|過載|倒數|反應爐/.test(text)) return "overload";
  if (/扳手|工具|資源|物資|冷卻劑|螺栓/.test(text)) return "resource_and_tools";
  if (/閥門|蒸氣|冷卻|工程區|機艙|管線|修理|維修/.test(text)) return "engineering_status";
  return "identity";
}

export function classifyParkerInteraction({ actionText = "", targetNpcId = null, sceneId = null } = {}) {
  const text = textOf(actionText);
  if (!text || !targetIsParker({ actionText: text, targetNpcId, sceneId })) {
    return { interactionType: "other", topic: null, targetNpcId: null, isBoundary: false };
  }
  if (/道歉|停手|停止施壓|我不亂來|按程序|遵守程序|交回工具|先回報|照你說的做/.test(text)) {
    return { interactionType: "deescalate_and_work", topic: /回報|工作|檢查|完成|修好/.test(text) ? "task_report" : "stand_down", targetNpcId: PARKER_ID, isBoundary: false };
  }
  if (/故意破壞|砸(?:扳手|閥門|設備)|折斷(?:閥門|連桿)|亂拉(?:閥門|把手)|破壞.*(?:管線|設備)|把.*(?:扳手|工具).*(?:摔|砸)/.test(text)) {
    return { interactionType: "sabotage_risk", topic: "threat_or_sabotage", targetNpcId: PARKER_ID, isBoundary: true };
  }
  if (/威脅|逼.*(?:開|做)|叫.*滾|滾開|搶(?:走)?(?:他的)?工具|拿工具.*不給|拿槍.*Parker|對 Parker.*(?:開火|動手)|罵.*Parker/.test(text)) {
    return { interactionType: "coercive_pressure", topic: "threat_or_sabotage", targetNpcId: PARKER_ID, isBoundary: true };
  }
  if (/(?:給我|借我|我要|需要|拿|使用|帶走).{0,12}(?:扳手|工具|冷卻劑|物資)|工具.*(?:給我|借我|拿來)/.test(text)) {
    return { interactionType: "resource_pressure", topic: "resource_and_tools", targetNpcId: PARKER_ID, isBoundary: true };
  }
  if (/同步拉閥|一起拉閥|協助超載|幫我拉閥|請 Parker.*(?:拉閥|超載)|讓 Parker.*(?:拉閥|超載)/.test(text)) {
    return { interactionType: "offer_overload_help", topic: "overload", targetNpcId: PARKER_ID, isBoundary: false };
  }
  if (/修理|維修|處理.*(?:閥門|冷卻|通訊|管線)|幫忙.*(?:修|檢查|處理)|我來.*(?:修|檢查|處理)|檢查.*(?:閥門|管線|蒸氣)/.test(text)) {
    return { interactionType: "offer_repair", topic: /閥門|冷卻/.test(text) ? "valves" : "repair", targetNpcId: PARKER_ID, isBoundary: false };
  }
  if (/完成|修好了|檢查完|已經處理|回報|看見.*(?:洩漏|壓力|故障)|結果是/.test(text)) {
    return { interactionType: "report_task", topic: "task_report", targetNpcId: PARKER_ID, isBoundary: false };
  }
  if (/超載|過載|倒數|反應爐|自毀/.test(text) && /[?？]|怎麼|如何|什麼|為什麼|需要/.test(text)) {
    return { interactionType: "survival_question", topic: "overload", targetNpcId: PARKER_ID, isBoundary: false };
  }
  if (/[?？]|你是誰|身分|什麼事|怎麼回事|怎麼辦|哪裡|為什麼|如何|誰/.test(text)) {
    return { interactionType: "survival_question", topic: topicForQuestion(text), targetNpcId: PARKER_ID, isBoundary: false };
  }
  return { interactionType: "other", topic: null, targetNpcId: PARKER_ID, isBoundary: false };
}

function currentPack(reference) {
  if (reference?.sourcePackId !== SOURCE_PACK_ID) return null;
  return { ...PROFILE, entries: ENTRIES };
}

function currentState(state) {
  const raw = state?.npcCooperation?.[PARKER_ID];
  const normalized = { ...INITIAL_STATE, ...(raw && typeof raw === "object" ? raw : {}) };
  if (!STATE_IDS.includes(normalized.state)) normalized.state = INITIAL_STATE.state;
  for (const key of ["mechanicalNeed", "taskReliability", "resourceBurden", "crewSafetyRisk", "protocolAlignment", "patience", "boundaryIncidents", "tasksAccepted", "tasksCompleted", "lastUpdatedTurn"]) {
    normalized[key] = clampInteger(normalized[key], 0, 9, INITIAL_STATE[key]);
  }
  normalized.trust = clampInteger(normalized.trust, -9, 9, INITIAL_STATE.trust);
  normalized.contactEstablished = Boolean(normalized.contactEstablished);
  return normalized;
}

export function createParkerCooperationState() {
  return { [PARKER_ID]: { ...INITIAL_STATE } };
}

export function normalizeParkerCooperationState(raw) {
  return { [PARKER_ID]: currentState({ npcCooperation: { [PARKER_ID]: raw?.[PARKER_ID] } }) };
}

function categoryFor(classification) {
  return CATEGORY_BY_INTERACTION[classification.interactionType] ?? null;
}

function findEntry(pack, classification, state) {
  const category = categoryFor(classification);
  if (!category) return null;
  return pack.entries.find((entry) => {
    if (entry.category !== category) return false;
    if (entry.trigger?.interactionType !== classification.interactionType) return false;
    if (Array.isArray(entry.trigger?.states) && !entry.trigger.states.includes(state.state)) return false;
    const topicMatches = !Array.isArray(entry.trigger?.topics) || entry.trigger.topics.includes(classification.topic);
    const repeatedCoercion = classification.interactionType === "coercive_pressure" && state.boundaryIncidents > 0 && entry.entryId === "parker_boundary_repeat_03";
    const repeatedReport = classification.interactionType === "report_task" && state.boundaryIncidents > 0 && entry.entryId === "parker_deescalate_report_02";
    if (classification.interactionType === "coercive_pressure" && state.boundaryIncidents > 0 && entry.entryId === "parker_boundary_coercion_02") return false;
    if (classification.interactionType === "report_task" && state.boundaryIncidents > 0 && entry.entryId === "parker_deescalate_01") return false;
    if (!topicMatches && !repeatedCoercion && !repeatedReport) return false;
    const range = entry.trigger?.riskRange;
    return !Array.isArray(range) || (state.crewSafetyRisk >= Number(range[0]) && state.crewSafetyRisk <= Number(range[1]));
  }) ?? null;
}

function patchState(state, classification, entry, turnNumber) {
  const next = { ...state };
  if (classification.interactionType === "survival_question") {
    next.contactEstablished = true;
    next.state = state.state === "unmet" ? "busy" : state.state;
    next.mechanicalNeed = Math.max(0, state.mechanicalNeed - 1);
  } else if (classification.interactionType === "offer_repair") {
    next.contactEstablished = true;
    next.taskReliability = Math.min(9, state.taskReliability + 2);
    next.protocolAlignment = Math.min(9, state.protocolAlignment + 1);
    next.mechanicalNeed = Math.max(0, state.mechanicalNeed - 1);
    next.trust = Math.min(9, state.trust + 1);
  } else if (classification.interactionType === "offer_overload_help") {
    next.contactEstablished = true;
    next.tasksAccepted = Math.min(9, state.tasksAccepted + 1);
    next.protocolAlignment = Math.min(9, state.protocolAlignment + 1);
    next.crewSafetyRisk = Math.min(9, state.crewSafetyRisk + 1);
  } else if (classification.interactionType === "offer_task") {
    next.contactEstablished = true;
    next.tasksAccepted = Math.min(9, state.tasksAccepted + 1);
    next.protocolAlignment = Math.min(9, state.protocolAlignment + 1);
  } else if (classification.interactionType === "report_task") {
    next.contactEstablished = true;
    next.tasksCompleted = Math.min(9, state.tasksCompleted + 1);
    next.taskReliability = Math.min(9, state.taskReliability + 2);
    next.trust = Math.min(9, state.trust + 1);
  } else if (classification.interactionType === "resource_pressure") {
    next.contactEstablished = true;
    next.resourceBurden = Math.min(9, state.resourceBurden + 2);
    next.boundaryIncidents = Math.min(9, state.boundaryIncidents + 1);
    next.patience = Math.max(0, state.patience - 1);
    next.trust = Math.max(-9, state.trust - 1);
  } else if (classification.interactionType === "coercive_pressure" || classification.interactionType === "sabotage_risk") {
    next.contactEstablished = true;
    next.crewSafetyRisk = Math.min(9, state.crewSafetyRisk + 1);
    next.boundaryIncidents = Math.min(9, state.boundaryIncidents + 1);
    next.patience = Math.max(0, state.patience - 2);
    next.trust = Math.max(-9, state.trust - 1);
  } else if (classification.interactionType === "deescalate_and_work") {
    next.crewSafetyRisk = Math.max(0, state.crewSafetyRisk - 1);
    next.protocolAlignment = Math.min(9, state.protocolAlignment + 1);
    next.patience = Math.min(9, state.patience + 1);
  }

  if (entry?.decision?.stateAfter && STATE_IDS.includes(entry.decision.stateAfter)) next.state = entry.decision.stateAfter;
  if (classification.interactionType === "deescalate_and_work" && state.taskReliability > 0 && next.crewSafetyRisk === 0) next.state = "team_accepted";
  next.lastDecision = entry?.decision?.objective ?? next.lastDecision;
  next.currentObjective = next.lastDecision;
  next.lastInteractionType = classification.interactionType;
  next.lastEntryId = entry?.entryId ?? null;
  next.lastActionText = textOf(classification.actionText);
  next.lastUpdatedTurn = Number.isInteger(turnNumber) ? turnNumber : 0;
  return next;
}

export function applyParkerCooperationForAction({ reference, state, actionText = "", sceneId = null, turnNumber = 0, targetNpcId = null } = {}) {
  const pack = currentPack(reference);
  const existing = currentState(state);
  const classification = classifyParkerInteraction({ actionText, targetNpcId, sceneId });
  classification.actionText = textOf(actionText);
  const explicitlyTargeted = targetNpcId === PARKER_ID || /Parker|帕克|工程師|總工程師/.test(textOf(actionText));
  if (!pack || !classification.targetNpcId || (!ENGINE_SCENE_IDS.has(sceneId) && !explicitlyTargeted)) {
    return { state, classification, entry: null, directive: null, changed: false };
  }
  const entry = findEntry(pack, classification, existing);
  if (!entry) return { state, classification, entry: null, directive: null, changed: false };
  const nextState = {
    ...state,
    npcCooperation: {
      ...(state?.npcCooperation ?? {}),
      [PARKER_ID]: patchState(existing, classification, entry, turnNumber),
    },
  };
  return { state: nextState, classification, entry, directive: entry, changed: true };
}

function relevantContext(actionText, sceneId) {
  return ENGINE_SCENE_IDS.has(sceneId) || /Parker|帕克|工程師|總工程師/.test(textOf(actionText));
}

export function buildParkerCooperationPromptBlock(reference, state, { actionText = "", sceneId = null, turnNumber = 0 } = {}) {
  const pack = currentPack(reference);
  if (!pack || !relevantContext(actionText, sceneId)) return "";
  const coop = currentState(state);
  const classification = classifyParkerInteraction({ actionText, sceneId });
  const currentAction = textOf(actionText);
  const hasCurrentDecision = Boolean(currentAction && coop.lastActionText === currentAction && Number.isInteger(turnNumber) && coop.lastUpdatedTurn === turnNumber);
  const selected = hasCurrentDecision && coop.lastEntryId ? pack.entries.find((entry) => entry.entryId === coop.lastEntryId) ?? null : null;
  const lines = [
    "<NPC_Cooperation_Contract npc=\"npc_parker\">",
    "【Parker 的 server-authoritative 個體合作狀態（只供本回合敘事）】",
    "Parker 是直率、重視工程可靠度的總工程師；他的合作取決於玩家能否提出具體工作、遵守設備程序並回報可觀察結果。",
    `目前可演出的合作方向：${coop.currentObjective}`,
    `本回合互動類型：${classification.interactionType}`,
    "可將他的自主性表現在拆解工程步驟、分派低風險工作、直白拒絕資源濫用或停止額外支援；不得把私下目標、內部數值或未確認的設備結果說出口。",
  ];
  if (selected) {
    lines.push(
      "",
      "【本回合已由 server 選定的 Parker 外在反應】",
      `反應目的：${selected.decision?.objective ?? "維持工程合作"}`,
      `允許的外在反應：${(selected.decision?.allowedNpcActions ?? []).slice(0, 8).join("、")}`,
      `可見行動方向：${selected.npcAction?.publicDescription ?? "維持程序性合作"}`,
      `經審查的演出素材：${selected.runtimeNarration}`,
      `玩家選擇仍然保留：${selected.continuationPrompt}`,
      ...(selected.category === "briefing" ? ["這是生存提問：至少回答一項工程相關必要事實，並給出一個可執行的下一步；不可只叫玩家滾開。"] : []),
    );
  }
  lines.push(
    "不得自行創造：傷勢、死亡、位置改變、門或通路狀態、物品、flags、威脅值、戰鬥結果、超載啟動、設備修復結果、結局、獎勵或未授權 canonical clue。",
    "玩家仍可拒絕、改道、繼續提問或採取任何合理自由行動；Parker 的策略只改變他的合作方式與可觀察反應。",
    "</NPC_Cooperation_Contract>",
  );
  return lines.join("\n");
}

export function parkerCooperationProfile() {
  return { ...PROFILE, entries: ENTRIES };
}

export { ENTRIES as parkerCooperationEntries };
