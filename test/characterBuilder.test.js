// content/characterBuilder.js 與 content/chargen/* 的測試。
//
// [2026-08-16 改版] 這份檔案原本測的是「四個身分模板 + 二選一背景故事」那套建卡。
// 那套整組被拿掉了（理由見 content/characterBuilder.js 檔頭），所以測試也整份重寫——
// 留著測一個已經不存在的系統沒有意義，而測試檔案的內容就是這個專案「現在到底有什麼」
// 最誠實的一份說明。
//
// 現在測三件事：
//   1. 生平問答的**資料**本身合法（題目/選項/權重/小傳片段都齊全）
//   2. 自動配點的**性質**（決定性、不超支、不極端、保證廣度）——不是鎖死某一組數字，
//      因為權重是草案、之後一定會調；鎖性質才不會每次微調文案都要改測試。
//   3. 組出來的角色卡真的合法，而且玩家寫的故事真的有進到角色卡裡
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCharacter,
  buildCharacterFromLifePath,
  chargenRules,
  narrativeFeatHints,
  ATTRIBUTE_BUDGET,
  SKILL_BUDGET,
} from "../content/characterBuilder.js";
import {
  LIFE_PATH_QUESTIONS,
  collectLifePath,
  composeBackground,
  questionsForClient,
} from "../content/chargen/lifePath.js";
import {
  allocateFromWeights,
  AUTO_ATTRIBUTE_CAP,
  AUTO_SKILL_CAP,
  MIN_TRAINED_SKILLS,
} from "../content/chargen/allocate.js";
import { ATTRIBUTES, SKILLS } from "../core/schema.js";

const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key);
const ALL_SKILLS = Object.values(SKILLS).flat();

/** 挑每一題的第 n 個選項（超出就取最後一個），組一份完整答案。 */
function answersByIndex(n) {
  return Object.fromEntries(
    LIFE_PATH_QUESTIONS.map((q) => [q.id, q.options[Math.min(n, q.options.length - 1)].id])
  );
}

/** 走訪所有可能的答案組合（目前 6×4×4×4×4×4 = 6144 種，跑得完）。 */
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
// 1. 題目資料本身
// ---------------------------------------------------------------------------

test("每一題都有足夠的選項，每個選項都有小傳片段與權重", () => {
  assert.ok(LIFE_PATH_QUESTIONS.length >= 5, "問答太短撐不起「逐步建立一個角色」");
  for (const q of LIFE_PATH_QUESTIONS) {
    assert.ok(q.title && q.subtitle, `題目「${q.id}」缺標題或說明`);
    assert.ok(q.options.length >= 4, `題目「${q.id}」的選項少於4個`);
    for (const o of q.options) {
      assert.ok(o.label && o.detail, `${q.id}/${o.id} 缺 label 或 detail`);
      assert.ok(o.story.length > 10, `${q.id}/${o.id} 的小傳片段太短`);
      const w = { ...(o.weights.attributes ?? {}), ...(o.weights.skills ?? {}) };
      assert.ok(Object.keys(w).length > 0, `${q.id}/${o.id} 沒有任何權重，選了等於沒選`);
      for (const key of Object.keys(o.weights.attributes ?? {})) {
        assert.ok(ATTRIBUTE_KEYS.includes(key), `${q.id}/${o.id} 的屬性「${key}」不在六維裡`);
      }
      for (const key of Object.keys(o.weights.skills ?? {})) {
        assert.ok(ALL_SKILLS.includes(key), `${q.id}/${o.id} 的技能「${key}」不在技能表裡`);
      }
    }
  }
});

test("每一題的選項不可以有明顯的「最強解」：各選項總權重要在同一個量級", () => {
  // 這是 lifePath.js 檔頭第2條原則的自動檢查。如果某一題有一個選項的總權重
  // 明顯高過其他選項，玩家遲早會發現「選那個比較賺」，整套問答就退化回選數字。
  for (const q of LIFE_PATH_QUESTIONS) {
    const totals = q.options.map((o) =>
      Object.values(o.weights.attributes ?? {}).reduce((a, b) => a + b, 0) +
      Object.values(o.weights.skills ?? {}).reduce((a, b) => a + b, 0)
    );
    const max = Math.max(...totals);
    const min = Math.min(...totals);
    assert.ok(max - min <= 4, `題目「${q.id}」各選項的總權重落差太大（${min}~${max}），會出現最強解`);
  }
});

test("送給前端的題目資料不含權重（看得到權重就會變成選數字）", () => {
  const client = questionsForClient();
  const serialized = JSON.stringify(client);
  assert.equal(client.length, LIFE_PATH_QUESTIONS.length);
  assert.equal(serialized.includes("weights"), false);
  for (const attr of ATTRIBUTE_KEYS) {
    assert.equal(serialized.includes(`"${attr}"`), false, `前端資料不該出現屬性名「${attr}」`);
  }
});

test("沒答完不會丟錯，只會列出還沒答的題目", () => {
  const partial = collectLifePath({ [LIFE_PATH_QUESTIONS[0].id]: LIFE_PATH_QUESTIONS[0].options[0].id });
  assert.equal(partial.errors.length, LIFE_PATH_QUESTIONS.length - 1);
  assert.equal(partial.options.length, 1);
});

test("不存在的選項會被擋下，不會靜靜地當成沒選", () => {
  const bogus = collectLifePath({ ...answersByIndex(0), [LIFE_PATH_QUESTIONS[0].id]: "不存在的選項" });
  assert.match(bogus.errors.join(), /沒有這個選項/);
});

// ---------------------------------------------------------------------------
// 2. 自動配點的性質
// ---------------------------------------------------------------------------

test("同樣的答案一定配出同樣的角色（不可以有隨機成分）", () => {
  const answers = answersByIndex(1);
  const a = buildCharacterFromLifePath({ concept: { name: "甲" }, answers });
  const b = buildCharacterFromLifePath({ concept: { name: "甲" }, answers });
  assert.deepEqual(a.character.attributes, b.character.attributes);
  assert.deepEqual(a.character.skills, b.character.skills);
});

test("所有 6144 種答案組合都配得出合法角色，且不超支、不極端、保證廣度", () => {
  // 全走訪而不是抽樣：組合數還在跑得完的範圍內，而「某一組答案會配出壞卡」
  // 正是那種抽樣測試永遠抓不到、但玩家一定會踩到的問題。
  let count = 0;
  forEachCombination((answers) => {
    count++;
    const result = buildCharacterFromLifePath({ concept: { name: "測試" }, answers });
    assert.equal(result.valid, true, `這組答案配不出合法角色：${JSON.stringify(answers)}`);

    assert.ok(result.budgets.attributes.totalCost <= ATTRIBUTE_BUDGET);
    assert.ok(result.budgets.skills.totalCost <= SKILL_BUDGET);

    const capped = ATTRIBUTE_KEYS.filter((k) => result.character.attributes[k] >= AUTO_ATTRIBUTE_CAP);
    assert.ok(capped.length <= 1, `不該有兩個屬性同時到頂：${JSON.stringify(answers)}`);
    for (const key of ATTRIBUTE_KEYS) {
      assert.ok(result.character.attributes[key] <= AUTO_ATTRIBUTE_CAP, "自動配點不該把屬性推到建卡上限5");
    }

    const trained = ALL_SKILLS.filter((s) => result.character.skillBase[s] > 0);
    assert.ok(
      trained.length >= MIN_TRAINED_SKILLS,
      `練到的技能只有 ${trained.length} 個，副本的四個選項會有死路：${JSON.stringify(answers)}`
    );
    for (const s of trained) {
      assert.ok(result.character.skillBase[s] <= AUTO_SKILL_CAP);
    }
  });
  assert.equal(count, LIFE_PATH_QUESTIONS.reduce((n, q) => n * q.options.length, 1));
});

test("權重高的方向真的會拿到比較多點數（配點不是亂給的）", () => {
  // 權重要給得像真的答案一樣分散。只給兩個方向的話，預算會多到把兩邊都推到上限——
  // 那不是配點錯了，是那種輸入在真實問答裡不會出現（六題一定會指向五、六個方向）。
  const allocated = allocateFromWeights({
    attributes: { 力量: 10, 敏捷: 5, 耐力: 4, 感知: 3, 智力: 1 },
    skills: { 格鬥: 10, 體魄: 6, 求生: 4, 偵察: 3, 交涉: 2, 秘識: 1 },
  });

  assert.equal(allocated.attributes.力量, AUTO_ATTRIBUTE_CAP, "權重最高的屬性應該吃到上限");
  assert.ok(allocated.attributes.力量 > allocated.attributes.智力);
  assert.ok(allocated.attributes.敏捷 >= allocated.attributes.感知);

  assert.equal(allocated.skills.格鬥, AUTO_SKILL_CAP, "權重最高的技能應該吃到上限");
  assert.ok(allocated.skills.格鬥 > allocated.skills.秘識);
  assert.ok(allocated.skills.體魄 >= allocated.skills.交涉);
});

test("完全沒有權重時也不會爆掉（回一張全基礎值但仍然合法的卡）", () => {
  const allocated = allocateFromWeights({});
  for (const key of ATTRIBUTE_KEYS) assert.equal(allocated.attributes[key], 1);
  // 技能仍然會給廣度保障的那幾點，否則角色一個技能都沒有，四個選項全是死路
  const trained = ALL_SKILLS.filter((s) => allocated.skills[s] > 0);
  assert.equal(trained.length, MIN_TRAINED_SKILLS);
});

// ---------------------------------------------------------------------------
// 3. 組出來的角色卡
// ---------------------------------------------------------------------------

test("玩家的答案會變成一段小傳，而且真的寫進角色卡", () => {
  const answers = answersByIndex(0);
  const result = buildCharacterFromLifePath({ concept: { name: "林默", gender: "女" }, answers });

  const expected = composeBackground(collectLifePath(answers).options);
  assert.equal(result.character.concept.background, expected);
  assert.ok(result.character.concept.background.length > 100, "小傳太短，代入感撐不起來");
  assert.equal(result.character.concept.name, "林默");
  assert.equal(result.character.concept.gender, "女");
});

test("性格特質會變成純敘事型專長，並且餵得進AI的性格提示", () => {
  const answers = answersByIndex(1);
  const result = buildCharacterFromLifePath({ concept: { name: "測試" }, answers });

  assert.ok(result.character.feats.length > 0, "應該至少帶到一個性格特質");
  for (const feat of result.character.feats) {
    assert.equal(feat.effect.type, "narrative", "生平問答只給純敘事型特質，不偷偷加數值");
  }
  assert.equal(narrativeFeatHints(result.character).length, result.character.feats.length);
});

test("沒有名字就不算完成建卡", () => {
  const result = buildCharacterFromLifePath({ concept: {}, answers: answersByIndex(0) });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(), /名稱/);
});

test("題目沒答完時不會回傳半成品角色卡", () => {
  const result = buildCharacterFromLifePath({ concept: { name: "測試" }, answers: {} });
  assert.equal(result.valid, false);
  assert.equal(result.character, undefined);
  assert.equal(result.lifePath, null);
});

test("buildCharacter 低階入口：專長清單會被查驗，壞掉的條目直接丟掉", () => {
  const result = buildCharacter({
    concept: { name: "測試" },
    attributes: { 力量: 2 },
    skills: { 格鬥: 1 },
    feats: [
      { name: "合法敘事", description: "說明", effect: { type: "narrative" } },
      { name: "合法加成", description: "說明", effect: { type: "skillBonus", skill: "格鬥", amount: 1 } },
      { name: "技能不存在", description: "說明", effect: { type: "skillBonus", skill: "不存在的技能", amount: 1 } },
      { name: "缺說明", effect: { type: "narrative" } },
      "根本不是物件",
    ],
  });

  assert.equal(result.valid, true, result.errors.join("；"));
  assert.equal(result.character.feats.length, 2);
  assert.equal(result.character.skillBase["格鬥"], 1, "skillBase 是配點的原始值");
  assert.equal(result.character.skills["格鬥"], 2, "skills 是專長加成後的最終值");
});

test("chargenRules：把題目與預算一起給前端，前端不用自己抄一份", () => {
  const rules = chargenRules();
  assert.equal(rules.lifePath.length, LIFE_PATH_QUESTIONS.length);
  assert.equal(rules.attributes.freePoints, ATTRIBUTE_BUDGET);
  assert.equal(rules.skills.freePoints, SKILL_BUDGET);
  assert.equal(rules.attributes.cap, 5);
  assert.equal(rules.skills.cap, 3);
  assert.equal("archetypes" in rules, false, "身分模板已經整組拿掉了，不該還留在規則裡");
});
