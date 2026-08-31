// Prompt cache 分層的回歸測試（見 content/llm/cacheLayers.js）。
//
// 這一組測試存在的理由跟其他測試不太一樣：**分層寫錯的時候，遊戲完全不會壞。**
// 敘事照樣生成、選項照樣回來、所有既有測試照樣綠燈——唯一的差別是每一回合都把
// 整份 prompt 重新算一次錢，帳單變貴、TTFT 變慢。這種退化沒有人會在 code review 裡看出來，
// 也不會有玩家回報，所以只能靠測試釘住。
//
// 釘住的四件事，對應 prefix caching 的四個前提：
//   1. 靜態層（system）在回合之間**逐字相同**
//   2. 靜態層裡沒有混進任何每回合都變的值
//   3. 歷史層只在尾端追加，既有的每一則不變
//   4. messages 的順序是 system -> 歷史 -> 這一回合的動態輸入
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import {
  detectDynamicLeaks,
  historyToMessages,
  buildLayeredRequest,
  extractCacheStats,
  NO_PLAYER_ACTION_MARKER,
} from "../content/llm/cacheLayers.js";

const DRAFT = {
  concept: { name: "快取測試者", gender: "女" },
  attributes: { 力量: 2, 敏捷: 3, 耐力: 2, 智力: 2, 感知: 2, 意志: 1 },
  skills: { 格鬥: 1, 射擊: 0, 體魄: 1, 潛行: 2, 求生: 0, 偵察: 3, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 0 },
};

// 有固定開頭的副本會在開場直接短路、完全不呼叫 AI，那樣就測不到 prompt 組裝。
const NO_SCRIPTED_OPENING_SCENARIO = "scenario.echo-institute-01";

function reply(seed) {
  return JSON.stringify({
    st_thought: `盤算${seed}`,
    narration: `第${seed}段敘事：走廊的燈管閃了一下，遠處傳來金屬摩擦聲。`,
    options: [
      { label: `往前走${seed}`, hint: "想知道聲音來源", requiresCheck: true, attribute: "敏捷", skill: "潛行", difficulty: "普通" },
      { label: `翻找櫃子${seed}`, hint: "想找到能用的東西", requiresCheck: true, attribute: "感知", skill: "偵察", difficulty: "普通" },
      { label: `敲一下管線${seed}`, hint: "想試探回音", requiresCheck: true, attribute: "力量", skill: "格鬥", difficulty: "普通" },
      { label: `看牆上的門牌${seed}`, hint: "想確認這是哪一層", requiresCheck: false },
    ],
  });
}

function scriptedEnv() {
  const calls = [];
  const env = {
    AI: {
      run: async (model, payload) => {
        calls.push({ model, payload });
        return { response: reply(calls.length) };
      },
    },
  };
  env.calls = calls;
  return env;
}

const req = (env, body) => ({ request: { json: async () => body }, env });
const readJson = async (res) => ({ status: res.status, body: JSON.parse(await res.text()) });

async function newSession(env) {
  const res = await readJson(
    await sessionPost(
      req(env, { draft: DRAFT, sceneContext: "回聲研究所的走廊", scenarioId: NO_SCRIPTED_OPENING_SCENARIO })
    )
  );
  assert.equal(res.body.ok, true, `建立存檔失敗：${res.body.error}`);
  return res.body.session.id;
}

function messagesOf(env, index) {
  return env.calls[index].payload.messages;
}

function systemOf(env, index) {
  return messagesOf(env, index).find((m) => m.role === "system")?.content ?? "";
}

/** 走完 n 個回合，每回合都選 AI 給的第一個檢定選項。 */
async function playTurns(env, sessionId, n) {
  let last = await readJson(await turnPost(req(env, { sessionId })));
  for (let i = 1; i < n; i += 1) {
    const option = last.body.options.find((o) => o.requiresCheck === true);
    last = await readJson(await turnPost(req(env, { sessionId, chosenOption: option })));
    assert.equal(last.body.ok, true, `第${i + 1}回合失敗：${last.body.error}`);
  }
  return last;
}

test("靜態層：system message 在連續回合之間逐字不變", async () => {
  const env = scriptedEnv();
  const sessionId = await newSession(env);
  await playTurns(env, sessionId, 4);

  assert.ok(env.calls.length >= 4, "應該真的打了四次 LLM");
  const first = systemOf(env, 0);
  assert.ok(first.length > 0, "system message 不可以是空的");
  for (let i = 1; i < env.calls.length; i += 1) {
    assert.equal(
      systemOf(env, i),
      first,
      `第 ${i + 1} 次呼叫的 system message 跟第一次不同 —— 快取前綴從這裡就斷了`
    );
  }
});

test("靜態層：不含回合數、血量、判定結果這類每回合都變的值", async () => {
  const env = scriptedEnv();
  const sessionId = await newSession(env);
  await playTurns(env, sessionId, 3);

  for (let i = 0; i < env.calls.length; i += 1) {
    const leaks = detectDynamicLeaks(systemOf(env, i));
    assert.deepEqual(
      leaks.map((l) => l.id),
      [],
      `第 ${i + 1} 次呼叫的 system message 混進了動態值：${leaks.map((l) => l.label).join("、")}`
    );
  }
});

test("靜態層：整場不變的回應格式規格排在 system，不在每回合的 user message 裡", async () => {
  const env = scriptedEnv();
  const sessionId = await newSession(env);
  await playTurns(env, sessionId, 2);

  const system = systemOf(env, 1);
  const lastUser = messagesOf(env, 1).filter((m) => m.role === "user").at(-1).content;
  // optionsSpec 有三千多字，以前被接在玩家行動後面，等於每回合都白付一次。
  assert.match(system, /你要額外產出的東西/, "選項規格必須在靜態層");
  assert.doesNotMatch(lastUser, /可用的技能（只能從這裡挑/, "選項規格不可以留在動態層");
});

test("歷史層：新的一回合只在尾端追加，既有的每一則逐字不變", async () => {
  const env = scriptedEnv();
  const sessionId = await newSession(env);
  await playTurns(env, sessionId, 4);

  const historyOf = (index) =>
    messagesOf(env, index)
      .filter((m) => m.role !== "system")
      .slice(0, -1); // 最後一則是這一回合的動態輸入，不算歷史

  for (let i = 1; i < env.calls.length; i += 1) {
    const before = historyOf(i - 1);
    const after = historyOf(i);
    assert.ok(after.length > before.length, "每回合都應該多出歷史訊息");
    assert.deepEqual(
      after.slice(0, before.length),
      before,
      `第 ${i + 1} 次呼叫改寫了既有的歷史訊息 —— 這會讓歷史層整段 cache miss`
    );
  }
});

test("訊息順序：system 在最前、歷史在中間、這一回合的輸入永遠在最後一則", async () => {
  const env = scriptedEnv();
  const sessionId = await newSession(env);
  await playTurns(env, sessionId, 3);

  const messages = messagesOf(env, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages.at(-1).role, "user");
  assert.equal(
    messages.slice(1).filter((m) => m.role === "system").length,
    0,
    "system 只能有一則，而且必須在最前面"
  );
  // 玩家這次的行動與引擎判定結果一定要在最後一則，不可以夾在靜態內容之前。
  assert.match(messages.at(-1).content, /<Player_Action>/);
  assert.match(messages.at(-1).content, /【系統強制指令】/);
});

test("historyToMessages：角色嚴格交替，沒有玩家行動的那一輪用固定佔位字串", () => {
  const messages = historyToMessages([
    { action: null, narration: "開場敘事" },
    { action: "推門", narration: "門開了" },
    { action: "回頭看", narration: null },
    { action: "快跑", narration: "你跑了起來" },
  ]);

  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].content, NO_PLAYER_ACTION_MARKER);
  for (let i = 1; i < messages.length; i += 1) {
    assert.notEqual(messages[i].role, messages[i - 1].role, "相鄰兩則不可以同角色");
  }
  // 上一輪敘事生成失敗（narration 為空）時，兩則玩家行動要被併成一則，不是丟掉一則。
  const merged = messages.find((m) => m.content.includes("回頭看"));
  assert.match(merged.content, /快跑/);
});

test("detectDynamicLeaks：抓得到實際會出現在 DM 備忘錄與卡關警告裡的動態值", () => {
  assert.deepEqual(detectDynamicLeaks("這是一段完全靜態的規則說明。").length, 0);
  assert.match(detectDynamicLeaks("- 傷勢狀態：完好 6/6")[0].id, /hp-counter/);
  assert.match(detectDynamicLeaks("- 時間倒數：剩餘 3 回合")[0].id, /round-budget/);
  assert.match(detectDynamicLeaks("【卡關警告：已連續 4 回合沒有推進】")[0].id, /stall-counter/);
  assert.match(detectDynamicLeaks("【判定結果：慘烈失敗】")[0].id, /outcome-tier/);
  assert.match(detectDynamicLeaks("packagedAt 2026-08-31T01:00:00Z")[0].id, /iso-timestamp/);
});

test("buildLayeredRequest：空區塊會被丟掉，順序完全照傳入順序，靜態層洩漏會被回報", () => {
  const built = buildLayeredRequest({
    staticBlocks: ["規則", null, "", "文筆"],
    historyMessages: [{ role: "user", content: "行動" }],
    dynamicBlocks: ["備忘錄", undefined, "【判定結果：成功】"],
  });
  assert.equal(built.systemInstruction, "規則\n\n文筆");
  assert.equal(built.prompt, "備忘錄\n\n【判定結果：成功】");
  assert.equal(built.history.length, 1);
  assert.deepEqual(built.leaks, [], "動態值在動態層，不算洩漏");

  const leaky = buildLayeredRequest({
    staticBlocks: ["規則", "- 時間倒數：剩餘 3 回合"],
    dynamicBlocks: ["玩家行動"],
  });
  assert.deepEqual(leaky.leaks.map((l) => l.id), ["round-budget"]);
});

test("extractCacheStats：認得 DeepSeek 與 OpenAI 兩種欄位，沒回報時回 null", () => {
  const deepseek = extractCacheStats({
    usage: { prompt_tokens: 1000, prompt_cache_hit_tokens: 768, prompt_cache_miss_tokens: 232 },
  });
  assert.deepEqual(deepseek, { hit: 768, miss: 232, total: 1000, ratio: 0.768 });

  const openai = extractCacheStats({
    usage: { prompt_tokens: 400, prompt_tokens_details: { cached_tokens: 256 } },
  });
  assert.equal(openai.hit, 256);
  assert.equal(openai.miss, 144, "沒有 miss 欄位時由 total - hit 推得");

  // 「沒回報」跟「命中 0」是兩件事，不可以混為一談，否則監控會誤判成快取完全失效。
  assert.equal(extractCacheStats({ usage: { prompt_tokens: 400 } }), null);
  assert.equal(extractCacheStats({}), null);
  assert.equal(extractCacheStats(null), null);
});
