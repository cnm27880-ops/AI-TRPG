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
import { ATTACK_TYPES, ATTACK_CHECK_KEYS, attackCheckKeys } from "../core/combat/attackTypes.js";
import { createActionBudget, useMove } from "../core/combat/actionEconomy.js";
import {
  validateEffect,
  checkModifiersFor,
  combatProfileFrom,
  weaponsFrom,
  applyCheckModifiers,
  attackModifiersFor,
} from "../content/shop/effects.js";
import { validateGood, purchase, evaluatePurchase } from "../content/shop/catalog.js";
import { baseCapacity, openPool, spendEnergy, POOL_DEFS, REJECTED_POOLS } from "../core/energyPools.js";
import { ATTRIBUTES } from "../core/schema.js";
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
  endCombat,
  expireOnSceneChange,
  formsForScene,
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

/**
 * 打完一場架：把敵人設成一擊必倒，然後打他一下。
 * alreadyActive=true 代表型態是戰鬥外就開好帶進來的，這裡不用再啟動一次。
 */
function 一擊結束戰鬥(combat, character, formId, { alreadyActive = false } = {}) {
  combat.order = ["player", "enemy"];
  combat.turnIndex = 0;
  combat.enemy.hpState = { ...combat.enemy.hpState, max: 1, intact: 1, B: 0, L: 0, A: 0 };
  let attacker = character;
  if (!alreadyActive) {
    const activation = resolveFormActivation(combat, character, formId);
    assert.equal(activation.ok, true, JSON.stringify(activation.blockers));
    attacker = activation.character;
  }
  assert.equal(combat.forms.active.length, 1, "型態要先真的在進行中");
  resolvePlayerAttack(combat, attacker, "unarmed", {
    rollFn: () => ({ successes: 20, rolls: [], isFortuneDie: false, fumble: false }),
  });
  assert.equal(combat.active, false, "敵人應該倒下");
}

test("戰鬥結束收掉以「輪」計時的型態(戰鬥外沒有輪可以數)", () => {
  const c = withAbility(hero(), [爆發]);
  const combat = createEncounter(c);
  一擊結束戰鬥(combat, c, formIdOf("test.血統", "爆發"));
  assert.deepEqual(combat.forms.active, [], "以輪計時的型態留到戰鬥外就永遠不會到期");
  assert.ok(combat.log.some((l) => l.event === "型態到期"));
});

test("戰鬥結束**不會**收掉以「場景」計時的型態——打一場架不會改變你站在哪裡", () => {
  // [使用者決定 2026-08-17] 場景＝當下所在的地點。這則測試守的就是那句話：
  // 先前這裡的規則是「戰鬥結束＝場景結束」，在場景有定義之後那是錯的。
  const c = withAbility(hero(), [進化形態]);
  const combat = createEncounter(c);
  一擊結束戰鬥(combat, c, formIdOf("test.血統", "進化形態"));
  assert.equal(combat.forms.active.length, 1, "變身要撐得過一場戰鬥");
  assert.equal(combat.forms.active[0].label, "進化形態");
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

// ---------------------------------------------------------------------------
// 攻擊路徑也查效果表 ＋ 複數匹配鍵 ＋ scope
//
// 補的是另一個「同一個加值兩種行為」的洞：商品的檢定加值先前只影響敘事迴圈的檢定，
// 戰鬥攻擊完全吃不到，因為攻擊走的是 resolveCombatAction()/attackTypes.js。
// ---------------------------------------------------------------------------

test("ATTACK_CHECK_KEYS：七種攻擊方式都指得出自己算的是哪一組屬性＋技能", () => {
  const attackTypes = Object.keys(ATTACK_TYPES);
  for (const type of attackTypes) {
    const keys = attackCheckKeys(type);
    assert.ok(keys.attribute && keys.skill, `${type} 沒有對應的屬性/技能`);
  }
  assert.equal(Object.keys(ATTACK_CHECK_KEYS).length, attackTypes.length, "兩張表必須一一對應");
  assert.deepEqual(attackCheckKeys("肉搏"), { attribute: "力量", skill: "格鬥" });
  assert.deepEqual(attackCheckKeys("炮"), { attribute: "智力", skill: "射擊" });
});

test("attackModifiersFor：匹配規則跟一般檢定完全一樣，只是鍵來自攻擊方式", () => {
  const c = withAbility(hero(), [{ kind: "檢定加骰", skill: "格鬥", amount: 2 }]);
  assert.equal(attackModifiersFor(c, "肉搏").dp, 2, "肉搏算格鬥，應該吃得到");
  assert.equal(attackModifiersFor(c, "槍械").dp, 0, "槍械算射擊，不該吃到格鬥的加值");
});

test("複數匹配鍵：「生理系屬性」寫得出來，而且只命中那三個", () => {
  const 生理系 = { kind: "檢定加骰", amount: 2, attributes: ["力量", "敏捷", "耐力"] };
  assert.deepEqual(validateEffect(生理系), []);
  const c = withAbility(hero(), [生理系]);
  assert.equal(checkModifiersFor(c, { attribute: "力量" }).dp, 2);
  assert.equal(checkModifiersFor(c, { attribute: "敏捷" }).dp, 2);
  assert.equal(checkModifiersFor(c, { attribute: "智力" }).dp, 0, "心智系不該吃到");

  // 複數鍵裡出現不存在的屬性一樣要被擋
  assert.match(
    validateEffect({ kind: "檢定加骰", amount: 1, attributes: ["力量", "決心"] })[0],
    /不是六維之一/
  );
});

test("scope：攻擊限定的加值不會外溢到一般檢定，反之亦然", () => {
  const 攻擊限定 = withAbility(hero(), [{ kind: "檢定加骰", amount: 2, scope: "攻擊", attribute: "力量" }]);
  assert.equal(attackModifiersFor(攻擊限定, "肉搏").dp, 2);
  assert.equal(checkModifiersFor(攻擊限定, { attribute: "力量" }).dp, 0, "攻擊限定不該加在搬箱子上");

  const 檢定限定 = withAbility(hero(), [{ kind: "檢定加骰", amount: 2, scope: "檢定", attribute: "力量" }]);
  assert.equal(checkModifiersFor(檢定限定, { attribute: "力量" }).dp, 2);
  assert.equal(attackModifiersFor(檢定限定, "肉搏").dp, 0);

  // 沒寫 scope = 全部，兩邊都算(既有商品的行為不變)
  const 全部 = withAbility(hero(), [{ kind: "檢定加骰", amount: 2, attribute: "力量" }]);
  assert.equal(attackModifiersFor(全部, "肉搏").dp, 2);
  assert.equal(checkModifiersFor(全部, { attribute: "力量" }).dp, 2);

  assert.match(validateEffect({ kind: "檢定加骰", amount: 1, attribute: "力量", scope: "隨便" })[0], /scope/);
  assert.match(validateEffect({ kind: "防御", amount: 1, scope: "攻擊" })[0], /不該有 scope/);
});

test("攻擊加值真的進到戰鬥的骰池裡(不是只有查表函式知道)", () => {
  const plain = hero();
  const buffed = withAbility(plain, [{ kind: "檢定加骰", amount: 3, scope: "攻擊", skill: "格鬥" }]);

  // 用同一個固定骰子函式打兩次，只有骰池大小不同
  const seen = [];
  const rollFn = (dp) => {
    seen.push(dp);
    return { successes: 5, rolls: [], isFortuneDie: false, fumble: false };
  };

  for (const character of [plain, buffed]) {
    const combat = createEncounter(character);
    combat.order = ["player", "enemy"];
    combat.turnIndex = 0;
    resolvePlayerAttack(combat, character, "unarmed", { rollFn });
  }

  assert.equal(seen[1] - seen[0], 3, "買了加格鬥的商品，肉搏攻擊的骰池就該大3");
});

test("EVOL 的『攻擊強化』撿回來之後，開了才有、只加在攻擊上、一輪後失效", async () => {
  const pack = (await import("../content/packs/shop-starter-cybernetic.json", { with: { type: "json" } })).default;
  const good = pack.entries.find((e) => e.goodId === "cybernetic.假面騎士EVOL.D");
  assert.equal(validateGood(good).valid, true, validateGood(good).errors.join("\n"));
  assert.ok(
    !(good.droppedTraits ?? []).some((d) => d.trait.startsWith("攻擊強化")),
    "攻擊強化不該還留在 droppedTraits"
  );

  const owner = { ...hero(), abilities: [{ goodId: good.goodId, name: good.name, effects: good.effects }] };
  const formId = formIdOf(good.goodId, "攻擊強化");

  assert.equal(attackModifiersFor(owner, "肉搏").dp, 0, "沒開之前不該有加值");

  const on = activateForm(owner, createFormsState(), formId, { round: 1 });
  assert.equal(on.ok, true, JSON.stringify(on.blockers));
  const extraSources = activeGrantSources(on.formsState);

  assert.equal(attackModifiersFor(owner, "肉搏", { extraSources }).dp, 2, "力量系攻擊 +2");
  assert.equal(attackModifiersFor(owner, "炮", { extraSources }).dp, 0, "炮走智力，不是生理系");
  assert.equal(
    checkModifiersFor(owner, { attribute: "力量", skill: "格鬥" }, { extraSources }).dp,
    0,
    "只加在攻擊上，不加在一般力量檢定上"
  );

  // 持續1輪：第2輪開始就沒了
  const ticked = tickFormsOnRound(on.formsState, 2);
  assert.equal(attackModifiersFor(owner, "肉搏", { extraSources: activeGrantSources(ticked.formsState) }).dp, 0);
});

// ---------------------------------------------------------------------------
// 能量池：追池子來源之後，青蓮劍歌總決那一整條鏈真的接得起來
//
// 這一組是使用者選的『A：往上追池子的來源』的驗收。鏈是這樣的：
//   買混元劍經 → 開劍氣池(上限＝敏捷+感知) → 買青蓮劍歌總決 → 支付1點劍氣變出劍
// 任何一環斷掉，最後那把劍就變不出來。
// ---------------------------------------------------------------------------

test("能量池上限＝關鍵屬性之和(書上原文的公式)", () => {
  const attrs = { 敏捷: 3, 感知: 4, 耐力: 2, 力量: 1, 智力: 1, 意志: 1 };
  assert.equal(baseCapacity("劍氣", attrs), 7, "劍氣＝敏捷+感知");
  assert.equal(baseCapacity("查克拉", attrs), 6, "查克拉＝耐力+感知");
  assert.throws(() => baseCapacity("不存在的池", attrs), /沒有登錄的能量池/);
});

test("重複開啟同一個池子的補償是 +5/+3/+1/+1，而且同一個來源不算重複", () => {
  const attrs = { 敏捷: 3, 感知: 3 };
  let pools = openPool({}, "劍氣", attrs, "來源A");
  assert.equal(pools.劍氣.max, 6);

  pools = openPool(pools, "劍氣", attrs, "來源A");
  assert.equal(pools.劍氣.max, 6, "同一個來源開兩次不算重複開啟");

  pools = openPool(pools, "劍氣", attrs, "來源B");
  assert.equal(pools.劍氣.max, 11, "第一次重複 +5");
  pools = openPool(pools, "劍氣", attrs, "來源C");
  assert.equal(pools.劍氣.max, 14, "第二次重複 +3");
  pools = openPool(pools, "劍氣", attrs, "來源D");
  assert.equal(pools.劍氣.max, 15, "第三次 +1");
});

test("上限變大時多出來的是空的，不是免費補滿(容器變大，內容物沒變)", () => {
  const attrs = { 敏捷: 3, 感知: 3 };
  let pools = openPool({}, "劍氣", attrs, "來源A");
  pools = spendEnergy(pools, "劍氣", 4).pools;
  assert.equal(pools.劍氣.current, 2);
  pools = openPool(pools, "劍氣", attrs, "來源B");
  assert.equal(pools.劍氣.max, 11);
  assert.equal(pools.劍氣.current, 2, "開新來源不該順便回血");
});

test("能量不夠就整筆不成立，不扣一半", () => {
  const pools = openPool({}, "劍氣", { 敏捷: 1, 感知: 1 }, "x");
  const fail = spendEnergy(pools, "劍氣", 5);
  assert.equal(fail.ok, false);
  assert.equal(fail.shortfall, 3);
  assert.equal(fail.pools.劍氣.current, 2, "失敗時不能動到池子");
});

test("買混元劍經真的會在角色卡上開出劍氣池", async () => {
  const pack = (await import("../content/packs/shop-starter-pools.json", { with: { type: "json" } })).default;
  const good = pack.entries.find((e) => e.goodId === "pool.混元劍經.1");
  assert.equal(validateGood(good).valid, true, validateGood(good).errors.join("\n"));

  const buyer = hero(); // 敏捷3 感知3
  const bought = purchase(buyer, createWallet({ tokens: { D: 2 }, points: 2000 }), good);
  assert.equal(bought.ok, true, JSON.stringify(bought.blockers));
  assert.equal(bought.character.derived.energyPools.劍氣.max, 6, "敏捷3+感知3");
  assert.equal(bought.character.derived.energyPools.劍氣.current, 6);
});

test("整條鏈：混元劍經 → 劍氣池 → 青蓮劍歌總決 → 支付1點劍氣變出6L的劍", async () => {
  const pools = (await import("../content/packs/shop-starter-pools.json", { with: { type: "json" } })).default;
  const school = (await import("../content/packs/shop-starter-school.json", { with: { type: "json" } })).default;
  const 混元劍經 = pools.entries.find((e) => e.goodId === "pool.混元劍經.1");
  const 青蓮 = school.entries.find((e) => e.name.includes("青蓮劍歌"));

  assert.equal(青蓮.status, "上架", "青蓮劍歌總決應該已經不是掛名");

  // 沒有先買混元劍經 → 前提擋下
  const wallet = createWallet({ tokens: { D: 5 }, points: 9000 });
  const blocked = evaluatePurchase(hero(), wallet, 青蓮);
  assert.equal(blocked.ok, false);
  assert.ok(
    blocked.blockers.some((b) => b.message.includes("混元劍經")),
    "前提要真的擋得住，不能只寫在註解裡"
  );

  // 買混元劍經 → 再買青蓮
  const step1 = purchase(hero(), wallet, 混元劍經);
  assert.equal(step1.ok, true, JSON.stringify(step1.blockers));
  const step2 = purchase(step1.character, step1.wallet, 青蓮);
  assert.equal(step2.ok, true, JSON.stringify(step2.blockers));

  const character = step2.character;
  const formId = formIdOf(青蓮.goodId, "劍氣化碧");

  // 變身前沒有劍
  assert.deepEqual(weaponsFrom(character), []);

  const on = activateForm(character, createFormsState(), formId, { round: 1 });
  assert.equal(on.ok, true, JSON.stringify(on.blockers));
  assert.equal(on.character.derived.energyPools.劍氣.current, 5, "支付1點劍氣");

  const weapons = weaponsFrom(character, { extraSources: activeGrantSources(on.formsState) });
  assert.equal(weapons.length, 1);
  assert.equal(weapons[0].weaponDamage, 6, "書上寫武器傷害6L");
  assert.equal(weapons[0].severity, "L");

  // 持續感知值*1輪 = 3輪(hero 的感知是3)：第4輪才過期
  assert.equal(on.form.expiresAfterRound, 3);
  assert.equal(isFormActive(tickFormsOnRound(on.formsState, 3).formsState, formId), true);
  assert.equal(isFormActive(tickFormsOnRound(on.formsState, 4).formsState, formId), false);
});

test("劍氣用完就變不出劍了(能量池是真的會見底的)", async () => {
  const pools = (await import("../content/packs/shop-starter-pools.json", { with: { type: "json" } })).default;
  const school = (await import("../content/packs/shop-starter-school.json", { with: { type: "json" } })).default;
  const wallet = createWallet({ tokens: { D: 5 }, points: 9000 });
  const step1 = purchase(hero(), wallet, pools.entries.find((e) => e.goodId === "pool.混元劍經.1"));
  const step2 = purchase(step1.character, step1.wallet, school.entries.find((e) => e.name.includes("青蓮劍歌")));

  const drained = {
    ...step2.character,
    derived: {
      ...step2.character.derived,
      energyPools: { ...step2.character.derived.energyPools, 劍氣: { ...step2.character.derived.energyPools.劍氣, current: 0 } },
    },
  };
  const r = activateForm(drained, createFormsState(), formIdOf("school.青蓮劍歌總決.D", "劍氣化碧"), { round: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.blockers[0].code, "能量不足");
});

// ---------------------------------------------------------------------------
// 能量池第二輪(2026-08-17)：查克拉與內力兩條鏈
//
// 第一條鏈(劍氣)證明的是「機制接得起來」。這一組證明的是另一件事——**機制做好之後，
// 追新的池子只剩抄兩個屬性名的成本**：下面兩條鏈沒有為它們新增任何一行引擎程式碼，
// 查克拉鏈甚至連新效果種類都沒用到，它整條都是既有詞彙表拼出來的。
//
// 順便，這裡出現了第一個「同一個池子有兩個獨立來源」的實例(忍者與寫輪眼都開查克拉)，
// 於是 REOPEN_BONUSES 的 +5 第一次有了真實的消費端，而不是只在單元測試裡被驗算。
// ---------------------------------------------------------------------------

/** 一個滿足忍者技能前提的角色(運動/隱藏/神秘學/白刃/肉搏/求生 → 體魄/潛行/秘識/格鬥/求生)。 */
function 忍者學徒() {
  const c = hero();
  c.skills = { ...c.skills, 體魄: 1, 潛行: 1, 秘識: 1, 格鬥: 2, 求生: 3 };
  return c;
}

async function 池子來源包() {
  return (await import("../content/packs/shop-starter-pools.json", { with: { type: "json" } })).default;
}

test("內力也登錄了關鍵屬性，而且跟查克拉是同一組(書上說兩者運作方式幾乎一致)", () => {
  const attrs = { 感知: 4, 耐力: 2, 敏捷: 3 };
  assert.equal(baseCapacity("內力", attrs), 6, "內力＝感知+耐力");
  assert.equal(baseCapacity("查克拉", attrs), 6, "查克拉＝耐力+感知，同一組屬性");
});

test("查過但收不了的池子留在 REJECTED_POOLS，每一筆都說得出行號與『為什麼不可能』", () => {
  const 六維 = new Set(ATTRIBUTES.map((a) => a.key));
  assert.ok(Object.keys(REJECTED_POOLS).length > 0, "查證過的否定結論要留下來，不然下一個人會再查一次");
  for (const [name, def] of Object.entries(REJECTED_POOLS)) {
    assert.ok(!POOL_DEFS[name], `「${name}」不可以同時出現在 POOL_DEFS 與 REJECTED_POOLS`);
    assert.match(def.sourceRef, /rules-2\.35\.txt 第\d+行/, `「${name}」的 sourceRef 沒有行號`);
    assert.ok(
      def.keyAttributes.some((a) => !六維.has(a)),
      `「${name}」被否決的理由必須是「關鍵屬性不在六維裡」——如果兩個都在六維裡，那它應該被收下`
    );
  }
});

test("REJECTED_POOLS 指名擋住的商品，確實還掛在掛名狀態(否決清單不是寫爽的)", async () => {
  const cybernetic = (await import("../content/packs/shop-starter-cybernetic.json", { with: { type: "json" } })).default;
  const all = cybernetic.entries;
  for (const def of Object.values(REJECTED_POOLS)) {
    for (const goodId of def.blocks ?? []) {
      const good = all.find((g) => g.goodId === goodId);
      assert.ok(good, `REJECTED_POOLS 指到一件不存在的商品：${goodId}`);
      assert.equal(good.status, "掛名", `${good.name} 的池子被否決了，它不該是上架狀態`);
    }
  }
});

test("忍者的技能前提真的擋得住(六項原文前提對映成五項十技能)", async () => {
  const pack = await 池子來源包();
  const 忍者 = pack.entries.find((e) => e.goodId === "title.忍者.D");
  assert.equal(validateGood(忍者).valid, true, validateGood(忍者).errors.join("\n"));

  const wallet = createWallet({ tokens: { D: 3 }, points: 3000 });
  const 素人 = evaluatePurchase(hero(), wallet, 忍者); // hero 只有格鬥與求生
  assert.equal(素人.ok, false);
  assert.equal(素人.blockers.filter((b) => b.code === "前提不足").length, 3, "缺體魄/潛行/秘識三項");

  assert.equal(evaluatePurchase(忍者學徒(), wallet, 忍者).ok, true);
});

test("整條鏈：忍者 → 查克拉池 → 寫輪眼(第二個來源，上限+5) → 洞察眼開眼", async () => {
  const pack = await 池子來源包();
  const dojutsu = (await import("../content/packs/shop-starter-dojutsu.json", { with: { type: "json" } })).default;
  const 忍者 = pack.entries.find((e) => e.goodId === "title.忍者.D");
  const 寫輪眼 = dojutsu.entries.find((e) => e.goodId === "dojutsu.寫輪眼.D");

  assert.equal(寫輪眼.status, "上架", "寫輪眼應該已經不是掛名");

  const wallet = createWallet({ tokens: { D: 5 }, points: 9000 });
  const step1 = purchase(忍者學徒(), wallet, 忍者);
  assert.equal(step1.ok, true, JSON.stringify(step1.blockers));
  assert.equal(step1.character.derived.energyPools.查克拉.max, 6, "耐力3+感知3");
  assert.equal(combatProfileFrom(step1.character).initiativeBonus, 3, "神速：先攻+3");

  // 第二個**獨立來源**開同一個池子 → 書上的重複開啟補償 +5
  const step2 = purchase(step1.character, step1.wallet, 寫輪眼);
  assert.equal(step2.ok, true, JSON.stringify(step2.blockers));
  const 池 = step2.character.derived.energyPools.查克拉;
  assert.equal(池.max, 11, "忍者與寫輪眼是兩個不同來源，第一次重複開啟 +5");
  assert.equal(池.current, 6, "上限變大不等於補滿");
  assert.deepEqual(池.sources, ["title.忍者.D", "dojutsu.寫輪眼.D"]);

  const character = step2.character;
  const formId = formIdOf(寫輪眼.goodId, "洞察眼");

  // 開眼前：攻擊與防御都沒有加值
  assert.equal(attackModifiersFor(character, "肉搏").dp, 0);
  assert.equal(combatProfileFrom(character).equipmentDefense, 0);

  // 開眼要花一個標準動作＋1點查克拉
  const budget = createActionBudget();
  const on = activateForm(character, createFormsState(), formId, { round: 1, budget });
  assert.equal(on.ok, true, JSON.stringify(on.blockers));
  assert.equal(on.character.derived.energyPools.查克拉.current, 5, "支付1點查克拉");
  assert.equal(on.budget.standardAvailable, false, "標準動作被用掉了");

  const extraSources = activeGrantSources(on.formsState);
  assert.equal(attackModifiersFor(character, "肉搏", { extraSources }).dp, 2, "開眼期間攻擊+2DP");
  assert.equal(attackModifiersFor(character, "炮", { extraSources }).dp, 2, "書上沒有限定攻擊方式");
  assert.equal(
    checkModifiersFor(character, { attribute: "感知", skill: "偵察" }, { extraSources }).dp,
    0,
    "scope 是「攻擊」，一般檢定吃不到"
  );
  assert.equal(combatProfileFrom(character, { extraSources }).equipmentDefense, 2, "開眼期間防御+2");

  // 持續一個場景：場景結束就收乾淨
  const ended = endScene(on.formsState);
  assert.equal(isFormActive(ended.formsState, formId), false);
  assert.equal(combatProfileFrom(character, { extraSources: activeGrantSources(ended.formsState) }).equipmentDefense, 0);
});

test("查克拉見底時開不了眼(洞察眼跟劍氣化碧受同一條約定管)", async () => {
  const dojutsu = (await import("../content/packs/shop-starter-dojutsu.json", { with: { type: "json" } })).default;
  const 寫輪眼 = dojutsu.entries.find((e) => e.goodId === "dojutsu.寫輪眼.D");
  const bought = purchase(hero(), createWallet({ tokens: { D: 2 }, points: 2000 }), 寫輪眼);
  assert.equal(bought.ok, true, JSON.stringify(bought.blockers));

  const drained = {
    ...bought.character,
    derived: {
      ...bought.character.derived,
      energyPools: { 查克拉: { ...bought.character.derived.energyPools.查克拉, current: 0 } },
    },
  };
  const r = activateForm(drained, createFormsState(), formIdOf(寫輪眼.goodId, "洞察眼"), { round: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.blockers[0].code, "能量不足");
});

test("內力鏈：內力心法開池，葵花寶典是第二個來源——書上寫的+5就是通則算出來的+5", async () => {
  const pack = await 池子來源包();
  const technique = (await import("../content/packs/shop-starter-technique.json", { with: { type: "json" } })).default;
  const 內力心法 = pack.entries.find((e) => e.goodId === "technique.內力心法.D");
  const 葵花寶典 = technique.entries.find((e) => e.goodId === "technique.葵花寶典.1");

  const wallet = createWallet({ tokens: { D: 5 }, points: 9000 });
  const step1 = purchase(hero(), wallet, 內力心法);
  assert.equal(step1.ok, true, JSON.stringify(step1.blockers));
  assert.equal(step1.character.derived.energyPools.內力.max, 6, "感知3+耐力3");

  // 葵花寶典原文：「獲得D級內力…若已擁有內力則使內力上限提高5點」。
  // 那個 5 沒有寫在商品資料裡任何一個欄位，是 REOPEN_BONUSES[0] 算出來的。
  const step2 = purchase(step1.character, step1.wallet, 葵花寶典);
  assert.equal(step2.ok, true, JSON.stringify(step2.blockers));
  assert.equal(step2.character.derived.energyPools.內力.max, 11, "書上的+5＝通則的第一次重複開啟補償");

  // 反過來也成立：只買葵花寶典的人，內力池是基礎上限
  const 單買 = purchase(hero(), wallet, 葵花寶典);
  assert.equal(單買.character.derived.energyPools.內力.max, 6);
});

// ---------------------------------------------------------------------------
// 戰鬥外的型態：場景 ＝ 當下所在的地點（使用者決定 2026-08-17）
//
// 這一組守的是「session.forms 不再是一個沒有消費端的欄位」。在此之前存檔裡有這個欄位、
// 商店頁也列得出可啟動的型態，但戰鬥外沒有任何東西啟動得了它、也沒有任何東西讓它到期——
// 而一個不會到期的「持續一個場景」就是永久加值，正是 forms.js 整個設計在避開的事。
// ---------------------------------------------------------------------------

test("戰鬥外啟動場景型態會記下當下的地點", () => {
  const c = withAbility(hero(), [進化形態]);
  const on = activateForm(c, createFormsState(), formIdOf("test.血統", "進化形態"), {
    sceneKey: "恐怖片中:p1:n1",
  });
  assert.equal(on.ok, true, JSON.stringify(on.blockers));
  assert.equal(on.formsState.active[0].sceneKey, "恐怖片中:p1:n1");
});

test("換地點 → 場景型態到期；留在原地 → 繼續有效", () => {
  const c = withAbility(hero(), [進化形態]);
  const formId = formIdOf("test.血統", "進化形態");
  const on = activateForm(c, createFormsState(), formId, { sceneKey: "恐怖片中:p1:n1" });

  // 還在同一個地點：加值照樣查得到
  const same = formsForScene(on.formsState, "恐怖片中:p1:n1");
  assert.deepEqual(same.expired, []);
  assert.equal(combatProfileFrom(c, { extraSources: same.extraSources }).equipmentDefense, 3);

  // 推進到下一個節點：到期，加值跟著不見
  const moved = formsForScene(on.formsState, "恐怖片中:p1:n2");
  assert.equal(moved.expired.length, 1);
  assert.equal(isFormActive(moved.formsState, formId), false);
  assert.equal(combatProfileFrom(c, { extraSources: moved.extraSources }).equipmentDefense, 0);
  assert.match(moved.formsState.log.at(-1).reason, /離開了啟動時所在的地點/);
});

test("回到主神空間也是一次換場(副本裡開的眼會關掉)", () => {
  const c = withAbility(hero(), [進化形態]);
  const on = activateForm(c, createFormsState(), formIdOf("test.血統", "進化形態"), {
    sceneKey: "恐怖片中:p1:n1",
  });
  assert.equal(formsForScene(on.formsState, "主神空間").expired.length, 1);
});

test("以「輪」計時的型態不歸換場管(它由戰鬥的輪時鐘收)", () => {
  // 戰鬥外啟動不了以輪計時的型態：沒有輪可以數，activateForm 會擋下來。
  const c = withAbility(hero(), [爆發]);
  const outOfCombat = activateForm(c, createFormsState(), formIdOf("test.血統", "爆發"), {
    sceneKey: "恐怖片中:p1:n1",
  });
  assert.equal(outOfCombat.ok, false);
  assert.equal(outOfCombat.blockers[0].code, "缺少輪數");

  // 戰鬥中啟動的那一份，換場檢查不該碰它(免得同一個型態被兩個時鐘各收一次)
  const inCombat = activateForm(c, createFormsState(), formIdOf("test.血統", "爆發"), { round: 1 });
  assert.equal(inCombat.ok, true);
  assert.deepEqual(formsForScene(inCombat.formsState, "任何地點").expired, []);
});

test("endCombat 只收輪型態，場景型態撐得過收兵", () => {
  const c = withAbility(hero(), [進化形態, 爆發]);
  let state = createFormsState();
  state = activateForm(c, state, formIdOf("test.血統", "進化形態"), { sceneKey: "恐怖片中:p1:n1" }).formsState;
  const withBoth = activateForm(c, state, formIdOf("test.血統", "爆發"), { round: 1, sceneKey: "恐怖片中:p1:n1" });
  assert.equal(withBoth.formsState.active.length, 2);

  const after = endCombat(withBoth.formsState);
  assert.equal(after.expired.length, 1);
  assert.equal(after.expired[0].label, "爆發");
  assert.equal(after.formsState.active.length, 1);
  assert.equal(after.formsState.active[0].label, "進化形態", "變身撐得過一場戰鬥");
});

test("一整條戰鬥外的路徑：變身 → 打一場架 → 收兵仍在 → 換節點才結束", () => {
  const c = withAbility(hero(), [進化形態]);
  const formId = formIdOf("test.血統", "進化形態");

  // 1) 戰鬥外變身
  const on = activateForm(c, createFormsState(), formId, { sceneKey: "恐怖片中:p1:n1" });
  assert.equal(on.ok, true);

  // 2) 帶著它開戰(這是 combat/start.js 現在做的事)
  const combat = createEncounter(on.character, undefined, { forms: on.formsState });
  assert.equal(combat.forms.active.length, 1, "開戰時型態要跟著進去");
  assert.equal(playerCombatProfile(combat, on.character).equipmentDefense, 3, "戰鬥中吃得到加值");

  // 3) 打完收兵(finalizeIfOver → endCombat)，型態還在
  一擊結束戰鬥(combat, on.character, formIdOf("test.血統", "進化形態"), { alreadyActive: true });
  assert.equal(combat.forms.active.length, 1, "收兵不該讓變身消失");

  // 4) 推進節點才真的結束
  const moved = formsForScene(combat.forms, "恐怖片中:p1:n2");
  assert.equal(moved.expired.length, 1);
});
