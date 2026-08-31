// [設計] NPC 合作策略的共用引擎。
//
// 起因：這個專案曾經有四份 `*CooperationPolicy.js`（陸遠／Ripley／Parker／Lambert），
// 每一份都是 450~650 行，而其中**只有大約八十行是那個角色獨有的**。
// 其餘全部是同一套東西被抄了四遍：
//
//   - 同一個 targetIsX() 的「這句話是不是在對他說」判斷
//   - 同一個 textOf() / clampInteger()
//   - 同一份 currentState() / createXState() / normalizeXState()
//   - 同一套 findEntry() -> patchState() 的流程
//   - 同一段結尾樣板（「不得自行創造：傷勢、死亡、位置改變…」）
//   - 以及各自一張 13~32 筆的 ENTRIES 表：把「玩家做了 A，NPC 就回 B」寫死成資料
//
// 抄四遍的代價不是行數，是**它們會各自漂移**。實際上已經漂移了：四個 NPC 的
// 「玩家越線次數」欄位分別叫 threatCount / boundaryIncidents / pressureIncidents，
// 於是 npcStateMachine.js 必須寫成 `threatCount ?? boundaryIncidents ?? pressureIncidents`
// 才讀得到同一個概念。那一行就是這次重構的診斷書。
//
// ---------------------------------------------------------------------------
// 那張 ENTRIES 表為什麼要拿掉
// ---------------------------------------------------------------------------
// 它是「寫死的分支走向」：每一筆都是一個 IF（trigger）配一段預先寫好的 NPC 台詞
// （runtimeNarration）。這在還沒有狀態機的時候是唯一能約束 NPC 的辦法，
// 但它有三個代價：
//
//   1. 每回合往動態層送 600+ 字的罐頭演出素材，而且是**每個在場 NPC 各一份**。
//   2. 罐頭台詞需要一整套字串替換（舊的 reviewedRuntimeText()，六十行 .replace）
//      來確保它不會宣告未授權的世界事實——那是在替一份不該存在的資料擦屁股。
//   3. 台詞寫死之後，NPC 的反應永遠只有那 32 種。玩家第二次看到同一句就出戲了。
//
// 現在 S.A.E.P. 狀態機（npcStateMachine.js）已經能算出「他現在什麼心情」，
// 演出就該交還給模型。這個引擎只負責保留 ENTRIES 裡**唯一不能交給模型的東西**：
// 合作狀態的轉場（誰惹毛了他、他退到哪一階）。那是規則，不是台詞。
//
// ---------------------------------------------------------------------------
// 這個引擎不做什麼
// ---------------------------------------------------------------------------
// 不產生任何 engine effect。不決定傷害、位置、物品、旗標、戰鬥結果或判定分級。
// 它只把玩家這句話分類成一個 interactionType，然後推進一個有界的合作狀態。
// （AGENTS.md 最高原則：AI 只負責敘事，不負責算數——這條對引擎自己同樣成立。）

/** 玩家輸入取這麼多字就夠分類了；再長只是讓每個 regex 多掃一遍。 */
const MAX_ACTION_TEXT = 240;

/** 所有合作狀態共用的計數上限。跨 NPC 一致，才能被同一套 UI 與狀態機讀。 */
const COUNTER_MAX = 9;
const TRUST_MIN = -9;
const TRUST_MAX = 9;

/**
 * 互動的五種性質。
 *
 * 這是四個 NPC 唯一共用的分類軸，也是 npcStateMachine.js 拿來調整耐心值的依據——
 * 以前那份「哪些 interactionType 算敵意」的明列表寫在狀態機裡，跟這裡的 rules 是
 * 兩份會各自漂移的資料。現在只有這一份：新增一條 rule 就必須同時宣告它的 kind，
 * 漏宣告會在 definePolicy() 當場丟錯，而不是在某個 NPC 身上安靜地算錯耐心。
 */
export const INTERACTION_KINDS = Object.freeze([
  "briefing",      // 生存提問：他必須回答至少一項必要事實
  "cooperation",   // 玩家提供協助或回報
  "friction",      // 不信任、拒絕、離隊、原地空轉——摩擦但不是越線
  "hostile",       // 越線：動手、脅迫、破壞、把生化風險帶進來
  "deescalation",  // 退後、道歉、遵守程序、完成交辦
]);

const KIND_SET = new Set(INTERACTION_KINDS);

export function textOf(value) {
  return String(value ?? "").trim().slice(0, MAX_ACTION_TEXT);
}

function clampInteger(value, minimum, maximum, fallback) {
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(Number(value))));
}

/**
 * 所有 NPC 共用的合作狀態形狀。
 *
 * 以前每個 NPC 有自己的一組計數器（evidenceConfidence / panicIncidents /
 * mechanicalNeed / warningsIssued…）。那些名字讀起來很有角色感，但沒有一個
 * 被用來做「這個角色專屬」的判斷——它們全部只做兩件事：往上加、決定要不要升級。
 * 所以收斂成三個跨 NPC 一致的量：
 *
 *   incidents    玩家越線了幾次（升級到自保／退場的依據）
 *   rapport      玩家幫上忙幾次（回到合作的依據）
 *   deescalations 玩家主動降溫幾次
 *
 * 角色感應該長在 stance／objectives／台詞上，不是長在計數器的欄位名上。
 */
function initialState(persona) {
  return {
    state: persona.states.initial,
    trust: persona.initialTrust ?? 0,
    incidents: 0,
    rapport: 0,
    deescalations: 0,
    contactEstablished: false,
    currentObjective: persona.objectives[persona.states.initial] ?? null,
    lastInteractionType: null,
    lastTopic: null,
    lastActionText: null,
    lastUpdatedTurn: 0,
  };
}

/**
 * 舊存檔的「玩家越線次數」。
 *
 * 統一成 incidents 之前，四個 NPC 各自叫 threatCount / boundaryIncidents /
 * pressureIncidents / panicIncidents / commandChallenges。不搬移的話，玩到一半的存檔
 * 會把計數歸零——合作**階段**還在（self_preserving 仍是 self_preserving），
 * 但威脅階梯的位置沒了，於是下一次威脅會落回階梯第一階，關係反而變好。
 * 那是一個只有老玩家碰得到、而且看起來像「NPC 忽然原諒我了」的 bug。
 */
const LEGACY_INCIDENT_KEYS = ["threatCount", "boundaryIncidents", "pressureIncidents", "panicIncidents", "commandChallenges"];

function migratedIncidents(raw) {
  const values = [raw.incidents, ...LEGACY_INCIDENT_KEYS.map((key) => raw[key])]
    .map((value) => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0));
  return Math.max(0, Math.min(COUNTER_MAX, ...[COUNTER_MAX, Math.max(...values)]));
}

function normalizeEntry(persona, raw) {
  const base = initialState(persona);
  if (!raw || typeof raw !== "object") return base;
  const state = persona.states.order.includes(raw.state) ? raw.state : base.state;
  return {
    state,
    trust: clampInteger(raw.trust, TRUST_MIN, TRUST_MAX, base.trust),
    incidents: migratedIncidents(raw),
    rapport: clampInteger(raw.rapport, 0, COUNTER_MAX, 0),
    deescalations: clampInteger(raw.deescalations, 0, COUNTER_MAX, 0),
    contactEstablished: Boolean(raw.contactEstablished),
    currentObjective: typeof raw.currentObjective === "string"
      ? raw.currentObjective
      : persona.objectives[state] ?? null,
    lastInteractionType: typeof raw.lastInteractionType === "string" ? raw.lastInteractionType : null,
    lastTopic: typeof raw.lastTopic === "string" ? raw.lastTopic : null,
    lastActionText: typeof raw.lastActionText === "string" ? textOf(raw.lastActionText) : null,
    lastUpdatedTurn: clampInteger(raw.lastUpdatedTurn, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

/**
 * 「玩家這句話是不是在對這個 NPC 說」。
 *
 * 四個 NPC 以前各有一份幾乎相同的實作。差異只有三個參數，全部提到 persona 裡：
 *   aliases       他的名字與稱呼
 *   homeScenes    在這些場景裡，沒指名也預設是對他說
 *   sceneKeywords 有些 NPC（Parker）在自己的場景裡仍要求話題相關，否則整場的
 *                 每一句話都會被算成在跟他講話
 */
function targets(persona, { text, targetNpcId, sceneId }) {
  if (targetNpcId && targetNpcId !== persona.npcId) return false;
  if (targetNpcId === persona.npcId) return true;
  if (persona.aliases.test(text)) return true;
  // 明確指名了別人就不是對他說——除非這句話踩到 claimPatterns。
  // claimPatterns 是「雖然提到了別人，但這件事仍然是找他辦的」：
  // 「安撫 Lambert」提到了 Lambert，但那是在請 Ripley 出面穩住船員。
  const claimed = (persona.claimPatterns ?? []).some((pattern) => pattern.test(text));
  if (!claimed && persona.otherNpcTarget.test(text)) return false;
  if (!persona.homeScenes.includes(sceneId)) return false;
  return persona.sceneKeywords ? persona.sceneKeywords.test(text) : true;
}

/** 依 persona 的有序規則做分類：先中先贏，所以規則的順序就是優先序。 */
function classifyWith(persona, { actionText = "", targetNpcId = null, sceneId = null } = {}) {
  const text = textOf(actionText);
  const miss = { interactionType: "other", kind: null, topic: null, targetNpcId: null, actionText: text };
  if (!text || !targets(persona, { text, targetNpcId, sceneId })) return miss;

  for (const rule of persona.rules) {
    // scenes：只有在這些場景才成立的規則（例如 Ripley 的「請你排個優先順序」——
    // 在她的副控室裡是請她下令，在別處只是玩家自言自語）。
    if (Array.isArray(rule.scenes) && !rule.scenes.includes(sceneId)) continue;
    // pattern 是「中一個就算」，patterns 是「全部都要中」。
    // 後者用在「這句話同時提到超載**而且**是個問句」這種條件——
    // 寫成一個帶 lookahead 的巨大正則可以，但沒有人（包括三個月後的自己）讀得懂。
    if (rule.pattern && !rule.pattern.test(text)) continue;
    if (rule.patterns && !rule.patterns.every((pattern) => pattern.test(text))) continue;
    // guard：這個角色獨有的額外條件。留在 persona 檔裡，因為它就是這個角色的規則；
    // 硬塞進引擎只會讓引擎長出四個 NPC 的 if。
    if (typeof rule.guard === "function" && !rule.guard(text)) continue;
    // 少數規則的 topic 要看句子內容再決定（例如「退後」是 stand_down、
    // 「封存樣本」是 quarantine_protocol），用 topicWhen 表達，不用再寫一條規則。
    const topic = rule.topicWhen
      ? (rule.topicWhen.pattern.test(text) ? rule.topicWhen.then : rule.topicWhen.otherwise)
      : rule.topic ?? null;
    return {
      interactionType: rule.interactionType,
      kind: rule.kind,
      topic: rule.interactionType === "survival_question" ? questionTopic(persona, text) : topic,
      targetNpcId: persona.npcId,
      actionText: text,
    };
  }
  return { ...miss, targetNpcId: persona.npcId };
}

function questionTopic(persona, text) {
  for (const { topic, pattern } of persona.questionTopics ?? []) {
    if (pattern.test(text)) return topic;
  }
  return persona.defaultQuestionTopic ?? null;
}

/**
 * 依 kind 更新計數器，再依轉場表決定下一個合作狀態。
 *
 * 轉場表取代了以前那 13~32 筆 ENTRIES 的 `decision.stateAfter`。
 * 一筆轉場可以是一個狀態字串，也可以是 `{ to, escalateFrom, escalateTo }`——
 * 後者就是以前用兩筆 entry（一筆 states:[...normal]、一筆 states:[angry,withdrawn]）
 * 表達的「同一件事再來一次就升級」，寫成一行。
 */
/**
 * 這一回合的合作階段。回傳 null 代表「這個互動在目前的階段不成立」——
 * 呼叫端會把整回合當成沒發生。
 *
 * onlyFrom 是舊 ENTRIES 表裡 `trigger.states` 的直接繼承：一筆 entry 只掛在某幾個
 * 階段上，玩家在別的階段做同一件事就找不到 entry、什麼也不會發生。那個 gate 是有意義的
 * ——「還沒吵架就先道歉」不該讓合作度往上跳一階——所以它跟著轉場一起留下來。
 */
function nextState(persona, next, { interactionType, topic }) {
  const rule = persona.transitions[interactionType];
  if (!rule) return next.state;
  if (typeof rule === "string") return rule;
  if (Array.isArray(rule.onlyFrom) && !rule.onlyFrom.includes(next.state)) return null;
  // onlyTopics：這個互動有發生（計數器要更新），但只有這幾個話題會推進階段。
  // 舊實作用「找不到對應 entry 就走 fallback，而 fallback 沒有 stateAfter」表達同一件事：
  // 一個引擎沒有預備答案的雜問，不該讓 NPC 把你當成已經簡報過的人。
  if (Array.isArray(rule.onlyTopics) && !rule.onlyTopics.includes(topic)) return next.state;
  // byTopic：同一種互動因為問的東西不同而落在不同階段
  // （問 Lambert 逃生路線會把她推向 seeking_safety，問別的只是讓她把焦慮講出來）。
  if (rule.byTopic && topic && rule.byTopic[topic]) return rule.byTopic[topic];

  // ladder：越線第 n 次落在第 n 階。這一行取代的是以前那種「同一個 interactionType
  // 寫三筆 entry，各自綁 threatCountRange [1,1] / [2,2] / [3,5]」的表達方式。
  // 越線是有記憶的，所以看的是累計次數，不是玩家剛好停在哪一格。
  if (Array.isArray(rule.ladder)) {
    return rule.ladder[Math.max(0, Math.min(rule.ladder.length - 1, next.incidents - 1))];
  }
  // escalateFrom：已經在這幾個「熱」狀態裡再犯一次就升級。
  // next.state 這時候還是轉場前的狀態，正是這條規則要問的東西。
  if (Array.isArray(rule.escalateFrom) && rule.escalateFrom.includes(next.state)) return rule.escalateTo;
  // refine：這個角色獨有的收尾判斷。跟 rule.guard 一樣留在 persona 檔裡——
  // 「她手上已經有你給的證據時，降溫會把她帶回信任而不是只回到事務性合作」
  // 是 Ripley 的性格，不是引擎的功能。回傳 null 代表沿用上面算出來的階段。
  return (rule.refine ? rule.refine(next) : null) ?? rule.to;
}

function patch(persona, current, classification, turnNumber) {
  const next = { ...current, contactEstablished: true };
  switch (classification.kind) {
    case "hostile":
      next.incidents = Math.min(COUNTER_MAX, current.incidents + 1);
      next.trust = Math.max(TRUST_MIN, current.trust - 1);
      break;
    case "friction":
      next.trust = Math.max(TRUST_MIN, current.trust - 1);
      break;
    case "deescalation":
      next.deescalations = Math.min(COUNTER_MAX, current.deescalations + 1);
      break;
    case "cooperation":
      next.rapport = Math.min(COUNTER_MAX, current.rapport + 1);
      next.trust = Math.min(TRUST_MAX, current.trust + 1);
      break;
    default:
      break;
  }
  // 先更新計數器再算轉場：ladder 要看的是「這次越線之後」的累計次數。
  const resolved = nextState(persona, next, classification);
  if (resolved === null) return null;
  next.state = resolved;
  next.currentObjective = persona.objectives[next.state] ?? current.currentObjective;
  next.lastInteractionType = classification.interactionType;
  next.lastTopic = classification.topic;
  next.lastActionText = classification.actionText;
  next.lastUpdatedTurn = Number.isInteger(turnNumber) ? turnNumber : 0;
  return next;
}

function assertPersona(persona) {
  const required = ["npcId", "name", "sourcePackId", "aliases", "otherNpcTarget", "states", "objectives", "rules", "transitions", "saep"];
  for (const key of required) {
    if (persona?.[key] === undefined) throw new Error(`NPC persona 缺少必要欄位「${key}」（npcId=${persona?.npcId ?? "?"}）`);
  }
  if (!persona.states.order.includes(persona.states.initial)) {
    throw new Error(`${persona.npcId} 的 states.initial 不在 states.order 裡`);
  }
  for (const rule of persona.rules) {
    // kind 漏宣告的話，這條互動會在耐心值計算裡被當成中性——那是一種安靜的錯，
    // 只會表現成「這個 NPC 好像特別好脾氣」。寧可開不起來。
    if (!rule.pattern && !rule.patterns) {
      throw new Error(`${persona.npcId} 的規則「${rule.interactionType}」既沒有 pattern 也沒有 patterns`);
    }
    if (!KIND_SET.has(rule.kind)) {
      throw new Error(`${persona.npcId} 的規則「${rule.interactionType}」宣告了未知的 kind「${rule.kind}」`);
    }
  }
  for (const [interactionType, target] of Object.entries(persona.transitions)) {
    const targets = typeof target === "string"
      ? [target]
      : [target.to, target.escalateTo, ...(target.ladder ?? []), ...Object.values(target.byTopic ?? {})].filter(Boolean);
    for (const stateId of target.onlyFrom ?? []) {
      if (!persona.states.order.includes(stateId)) {
        throw new Error(`${persona.npcId} 的轉場「${interactionType}」的 onlyFrom 含未知狀態「${stateId}」`);
      }
    }
    for (const stateId of targets) {
      if (!persona.states.order.includes(stateId)) {
        throw new Error(`${persona.npcId} 的轉場「${interactionType}」指向未知狀態「${stateId}」`);
      }
    }
  }
  for (const stateId of persona.states.order) {
    if (!persona.objectives[stateId]) {
      throw new Error(`${persona.npcId} 的狀態「${stateId}」沒有對應的 objective`);
    }
  }
}

/**
 * 把一份 persona 變成一組合作策略函式。
 *
 * 回傳的形狀刻意跟舊的四個 policy 模組一致，所以呼叫端（referenceAdapter、turn.js）
 * 完全不用改：createState / normalizeState / classify / applyForAction。
 *
 * @param {object} persona 見各 `*CooperationPolicy.js` 檔頭的說明
 */
export function defineCooperationPolicy(persona) {
  assertPersona(persona);
  const { npcId } = persona;

  const readState = (state) => normalizeEntry(persona, state?.npcCooperation?.[npcId]);

  return {
    npcId,
    persona,
    createState: () => ({ [npcId]: initialState(persona) }),
    normalizeState: (raw) => ({ [npcId]: normalizeEntry(persona, raw?.[npcId]) }),
    classify: (input) => classifyWith(persona, input),

    /**
     * 推進一回合。沒有分類到這個 NPC、或分類成 other 時完全不動狀態——
     * 「引擎看不懂這句話」不等於「玩家對他做了什麼」。
     */
    applyForAction({ reference, state, actionText = "", sceneId = null, turnNumber = 0, targetNpcId = null } = {}) {
      const inactive = { state, classification: null, changed: false };
      if (reference?.sourcePackId !== persona.sourcePackId) return inactive;
      const classification = classifyWith(persona, { actionText, targetNpcId, sceneId });
      if (!classification.targetNpcId || classification.interactionType === "other") {
        return { state, classification, changed: false };
      }
      const patched = patch(persona, readState(state), classification, turnNumber);
      // 這個互動在目前的合作階段不成立（見 nextState 的 onlyFrom）：什麼都不動。
      if (!patched) return { state, classification, changed: false };
      return {
        state: {
          ...state,
          npcCooperation: { ...(state?.npcCooperation ?? {}), [npcId]: patched },
        },
        classification,
        changed: true,
      };
    },
  };
}
