// content/characterBuilder.js 的「角色塑造」層測試 —— 背景故事二選一、選填自訂欄位、
// 以及身分模板固定專長的效果套用。
//
// 這裡最需要被鎖住的一件事是 skillBonus 的**疊加時機**：玩家自己配點的上限是3，
// 專長的+1是在「0-3配點驗證通過之後」才疊上去的，所以最終值可以到4。如果哪天有人
// 把加成搬到驗證之前，配了3級的技能會因為變成4而被驗證擋下來——那是回歸，不是新功能。
//
// 純數值/預算相關的既有測試在 test/sessionStore.test.js，這裡不重複。
import test from "node:test";
import assert from "node:assert/strict";
import { buildCharacter, ARCHETYPES, narrativeFeatHints } from "../content/characterBuilder.js";

/** 士兵模板的合法草稿：屬性剛好6點、技能剛好8點，用來當各種變化的基底。 */
function soldierDraft(overrides = {}) {
  return {
    concept: { name: "測試輪迴者" },
    archetypeId: "soldier",
    backstoryChoiceId: "soldier-veteran",
    attributes: { 敏捷: 4, 耐力: 2, 感知: 2, 力量: 2, 智力: 1, 意志: 1 },
    skills: { 射擊: 3, 潛行: 2, 體魄: 2, 偵察: 1 },
    ...overrides,
  };
}

// --- 模板資料本身的結構 ---

test("每個身分模板都有剛好2個背景故事候選，各自帶至少一個自訂欄位", () => {
  for (const [id, arch] of Object.entries(ARCHETYPES)) {
    assert.equal(arch.backstoryOptions.length, 2, `${id} 的背景故事候選不是2個`);
    for (const b of arch.backstoryOptions) {
      assert.ok(b.id, `${id} 的背景故事缺 id`);
      assert.ok(b.text, `${id} 的背景故事缺 text`);
      assert.ok(b.customizableFields.length >= 1, `${id} 的背景故事「${b.id}」沒有自訂欄位`);
      for (const f of b.customizableFields) {
        assert.ok(f.key, `${id}/${b.id} 的自訂欄位缺 key`);
        assert.ok(f.label, `${id}/${b.id} 的自訂欄位缺 label`);
      }
    }
  }
});

test("每個身分模板都有剛好3個專長：2個skillBonus + 1個narrative", () => {
  for (const [id, arch] of Object.entries(ARCHETYPES)) {
    assert.equal(arch.feats.length, 3, `${id} 的專長不是3個`);

    const bonusFeats = arch.feats.filter((f) => f.effect.type === "skillBonus");
    const narrativeFeats = arch.feats.filter((f) => f.effect.type === "narrative");
    assert.equal(bonusFeats.length, 2, `${id} 的skillBonus型專長不是2個`);
    assert.equal(narrativeFeats.length, 1, `${id} 的narrative型專長不是1個`);

    for (const f of arch.feats) {
      assert.ok(f.id && f.name && f.description, `${id} 的專長「${f.id}」欄位不完整`);
    }
    // 加成掛的技能必須真的存在，否則加成會靜靜地不生效
    for (const f of bonusFeats) {
      assert.ok(f.effect.skill, `${id} 的skillBonus專長沒指定技能`);
      assert.equal(typeof f.effect.amount, "number", `${id} 的skillBonus專長amount不是數字`);
    }
  }
});

// --- 背景故事選擇 ---

test("buildCharacter：選了合法背景故事，故事原文會寫進 concept.background", () => {
  const result = buildCharacter(soldierDraft());
  assert.equal(result.valid, true, `不該有錯誤：${result.errors.join("；")}`);
  assert.equal(result.character.backstoryChoiceId, "soldier-veteran");
  assert.equal(
    result.character.concept.background,
    ARCHETYPES.soldier.backstoryOptions[0].text
  );
});

test("buildCharacter：選了模板卻沒選背景故事，視同建卡未完成(不丟例外)", () => {
  const result = buildCharacter(soldierDraft({ backstoryChoiceId: undefined }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(), /必須選擇一個背景故事/);
  assert.equal(result.character, undefined, "驗證失敗時不可以回傳角色卡");
});

test("buildCharacter：背景故事id不屬於這個模板要擋下來(不丟例外)", () => {
  const result = buildCharacter(soldierDraft({ backstoryChoiceId: "medic-er-nurse" }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(), /不屬於身分模板/);
});

test("buildCharacter：未知的身分模板要擋下來(不丟例外)", () => {
  const result = buildCharacter(soldierDraft({ archetypeId: "不存在的模板" }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(), /未知的身分模板/);
});

test("buildCharacter：完全不帶身分模板仍然可以建卡(沿用原本的自由建卡路徑)", () => {
  const result = buildCharacter({
    concept: { name: "自由建卡" },
    attributes: { 敏捷: 2 },
    skills: { 射擊: 1 },
  });
  assert.equal(result.valid, true, `不該有錯誤：${result.errors.join("；")}`);
  assert.deepEqual(result.character.feats, [], "沒有模板就不該有專長");
  assert.equal(result.character.concept.background, "");
});

// --- 自訂欄位 ---

test("buildCharacter：自訂欄位會trim，超過40字直接截斷不報錯", () => {
  const result = buildCharacter(
    soldierDraft({ customDetails: { comradeName: `   ${"阿".repeat(60)}   ` } })
  );
  assert.equal(result.valid, true, `不該有錯誤：${result.errors.join("；")}`);
  assert.equal(result.character.customDetails.comradeName.length, 40);
});

test("buildCharacter：沒填自訂欄位/填空白，不會留下空字串鍵", () => {
  const result = buildCharacter(soldierDraft({ customDetails: { comradeName: "   " } }));
  assert.equal(result.valid, true);
  assert.deepEqual(result.character.customDetails, {});

  const noDetails = buildCharacter(soldierDraft());
  assert.deepEqual(noDetails.character.customDetails, {});
});

test("buildCharacter：不屬於這個背景的自訂欄位鍵會被忽略，不會照單全收", () => {
  const result = buildCharacter(
    soldierDraft({ customDetails: { comradeName: "老王", 亂塞的欄位: "應該被忽略" } })
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.character.customDetails, { comradeName: "老王" });
});

// --- 專長效果疊加 ---

test("buildCharacter：skillBonus在配點驗證之後疊加，skillBase保留玩家配的原始值", () => {
  const result = buildCharacter(soldierDraft());
  assert.equal(result.valid, true, `不該有錯誤：${result.errors.join("；")}`);

  const c = result.character;
  // 士兵：戰場直覺(偵察+1)、創傷後警覺(求生+1)
  assert.equal(c.skillBase["偵察"], 1, "skillBase要是玩家配點的原始值");
  assert.equal(c.skills["偵察"], 2, "skills要是專長加成後的最終值");

  assert.equal(c.skillBase["求生"], 0, "沒配點的技能skillBase是0");
  assert.equal(c.skills["求生"], 1, "專長仍然加得上去");

  // 沒被專長碰到的技能，兩個欄位要一致
  assert.equal(c.skillBase["射擊"], 3);
  assert.equal(c.skills["射擊"], 3);
});

test("buildCharacter：玩家配到上限3的技能再吃專長+1，最終值可以到4", () => {
  // 醫護的「臨場急救直覺」是醫療+1，這裡玩家自己也把醫療配到上限3
  const result = buildCharacter({
    concept: { name: "醫護" },
    archetypeId: "medic",
    backstoryChoiceId: "medic-er-nurse",
    attributes: { 智力: 2, 意志: 3, 耐力: 2, 感知: 3, 敏捷: 1, 力量: 1 },
    skills: { 醫療: 3, 交涉: 2, 求生: 2, 偵察: 1 },
  });

  assert.equal(result.valid, true, `配點在上限內就不該被擋：${result.errors.join("；")}`);
  assert.equal(result.character.skillBase["醫療"], 3);
  assert.equal(result.character.skills["醫療"], 4, "專長加成可以突破玩家配點的上限3");
});

test("buildCharacter：玩家自己把技能配到4仍然要被擋(專長不能當作放寬配點上限的藉口)", () => {
  const result = buildCharacter(soldierDraft({ skills: { 射擊: 4 } }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(), /不能大於 3/);
});

test("buildCharacter：character.feats存下完整的3個專長(含narrative型)", () => {
  const result = buildCharacter(soldierDraft());
  const feats = result.character.feats;

  assert.equal(feats.length, 3);
  assert.deepEqual(
    feats.map((f) => f.id),
    ARCHETYPES.soldier.feats.map((f) => f.id)
  );
  assert.ok(
    feats.some((f) => f.effect.type === "narrative"),
    "narrative型專長也要存進角色卡，之後要餵給AI當性格提示"
  );
});

test("buildCharacter：回傳的feats是複本，改角色卡不會污染ARCHETYPES模板", () => {
  const result = buildCharacter(soldierDraft());
  result.character.feats[0].name = "被改掉的名字";
  assert.notEqual(ARCHETYPES.soldier.feats[0].name, "被改掉的名字");
});

// --- 餵給AI的性格提示 ---

test("narrativeFeatHints：只挑出narrative型專長的描述，數值型的不混進來", () => {
  const result = buildCharacter(soldierDraft());
  const hints = narrativeFeatHints(result.character);

  assert.equal(hints.length, 1);
  assert.match(hints[0], /戰友情誼/);
  assert.ok(
    !hints.some((h) => h.includes("+1")),
    "數值型專長不該出現在性格提示裡"
  );
});

test("narrativeFeatHints：沒有專長/不是角色卡時回傳空陣列，不丟錯", () => {
  assert.deepEqual(narrativeFeatHints(null), []);
  assert.deepEqual(narrativeFeatHints({}), []);
  assert.deepEqual(narrativeFeatHints({ feats: [] }), []);
});
