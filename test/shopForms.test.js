// 暫時性增益容器(「型態」)的測試 —— 見 content/shop/forms.js 檔頭說明。
//
// 這份測試的重點跟 shopCatalog.test.js 是同一個：**證明效果真的接到引擎上**。
// 型態是第14種效果，而它比其他13種更容易變成謊言——一個「持續3輪」的加值，如果沒有人
// 遞減那個3，它就是永久加值；如果加值本身沒有被任何查表函式讀到，它連加值都不是。
// 所以下面每一組測試都成對：**開啟後某個引擎函式的輸出真的變了**，
// 而且**到期後真的變回來**。

import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { computeDerivedStats } from "../core/derivedStats.js";
import { performCheck } from "../core/check.js";
import { computeDefenseDC } from "../core/combat/defense.js";
import { createActionBudget, useMove } from "../core/combat/actionEconomy.js";
import {
  validateEffect,
  checkModifiersFor,
  combatProfileFrom,
  weaponsFrom,
  applyCheckModifiers,
} from "../content/shop/effects.js";
import { validateGood, purchase } from "../content/shop/catalog.js";
import { createWallet } from "../content/shop/wallet.js";
import {
  createFormsState,
  formsOf,
  formIdOf,
  isFormActive,
  activateForm,
  deactivateForm,
  tickFormsOnRound,
  endScene,
  activeGrantSources,
  describeActiveForms,
} from "../content/shop/forms.js";
import {
  createEncounter,
  resolvePlayerAttack,
  resolveFormActivation,
  playerWeapons,
  playerCombatProfile,
} from "../content/combat/encounterState.js";

function hero() {
  const c = emptyCharacter("測試輪迴者");
  c.attributes = { 力量: 3, 敏捷: 3, 耐力: 3, 智力: 2, 感知: 3, 意志: 2 };
  c.skills.格鬥 = 2;
  c.skills.求生 = 3;
  c.derived = computeDerivedStats(c.attributes);
  return c;
}

/** 一個貼著 Orphnoch 原文形狀的型態：移動動作＋1意志力，持續一個場景，給防御與天生武器。 */
const 進化形態 = {
  kind: "型態",
  label: "進化形態",
  activation: { action: "移動", willpower: 1 },
  duration: { unit: "場景" },
  grants: [
    { kind: "防御", amount: 3 },
    {
      kind: "武器",
      label: "Orphnoch的手足(天生武器)",
      attackType: "肉搏",
      weaponDamage: 3,
      severity: "L",
      ranged: false,
    },
  ],
};

/** 以「輪」計時的型態，用來測倒數。 */
const 爆發 = {
  kind: "型態",
  label: "爆發",
  activation: { action: "自由", willpower: 1 },
  duration: { unit: "輪", rounds: 2 },
  grants: [{ kind: "檢定加骰", amount: 2 }],
};

function withAbility(character, effects, { goodId = "test.血統", name = "測試血統" } = {}) {
  return { ...character, abilities: [{ goodId, name, effects }] };
}

// ---------------------------------------------------------------------------
// 驗證：型態不能變成「免費的永久加值」
// ---------------------------------------------------------------------------

test("型態驗證：合法的型態通過", () => {
  assert.deepEqual(validateEffect(進化形態), []);
  assert.deepEqual(validateEffect(爆發), []);
});

test("型態驗證：沒有任何啟動成本的型態被擋下(沒有代價就沒有理由不永遠開著)", () => {
  const errs = validateEffect({
    ...進化形態,
    activation: { willpower: 0 },
  });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /沒有任何啟動成本/);
});

test("型態驗證：持續時間單位只接受引擎真的在遞減的那兩個", () => {
  const errs = validateEffect({ ...進化形態, duration: { unit: "10分鐘" } });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /合法值：輪\/場景/);

  // 以輪計時卻沒寫幾輪 = 一個不會結束的倒數
  assert.match(validateEffect({ ...爆發, duration: { unit: "輪" } })[0], /rounds 必須是正整數/);
});

test("型態驗證：grants 不能塞會寫進角色卡的效果(型態結束時收不回來)", () => {
  for (const grant of [
    { kind: "屬性", attribute: "力量", amount: 1 },
    { kind: "技能", skill: "格鬥", amount: 1 },
    { kind: "生命上限", amount: 2 },
    { kind: "治療", severity: "B", amount: 2 },
  ]) {
    const errs = validateEffect({ ...進化形態, grants: [grant] });
    assert.equal(errs.length, 1, `${grant.kind} 應該被擋下`);
    assert.match(errs[0], /不能由型態授予/);
  }
});

test("型態驗證：型態不可以巢狀", () => {
  const errs = validateEffect({ ...進化形態, grants: [進化形態] });
  assert.match(errs[0], /不可以巢狀/);
});

test("型態驗證：grants 是空陣列的型態不該存在", () => {
  assert.match(validateEffect({ ...進化形態, grants: [] })[0], /什麼都不給的型態/);
});

test("型態內部的檢定加骰可以沒有匹配鍵，型態外面的不行(閘門從AI換成引擎，不是拆掉閘門)", () => {
  // 外面：擋下
  assert.match(validateEffect({ kind: "檢定加骰", amount: 2 })[0], /必須指定 attribute 或 skill/);
  // 裡面：放行
  assert.deepEqual(validateEffect(爆發), []);
});

// ---------------------------------------------------------------------------
// 啟動成本：意志力的第一個消費端
// ---------------------------------------------------------------------------

test("啟動型態真的扣意志力——這是 character.derived.willpower 的第一個消費端", () => {
  const c = withAbility(hero(), [進化形態]);
  const before = c.derived.willpower.current;
  const formId = formIdOf("test.血統", "進化形態");

  const r = activateForm(c, createFormsState(), formId);
  assert.equal(r.ok, true);
  assert.equal(r.character.derived.willpower.current, before - 1);
  // 原本的角色卡不能被改動
  assert.equal(c.derived.willpower.current, before);
});

test("意志力不夠就啟動不了，而且理由講得出數字", () => {
  const c = withAbility(hero(), [進化形態]);
  c.derived.willpower.current = 0;

  const r = activateForm(c, createFormsState(), formIdOf("test.血統", "進化形態"));
  assert.equal(r.ok, false);
  assert.equal(r.blockers[0].code, "意志力不足");
  assert.match(r.blockers[0].message, /需要1點意志力，目前只有0點/);
});

test("啟動要花掉對應的動作額度，額度用完了就啟動不了", () => {
  const c = withAbility(hero(), [進化形態]);
  const formId = formIdOf("test.血統", "進化形態");

  const ok = activateForm(c, createFormsState(), formId, { budget: createActionBudget() });
  assert.equal(ok.ok, true);
  assert.equal(ok.budget.moveAvailable, false, "移動動作應該被用掉");

  const spent = useMove(createActionBudget());
  const blocked = activateForm(c, createFormsState(), formId, { budget: spent });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockers[0].code, "動作額度不足");
});

test("啟動失敗時意志力不會被扣掉(所有阻擋一次列齊，然後整筆不成立)", () => {
  const c = withAbility(hero(), [進化形態]);
  c.derived.willpower.current = 0;
  const r = activateForm(c, createFormsState(), formIdOf("test.血統", "進化形態"), {
    budget: useMove(createActionBudget()),
  });
  assert.equal(r.ok, false);
  assert.equal(r.blockers.length, 2, "意志力與動作額度兩個理由都要說");
  assert.equal(r.character, undefined);
  assert.equal(c.derived.willpower.current, 0);
});

test("同一個型態不能疊加——書上的「每場景一次」就是靠這一條表達的", () => {
  const c = withAbility(hero(), [進化形態]);
  const formId = formIdOf("test.血統", "進化形態");
  const first = activateForm(c, createFormsState(), formId);
  const second = activateForm(first.character, first.formsState, formId);
  assert.equal(second.ok, false);
  assert.equal(second.blockers[0].code, "已在進行中");
});

test("身上沒有的型態啟動不了", () => {
  const r = activateForm(hero(), createFormsState(), "不存在的:型態");
  assert.equal(r.ok, false);
  assert.equal(r.blockers[0].code, "沒有這個型態");
});

// ---------------------------------------------------------------------------
// 效果真的接到引擎(開了會變、關了會變回來)
// ---------------------------------------------------------------------------

test("型態開啟後 combatProfileFrom() 的防御真的變高，結束後真的變回來", () => {
  const c = withAbility(hero(), [進化形態]);
  const base = combatProfileFrom(c);
  assert.equal(base.equipmentDefense, 0, "沒變身時不該有任何裝備防御");

  const on = activateForm(c, createFormsState(), formIdOf("test.血統", "進化形態"));
  const buffed = combatProfileFrom(c, { extraSources: activeGrantSources(on.formsState) });
  assert.equal(buffed.equipmentDefense, 3);

  // 這個數字真的會進命中判定的 DC
  const dcBefore = computeDefenseDC({ agility: 3, perception: 3, equipmentDefense: base.equipmentDefense });
  const dcAfter = computeDefenseDC({ agility: 3, perception: 3, equipmentDefense: buffed.equipmentDefense });
  assert.equal(dcAfter - dcBefore, 3);

  const off = endScene(on.formsState);
  assert.equal(
    combatProfileFrom(c, { extraSources: activeGrantSources(off.formsState) }).equipmentDefense,
    0
  );
});

test("型態開啟後 weaponsFrom() 才拿得到天生武器", () => {
  const c = withAbility(hero(), [進化形態]);
  assert.deepEqual(weaponsFrom(c), [], "沒變身時手上什麼都沒有");

  const on = activateForm(c, createFormsState(), formIdOf("test.血統", "進化形態"));
  const weapons = weaponsFrom(c, { extraSources: activeGrantSources(on.formsState) });
  assert.equal(weapons.length, 1);
  assert.equal(weapons[0].weaponDamage, 3);
  assert.equal(weapons[0].severity, "L");
  assert.equal(weapons[0].attackType, "肉搏");
});

test("型態授予的無匹配鍵加骰對任何檢定都成立，而且真的改變 performCheck 的骰池", () => {
  const c = withAbility(hero(), [爆發]);
  const on = activateForm(c, createFormsState(), formIdOf("test.血統", "爆發"), { round: 1 });
  const extraSources = activeGrantSources(on.formsState);

  for (const check of [{ attribute: "感知", skill: "求生" }, { attribute: "力量", skill: "格鬥" }]) {
    assert.equal(checkModifiersFor(c, check, { extraSources }).dp, 2, "變身期間所有檢定都吃得到");
  }

  const mods = checkModifiersFor(c, { attribute: "感知", skill: "求生" }, { extraSources });
  const withForm = performCheck(c, {
    attribute: "感知",
    skill: "求生",
    otherDpModifier: mods.dp,
    diceOpts: { rollFn: () => 5 },
  });
  const without = performCheck(c, {
    attribute: "感知",
    skill: "求生",
    diceOpts: { rollFn: () => 5 },
  });
  assert.equal(withForm.dp - without.dp, 2);
});

// ---------------------------------------------------------------------------
// 到期：兩個時鐘都要真的走
// ---------------------------------------------------------------------------

test("以輪計時的型態：啟動當輪算第1輪，撐滿指定輪數後才失效", () => {
  const c = withAbility(hero(), [爆發]); // rounds: 2
  const formId = formIdOf("test.血統", "爆發");
  let { formsState } = activateForm(c, createFormsState(), formId, { round: 1 });

  formsState = tickFormsOnRound(formsState, 2).formsState;
  assert.equal(isFormActive(formsState, formId), true, "第2輪還在(啟動當輪＋1輪)");

  const ticked = tickFormsOnRound(formsState, 3);
  assert.equal(isFormActive(ticked.formsState, formId), false, "第3輪應該過期");
  assert.equal(ticked.expired[0].label, "爆發");
  assert.equal(checkModifiersFor(c, {}, { extraSources: activeGrantSources(ticked.formsState) }).dp, 0);
});

test("以場景計時的型態不會被輪數帶走(那是另一個時鐘)", () => {
  const c = withAbility(hero(), [進化形態]);
  const formId = formIdOf("test.血統", "進化形態");
  const { formsState } = activateForm(c, createFormsState(), formId, { round: 1 });
  assert.equal(isFormActive(tickFormsOnRound(formsState, 99).formsState, formId), true);
  assert.equal(isFormActive(endScene(formsState).formsState, formId), false);
});

test("場景結束會把以輪計時的型態一起收掉(戰鬥輪不會再前進，留著等於永不過期)", () => {
  const c = withAbility(hero(), [爆發]);
  const { formsState } = activateForm(c, createFormsState(), formIdOf("test.血統", "爆發"), { round: 1 });
  const ended = endScene(formsState, "戰鬥結束");
  assert.deepEqual(ended.formsState.active, []);
  assert.equal(ended.expired.length, 1);
});

test("以輪計時卻沒告訴它現在第幾輪，啟動會被擋下(不然它永遠不會到期)", () => {
  const c = withAbility(hero(), [爆發]);
  const r = activateForm(c, createFormsState(), formIdOf("test.血統", "爆發"));
  assert.equal(r.ok, false);
  assert.equal(r.blockers[0].code, "缺少輪數");
});

test("主動結束型態：加值立刻消失，意志力不退", () => {
  const c = withAbility(hero(), [進化形態]);
  const formId = formIdOf("test.血統", "進化形態");
  const on = activateForm(c, createFormsState(), formId);
  const off = deactivateForm(on.formsState, formId);
  assert.equal(isFormActive(off.formsState, formId), false);
  assert.equal(on.character.derived.willpower.current, c.derived.willpower.current - 1);
});

test("formsOf/describeActiveForms：貨架與敘事拿得到人看得懂的描述", () => {
  const c = withAbility(hero(), [進化形態, 爆發]);
  assert.deepEqual(
    formsOf(c).map((f) => f.effect.label),
    ["進化形態", "爆發"]
  );
  const { formsState } = activateForm(c, createFormsState(), formIdOf("test.血統", "爆發"), { round: 1 });
  assert.deepEqual(describeActiveForms(formsState, { round: 1 }), ["測試血統·爆發(還剩2輪)"]);
});

// ---------------------------------------------------------------------------
// 接到真的戰鬥迴圈上
// ---------------------------------------------------------------------------

test("戰鬥中變身：防御DC真的變高，天生武器真的可以拿來打", () => {
  const c = withAbility(hero(), [進化形態]);
  const combat = createEncounter(c);
  combat.order = ["player", "enemy"];
  combat.turnIndex = 0;

  const beforeDefense = playerCombatProfile(combat, c).equipmentDefense;
  assert.equal(beforeDefense, 0);
  assert.ok(!("test.血統:進化形態" in playerWeapons(combat, c)));

  const activation = resolveFormActivation(combat, c, formIdOf("test.血統", "進化形態"));
  assert.equal(activation.ok, true);
  const transformed = activation.character;

  assert.equal(playerCombatProfile(combat, transformed).equipmentDefense, 3);
  const weaponKey = "test.血統:進化形態:Orphnoch的手足(天生武器)";
  assert.ok(weaponKey in playerWeapons(combat, transformed), "變身後天生武器要出現在可用武器表");

  // 真的打得出去，而且用的是天生武器的傷害
  const { result } = resolvePlayerAttack(combat, transformed, weaponKey, {
    rollFn: () => ({ successes: 8, rolls: [], isFortuneDie: false, fumble: false }),
  });
  assert.equal(result.hit, true);
  assert.ok(result.finalDamage > 0);
});

test("戰鬥中變身會花掉移動動作，同一輪不能變身兩次", () => {
  const c = withAbility(hero(), [進化形態]);
  const combat = createEncounter(c);
  combat.order = ["player", "enemy"];
  combat.turnIndex = 0;

  const first = resolveFormActivation(combat, c, formIdOf("test.血統", "進化形態"));
  assert.equal(first.ok, true);
  assert.equal(combat.player.budget.moveAvailable, false);

  const second = resolveFormActivation(combat, first.character, formIdOf("test.血統", "進化形態"));
  assert.equal(second.ok, false);
  assert.ok(second.blockers.some((b) => b.code === "已在進行中"));
});

test("戰鬥結束時型態一起結束(場景結束)，並留下紀錄", () => {
  const c = withAbility(hero(), [進化形態]);
  const combat = createEncounter(c);
  combat.order = ["player", "enemy"];
  combat.turnIndex = 0;
  combat.enemy.hpState = { ...combat.enemy.hpState, max: 1, intact: 1, B: 0, L: 0, A: 0 };

  const activation = resolveFormActivation(combat, c, formIdOf("test.血統", "進化形態"));
  assert.equal(combat.forms.active.length, 1);

  resolvePlayerAttack(combat, activation.character, "unarmed", {
    rollFn: () => ({ successes: 20, rolls: [], isFortuneDie: false, fumble: false }),
  });
  assert.equal(combat.active, false, "敵人應該倒下");
  assert.deepEqual(combat.forms.active, [], "戰鬥結束＝場景結束，型態要收掉");
  assert.ok(combat.log.some((l) => l.event === "型態到期"));
});

test("舊存檔的 combat 沒有 forms 欄位時不會炸(型態是後來才加的)", () => {
  const c = hero();
  const legacy = { ...createEncounter(c) };
  delete legacy.forms;
  legacy.order = ["player", "enemy"];
  legacy.turnIndex = 0;
  assert.doesNotThrow(() => playerWeapons(legacy, c));
  assert.doesNotThrow(() =>
    resolvePlayerAttack(legacy, c, "unarmed", {
      rollFn: () => ({ successes: 2, rolls: [], isFortuneDie: false, fumble: false }),
    })
  );
});

// ---------------------------------------------------------------------------
// 真實商品：Orphnoch 從掛名轉正
// ---------------------------------------------------------------------------

test("Orphnoch 血統買下去之後，型態就在角色身上，而且可以啟動", async () => {
  const pack = (await import("../content/packs/shop-starter-bloodline.json", { with: { type: "json" } })).default;
  const good = pack.entries.find((e) => e.goodId === "bloodline.Orphnoch.D");

  assert.equal(good.status, "上架", "Orphnoch 應該已經不是掛名");
  assert.equal(validateGood(good).valid, true, validateGood(good).errors.join("\n"));

  const wallet = createWallet({ tokens: { D: 10 }, points: 5000 });
  const bought = purchase(hero(), wallet, good);
  assert.equal(bought.ok, true, JSON.stringify(bought.blockers));

  const forms = formsOf(bought.character);
  assert.equal(forms.length, 1);
  assert.equal(forms[0].effect.label, "進化形態");

  const on = activateForm(bought.character, createFormsState(), forms[0].formId);
  assert.equal(on.ok, true);
  assert.equal(
    combatProfileFrom(bought.character, { extraSources: activeGrantSources(on.formsState) }).equipmentDefense,
    3,
    "書上寫的3點天生防禦要真的出現"
  );
});

test("阿蘭斯的『帝國子民』從 droppedTraits 撿回來，變成一個真的會生效的型態", async () => {
  const pack = (await import("../content/packs/shop-starter-bloodline.json", { with: { type: "json" } })).default;
  const good = pack.entries.find((e) => e.goodId === "bloodline.阿蘭斯.D");

  assert.ok(
    !(good.droppedTraits ?? []).some((d) => d.trait.startsWith("帝國子民")),
    "帝國子民不該還留在 droppedTraits"
  );
  const form = good.effects.find((e) => e.kind === "型態");
  assert.equal(form.label, "帝國子民");
  assert.equal(form.activation.willpower, 1);
  assert.equal(form.duration.unit, "場景");

  const wallet = createWallet({ tokens: { D: 10 }, points: 5000 });
  const bought = purchase(hero(), wallet, good, {
    allocation: { 力量: 2, 敏捷: 2 },
  });
  assert.equal(bought.ok, true, JSON.stringify(bought.blockers));

  const formId = formIdOf(good.goodId, "帝國子民");
  const on = activateForm(bought.character, createFormsState(), formId);
  assert.equal(on.ok, true);
  assert.equal(
    checkModifiersFor(bought.character, { attribute: "感知", skill: "求生" }, {
      extraSources: activeGrantSources(on.formsState),
    }).dp,
    1,
    "『所有檢定+1』要真的加在檢定上"
  );
});

// ---------------------------------------------------------------------------
// 最後一段接線：API 進入點真的會把持有能力的加值算進去
//
// 這一組測試補的是一個先前一直存在的洞：checkModifiersFor() 寫好了、測好了，但
// functions/api/ 底下三個會呼叫 performCheck() 的地方沒有一個呼叫它，
// 於是整個「專長」貨架買下去在真實遊戲裡完全不生效。
// ---------------------------------------------------------------------------

test("applyCheckModifiers：把持有能力的加值加上去，而不是覆蓋呼叫端原本的情境調整", () => {
  const c = withAbility(hero(), [{ kind: "檢定加骰", skill: "求生", amount: 2 }]);
  const { params, modifiers } = applyCheckModifiers(c, {
    attribute: "感知",
    skill: "求生",
    otherDpModifier: -1, // 例如套路遞減之類的情境調整
  });
  assert.equal(params.otherDpModifier, 1, "-1 的情境調整與 +2 的能力加值要並存");
  assert.equal(modifiers.dp, 2);

  // 匹配不到的檢定不該被動到，連 params 物件都原樣回傳
  const untouched = applyCheckModifiers(c, { attribute: "力量", skill: "格鬥" });
  assert.equal(untouched.modifiers, null);
});

test("POST /api/check：買了加求生的專長之後，同一個檢定的骰池真的變大", async () => {
  const { onRequestPost: checkPost } = await import("../functions/api/check.js");
  const req = (body) => ({ request: { json: async () => body }, env: {} });
  const read = async (res) => JSON.parse(await res.text());

  const plain = hero();
  const params = { attribute: "感知", skill: "求生", dc: 3 };

  const before = await read(await checkPost(req({ character: plain, params })));
  const after = await read(
    await checkPost(
      req({ character: withAbility(plain, [{ kind: "檢定加骰", skill: "求生", amount: 2 }]), params })
    )
  );

  assert.equal(before.ok, true);
  assert.equal(after.ok, true);
  assert.equal(after.result.dp - before.result.dp, 2, "專長的加值要真的進到骰池");
  assert.match(after.abilityModifiers.sources.join(), /測試血統/);
});
