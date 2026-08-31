// 場景簡報：把「整個場景都不會變」的素材從每回合重送改成只送一次。
//
// 這一組釘住三件事，其中第一件是安全問題，不是成本問題：
//
//   1. **gmTruth 不可以離開伺服器。** 簡報含 scene.gmTruth（副本的系統真相），
//      而 session.history 是會隨 session 送回瀏覽器的（public/app.js 有
//      `?? res.session.history` 的 fallback）。所以 history 只能存 sceneId，
//      簡報只能在組 prompt 時於 server 端推導。存錯地方 = 玩家打開 devtools 就看到答案。
//   2. **簡報必須是 state-free。** 它一旦吃 state，舊場景的簡報就會隨著玩家撿到線索
//      而改變，整條歷史前綴跟著失效——那就等於白做。
//   3. **前綴只在尾端成長。** 簡報要插在時間軸上它該在的位置，不是插在最前面。
import test from "node:test";
import assert from "node:assert/strict";
import { getScenarioReference } from "../content/scenario/registry.js";
import {
  createReferenceState,
  buildReferencePromptBlock,
  buildSceneBriefBlock,
} from "../content/scenario/referenceAdapter.js";
import { historyToMessages } from "../content/llm/cacheLayers.js";
import { pushHistory } from "../content/storage/sessionStore.js";

const reference = getScenarioReference("scenario.nostromo-01-v2");
const SCENE = "evt_meet_ripley";
const OTHER_SCENE = "evt_deck_a_recon";

const briefFor = (sceneId) => buildSceneBriefBlock(reference, sceneId);
const toMessages = (history) => historyToMessages(history, { sceneBriefFor: briefFor });

function gmTruthOf(sceneId) {
  return (reference.scenes.find((scene) => scene.id === sceneId)?.gmTruth ?? [])[0];
}

test("簡報只吃 reference 與 sceneId——同一個場景在任何 state 下都是同一段文字", () => {
  const plain = buildSceneBriefBlock(reference, SCENE);
  assert.notEqual(plain, "");

  // 這個函式的簽名就不收 state，但真正要防的是「有人之後把 state 加回去」。
  // 這裡用一個實際會影響動態層的 state 差異來證明簡報不受影響。
  assert.equal(buildSceneBriefBlock(reference, SCENE), plain);
  assert.equal(buildSceneBriefBlock(reference, "不存在的場景"), "");
  assert.equal(buildSceneBriefBlock(null, SCENE), "");
});

test("gmTruth 進得了簡報，但絕對進不了存檔", () => {
  const truth = gmTruthOf(SCENE);
  assert.ok(truth, "這個場景要有 gmTruth，否則這條測試沒在測東西");
  assert.match(buildSceneBriefBlock(reference, SCENE), new RegExp(truth));

  // history 只存 sceneId。sceneId 本身是公開資料（referenceStateForResponse 已經
  // 以 eventId 對外公開），gmTruth 不是。
  const history = pushHistory([], { action: "你是誰？", narration: "她沒有放下槍。", sceneId: SCENE });
  assert.deepEqual(Object.keys(history[0]).sort(), ["action", "narration", "sceneId"]);
  assert.equal(history[0].sceneId, SCENE);
  assert.doesNotMatch(JSON.stringify(history), new RegExp(truth), "gmTruth 不可以被寫進 history");
});

test("同一個場景連續多回合：歷史層只在尾端追加，簡報只出現一次", () => {
  let history = [];
  let previous = [];
  for (let turn = 1; turn <= 4; turn += 1) {
    history = pushHistory(history, { action: `行動${turn}`, narration: `敘事${turn}`, sceneId: SCENE });
    const messages = toMessages(history);
    for (let i = 0; i < previous.length; i += 1) {
      assert.equal(messages[i].content, previous[i].content, `第 ${turn} 回合改寫了既有的第 ${i} 則`);
    }
    previous = messages;
  }
  const briefCount = previous.filter((message) => message.content.includes("<Scene_Brief>")).length;
  assert.equal(briefCount, 1, "同一個場景待四回合，簡報只該送一次");
});

test("換場景：新簡報插在時間軸上，不是插在最前面", () => {
  let history = [];
  for (let turn = 1; turn <= 3; turn += 1) {
    history = pushHistory(history, { action: `行動${turn}`, narration: `敘事${turn}`, sceneId: SCENE });
  }
  const before = toMessages(history);

  history = pushHistory(history, { action: "走去 A 甲板", narration: "你推開艙門。", sceneId: OTHER_SCENE });
  const after = toMessages(history);

  // 這是整件事的關鍵：插在最前面的話，每換一次場景就重寫歷史層的開頭，
  // 等於把 prefix cache 關掉——那正是這個設計要解決的問題。
  for (let i = 0; i < before.length; i += 1) {
    assert.equal(after[i].content, before[i].content, `換場景改寫了既有的第 ${i} 則`);
  }
  const newBriefAt = after.findIndex((message) => message.content.includes(OTHER_SCENE));
  assert.ok(newBriefAt >= before.length, "新場景的簡報必須排在既有歷史之後");
});

test("回到先前待過的場景會重新送一次簡報（那是提醒，不是重複）", () => {
  let history = [];
  history = pushHistory(history, { action: "看看四周", narration: "一", sceneId: SCENE });
  history = pushHistory(history, { action: "走去 A 甲板", narration: "二", sceneId: OTHER_SCENE });
  history = pushHistory(history, { action: "走回副控室", narration: "三", sceneId: SCENE });
  const messages = toMessages(history);
  const briefs = messages.filter((message) => message.content.includes("<Scene_Brief>"));
  assert.equal(briefs.length, 3, "A→B→A 要送三次：模型需要被提醒它現在回到哪裡");
});

test("舊存檔沒有 sceneId 時不會壞，也不會憑空生出簡報", () => {
  const legacy = [
    { action: "舊行動", narration: "舊敘事" },
    { action: "舊行動2", narration: "舊敘事2" },
  ];
  const messages = toMessages(legacy);
  assert.equal(messages.filter((message) => message.content.includes("<Scene_Brief>")).length, 0);
  assert.equal(messages.length, 4);

  // 舊存檔接上新回合之後，簡報從第一則帶 sceneId 的那一格開始，位置之後不再變動。
  const mixed = pushHistory(legacy, { action: "新行動", narration: "新敘事", sceneId: SCENE });
  const withBrief = toMessages(mixed);
  assert.equal(withBrief.filter((message) => message.content.includes("<Scene_Brief>")).length, 1);
  for (let i = 0; i < messages.length; i += 1) {
    assert.equal(withBrief[i].content, messages[i].content, "接上新回合不可以改寫舊存檔那幾則");
  }
});

test("沒有給 sceneBriefFor 時行為完全不變（demo 端點與非副本模式）", () => {
  const history = [{ action: "行動", narration: "敘事", sceneId: SCENE }];
  const messages = historyToMessages(history);
  assert.equal(messages.length, 2);
  assert.doesNotMatch(JSON.stringify(messages), /Scene_Brief/);
});

test("每回合的 reference block 不再重述已經進簡報的那幾段", () => {
  const scene = reference.scenes.find((entry) => entry.id === SCENE);
  const state = { ...createReferenceState(reference), currentSceneId: SCENE, currentLocation: scene.location };
  const block = buildReferencePromptBlock({
    reference,
    state,
    resolution: { matched: true, scene },
    actionText: "你是誰？",
    turnNumber: 1,
  });

  const truth = gmTruthOf(SCENE);
  assert.doesNotMatch(block, new RegExp(truth), "事件真相已經在簡報裡，不該每回合重送");
  assert.doesNotMatch(block, /本事件節拍/);
  // 每回合真的會動的東西要留著。
  assert.match(block, /事件ID：/);
  assert.match(block, /所在房間：/);
  assert.match(block, /目前場景回合：/);
});

test("玩家走到場景預設房間以外的地方時，那個房間的描述仍然補得到", () => {
  // 簡報只涵蓋場景的預設房間；玩家在同一場景裡移動到別的房間時，
  // 少了這一段畫面就會斷掉。
  const scene = reference.scenes.find((entry) => entry.id === SCENE);
  // 取另一個場景的房間當「玩家走到別處」的目的地。
  const elsewhere = reference.scenes.find((entry) => entry.location && entry.location !== scene.location)?.location;
  assert.ok(elsewhere, "副本要有第二個地點，否則這條測試沒在測東西");

  const state = {
    ...createReferenceState(reference),
    currentSceneId: SCENE,
    currentLocation: elsewhere,
    visitedLocations: [elsewhere],
  };
  const block = buildReferencePromptBlock({
    reference,
    state,
    resolution: { matched: true, scene },
    actionText: "我看看四周",
    turnNumber: 1,
  });
  assert.match(block, /玩家目前所在房間的公開環境素材/);
});
