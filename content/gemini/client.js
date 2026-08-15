// [設計] 相容層 —— 這個檔案原本是「只支援Gemini」時期的專用client。
//
// 現在多供應商的實作在 content/llm/client.js（Gemini / DeepSeek / OpenRouter /
// Cloudflare Workers AI / 任意OpenAI相容的第三方接口都走那裡）。
// 這個檔案保留下來只為了兩件事：
//   1) 既有的 test/gemini.test.js 仍然鎖住「Gemini線路格式」這件事本身，那個保障有價值。
//   2) 如果你之前有別的程式直接 import 過 callGemini，不會突然壞掉。
//
// 新的程式請直接用 content/llm/client.js 的 callLlm()。
//
// [可信度：中，需要你部署前自行核對] —— 這段警語仍然成立，只是內容更新了：
// 2026-08-15查證 https://ai.google.dev/ 當下，Google已經把 Interactions API 列為 GA 並建議
// 新專案採用，generateContent 被標為 legacy。**但官方同時明確聲明 generateContent 仍完整支援**，
// 而且對「單次、無狀態、低延遲」的呼叫（正好是本專案每回合敘事的形狀）官方的建議就是
// 繼續用 generateContent。所以這裡刻意不遷移：遷移沒有實際好處，只有破壞既有測試的風險。
// 之後如果你要用到需要狀態/工具呼叫的功能（例如讓AI自己查詢角色卡），那才是該遷移的時機。

import { callLlm } from "../llm/client.js";
import { PROVIDERS } from "../llm/providers.js";

export const DEFAULT_MODEL = PROVIDERS.gemini.defaultModel;
export const DEFAULT_ENDPOINT_TEMPLATE = (model) =>
  `${PROVIDERS.gemini.baseUrl}/models/${model}:generateContent`;

/**
 * 呼叫Gemini產生敘事文字（相容層，內部轉呼叫 callLlm）。
 * @param {object} params
 * @param {string} params.apiKey Gemini API金鑰
 * @param {string} [params.systemInstruction] 系統提示
 * @param {string} params.prompt 這次要送的使用者訊息文字
 * @param {string} [params.model] 預設 DEFAULT_MODEL
 * @param {typeof fetch} [params.fetchFn] 依賴注入用，測試時塞假的fetch實作
 * @returns {Promise<{text: string, raw: object}>}
 */
export async function callGemini({
  apiKey,
  systemInstruction,
  prompt,
  model = DEFAULT_MODEL,
  fetchFn,
}) {
  if (!apiKey) throw new Error("callGemini需要apiKey(Gemini API金鑰)");
  if (!prompt) throw new Error("callGemini需要prompt(這次要送的使用者訊息文字)");

  const { text, raw } = await callLlm({
    provider: "gemini",
    apiKey,
    systemInstruction,
    prompt,
    model,
    fetchFn,
  });
  return { text, raw };
}
