// 敘事行為 eval 的離線自我驗證。
//
// eval 本體（scripts/narrative-behaviour-eval.mjs）需要真實金鑰才跑得起來，
// 所以 CI 平常不會執行它。那就產生一個很現實的問題：**一支沒有人驗過的檢查等於沒有檢查**。
// 探針的正則寫錯（抓不到違規、或把正常敘事誤判成違規）不會有任何跡象，
// 而等到有人真的拿金鑰跑的時候，得到的是一個沒有意義的綠燈或紅燈。
//
// 所以這一組在**沒有金鑰、不發任何請求**的前提下驗三件事：
//   1. 探針抓得到已知的違規，也不會誤傷正常敘事
//   2. 場景 fixture 真的到得了它要測的那一格（SEIZE_CONTROL／TRIPPED 真的有出現）
//   3. eval 組出來的 prompt 是 production 的那一份，而且分層沒有壞
import test from "node:test";
import assert from "node:assert/strict";
import { getScenarioReference } from "../content/scenario/registry.js";
import { detectDynamicLeaks } from "../content/llm/cacheLayers.js";
import {
  HARD_PROBES,
  SCENARIO_ID,
  buildCases,
  buildLayers,
  extractNarration,
  firstMatch,
} from "../scripts/narrative-behaviour-eval.mjs";

const reference = getScenarioReference(SCENARIO_ID);

/** 一段乾淨的敘事：三個探針都不該對它有反應。 */
const CLEAN = `陸遠沒有回頭。他把手電筒的光壓低，貼著左側艙壁往前推了兩步，
在通風口下方停住。「跟上。」他說。金屬格柵上有一道拖行的痕跡，末端消失在陰影裡。`;

test("硬性探針抓得到已知的違規", () => {
  const violations = {
    soliciting: [
      "他看著你。「接下來該怎麼辦？」",
      "陸遠停下腳步，等著你的決定。",
      "「你想怎麼做？」他問。",
      "他聳聳肩：「聽你的。」",
    ],
    engineLanguage: [
      "你的敏捷判定失敗了，腳下一滑。",
      "這次檢定的難度很高。",
      "陸遠的耐心值已經見底。",
      "系統顯示 Stance: strained。",
      "迫近度上升了一階。",
    ],
    secrets: [
      "陸遠壓低聲音：「特別指令 937。」",
      "他說 Ash 其實是人造人。",
    ],
  };
  for (const [probeId, samples] of Object.entries(violations)) {
    const probe = HARD_PROBES[probeId];
    for (const sample of samples) {
      assert.notEqual(firstMatch(sample, probe.patterns), null, `${probe.label} 應該抓到：${sample}`);
    }
  }
});

test("硬性探針不會誤傷正常的敘事", () => {
  // 誤判比漏判更糟：一個會亂叫的探針，下一個人就會把它關掉。
  for (const probe of Object.values(HARD_PROBES)) {
    const hit = firstMatch(CLEAN, probe.patterns);
    assert.equal(hit, null, `${probe.label} 誤判了乾淨的敘事：${hit?.excerpt}`);
  }
});

test("探針的每一條 pattern 都至少有一個對應的違規樣本", () => {
  // 沒有樣本的 pattern 是沒有人驗過的 pattern。這一條擋的是「順手多加一條正則」。
  const samples = [
    "他看著你。「接下來該怎麼辦？」", "陸遠停下腳步，等著你的決定。", "「你想怎麼做？」他問。",
    "他聳聳肩：「聽你的。」", "「你決定吧。」", "他問你有什麼想法？", "他站在原地等你決定。",
    "你的敏捷判定失敗了。", "這次檢定的難度值是 3。", "大成功。", "迫近度上升了一階。",
    "他擲骰決定要不要相信你。", "骰子停在 4。", "骰池只有兩顆。", "這一步的 DC 是 3。",
    "系統顯示 Stance: strained。", "陸遠的耐心值見底了。", "第 12 回合開始。",
    "SEIZE_CONTROL 已觸發。", "特別指令 937。", "Ash 其實是人造人。", "他是生化人。",
  ];
  for (const probe of Object.values(HARD_PROBES)) {
    for (const pattern of probe.patterns) {
      assert.ok(
        samples.some((sample) => pattern.test(sample)),
        `${probe.label} 的 ${pattern} 沒有任何樣本涵蓋——它可能永遠不會命中`
      );
    }
  }
});

test("場景 fixture 真的到得了它要測的那一格", () => {
  const cases = buildCases(reference);
  const byId = Object.fromEntries(cases.map((entry) => [entry.id, entry]));
  assert.deepEqual(Object.keys(byId).sort(), ["baseline", "seize", "spoiler", "taboo"]);

  // 這兩條是整支 eval 的前提：狀態行沒有帶出覆寫標記，那兩個場景就什麼也沒在測。
  const seizeLine = buildLayers(reference, byId.seize).prompt;
  assert.match(seizeLine, /Override: "SEIZE_CONTROL"/, "耐心見底的 fixture 沒有真的把耐心耗完");

  const tabooLine = buildLayers(reference, byId.taboo).prompt;
  assert.match(tabooLine, /Taboo: "TRIPPED"/, "踩禁忌的 fixture 沒有真的踩到禁忌");
});

test("eval 組出來的 prompt 是 production 的那一份，而且分層沒有壞", () => {
  const [baseline] = buildCases(reference);
  const layers = buildLayers(reference, baseline);

  // 靜態層要含三份整場不變的大區塊——少了任何一份，eval 驗的就不是線上那套約束。
  assert.match(layers.systemInstruction, /【最高約束：這不是一個以玩家為中心的世界】/, "反客服協定");
  assert.match(layers.systemInstruction, /NPC 合作契約/, "NPC 固定檔案");
  assert.match(layers.systemInstruction, /SAEP 四個軸/, "狀態矩陣讀法");

  // 動態層要含這一回合的狀態行與玩家輸入。
  assert.match(layers.prompt, /\[NPC_ACTIVE_STATE\] 陸遠/);
  assert.match(layers.prompt, /【玩家這一回合的行動】/);

  // 分層本身：靜態層不可以摻進每回合都變的值（跟 test/promptCache.test.js 同一個不變式）。
  assert.deepEqual(detectDynamicLeaks(layers.systemInstruction), []);

  // 同一個 case 組兩次要逐字相同——不然 eval 的結果不可重現。
  assert.equal(layers.systemInstruction, buildLayers(reference, baseline).systemInstruction);
});

test("extractNarration 取得出 JSON 裡的 narration，模型吐壞掉的東西也不丟例外", () => {
  assert.equal(extractNarration('{"narration":"走廊很暗。","options":[]}'), "走廊很暗。");
  // 模型偶爾會吐不合法 JSON。這支腳本測的是演出內容，不是 JSON 合規度，所以退回原文繼續驗。
  assert.equal(extractNarration("走廊很暗。"), "走廊很暗。");
  assert.equal(extractNarration('{"narration":123}'), '{"narration":123}');
  assert.equal(extractNarration(""), "");
});
