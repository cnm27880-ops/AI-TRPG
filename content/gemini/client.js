// [設計] Gemini API的最小HTTP包裝層 —— 用fetch直接打REST API，不依賴任何官方SDK，
// 原因：Cloudflare Pages Functions的執行環境(Workers runtime)不保證能跑Node專用的SDK套件，
// 但保證有標準的 fetch()，用fetch直接打REST端點是最不會因為SDK相容性問題而炸掉的做法，
// 也跟這個repo一路的「依賴注入」測試方式一致(呼叫端可以塞假的fetchFn進來測試)。
//
// [可信度：中，需要你部署前自行核對] 下面的 DEFAULT_ENDPOINT_TEMPLATE 與 DEFAULT_MODEL
// 是2026年查證官方文件(ai.google.dev/gemini-api)當下的資訊，但查證過程中發現Google在文件裡
// 已經把 generateContent 標記成「Legacy」，新的建議介面叫「Interactions API」，只是舊端點
// 目前(查證當下)仍然可以用。這是會變動的資訊，"嚴禁僅憑記憶回答具有時效性的參數"，
// 所以老實列出來讓你自己核對，不是我在偷懶：
//   - 部署前務必重新查一次 https://ai.google.dev/gemini-api/docs/generate-content/get-started
//     確認端點/欄位名稱/建議模型沒有變動。
//   - model名稱字串(例如"gemini-2.5-flash")會隨Google更新模型陣容變動，這裡只是給一個
//     「目前查得到、屬於平衡cost/quality的flash層級模型」當預設值，不代表這是最新或最推薦的選擇，
//     你應該自己去 https://ai.google.dev/gemini-api/docs/pricing 對照目前可用模型與價格再決定。

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_ENDPOINT_TEMPLATE = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * 呼叫Gemini的generateContent端點，回傳純文字敘事。
 * @param {object} params
 * @param {string} params.apiKey Gemini API金鑰(不要寫死在程式碼裡，見GEMINI_INTEGRATION.md)
 * @param {string} params.systemInstruction 系統提示(建議直接用 promptContract.js 的 SYSTEM_INSTRUCTION)
 * @param {string} params.prompt 這次要送的使用者訊息文字(建議用 promptContract.js 的 buildTurnPrompt() 產生)
 * @param {string} [params.model] 預設 DEFAULT_MODEL，部署前請自行核對是否仍是目前可用/合適的模型
 * @param {typeof fetch} [params.fetchFn] 依賴注入用，測試時塞假的fetch實作，預設用全域fetch
 * @returns {Promise<{text: string, raw: object}>}
 */
export async function callGemini({
  apiKey,
  systemInstruction,
  prompt,
  model = DEFAULT_MODEL,
  fetchFn = fetch,
}) {
  if (!apiKey) throw new Error("callGemini需要apiKey(Gemini API金鑰)");
  if (!prompt) throw new Error("callGemini需要prompt(這次要送的使用者訊息文字)");

  const endpoint = DEFAULT_ENDPOINT_TEMPLATE(model);
  const body = {
    system_instruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    contents: [{ parts: [{ text: prompt }] }],
  };

  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await safeReadText(response);
    throw new Error(`Gemini API回傳錯誤(HTTP ${response.status})：${errText}`);
  }

  const raw = await response.json();
  const text = extractText(raw);
  return { text, raw };
}

/** 從generateContent的回應結構取出文字，格式不符時明確報錯而不是回傳undefined讓呼叫端誤用。 */
function extractText(raw) {
  const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error(
      "Gemini API回應格式不符預期(candidates[0].content.parts[0].text不存在)，" +
        "可能是API版本變動，請對照最新文件檢查回應結構：" +
        JSON.stringify(raw)
    );
  }
  return text;
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "(無法讀取錯誤內容)";
  }
}
