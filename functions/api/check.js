// Cloudflare Pages Function — [設計] 部署骨架範例，不是規則書內容。
// 路由：POST /api/check
// 用途：示範「前端把角色卡JSON+判定參數丟過來，這裡直接呼叫 core/check.js 的純運算引擎算出結果」，
// 讓 AI(Gemini)只需要對接這個端點回傳的結果去敘事，完全不用自己算骰子。
//
// [風險提示，寫給使用者] core/dice.js 用的是 node:crypto 的 randomInt()，不是瀏覽器/Workers
// 原生的 Math.random()。Cloudflare Pages/Workers 執行環境預設不含 node:crypto，要在
// wrangler.toml(或wrangler.jsonc) 裡開 compatibility_flags = ["nodejs_compat"] 才能跑，
// 這個repo根目錄的 wrangler.toml 已經開了，但如果你之後改動設定檔要記得保留這一行，
// 不然這個函式在正式環境會直接丟錯，不是「算出來的結果不對」，是「整個函式炸掉」。
//
// 這個檔案本身沒辦法在這個沙盒環境裡實際測試(沒有Cloudflare帳號/wrangler CLI可以跑`wrangler pages dev`)，
// 邏輯上是直接複用已經有176+個單元測試涵蓋過的 core/check.js，風險集中在「Workers執行環境跟Node
// 環境的行為差異」，不是「判定邏輯本身」。部署後請先用一個已知範例(例如ARCHITECTURE.md或
// TEST_PLAN.md裡引用過的書中範例)手動打一次API，確認回傳結果跟單元測試算出來的一樣，再正式串前端。

import { performCheck } from "../../core/check.js";
import { inferCheckParams } from "../../content/checkIntent.js";
import { applyCheckModifiers } from "../../content/shop/effects.js";

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("請求body必須是合法JSON", 400);
  }

  const { character, params, playerAction } = body ?? {};
  if (!character) {
    return jsonError("body必須包含 character(人物卡物件)", 400);
  }
  if (!params && !playerAction) {
    return jsonError(
      "body必須包含 params(判定參數，見core/check.js的performCheck())，或 playerAction(玩家行動描述，由content/checkIntent.js推導檢定)",
      400
    );
  }

  // params 優先；只給 playerAction 時由引擎層推導該擲什麼檢定，前端不做這個規則決定。
  const baseParams = params ?? inferCheckParams(playerAction, { character });
  // 商店買到的檢定加值(專長/物品)在這裡併進判定參數，不然買了等於沒買。
  //
  // **進行中的型態(變身/開眼)吃不到，這是刻意的**：型態狀態活在存檔的 session.forms 裡，
  // 而這個端點是無存檔的示範/相容模式(角色卡由 body 傳進來，沒有 sessionId 可以查)。
  // 真正的遊戲迴圈是 /api/turn，那裡有存檔、也真的讀型態。前端只呼叫 /api/turn。
  // 要讓這個端點也吃到型態，得先讓它收 sessionId——那等於把它變成另一個 /api/turn。
  const { params: resolvedParams, modifiers } = applyCheckModifiers(character, baseParams);

  try {
    const result = performCheck(character, resolvedParams);
    return new Response(JSON.stringify({ ok: true, params: resolvedParams, result, abilityModifiers: modifiers }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return jsonError(`判定計算失敗：${err.message}`, 400);
  }
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
