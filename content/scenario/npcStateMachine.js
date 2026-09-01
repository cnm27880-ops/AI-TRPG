// [設計] NPC 動態狀態機 —— S.A.E.P. 四維矩陣 + CRPG 傳統狀態標籤。
//
// 這個檔案存在的理由，是把「NPC 現在是什麼心情、他打算幹嘛、他知道什麼」這件事
// 從**提示詞**搬回**程式**。
//
// 起因（實測回報）：NPC 的劇本提示詞越寫越長之後，模型反而退化成「客服小幫手」——
// 只顧著推進主線、有問必答、每一段都以「你接下來想怎麼做？」收尾。原因不難理解：
// 一段三千字的 IF-ELSE 劇本文字，對輕量級／高速模型（Flash 這一類）來說是
// **指令超載**，它會挑最容易照做的那一條（「幫助玩家」）執行，其餘的當背景噪音。
//
// 所以這裡走的是 Hybrid State Injection：
//
//   判斷（他生氣了沒？他該不該搶話？）→ 交給這個檔案的 JavaScript，0 token 成本、
//     決定性、可測試、可存檔。
//   演出（生氣的人會說什麼話）→ 交給 LLM，它本來就只擅長這件事。
//
// 送進 prompt 的只有一行極短的數值矩陣（見 buildNpcActiveStateBlock），
// 不是一整份劇本。模型讀到 `PAT: 2(Irritated)` 比讀到三段「如果玩家一直原地不動，
// 那麼陸遠應該表現得不耐煩」有效得多，而且便宜兩個數量級。
//
// ---------------------------------------------------------------------------
// 分層歸屬（見 docs/PROMPT_CACHE_CONTRACT.md）
// ---------------------------------------------------------------------------
// 這個檔案刻意產出**兩份**文字，因為它們的變動頻率不同：
//
//   NPC_STATE_LEGEND        整場遊戲逐字不變（軸的定義、怎麼讀這些數字）→ 靜態層
//   buildNpcActiveStateBlock() 每回合都不一樣（數字本身）→ 動態層，而且是**最頂端**
//
// 把 legend 跟數字寫在一起是很自然的直覺，也是這裡最貴的錯誤：legend 有好幾百字，
// 一旦跟著數字進動態層，就等於每回合重付一次它的錢。所以兩者分開，不要「順手合併」。
//
// ---------------------------------------------------------------------------
// 這個狀態機**不**做什麼
// ---------------------------------------------------------------------------
// 不產生任何 engine effect。它不決定傷害、位置、物品、旗標、戰鬥結果或判定分級——
// 那些是 core/ 與 referenceAdapter 的事（AGENTS.md 最高原則：AI 只負責敘事，不負責算數；
// 這條對「引擎自己」同樣成立：狀態機也不可以偷偷發明世界事實）。
// 它只決定一件事：**NPC 這回合用什麼姿態演出**。

import { onStageNpcIds } from "./narrativePackageAdapter.js";
import { NPC_PERSONAS, personaFor } from "./npcPersonaRegistry.js";

/** 四個軸的固定順序。送進 prompt 的陣列就是照這個順序，不可以改成 Object.keys()。 */
export const SAEP_AXIS_IDS = Object.freeze(["SOC", "ACT", "EGO", "PAT"]);

const SAEP_MIN = 0;
const SAEP_MAX = 10;

/** 一個 NPC 的狀態行最多列幾條已知情報。列太多就變回「一整份劇本」，失去這個設計的意義。 */
const KNOWLEDGE_LIMIT = 3;
const MAX_TEXT = 60;

/**
 * 耐心值 → 標籤。
 *
 * 為什麼數字之外還要給一個英文標籤：實測下來，輕量級模型對 `2` 這個數字的反應遠不如
 * 對 `Irritated` 這個詞穩定——數字要先被理解成「0-10 的量表」才有意義，
 * 標籤則是它訓練資料裡直接對得上的演出指示。兩個都給，成本只差幾個 token。
 *
 * 由低到高排列，patienceLabel() 取第一個 value <= max 的項目。
 */
const PATIENCE_LABELS = Object.freeze([
  { max: 1, label: "Breaking" },   // 已經在爆發邊緣：這一回合會搶走場面主導權
  { max: 3, label: "Irritated" },  // 明顯不耐煩：會打斷、會下命令、不再解釋
  { max: 5, label: "Impatient" },  // 開始催促：句子變短，重複的問題不再回答
  { max: 7, label: "Steady" },     // 正常合作
  { max: SAEP_MAX, label: "Calm" },
]);

/** PAT 低到這個值（含）以下，NPC 這回合強制奪取場面主導權。 */
const SEIZE_CONTROL_AT = 1;

/**
 * 待在同一個 reference 場景幾回合之後才開始算「玩家在拖」。
 *
 * 沒有這個寬限窗的話，`sceneTurnCount` 會變成一個純粹的計時器：一場本來就要打十幾回合的
 * 戲，NPC 從第二回合起就一路扣耐心，扣到底之後不管玩家做什麼都回不來。
 * 那不是「他不耐煩」，那是「引擎在懲罰玩家把一場戲演完」。
 */
const SCENE_PATIENCE_GRACE = 4;

/**
 * 奪權之後回補的耐心。
 *
 * 沒有這一條的話 PAT 一旦落到 0 就會**每一回合**都觸發打斷，NPC 變成另一種壞掉的樣子
 * （從客服變成連環喝斥機器）。奪權本身就是情緒的出口：吼完了、自己動手了，
 * 張力就洩掉一截。這是遲滯，不是仁慈——跟 sessionStore 的歷史窗口是同一種設計。
 */
const SEIZE_CONTROL_REBOUND = 3;

/**
 * ---------------------------------------------------------------------------
 * 動機引擎（第五階段）
 * ---------------------------------------------------------------------------
 * 起因（實測回報）：陸遠的資料描述了他**是誰、知道什麼、想達成什麼**，卻沒有描述
 * 他在當前情境下**為什麼會優先做某一件事**。於是他第一句話可能是
 * 「你應該想想自己為什麼不在船員名單上」——那句話沒有違反白名單（他確實知道），
 * 也沒有違反任何合作階段，它只是**資訊優先序**錯了：一個知道新人隨時會死的老手，
 * 在沒有迫近威脅的時候，最強的行為動力應該是把生存規則講完。
 *
 * 這裡不回到固定台詞。引擎只決定「這一刻哪一條動機占優勢」，
 * 台詞、語氣、順序、篇幅仍然完全交給模型——跟 S.A.E.P. 是同一種分工。
 *
 * 三個刻意的設計限制：
 *
 *   1. **條件是查表，不是 DSL。** persona 的 requires 只能寫 MOTIVE_PREDICATES
 *      裡有的 token。新增條件是加一筆表，不是擴充語法；每一條 predicate 都能單獨測。
 *      persona 是資料（將來可能來自工坊上傳），讓資料編譯出可執行的條件是一條
 *      不需要為了省事而開的口子——這跟 npcProfile() 不吃 reference 宣告的
 *      tabooPatterns 是同一個理由。
 *
 *   2. **選擇是決定性的。** 權重相同時依 persona 的陣列順序取第一個。
 *      不決定性的話靜態層與測試都會不穩，而且同一個局面會演出兩種樣子。
 *
 *   3. **只送 ID。** 動機的內容（motive / action / payoff）整場不變，住在靜態契約；
 *      動態層每回合只多送 `Motive: "ORIENT_NEWCOMERS"` 這幾個字。
 *      把說明跟 ID 寫在一起是最自然、也最貴的錯法（見 NPC_STATE_LEGEND 的檔頭）。
 */

/**
 * 動機條件的求值表。
 *
 * 每一條都只讀**引擎已經算出來的事實**：合作階段、迫近度階段、耐心值、
 * NPC 狀態、這一回合有沒有踩到禁忌。沒有一條是問 AI 拿的，也沒有一條讀敘事文字。
 */
const MOTIVE_PREDICATES = Object.freeze({
  /** 玩家還沒被簡報過：合作階段仍在 briefing/provisional。 */
  player_is_newcomer: (ctx) => ctx.coopState === "briefing" || ctx.coopState === "provisional",
  /** 玩家已經聽完該聽的：重複說明的動機會下降。 */
  briefing_delivered: (ctx) => ctx.coopState !== null && !["briefing", "provisional"].includes(ctx.coopState),
  /** 沒有迫近威脅：威脅還不知道你在哪裡，或只是在搜索方向。 */
  no_immediate_threat: (ctx) => ctx.threatStage === null || ["潛伏", "追蹤"].includes(ctx.threatStage),
  /** 威脅已經貼上來了。 */
  under_immediate_threat: (ctx) => ["貼近", "接觸"].includes(ctx.threatStage),
  /** 他已經退到自保姿態（由合作狀態機裁定，見各 persona 的 states.selfPreserving）。 */
  self_preserving: (ctx) => ctx.selfPreserving,
  /**
   * 他已經**徹底**放棄這個玩家了——合作階段落進了終局狀態。
   *
   * 跟 self_preserving 的差別很重要：self_preserving 從 strained 就成立（他在警告你），
   * 而這一條只在他真的走人時才成立。用前者當「拋棄」的條件，會讓他在第一次爭執
   * 就說出「接下來你自己看著辦」——那不是果斷，那是玻璃心。
   *
   * 終局的定義沿用 states.stateFlags：那份宣告在載入時就被證明過是離不開的
   * （見 npcCooperationEngine 的 assertTerminalStateFlags）。
   */
  cooperation_terminal: (ctx) => ctx.terminalStance,
  /** 玩家這一回合剛好踩到他的禁忌。 */
  taboo_tripped: (ctx) => ctx.tabooTripped,
  /** 耐心見底。 */
  patience_breaking: (ctx) => ctx.pat <= SEIZE_CONTROL_AT,
  /** 他自己受傷了。 */
  npc_hurt: (ctx) => ["injured", "critical"].includes(ctx.status),
});

/**
 * 優先序 → 權重。四級，跟 DIVERGENCE_TIERS / PATIENCE_LABELS 是同一種固定表。
 *
 * 刻意**不**做成「high_when_safe」這種帶條件的優先序：那會讓同一個判斷有兩個入口
 * （requires 一個、優先序名稱一個），兩邊遲早會不一致。條件全部寫在 requires，
 * 優先序只是一個數字。
 */
const MOTIVE_PRIORITIES = Object.freeze({ critical: 100, high: 70, normal: 40, low: 10 });

/**
 * 挑出這一刻最強的那一條動機。
 *
 * requires 全部成立才算候選；權重最高者勝出，同分取 persona 陣列的順序（決定性）。
 * 一條都不成立時回 null，動態層那一行就不會出現 Motive 欄位——
 * 「沒有特別強的動力」跟「有動力但引擎算不出來」不是同一件事，不要用預設值蓋掉。
 *
 * @returns {string|null} 動機 id
 */
export function selectMotive(profile, context) {
  let best = null;
  let bestWeight = -1;
  for (const motive of profile.motivations ?? []) {
    if (!motive?.id) continue;
    const requires = motive.requires ?? [];
    if (!requires.every((token) => MOTIVE_PREDICATES[token]?.(context) === true)) continue;
    const weight = MOTIVE_PRIORITIES[motive.priority] ?? MOTIVE_PRIORITIES.normal;
    // 嚴格大於：同分時先宣告的贏，所以 persona 的陣列順序就是平手時的優先序。
    if (weight > bestWeight) {
      best = motive.id;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * persona 宣告的 requires 只能用查表裡有的 token。
 *
 * 拼錯一個字的症狀是「這條動機永遠不會被選中」——不會壞、不會有測試變紅，
 * 只會讓那個角色少一種行為模式。所以在載入時就炸掉。
 */
export function assertMotivePredicates(persona) {
  for (const motive of persona?.motivations ?? []) {
    for (const token of motive?.requires ?? []) {
      if (!MOTIVE_PREDICATES[token]) {
        throw new Error(
          `${persona.npcId} 的動機「${motive.id}」用了不存在的條件「${token}」；` +
            `可用條件：${Object.keys(MOTIVE_PREDICATES).join("/")}`
        );
      }
    }
    if (motive?.priority && !MOTIVE_PRIORITIES[motive.priority]) {
      throw new Error(`${persona.npcId} 的動機「${motive.id}」用了不存在的優先序「${motive.priority}」`);
    }
  }
}

/**
 * 副本沒登記、也沒在 reference 宣告時的通用人設：一個普通的、會累的人。
 *
 * [2026-08-31] 各 NPC 的基線、禁忌與自保狀態表以前寫在這個檔案的 NPC_PROFILES 裡，
 * 現在改由 npcPersonaRegistry.js 供應——同一個角色的人設散在兩個檔案，
 * 改了一邊忘了另一邊的症狀是「他的耐心值對，但禁忌沒反應」，很難聯想到成因。
 */
const DEFAULT_PROFILE = Object.freeze({
  saep: { SOC: 5, ACT: 5, EGO: 5, PAT: 5 },
  taboo: null,
  tabooPatterns: [],
  selfPreservingStates: ["withdrawn", "angry", "abandoned"],
});

/**
 * 互動的性質 → 對耐心的影響。
 *
 * [2026-08-31] 以前這裡有四個明列的 Set（HOSTILE_INTERACTIONS / FRICTION_… 等），
 * 各自列出所有 interactionType 的名字。那是第二份資料：新增一種互動時要同時改
 * policy 檔跟這裡，漏改的症狀是「這個 NPC 好像特別好脾氣」——沒有人會回報。
 * 現在性質由 persona 的規則自己宣告（npcCooperationEngine.js 的 rule.kind），
 * 這裡只剩「每一種性質值多少耐心」。
 */
const PATIENCE_BY_KIND = Object.freeze({
  hostile: -3,
  friction: -1,
  deescalation: +2,
  cooperation: +1,
  briefing: 0,
});

/** 引擎已知的 NPC 狀態 → 送進 prompt 的短標籤。不編造 HP 百分比，理由見 statusTag()。 */
const STATUS_LABELS = Object.freeze({
  alive: "無傷",
  met: "無傷",
  suspicious: "戒備",
  injured: "負傷",
  critical: "瀕危",
  dead: "已死亡",
  destroyed: "已失效",
  survived: "倖存",
  unknown: "未接觸",
});

/** 這些狀態的 NPC 不會出現在狀態行裡——已經不在場的人不需要每回合報一次心情。 */
const OFF_STAGE_STATUSES = new Set(["dead", "destroyed", "unknown"]);

/** 判定分級裡算「局勢往前走了」的那幾級。跟 referenceAdapter 的 SUCCESS_TIERS 同一組值。 */
const SUCCESS_TIERS = new Set(["大成功", "成功", "驚險成功"]);

/** 傷勢惡化的判斷順序；名次變高 = 更糟。用來偵測「這回合 NPC 受傷了」。 */
const STATUS_SEVERITY = Object.freeze({
  alive: 0, met: 0, survived: 0, suspicious: 1, injured: 2, critical: 3, destroyed: 4, dead: 4,
});

function clampAxis(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(SAEP_MIN, Math.min(SAEP_MAX, Math.round(num)));
}

function textOf(value) {
  return String(value ?? "").trim().slice(0, MAX_TEXT);
}

export function patienceLabel(pat) {
  const value = clampAxis(pat, SAEP_MIN);
  return (PATIENCE_LABELS.find((entry) => value <= entry.max) ?? PATIENCE_LABELS.at(-1)).label;
}

function referenceNpc(reference, npcId) {
  return (reference?.npcs ?? []).find((npc) => npc?.id === npcId) ?? null;
}

/**
 * 一個 NPC 的靜態人設：先看 reference 宣告，再看內建表，最後退回通用值。
 *
 * reference 優先是刻意的：新副本應該能只靠資料檔接上狀態機，不必來改這個檔案。
 */
export function npcProfile(reference, npcId) {
  const declared = referenceNpc(reference, npcId);
  const persona = personaFor(npcId);
  const saep = { ...DEFAULT_PROFILE.saep, ...(persona?.saep ?? {}), ...(declared?.saep ?? {}) };
  return {
    saep: Object.fromEntries(SAEP_AXIS_IDS.map((axis) => [axis, clampAxis(saep[axis], 5)])),
    taboo: declared?.taboo ?? persona?.taboo ?? null,
    // 偵測用的 pattern 只從人設檔拿，不吃 reference 宣告的字串：
    // reference 是 JSON，宣告出來的只會是字串，把使用者資料編譯成 RegExp 是一條
    // 不需要為了省事而開的口子。副本要改「顯示的禁忌文字」用 taboo 就夠了。
    tabooPatterns: persona?.tabooPatterns ?? [],
    selfPreservingStates: persona?.states?.selfPreserving ?? DEFAULT_PROFILE.selfPreservingStates,
    // 終局合作階段（第 0.6 階段宣告的那些）。動機引擎用它區分
    // 「他在警告你」跟「他已經走了」——兩者的演出完全不同。
    terminalStates: Object.keys(persona?.states?.stateFlags ?? {}),
    // Agenda 先看人設檔，再退回 reference 的 privateGoals[0]：兩者都是作者寫好的
    // canonical 目標，引擎不需要（也不應該）自己發明一個 NPC 想幹嘛。
    agenda: declared?.agenda ?? persona?.agenda ?? (Array.isArray(declared?.privateGoals) ? declared.privateGoals[0] : null),
    knowledge: Array.isArray(declared?.knowledge) ? declared.knowledge : [],
    // 動機只從人設檔拿，不吃 reference 宣告——理由同上面的 tabooPatterns：
    // persona 是程式碼，reference 是資料，讓資料決定「哪些條件成立」等於開一條後門。
    motivations: Array.isArray(persona?.motivations) ? persona.motivations : [],
    name: declared?.name ?? persona?.name ?? npcId,
  };
}

function freshEntry(profile) {
  return {
    SOC: profile.saep.SOC,
    ACT: profile.saep.ACT,
    EGO: profile.saep.EGO,
    PAT: profile.saep.PAT,
    // 已知情報只存「這一輪額外學到的」；基線知識每次從 reference 讀，不複製進存檔。
    learned: [],
    lastStatus: null,
    motive: null,
    tabooTrippedTurn: null,
    seizedTurn: null,
    stallStreak: 0,
    lastUpdatedTurn: 0,
  };
}

/** 開新局時的 runtime 狀態：reference 宣告的每個 NPC 各一份基線。 */
export function createNpcRuntimeState(reference) {
  const out = {};
  for (const npc of reference?.npcs ?? []) {
    if (!npc?.id) continue;
    out[npc.id] = freshEntry(npcProfile(reference, npc.id));
  }
  return out;
}

/** 存檔裡的回合序號欄位：不是合法的非負整數就當成「沒發生過」。 */
function storedTurn(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * 舊存檔沒有 npcRuntime、或 reference 換版新增了 NPC 時補成可用形狀；不重置已有數值。
 *
 * 逐欄位驗證而不是 `{ ...base, ...stored }`：spread 會把存檔裡的任何鍵原樣帶進來，
 * 而這個物件之後會被拿去組 prompt。壞掉的存檔（或有人手動改過的存檔）不該有機會
 * 讓一個 undefined 變成 prompt 裡的 "NaN"，或多出一個沒人預期的欄位。
 */
export function normalizeNpcRuntimeState(reference, raw) {
  const fresh = createNpcRuntimeState(reference);
  if (!raw || typeof raw !== "object") return fresh;
  const out = {};
  for (const [npcId, base] of Object.entries(fresh)) {
    const stored = raw[npcId];
    if (!stored || typeof stored !== "object") {
      out[npcId] = base;
      continue;
    }
    out[npcId] = {
      ...Object.fromEntries(SAEP_AXIS_IDS.map((axis) => [axis, clampAxis(stored[axis], base[axis])])),
      learned: Array.isArray(stored.learned)
        ? stored.learned.map(textOf).filter(Boolean).slice(-KNOWLEDGE_LIMIT * 2)
        : [],
      lastStatus: typeof stored.lastStatus === "string" ? stored.lastStatus : null,
      // 動機每回合重算，存下來只是為了讓「這回合沒跑狀態機」（NPC 不在場）時
      // 那一行不會忽然消失。舊存檔沒有這個欄位就是 null。
      motive: typeof stored.motive === "string" ? stored.motive : null,
      tabooTrippedTurn: storedTurn(stored.tabooTrippedTurn),
      seizedTurn: storedTurn(stored.seizedTurn),
      stallStreak: Number.isInteger(stored.stallStreak) ? Math.max(0, stored.stallStreak) : 0,
      lastUpdatedTurn: storedTurn(stored.lastUpdatedTurn) ?? 0,
    };
  }
  return out;
}

/** cooperation policy 這回合對這個 NPC 做出的判定；沒有就回 null。 */
function cooperationSignal(state, npcId, turnNumber) {
  const coop = state?.npcCooperation?.[npcId];
  if (!coop || typeof coop !== "object") return null;
  const fresh = Number.isInteger(turnNumber) && coop.lastUpdatedTurn === turnNumber;
  return {
    state: coop.state ?? null,
    interactionType: fresh ? coop.lastInteractionType ?? null : null,
    // [2026-08-31] 以前這裡是 `threatCount ?? boundaryIncidents ?? pressureIncidents`——
    // 三個名字指的是同一個概念，只因為四個 policy 各自命名。合作狀態統一之後
    // 只剩一個 incidents，這一行也就不需要再猜了。
    incidents: Math.max(0, Number(coop.incidents ?? 0) || 0),
    trust: Number(coop.trust ?? 0) || 0,
  };
}

/** 這一回合的互動屬於哪一種性質（由 persona 的規則宣告，見 npcCooperationEngine.js）。 */
function interactionKind(npcId, interactionType) {
  if (!interactionType) return null;
  const persona = personaFor(npcId);
  return persona?.rules?.find((rule) => rule.interactionType === interactionType)?.kind ?? null;
}

function statusOf(state, reference, npcId) {
  return state?.npcStatuses?.[npcId] ?? referenceNpc(reference, npcId)?.initialStatus ?? "unknown";
}

function tabooTripped(profile, actionText) {
  const text = String(actionText ?? "");
  if (!text) return false;
  return (profile.tabooPatterns ?? []).some((pattern) => pattern.test(text));
}

/**
 * 這一回合的 PAT 增減。
 *
 * 每一條都對應一個**引擎已經知道的事實**，沒有一條需要問 LLM：
 *   玩家在同一個場景耗太久 / 這回合根本沒有可判定的目標 / NPC 自己受傷了 /
 *   玩家對他動手 / 玩家踩到禁忌 / 玩家道歉或完成交辦 / 判定成功。
 *
 * 回傳 delta，不直接改狀態——這樣單一條規則可以獨立測試。
 */
function patienceDelta({ profile, kind, worsened, tripped, stallStreak, progressed, signals }) {
  let delta = 0;

  // 玩家長時間卡在同一個場景／同一個節點：NPC 是來逃命的，不是來陪你逛的。
  if (stallStreak >= 2) delta -= 1;
  if (stallStreak >= 4) delta -= 1;

  // 引擎判斷這一回合沒有「會失敗的目標」（見 content/checkIntent.js）＝ 演出、情緒或閒聊。
  // 偶爾一次是角色扮演，連著來就是在原地空轉，NPC 有權表現出來。
  if (signals.requiresCheck === false) delta -= 1;

  // NPC 自己這回合狀態變差。痛會直接吃掉耐心，這是最不需要解釋的一條。
  if (worsened) delta -= 2;

  if (tripped) delta -= 3;

  delta += PATIENCE_BY_KIND[kind] ?? 0;

  // 局勢真的往前走了。這是 PAT 唯一的自然回復來源——
  // 不給回復的話所有 NPC 最後都會停在爆炸狀態，那跟停在客服狀態一樣是壞掉的。
  if (progressed) delta += 1;

  // 回復上限鎖在基線：合作愉快不會讓一個本來就沒耐心的人變成聖人。
  return { delta, ceiling: profile.saep.PAT };
}

/**
 * SOC / ACT / EGO 每回合重新推導，而不是累加。
 *
 * 累加會 ratchet：同一件事發生二十次，數值就會撞到邊界回不來，NPC 從此定格在一種表情。
 * 改成「基線 + 當前修正」之後，玩家安撫下來，數值就真的會回去——這也讓它可以被測試釘住
 * （同樣的 state 一定得到同樣的四個數字）。PAT 是唯一有累積記憶的軸，這是刻意的對比。
 */
function deriveAxes(profile, { pat, coop }) {
  const selfPreserving = Boolean(coop?.state && profile.selfPreservingStates.includes(coop.state));
  const incidents = Math.min(3, coop?.incidents ?? 0);
  const trustBonus = (coop?.trust ?? 0) > 0 ? 1 : 0;
  return {
    // 社交意願：被冒犯過幾次就少說幾句話；耐心見底時幾乎不再解釋。
    SOC: clampAxis(profile.saep.SOC - incidents - (pat <= 3 ? 2 : 0) + trustBonus, profile.saep.SOC),
    // 行動主導權：玩家越不推進，NPC 越會自己動——這正是反客服的核心。
    ACT: clampAxis(profile.saep.ACT + (pat <= 2 ? 2 : 0) + (selfPreserving ? 1 : 0), profile.saep.ACT),
    // 利己主義：進入自保姿態時上升。上升的是「先顧自己」，不是「變成反派」。
    EGO: clampAxis(profile.saep.EGO + (pat <= 2 ? 2 : 0) + (selfPreserving ? 2 : 0), profile.saep.EGO),
  };
}

/**
 * 推進一回合的 NPC 狀態機，回傳新的 referenceState。
 *
 * 只吃引擎已經定案的事實（signals）與已經跑完的 cooperation policy 結果；
 * 不讀 LLM 的任何輸出，所以它在敘事生成**之前**就能算完，也不會被模型的話術影響。
 *
 * @param {object} params
 * @param {object} params.reference  canonical reference（提供 npcs[] 人設）
 * @param {object} params.state      referenceState，函式不會就地修改它
 * @param {number} params.turnNumber 這是第幾回合
 * @param {object} params.signals    引擎這回合的事實：
 *   requiresCheck / outcomeTier / matched / sceneTurnCount / stalledRounds / actionText / newClues
 * @returns {object} 新的 referenceState（npcRuntime 已更新）
 */
export function applyNpcRuntimeTurn({ reference, state, turnNumber = 0, signals = {} } = {}) {
  if (!reference || !state) return state;
  const runtime = normalizeNpcRuntimeState(reference, state.npcRuntime);
  // 「玩家在原地打轉」的兩個來源：節點卡關回合數（progress.js 算的，會在節點結算時歸零），
  // 以及在同一個 reference 場景待了多久（超過寬限窗才算）。取兩者較大的那個。
  const stalled = Math.max(
    Number.isInteger(signals.stalledRounds) ? signals.stalledRounds : 0,
    Number.isInteger(signals.sceneTurnCount) ? signals.sceneTurnCount - SCENE_PATIENCE_GRACE : 0
  );
  // 局勢真的往前走了就把壓力歸零：命中 canonical approach，或這一回合判定成功。
  // 少了這一條，長場景裡的耐心值只會單調下降，玩家做對事情也拉不回來。
  const progressed = Boolean(signals.matched) || SUCCESS_TIERS.has(signals.outcomeTier);
  const next = {};

  for (const [npcId, entry] of Object.entries(runtime)) {
    const profile = npcProfile(reference, npcId);
    const status = statusOf(state, reference, npcId);
    const coop = cooperationSignal(state, npcId, turnNumber);
    const onStage = onStageNpcIds(reference, state).includes(npcId);

    // 不在場的 NPC 不跑狀態機：他沒看到玩家在幹嘛，就不該因此變得不耐煩。
    // 只更新 lastStatus，避免玩家回頭再遇到他時把一整段離場期間的傷勢誤判成「這回合受傷」。
    if (!onStage) {
      next[npcId] = { ...entry, lastStatus: status };
      continue;
    }

    const worsened =
      entry.lastStatus !== null &&
      (STATUS_SEVERITY[status] ?? 0) > (STATUS_SEVERITY[entry.lastStatus] ?? 0);
    const tripped = tabooTripped(profile, signals.actionText);
    const stallStreak = progressed ? 0 : Math.min(9, Math.max(0, stalled));

    const kind = interactionKind(npcId, coop?.interactionType);
    const { delta, ceiling } = patienceDelta({ profile, signals, kind, worsened, tripped, stallStreak, progressed });
    let pat = clampAxis(Math.min(entry.PAT + delta, Math.max(entry.PAT, ceiling)), entry.PAT);

    // 上一回合已經奪過權：張力洩掉一截，這回合不會再打斷一次。見 SEIZE_CONTROL_REBOUND。
    const justSeized = entry.seizedTurn !== null && entry.seizedTurn === turnNumber - 1;
    if (justSeized) pat = clampAxis(pat + SEIZE_CONTROL_REBOUND, pat);

    const seizing = pat <= SEIZE_CONTROL_AT;
    const axes = deriveAxes(profile, { pat, coop });

    // 這一刻哪一條動機占優勢。只讀引擎已經算出來的事實——
    // 合作階段、迫近度階段、耐心值、NPC 狀態、這回合有沒有踩到禁忌。
    // signals.threatStage 由呼叫端從 progress.threat 帶進來（迫近度不住在 referenceState）。
    const motive = selectMotive(profile, {
      coopState: coop?.state ?? null,
      threatStage: signals.threatStage ?? null,
      selfPreserving: isSelfPreserving(profile, coop),
      terminalStance: Boolean(coop?.state && profile.terminalStates.includes(coop.state)),
      tabooTripped: tripped,
      pat,
      status,
    });

    next[npcId] = {
      ...entry,
      ...axes,
      PAT: pat,
      motive,
      learned: mergeLearned(entry.learned, signals.newClues),
      lastStatus: status,
      tabooTrippedTurn: tripped ? turnNumber : entry.tabooTrippedTurn,
      seizedTurn: seizing ? turnNumber : entry.seizedTurn,
      stallStreak,
      lastUpdatedTurn: turnNumber,
    };
  }

  return { ...state, npcRuntime: next };
}

/** 在場的 NPC 跟著玩家看到同一批線索——情報差只在「不在場」時才成立。 */
function mergeLearned(existing, newClues) {
  if (!Array.isArray(newClues) || newClues.length === 0) return existing;
  const merged = [...existing];
  for (const clue of newClues) {
    const text = textOf(clue);
    if (text && !merged.includes(text)) merged.push(text);
  }
  return merged.slice(-KNOWLEDGE_LIMIT * 2);
}

/**
 * Status 標籤。
 *
 * 刻意**不**輸出「HP 80%」這種百分比：引擎從來沒有替 NPC 記過血量，
 * 生一個數字出來就是編造數值（AGENTS.md 不可協商規則第 1 條），
 * 而且模型會很樂意把它寫進敘事，變成玩家看得到的假事實。
 * 這裡只送引擎真的知道的東西：reference 判定過的狀態軸。
 */
function statusTag(state, reference, npcId) {
  const status = statusOf(state, reference, npcId);
  return STATUS_LABELS[status] ?? status;
}

/** 他這一刻放棄了 Agenda 基線、先顧自己嗎？基線本身在靜態契約裡。 */
function isSelfPreserving(profile, coop) {
  return Boolean(coop?.state && profile.selfPreservingStates.includes(coop.state));
}

/**
 * 他在這一局裡**額外**學到的東西。
 *
 * 只回傳增量：白名單基線（reference 宣告的 knowledge）已經在靜態契約裡整場付過一次，
 * 每回合再抄一遍是這一行原本 40% 的體積。
 */
function learnedBeyondBaseline(entry) {
  return (entry.learned ?? []).map(textOf).filter(Boolean).slice(-KNOWLEDGE_LIMIT);
}

/**
 * 【動態層 · 最頂端】把狀態機算出來的數字壓成極短的一行一 NPC。
 *
 * 為什麼放在動態層的**最頂端**而不是尾端：這一段是這回合所有演出決策的前提，
 * 模型讀提示是有順序偏誤的，前提放在 DM 備忘錄、事件日誌、玩家輸入之後，
 * 等於要它讀完一整頁再回頭修正語氣。放最前面，後面每一段都在這個框架下被解讀。
 *
 * 為什麼不含軸的定義：那是 NPC_STATE_LEGEND 的事，它整場不變，住在靜態層。
 *
 * @returns {string} 沒有任何在場 NPC 時回傳 ""（呼叫端就不放這一段）
 */
export function buildNpcActiveStateBlock(reference, state) {
  if (!reference || !state) return "";
  const runtime = normalizeNpcRuntimeState(reference, state.npcRuntime);
  const lines = [];

  for (const npcId of onStageNpcIds(reference, state)) {
    const entry = runtime[npcId];
    if (!entry) continue;
    const status = statusOf(state, reference, npcId);
    if (OFF_STAGE_STATUSES.has(status)) continue;

    const profile = npcProfile(reference, npcId);
    const coop = cooperationSignal(state, npcId, entry.lastUpdatedTurn);

    const fields = [
      `SAEP: [${entry.SOC}, ${entry.ACT}, ${entry.EGO}, ${entry.PAT}(${patienceLabel(entry.PAT)})]`,
      `Status: "${statusTag(state, reference, npcId)}"`,
    ];
    // [2026-08-31] Stance / Beat 是併進來的合作狀態。以前它們各自住在一個
    // 600 字的 <NPC_Cooperation_Contract> 動態區塊裡，而那個區塊有九成是整場不變的
    // 規則文字——那些已經搬進靜態層的 NPC_COOPERATION_CONTRACT。
    // 每回合真的會變的就是這兩個字串，所以併進這一行，不再自成一段。
    if (coop?.state) fields.push(`Stance: "${coop.state}"`);
    if (coop?.interactionType) fields.push(`Beat: "${coop.interactionType}"`);
    // [2026-09-01 第五階段] 這一刻最強的行為動力。**只送 ID**——
    // 動機的內容（為什麼、要做什麼、有什麼好處）整場不變，住在靜態契約的固定檔案裡。
    // 一條都不成立時整個欄位不出現：「沒有特別強的動力」跟「有動力但算不出來」
    // 不是同一件事，不要用預設值把兩者蓋成一樣。
    if (entry.motive) fields.push(`Motive: "${entry.motive}"`);
    // [2026-08-31 第二輪] Agenda / Taboo / Knowledge 的**基線**搬進了靜態契約
    // （buildNpcCooperationContract），這裡只送偏離基線的覆寫標記。
    // 這三個欄位原本佔這一行的 40%，而它們幾乎不動——同一種病的第二次發作。
    const learned = learnedBeyondBaseline(entry);
    if (learned.length) fields.push(`+Known: "${learned.join("／")}"`);
    if (isSelfPreserving(profile, coop)) fields.push(`Agenda: "SELF_PRESERVE"`);
    if (profile.taboo && entry.tabooTrippedTurn !== null && entry.tabooTrippedTurn === entry.lastUpdatedTurn) {
      fields.push(`Taboo: "TRIPPED"`);
    }
    // 奪權旗標只在真的觸發的那一回合出現。常駐的話模型會把它當背景噪音忽略掉，
    // 這正是「指令超載」的成因——旗標要稀有才有力量。
    if (entry.seizedTurn !== null && entry.seizedTurn === entry.lastUpdatedTurn) {
      fields.push(`Override: "SEIZE_CONTROL"`);
    }
    lines.push(`[NPC_ACTIVE_STATE] ${profile.name}: { ${fields.join(", ")} }`);
  }

  return lines.join("\n");
}

/**
 * 【靜態層】怎麼讀上面那幾行數字。
 *
 * 整場遊戲逐字不變，所以它住在 system message、每回合命中快取。
 * 動態層只送數字，這一段解釋數字的意思——這是這個設計最省成本的一刀：
 * 幾百字的說明付一次，每回合只付幾十個 token 的數值。
 */
export const NPC_STATE_LEGEND = `【NPC 狀態矩陣的讀法（動態層每回合會送出 [NPC_ACTIVE_STATE] 開頭的資料行）】
每一行是一個在場 NPC 由伺服器算出的當前狀態。這些數字是**演出指示**，不是可以說出口的資訊。

SAEP 四個軸，範圍 0-10，順序固定是 [SOC, ACT, EGO, PAT]：
- SOC 社交意願：他這一刻願意說多少話。低於 4 就別讓他寒暄、別讓他多做解釋——
  該講的一句講完就閉嘴，其餘用動作與姿態代替台詞。
- ACT 行動主導權：他自己動手的傾向。高於 7 代表他會先動再說，不會等玩家決定。
- EGO 利己主義：衝突時他先顧誰。高於 7 代表他會保留情報、保留資源、先站到安全的位置。
- PAT 耐心值：這是最會變的一個軸，後面括號裡是它的標籤：
  Calm 正常對話／Steady 正常合作／Impatient 開始催促，句子變短、重複的問題不再回答／
  Irritated 明顯不耐煩，會打斷、會直接下命令／Breaking 已經在爆發邊緣。

其餘欄位：
- Status：引擎判定過的生理與異常狀態。只能照這個寫，不可以自行加重或減輕。

以下三個欄位**只在偏離基線時才出現**。基線寫在系統提示的「本副本 NPC 的固定檔案」裡，
沒有出現覆寫標記就照那份檔案演：
- 「+Known」：他在這一局裡額外學到的東西，接在他的 Knowledge 白名單基線後面。
  白名單以外的事他就是不知道，不可以從他口中說出來、暗示或旁敲側擊地透露——這是防劇透的硬性規定。
- 「Agenda: SELF_PRESERVE」：他這一刻放棄了自己的 Agenda 基線，先顧自己。
  這不代表他變成反派，是他不再為玩家承擔風險。
- 「Taboo: TRIPPED」：玩家這一回合剛好踩到他的禁忌。這一回合必須出現明確的敵意反應
  （拒絕、警告、拉開距離或收回支援），不可以輕輕帶過。
- Stance：他目前的合作階段（由伺服器裁定）。階段只描述**他願意怎麼配合**，
  不描述世界發生了什麼；不可以把階段名稱、或「他現在進入自保狀態」這種說法寫進敘事。
- Beat：伺服器認出的、玩家這一回合對他做的事。用它決定他這一句話回應的是什麼，
  不要把分類名稱本身寫出來。
- Motive：伺服器裁定的、他這一刻**最強的行為動力**。它的內容寫在系統提示的
  「本副本 NPC 的固定檔案」裡那份動機清單，照那一條的「行為」演。
  它決定的是他**先做什麼、先講什麼**——資訊的優先序，不是台詞。
  措辭、語氣、篇幅、動作仍然完全由你決定；同一條動機可以有一百種演法。
  沒有出現這個欄位，代表這一刻沒有哪一條動機特別強，照人設與 Stance 演就好。
- Override: "SEIZE_CONTROL"：耐心已經見底。這一回合他**必須**主動奪走場面主導權：
  打斷玩家的話、直接下令、或不等玩家回應就自己行動。

這些欄位名、數字與標籤本身**絕對不可以出現在敘事裡**，也不可以被翻譯成
「他的耐心值只剩兩點」這種說法。玩家只會看到一個不耐煩的人，看不到儀表板。`;

// 所有已登記人設的動機條件，在模組載入時就驗一遍。
//
// 為什麼在這裡而不是 npcCooperationEngine 的 assertPersona()：那個引擎刻意零 import，
// 而條件查表住在這個檔案；engine → npcStateMachine → npcPersonaRegistry →
// *CooperationPolicy → engine 會形成一個 import 循環。
// 這裡做同樣的事，而且一樣是「部署當下就炸掉」——拼錯一個條件 token 的症狀是
// 「這條動機永遠不會被選中」，不會壞、不會有測試變紅，只會讓那個角色少一種行為模式。
for (const persona of NPC_PERSONAS) assertMotivePredicates(persona);
