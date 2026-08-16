// /api/turn 的「定向與反覆套路」端對端測試。
//
// 對應的兩句測玩回饋：
//   「在AI的回覆中，我完全摸不清故事背景，也不理解現在具體要幹嘛？
//     我就是看選項哪個數字高就按哪個」
//   「只要玩家把單一屬性+單一技能點高，就能一直用同一個檢定通關」
//
// 這一組刻意測**接線**而不是單一模組：套路懲罰的算式在 repetition.js 已經測過了，
// 這裡要驗的是「它真的有加到擲骰用的DC上」「玩家在按下去之前就看得到」
// 「目標與簡介真的有走到回應裡」——這幾件事全部是模組測試綠燈也可能壞掉的地方。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost } from "../functions/api/session.js";
import { onRequestPost as turnPost } from "../functions/api/turn.js";
import { getScenarioPack, DEFAULT_SCENARIO_ID } from "../content/scenario/registry.js";
import { MAX_RETREAD_PENALTY } from "../content/scenario/repetition.js";

/** 回饋裡那種「敏捷+潛行點最高」的專精卡。 */
const SPECIALIST = {
  concept: { name: "專精者", gender: "男" },
  attributes: { 敏捷: 4, 感知: 2, 耐力: 2, 力量: 1, 智力: 1, 意志: 1 },
  skills: { 潛行: 3, 偵察: 2, 體魄: 2, 交涉: 1 },
};

const OPTION_SET = [
  { label: "貼著牆摸過去", hint: "想不被發現地前進", attribute: "敏捷", skill: "潛行", difficulty: "普通" },
  { label: "先看清楚前面", hint: "想弄懂眼前的狀況", attribute: "感知", skill: "偵察", difficulty: "普通" },
  { label: "喊話試探", hint: "想問出更多資訊", attribute: "意志", skill: "交涉", difficulty: "普通" },
  { label: "硬推開它", hint: "想強行打開一條路", attribute: "力量", skill: "體魄", difficulty: "普通" },
];

function makeEnv() {
  const prompts = [];
  return {
    prompts,
    AI: {
      run: async (model, payload) => {
        prompts.push(JSON.stringify(payload));
        return { response: JSON.stringify({ narration: "敘事", options: OPTION_SET }) };
      },
    },
  };
}

const req = (env, body) => ({ request: { json: async () => body }, env });
const rj = async (res) => JSON.parse(await res.text());

async function startGame(env, draft = SPECIALIST) {
  const s = await rj(await sessionPost(req(env, { draft })));
  assert.equal(s.ok, true, JSON.stringify(s.errors ?? s.error));
  const opening = await rj(await turnPost(req(env, { sessionId: s.session.id })));
  return { sessionId: s.session.id, opening };
}

/** 一直按同一個技能的選項，回傳每一回合的結果。 */
async function spam(env, sessionId, skill, times, from) {
  const results = [];
  let current = from;
  for (let i = 0; i < times; i++) {
    const option = current.options.find((o) => o.skill === skill) ?? current.options[0];
    current = await rj(await turnPost(req(env, { sessionId, chosenOption: option })));
    results.push({ pressed: option, result: current });
  }
  return results;
}

test("一直用同一個「屬性＋技能」，實際擲骰的DC會被引擎調高", async () => {
  const env = makeEnv();
  const { sessionId, opening } = await startGame(env);
  const rounds = await spam(env, sessionId, "潛行", 5, opening);

  const dcs = rounds.map((r) => r.result.checkParams.dc);
  assert.equal(dcs[0], dcs[1], "前兩次不該有懲罰");
  assert.ok(dcs[2] > dcs[1], "連續第三次開始要變難");
  assert.ok(dcs[4] > dcs[2], "而且要愈來愈難");
  assert.equal(dcs[4] - dcs[0], MAX_RETREAD_PENALTY, "第五次應該已經吃到封頂的懲罰");

  // baseDc 要保留下來，否則前端沒辦法告訴玩家「這個DC裡有多少是懲罰」
  const last = rounds[4].result.checkParams;
  assert.equal(last.baseDc + last.retread.dcPenalty, last.dc);
});

test("換一個技能就立刻歸零（機制的目的是引導換手，不是懲罰專精）", async () => {
  const env = makeEnv();
  const { sessionId, opening } = await startGame(env);
  const spammed = await spam(env, sessionId, "潛行", 4, opening);
  const penalized = spammed[3].result.checkParams.dc;

  const switched = await spam(env, sessionId, "偵察", 1, spammed[3].result);
  assert.equal(switched[0].result.checkParams.retread, undefined, "換技能的那一次不該有懲罰");

  const backToStealth = await spam(env, sessionId, "潛行", 1, switched[0].result);
  const afterSwitch = backToStealth[0].result.checkParams;
  assert.ok(
    (afterSwitch.dc ?? 0) < penalized,
    "中間換過一次之後，回頭用潛行應該重新從無懲罰開始算"
  );
});

test("懲罰要在玩家按下去之前就標在選項上（按完才知道等於是在罰他）", async () => {
  const env = makeEnv();
  const { sessionId, opening } = await startGame(env);
  const rounds = await spam(env, sessionId, "潛行", 3, opening);

  const nextOptions = rounds[2].result.options;
  const stealth = nextOptions.find((o) => o.skill === "潛行");
  const others = nextOptions.filter((o) => o.skill !== "潛行");

  assert.ok(stealth.retread, "被連按的那個選項要帶預告");
  assert.ok(stealth.retread.label.includes("DC+"), "預告要講明白加了多少");
  assert.equal(stealth.effectiveDc, stealth.dc + stealth.retread.dcPenalty);
  for (const o of others) {
    assert.equal(o.retread, undefined, `沒被連按的選項「${o.label}」不該有懲罰標記`);
  }
});

test("套路懲罰會寫進prompt，讓AI把難度變化寫成劇情而不是憑空變難", async () => {
  const env = makeEnv();
  const { sessionId, opening } = await startGame(env);
  await spam(env, sessionId, "潛行", 4, opening);

  const lastPrompt = env.prompts.at(-1);
  assert.match(lastPrompt, /同一套路連續第/);
  assert.match(lastPrompt, /異形/, "反制的主體要用副本自己的威脅名稱，不是通用的「威脅」");
});

test("回應要帶上玩家看得懂的目標與副本簡介（不是只有節點標題那句謎語）", async () => {
  const env = makeEnv();
  const { opening } = await startGame(env);

  const node = opening.scenario.activeNode;
  assert.ok(node.goal, "活躍節點要帶 playerGoal");
  assert.notEqual(node.goal, node.title, "目標要是一句玩家看得懂的話，不是索引用的標題");

  const briefing = opening.scenario.briefing;
  assert.ok(briefing?.premise && briefing?.objective, "副本簡介要有前提與目標");
  assert.equal(briefing.title, getScenarioPack(DEFAULT_SCENARIO_ID).briefing.title);
});

test("每個選項都要帶 hint（玩家判斷該按哪個的主要依據）", async () => {
  const env = makeEnv();
  const { sessionId, opening } = await startGame(env);
  for (const o of opening.options) {
    assert.ok(o.hint, `固定開頭的選項「${o.label}」少了 hint`);
  }

  const next = await spam(env, sessionId, "偵察", 1, opening);
  for (const o of next[0].result.options) {
    assert.ok(o.hint, `AI選項「${o.label}」的 hint 沒有被保留下來`);
  }
});
