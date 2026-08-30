#!/usr/bin/env node
/**
 * AI-TRPG 真實 provider smoke test（P0：staging/部署環境的真實 API 檢查）。
 *
 * 跟 test:extreme（scripts/extreme-turn-matrix.mjs）與一般單元測試不同：那些全部用假的
 * fetchFn，只驗證「我們自己組的請求/解析程式對不對」，永遠不會真的碰到：
 *   - Groq 實際回傳的 429 header 長什麼樣（是不是真的有 retry-after，格式是秒數還是別的）
 *   - Groq/Mistral 真的觸發 413 時 body 長什麼樣
 *   - Cloudflare 或其他反向代理在真實網路狀況下的行為（例如把錯誤頁包成 200）
 *   - 真實模型的 response 格式（結構化輸出是否真的照schema、finish_reason 實際值）
 * 這些只能靠一次真正打到網路上的請求才能驗證，所以這支腳本刻意**會發出真實API請求**。
 *
 * 設計成「沒有金鑰就優雅跳過」（exit 0），這樣可以安全地掛在 CI 的 workflow_dispatch
 * 或排程 job 裡：沒設定 secret 的環境不會讓整條 pipeline 變紅，只有真的想跑「有金鑰
 * 的部署前檢查」時才會實際發出請求。金鑰來源：環境變數優先，找不到才試著讀 .dev.vars
 * （本機開發常見的存放位置），兩邊都沒有就跳過。
 *
 * 用法：
 *   node scripts/real-provider-smoke-test.mjs           # 有金鑰就跑 Groq(+Mistral)，沒有就跳過
 *   GROQ_API_KEY=xxx node scripts/real-provider-smoke-test.mjs
 */
import { readFile } from "node:fs/promises";
import { callLlm } from "../content/llm/client.js";

async function loadDotEnvIfPresent() {
  try {
    const text = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          const key = line.slice(0, index).trim();
          const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
          return [key, value];
        })
    );
  } catch {
    return {};
  }
}

const dotVars = await loadDotEnvIfPresent();
/** 環境變數優先於 .dev.vars：CI 的 secrets 都是用環境變數注入的。 */
function readKey(name) {
  return process.env[name] || dotVars[name] || "";
}

const SMOKE_SYSTEM_INSTRUCTION = [
  "你是《異形：生化深淵》的敘事 GM。",
  "這是連線 smoke test；不要創造規則數字，不要生成選項，不要聲稱改變遊戲狀態。",
  "只根據使用者提供的場景事實寫一小段繁體中文沉浸式敘事。",
].join("\n");

const SMOKE_PROMPT = [
  "<Scene>",
  "諾斯托羅莫號的休眠室。冷凍櫃的綠燈逐一亮起，空氣中有清潔劑與金屬的味道。",
  "</Scene>",
  "<Engine_Result>",
  "本回合沒有骰子判定，也沒有物品、旗標、威脅或位置變化。",
  "</Engine_Result>",
  "<Player_Action>我先坐起來，確認自己的呼吸與周圍是否有人醒著。</Player_Action>",
  "請用 80 到 150 字描寫這個微小行動的當下感官反應，結尾保留不確定感，不要替玩家做下一個決定。",
].join("\n");

/** 每一家要驗證的 provider：apiKeyEnv 對應 content/llm/providers.js 的 apiKeyEnv。 */
const CANDIDATES = [
  { provider: "groq", apiKeyEnv: "GROQ_API_KEY" },
  { provider: "mistral", apiKeyEnv: "MISTRAL_API_KEY" },
];

async function smokeTestProvider(provider) {
  const env = { ...dotVars };
  // 只把這一家的金鑰放進 env，避免不小心真的觸發 server fallback chain
  // （這支腳本要驗證的是「這一家單獨打出去長什麼樣」，不是 fallback 邏輯本身——
  // fallback 邏輯已經被 test:extreme 用假 fetchFn 完整測過了）。
  for (const candidate of CANDIDATES) {
    if (candidate.provider !== provider) delete env[candidate.apiKeyEnv];
  }
  const key = readKey(CANDIDATES.find((c) => c.provider === provider).apiKeyEnv);
  env[CANDIDATES.find((c) => c.provider === provider).apiKeyEnv] = key;

  const startedAt = Date.now();
  try {
    const result = await callLlm({
      provider,
      env,
      prompt: SMOKE_PROMPT,
      systemInstruction: SMOKE_SYSTEM_INSTRUCTION,
      maxTokens: 512,
    });
    const elapsedMs = Date.now() - startedAt;
    return {
      provider,
      ok: true,
      elapsedMs,
      model: result.model,
      finishReason: result.finishReason ?? null,
      textLength: Array.from(result.text ?? "").length,
      textPreview: (result.text ?? "").slice(0, 80),
    };
  } catch (error) {
    return {
      provider,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      name: error?.name ?? "Error",
      stage: error?.stage ?? "unknown",
      status: error?.status ?? null,
      message: error?.message ?? String(error),
    };
  }
}

async function main() {
  const configured = CANDIDATES.filter((c) => readKey(c.apiKeyEnv));
  if (!configured.length) {
    console.log(JSON.stringify({
      skipped: true,
      reason: "沒有偵測到任何真實 provider 金鑰(GROQ_API_KEY / MISTRAL_API_KEY)，" +
        "跳過真實 API smoke test。要實際執行請設定環境變數或 .dev.vars。",
      checkedEnvVars: CANDIDATES.map((c) => c.apiKeyEnv),
    }, null, 2));
    return;
  }

  const results = [];
  for (const candidate of configured) {
    results.push(await smokeTestProvider(candidate.provider));
  }

  console.log(JSON.stringify({ skipped: false, results }, null, 2));
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`真實 API smoke test 失敗：${failed.map((r) => r.provider).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("真實 API smoke test 執行時發生未預期錯誤：", error?.stack ?? error);
  process.exitCode = 1;
});
