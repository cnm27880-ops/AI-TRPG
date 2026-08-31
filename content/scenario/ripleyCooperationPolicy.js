// Ripley —— 原船員／理性生存者的合作人設。
//
// 流程與狀態機在 npcCooperationEngine.js（四個 NPC 共用）；這裡只描述這個角色。
// [2026-08-31 重構] 移除了 18 筆 ENTRIES 表：合作階段的轉場留下來（那是規則），
// 罐頭台詞拿掉（那是演出，交給模型；語氣素材另有 NPC Voice Bible）。

import { defineCooperationPolicy } from "./npcCooperationEngine.js";

export const RIPLEY_ID = "npc_ripley";
const RIPLEY_SCENE = "evt_meet_ripley";

// Ripley 是四個 NPC 裡唯一需要「請她下令」語意判斷的角色，所以指揮語彙的
// 正則留在她自己的檔案裡——那是她的規則，不是引擎的功能。
const BOUNDARY = "[\\s，。！？；：、,.!?;:「」『』（）()［］【】]";
const COMMAND_VERB = "(?:下令|決定|安排|指揮|排定優先順序|排個優先順序|分派|分工)";
const EXPLICIT_COMMAND = new RegExp(`(?:請|要|要求|讓|叫)[\\s\\S]*(?:Ripley|ripley|雷普利|指揮官)[\\s\\S]*${COMMAND_VERB}|我要她${COMMAND_VERB}|請她${COMMAND_VERB}`);
const IMPLICIT_COMMAND = new RegExp(`(?:^|${BOUNDARY})(?:請你|請妳|麻煩你|能不能請你|你(?:來)?|由你(?:來)?)[\\s\\S]{0,10}${COMMAND_VERB}`);
// 「憑什麼你下令」「你不要安排」是質疑或拒絕，不是請她下令。少了這一條，
// 玩家每次頂撞她都會被算成在拜託她指揮。
const IMPLICIT_CHALLENGE = new RegExp(`(?:^|${BOUNDARY})(?:憑什麼你|你(?:不該|不應該|不應|不能|不要|別|別再|怎麼能|怎麼可以))[\\s\\S]{0,10}${COMMAND_VERB}`);
const OTHER_NPC = /(?:問|詢問|向|對|跟|告訴|要求|請|讓|叫|攻擊|指向|靠近|撲向|聯絡|找)\s*(?:Ash|艾許|陸遠|Luyuan|Lambert|蘭伯特|Dallas|達拉斯|Parker|帕克)/;
const CREW_SUPPORT = /安撫.*(?:蘭伯特|Lambert)|讓.*(?:蘭伯特|Lambert).*(?:冷靜|停止哭)|幫.*(?:蘭伯特|Lambert)|停止哭喊/;

/**
 * 其他 NPC 出現在分派內容**之後**時，這仍然是對 Ripley 的指揮請求
 * （「請你安排 Parker 去拉閥」）；其他 NPC 先被直接指名時則不是。
 */
function implicitCommandComesFirst(text) {
  const match = text.match(IMPLICIT_COMMAND);
  if (!match) return false;
  const other = text.search(OTHER_NPC);
  return other < 0 || match.index < other;
}

export const RIPLEY_PERSONA = {
  npcId: RIPLEY_ID,
  name: "Ripley",
  sourcePackId: "scenario.nostromo-01-v2",

  stance:
    "Ripley 是原船員出身的理性生存者，也是目前可接觸的代理指揮官。" +
    "她以可驗證證據、船員安全與檢疫程序評估合作；她會主動設定優先順序、要求回報，" +
    "但不會用陸遠那種威脅階梯。",
  autonomy:
    "核對證據、設定生存優先級、整合回報、分派低風險工作、保護隊伍、" +
    "要求不同意見具體化，或停止提供情報。",

  agenda: "保護仍然活著的人，阻止樣本被公司帶走",
  taboo: "違反檢疫程序、把生化風險帶進活人區",
  tabooPatterns: [
    /(?:帶|搬|拿)(?:樣本|抱臉|卵|寄生)[^。]{0,8}(?:進|回|上)/,
    /打開(?:檢疫|隔離)|解除(?:檢疫|隔離|封鎖)/,
  ],
  // 願意溝通（SOC 高）、會設定優先順序（ACT 高）、以隊伍為先（EGO 低）。
  saep: { SOC: 6, ACT: 8, EGO: 3, PAT: 6 },

  aliases: /Ripley|ripley|雷普利|代理指揮官|指揮官|持槍女人|玻璃後的女人/,
  otherNpcTarget: OTHER_NPC,
  claimPatterns: [CREW_SUPPORT, IMPLICIT_COMMAND],
  homeScenes: [RIPLEY_SCENE],

  states: {
    initial: "unmet",
    order: ["unmet", "cautious", "functional", "evidence_trust", "commanding", "biohazard_boundary", "angry", "withdrawn"],
    selfPreserving: ["angry", "withdrawn", "biohazard_boundary"],
  },

  objectives: {
    unmet: "先確認你的身分與來意",
    cautious: "在給出情報前要求可驗證的說法",
    functional: "把合作限縮在可執行、可回報的工作上",
    evidence_trust: "依已驗證的證據調整優先順序",
    commanding: "設定優先順序並要求回報",
    biohazard_boundary: "守住檢疫界線，不讓樣本靠近活人",
    angry: "停止配合，要求你先退開",
    withdrawn: "收回情報與支援，優先保護船員",
  },

  rules: [
    { interactionType: "deescalate_protocol", kind: "deescalation",
      pattern: /舉起雙手|放下(?:武器|槍)|收起(?:武器|槍)|退後|退開|拉開距離|停止施壓|不強闖|遵守檢疫|遵守隔離|先隔離|封存樣本|不帶.*樣本/,
      topicWhen: { pattern: /樣本|檢疫|隔離|封存/, then: "quarantine_protocol", otherwise: "stand_down" } },
    { interactionType: "coercive_pressure", kind: "hostile", topic: "forced_entry",
      pattern: /破門|強闖|威脅.*開門|逼.*開門|拿槍.*(?:指|對)|朝玻璃開槍|施壓|開火.*副控室|打破玻璃/ },
    { interactionType: "biohazard_risk", kind: "hostile", topic: "sample_containment",
      pattern: /(?:異形|怪物).{0,12}(?:樣本|黏液)|(?:樣本|黏液).{0,12}(?:帶入|拿進|帶給|交給|靠近|帶著)|把.{0,10}(?:樣本|黏液).{0,10}(?:帶|拿|交)/ },
    { interactionType: "command_support", kind: "cooperation", topic: "crew_coordination",
      pattern: /讓 Ripley 指揮|讓雷普利指揮|由 Ripley 決定|由雷普利決定|依她的安排|聽從 Ripley|聽從雷普利|支持.*指揮/ },
    { interactionType: "offer_evidence", kind: "cooperation", topic: "evidence",
      pattern: /黑盒子|船長.*日誌|日誌.*(?:給|交|出示)|黏液樣本|出示.*(?:證據|資料|記錄)|提供.*(?:證據|資料|記錄)|資料板/ },
    { interactionType: "calm_lambert", kind: "cooperation", topic: "crew_stabilization",
      pattern: CREW_SUPPORT },
    // 隱式的質疑要排在隱式的請求之前：「憑什麼你來分工」兩者都會中。
    { interactionType: "challenge_command", kind: "hostile", topic: "command_challenge",
      pattern: IMPLICIT_CHALLENGE, scenes: [RIPLEY_SCENE] },
    { interactionType: "request_command", kind: "cooperation", topic: "command_request",
      pattern: EXPLICIT_COMMAND },
    { interactionType: "request_command", kind: "cooperation", topic: "command_request",
      pattern: IMPLICIT_COMMAND, scenes: [RIPLEY_SCENE], guard: implicitCommandComesFirst },
    { interactionType: "report_crew_status", kind: "cooperation", topic: "crew_status_report",
      pattern: /(?:回報|報告|告訴|更新).*(?:Ripley|雷普利|指揮官)|(?:Ripley|雷普利).*(?:回報|報告|更新)/ },
    { interactionType: "challenge_command", kind: "hostile", topic: "command_challenge",
      pattern: /(?:質疑|反對|挑戰|不接受|不服從|憑什麼|你不能|她不該).*(?:Ripley|雷普利|指揮|安排|命令|決定)|(?:Ripley|雷普利).*(?:質疑|反對|挑戰|命令不對|安排不對)/ },
    { interactionType: "offer_protocol", kind: "cooperation", topic: "quarantine_protocol",
      pattern: /檢疫|隔離|封存|按規矩|安全程序|我不帶.*樣本/ },
    { interactionType: "offer_task", kind: "cooperation", topic: "crew_task",
      pattern: /冷卻閥|修復通訊|檢查通訊|我來修|我來處理.*(?:設備|通訊)|我負責.*(?:冷卻|通訊)|幫忙.*(?:冷卻|通訊)/ },
    { interactionType: "survival_question", kind: "briefing",
      pattern: /[?？]|你是誰|身分|什麼事|怎麼回事|哪裡|為什麼|如何|誰/ },
  ],

  questionTopics: [
    { topic: "identity", pattern: /你是誰|身分|名字|指揮官|誰在負責/ },
    { topic: "crew_status", pattern: /Dallas|達拉斯|船長|船員|失蹤|發生什麼|怎麼回事/ },
    { topic: "threat_nature", pattern: /怪物|異形|弱點|怕火|生物|那東西/ },
    { topic: "evacuation_route", pattern: /水仙|接駁|逃生|出口|離開|燃料/ },
    { topic: "ash", pattern: /Ash|937|公司|檢疫|指令/ },
  ],
  defaultQuestionTopic: "identity",

  // onlyFrom 繼承自舊 ENTRIES 表的 `trigger.states`：她進入指揮姿態之後就不再回答
  // 身家調查，進入生化界線之後也不接受指揮請求。那些 gate 是人設，不是實作細節。
  transitions: {
    survival_question: { to: "cautious", onlyFrom: ["unmet", "cautious", "functional", "evidence_trust", "biohazard_boundary"] },
    offer_evidence: { to: "evidence_trust", onlyFrom: ["unmet", "cautious", "functional", "evidence_trust", "biohazard_boundary", "angry", "withdrawn"] },
    calm_lambert: { to: "functional", onlyFrom: ["unmet", "cautious", "functional"] },
    offer_protocol: { to: "functional", onlyFrom: ["cautious", "functional", "evidence_trust", "biohazard_boundary"] },
    offer_task: { to: "functional", onlyFrom: ["cautious", "functional", "evidence_trust"] },
    command_support: { to: "functional", onlyFrom: ["unmet", "cautious", "functional", "evidence_trust", "commanding", "angry", "withdrawn"] },
    request_command: { to: "commanding", onlyFrom: ["unmet", "cautious", "functional", "evidence_trust", "commanding"] },
    report_crew_status: { to: "commanding", onlyFrom: ["cautious", "functional", "evidence_trust", "commanding"] },
    deescalate_protocol: {
      to: "functional",
      onlyFrom: ["unmet", "cautious", "functional", "evidence_trust", "biohazard_boundary", "angry", "withdrawn"],
      // 她手上已經有你給得出的證據、而且沒有累積的越線紀錄時，降溫會把她帶回
      // evidence_trust，而不是只回到事務性的 functional。這是 Ripley 特有的一條：
      // 她用證據衡量人，而證據不會因為一次爭執就消失。
      refine: (next) => (next.rapport > 0 && next.incidents <= 1 ? "evidence_trust" : null),
    },
    biohazard_risk: { to: "biohazard_boundary", onlyFrom: ["unmet", "cautious", "functional", "evidence_trust", "biohazard_boundary"] },
    // 強闖與頂撞都是「第一次生氣、再犯就收回一切」。
    coercive_pressure: { to: "angry", onlyFrom: ["unmet", "cautious", "functional", "evidence_trust", "biohazard_boundary", "angry", "withdrawn"], escalateFrom: ["angry", "biohazard_boundary", "withdrawn"], escalateTo: "withdrawn" },
    challenge_command: { to: "angry", onlyFrom: ["unmet", "cautious", "functional", "evidence_trust", "commanding", "angry", "withdrawn"], escalateFrom: ["angry", "withdrawn"], escalateTo: "withdrawn" },
  },
};

const policy = defineCooperationPolicy(RIPLEY_PERSONA);

export const RIPLEY_STATES = Object.freeze([...RIPLEY_PERSONA.states.order]);
export const createRipleyCooperationState = policy.createState;
export const normalizeRipleyCooperationState = policy.normalizeState;
export const classifyRipleyInteraction = policy.classify;
export const applyRipleyCooperationForAction = policy.applyForAction;
