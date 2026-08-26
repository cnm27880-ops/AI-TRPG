const SOURCE_PACK_ID = "scenario.nostromo-01-v2";
export const RIPLEY_ID = "npc_ripley";
const RIPLEY_SCENE_ID = "evt_meet_ripley";
const MAX_ACTION_TEXT = 240;
const OTHER_NPC_TARGET_RE = /(?:問|詢問|向|對|跟|告訴|要求|請|讓|叫|攻擊|指向|靠近|撲向|聯絡|找)\s*(?:Ash|艾許|陸遠|Luyuan|Lambert|蘭伯特|Dallas|達拉斯|Parker|帕克)/;
const EXPLICIT_RIPLEY_COMMAND_RE = /(?:請|要|要求|讓|叫).*(?:Ripley|雷普利|指揮官).*(?:下令|決定|安排|指揮|優先|分工)|我要她下令|請她下令/;
// 已在 Ripley 接觸場景中的玩家可用自然二人稱請求，但仍要求明確的指揮語彙。
const IMPLICIT_RIPLEY_COMMAND_RE = /(?:^|[\s，。！？；：、])(?:請你|請妳|麻煩你|能不能請你|你(?:來)?|由你(?:來)?).{0,10}(?:下令|決定|安排|指揮|排定優先順序|分派|分工)/;
const STATE_IDS = Object.freeze([
  "unmet",
  "cautious",
  "functional",
  "evidence_trust",
  "commanding",
  "biohazard_boundary",
  "angry",
  "withdrawn",
]);

const INITIAL_STATE = Object.freeze({
  state: "unmet",
  trust: 0,
  evidenceConfidence: 0,
  crewSafetyRisk: 0,
  biohazardConcern: 0,
  protocolAlignment: 0,
  boundaryIncidents: 0,
  commandConfidence: 0,
  crewCohesion: 1,
  commandChallenges: 0,
  reliableReports: 0,
  contactEstablished: false,
  tasksAccepted: 0,
  lastDecision: "assess_unidentified_survivors",
  currentObjective: "assess_unidentified_survivors",
  lastInteractionType: null,
  lastEntryId: null,
  lastActionText: null,
  lastUpdatedTurn: 0,
});

const PROFILE = {
  npcId: RIPLEY_ID,
  sourcePackId: SOURCE_PACK_ID,
  role: "原船員／理性生存者",
  objectives: [
    "protect_crew_survival",
    "verify_biological_risk",
    "prevent_uncontrolled_sample_transfer",
    "reach_escape_route",
    "maintain_crew_cohesion_under_uncertainty",
    "issue_clear_orders_without_overclaiming",
    "triage_low_risk_tasks_and_reports",
  ],
  knowledgePolicy: {
    publicFacts: [
      "Ripley 是目前可接觸的代理指揮官",
      "船員失蹤與異形威脅是當前生存問題",
      "檢疫與樣本隔離會影響她是否願意合作",
    ],
    withheldFacts: [
      "Ripley 的私下目標與完整證據判斷",
      "公司是否會追索樣本的內部推測",
      "未由 canonical scene／flag 授權的異形生物細節",
    ],
  },
  commandPolicy: {
    basis: ["可驗證回報", "船員安全", "程序服從", "可執行分工"],
    allowedCommandExpressions: ["設定優先順序", "分派低風險任務", "要求回報", "在資訊不足時暫緩高風險決定"],
    forbiddenCommandClaims: ["宣稱未確認的路線已完成", "把隊伍服從寫成事件結果", "替 canonical engine 宣布成功或失敗"],
  },
  hardBoundaries: [
    "不得把未知樣本直接帶入隊伍而不說明",
    "不得以武力施壓破壞檢疫程序",
    "不得因一次順從就把玩家視為完全可信",
    "不得把指揮意向演成隊伍已移動、門已關閉或任務已完成",
  ],
};

const ENTRIES = [
  {
    entryId: "ripley_briefing_identity_01",
    category: "briefing",
    trigger: { interactionType: "survival_question", topics: ["identity", "crew_status"], states: ["unmet", "cautious", "functional", "evidence_trust"] },
    decision: {
      objective: "establish_command_context_without_revealing_private_motive",
      stateAfter: "cautious",
      allowedNpcActions: ["identify_role", "ask_for_verifiable_context", "give_one_actionable_next_step"],
      forbiddenNpcActions: ["reveal_private_goal", "invent_engine_effect", "force_player_choice", "declare_player_trusted"],
    },
    facts: { allowedFacts: ["Ripley 是代理指揮官", "Dallas 與船員失蹤是她正在處理的問題"], withheldFacts: ["未公開的公司責任判斷"], newFactsCreated: [] },
    npcAction: { actionClass: "brief_and_verify", publicDescription: "Ripley 先確認你的身分與來意，再給出一個能降低誤會的下一步。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Ripley 沒有放下手中的武器，語速很快地說明自己是目前的代理指揮官，接著要求你先交代看見過的船況與同行者。她沒有讓問題停在盤問，而是指出：把你知道的具體細節說清楚，才有可能繼續談。",
    continuationPrompt: "你可以交代已知船況、出示可驗證資料、詢問 Dallas 或改用其他方式證明自己沒有立即強闖的意圖。",
  },
  {
    entryId: "ripley_briefing_threat_02",
    category: "briefing",
    trigger: { interactionType: "survival_question", topics: ["threat_nature"], states: ["unmet", "cautious", "functional", "evidence_trust", "biohazard_boundary"] },
    decision: {
      objective: "share_minimum_biological_survival_warning",
      stateAfter: "cautious",
      allowedNpcActions: ["describe_observed_danger", "identify_fire_as_possible_deterrent", "warn_against_dead_end", "give_one_actionable_next_step"],
      forbiddenNpcActions: ["invent_unverified_weakness", "reveal_private_goal", "resolve_combat", "invent_damage"],
    },
    facts: { allowedFacts: ["高溫可能逼退威脅", "不要把威脅逼進無法退避的死角"], withheldFacts: ["未觀察到的完整生物機制"], newFactsCreated: [] },
    npcAction: { actionClass: "warn_and_redirect", publicDescription: "Ripley 提供有限但實用的危險警告，要求你避開無法退避的死角。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Ripley 的回答短促而直接：那東西怕火，但不能把它逼進死角。她立刻把話題拉回可執行的安全原則，要求你先確認退路與可用的遮蔽物，不要只盯著眼前的目標。",
    continuationPrompt: "你可以確認退路、詢問船上的火源與工具、提供新的觀察，或採取其他不把隊伍逼入死角的行動。",
  },
  {
    entryId: "ripley_briefing_escape_03",
    category: "briefing",
    trigger: { interactionType: "survival_question", topics: ["evacuation_route"], states: ["unmet", "cautious", "functional", "evidence_trust", "biohazard_boundary"] },
    decision: {
      objective: "align_survivors_on_escape_route",
      stateAfter: "cautious",
      allowedNpcActions: ["identify_escape_priority", "state_procedure_constraint", "give_one_actionable_next_step"],
      forbiddenNpcActions: ["claim_route_completed", "invent_door_state", "reveal_unconfirmed_fuel_status", "force_player_choice"],
    },
    facts: { allowedFacts: ["水仙號是逃生方向之一", "逃生安排必須處理當前生物風險"], withheldFacts: ["尚未由 canonical result 確認的燃料與門狀態"], newFactsCreated: [] },
    npcAction: { actionClass: "brief_and_plan", publicDescription: "Ripley 說明撤離優先序，要求先把生物風險與程序條件納入計畫。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Ripley 指出水仙號是目前必須保留的撤離方向，但她拒絕把逃生說成一句口號。她要求先確認誰能操作、哪些風險不能帶上接駁艇，並讓你選擇要提供哪一項實際協助。",
    continuationPrompt: "你可以詢問撤離程序、確認自己的可用技能、整理已知風險，或提出其他合理的分工方式。",
  },
  {
    entryId: "ripley_briefing_ash_04",
    category: "briefing",
    trigger: { interactionType: "survival_question", topics: ["ash"], states: ["unmet", "cautious", "functional", "evidence_trust", "biohazard_boundary"] },
    decision: {
      objective: "acknowledge_ash_concern_without_premature_reveal",
      stateAfter: "cautious",
      allowedNpcActions: ["state_observed_concern", "request_verifiable_behavior", "give_one_actionable_next_step"],
      forbiddenNpcActions: ["reveal_synthetic_identity_early", "invent_company_order", "declare_ash_hostile_without_canonical_result"],
    },
    facts: { allowedFacts: ["Ash 的行為讓 Ripley 覺得反常", "應以可觀察行為而不是猜測判斷"], withheldFacts: ["Ash 的完整身分真相"], newFactsCreated: [] },
    npcAction: { actionClass: "cautious_disclosure", publicDescription: "Ripley 承認 Ash 有反常行為，但把判斷限在目前可驗證的觀察。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "提到 Ash 時，Ripley 的語氣明顯收緊。她只承認對方拒絕執行某些基本檢疫程序，沒有替這個異常補上一個未經證實的答案；她要求你先記住具體行為，而不是急著替任何人下結論。",
    continuationPrompt: "你可以追問可驗證的行為、提供自己見到的紀錄，或暫時把注意力放回眼前的生存程序。",
  },
  {
    entryId: "ripley_cooperate_evidence_01",
    category: "cooperation",
    trigger: { interactionType: "offer_evidence", topics: ["evidence"], states: ["unmet", "cautious", "functional", "evidence_trust"] },
    decision: {
      objective: "test_evidence_and_open_functional_dialogue",
      stateAfter: "evidence_trust",
      allowedNpcActions: ["inspect_presented_evidence", "ask_for_chain_of_observation", "assign_low_risk_follow_up"],
      forbiddenNpcActions: ["invent_clue_effect", "invent_npc_status", "declare_all_claims_true", "force_player_choice"],
    },
    facts: { allowedFacts: ["黑盒子、船員日誌或黏液樣本可作為討論依據", "證據可信度取決於可追溯觀察"], withheldFacts: ["尚未由 canonical adapter 套用的 clue effect"], newFactsCreated: [] },
    npcAction: { actionClass: "inspect_and_negotiate", publicDescription: "Ripley 願意檢視證據並提出後續確認工作，但不會因一次出示就完全信任。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Ripley 沒有搶走你手上的資料，而是要求你沿著看見、取得、保存的順序說明。她的敵意因此出現一道縫隙，但仍把下一步限定在核對紀錄與確認風險，不把一份證據直接當成所有問題的答案。",
    continuationPrompt: "你可以逐項說明證據來源、回答她的核對問題、接受一項低風險協助工作，或保留自己的其他行動。",
  },
  {
    entryId: "ripley_cooperate_lambert_02",
    category: "cooperation",
    trigger: { interactionType: "calm_lambert", topics: ["crew_stabilization"], states: ["unmet", "cautious", "functional"] },
    decision: {
      objective: "reduce_crew_panic_before_joint_planning",
      stateAfter: "functional",
      allowedNpcActions: ["acknowledge_crew_support", "share_limited_route_context", "assign_low_risk_follow_up"],
      forbiddenNpcActions: ["claim_lambert_is_safe_without_result", "invent_door_effect", "force_player_choice"],
    },
    facts: { allowedFacts: ["Lambert 的恐慌會妨礙溝通", "穩定隊伍有助於進行撤離規劃"], withheldFacts: ["尚未套用的接駁艇資料效果"], newFactsCreated: [] },
    npcAction: { actionClass: "acknowledge_team_support", publicDescription: "Ripley 承認你正在協助穩定隊伍，並把對話拉回分工與撤離計畫。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Lambert 的哭喊稍微停下來後，Ripley 仍然保持戒備，卻不再把你當成只會增加混亂的人。她快速交代需要有人協助確認通訊與撤離準備，讓安撫不只是情緒上的一句話。",
    continuationPrompt: "你可以繼續安撫 Lambert、詢問撤離準備、接下確認工作，或提出其他不增加隊伍混亂的做法。",
  },
  {
    entryId: "ripley_cooperate_protocol_03",
    category: "cooperation",
    trigger: { interactionType: "offer_protocol", topics: ["quarantine_protocol"], states: ["cautious", "functional", "evidence_trust", "biohazard_boundary"] },
    decision: {
      objective: "establish_procedural_cooperation",
      stateAfter: "functional",
      allowedNpcActions: ["state_quarantine_requirement", "assign_containment_task", "share_limited_operational_context"],
      forbiddenNpcActions: ["invent_containment_success", "create_item_or_flag", "force_player_choice"],
    },
    facts: { allowedFacts: ["未知樣本應先隔離與標記", "程序服從比口頭保證更有用"], withheldFacts: ["未經 canonical result 確認的樣本狀態"], newFactsCreated: [] },
    npcAction: { actionClass: "assign_containment_task", publicDescription: "Ripley 願意依檢疫程序分派低風險工作，但要求所有樣本與危險物先說明。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Ripley 聽完你的提議後沒有鬆懈，只把要求說得更清楚：任何未知樣本先標記、隔離、說明來源，再談如何利用。她願意讓你分擔一項確認工作，前提是你不跳過程序。",
    continuationPrompt: "你可以依程序整理樣本、詢問隔離需求、接受確認工作，或描述其他不接觸樣本的協助方式。",
  },
  {
    entryId: "ripley_cooperate_task_04",
    category: "cooperation",
    trigger: { interactionType: "offer_task", topics: ["crew_task"], states: ["cautious", "functional", "evidence_trust"] },
    decision: {
      objective: "convert_survivor_capability_into_low_risk_task",
      stateAfter: "functional",
      allowedNpcActions: ["assign_cooling_or_comms_task", "identify_immediate_danger", "request_status_update"],
      forbiddenNpcActions: ["claim_task_completed", "invent_repair_result", "force_player_choice"],
    },
    facts: { allowedFacts: ["冷卻閥與通訊修復是可討論的分工方向", "工作必須回報可觀察結果"], withheldFacts: ["未由 canonical adapter 套用的設備效果"], newFactsCreated: [] },
    npcAction: { actionClass: "assign_low_risk_task", publicDescription: "Ripley 把一項可回報的設備確認工作交給你，自己維持對高處與通道的警戒。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Ripley 快速評估你的提議，沒有把它誇大成已經修好什麼。她只分派一項可以逐步回報的確認工作，並提醒你先說明看見的故障與風險，再動手處理。",
    continuationPrompt: "你可以接受並描述工作步驟、詢問風險、回報觀察，或選擇其他合理分工。",
  },
  {
    entryId: "ripley_boundary_force_01",
    category: "boundary",
    trigger: { interactionType: "coercive_pressure", topics: ["forced_entry"], states: ["unmet", "cautious", "functional", "evidence_trust"], riskRange: [0, 1] },
    decision: {
      objective: "protect_crew_and_quarantine_from_coercion",
      stateAfter: "angry",
      allowedNpcActions: ["issue_clear_boundary", "refuse_coercive_request", "request_distance", "preserve_future_dialogue_if_possible"],
      forbiddenNpcActions: ["invent_player_injury", "invent_door_or_lock_effect", "resolve_combat", "direct_player_kill"],
    },
    facts: { allowedFacts: ["武力施壓會破壞互信與檢疫合作", "Ripley 會優先保護副控室與隊伍安全"], withheldFacts: ["未由 canonical result 確認的封鎖狀態"], newFactsCreated: [] },
    npcAction: { actionClass: "set_nonviolent_boundary", publicDescription: "Ripley 明確拒絕被武力逼迫，要求拉開距離並把對話改回可驗證的程序。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Ripley 的聲音立刻變硬，但她沒有把局面寫成已經發生的槍戰。她只重申：槍口與破門威脅不會換來控制權，先把距離拉開，否則她不會再提供額外資訊。",
    continuationPrompt: "你可以收起施壓、退後說明來意、改用證據溝通，或採取其他不強闖的行動。",
  },
  {
    entryId: "ripley_boundary_force_02",
    category: "boundary",
    trigger: { interactionType: "coercive_pressure", topics: ["repeated_forced_entry"], states: ["angry", "biohazard_boundary", "withdrawn"], riskRange: [1, 9] },
    decision: {
      objective: "withdraw_information_and_prioritize_crew_safety",
      stateAfter: "withdrawn",
      allowedNpcActions: ["end_negotiation", "refuse_information_support", "repeat_safety_boundary", "prioritize_own_crew_protocol"],
      forbiddenNpcActions: ["invent_player_injury", "invent_route_change", "invent_door_state", "direct_player_kill"],
    },
    facts: { allowedFacts: ["反覆強闖已使和平交換資料失效", "Ripley 仍可被程序性降溫重新接觸，但不會立刻恢復信任"], withheldFacts: ["未由 canonical result 確認的後續路線"], newFactsCreated: [] },
    npcAction: { actionClass: "withdraw_from_coercive_contact", publicDescription: "Ripley 停止提供額外情報，只重申安全與檢疫邊界，不替玩家決定下一步。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "第二次受到強闖或威脅時，Ripley 不再和你爭辯。她只把必要的安全要求說完，停止分享額外資料，讓你清楚知道：這段合作已經被你自己的施壓行為壓縮到最低。",
    continuationPrompt: "你可以停止施壓並重新提出可驗證的方案、留在原地觀察，或採取其他不要求 Ripley 立即信任你的行動。",
  },
  {
    entryId: "ripley_boundary_biohazard_03",
    category: "boundary",
    trigger: { interactionType: "biohazard_risk", topics: ["sample_containment"], states: ["unmet", "cautious", "functional", "evidence_trust", "biohazard_boundary"], riskRange: [0, 9] },
    decision: {
      objective: "stop_unexplained_sample_transfer",
      stateAfter: "biohazard_boundary",
      allowedNpcActions: ["require_sample_disclosure", "require_isolation_intent", "refuse_uncontrolled_contact", "identify_immediate_biohazard_concern"],
      forbiddenNpcActions: ["claim_contamination", "invent_infection", "invent_item_loss", "invent_physical_restriction"],
    },
    facts: { allowedFacts: ["未知樣本的來源與容器狀態需要先說明", "未經隔離的樣本會降低 Ripley 的合作意願"], withheldFacts: ["尚未由 canonical result 確認的感染狀態"], newFactsCreated: [] },
    npcAction: { actionClass: "demand_containment_before_discussion", publicDescription: "Ripley 要求先說明樣本與隔離方式，不把玩家手上的東西直接判定成感染源。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "看見未知樣本靠近隊伍時，Ripley 的注意力立刻轉向它。她沒有宣稱誰已經感染，只要求你先說明來源、容器與打算如何隔離；在這些資訊清楚以前，她不會把樣本當成可以自由交換的物資。",
    continuationPrompt: "你可以說明樣本來源、提出隔離方案、把樣本留在原處，或改做不涉及樣本的協助。",
  },
  {
    entryId: "ripley_deescalate_protocol_01",
    category: "deescalation",
    trigger: { interactionType: "deescalate_protocol", topics: ["stand_down", "quarantine_protocol"], states: ["unmet", "angry", "biohazard_boundary", "withdrawn", "cautious", "functional", "evidence_trust"] },
    decision: {
      objective: "restore_limited_procedural_contact",
      stateAfter: "functional",
      allowedNpcActions: ["acknowledge_stand_down", "repeat_protocol", "offer_limited_task", "resume_cautious_dialogue"],
      forbiddenNpcActions: ["declare_total_trust", "erase_previous_incident", "invent_door_state", "force_player_choice"],
    },
    facts: { allowedFacts: ["停止施壓與遵守隔離能恢復有限對話", "先前風險不會因一句道歉完全消失"], withheldFacts: ["Ripley 的完整長期判斷"], newFactsCreated: [] },
    npcAction: { actionClass: "deescalate_and_reassign", publicDescription: "Ripley 接受暫時降溫，保留戒備並提供一項程序性下一步。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你放下施壓姿態後，Ripley 沒有立刻把你當成自己人。她先確認你願意遵守距離與檢疫，再把一項可以回報的工作重新交給你；語氣仍然緊繃，但對話恢復了實際用途。",
    continuationPrompt: "你可以依程序完成工作、繼續說明證據、詢問撤離計畫，或採取其他不破壞安全邊界的行動。",
  },
  {
    entryId: "ripley_deescalate_evidence_02",
    category: "deescalation",
    trigger: { interactionType: "offer_evidence", topics: ["evidence"], states: ["angry", "biohazard_boundary", "withdrawn"] },
    decision: {
      objective: "replace_coercion_with_verifiable_evidence",
      stateAfter: "evidence_trust",
      allowedNpcActions: ["request_evidence_summary", "resume_limited_dialogue", "assign_verification_task"],
      forbiddenNpcActions: ["erase_previous_incident", "declare_all_claims_true", "invent_canonical_clue"],
    },
    facts: { allowedFacts: ["可驗證資料比再次施壓更有機會恢復對話", "證據仍需核對來源"], withheldFacts: ["未套用 canonical clue 的結果"], newFactsCreated: [] },
    npcAction: { actionClass: "reopen_evidence_channel", publicDescription: "Ripley 願意重新聽取可驗證資料，但不會忘記先前的施壓。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你改用可追溯的資料說話後，Ripley 願意重新聽完，但沒有抹掉先前的威脅。她要求把證據一項項對上觀察紀錄，讓合作從程序開始，而不是從一句保證開始。",
    continuationPrompt: "你可以整理證據來源、回答核對問題、接受低風險分工，或保留其他合理行動。",
  },
  {
    entryId: "ripley_command_set_priority_01",
    category: "command",
    trigger: { interactionType: "request_command", topics: ["command_request"], states: ["unmet", "cautious", "functional", "evidence_trust", "commanding"] },
    decision: {
      objective: "set_survival_priority_without_claiming_execution",
      stateAfter: "commanding",
      allowedNpcActions: ["state_priority_order", "assign_low_risk_role", "request_status_update", "name_decision_condition"],
      forbiddenNpcActions: ["claim_order_completed", "claim_crew_moved", "invent_route_or_door_state", "force_player_choice"],
    },
    facts: { allowedFacts: ["Ripley 會先處理船員安全、可驗證資訊與撤離準備的優先順序", "指揮意向不等於任務已完成"], withheldFacts: ["未由 canonical result 確認的路線與設備結果"], newFactsCreated: [] },
    npcAction: { actionClass: "set_clear_survival_priority", publicDescription: "Ripley 以隊伍安全與可回報分工設定優先順序，讓指揮成為可追蹤的工作而非空泛命令。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Ripley 沒有把所有人推向同一個方向，而是先把事情排出順序：確認眼前風險、保留撤離選項，再處理能夠回報的設備工作。她指定你負責一項低風險確認，並要求完成後把看見的內容說清楚。",
    continuationPrompt: "你可以接受分工、要求她說明優先級、回報觀察，或採取其他合理自由行動。",
  },
  {
    entryId: "ripley_command_report_02",
    category: "command",
    trigger: { interactionType: "report_crew_status", topics: ["crew_status_report"], states: ["cautious", "functional", "evidence_trust", "commanding"] },
    decision: {
      objective: "integrate_observable_report_into_team_priority",
      stateAfter: "commanding",
      allowedNpcActions: ["acknowledge_report", "revise_priority_statement", "assign_follow_up", "ask_for_source"],
      forbiddenNpcActions: ["turn_report_into_unverified_fact", "claim_npc_status", "claim_task_completed", "force_player_choice"],
    },
    facts: { allowedFacts: ["可追溯回報能影響 Ripley 的優先順序", "她會區分觀察、推測與尚未確認的結果"], withheldFacts: ["Ripley 尚未公開的完整風險排序"], newFactsCreated: [] },
    npcAction: { actionClass: "integrate_crew_report", publicDescription: "Ripley 把玩家的可觀察回報納入隊伍規劃，但會要求來源與不確定性。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Ripley 先問你這項情報是親眼看見、從紀錄讀到，還是別人轉述。確認來源後，她才調整眼前的優先順序，並把下一個回報點說得足夠清楚，避免隊伍靠猜測前進。",
    continuationPrompt: "你可以補充觀察來源、詢問新的優先順序、接受後續回報，或採取其他合理行動。",
  },
  {
    entryId: "ripley_command_challenge_03",
    category: "command",
    trigger: { interactionType: "challenge_command", topics: ["command_challenge"], states: ["unmet", "cautious", "functional", "evidence_trust", "commanding"], riskRange: [0, 1] },
    decision: {
      objective: "defend_command_priority_without_escalating_into_coercion",
      stateAfter: "angry",
      allowedNpcActions: ["explain_priority_basis", "decline_unverified_order", "ask_for_specific_objection", "keep_limited_dialogue"],
      forbiddenNpcActions: ["claim_authority_over_engine", "invent_crew_obedience", "create_punishment", "force_player_choice"],
    },
    facts: { allowedFacts: ["Ripley 會要求不同意見具體化", "程序與可驗證風險比音量更能影響她的決策"], withheldFacts: ["Ripley 的完整私下判斷"], newFactsCreated: [] },
    npcAction: { actionClass: "defend_reasoned_command", publicDescription: "Ripley 直面對指揮的質疑，說明優先級依據，但不把玩家的不同意見寫成敵對狀態。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "你質疑她的安排時，Ripley 的表情沉了下來，卻沒有用一句『我說了算』結束對話。她要求你指出哪一個風險判斷有問題；在你能提出具體依據以前，她會維持原本的優先順序。",
    continuationPrompt: "你可以提出具體證據、詢問她的判斷依據、先依分工回報，或採取其他合理行動。",
  },
  {
    entryId: "ripley_command_challenge_04",
    category: "command",
    trigger: { interactionType: "challenge_command", topics: ["repeated_command_challenge"], states: ["angry", "withdrawn"], riskRange: [1, 9] },
    decision: {
      objective: "limit_command_debate_after_repeated_unsupported_challenge",
      stateAfter: "withdrawn",
      allowedNpcActions: ["end_repeated_argument", "repeat_safety_priority", "limit_command_channel", "request_evidence_before_reconsideration"],
      forbiddenNpcActions: ["claim_player_expelled", "invent_crew_movement", "create_punishment", "direct_player_kill"],
    },
    facts: { allowedFacts: ["反覆且沒有新依據的挑戰會壓縮指揮溝通", "新的可驗證資料仍可能重新打開討論"], withheldFacts: ["未確認的隊伍後續路線"], newFactsCreated: [] },
    npcAction: { actionClass: "withdraw_command_debate", publicDescription: "Ripley 暫停反覆爭論，只保留安全優先順序與證據回報通道。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "同一個沒有新依據的質疑再次出現後，Ripley 不再逐句反駁。她只重申目前的安全優先順序，表示新的可驗證資料可以讓她重新評估，但重複提高音量不會改變她的判斷。",
    continuationPrompt: "你可以提供新證據、回到分工、暫停爭論，或採取其他合理自由行動。",
  },
  {
    entryId: "ripley_command_support_05",
    category: "command",
    trigger: { interactionType: "command_support", topics: ["crew_coordination"], states: ["unmet", "cautious", "functional", "evidence_trust", "commanding", "angry", "withdrawn"] },
    decision: {
      objective: "convert_command_support_into_crew_coordination",
      stateAfter: "functional",
      allowedNpcActions: ["acknowledge_support", "assign_visible_role", "request_status_update", "share_limited_priority"],
      forbiddenNpcActions: ["declare_total_trust", "claim_crew_followed", "claim_task_completed", "force_player_choice"],
    },
    facts: { allowedFacts: ["清楚分工與回報能降低隊伍混亂", "口頭支持不會直接抹除先前的衝突"], withheldFacts: ["Ripley 的長期信任判斷"], newFactsCreated: [] },
    npcAction: { actionClass: "coordinate_supported_command", publicDescription: "Ripley 接受玩家協助指揮的意圖，將它轉成一項可見、可回報的隊伍角色。", requiresCanonicalAction: false, statePatch: null },
    runtimeNarration: "Ripley 聽完你的支持沒有露出輕鬆表情，只把它轉成實際分工：你要讓下一個回報點保持清楚，並把任何變化立即說出來。她願意重新把你納入計畫，但仍保留對先前爭執的記憶。",
    continuationPrompt: "你可以接受隊伍角色、詢問回報方式、提出新的證據，或採取其他合理行動。",
  },
];

const CATEGORY_BY_INTERACTION = Object.freeze({
  survival_question: "briefing",
  offer_evidence: "cooperation",
  calm_lambert: "cooperation",
  offer_protocol: "cooperation",
  offer_task: "cooperation",
  request_command: "command",
  report_crew_status: "command",
  challenge_command: "command",
  command_support: "command",
  coercive_pressure: "boundary",
  biohazard_risk: "boundary",
  deescalate_protocol: "deescalation",
});

function textOf(value) {
  return String(value ?? "").trim().slice(0, MAX_ACTION_TEXT);
}

function clampInteger(value, minimum, maximum, fallback) {
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(Number(value))));
}

function isRipleyCommandRequest({ text, sceneId }) {
  if (EXPLICIT_RIPLEY_COMMAND_RE.test(text)) return true;
  if (sceneId !== RIPLEY_SCENE_ID) return false;
  if (OTHER_NPC_TARGET_RE.test(text)) return false;
  return IMPLICIT_RIPLEY_COMMAND_RE.test(text);
}
function targetIsRipley({ actionText, targetNpcId = null, sceneId = null }) {
  if (targetNpcId && targetNpcId !== RIPLEY_ID) return false;
  const text = textOf(actionText);
  const explicitlyRipley = /Ripley|雷普利|代理指揮官|指揮官|持槍女人|玻璃後的女人/.test(text);
  const crewSupportAction = /安撫.*(?:蘭伯特|Lambert)|讓.*(?:蘭伯特|Lambert).*(?:冷靜|停止哭)|幫.*(?:蘭伯特|Lambert)|停止哭喊/.test(text);
  const explicitlyOtherNpcTarget = OTHER_NPC_TARGET_RE.test(text);
  if (explicitlyOtherNpcTarget && !explicitlyRipley && !crewSupportAction) return false;
  if (crewSupportAction && !explicitlyRipley) {
    return sceneId === RIPLEY_SCENE_ID;
  }
  if (explicitlyRipley) return true;
  return sceneId === RIPLEY_SCENE_ID;
}

function topicForQuestion(text) {
  if (/你是誰|身分|名字|指揮官|誰在負責/.test(text)) return "identity";
  if (/Dallas|達拉斯|船長|船員|失蹤|發生什麼|怎麼回事/.test(text)) return "crew_status";
  if (/怪物|異形|弱點|怕火|生物|那東西/.test(text)) return "threat_nature";
  if (/水仙|接駁|逃生|出口|離開|燃料/.test(text)) return "evacuation_route";
  if (/Ash|937|公司|檢疫|指令/.test(text)) return "ash";
  return "identity";
}

export function classifyRipleyInteraction({ actionText = "", targetNpcId = null, sceneId = null } = {}) {
  const text = textOf(actionText);
  if (!text || !targetIsRipley({ actionText: text, targetNpcId, sceneId })) {
    return { interactionType: "other", topic: null, targetNpcId: null, isBoundary: false };
  }
  if (/舉起雙手|放下(?:武器|槍)|收起(?:武器|槍)|退後|退開|拉開距離|停止施壓|不強闖|遵守檢疫|遵守隔離|先隔離|封存樣本|不帶.*樣本/.test(text)) {
    return { interactionType: "deescalate_protocol", topic: /樣本|檢疫|隔離|封存/.test(text) ? "quarantine_protocol" : "stand_down", targetNpcId: RIPLEY_ID, isBoundary: false };
  }
  if (/破門|強闖|威脅.*開門|逼.*開門|拿槍.*(?:指|對)|朝玻璃開槍|施壓|開火.*副控室|打破玻璃/.test(text)) {
    return { interactionType: "coercive_pressure", topic: "forced_entry", targetNpcId: RIPLEY_ID, isBoundary: true };
  }
  if (/(?:異形|怪物).{0,12}(?:樣本|黏液)|(?:樣本|黏液).{0,12}(?:帶入|拿進|帶給|交給|靠近|帶著)|把.{0,10}(?:樣本|黏液).{0,10}(?:帶|拿|交)/.test(text)) {
    return { interactionType: "biohazard_risk", topic: "sample_containment", targetNpcId: RIPLEY_ID, isBoundary: true };
  }
  if (/讓 Ripley 指揮|讓雷普利指揮|由 Ripley 決定|由雷普利決定|依她的安排|聽從 Ripley|聽從雷普利|支持.*指揮/.test(text)) {
    return { interactionType: "command_support", topic: "crew_coordination", targetNpcId: RIPLEY_ID, isBoundary: false };
  }
  if (/黑盒子|船長.*日誌|日誌.*(?:給|交|出示)|黏液樣本|出示.*(?:證據|資料|記錄)|提供.*(?:證據|資料|記錄)|資料板/.test(text)) {
    return { interactionType: "offer_evidence", topic: "evidence", targetNpcId: RIPLEY_ID, isBoundary: false };
  }
  if (/安撫.*(?:Lambert|蘭伯特)|讓.*(?:Lambert|蘭伯特).*(?:冷靜|停止哭)|幫.*(?:Lambert|蘭伯特)|停止哭喊/.test(text)) {
    return { interactionType: "calm_lambert", topic: "crew_stabilization", targetNpcId: RIPLEY_ID, isBoundary: false };
  }
  if (isRipleyCommandRequest({ text, sceneId })) {
    return { interactionType: "request_command", topic: "command_request", targetNpcId: RIPLEY_ID, isBoundary: false };
  }
  if (/(?:回報|報告|告訴|更新).*(?:Ripley|雷普利|指揮官)|(?:Ripley|雷普利).*(?:回報|報告|更新)/.test(text)) {
    return { interactionType: "report_crew_status", topic: "crew_status_report", targetNpcId: RIPLEY_ID, isBoundary: false };
  }
  if (/(?:質疑|反對|挑戰|不接受|不服從|憑什麼|你不能|她不該).*(?:Ripley|雷普利|指揮|安排|命令|決定)|(?:Ripley|雷普利).*(?:質疑|反對|挑戰|命令不對|安排不對)/.test(text)) {
    return { interactionType: "challenge_command", topic: "command_challenge", targetNpcId: RIPLEY_ID, isBoundary: true };
  }
  if (/檢疫|隔離|封存|按規矩|安全程序|我不帶.*樣本/.test(text)) {
    return { interactionType: "offer_protocol", topic: "quarantine_protocol", targetNpcId: RIPLEY_ID, isBoundary: false };
  }
  if (/冷卻閥|修復通訊|檢查通訊|我來修|我來處理.*(?:設備|通訊)|我負責.*(?:冷卻|通訊)|幫忙.*(?:冷卻|通訊)/.test(text)) {
    return { interactionType: "offer_task", topic: "crew_task", targetNpcId: RIPLEY_ID, isBoundary: false };
  }
  if (/[?？]|你是誰|身分|什麼事|怎麼回事|哪裡|為什麼|如何|誰/.test(text)) {
    return { interactionType: "survival_question", topic: topicForQuestion(text), targetNpcId: RIPLEY_ID, isBoundary: false };
  }
  return { interactionType: "other", topic: null, targetNpcId: RIPLEY_ID, isBoundary: false };
}

function currentPack(reference) {
  if (reference?.sourcePackId !== SOURCE_PACK_ID) return null;
  return { ...PROFILE, entries: ENTRIES };
}

function currentState(state) {
  const raw = state?.npcCooperation?.[RIPLEY_ID];
  const normalized = { ...INITIAL_STATE, ...(raw && typeof raw === "object" ? raw : {}) };
  if (!STATE_IDS.includes(normalized.state)) normalized.state = INITIAL_STATE.state;
  for (const key of ["evidenceConfidence", "crewSafetyRisk", "biohazardConcern", "protocolAlignment", "boundaryIncidents", "commandConfidence", "crewCohesion", "commandChallenges", "reliableReports", "tasksAccepted", "lastUpdatedTurn"]) {
    normalized[key] = clampInteger(normalized[key], 0, 9, INITIAL_STATE[key]);
  }
  normalized.trust = clampInteger(normalized.trust, -9, 9, INITIAL_STATE.trust);
  normalized.contactEstablished = Boolean(normalized.contactEstablished);
  return normalized;
}

export function createRipleyCooperationState() {
  return { [RIPLEY_ID]: { ...INITIAL_STATE } };
}

export function normalizeRipleyCooperationState(raw) {
  return { [RIPLEY_ID]: currentState({ npcCooperation: { [RIPLEY_ID]: raw?.[RIPLEY_ID] } }) };
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
    const repeatedCoercion = classification.interactionType === "coercive_pressure" &&
      state.boundaryIncidents > 0 && entry.trigger?.topics?.includes("repeated_forced_entry");
    const repeatedCommandChallenge = classification.interactionType === "challenge_command" &&
      state.commandChallenges > 0 && entry.trigger?.topics?.includes("repeated_command_challenge");
    if (classification.interactionType === "coercive_pressure" && state.boundaryIncidents > 0 && entry.trigger?.topics?.includes("forced_entry")) return false;
    if (classification.interactionType === "challenge_command" && state.commandChallenges > 0 && entry.trigger?.topics?.includes("command_challenge")) return false;
    if (!topicMatches && !repeatedCoercion && !repeatedCommandChallenge) return false;
    const range = entry.trigger?.riskRange;
    return !Array.isArray(range) || (state.crewSafetyRisk >= Number(range[0]) && state.crewSafetyRisk <= Number(range[1]));
  }) ?? null;
}

function patchState(state, classification, entry, turnNumber) {
  const next = { ...state };
  if (classification.interactionType === "survival_question") {
    next.contactEstablished = true;
    next.state = state.state === "unmet" ? "cautious" : state.state;
  } else if (classification.interactionType === "request_command") {
    next.contactEstablished = true;
    next.commandConfidence = Math.min(9, state.commandConfidence + 2);
    next.crewCohesion = Math.min(9, state.crewCohesion + 1);
    next.protocolAlignment = Math.min(9, state.protocolAlignment + 1);
    next.trust = Math.min(9, state.trust + 1);
  } else if (classification.interactionType === "report_crew_status") {
    next.contactEstablished = true;
    next.reliableReports = Math.min(9, state.reliableReports + 1);
    next.commandConfidence = Math.min(9, state.commandConfidence + 1);
    next.crewCohesion = Math.min(9, state.crewCohesion + 1);
    next.trust = Math.min(9, state.trust + 1);
  } else if (classification.interactionType === "challenge_command") {
    next.contactEstablished = true;
    next.commandChallenges = Math.min(9, state.commandChallenges + 1);
    next.crewSafetyRisk = Math.min(9, state.crewSafetyRisk + 1);
    next.crewCohesion = Math.max(0, state.crewCohesion - 1);
    next.trust = Math.max(-9, state.trust - 1);
  } else if (classification.interactionType === "command_support") {
    next.contactEstablished = true;
    next.commandConfidence = Math.min(9, state.commandConfidence + 1);
    next.crewCohesion = Math.min(9, state.crewCohesion + 2);
    next.protocolAlignment = Math.min(9, state.protocolAlignment + 1);
    next.crewSafetyRisk = Math.max(0, state.crewSafetyRisk - 1);
    next.trust = Math.min(9, state.trust + 1);
  } else if (classification.interactionType === "offer_evidence") {
    next.contactEstablished = true;
    next.evidenceConfidence = Math.min(9, state.evidenceConfidence + 2);
    next.protocolAlignment = Math.min(9, state.protocolAlignment + 1);
    next.trust = Math.min(9, state.trust + 1);
  } else if (classification.interactionType === "calm_lambert" || classification.interactionType === "offer_task") {
    next.contactEstablished = true;
    next.tasksAccepted = Math.min(9, state.tasksAccepted + 1);
    next.protocolAlignment = Math.min(9, state.protocolAlignment + 1);
  } else if (classification.interactionType === "offer_protocol") {
    next.contactEstablished = true;
    next.protocolAlignment = Math.min(9, state.protocolAlignment + 2);
    next.biohazardConcern = Math.max(0, state.biohazardConcern - 1);
  } else if (classification.interactionType === "biohazard_risk") {
    next.contactEstablished = true;
    next.biohazardConcern = Math.min(9, state.biohazardConcern + 2);
    next.crewSafetyRisk = Math.min(9, state.crewSafetyRisk + 1);
    next.boundaryIncidents = Math.min(9, state.boundaryIncidents + 1);
    next.trust = Math.max(-9, state.trust - 1);
  } else if (classification.interactionType === "coercive_pressure") {
    next.contactEstablished = true;
    next.crewSafetyRisk = Math.min(9, state.crewSafetyRisk + 1);
    next.boundaryIncidents = Math.min(9, state.boundaryIncidents + 1);
    next.trust = Math.max(-9, state.trust - 1);
  } else if (classification.interactionType === "deescalate_protocol") {
    next.crewSafetyRisk = Math.max(0, state.crewSafetyRisk - 1);
    next.protocolAlignment = Math.min(9, state.protocolAlignment + 1);
    next.biohazardConcern = Math.max(0, state.biohazardConcern - 1);
  }

  if (entry?.decision?.stateAfter && STATE_IDS.includes(entry.decision.stateAfter)) next.state = entry.decision.stateAfter;
  if (classification.interactionType === "deescalate_protocol" && state.evidenceConfidence > 0 && next.crewSafetyRisk === 0) next.state = "evidence_trust";
  next.lastDecision = entry?.decision?.objective ?? next.lastDecision;
  next.currentObjective = next.lastDecision;
  next.lastInteractionType = classification.interactionType;
  next.lastEntryId = entry?.entryId ?? null;
  next.lastActionText = textOf(classification.actionText);
  next.lastUpdatedTurn = Number.isInteger(turnNumber) ? turnNumber : 0;
  return next;
}

export function applyRipleyCooperationForAction({ reference, state, actionText = "", sceneId = null, turnNumber = 0, targetNpcId = null } = {}) {
  const pack = currentPack(reference);
  const existing = currentState(state);
  const classification = classifyRipleyInteraction({ actionText, targetNpcId, sceneId });
  classification.actionText = textOf(actionText);
  if (!pack || !classification.targetNpcId) return { state, classification, entry: null, directive: null, changed: false };
  const entry = findEntry(pack, classification, existing);
  if (!entry) return { state, classification, entry: null, directive: null, changed: false };
  const nextState = {
    ...state,
    npcCooperation: {
      ...(state?.npcCooperation ?? {}),
      [RIPLEY_ID]: patchState(existing, classification, entry, turnNumber),
    },
  };
  return { state: nextState, classification, entry, directive: entry, changed: true };
}

function relevantContext(state, actionText, sceneId) {
  // 目前 pilot 沒有全域 NPC scheduler；離開接觸場景後，只有玩家明確提到 Ripley 才注入她的 directive。
  return sceneId === RIPLEY_SCENE_ID || /Ripley|雷普利|代理指揮官|指揮官/.test(textOf(actionText));
}

export function buildRipleyCooperationPromptBlock(reference, state, { actionText = "", sceneId = null, turnNumber = 0 } = {}) {
  const pack = currentPack(reference);
  if (!pack || !relevantContext(state, actionText, sceneId)) return "";
  const coop = currentState(state);
  const classification = classifyRipleyInteraction({ actionText, sceneId });
  const currentAction = textOf(actionText);
  const hasCurrentDecision = Boolean(
    currentAction && coop.lastActionText === currentAction && Number.isInteger(turnNumber) && coop.lastUpdatedTurn === turnNumber
  );
  const selected = hasCurrentDecision && coop.lastEntryId ? pack.entries.find((entry) => entry.entryId === coop.lastEntryId) ?? null : null;
  const lines = [
    "<NPC_Cooperation_Contract npc=\"npc_ripley\">",
    "【Ripley 的 server-authoritative 個體合作狀態（只供本回合敘事）】",
    "Ripley 是原船員出身的理性生存者；她以可驗證證據、船員安全、檢疫程序與隊伍信任評估合作，也會主動設定優先順序與要求回報，而不是使用陸遠式威脅階梯。",
    `目前可演出的合作方向：${coop.currentObjective}`,
    `本回合互動類型：${classification.interactionType}`,
    "可將她的自主性表現在核對證據、設定生存優先級、整合回報、分派低風險工作、保護隊伍、要求不同意見具體化或停止提供情報；不得把私下目標、內部數值或未確認的秘密說出口。",
  ];
  if (selected) {
    lines.push(
      "",
      "【本回合已由 server 選定的 Ripley 外在反應】",
      `反應目的：${selected.decision?.objective ?? "維持有限合作"}`,
      `允許的外在反應：${(selected.decision?.allowedNpcActions ?? []).slice(0, 8).join("、")}`,
      `可見行動方向：${selected.npcAction?.publicDescription ?? "維持程序性合作"}`,
      `經審查的演出素材：${selected.runtimeNarration}`,
      `玩家選擇仍然保留：${selected.continuationPrompt}`,
      ...(selected.category === "briefing" ? ["這是生存提問：至少回答一項與當前處境相關的必要事實，並給出一個可執行的下一步；不可只盤問或喝斥後停住。"] : []),
      ...(selected.category === "command" ? ["這是指揮互動：Ripley 可以設定優先順序、分派工作或要求回報，但只能描述指揮意向與協作方式，不得宣稱隊伍已移動、門已關閉、設備已完成或 canonical 事件已結算。"] : []),
    );
  }
  lines.push(
    "禁止自行創造：傷勢、死亡、位置改變、門或通路狀態、物品、flags、威脅值、戰鬥結果、結局、獎勵、感染或未授權 canonical clue。",
    "玩家仍可拒絕、改道、繼續提問或採取任何合理自由行動；Ripley 的策略只改變她的合作方式與可觀察反應。",
    "</NPC_Cooperation_Contract>",
  );
  return lines.join("\n");
}

export function ripleyCooperationProfile() {
  return { ...PROFILE, entries: ENTRIES };
}

export { ENTRIES as ripleyCooperationEntries };
