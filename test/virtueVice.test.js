// content/chargen/virtueVice.js、reshape.js、awakening.js 的測試。
//
// 這份檔案的重點是**分布報告**那一條。五題綜合判定七美德七惡德是一套心理測驗式的計分，
// 它最容易壞的方式不是丟例外，是**安靜地歪掉**：某一項永遠贏不了、或某一項佔掉一半。
// 那種壞法沒有任何錯誤訊息，只會讓玩家玩十次抽到八次同一個惡德，然後覺得這系統是假的。
// 所以窮舉全部答案組合、把十四項的佔比算出來，是這套設計唯一有意義的正確性檢查。
//
// 之後調任何一筆權重，這條測試就是那把尺——不用憑感覺。

import test from "node:test";
import assert from "node:assert/strict";
import {
  VIRTUES,
  VICES,
  VIRTUE_KEYS,
  VICE_KEYS,
  scoreMorality,
  resolveMorality,
  composeCore,
} from "../content/chargen/virtueVice.js";
import { LIFE_PATH_QUESTIONS, LIFE_PATH_QUESTION_IDS, collectLifePath } from "../content/chargen/lifePath.js";
import {
  RESHAPE_POINTS,
  RESHAPE_ATTRIBUTE_CAP,
  applyReshape,
  suggestReshape,
  reshapeStepCosts,
} from "../content/chargen/reshape.js";
import {
  composeAwakening,
  AWAKENING_TRANSITION,
  DEFAULT_ARRIVAL,
} from "../content/chargen/awakening.js";
import { allocateFromWeights } from "../content/chargen/allocate.js";

const TOTAL_COMBINATIONS = LIFE_PATH_QUESTIONS.reduce((n, q) => n * q.options.length, 1);

function forEachCombination(fn) {
  const walk = (index, acc) => {
    if (index === LIFE_PATH_QUESTIONS.length) return fn(acc);
    for (const option of LIFE_PATH_QUESTIONS[index].options) {
      walk(index + 1, { ...acc, [LIFE_PATH_QUESTIONS[index].id]: option.id });
    }
  };
  walk(0, {});
}

// ---------------------------------------------------------------------------
// 1. 名單
// ---------------------------------------------------------------------------

test("名單就是規則書「以身作則」那張表的十四項，各七個且不重複", () => {
  // 來源：rules-2.35.txt 約 170111 行，全書唯一一處把十四項一次列全的地方。
  assert.deepEqual(VIRTUE_KEYS, ["慈愛", "信念", "剛毅", "希望", "正義", "穩重", "節制"]);
  assert.deepEqual(VICE_KEYS, ["驕傲", "嫉妒", "憤怒", "貪欲", "懶惰", "色欲", "縱欲"]);
  assert.equal(new Set(VIRTUE_KEYS).size, 7);
  assert.equal(new Set(VICE_KEYS).size, 7);
  for (const entry of [...VIRTUES, ...VICES]) {
    assert.ok(entry.description?.length > 5, `「${entry.key}」缺給玩家看的說明`);
    assert.ok(entry.rulebook?.length > 5, `「${entry.key}」缺規則書原意的備註`);
  }
});

test("每一項美德惡德都至少有三題餵得到分", () => {
  // lifePath.js 檔頭寫權重的第2條原則。只有一題餵的項目在總分制裡幾乎贏不了
  // （別題隨便一個主權重3就追平），會變成名義上存在、實際上抽不到的結果。
  const sources = Object.fromEntries([...VIRTUE_KEYS, ...VICE_KEYS].map((k) => [k, new Set()]));
  for (const question of LIFE_PATH_QUESTIONS) {
    for (const option of question.options) {
      for (const key of Object.keys({ ...(option.virtues ?? {}), ...(option.vices ?? {}) })) {
        sources[key]?.add(question.id);
      }
    }
  }
  for (const [key, questions] of Object.entries(sources)) {
    assert.ok(questions.size >= 3, `「${key}」只有 ${questions.size} 題餵得到分，總分制下幾乎贏不了`);
  }
});

// ---------------------------------------------------------------------------
// 2. 分布（這份檔案存在的主要理由）
// ---------------------------------------------------------------------------

test(`窮舉全部 ${TOTAL_COMBINATIONS} 種答案：十四項每一項都抽得到，而且沒有一項壟斷`, () => {
  const virtueWins = Object.fromEntries(VIRTUE_KEYS.map((k) => [k, 0]));
  const viceWins = Object.fromEntries(VICE_KEYS.map((k) => [k, 0]));
  let total = 0;

  forEachCombination((answers) => {
    total++;
    const { morality } = collectLifePath(answers);
    assert.ok(morality, "答完五題就該算得出美德惡德");
    virtueWins[morality.virtue]++;
    viceWins[morality.vice]++;
  });
  assert.equal(total, TOTAL_COMBINATIONS);

  // 下限 2%：低於這個數字的項目，玩家實際上抽不到，等於白寫。
  // 上限 35%：高於這個數字的項目會讓「我又是這個」變成常態，整套判定就沒有說服力了。
  // 均勻分布是 1/7 ≈ 14.3%，目前實際落在 11%~18%。
  const report = (label, wins) => {
    for (const [key, count] of Object.entries(wins)) {
      const share = (count / total) * 100;
      assert.ok(count > 0, `${label}「${key}」在 ${total} 種組合裡一次都沒贏過`);
      assert.ok(share >= 2, `${label}「${key}」只佔 ${share.toFixed(1)}%，實際上抽不到`);
      assert.ok(share <= 35, `${label}「${key}」佔了 ${share.toFixed(1)}%，壟斷了結果`);
    }
  };
  report("美德", virtueWins);
  report("惡德", viceWins);
});

// ---------------------------------------------------------------------------
// 3. 決定性與平手
// ---------------------------------------------------------------------------

test("同樣的答案一定算出同樣的美德惡德（不可以有隨機成分）", () => {
  forEachCombination((answers) => {
    const a = collectLifePath(answers).morality;
    const b = collectLifePath(answers).morality;
    assert.deepEqual(a, b);
  });
});

test("平手時照明講的四層規則判，不依賴物件屬性的列舉順序", () => {
  const first = LIFE_PATH_QUESTION_IDS[0];
  const last = LIFE_PATH_QUESTION_IDS[LIFE_PATH_QUESTION_IDS.length - 1];

  // 總分打平（各3分），但「憤怒」是在最後一題拿到的 -> 第2層規則，憤怒勝。
  const tieOnLast = resolveMorality(
    [
      { questionId: first, vices: { 驕傲: 3 }, virtues: {} },
      { questionId: last, vices: { 憤怒: 3 }, virtues: {} },
    ],
    LIFE_PATH_QUESTION_IDS
  );
  assert.equal(tieOnLast.vice, "憤怒");

  // 總分打平、最後一題也都沒給分 -> 第3層規則，看第一題，貪欲勝。
  const middle = LIFE_PATH_QUESTION_IDS[2];
  const tieOnFirst = resolveMorality(
    [
      { questionId: first, vices: { 貪欲: 3 }, virtues: {} },
      { questionId: middle, vices: { 懶惰: 3 }, virtues: {} },
    ],
    LIFE_PATH_QUESTION_IDS
  );
  assert.equal(tieOnFirst.vice, "貪欲");

  // 全部打平 -> 第4層規則，照規則書順序（驕傲在嫉妒前面）。
  const tieOnOrder = resolveMorality(
    [{ questionId: first, vices: { 嫉妒: 2, 驕傲: 2 }, virtues: {} }],
    LIFE_PATH_QUESTION_IDS
  );
  assert.equal(tieOnOrder.vice, "驕傲");
});

test("亞軍不會跟冠軍是同一個，而且冠軍的分數一定不低於亞軍", () => {
  forEachCombination((answers) => {
    const { options, morality } = collectLifePath(answers);
    const { virtues, vices } = scoreMorality(options);
    assert.notEqual(morality.virtue, morality.shadowVirtue);
    assert.notEqual(morality.vice, morality.shadowVice);
    assert.ok(virtues[morality.virtue] >= virtues[morality.shadowVirtue]);
    assert.ok(vices[morality.vice] >= vices[morality.shadowVice]);
  });
});

test("不在十四項裡的字會被忽略，不會偷偷長出第八個美德", () => {
  const { virtues, vices } = scoreMorality([
    { questionId: "x", virtues: { 慈愛: 2, 樂觀: 99 }, vices: { 懶惰: 1, 拖延: 99 } },
  ]);
  assert.equal(Object.keys(virtues).length, 7);
  assert.equal(Object.keys(vices).length, 7);
  assert.equal(virtues["樂觀"], undefined);
  assert.equal(vices["拖延"], undefined);
});

// ---------------------------------------------------------------------------
// 4. 性格核心
// ---------------------------------------------------------------------------

test("任何一組美德×惡德都組得出性格核心（彩蛋走手寫，其餘走模板）", () => {
  for (const virtue of VIRTUE_KEYS) {
    for (const vice of VICE_KEYS) {
      const core = composeCore(virtue, vice);
      assert.ok(core.name?.length > 0, `${virtue}×${vice} 組不出名字`);
      assert.ok(core.description?.length > 10, `${virtue}×${vice} 的說明太短`);
    }
  }
  // 手寫彩蛋不可以退回模板（模板句一定含有「讓你撐到了現在」）
  const handwritten = composeCore("剛毅", "憤怒");
  assert.equal(handwritten.name, "不肯熄火的人");
  assert.ok(!handwritten.description.includes("讓你撐到了現在"));
  // 沒手寫的組合走模板，而且模板要把兩個名字都帶進去
  const templated = composeCore("穩重", "色欲");
  assert.ok(templated.description.includes("穩重") && templated.description.includes("色欲"));
});

// ---------------------------------------------------------------------------
// 5. 肉體重塑
// ---------------------------------------------------------------------------

test(`全部 ${TOTAL_COMBINATIONS} 種答案配出來的卡，都湊得出剛好 ${RESHAPE_POINTS} 點的重塑`, () => {
  // 這是 requireExact 能夠成立的前提。湊不出來的話，玩家會被永遠卡在甦醒畫面出不去——
  // 而這正是第一版貪婪法踩到的坑（見 reshape.js 的 suggestReshape 實作記錄）。
  forEachCombination((answers) => {
    const { weights } = collectLifePath(answers);
    const base = allocateFromWeights(weights).attributes;
    const spend = suggestReshape(base);
    const applied = applyReshape(base, spend, { requireExact: true });
    assert.equal(applied.valid, true, `湊不出剛好${RESHAPE_POINTS}點：${JSON.stringify(base)} -> ${applied.errors.join("；")}`);
    assert.equal(applied.cost, RESHAPE_POINTS);
    assert.equal(applied.remaining, 0);
  });
});

test("重塑只能加不能減，而且不可以超過建卡上限", () => {
  const base = { 力量: 1, 敏捷: 2, 耐力: 3, 智力: 4, 感知: 1, 意志: 2 };

  const ok = applyReshape(base, { 力量: 2, 感知: 2 }, { requireExact: false });
  assert.equal(ok.valid, true, ok.errors.join("；"));
  assert.equal(ok.attributes.力量, 3);
  assert.equal(ok.attributes.耐力, 3, "沒動到的屬性要原封不動");

  const negative = applyReshape(base, { 力量: -1 }, { requireExact: false });
  assert.match(negative.errors.join(), /0 或正整數/);

  const overCap = applyReshape({ ...base, 智力: 5 }, { 智力: 1 }, { requireExact: false });
  assert.match(overCap.errors.join(), new RegExp(`不能超過 ${RESHAPE_ATTRIBUTE_CAP}`));

  const overspend = applyReshape(base, { 智力: 1, 耐力: 1, 力量: 1, 敏捷: 1 }, { requireExact: false });
  assert.match(overspend.errors.join(), /超支/);

  const unspent = applyReshape(base, { 力量: 1 }, { requireExact: true });
  assert.match(unspent.errors.join(), /沒有分配/);
  // requireExact=false 是給前端即時預覽用的：還沒配完不是錯誤
  assert.equal(applyReshape(base, { 力量: 1 }, { requireExact: false }).valid, true);
});

test("價目表會把已經到頂的屬性標成不能再加", () => {
  const costs = reshapeStepCosts({ 力量: 1, 敏捷: 4, 耐力: 5, 智力: 3, 感知: 1, 意志: 2 });
  assert.equal(costs.力量, 1);
  assert.equal(costs.敏捷, 3, "4->5 是最貴的一級");
  assert.equal(costs.耐力, null, "已經到上限就不能再加");
});

// ---------------------------------------------------------------------------
// 6. 甦醒那一幕
// ---------------------------------------------------------------------------

test("甦醒那一幕：過場通用、房間交給副本、掃描要引用玩家的每一個選擇", () => {
  const answers = Object.fromEntries(LIFE_PATH_QUESTIONS.map((q) => [q.id, q.options[0].id]));
  const { options, morality, weights } = collectLifePath(answers);
  const attributes = allocateFromWeights(weights).attributes;

  const scene = composeAwakening({
    options,
    morality,
    startingSpecialties: [
      { id: "crisis_observer", name: "危機觀察", skill: "偵察", description: "說明" },
      { id: "first_aid", name: "急救經驗", skill: "醫療", description: "說明" },
      { id: "melee_reflex", name: "近身反應", skill: "格鬥", description: "說明" },
    ],
    attributes,
    arrivalNarration: "你醒在一艘船上。你被一層防護罩罩住。",
  });

  assert.equal(scene.transition, AWAKENING_TRANSITION);
  assert.equal(scene.arrival, "你醒在一艘船上。你被一層防護罩罩住。");
  assert.equal(
    scene.system.echoes.length,
    LIFE_PATH_QUESTIONS.length,
    "五題就要有五句引用——玩家沒有直接選美德惡德，結論必須說得出理由"
  );
  assert.equal(scene.system.virtue.key, morality.virtue);
  assert.equal(scene.system.vice.key, morality.vice);
  assert.ok(scene.system.core.name);
  assert.match(scene.system.footer, new RegExp(`${RESHAPE_POINTS} 點自由屬性`));
  assert.equal(scene.system.startingSpecialties.length, 3);
  assert.deepEqual(scene.system.startingSpecialties.map((specialty) => specialty.skill), ["偵察", "醫療", "格鬥"]);
  assert.equal(scene.system.traits, undefined, "甦醒資料不應再回傳純敘事特性");
  assert.equal(scene.reshape.points, RESHAPE_POINTS);
  assert.deepEqual(scene.reshape.base, attributes, "重塑要疊在自動配點的結果上");
});

test("副本沒寫 arrivalNarration 時退回通用的房間，不是留一段空白", () => {
  const answers = Object.fromEntries(LIFE_PATH_QUESTIONS.map((q) => [q.id, q.options[0].id]));
  const { options, morality } = collectLifePath(answers);

  for (const missing of [undefined, null, "", "   "]) {
    const scene = composeAwakening({ options, morality, arrivalNarration: missing });
    assert.equal(scene.arrival, DEFAULT_ARRIVAL, `arrivalNarration=${JSON.stringify(missing)} 應該退回通用房間`);
  }
});
