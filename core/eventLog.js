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
  // 型態的啟動/結束(變身、開眼、爆發)。到期也走這一個，理由寫在 reason 欄位。
  FORM: "form",
  // 休息(主神空間的完全恢復／副本中的打坐)。副本中的那一種會另外記一筆 TIME_SPENT。
  REST: "rest",
  // Scenario reference adapter 的事件裁定；payload 只存引擎已套用的結果與效果摘要。
  REFERENCE_ACTION: "reference_action",
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
 * @param {{ timestamp?: number|string|null, scenarioId?: string|null, turn?: number|null }} opts
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
    ...(opts.scenarioId == null ? {} : { scenarioId: String(opts.scenarioId) }),
    ...(Number.isFinite(Number(opts.turn)) ? { turn: Number(opts.turn) } : {}),
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
      // 傷害嚴重度標籤（core/combat/resolveCombatAction.js）附在摘要後面：這條摘要會被
      // 餵回給AI當事實記憶，戰後那一輪的敘事要寫得出「牠的哪一邊還在流血」就得靠它。
      return (
        `${p.actor === "player" ? "玩家" : p.actor ?? "未知"}攻擊${p.hit ? `命中，造成${p.damage ?? 0}點傷害` : "未命中"}` +
        `${p.damageSeverityTag ? ` ${p.damageSeverityTag}` : ""}`
      );
    // [2026-08-20 修正] 下面四種是後來才加進 EVENT_TYPES 的（購買/獎勵點數/型態/休息），
    // 當時只加了常數與寫入端，沒有回來補這裡的分支，於是它們全部落到 default 變成「未知事件」。
    // 這不只是日誌畫面難看：summarizeForJournal() 同時是**餵給AI的事實記憶**
    // （functions/api/turn.js 只取最近 EVENT_MEMORY_LIMIT 筆），所以每買一件裝備、
    // 每休息一次，就有一行「未知事件」擠掉一筆真的事實，AI 也就不知道玩家做過那些事。
    case EVENT_TYPES.PURCHASE:
      return (
        `在${p.location ?? "主神空間"}購買「${p.name ?? p.goodId ?? "未知商品"}」` +
        `${p.pricePaid != null ? `，花費 ${p.pricePaid} 點` : ""}` +
        `${p.droppedTraits?.length ? `（換下：${p.droppedTraits.join("、")}）` : ""}`
      );
    case EVENT_TYPES.POINTS_GRANT:
      return `獲得 ${p.total ?? "?"} 點獎勵點數${p.reason ? `（${p.reason}）` : ""}`;
    case EVENT_TYPES.FORM:
      return (
        `型態「${p.label ?? p.formId ?? "未知型態"}」${p.event ?? "變動"}` +
        `${p.reason ? `：${p.reason}` : ""}`
      );
    case EVENT_TYPES.REST:
      return (
        `休息（${p.kind ?? "未知方式"}${p.location ? `於${p.location}` : ""}）` +
        `${p.summary ? `：${p.summary}` : ""}`
      );
    case EVENT_TYPES.REFERENCE_ACTION:
      return (
        `副本事件「${p.sceneId ?? "未知事件"}」採取「${p.approachId ?? "未知行動"}」` +
        `，結果${p.outcomeTier ?? "未知"}` +
        `${p.resultKey ? `（${p.resultKey}）` : ""}`
      );
    default:
      return "未知事件";
  }
}
