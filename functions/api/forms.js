// Cloudflare Pages Function —— 戰鬥外的型態（變身／開眼／爆發）。
//   GET  /api/forms?sessionId=...                        我身上有哪些型態、哪些正在進行中
//   POST /api/forms { sessionId, formId, action }        action: "啟動" | "收功"
//
// [決策記錄 2026-08-17] **這個檔案存在的理由是補一個謊。**
//
// 存檔的 version 2 建了 `session.forms` 這個欄位，商店頁也列得出「可啟動的型態」，
// 但在這個檔案出現之前，全專案沒有任何一行程式碼讀它或寫它——`activateForm()` 在
// functions/ 底下是零呼叫端。也就是說：血統／瞳術那一整類商品的價值幾乎都寫在型態上，
// 而型態只有在戰鬥中按得下去，戰鬥外買了等於沒買。這正是 CONVERSION_RULES.md 第1節
// 在講的「看起來有效、實際上沒有程式碼會讀它」，只是這次躺在存檔格式裡。
//
// 補它之前卡了一個真正的設計問題：**戰鬥外的「場景」什麼時候結束？** 戰鬥裡有
// advanceTurn() 在推「輪」、有 finalizeIfOver() 當結束點；戰鬥外兩個都沒有，
// 而一個不會到期的「持續一個場景」就是一個永久加值——那正是 forms.js 整個設計在避開的事。
// 使用者的決定是：**場景 ＝ 當下所在的地點**（content/shop/access.js 的 sceneKeyOf()）。
//
// 這一層跟 /api/shop 同樣刻意很薄：能不能啟動、要扣多少意志力與能量池、什麼時候到期，
// 全部是 content/shop/forms.js 的純函式在算，這裡只負責「讀存檔 → 呼叫純函式 → 寫回存檔」。

import { resolveSessionStore } from "../../content/storage/sessionStore.js";
import { sceneKeyOf } from "../../content/shop/access.js";
import {
  formsOf,
  formsForScene,
  activateForm,
  deactivateForm,
  isFormActive,
  describeActiveForms,
  variablePaymentRange,
} from "../../content/shop/forms.js";
import { getScenarioPack } from "../../content/scenario/registry.js";
import { appendEvent, EVENT_TYPES } from "../../core/eventLog.js";
import { getCurrentUser } from "../../content/auth/sessionToken.js";
import { canAccessSession } from "../../content/auth/ownership.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function loadSession(context, sessionId) {
  const store = resolveSessionStore(context.env ?? {});
  if (!sessionId) return { error: json({ ok: false, error: "需要 sessionId" }, 400) };
  const session = await store.get(sessionId);
  if (!session) return { error: json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404) };
  if (!canAccessSession(session, await getCurrentUser(context.request, context.env ?? {}))) {
    return { error: json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404) };
  }
  return { store, session };
}

/**
 * 型態頁的完整狀態。**每次都先對一次場景鑰匙**——玩家可能是換了地點之後才打開這一頁，
 * 那些型態應該在他看到之前就已經到期了(見 forms.js 的 formsForScene)。
 */
function formsPayload(session) {
  const sceneKey = sceneKeyOf(session, getScenarioPack);
  const { formsState, expired } = formsForScene(session.forms, sceneKey);
  session.forms = formsState;
  return {
    ok: true,
    sceneKey,
    // 戰鬥中的型態存在 combat.forms，是另一份。這一頁只管戰鬥外的那一份，
    // 但要講清楚現在為什麼按不動，不然玩家會以為壞掉了。
    inCombat: Boolean(session.combat?.active),
    forms: formsOf(session.character).map((f) => ({
      formId: f.formId,
      label: f.effect.label,
      sourceName: f.sourceName,
      activation: f.effect.activation,
      duration: f.effect.duration,
      upkeep: f.effect.upkeep ?? null,
      // 可變量支付的範圍與二選一的選項。跟貨架同一個原則：上限是規則，由伺服器算，
      // 前端只畫——「最多不超過自身敏捷或感知取低」不該在瀏覽器裡重寫一次。
      variable: variablePaymentRange(f.effect, session.character),
      modes: (f.effect.modes ?? []).map((m) => ({ key: m.key, label: m.label })),
      active: isFormActive(formsState, f.formId),
    })),
    active: describeActiveForms(formsState),
    expired: expired.map((f) => ({ formId: f.formId, label: f.label })),
    willpower: session.character.derived?.willpower ?? null,
    energyPools: session.character.derived?.energyPools ?? {},
  };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const { error, store, session } = await loadSession(context, url.searchParams.get("sessionId"));
  if (error) return error;
  const payload = formsPayload(session);
  // 到期是一個狀態改變，不是只在這次計算裡當作沒看到——要寫回去，
  // 否則下一次讀取又會把同一批型態「再到期一次」。
  if (payload.expired.length > 0) await store.put(session);
  return json(payload);
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const { sessionId, formId, action = "啟動", amount = null, mode = null } = body ?? {};
  const { error, store, session } = await loadSession(context, sessionId);
  if (error) return error;
  if (!formId) return json({ ok: false, error: "body必須包含 formId" }, 400);
  if (!["啟動", "收功"].includes(action)) {
    return json({ ok: false, error: `action 只能是「啟動」或「收功」，收到「${action}」` }, 400);
  }

  // 戰鬥中的型態走 /api/combat/act，因為那裡才有動作額度可以扣。
  // 這裡直接擋掉，不然同一場戰鬥會有兩條互相看不到對方的路徑在改型態。
  if (session.combat?.active) {
    // [修正 2026-08-17 第九輪] `...formsPayload()` 一定要放在 `ok:false` **前面**。
    // formsPayload() 自己帶著 ok:true，先前它被展開在後面，於是這個「擋下來」的回應
    // 實際送出去的是 ok:true——前端的 `if (!res.ok)` 永遠不成立，玩家按下去會看到
    // 一句「啟動成功」的綠字，而什麼也沒發生。**這條線在上一輪是用眼睛看過的，
    // 但看的是能不能啟動，沒有看擋下來的那一條**；這次是端對端腳本把它照出來的。
    return json({
      ...formsPayload(session),
      ok: false,
      blockers: [{ code: "戰鬥中", message: "戰鬥中的變身要在戰鬥畫面裡做(那裡才扣得到動作額度)" }],
    });
  }

  const sceneKey = sceneKeyOf(session, getScenarioPack);
  const { formsState } = formsForScene(session.forms, sceneKey);
  session.forms = formsState;

  if (action === "收功") {
    const result = deactivateForm(session.forms, formId, "主動收功");
    session.forms = result.formsState;
    if (result.ended.length > 0) {
      appendEvent(
        session.log,
        EVENT_TYPES.FORM,
        { event: "收功", formId, label: result.ended[0].label },
        { timestamp: new Date().toISOString(), scenarioId: session.scenario?.packId ?? null, turn: (session.turns ?? 0) + 1 }
      );
      await store.put(session);
    }
    return json({ ...formsPayload(session), ended: result.ended.map((f) => f.label) });
  }

  // 戰鬥外沒有回合制的動作額度，所以不傳 budget——強迫它有一個等於憑空發明規則
  // (forms.js 的 activateForm 對 budget=null 的處理就是「動作成本不適用」)。
  // 以「輪」計時的型態在戰鬥外啟動不了：沒有輪可以數，activateForm 會回「缺少輪數」。
  const result = activateForm(session.character, session.forms, formId, { sceneKey, amount, mode });
  if (!result.ok) {
    // 同上：formsPayload() 帶著 ok:true，展開順序反了就會把失敗回成成功。
    return json({ ...formsPayload(session), ok: false, blockers: result.blockers });
  }

  session.character = result.character;
  session.forms = result.formsState;
  // forms.js 把這次啟動付了什麼代價記在它自己的 log 尾端，直接沿用，不要在這裡重算一次。
  const cost = result.formsState.log.at(-1) ?? {};
  appendEvent(
    session.log,
    EVENT_TYPES.FORM,
    {
      event: "啟動",
      formId,
      label: result.form.label,
      sceneKey,
      willpowerSpent: cost.willpowerSpent ?? 0,
      poolSpent: cost.poolSpent ?? null,
      mode: cost.mode ?? null,
    },
    { timestamp: new Date().toISOString(), scenarioId: session.scenario?.packId ?? null, turn: (session.turns ?? 0) + 1 }
  );
  await store.put(session);

  return json({ ...formsPayload(session), form: result.form, character: session.character });
}
