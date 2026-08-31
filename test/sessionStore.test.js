// content/storage/sessionStore.js 與 content/characterBuilder.js 的測試。
//
// KV 用假的 binding 依賴注入測試（跟 llm.test.js 測 Workers AI 同一套做法），
// 不需要真的 Cloudflare 帳號。這裡測不到的是「KV 的最終一致性行為」，
// 那只能靠實際部署驗證，已寫在 sessionStore.js 檔頭。
import test from "node:test";
import assert from "node:assert/strict";
import {
  HISTORY_LIMIT,
  HISTORY_MAX,
  createSession,
  pushHistory,
  historyToPromptText,
  kvSessionStore,
  memorySessionStore,
  resolveSessionStore,
} from "../content/storage/sessionStore.js";
import { buildCharacter, chargenRules, ATTRIBUTE_BUDGET, SKILL_BUDGET } from "../content/characterBuilder.js";
import { appendEvent, EVENT_TYPES } from "../core/eventLog.js";

/** 假的 Cloudflare KV binding */
function fakeKv() {
  const map = new Map();
  return {
    map,
    async get(key, type) {
      const raw = map.get(key);
      if (raw == null) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix, limit } = {}) {
      const keys = [...map.keys()].filter((k) => !prefix || k.startsWith(prefix)).slice(0, limit);
      return { keys: keys.map((name) => ({ name })) };
    },
  };
}

/** 一份合法的建卡草稿：屬性花滿6點自由點數、技能花滿8點自由點數(六維輕量版建卡的固定總預算，
 *  見 content/characterBuilder.js／RULES_DIGEST.md 第6節)，數值跟「特戰隊員」身分模板一致。 */
function validDraft() {
  return {
    concept: { name: "測試輪迴者", gender: "女", age: 24, background: "測試用" },
    attributes: { 力量: 2, 敏捷: 4, 耐力: 2, 智力: 1, 感知: 2, 意志: 1 },
    skills: { 射擊: 3, 潛行: 2, 體魄: 2, 偵察: 1 },
  };
}

// --- 存檔內容 ---

test("createSession：新存檔有空的事件日誌與空的敘事記憶", () => {
  const s = createSession({ id: "abc", character: { attributes: {} } });
  assert.equal(s.id, "abc");
  assert.deepEqual(s.log.events, []);
  assert.deepEqual(s.history, []);
  assert.ok(s.createdAt);
});

test("pushHistory：累積到 HISTORY_MAX 才裁切，而且一次裁回 HISTORY_LIMIT", () => {
  let history = [];
  for (let i = 0; i < HISTORY_MAX; i++) {
    history = pushHistory(history, { action: `行動${i}`, narration: `敘事${i}` });
  }
  assert.equal(history.length, HISTORY_MAX, "還沒超過上限之前只追加、不裁切");
  assert.equal(history[0].action, "行動0", "最舊的一筆還在，前綴才不會每回合都變");

  history = pushHistory(history, { action: "行動最新", narration: "敘事最新" });
  assert.equal(history.length, HISTORY_LIMIT, "超過上限時一次裁回下限");
  assert.equal(history.at(-1).action, "行動最新", "最後一筆應該是最新的");
  assert.ok(!history.some((h) => h.action === "行動0"), "最舊的應該被裁掉");
});

test("pushHistory：裁切之間的每一輪都只在尾端追加（prompt cache 前綴穩定性）", () => {
  // 這一題是 content/llm/cacheLayers.js 那套分層的前提：歷史前綴每回合都變的話，
  // 靜態層以外的東西一個 token 都快取不到。壞掉時遊戲照跑，只會反映在帳單與 TTFT 上，
  // 所以一定要有一個測試釘住它。
  let history = [];
  for (let i = 0; i < HISTORY_LIMIT; i++) {
    history = pushHistory(history, { action: `行動${i}`, narration: `敘事${i}` });
  }
  const before = history;
  const after = pushHistory(history, { action: "新行動", narration: "新敘事" });
  assert.deepEqual(after.slice(0, before.length), before, "既有的每一輪都必須逐字不變");
  assert.equal(after.length, before.length + 1);
});

test("pushHistory：不修改傳入的陣列(避免共用同一份而互相污染)", () => {
  const original = [{ action: "a", narration: "n" }];
  const next = pushHistory(original, { action: "b", narration: "m" });
  assert.equal(original.length, 1);
  assert.equal(next.length, 2);
});

test("historyToPromptText：沒有紀錄時回傳null(讓呼叫端知道這是第一輪)", () => {
  assert.equal(historyToPromptText([]), null);
  assert.equal(historyToPromptText(undefined), null);
});

test("historyToPromptText：把玩家行動與敘事都組進去", () => {
  const text = historyToPromptText([
    { action: "推開氣閘門", narration: "鏽味嗆進喉嚨。" },
    { action: "潛行接近", narration: "它轉過頭來。" },
  ]);
  assert.match(text, /推開氣閘門/);
  assert.match(text, /鏽味嗆進喉嚨/);
  assert.match(text, /它轉過頭來/);
});

// --- 儲存後端 ---

for (const [name, makeStore] of [
  ["KV", () => kvSessionStore(fakeKv())],
  ["記憶體", () => memorySessionStore(new Map())],
]) {
  test(`${name}版：存進去再讀出來，內容一致`, async () => {
    const store = makeStore();
    const s = createSession({ id: "s1", character: { attributes: { 力量: 3 } } });
    appendEvent(s.log, EVENT_TYPES.CHECK, { label: "測試", success: true, margin: 1 });
    await store.put(s);

    const loaded = await store.get("s1");
    assert.equal(loaded.id, "s1");
    assert.equal(loaded.character.attributes["力量"], 3);
    assert.equal(loaded.log.events.length, 1);
    assert.equal(loaded.log.events[0].payload.label, "測試");
  });

  test(`${name}版：讀不存在的存檔回傳null，不丟錯`, async () => {
    const store = makeStore();
    assert.equal(await store.get("不存在"), null);
  });

  test(`${name}版：刪除後就讀不到了`, async () => {
    const store = makeStore();
    await store.put(createSession({ id: "s2", character: {} }));
    await store.delete("s2");
    assert.equal(await store.get("s2"), null);
  });

  test(`${name}版：list列出存檔ID`, async () => {
    const store = makeStore();
    await store.put(createSession({ id: "a", character: {} }));
    await store.put(createSession({ id: "b", character: {} }));
    const ids = await store.list();
    assert.deepEqual(ids.sort(), ["a", "b"]);
  });

  test(`${name}版：put會更新updatedAt`, async () => {
    const store = makeStore();
    const s = createSession({ id: "s3", character: {} });
    const before = s.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await store.put(s);
    assert.notEqual((await store.get("s3")).updatedAt, before);
  });
}

test("記憶體版必須標記 persistent:false(呼叫端要顯示警告給使用者)", () => {
  assert.equal(memorySessionStore().persistent, false);
  assert.equal(kvSessionStore(fakeKv()).persistent, true);
});

test("resolveSessionStore：有KV binding就用KV，沒有就退到記憶體版", () => {
  assert.equal(resolveSessionStore({ SAVES: fakeKv() }).kind, "kv");
  assert.equal(resolveSessionStore({}).kind, "memory");
});

// --- 建卡 ---

// chargenRules() 的內容改由 test/characterBuilder.test.js 負責（建卡改成生平問答之後，
// 它回傳的主體是題目而不是預算常數）。這裡只保留「存檔相關」的測試，不重複測同一件事。
test("buildCharacter：合法草稿組出完整角色卡，衍生屬性由引擎算", () => {
  const result = buildCharacter(validDraft());
  assert.equal(result.valid, true, `不該有錯誤：${result.errors.join("；")}`);

  const c = result.character;
  assert.equal(c.concept.name, "測試輪迴者");
  assert.equal(c.attributes["敏捷"], 4);
  assert.equal(c.skills["射擊"], 3);
  assert.equal(c.skills["醫療"], 0, "沒填的技能要補0，否則performCheck會丟錯");

  // 衍生屬性：耐力2 + 體積5 = 7
  assert.equal(c.derived.hp.max, 7);
  assert.equal(c.derived.hp.intact, 7);
  assert.equal(c.derived.willpower.max, 2); // 意志1 × 2
  assert.equal(c.derived.initiative, 6); // 敏捷4 + 感知2
  assert.equal(c.derived.baseDefense, 2); // min(敏捷4, 感知2)
});

test("buildCharacter：超出預算要擋下來並說清楚超了多少", () => {
  const draft = validDraft();
  draft.attributes["力量"] = 5;
  draft.attributes["智力"] = 5;
  const result = buildCharacter(draft);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(), /屬性點數超支/);
  assert.equal(result.character, undefined, "驗證失敗時不可以回傳角色卡");
});

test("buildCharacter：沒有名字要擋下來", () => {
  const draft = validDraft();
  draft.concept.name = "  ";
  assert.match(buildCharacter(draft).errors.join(), /名稱/);
});

// [已知簡化] 輕量版 buildCharacter() 只看 ATTRIBUTE_KEYS/ALL_SKILLS 範圍內的欄位，
// 草稿裡任何範圍外的鍵一律被忽略，不會被拒絕也不會被套用到角色卡上——不是漏擋，
// 是輕量版本來就沒有「嚴格擋未知欄位」這道查核(見 content/characterBuilder.js)。
test("buildCharacter：範圍外的屬性/技能欄位會被忽略，不影響驗證結果", () => {
  const draft = validDraft();
  draft.attributes["魅力"] = 3;
  draft.skills["駭客"] = 2;
  const result = buildCharacter(draft);
  assert.equal(result.valid, true);
  assert.equal(result.character.attributes["魅力"], undefined);
  assert.equal(result.character.skills["駭客"], undefined);
});

test("buildCharacter：技能等級不能小於0或大於3", () => {
  const draft = validDraft();
  draft.skills["醫療"] = 4;
  assert.match(buildCharacter(draft).errors.join(), /醫療 不能大於 3/);
});

test("buildCharacter：驗證失敗時仍回傳budgets，讓UI能顯示還剩幾點", () => {
  const draft = validDraft();
  draft.concept.name = "";
  const result = buildCharacter(draft);
  assert.equal(result.valid, false);
  assert.ok(result.budgets.attributes, "UI需要即時顯示預算，失敗時也要給");
  assert.equal(typeof result.budgets.attributes.remaining, "number");
});
