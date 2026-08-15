// Cloudflare Pages Function —— 列出可選副本。
// 路由：GET /api/scenario
//
// 給前端「選擇副本」畫面用（目前只有一個內建範例）。故意不回傳完整節點圖：
// canonSummary/node順序算劇透，前端只需要摘要資訊讓玩家挑，詳細節點是遊戲過程中才逐步揭露的。

import { listScenarios, DEFAULT_SCENARIO_ID } from "../../content/scenario/registry.js";

export async function onRequestGet() {
  return new Response(
    JSON.stringify({ ok: true, defaultScenarioId: DEFAULT_SCENARIO_ID, scenarios: listScenarios() }),
    { headers: { "content-type": "application/json; charset=utf-8" } }
  );
}
