// [設計] 副本狀態條件的單一求值器。
//
// 為什麼從 referenceAdapter.js 搬出來：這個專案原本有**兩份**條件求值器，
// 各自長出不同的能力，而且沒有人知道該用哪一份：
//
//   referenceAdapter.js  matchReferenceCondition()  —— 有 stateEquals / npcStatusAny /
//                                                     flagsAbsent / 巢狀 any，但**不認得線索**
//   explorationState.js  questionConditionMatches() —— 認得線索與場景，但沒有 npcStatusAny
//
// 節點完成證據（Node.completionEvidence）兩邊的能力都要：它需要「拿到某個線索」
// （揭露型節點）也需要「某個 NPC 活著」（命運型節點）。與其再抄第三份，
// 這裡把 matchReferenceCondition 搬過來當共用基礎，並補上線索欄位。
//
// [2026-09-01] 搬移時只**新增** allClues / anyClues 兩個欄位，其餘語意逐字不變：
// 既有呼叫端（endingRules、finaleCompletion）沒有用到線索欄位，所以行為不會改變。
// referenceAdapter.js 仍然 re-export 同名函式，舊的 import 路徑照樣可用。
//
// 這個模組刻意沒有任何 import：它只是一個純謂詞，不認識 reference、progress 或 LLM。
// 那正是 progress.js 能夠依賴它、而不會違反自己「只負責章節/節點/時間」那條界線的理由。

/**
 * 一個條件物件裡的多個欄位是 **AND**；欄位內部的 `any*` 是 OR。
 * 要跨欄位做 OR 時用 `any: [ {...}, {...} ]` 包一層。
 *
 * 只讀 server 已保存的 state，不接受模型或前端輸入——這是它能當成「證據」的前提。
 *
 * @param {object} condition
 * @param {object} state referenceState（flags / clues / npcStatuses / currentLocation / 狀態軸）
 */
export function matchReferenceCondition(condition, state) {
  if (!condition || typeof condition !== "object") return false;
  if (Array.isArray(condition.any)) {
    if (!condition.any.some((nested) => matchReferenceCondition(nested, state))) return false;
  }
  const flags = new Set(state?.flags ?? []);
  const clues = new Set(state?.clues ?? []);
  if ((condition.allFlags ?? []).some((flag) => !flags.has(flag))) return false;
  if (condition.anyFlags?.length && !condition.anyFlags.some((flag) => flags.has(flag))) return false;
  if ((condition.flagsAbsent ?? []).some((flag) => flags.has(flag))) return false;
  // 線索欄位是這次搬移新增的。揭露型的重大節點（937、Ash 的生化人身分）靠的是線索，
  // 不是旗標——用旗標近似它會把「讀到了片段」跟「拿到了完整文件」壓成同一件事。
  if ((condition.allClues ?? []).some((clue) => !clues.has(clue))) return false;
  if (condition.anyClues?.length && !condition.anyClues.some((clue) => clues.has(clue))) return false;
  for (const [key, expected] of Object.entries(condition.stateEquals ?? {})) {
    if (String(state?.[key]) !== String(expected)) return false;
  }
  for (const [npcId, allowed] of Object.entries(condition.npcStatusAny ?? {})) {
    const values = Array.isArray(allowed) ? allowed : [allowed];
    if (!values.includes(state?.npcStatuses?.[npcId])) return false;
  }
  if (condition.locations?.length && !condition.locations.includes(state?.currentLocation)) return false;
  if (condition.locationsAbsent?.length && condition.locationsAbsent.includes(state?.currentLocation)) return false;
  return true;
}

/**
 * 這個節點宣告的完成證據是否已經成立。
 *
 * `Node.completionEvidence` 是一個**陣列**，成員之間是 AND：
 *
 *   completionEvidence: [
 *     { anyFlags: ["flag_luyuan_met"] },                       // 而且
 *     { anyClues: ["clue_alien_trace", "clue_motion_route"] },  // 而且…
 *   ]
 *
 * 沒有宣告（undefined 或空陣列）就回 true —— 舊副本與沒有 reference 的副本
 * （echoInstitute）行為完全不變，這是這條閘門能安全上線的前提。
 *
 * @param {object|null} node content/scenario/schema.js 的 Node
 * @param {object|null} state referenceState
 */
export function nodeEvidenceSatisfied(node, state) {
  const conditions = node?.completionEvidence;
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  return conditions.every((condition) => matchReferenceCondition(condition, state));
}

/** 這個節點有沒有宣告完成證據。呼叫端用它決定「沒有 state 可查時該不該擋」。 */
export function nodeDeclaresEvidence(node) {
  return Array.isArray(node?.completionEvidence) && node.completionEvidence.length > 0;
}
