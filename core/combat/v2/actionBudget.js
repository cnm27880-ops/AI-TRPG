// Combat V2 —— 一輪的動作額度模型。
//
// 規格第12節第6點要求：不要用一堆互相矛盾的 boolean 隱含判斷全部規則，要有一個
// 可讀、可測試的 action budget model。所以這裡的形狀是**計數池 + 消耗紀錄**，
// 不是 `standardAvailable: true` 那種旗標：
//
//   {
//     pools:  { swift: 1, move: 1, standard: 1 },   // 還剩幾個
//     granted:{ swift: 0, move: 0, standard: 0 },   // 這一輪額外拿到幾個（能力/外部效果）
//     spent:  [ { actionType, pool, converted, ... } ]  // 每一次消耗的來源紀錄
//   }
//
// 用計數而不是 boolean 有兩個直接好處：
//   1. 規格第2.4節的「額外動作來源」不需要動到任何判斷式，加一格就是加一格。
//   2. 「這個回合還有沒有動作可用」變成 sum(pools) > 0 一個算式，不需要
//      `if (actionType === 'fullRound') endTurn = true` 這種會跟額外動作打架的捷徑
//      （規格第2.4節明令禁止）。
//
// 這個模組**只管額度**，不管做了什麼——那是 resolveAction/resolveTurn 的事。

import {
  ACTION_TYPES,
  ACTION_TYPE_LABELS,
  BASE_POOLS,
  BASE_BUDGET,
  COMPOSITE_COST,
  canConvert,
  isBasePool,
  isCompositeActionType,
  isActionType,
} from "./actionTypes.js";

/**
 * 建立一輪的動作額度。
 * @param {{ swift?: number, move?: number, standard?: number }} [overrides]
 *   起始額度覆寫。預設就是規格第2節的 1/1/1；特殊狀態（暈眩、被壓制）可以給 0。
 */
export function createActionBudget(overrides = {}) {
  const pools = {};
  for (const pool of BASE_POOLS) {
    const value = overrides[pool];
    pools[pool] = Number.isInteger(value) && value >= 0 ? value : BASE_BUDGET[pool];
  }
  return {
    pools,
    granted: { swift: 0, move: 0, standard: 0 },
    spent: [],
  };
}

/** 還剩下的額度（複製一份，呼叫端改它不會動到 budget）。 */
export function remainingActions(budget) {
  return { ...budget.pools };
}

/**
 * 這一輪還有沒有任何動作可用。
 *
 * 規格第2.4節：用了整輪/全回合之後**不能**直接判定回合結束，要看結算後真正剩下什麼。
 * 所以「回合能不能繼續」唯一的答案來源是這個函式，不是 actionType。
 */
export function hasAnyActionLeft(budget) {
  return BASE_POOLS.some((pool) => budget.pools[pool] > 0);
}

/**
 * 額外動作來源（特殊能力、外部效果、場景獎勵）。
 * 規格第2.3節第5點：全回合動作**自己**不得補回任何動作，所以這個函式只能由
 * 明確的能力效果呼叫，結算流程本身不會用它。
 */
export function grantAction(budget, pool, amount = 1, source = "unknown") {
  if (!isBasePool(pool)) throw new Error(`不能對「${pool}」授予額度，只有 ${BASE_POOLS.join("/")} 有池子`);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("授予的動作數必須是正整數");
  return {
    ...budget,
    pools: { ...budget.pools, [pool]: budget.pools[pool] + amount },
    granted: { ...budget.granted, [pool]: budget.granted[pool] + amount },
    spent: [...budget.spent, { kind: "grant", pool, amount, source }],
  };
}

/**
 * 規劃一次消耗：算出「要從哪些池子各扣幾個」，但**不執行**。
 *
 * 拆成 plan/apply 兩段是為了原子性（規格第2.2節第4點、第2.3節第3點）：整輪與全回合
 * 只要有任何一項不足，就一格都不能扣。先算出完整計畫、確定可行才動手，
 * 就不可能出現「扣了 standard 才發現 move 不夠」。
 *
 * @param {object} budget
 * @param {"swift"|"move"|"standard"|"fullRound"|"fullTurn"} actionType
 * @param {{ from?: "swift"|"move"|"standard" }} [opts]
 *   from：明確指定要從哪個池子轉化（規格第2.1節的玩家選擇）。不給的話用預設策略：
 *   先用自己的池子，沒有才往上找最接近的高階池子——這樣玩家不會因為系統擅自
 *   拿標準動作去做迅捷行動，而白白損失一個標準動作。
 * @returns {{ ok: true, debits: Array<{pool,amount,converted,requested}> }
 *          | { ok: false, reason: string, missing: string[] }}
 */
export function planSpend(budget, actionType, opts = {}) {
  if (!isActionType(actionType)) {
    return { ok: false, reason: `未知的動作類型：${actionType}`, missing: [] };
  }

  if (isCompositeActionType(actionType)) {
    const cost = COMPOSITE_COST[actionType];
    const missing = BASE_POOLS.filter((pool) => budget.pools[pool] < cost[pool]);
    if (missing.length) {
      return {
        ok: false,
        reason: `${ACTION_TYPE_LABELS[actionType]}需要${missing.map((p) => ACTION_TYPE_LABELS[p]).join("與")}都還沒使用`,
        missing,
      };
    }
    // 組合動作不走轉化：轉化只能往低階走，而 fullRound 需要一個真正的 standard，
    // 沒有任何池子能轉出 standard 來（規格第2.1節第8點：轉化不得產生高階動作）。
    return {
      ok: true,
      debits: BASE_POOLS.filter((pool) => cost[pool] > 0).map((pool) => ({
        pool,
        amount: cost[pool],
        converted: false,
        requested: actionType,
      })),
    };
  }

  // 基礎動作：先看有沒有明確指定來源。
  if (opts.from) {
    if (!canConvert(opts.from, actionType)) {
      return {
        ok: false,
        reason: `${ACTION_TYPE_LABELS[opts.from]}不能轉化為${ACTION_TYPE_LABELS[actionType]}`,
        missing: [opts.from],
      };
    }
    if (budget.pools[opts.from] < 1) {
      return {
        ok: false,
        reason: `本回合${ACTION_TYPE_LABELS[opts.from]}已使用`,
        missing: [opts.from],
      };
    }
    return {
      ok: true,
      debits: [{ pool: opts.from, amount: 1, converted: opts.from !== actionType, requested: actionType }],
    };
  }

  const source = pickSourcePool(budget, actionType);
  if (!source) {
    return {
      ok: false,
      reason: `本回合${ACTION_TYPE_LABELS[actionType]}已使用`,
      missing: [actionType],
    };
  }
  return {
    ok: true,
    debits: [{ pool: source, amount: 1, converted: source !== actionType, requested: actionType }],
  };
}

/**
 * 預設的來源池挑選：自己的池子優先，其次是**最接近的**高階池子。
 * 「最接近」很重要：迅捷行動缺額度時要先吃移動，不是先吃標準——否則玩家做了一件
 * 小事就損失一個標準動作，而規則從來沒有這樣要求。
 */
function pickSourcePool(budget, actionType) {
  if (budget.pools[actionType] > 0) return actionType;
  const ladder = { swift: ["move", "standard"], move: ["standard"], standard: [] };
  return ladder[actionType].find((pool) => budget.pools[pool] > 0) ?? null;
}

/** 這個動作類型現在做不做得起（給 action generator 標 available 用）。 */
export function canSpend(budget, actionType, opts = {}) {
  return planSpend(budget, actionType, opts).ok;
}

/** 做不起的公開原因（給 action generator 的 unavailableReason 用，不含任何內部數值）。 */
export function spendBlockReason(budget, actionType, opts = {}) {
  const plan = planSpend(budget, actionType, opts);
  return plan.ok ? null : plan.reason;
}

/**
 * 套用一份 planSpend 的計畫。全部扣完才回傳，中途不會有半套狀態
 * （budget 是不可變的，扣不成就是回傳失敗、原 budget 一個字都沒動）。
 *
 * @param {object} budget
 * @param {object} plan planSpend() 的回傳
 * @param {object} [meta] 寫進消耗紀錄的來源資訊（actionId/label/round），
 *   規格第2.1節第7點要求任何轉化都要在 server 端留下來源紀錄。
 */
export function applySpend(budget, plan, meta = {}) {
  if (!plan.ok) throw new Error(`不能套用一份失敗的消耗計畫：${plan.reason}`);
  const pools = { ...budget.pools };
  for (const debit of plan.debits) {
    if (pools[debit.pool] < debit.amount) {
      // 走到這裡代表 plan 是對著另一份 budget 算的。整份拒絕，不做部分扣除。
      throw new Error(`消耗計畫與目前額度不符：${debit.pool} 不足`);
    }
  }
  const records = [];
  for (const debit of plan.debits) {
    pools[debit.pool] -= debit.amount;
    records.push({
      kind: "spend",
      requested: debit.requested,
      pool: debit.pool,
      amount: debit.amount,
      converted: debit.converted,
      // 轉化的來源紀錄：從哪個池子、變成哪一種動作用掉的。
      conversion: debit.converted ? `${debit.pool}->${debit.requested}` : null,
      actionId: meta.actionId ?? null,
      label: meta.label ?? null,
      round: meta.round ?? null,
    });
  }
  return { pools, granted: { ...budget.granted }, spent: [...budget.spent, ...records] };
}

/**
 * 規劃 + 套用，一步到位。回傳 `{ ok:false }` 時 budget 原封不動。
 * @returns {{ ok: true, budget: object, records: object[] }
 *          | { ok: false, reason: string, missing: string[], budget: object }}
 */
export function spendAction(budget, actionType, opts = {}, meta = {}) {
  const plan = planSpend(budget, actionType, opts);
  if (!plan.ok) return { ok: false, reason: plan.reason, missing: plan.missing, budget };
  const next = applySpend(budget, plan, meta);
  return { ok: true, budget: next, records: next.spent.slice(budget.spent.length) };
}

/**
 * 一次規劃**多個**動作的消耗（規格第5.1節：玩家先選一整輪的行動再一起確認）。
 * 任何一個排不進去，整批都不扣（規格第10節「動作額度不足 -> 422，不得部分扣除」）。
 *
 * @param {object} budget
 * @param {Array<{ actionType: string, from?: string, actionId?: string, label?: string }>} requests
 * @param {{ round?: number }} [meta]
 */
export function spendBatch(budget, requests, meta = {}) {
  let working = budget;
  const allRecords = [];
  for (const request of requests) {
    const plan = planSpend(working, request.actionType, request.from ? { from: request.from } : {});
    if (!plan.ok) {
      return { ok: false, reason: plan.reason, missing: plan.missing, failedActionId: request.actionId ?? null, budget };
    }
    working = applySpend(working, plan, {
      actionId: request.actionId ?? null,
      label: request.label ?? null,
      round: meta.round ?? null,
    });
    allRecords.push(...working.spent.slice(working.spent.length - plan.debits.length));
  }
  return { ok: true, budget: working, records: allRecords };
}

/**
 * 消耗紀錄裡跟「轉化」有關的那些（規格第11.1節第16點的測試對象、也給戰鬥紀錄用）。
 */
export function conversionRecords(budget) {
  return budget.spent.filter((entry) => entry.kind === "spend" && entry.converted);
}

/** 給 UI 的公開形狀：剩餘額度 + 這一輪已經用掉什麼。不含任何內部欄位。 */
export function publicBudget(budget) {
  return {
    remaining: remainingActions(budget),
    base: { ...BASE_BUDGET },
    granted: { ...budget.granted },
    hasAnyActionLeft: hasAnyActionLeft(budget),
    spent: budget.spent
      .filter((entry) => entry.kind === "spend")
      .map((entry) => ({
        actionId: entry.actionId,
        label: entry.label,
        requested: entry.requested,
        pool: entry.pool,
        converted: entry.converted,
        conversion: entry.conversion,
      })),
  };
}

export { ACTION_TYPES };
