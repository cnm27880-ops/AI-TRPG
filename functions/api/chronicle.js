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

// [效能] entries 分頁的預設/上限。長局玩很久之後 chronicle 陣列會一直長大——
// 沒有上限的話，這個「按需載入」的端點本身也會變成一次回傳整份小說的無界回應。
// 預設值刻意抓得夠大(多數campaign的完整回合數還進不去這個範圍)，維持現有前端
// 「打開書就看到全部」的體驗；真的長到需要分頁時，呼叫端可以帶 limit/cursor 分批拿。
const DEFAULT_CHRONICLE_LIMIT = 300;
const MAX_CHRONICLE_LIMIT = 500;

/** 非法或超大的 limit 一律安全退回一個合理值，不讓呼叫端用它撐爆一次回應。 */
function clampChronicleLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CHRONICLE_LIMIT;
  return Math.min(MAX_CHRONICLE_LIMIT, Math.floor(n));
}

/** 非法的 cursor(負數、非數字、超出範圍)一律安全退回 0，不報錯——這是分頁的起點，不是身分憑證。 */
function clampChronicleCursor(raw, total) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), total);
}

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

  // 完整劇情包(aiPackage/currentPackage)刻意繼續用完整的 selectedEntries 組——
  // 玩家打開「劇情回顧」本來就是主動要求看/匯出完整故事，不分頁。
  // entries 這個陣列(給書頁UI逐段渲染用)才做分頁，避免單一 response 隨著campaign
  // 玩很久之後無界變大。
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

  const fullEntries = explicitScenarioId ? selectedEntries : entries;
  const limit = clampChronicleLimit(url.searchParams.get("limit"));
  const cursor = clampChronicleCursor(url.searchParams.get("cursor"), fullEntries.length);
  const pageEntries = fullEntries.slice(cursor, cursor + limit);
  const nextCursor = cursor + pageEntries.length < fullEntries.length ? cursor + pageEntries.length : null;

  return json({
    ok: true,
    persistent: store.persistent,
    currentScenarioId,
    selectedScenarioId: requestedScenarioId,
    total: fullEntries.length,
    cursor,
    limit,
    nextCursor,
    entries: pageEntries,
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
