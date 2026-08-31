// Parker —— 總工程師的合作人設。
//
// 流程與狀態機在 npcCooperationEngine.js（四個 NPC 共用）；這裡只描述這個角色。
// [2026-08-31 重構] 移除 13 筆 ENTRIES 表，理由同其他三個 NPC：轉場是規則、台詞是演出。

import { addressesOneOf, defineCooperationPolicy } from "./npcCooperationEngine.js";

export const PARKER_ID = "npc_parker";
const ENGINE_SCENES = ["evt_engine_coolant_prep", "evt_trigger_overload"];

export const PARKER_PERSONA = {
  npcId: PARKER_ID,
  name: "Parker",
  sourcePackId: "scenario.nostromo-01-v2",

  stance:
    "Parker 是直率、重視工程可靠度的總工程師。在他的機艙裡他說了算；" +
    "他的合作取決於玩家能不能提出具體工作、遵守設備程序並回報可觀察結果。",
  autonomy:
    "拆解工程步驟、分派低風險工作、直白拒絕資源濫用，或停止額外支援。",

  agenda: "讓工程系統不要在自己眼前把所有人燒死",
  taboo: "未經協調亂動工程設備與冷卻程序",
  tabooPatterns: [
    /(?:亂|隨便|直接)(?:動|拆|扳|按|拉)[^。]{0,6}(?:閥|管線|控制|面板|開關)/,
    /自己(?:來|動手)(?:啟動|超載|拆)/,
  ],
  // 直來直往（SOC 中）、在自己的機艙裡說了算（ACT 高）、不想被當工具人（EGO 中）、
  // 對亂動設備的容忍度極低（PAT 4）。
  saep: { SOC: 5, ACT: 7, EGO: 5, PAT: 4 },

  aliases: /Parker|帕克|工程師|總工程師/,
  otherNpcTarget: addressesOneOf(["Ripley", "雷普利", "Lambert", "蘭伯特", "Ash", "艾許", "陸遠", "Luyuan"]),
  homeScenes: ENGINE_SCENES,
  // 在機艙裡也要話題相關才算是在跟他互動：少了這一條，玩家在工程區說的每一句話
  // 都會被算成在跟 Parker 講話，連「我看看四周」也是。
  sceneKeywords: /閥門|冷卻|超載|過載|蒸氣|工程區|機艙|管線|修理|維修|扳手|設備/,

  states: {
    initial: "unmet",
    order: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment", "angry", "withdrawn"],
    selfPreserving: ["angry", "withdrawn", "resource_guarded"],
  },

  objectives: {
    unmet: "先弄清楚你是誰、要幹嘛",
    busy: "說明工程現況並要求你把需求講具體",
    functional: "把工作拆成可執行的步驟",
    team_accepted: "分派工程工作並要求回報",
    resource_guarded: "守住工具與物資，不讓人隨手拿走",
    overload_commitment: "協調超載程序，但不宣稱已經啟動",
    angry: "直白拒絕被威脅指揮，要求你離開設備範圍",
    withdrawn: "停止額外支援，只做自己的工作",
  },

  rules: [
    { interactionType: "deescalate_and_work", kind: "deescalation",
      pattern: /道歉|停手|停止施壓|我不亂來|按程序|遵守程序|交回工具|先回報|照你說的做/,
      topicWhen: { pattern: /回報|工作|檢查|完成|修好/, then: "task_report", otherwise: "stand_down" } },
    { interactionType: "sabotage_risk", kind: "hostile", topic: "threat_or_sabotage",
      pattern: /故意破壞|砸(?:扳手|閥門|設備)|折斷(?:閥門|連桿)|亂拉(?:閥門|把手)|破壞.*(?:管線|設備)|把.*(?:扳手|工具).*(?:摔|砸)/ },
    { interactionType: "coercive_pressure", kind: "hostile", topic: "threat_or_sabotage",
      pattern: /威脅|逼.*(?:開|做)|叫.*滾|滾開|搶(?:走)?(?:他的)?工具|拿工具.*不給|拿槍.*Parker|對 Parker.*(?:開火|動手)|罵.*Parker/ },
    { interactionType: "resource_pressure", kind: "hostile", topic: "resource_and_tools",
      pattern: /(?:給我|借我|我要|需要|拿|使用|帶走).{0,12}(?:扳手|工具|冷卻劑|物資)|工具.*(?:給我|借我|拿來)/ },
    { interactionType: "offer_overload_help", kind: "cooperation", topic: "overload",
      pattern: /同步拉閥|一起拉閥|協助超載|幫我拉閥|請 Parker.*(?:拉閥|超載)|讓 Parker.*(?:拉閥|超載)/ },
    { interactionType: "offer_repair", kind: "cooperation",
      pattern: /修理|維修|處理.*(?:閥門|冷卻|通訊|管線)|幫忙.*(?:修|檢查|處理)|我來.*(?:修|檢查|處理)|檢查.*(?:閥門|管線|蒸氣)/,
      topicWhen: { pattern: /閥門|冷卻/, then: "valves", otherwise: "repair" } },
    { interactionType: "report_task", kind: "cooperation", topic: "task_report",
      pattern: /完成|修好了|檢查完|已經處理|回報|看見.*(?:洩漏|壓力|故障)|結果是/ },
    // 超載相關的提問要**同時**命中話題與疑問語氣。少了後者，「自毀程序協助者」
    // 這種純敘述文字也會被當成玩家在問問題。
    { interactionType: "survival_question", kind: "briefing", topic: "overload",
      patterns: [/超載|過載|倒數|反應爐|自毀/, /[?？]|怎麼|如何|什麼|為什麼|需要/] },
    { interactionType: "survival_question", kind: "briefing",
      pattern: /[?？]|你是誰|身分|什麼事|怎麼回事|怎麼辦|哪裡|為什麼|如何|誰/ },
  ],

  // 順序即優先序，而且**跟舊實作一致**：identity 先問，否則「你是誰，超載還有多久」
  // 會被歸成 overload，跟既有的 briefing 期待對不上。
  questionTopics: [
    { topic: "identity", pattern: /你是誰|身分|名字|誰在負責/ },
    { topic: "overload", pattern: /超載|過載|倒數|反應爐/ },
    { topic: "resource_and_tools", pattern: /扳手|工具|資源|物資|冷卻劑|螺栓/ },
    { topic: "engineering_status", pattern: /閥門|蒸氣|冷卻|工程區|機艙|管線|修理|維修/ },
  ],
  defaultQuestionTopic: "identity",

  // onlyFrom 繼承自舊 ENTRIES 表的 `trigger.states`：他生氣或收工之後就不再接工作，
  // 也不會在還沒認識你的時候讓你插手超載程序。
  transitions: {
    survival_question: { to: "busy", onlyFrom: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment"] },
    offer_repair: { to: "functional", onlyFrom: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment"] },
    offer_overload_help: { to: "overload_commitment", onlyFrom: ["functional", "team_accepted", "resource_guarded", "overload_commitment"] },
    report_task: { to: "team_accepted", onlyFrom: ["functional", "team_accepted", "resource_guarded", "overload_commitment", "angry", "withdrawn"] },
    resource_pressure: { to: "resource_guarded", onlyFrom: ["unmet", "busy", "functional", "team_accepted", "resource_guarded", "overload_commitment"] },
    sabotage_risk: "resource_guarded",
    deescalate_and_work: "functional",
    coercive_pressure: { to: "angry", escalateFrom: ["angry", "withdrawn"], escalateTo: "withdrawn" },
  },
};

const policy = defineCooperationPolicy(PARKER_PERSONA);

export const PARKER_STATES = Object.freeze([...PARKER_PERSONA.states.order]);
export const createParkerCooperationState = policy.createState;
export const normalizeParkerCooperationState = policy.normalizeState;
export const classifyParkerInteraction = policy.classify;
export const applyParkerCooperationForAction = policy.applyForAction;
