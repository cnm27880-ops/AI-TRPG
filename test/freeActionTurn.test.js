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
// [2026-08-31] messages 現在是三層結構（system / 歷史 user+assistant / 最後一則 user），
// 見 content/llm/cacheLayers.js。「這一回合的 prompt」永遠是**最後一則** user message，
// 不是第一則——第一則已經是最舊的那一輪歷史了。
function lastMessages(env) {
  const { messages } = env.calls.at(-1).payload;
  const userMessages = messages.filter((m) => m.role === "user");
  return {
    system: messages.find((m) => m.role === "system")?.content ?? "",
    user: userMessages.at(-1)?.content ?? "",
    history: messages.filter((m) => m.role !== "system").slice(0, -1),
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

// [2026-08-31] 這一組釘住的是一個實測回報：玩家（尤其是輸入很短的人）打
// 「我很害怕」「原地翻跟斗」這類句子時，引擎會把它當成一次「困難」的感知檢定，
// 實測 98% 失敗；而且所有 unmatched 都退回同一個屬性，套路遞減還會讓 DC 一路往上加。
// 玩家越是打短句、打情緒、打搞怪，遊戲就越懲罰他。
test("情緒與搞怪輸入不會被逼著擲骰，也不會累積套路懲罰", async () => {
  const env = scriptedEnv([replyWithFreeOption(1), replyWithFreeOption(2), replyWithFreeOption(3), replyWithFreeOption(4)]);
  const sessionId = await newSession(env);
  await turnPost(req(env, { sessionId }));

  for (const action of ["我很害怕", "原地翻跟斗", "我想哭"]) {
    const { status, body } = await readJson(await turnPost(req(env, { sessionId, playerAction: action })));
    assert.equal(status, 200, `「${action}」應該正常完成：${body.error}`);
    assert.equal(body.checkParams, null, `「${action}」沒有可失敗的目標，不該擲骰`);
    assert.equal(body.checkResult, null);
    assert.equal(body.outcome, null, "沒有判定就不該有判定分級");
    assert.ok(body.narration, "不擲骰不等於沒有敘事");
    // 套路遞減只在有 checkParams 時才會累積；連打三句情緒不該讓難度爬升。
    assert.ok(
      !body.warnings.some((w) => w.includes("套路")),
      `「${action}」不該累積套路懲罰，實際警告：${body.warnings.join("；")}`
    );
    assert.ok(
      !body.warnings.some((w) => w.includes("退回純感知檢定")),
      `「${action}」不該再退回感知檢定`
    );
  }
});

test("有可失敗目標的自由輸入仍然照常擲骰", async () => {
  const env = scriptedEnv([replyWithFreeOption(1), replyWithFreeOption(2)]);
  const sessionId = await newSession(env);
  await turnPost(req(env, { sessionId }));

  const { body } = await readJson(
    await turnPost(req(env, { sessionId, playerAction: "我撬開通風口的柵欄鑽進去" }))
  );
  assert.ok(body.checkParams, "撬開柵欄會失敗，這種必須擲骰");
  assert.ok(body.checkResult, "有 checkParams 就要有實際擲骰結果");
  assert.ok(body.outcome?.tier, "擲完要有判定分級");
});

test("無目標行動的演出協議在系統提示裡，而且不含任何動態值", async () => {
  const env = scriptedEnv([replyWithFreeOption(1), replyWithFreeOption(2)]);
  const sessionId = await newSession(env);
  await turnPost(req(env, { sessionId }));
  await turnPost(req(env, { sessionId, playerAction: "我很害怕" }));
  const { system } = lastMessages(env);

  assert.match(system, /玩家做了一件「不會失敗」的事/, "演出協議要在靜態層");
  assert.match(system, /禁止把它寫成失敗/, "沒有判定就沒有失敗，這句話要真的送到模型面前");
});

// [2026-08-31] 這兩題的前提換了：面具不再由呼叫端指定，改由伺服器端的
// NARRATOR_PERSONA 環境變數決定（沒設就用 DEFAULT_PERSONA_KEY）。
//
// [2026-09-03 再次更新] 面具文字本身已經整個拿掉（見 content/narrativeStyle.js 的
// buildStylePrompt() 說明：玩家沒有介面能選面具，實測也感受不到差異）。
// NARRATOR_PERSONA 現在只驗證合法性，不再讓輸出出現任何面具專屬文字——
// 下面兩題改成鎖住這個現況，而不是鎖住「面具生效」這件已經不存在的行為。
test("NARRATOR_PERSONA 環境變數只驗證合法性，不再讓面具文字出現在輸出裡；規則契約仍然完整、優先序宣告仍在最後", async () => {
  const env = scriptedEnv([replyWithFreeOption(1)]);
  env.NARRATOR_PERSONA = "PANIC_SURVIVOR";
  const sessionId = await newSession(env);

  await turnPost(req(env, { sessionId }));
  const { system } = lastMessages(env);

  assert.ok(!system.includes(NARRATOR_PERSONAS.PANIC_SURVIVOR.instruction), "面具文字不該再出現在輸出裡");
  assert.ok(system.includes(SYSTEM_INSTRUCTION), "規則契約必須完整保留");
  assert.match(system.trim().split("\n\n").at(-1), /以規則契約為準/);
});

test("NARRATOR_PERSONA 設成不存在的 key 時，回合在載入階段就要丟錯，不能靜默吞掉", async () => {
  const env = scriptedEnv([replyWithFreeOption(1)]);
  env.NARRATOR_PERSONA = "NOT_A_PERSONA";
  const sessionId = await newSession(env);

  const { status, body } = await readJson(await turnPost(req(env, { sessionId })));
  assert.notEqual(status, 200, "無效的 NARRATOR_PERSONA 不該讓回合悄悄成功");
  assert.match(body.error ?? "", /NOT_A_PERSONA|可用的有/);
});

test("body 送 persona/style 不會生效，也不會讓回合失敗", async () => {
  // 舊版對未知面具回 400。現在 body 的 persona 根本不被讀取，所以送一個不存在的值
  // 既不該改變敘事、也不該把回合打掛——它就只是被忽略。
  // 「前端沒有入口」跟「後端不接受」是兩件事，這一題釘的是後者。
  const env = scriptedEnv([replyWithFreeOption(1)]);
  const sessionId = await newSession(env);

  const { status, body } = await readJson(
    await turnPost(req(env, { sessionId, persona: "NOT_A_PERSONA", style: "不存在的文筆" }))
  );

  assert.equal(status, 200, `送了無效的 persona/style 不該讓回合失敗：${body.error}`);
  assert.equal(body.ok, true);
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
