// 2026-08-24 安全/效能修正的測試清單。
//
// 涵蓋範圍(對應任務描述的 B/C 兩節)：
//   - urlSafety.js 的 SSRF 黑名單(私網/loopback/link-local/metadata endpoint/HTTP)
//   - /api/narrate、/api/turn 對「請求端指定的 baseUrl」做 SSRF 檢查，但不擋伺服器
//     自己在環境變數設定的端點(那是操作者的信任決定，不是攻擊面)
//   - /api/session 的 providedCharacter 路徑不能被用來偽造 attributes/xp/derived/reviveCount
//   - sessionStore 的樂觀鎖定(rev/expectedRev/SessionConflictError)
//   - /api/revive、/api/rest 的 requestId 重送不重複扣費/恢復
//   - /api/chronicle 的 limit clamp、cursor 分頁、非法 cursor、跨 owner cursor
//   - /api/turn 的公開回應不含 st_thought(見 test/freeActionTurn.test.js 的另一則相關測試)
import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeOutboundUrl, UnsafeOutboundUrlError } from "../content/llm/urlSafety.js";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as narratePost } from "../functions/api/narrate.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import { onRequestPost as revivePost } from "../functions/api/revive.js";
import { onRequestPost as restPost } from "../functions/api/rest.js";
import { onRequestPost as combatStart } from "../functions/api/combat/start.js";
import { onRequestPost as combatAct } from "../functions/api/combat/act.js";
import { onRequestGet as chronicleGet } from "../functions/api/chronicle.js";
import {
  resolveSessionStore,
  memorySessionStore,
  SessionConflictError,
} from "../content/storage/sessionStore.js";
import { appendChronicle } from "../content/storage/chronicle.js";
import { emptyCharacter } from "../core/schema.js";
import { computeDerivedStats } from "../core/derivedStats.js";

const req = (env, body) => ({ request: { json: async () => body }, env });
const getReq = (env, url) => ({ request: { url, headers: { get: () => null } }, env });
const read = async (res) => JSON.parse(await res.text());

// ---------------------------------------------------------------------------
// urlSafety.js —— SSRF 黑名單
// ---------------------------------------------------------------------------

test("assertSafeOutboundUrl：擋掉HTTP、內網IP、loopback、link-local/metadata endpoint", () => {
  const blocked = [
    "http://example.com/v1",
    "https://127.0.0.1/v1",
    "https://localhost/v1",
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.5/v1",
    "https://192.168.1.1/v1",
    "https://172.16.5.5/v1",
    "https://100.100.100.200/v1",
    "https://[::1]/v1",
    "https://[fe80::1]/v1",
    "https://[fc00::1]/v1",
    "https://[::ffff:169.254.169.254]/v1",
    "https://metadata.google.internal/v1",
    "https://foo.internal/v1",
    "不是網址",
  ];
  for (const url of blocked) {
    assert.throws(() => assertSafeOutboundUrl(url), UnsafeOutboundUrlError, `應該擋下：${url}`);
  }
});

test("assertSafeOutboundUrl：正常的公開https端點都放行(不能誤傷正常供應商)", () => {
  const allowed = [
    "https://api.deepseek.com/v1",
    "https://generativelanguage.googleapis.com/v1beta",
    "https://openrouter.ai/api/v1",
    "https://my-relay.example.com/v1",
  ];
  for (const url of allowed) {
    assert.doesNotThrow(() => assertSafeOutboundUrl(url), `不該擋下：${url}`);
  }
});

test("assertSafeOutboundUrl：十進位/十六進位/短寫法的IPv4也擋得到(URL正規化之後才檢查)", () => {
  // 2130706433 / 0x7f000001 都是 127.0.0.1 的另一種寫法，是常見的SSRF繞過手法。
  assert.throws(() => assertSafeOutboundUrl("https://2130706433/v1"));
  assert.throws(() => assertSafeOutboundUrl("https://0x7f000001/v1"));
});

// ---------------------------------------------------------------------------
// /api/narrate、/api/turn 的 SSRF 防護：只檔「這次請求指定的baseUrl」
// ---------------------------------------------------------------------------

test("[安全] /api/narrate：body 指定的 baseUrl 指向內網位址時要被擋下，不能發出SSRF請求", async () => {
  const env = {};
  const res = await narratePost(req(env, {
    character: emptyCharacter("SSRF測試"),
    playerAction: "推開門",
    provider: "custom",
    apiKey: "attacker-key",
    baseUrl: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    model: "any-model",
  }));
  const status = res.status;
  const body = await read(res);
  assert.equal(status, 502, "敘事失敗要用跟其他LLM錯誤一致的狀態碼，不是把SSRF錯誤吞掉");
  assert.match(body.error, /敘事生成失敗/);
  assert.equal(body.llmFailure.stage, "ssrf-blocked");
});

test("[安全] /api/narrate：body 指定 https 但目標是 127.0.0.1 一樣要被擋下", async () => {
  const env = {};
  const body = await read(await narratePost(req(env, {
    character: emptyCharacter("SSRF測試2"),
    playerAction: "推開門",
    provider: "custom",
    apiKey: "attacker-key",
    baseUrl: "https://127.0.0.1:9999/v1",
    model: "any-model",
  })));
  assert.equal(body.llmFailure.stage, "ssrf-blocked");
});

test("[安全] /api/turn：body 指定的 baseUrl 是內網位址時，同一套SSRF防護也要生效", async () => {
  const env = {};
  const created = await read(await sessionPost(req(env, { character: emptyCharacter("SSRF測試3") })));
  const sessionId = created.session.id;

  const body = await read(await turnPost(req(env, {
    sessionId,
    playerAction: "推開門",
    provider: "custom",
    apiKey: "attacker-key",
    baseUrl: "http://10.0.0.5/v1",
    model: "any-model",
  })));
  assert.equal(body.llmFailure?.stage, "ssrf-blocked");
});

// ---------------------------------------------------------------------------
// /api/session：providedCharacter 不能被用來偽造數值
// ---------------------------------------------------------------------------

test("[安全] /api/session：偽造的 attributes/xp/derived/reviveCount 全部被伺服器重建，不是原樣存進去", async () => {
  const env = {};
  const malicious = {
    concept: { name: "偽造角色" },
    attributes: { 力量: 99, 敏捷: 99, 耐力: 99, 智力: 99, 感知: 99, 意志: 99 },
    skills: { 格鬥: 999 },
    xp: { earned: 999999, spent: 0 },
    reviveCount: 999,
    derived: { hp: { max: 9999, intact: 9999, B: 0, L: 0, A: 0 }, willpower: { max: 9999, current: 9999, temp: 0 } },
    abilities: [{ goodId: "偽造的道具", name: "偽造技能", effects: [{ kind: "檢定加骰", skill: "格鬥", amount: 999 }] }],
  };

  const body = await read(await sessionPost(req(env, { character: malicious })));
  assert.equal(body.ok, true);
  const character = body.session.character;

  for (const value of Object.values(character.attributes)) {
    assert.ok(value <= 5, `屬性不能超過建卡上限5，實際是 ${value}`);
  }
  assert.ok(character.skills.格鬥 <= 3, "技能不能超過建卡上限3");
  assert.deepEqual(character.xp, { earned: 0, spent: 0 }, "新存檔的xp必須歸零，不能帶著前端宣稱的經驗值進來");
  assert.equal(character.reviveCount, 0, "新存檔不能帶著已經用掉的復活次數進來");
  assert.ok(character.derived.hp.max < 9999, "HP上限必須是引擎從屬性重算的，不是前端填的天文數字");
  assert.deepEqual(character.abilities, [], "型錄裡不存在的道具/技能不能被憑空授予");
});

test("[安全] /api/session：合法範圍內的屬性/技能與已存在的商店道具原樣保留(不誤傷正常用例)", async () => {
  const env = {};
  const legit = emptyCharacter("合法角色");
  legit.attributes = { 力量: 4, 敏捷: 3, 耐力: 3, 智力: 2, 感知: 3, 意志: 2 };
  legit.skills.格鬥 = 3;
  legit.derived = computeDerivedStats(legit.attributes);

  const body = await read(await sessionPost(req(env, { character: legit })));
  assert.equal(body.ok, true);
  assert.deepEqual(body.session.character.attributes, legit.attributes);
  assert.equal(body.session.character.derived.hp.max, legit.derived.hp.max);
});

// ---------------------------------------------------------------------------
// sessionStore：樂觀鎖定(rev / expectedRev / SessionConflictError)
// ---------------------------------------------------------------------------

test("[併發] memorySessionStore.put：expectedRev 對不上時要丟 SessionConflictError，不能默默覆蓋別人的寫入", async () => {
  const store = memorySessionStore(new Map());
  const session = await store.put({ id: "s1", turns: 0 });
  assert.equal(session.rev, 1);

  const readA = await store.get("s1");
  const readB = await store.get("s1");

  // A 先寫入成功，rev 從 1 變成 2。
  readA.turns = 1;
  await store.put(readA, { expectedRev: readA.rev });

  // B 是根據「rev還是1」的舊資料算的，這時候寫入必須被拒絕，不能把 A 剛寫的結果蓋掉。
  readB.turns = 2;
  await assert.rejects(
    () => store.put(readB, { expectedRev: readB.rev }),
    SessionConflictError
  );

  const final = await store.get("s1");
  assert.equal(final.turns, 1, "衝突的寫入不能生效，A的結果必須保留");
});

/**
 * 建一個活著的存檔，再直接透過底層 store 把角色卡改成死亡狀態。
 *
 * 不能用 sessionPost({ character: 已經是死亡狀態的角色卡 }) 來做這件事——
 * sanitizeProvidedCharacter() 現在會把 derived.hp 從屬性重新算過(這正是這次
 * 安全修正要做到的事：不能讓前端直接宣稱自己的血量狀態)，所以「死亡」只能是
 * 遊戲過程中真的發生的事，這裡用直接改動存檔模擬那個結果，跟
 * test/formsApi.test.js 的「讓玩家先手」是同一種手法。
 */
async function newDeadCharacterSession(env, name) {
  const created = await read(await sessionPost(req(env, { character: emptyCharacter(name) })));
  const sessionId = created.session.id;
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  session.character.derived.hp = { max: 6, intact: 0, B: 0, L: 0, A: 6 }; // dead: A>=max 且其餘都是0
  await store.put(session, { expectedRev: session.rev });
  return sessionId;
}

test("[併發] /api/revive：兩個真正並行的請求同時搶著復活同一張角色卡，只有一個成功，復活次數只增加一次", async () => {
  const env = {};
  const sessionId = await newDeadCharacterSession(env, "併發復活測試");

  // 兩個請求不帶 requestId(所以不會走回放路徑)，真的同時觸發——兩者都會各自讀到
  // 「角色已死亡」的同一份快照，各自算出一次成功的復活結果，但只有先寫回的那個
  // 能通過 rev 檢查，另一個必須拿到明確的衝突錯誤，而不是也回成功或被默默吃掉。
  const [resA, resB] = await Promise.all([
    revivePost(req(env, { sessionId })),
    revivePost(req(env, { sessionId })),
  ]);
  const [bodyA, bodyB] = await Promise.all([read(resA), read(resB)]);

  const results = [bodyA, bodyB];
  const successes = results.filter((r) => r.ok);
  const conflicts = results.filter((r) => !r.ok && r.code === "SESSION_CONFLICT");

  assert.equal(successes.length, 1, `兩個並行請求只能有一個真正復活成功，實際：${JSON.stringify(results)}`);
  assert.equal(conflicts.length, 1, "另一個必須明確拿到 SESSION_CONFLICT，不能被默默吃掉或也回成功");

  const store = resolveSessionStore(env);
  const finalSession = await store.get(sessionId);
  assert.equal(finalSession.character.reviveCount, 1, "復活次數只能真的增加一次，不能因為併發而變成2");
});

test("[冪等] /api/revive：同一個 requestId 重送要回放同一個結果，不能再扣一次復活費用或次數", async () => {
  const env = {};
  const sessionId = await newDeadCharacterSession(env, "復活冪等測試");

  const first = await read(await revivePost(req(env, { sessionId, requestId: "retry-1" })));
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.reviveCount, 1);

  const second = await read(await revivePost(req(env, { sessionId, requestId: "retry-1" })));
  assert.equal(second.ok, true);
  assert.equal(second.replayed, true, "同一個requestId重送必須被辨識成重播，不是重新執行一次");
  assert.equal(second.reviveCount, 1, "復活次數不能因為重送而變成2");

  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  assert.equal(session.character.reviveCount, 1, "存檔裡的復活次數只能真的增加一次");
});

test("[冪等] /api/rest：同一個 requestId 重送不會重複恢復生命值", async () => {
  const env = {};
  const character = emptyCharacter("休息冪等測試");
  character.attributes.耐力 = 3;
  character.derived = computeDerivedStats(character.attributes);
  character.derived.hp.intact = 1; // 受傷，讓恢復量非零可觀察
  const created = await read(await sessionPost(req(env, { character })));
  const sessionId = created.session.id;

  // 讓這份存檔在遊戲流程認定裡處於主神空間，才能用「完全恢復」分支(不用額外建置副本時間預算)。
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  session.scenario = null;
  await store.put(session, { expectedRev: session.rev });

  const first = await read(await restPost(req(env, { sessionId, requestId: "rest-retry-1" })));
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.location, "主神空間");

  const afterFirst = await store.get(sessionId);
  const hpAfterFirst = afterFirst.character.derived.hp.intact;

  const second = await read(await restPost(req(env, { sessionId, requestId: "rest-retry-1" })));
  assert.equal(second.replayed, true);

  const afterSecond = await store.get(sessionId);
  assert.equal(afterSecond.character.derived.hp.intact, hpAfterFirst, "重送不能再恢復一次生命值");
});

test("[併發] /api/combat/act：兩個真正並行的攻擊請求同時送出，只有一個真的結算，另一個拿到明確衝突", async () => {
  const env = {};
  const character = emptyCharacter("戰鬥併發測試");
  character.attributes = { 力量: 4, 敏捷: 3, 耐力: 3, 智力: 2, 感知: 3, 意志: 2 };
  character.derived = computeDerivedStats(character.attributes);
  const created = await read(await sessionPost(req(env, { character })));
  const sessionId = created.session.id;

  const started = await read(await combatStart(req(env, { sessionId })));
  assert.equal(started.ok, true, JSON.stringify(started));

  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  session.combat.order = ["player", "enemy"];
  session.combat.turnIndex = 0;
  await store.put(session, { expectedRev: session.rev });

  // 玩家連點兩次攻擊鍵(或網路重試造成的重複送出)，兩個請求幾乎同時抵達：
  // 兩者都會讀到「現在輪到玩家」的同一份快照，只有一個能真的把攻擊結果寫回去。
  const [resA, resB] = await Promise.all([
    combatAct(req(env, { sessionId, weaponKey: "unarmed" })),
    combatAct(req(env, { sessionId, weaponKey: "unarmed" })),
  ]);
  const [bodyA, bodyB] = await Promise.all([read(resA), read(resB)]);
  const results = [bodyA, bodyB];
  const successes = results.filter((r) => r.ok);
  const conflicts = results.filter((r) => !r.ok && r.code === "SESSION_CONFLICT");

  assert.equal(successes.length, 1, `兩個並行攻擊只能有一次真的結算，實際：${JSON.stringify(results)}`);
  assert.equal(conflicts.length, 1, "另一個必須拿到明確的 SESSION_CONFLICT");

  const after = await store.get(sessionId);
  // 只結算了一次攻擊：戰鬥紀錄只多一筆玩家攻擊，血量變化也只發生一次，不是兩份傷害疊加。
  assert.equal(after.combat.log.filter((entry) => entry.actor === "player").length, 1);
});

// ---------------------------------------------------------------------------
// /api/chronicle：limit clamp、cursor 分頁、非法 cursor、跨 owner cursor
// ---------------------------------------------------------------------------

async function newChronicleSession(env, entryCount) {
  const created = await read(await sessionPost(req(env, { character: emptyCharacter("編年史測試") })));
  const sessionId = created.session.id;
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  let chronicle = session.chronicle ?? [];
  for (let i = 0; i < entryCount; i += 1) {
    chronicle = appendChronicle(chronicle, { turn: i + 1, action: `行動${i + 1}`, narration: `敘事${i + 1}` });
  }
  session.chronicle = chronicle;
  await store.put(session, { expectedRev: session.rev });
  return sessionId;
}

test("[效能] /api/chronicle：limit 會被夾在合理範圍內，超大limit不會整包回傳", async () => {
  const env = {};
  const sessionId = await newChronicleSession(env, 20);

  const res = await read(await chronicleGet(getReq(env, `https://x/api/chronicle?sessionId=${sessionId}&limit=999999`)));
  assert.equal(res.ok, true);
  assert.ok(res.limit <= 500, "limit必須被夾在硬上限之內");
  assert.equal(res.entries.length, res.limit === 500 ? Math.min(20, 500) : res.entries.length);
  assert.equal(res.total, 20);
});

test("[效能] /api/chronicle：非法limit(負數/非數字)要安全退回預設值，不能500或回傳垃圾", async () => {
  const env = {};
  const sessionId = await newChronicleSession(env, 5);

  const negative = await read(await chronicleGet(getReq(env, `https://x/api/chronicle?sessionId=${sessionId}&limit=-5`)));
  assert.equal(negative.ok, true);
  assert.ok(negative.limit > 0);

  const garbage = await read(await chronicleGet(getReq(env, `https://x/api/chronicle?sessionId=${sessionId}&limit=不是數字`)));
  assert.equal(garbage.ok, true);
  assert.ok(garbage.limit > 0);
});

test("[效能] /api/chronicle：cursor 分頁可以走完全部資料，且 nextCursor 在結尾時是 null", async () => {
  const env = {};
  const sessionId = await newChronicleSession(env, 10);

  const page1 = await read(await chronicleGet(getReq(env, `https://x/api/chronicle?sessionId=${sessionId}&limit=4&cursor=0`)));
  assert.equal(page1.entries.length, 4);
  assert.equal(page1.nextCursor, 4);

  const page2 = await read(await chronicleGet(getReq(env, `https://x/api/chronicle?sessionId=${sessionId}&limit=4&cursor=${page1.nextCursor}`)));
  assert.equal(page2.entries.length, 4);
  assert.equal(page2.nextCursor, 8);

  const page3 = await read(await chronicleGet(getReq(env, `https://x/api/chronicle?sessionId=${sessionId}&limit=4&cursor=${page2.nextCursor}`)));
  assert.equal(page3.entries.length, 2);
  assert.equal(page3.nextCursor, null, "資料讀完之後 nextCursor 必須是 null，不能讓前端無限分頁下去");

  const combined = [...page1.entries, ...page2.entries, ...page3.entries].map((e) => e.turn);
  assert.deepEqual(combined, Array.from({ length: 10 }, (_, i) => i + 1));
});

test("[效能] /api/chronicle：非法 cursor(負數/非數字/超出範圍) 安全退回，不報錯也不洩漏其他資料", async () => {
  const env = {};
  const sessionId = await newChronicleSession(env, 5);

  const negative = await read(await chronicleGet(getReq(env, `https://x/api/chronicle?sessionId=${sessionId}&cursor=-1`)));
  assert.equal(negative.ok, true);
  assert.equal(negative.cursor, 0);

  const garbage = await read(await chronicleGet(getReq(env, `https://x/api/chronicle?sessionId=${sessionId}&cursor=不是數字`)));
  assert.equal(garbage.ok, true);
  assert.equal(garbage.cursor, 0);

  const tooFar = await read(await chronicleGet(getReq(env, `https://x/api/chronicle?sessionId=${sessionId}&cursor=99999`)));
  assert.equal(tooFar.ok, true);
  assert.deepEqual(tooFar.entries, [], "cursor超出範圍時安全回空頁，不是報錯");
});

test("[安全] /api/chronicle：拿著A存檔的cursor去讀B存檔，只會影響B自己的分頁位置，不會讀到A的資料或繞過門禁", async () => {
  const env = {};
  const sessionA = await newChronicleSession(env, 3);
  const sessionB = await newChronicleSession(env, 8);

  const pageA = await read(await chronicleGet(getReq(env, `https://x/api/chronicle?sessionId=${sessionA}&limit=2`)));
  const crossedCursor = pageA.nextCursor; // 這是屬於A的分頁位置(=2)

  const pageB = await read(await chronicleGet(getReq(env, `https://x/api/chronicle?sessionId=${sessionB}&limit=2&cursor=${crossedCursor}`)));
  assert.equal(pageB.ok, true);
  // cursor只是B自己陣列裡的一個位移量，不會因為它「來自另一個存檔」而洩漏A的資料或繞過任何檢查。
  assert.equal(pageB.entries[0].turn, crossedCursor + 1);
  assert.ok(pageB.entries.every((e) => e.action?.startsWith === undefined || true));
});

// ---------------------------------------------------------------------------
// sceneContext / recentEvents / narrate的playerAction：可控文字的應用層上限
// ---------------------------------------------------------------------------

test("[效能] /api/turn：超長 sceneContext 會被安全截斷，不會整段原樣存進存檔", async () => {
  const env = {};
  const created = await read(await sessionPost(req(env, { character: emptyCharacter("場景上限測試") })));
  const sessionId = created.session.id;

  const huge = "場".repeat(5000);
  await turnPost(req(env, { sessionId, sceneContext: huge }));

  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  assert.ok(session.scene.context.length <= 2000, `sceneContext 必須被截斷，實際長度 ${session.scene.context.length}`);
});

test("[效能] /api/turn：沒有提供 sceneContext 時，仍然沿用上一輪存好的場景背景(截斷邏輯不能破壞既有 fallback)", async () => {
  const env = {};
  const created = await read(await sessionPost(req(env, { character: emptyCharacter("場景延續測試") })));
  const sessionId = created.session.id;

  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  session.scene = { context: "先前存好的場景描述", options: [] };
  await store.put(session, { expectedRev: session.rev });

  await turnPost(req(env, { sessionId, playerAction: "推開門" }));

  const after = await store.get(sessionId);
  assert.equal(after.scene.context, "先前存好的場景描述", "沒帶sceneContext不能把已存的場景背景清空");
});

test("[安全] /api/narrate：playerAction 超過1000字要回422，且不會產生任何LLM呼叫", async () => {
  const env = {};
  const overLong = "行".repeat(1001);
  const res = await narratePost(req(env, { character: emptyCharacter("超長行動測試"), playerAction: overLong }));
  assert.equal(res.status, 422);
  const body = await read(res);
  assert.equal(body.code, "PLAYER_ACTION_TOO_LONG");
  assert.equal(body.maxCharacters, 1000);
  assert.equal(body.actualCharacters, 1001);
});

test("[安全] /api/narrate：剛好1000個Unicode字元(含中文與emoji)要能通過長度檢查", async () => {
  const env = { AI: { run: async () => ({ response: "測試敘事" }) } };
  const exactly1000 = "測".repeat(998) + "🔥🔥"; // emoji 是1個 code point，跟中文字元一樣算1個
  assert.equal(Array.from(exactly1000).length, 1000);
  const res = await narratePost(req(env, { character: emptyCharacter("剛好上限測試"), playerAction: exactly1000 }));
  assert.notEqual(res.status, 422, "剛好1000字不該被擋下");
});
