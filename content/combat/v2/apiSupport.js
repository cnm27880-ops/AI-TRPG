// Combat V2 —— API 層共用的小工具。
//
// 放在 content/ 而不是 functions/ 底下，是因為 Cloudflare Pages Functions 是
// 「檔案路徑即路由」——在 functions/api/combat/v2/ 底下多一個檔案就是多一個對外端點。
// 共用程式碼放在那裡會意外開出一個誰都打得到的 /api/combat/v2/_shared。

import { getCurrentUser } from "../../auth/sessionToken.js";
import { canAccessSession } from "../../auth/ownership.js";
import { toPublicBattle } from "../../../core/combat/v2/publicState.js";

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * 讀存檔 + 歸屬檢查。回 404 而不是 403 是本專案既有的約定
 * （告訴對方「這個ID存在但你不能看」等於確認了它的存在）。
 * @returns {{ ok: true, session } | { ok: false, response: Response }}
 */
export async function loadOwnedSession(context, store, sessionId) {
  if (!sessionId) return { ok: false, response: json({ ok: false, error: "body必須包含 sessionId" }, 400) };
  const session = await store.get(sessionId);
  if (!session) return { ok: false, response: json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404) };
  const user = await getCurrentUser(context.request, context.env ?? {});
  if (!canAccessSession(session, user)) {
    return { ok: false, response: json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404) };
  }
  return { ok: true, session };
}

/** 統一的成功回應形狀（規格第8節）。戰鬥一律走 publicState 的白名單。 */
export function battleResponse(battle, extra = {}) {
  return { ok: true, battle: toPublicBattle(battle), ...extra };
}

/**
 * 冪等紀錄（規格第8.4節第2點：同一個 requestId 重送不可重複扣除 HP、彈藥或動作）。
 *
 * 這裡存的是「這個 requestId 已經在哪一版狀態上結算過，結果摘要是什麼」，
 * 不是整包回應。重送時把**目前**的公開狀態配上當時的 resolution 回去：
 * 玩家要的本來就是最新狀態，而 resolution 是那一次結算真正發生的事。
 * 存整包回應會讓每一場戰鬥的存檔多帶好幾份完整快照，那對 KV 是純粹的浪費。
 */
export function findRequestRecord(battle, requestId) {
  if (!requestId) return null;
  return (battle.requestLog ?? []).find((entry) => entry.requestId === requestId) ?? null;
}

export function rememberRequest(battle, requestId, resolution) {
  if (!requestId) return battle;
  battle.requestLog = [
    ...(battle.requestLog ?? []),
    { requestId, stateVersion: battle.stateVersion, resolution, at: new Date().toISOString() },
  ].slice(-5);
  return battle;
}

/**
 * 樂觀鎖定檢查（規格第8.4節第1、3點）。版本不符時回 409，並附上最新公開狀態，
 * 讓前端可以直接重畫、要求玩家重新確認——不是靜默套用舊選擇。
 */
export function stateVersionConflict(battle, incoming) {
  if (typeof incoming !== "number") {
    return json({ ok: false, code: "MISSING_STATE_VERSION", error: "請求必須帶 stateVersion" }, 400);
  }
  if (incoming !== battle.stateVersion) {
    return json(
      {
        ok: false,
        code: "STATE_VERSION_CONFLICT",
        error: "戰鬥狀態已經更新，請重新確認你的選擇。",
        battle: toPublicBattle(battle),
      },
      409
    );
  }
  return null;
}

/**
 * 把角色卡掛上戰鬥狀態，**每一個端點在做任何事之前都要先呼叫它**。
 *
 * 型態系統要讀寫角色卡（意志力、能量池），而規則層拿到的只有 battle。最直覺的作法是
 * 把角色卡存進 battle——但那會立刻多出**第二份角色卡**：玩家在戰鬥中途去休息、買東西、
 * 復活，改的是 session.character，而戰鬥裡那份不會跟著變，兩份從此各走各的。
 *
 * 所以 battle.character 是一個**暫時的工作參照，不是狀態**：進來時從存檔重新掛上、
 * 出去時（detachCharacter）拆掉，永遠不寫進 KV。唯一的真相仍然是 session.character。
 */
export function attachCharacter(battle, character) {
  if (battle) battle.character = character;
  return battle;
}

/** 拆掉工作參照。存檔之前一定要呼叫，否則存檔裡會多一份會過期的角色卡。 */
export function detachCharacter(battle) {
  if (battle) delete battle.character;
  return battle;
}

/** 把戰鬥中玩家受到的傷害同步回角色卡，讓角色面板與戰鬥面板永遠是同一個血量。 */
export function syncPlayerHp(session, battle) {
  const player = battle.participants.find((p) => p.id === "player");
  if (player) session.character.derived.hp = { ...player.hpState };
  return session;
}
