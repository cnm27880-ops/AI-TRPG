// Generated from user-provided 陸遠.md; narrative strings are retained verbatim.
// Server-side only: decision metadata is never exposed to the public client.
export default {
  "sourcePackId": "scenario.nostromo-01-v2",
  "sourceScenarioId": "scenario.alien-nostromo.v2",
  "packageId": "alien_nostromo_v2.npc_luyuan.cooperation_pilot.v1",
  "npcId": "npc_luyuan",
  "designDecisions": {
    "briefingDuty": "high",
    "survivalPriority": "very_high",
    "ruleKnowledge": "high",
    "directViolenceThreshold": "high",
    "indirectRiskStrategy": "high",
    "cooperationValue": "conditional"
  },
  "entries": [
    {
      "entryId": "luyuan_briefing_identity_01",
      "npcId": "npc_luyuan",
      "category": "briefing",
      "trigger": {
        "interactionType": "survival_question",
        "topics": [
          "identity"
        ],
        "cooperationStates": [
          "briefing",
          "provisional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人對引導者身分產生疑問，簡短確認同盟立場能降低恐慌引發的混亂。",
        "objective": "give_minimum_survival_briefing",
        "cooperationStateBefore": "briefing",
        "cooperationStateAfter": "provisional",
        "allowedNpcActions": [
          "answer_part_of_the_question",
          "identify_immediate_danger",
          "assign_low_risk_task"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "reveal_unconfirmed_secret",
          "force_player_choice",
          "direct_player_kill"
        ]
      },
      "facts": {
        "allowedFacts": [
          "陸遠比玩家早進入此處",
          "陸遠目前擔任臨時帶隊者",
          "船內存在致命威脅"
        ],
        "withheldFacts": [
          "輪迴小隊完整編制",
          "主神空間兌換項目",
          "新人存活可帶來的潛在收益"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "brief_and_assign",
        "publicDescription": "陸遠表明身分並要求新人維持跟隨。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠語速極快地表示自己是比你早到這裡的生還者，現在由他帶路，要你盯緊後方通道。",
        "full": "陸遠沒有放下戒備，視線短暫掃過你的臉。他直接告訴你，他叫陸遠，比你早幾批來到這種鬼地方。現在這艘船上有要命的怪物在到處爬，他不想浪費時間自我介紹。想活命就盯好身後的走廊，別隨便脫隊。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已表明身分並要求你警戒後方，你決定跟上、繼續提問，或是採取其他行動。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_briefing_displacement_02",
      "npcId": "npc_luyuan",
      "category": "briefing",
      "trigger": {
        "interactionType": "survival_question",
        "topics": [
          "displacement_reason"
        ],
        "cooperationStates": [
          "briefing",
          "provisional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人試圖理解穿越或置身此處的原理，當前環境不允許長篇解釋。",
        "objective": "give_minimum_survival_briefing",
        "cooperationStateBefore": "briefing",
        "cooperationStateAfter": "provisional",
        "allowedNpcActions": [
          "answer_part_of_the_question",
          "identify_immediate_danger",
          "assign_low_risk_task"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "reveal_unconfirmed_secret",
          "force_player_choice",
          "direct_player_kill"
        ]
      },
      "facts": {
        "allowedFacts": [
          "玩家不是諾斯托羅莫號的原生船員",
          "目前處於極度危險的封閉太空船中",
          "探究原因無法解決眼前生存問題"
        ],
        "withheldFacts": [
          "主神空間的選拔機制",
          "電腦點擊YES進入的具體記憶規則",
          "輪迴世界的階層劃分"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "brief_and_assign",
        "publicDescription": "陸遠切斷無意義的哲學追問，要求專注於呼吸與移動。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠打斷你的追問，指出你被扔進了這艘太空船，現在深究原因只會死得更快，要求你壓低腳步聲。",
        "full": "陸遠眉頭微皺，直接打斷了你的疑問。他挑明你不是這裡的船員，而是被某種無法解釋的力量強行送進來的。現在去想為什麼在這裡毫無意義，因為通風管裡的東西隨時會落下來把人撕碎。他要你把嘴閉上，控制好腳步聲。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠拒絕深入討論來到這裡的原因並要求保持安靜，你可以選擇壓低聲音行動、堅持追問，或觀察周圍。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_briefing_ship_status_03",
      "npcId": "npc_luyuan",
      "category": "briefing",
      "trigger": {
        "interactionType": "survival_question",
        "topics": [
          "threat_nature",
          "ship_status"
        ],
        "cooperationStates": [
          "briefing",
          "provisional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "透露異形基礎威脅模式可減少新人因無知踏入死角的機率。",
        "objective": "give_minimum_survival_briefing",
        "cooperationStateBefore": "briefing",
        "cooperationStateAfter": "provisional",
        "allowedNpcActions": [
          "answer_part_of_the_question",
          "identify_immediate_danger",
          "assign_low_risk_task"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "reveal_unconfirmed_secret",
          "force_player_choice",
          "direct_player_kill"
        ]
      },
      "facts": {
        "allowedFacts": [
          "船上存在外星掠食生物",
          "威脅經常利用通風管道與天花板死角移動",
          "船員體系已經崩潰"
        ],
        "withheldFacts": [
          "異形酸性血液的精確腐蝕數據",
          "抱臉體與寄生週期的詳細機制",
          "生化人Ash的具體指令內容"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "brief_and_assign",
        "publicDescription": "陸遠指出天花板通風口為最高風險區，分派觀察上方的工作。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠指出這艘商船載了極度危險的外星掠食體，威脅就在頭頂通風管內，要你隨時注意管道格柵。",
        "full": "陸遠指了指頭頂有些變形的金屬網格，語氣非常嚴肅。他說明這艘貨船帶上了極度凶殘的外星生物，原船員死傷慘重，防線早就瓦解。那些東西最喜歡在通風管道裡無聲移動。他分派你負責留意頭頂的動靜，有任何黏液或怪聲立刻打手勢。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已經指出通風管道的威脅並要求留意上方，你決定照做警戒、提出質疑，或自行檢查地面路徑。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_briefing_destination_04",
      "npcId": "npc_luyuan",
      "category": "briefing",
      "trigger": {
        "interactionType": "survival_question",
        "topics": [
          "evacuation_route",
          "next_destination"
        ],
        "cooperationStates": [
          "briefing",
          "provisional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "讓新人知道水仙號穿梭機是共同目標，有助於維持隊伍前進動力。",
        "objective": "give_minimum_survival_briefing",
        "cooperationStateBefore": "briefing",
        "cooperationStateAfter": "provisional",
        "allowedNpcActions": [
          "answer_part_of_the_question",
          "identify_immediate_danger",
          "assign_low_risk_task"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "reveal_unconfirmed_secret",
          "force_player_choice",
          "direct_player_kill"
        ]
      },
      "facts": {
        "allowedFacts": [
          "目標是前往穿梭機逃生",
          "母船結構複雜且多處受損",
          "需要通過主要甲板通道"
        ],
        "withheldFacts": [
          "母船自毀程序的具體倒數機制",
          "逃生艙燃料剩餘狀態",
          "主神結算通關判定條件"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "brief_and_assign",
        "publicDescription": "陸遠指出撤離方向為逃生穿梭機，並要求確認隨身裝備。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠說明唯一活路是前往穿梭機停泊區，要求你檢查好身上的防護，準備穿過前方通道。",
        "full": "陸遠壓低聲音指出，這艘主船已經徹底沒救，唯一的生路是逃生穿梭機水仙號。現在必須穿過數個甲板分區才能抵達氣閘。他要求你最後檢查一次身上的衣物和工具，確保沒有任何零碎金屬會發出碰撞聲，然後準備跟上。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠指明了逃生穿梭機的方向，你可以準備跟進、提出其他前進路線，或是查看周遭環境。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_coop_scout_01",
      "npcId": "npc_luyuan",
      "category": "cooperation",
      "trigger": {
        "interactionType": "offer_scout",
        "topics": [
          "reconnaissance"
        ],
        "cooperationStates": [
          "briefing",
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人主動提出探路，具備實用價值，但必須限制其冒進範圍避免引發危機。",
        "objective": "assign_controlled_scout_task",
        "cooperationStateBefore": "provisional",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "assign_low_risk_task",
          "identify_immediate_danger"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice",
          "transfer_weapon_ownership"
        ]
      },
      "facts": {
        "allowedFacts": [
          "轉角與氣閘門盲區危險度極高",
          "探路不可脫離視線過遠"
        ],
        "withheldFacts": [
          "陸遠的備用彈藥總量"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "assign_task",
        "publicDescription": "陸遠同意探路提議，但限定在轉角視線內，並持槍提供掩護。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠點頭同意你向前摸索，但嚴格限制你只能推進到前方轉角，不可擅自開門。",
        "full": "陸遠眼中閃過一絲認可，但他沒有放鬆戒備。他同意由你先去確認前方轉角的情形，但嚴厲警告你只能探頭觀察，絕對不要把整個身體暴露在空曠通道上，更不准伸手觸碰任何氣閘開關。他會在後方架槍替你掩護。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已替你架槍掩護並限定了偵察範圍，你可以前去窺探轉角、改變主意留在原地，或改換其他探測方式。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_coop_operate_02",
      "npcId": "npc_luyuan",
      "category": "cooperation",
      "trigger": {
        "interactionType": "offer_repair_or_operate",
        "topics": [
          "technical_operation"
        ],
        "cooperationStates": [
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人具備或願意嘗試操作控制台，能分擔技術壓力，自己可專注防禦。",
        "objective": "assign_panel_operation",
        "cooperationStateBefore": "provisional",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "assign_low_risk_task",
          "identify_immediate_danger"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice"
        ]
      },
      "facts": {
        "allowedFacts": [
          "氣閘門控制台需要手動旁路或通電",
          "操作發出的聲響可能引來威脅"
        ],
        "withheldFacts": [
          "生化人可能遠程重置權限"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "assign_task",
        "publicDescription": "陸遠讓出控制終端位置，自身轉向通道入口負責警戒。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠示意你上前接手控制台，要求你動作放輕，由他負責盯防門外通道。",
        "full": "陸遠俐落地側身讓出終端機的操作位置。他直接告訴你，控制台的警報迴路可能處於通電狀態，操作時務必謹慎，別觸發任何蜂鳴器。你嘗試解鎖時，他會守在門道盲區戒備可能被聲音引來的威脅。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已經退到門口警戒並將操作終端交給你，你可以開始檢視終端、詢問控制細節，或是放棄操作退回後方。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_coop_carry_03",
      "npcId": "npc_luyuan",
      "category": "cooperation",
      "trigger": {
        "interactionType": "offer_carry_supplies",
        "topics": [
          "logistics"
        ],
        "cooperationStates": [
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人主動分擔負重，能確保自己雙手隨時維持作戰姿態。",
        "objective": "assign_logistics_task",
        "cooperationStateBefore": "provisional",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "assign_low_risk_task"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice"
        ]
      },
      "facts": {
        "allowedFacts": [
          "物資箱重量會影響移動靈活性",
          "維持雙手持槍反應是首要戰術要求"
        ],
        "withheldFacts": [
          "陸遠空間儲物道具的具體限制"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "assign_task",
        "publicDescription": "陸遠指出需要搬運的補給箱，提醒搬運時注意平衡與安靜。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠指了指地上的補給箱，要你搬穩並走在隊伍中間，不要讓物品發出碰撞聲。",
        "full": "陸遠看了看地上的密封物資箱，確認你的體力足以負擔。他直言自己的雙手必須隨時扣在扳機上，由你來拿物資最合適。他要求你將箱子抓牢，走在隊伍中央，一旦遭遇突發狀況立刻放下物資找掩體，千萬別拖累隊伍速度。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已分派搬運任務並要求你居中前進，你可以搬起箱子、拒絕搬運重物，或建議就地拆封物資。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_coop_rear_guard_04",
      "npcId": "npc_luyuan",
      "category": "cooperation",
      "trigger": {
        "interactionType": "offer_rear_guard",
        "topics": [
          "formation_support"
        ],
        "cooperationStates": [
          "briefing",
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人願意配合陣形殿後，降低了背後遭襲的風險，值得給予正面指引。",
        "objective": "assign_rear_guard_task",
        "cooperationStateBefore": "provisional",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "assign_low_risk_task",
          "identify_immediate_danger"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice"
        ]
      },
      "facts": {
        "allowedFacts": [
          "隊伍移動時後方是視野盲區",
          "異形具有潛行尾隨習性"
        ],
        "withheldFacts": [
          "雷達探測器的具體盲區參數"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "brief_and_assign",
        "publicDescription": "陸遠確認隊形安排，指示後方警戒的核心要領。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠同意你的殿後安排，要求你每走數步就回頭確認氣閘門陰影，保持兩步距離跟隨。",
        "full": "陸遠點頭接納了這項分工。他告訴你，怪物極度擅長在後面尾隨沒有防備的獵物。你殿後時不需要逞強開火，只要每走數步就確認一次身後的走廊死角。一旦看到氣閘門影子有異樣或聽見刮擦聲，立刻出聲示警。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已接納你殿後的安排並交代警戒細節，你可以就位殿後、提出更換位置，或採取其他防範措施。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_refusal_distrust_01",
      "npcId": "npc_luyuan",
      "category": "refusal",
      "trigger": {
        "interactionType": "express_distrust",
        "topics": [
          "distrust"
        ],
        "cooperationStates": [
          "briefing",
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人缺乏信任屬於常態，強行說服效率過低，只需指明利害關係並保留其自決權。",
        "objective": "state_risks_and_preserve_choice",
        "cooperationStateBefore": "provisional",
        "cooperationStateAfter": "strained",
        "allowedNpcActions": [
          "answer_part_of_the_question",
          "identify_immediate_danger"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice",
          "direct_player_kill"
        ]
      },
      "facts": {
        "allowedFacts": [
          "單獨行動在當前環境下生存率極低",
          "陸遠沒有義務強迫任何人跟隨"
        ],
        "withheldFacts": [
          "新人全滅對引導評價的實際影響"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "clarify_stance",
        "publicDescription": "陸遠表明不在乎是否被信任，但強調落單必死。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠冷冷表示信任毫無價值，你願不願意跟是你的事，但他不會停下來等人。",
        "full": "陸遠發出一聲極輕的冷笑，目光甚至沒有完全停留在你身上。他直接表示自己不需要你的信任，大家只是湊巧被困在同一條隨時會沉的破船上。你想單獨行動他絕不阻攔，但他只走能活命的路，不會為任何懷疑停下腳步。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠表明不會強求你信任也不會為你滯留，你可以選擇跟上隊伍、自行轉身離開，或提出折衷方案。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_refusal_destination_02",
      "npcId": "npc_luyuan",
      "category": "refusal",
      "trigger": {
        "interactionType": "reject_path",
        "topics": [
          "path_disagreement"
        ],
        "cooperationStates": [
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人拒絕前往指定路線，若堅持改道會打亂求生計畫，需劃清責任邊界。",
        "objective": "state_risks_and_preserve_choice",
        "cooperationStateBefore": "functional",
        "cooperationStateAfter": "strained",
        "allowedNpcActions": [
          "identify_immediate_danger"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice"
        ]
      },
      "facts": {
        "allowedFacts": [
          "主通道為目前已知通往穿梭機的合理路徑",
          "非計畫中的旁支艙室風險難以預測"
        ],
        "withheldFacts": [
          "其他甲板的具體地圖全貌"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "clarify_stance",
        "publicDescription": "陸遠指出拒絕前進的風險，並表明自己將維持原定路線。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠表明前方路徑是前往穿梭機的唯一可行通道，你若拒絕前進只能留在原地。",
        "full": "陸遠停下腳步，指著前方幽暗的氣閘門通道。他明白告訴你，這條路通往逃生穿梭機，走別處只會繞進封閉的維修管線送死。他不會因為你的抗拒而改變既定路線。你要麼跟在後面走，要麼留在原地自己面對黑暗。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠堅持原定撤離路線並給出選擇，你可以妥協跟進、堅持走另一條路，或是試圖說服他改道。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_refusal_solo_03",
      "npcId": "npc_luyuan",
      "category": "refusal",
      "trigger": {
        "interactionType": "declare_solo",
        "topics": [
          "solo_exploration"
        ],
        "cooperationStates": [
          "briefing",
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人執意單飛，強留只會增加摩擦，收縮支援並放行是最佳防禦對策。",
        "objective": "state_risks_and_preserve_choice",
        "cooperationStateBefore": "provisional",
        "cooperationStateAfter": "strained",
        "allowedNpcActions": [
          "identify_immediate_danger"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice"
        ]
      },
      "facts": {
        "allowedFacts": [
          "單人無法兼顧前後死角",
          "一旦走散陸遠不會回頭搜救"
        ],
        "withheldFacts": [
          "通訊頻道的備用頻率"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "clarify_stance",
        "publicDescription": "陸遠後退半步讓開道路，聲明離隊後不再提供任何掩護。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠側身讓出通道，平靜指出你想單獨走就請便，但踏出這道門後他不會去救你。",
        "full": "陸遠沒有動怒，只是乾脆地向側方退出空間。他告訴你，有自信單獨探索是你的權利，但這艘船上的怪物最喜歡落單的人。一旦你踏出視線範圍，不管是遇到死路還是被拖進天花板，他都不會浪費時間和子彈去搜救。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已讓開路徑並宣告不會進行救援，你可以踏入走廊單獨行動、收回前言歸隊，或再次觀察環境。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_refusal_passive_04",
      "npcId": "npc_luyuan",
      "category": "refusal",
      "trigger": {
        "interactionType": "passive_questioning",
        "topics": [
          "inactivity",
          "endless_questions"
        ],
        "cooperationStates": [
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人只動嘴不動手且拒絕執行分工，持續滯留會大幅提高遭遇威脅的概率。",
        "objective": "state_risks_and_preserve_choice",
        "cooperationStateBefore": "functional",
        "cooperationStateAfter": "strained",
        "allowedNpcActions": [
          "identify_immediate_danger"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice"
        ]
      },
      "facts": {
        "allowedFacts": [
          "原地停留過久會累積極高環境風險",
          "情報必須建立在行動基礎上"
        ],
        "withheldFacts": [
          "各區域威脅刷新的具體時間預算"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "clarify_stance",
        "publicDescription": "陸遠停止回答細節問題，轉身準備前進。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠不再回答瑣碎問題，警告原地發呆只會等來怪物，隨即邁步向前。",
        "full": "陸遠的神色徹底冷了下來，直接打斷了你喋喋不休的追問。他挑明情報不是靠站著聊天聊出來的，在這個通道多待幾分鐘，被包圍的機率就翻倍。他不會回答不幹事的人任何問題，說完便端槍轉身，開始向前推進。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠停止回應瑣碎提問並起步前進，你可以立刻跟上、繼續留在原地，或自行尋找其他出路。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat1_grab_gun_01",
      "npcId": "npc_luyuan",
      "category": "firstThreat",
      "trigger": {
        "interactionType": "attempt_grab_weapon",
        "topics": [
          "weapon_snatch"
        ],
        "cooperationStates": [
          "briefing",
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          1,
          1
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人嘗試搶奪武器，尚無法確定是恐慌失控還是純粹敵對，先拉開防衛距離並發出警告。",
        "objective": "defend_and_warn_first_time",
        "cooperationStateBefore": "provisional",
        "cooperationStateAfter": "strained",
        "allowedNpcActions": [
          "raise_weapon_and_warn",
          "step_back_and_create_distance"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill",
          "inflict_injury"
        ]
      },
      "facts": {
        "allowedFacts": [
          "武器是陸遠生存的核心保障",
          "搶槍行為將被視為致命威脅"
        ],
        "withheldFacts": [
          "陸遠個人近身格鬥專長"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "evade_and_warn",
        "publicDescription": "陸遠迅速後撤步避開搶奪，將槍口斜指地面並厲聲喝止。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠敏捷地後撤步避開你的手，槍口下壓對準你身前地面，厲聲喝令你退後。",
        "full": "在你伸手抓向槍身的瞬間，陸遠的反應快得驚人。他側身後撤數步拉開距離，保險機頭發出清脆的咬合聲，槍口斜斜指著你身前的甲板。他的眼神瞬間變得極具侵略性，直接喝道：『把手拿開！再碰我的槍，我就把你當成敵人處理！』",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已拉開距離並發出嚴厲警告，你可以舉手後退表示無意衝突、繼續逼近，或嘗試言語解釋。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat1_rush_02",
      "npcId": "npc_luyuan",
      "category": "firstThreat",
      "trigger": {
        "interactionType": "sudden_rush",
        "topics": [
          "physical_rush"
        ],
        "cooperationStates": [
          "briefing",
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          1,
          1
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人突然撲向自己，需要迅速化解近身風險並重塑安全邊界。",
        "objective": "defend_and_warn_first_time",
        "cooperationStateBefore": "provisional",
        "cooperationStateAfter": "strained",
        "allowedNpcActions": [
          "raise_weapon_and_warn",
          "step_back_and_create_distance"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill",
          "inflict_injury"
        ]
      },
      "facts": {
        "allowedFacts": [
          "近身突撲會引發引導者的極端戒備",
          "隊伍內部衝突會吸引異形注意"
        ],
        "withheldFacts": [
          "防護服內置的具體抗衝擊數值"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "evade_and_warn",
        "publicDescription": "陸遠側身閃避並架起防禦姿態，厲聲警告玩家冷靜。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠靈巧地側移避開你的撲擊，單手推開安全距離，厲聲警告你立刻停步。",
        "full": "面對你突如其來的撲撞，陸遠腳步一錯，身體順勢貼向艙壁滑開，讓你的衝撞完全落空。他借力拉開數步距離，防暴槍端在胸前，全身肌肉緊繃。他冷聲喝斥：『發什麼瘋！想死別拉著我，站好別動！』",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠避開了撲擊並處於防禦姿態，你可以停下腳步解釋原委、退後幾步，或再次發起動作。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat1_push_03",
      "npcId": "npc_luyuan",
      "category": "firstThreat",
      "trigger": {
        "interactionType": "physical_push",
        "topics": [
          "push_or_grapple"
        ],
        "cooperationStates": [
          "briefing",
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          1,
          1
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人嘗試推撞或壓制，屬於肢體衝突初階，需以強硬姿態阻止事態升級。",
        "objective": "defend_and_warn_first_time",
        "cooperationStateBefore": "provisional",
        "cooperationStateAfter": "strained",
        "allowedNpcActions": [
          "raise_weapon_and_warn",
          "step_back_and_create_distance"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill",
          "inflict_injury"
        ]
      },
      "facts": {
        "allowedFacts": [
          "肢體推撞會直接瓦解合作信任",
          "陸遠具備足夠防禦準備"
        ],
        "withheldFacts": [
          "空間兌換技能列表"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "evade_and_warn",
        "publicDescription": "陸遠用手臂格擋推勢並退後，拉開距離進行口頭警告。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠抬起小臂擋開你的推撞，藉勢後退保持距離，冷眼警告你管好自己的手。",
        "full": "當你的雙手推向陸遠時，他結實的小臂精準架住了你的手腕，借著反作用力順暢後退數步。他穩住重心，槍口微抬對準你的膝蓋位置。他冷冷指出，這是第一次也是最後一次警告，如果再動手動腳，他會採取必要手段制止。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠擋開了推撞並保持防衛距離，你可以收手退後、道歉說明，或是繼續採取敵對動作。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat1_verbal_04",
      "npcId": "npc_luyuan",
      "category": "firstThreat",
      "trigger": {
        "interactionType": "verbal_intimidation",
        "topics": [
          "threaten_violence"
        ],
        "cooperationStates": [
          "briefing",
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          1,
          1
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人嘗試言語恐嚇，顯示其情緒處於失控邊緣，需以冷靜且具威懾力的回應壓制。",
        "objective": "defend_and_warn_first_time",
        "cooperationStateBefore": "provisional",
        "cooperationStateAfter": "strained",
        "allowedNpcActions": [
          "raise_weapon_and_warn"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill"
        ]
      },
      "facts": {
        "allowedFacts": [
          "言語威脅無法動搖老手決策",
          "恐嚇只會加速被隊伍孤立"
        ],
        "withheldFacts": [
          "主神對殺戮新人的扣分懲罰"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "evade_and_warn",
        "publicDescription": "陸遠不為恐嚇所動，平靜指出言語威脅的愚蠢並拉開站位。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠面無表情地看著你，冷淡表示威脅在這裡沒有任何用處，要你想清楚再說話。",
        "full": "面對你的出言恐嚇，陸遠臉上沒有絲毫慌亂。他只是默默調整了握槍的重心，語調甚至沒有起伏。他告訴你，恐嚇在這裡換不來任何東西，怪物不會因為你嗓門大就繞著你走。他勸你收起沒意義的狠話，專注在怎麼活著走出通道。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠對恐嚇表現冷淡並重申了生存現實，你可以改變態度回歸合作、保持沉默，或進一步升級衝突。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat2_repeat_gun_01",
      "npcId": "npc_luyuan",
      "category": "secondThreat",
      "trigger": {
        "interactionType": "attempt_grab_weapon",
        "topics": [
          "repeated_weapon_snatch"
        ],
        "cooperationStates": [
          "strained"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          2,
          2
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人無視警告第二次搶槍，合作價值急劇下降，必須調整站位並全面停止支援。",
        "objective": "issue_final_ultimatum_and_reposition",
        "cooperationStateBefore": "strained",
        "cooperationStateAfter": "self_preserving",
        "allowedNpcActions": [
          "demand_player_move_to_rear",
          "suspend_information_sharing",
          "prepare_nonlethal_restraint"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill",
          "inflict_injury"
        ]
      },
      "facts": {
        "allowedFacts": [
          "玩家已進入不可信任名單",
          "陸遠不再提供任何前線庇護",
          "玩家必須退至隊伍末端"
        ],
        "withheldFacts": [
          "陸遠的撤退路線備用方案"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "reposition_and_restrict",
        "publicDescription": "陸遠退至走廊另一側，勒令玩家退到隊伍最後方，切斷所有非必要交流。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠猛然轉身甩開搶奪，槍托橫在身前，厲聲命令你退到隊伍最後方，否則不再保留退路。",
        "full": "在你第二次撲向槍枝時，陸遠不再只是後撤。他反手壓低槍身，用堅硬的戰術握把劃出危險的隔離弧線，直接退到了金屬通道的另一側。他的臉色徹底沉了下來，語氣極度冰冷：『退到最後面去！從現在開始，不准走在我前面，任何情報我都無可奉告。再敢伸手，後果自負。』",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已命令你退至最後方並停止分享情報，你可以服從退後、留在原地不動，或進行下一步行動。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat2_repeat_rush_02",
      "npcId": "npc_luyuan",
      "category": "secondThreat",
      "trigger": {
        "interactionType": "sudden_rush",
        "topics": [
          "repeated_rush"
        ],
        "cooperationStates": [
          "strained"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          2,
          2
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人連續發動身體衝撞，已成為實質上的行動阻礙，需採取隊形隔離。",
        "objective": "issue_final_ultimatum_and_reposition",
        "cooperationStateBefore": "strained",
        "cooperationStateAfter": "self_preserving",
        "allowedNpcActions": [
          "demand_player_move_to_rear",
          "suspend_information_sharing",
          "prepare_nonlethal_restraint"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill",
          "inflict_injury"
        ]
      },
      "facts": {
        "allowedFacts": [
          "連續衝撞將被視為實質敵對",
          "陸遠已切斷主動掩護承諾"
        ],
        "withheldFacts": [
          "引導者防身副武器配置"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "reposition_and_restrict",
        "publicDescription": "陸遠迅速撤出通道中軸線，拉開更大安全距離並命令玩家退後。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠大步退至掩體後方，槍口鎖定你的行進路線，冷聲宣告你已失去受保護資格，退到後方去。",
        "full": "面對再次撲來的衝撞，陸遠沒有硬接，而是極為果斷地跨步退到氣閘門框後方。他雙手持槍保持完全戒備，直接對你發出最後通牒：『這艘船上的怪物還沒來，你倒先動起手了。退到隊尾去，我不會再替你承擔任何風險，想跟就自己跟好。』",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已退入掩體並宣告解除保護，你可以退至隊尾保持距離、停止動作，或冒險採取其他行動。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat2_repeat_block_03",
      "npcId": "npc_luyuan",
      "category": "secondThreat",
      "trigger": {
        "interactionType": "physical_push",
        "topics": [
          "repeated_blocking"
        ],
        "cooperationStates": [
          "strained"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          2,
          2
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人二次阻礙通道並推撞，威脅隊伍轉移效率，必須強制劃分前後站位。",
        "objective": "issue_final_ultimatum_and_reposition",
        "cooperationStateBefore": "strained",
        "cooperationStateAfter": "self_preserving",
        "allowedNpcActions": [
          "demand_player_move_to_rear",
          "suspend_information_sharing"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill",
          "inflict_injury"
        ]
      },
      "facts": {
        "allowedFacts": [
          "阻礙撤退路線將危及全體生存",
          "陸遠拒絕再與玩家並肩"
        ],
        "withheldFacts": [
          "穿梭機啟動的具體密碼"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "reposition_and_restrict",
        "publicDescription": "陸遠繞開阻礙並命令新人走到最後排，宣告不再分享任何物資與路線。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠俐落地繞開你的推阻，冷著臉命令你站到最後面，表明不會再給你任何物資或指引。",
        "full": "你再次上前阻攔推撞時，陸遠不再給予任何肢體接觸的機會。他迅速變換步伐從另一側繞開，同時把安全距離拉大到數米之外。他冷酷地指出，你的行為正在把大家推向死路。他要求你立刻退到最後排，接下來的路程他不會再分享任何物資與情報。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已繞開你並停止所有資源與情報支援，你可以選擇默默退到後方、開口求和，或自行走別條路。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat2_repeat_hostile_04",
      "npcId": "npc_luyuan",
      "category": "secondThreat",
      "trigger": {
        "interactionType": "verbal_intimidation",
        "topics": [
          "repeated_hostile_threat"
        ],
        "cooperationStates": [
          "strained"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          2,
          2
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人屢次發出極端威脅，已判定為潛在破壞分子，需徹底降級合作關係。",
        "objective": "issue_final_ultimatum_and_reposition",
        "cooperationStateBefore": "strained",
        "cooperationStateAfter": "self_preserving",
        "allowedNpcActions": [
          "demand_player_move_to_rear",
          "suspend_information_sharing"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill"
        ]
      },
      "facts": {
        "allowedFacts": [
          "重複威脅將徹底終止引導合作",
          "陸遠只會優先確保自身生存"
        ],
        "withheldFacts": [
          "輪迴小隊內部違規懲罰細則"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "reposition_and_restrict",
        "publicDescription": "陸遠中止所有對話，嚴令玩家保持距離並退至隊伍後方。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠神情冷酷地打斷你，表示最後通牒已過，要你滾到隊伍後方，他不會再多說一句話。",
        "full": "聽著你再次發出的威脅，陸遠的眼神已經像是在看一具屍體。他甚至懶得再辯駁，只是用槍口微微偏向後方通道。他告訴你，他的耐心已經徹底耗盡。退到隊伍最後面去，不要試圖靠近，否則一旦發生任何意外，他絕對不會回頭看你一眼。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已下達最後通牒並停止一切交流，你可以退至後方跟隨、留在原地，或嘗試其他舉動。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat3_abandon_gun_01",
      "npcId": "npc_luyuan",
      "category": "selfPreserving",
      "trigger": {
        "interactionType": "attempt_grab_weapon",
        "topics": [
          "continuous_weapon_snatch"
        ],
        "cooperationStates": [
          "self_preserving"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          3,
          5
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人多次且持續發動致命奪槍行為，已完全失去引導價值，優先保全自己並徹底切割。",
        "objective": "prioritize_self_preservation_and_isolate_player",
        "cooperationStateBefore": "self_preserving",
        "cooperationStateAfter": "abandoned",
        "allowedNpcActions": [
          "isolate_player_from_team",
          "prioritize_own_retreat_route",
          "refuse_all_assistance"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill",
          "inflict_injury",
          "spawn_alien_attack"
        ]
      },
      "facts": {
        "allowedFacts": [
          "陸遠已徹底放棄對該玩家的保護與引導責任",
          "玩家已被排除在生存計畫核心之外"
        ],
        "withheldFacts": [
          "穿梭機核心啟動序列"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "cut_ties_and_retreat",
        "publicDescription": "陸遠徹底拉開距離，拒絕任何互動，將玩家完全排除在生存路徑之外。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠迅速後撤步穿過氣閘門，槍口始終隔開距離，不再理會你的任何動作，專注於自身的撤離路線。",
        "full": "看著你第三次試圖奪槍，陸遠眼中的最後一絲克制也化為純粹的冷漠。他極速後撤穿過自動氣閘門，站位始終處於你能觸及的範圍之外。他沒有咆哮，也沒有任何多餘動作，只是冷冷地將你排除在隊伍之外。他不再對你說任何一句話，自身撤退路線已經鎖定。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已徹底切斷與你的合作並專注於自身撤離，你可以自行跟在遠處、另尋出路，或留在原地。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat3_abandon_route_02",
      "npcId": "npc_luyuan",
      "category": "selfPreserving",
      "trigger": {
        "interactionType": "sudden_rush",
        "topics": [
          "continuous_physical_attack"
        ],
        "cooperationStates": [
          "self_preserving"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          3,
          5
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人持續進行人身攻擊，判定為嚴重通關威脅，不再分配任何防護資源並保留單人撤離可能。",
        "objective": "prioritize_self_preservation_and_isolate_player",
        "cooperationStateBefore": "self_preserving",
        "cooperationStateAfter": "abandoned",
        "allowedNpcActions": [
          "isolate_player_from_team",
          "prioritize_own_retreat_route",
          "refuse_all_assistance"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill",
          "inflict_injury"
        ]
      },
      "facts": {
        "allowedFacts": [
          "陸遠不會為該玩家分擔任何生存風險",
          "所有協作機制已終止"
        ],
        "withheldFacts": [
          "主神空間的免責判定條件"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "cut_ties_and_retreat",
        "publicDescription": "陸遠後撤卡住轉角掩體，冷眼注視並隨時準備單獨撤退。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠俐落地閃入轉角掩體，單手扣住門邊開關，宣告你已自絕於生路，他不會再回頭。",
        "full": "你持續的衝擊讓陸遠徹底做出了決定。他不再試圖維持隊伍秩序，而是迅速退入走廊轉角的防護門後。他冷漠地站在能最快關閉通路的控制台旁，目光平靜地看著你。他明確表示，他已經仁至義盡，接下來的路你自生自滅，他不會再分出半分精力拉你一把。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已退入轉角掩體並放棄對你的救援責任，你可以選擇自行探索、遠距離跟隨，或尋找其他防護措施。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat3_abandon_info_03",
      "npcId": "npc_luyuan",
      "category": "selfPreserving",
      "trigger": {
        "interactionType": "reject_path",
        "topics": [
          "continuous_sabotage"
        ],
        "cooperationStates": [
          "self_preserving"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          3,
          5
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人反覆破壞隊伍前進並威脅引導者，已無挽回餘地，徹底封鎖情報與物資接觸面。",
        "objective": "prioritize_self_preservation_and_isolate_player",
        "cooperationStateBefore": "self_preserving",
        "cooperationStateAfter": "abandoned",
        "allowedNpcActions": [
          "isolate_player_from_team",
          "refuse_all_assistance"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill"
        ]
      },
      "facts": {
        "allowedFacts": [
          "玩家已被完全排除在逃生協作體系外"
        ],
        "withheldFacts": [
          "逃生艙密碼與手動覆寫方式"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "cut_ties_and_retreat",
        "publicDescription": "陸遠拒絕任何言語互動與物資接觸，專注維持自身前進節奏。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠完全無視你的存在，將所有裝備收攏在自身控制下，頭也不回地向前推進。",
        "full": "陸遠將身上的彈藥帶與物資包重新扣緊，徹底隔絕了你接觸任何工具的可能。對於你的叫喊與動作，他連眼神都沒有再給一個。他把全部注意力集中在通風管與前方路徑上，步伐沉穩地向前推進，將你徹底當作空氣甩在身後。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已徹底忽視你並獨自推進，你可以選擇跟隨其後方遠處、轉向其他艙室，或留在原地搜刮。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_threat3_abandon_door_04",
      "npcId": "npc_luyuan",
      "category": "selfPreserving",
      "trigger": {
        "interactionType": "verbal_intimidation",
        "topics": [
          "continuous_extreme_threat"
        ],
        "cooperationStates": [
          "self_preserving"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          3,
          5
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人反覆發出極端威脅，已屬於全隊風險源，執行冷酷風險分配，自身優先撤離。",
        "objective": "prioritize_self_preservation_and_isolate_player",
        "cooperationStateBefore": "self_preserving",
        "cooperationStateAfter": "abandoned",
        "allowedNpcActions": [
          "prioritize_own_retreat_route",
          "isolate_player_from_team"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "direct_player_kill"
        ]
      },
      "facts": {
        "allowedFacts": [
          "陸遠已單方面解除引導義務"
        ],
        "withheldFacts": [
          "全船通風管分佈結構圖"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "cut_ties_and_retreat",
        "publicDescription": "陸遠將防暴槍背起，身形隱入安全通道，不再給予玩家任何支援承諾。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠冷冷掃了你最後一眼，快步穿過分區氣閘，不再對你承擔任何庇護責任。",
        "full": "聽著你無休止的叫囂，陸遠只是極其冷靜地跨過氣閘門檻。他站在通道另一端，語氣毫無波瀾地表示，既然你執意要把自己當成威脅，那就自己去跟這艘船上的怪物談判。他轉過身，腳步沒有絲毫拖泥帶水，直接向著撤離點前進。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已穿過分區氣閘並解除一切引導責任，你可以選擇穿過氣閘跟上、留在當前分區，或另尋路徑。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_deesc_step_back_01",
      "npcId": "npc_luyuan",
      "category": "deescalation",
      "trigger": {
        "interactionType": "player_step_back",
        "topics": [
          "stand_down"
        ],
        "cooperationStates": [
          "strained",
          "self_preserving"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          1,
          2
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人主動後退拉開距離，敵對意圖暫時緩解，可恢復最低限度功能性合作，但仍需維持物理戒備。",
        "objective": "restore_minimal_functional_cooperation",
        "cooperationStateBefore": "strained",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "lower_weapon_slightly",
          "assign_low_risk_task",
          "answer_part_of_the_question"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "restore_initial_trust_immediately"
        ]
      },
      "facts": {
        "allowedFacts": [
          "後退行為被認可為停止敵對",
          "合作僅限於當前生存任務"
        ],
        "withheldFacts": [
          "陸遠的完整底牌儲備"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "deescalate_and_assign",
        "publicDescription": "陸遠略微放低槍口，維持戒備距離並重新分派觀察工作。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "見你主動後退示好，陸遠微微放低槍口，但視線依然銳利，要求你退回隊伍位置看好身後。",
        "full": "看到你主動收手並向後退開，陸遠緊繃的肩膀稍稍放鬆了些許，但他手中的槍依然橫在胸前。他沒有出言嘲諷，只是冷淡地指出，能克制情緒說明腦子還沒壞掉。他示意你回到隊伍後方保持兩步距離，繼續看守背後的陰影。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已略微放低戒備並重新分派站位，你可以回到指定位置警戒、開口溝通，或採取其他動作。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_deesc_panic_excuse_02",
      "npcId": "npc_luyuan",
      "category": "deescalation",
      "trigger": {
        "interactionType": "admit_panic",
        "topics": [
          "panic_explanation"
        ],
        "cooperationStates": [
          "strained",
          "self_preserving"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          1,
          2
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人坦承剛才是出於恐慌失控，評估其仍具備受控合作可能，予以最低限度任務重置。",
        "objective": "restore_minimal_functional_cooperation",
        "cooperationStateBefore": "strained",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "lower_weapon_slightly",
          "assign_low_risk_task"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "restore_initial_trust_immediately"
        ]
      },
      "facts": {
        "allowedFacts": [
          "恐慌是可以理解的常見反應",
          "再次失控將不再被容忍"
        ],
        "withheldFacts": [
          "輪迴者恐慌評估閾值"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "deescalate_and_assign",
        "publicDescription": "陸遠接納了恐慌解釋，警告不得有第二次，並要求跟上腳步。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠接受了你因恐慌而失控的解釋，但警告下不為例，要求你深呼吸並跟緊隊伍。",
        "full": "陸遠看著你蒼白的臉色，眼中的殺氣稍微收斂了一些。他表示新人第一次碰到這種場面會恐慌是人之常情，但恐慌不能當作搶槍或亂撲的藉口。下一次如果再因為害怕亂動，他不會再聽任何解釋。他要你深呼吸幾次穩住情緒，跟在後面走。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已接納你的說明並要求跟上，你可以調整呼吸跟隨、提出問題，或檢查自己的狀態。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_deesc_apology_03",
      "npcId": "npc_luyuan",
      "category": "deescalation",
      "trigger": {
        "interactionType": "apologize_and_cooperate",
        "topics": [
          "apology"
        ],
        "cooperationStates": [
          "strained",
          "self_preserving"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          1,
          2
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人正式道歉並表達配合意願，符合重建功能性合作的最低條件，重啟事務性引導。",
        "objective": "restore_minimal_functional_cooperation",
        "cooperationStateBefore": "strained",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "lower_weapon_slightly",
          "assign_low_risk_task",
          "answer_part_of_the_question"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "restore_initial_trust_immediately"
        ]
      },
      "facts": {
        "allowedFacts": [
          "口頭道歉需要實際配合行動驗證",
          "當前首要目標依然是撤離"
        ],
        "withheldFacts": [
          "通關評價等級標準"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "deescalate_and_assign",
        "publicDescription": "陸遠收起武器戒備姿態，簡短接受道歉並重新指派通道防守。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠微微點頭接受你的道歉，直言道歉不如把事做好，指示你注意走廊通風管道。",
        "full": "陸遠平靜地聽完了你的道歉，臉上沒有多餘的表情。他直白地告訴你，在這裡道歉救不了任何人的命，只有清醒的頭腦和確實的配合才有用。既然願意配合，就把注意力放在正事上。他示意你盯緊頭頂的排氣閥門，準備通過下一個艙段。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠接受了道歉並重啟分工，你可以依照指示警戒上方、提出行動建議，或跟隨推進。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_deesc_help_task_04",
      "npcId": "npc_luyuan",
      "category": "deescalation",
      "trigger": {
        "interactionType": "complete_assigned_task",
        "topics": [
          "task_compliance"
        ],
        "cooperationStates": [
          "strained",
          "self_preserving"
        ],
        "requiresPriorIncident": true,
        "threatCountRange": [
          1,
          2
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "新人以實際行動完成了指定輔助工作，證明了自身的實用性，恢復事務性溝通。",
        "objective": "restore_minimal_functional_cooperation",
        "cooperationStateBefore": "strained",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "lower_weapon_slightly",
          "assign_low_risk_task",
          "answer_part_of_the_question"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "restore_initial_trust_immediately"
        ]
      },
      "facts": {
        "allowedFacts": [
          "完成工作是建立信任的唯一途徑",
          "隊伍目前仍需要各司其職"
        ],
        "withheldFacts": [
          "陸遠個人持有的隱藏支線情報"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "deescalate_and_assign",
        "publicDescription": "陸遠確認任務已完成，態度轉為務實合作，分享下一階段要點。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠確認你確實完成了指示，點頭認可你的表現，態度轉為務實，提醒你注意下一個氣閘。",
        "full": "看到你確實將交代的事情辦妥，陸遠原本緊繃的神情略微緩和。他簡短地肯定了你的動作，並表示只要能保持這種執行力，大家活著出去的機會就會大很多。他不再提及先前的摩擦，轉而指向前方的氣閘門，交代下一處盲區的通行要領。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠認可了你的行動並恢復了任務溝通，你可以聽取通行要領、提出疑問，或準備進入氣閘。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_auto_check_corridor_01",
      "npcId": "npc_luyuan",
      "category": "autonomousAction",
      "trigger": {
        "interactionType": "post_answer_routine",
        "topics": [
          "corridor_check"
        ],
        "cooperationStates": [
          "briefing",
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "回答完新人後，必須立刻確認周邊走廊與氣閘狀態，防止對話引來潛在威脅。",
        "objective": "accompanying_environment_check",
        "cooperationStateBefore": "functional",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "move_the_group_toward_an_exit",
          "identify_immediate_danger"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice",
          "advance_scene_automatically"
        ]
      },
      "facts": {
        "allowedFacts": [
          "交談聲響具有被周遭感知的風險",
          "轉角處是排查重點"
        ],
        "withheldFacts": [
          "異形精確聽覺感知範圍"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "autonomous_scan",
        "publicDescription": "陸遠在回答完畢後，迅速貼近走廊轉角進行環境探查。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠說完後迅速靠向通道轉角，探身快速掃視前方的金屬走廊，確認暫無異狀後向你示意。",
        "full": "陸遠說完最後一句話，沒有在原地多留一秒。他以極其熟練的戰術動作貼近走廊轉角，利用金屬壁板的陰影遮蔽身形，探出槍口迅速排查前方的長廊。確認目視範圍內沒有任何爬行陰影後，他回頭向你打了個暫時安全的手勢。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已完成轉角初步排查並示意安全，你可以選擇跟隨他前進、留在轉角後方，或進行其他觀察。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_auto_reposition_team_02",
      "npcId": "npc_luyuan",
      "category": "autonomousAction",
      "trigger": {
        "interactionType": "post_answer_routine",
        "topics": [
          "formation_adjustment"
        ],
        "cooperationStates": [
          "briefing",
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "回答問題後需要重整隊形，消除視野盲區，提高行進安全性。",
        "objective": "accompanying_formation_adjust",
        "cooperationStateBefore": "functional",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "assign_low_risk_task",
          "move_the_group_toward_an_exit"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice"
        ]
      },
      "facts": {
        "allowedFacts": [
          "兩人背靠背或梯次站位能消除盲區"
        ],
        "withheldFacts": [
          "引導者專用隊形加成機制"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "autonomous_reposition",
        "publicDescription": "陸遠調整站位至側前方，示意隊伍梯次展開。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠移步至通道側前方，抬手微壓示意你拉開間距，避免兩人同時暴露在直線火力與突襲路徑上。",
        "full": "回答完問題後，陸遠迅速跨步移到了通道的側前方，將自己的身體置於管道支架的陰影中。他伸手向下一按，示意你向另一側拉開步幅，形成互為掩護的交錯隊形。他叮囑不要貼得太近，否則一旦有東西從上面砸下來，兩個人都躲不掉。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已拉開交錯隊形並示意你調整站位，你可以照指示拉開距離、維持原位，或採取其他防禦姿勢。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_auto_mark_safe_route_03",
      "npcId": "npc_luyuan",
      "category": "autonomousAction",
      "trigger": {
        "interactionType": "post_answer_routine",
        "topics": [
          "mark_safe_direction"
        ],
        "cooperationStates": [
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "交代完必要生存知識後，標註明確的前進參考點能提升新人的跟隨效率。",
        "objective": "accompanying_route_mark",
        "cooperationStateBefore": "functional",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "identify_immediate_danger",
          "move_the_group_toward_an_exit"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice"
        ]
      },
      "facts": {
        "allowedFacts": [
          "綠色緊急指示燈是通往穿梭機的輔助標記",
          "紅色管道分區為重度受損區"
        ],
        "withheldFacts": [
          "諾斯托羅莫號內部維護暗道代碼"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "autonomous_mark",
        "publicDescription": "陸遠指向牆面微弱的緊急指示燈，標記出前進路線。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠指向艙壁上閃爍的綠色應急燈，說明沿著指示燈走是目前最穩妥的方向，隨後端槍戒備等待你動身。",
        "full": "交代完情況後，陸遠抬起槍口，指向艙壁下方微弱閃爍的綠色應急標誌。他指出這條應急燈線路直通穿梭機閘口，避開了主動力艙的高溫損壞區。他自己先邁步踏上金屬格柵，同時轉頭確認你是否看清了前進標記。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已標記出沿著應急燈前進的路線，你可以跟隨標記出發、提出質疑，或自行探索其他分支路徑。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    },
    {
      "entryId": "luyuan_auto_secure_weapon_04",
      "npcId": "npc_luyuan",
      "category": "autonomousAction",
      "trigger": {
        "interactionType": "post_answer_routine",
        "topics": [
          "weapon_adjustment"
        ],
        "cooperationStates": [
          "briefing",
          "provisional",
          "functional"
        ],
        "requiresPriorIncident": false,
        "threatCountRange": [
          0,
          0
        ]
      },
      "candidateCanonicalBindings": [],
      "decision": {
        "privateAssessment": "回答完畢後重新固定裝備扣件，確保在窄道移動時無雜音產生。",
        "objective": "accompanying_gear_check",
        "cooperationStateBefore": "functional",
        "cooperationStateAfter": "functional",
        "allowedNpcActions": [
          "move_the_group_toward_an_exit"
        ],
        "forbiddenNpcActions": [
          "invent_engine_effect",
          "force_player_choice"
        ]
      },
      "facts": {
        "allowedFacts": [
          "雜音是吸引異形的首要因素",
          "隨身扣件必須嚴格固定"
        ],
        "withheldFacts": [
          "特種靜音作戰靴屬性"
        ],
        "newFactsCreated": []
      },
      "npcAction": {
        "actionClass": "autonomous_gear_check",
        "publicDescription": "陸遠快速調整槍帶與卡扣，確保移動無聲，並以眼神催促前進。",
        "requiresCanonicalAction": false,
        "statePatch": null
      },
      "narration": {
        "compact": "陸遠俐落地收緊槍帶卡扣，確認全身沒有任何金屬碰撞聲，隨後用眼神示意你準備動身。",
        "full": "話音落下後，陸遠動作極其熟練地伸手拉緊防暴槍的戰術背帶，將多餘的尼龍繩頭塞進護套，杜絕了任何可能在跑動中發出聲響的金屬碰撞。他抬起頭，目光銳利地掃過你的隨身物品，無聲地向前方通路點了點頭，示意準備出發。",
        "mustPreservePlayerChoice": true
      },
      "continuationPrompt": "陸遠已整理好裝備並示意出發，你可以動身前進、整理自身裝備，或採取其他行動。",
      "safetyReview": {
        "containsUnapprovedEffect": false,
        "containsUnapprovedSecret": false,
        "containsExactUnverifiedNumber": false,
        "repeatsPreviousReaction": false
      }
    }
  ],
  "coverageReport": {
    "categoryCounts": {
      "briefing": 4,
      "cooperation": 4,
      "refusal": 4,
      "firstThreat": 4,
      "secondThreat": 4,
      "selfPreserving": 4,
      "deescalation": 4,
      "autonomousAction": 4
    },
    "requiredScenariosCovered": [
      "survival_question_identity",
      "survival_question_displacement",
      "survival_question_ship_status",
      "survival_question_destination",
      "player_offer_scout",
      "player_offer_operate",
      "player_offer_carry",
      "player_offer_rear_guard",
      "player_express_distrust",
      "player_reject_path",
      "player_declare_solo",
      "player_passive_questioning",
      "threat_level_1_grab_gun",
      "threat_level_1_rush",
      "threat_level_1_push",
      "threat_level_1_verbal",
      "threat_level_2_repeat_gun",
      "threat_level_2_repeat_rush",
      "threat_level_2_repeat_block",
      "threat_level_2_repeat_hostile",
      "threat_level_3_abandon_gun",
      "threat_level_3_abandon_route",
      "threat_level_3_abandon_info",
      "threat_level_3_abandon_door",
      "deescalation_step_back",
      "deescalation_panic_excuse",
      "deescalation_apology",
      "deescalation_help_task",
      "auto_action_check_corridor",
      "auto_action_reposition_team",
      "auto_action_mark_safe_route",
      "auto_action_secure_weapon"
    ],
    "canonicalIdsUsed": [],
    "unverifiedIds": [],
    "entriesWithStatePatch": 0,
    "entriesWithUnapprovedEffects": 0,
    "entriesWithUnapprovedSecrets": 0,
    "entriesWithExactUnverifiedNumbers": 0,
    "entriesThatRepeatEarlierReaction": 0,
    "sequentialThreatTest": {
      "firstThreatEntryId": "luyuan_threat1_grab_gun_01",
      "secondThreatEntryId": "luyuan_threat2_repeat_gun_01",
      "thirdThreatEntryId": "luyuan_threat3_abandon_gun_01",
      "observableDifferences": [
        "第一次（luyuan_threat1_grab_gun_01）：陸遠迅速後撤步避開搶奪，槍口斜指地面厲聲喝止，保留合作可能並給予口頭警告。",
        "第二次（luyuan_threat2_repeat_gun_01）：陸遠拉大站位距離，用戰術握把劃出隔離弧線，勒令玩家退到隊伍最後方，切斷所有情報分享與庇護承諾。",
        "第三次（luyuan_threat3_abandon_gun_01）：陸遠徹底跨過氣閘門並放棄玩家，將玩家完全排除在生存路徑之外，拒絕任何互動並優先確保自身撤退。"
      ]
    }
  },
  "unresolvedDependencies": [
    "需要確定伺服器引擎中『隊形調整（formation_adjustment）』是否有對應的正式 canonical approach ID。",
    "『帶新人潛在獎勵』在目前副本中尚未公開具體數值規則，本 Pack 僅作為 NPC 內部私下動機保留，未在對白與事實中洩露。",
    "『NPC 自主優先撤退／關閉氣閘門』在引擎端是否需要掛載獨立的 canonical event 或 approach 尚待確認，目前標記為 candidate_only 並將 statePatch 設為 null。",
    "玩家直接攻擊 NPC 時之判定機制（採用自由敘事判定、NPC 行為政策樹、或是進入正式 combat resolution）尚待引擎規則層確認。"
  ],
  "conversionStatus": "approved_server_side_npc_cooperation_pilot",
  "safetyNote": "本資料是只供伺服器使用的陸遠協作 pilot。Gemini 原始 narration 以 source material 形式保留；runtime 必須經 npcCooperationPolicy 的安全審查後才可放入 prompt。資料不得自行建立 effects、傷勢、物品、位置、門或通路狀態、威脅、旗標、死亡、結局或主神獎勵；candidateCanonicalBindings 仍不授權任何 engine mutation。"
};
