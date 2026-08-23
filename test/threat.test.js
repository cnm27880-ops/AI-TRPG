// content/scenario/threat.js 的測試。
//
// 這個模組存在的理由是一句實際測玩回饋：「骰子成功和失敗造成的影響沒有什麼決定性差異」。
// 所以這裡測的重點不是「數字加減對不對」，而是**成功與失敗會不會走向不同的狀態**——
// 那才是那句回饋要的東西。數值本身是草案，改了要連這裡一起改（這正是這份測試的用途：
// 把「改數值」變成一個必須刻意為之的動作，而不是順手一改就沒人發現）。
import test from "node:test";
import assert from "node:assert/strict";
import { classifyOutcome } from "../core/narration.js";
import {
  THREAT_MAX,
  THREAT_AFTER_ENCOUNTER,
  THREAT_STAGES,
  OUTCOME_THREAT_DELTA,
  createThreatTrack,
  threatDeltaForOutcome,
  applyOutcomeToThreat,
  dischargeThreat,
  getThreatStage,
  buildThreatDirective,
  threatSummary,
  normalizeTrack,
} from "../content/scenario/threat.js";

test("成功會拉開距離、失敗會逼近：兩者一定走向不同的迫近度", () => {
  const start = createThreatTrack(3);
  const success = applyOutcomeToThreat(start, classifyOutcome({ margin: 2 }));
  const failure = applyOutcomeToThreat(start, classifyOutcome({ margin: -4 }));

  assert.ok(success.after < 3, "成功必須讓迫近度下降");
  assert.ok(failure.after > 3, "失敗必須讓迫近度上升");
  assert.notEqual(success.after, failure.after);
});

test("分級表的每一個分級都要有對應的迫近度增減條目(漏一個就等於那個分級沒有後果)", () => {
  // 這些字串必須跟 core/narration.js 的 TIERS id 完全一致，對不上就是靜默失效：
  // threatDeltaForOutcome() 會回0，那個分級的成敗從此對世界沒有任何影響，而且不會報錯。
  // 例外：「驚險成功」刻意設計成0（見 threat.js 的設計註解）——判定結果是成功，
  // 就不該讓追蹤格上升，只是沒有像乾淨的成功一樣把威脅推遠。
  const allTiers = [
    classifyOutcome({ margin: 9 }),
    classifyOutcome({ margin: 2 }),
    classifyOutcome({ margin: 0 }),
    classifyOutcome({ margin: -2 }),
    classifyOutcome({ margin: -5 }),
    classifyOutcome({ margin: -9 }),
    classifyOutcome({ margin: 1, fumble: true }),
    classifyOutcome({ margin: 1, autoFail: true }),
  ];
  for (const outcome of allTiers) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(OUTCOME_THREAT_DELTA, outcome.tier),
      `分級「${outcome.tier}」在 OUTCOME_THREAT_DELTA 裡沒有對應的增減值`
    );
    if (outcome.tier === "驚險成功") {
      assert.equal(threatDeltaForOutcome(outcome), 0, "驚險成功是成功，不應該推高迫近度");
    } else {
      assert.notEqual(threatDeltaForOutcome(outcome), 0, `分級「${outcome.tier}」的迫近度增減不該是0`);
    }
  }
});

test("只有低於DC(margin<0)的分級才會讓迫近度上升；margin>=0一律不上升", () => {
  const successMargins = [9, 2, 0]; // 大成功/成功/驚險成功
  for (const margin of successMargins) {
    const outcome = classifyOutcome({ margin });
    assert.ok(
      threatDeltaForOutcome(outcome) <= 0,
      `margin=${margin}(分級「${outcome.tier}」)是成功，迫近度增減不該是正數`
    );
  }
});

test("連續兩次普通失敗就會跨一個階段(失敗是會累積的，不是每次重來)", () => {
  let track = createThreatTrack(0);
  const fail = classifyOutcome({ margin: -4 }); // 失敗 = +2

  const first = applyOutcomeToThreat(track, fail);
  track = first.track;
  const second = applyOutcomeToThreat(track, fail);

  assert.equal(second.after, 4);
  assert.notEqual(getThreatStage(0).id, getThreatStage(second.after).id, "兩次失敗之後應該不在同一個階段");
  assert.equal(second.escalated, true);
});

test("迫近度不會超出 0~THREAT_MAX，也不會因為連續大成功變成負數", () => {
  const great = classifyOutcome({ margin: 12 });
  let track = createThreatTrack(1);
  for (let i = 0; i < 10; i++) track = applyOutcomeToThreat(track, great).track;
  assert.equal(track.level, 0);

  const fumble = classifyOutcome({ margin: 1, fumble: true });
  for (let i = 0; i < 10; i++) track = applyOutcomeToThreat(track, fumble).track;
  assert.equal(track.level, THREAT_MAX);
});

test("撞到上限時回報 contact，呼叫端才知道要開放/強制戰鬥", () => {
  const result = applyOutcomeToThreat(createThreatTrack(THREAT_MAX - 1), classifyOutcome({ margin: -5 }));
  assert.equal(result.contact, true);
  assert.equal(result.stage.id, "接觸");
});

test("沒有判定的回合(開場/純敘事)不會動到迫近度", () => {
  const before = createThreatTrack(2);
  const after = applyOutcomeToThreat(before, null);
  assert.equal(after.after, 2);
  assert.equal(after.delta, 0);
});

test("開戰之後迫近度回落但不歸零(追兵還在，只是變成正面衝突)", () => {
  const discharged = dischargeThreat({ level: THREAT_MAX, peak: THREAT_MAX, encounters: 0 });
  assert.equal(discharged.level, THREAT_AFTER_ENCOUNTER);
  assert.ok(discharged.level > 0, "歸零等於玩家打完一場就回到沒被發現的狀態");
  assert.equal(discharged.encounters, 1);
});

test("階段表覆蓋 0~THREAT_MAX 每一格，不會有查不到階段的數字", () => {
  for (let level = 0; level <= THREAT_MAX; level++) {
    const stage = getThreatStage(level);
    assert.ok(stage, `迫近度 ${level} 查不到階段`);
    assert.ok(stage.directive.length > 20, `階段「${stage.id}」的指令太短，AI讀不出要做什麼`);
  }
  assert.equal(getThreatStage(THREAT_MAX).id, THREAT_STAGES.at(-1).id);
  assert.equal(getThreatStage(6).id, "貼近");
  assert.equal(getThreatStage(7).id, "接觸");
});

test("舊存檔沒有 threat 欄位時自動補一條全新軌道，不會壞掉", () => {
  assert.deepEqual(normalizeTrack(undefined), createThreatTrack(0));
  assert.deepEqual(normalizeTrack(null), createThreatTrack(0));
  // 壞掉的資料(手改存檔/舊版格式)也要收斂回合法範圍，不能讓 level=999 一路傳進 prompt
  assert.equal(normalizeTrack({ level: 999 }).level, THREAT_MAX);
  assert.equal(normalizeTrack({ level: -5 }).level, 0);
});

test("buildThreatDirective：副本自己的風味文字會被帶進去，且不會把數字以外的規則交給AI決定", () => {
  const flavor = { name: "異形迫近度", subject: "異形", stages: { 貼近: "它就在同一段走廊裡" } };
  const text = buildThreatDirective({ level: 5, peak: 5, encounters: 0 }, flavor, { delta: 2, before: 3 });

  assert.match(text, /異形迫近度：5\/7/);
  assert.match(text, /它就在同一段走廊裡/);
  assert.match(text, /不是你決定的/, "必須明講這個數字不是AI算的");
  assert.match(text, /往你推進了 2 格/, "要把這一回合的變化講出來，敘事才接得上因果");

  const freeInputText = buildThreatDirective(
    { level: 2, peak: 2, encounters: 0 },
    flavor,
    { delta: 0, before: 2 },
    { freeInput: true }
  );
  assert.match(freeInputText, /未命中 approach 的自由輸入覆寫/);
  assert.match(freeInputText, /不要把追蹤寫成已進入同一空間/);
});

test("threatSummary：給前端的摘要不含給AI的指令原文", () => {
  const summary = threatSummary({ level: 2, peak: 4, encounters: 1 }, { name: "異形迫近度" });
  assert.equal(summary.level, 2);
  assert.equal(summary.max, THREAT_MAX);
  assert.equal(summary.name, "異形迫近度");
  assert.equal(summary.contact, false);
  assert.equal("directive" in summary, false);
});
