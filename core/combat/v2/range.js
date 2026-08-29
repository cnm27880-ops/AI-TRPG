// Combat V2 —— 三段距離系統（規格第4節）。
//
// 距離**不是 UI 標籤，是 server state**：每一次移動、每一個攻擊的合法性、敵人的逼近，
// 都由這裡判定。前端送上來的任何 distance 欄位一律不採信（規格第6.3節）。

/** 三段距離，由近到遠。順序即階梯，index 就是「第幾格」。 */
export const COMBAT_RANGES = Object.freeze(["close", "medium", "far"]);

/** UI 文案。 */
export const RANGE_LABELS = Object.freeze({
  close: "近距離",
  medium: "中距離",
  far: "遠距離",
});

/** 場景化的補充說明（規格第4節末段：三段距離之外可以加一句人話）。 */
export const RANGE_DESCRIPTIONS = Object.freeze({
  close: "接觸距離，伸手可及",
  medium: "看得清楚，但中間仍有空間",
  far: "跨越整個空間的距離",
});

export function isValidRange(value) {
  return COMBAT_RANGES.includes(value);
}

export function rangeIndex(value) {
  const index = COMBAT_RANGES.indexOf(value);
  if (index < 0) throw new Error(`不合法的戰鬥距離：${value}`);
  return index;
}

/** 兩段距離之間差幾格。 */
export function stepsBetween(from, to) {
  return Math.abs(rangeIndex(to) - rangeIndex(from));
}

/**
 * 往某個方向走一格。`direction` 是 "closer"（拉近）或 "away"（拉開）。
 * 走到底就停在底（close 再拉近還是 close），由呼叫端判斷要不要當成「沒有效果」。
 */
export function stepRange(from, direction, steps = 1) {
  const delta = direction === "closer" ? -steps : steps;
  const next = Math.min(COMBAT_RANGES.length - 1, Math.max(0, rangeIndex(from) + delta));
  return COMBAT_RANGES[next];
}

/**
 * 這次距離變更合不合法（規格第4節第1、2點：一般移動一次只能改變一格）。
 * @param {string} from
 * @param {string} to
 * @param {{ maxSteps?: number }} [opts] 能力明確允許跨格時把 maxSteps 調大。
 */
export function canChangeRange(from, to, { maxSteps = 1 } = {}) {
  if (!isValidRange(from) || !isValidRange(to)) {
    return { ok: false, reason: "不合法的戰鬥距離" };
  }
  const steps = stepsBetween(from, to);
  if (steps === 0) return { ok: false, reason: "目標距離跟目前距離相同" };
  if (steps > maxSteps) {
    return {
      ok: false,
      reason: maxSteps === 1
        ? `一次移動只能改變一格距離（目前在${RANGE_LABELS[from]}）`
        : `這個行動一次最多改變 ${maxSteps} 格距離`,
    };
  }
  return { ok: true };
}

/**
 * 這個行動在目前距離下能不能用（規格第4節第3、4點）。
 * @param {string[]} validRanges 行動允許的距離
 * @param {string} currentRange
 * @returns {null | string} null＝可用；否則回一句玩家看得懂的原因（不含任何內部數值）
 */
export function rangeBlockReason(validRanges, currentRange) {
  if (!Array.isArray(validRanges) || validRanges.length === 0) return null;
  if (validRanges.includes(currentRange)) return null;
  const allowed = validRanges.map((r) => RANGE_LABELS[r] ?? r).join("或");
  return `需要${allowed}（目前在${RANGE_LABELS[currentRange] ?? currentRange}）`;
}

/**
 * 兩個參戰者之間的距離鍵。排序過，所以 (a,b) 與 (b,a) 是同一格——
 * 距離是對稱的，存兩份遲早會不一致。
 */
export function rangeKey(aId, bId) {
  return [aId, bId].sort().join("|");
}
