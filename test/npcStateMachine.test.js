// NPC 動態狀態機（S.A.E.P. + CRPG 狀態標籤）的回歸測試。
//
// 這一組釘住的是三件會靜靜壞掉、但不會讓遊戲當掉的事：
//   1. 數值真的會動，而且是往「引擎知道的事實」指的方向動（耐心不是裝飾）。
//   2. 送進 prompt 的那一行**只含引擎算得出來的東西**——特別是不可以出現
//      「HP 80%」這種引擎從來沒記過的數字（AGENTS.md 不可協商規則第 1 條）。
//   3. legend（靜態）跟數值（動態）永遠分開。合併成一段是最容易犯、也最貴的錯，
//      而且合併之後所有功能測試照樣綠。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import reference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import {
  createReferenceState,
  normalizeReferenceState,
  referenceStateForResponse,
} from "../content/scenario/referenceAdapter.js";
import { applyNpcCooperationForAction } from "../content/scenario/npcCooperationPolicy.js";
import {
  SAEP_AXIS_IDS,
  NPC_STATE_LEGEND,
  applyNpcRuntimeTurn,
  buildNpcActiveStateBlock,
  createNpcRuntimeState,
  normalizeNpcRuntimeState,
  npcProfile,
  patienceLabel,
} from "../content/scenario/npcStateMachine.js";
import { ANTI_ASSISTANT_PROTOCOL, buildStylePrompt } from "../content/narrativeStyle.js";

const LUYUAN_SCENE = "evt_deck_a_recon";
const LUYUAN = "npc_luyuan";

function onStage() {
  return { ...createReferenceState(reference), currentSceneId: LUYUAN_SCENE };
}

/** 跑一回合：預設是「有目標、沒命中 canonical、局勢沒推進」的中性回合。 */
function step(state, turnNumber, actionText, signals = {}) {
  return applyNpcRuntimeTurn({
    reference,
    state,
    turnNumber,
    signals: {
      actionText,
      requiresCheck: true,
      outcomeTier: null,
      matched: false,
      sceneTurnCount: turnNumber,
      stalledRounds: 0,
      newClues: [],
      ...signals,
    },
  });
}

function pat(state) {
  return state.npcRuntime[LUYUAN].PAT;
}

test("開新局時每個 reference NPC 都拿到自己的 S.A.E.P. 基線", () => {
  const state = createReferenceState(reference);
  const runtime = state.npcRuntime;
  for (const npc of reference.npcs) {
    assert.ok(runtime[npc.id], `${npc.id} 應該有 runtime 狀態`);
    for (const axis of SAEP_AXIS_IDS) {
      const value = runtime[npc.id][axis];
      assert.equal(Number.isInteger(value), true, `${npc.id}.${axis} 應該是整數`);
      assert.ok(value >= 0 && value <= 10, `${npc.id}.${axis} 應該落在 0-10`);
    }
  }
  // 陸遠是資深輪迴者：主導權高、話少。這兩個是他跟其他 NPC 的分界，不是隨手填的。
  assert.ok(runtime[LUYUAN].ACT >= 8);
  assert.ok(runtime[LUYUAN].SOC <= 4);
});

test("舊存檔沒有 npcRuntime 也能開起來，已存的數值不會被重置回基線", () => {
  const fresh = createReferenceState(reference);
  const legacy = normalizeReferenceState(reference, { ...fresh, npcRuntime: undefined });
  assert.equal(legacy.npcRuntime[LUYUAN].PAT, npcProfile(reference, LUYUAN).saep.PAT);

  const carried = normalizeNpcRuntimeState(reference, { [LUYUAN]: { PAT: 2, SOC: 1 } });
  assert.equal(carried[LUYUAN].PAT, 2);
  assert.equal(carried[LUYUAN].SOC, 1);
  // 沒存到的軸退回基線，而不是變成 undefined 然後在 prompt 裡印出 NaN。
  assert.equal(carried[LUYUAN].ACT, npcProfile(reference, LUYUAN).saep.ACT);

  // 壞掉的存檔值（字串、超出範圍）要被夾回合法區間，不可以原樣送進 prompt。
  const dirty = normalizeNpcRuntimeState(reference, { [LUYUAN]: { PAT: "九", SOC: 99, EGO: -4 } });
  assert.equal(dirty[LUYUAN].PAT, npcProfile(reference, LUYUAN).saep.PAT);
  assert.equal(dirty[LUYUAN].SOC, 10);
  assert.equal(dirty[LUYUAN].EGO, 0);
});

test("連續的無目標行動會扣耐心，局勢推進會把它拉回基線但不超過", () => {
  const baseline = npcProfile(reference, LUYUAN).saep.PAT;
  let state = onStage();

  state = step(state, 1, "我很害怕", { requiresCheck: false });
  assert.equal(pat(state), baseline - 1, "一次沒有判定目標的演出扣 1 點");

  state = step(state, 2, "我抱頭蹲下", { requiresCheck: false });
  assert.ok(pat(state) < baseline - 1, "連著來會扣得更快");

  const dropped = pat(state);
  state = step(state, 3, "我來操作控制台", { matched: true });
  assert.ok(pat(state) > dropped, "局勢真的推進了，耐心要回得來");

  for (let turn = 4; turn < 12; turn += 1) {
    state = step(state, turn, "我來操作控制台", { matched: true, outcomeTier: "成功" });
  }
  assert.equal(pat(state), baseline, "回復上限鎖在基線：合作愉快不會讓沒耐心的人變聖人");
});

test("威脅陸遠會壓垮耐心並抬高利己主義，道歉之後不會一次回到初始值", () => {
  let state = onStage();
  const before = state.npcRuntime[LUYUAN];

  const threatened = applyNpcCooperationForAction({
    reference,
    state,
    actionText: "試著搶奪男人的手槍",
    sceneId: LUYUAN_SCENE,
    turnNumber: 1,
  });
  state = step(threatened.state, 1, "試著搶奪男人的手槍");
  const hostile = state.npcRuntime[LUYUAN];
  assert.ok(hostile.PAT <= before.PAT - 3, "被動手的那一回合耐心要崩");
  assert.ok(hostile.EGO > before.EGO, "進入自保姿態時利己主義上升");
  assert.ok(hostile.SOC < before.SOC, "被冒犯之後話會變少");

  const calmed = applyNpcCooperationForAction({
    reference,
    state,
    actionText: "我退後並道歉，表示我只是害怕",
    sceneId: LUYUAN_SCENE,
    turnNumber: 2,
  });
  state = step(calmed.state, 2, "我退後並道歉，表示我只是害怕");
  assert.ok(pat(state) > hostile.PAT, "道歉有效");
  assert.ok(pat(state) < before.PAT, "但一句道歉買不回全部的耐心");
});

test("耐心見底時發出 SEIZE_CONTROL，而且不會連續兩回合都奪權", () => {
  let state = onStage();
  let seizedTurn = null;
  // 一路空轉下去一定會有人搶走場面。跑到出現為止（上限只是防呆，正常三回合內就會觸發）。
  for (let turn = 1; turn <= 8 && seizedTurn === null; turn += 1) {
    state = step(state, turn, "我原地翻跟斗", { requiresCheck: false, stalledRounds: turn });
    if (/Override: "SEIZE_CONTROL"/.test(buildNpcActiveStateBlock(reference, state))) seizedTurn = turn;
  }
  assert.notEqual(seizedTurn, null, "玩家連續空轉，NPC 必須在幾回合內奪走主導權");
  assert.equal(state.npcRuntime[LUYUAN].seizedTurn, seizedTurn);

  // 奪權本身就是情緒的出口：吼完了、自己動手了，下一回合不該再打斷一次
  // （見 npcStateMachine.js 的 SEIZE_CONTROL_REBOUND）。
  state = step(state, seizedTurn + 1, "我還是站著不動", { requiresCheck: false, stalledRounds: 9 });
  assert.doesNotMatch(
    buildNpcActiveStateBlock(reference, state),
    /Override: "SEIZE_CONTROL"/,
    "連續回合都奪權會讓 NPC 從客服變成連環喝斥機器，一樣是壞掉的"
  );
});

test("踩到禁忌會在當回合標記 TRIPPED，下一回合就消失", () => {
  let state = onStage();
  state = step(state, 1, "把他推出去擋住異形");
  assert.match(buildNpcActiveStateBlock(reference, state), /Taboo: "[^"]*\(TRIPPED\)"/);

  state = step(state, 2, "我們一起往前走");
  assert.doesNotMatch(buildNpcActiveStateBlock(reference, state), /TRIPPED/);
});

test("不在場的 NPC 不跑狀態機，也不出現在狀態行裡", () => {
  let state = onStage();
  state = step(state, 1, "我原地發呆", { requiresCheck: false, stalledRounds: 5 });
  const block = buildNpcActiveStateBlock(reference, state);
  assert.match(block, /陸遠/);
  for (const absent of ["Ripley", "Parker", "Lambert", "Ash"]) {
    assert.doesNotMatch(block, new RegExp(absent), `${absent} 不在這個場景，不該每回合報一次心情`);
  }
  // 玩家在別的地方拖時間，不該讓沒看到的人也跟著不耐煩。
  assert.equal(state.npcRuntime.npc_ripley.PAT, npcProfile(reference, "npc_ripley").saep.PAT);
});

test("狀態行只送引擎知道的事實：不編 HP 百分比，也不洩漏內部欄位", () => {
  let state = onStage();
  state = step(state, 1, "你是誰？");
  const block = buildNpcActiveStateBlock(reference, state);

  assert.match(block, /^\[NPC_ACTIVE_STATE\] /);
  assert.match(block, /SAEP: \[\d+, \d+, \d+, \d+\((?:Calm|Steady|Impatient|Irritated|Breaking)\)\]/);
  // 引擎從來沒有替 NPC 記過血量。生一個百分比出來就是編造數值，而且模型會很樂意
  // 把它寫進敘事變成玩家看得到的假事實。
  assert.doesNotMatch(block, /HP|\d+%/);
  // 私下評估與內部狀態機欄位一律不出現。
  assert.doesNotMatch(block, /privateGoals|privateAssessment|withheldFacts|cooperationState|seizedTurn|stallStreak/);
});

test("Knowledge 是一份白名單：只列 reference 宣告的已知事項與這一路撿到的線索", () => {
  const declared = reference.npcs.find((npc) => npc.id === LUYUAN).knowledge;
  let state = onStage();
  state = step(state, 1, "你是誰？", { newClues: ["clue_vent_pattern"] });
  const block = buildNpcActiveStateBlock(reference, state);
  assert.match(block, new RegExp(declared[0]));
  assert.ok(state.npcRuntime[LUYUAN].learned.includes("clue_vent_pattern"));
  assert.match(NPC_STATE_LEGEND, /白名單/);
});

test("legend 是靜態的、狀態行是動態的：兩者不可以混在同一段", () => {
  let state = onStage();
  state = step(state, 1, "你是誰？");
  const block = buildNpcActiveStateBlock(reference, state);

  // legend 裡不能有任何這一回合才算得出來的數字，否則它一進 system message
  // 就會讓整段靜態前綴每回合失效（見 docs/PROMPT_CACHE_CONTRACT.md）。
  // legend 可以（也應該）提到 [NPC_ACTIVE_STATE] 這個標記名稱——那是靜態字串。
  // 不可以出現的是實際的數值行。
  assert.doesNotMatch(NPC_STATE_LEGEND, /SAEP: \[\d/);
  assert.doesNotMatch(NPC_STATE_LEGEND, /\(Irritated\)|\(Breaking\)/);
  // 反過來，狀態行不可以夾帶 legend 的說明文字——那是每回合重付一次的幾百字。
  assert.doesNotMatch(block, /社交意願|行動主導權|第四面牆/);

  // 同樣的狀態跑兩次要得到逐字相同的結果（前綴穩定性的前提）。
  assert.equal(block, buildNpcActiveStateBlock(reference, state));
});

test("反客服協定進了文筆層，並且把四條約束都寫進去", () => {
  const prompt = buildStylePrompt();
  assert.ok(prompt.includes(ANTI_ASSISTANT_PROTOCOL), "協定必須真的組進系統提示，不是只 export 出來");
  assert.match(ANTI_ASSISTANT_PROTOCOL, /不是一個以玩家為中心的世界/);
  assert.match(ANTI_ASSISTANT_PROTOCOL, /接下來該怎麼辦/);
  assert.match(ANTI_ASSISTANT_PROTOCOL, /SEIZE_CONTROL/);
  assert.match(ANTI_ASSISTANT_PROTOCOL, /第四面牆/);
  // 跟既有守則的分界必須寫在提示裡：拿走的是場面主導權，不是玩家角色的自主權。
  // 少了這一句，模型會在「NPC 要搶話」跟「不可以替玩家決定」之間二選一。
  assert.match(ANTI_ASSISTANT_PROTOCOL, /不可以寫玩家角色/);
});

test("patienceLabel 在整個 0-10 區間都有對應標籤，邊界不會掉出去", () => {
  const labels = new Set();
  for (let value = 0; value <= 10; value += 1) {
    const label = patienceLabel(value);
    assert.equal(typeof label, "string");
    assert.notEqual(label, "");
    labels.add(label);
  }
  assert.equal(labels.size, 5, "五級標籤都要用得到，否則就是有一級永遠不會出現");
  assert.equal(patienceLabel(0), "Breaking");
  assert.equal(patienceLabel(10), "Calm");
  // 壞資料不可以讓它丟例外——這條路徑在每一回合的 prompt 組裝上。
  assert.equal(typeof patienceLabel(undefined), "string");
});

test("createNpcRuntimeState 對沒有 npcs 的 reference 也回傳可用的空表", () => {
  assert.deepEqual(createNpcRuntimeState({}), {});
  assert.deepEqual(createNpcRuntimeState(null), {});
  assert.equal(buildNpcActiveStateBlock(null, null), "");
});

// 這一條用原始碼的形狀來釘，而不是跑一次完整回合：狀態行只在「reference 模式 + NPC 在場」
// 時才出現，要從 /api/turn 走到那個狀態得先打完好幾回合，測試會變得又慢又脆。
// 同樣的作法在 test/multiNpcPressure.test.js 已經有先例。
test("狀態矩陣被放在動態層的最頂端，排在 DM 備忘錄之前", () => {
  const source = readFileSync(new URL("../functions/api/turn.js", import.meta.url), "utf8");
  const start = source.indexOf("const dynamicBlocks = ");
  const end = source.indexOf("return buildLayeredRequest(");
  assert.ok(start !== -1 && end > start, "找不到 dynamicBlocks 的組裝區塊");
  const region = source.slice(start, end);

  const npcAt = region.indexOf("dynamicBlocks.push(npcActiveState)");
  const memoAt = region.indexOf("dynamicBlocks.push(dmMemo)");
  assert.ok(npcAt !== -1, "動態層必須包含 npcActiveState");
  assert.ok(memoAt !== -1, "動態層必須包含 dmMemo");
  // 順序不是美觀問題：模型讀提示有順序偏誤，把「他現在什麼心情」放在備忘錄、
  // 事件日誌與玩家輸入之後，等於要它讀完一整頁再回頭修正語氣。
  assert.ok(npcAt < memoAt, "狀態矩陣是這一回合演出的前提，必須排在最前面");

  // legend 是靜態的，必須待在 staticBlocks；混進動態層就是每回合重付一次幾百字。
  assert.doesNotMatch(region, /NPC_STATE_LEGEND/);
  const staticStart = source.indexOf("const staticBlocks = ");
  assert.ok(source.slice(staticStart, start).includes("NPC_STATE_LEGEND"), "legend 必須在靜態層");
});

test("npcRuntime 不會出現在送回瀏覽器的 reference 狀態裡", () => {
  let state = onStage();
  state = step(state, 1, "你是誰？");
  const response = referenceStateForResponse(reference, state);
  const serialized = JSON.stringify(response);

  // Knowledge／Agenda／Taboo 是 GM 資訊：Knowledge 是防劇透的白名單，
  // Taboo 洩漏出去等於把「怎麼惹毛他」印在玩家臉上。整個 npcRuntime 一律不出境。
  assert.equal("npcRuntime" in response, false);
  assert.doesNotMatch(serialized, /SAEP|seizedTurn|tabooTripped|stallStreak/);
  const luyuanTaboo = npcProfile(reference, LUYUAN).taboo;
  assert.doesNotMatch(serialized, new RegExp(luyuanTaboo.slice(0, 6)));
});
