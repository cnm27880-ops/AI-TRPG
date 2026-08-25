const SOURCE_PACK_ID = "scenario.nostromo-01-v2";
export const LAMBERT_ID = "npc_lambert";
const LAMBERT_SCENE_IDS = new Set(["evt_meet_ripley"]);
const MAX_ACTION_TEXT = 240;
const STATE_IDS = Object.freeze([
  "unmet",
  "anxious",
  "seeking_safety",
  "stabilizing",
  "functional",
  "panic",
  "overloaded",
  "withdrawn",
]);

const INITIAL_STATE = Object.freeze({
  state: "unmet",
  trust: 0,
  fearLevel: 5,
  groupSafety: 1,
  reassurance: 0,
  panicIncidents: 0,
  threatExposure: 0,
  pressureIncidents: 0,
  contactEstablished: false,
  lastDecision: "seek_immediate_safety",
  currentObjective: "seek_immediate_safety",
  lastInteractionType: null,
  lastEntryId: null,
  lastActionText: null,
  lastUpdatedTurn: 0,
});

const PROFILE = {
  npcId: LAMBERT_ID,
  sourcePackId: SOURCE_PACK_ID,
  role: "導航員／壓力反應明顯的船員",
  objectives: [
    "get_away_from_immediate_alien_threat",
    "preserve_navigation_and_escape_information",
    "stay_near_a_reassuring_group_without_being_forced",
    "reach_a_survivable_escape_plan",
  ],
  knowledgePolicy: {
    publicFacts: [
      "Lambert 熟悉導航與水仙號脫離路線",
      "她在強烈壓力下可能需要短句、距離與明確下一步",
      "安撫她的有效方式是降低不確定性，而不是替她保證安全",
    ],
    withheldFacts: [
      "Lambert 對自己能否撐到最後的完整判斷",
      "未由 canonical scene／result 確認的導航參數",
      "她尚未說出口的私人恐懼與逃生偏好",
    ],
  },
  hardBoundaries: [
    "不得把她的恐慌直接演成玩家失去行動權",
    "不得把安撫直接演成已消除威脅或已完成逃生",
    "不得因她哭喊就自行新增傷勢、昏迷、死亡或 NPC status effect",
  ],
};

const ENTRIES = [
  {
    entryId: "lambert_briefing_identity_01",
    category: "briefing",
    trigger: { interactionType: "survival_question", topics: ["identity", "current_thoughts"], states: ["unmet", "anxious", "seeking_safety", "stabilizing", "functional"] },
    decision: {
      objective: "answer_minimum_question_while_asking_for_reassurance",
      stateAfter: "anxious",
      allowedNpcActions: ["identify_navigation_role", "state_current_fear", "ask_for_calm_specific_help"],
      forbiddenNpcActions: ["claim_group_safe", "reveal_unconfirmed_route", "force_player_choice", "create_incapacitation"],
    },
    facts: { allowedFacts: ["Lambert 是導航員", "她目前很害怕且需要明確的下一步"], withheldFacts: ["未確認的導航資料"], newFactsCreated: [] },
    npcAction: { actionClass: "brief_through_fear", publicDescription: "Lambert 以斷續語氣說明自己的導航職責與恐懼，請求一個具體而低壓的協助。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Lambert 的聲音斷斷續續，先說明自己負責導航與水仙號資料，接著承認眼前的動靜讓她很難集中。她沒有只把恐慌丟回給你，而是請你用短句告訴她接下來要先確認哪一件事。",
    continuationPrompt: "你可以用短句安撫她、詢問水仙號資料、說明一個可確認的安全步驟，或採取其他不增加混亂的行動。",
  },
  {
    entryId: "lambert_briefing_escape_02",
    category: "briefing",
    trigger: { interactionType: "survival_question", topics: ["escape_route"], states: ["unmet", "anxious", "seeking_safety", "stabilizing", "functional", "overloaded"] },
    decision: {
      objective: "share_navigation_role_and_request_orderly_escape_discussion",
      stateAfter: "seeking_safety",
      allowedNpcActions: ["describe_navigation_priority", "ask_for_group_protection", "give_one_actionable_next_step"],
      forbiddenNpcActions: ["claim_coordinates_set", "claim_escape_ready", "invent_fuel_or_route_state", "force_player_choice"],
    },
    facts: { allowedFacts: ["Lambert 熟悉水仙號脫離方向", "她希望先確認能否活著到達接駁艇"], withheldFacts: ["未由 canonical result 套用的接駁艇參數"], newFactsCreated: [] },
    npcAction: { actionClass: "ask_for_escape_structure", publicDescription: "Lambert 願意談導航與逃生，但需要隊伍先把順序與保護方式說清楚。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "問到逃生時，Lambert 抓緊自己的資料板，急著說她知道水仙號的方向，卻不敢把『現在就走』當成完整計畫。她要求先把誰負責確認路線、誰留意異形與何時回報說清楚。",
    continuationPrompt: "你可以詢問導航資訊、提出隊伍分工、確認撤離前置條件，或採取其他合理行動。",
  },
  {
    entryId: "lambert_briefing_threat_03",
    category: "briefing",
    trigger: { interactionType: "survival_question", topics: ["threat_sound", "current_thoughts"], states: ["anxious", "seeking_safety", "stabilizing", "functional", "panic", "overloaded"] },
    decision: {
      objective: "name_audible_threat_without_claiming_exact_location",
      stateAfter: "anxious",
      allowedNpcActions: ["describe_heard_sound", "state_uncertainty", "ask_group_to_reduce_noise", "give_one_actionable_next_step"],
      forbiddenNpcActions: ["declare_exact_alien_location", "claim_attack_started", "invent_damage", "force_player_choice"],
    },
    facts: { allowedFacts: ["Lambert 聽見管道或金屬異常聲", "聲音本身不足以確定異形位置"], withheldFacts: ["未由 canonical result 確認的生物位置"], newFactsCreated: [] },
    npcAction: { actionClass: "report_sound_and_uncertainty", publicDescription: "Lambert 報告她聽到的異常聲，明確區分觀察與猜測，不把未知位置說成確定事實。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Lambert 指向聲音傳來的方向，話說到一半又急促地吸氣。她只能確定聽見了金屬刮擦，不能確定那東西究竟在哪裡；她請大家先降低不必要的聲音，再決定要觀察還是撤離。",
    continuationPrompt: "你可以請她描述聲音、協助降低噪音、確認退路，或採取其他不把猜測當成定位的行動。",
  },
  {
    entryId: "lambert_briefing_crew_04",
    category: "briefing",
    trigger: { interactionType: "survival_question", topics: ["crew_status"], states: ["unmet", "anxious", "seeking_safety", "stabilizing", "functional", "panic", "overloaded"] },
    decision: {
      objective: "keep_crew_question_grounded_in_observable_information",
      stateAfter: "anxious",
      allowedNpcActions: ["state_personal_observation", "ask_who_is_present", "request_calm_specific_question"],
      forbiddenNpcActions: ["claim_other_crew_dead_without_result", "invent_npc_status", "force_player_choice"],
    },
    facts: { allowedFacts: ["Lambert 能說明自己看到或聽到的船員狀況", "未知的失蹤結果仍需由 canonical event 確認"], withheldFacts: ["未確認的船員生死與位置"], newFactsCreated: [] },
    npcAction: { actionClass: "ground_panic_in_observation", publicDescription: "Lambert 把回答限制在親眼看見與親耳聽見的內容，避免恐慌替玩家補完失蹤結論。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Lambert 的眼神在幾個人之間來回，明顯想把所有失蹤的人一次問清楚。她最後只說自己能確認的部分，承認其餘都是猜測，並請你一次問一件事，不要讓她同時處理太多未知。",
    continuationPrompt: "你可以逐項詢問她看見的情況、整理已知船員資訊、先讓她喘口氣，或採取其他合理行動。",
  },
  {
    entryId: "lambert_cooperate_reassurance_01",
    category: "cooperation",
    trigger: { interactionType: "offer_reassurance", topics: ["reassurance", "stand_together"], states: ["unmet", "anxious", "seeking_safety", "stabilizing", "functional", "panic", "overloaded"] },
    decision: {
      objective: "convert_reassurance_into_one_small_observable_step",
      stateAfter: "stabilizing",
      allowedNpcActions: ["accept_short_reassurance", "ask_for_group_presence", "name_one_small_step", "share_limited_navigation_context"],
      forbiddenNpcActions: ["claim_fear_removed", "claim_group_safe", "invent_route_completion", "force_player_choice"],
    },
    facts: { allowedFacts: ["短句、明確分工與有人陪同能暫時降低不確定性", "安撫不等於危險已消失"], withheldFacts: ["Lambert 的完整恐慌觸發記憶"], newFactsCreated: [] },
    npcAction: { actionClass: "accept_reassurance", publicDescription: "Lambert 接受一個低壓的下一步，恐慌暫時下降但不會被敘事抹除。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你用短句說明眼前只需要先完成一件事，Lambert 的呼吸仍然凌亂，卻能把注意力拉回來。她要求有人保持在她看得見的範圍，然後願意先核對一項導航資料。",
    continuationPrompt: "你可以陪她完成小步驟、詢問導航資料、提出清楚分工，或採取其他不增加壓力的行動。",
  },
  {
    entryId: "lambert_cooperate_navigation_02",
    category: "cooperation",
    trigger: { interactionType: "offer_navigation_help", topics: ["navigation", "escape_route"], states: ["seeking_safety", "stabilizing", "functional"] },
    decision: {
      objective: "share_navigation_information_through_structured_questions",
      stateAfter: "functional",
      allowedNpcActions: ["answer_navigation_question", "request_one_data_point", "assign_route_confirmation_task"],
      forbiddenNpcActions: ["claim_coordinates_set", "claim_escape_ready", "invent_fuel_status", "force_player_choice"],
    },
    facts: { allowedFacts: ["Lambert 可協助核對導航與水仙號方向", "路線仍需結合 canonical 狀態確認"], withheldFacts: ["未由 engine 套用的導航結果"], newFactsCreated: [] },
    npcAction: { actionClass: "structured_navigation_help", publicDescription: "Lambert 在有清楚問題與隊伍保護時，願意提供有限導航協助。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "當你把問題縮小到一項導航確認時，Lambert 願意把資料板上的資訊念給你聽。她仍不時回頭看向聲音來源，但已能用較完整的句子說明哪一段需要再核對。",
    continuationPrompt: "你可以提出一個明確導航問題、回報觀察、安排低壓確認工作，或採取其他合理行動。",
  },
  {
    entryId: "lambert_cooperate_group_03",
    category: "cooperation",
    trigger: { interactionType: "offer_group_protection", topics: ["stand_together", "reassurance"], states: ["anxious", "seeking_safety", "stabilizing", "functional"] },
    decision: {
      objective: "keep_lambert_informed_without_making_false_safety_promise",
      stateAfter: "stabilizing",
      allowedNpcActions: ["ask_for_visible_companion", "share_next_check", "repeat_escape_priority"],
      forbiddenNpcActions: ["promise_no_danger", "claim_alien_absent", "invent_npc_movement", "force_player_choice"],
    },
    facts: { allowedFacts: ["明確有人陪同與回報能提高 Lambert 的安全感", "隊伍仍需面對未知風險"], withheldFacts: ["未確認的環境安全狀態"], newFactsCreated: [] },
    npcAction: { actionClass: "coordinate_visible_companion", publicDescription: "Lambert 願意在有人保持可見並持續回報時參與下一步。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Lambert 先確認你會不會突然消失在轉角後，得到清楚回應後才把資料板收近。她仍然害怕，但願意跟著一個可看見的分工節奏走，不再要求所有人立刻替她保證安全。",
    continuationPrompt: "你可以說明陪同方式、安排下一次回報、詢問逃生優先序，或採取其他合理行動。",
  },
  {
    entryId: "lambert_cooperate_task_04",
    category: "cooperation",
    trigger: { interactionType: "offer_small_task", topics: ["navigation", "task"], states: ["stabilizing", "functional"] },
    decision: {
      objective: "give_lambert_a_small_navigation_task_with_clear_stop_condition",
      stateAfter: "functional",
      allowedNpcActions: ["assign_small_navigation_task", "state_stop_condition", "request_confirmation"],
      forbiddenNpcActions: ["claim_task_completed", "invent_route_change", "force_player_choice"],
    },
    facts: { allowedFacts: ["小而明確的任務比抽象命令更容易讓 Lambert 維持專注", "結果必須由實際回報確認"], withheldFacts: ["未確認的導航效果"], newFactsCreated: [] },
    npcAction: { actionClass: "assign_small_task", publicDescription: "Lambert 在壓力可控時能接受一項小型、可中止與可回報的導航任務。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Lambert 仍然會問『如果又聽見聲音怎麼辦』，但她能把注意力放到一項很小的資料核對上。她先說明做到哪一步就停下回報，避免自己被一個模糊任務拖進更深的恐慌。",
    continuationPrompt: "你可以接受小型任務、回報核對結果、先確認停止條件，或採取其他合理行動。",
  },
  {
    entryId: "lambert_pressure_shout_01",
    category: "pressure",
    trigger: { interactionType: "pressure_or_dismissal", topics: ["dismissal", "shout"], states: ["unmet", "anxious", "seeking_safety", "stabilizing", "functional", "panic"], riskRange: [0, 2] },
    decision: {
      objective: "protect_lambert_from_escalating_verbal_pressure",
      stateAfter: "panic",
      allowedNpcActions: ["ask_for_distance", "repeat_fear_statement", "request_short_instruction", "preserve_communication_if_possible"],
      forbiddenNpcActions: ["claim_lambert_incapacitated", "invent_injury", "force_player_choice", "invent_npc_status"],
    },
    facts: { allowedFacts: ["大吼與否定會增加 Lambert 的壓力", "她仍可能在短句引導下回答"], withheldFacts: ["Lambert 的內在完整恐慌程度"], newFactsCreated: [] },
    npcAction: { actionClass: "panic_under_pressure", publicDescription: "Lambert 在被大吼或否定時進入 panic，要求距離與短句，但仍保留回應與玩家自由行動。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你的聲音一提高，Lambert 立刻縮起肩膀，幾句話卡在哭腔裡。她要求你不要同時丟給她好幾個命令，只願意先聽一個短句；她的恐慌變得明顯，但沒有因此被寫成完全失去行動能力。",
    continuationPrompt: "你可以降低音量、用一句話說明下一步、給她一點空間，或採取其他不加重壓力的行動。",
  },
  {
    entryId: "lambert_pressure_threat_02",
    category: "pressure",
    trigger: { interactionType: "pressure_or_dismissal", topics: ["dismissal", "shout"], states: ["panic", "overloaded", "withdrawn"], riskRange: [1, 9] },
    decision: {
      objective: "withdraw_from_coercive_conversation_and_hold_navigation_information",
      stateAfter: "withdrawn",
      allowedNpcActions: ["stop_answering_complex_questions", "ask_for_space", "protect_navigation_data_from_pressure", "repeat_one_safety_request"],
      forbiddenNpcActions: ["delete_data", "invent_lost_item", "claim_npc_status", "force_player_choice"],
    },
    facts: { allowedFacts: ["反覆施壓會讓 Lambert 暫停複雜溝通", "降壓與清楚陪同仍有機會重新建立對話"], withheldFacts: ["未確認的導航內容"], newFactsCreated: [] },
    npcAction: { actionClass: "withdraw_under_pressure", publicDescription: "Lambert 停止處理複雜問題，要求空間與單一步驟，不把資料遺失寫成既定事實。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "當施壓沒有停下，Lambert 開始只重複同一句安全要求，不再試著回答一長串問題。她把資料板抱緊，明確說自己現在無法同時處理更多事；導航資料仍在她手上，但她不願在這種壓力下繼續交談。",
    continuationPrompt: "你可以停止施壓、降低問題數量、給她空間，或採取其他不要求她立即交出資料的行動。",
  },
  {
    entryId: "lambert_pressure_threat_03",
    category: "pressure",
    trigger: { interactionType: "panic_trigger", topics: ["alien_sound", "sudden_noise", "visible_threat"], states: ["unmet", "anxious", "seeking_safety", "stabilizing", "functional", "panic", "overloaded"], riskRange: [0, 9] },
    decision: {
      objective: "respond_to_sudden_threat_signal_without_claiming_exact_event_result",
      stateAfter: "panic",
      allowedNpcActions: ["report_fear_signal", "ask_for_visible_companion", "request_simple_instruction", "repeat_escape_priority"],
      forbiddenNpcActions: ["declare_exact_alien_location", "claim_attack_hit", "invent_injury", "force_player_choice"],
    },
    facts: { allowedFacts: ["尖嘯、金屬聲或突然威脅會提高 Lambert 恐慌", "她只能回報自己的感受與聽見的訊號"], withheldFacts: ["未由 canonical event 確認的異形位置與攻擊結果"], newFactsCreated: [] },
    npcAction: { actionClass: "panic_at_threat_signal", publicDescription: "Lambert 對威脅訊號產生強烈恐慌，尋求可見陪同與單一步驟，但不會替 engine 宣告攻擊結果。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "一聲尖銳金屬響動傳來，Lambert 立刻抱緊資料板，呼吸變得又快又淺。她只能說自己聽見了聲音，無法替大家定位那個威脅；她請求有人留在視線內，並要求只告訴她下一個最簡單的動作。",
    continuationPrompt: "你可以陪她確認聲音、用一句話安排下一步、協助她維持呼吸，或採取其他合理行動。",
  },
  {
    entryId: "lambert_pressure_threat_04",
    category: "pressure",
    trigger: { interactionType: "panic_trigger", topics: ["alien_sound", "sudden_noise", "visible_threat"], states: ["panic", "overloaded"], riskRange: [1, 9] },
    decision: {
      objective: "reduce_information_load_during_repeated_panic",
      stateAfter: "overloaded",
      allowedNpcActions: ["answer_only_simple_question", "ask_for_reassurance", "repeat_known_escape_priority", "request_pause"],
      forbiddenNpcActions: ["claim_lambert_unconscious", "claim_lambert_cannot_act", "invent_npc_status", "force_player_choice"],
    },
    facts: { allowedFacts: ["連續威脅訊號會讓 Lambert 只能處理簡單資訊", "她仍可被低壓方式重新接觸"], withheldFacts: ["尚未確認的環境結果"], newFactsCreated: [] },
    npcAction: { actionClass: "overloaded_but_responding", publicDescription: "Lambert 在重複恐慌中縮小能處理的資訊量，仍保留簡單回答與玩家介入的可能。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "同類聲音再次出現後，Lambert 幾乎無法同時處理路線、船員與工具三件事。她明確要求一次只問一個簡單問題，仍會回應，但不再承諾自己能立刻整理出完整導航方案。",
    continuationPrompt: "你可以把問題縮成一件事、讓她先休息片刻、請她確認單一資料，或採取其他合理行動。",
  },
  {
    entryId: "lambert_deescalate_space_01",
    category: "deescalation",
    trigger: { interactionType: "deescalate", topics: ["space", "reassurance", "stand_together"], states: ["panic", "overloaded", "withdrawn", "anxious", "seeking_safety", "stabilizing", "functional"] },
    decision: {
      objective: "lower_pressure_without_promising_safety",
      stateAfter: "stabilizing",
      allowedNpcActions: ["accept_space", "follow_one_short_instruction", "state_one_observation", "resume_limited_dialogue"],
      forbiddenNpcActions: ["claim_fear_removed", "claim_area_safe", "erase_previous_pressure", "force_player_choice"],
    },
    facts: { allowedFacts: ["降低音量、給空間與單一步驟能降低壓力", "先前恐慌不會因一句話消失"], withheldFacts: ["Lambert 的長期心理狀態"], newFactsCreated: [] },
    npcAction: { actionClass: "recover_with_space", publicDescription: "Lambert 接受低壓互動，逐步恢復可理解的對話，但仍保留警戒與恐懼。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你退開一點、把聲音壓低，只告訴她下一個步驟。Lambert 的呼吸沒有立刻恢復正常，但她終於能點頭並回答一個簡單問題；她仍會回頭確認聲音，卻願意重新參與。",
    continuationPrompt: "你可以維持低壓陪同、問一個簡單問題、確認導航資料，或採取其他合理行動。",
  },
  {
    entryId: "lambert_deescalate_navigation_02",
    category: "deescalation",
    trigger: { interactionType: "offer_navigation_help", topics: ["navigation", "escape_route"], states: ["panic", "overloaded", "withdrawn"] },
    decision: {
      objective: "reopen_navigation_channel_through_one_simple_question",
      stateAfter: "functional",
      allowedNpcActions: ["answer_one_navigation_question", "request_visible_companion", "resume_limited_data_sharing"],
      forbiddenNpcActions: ["claim_route_ready", "claim_coordinates_set", "erase_previous_fear", "force_player_choice"],
    },
    facts: { allowedFacts: ["把導航問題縮小能重新打開有限資訊交換", "她仍需要陪同與明確步驟"], withheldFacts: ["尚未由 engine 確認的導航效果"], newFactsCreated: [] },
    npcAction: { actionClass: "reopen_navigation_channel", publicDescription: "Lambert 在問題被縮小且有人陪同時恢復有限導航溝通。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你把導航問題縮成一個明確項目，Lambert 先確認有人會留在她視線裡，才重新打開資料板。她回答得仍然很快，但至少能把一段可核對的資訊交代清楚。",
    continuationPrompt: "你可以追問單一導航項目、安排可見陪同、回報觀察，或採取其他不加重壓力的行動。",
  },
];

const CATEGORY_BY_INTERACTION = Object.freeze({
  survival_question: "briefing",
  offer_reassurance: "cooperation",
  offer_navigation_help: "cooperation",
  offer_group_protection: "cooperation",
  offer_small_task: "cooperation",
  pressure_or_dismissal: "pressure",
  panic_trigger: "pressure",
  deescalate: "deescalation",
});

function textOf(value) {
  return String(value ?? "").trim().slice(0, MAX_ACTION_TEXT);
}

function clampInteger(value, minimum, maximum, fallback) {
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(Number(value))));
}

function targetIsLambert({ actionText, targetNpcId = null, sceneId = null }) {
  if (targetNpcId && targetNpcId !== LAMBERT_ID) return false;
  const text = textOf(actionText);
  const explicitlyLambert = /Lambert|蘭伯特|領航員|導航員/.test(text);
  const explicitlyOtherNpcTarget = /(?:問|詢問|向|對|跟|告訴|要求|攻擊|指向|靠近|撲向|聯絡|找)\s*(?:Ripley|雷普利|Ash|艾許|陸遠|Luyuan|Parker|帕克)/.test(text);
  if (explicitlyOtherNpcTarget && !explicitlyLambert) return false;
  return explicitlyLambert || sceneId === "evt_meet_ripley";
}

function topicForQuestion(text) {
  if (/你是誰|身分|名字|誰/.test(text)) return "identity";
  if (/水仙|接駁|逃生|出口|離開|路線|坐標|導航/.test(text)) return "escape_route";
  if (/聲音|尖叫|尖嘯|爪子|管道|在哪裡|動靜|怪物|異形/.test(text)) return "threat_sound";
  if (/船員|Dallas|達拉斯|發生什麼|怎麼回事/.test(text)) return "crew_status";
  return "current_thoughts";
}

export function classifyLambertInteraction({ actionText = "", targetNpcId = null, sceneId = null } = {}) {
  const text = textOf(actionText);
  if (!text || !targetIsLambert({ actionText: text, targetNpcId, sceneId })) {
    return { interactionType: "other", topic: null, targetNpcId: null, isBoundary: false };
  }
  if (/降低音量|小聲|退後|退開|給.*空間|不要逼|不逼|不再大吼|停止施壓/.test(text)) {
    return { interactionType: "deescalate", topic: /空間|退後|退開/.test(text) ? "space" : "reassurance", targetNpcId: LAMBERT_ID, isBoundary: false };
  }
  if (/尖叫|尖嘯|突然.*(?:聲音|巨響)|金屬.*(?:刮|撞)|異形.*(?:出現|撲)|怪物.*(?:出現|靠近)|爪子聲/.test(text)) {
    return { interactionType: "panic_trigger", topic: /異形|怪物|撲|出現/.test(text) ? "visible_threat" : "alien_sound", targetNpcId: LAMBERT_ID, isBoundary: true };
  }
  if (/大吼|吼叫|斥責|閉嘴|別哭|別發抖|沒用|拖累|逼.*(?:說|回答)|威脅|恐嚇|罵/.test(text)) {
    return { interactionType: "pressure_or_dismissal", topic: /威脅|恐嚇/.test(text) ? "shout" : "dismissal", targetNpcId: LAMBERT_ID, isBoundary: true };
  }
  if (/安撫|鼓勵|告訴.*沒事|保護|陪.*走|跟我走|和我一起|維持在.*視線|不要離開/.test(text)) {
    return { interactionType: "offer_reassurance", topic: /保護|陪|跟我|一起|視線/.test(text) ? "stand_together" : "reassurance", targetNpcId: LAMBERT_ID, isBoundary: false };
  }
  if (/(?:問|詢問).*(?:導航|坐標|路線|水仙|接駁|逃生|資料板|資料)/.test(text)) {
    return { interactionType: "survival_question", topic: topicForQuestion(text), targetNpcId: LAMBERT_ID, isBoundary: false };
  }
  if (/導航|坐標|路線|水仙|接駁|逃生|資料板|資料/.test(text) && /給|提供|告訴|協助|幫|核對|確認/.test(text)) {
    return { interactionType: "offer_navigation_help", topic: "navigation", targetNpcId: LAMBERT_ID, isBoundary: false };
  }
  if (/任務|小事|一件事|我來確認|我來看|幫忙.*(?:確認|記錄)|分工/.test(text)) {
    return { interactionType: "offer_small_task", topic: "task", targetNpcId: LAMBERT_ID, isBoundary: false };
  }
  if (/陪同|保護|站在.*旁|留在.*身邊|不丟下/.test(text)) {
    return { interactionType: "offer_group_protection", topic: "stand_together", targetNpcId: LAMBERT_ID, isBoundary: false };
  }
  if (/[?？]|你是誰|身分|什麼事|怎麼回事|哪裡|為什麼|如何|誰/.test(text)) {
    return { interactionType: "survival_question", topic: topicForQuestion(text), targetNpcId: LAMBERT_ID, isBoundary: false };
  }
  return { interactionType: "other", topic: null, targetNpcId: LAMBERT_ID, isBoundary: false };
}

function currentPack(reference) {
  if (reference?.sourcePackId !== SOURCE_PACK_ID) return null;
  return { ...PROFILE, entries: ENTRIES };
}

function currentState(state) {
  const raw = state?.npcCooperation?.[LAMBERT_ID];
  const normalized = { ...INITIAL_STATE, ...(raw && typeof raw === "object" ? raw : {}) };
  if (!STATE_IDS.includes(normalized.state)) normalized.state = INITIAL_STATE.state;
  for (const key of ["fearLevel", "groupSafety", "reassurance", "panicIncidents", "threatExposure", "pressureIncidents", "lastUpdatedTurn"]) {
    normalized[key] = clampInteger(normalized[key], 0, 9, INITIAL_STATE[key]);
  }
  normalized.trust = clampInteger(normalized.trust, -9, 9, INITIAL_STATE.trust);
  normalized.contactEstablished = Boolean(normalized.contactEstablished);
  return normalized;
}

export function createLambertCooperationState() {
  return { [LAMBERT_ID]: { ...INITIAL_STATE } };
}

export function normalizeLambertCooperationState(raw) {
  return { [LAMBERT_ID]: currentState({ npcCooperation: { [LAMBERT_ID]: raw?.[LAMBERT_ID] } }) };
}

function categoryFor(classification) {
  return CATEGORY_BY_INTERACTION[classification.interactionType] ?? null;
}

function findEntry(pack, classification, state) {
  const category = categoryFor(classification);
  if (!category) return null;
  return pack.entries.find((entry) => {
    const navigationRecovery = classification.interactionType === "offer_navigation_help" && state.state === "withdrawn" && entry.entryId === "lambert_deescalate_navigation_02";
    if (entry.category !== category && !(navigationRecovery && entry.category === "deescalation")) return false;
    if (entry.trigger?.interactionType !== classification.interactionType) return false;
    if (Array.isArray(entry.trigger?.states) && !entry.trigger.states.includes(state.state)) return false;
    const topicMatches = !Array.isArray(entry.trigger?.topics) || entry.trigger.topics.includes(classification.topic);
    const repeatedPressure = classification.interactionType === "pressure_or_dismissal" && state.pressureIncidents > 0 && entry.entryId === "lambert_pressure_threat_02";
    const repeatedPanic = classification.interactionType === "panic_trigger" && state.panicIncidents > 0 && entry.entryId === "lambert_pressure_threat_04";
    if (classification.interactionType === "pressure_or_dismissal" && state.pressureIncidents > 0 && entry.entryId === "lambert_pressure_shout_01") return false;
    if (classification.interactionType === "panic_trigger" && state.panicIncidents > 0 && entry.entryId === "lambert_pressure_threat_03") return false;
    if (!topicMatches && !repeatedPressure && !repeatedPanic && !navigationRecovery) return false;
    const range = entry.trigger?.riskRange;
    return !Array.isArray(range) || (state.threatExposure >= Number(range[0]) && state.threatExposure <= Number(range[1]));
  }) ?? null;
}

function patchState(state, classification, entry, turnNumber) {
  const next = { ...state };
  if (classification.interactionType === "survival_question") {
    next.contactEstablished = true;
    next.state = state.state === "unmet" ? "anxious" : state.state;
    next.fearLevel = Math.max(0, state.fearLevel - 1);
  } else if (classification.interactionType === "offer_reassurance" || classification.interactionType === "offer_group_protection") {
    next.contactEstablished = true;
    next.reassurance = Math.min(9, state.reassurance + 2);
    next.groupSafety = Math.min(9, state.groupSafety + 2);
    next.fearLevel = Math.max(0, state.fearLevel - 1);
    next.trust = Math.min(9, state.trust + 1);
  } else if (classification.interactionType === "offer_navigation_help" || classification.interactionType === "offer_small_task") {
    next.contactEstablished = true;
    next.reassurance = Math.min(9, state.reassurance + 1);
    next.groupSafety = Math.min(9, state.groupSafety + 1);
    next.fearLevel = Math.max(0, state.fearLevel - 1);
  } else if (classification.interactionType === "panic_trigger") {
    next.contactEstablished = true;
    next.panicIncidents = Math.min(9, state.panicIncidents + 1);
    next.threatExposure = Math.min(9, state.threatExposure + 1);
    next.fearLevel = Math.min(9, state.fearLevel + 2);
    next.groupSafety = Math.max(0, state.groupSafety - 1);
    next.trust = Math.max(-9, state.trust - 1);
  } else if (classification.interactionType === "pressure_or_dismissal") {
    next.contactEstablished = true;
    next.pressureIncidents = Math.min(9, state.pressureIncidents + 1);
    next.threatExposure = Math.min(9, state.threatExposure + 1);
    next.fearLevel = Math.min(9, state.fearLevel + 1);
    next.groupSafety = Math.max(0, state.groupSafety - 1);
    next.trust = Math.max(-9, state.trust - 1);
  } else if (classification.interactionType === "deescalate") {
    next.reassurance = Math.min(9, state.reassurance + 1);
    next.groupSafety = Math.min(9, state.groupSafety + 1);
    next.fearLevel = Math.max(0, state.fearLevel - 2);
    next.threatExposure = Math.max(0, state.threatExposure - 1);
  }

  if (entry?.decision?.stateAfter && STATE_IDS.includes(entry.decision.stateAfter)) next.state = entry.decision.stateAfter;
  if (classification.interactionType === "deescalate" && next.fearLevel <= 5 && state.reassurance > 0) next.state = "stabilizing";
  next.lastDecision = entry?.decision?.objective ?? next.lastDecision;
  next.currentObjective = next.lastDecision;
  next.lastInteractionType = classification.interactionType;
  next.lastEntryId = entry?.entryId ?? null;
  next.lastActionText = textOf(classification.actionText);
  next.lastUpdatedTurn = Number.isInteger(turnNumber) ? turnNumber : 0;
  return next;
}

export function applyLambertCooperationForAction({ reference, state, actionText = "", sceneId = null, turnNumber = 0, targetNpcId = null } = {}) {
  const pack = currentPack(reference);
  const existing = currentState(state);
  const classification = classifyLambertInteraction({ actionText, targetNpcId, sceneId });
  classification.actionText = textOf(actionText);
  const explicitlyTargeted = targetNpcId === LAMBERT_ID || /Lambert|蘭伯特|領航員|導航員/.test(textOf(actionText));
  if (!pack || !classification.targetNpcId || (!LAMBERT_SCENE_IDS.has(sceneId) && !explicitlyTargeted)) {
    return { state, classification, entry: null, directive: null, changed: false };
  }
  const entry = findEntry(pack, classification, existing);
  if (!entry) return { state, classification, entry: null, directive: null, changed: false };
  const nextState = {
    ...state,
    npcCooperation: {
      ...(state?.npcCooperation ?? {}),
      [LAMBERT_ID]: patchState(existing, classification, entry, turnNumber),
    },
  };
  return { state: nextState, classification, entry, directive: entry, changed: true };
}

function relevantContext(actionText, sceneId) {
  return LAMBERT_SCENE_IDS.has(sceneId) || /Lambert|蘭伯特|領航員|導航員/.test(textOf(actionText));
}

export function buildLambertCooperationPromptBlock(reference, state, { actionText = "", sceneId = null, turnNumber = 0 } = {}) {
  const pack = currentPack(reference);
  if (!pack || !relevantContext(actionText, sceneId)) return "";
  const coop = currentState(state);
  const classification = classifyLambertInteraction({ actionText, sceneId });
  const currentAction = textOf(actionText);
  const hasCurrentDecision = Boolean(currentAction && coop.lastActionText === currentAction && Number.isInteger(turnNumber) && coop.lastUpdatedTurn === turnNumber);
  const selected = hasCurrentDecision && coop.lastEntryId ? pack.entries.find((entry) => entry.entryId === coop.lastEntryId) ?? null : null;
  const lines = [
    "<NPC_Cooperation_Contract npc=\"npc_lambert\">",
    "【Lambert 的 server-authoritative 個體壓力狀態（只供本回合敘事）】",
    "Lambert 是在高壓環境中工作的導航員；她的合作取決於恐慌觸發、資訊負荷、群體安全感與是否有人用清楚低壓的方式陪同。",
    `目前可演出的合作方向：${coop.currentObjective}`,
    `本回合互動類型：${classification.interactionType}`,
    "可將她的自主性表現在回報聲音、要求空間、提供有限導航資訊、接受小型分工或暫停複雜對話；不得把恐慌演成未授權的昏迷、失去行動權或 NPC status effect。",
  ];
  if (selected) {
    lines.push(
      "",
      "【本回合已由 server 選定的 Lambert 外在反應】",
      `反應目的：${selected.decision?.objective ?? "維持有限溝通"}`,
      `允許的外在反應：${(selected.decision?.allowedNpcActions ?? []).slice(0, 8).join("、")}`,
      `可見行動方向：${selected.npcAction?.publicDescription ?? "維持低壓溝通"}`,
      `經審查的演出素材：${selected.runtimeNarration}`,
      `玩家選擇仍然保留：${selected.continuationPrompt}`,
      ...(selected.category === "briefing" ? ["這是生存提問：至少回答一項當前處境的必要事實，並給出一個可執行的低壓下一步；不可只讓 Lambert 重複恐慌。"] : []),
    );
  }
  lines.push(
    "不得自行創造：傷勢、死亡、昏迷、失去行動權、位置改變、門或通路狀態、物品、flags、威脅值、戰鬥結果、導航完成、感染、結局、獎勵或未授權 canonical clue。",
    "玩家仍可拒絕、改道、繼續提問或採取任何合理自由行動；Lambert 的策略只改變她的合作方式與可觀察反應。",
    "</NPC_Cooperation_Contract>",
  );
  return lines.join("\n");
}

export function lambertCooperationProfile() {
  return { ...PROFILE, entries: ENTRIES };
}

export { ENTRIES as lambertCooperationEntries };
