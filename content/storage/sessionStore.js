// [設計] 存檔層 —— 把「一場遊戲的完整狀態」存起來，讓玩家重整頁面不會失去進度，
// 也讓 AI 能讀到之前發生過什麼（AI記憶的資料來源就是這裡存的 eventLog 與 history）。
//
// 一份存檔（session）包含四塊：
//   character  角色卡（core/schema.js 的形狀）
//   log        事件日誌（core/eventLog.js 的形狀），結構化事實，例如「判定：躲藏，成功，margin=1」
//   history    最近幾輪的敘事文字，AI 需要它才能維持劇情連貫（事實摘要沒有語氣與細節）
//   scene      目前場景描述與 AI 上一輪提出的選項
//
// 為什麼 log 跟 history 要分開存：
//   log 是「不可竄改的事實」，之後要做日誌回顧UI、算經驗值、判斷成就都靠它，會一直長大。
//   history 是「餵給AI的短期記憶」，只保留最近N輪，因為每一輪都塞進prompt會爆掉context也燒錢。
//   兩者的生命週期跟用途完全不同，混在一起遲早要拆，不如一開始就分開。
//
// [已知簡化] 沒有做「長期記憶」。history 只留最近N輪，超過就掉了。
// 劇情拉長之後AI會忘記很早以前的事，正解是做摘要或向量檢索，那是之後的工作。
// 目前 log 仍然完整保留，所以資料沒有遺失，只是沒有餵給AI。

import { createEventLog } from "../../core/eventLog.js";

/** 餵給AI的敘事短期記憶要保留幾輪。調大會更連貫但更花錢，調小會失憶。 */
export const HISTORY_LIMIT = 8;

/** 存檔在KV裡的key前綴。 */
const KEY_PREFIX = "session:";

/** 建立一份全新的存檔內容。 */
export function createSession({ id, character, sceneContext = "" }) {
  const now = new Date().toISOString();
  return {
    id,
    version: 1,
    character,
    log: createEventLog(),
    history: [],
    scene: { context: sceneContext, options: [] },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 把一輪的敘事推進 history，並自動裁掉超出上限的舊紀錄。
 * 回傳新的 history 陣列（不修改傳入的那個）。
 */
export function pushHistory(history, { action, narration }) {
  const next = [...(history ?? [])];
  next.push({ action: action ?? null, narration: narration ?? null });
  return next.slice(-HISTORY_LIMIT);
}

/**
 * 把 history 轉成可以塞進 prompt 的文字段落。
 * 沒有紀錄時回傳 null，讓呼叫端知道「這是第一輪」而不是塞一段空白進去。
 */
export function historyToPromptText(history) {
  if (!history?.length) return null;
  const lines = [];
  for (const turn of history) {
    if (turn.action) lines.push(`玩家：${turn.action}`);
    if (turn.narration) lines.push(`你上一輪寫的：${turn.narration}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 儲存後端
// ---------------------------------------------------------------------------

/**
 * Cloudflare KV 版本。正式環境用這個。
 * KV 的一致性是「最終一致」，同一個玩家連續操作偶爾可能讀到舊值——
 * 以單人回合制遊戲來說可以接受（玩家不會同時在兩個裝置上搶同一回合）。
 * 如果之後要做多人同場，KV 就不夠了，要換 Durable Objects。
 */
export function kvSessionStore(kv) {
  return {
    kind: "kv",
    persistent: true,
    async get(id) {
      return (await kv.get(KEY_PREFIX + id, "json")) ?? null;
    },
    async put(session) {
      session.updatedAt = new Date().toISOString();
      await kv.put(KEY_PREFIX + session.id, JSON.stringify(session));
      return session;
    },
    async delete(id) {
      await kv.delete(KEY_PREFIX + id);
    },
    async list(limit = 50) {
      const res = await kv.list({ prefix: KEY_PREFIX, limit });
      return (res.keys ?? []).map((k) => k.name.slice(KEY_PREFIX.length));
    },
  };
}

/**
 * 記憶體版本 —— **只給測試與本機開發用**。
 *
 * [重要警告] 不要在正式環境依賴它。Cloudflare Workers 每個 isolate 有自己的記憶體，
 * 而且 isolate 隨時會被回收，所以：存檔會莫名其妙消失，不同玩家也可能被分到不同 isolate
 * 而看到不一樣的資料。這個實作存在的唯一理由是「沒有KV binding時也能把流程跑起來」，
 * 呼叫端必須把 persistent:false 這件事**顯示給使用者看**，不能假裝存檔成功了。
 */
export function memorySessionStore(initial = new Map()) {
  const map = initial;
  return {
    kind: "memory",
    persistent: false,
    async get(id) {
      const v = map.get(id);
      return v ? JSON.parse(JSON.stringify(v)) : null;
    },
    async put(session) {
      session.updatedAt = new Date().toISOString();
      map.set(session.id, JSON.parse(JSON.stringify(session)));
      return session;
    },
    async delete(id) {
      map.delete(id);
    },
    async list(limit = 50) {
      return [...map.keys()].slice(0, limit);
    },
  };
}

// Workers 的 isolate 內共用同一份，讓本機開發時至少同一個 isolate 內的多次請求連得起來。
const fallbackMap = new Map();

/**
 * 依環境挑一個儲存後端。
 * 有 KV binding 就用 KV，沒有就退到記憶體版並在回傳值裡標記 persistent:false。
 * @param {object} env Cloudflare Pages Functions 的 context.env
 */
export function resolveSessionStore(env = {}) {
  if (env.SAVES && typeof env.SAVES.get === "function") {
    return kvSessionStore(env.SAVES);
  }
  return memorySessionStore(fallbackMap);
}

/** 產生一個存檔ID。用 crypto.randomUUID()，Workers 與現代瀏覽器都有。 */
export function newSessionId() {
  return crypto.randomUUID();
}
