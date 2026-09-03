// Combat V2 —— 型態（變身／開眼／爆發）接進戰鬥系統的測試。
//
// 這一份問的核心問題是：**同一套型態規則，在 V1 與 V2 裡的行為一不一樣。**
// 型態的規則本身在 test/shopForms.test.js 已經測透了，這裡測的是 V2 這一側的接線——
// 動作等級的對映、額度扣在 V2 的計數池上、維持成本在跨輪時真的收得到、
// 以及扣掉的意志力／能量池有沒有被接住（沒接住的話型態會變成免費的）。
import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { computeDerivedStats } from "../core/derivedStats.js";
import { openPool } from "../core/energyPools.js";
import { SHOP_GOODS } from "../content/shop/registry.js";
import { startBattleV2 } from "../content/combat/v2/battleFactory.js";
import { buildFormActionDefinitions, isFormActionId, parseFormActionId } from "../content/combat/v2/formActions.js";
import { getAvailableCombatActions } from "../core/combat/v2/availableActions.js";
import { resolveTurn, validateSelection, TurnValidationError } from "../core/combat/v2/resolveTurn.js";
import { toPublicBattle } from "../core/combat/v2/publicState.js";
import { LEGACY_ACTION_LEVEL_TO_V2, fromLegacyActionLevel } from "../core/combat/v2/actionTypes.js";
import { performAttack } from "../core/combat/v2/resolveAction.js";
import { beginNextRound, livePlayerCombatProfile } from "../core/combat/v2/battleState.js";
import { combatProfileFrom } from "../content/shop/effects.js";
import { activeGrantSources } from "../content/shop/forms.js";

const 葵花 = SHOP_GOODS.find((g) => g.goodId === "technique.葵花寶典.1");   // 鬼魅身：迅捷＋1內力，有維持成本
const 混元 = SHOP_GOODS.find((g) => g.goodId === "pool.混元劍經.1");        // 劍氣：自由＋可變量，二選一

const 阿蘭斯 = {
  goodId: "mock.阿蘭斯.D",
  name: "阿蘭斯",
  effects: [{
    kind: "型態",
    label: "帝國子民",
    activation: { action: "標準", willpower: 1 },
    duration: { unit: "場景" },
    grants: [{ kind: "檢定加骰", amount: 1 }]
  }]
};

const 寫輪眼 = SHOP_GOODS.find((g) => g.goodId === "dojutsu.寫輪眼.D");      // 洞察眼：標準＋1查克拉

/** 一張買好那幾件商品、池子也開好的角色卡（買賣流程有自己的測試，這裡不重跑）。 */
function 帶型態的角色卡({ goods = [葵花, 混元, 阿蘭斯], 內力, 劍氣 } = {}) {
  const c = emptyCharacter("型態測試");
  Object.assign(c.attributes, { 力量: 4, 敏捷: 4, 耐力: 4, 智力: 3, 感知: 3, 意志: 3 });
  Object.assign(c.skills, { 格鬥: 3, 射擊: 3, 體魄: 2 });
  c.derived = computeDerivedStats(c.attributes, { size: 5 });
  c.abilities = goods.map((g) => ({ goodId: g.goodId, name: g.name, effects: g.effects }));
  let pools = {};
  if (goods.includes(混元)) pools = openPool(pools, "劍氣", c.attributes, 混元.goodId);
  if (goods.includes(葵花)) pools = openPool(pools, "內力", c.attributes, 葵花.goodId);
  if (goods.includes(寫輪眼)) pools = openPool(pools, "查克拉", c.attributes, 寫輪眼.goodId);
  if (Number.isInteger(內力) && pools.內力) pools.內力 = { ...pools.內力, current: 內力 };
  if (Number.isInteger(劍氣) && pools.劍氣) pools.劍氣 = { ...pools.劍氣, current: 劍氣 };
  c.derived.energyPools = pools;
  return c;
}

function battleWith(character, opts = {}) {
  const battle = startBattleV2({ character, battleId: "form_test", forms: opts.forms, seed: opts.seed ?? 4242, sceneKey: "test_scene" });
  if (opts.startRange) battle.ranges[Object.keys(battle.ranges)[0]] = opts.startRange;
  return battle;
}

const 鬼魅身 = "form:technique.葵花寶典.1:鬼魅身";
const 劍氣攻 = "form:pool.混元劍經.1:劍氣@攻";
const 帝國子民 = "form:mock.阿蘭斯.D:帝國子民";

// --- 動作等級對映 ---

test("舊資料的六個動作等級都對映得出來，「自由」映成迅捷而不是零消耗", () => {
  assert.deepEqual(Object.keys(LEGACY_ACTION_LEVEL_TO_V2).sort(), ["全回合", "整輪", "標準", "移動", "自由", "迅捷"].sort());
  assert.equal(fromLegacyActionLevel("自由"), "swift", "自由不得變成零消耗——那等於在五類之外偷開第六類");
  assert.equal(fromLegacyActionLevel("迅捷"), "swift");
  assert.equal(fromLegacyActionLevel("移動"), "move");
  assert.equal(fromLegacyActionLevel("標準"), "standard");
  assert.equal(fromLegacyActionLevel("整輪"), "fullRound");
  assert.equal(fromLegacyActionLevel("全回合"), "fullTurn");
});

test("對映不出來的動作等級回 null，不預設成某一種", () => {
  assert.equal(fromLegacyActionLevel("反射"), null);
  assert.equal(fromLegacyActionLevel(undefined), null);
});

// --- 行動卡的產生 ---

test("身上每一個型態都變成一張行動卡，二選一的型態一個選項一張", () => {
  const defs = buildFormActionDefinitions(帶型態的角色卡());
  const ids = defs.map((d) => d.id);
  assert.ok(ids.includes(鬼魅身));
  assert.ok(ids.includes(帝國子民));
  // 混元劍經的劍氣有攻/防兩個 mode，所以是兩張卡。
  assert.ok(ids.includes(劍氣攻));
  assert.ok(ids.includes("form:pool.混元劍經.1:劍氣@防"));
  assert.ok(defs.every((d) => d.category === "special"));
  assert.ok(defs.every((d) => d.resolutionKey === "resolve_activate_form"));
});

test("型態行動卡的動作類型來自商品資料，不是寫死的", () => {
  const defs = buildFormActionDefinitions(帶型態的角色卡());
  assert.equal(defs.find((d) => d.id === 帝國子民).actionType, "standard", "帝國子民是標準動作");
  assert.equal(defs.find((d) => d.id === 鬼魅身).actionType, "swift", "鬼魅身是迅捷動作");
  assert.equal(defs.find((d) => d.id === 劍氣攻).actionType, "swift", "劍氣的自由動作映成迅捷");
});

test("action id 認得出來、也解得回 formId 與 mode", () => {
  assert.equal(isFormActionId(鬼魅身), true);
  assert.equal(isFormActionId("firearm_shot"), false);
  assert.deepEqual(parseFormActionId(劍氣攻), { formId: "pool.混元劍經.1:劍氣", mode: "攻" });
  assert.deepEqual(parseFormActionId(鬼魅身), { formId: "technique.葵花寶典.1:鬼魅身", mode: null });
});

test("沒有買任何型態的角色，選單裡就沒有特殊能力分類的卡（而不是一排空按鈕）", () => {
  const c = emptyCharacter("窮光蛋");
  Object.assign(c.attributes, { 力量: 3, 敏捷: 3, 耐力: 3, 智力: 2, 感知: 2, 意志: 2 });
  c.derived = computeDerivedStats(c.attributes, { size: 5 });
  const menu = getAvailableCombatActions({ battle: battleWith(c) });
  assert.equal(menu.filter((a) => a.category === "special").length, 0);
});

// --- 可用性 ---

test("資源不足時型態不可用，而且原因指名是哪一種資源", () => {
  const battle = battleWith(帶型態的角色卡({ 內力: 0 }));
  const card = getAvailableCombatActions({ battle }).find((a) => a.id === 鬼魅身);
  assert.equal(card.available, false);
  assert.match(card.unavailableReason, /內力不足/);
});

test("意志力不足時型態不可用", () => {
  const c = 帶型態的角色卡();
  c.derived.willpower = { ...c.derived.willpower, current: 0 };
  const card = getAvailableCombatActions({ battle: battleWith(c) }).find((a) => a.id === 帝國子民);
  assert.equal(card.available, false);
  assert.match(card.unavailableReason, /意志力不足/);
});

test("已經在進行中的型態不能重複啟動（書上的「每場景一次」就是靠這一條表達的）", () => {
  const battle = battleWith(帶型態的角色卡());
  resolveTurn(battle, [{ actionId: 鬼魅身 }]);
  const card = getAvailableCombatActions({ battle }).find((a) => a.id === 鬼魅身);
  assert.equal(card.available, false);
  assert.match(card.unavailableReason, /已經在進行中/);
});

test("動作額度用完時型態跟其他行動一樣不可用", () => {
  const battle = battleWith(帶型態的角色卡());
  // 帝國子民是標準動作；先用掉標準動作，它就該被擋下。
  const menu = getAvailableCombatActions({
    battle,
    budgetOverride: { pools: { swift: 1, move: 1, standard: 0 }, granted: { swift: 0, move: 0, standard: 0 }, spent: [] },
  });
  const card = menu.find((a) => a.id === 帝國子民);
  assert.equal(card.available, false);
  assert.match(card.unavailableReason, /標準動作已使用/);
});

// --- 結算 ---

test("啟動型態會扣 V2 的動作額度、意志力與能量池，而且角色卡被接住", () => {
  const battle = battleWith(帶型態的角色卡());
  const before = battle.character.derived.energyPools.內力.current;
  const result = resolveTurn(battle, [{ actionId: 鬼魅身 }]);

  assert.equal(result.resolution.playerActions[0].ok, true);
  assert.ok(result.character, "resolveTurn 必須把扣完的角色卡交還給呼叫端");
  assert.equal(result.character.derived.energyPools.內力.current, before - 1 - 1, "啟動 1 點 + 第二輪維持 1 點");
  assert.ok((battle.forms.active ?? []).some((f) => f.formId === "technique.葵花寶典.1:鬼魅身"));
});

test("同一輪可以先變身再出手（迅捷型態不吃掉標準動作）", () => {
  const battle = battleWith(帶型態的角色卡());
  const result = resolveTurn(battle, [
    { actionId: 鬼魅身 },
    { actionId: "firearm_shot", targetId: "enemy_01" },
  ]);
  assert.equal(result.resolution.playerActions.length, 2);
  assert.ok(result.resolution.playerActions.every((a) => a.ok));
  // 型態排在攻擊之前——先變身再出手，不是打完才變。
  assert.deepEqual(result.resolution.playerActions.map((a) => a.actionId), [鬼魅身, "firearm_shot"]);
});

test("標準動作的型態跟標準攻擊互斥（額度只有一個）", () => {
  assert.throws(
    () => validateSelection(battleWith(帶型態的角色卡()), [
      { actionId: 帝國子民 },
      { actionId: "firearm_shot", targetId: "enemy_01" },
    ]),
    (err) => err.code === "INSUFFICIENT_ACTIONS"
  );
});

// --- 可變量支付 ---

test("可變量型態沒帶支付點數時整批拒絕，**不會**先扣掉動作額度", () => {
  const battle = battleWith(帶型態的角色卡());
  const snapshot = JSON.stringify(battle.budgets.player);
  assert.throws(
    () => resolveTurn(battle, [{ actionId: 劍氣攻 }]),
    (err) => err instanceof TurnValidationError && err.code === "MISSING_PARAMETER"
  );
  assert.equal(JSON.stringify(battle.budgets.player), snapshot, "被拒絕的請求不得花掉玩家的迅捷動作");
});

test("支付點數超出伺服器算的範圍時被拒絕", () => {
  const battle = battleWith(帶型態的角色卡());
  assert.throws(
    () => resolveTurn(battle, [{ actionId: 劍氣攻, parameters: { amount: 99 } }]),
    (err) => err.code === "PARAMETER_OUT_OF_RANGE"
  );
});

test("支付範圍由伺服器算（「不超過敏捷或感知取低」），並公開給 UI 畫選單", () => {
  const battle = battleWith(帶型態的角色卡());
  const card = getAvailableCombatActions({ battle }).find((a) => a.id === 劍氣攻);
  // 敏捷 4、感知 3，取低＝3。
  assert.deepEqual(card.requirements.variablePayment, { min: 1, max: 3, poolName: "劍氣" });
});

test("合法的支付點數會被真的扣掉，而且選擇會回顯在紀錄裡", () => {
  const battle = battleWith(帶型態的角色卡());
  const before = battle.character.derived.energyPools.劍氣.current;
  const result = resolveTurn(battle, [{ actionId: 劍氣攻, parameters: { amount: 2 } }]);
  assert.equal(result.character.derived.energyPools.劍氣.current, before - 2);
  assert.match(result.resolution.playerActions[0].publicText, /支付 2 點/);
});

// --- 維持成本 ---

test("維持成本在跨輪時真的收得到：付掉能量池，也花掉一個動作額度", () => {
  const battle = battleWith(帶型態的角色卡());
  resolveTurn(battle, [{ actionId: 鬼魅身 }]);          // 第1輪啟動，跨到第2輪時收維持
  assert.equal(battle.round, 2);
  assert.equal(battle.budgets.player.pools.swift, 0, "自由動作的維持成本映成迅捷，第2輪的迅捷被收走");
  assert.deepEqual(
    { move: battle.budgets.player.pools.move, standard: battle.budgets.player.pools.standard },
    { move: 1, standard: 1 },
    "維持成本只收它該收的那一格"
  );
  const log = battle.publicLog.map((l) => l.text).join("\n");
  assert.match(log, /維持鬼魅身消耗了迅捷動作/, "動作成本要寫進紀錄，不然玩家只會看到迅捷莫名不見");
  assert.match(log, /付出 1 點內力/);
});

test("付不出維持成本時型態當場結束，並寫進公開紀錄", () => {
  // 內力剛好只夠啟動，不夠第二輪的維持。
  const battle = battleWith(帶型態的角色卡({ 內力: 1 }));
  resolveTurn(battle, [{ actionId: 鬼魅身 }]);
  assert.equal((battle.forms.active ?? []).length, 0, "付不出錢就該結束");
  assert.match(battle.publicLog.map((l) => l.text).join("\n"), /鬼魅身 結束/);
});

test("以「輪」計時的型態會在時鐘走完時到期", () => {
  const battle = battleWith(帶型態的角色卡());
  resolveTurn(battle, [{ actionId: 劍氣攻, parameters: { amount: 1 } }]);   // 持續 1 輪
  // 啟動的那一輪內完整有效，下一輪開始才消失。
  assert.equal((battle.forms.active ?? []).some((f) => f.formId === "pool.混元劍經.1:劍氣"), false);
  assert.match(battle.publicLog.map((l) => l.text).join("\n"), /劍氣 已到期/);
});

test("戰鬥結束時以「輪」計時的型態收掉，以「場景」計時的留著", () => {
  const battle = battleWith(帶型態的角色卡());
  resolveTurn(battle, [{ actionId: 帝國子民 }]);   // 持續一個場景
  // 直接把敵人設成倒下，讓下一輪的結算收在勝利。
  const enemy = battle.participants.find((p) => p.id === "enemy_01");
  enemy.hpState = { max: 12, intact: 0, B: 0, L: 0, A: 12, dead: true, unconscious: true, worsening: false };
  resolveTurn(battle, [{ actionId: "hunker_down" }]);
  assert.equal(battle.active, false);
  assert.ok(
    (battle.forms.active ?? []).some((f) => f.formId === "mock.阿蘭斯.D:帝國子民"),
    "打一場架不會改變你站在哪裡，以場景計時的型態要留到玩家離開這個地點"
  );
});

// --- 公開狀態 ---

test("公開狀態帶得出進行中的型態與資源，但不帶整張角色卡", () => {
  const battle = battleWith(帶型態的角色卡());
  resolveTurn(battle, [{ actionId: 鬼魅身 }]);
  const pub = toPublicBattle(battle);

  assert.equal(pub.player.forms[0].label, "鬼魅身");
  assert.equal(pub.player.forms[0].hasUpkeep, true);
  assert.ok(pub.resources.willpower.max > 0);
  assert.ok(pub.resources.energyPools.內力);

  const raw = JSON.stringify(pub);
  for (const forbidden of ["abilities", "specializations", "seed", "rngCursor"]) {
    assert.equal(raw.includes(forbidden), false, `公開 payload 不得含「${forbidden}」`);
  }
});

// ---------------------------------------------------------------------------
// 從 test/shopForms.test.js 搬過來的（2026-08-29）。
// 這些原本是透過舊戰鬥系統的 createEncounter()／resolveFormActivation()／combatOptions()
// 驗的；那個介面隨舊系統移除了，但它們驗的行為沒變，只是換了一個表面。
// ---------------------------------------------------------------------------

test("戰鬥中變身讓防御真的變高（不是只有查表函式知道）", () => {

const Orphnoch = {
  goodId: "mock.Orphnoch.D",
  name: "Orphnoch",
  effects: [{
    kind: "型態",
    label: "進化形態",
    activation: { action: "移動", willpower: 1 },
    duration: { unit: "場景" },
    grants: [
      { kind: "防御", amount: 3 },
      { kind: "武器", label: "天生武器", attackType: "肉搏", weaponDamage: 3, severity: "L", ranged: false }
    ]
  }]
};

  const battle = battleWith(帶型態的角色卡({ goods: [Orphnoch] }));
  const before = combatProfileFrom(battle.character, { extraSources: activeGrantSources(battle.forms) }).equipmentDefense;

  resolveTurn(battle, [{ actionId: "form:mock.Orphnoch.D:進化形態" }]);

  const after = combatProfileFrom(battle.character, { extraSources: activeGrantSources(battle.forms) }).equipmentDefense;
  assert.ok(after > before, `變身後防御要變高（${before} -> ${after}）`);
});

// [2026-09-03 補接線缺口] 上面那則測試的標題說「不是只有查表函式知道」，但斷言其實
// 只問了 combatProfileFrom() 這個查表函式本身，從沒問過 performAttack() 真正的傷害計算
// 有沒有跟著變——這正是它沒能抓到接線缺口的原因：`player.combatProfile`／`player.armor`
// 是 createBattle() 在開戰當下算一次就寫死的快照，戰鬥中途啟動的型態如果只更新
// combatProfileFrom() 查得到的資料、卻沒有人回頭改寫這份快照，傷害計算依然吃到舊數字。
// 這一則直接跑一次完整的 performAttack()，用固定骰子鎖住命中與基礎傷害，
// 只讓「型態有沒有啟動」這一個變因不同，確認護甲吸收是不是真的跟著變身變了。
test("型態中途授予的護甲，真的會讓 performAttack() 算出來的傷害變低（不是只有查表函式知道）", () => {
  const Orphnoch = {
    goodId: "mock.Orphnoch.裝甲",
    name: "Orphnoch",
    effects: [{
      kind: "型態",
      label: "裝甲化",
      activation: { action: "移動", willpower: 1 },
      duration: { unit: "場景" },
      grants: [{ kind: "護甲", amount: 3 }],
    }],
  };

  const battle = battleWith(帶型態的角色卡({ goods: [Orphnoch] }));
  const enemy = battle.participants.find((p) => p.side === "enemy");
  const player = battle.participants.find((p) => p.id === "player");
  // 固定每顆骰都是 9：>= 成功門檻(8)所以必中，< 重擲門檻(10)所以不會觸發無限重擲隊列，
  // 每次攻擊的原始成功數因此完全固定，傷害差異只可能來自護甲。
  const rng = { d10: () => 9, next: () => 0.5, pick: (list) => list[0] };
  const weapon = { key: "測試重擊", label: "測試重擊", attackType: "肉搏", weaponDamage: 8, severity: "L", ranged: false };

  const before = performAttack({ battle, attacker: enemy, defender: player, weapon, rng });
  assert.equal(before.hit, true, "固定骰子下這一擊應該要命中，不然這則測試量不到護甲");

  const activated = resolveTurn(battle, [{ actionId: "form:mock.Orphnoch.裝甲:裝甲化" }]);
  assert.equal(activated.ok !== false, true, "型態啟動不該失敗");
  assert.equal(
    livePlayerCombatProfile(battle).armor,
    3,
    "livePlayerCombatProfile() 要現查到型態剛授予的護甲"
  );

  const after = performAttack({ battle, attacker: enemy, defender: player, weapon, rng });
  assert.equal(after.hit, true, "護甲不影響命中，這一擊也該命中");
  assert.equal(before.damage - after.damage, 3, `變身後護甲+3，傷害要少3點（${before.damage} -> ${after.damage}）`);
});

test("買到的加骰商品真的進到戰鬥的攻擊骰池裡", () => {
  // 怎麼觀察骰池大小：餵一個永遠擲出 5 的骰子——5 不是成功、也不觸發加骰，
  // 所以「擲了幾顆」就等於這次攻擊的有效 DP。比直接偷看內部變數誠實，
  // 而且它驗的正是玩家真正在意的那件事：買了商品，骰子有沒有變多。
  const poolSizeWith = (abilities) => {
    let dice = 0;
    const c = 帶型態的角色卡({ goods: [] });
    c.abilities = abilities;
    const battle = battleWith(c);
    performAttack({
      battle,
      attacker: battle.participants.find((p) => p.id === "player"),
      defender: battle.participants.find((p) => p.id === "enemy_01"),
      weapon: battle.loadout.weapons.find((w) => w.key === "unarmed"),
      rng: { d10: () => { dice += 1; return 5; }, next: () => 0.5, pick: (l) => l[0] },
    });
    return dice;
  };

  const plain = poolSizeWith([]);
  const buffed = poolSizeWith([{
    goodId: "test.加骰",
    name: "測試商品",
    effects: [{ kind: "檢定加骰", amount: 3, scope: "攻擊", skill: "格鬥" }],
  }]);
  assert.equal(buffed - plain, 3, "買了加格鬥的商品，肉搏攻擊的骰池就該大 3");
});

test("買到的武器出現在戰鬥裝備表與行動選單裡（不是寫死的兩把）", () => {
  const c = 帶型態的角色卡({ goods: [] });
  c.abilities = [{
    goodId: "test.武器",
    name: "測試武器",
    effects: [{ kind: "武器", label: "龍骨炮", attackType: "槍械", weaponDamage: 5, ranged: true }],
  }];
  const battle = battleWith(c);
  assert.ok(
    battle.loadout.weapons.some((w) => w.label === "龍骨炮"),
    "買到的武器要進戰鬥裝備表，否則買了也按不到"
  );
  assert.equal(toPublicBattle(battle).loadout.weapons.some((w) => w.label === "龍骨炮"), true);
});

test("戰鬥結束會收掉以「輪」計時的型態（戰鬥外沒有輪可以數）", () => {
  const battle = battleWith(帶型態的角色卡());
  resolveTurn(battle, [{ actionId: 劍氣攻, parameters: { amount: 1 } }]);   // 持續 1 輪
  const enemy = battle.participants.find((p) => p.id === "enemy_01");
  enemy.hpState = { max: 12, intact: 0, B: 0, L: 0, A: 12, dead: true, unconscious: true, worsening: false };
  resolveTurn(battle, [{ actionId: "hunker_down" }]);
  assert.equal(battle.active, false);
  assert.equal(
    (battle.forms.active ?? []).some((f) => f.unit === "輪"),
    false,
    "以輪計時的型態留到戰鬥外就永遠不會到期"
  );
});

test("型態授予的天生武器在啟動後真的按得到（裝備表會重算）", () => {
  // 進化形態（Orphnoch）變身中才有天生武器。

const Orphnoch = {
  goodId: "mock.Orphnoch.D",
  name: "Orphnoch",
  effects: [{
    kind: "型態",
    label: "進化形態",
    activation: { action: "移動", willpower: 1 },
    duration: { unit: "場景" },
    grants: [
      { kind: "防御", amount: 3 },
      { kind: "武器", label: "天生武器", attackType: "肉搏", weaponDamage: 3, severity: "L", ranged: false }
    ]
  }]
};

  const c = 帶型態的角色卡({ goods: [Orphnoch] });
  const battle = battleWith(c);
  const before = battle.loadout.weapons.length;
  resolveTurn(battle, [{ actionId: "form:mock.Orphnoch.D:進化形態" }]);
  assert.ok(
    battle.loadout.weapons.length > before,
    "型態授予的天生武器要進裝備表，否則變身少了一半的價值"
  );
});

// [2026-09-03 補接線缺口] 上面那則測試的型態以「場景」計時，戰鬥中永遠不會到期，
// 所以從沒測過「型態到期之後，它授予的武器有沒有跟著從裝備表拿掉」——rebuildWeapons()
// 先前只有 resolve_activate_form(啟動時)會呼叫，型態到期(輪數用盡／維持成本付不出來)
// 沒有對稱地重建 loadout，武器就會變成一把型態結束後依然按得到的永久武器。
test("型態以「輪」到期後，它授予的天生武器要跟著從裝備表消失（不是永久武器）", () => {
  const 限時武裝 = {
    goodId: "mock.限時武裝.D",
    name: "限時武裝",
    effects: [{
      kind: "型態",
      label: "召喚武器",
      activation: { action: "移動", willpower: 1 },
      duration: { unit: "輪", rounds: 2 },
      grants: [{ kind: "武器", label: "限時神劍", attackType: "肉搏", weaponDamage: 4, severity: "L", ranged: false }],
    }],
  };

  const c = 帶型態的角色卡({ goods: [限時武裝] });
  const battle = battleWith(c);
  // resolveTurn 會連敵人回合一起結算並自動推進到下一輪，所以啟動當下就已經跨過1輪，
  // 撐 2 輪的型態這時候應該還在生效——這一步先確認裝備表真的按得到，不然下面「消失了」
  // 的斷言就分不出是「本來就沒生效」還是「到期後才消失」。
  resolveTurn(battle, [{ actionId: "form:mock.限時武裝.D:召喚武器" }]);
  assert.ok(
    battle.loadout.weapons.some((w) => w.label === "限時神劍"),
    "型態還在生效期間，武器應該按得到"
  );

  // 明確再推進一輪，確保時鐘一定走過了到期點。
  beginNextRound(battle);
  assert.equal(
    (battle.forms.active ?? []).some((f) => f.label === "召喚武器"),
    false,
    "型態應該已經到期"
  );
  assert.equal(
    battle.loadout.weapons.some((w) => w.label === "限時神劍"),
    false,
    "型態到期後，它授予的武器不該繼續留在裝備表裡"
  );
});
