// 固定開頭（openingNarration / openingOptions）的端對端測試。
//
// 這個功能是回應測玩回饋：「要撰寫一個固定的故事開頭，涵蓋玩家初次出現在副本內的茫然
// 和周圍環境的警惕」。實作方式是在 functions/api/turn.js 開一條短路：符合條件的開場回合
// 直接回傳作者寫好的文字，**完全不呼叫AI**。
//
// 所以這裡最重要的一條測試是「開場那一回合，假的 AI binding 一次都沒有被呼叫過」——
// 那是「固定」與「零延遲」這兩個賣點唯一的實質保證。其餘測試守著它的邊界：
// 玩家一旦開始行動就必須回到正常的AI流程，讀檔續玩不可以再播一次開場。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import { getScenarioPack, DEFAULT_SCENARIO_ID } from "../content/scenario/registry.js";
import { OPTION_COUNT } from "../content/turnOptions.js";

const DRAFT = {
  concept: { name: "測試輪迴者", gender: "男" },
  attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
  skills: { 格鬥: 3, 射擊: 0, 體魄: 1, 潛行: 1, 求生: 0, 偵察: 2, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 1 },
};

function makeEnv() {
  const calls = [];
  return {
    calls,
    AI: {
      run: async (model, payload) => {
        calls.push({ model, payload });
        return {
          response: JSON.stringify({
            narration: "AI寫的敘事",
            options: [
              { label: "AI選項一", attribute: "感知", skill: "偵察", difficulty: "容易" },
              { label: "AI選項二", attribute: "力量", skill: "格鬥", difficulty: "普通" },
              { label: "AI選項三", attribute: "意志", skill: "交涉", difficulty: "普通" },
              { label: "AI選項四", attribute: "敏捷", skill: "潛行", difficulty: "困難" },
            ],
          }),
        };
      },
    },
  };
}

const req = (env, body) => ({ request: { json: async () => body }, env });
const readJson = async (res) => JSON.parse(await res.text());

async function newSession(env, body = {}) {
  const r = await readJson(await sessionPost(req(env, { draft: DRAFT, ...body })));
  assert.equal(r.ok, true, r.error);
  return r.session.id;
}

test("開場回合完全不呼叫AI，直接回傳副本寫好的固定開頭", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env);

  const r = await readJson(await turnPost(req(env, { sessionId })));

  assert.equal(env.calls.length, 0, "固定開頭這一回合一次都不該呼叫AI（這正是它零延遲的原因）");
  assert.equal(r.ok, true);
  assert.equal(r.degraded.narrationSource, "scripted");
  assert.equal(r.checkResult, null, "開場不擲骰");

  const chapter = getScenarioPack(DEFAULT_SCENARIO_ID).entries[0];
  assert.equal(r.narration, chapter.openingNarration, "開場文字必須一字不改");
  assert.equal(r.options.length, OPTION_COUNT);
  assert.equal(r.options[0].label, chapter.openingOptions[0].label);
});

test("固定開頭的選項要標成 scripted，不是保底(fallback)", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env);
  const r = await readJson(await turnPost(req(env, { sessionId })));

  // 前端會把 source==="fallback" 標成「保底」並跳一則警告（見 public/app.js 的
  // renderOptions/renderTurnQuality）。固定開頭的選項是作者針對這個場景寫的，
  // 標成保底等於對玩家說謊，也會讓真正的保底警告失去意義。
  for (const opt of r.options) {
    assert.equal(opt.source, "scripted", `選項「${opt.label}」被標成了 ${opt.source}`);
  }
  assert.equal(r.degraded.fallbackOptionCount, 0);
});

test("固定開頭的選項一樣要通過規則查驗(屬性/技能/難度都要是規則書裡的合法值)", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env);
  const r = await readJson(await turnPost(req(env, { sessionId })));

  for (const opt of r.options) {
    assert.ok(opt.attribute, "查驗過的選項一定帶屬性");
    assert.ok(Number.isInteger(opt.dc), `選項「${opt.label}」沒有被換算成DC`);
  }
  // 查驗過程若對固定開頭的選項提出任何修正，代表副本包寫錯了，應該在測試就抓到
  const openingWarnings = (r.warnings ?? []).filter((w) => w.startsWith("固定開頭選項"));
  assert.deepEqual(openingWarnings, [], "副本包裡的固定選項不該需要引擎修正");
});

test("玩家一旦行動就回到正常AI流程，而且不會再播一次開場", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env);
  const opening = await readJson(await turnPost(req(env, { sessionId })));

  const next = await readJson(await turnPost(req(env, { sessionId, chosenOption: opening.options[0] })));
  assert.equal(env.calls.length, 1, "玩家行動的回合必須真的呼叫AI");
  assert.equal(next.narration, "AI寫的敘事");
  assert.equal(next.degraded.narrationSource, "ai");
  assert.ok(next.checkResult, "選了帶檢定的選項就要真的擲骰");

  // 讀檔續玩：已經有歷史了，開場短路不可以再觸發（否則玩家會看到自己剛醒來兩次）
  const resumed = await readJson(await turnPost(req(env, { sessionId })));
  assert.equal(resumed.degraded.narrationSource, "ai");
  assert.equal(env.calls.length, 2);
});

test("沒有固定開頭的副本行為完全不變(開場照樣交給AI)", async () => {
  const env = makeEnv();
  const sessionId = await newSession(env, { scenarioId: "scenario.echo-institute-01" });

  const r = await readJson(await turnPost(req(env, { sessionId })));
  assert.equal(env.calls.length, 1);
  assert.equal(r.degraded.narrationSource, "ai");
});

test("新手副本的固定開頭本身要符合它自己訂的寫作要求", async () => {
  const chapter = getScenarioPack(DEFAULT_SCENARIO_ID).entries[0];
  const text = chapter.openingNarration;

  assert.ok(text.length > 200, "開場太短撐不起「初次踏進副本」的份量");
  assert.equal(chapter.openingOptions.length, OPTION_COUNT);

  // 不可以替玩家決定情緒或行動——這是單人TRPG最容易被違反、也最傷體驗的一條
  // （見 content/narrativeStyle.js 的 UNIVERSAL_STYLE_RULES）。固定開頭是人寫的，
  // 沒有AI會來檢查它，所以這條規則在這裡用測試守著。
  for (const banned of ["你感到", "你決定", "你害怕", "你意識到自己很", "你知道自己必須"]) {
    assert.ok(!text.includes(banned), `固定開頭不該替玩家決定：「${banned}」`);
  }

  // 四個選項要是四種不同的解決思路（見 content/turnOptions.js 的挑選守則），
  // 不能四個都用同一個技能，否則玩家的第一個選擇等於沒得選。
  const skills = chapter.openingOptions.map((o) => o.skill);
  assert.equal(new Set(skills).size, skills.length, "四個開場選項不該用同一個技能");
});
