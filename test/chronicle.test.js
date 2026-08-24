import test from "node:test";
import assert from "node:assert/strict";
import {
  appendChronicle,
  buildStoryPackage,
  chronicleFromHistory,
  normalizeChronicleEntries,
  registerChroniclePackage,
  buildCompactAiContext,
  MAX_CHRONICLE_ENTRIES,
  MAX_CHRONICLE_ACTION_CHARS,
  MAX_CHRONICLE_NARRATION_CHARS,
  MAX_CHRONICLE_PACKAGES,
} from "../content/storage/chronicle.js";
import { createSession, ensureSessionShape, pushHistory } from "../content/storage/sessionStore.js";
import { appendEvent, EVENT_TYPES } from "../core/eventLog.js";

function sessionWithChronicle() {
  const session = createSession({
    id: "chronicle-test",
    character: { concept: { name: "檔案測試者" }, attributes: {}, skills: {} },
  });
  for (let i = 1; i <= 12; i += 1) {
    session.chronicle = appendChronicle(session.chronicle, {
      turn: i,
      action: `行動${i}`,
      narration: `敘事${i}`,
      timestamp: `2026-08-23T00:00:${String(i).padStart(2, "0")}Z`,
      scenarioId: i <= 8 ? "scenario.a" : "scenario.b",
    });
  }
  session.turns = 12;
  return session;
}

test("appendChronicle：不裁切、不修改舊陣列，並保存副本識別", () => {
  const original = [];
  const next = appendChronicle(original, {
    turn: 1,
    action: "推門",
    narration: "門後傳來水聲。",
    timestamp: "2026-08-23T00:00:00Z",
    scenarioId: "scenario.a",
  });
  assert.deepEqual(original, []);
  assert.equal(next.length, 1);
  assert.equal(next[0].scenarioId, "scenario.a");
  assert.equal(next[0].narration, "門後傳來水聲。");
});

test("appendChronicle：長局與超長欄位都受 server-side 資源界線保護", () => {
  const original = Array.from({ length: MAX_CHRONICLE_ENTRIES }, (_, i) => ({
    turn: i + 1,
    action: `舊行動${i + 1}`,
    narration: `舊敘事${i + 1}`,
  }));
  const next = appendChronicle(original, {
    turn: MAX_CHRONICLE_ENTRIES + 1,
    action: "行".repeat(MAX_CHRONICLE_ACTION_CHARS + 100),
    narration: "敘".repeat(MAX_CHRONICLE_NARRATION_CHARS + 100),
    nodeId: "n".repeat(500),
    scenarioId: "s".repeat(500),
  });
  assert.equal(next.length, MAX_CHRONICLE_ENTRIES);
  assert.equal(next[0].turn, 2, "超過總筆數時應捨棄最舊一筆");
  assert.ok(Array.from(next.at(-1).action).length <= MAX_CHRONICLE_ACTION_CHARS);
  assert.ok(Array.from(next.at(-1).narration).length <= MAX_CHRONICLE_NARRATION_CHARS);
  assert.ok(Array.from(next.at(-1).nodeId).length <= 160);
  assert.ok(Array.from(next.at(-1).scenarioId).length <= 160);
});

test("chronicle 不受短期 history 上限影響，AI 劇情包會保留完整十二回", () => {
  const session = sessionWithChronicle();
  let history = [];
  for (let i = 1; i <= 12; i += 1) {
    history = pushHistory(history, { action: `行動${i}`, narration: `敘事${i}` });
  }
  session.history = history;
  const pack = buildStoryPackage(session, {
    scenarioId: "scenario.a",
    scenarioTitle: "第一個副本",
    scenarioComplete: true,
    entries: normalizeChronicleEntries(session.chronicle).filter((e) => e.scenarioId === "scenario.a"),
    packagedAt: "2026-08-23T01:00:00Z",
  });
  assert.equal(session.history.length, 8);
  assert.equal(pack.entries.length, 8);
  assert.match(pack.text, /第 1 回/);
  assert.match(pack.text, /第 8 回/);
  assert.doesNotMatch(pack.text, /第 12 回/);
});

test("buildStoryPackage：結構化事件事實會附在小說後，且輸出可重現", () => {
  const session = sessionWithChronicle();
  appendEvent(session.log, EVENT_TYPES.CHECK, { label: "潛行", success: true, margin: 2 });
  const pack = buildStoryPackage(session, {
    scenarioId: "scenario.b",
    scenarioTitle: "第二個副本",
    scenarioComplete: false,
    entries: session.chronicle.slice(8),
    packagedAt: "2026-08-23T01:00:00Z",
  });
  assert.equal(pack.generatedAt, "2026-08-23T01:00:00Z");
  assert.match(pack.text, /判定：潛行，結果成功/);
  assert.match(pack.text, /角色：檔案測試者/);
  assert.equal(pack.scenarioComplete, false);
});

test("buildStoryPackage：scenario facts 不跨副本混入，且封存回合範圍固定內容", () => {
  const session = sessionWithChronicle();
  appendEvent(session.log, EVENT_TYPES.CHECK, { label: "第一章判定", success: false, margin: -1 }, {
    scenarioId: "scenario.a",
    turn: 8,
  });
  appendEvent(session.log, EVENT_TYPES.CHECK, { label: "第二章判定", success: true, margin: 2 }, {
    scenarioId: "scenario.b",
    turn: 9,
  });
  appendEvent(session.log, EVENT_TYPES.XP_GRANT, { total: 999, reason: "通關後主神空間行為" }, {
    scenarioId: "scenario.b",
    turn: 13,
  });

  const pack = buildStoryPackage(session, {
    scenarioId: "scenario.b",
    scenarioTitle: "第二個副本",
    scenarioComplete: true,
    turnRange: { from: 9, to: 12 },
    entries: session.chronicle.filter((entry) => entry.scenarioId === "scenario.b"),
    packagedAt: "2026-08-23T01:00:00Z",
  });

  assert.match(pack.text, /第二章判定/);
  assert.doesNotMatch(pack.text, /第一章判定/);
  assert.doesNotMatch(pack.text, /999/);
  assert.equal(pack.facts.length, 1);
  assert.equal(pack.facts[0].seq, 1);
});

test("buildCompactAiContext：只帶最近兩份封存副本，且長篇摘要會截斷", () => {
  const session = sessionWithChronicle();
  session.chroniclePackages = [
    { scenarioId: "scenario.old", scenarioTitle: "舊副本", status: "ready", turnRange: { from: 1, to: 2 } },
    { scenarioId: "scenario.a", scenarioTitle: "第一個副本", status: "ready", turnRange: { from: 1, to: 8 } },
    { scenarioId: "scenario.b", scenarioTitle: "第二個副本", status: "ready", turnRange: { from: 9, to: 12 } },
  ];
  const context = buildCompactAiContext(session, { limit: 2, charLimit: 20 });
  assert.match(context, /第一個副本/);
  assert.match(context, /第二個副本/);
  assert.doesNotMatch(context, /舊副本/);
  assert.match(context, /……/);
  assert.ok(context.length < 500, "compact context 不應接近完整小說長度");
});

test("registerChroniclePackage：同一副本只建立一份 ready package", () => {
  const first = registerChroniclePackage([], {
    scenarioId: "scenario.a",
    scenarioTitle: "第一章",
    turnEnd: 8,
    createdAt: "2026-08-23T01:00:00Z",
  });
  const second = registerChroniclePackage(first.packages, {
    scenarioId: "scenario.a",
    scenarioTitle: "不應覆蓋",
    turnEnd: 99,
    createdAt: "2026-08-23T02:00:00Z",
  });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.packages.length, 1);
  assert.equal(second.record.scenarioTitle, "第一章");
  assert.equal(second.record.status, "ready");
});

test("registerChroniclePackage：封存索引也有總量上限", () => {
  const packages = Array.from({ length: MAX_CHRONICLE_PACKAGES }, (_, i) => ({
    scenarioId: `scenario.${i}`,
    status: "ready",
  }));
  const result = registerChroniclePackage(packages, {
    scenarioId: "scenario.new",
    scenarioTitle: "新副本",
  });
  assert.equal(result.packages.length, MAX_CHRONICLE_PACKAGES);
  assert.equal(result.packages.at(-1).scenarioId, "scenario.new");
  assert.equal(result.packages[0].scenarioId, "scenario.1");
});

test("舊 session 沒有 chronicle 時，以仍存在的 history 補出可讀回顧", () => {
  const legacy = {
    id: "legacy",
    version: 3,
    character: { concept: { name: "舊玩家" } },
    history: [{ action: "查看出口", narration: "出口被鎖住。" }],
  };
  const fixed = ensureSessionShape(legacy);
  assert.equal(fixed.chronicle.length, 1);
  assert.equal(fixed.chronicle[0].narration, "出口被鎖住。");
  assert.deepEqual(chronicleFromHistory(legacy.history), fixed.chronicle);
  assert.deepEqual(fixed.chroniclePackages, []);
});
