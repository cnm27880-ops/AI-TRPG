// [設計] 事件日誌基礎設施測試——重點是「只增不改」、「查詢過濾正確」、「摘要覆蓋所有事件類型」。
import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_TYPES,
  createEventLog,
  appendEvent,
  queryEvents,
  summarizeForJournal,
} from "../core/eventLog.js";

test("appendEvent：合法事件會被加入，seq 依序遞增", () => {
  const log = createEventLog();
  const e1 = appendEvent(log, EVENT_TYPES.CHECK, { label: "白刃攻擊", success: true, margin: 2 });
  const e2 = appendEvent(log, EVENT_TYPES.DAMAGE, { amount: 3, damageType: "B" });
  assert.equal(e1.seq, 0);
  assert.equal(e2.seq, 1);
  assert.equal(log.events.length, 2);
});

test("appendEvent：不合法的事件類型要直接丟錯，不能默默塞進日誌", () => {
  const log = createEventLog();
  assert.throws(() => appendEvent(log, "不存在的類型", {}));
  assert.equal(log.events.length, 0);
});

test("日誌是 append-only：appendEvent 不會修改已存在的事件", () => {
  const log = createEventLog();
  appendEvent(log, EVENT_TYPES.XP_GRANT, { total: 10 });
  const snapshot = JSON.parse(JSON.stringify(log.events));
  appendEvent(log, EVENT_TYPES.XP_GRANT, { total: 5 });
  assert.deepEqual(log.events[0], snapshot[0]);
});

test("queryEvents：可以用 type 過濾", () => {
  const log = createEventLog();
  appendEvent(log, EVENT_TYPES.CHECK, { label: "a", success: true, margin: 1 });
  appendEvent(log, EVENT_TYPES.DAMAGE, { amount: 1, damageType: "B" });
  appendEvent(log, EVENT_TYPES.CHECK, { label: "b", success: false, margin: -1 });
  const checks = queryEvents(log, { type: EVENT_TYPES.CHECK });
  assert.equal(checks.length, 2);
  assert.ok(checks.every((e) => e.type === EVENT_TYPES.CHECK));
});

test("queryEvents：可以用 sinceSeq 過濾出某個時間點之後的事件", () => {
  const log = createEventLog();
  appendEvent(log, EVENT_TYPES.XP_GRANT, { total: 1 });
  appendEvent(log, EVENT_TYPES.XP_GRANT, { total: 2 });
  appendEvent(log, EVENT_TYPES.XP_GRANT, { total: 3 });
  const recent = queryEvents(log, { sinceSeq: 1 });
  assert.deepEqual(recent.map((e) => e.payload.total), [2, 3]);
});

// [2026-08-20] 這一條原本只列了八種事件手動檢查，但 EVENT_TYPES 後來長到十三種
// （combat_action / purchase / points_grant / form / rest），新加的四種沒有人回來補
// journalSummary() 的分支，全部落到 default 變成「未知事件」——而這份摘要同時是
// 餵給AI的事實記憶（functions/api/turn.js），所以那是會影響敘事的靜默失敗。
// 改成直接迭代 EVENT_TYPES：以後再加事件類型，忘了補摘要就會在這裡紅燈。
test("summarizeForJournal：EVENT_TYPES 裡的每一種都要有摘要，新增類型忘了補摘要要當場失敗", () => {
  const samplePayloads = {
    [EVENT_TYPES.CHECK]: { label: "測試判定", success: true, margin: 3 },
    [EVENT_TYPES.DAMAGE]: { amount: 5, damageType: "L" },
    [EVENT_TYPES.XP_GRANT]: { total: 12 },
    [EVENT_TYPES.NODE_COMPLETE]: { title: "第一章第一節", divergenceTier: 1 },
    [EVENT_TYPES.DEATH]: { cause: "惡性傷害過量" },
    [EVENT_TYPES.REVIVAL]: { reviveCount: 1, cost: 4600 },
    [EVENT_TYPES.AFFECTION_CHANGE]: { npc: "羅蘭", delta: 5, newTier: "友好" },
    [EVENT_TYPES.TIME_SPENT]: { amount: 2, activity: "培養好感度" },
    [EVENT_TYPES.COMBAT_ACTION]: { actor: "player", hit: true, damage: 3, damageSeverityTag: "血花四濺" },
    [EVENT_TYPES.PURCHASE]: { goodId: "g1", name: "制式手槍", pricePaid: 500, location: "主神空間", droppedTraits: [] },
    [EVENT_TYPES.POINTS_GRANT]: { total: 300, reason: "完成節點「甲板」" },
    [EVENT_TYPES.FORM]: { event: "啟動", formId: "f1", label: "獸化" },
    [EVENT_TYPES.REST]: { kind: "打坐", location: "副本中", summary: "恢復2點衝擊傷" },
  };

  const log = createEventLog();
  for (const type of Object.values(EVENT_TYPES)) {
    assert.ok(samplePayloads[type], `EVENT_TYPES 新增了「${type}」，請一起補上這裡的範例 payload`);
    appendEvent(log, type, samplePayloads[type]);
  }

  const journal = summarizeForJournal(log);
  assert.equal(journal.length, Object.values(EVENT_TYPES).length);
  for (const entry of journal) {
    assert.ok(entry.summary.length > 0, `事件「${entry.type}」沒有摘要文字`);
    assert.notEqual(entry.summary, "未知事件", `事件「${entry.type}」落到 default 分支，請補上 journalSummary() 的 case`);
  }
});

test("summarizeForJournal：手寫的八種基本事件摘要維持原樣（回歸保護）", () => {
  const log = createEventLog();
  appendEvent(log, EVENT_TYPES.CHECK, { label: "測試判定", success: true, margin: 3 });
  appendEvent(log, EVENT_TYPES.DAMAGE, { amount: 5, damageType: "L" });
  appendEvent(log, EVENT_TYPES.XP_GRANT, { total: 12 });
  appendEvent(log, EVENT_TYPES.NODE_COMPLETE, { title: "第一章第一節", divergenceTier: 1 });
  appendEvent(log, EVENT_TYPES.DEATH, { cause: "惡性傷害過量" });
  appendEvent(log, EVENT_TYPES.REVIVAL, { reviveCount: 1, cost: 4600 });
  appendEvent(log, EVENT_TYPES.AFFECTION_CHANGE, { npc: "羅蘭", delta: 5, newTier: "友好" });
  appendEvent(log, EVENT_TYPES.TIME_SPENT, { amount: 2, activity: "培養好感度" });

  const journal = summarizeForJournal(log);
  assert.equal(journal.length, 8);
  for (const entry of journal) {
    assert.ok(entry.summary.length > 0);
    assert.notEqual(entry.summary, "未知事件");
  }
});
