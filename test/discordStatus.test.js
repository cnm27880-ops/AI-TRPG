// Discord bot `/status` 指令的後端支援 —— 純函式的資料整理（statusView）與
// 伺服器對伺服器的身分驗證（botAuth）。
//
// 這兩塊各自的重點不一樣：
//   - statusView：整理出來的形狀對不對（六維屬性、血統/改造互斥只挑一件、
//     支線正確攤成面額、沒結算過的副本不能生出評價）。
//   - botAuth：密鑰比對這條防線本身（沒設定、密鑰不符、長度不同都要擋下）。
import test from "node:test";
import assert from "node:assert/strict";
import { buildDiscordStatusView } from "../content/discord/statusView.js";
import { isBotApiConfigured, verifyBotSecret } from "../content/discord/botAuth.js";
import { createSession } from "../content/storage/sessionStore.js";
import { emptyCharacter } from "../core/schema.js";
import { applyDamage, createHpState } from "../core/health.js";

function baseSession(overrides = {}) {
  const character = emptyCharacter("測試輪迴者");
  return createSession({ id: "s1", character, ...overrides });
}

// ---------------------------------------------------------------------------
// buildDiscordStatusView
// ---------------------------------------------------------------------------

test("buildDiscordStatusView：活著的新角色，六維屬性照character.attributes原樣帶出", () => {
  const session = baseSession();
  session.character.attributes = { 力量: 5, 敏捷: 4, 耐力: 3, 智力: 2, 感知: 6, 意志: 1 };
  const view = buildDiscordStatusView(session);

  assert.equal(view.name, "測試輪迴者");
  assert.equal(view.alive, true);
  assert.deepEqual(view.attributes, { 力量: 5, 敏捷: 4, 耐力: 3, 智力: 2, 感知: 6, 意志: 1 });
  assert.equal(view.template, null);
  assert.equal(view.evaluation, null);
  assert.deepEqual(view.wallet, { points: 0, tokens: {}, xp: 0 });
});

test("buildDiscordStatusView：沒有名字的角色回退成「未命名輪迴者」", () => {
  const session = baseSession();
  session.character.concept.name = "";
  assert.equal(buildDiscordStatusView(session).name, "未命名輪迴者");
});

test("buildDiscordStatusView：死掉的角色 alive 要是 false", () => {
  const session = baseSession();
  session.character.derived.hp = applyDamage(createHpState(session.character.derived.hp.max), 999, "A");
  const view = buildDiscordStatusView(session);
  assert.equal(view.alive, false);
  assert.equal(view.downState.dead, true);
});

test("buildDiscordStatusView：血統/改造這五類互斥，只挑得出身上那一件", () => {
  const session = baseSession();
  session.character.abilities = [
    { goodId: "g1", name: "格鬥好手", category: "技能", exclusiveGroup: null, rank: null },
    { goodId: "g2", name: "初級內力", category: "模板能力", exclusiveGroup: "血統", rank: "D" },
  ];
  const view = buildDiscordStatusView(session);
  assert.deepEqual(view.template, { name: "初級內力", rank: "D", category: "血統" });
});

test("buildDiscordStatusView：身上沒有血統/改造時template是null，不是undefined或空物件", () => {
  const session = baseSession();
  session.character.abilities = [
    { goodId: "g1", name: "格鬥好手", category: "技能", exclusiveGroup: null, rank: null },
  ];
  assert.equal(buildDiscordStatusView(session).template, null);
});

test("buildDiscordStatusView：支線正確攤成面額顯示，不是原始D當量整數", () => {
  const session = baseSession();
  session.wallet = { points: 250, xp: 40, tokens: { D: 5 }, spentLedger: {} };
  const view = buildDiscordStatusView(session);
  // 5D = 1C(3D) + 2D，見 content/shop/wallet.js 的 normalizeTokens()
  assert.deepEqual(view.wallet, { points: 250, xp: 40, tokens: { C: 1, D: 2 } });
});

test("buildDiscordStatusView：副本還沒結算過時evaluation是null，不能無中生有評價", () => {
  const session = baseSession();
  session.scenario = { packId: "demo", progress: { nodes: {} } };
  assert.equal(buildDiscordStatusView(session).evaluation, null);
});

test("buildDiscordStatusView：副本結算過後，只挑出grade/label/summary給玩家看", () => {
  const session = baseSession();
  session.scenario = {
    packId: "demo",
    progress: {
      runSummary: {
        evaluation: { grade: "A", label: "高品質生還", summary: "說明文字", qualityScore: 150, overallScore: 160 },
      },
    },
  };
  const view = buildDiscordStatusView(session);
  assert.deepEqual(view.evaluation, { grade: "A", label: "高品質生還", summary: "說明文字" });
  assert.equal(view.scenarioId, "demo");
});

// ---------------------------------------------------------------------------
// botAuth —— 密鑰比對這條防線
// ---------------------------------------------------------------------------

test("isBotApiConfigured：沒設定BOT_API_SECRET就是false", () => {
  assert.equal(isBotApiConfigured({}), false);
  assert.equal(isBotApiConfigured({ BOT_API_SECRET: "" }), false);
  assert.equal(isBotApiConfigured({ BOT_API_SECRET: "s3cr3t" }), true);
});

test("verifyBotSecret：密鑰相符才通過", () => {
  const env = { BOT_API_SECRET: "correct-secret-value" };
  assert.equal(verifyBotSecret("correct-secret-value", env), true);
  assert.equal(verifyBotSecret("wrong-secret-value!!", env), false);
});

test("verifyBotSecret：沒設定BOT_API_SECRET時一律擋下，不能因為忘記設定就對任何人開放", () => {
  assert.equal(verifyBotSecret("anything", {}), false);
  assert.equal(verifyBotSecret("anything", { BOT_API_SECRET: "" }), false);
});

test("verifyBotSecret：垃圾輸入不能讓程式崩潰", () => {
  const env = { BOT_API_SECRET: "correct-secret-value" };
  assert.equal(verifyBotSecret(null, env), false);
  assert.equal(verifyBotSecret(undefined, env), false);
  assert.equal(verifyBotSecret(123, env), false);
  assert.equal(verifyBotSecret("", env), false);
});

test("verifyBotSecret：長度不同的字串要擋下，不能因為提早return就洩漏內容比對到哪", () => {
  const env = { BOT_API_SECRET: "a-fairly-long-secret-value" };
  assert.equal(verifyBotSecret("short", env), false);
  assert.equal(verifyBotSecret("a-fairly-long-secret-value-but-longer", env), false);
});
