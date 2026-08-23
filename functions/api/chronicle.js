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
  const explicitScenarioId = url.searchParams.get("scenarioId");
  const requestedScenarioId = explicitScenarioId || currentScenarioId;
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
  // 舊版 chronicle 沒有 scenarioId，無法知道條目屬於哪一章；只有在整份資料都是
  // legacy 無標籤時才回退完整故事。新資料若指定了不存在的副本，必須回空，不能把
  // 另一章的小說掛到錯誤的標題／狀態底下。
  const hasScenarioTags = entries.some((entry) => entry.scenarioId != null);
  const selectedEntries = !requestedScenarioId
    ? entries
    : scenarioEntries.length
      ? scenarioEntries
      : hasScenarioTags
        ? []
        : entries;

  const aiPackage = requestedScenarioId || entries.length
    ? buildStoryPackage(session, {
        scenarioId: requestedScenarioId,
        scenarioTitle: selectedTitle,
        scenarioComplete: selectedComplete,
        packagedAt: selectedRecord?.createdAt ?? null,
        turnRange: selectedRecord?.turnRange ?? null,
        entries: selectedEntries,
      })
    : null;

  return json({
    ok: true,
    persistent: store.persistent,
    currentScenarioId,
    selectedScenarioId: requestedScenarioId,
    total: explicitScenarioId ? selectedEntries.length : entries.length,
    entries: explicitScenarioId ? selectedEntries : entries,
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
