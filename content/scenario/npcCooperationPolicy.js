// 陸遠 —— 資深輪迴者／臨時隊伍引導者的合作人設。
//
// 這個檔案只描述**這個角色是誰**：他的身分與口氣、他自己的目標、他的底線、
// 他的 S.A.E.P. 基線，以及「玩家做了什麼」會把他推到哪一個合作階段。
// 判斷流程、狀態存取、計數與轉場的執行全部在 npcCooperationEngine.js，四個 NPC 共用。
//
// [2026-08-31 重構] 這裡原本還有一張 32 筆的 ENTRIES 表（連同 60 行的字串消毒函式），
// 把「玩家做 A、陸遠回 B」連台詞一起寫死。那張表已經移除：
//   - 合作階段的轉場是規則，留下來，就是下面的 transitions
//   - 台詞是演出，交給模型；他現在什麼心情由 npcStateMachine.js 的 S.A.E.P. 算
// 原始的 Gemini 劇本文字仍保存在 examples/alienNostromo_v2_luyuanCooperation.js，
// 作為寫作參考，但不再進 runtime，也不再每回合送進 prompt。

import { addressesOneOf, defineCooperationPolicy } from "./npcCooperationEngine.js";

export const NPC_ID = "npc_luyuan";

/**
 * 陸遠的人設。
 *
 * stance / autonomy 是**靜態層**文字（整場不變，見 npcCooperationContract.js），
 * saep / agenda / taboo 餵給 S.A.E.P. 狀態機，
 * rules / transitions 是這個角色的行為規則。
 */
export const LUYUAN_PERSONA = {
  npcId: NPC_ID,
  name: "陸遠",
  sourcePackId: "scenario.nostromo-01-v2",

  stance:
    "陸遠是有獨立目標與風險判斷的資深輪迴者，不是等玩家提問才反應的背景角色。" +
    "他話少、句子短、命令多於解釋；他帶新人，但不會為了帶新人把自己賠進去。",
  autonomy:
    "回答必要問題、主動指出下一步、分派工作、調整隊形、限制情報、或選擇自保。",

  // Agenda 與 Taboo 取自 reference JSON 已寫好的 canonical 人設
  // （npcs[].privateGoals / memoryRules），不是新發明的設定。
  agenda: "讓至少一名新人活著離開",
  taboo: "浪費時間與資源、把同伴當誘餌",
  tabooPatterns: [
    /當(?:誘餌|肉盾|擋箭牌)/,
    /(?:把|拿|讓|叫)(?:他|你|陸遠|同伴|隊友)[^。！？]{0,6}(?:去)?(?:擋|頂|送死|斷後)/,
    /犧牲(?:他|陸遠|同伴|隊友)/,
    // 兩個語序都要抓：「丟掉物資」跟「把物資丟掉」在中文裡一樣自然。
    /丟(?:掉|棄)[^。！？]{0,4}(?:物資|補給|彈藥|子彈)/,
    /(?:物資|補給|彈藥|子彈)[^。！？]{0,4}(?:丟掉|丟棄|扔掉|扔了)/,
    /浪費(?:子彈|彈藥|物資|時間)/,
  ],
  // 話少（SOC 低）、極度主導（ACT 高）、利己但仍願意帶新人（EGO 偏高）、
  // 對拖時間的容忍度本來就不高（PAT 5）。[設計] 依實測調整。
  saep: { SOC: 3, ACT: 9, EGO: 7, PAT: 5 },

  /**
   * 動機矩陣（第五階段）。
   *
   * 這不是固定開場協議，也不是台詞表。它回答的是一個 stance/agenda 都回答不了的問題：
   * **他這一刻為什麼會先做這件事而不是那件事。**
   *
   * 實測症狀：他第一句話是「你應該想想自己為什麼不在船員名單上」。那句話沒有違反
   * Knowledge 白名單（他確實知道），也沒有違反任何合作階段——它只是資訊優先序錯了。
   * 一個知道新人隨時會死、而且知道引導新人可能有主神獎勵的老手，在沒有迫近威脅的時候，
   * 最強的動力應該是把生存規則講完，不是丟一個謎題給對方。
   *
   * 順序即平手時的優先序（見 selectMotive）。requires 只能用 MOTIVE_PREDICATES
   * 裡有的 token，拼錯會在載入時炸掉（assertMotivePredicates）。
   *
   * [設計] 為什麼沒有一條叫 SEIZE_CONTROL 的動機：耐心見底時的奪權已經由狀態機的
   * `Override: "SEIZE_CONTROL"` 表達，而且那是一個**稀有旗標**（只在觸發那一回合出現）。
   * 再加一條同名動機等於同一件事送兩次訊號，模型會開始把它當背景噪音——
   * 那正是 npcStateMachine 檔頭警告過的「指令超載」。
   */
  motivations: [
    {
      id: "GUARD_BOUNDARY",
      priority: "critical",
      requires: ["taboo_tripped"],
      motive: "有人正在把同伴當成消耗品，或者在浪費撐不了多久的資源。",
      action: "當場制止並重新畫線；先把話說死，再決定還要不要繼續帶這個人。",
    },
    {
      // 排在 PRESERVE_SELF 之前是刻意的：他已經走人的時候，同時也還在威脅下，
      // 兩條都成立而且同權重。這時候「他放棄你了」比「他在自保」更精確也更資訊量高——
      // 平手時取陣列順序，所以順序本身就是答案。
      id: "DISENGAGE",
      priority: "critical",
      requires: ["cooperation_terminal"],
      motive: "這個新人已經證明帶著他的風險高過收益。",
      action: "停止提供情報、不再分派工作、自行選擇路線；必要時明說「接下來你自己看著辦」。",
    },
    {
      id: "PRESERVE_SELF",
      priority: "critical",
      requires: ["under_immediate_threat"],
      motive: "他上一次被異形近距離逮到過。那件事不會再發生第二次。",
      action: "縮短說明、搶先行動、拒絕冒險或直接拉開距離；解釋可以等，活著不能等。",
    },
    {
      id: "ORIENT_NEWCOMERS",
      priority: "high",
      requires: ["player_is_newcomer", "no_immediate_threat"],
      motive: "新人不知道主神副本的規則，缺少基本資訊的人死得最快。",
      action: "用最少的必要句子講完處境、任務、時間限制與生存規則，然後把他導向下一步。",
      payoff: "有效的引導可能換到主神提供的引導獎勵，而且多一個能動的人就多一分生還率。",
    },
    {
      id: "KEEP_ONE_ALIVE",
      priority: "high",
      requires: [],
      motive: "至少讓一名新人活著離開——這是他這一趟給自己的底線。",
      action: "在可承受的風險內提供警告、分派工作或帶著玩家前進。",
    },
  ],
  initialTrust: 1,

  aliases: /陸遠|老手|持槍男人|那個男人|男人的(?:手槍|武器)/,
  otherNpcTarget: addressesOneOf(["Ripley", "雷普利", "Parker", "帕克", "Lambert", "蘭伯特", "Ash", "艾許"]),
  homeScenes: ["evt_deck_a_recon"],
  // 在他的場景裡，只有這些語意才算是在跟他互動；純環境描寫不該推動合作狀態。
  //
  // [2026-08-31] 這份清單補過兩次，兩次都值得記下來：
  //
  // 1. 加上 `[?？]`：他的場景裡只有他一個人，玩家打一個問號就是在問他。
  //    舊清單只認得「你是誰／為什麼／怎麼回事／哪裡／如何」這幾種問法，
  //    「這裡怎麼這麼冷？」會被當成自言自語而完全沒有反應。
  //    這是刻意的放寬，不是順手的——而且它的影響被 transitions.survival_question
  //    的 onlyTopics 擋住了：認不出話題的雜問他仍然要回答，但不算完成簡報。
  //
  // 2. 加上摩擦類的詞彙（不信／憑什麼／改道／離隊／單獨／追問）：
  //    這是一個**沉默了很久的 bug**。persona 有四條 friction 規則
  //    （express_distrust／reject_path／declare_solo／passive_questioning），
  //    但它們的觸發詞一個都不在這份清單裡，所以玩家除非叫出「陸遠」兩個字，
  //    否則說「我不信任你」「我要離隊」得到的是**完全沒有反應**。
  //    現場只有他一個人，那句話不可能是在對別人說。
  //    症狀是「NPC 對我的不信任毫無感覺」，不會有任何測試變紅——
  //    事實上這條分支的覆蓋率一直是 0，那就是它留下的唯一痕跡。
  sceneKeywords: /你是誰|為什麼|怎麼回事|發生什麼|哪裡|如何|去哪|往哪|逃生|跟上|探路|殿後|我來|我可以|我們走|一起|搶|奪|撲|推|抓|壓制|威脅|恐嚇|後退|退後|退開|放下手|停手|停止攻擊|道歉|害怕|失控|[?？]|不信|不相信|憑什麼|你在騙|改道|走另一條|不走這條|拒絕前進|不跟你走|不去|離隊|不跟隊|單獨|一個人|自己走|我們分開|一直問|繼續追問|先回答我|站在原地|我不動/,

  states: {
    initial: "briefing",
    order: ["briefing", "provisional", "functional", "strained", "self_preserving", "abandoned"],
    // 進到這幾階就算「他已經先顧自己」，S.A.E.P. 會據此抬高 EGO、降低 SOC。
    selfPreserving: ["strained", "self_preserving", "abandoned"],
    // [2026-09-01] abandoned = 他自行撤離，不再為玩家承擔風險。
    //
    // 合作階段住在 state.npcCooperation，而 reference 的 conditionalEffects 只吃 flags，
    // 兩邊接不起來的後果很具體：玩家把他惹到離隊之後，休眠結算的存活掃描照樣把他
    // 標成 survived，結局仍然說「有人陪你離開」——那個人明明早就走了。
    // 這一行把階段投影成世界事實，讓結局判定讀得到。
    //
    // 只有終局階段可以宣告（旗標寫出去就收不回來）。abandoned 符合：
    // 下面 transitions 裡每一條降溫規則的 onlyFrom 都只到 self_preserving 為止，
    // 沒有任何一條回得來。這個不變式由 assertTerminalStateFlags() 在載入時強制檢查。
    stateFlags: { abandoned: "flag_luyuan_abandoned" },
  },

  objectives: {
    briefing: "給出最低限度的生存簡報",
    provisional: "回答必要問題並把玩家導向下一個可執行行動",
    functional: "分派工作並維持隊形前進",
    strained: "先警告再重新設定界線",
    self_preserving: "拉開距離、停止提供情報",
    abandoned: "自行撤離，不再為玩家承擔風險",
  },

  // 有序規則，先中先贏。順序即優先序：越線的判斷一定排在提問之前，
  // 否則「我要不要搶他的槍？」會因為句尾有問號而被當成生存提問。
  rules: [
    { interactionType: "attempt_grab_weapon", kind: "hostile", topic: "weapon_snatch",
      pattern: /搶(?:走)?(?:他的)?槍|奪(?:取|走)?(?:他的)?槍|伸手.{0,8}槍|拿走.{0,8}槍|搶武器|搶.{0,10}槍|奪.{0,10}槍/ },
    { interactionType: "sudden_rush", kind: "hostile", topic: "physical_rush",
      pattern: /撲向?(?:陸遠|他|男人)|朝(?:陸遠|他|男人)撲|衝向(?:陸遠|他|男人)|撲上去|撲去/ },
    { interactionType: "physical_push", kind: "hostile", topic: "push_or_grapple",
      pattern: /推(?:倒|他|向)|抓住(?:陸遠|他)|扭住|壓制|動手(?:打|攻擊)?|攻擊(?:陸遠|他)/ },
    { interactionType: "verbal_intimidation", kind: "hostile", topic: "threaten_violence",
      pattern: /威脅(?:陸遠|他)|恐嚇(?:陸遠|他)|殺了你|要你死|對他開槍|拿槍指著(?:陸遠|他)/ },

    { interactionType: "player_step_back", kind: "deescalation", topic: "stand_down",
      pattern: /後退|退後|退開|收手|放下手|我停手|停止攻擊/ },
    { interactionType: "admit_panic", kind: "deescalation", topic: "panic_explanation",
      pattern: /我只是害怕|我太慌|我失控了|因為害怕|不是故意/ },
    { interactionType: "apologize_and_cooperate", kind: "deescalation", topic: "apology",
      pattern: /道歉|對不起|抱歉/ },
    { interactionType: "complete_assigned_task", kind: "deescalation", topic: "task_compliance",
      pattern: /完成(?:你|陸遠)?(?:交代|指示)|照做了|我做完了|任務完成|我處理好了/ },

    { interactionType: "offer_scout", kind: "cooperation", topic: "reconnaissance",
      pattern: /我先探路|我去探路|我來偵察|讓我看看前面|我可以探路|我先看路/ },
    { interactionType: "offer_repair_or_operate", kind: "cooperation", topic: "technical_operation",
      pattern: /我來修|我可以修|我操作|我來操作|我看看控制台|我來開門|我處理終端/ },
    { interactionType: "offer_carry_supplies", kind: "cooperation", topic: "logistics",
      pattern: /我來搬|我可以搬|我拿物資|我拿箱子|我負責搬/ },
    { interactionType: "offer_rear_guard", kind: "cooperation", topic: "formation_support",
      pattern: /我殿後|我守後面|我看後方|我掩護|我負責後方/ },

    { interactionType: "express_distrust", kind: "friction", topic: "distrust",
      pattern: /不信你|不相信你|我不信任|你在騙|你憑什麼/ },
    { interactionType: "reject_path", kind: "friction", topic: "path_disagreement",
      pattern: /不走這條|我不去|改道|走另一條|拒絕前進|不跟你走/ },
    { interactionType: "declare_solo", kind: "friction", topic: "solo_exploration",
      pattern: /我自己走|我單獨|我一個人|我們分開|我要離隊|不跟隊/ },
    { interactionType: "passive_questioning", kind: "friction", topic: "endless_questions",
      pattern: /一直問|先回答我|我還要問|繼續追問|我不動|站在原地/ },

    { interactionType: "survival_question", kind: "briefing",
      pattern: /[?？]|你是誰|為什麼|怎麼回事|發生什麼|哪裡|如何|什麼/ },
  ],

  questionTopics: [
    { topic: "identity", pattern: /你是誰|叫什麼|身分|名字/ },
    { topic: "displacement_reason", pattern: /為什麼在這裡|怎麼來|怎麼會在|被誰送|出現在這裡|來到這裡/ },
    { topic: "ship_status", pattern: /發生什麼|怎麼回事|船上|原船員|船員|到底出了什麼事/ },
    { topic: "threat_nature", pattern: /怪物|異形|生物|那東西|威脅|通風管/ },
    { topic: "evacuation_route", pattern: /去哪|往哪|出口|逃生|水仙|接駁|離開/ },
  ],
  defaultQuestionTopic: "survival_general",

  // 轉場表。onlyFrom 是舊 ENTRIES 表 `trigger.cooperationStates` 的直接繼承：
  // 一筆 entry 只掛在某幾個階段上，玩家在別的階段做同一件事就什麼也不會發生。
  // 那個 gate 有意義（「還沒吵架就先道歉」不該讓合作度往上跳一階），所以留著。
  transitions: {
    survival_question: {
      to: "provisional",
      onlyFrom: ["briefing", "provisional"],
      // survival_general 是「引擎聽得出是個問句，但認不出在問什麼」的那一類。
      // 他仍然要回答必要的部分，但這種雜問不算完成簡報，所以不推進階段。
      onlyTopics: ["identity", "displacement_reason", "ship_status", "threat_nature", "evacuation_route"],
    },
    offer_scout: { to: "functional", onlyFrom: ["briefing", "provisional", "functional"] },
    offer_repair_or_operate: { to: "functional", onlyFrom: ["provisional", "functional"] },
    offer_carry_supplies: { to: "functional", onlyFrom: ["provisional", "functional"] },
    offer_rear_guard: { to: "functional", onlyFrom: ["briefing", "provisional", "functional"] },

    express_distrust: { to: "strained", onlyFrom: ["briefing", "provisional", "functional"] },
    // 已經在自保姿態時再拒絕一次路線，就是他放棄帶你的那一刻。
    reject_path: { to: "strained", onlyFrom: ["provisional", "functional", "self_preserving"], escalateFrom: ["self_preserving"], escalateTo: "abandoned" },
    declare_solo: { to: "strained", onlyFrom: ["briefing", "provisional", "functional"] },
    passive_questioning: { to: "strained", onlyFrom: ["provisional", "functional"] },

    // 三階威脅階梯，取代以前 firstThreat / secondThreat / selfPreserving 三組 entry。
    // 動手（physical_push）沒有第三階：他到了自保階段就不會再讓你靠近到能推他。
    ...Object.fromEntries(
      ["attempt_grab_weapon", "sudden_rush", "verbal_intimidation"].map((type) => [
        type,
        { ladder: ["strained", "self_preserving", "abandoned"], onlyFrom: ["briefing", "provisional", "functional", "strained", "self_preserving"] },
      ])
    ),
    physical_push: { ladder: ["strained", "self_preserving", "abandoned"], onlyFrom: ["briefing", "provisional", "functional", "strained"] },

    // 降溫只有在真的有東西可降的時候才成立。
    ...Object.fromEntries(
      ["player_step_back", "admit_panic", "apologize_and_cooperate", "complete_assigned_task"].map((type) => [
        type,
        { to: "functional", onlyFrom: ["strained", "self_preserving"] },
      ])
    ),
  },
};

const policy = defineCooperationPolicy(LUYUAN_PERSONA);

export const COOPERATION_STATES = Object.freeze([...LUYUAN_PERSONA.states.order]);
export const createNpcCooperationState = policy.createState;
export const normalizeNpcCooperationState = policy.normalizeState;
export const classifyNpcInteraction = policy.classify;
export const applyNpcCooperationForAction = policy.applyForAction;
