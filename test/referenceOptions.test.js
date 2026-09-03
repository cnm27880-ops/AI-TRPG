// AI 產生選項 / 引擎綁定與查驗的回歸測試。
//
// 這一組鎖住的是 2026-09-03 那次改動的核心分工（見 content/scenario/referenceAdapter.js
// 的 bindAiReferenceOptions 檔頭）：
//   AI 只提供 label／hint／approachId；
//   屬性、技能、難度、DC 與 reference 綁定一律由引擎從副本資料重建；
//   同一個 approach 連續失敗到上限就退出選單，選項才會真的隨局勢改變。
import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { getScenarioReference } from "../content/scenario/registry.js";
import {
  APPROACH_FAILURE_LIMIT,
  approachAttemptStats,
  bindAiReferenceOptions,
  buildReferenceOptionsSpec,
  createReferenceState,
  listSelectableApproaches,
} from "../content/scenario/referenceAdapter.js";

const REFERENCE_ID = "scenario.nostromo-01-v2";

function freshState() {
  const reference = getScenarioReference(REFERENCE_ID);
  return { reference, state: createReferenceState(reference) };
}

/** 在 actionHistory 裡補上 n 次針對同一個 approach 的失敗紀錄。 */
function withFailures(state, sceneId, approachId, times) {
  return {
    ...state,
    actionHistory: [
      ...(state.actionHistory ?? []),
      ...Array.from({ length: times }, () => ({ sceneId, approachId, outcomeTier: "失敗", resultKey: "失敗" })),
    ],
  };
}

test("approachAttemptStats 從 actionHistory 統計嘗試與失敗次數", () => {
  const { state } = freshState();
  const scene = state.currentSceneId;
  const withHistory = {
    ...state,
    actionHistory: [
      { sceneId: scene, approachId: "app_a", resultKey: "失敗" },
      { sceneId: scene, approachId: "app_a", resultKey: "成功" },
      { sceneId: scene, approachId: "app_b", resultKey: "大失敗" },
      { sceneId: "other_scene", approachId: "app_a", resultKey: "失敗" },
    ],
  };
  assert.deepEqual(approachAttemptStats(withHistory, scene, "app_a"), {
    attempts: 2,
    failures: 1,
    lastResultKey: "成功",
  });
  // 別的場景的紀錄不算進來：同一個 id 在不同事件裡是不同的處境。
  assert.equal(approachAttemptStats(withHistory, scene, "app_b").failures, 1);
  assert.deepEqual(approachAttemptStats(state, scene, "app_a"), { attempts: 0, failures: 0, lastResultKey: null });
});

test("連續失敗達上限的 approach 會被標成 exhausted，不再進入可綁定清單", () => {
  const { reference, state } = freshState();
  const first = listSelectableApproaches(reference, state);
  assert.ok(first.approaches.length > 0);
  const target = first.approaches[0];
  assert.equal(target.exhausted, false);

  const failed = withFailures(state, first.scene.id, target.id, APPROACH_FAILURE_LIMIT);
  const after = listSelectableApproaches(reference, failed);
  const sameApproach = after.approaches.find((entry) => entry.id === target.id);
  assert.equal(sameApproach.failures, APPROACH_FAILURE_LIMIT);
  assert.equal(sameApproach.exhausted, true);

  // 已經走不通的招綁不上：AI 就算指名它，也只會拿到一個沒有 reference 綁定的自由選項。
  const bound = bindAiReferenceOptions({
    reference,
    state: failed,
    aiOptions: [{ label: "再試一次同樣的做法", hint: "想看看會不會不一樣", approachId: target.id }],
    character: emptyCharacter("測試者"),
  });
  assert.equal(bound.length, 1);
  assert.equal(bound[0].reference, null);
  assert.equal(bound[0].source, "ai_free");
});

test("AI 只決定選項的文字，檢定參數一律由引擎從副本資料重建", () => {
  const { reference, state } = freshState();
  const { scene, approaches } = listSelectableApproaches(reference, state);
  const target = approaches.find((entry) => entry.requiresCheck) ?? approaches[0];

  const bound = bindAiReferenceOptions({
    reference,
    state,
    aiOptions: [{
      label: "AI 自己寫的一句行動",
      hint: "AI 自己寫的目的",
      approachId: target.id,
      // 以下三格是模型硬塞的，引擎必須全部忽略。
      attribute: "力量",
      skill: "格鬥",
      difficulty: "極難",
    }],
    character: emptyCharacter("測試者"),
  });

  assert.equal(bound.length, 1);
  const option = bound[0];
  assert.equal(option.label, "AI 自己寫的一句行動", "措辭由 AI 決定");
  assert.equal(option.hint, "AI 自己寫的目的");
  assert.deepEqual(option.reference, { sceneId: scene.id, approachId: target.id, phaseId: target.phaseId });
  assert.equal(option.source, "ai_reference");
  assert.equal(option.attribute, target.attribute, "屬性只能來自副本資料");
  assert.equal(option.skill, target.skill);
  assert.equal(option.difficulty, target.difficulty);
  assert.notEqual(option.attribute, "力量");
  assert.notEqual(option.difficulty, "極難");
});

test("幻覺 approachId 與重複綁定都降級成自由選項，換不到作者寫好的結果", () => {
  const { reference, state } = freshState();
  const { approaches } = listSelectableApproaches(reference, state);
  const target = approaches[0];

  const bound = bindAiReferenceOptions({
    reference,
    state,
    aiOptions: [
      { label: "第一個綁定", hint: "目的一", approachId: target.id },
      { label: "同一個 id 再綁一次", hint: "目的二", approachId: target.id },
      { label: "不存在的 id", hint: "目的三", approachId: "app_this_does_not_exist" },
      { label: "自創行動", hint: "目的四", approachId: null },
    ],
    character: emptyCharacter("測試者"),
  });

  assert.equal(bound.length, 4);
  assert.equal(bound[0].source, "ai_reference");
  assert.equal(bound.filter((option) => option.reference).length, 1, "同一個 approach 只能綁一次");
  assert.equal(bound.slice(1).every((option) => option.source === "ai_free" && option.reference === null), true);
});

test("同一句 label 出現兩次只留一個，空白 label 直接丟掉", () => {
  const { reference, state } = freshState();
  const bound = bindAiReferenceOptions({
    reference,
    state,
    aiOptions: [
      { label: "走過去看看", hint: "想確認情況", approachId: null },
      { label: "走過去看看", hint: "想確認情況", approachId: null },
      { label: "   ", hint: "空白", approachId: null },
    ],
    character: emptyCharacter("測試者"),
  });
  assert.equal(bound.length, 1);
});

test("選項規格會把可綁定的 id 與已走不通的 id 分開列給模型", () => {
  const { reference, state } = freshState();
  const { scene, approaches } = listSelectableApproaches(reference, state);
  const target = approaches[0];

  const cleanSpec = buildReferenceOptionsSpec(reference, state);
  assert.match(cleanSpec, /<Next_Options>/);
  assert.ok(cleanSpec.includes(target.id), "可綁定的 approach id 必須列給模型");
  assert.doesNotMatch(cleanSpec, /已經走不通/);

  const failed = withFailures(state, scene.id, target.id, APPROACH_FAILURE_LIMIT);
  const exhaustedSpec = buildReferenceOptionsSpec(reference, failed);
  assert.match(exhaustedSpec, /已經走不通、禁止再做成選項/);
  assert.ok(exhaustedSpec.includes(target.id));
});

// ---------------------------------------------------------------------------
// 端對端：AI 寫的選項文字真的會走到玩家手上，而且點下去仍然命中作者寫好的分支。
// ---------------------------------------------------------------------------
import { onRequestPost as createSession } from "../functions/api/session.js";
import { onRequestPost as playTurn } from "../functions/api/turn.js";

function apiRequest(body) {
  return new Request("https://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * 假的 Workers AI binding。每次被呼叫都回一份合法的 reference 回合 JSON，
 * 選項的第一格綁到 nextApproachId（由測試決定），其餘留給模型自創。
 */
function makeEnv(nextApproachId) {
  const calls = [];
  return {
    calls,
    AI: {
      run: async (_model, payload) => {
        calls.push(payload);
        return {
          response: JSON.stringify({
            st_thought: "測試用盤算",
            narration: `模型依既定事實重寫的第 ${calls.length} 段敘事。`,
            options: [
              { label: "假裝接受檢疫、退到門邊", hint: "想換一個角度重來", approachId: nextApproachId },
              { label: "臨場想出來的新做法", hint: "想試點沒人試過的", approachId: null },
            ],
          }),
        };
      },
    },
  };
}

test("AI 寫的選項文字會送到玩家手上，綁定的那一個仍然指向作者寫好的分支", async () => {
  const reference = getScenarioReference(REFERENCE_ID);
  const openingScene = createReferenceState(reference).currentSceneId;
  const { approaches } = listSelectableApproaches(reference, createReferenceState(reference));
  // 玩家按第一個選項，模型綁第二個——第一個用掉之後會因為旗標而退出清單，
  // 用它當綁定目標只會測到「已經不能綁」這件事，不是這一題要驗的東西。
  const target = approaches[1];
  const env = makeEnv(target.id);

  const created = await (await createSession({
    request: apiRequest({ character: emptyCharacter("選項測試者"), scenarioId: REFERENCE_ID }),
    env,
  })).json();
  assert.equal(created.ok, true);
  const sessionId = created.session.id;

  // 固定開場仍然不呼叫模型，選項由引擎自建。
  const opening = await (await playTurn({ request: apiRequest({ sessionId }), env })).json();
  assert.equal(opening.ok, true);
  assert.equal(env.calls.length, 0);

  // 玩家按下第一個選項 -> 引擎裁定 -> 模型改寫敘事並寫出下一批選項。
  const next = await (await playTurn({
    request: apiRequest({ sessionId, chosenOption: opening.options[0] }),
    env,
  })).json();
  assert.equal(next.ok, true, JSON.stringify(next));
  assert.equal(env.calls.length, 1, "canonical 事實要交給模型改寫");

  const aiLabelled = next.options.find((option) => option.label === "假裝接受檢疫、退到門邊");
  assert.ok(aiLabelled, `AI 寫的 label 必須原樣送到玩家手上：${JSON.stringify(next.options)}`);
  assert.equal(aiLabelled.source, "ai_reference");
  assert.equal(aiLabelled.reference.approachId, target.id);
  assert.equal(aiLabelled.reference.sceneId, openingScene);
  // 綁定選項的檢定參數只能來自副本資料。
  assert.equal(aiLabelled.attribute, target.attribute);
  assert.equal(aiLabelled.difficulty, target.difficulty);

  const improvised = next.options.find((option) => option.label === "臨場想出來的新做法");
  assert.ok(improvised);
  assert.equal(improvised.source, "ai_free");
  assert.equal(improvised.reference, null);
});

// ---------------------------------------------------------------------------
// 敘事安全網的保底模板：連著掉進來也不該逐字相同。
// ---------------------------------------------------------------------------
import { buildEngineSafeNarration } from "../content/scenario/freeActionContract.js";

test("保底敘事會依回合輪替句式，連續兩回合不會逐字相同", () => {
  const base = {
    inputKind: "unmatched_attempt",
    actionText: "撬開卡死的檢修門",
    threat: { stageSummary: "威脅還不知道你在哪裡" },
  };
  const a = buildEngineSafeNarration({ ...base, turnNumber: 4 });
  const b = buildEngineSafeNarration({ ...base, turnNumber: 5 });
  assert.notEqual(a, b, "同一個行動在下一回合再失敗一次，不可以印出一模一樣的三段話");

  const talkA = buildEngineSafeNarration({ ...base, inputKind: "free_action", turnNumber: 1 });
  const talkB = buildEngineSafeNarration({ ...base, inputKind: "free_action", turnNumber: 2 });
  assert.notEqual(talkA, talkB);
  // 保底模板一律不得洩漏後端詞彙（這條在 2026-09-03 之前踩過一次）。
  for (const text of [a, b, talkA, talkB]) {
    assert.doesNotMatch(text, /引擎|判定分級|outcomeTier|自動失敗/);
  }
});
