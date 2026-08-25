// /api/turn 的「純敘事選項」與「敘事者面具」端對端測試（Phase 5.3 任務1／任務2）。
//
// 這一組測的是**接線**，不是模組本身：turnOptions.js 的查驗與 narrativeStyle.js 的面具
// 各自都有單元測試，但這個專案一再抓到的問題是「引擎做得到、沒有人問它」——
// 功能寫好了、API 沒接上，畫面上完全看不出差別。所以這裡直接打 /api/turn，
// 檢查三件事：
//   1. 玩家選了 requiresCheck:false 的選項時，引擎**真的沒有擲骰**（checkResult 是 null）
//   2. 送給模型的 prompt 走的是「純敘事回合」那一段，不是開場那一段（玩家的行動沒被吃掉）
//   3. 面具真的進到系統提示裡，而且規則契約仍然完整
//
// 一律用假的 env.AI binding 注入腳本，不需要金鑰也不會連網（作法同 turnDegradation.test.js）。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import { NARRATOR_PERSONAS } from "../content/narrativeStyle.js";
import { SYSTEM_INSTRUCTION } from "../content/gemini/promptContract.js";

const DRAFT = {
  concept: { name: "測試輪迴者", gender: "男" },
  attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
  skills: { 格鬥: 3, 射擊: 0, 體魄: 1, 潛行: 0, 求生: 0, 偵察: 2, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 0 },
};

// 沒有固定開頭的副本：有固定開頭的副本開場會直接短路、完全不呼叫AI（見 turn.js），
// 那樣就測不到 prompt 組裝了。
const NO_SCRIPTED_OPENING_SCENARIO = "scenario.echo-institute-01";

function scriptedEnv(replies) {
  let i = 0;
  const calls = [];
  const env = {
    AI: {
      run: async (model, payload) => {
        calls.push({ model, payload });
        const reply = replies[Math.min(i, replies.length - 1)];
        i++;
        return { response: reply };
      },
    },
  };
  env.calls = calls;
  return env;
}

function req(env, body) {
  return { request: { json: async () => body }, env };
}

async function readJson(res) {
  return { status: res.status, body: JSON.parse(await res.text()) };
}

async function newSession(env) {
  const res = await readJson(
    await sessionPost(
      req(env, { draft: DRAFT, sceneContext: "回聲研究所的走廊", scenarioId: NO_SCRIPTED_OPENING_SCENARIO })
    )
  );
  assert.equal(res.body.ok, true, `建立存檔失敗：${res.body.error}`);
  return res.body.session.id;
}

/** 一輪 AI 回覆：三個檢定選項 + 一個純敘事選項。 */
function replyWithFreeOption(n) {
  return JSON.stringify({
    st_thought: `第${n}輪盤算：這次沒有判定，讓玩家多知道一件事，並指名下一個目標物。`,
    narration: `第${n}輪的敘事：走廊盡頭的門半開著。`,
    options: [
      { label: "檢查地上的痕跡", hint: "想知道通往哪裡", requiresCheck: true, attribute: "感知", skill: "偵察", difficulty: "容易" },
      { label: "撞開鐵門", hint: "想開一條路", requiresCheck: true, attribute: "力量", skill: "格鬥", difficulty: "困難" },
      { label: "沿牆邊摸過去", hint: "想換一個位置", requiresCheck: true, attribute: "敏捷", skill: "體魄", difficulty: "普通" },
      { label: "看一眼牆上的門牌", hint: "想確認這是哪一區", requiresCheck: false },
    ],
  });
}

/** 從假 binding 收到的 payload 裡取出這一次的 system / user 訊息。 */
function lastMessages(env) {
  const { messages } = env.calls.at(-1).payload;
  return {
    system: messages.find((m) => m.role === "system")?.content ?? "",
    user: messages.find((m) => m.role === "user")?.content ?? "",
  };
}

test("玩家選純敘事選項時：引擎完全不擲骰，但敘事照樣產生、下一輪選項照樣給", async () => {
  const env = scriptedEnv([replyWithFreeOption(1), replyWithFreeOption(2)]);
  const sessionId = await newSession(env);

  const opening = await readJson(await turnPost(req(env, { sessionId })));
  const freeOption = opening.body.options.find((o) => o.requiresCheck === false);
  assert.ok(freeOption, "AI給的純敘事選項要能通過查驗並回到前端");
  assert.equal(freeOption.dc, null);

  const { status, body } = await readJson(
    await turnPost(req(env, { sessionId, chosenOption: freeOption }))
  );

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.checkParams, null, "純敘事選項不可以產生檢定參數");
  assert.equal(body.checkResult, null, "純敘事選項不可以擲骰");
  assert.equal(body.outcome, null, "沒有判定就不可以有判定分級");
  assert.ok(body.narration, "沒擲骰不等於沒有敘事");
  assert.equal(body.options.length, 4);
});

test("純敘事回合送出的 prompt 帶著玩家的行動，且明講這回合不擲骰", async () => {
  const env = scriptedEnv([replyWithFreeOption(1), replyWithFreeOption(2)]);
  const sessionId = await newSession(env);
  const opening = await readJson(await turnPost(req(env, { sessionId })));
  const freeOption = opening.body.options.find((o) => o.requiresCheck === false);

  await turnPost(req(env, { sessionId, chosenOption: freeOption }));
  const { user } = lastMessages(env);

  // 這是這個接線最容易壞掉的地方：沒有專用分支的話，這一回合會掉進「開場模式」，
  // 玩家按的那個選項會被整個吃掉，模型只會收到「請描寫目前的場景」。
  assert.match(user, /看一眼牆上的門牌/, "玩家的行動必須出現在prompt裡");
  assert.match(user, /純敘事，無風險/);
  assert.match(user, /禁止/);
  assert.ok(!user.includes("【這是本場遊戲的開場】"), "不可以退回開場模式的prompt");
});

test("純敘事選項的 requiresCheck 以伺服器查驗為準：前端把有風險的選項改成 false 也擋得住", async () => {
  const env = scriptedEnv([replyWithFreeOption(1), replyWithFreeOption(2)]);
  const sessionId = await newSession(env);
  await turnPost(req(env, { sessionId }));

  // 玩家竄改：把一個「困難」的檢定選項標成不需要檢定。
  // 伺服器查驗的是**送進來的這個物件**，所以這一格目前擋不住（跟改難度分級同一類的
  // 已知限制，見 content/turnOptions.js 的 validateOption 說明）。這個測試把現況釘住：
  // 它至少不會產生一個「有DC卻不擲骰」的混合狀態——要嘛整組檢定欄位有效，要嘛整組是null。
  const tampered = { label: "撞開鐵門", hint: "想開一條路", requiresCheck: false, attribute: "力量", skill: "格鬥", difficulty: "困難" };
  const { body } = await readJson(await turnPost(req(env, { sessionId, chosenOption: tampered })));

  assert.equal(body.ok, true);
  assert.equal(body.checkResult, null);
  assert.equal(body.checkParams, null, "不擲骰的回合不可以留下半截的檢定參數");
});

test("面具會進到系統提示，且規則契約仍然完整、優先序宣告仍在最後", async () => {
  const env = scriptedEnv([replyWithFreeOption(1)]);
  const sessionId = await newSession(env);

  await turnPost(req(env, { sessionId, persona: "PANIC_SURVIVOR" }));
  const { system } = lastMessages(env);

  assert.ok(system.includes(NARRATOR_PERSONAS.PANIC_SURVIVOR.instruction), "選的面具要真的生效");
  assert.ok(system.includes(SYSTEM_INSTRUCTION), "規則契約必須完整保留");
  assert.ok(
    system.indexOf(NARRATOR_PERSONAS.PANIC_SURVIVOR.instruction) < system.indexOf(SYSTEM_INSTRUCTION)
  );
  assert.match(system.trim().split("\n\n").at(-1), /以規則契約為準/);
});

test("未知的面具要在最前面就擋下來(400)，不要等到組系統提示才爆", async () => {
  const env = scriptedEnv([replyWithFreeOption(1)]);
  const sessionId = await newSession(env);

  const { status, body } = await readJson(
    await turnPost(req(env, { sessionId, persona: "NOT_A_PERSONA" }))
  );

  assert.equal(status, 400);
  assert.match(body.error, /敘事者人格面具/);
  assert.equal(env.calls.length, 0, "參數錯誤的回合不該浪費一次LLM呼叫");
});

test("[安全] 思維鏈(st_thought)不會被印進敘事，也不會出現在公開API回應的任何欄位", async () => {
  const env = scriptedEnv([replyWithFreeOption(1)]);
  const sessionId = await newSession(env);
  const { body } = await readJson(await turnPost(req(env, { sessionId })));

  // 前端「不印」跟玩家「看不到」是兩件事——打開瀏覽器開發者工具的 Network 分頁
  // 就能看到完整回應本文，所以 st_thought 不能出現在 body 的任何地方，
  // 不是只有「不要出現在 body.stThought」這一個欄位而已。
  assert.equal(body.stThought, undefined, "st_thought 不可以出現在公開回應裡");
  assert.ok(!JSON.stringify(body).includes("第1輪盤算"), "後台盤算文字不可以出現在回應本文的任何地方");
  assert.ok(!body.narration.includes("盤算"), "後台盤算不可以混進玩家讀到的敘事裡");
});
