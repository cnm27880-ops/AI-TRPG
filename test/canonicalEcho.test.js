// canonical 原文回響率與「重播加強指令」的回歸測試。
//
// 這一組守的是三個症狀裡的第一個：「不斷跑出跟當下選項很不協調的舊式固定文字」。
//
// 成因不是模型不聽話，是設計：narrativeSource.outcomes 是一份 131 段的完稿散文
// （中位數 96 字、最長 1762 字），整段以「素材」身分進 prompt。把完稿散文交給模型
// 再叫它別照抄，模型會照抄；而同一個 approach＋同一個結果分級永遠對應同一段文字，
// 所以第二次撞到就是逐字重播。
//
// 這裡測的不是「模型有沒有照抄」（那需要真的模型，且不可重現），
// 而是兩件可以 deterministic 驗證的事：
//   1. 量尺本身正確——照抄會量到高分、重寫會量到低分；
//   2. 玩家重複遇到同一個結果時，提示裡真的有加上換寫法的要求。
import test from "node:test";
import assert from "node:assert/strict";
import { getScenarioReference } from "../content/scenario/registry.js";
import {
  applyReferenceResult,
  buildReferencePromptBlock,
  canonicalEchoRatio,
  createReferenceState,
  listSelectableApproaches,
  resolveReferenceAction,
} from "../content/scenario/referenceAdapter.js";

test("canonicalEchoRatio：整段照抄量到 1，完全重寫量到 0", () => {
  const canonical = "門板紋絲不動，你的肩膀撞在滑軌上。撞擊聲沿著金屬艙壁傳開。";
  assert.equal(canonicalEchoRatio(canonical, canonical).ratio, 1, "逐字照抄應該是 1");

  const rewritten = "他整個人壓上去，那扇門卻連晃都沒晃一下；金屬的回聲在走道裡散開很久才停。";
  const echo = canonicalEchoRatio(rewritten, canonical);
  assert.ok(echo.ratio < 0.5, `換句話說的敘事回響率應該偏低，實測 ${echo.ratio}`);
});

test("canonicalEchoRatio：只搬走一半的句子就量到一半", () => {
  const canonical = "門板紋絲不動，你的肩膀撞在滑軌上。走廊盡頭傳來一聲濕潤的拖行聲。";
  const half = "門板紋絲不動，你的肩膀撞在滑軌上。你屏住呼吸，什麼都不敢動。";
  const echo = canonicalEchoRatio(half, canonical);
  assert.equal(echo.total, 2);
  assert.equal(echo.echoed, 1, "應該只認出一句被搬走");
  assert.equal(echo.ratio, 0.5);
});

test("canonicalEchoRatio：原文或敘事是空的時候回 0，不丟錯", () => {
  assert.deepEqual(canonicalEchoRatio("隨便寫點什麼。", ""), { ratio: 0, echoed: 0, total: 0 });
  assert.equal(canonicalEchoRatio("", "門板紋絲不動。").ratio, 0);
});

/** 打一次判定並回傳 { resolution, applied }。 */
function play(reference, state, approachId, outcomeTier) {
  const { scene, approaches } = listSelectableApproaches(reference, state);
  const pick = approaches.find((entry) => entry.id === approachId);
  assert.ok(pick, `找不到 approach ${approachId}`);
  const resolution = resolveReferenceAction({
    reference,
    state,
    chosenOption: { reference: { sceneId: scene.id, approachId: pick.id, phaseId: pick.phaseId } },
    character: null,
  });
  assert.ok(resolution.matched, resolution.error ?? "");
  const applied = applyReferenceResult({ reference, state, resolution, outcomeTier, turnNumber: 1 });
  assert.ok(applied.applied, applied.error ?? "");
  return { resolution, applied };
}

test("第一次遇到某個結果時，提示不會叫模型「換個寫法」", () => {
  const reference = getScenarioReference("scenario.nostromo-01-v2");
  const state = createReferenceState(reference);
  const { approaches } = listSelectableApproaches(reference, state);
  const check = approaches.find((entry) => entry.requiresCheck);
  assert.ok(check);

  const { resolution, applied } = play(reference, state, check.id, "失敗");
  const block = buildReferencePromptBlock({
    reference, state, resolution, applied, actionText: "", outcomeTier: "失敗", turnNumber: 1,
  });
  assert.equal(/已經讀過 \d+ 次/.test(block), false, "第一次不該出現重播警告");
});

test("玩家重複讀到同一個結果時，提示會要求換鏡頭換句式", () => {
  const reference = getScenarioReference("scenario.nostromo-01-v2");
  const base = createReferenceState(reference);
  const { scene, approaches } = listSelectableApproaches(reference, base);
  const check = approaches.find((entry) => entry.requiresCheck);
  assert.ok(check);

  // 模擬「這個場景＋這個方法＋這個結果分級」已經演過一次。
  const replayed = {
    ...base,
    actionHistory: [
      { sceneId: scene.id, approachId: check.id, outcomeTier: "失敗", resultKey: "失敗" },
    ],
  };
  const { resolution, applied } = play(reference, replayed, check.id, "失敗");
  const block = buildReferencePromptBlock({
    reference, state: replayed, resolution, applied, actionText: "", outcomeTier: "失敗", turnNumber: 2,
  });
  assert.match(block, /已經讀過 1 次/, "重播次數要明講，模型才知道這不是第一次");
  assert.match(block, /換鏡頭/, "必須要求換寫法，而不是只通知它重複了");
});

test("原文很長時，提示會特別警告那是事實清單不是成品", () => {
  const reference = getScenarioReference("scenario.nostromo-01-v2");
  const state = createReferenceState(reference);
  const { scene } = listSelectableApproaches(reference, state);

  // 直接組一個超過門檻的假 applied，不依賴某一筆副本資料剛好夠長
  // （那種測試會在作者潤稿之後莫名其妙變紅）。
  const longText = "他伸手去摸索格柵邊緣，誤判了痕跡的新鮮程度。".repeat(8);
  const resolution = {
    matched: true,
    scene,
    approach: { id: "app_fake", label: "測試用", intent: "測試" },
    phaseId: null,
  };
  const applied = {
    applied: true,
    resultKey: "失敗",
    resultText: longText,
    effectSummary: {},
    flagsAdded: [],
  };
  const block = buildReferencePromptBlock({
    reference, state, resolution, applied, actionText: "", outcomeTier: "失敗", turnNumber: 1,
  });
  assert.match(block, new RegExp(`上面那段原文有 ${longText.length} 字`));
  assert.match(block, /事實清單/);
});
