// [設計] Gemini整合骨架的測試——promptContract.js完全不需要網路，直接測；
// client.js用假的fetchFn(依賴注入)測試「HTTP呼叫的組裝邏輯對不對」，不實際打Gemini的API
// (這個沙盒環境沒有網路能連到Gemini，也沒有真的API金鑰)。
import test from "node:test";
import assert from "node:assert/strict";
import { buildTurnPrompt, SYSTEM_INSTRUCTION } from "../content/gemini/promptContract.js";
import { callGemini, DEFAULT_MODEL } from "../content/gemini/client.js";
import { classifyOutcome } from "../core/narration.js";

test("buildTurnPrompt：組出來的文字包含判定分級指令與玩家行動", () => {
  const outcome = classifyOutcome({ margin: 2 });
  const prompt = buildTurnPrompt({
    playerAction: "我朝著怪物揮出一拳",
    outcome,
    sceneContext: "廢棄醫院三樓走廊",
  });
  assert.match(prompt, /廢棄醫院三樓走廊/);
  assert.match(prompt, /我朝著怪物揮出一拳/);
  assert.match(prompt, new RegExp(outcome.tier));
  assert.match(prompt, new RegExp(outcome.directive));
});

test("buildTurnPrompt：沒有sceneContext跟recentEvents時仍可正常組裝(都是選填)", () => {
  const outcome = classifyOutcome({ margin: -5 });
  const prompt = buildTurnPrompt({ playerAction: "我試圖說服守衛", outcome });
  assert.match(prompt, /我試圖說服守衛/);
  assert.doesNotMatch(prompt, /場景背景/);
});

test("buildTurnPrompt：有recentEvents時會把摘要條列進去", () => {
  const outcome = classifyOutcome({ margin: 0 });
  const prompt = buildTurnPrompt({
    playerAction: "我搜索房間",
    outcome,
    recentEvents: [{ summary: "受到 6 點物理傷害" }, { summary: "獲得 10 點經驗值" }],
  });
  assert.match(prompt, /受到 6 點物理傷害/);
  assert.match(prompt, /獲得 10 點經驗值/);
});

test("buildTurnPrompt：缺少必要參數要丟錯，不能靜默組出殘缺的prompt", () => {
  assert.throws(() => buildTurnPrompt({ outcome: classifyOutcome({ margin: 1 }) }));
  assert.throws(() => buildTurnPrompt({ playerAction: "test" }));
});

test("callGemini：正確組裝request body(system_instruction+contents)並帶上API金鑰header", async () => {
  let capturedUrl, capturedOptions;
  const fakeFetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "測試敘事文字" }] } }],
      }),
    };
  };

  const result = await callGemini({
    apiKey: "fake-key-123",
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: "測試prompt",
    fetchFn: fakeFetch,
  });

  assert.equal(result.text, "測試敘事文字");
  assert.match(capturedUrl, new RegExp(DEFAULT_MODEL));
  assert.equal(capturedOptions.headers["x-goog-api-key"], "fake-key-123");
  const sentBody = JSON.parse(capturedOptions.body);
  assert.equal(sentBody.system_instruction.parts[0].text, SYSTEM_INSTRUCTION);
  assert.equal(sentBody.contents[0].parts[0].text, "測試prompt");
});

test("callGemini：API回傳非2xx時要丟出明確錯誤，不是靜默失敗", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 403,
    text: async () => "API key invalid",
  });

  await assert.rejects(
    () => callGemini({ apiKey: "bad-key", prompt: "test", fetchFn: fakeFetch }),
    /HTTP 403/
  );
});

test("callGemini：回應結構不符預期時要丟出明確錯誤，不是回傳undefined讓呼叫端誤用", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ unexpected: "shape" }),
  });

  await assert.rejects(
    () => callGemini({ apiKey: "key", prompt: "test", fetchFn: fakeFetch }),
    /回應格式不符預期/
  );
});

test("callGemini：缺少apiKey或prompt要丟錯", async () => {
  await assert.rejects(() => callGemini({ prompt: "test" }));
  await assert.rejects(() => callGemini({ apiKey: "key" }));
});
