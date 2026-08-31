// Lambert —— 導航員的合作人設。
//
// 流程與狀態機在 npcCooperationEngine.js（四個 NPC 共用）；這裡只描述這個角色。
// [2026-08-31 重構] 移除 14 筆 ENTRIES 表，理由同其他三個 NPC：轉場是規則、台詞是演出。

import { addressesOneOf, defineCooperationPolicy } from "./npcCooperationEngine.js";

export const LAMBERT_ID = "npc_lambert";
const LAMBERT_SCENE = "evt_meet_ripley";

export const LAMBERT_PERSONA = {
  npcId: LAMBERT_ID,
  name: "Lambert",
  sourcePackId: "scenario.nostromo-01-v2",

  stance:
    "Lambert 是在高壓環境中工作的導航員。她話多但抓不住重點，恐懼會直接寫在她的動作上。" +
    "她的合作取決於恐慌是否被觸發、資訊負荷多重、有沒有人用清楚低壓的方式陪著她。",
  autonomy:
    "回報聽見的聲音、要求空間、提供有限導航資訊、接受小型分工，或暫停複雜對話。",

  agenda: "遠離異形，在其他人做出決定前保住自己",
  taboo: "被人用言語施壓、被要求單獨行動",
  tabooPatterns: [
    /(?:吼|罵|逼|威脅|恐嚇)(?:她|Lambert|蘭伯特)/,
    /(?:叫|要|讓)(?:她|Lambert|蘭伯特)(?:一個人|單獨|自己)(?:去|走|留)/,
  ],
  // 高壓下話多（SOC 高）、幾乎不主導（ACT 低）、先保住自己（EGO 高）、
  // 耐心本來就被恐懼吃掉一半（PAT 3）。
  saep: { SOC: 7, ACT: 2, EGO: 7, PAT: 3 },

  aliases: /Lambert|蘭伯特|領航員|導航員/,
  otherNpcTarget: addressesOneOf(["Ripley", "雷普利", "Ash", "艾許", "陸遠", "Luyuan", "Parker", "帕克"]),
  homeScenes: [LAMBERT_SCENE],

  states: {
    initial: "unmet",
    order: ["unmet", "anxious", "seeking_safety", "stabilizing", "functional", "panic", "overloaded", "withdrawn"],
    selfPreserving: ["panic", "overloaded", "withdrawn"],
  },

  objectives: {
    unmet: "先確認你不是另一個威脅",
    anxious: "說出當下聽見與看見的東西",
    seeking_safety: "把話題拉回怎麼離開這艘船",
    stabilizing: "在有人陪同下把資訊講清楚",
    functional: "提供有限但可核對的導航資訊",
    panic: "先離開這裡，別問我細節",
    overloaded: "停止接收新資訊，只想找地方躲",
    withdrawn: "不再回應，優先保住自己",
  },

  rules: [
    // 降壓排在恐慌與施壓之前：玩家同一句話裡「退後、降低音量」的意圖要優先被聽見，
    // 否則「我不再大吼」會因為含有「大吼」而被判成施壓。
    { interactionType: "deescalate", kind: "deescalation",
      pattern: /降低音量|小聲|退後|退開|給.*空間|不要逼|不逼|不再大吼|停止施壓/,
      topicWhen: { pattern: /空間|退後|退開/, then: "space", otherwise: "reassurance" } },
    { interactionType: "panic_trigger", kind: "hostile",
      pattern: /尖叫|尖嘯|突然.*(?:聲音|巨響)|金屬.*(?:刮|撞)|異形.*(?:出現|撲)|怪物.*(?:出現|靠近)|爪子聲/,
      topicWhen: { pattern: /異形|怪物|撲|出現/, then: "visible_threat", otherwise: "alien_sound" } },
    { interactionType: "pressure_or_dismissal", kind: "hostile",
      pattern: /大吼|吼叫|斥責|閉嘴|別哭|別發抖|沒用|拖累|逼.*(?:說|回答)|威脅|恐嚇|罵/,
      topicWhen: { pattern: /威脅|恐嚇/, then: "shout", otherwise: "dismissal" } },
    { interactionType: "offer_reassurance", kind: "cooperation",
      pattern: /安撫|鼓勵|告訴.*沒事|保護|陪.*走|跟我走|和我一起|維持在.*視線|不要離開/,
      topicWhen: { pattern: /保護|陪|跟我|一起|視線/, then: "stand_together", otherwise: "reassurance" } },
    { interactionType: "survival_question", kind: "briefing",
      pattern: /(?:問|詢問).*(?:導航|坐標|路線|水仙|接駁|逃生|資料板|資料)/ },
    { interactionType: "offer_navigation_help", kind: "cooperation", topic: "navigation",
      patterns: [/導航|坐標|路線|水仙|接駁|逃生|資料板|資料/, /給|提供|告訴|協助|幫|核對|確認/] },
    { interactionType: "offer_small_task", kind: "cooperation", topic: "task",
      pattern: /任務|小事|一件事|我來確認|我來看|幫忙.*(?:確認|記錄)|分工/ },
    { interactionType: "offer_group_protection", kind: "cooperation", topic: "stand_together",
      pattern: /陪同|保護|站在.*旁|留在.*身邊|不丟下/ },
    { interactionType: "survival_question", kind: "briefing",
      pattern: /[?？]|你是誰|身分|什麼事|怎麼回事|哪裡|為什麼|如何|誰/ },
  ],

  // 順序即優先序，而且**跟舊實作一致**：identity 先問。
  questionTopics: [
    { topic: "identity", pattern: /你是誰|身分|名字|誰/ },
    { topic: "escape_route", pattern: /水仙|接駁|逃生|出口|離開|路線|坐標|導航/ },
    { topic: "threat_sound", pattern: /聲音|尖叫|尖嘯|爪子|管道|在哪裡|動靜|怪物|異形/ },
    { topic: "crew_status", pattern: /船員|Dallas|達拉斯|發生什麼|怎麼回事/ },
  ],
  defaultQuestionTopic: "current_thoughts",

  // onlyFrom 繼承自舊 ENTRIES 表的 `trigger.states`：她一旦完全封閉（withdrawn）就不再回應，
  // 也不會在還沒穩下來的時候接下額外的小任務。
  transitions: {
    // 問逃生路線會把她推向 seeking_safety，其餘提問只是把焦慮講出來。
    survival_question: { to: "anxious", onlyFrom: ["unmet", "anxious", "seeking_safety", "stabilizing", "functional", "panic", "overloaded"], byTopic: { escape_route: "seeking_safety" } },
    offer_reassurance: { to: "stabilizing", onlyFrom: ["unmet", "anxious", "seeking_safety", "stabilizing", "functional", "panic", "overloaded"] },
    offer_group_protection: { to: "stabilizing", onlyFrom: ["anxious", "seeking_safety", "stabilizing", "functional"] },
    offer_navigation_help: { to: "functional", onlyFrom: ["seeking_safety", "stabilizing", "functional", "panic", "overloaded", "withdrawn"] },
    offer_small_task: { to: "functional", onlyFrom: ["stabilizing", "functional"] },
    deescalate: { to: "stabilizing", onlyFrom: ["anxious", "seeking_safety", "stabilizing", "functional", "panic", "overloaded", "withdrawn"] },
    pressure_or_dismissal: { to: "panic", escalateFrom: ["panic", "overloaded", "withdrawn"], escalateTo: "withdrawn" },
    panic_trigger: { to: "panic", onlyFrom: ["unmet", "anxious", "seeking_safety", "stabilizing", "functional", "panic", "overloaded"], escalateFrom: ["panic", "overloaded"], escalateTo: "overloaded" },
  },
};

const policy = defineCooperationPolicy(LAMBERT_PERSONA);

export const LAMBERT_STATES = Object.freeze([...LAMBERT_PERSONA.states.order]);
export const createLambertCooperationState = policy.createState;
export const normalizeLambertCooperationState = policy.normalizeState;
export const classifyLambertInteraction = policy.classify;
export const applyLambertCooperationForAction = policy.applyForAction;
