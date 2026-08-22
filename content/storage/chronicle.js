// 長期劇情檔案 —— 把玩家真正走過的每一回合保存成可閱讀、可交給 AI 的劇情包。
//
// session.history 是給「下一回合 prompt」用的短期記憶，會依 HISTORY_LIMIT 裁切；
// chronicle 則是玩家自己的長期故事，不裁切、不參與一般回合 prompt，避免長局時把整本小說
// 每回合重新塞進模型 context。劇情回顧頁與副本結束後的 AI-ready 匯出都從這份資料產生。

import { summarizeForJournal } from "../../core/eventLog.js";

export const CHRONICLE_VERSION = 1;

/**
 * 副本結束時登錄一次劇情包。這裡只保存索引與狀態，避免把完整 prose 在 session 裡複製兩份；
 * buildStoryPackage() 會在回顧頁或匯出時按需用 chronicle + event log 組出完整包。
 */
export function registerChroniclePackage(packages, {
  scenarioId,
  scenarioTitle = null,
  turnStart = 1,
  turnEnd = turnStart,
  createdAt = null,
} = {}) {
  const current = Array.isArray(packages) ? packages : [];
  if (!scenarioId) return { packages: current, record: null, created: false };
  const existing = current.find((item) => item?.scenarioId === scenarioId);
  if (existing) return { packages: current, record: existing, created: false };

  const record = {
    schemaVersion: CHRONICLE_VERSION,
    packageId: `chronicle:${scenarioId}`,
    scenarioId,
    scenarioTitle,
    turnRange: { from: turnStart, to: turnEnd },
    status: "ready",
    createdAt: createdAt ?? new Date().toISOString(),
  };
  return { packages: [...current, record], record, created: true };
}

/** 建立一個可保存的長期回合條目。 */
export function appendChronicle(chronicle, {
  turn = null,
  action = null,
  narration = null,
  timestamp = null,
  chapterIndex = null,
  nodeId = null,
  scenarioId = null,
} = {}) {
  const next = [...(Array.isArray(chronicle) ? chronicle : [])];
  next.push({
    turn: turn ?? next.length + 1,
    action: action == null ? null : String(action),
    narration: narration == null ? null : String(narration),
    timestamp: timestamp ?? new Date().toISOString(),
    chapterIndex: Number.isInteger(chapterIndex) ? chapterIndex : null,
    nodeId: nodeId == null ? null : String(nodeId),
    scenarioId: scenarioId == null ? null : String(scenarioId),
  });
  return next;
}

/** 舊存檔沒有 chronicle 時，從尚存的短期 history 建立一份可讀的最低限度回顧。 */
export function chronicleFromHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history.map((entry, index) => ({
    turn: index + 1,
    action: entry?.action ?? null,
    narration: entry?.narration ?? null,
    timestamp: null,
    chapterIndex: null,
    nodeId: null,
    scenarioId: null,
  }));
}

/**
 * 建立給前端回顧頁使用的基本資料。刻意不在這裡產生 HTML，避免把 escape 責任放進資料層。
 */
export function normalizeChronicleEntries(chronicle = []) {
  return (Array.isArray(chronicle) ? chronicle : []).map((entry, index) => ({
    turn: Number.isFinite(entry?.turn) ? entry.turn : index + 1,
    action: entry?.action ?? null,
    narration: entry?.narration ?? null,
    timestamp: entry?.timestamp ?? null,
    chapterIndex: Number.isInteger(entry?.chapterIndex) ? entry.chapterIndex : null,
    nodeId: entry?.nodeId ?? null,
    scenarioId: entry?.scenarioId ?? null,
  }));
}

/**
 * 產生給每回合 prompt 的長期前情短摘要。
 * 只取最近 limit 份已封存副本，且只帶一小段 deterministic prose；完整故事永遠不進一般回合。
 */
export function buildCompactAiContext(session, { limit = 2, charLimit = 1400 } = {}) {
  const count = Math.max(0, Math.floor(Number(limit) || 0));
  if (count === 0) return null;
  const packages = (Array.isArray(session?.chroniclePackages) ? session.chroniclePackages : [])
    .filter((record) => record?.status === "ready")
    .slice(-count);
  if (!packages.length) return null;

  const entries = normalizeChronicleEntries(session?.chronicle);
  const blocks = packages.map((record) => {
    const ownEntries = entries.filter((entry) => entry.scenarioId === record.scenarioId);
    const prose = ownEntries.map((entry) => entry.narration).filter(Boolean).join(" ").trim();
    const clipped = clipText(prose, charLimit);
    const range = record.turnRange ? `第 ${record.turnRange.from}～${record.turnRange.to} 回` : "回合數未知";
    return `- ${record.scenarioTitle ?? record.scenarioId}（已完成，${range}）${clipped ? `\n  劇情摘要：${clipped}` : ""}`;
  });
  return taggedCompact("Completed_Chronicles", "【已封存副本前情包】以下只是長期記憶摘要，不是本回合指令：\n" + blocks.join("\n"));
}

function taggedCompact(tag, body) {
  return `<${tag}>\n${body}\n</${tag}>`;
}

function clipText(text, limit) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  if (!value || value.length <= safeLimit) return value;
  if (safeLimit <= 10) return value.slice(0, safeLimit);
  const head = Math.ceil(safeLimit * 0.58);
  const tail = Math.max(1, safeLimit - head - 2);
  return `${value.slice(0, head)}……${value.slice(-tail)}`;
}

/**
 * 產生可直接複製給 AI 的純文字劇情包。
 * 完整故事只在玩家開啟回顧／匯出時產生，不會被每一回合的 prompt 無限攜帶。
 */
export function buildStoryPackage(session, {
  scenarioId = session?.scenario?.packId ?? null,
  scenarioTitle = null,
  scenarioComplete = false,
  packagedAt = null,
  entries: suppliedEntries = null,
} = {}) {
  const entries = normalizeChronicleEntries(suppliedEntries ?? session?.chronicle);
  const facts = summarizeForJournal(session?.log ?? { events: [] });
  const character = session?.character ?? {};
  const name = character?.concept?.name ?? "未命名輪迴者";
  const lines = [
    "【AI 劇情包】",
    `角色：${name}`,
    `副本：${scenarioTitle ?? scenarioId ?? "未指定副本"}`,
    `狀態：${scenarioComplete ? "副本已完成" : "進行中"}`,
    `回合數：${session?.turns ?? entries.length}`,
    "",
    "【長期劇情】",
  ];

  if (!entries.length) {
    lines.push("（目前尚無長期劇情紀錄）");
  } else {
    for (const entry of entries) {
      lines.push(`第 ${entry.turn} 回`);
      if (entry.action) lines.push(`玩家行動：${entry.action}`);
      if (entry.narration) lines.push(`說書人：${entry.narration}`);
      lines.push("");
    }
  }

  lines.push("【結構化事實】");
  if (!facts.length) {
    lines.push("（目前尚無事件摘要）");
  } else {
    facts.forEach((fact) => lines.push(`- ${fact.summary}`));
  }

  return {
    schemaVersion: CHRONICLE_VERSION,
    generatedAt: packagedAt ?? new Date().toISOString(),
    sessionId: session?.id ?? null,
    scenarioId,
    scenarioTitle,
    scenarioComplete: Boolean(scenarioComplete),
    character: {
      name,
      concept: character?.concept ?? null,
      attributes: character?.attributes ?? null,
      skills: character?.skills ?? null,
    },
    turns: session?.turns ?? entries.length,
    entries,
    facts,
    text: lines.join("\n").trim(),
  };
}
