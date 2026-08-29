// Combat V2 —— 五類動作的定義、階層與轉化關係。
//
// [範圍宣告] 這是 Combat V2 的規則契約，跟舊的 core/combat/actionEconomy.js **沒有關係**，
// 也刻意不 import 它。舊模組帶著 reflex(反射動作)／prepared(準備動作)／focus(專注) 三個
// 機制，Combat V2 規格第3節明令不採用玩家反應窗口；把兩者接在一起只會讓「這一版到底
// 有沒有反應動作」變成要讀兩個檔案才能回答的問題。舊模組原封不動留著給舊戰鬥流程用，
// 見 core/combat/V2_ISOLATION.md。
//
// 五類動作：
//   swift      迅捷動作     每回合 1 個，低負荷、快速完成的行動
//   move       移動動作     每回合 1 個，移動/取物/改變戰術位置
//   standard   標準動作     每回合 1 個，主要攻擊、技能、醫療、壓制
//   fullRound  整輪動作     組合：standard + move（原子消耗）
//   fullTurn   全回合動作   組合：swift + move + standard（原子消耗）
//
// fullRound/fullTurn **不是第六、第七種資源**（規格第12節第5點）。它們沒有自己的池子，
// 只有一份「要同時扣掉哪幾個基礎池」的組合表，見 COMPOSITE_COST。

/** 五類動作的識別字串。UI 與 API 一律用這些值，不接受中文當 key。 */
export const ACTION_TYPES = Object.freeze({
  SWIFT: "swift",
  MOVE: "move",
  STANDARD: "standard",
  FULL_ROUND: "fullRound",
  FULL_TURN: "fullTurn",
});

/** 五類動作的完整清單（顯示順序＝規格第7.1節E區的分組順序）。 */
export const ACTION_TYPE_LIST = Object.freeze([
  ACTION_TYPES.SWIFT,
  ACTION_TYPES.MOVE,
  ACTION_TYPES.STANDARD,
  ACTION_TYPES.FULL_ROUND,
  ACTION_TYPES.FULL_TURN,
]);

/**
 * 真正存在「額度」的三個池子。整輪與全回合不在這裡——它們消耗的是這三個池子。
 */
export const BASE_POOLS = Object.freeze([
  ACTION_TYPES.SWIFT,
  ACTION_TYPES.MOVE,
  ACTION_TYPES.STANDARD,
]);

/** 每回合的基礎額度（規格第2節）。 */
export const BASE_BUDGET = Object.freeze({ swift: 1, move: 1, standard: 1 });

/**
 * 動作階層。數字越大越「高階」，轉化只能由高階往低階（規格第2.1節）：
 *   standard(3) -> move(2) -> swift(1)
 *   standard(3) -> swift(1)
 */
export const ACTION_RANK = Object.freeze({ swift: 1, move: 2, standard: 3 });

/**
 * 單向轉化表：某個池子的額度可以拿去當哪些「較低階的動作」用。
 * 反向一律不成立——swift 不能當 move 用，move 不能當 standard 用。
 */
export const CONVERSIONS = Object.freeze({
  standard: Object.freeze(["move", "swift"]),
  move: Object.freeze(["swift"]),
  swift: Object.freeze([]),
});

/** 組合動作要同時扣掉的基礎池（原子消耗，見 actionBudget.js 的 spendAction）。 */
export const COMPOSITE_COST = Object.freeze({
  fullRound: Object.freeze({ swift: 0, move: 1, standard: 1 }),
  fullTurn: Object.freeze({ swift: 1, move: 1, standard: 1 }),
});

/** UI 文案。`swift` 一律是「迅捷動作」，**不得翻成「反應」**（規格第3節注意事項）。 */
export const ACTION_TYPE_LABELS = Object.freeze({
  swift: "迅捷動作",
  move: "移動動作",
  standard: "標準動作",
  fullRound: "整輪動作",
  fullTurn: "全回合動作",
});

/** 組合動作在行動卡上要顯示的那一句消耗說明（規格第7.1節B區）。 */
export const ACTION_TYPE_COST_HINTS = Object.freeze({
  swift: "消耗迅捷",
  move: "消耗移動",
  standard: "消耗標準",
  fullRound: "消耗移動＋標準",
  fullTurn: "消耗迅捷＋移動＋標準",
});

export function isActionType(value) {
  return ACTION_TYPE_LIST.includes(value);
}

export function isBasePool(value) {
  return BASE_POOLS.includes(value);
}

export function isCompositeActionType(value) {
  return value === ACTION_TYPES.FULL_ROUND || value === ACTION_TYPES.FULL_TURN;
}

/**
 * `from` 這個池子的額度能不能拿去做一個 `to` 類型的動作。
 * 同類永遠可以（那不叫轉化）；跨類只有高階往低階成立。
 */
export function canConvert(from, to) {
  if (!isBasePool(from) || !isBasePool(to)) return false;
  if (from === to) return true;
  return CONVERSIONS[from].includes(to);
}

/**
 * 一個動作類型的**帳面消耗**，形狀固定是 { swift, move, standard }。
 *
 * 這是回給前端顯示用的，也是伺服器唯一承認的 cost —— 前端送上來的 cost 欄位一律忽略
 * （規格第6.3節）。基礎動作的帳面消耗記在自己的池子上；實際扣哪個池子由
 * actionBudget.planSpend() 依當下額度決定（可能發生轉化），兩者不一定相同。
 */
export function costOf(actionType) {
  if (isCompositeActionType(actionType)) return { ...COMPOSITE_COST[actionType] };
  if (!isBasePool(actionType)) throw new Error(`未知的動作類型：${actionType}`);
  return { swift: 0, move: 0, standard: 0, [actionType]: 1 };
}

/**
 * 一個組合動作會鎖住哪些基礎池（UI 的 locked 狀態，規格第7.2節第2、3點）。
 * 整輪鎖 move/standard，迅捷仍可選；全回合三個都鎖。
 */
export function poolsLockedBy(actionType) {
  if (!isCompositeActionType(actionType)) return [];
  const cost = COMPOSITE_COST[actionType];
  return BASE_POOLS.filter((pool) => cost[pool] > 0);
}

/**
 * 舊資料的動作等級 → Combat V2 的五類動作。
 *
 * [這是一層暫時的轉接，不是規則。] 商品型錄（content/packs/shopStarterPacks.js）的
 * `effect.activation.action` 目前寫的是舊戰鬥流程的六個等級，其中「自由」在 Combat V2
 * **不存在**——規格第3節把自由動作連同反應窗口一起排除了。
 *
 * 「自由」映成迅捷，不是映成零消耗，理由有二：
 *   1. 規格第2節把每回合的額度定死在 1/1/1，「不佔任何額度的動作」正是被拿掉的那一類；
 *      留一個零消耗的後門等於在五類之外偷偷開第六類。
 *   2. 鬼魅身的**維持成本**也是自由動作、每輪收一次。自由若等於零消耗，那件商品
 *      每輪的代價會整個消失，它就從「要一直付錢的型態」變成一次性的永久增益。
 *
 * 代價是三件用自由動作啟動的商品在 V2 裡變貴了（本來不佔額度，現在佔 1 迅捷）。
 * 這是刻意的取捨：**戰鬥系統是基準，商品往它對齊**，而不是反過來讓規則遷就佔位資料。
 * 商品型錄之後改寫成直接使用 V2 的五類動作時，這張表就可以整個刪掉。
 */
export const LEGACY_ACTION_LEVEL_TO_V2 = Object.freeze({
  自由: ACTION_TYPES.SWIFT,
  迅捷: ACTION_TYPES.SWIFT,
  移動: ACTION_TYPES.MOVE,
  標準: ACTION_TYPES.STANDARD,
  整輪: ACTION_TYPES.FULL_ROUND,
  全回合: ACTION_TYPES.FULL_TURN,
});

/**
 * 把舊資料的動作等級翻成 V2 的動作類型。翻不出來就回 null，由呼叫端決定怎麼辦——
 * **不要**預設成某一種，那會讓一筆打錯字的商品資料安靜地變成一個免費行動。
 */
export function fromLegacyActionLevel(level) {
  return LEGACY_ACTION_LEVEL_TO_V2[level] ?? null;
}
