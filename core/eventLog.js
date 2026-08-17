// [設計] 事件日誌基礎設施 —— append-only(只增不改)的事件記錄，是「角色日誌回顧」功能的資料層。
// 引擎裡任何模組(判定/傷害/XP/節點完成/死亡復活/好感度變化/時間預算消耗)都呼叫 appendEvent
// 把結果寫進來，日誌回顧只是把這份日誌讀出來做成時間軸UI，不需要另外設計一套儲存邏輯。
//
// 刻意不在這裡呼叫 Date.now()：時間戳記由呼叫端決定要不要填(方便測試維持決定性，
// 也方便之後接到不同的執行環境時，由外層決定「現在」的定義)。

export const EVENT_TYPES = Object.freeze({
  CHECK: "check",
  DAMAGE: "damage",
  XP_GRANT: "xp_grant",
  NODE_COMPLETE: "node_complete",
  DEATH: "death",
  REVIVAL: "revival",
  AFFECTION_CHANGE: "affection_change",
  TIME_SPENT: "time_spent",
  COMBAT_ACTION: "combat_action",
  PURCHASE: "purchase",
  POINTS_GRANT: "points_grant",
});

const VALID_TYPES = new Set(Object.values(EVENT_TYPES));

export function createEventLog() {
  return { events: [] };
}

/**
 * 附加一個事件到日誌尾端。日誌本身不可變地增長(events 陣列只會被 push，不會被改寫或刪除)。
 * @param {{events: object[]}} log
 * @param {string} type 必須是 EVENT_TYPES 之一
 * @param {object} payload 事件的結構化內容，格式依 type 而定
 * @param {{ timestamp?: number|string|null }} opts
 */
export function appendEvent(log, type, payload, opts = {}) {
  if (!VALID_TYPES.has(type)) {
    throw new Error(`不合法的事件類型：${type}，合法值：${[...VALID_TYPES].join("/")}`);
  }
  const event = {
    seq: log.events.length,
    type,
    payload,
    timestamp: opts.timestamp ?? null,
  };
  log.events.push(event);
  return event;
}

/**
 * 查詢事件，預設回傳全部，可用 type/sinceSeq 過濾。
 */
export function queryEvents(log, { type, sinceSeq } = {}) {
  return log.events.filter(
    (e) => (type == null || e.type === type) && (sinceSeq == null || e.seq >= sinceSeq)
  );
}

/**
 * 角色日誌回顧：把事件轉成結構化的人類可讀摘要條目。
 * 這裡只做「事實摘要」，不做敘事潤飾(潤飾是AI/前端的事，這一層只保證資料正確)。
 */
export function summarizeForJournal(log) {
  return log.events.map((e) => ({
    seq: e.seq,
    type: e.type,
    timestamp: e.timestamp,
    summary: journalSummary(e),
  }));
}

function journalSummary(event) {
  const p = event.payload ?? {};
  switch (event.type) {
    case EVENT_TYPES.CHECK:
      return `判定：${p.label ?? "未命名判定"}，結果${p.success ? "成功" : "失敗"}(margin=${p.margin})`;
    case EVENT_TYPES.DAMAGE:
      return `受到 ${p.amount} 點${p.damageType ?? ""}傷害`;
    case EVENT_TYPES.XP_GRANT:
      return `獲得 ${p.total} 點經驗值`;
    case EVENT_TYPES.NODE_COMPLETE:
      return `完成劇情節點「${p.title ?? p.nodeId ?? "未知節點"}」(扭轉度 ${p.divergenceTier ?? "?"} 級)`;
    case EVENT_TYPES.DEATH:
      return `角色死亡(原因：${p.cause ?? "未知"})`;
    case EVENT_TYPES.REVIVAL:
      return `角色復活(第 ${p.reviveCount ?? "?"} 次，花費 ${p.cost ?? "?"} 分)`;
    case EVENT_TYPES.AFFECTION_CHANGE:
      return `對「${p.npc ?? "未知NPC"}」好感度${(p.delta ?? 0) >= 0 ? "上升" : "下降"}，目前為「${p.newTier ?? "?"}」`;
    case EVENT_TYPES.TIME_SPENT:
      return `花費 ${p.amount ?? "?"} 點時間預算於「${p.activity ?? "未知活動"}」`;
    case EVENT_TYPES.COMBAT_ACTION:
      return `${p.actor === "player" ? "玩家" : p.actor ?? "未知"}攻擊${p.hit ? `命中，造成${p.damage ?? 0}點傷害` : "未命中"}`;
    default:
      return "未知事件";
  }
}
