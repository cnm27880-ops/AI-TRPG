// 共用合作引擎的護欄與共用行為。
//
// 這一組存在的理由跟其他測試不一樣：它測的是**開不起來**。
//
// defineCooperationPolicy() 在載入時就驗人設，因為它擋的每一種錯都是「安靜的」：
// 一條規則漏宣告 kind，那種互動就會在耐心值計算裡被當成中性——症狀是
// 「這個 NPC 好像特別好脾氣」，不會有任何測試變紅，也不會有玩家回報。
// 護欄沒有測試就等於沒有護欄：哪天有人把 throw 改成 console.warn，一樣不會有東西變紅。
import test from "node:test";
import assert from "node:assert/strict";
import { defineCooperationPolicy, INTERACTION_KINDS, textOf } from "../content/scenario/npcCooperationEngine.js";

/** 一份最小但合法的人設；每個測試只把它弄壞一個地方。 */
function validPersona(overrides = {}) {
  return {
    npcId: "npc_test",
    name: "測試員",
    sourcePackId: "scenario.test",
    stance: "一個用來測試護欄的人。",
    autonomy: "什麼也不做。",
    saep: { SOC: 5, ACT: 5, EGO: 5, PAT: 5 },
    aliases: /測試員/,
    otherNpcTarget: /(?:問|找)\s*(?:別人)/,
    homeScenes: ["evt_test"],
    states: { initial: "unmet", order: ["unmet", "functional", "angry"], selfPreserving: ["angry"] },
    objectives: { unmet: "先看看你是誰", functional: "配合", angry: "不配合" },
    rules: [
      { interactionType: "survival_question", kind: "briefing", pattern: /[?？]/ },
      { interactionType: "coercive_pressure", kind: "hostile", pattern: /威脅/ },
    ],
    questionTopics: [{ topic: "identity", pattern: /你是誰/ }],
    defaultQuestionTopic: "identity",
    transitions: { survival_question: "functional", coercive_pressure: "angry" },
    ...overrides,
  };
}

test("合法的人設開得起來，而且四個軸與狀態表都掛得上", () => {
  const policy = defineCooperationPolicy(validPersona());
  assert.equal(policy.npcId, "npc_test");
  assert.equal(policy.createState().npc_test.state, "unmet");
  assert.deepEqual(INTERACTION_KINDS, ["briefing", "cooperation", "friction", "hostile", "deescalation"]);
});

test("缺少任何一個必要欄位就開不起來", () => {
  for (const key of ["npcId", "name", "sourcePackId", "aliases", "otherNpcTarget", "states", "objectives", "rules", "transitions", "saep"]) {
    const broken = validPersona();
    delete broken[key];
    assert.throws(
      () => defineCooperationPolicy(broken),
      new RegExp(`缺少必要欄位「${key}」`),
      `漏掉 ${key} 應該當場丟錯`
    );
  }
});

test("states.initial 不在 states.order 裡就開不起來", () => {
  // 這種錯的症狀是「這個 NPC 一開局就處在一個轉場表構不到的狀態」，
  // 玩起來像是他完全不理人。
  assert.throws(
    () => defineCooperationPolicy(validPersona({ states: { initial: "typo", order: ["unmet"], selfPreserving: [] } })),
    /states\.initial 不在 states\.order 裡/
  );
});

test("規則既沒有 pattern 也沒有 patterns 就開不起來", () => {
  assert.throws(
    () => defineCooperationPolicy(validPersona({
      rules: [{ interactionType: "survival_question", kind: "briefing" }],
    })),
    /既沒有 pattern 也沒有 patterns/
  );
});

test("規則的 kind 未宣告或拼錯就開不起來", () => {
  // 這是這組護欄裡最重要的一條：kind 是耐心值計算的唯一輸入
  // （見 npcStateMachine.js 的 PATIENCE_BY_KIND）。漏掉不會壞掉任何東西，
  // 只會讓這個角色永遠不會生氣。
  for (const kind of [undefined, "hostle", "HOSTILE", ""]) {
    assert.throws(
      () => defineCooperationPolicy(validPersona({
        rules: [{ interactionType: "coercive_pressure", kind, pattern: /威脅/ }],
      })),
      /宣告了未知的 kind/,
      `kind=${JSON.stringify(kind)} 應該被擋下來`
    );
  }
});

test("轉場指向未知狀態就開不起來——四種寫法都要檢查", () => {
  const cases = [
    ["字串目標", { survival_question: "typo", coercive_pressure: "angry" }],
    ["to", { survival_question: { to: "typo" }, coercive_pressure: "angry" }],
    ["escalateTo", { survival_question: "functional", coercive_pressure: { to: "angry", escalateFrom: ["angry"], escalateTo: "typo" } }],
    ["ladder", { survival_question: "functional", coercive_pressure: { ladder: ["angry", "typo"] } }],
    ["byTopic", { survival_question: { to: "functional", byTopic: { identity: "typo" } }, coercive_pressure: "angry" }],
  ];
  for (const [label, transitions] of cases) {
    assert.throws(
      () => defineCooperationPolicy(validPersona({ transitions })),
      /指向未知狀態/,
      `${label} 的錯字應該被擋下來`
    );
  }
});

test("轉場的 onlyFrom 含未知狀態就開不起來", () => {
  // onlyFrom 打錯字不會丟錯、只會讓那個轉場永遠不成立——
  // 症狀是「玩家做了對的事，NPC 卻毫無反應」。
  assert.throws(
    () => defineCooperationPolicy(validPersona({
      transitions: { survival_question: { to: "functional", onlyFrom: ["unmet", "typo"] }, coercive_pressure: "angry" },
    })),
    /onlyFrom 含未知狀態/
  );
});

test("有狀態沒有對應的 objective 就開不起來", () => {
  // 少一個 objective 的症狀是 prompt 裡出現空的 Agenda，模型會自己編一個。
  const broken = validPersona();
  delete broken.objectives.angry;
  assert.throws(() => defineCooperationPolicy(broken), /狀態「angry」沒有對應的 objective/);
});

test("每一個正式登記的人設都通過同一組護欄", async () => {
  // 上面那些是人造的壞人設；這一條確認真正上線的四個角色也乾淨。
  // defineCooperationPolicy 在模組載入時就跑，所以 import 得起來就代表通過了——
  // 這裡再明確斷言一次，免得有人把載入時的呼叫拿掉。
  const { NPC_PERSONAS } = await import("../content/scenario/npcPersonaRegistry.js");
  for (const persona of NPC_PERSONAS) {
    // Ash 只有人設、沒有 policy（他不合作，見登記處的說明），跳過。
    if (!persona.rules) continue;
    assert.doesNotThrow(() => defineCooperationPolicy(persona), persona.npcId);
  }
});

test("textOf 會裁掉超長輸入，也不會被 null 打爆", () => {
  // 這條路徑在每一回合的分類上，壞資料不可以讓它丟例外。
  assert.equal(textOf(null), "");
  assert.equal(textOf(undefined), "");
  assert.equal(textOf(12345), "12345");
  assert.equal(textOf("  前後空白  "), "前後空白");
  assert.equal(textOf("字".repeat(500)).length, 240);
});

test("完全不是人設的東西丟進來也是當場丟錯，不是靜默通過", () => {
  for (const junk of [null, undefined, {}, "persona"]) {
    assert.throws(() => defineCooperationPolicy(junk), /缺少必要欄位/, JSON.stringify(junk));
  }
});

test("沒有 reference 或 reference 沒宣告 knowledge 時，靜態契約仍然組得出來", async () => {
  // 這條路徑在新副本剛接上、npcs[] 還沒寫 knowledge 的時候會走到。
  const { buildNpcCooperationContract } = await import("../content/scenario/npcCooperationContract.js");
  for (const reference of [null, undefined, {}, { npcs: [] }, { npcs: [{ id: "npc_luyuan" }] }]) {
    const contract = buildNpcCooperationContract(reference);
    assert.match(contract, /NPC 合作契約/);
    assert.match(contract, /陸遠/, "人設本身不依賴 reference");
    // [2026-09-01] 斷言從裸片語收緊成「那一行的實際長相」。
    // 原因：共用規則現在會用「Knowledge 白名單基線」這個詞去**解釋**它是什麼意思，
    // 所以光比對片語會把說明文字也算成「印了一個空白名單」。
    // 每個 NPC 的那一行長成 `  Knowledge 白名單基線：…`（縮排 + 全形冒號），
    // 用冒號當判別字元，問的才是原本想問的問題：沒宣告時有沒有多印一行空的。
    assert.doesNotMatch(contract, /Knowledge 白名單基線：/, "沒宣告就不要印一個空的白名單");
    assert.doesNotMatch(contract, /已知事實（可直接陳述/, "沒宣告就不要印一個空的事實清單");
  }
});


import * as luyuanPersonaModule from "../content/scenario/npcCooperationPolicy.js";

// ---------------------------------------------------------------------------
// [2026-09-01 第 0.6 階段] 終局合作階段 → world flag 的投影
//
// 修的是一條接不起來的線：合作階段住在 state.npcCooperation，而 reference 的
// conditionalEffects 只吃 flags。後果很具體——玩家把陸遠惹到 abandoned、
// 他自行撤離之後，休眠結算的存活掃描照樣把他標成 survived，
// 結局仍然說「有人陪你離開」，而那個人明明早就走了。
// ---------------------------------------------------------------------------

test("終局階段會投影成 world flag，讓 reference 的 conditionalEffects 讀得到", async () => {
  const { applyNpcCooperationForAction } = await import("../content/scenario/npcCooperationPolicy.js");
  const reference = { sourcePackId: "scenario.nostromo-01-v2" };
  let state = { flags: ["flag_luyuan_met"], npcCooperation: {} };

  // 搶槍的三階威脅階梯：strained → self_preserving → abandoned。
  const stages = [];
  for (let turn = 1; turn <= 3; turn += 1) {
    const decision = applyNpcCooperationForAction({
      reference,
      state,
      actionText: "我伸手去搶他的槍",
      sceneId: "evt_deck_a_recon",
      turnNumber: turn,
    });
    assert.equal(decision.changed, true, `第 ${turn} 次越線應該推進階段`);
    state = decision.state;
    stages.push(state.npcCooperation.npc_luyuan.state);
  }
  assert.deepEqual(stages, ["strained", "self_preserving", "abandoned"]);

  // 只有走到終局那一階才寫旗標——中間兩階不寫，否則玩家一吵架就永久失去結局。
  assert.ok(state.flags.includes("flag_luyuan_abandoned"), "abandoned 要投影成世界事實");
  assert.equal(
    state.flags.filter((flag) => flag === "flag_luyuan_abandoned").length,
    1,
    "重複觸發不該把同一個旗標加第二次"
  );
});

test("還沒走到終局階段時，一個旗標都不寫", async () => {
  const { applyNpcCooperationForAction } = await import("../content/scenario/npcCooperationPolicy.js");
  const reference = { sourcePackId: "scenario.nostromo-01-v2" };
  const decision = applyNpcCooperationForAction({
    reference,
    state: { flags: ["flag_luyuan_met"], npcCooperation: {} },
    actionText: "我不信任你",
    sceneId: "evt_deck_a_recon",
    turnNumber: 1,
  });
  assert.equal(decision.state.npcCooperation.npc_luyuan.state, "strained");
  assert.deepEqual(decision.state.flags, ["flag_luyuan_met"], "strained 還回得來，不可以留下永久旗標");
});

test("沒有 flags 欄位的舊存檔不會被憑空長出一個空陣列", async () => {
  const { applyNpcCooperationForAction } = await import("../content/scenario/npcCooperationPolicy.js");
  const reference = { sourcePackId: "scenario.nostromo-01-v2" };
  const decision = applyNpcCooperationForAction({
    reference,
    state: { npcCooperation: {} },
    actionText: "我不信任你",
    sceneId: "evt_deck_a_recon",
    turnNumber: 1,
  });
  assert.equal("flags" in decision.state, false, "沒東西要加就不要碰這個欄位");
});

test("stateFlags 只能宣告終局階段，證不出來就當場開不起來", () => {
  const { LUYUAN_PERSONA } = luyuanPersonaModule;
  // strained 有降溫轉場回得來，旗標會變成過期的謊言。
  assert.throws(
    () => defineCooperationPolicy({
      ...LUYUAN_PERSONA,
      states: { ...LUYUAN_PERSONA.states, stateFlags: { strained: "flag_bad" } },
    }),
    /不是終局/
  );
  // 拼錯階段名同樣要當場炸掉，不是安靜地永遠不觸發。
  assert.throws(
    () => defineCooperationPolicy({
      ...LUYUAN_PERSONA,
      states: { ...LUYUAN_PERSONA.states, stateFlags: { nope: "flag_x" } },
    }),
    /不存在的階段/
  );
});
