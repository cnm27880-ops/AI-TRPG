// 2026-08-16 排查清單的其餘項目 —— 全部都是同一個模式：
// 「失敗被靜默吞掉，用某種保底/預設值掩蓋過去，玩家看到的內容失真但沒人發現」。
//
// 這裡測的是後端該負責的那一半（回應裡有沒有帶出原因、該擋的有沒有擋）。
// 前端那一半（有沒有把原因顯示出來）沒有辦法在 node:test 裡跑，
// 相關的修正寫在 public/app.js，各自標了修正日期與舊行為說明。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as sessionPost, onRequestGet as sessionGet } from "../functions/api/session.js";
import { onRequestPost as combatStart } from "../functions/api/combat/v2/start.js";
import { onRequestPost as combatTurn } from "../functions/api/combat/v2/turn.js";
import { onRequestPost as narratePost } from "../functions/api/narrate.js";
import { enemyFromTemplate } from "../content/combat/v2/encountersV2.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";
import { emptyCharacter } from "../core/schema.js";

const DRAFT = {
  concept: { name: "測試輪迴者", gender: "男" },
  attributes: { 力量: 3, 敏捷: 2, 耐力: 2, 智力: 1, 感知: 2, 意志: 2 },
  skills: { 格鬥: 3, 射擊: 0, 體魄: 1, 潛行: 0, 求生: 0, 偵察: 2, 技藝: 0, 醫療: 0, 秘識: 0, 交涉: 0 },
};

const req = (env, body) => ({ request: { json: async () => body }, env });
const getReq = (env, url) => ({ request: { url }, env });
const read = async (res) => ({ status: res.status, body: JSON.parse(await res.text()) });

async function newSession(env, extra = {}) {
  const res = await read(await sessionPost(req(env, { draft: DRAFT, ...extra })));
  assert.equal(res.body.ok, true);
  return res.body.session.id;
}

// ---------------------------------------------------------------------------
// 清單#1：重整頁面後戰鬥狀態要還原得回來
// ---------------------------------------------------------------------------

test("戰鬥中的存檔，GET /api/session 要告訴前端有仗在打(前端才知道要還原戰鬥畫面)", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const started = await read(await combatStart(req(env, { sessionId })));
  assert.equal(started.body.ok, true);

  const saved = await resolveSessionStore(env).get(sessionId);
  assert.equal(saved.combatV2.active, true, "存檔裡本來就有完整的戰鬥狀態");
  assert.ok(Array.isArray(saved.combatV2.order));
  assert.ok(saved.combatV2.participants.some((p) => p.side === "enemy"));

  // /api/session 只回一個旗標，完整戰鬥狀態走 /api/combat/v2/state 的白名單——
  // 在兩個地方各攤平一份，遲早有一份忘記過濾而漏出敵人的精確血量。
  const view = await read(await sessionGet(getReq(env, `https://x/api/session?id=${sessionId}`)));
  assert.equal(view.body.session.combat.active, true, "前端要看得出有仗在打");
  assert.equal(view.body.session.combat.enemy, undefined, "但不從這裡拿敵人資料");
  const { body } = await read(await sessionGet(getReq(env, `https://x/api/session?id=${sessionId}`)));
  assert.equal(body.session.log, undefined, "公開 session view 不得暴露完整 event log");
});

// ---------------------------------------------------------------------------
// 清單#5：打贏最終戰但結算失敗時，不可以靜音
// ---------------------------------------------------------------------------

test("最終戰結算失敗時，回應要帶出原因，不能讓玩家以為自己沒打贏", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const store = resolveSessionStore(env);
  const started = await read(await combatStart(req(env, { sessionId, seed: 9 })));
  assert.equal(started.body.ok, true, JSON.stringify(started.body));

  // 做一個「打贏了、但 scenarioFinaleNodeId 指向一個不存在的節點」的狀態，
  // 這正是會安靜地把 scenario 留在 null 的那條路。
  const session = await store.get(sessionId);
  session.scenario = { packId: "scenario.echo-institute-01", progress: { nodes: {} } };
  session.combatV2.scenarioFinaleNodeId = "不存在的節點";
  const enemy = session.combatV2.participants.find((p) => p.side === "enemy");
  enemy.hpState = { ...enemy.hpState, intact: 0, B: 0, L: 0, A: enemy.hpState.max, dead: true, unconscious: true };
  await store.put(session);

  const { body } = await read(await combatTurn(req(env, {
    sessionId,
    stateVersion: session.combatV2.stateVersion,
    requestId: "broken-finale",
    selectedActions: [{ actionId: "hunker_down" }],
  })));
  assert.equal(body.ok, true);
  assert.ok(body.scenario?.warnings?.length, "結算失敗必須帶出原因，不能靜靜地回 scenario:null");
  assert.match(body.scenario.warnings.join(), /最終戰/);
});

// ---------------------------------------------------------------------------
// 清單#8：敵人武器 key 打錯時要給看得懂的錯誤
// ---------------------------------------------------------------------------

test("敵人樣板的 weaponKey 不在型錄裡時，要指名問題並列出可用值", () => {
  assert.throws(
    () => enemyFromTemplate({
      name: "打錯字的Boss",
      attributes: { 力量: 3, 敏捷: 2, 耐力: 3, 智力: 1, 感知: 2, 意志: 2 },
      skills: { 格鬥: 2 },
      weaponKey: "shotgun",  // 型錄裡沒有
      size: 5,
    }),
    (err) => {
      assert.match(err.message, /打錯字的Boss/, "要指名是哪個敵人樣板");
      assert.match(err.message, /shotgun/, "要指名是哪個值");
      assert.match(err.message, /weapons\.js/, "要指名去哪個檔案改");
      assert.ok(!/Cannot read properties/.test(err.message), "不可以是原生的undefined錯誤");
      return true;
    }
  );
});

test("敵人樣板缺 attributes 時也要指名問題(推導不出生命值與先攻)", () => {
  assert.throws(
    () => enemyFromTemplate({ name: "沒有屬性的Boss", weaponKey: "unarmed" }),
    (err) => {
      assert.match(err.message, /沒有屬性的Boss/);
      assert.match(err.message, /attributes/);
      return true;
    }
  );
});

test("/api/combat/v2/start：角色/敵人資料壞掉時回400並說明，不是沒有內容的500", async () => {
  const env = {};
  const sessionId = await newSession(env);
  const store = resolveSessionStore(env);

  // enemyFromTemplate 會對壞資料丟錯這件事上面已經測過了；這裡要確認的是
  // **API層有沒有接住**——先前這裡沒有 try/catch，例外會直接冒出去變成一個
  // 沒有內容的500，前端只能顯示「連線失敗」，真正的原因不會出現在任何地方。
  const broken = await store.get(sessionId);
  broken.character.derived = null; // 推導先攻/生命值時會炸
  await store.put(broken);

  const { status, body } = await read(await combatStart(req(env, { sessionId })));
  assert.equal(status, 400, "應該是可讀的400，而不是讓例外冒出去變成500");
  assert.equal(body.ok, false);
  assert.match(body.error, /無法建立戰鬥/);
});

// ---------------------------------------------------------------------------
// 清單#10：/api/narrate 要跟 /api/turn 一樣接受前端覆寫、一樣擋半設定狀態
// ---------------------------------------------------------------------------

test("/api/narrate：選了供應商卻沒帶金鑰時要擋下，不可以偷偷改用伺服器的金鑰", async () => {
  let called = false;
  const env = { GEMINI_API_KEY: "伺服器自己的金鑰", NARRATE_ALLOW_SERVER_LLM: "true", AI: { run: async () => { called = true; return { response: "x" }; } } };
  const { status, body } = await read(
    await narratePost(req(env, {
      character: emptyCharacter("測試"),
      playerAction: "推開門",
      provider: "gemini",
      apiKey: "",
    }))
  );
  assert.equal(status, 400);
  assert.match(body.error, /API金鑰/);
  assert.equal(called, false);
});

test("/api/narrate：前端指定的供應商要真的生效(先前這個端點完全不看body裡的provider)", async () => {
  const captured = [];
  const env = {};
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    captured.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "敘事文字" } }] }),
      text: async () => "",
    };
  };
  try {
    const { body } = await read(
      await narratePost(req(env, {
        character: emptyCharacter("測試"),
        playerAction: "推開門",
        provider: "custom",
        apiKey: "my-key",
        baseUrl: "https://my-llm.example.com/v1",
        model: "my-model",
      }))
    );
    assert.equal(body.ok, true, `失敗：${body.error}`);
    assert.equal(body.model, "my-model");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(captured[0].url, "https://my-llm.example.com/v1/chat/completions");
});

test("/api/narrate：LLM失敗時要帶出 stage/httpStatus，跟 /api/turn 同一個形狀", async () => {
  const env = { NARRATE_ALLOW_SERVER_LLM: "true", AI: { run: async () => { throw new Error("模型被下架"); } } };
  const { status, body } = await read(
    await narratePost(req(env, { character: emptyCharacter("測試"), playerAction: "推開門" }))
  );
  assert.equal(status, 502);
  assert.equal(body.llmFailure.stage, "binding");
  assert.ok(body.checkResult, "敘事失敗不可以連帶掩蓋掉已經算好的判定結果");
});
