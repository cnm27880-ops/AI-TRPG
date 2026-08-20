// /api/journal 的接線測試（2026-08-20）。
//
// 為什麼要有這一份：側欄的「日誌」分頁在版面上、資料層(core/eventLog.js 的
// summarizeForJournal，本來就有測試)也在，但中間**沒有任何程式碼把兩邊接起來**，
// 所以那個分頁從上線起就是一片空白。這是這個專案反覆出現的同一種洞：
// 引擎做得到、沒有人問它，而且純函式測試完全看不到——因為每一半單獨看都是好的。
//
// 這裡問的就是「中間那一段」：端點在不在、摘要有沒有真的產出、別人的存檔讀不讀得到。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestGet as journalGet } from "../functions/api/journal.js";
import { onRequestPost as restPost } from "../functions/api/rest.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";
import { appendEvent, EVENT_TYPES } from "../core/eventLog.js";
import { emptyCharacter } from "../core/schema.js";
import { computeDerivedStats } from "../core/derivedStats.js";

const req = (env, body) => ({ request: { json: async () => body }, env });
const getReq = (env, url) => ({ request: { url, headers: { get: () => null } }, env });
const read = async (res) => JSON.parse(await res.text());

function 角色卡() {
  const c = emptyCharacter("日誌測試");
  c.attributes = { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 2, 感知: 2, 意志: 2 };
  c.derived = computeDerivedStats(c.attributes);
  return c;
}

async function newSession(env) {
  const body = await read(await sessionPost(req(env, { character: 角色卡() })));
  assert.equal(body.ok, true, JSON.stringify(body));
  return body.session.id;
}

test("/api/journal：把存檔裡的事件日誌變成看得懂的條目回傳", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  appendEvent(session.log, EVENT_TYPES.CHECK, { label: "撬開艙門", success: true, margin: 2 });
  appendEvent(session.log, EVENT_TYPES.PURCHASE, {
    name: "制式手槍",
    pricePaid: 500,
    location: "主神空間",
    droppedTraits: [],
  });
  await store.put(session);

  const res = await read(await journalGet(getReq(env, `https://x/api/journal?sessionId=${sessionId}`)));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.total, 2);
  assert.deepEqual(res.entries.map((e) => e.type), ["check", "purchase"]);
  // 每一條都要真的有字，而且不可以是 default 分支的「未知事件」——
  // 購買/點數/型態/休息這四種曾經整組落在 default 裡（見 core/eventLog.js 的修正註記）。
  for (const entry of res.entries) {
    assert.ok(entry.summary.length > 0);
    assert.notEqual(entry.summary, "未知事件");
  }
  assert.match(res.entries[1].summary, /制式手槍/);
});

test("/api/journal：實際玩過一輪之後日誌就長得出來（休息會留下紀錄）", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const restRes = await read(await restPost(req(env, { sessionId })));
  assert.equal(restRes.ok, true, JSON.stringify(restRes));

  const res = await read(await journalGet(getReq(env, `https://x/api/journal?sessionId=${sessionId}`)));
  assert.ok(res.entries.some((e) => e.type === EVENT_TYPES.REST), "休息完卻查不到任何 rest 事件");
  assert.ok(
    res.entries.filter((e) => e.type === EVENT_TYPES.REST).every((e) => e.summary.includes("休息")),
    "rest 事件的摘要要說得出這是一次休息，不能是「未知事件」"
  );
});

test("/api/journal：limit 只回最近幾筆，順序仍然是由舊到新", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  for (let i = 0; i < 5; i++) {
    appendEvent(session.log, EVENT_TYPES.XP_GRANT, { total: i });
  }
  await store.put(session);

  const res = await read(await journalGet(getReq(env, `https://x/api/journal?sessionId=${sessionId}&limit=2`)));
  assert.equal(res.total, 5, "total 是全部有幾筆，不是這次回了幾筆");
  assert.deepEqual(res.entries.map((e) => e.seq), [3, 4]);
});

test("/api/journal：沒指定 sessionId 回 400，找不到存檔回 404", async () => {
  const env = {};
  const missing = await journalGet(getReq(env, "https://x/api/journal"));
  assert.equal(missing.status, 400);

  const notFound = await journalGet(getReq(env, "https://x/api/journal?sessionId=不存在的ID"));
  assert.equal(notFound.status, 404);
});

test("/api/journal：別人名下的存檔讀不到（跟其他端點同一套門禁）", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  session.ownerId = "別的帳號";
  await store.put(session);

  const res = await journalGet(getReq(env, `https://x/api/journal?sessionId=${sessionId}`));
  // 刻意是 404 而不是 403：回 403 等於確認了這個ID真的存在。
  assert.equal(res.status, 404);
});
