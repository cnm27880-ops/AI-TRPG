import { readFile } from "node:fs/promises";
import { callLlm } from "../content/llm/client.js";

function loadDotEnv(text) {
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
}

const env = loadDotEnv(await readFile(new URL("../.dev.vars", import.meta.url), "utf8"));
const provider = env.LLM_PROVIDER || "custom";
const model = env.LLM_MODEL;
if (!env.LLM_API_KEY || !env.LLM_BASE_URL || !model) {
  throw new Error(".dev.vars 必須包含 LLM_API_KEY、LLM_BASE_URL 與 LLM_MODEL");
}

const systemInstruction = [
  "你是《異形：生化深淵》的敘事 GM。",
  "這是連線 smoke test；不要創造規則數字，不要生成選項，不要聲稱改變遊戲狀態。",
  "只根據使用者提供的場景事實寫一小段繁體中文沉浸式敘事。",
].join("\n");
const prompt = [
  "<Scene>",
  "諾斯托羅莫號的休眠室。冷凍櫃的綠燈逐一亮起，空氣中有清潔劑與金屬的味道。",
  "</Scene>",
  "<Engine_Result>",
  "本回合沒有骰子判定，也沒有物品、旗標、威脅或位置變化。",
  "</Engine_Result>",
  "<Player_Action>我先坐起來，確認自己的呼吸與周圍是否有人醒著。</Player_Action>",
  "請用 80 到 150 字描寫這個微小行動的當下感官反應，結尾保留不確定感，不要替玩家做下一個決定。",
].join("\n");

try {
  const result = await callLlm({ provider, env, model, prompt, systemInstruction, maxTokens: 2048 });
  console.log(JSON.stringify({
    ok: true,
    provider: result.provider,
    model: result.model,
    finishReason: result.finishReason ?? null,
    text: result.text,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    provider: error?.provider ?? provider,
    stage: error?.stage ?? "unknown",
    status: error?.status ?? null,
  }, null, 2));
  process.exitCode = 1;
}
