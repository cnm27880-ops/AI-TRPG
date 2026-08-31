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
import { onRequestPost as narratePost } from "../functions/api/narrate.js";
import { callLlm } from "../content/llm/client.js";
import {
  detectDynamicLeaks,
  historyToMessages,
  buildLayeredRequest,
  extractCacheStats,
  estimateCacheStats,
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

test("client 拒絕把 role:\"system\" 藏進 history 層", async () => {
  // 這是最容易「順手」破壞分層的一種寫法：想多塞一段指令，就在歷史中間放一則 system。
  // 那會把它後面每一則歷史都推離原位，而且靜態內容一旦排在動態內容後面就永遠命不中。
  // 靜靜過濾掉會讓那段指令消失得無聲無息，所以這裡選擇直接失敗。
  await assert.rejects(
    () =>
      callLlm({
        provider: "custom",
        env: { LLM_API_KEY: "k", LLM_BASE_URL: "https://example.invalid/v1", LLM_MODEL: "m" },
        prompt: "這一回合的輸入",
        systemInstruction: "靜態規則",
        history: [
          { role: "user", content: "【玩家行動】推門" },
          { role: "system", content: "順手多塞的一段指令" },
          { role: "assistant", content: "門開了" },
        ],
        fetchFn: async () => {
          throw new Error("不應該送出請求");
        },
      }),
    (err) => {
      assert.equal(err.stage, "config");
      assert.match(err.message, /history 層不接受/);
      return true;
    }
  );
});

test("/api/narrate 走的是同一套三層，不是另外一份組裝邏輯", async () => {
  // 專案裡只要有第二種組請求的方式，就會有一種被寫壞而沒有人發現。
  const calls = [];
  const env = {
    NARRATE_ALLOW_SERVER_LLM: "true",
    AI: {
      run: async (model, payload) => {
        calls.push(payload);
        return { response: JSON.stringify({ narration: "一段敘事" }) };
      },
    },
  };
  const res = await narratePost({
    request: {
      json: async () => ({
        playerAction: "撬開通風口",
        sceneContext: "回聲研究所的走廊",
        character: DRAFT,
        attribute: "力量",
        skill: "技藝",
        difficulty: "普通",
      }),
    },
    env,
  });
  assert.equal(res.status, 200, await res.clone().text());
  assert.ok(calls.length > 0, "應該真的打了一次 LLM");

  const { messages } = calls.at(-1);
  assert.equal(messages[0].role, "system");
  assert.equal(messages.at(-1).role, "user");
  assert.deepEqual(detectDynamicLeaks(messages[0].content), [], "system 層不可以有動態值");
  assert.match(messages[0].content, /【場景背景】/, "場景背景屬於靜態層");
  assert.match(messages.at(-1).content, /<Player_Action>/, "玩家輸入屬於動態層");
  assert.doesNotMatch(messages.at(-1).content, /【場景背景】/, "靜態內容不可以重複出現在動態層");
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

test("estimateCacheStats：字元比例推算值一律帶 estimated:true，且第一回合(messages<=2)不猜", () => {
  const messages = [
    { role: "system", content: "x".repeat(3000) },
    { role: "user", content: "y".repeat(500) },
    { role: "assistant", content: "z".repeat(500) },
    { role: "user", content: "這回合的輸入".repeat(5) },
  ];
  const est = estimateCacheStats({ messages, promptTokens: 1000 });
  assert.equal(est.estimated, true, "呼叫端必須能區分這是猜的，不是供應商回報的");
  assert.ok(est.hit > 0 && est.hit < 1000);
  assert.equal(est.miss, 1000 - est.hit);
  assert.equal(est.total, 1000);
  assert.equal(est.ratio, Math.round((est.hit / 1000) * 1000) / 1000);

  // 第一回合只有 system + user 兩則，代表沒有「已經送過、應該命中」的前綴，不該硬猜一個數字出來。
  assert.equal(estimateCacheStats({ messages: messages.slice(0, 2), promptTokens: 1000 }), null);
  assert.equal(estimateCacheStats({ messages, promptTokens: 0 }), null);
  assert.equal(estimateCacheStats({ messages: null, promptTokens: 1000 }), null);
});

test("callOpenAiChat：供應商沒回報快取欄位時，估算值只進 cacheStatsEstimate，不會冒充 cacheStats", async () => {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        choices: [{ message: { content: "回覆內容" }, finish_reason: "stop" }],
        // 這家中轉只回 prompt_tokens，沒有任何快取欄位——典型的「沒回報」情境。
        usage: { prompt_tokens: 2000, completion_tokens: 50 },
      }),
    };
  };

  const res = await callLlm({
    provider: "deepseek",
    env: { LLM_API_KEY: "sk-test", LLM_MODEL: "deepseek-v4-flash" },
    systemInstruction: "靜態規則契約".repeat(50),
    history: [
      { role: "user", content: "第一輪玩家行動" },
      { role: "assistant", content: "第一輪敘事" },
    ],
    prompt: "這一輪的玩家輸入",
    fetchFn,
  });

  assert.equal(res.cacheStats, null, "沒回報就是 null，不能被推算值取代");
  assert.equal(res.cacheStatsEstimate.estimated, true);
  assert.equal(res.cacheStatsEstimate.total, 2000);
  assert.ok(res.cacheStatsEstimate.hit > 0);
  assert.equal(calls.length, 1);
});

test("callOpenAiChat：供應商真的有回報快取欄位時，不產生估算值", async () => {
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      choices: [{ message: { content: "回覆內容" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2000, completion_tokens: 50, prompt_cache_hit_tokens: 1800, prompt_cache_miss_tokens: 200 },
    }),
  });

  const res = await callLlm({
    provider: "deepseek",
    env: { LLM_API_KEY: "sk-test", LLM_MODEL: "deepseek-v4-flash" },
    systemInstruction: "靜態規則契約",
    history: [{ role: "user", content: "第一輪玩家行動" }, { role: "assistant", content: "第一輪敘事" }],
    prompt: "這一輪的玩家輸入",
    fetchFn,
  });

  assert.equal(res.cacheStats.hit, 1800, "有真實回報就用真實值");
  assert.equal(res.cacheStatsEstimate, null, "有真實值就不需要、也不該再猜一個");
});
