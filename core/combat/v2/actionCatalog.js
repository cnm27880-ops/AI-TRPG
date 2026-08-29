// Combat V2 —— 行動目錄（規格第6節的 action schema）。
//
// 這是**唯一**定義「有哪些行動、各消耗什麼、要在什麼距離用」的地方。前端拿到的每一張
// 行動卡都是從這裡長出來的，而且前端送回來的 payload 只有 actionId/targetId/parameters
// （規格第6.3節）——cost、actionType、距離全部在這裡重查一次，前端送什麼都不算數。
//
// 每一條的欄位：
//   id               行動識別
//   label            玩家看到的名字
//   category         分類（規格第6.1節的七類）
//   actionType       五類動作之一；cost 由 actionTypes.costOf() 導出，不手寫，
//                    這樣就不可能出現「actionType 是 standard 但 cost 寫成 move」的資料錯誤
//   validRanges      允許的距離；空陣列＝不受距離限制
//   targetMode       作用對象
//   requirements     宣告式前置條件，由 availableActions.js 逐條檢查並翻成公開原因
//   display          給玩家看的說明/提示/風險（**不含任何秘密數值**，規格第6.2節）
//   resolutionKey    對應 resolveAction.js 裡的結算函式
//   resolutionPhase  結算排序用（規格第5.2節：移動 -> 環境 -> 戰術 -> 攻擊 -> 支援）
//   rangeEffect      這個行動會把距離變成什麼（宣告式）。有它才能在**玩家還在選**的時候
//                    就算出「這一輪的移動會讓後面的射擊變得不合法」——見 availableActions.js
//                    的 projectRanges()。沒有它的話，玩家會選到一個選單顯示可用、
//                    但結算時因為移動先發生而必定落空的組合。

import { ACTION_TYPES, costOf } from "./actionTypes.js";

/** 分類（規格第6.1節）。 */
export const ACTION_CATEGORIES = Object.freeze({
  OFFENSE: "offense",
  MOVEMENT: "movement",
  DEFENSE: "defense",
  TACTICS: "tactics",
  ENVIRONMENT: "environment",
  ITEM: "item",
  SPECIAL: "special",
});

export const ACTION_CATEGORY_LABELS = Object.freeze({
  offense: "攻擊",
  movement: "移動",
  defense: "防守",
  tactics: "戰術",
  environment: "環境",
  item: "物品",
  special: "特殊能力",
});

/** 作用對象。 */
export const TARGET_MODES = Object.freeze({
  SINGLE_ENEMY: "single_enemy",
  SELF: "self",
  ALLY: "ally",
  FEATURE: "feature",
  NONE: "none",
});

/**
 * 結算相位與其順序（規格第5.2節第6~9點）。玩家一次選好幾個行動時，**順序由伺服器決定**，
 * 不是前端送上來的陣列順序——否則玩家可以靠調換順序把「先射擊再接近」變成
 * 「先接近再射擊」，繞過距離限制。
 */
export const RESOLUTION_PHASES = Object.freeze(["movement", "environment", "tactical", "offense", "support"]);

/** 內部目錄。用陣列而不是物件是為了讓「顯示順序」有唯一答案。 */
const CATALOG = [
  // --- 攻擊 ---
  {
    id: "melee_strike",
    label: "近戰攻擊",
    category: ACTION_CATEGORIES.OFFENSE,
    actionType: ACTION_TYPES.STANDARD,
    validRanges: ["close"],
    targetMode: TARGET_MODES.SINGLE_ENEMY,
    requirements: { weaponCategory: "melee" },
    display: {
      description: "以近戰武器或徒手攻擊一名接觸距離內的敵人。",
      hint: "只能在近距離使用。",
      risk: "貼身作戰會讓你更容易被反擊。",
    },
    resolutionKey: "resolve_melee_strike",
    resolutionPhase: "offense",
  },
  {
    id: "firearm_shot",
    label: "射擊",
    category: ACTION_CATEGORIES.OFFENSE,
    actionType: ACTION_TYPES.STANDARD,
    validRanges: ["medium", "far"],
    targetMode: TARGET_MODES.SINGLE_ENEMY,
    requirements: { weaponCategory: "firearm", ammunition: 1 },
    display: {
      description: "使用目前裝備的槍械攻擊一名可見敵人。",
      hint: "距離越遠可能影響命中率。",
      risk: "槍聲可能引起更高威脅。",
    },
    resolutionKey: "resolve_firearm_shot",
    resolutionPhase: "offense",
  },
  {
    id: "grapple",
    label: "擒抱",
    category: ACTION_CATEGORIES.OFFENSE,
    actionType: ACTION_TYPES.STANDARD,
    validRanges: ["close"],
    targetMode: TARGET_MODES.SINGLE_ENEMY,
    requirements: {},
    display: {
      description: "壓制一名接觸距離內的敵人，讓牠這一輪難以行動。",
      hint: "不造成傷害，但會限制目標。",
      risk: "壓制期間你也離不開對方。",
    },
    resolutionKey: "resolve_grapple",
    resolutionPhase: "offense",
  },
  {
    id: "suppressing_fire",
    label: "壓制射擊",
    category: ACTION_CATEGORIES.OFFENSE,
    actionType: ACTION_TYPES.FULL_ROUND,
    validRanges: ["medium", "far"],
    targetMode: TARGET_MODES.SINGLE_ENEMY,
    requirements: { weaponCategory: "firearm", ammunition: 3 },
    display: {
      description: "連續傾瀉火力，壓住目標的行動。",
      hint: "整輪動作：同時消耗移動與標準動作。",
      risk: "消耗大量彈藥。",
    },
    resolutionKey: "resolve_suppressing_fire",
    resolutionPhase: "offense",
  },
  {
    id: "all_out_assault",
    label: "全力突擊",
    category: ACTION_CATEGORIES.OFFENSE,
    actionType: ACTION_TYPES.FULL_TURN,
    validRanges: ["close", "medium"],
    targetMode: TARGET_MODES.SINGLE_ENEMY,
    requirements: { weaponCategory: "melee" },
    display: {
      description: "把整個回合投進一次不留餘力的突擊：先撲進接觸距離，再全力打擊。",
      hint: "全回合動作：同時消耗迅捷、移動與標準動作。",
      risk: "出手之後你完全沒有防備。",
    },
    rangeEffect: { set: "close" },
    resolutionKey: "resolve_all_out_assault",
    resolutionPhase: "offense",
  },

  // --- 移動 ---
  {
    id: "advance",
    label: "接近",
    category: ACTION_CATEGORIES.MOVEMENT,
    actionType: ACTION_TYPES.MOVE,
    validRanges: ["medium", "far"],
    targetMode: TARGET_MODES.SINGLE_ENEMY,
    requirements: {},
    display: {
      description: "朝目標拉近一格距離。",
      hint: "一次移動只能改變一格距離。",
      risk: "接近會讓你進入對方的攻擊範圍。",
    },
    rangeEffect: { direction: "closer", steps: 1 },
    resolutionKey: "resolve_advance",
    resolutionPhase: "movement",
  },
  {
    id: "withdraw",
    label: "拉開距離",
    category: ACTION_CATEGORIES.MOVEMENT,
    actionType: ACTION_TYPES.MOVE,
    validRanges: ["close", "medium"],
    targetMode: TARGET_MODES.SINGLE_ENEMY,
    requirements: {},
    display: {
      description: "遠離目標一格距離。",
      hint: "一次移動只能改變一格距離。",
      risk: "背對敵人移動有風險。",
    },
    rangeEffect: { direction: "away", steps: 1 },
    resolutionKey: "resolve_withdraw",
    resolutionPhase: "movement",
  },
  {
    id: "flank",
    label: "繞側翼",
    category: ACTION_CATEGORIES.MOVEMENT,
    actionType: ACTION_TYPES.MOVE,
    validRanges: ["close", "medium"],
    targetMode: TARGET_MODES.SINGLE_ENEMY,
    requirements: {},
    display: {
      description: "繞到目標的側面，讓這一輪的攻擊更容易奏效。",
      hint: "側翼優勢只持續到本輪結束。",
      risk: "移動途中你會離開掩體。",
    },
    resolutionKey: "resolve_flank",
    resolutionPhase: "movement",
  },
  {
    id: "sprint_retreat",
    label: "全速撤離",
    category: ACTION_CATEGORIES.MOVEMENT,
    actionType: ACTION_TYPES.FULL_ROUND,
    validRanges: ["close", "medium"],
    targetMode: TARGET_MODES.NONE,
    requirements: {},
    display: {
      description: "放棄攻擊，一口氣拉開兩格距離。",
      hint: "整輪動作：同時消耗移動與標準動作，可跨越兩格距離。",
      risk: "撤離期間完全無法還手。",
    },
    rangeEffect: { direction: "away", steps: 2, allTargets: true },
    resolutionKey: "resolve_sprint_retreat",
    resolutionPhase: "movement",
  },

  // --- 防守 ---
  {
    id: "take_cover",
    label: "尋找掩體",
    category: ACTION_CATEGORIES.DEFENSE,
    actionType: ACTION_TYPES.MOVE,
    validRanges: [],
    targetMode: TARGET_MODES.FEATURE,
    requirements: { featureTag: "cover" },
    display: {
      description: "移動到可以擋住身形的物件後方。",
      hint: "掩體會提高你被命中的難度，直到你離開它。",
      risk: "待在原地不動也會讓敵人有時間接近。",
    },
    resolutionKey: "resolve_take_cover",
    resolutionPhase: "movement",
  },
  {
    id: "hunker_down",
    label: "降低身形",
    category: ACTION_CATEGORIES.DEFENSE,
    actionType: ACTION_TYPES.SWIFT,
    validRanges: [],
    targetMode: TARGET_MODES.SELF,
    requirements: {},
    display: {
      description: "壓低重心縮小受擊面，本輪較難被命中。",
      hint: "迅捷動作，可以跟其他行動同一輪使用。",
      risk: "壓低身形會讓你這一輪的攻擊比較勉強。",
    },
    resolutionKey: "resolve_hunker_down",
    resolutionPhase: "tactical",
  },
  {
    id: "hold_entry",
    label: "守住入口",
    category: ACTION_CATEGORIES.DEFENSE,
    actionType: ACTION_TYPES.STANDARD,
    validRanges: ["medium", "far"],
    targetMode: TARGET_MODES.FEATURE,
    requirements: { featureTag: "door" },
    display: {
      description: "把武器指向入口，阻止任何人從那裡進來。",
      hint: "本輪敵人從該入口逼近時會被拖慢。",
      risk: "你的注意力會被綁在那個方向。",
    },
    resolutionKey: "resolve_hold_entry",
    resolutionPhase: "tactical",
  },

  // --- 戰術 ---
  {
    id: "focus_aim",
    label: "集中火力",
    category: ACTION_CATEGORIES.TACTICS,
    actionType: ACTION_TYPES.SWIFT,
    validRanges: [],
    targetMode: TARGET_MODES.SINGLE_ENEMY,
    requirements: {},
    display: {
      description: "先鎖定目標，本輪對牠的攻擊更容易奏效。",
      hint: "迅捷動作，本輪有效。",
      risk: "專注在一個目標會讓你忽略其他方向。",
    },
    resolutionKey: "resolve_focus_aim",
    resolutionPhase: "tactical",
  },
  {
    id: "cover_ally",
    label: "掩護隊友",
    category: ACTION_CATEGORIES.TACTICS,
    actionType: ACTION_TYPES.STANDARD,
    validRanges: [],
    targetMode: TARGET_MODES.ALLY,
    requirements: { ally: true },
    display: {
      description: "用火力壓住敵人，讓隊友能安全行動。",
      hint: "需要一名還能行動的隊友。",
      risk: "掩護期間你自己沒有防備。",
    },
    resolutionKey: "resolve_cover_ally",
    resolutionPhase: "support",
  },
  {
    id: "assess_enemy",
    label: "觀察敵情",
    category: ACTION_CATEGORIES.TACTICS,
    actionType: ACTION_TYPES.SWIFT,
    validRanges: [],
    targetMode: TARGET_MODES.SINGLE_ENEMY,
    requirements: {},
    display: {
      description: "花一瞬間讀取目標的動作與姿態。",
      hint: "會在戰鬥紀錄留下你能判斷出來的線索。",
      risk: "觀察的那一瞬間你沒有在防備。",
    },
    resolutionKey: "resolve_assess_enemy",
    resolutionPhase: "tactical",
  },

  // --- 環境 ---
  {
    id: "env_close_door",
    label: "關閉艙門",
    category: ACTION_CATEGORIES.ENVIRONMENT,
    actionType: ACTION_TYPES.MOVE,
    validRanges: [],
    targetMode: TARGET_MODES.FEATURE,
    requirements: { featureTag: "door", featureState: "ready" },
    display: {
      description: "關上艙門，切斷這個方向的通路。",
      hint: "只能在構得到艙門的距離操作。",
      risk: "關上之後你自己也走不了那條路。",
    },
    resolutionKey: "resolve_env_close_door",
    resolutionPhase: "environment",
  },
  {
    id: "env_cut_lights",
    label: "切斷照明",
    category: ACTION_CATEGORIES.ENVIRONMENT,
    actionType: ACTION_TYPES.STANDARD,
    validRanges: [],
    targetMode: TARGET_MODES.FEATURE,
    requirements: { featureTag: "lighting", featureState: "ready" },
    display: {
      description: "切掉這一區的照明，讓所有人都難以瞄準。",
      hint: "需要先站到控制面板前。",
      risk: "黑暗對你跟對敵人一樣。",
    },
    resolutionKey: "resolve_env_cut_lights",
    resolutionPhase: "environment",
  },
  {
    id: "env_drop_crane",
    label: "啟動吊臂",
    category: ACTION_CATEGORIES.ENVIRONMENT,
    actionType: ACTION_TYPES.FULL_ROUND,
    validRanges: [],
    targetMode: TARGET_MODES.FEATURE,
    requirements: { featureTag: "machinery", featureState: "ready" },
    display: {
      description: "讓吊臂上的載重砸向下方的敵人。",
      hint: "整輪動作：同時消耗移動與標準動作。",
      risk: "操作期間你完全暴露在外。",
    },
    resolutionKey: "resolve_env_drop_crane",
    resolutionPhase: "environment",
  },

  // --- 物品 ---
  {
    id: "reload",
    label: "換彈",
    category: ACTION_CATEGORIES.ITEM,
    actionType: ACTION_TYPES.MOVE,
    validRanges: [],
    targetMode: TARGET_MODES.SELF,
    requirements: { weaponCategory: "firearm", spareMagazine: 1 },
    display: {
      description: "換上新的彈匣。",
      hint: "移動動作；標準動作可以轉化來做這件事。",
      risk: "換彈的那幾秒你打不出子彈。",
    },
    resolutionKey: "resolve_reload",
    resolutionPhase: "environment",
  },
  {
    id: "use_medkit",
    label: "使用醫療包",
    category: ACTION_CATEGORIES.ITEM,
    actionType: ACTION_TYPES.STANDARD,
    validRanges: [],
    targetMode: TARGET_MODES.SELF,
    requirements: { item: "medkit" },
    display: {
      description: "在戰鬥中緊急處理身上的傷勢。",
      hint: "標準動作，只能處理沖擊與嚴重傷勢。",
      risk: "包紮的時候你沒有辦法防禦。",
    },
    resolutionKey: "resolve_use_medkit",
    resolutionPhase: "support",
  },
  {
    id: "drop_item",
    label: "丟棄物品",
    category: ACTION_CATEGORIES.ITEM,
    actionType: ACTION_TYPES.SWIFT,
    validRanges: [],
    targetMode: TARGET_MODES.SELF,
    requirements: { item: "medkit" },
    display: {
      description: "把手上的東西丟開，空出雙手。",
      hint: "迅捷動作。",
      risk: "丟掉的東西這場戰鬥就撿不回來了。",
    },
    resolutionKey: "resolve_drop_item",
    resolutionPhase: "support",
  },
];

/** 目錄的完整清單。每一條都補上由 actionType 導出的 cost。 */
export const ACTION_CATALOG = Object.freeze(
  CATALOG.map((entry) => Object.freeze({ ...entry, cost: Object.freeze(costOf(entry.actionType)) }))
);

const BY_ID = new Map(ACTION_CATALOG.map((entry) => [entry.id, entry]));

/** 查一條行動定義。查不到回 null——伺服器要能明確回「這個 action 不存在」（規格第10節）。 */
export function getActionDefinition(actionId) {
  return BY_ID.get(actionId) ?? null;
}

/** 結算排序用的相位序號。 */
export function resolutionPhaseIndex(entry) {
  const index = RESOLUTION_PHASES.indexOf(entry.resolutionPhase);
  return index < 0 ? RESOLUTION_PHASES.length : index;
}
