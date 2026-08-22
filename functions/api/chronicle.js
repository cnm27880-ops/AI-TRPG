// 路由：GET /api/chronicle?sessionId=xxx
//
// 主畫面只渲染最近五則；完整劇情在玩家打開「劇情回顧」時才按需讀取。這個端點沿用
// /api/journal 的 ownership 檢查，但另外把 prose chronicle 與副本完成後的 AI-ready package
// 一起組出來。劇情包是 deterministic 的，不為了結算再呼叫一次模型，避免玩家在副本結束時
// 多等一次、也避免同一份故事因模型重寫而前後不一致。

import { resolveSessionStore } from "../../content/storage/sessionStore.js";
import { canAccessSession } from "../../content/auth/ownership.js";
import { getCurrentUser } from "../../content/auth/sessionToken.js";
import { getScenarioPack } from "../../content/scenario/registry.js";
import { getProgressSummary } from "../../content/scenario/progress.js";
import {
  buildStoryPackage,
  normalizeChronicleEntries,
} from "../../content/storage/chronicle.js";

export async function onRequestGet(context) {
  const store = resolveSessionStore(context.env ?? {});
  const url = new URL(context.request.url);
  const id = url.searchParams.get("sessionId") ?? url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "必須指定 sessionId" }, 400);

  const session = await store.get(id);
  if (!session) return json({ ok: false, error: `找不到存檔 ${id}` }, 404);
  if (!canAccessSession(session, await getCurrentUser(context.request, context.env ?? {}))) {
    return json({ ok: false, error: `找不到存檔 ${id}` }, 404);
  }

  const entries = normalizeChronicleEntries(session.chronicle);
  const currentScenarioId = session.scenario?.packId ?? null;
  const requestedScenarioId = url.searchParams.get("scenarioId") || currentScenarioId;
  const currentPack = currentScenarioId ? getScenarioPack(currentScenarioId) : null;
  const currentComplete = Boolean(
    currentPack && session.scenario?.progress && getProgressSummary(currentPack, session.scenario.progress).scenarioComplete
  );
  const packageIndex = (session.chroniclePackages ?? []).map((record) => ({ ...record }));
  const selectedRecord = packageIndex.find((record) => record.scenarioId === requestedScenarioId) ?? null;
  const selectedPack = requestedScenarioId ? getScenarioPack(requestedScenarioId) : null;
  const selectedTitle = selectedRecord?.scenarioTitle
    ?? selectedPack?.briefing?.title
    ?? (requestedScenarioId || "目前劇情");
  const selectedComplete = selectedRecord?.status === "ready"
    || (requestedScenarioId === currentScenarioId && currentComplete);
  const scenarioEntries = requestedScenarioId
    ? entries.filter((entry) => entry.scenarioId === requestedScenarioId)
    : entries;
  // 舊版 chronicle 沒有 scenarioId；若該副本沒有可切分的條目，退回整份仍保有的故事，
  // 不讓玩家因為資料格式遷移而看到空白小說。
  const selectedEntries = scenarioEntries.length || !requestedScenarioId ? scenarioEntries : entries;

  const aiPackage = requestedScenarioId || entries.length
    ? buildStoryPackage(session, {
        scenarioId: requestedScenarioId,
        scenarioTitle: selectedTitle,
        scenarioComplete: selectedComplete,
        packagedAt: selectedRecord?.createdAt ?? null,
        entries: selectedEntries,
      })
    : null;

  return json({
    ok: true,
    persistent: store.persistent,
    currentScenarioId,
    total: entries.length,
    entries,
    packages: packageIndex,
    currentPackage: aiPackage,
    // 前端不必重新拼接文字；這個欄位也讓日後下載／複製功能沿用同一個 deterministic 結果。
    aiPackage,
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
