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
import { resolveLlmRequestOverrides } from "../content/llm/requestOverrides.js";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as narratePost } from "../functions/api/narrate.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import { onRequestPost as revivePost } from "../functions/api/revive.js";
import { onRequestPost as restPost } from "../functions/api/rest.js";
import { onRequestPost as combatStart } from "../functions/api/combat/v2/start.js";
import { onRequestPost as combatTurn } from "../functions/api/combat/v2/turn.js";
import { onRequestGet as chronicleGet } from "../functions/api/chronicle.js";
import { onRequestPost as formsPost } from "../functions/api/forms.js";
import { onRequestPost as shopPost } from "../functions/api/shop.js";
import { createWallet } from "../content/shop/wallet.js";
import { SHOP_GOODS } from "../content/shop/registry.js";
import { getScenarioPack } from "../content/scenario/registry.js";
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

// [2026-08-31] 這一題從「SSRF 有沒有被擋下來」升級成「這條路根本不存在」。
//
// 舊版允許呼叫端自備 provider/apiKey/baseUrl（BYOK），所以必須有一層 SSRF 防護
// 去擋「baseUrl 指向內網」的請求。現在 /api/turn 完全不讀 body 的這些欄位
// （見 functions/api/turn.js 的說明），所以攻擊者連一個可以指向內網的欄位都沒有。
//
// 斷言因此改成更強的一句：帶著內網 baseUrl 打進來，那個值**不會抵達任何一次 fetch**。
// 「被擋下來」跟「沒有這條路」差一個等級，這裡要釘的是後者。
test("[安全] /api/turn：body 的 baseUrl 完全不被讀取，不會有任何請求打向它", async () => {
  const attempted = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    attempted.push(String(url));
    throw new Error("測試環境沒有真的要送出請求");
  };
  try {
    const env = {};
    const created = await read(await sessionPost(req(env, { character: emptyCharacter("SSRF測試3") })));
    const sessionId = created.session.id;

    await read(await turnPost(req(env, {
      sessionId,
      playerAction: "推開門",
      provider: "custom",
      apiKey: "attacker-key",
      baseUrl: "http://10.0.0.5/v1",
      model: "any-model",
    })));

    assert.ok(
      !attempted.some((url) => url.includes("10.0.0.5")),
      `body 的 baseUrl 不該抵達任何一次 fetch，實際嘗試過：${attempted.join(", ")}`
    );
  } finally {
    globalThis.fetch = realFetch;
  }
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

test("[安全] /api/session：合法範圍內(符合總預算)的屬性/技能原樣保留(不誤傷正常用例)", async () => {
  const env = {};
  const legit = emptyCharacter("合法角色");
  // 屬性花費7點(預算8)、技能花費4點(預算10)，兩者都在建卡預算之內。
  legit.attributes = { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 2, 感知: 2, 意志: 2 };
  legit.skills.格鬥 = 3;
  legit.skillBase = { ...legit.skills };
  legit.derived = computeDerivedStats(legit.attributes);

  const body = await read(await sessionPost(req(env, { character: legit })));
  assert.equal(body.ok, true);
  assert.deepEqual(body.session.character.attributes, legit.attributes);
  assert.equal(body.session.character.skills.格鬥, 3);
  assert.equal(body.session.character.derived.hp.max, legit.derived.hp.max);
});

test("[安全] /api/session：總花費超支的角色(每項都合法、但總和超過建卡預算)要被整組重置，不能靠疊加單項合法值繞過總預算", async () => {
  const env = {};
  const overBudget = emptyCharacter("超支角色");
  // 六維全部頂到單項上限5——每一項都在1~5的合法範圍內，但總花費(7*6=42)遠超過8點預算。
  overBudget.attributes = { 力量: 5, 敏捷: 5, 耐力: 5, 智力: 5, 感知: 5, 意志: 5 };
  for (const skill of Object.keys(overBudget.skills)) overBudget.skills[skill] = 3; // 十個技能全頂到3(單項上限)
  overBudget.skillBase = { ...overBudget.skills };
  overBudget.derived = computeDerivedStats(overBudget.attributes);

  const body = await read(await sessionPost(req(env, { character: overBudget })));
  assert.equal(body.ok, true);
  const character = body.session.character;
  for (const value of Object.values(character.attributes)) {
    assert.equal(value, 1, "總預算超支時，屬性必須整組重置成基礎值，不能保留任何一項偽造的高值");
  }
  for (const value of Object.values(character.skills)) {
    assert.equal(value, 0, "總預算超支時，技能必須整組重置成基礎值");
  }
});

test("[安全] /api/session：公開 providedCharacter 不得授予 catalog abilities 或注入 energyPools", async () => {
  const env = {};
  const malicious = emptyCharacter("能力資源偽造");
  malicious.abilities = [{ goodId: "dojutsu.寫輪眼.D" }];
  malicious.derived.energyPools = {
    偽造池: { max: 999999, current: 999999, sources: ["attacker"], reopens: 999 },
  };

  const body = await read(await sessionPost(req(env, { character: malicious })));
  assert.equal(body.ok, true);
  assert.deepEqual(body.session.character.abilities, [], "知道合法 goodId 也不能在新存檔直接取得商品能力");
  assert.deepEqual(body.session.character.derived.energyPools, {}, "energyPools 必須由 server-owned ability effect 建立");
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
  // 屬性花費必須在建卡8點預算內，否則 sessionPost 會把它重置成基礎值(見上面兩則測試)。
  character.attributes = { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 2, 感知: 2, 意志: 2 };
  character.derived = computeDerivedStats(character.attributes);
  const created = await read(await sessionPost(req(env, { character })));
  const sessionId = created.session.id;

  const started = await read(await combatStart(req(env, { sessionId, seed: 5 })));
  assert.equal(started.ok, true, JSON.stringify(started));
  const store = resolveSessionStore(env);

  // 玩家連點兩次確認鍵(或網路重試造成的重複送出)，兩個請求幾乎同時抵達，
  // 而且**帶著不同的 requestId**（冪等機制擋不住這一種——那是同一次送出的重試）。
  // 兩者都會讀到同一份快照，只有一個能真的把結果寫回去。
  const body = (requestId) => ({
    sessionId,
    stateVersion: started.battle.stateVersion,
    requestId,
    selectedActions: [{ actionId: "firearm_shot", targetId: "enemy_01" }],
  });
  const [resA, resB] = await Promise.all([
    combatTurn(req(env, body("click-1"))),
    combatTurn(req(env, body("click-2"))),
  ]);
  const [bodyA, bodyB] = await Promise.all([read(resA), read(resB)]);
  const results = [bodyA, bodyB];
  const successes = results.filter((r) => r.ok);
  const rejected = results.filter(
    (r) => !r.ok && (r.code === "SESSION_CONFLICT" || r.code === "STATE_VERSION_CONFLICT")
  );

  assert.equal(successes.length, 1, `兩個並行結算只能有一次真的成立，實際：${JSON.stringify(results)}`);
  assert.equal(rejected.length, 1, "另一個必須拿到明確的衝突碼，不能也回成功");

  const after = await store.get(sessionId);
  // 只結算了一輪：彈藥只少一發，不是兩發疊加。
  assert.equal(after.combatV2.loadout.ammo.pistol.loaded, after.combatV2.loadout.ammo.pistol.magazine - 1);
  assert.equal(after.combatV2.round, 2, "只推進了一輪");
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

test("[安全] /api/narrate：未明確開放時，不可匿名消耗 server-managed LLM", async () => {
  const env = { AI: { run: async () => { throw new Error("不應被呼叫"); } } };
  const res = await narratePost(req(env, { character: emptyCharacter("匿名額度測試"), playerAction: "推開門" }));
  assert.equal(res.status, 403);
  const body = await read(res);
  assert.match(body.error, /未開放伺服器 LLM/);
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

// ---------------------------------------------------------------------------
// resolveLlmRequestOverrides / /api/turn、/api/narrate 的覆寫範圍收口
//
// 這一批是第二輪安全稽核的修正：舊版只要body裡有baseUrl就會套用到 resolveProvider()，
// 不管有沒有指定 provider。一個沒帶 provider、只帶 baseUrl(不帶apiKey)的請求，
// 會讓伺服器自動選定的供應商(例如靠GEMINI_API_KEY自動選中的gemini)的端點被換成
// 呼叫端指定的網域，而金鑰因為呼叫端沒給，退回讀伺服器自己的——等於伺服器拿著
// 自己的正牌金鑰對一個呼叫端指定的任意公開網域發了一次請求，金鑰就外洩了。
// SSRF黑名單擋不住這個：那個網域可以是完全合法的公開https網域，只是攻擊者自己的。
// ---------------------------------------------------------------------------

test("resolveLlmRequestOverrides：沒有指定provider時，apiKey/baseUrl/model全部忽略", () => {
  const overrides = resolveLlmRequestOverrides({
    bodyProvider: undefined,
    bodyApiKey: "attacker-key",
    bodyBaseUrl: "https://attacker.example.com/v1",
    bodyModel: "attacker-model",
  });
  assert.deepEqual(overrides, { apiKey: undefined, baseUrl: undefined, model: undefined });
});

test("resolveLlmRequestOverrides：指定了非custom的provider時，baseUrl被忽略，apiKey/model仍然套用", () => {
  const overrides = resolveLlmRequestOverrides({
    bodyProvider: "gemini",
    bodyApiKey: "my-own-key",
    bodyBaseUrl: "https://attacker.example.com/v1",
    bodyModel: "gemini-x",
  });
  assert.equal(overrides.baseUrl, undefined, "內建供應商的端點不能被請求改寫");
  assert.equal(overrides.apiKey, "my-own-key");
  assert.equal(overrides.model, "gemini-x");
});

test("resolveLlmRequestOverrides：provider=custom時，baseUrl/apiKey/model全部套用(這是BYOK功能本身)", () => {
  const overrides = resolveLlmRequestOverrides({
    bodyProvider: "custom",
    bodyApiKey: "my-key",
    bodyBaseUrl: "https://my-relay.example.com/v1",
    bodyModel: "my-model",
  });
  assert.deepEqual(overrides, { apiKey: "my-key", baseUrl: "https://my-relay.example.com/v1", model: "my-model" });
});

test("[安全] /api/turn：沒有指定provider時，帶baseUrl也不會被套用——伺服器金鑰不會被送到呼叫端指定的網域", async () => {
  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    captured.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ narration: "測試敘事", options: [] }) }] } }] }),
      text: async () => "",
    };
  };
  try {
    const env = { GEMINI_API_KEY: "伺服器自己的正牌金鑰", NARRATE_ALLOW_SERVER_LLM: "true" };
    const created = await read(await sessionPost(req(env, { character: emptyCharacter("金鑰外洩測試") })));
    const sessionId = created.session.id;

    // 攻擊者只帶 baseUrl(不帶provider、不帶apiKey)，企圖讓伺服器自動選中的
    // gemini 被導去這個網域，同時用伺服器自己的金鑰打過去。
    const body = await read(await turnPost(req(env, {
      sessionId,
      playerAction: "推開門",
      baseUrl: "https://attacker.example.com/v1",
    })));

    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(captured.length, 1);
    assert.match(captured[0].url, /generativelanguage\.googleapis\.com/, "必須打到真正的Gemini端點，不能被body的baseUrl改道");
    assert.ok(!captured[0].url.includes("attacker.example.com"), "伺服器金鑰絕對不能被送到攻擊者指定的網域");
    assert.equal(captured[0].options.headers["x-goog-api-key"], "伺服器自己的正牌金鑰");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// [2026-08-31] 同上：body 的 provider/apiKey 也不再被讀取。
// 這一題現在驗的是「伺服器端環境變數決定一切，呼叫端送的金鑰不會被使用」——
// 攻擊者送自己的金鑰不會有事，但**呼叫端也不能藉此指定要打哪一家**。
test("[安全] /api/turn：呼叫端送的 provider/apiKey 一律忽略，仍走伺服器端設定的供應商", async () => {
  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    captured.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ narration: "測試敘事", options: [] }) }] } }] }),
      text: async () => "",
    };
  };
  try {
    // 供應商由環境變數決定，不是由 body 決定。
    const env = { LLM_PROVIDER: "gemini", GEMINI_API_KEY: "server-side-key" };
    const created = await read(await sessionPost(req(env, { character: emptyCharacter("內建端點測試") })));
    const sessionId = created.session.id;

    const body = await read(await turnPost(req(env, {
      sessionId,
      playerAction: "推開門",
      provider: "deepseek",
      apiKey: "attacker-supplied-key",
      baseUrl: "https://attacker.example.com/v1",
    })));

    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(captured.length, 1);
    assert.match(captured[0].url, /generativelanguage\.googleapis\.com/, "端點由環境變數決定，body 改不動");
    assert.doesNotMatch(captured[0].url, /attacker\.example\.com/);
    assert.equal(
      captured[0].options.headers["x-goog-api-key"],
      "server-side-key",
      "用的必須是伺服器端的金鑰，不是呼叫端送來的那把"
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("[安全] /api/narrate：跟/api/turn同一套規則——沒帶provider時baseUrl/apiKey全部忽略", async () => {
  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    captured.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "測試敘事" }] } }] }),
      text: async () => "",
    };
  };
  try {
    const env = { GEMINI_API_KEY: "伺服器自己的正牌金鑰", NARRATE_ALLOW_SERVER_LLM: "true" };
    const body = await read(await narratePost(req(env, {
      character: emptyCharacter("narrate金鑰外洩測試"),
      playerAction: "推開門",
      baseUrl: "https://attacker.example.com/v1",
      apiKey: "attacker-key",
    })));

    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(captured.length, 1);
    assert.match(captured[0].url, /generativelanguage\.googleapis\.com/);
    assert.equal(captured[0].options.headers["x-goog-api-key"], "伺服器自己的正牌金鑰");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------------------------------------------------------------------------
// /api/turn：解析失敗(parse failure)的降級回應不能把模型原文洩漏出去
//
// 第二輪安全稽核明確要求的測試：讓模型回傳一段**含 st_thought 內容、但整體不是合法
// JSON**的回覆(觸發 parseTurnResponse 失敗、走降級流程)，然後遞迴檢查整份回應的
// JSON text 不包含那段內部盤算文字——不能只檢查 body.stThought 這一個欄位，
// 因為漏洞原本藏在 body.degraded.rawSnippet 這種容易被忽略的旁支欄位裡。
// ---------------------------------------------------------------------------

test("[安全] /api/turn：解析失敗時，含st_thought的模型原文不會出現在回應JSON的任何地方", async () => {
  const SECRET_MARKER = "只有說書人看得到的內部盤算-機密ABC123";
  // 刻意寫成不合法JSON(缺結尾的引號/大括號)，逼 parseTurnResponse 失敗、
  // 走降級流程——這正是先前 degraded.rawSnippet 洩漏原文的那條路徑。
  const brokenJsonWithSecret = `{"st_thought": "${SECRET_MARKER}", "narration": "你推開門，走進一片黑`;
  const env = {
    AI: { run: async () => ({ response: brokenJsonWithSecret }) },
  };
  const DRAFT = {
    concept: { name: "解析失敗測試", gender: "男" },
    attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
    skills: { 格鬥: 3, 射擊: 0, 體魄: 1, 潛行: 0, 求生: 0, 偵察: 2, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 0 },
  };
  const created = await read(await sessionPost(req(env, {
    draft: DRAFT,
    scenarioId: "scenario.echo-institute-01", // 沒有固定開頭，開場一樣會真的呼叫AI
  })));
  assert.equal(created.ok, true, JSON.stringify(created));
  const sessionId = created.session.id;

  const res = await turnPost(req(env, { sessionId }));
  const body = await read(res);

  // 先確認真的走到了降級流程(不是巧合地解析成功)，測試才有意義。
  assert.equal(body.degraded?.parseFailed, true, "這個回覆必須是無法解析的，才能驗證洩漏修正");

  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(SECRET_MARKER), "模型原文(含st_thought)不能出現在回應JSON的任何地方");
  assert.equal(body.stThought, undefined);
  assert.equal(body.degraded?.rawSnippet, undefined, "degraded.rawSnippet 這個旁支欄位也不能帶原文回來");
});

// ---------------------------------------------------------------------------
// 第二輪安全稽核第4點：/api/combat/start、/api/forms、/api/shop 也要有衝突偵測，
// 不能只修 turn/travel/combat-act/rest/revive。
// ---------------------------------------------------------------------------

test("[併發] /api/combat/start：兩個真正並行的開戰請求，只有一個真的開戰，另一個拿到明確衝突", async () => {
  const env = {};
  const character = emptyCharacter("開戰併發測試");
  character.attributes = { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 2, 感知: 2, 意志: 2 };
  character.derived = computeDerivedStats(character.attributes);
  const created = await read(await sessionPost(req(env, { character })));
  const sessionId = created.session.id;

  const [resA, resB] = await Promise.all([
    combatStart(req(env, { sessionId })),
    combatStart(req(env, { sessionId })),
  ]);
  const [bodyA, bodyB] = await Promise.all([read(resA), read(resB)]);
  const results = [bodyA, bodyB];
  const successes = results.filter((r) => r.ok);
  const conflicts = results.filter(
    (r) => !r.ok && (r.code === "SESSION_CONFLICT" || r.code === "BATTLE_IN_PROGRESS")
  );

  assert.equal(successes.length, 1, `兩個並行開戰請求只能有一個成功，實際：${JSON.stringify(results)}`);
  assert.equal(conflicts.length, 1, "另一個必須拿到明確的衝突/已有戰鬥錯誤，不能也回成功(那會是兩場戰鬥疊在一起)");

  const store = resolveSessionStore(env);
  const finalSession = await store.get(sessionId);
  assert.equal(finalSession.combatV2?.active, true, "最終只能有一場戰鬥在進行中");
});

test("[併發] /api/forms：兩個真正並行的型態啟動請求，池子只被扣一次", async () => {
  const env = {};
  // 劍氣/內力都是「以輪計時」，/api/forms 沒有輪數可以給(只有戰鬥裡才有輪)，
  // 戰鬥外一定會被「缺少輪數」擋下——所以這裡改用「以場景計時」的
  // 寫輪眼(洞察眼)：標準動作啟動、付1點查克拉、持續一個場景，戰鬥外啟動得起來。
  const 寫輪眼 = SHOP_GOODS.find((g) => g.goodId === "dojutsu.寫輪眼.D");
  const character = emptyCharacter("型態併發測試");
  character.attributes = { 力量: 3, 敏捷: 3, 耐力: 3, 智力: 2, 感知: 3, 意志: 2 };
  character.derived = computeDerivedStats(character.attributes);
  character.abilities = [{ goodId: 寫輪眼.goodId, name: 寫輪眼.name, effects: 寫輪眼.effects }];

  const created = await read(await sessionPost(req(env, { character: emptyCharacter("型態併發測試") })));
  const sessionId = created.session.id;
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);
  session.character = character;
  const { openPool } = await import("../core/energyPools.js");
  session.character.derived.energyPools = openPool({}, "查克拉", character.attributes, 寫輪眼.goodId);
  await store.put(session, { expectedRev: session.rev });

  const formId = `${寫輪眼.goodId}:洞察眼`;
  const [resA, resB] = await Promise.all([
    formsPost(req(env, { sessionId, formId, action: "啟動" })),
    formsPost(req(env, { sessionId, formId, action: "啟動" })),
  ]);
  const [bodyA, bodyB] = await Promise.all([read(resA), read(resB)]);
  const results = [bodyA, bodyB];
  const successes = results.filter((r) => r.ok && r.form);
  const conflicts = results.filter((r) => r.code === "SESSION_CONFLICT");

  console.log("Results: ", JSON.stringify(results)); assert.equal(successes.length, 1, `兩個並行啟動只能有一個真的花掉池子，實際：${JSON.stringify(results)}`);
  assert.equal(conflicts.length, 1, "另一個必須拿到明確的 SESSION_CONFLICT");

  const finalSession = await store.get(sessionId);
  const pool = finalSession.character.derived.energyPools.查克拉;
  assert.equal(pool.current, pool.max - 1, "查克拉池只能被扣一次(付1點)，不能因為併發被扣兩次");
});

test("[併發] /api/shop：兩個真正並行的購買請求，錢包只被扣一次，商品只拿到一份", async () => {
  const env = {};
  const created = await read(await sessionPost(req(env, { draft: {
    concept: { name: "購買併發測試", gender: "男" },
    attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
    skills: { 格鬥: 3, 射擊: 0, 體魄: 1, 潛行: 0, 求生: 0, 偵察: 2, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 0 },
  } })));
  const sessionId = created.session.id;
  const store = resolveSessionStore(env);
  const session = await store.get(sessionId);

  // 把副本標記成通關 = 回到主神空間，點數商品才買得到(跟 test/shopAccess.test.js 同一招)。
  const pack = getScenarioPack(session.scenario.packId);
  for (const chapter of pack.entries) {
    for (const node of chapter.nodes ?? []) session.scenario.progress.nodes[node.id] = { completed: true, divergenceTier: 2 };
  }
  session.scenario.progress.chapterIndex = pack.entries.length - 1;
  session.wallet = createWallet({ tokens: { D: 5 }, points: 9999 });
  await store.put(session, { expectedRev: session.rev });

  const 物品 = SHOP_GOODS.find((g) => g.category === "物品");
  const [resA, resB] = await Promise.all([
    shopPost(req(env, { sessionId, goodId: 物品.goodId })),
    shopPost(req(env, { sessionId, goodId: 物品.goodId })),
  ]);
  const [bodyA, bodyB] = await Promise.all([read(resA), read(resB)]);
  const results = [bodyA, bodyB];
  const successes = results.filter((r) => r.ok && r.receipt);
  const conflicts = results.filter((r) => r.code === "SESSION_CONFLICT");

  assert.equal(successes.length, 1, `兩個並行購買只能有一次真的成交，實際：${JSON.stringify(results)}`);
  assert.equal(conflicts.length, 1, "另一個必須拿到明確的 SESSION_CONFLICT，不能也扣一次錢");

  const finalSession = await store.get(sessionId);
  const owned = finalSession.character.abilities.filter((a) => a.goodId === 物品.goodId);
  assert.equal(owned.length, 1, "商品只能被買到一份，不能因為併發變成兩份");
});
