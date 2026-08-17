// 主神商店的購買流程與效果詞彙表測試。
//
// 這裡鎖定的核心性質是「商品的效果必須真的接到引擎上」——每一個 EFFECT_KINDS 的 kind
// 都要有一個測試證明它會改變某個引擎函式的輸出。這是本專案在
// ARCHITECTURE.md「專業(specialization)系統：決定不做」那則決策記錄裡學到的教訓：
// 一個欄位如果沒有任何程式碼讀它，它就是在說謊，而且測試通過會讓謊言看起來像功能。
import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { performCheck } from "../core/check.js";
import { computeDefenseDC } from "../core/combat/defense.js";
import { applyArmor } from "../core/combat/armor.js";
import { initiativeScore } from "../core/derivedStats.js";
import { createHpState, applyDamage } from "../core/health.js";
import { createWallet, formatPrice } from "../content/shop/wallet.js";
import {
  EFFECT_KINDS,
  validateEffect,
  checkModifiersFor,
  combatProfileFrom,
  weaponsFrom,
  applyPermanentEffects,
  applyInstantEffects,
} from "../content/shop/effects.js";
import {
  validateGood,
  evaluatePurchase,
  purchase,
  buildStorefront,
  auditGoodPricing,
  EXCLUSIVE_TEMPLATE_TYPES,
} from "../content/shop/catalog.js";

function hero() {
  const c = emptyCharacter("測試輪迴者");
  c.attributes.力量 = 3;
  c.attributes.敏捷 = 3;
  c.attributes.感知 = 3;
  c.attributes.智力 = 2;
  c.skills.格鬥 = 2;
  c.skills.求生 = 3;
  c.skills.偵察 = 2;
  c.skills.技藝 = 2;
  return c;
}

const 匕首 = {
  goodId: "test.匕首",
  name: "測試匕首",
  category: "物品",
  price: "D+500",
  rank: "D",
  lineageId: "test.匕首",
  startsAtRank: true,
  effects: [
    { kind: "武器", label: "測試匕首", attackType: "白刃", weaponDamage: 3, severity: "L", ranged: false },
  ],
  sourceRef: "測試用",
};

// ---------- 效果詞彙表 ----------

test("效果驗證：kind 必須在詞彙表內", () => {
  assert.deepEqual(validateEffect({ kind: "武器", label: "x", attackType: "白刃", weaponDamage: 1 }), []);
  const errs = validateEffect({ kind: "隨便編一個", amount: 5 });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /不在詞彙表中/);
});

test("效果驗證：檢定類效果沒有匹配鍵一律擋下(這是不讓AI決定加值何時生效的那道閘門)", () => {
  const errs = validateEffect({ kind: "檢定加骰", amount: 2 });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /必須指定 attribute 或 skill/);
  assert.deepEqual(validateEffect({ kind: "檢定加骰", skill: "求生", amount: 2 }), []);
});

test("效果驗證：屬性/技能名必須是六維十技能，寫原始九維或22技能會被擋", () => {
  assert.match(validateEffect({ kind: "屬性", attribute: "決心", amount: 1 })[0], /不是六維之一/);
  assert.match(validateEffect({ kind: "檢定加骰", skill: "白刃", amount: 1 })[0], /不是十技能之一/);
});

test("效果詞彙表的每一個 kind 都要標明它接到引擎的哪個欄位", () => {
  for (const [kind, spec] of Object.entries(EFFECT_KINDS)) {
    assert.ok(spec.target && spec.target.length > 0, `${kind} 沒有寫 target(接線圖)`);
    assert.ok(Array.isArray(spec.fields) && spec.fields.length > 0, `${kind} 沒有寫必要欄位`);
  }
});

// ---------- 效果真的接到引擎 ----------

test("『檢定加骰』真的改變 performCheck 的骰池，而且只對匹配的技能生效", () => {
  const c = hero();
  const 專長 = {
    goodId: "feat.荒野求生.1",
    name: "荒野求生(1級)",
    category: "專長",
    featLevel: 1,
    lineageId: "feat.荒野求生",
    price: "3XP",
    effects: [{ kind: "檢定加骰", skill: "求生", amount: 1 }],
    sourceRef: "測試用",
  };
  const wallet = createWallet({ xp: 10 });
  const result = purchase(c, wallet, 專長);
  assert.equal(result.ok, true, JSON.stringify(result.blockers));

  const 求生加值 = checkModifiersFor(result.character, { attribute: "感知", skill: "求生" });
  assert.equal(求生加值.dp, 1);
  assert.equal(求生加值.sources.length, 1);

  const 無關加值 = checkModifiersFor(result.character, { attribute: "力量", skill: "格鬥" });
  assert.equal(無關加值.dp, 0, "求生的專長不該加到格鬥檢定上");

  const 骰池 = performCheck(result.character, {
    attribute: "感知",
    skill: "求生",
    otherDpModifier: 求生加值.dp,
    diceOpts: { rng: () => 0.5 },
  });
  // 感知3 + 求生3 + 專長1 = 7
  assert.equal(骰池.dp, 7);
});

test("『附加成功』接到 performCheck 的 otherBonusSuccesses", () => {
  const c = hero();
  c.abilities = [
    { goodId: "g", name: "貝爺", effects: [{ kind: "附加成功", skill: "求生", amount: 1 }] },
  ];
  const mods = checkModifiersFor(c, { attribute: "感知", skill: "求生" });
  assert.equal(mods.bonusSuccesses, 1);
  assert.equal(mods.dp, 0);
});

test("『防御』與『護甲』真的改變 computeDefenseDC / applyArmor 的結果", () => {
  const c = hero();
  const 裸體 = combatProfileFrom(c, { skillCorrection: 2 });
  assert.equal(裸體.equipmentDefense, 0);
  assert.equal(裸體.armor, 0);

  c.abilities = [
    {
      goodId: "g",
      name: "精通先攻3級＋防彈衣",
      effects: [
        { kind: "防御", amount: 3 },
        { kind: "護甲", amount: 2 },
        { kind: "先攻", amount: 1 },
      ],
    },
  ];
  const 武裝 = combatProfileFrom(c, { skillCorrection: 2 });
  assert.equal(武裝.equipmentDefense, 3);
  assert.equal(武裝.armor, 2);
  assert.equal(武裝.initiativeBonus, 1);

  const dcBefore = computeDefenseDC({ agility: 3, perception: 3, skillCorrection: 2, equipmentDefense: 0 });
  const dcAfter = computeDefenseDC({ agility: 3, perception: 3, skillCorrection: 2, equipmentDefense: 3 });
  assert.equal(dcAfter - dcBefore, 3, "防御效果必須讓防御DC真的變高");
  assert.equal(applyArmor(5, 武裝.armor), 3, "護甲2要吃掉2點傷害");
  assert.equal(initiativeScore(3, 3) + 武裝.initiativeBonus, 7);
});

test("『武器』的形狀直接對齊戰鬥引擎吃得下的武器物件", () => {
  const result = purchase(hero(), createWallet({ tokens: { D: 1 }, points: 500 }), 匕首);
  assert.equal(result.ok, true);
  const weapons = weaponsFrom(result.character);
  assert.equal(weapons.length, 1);
  assert.equal(weapons[0].attackType, "白刃");
  assert.equal(weapons[0].weaponDamage, 3);
  assert.equal(weapons[0].severity, "L");
  assert.equal(weapons[0].sourceGood, "測試匕首");
});

test("『屬性』『技能』是購買當下就寫進角色卡的永久效果", () => {
  const c = hero();
  const next = applyPermanentEffects(c, [
    { kind: "屬性", attribute: "力量", amount: 2 },
    { kind: "技能", skill: "格鬥", amount: 1 },
    { kind: "生命上限", amount: 3 },
  ]);
  assert.equal(next.attributes.力量, 5);
  assert.equal(next.skills.格鬥, 3);
  assert.equal(next.derived.hp.max, c.derived.hp.max + 3);
  assert.equal(next.derived.hp.intact, c.derived.hp.intact + 3, "上限提高的部分以完好入帳");
  assert.equal(c.attributes.力量, 3, "不可就地修改傳入的角色卡");
});

test("『治療』真的把傷勢軌上的點數轉回完好", () => {
  let hp = createHpState(10);
  hp = applyDamage(hp, 6, "L");
  assert.equal(hp.L, 6);
  const after = applyInstantEffects({ hp }, [{ kind: "治療", severity: "L", amount: 4 }]);
  assert.equal(after.hp.L, 2);
  assert.equal(after.hp.intact, 8);
  assert.deepEqual(after.applied, ["治療L傷 4點"]);
});

test("『敘事』效果明確不帶數值：套用之後角色卡任何數字都不變", () => {
  const c = hero();
  const next = applyPermanentEffects(c, [{ kind: "敘事", text: "一把很漂亮的劍" }]);
  assert.deepEqual(next.attributes, c.attributes);
  assert.deepEqual(next.skills, c.skills);
  assert.equal(checkModifiersFor({ abilities: [{ effects: [{ kind: "敘事", text: "x" }] }] }, { skill: "求生" }).dp, 0);
});

// ---------- 購買流程 ----------

test("餘額不足時擋下，而且說得出還差多少", () => {
  const result = evaluatePurchase(hero(), createWallet({ points: 100 }), 匕首);
  assert.equal(result.ok, false);
  const blocker = result.blockers.find((b) => b.code === "餘額不足");
  assert.match(blocker.message, /支線還差1個D當量/);
  assert.match(blocker.message, /分數還差400/);
});

test("前提不足時擋下(屬性與技能分開報)", () => {
  const 重兵器 = {
    ...匕首,
    goodId: "test.重兵器",
    name: "鳳翅鎦金镋",
    prerequisites: { attributes: { 力量: 5 }, skills: { 格鬥: 4 } },
  };
  const result = evaluatePurchase(hero(), createWallet({ tokens: { D: 1 }, points: 500 }), 重兵器);
  assert.equal(result.ok, false);
  const msgs = result.blockers.filter((b) => b.code === "前提不足").map((b) => b.message);
  assert.equal(msgs.length, 2);
  assert.ok(msgs.some((m) => m.includes("力量5")));
  assert.ok(msgs.some((m) => m.includes("格鬥技能4級")));
});

test("阻擋理由一次列齊，不是遇到第一個就回傳", () => {
  const 重兵器 = { ...匕首, goodId: "x", prerequisites: { attributes: { 力量: 9 } } };
  const result = evaluatePurchase(hero(), createWallet({}), 重兵器);
  const codes = new Set(result.blockers.map((b) => b.code));
  assert.ok(codes.has("餘額不足") && codes.has("前提不足"), "應該同時報出兩種阻擋");
});

test("模板能力五類排他：買了血統就不能再買第二個血統，但可以升級同一個", () => {
  const 阿蘭斯D = {
    goodId: "bl.阿蘭斯.D",
    name: "阿蘭斯D",
    lineageId: "bl.阿蘭斯",
    rank: "D",
    startsAtRank: true,
    category: "模板能力",
    exclusiveGroup: "血統",
    price: "D+600",
    effects: [{ kind: "屬性", attribute: "力量", amount: 1 }],
    sourceRef: "測試用",
  };
  const 狼人D = { ...阿蘭斯D, goodId: "bl.狼人.D", name: "狼人D", lineageId: "bl.狼人" };
  const 阿蘭斯C = { ...阿蘭斯D, goodId: "bl.阿蘭斯.C", name: "阿蘭斯C", rank: "C", startsAtRank: false, price: "C+1200" };

  const wallet = createWallet({ tokens: { B: 1 }, points: 5000 });
  const bought = purchase(hero(), wallet, 阿蘭斯D);
  assert.equal(bought.ok, true);

  const 換血統 = evaluatePurchase(bought.character, bought.wallet, 狼人D);
  assert.equal(換血統.ok, false);
  assert.ok(換血統.blockers.some((b) => b.code === "模板能力排他"));

  const 升級 = evaluatePurchase(bought.character, bought.wallet, 阿蘭斯C);
  assert.equal(升級.ok, true, JSON.stringify(升級.blockers));
});

test("exclusiveGroup 只能是書上寫的那五類", () => {
  assert.deepEqual(EXCLUSIVE_TEMPLATE_TYPES, ["血統", "改造", "瞳術", "修真", "魔導書"]);
  const 亂寫 = { ...匕首, goodId: "y", exclusiveGroup: "稱號" };
  const result = evaluatePurchase(hero(), createWallet({ tokens: { D: 1 }, points: 500 }), 亂寫);
  assert.ok(result.blockers.some((b) => b.code === "設定錯誤"));
});

test("依序購買：沒有D級不能直接買B級", () => {
  const B級 = {
    goodId: "bl.某.B",
    name: "某血統B",
    lineageId: "bl.某",
    rank: "B",
    category: "模板能力",
    price: "B+3600",
    effects: [{ kind: "屬性", attribute: "力量", amount: 1 }],
    sourceRef: "測試用",
  };
  const result = evaluatePurchase(hero(), createWallet({ tokens: { S: 1 }, points: 9999 }), B級);
  assert.equal(result.ok, false);
  const blocker = result.blockers.find((b) => b.code === "順序未達");
  assert.match(blocker.message, /D→C/);
});

test("專長依序學習：不能跳級，而且等級不得超過關鍵屬性數值", () => {
  const c = hero(); // 感知3
  const wallet = createWallet({ xp: 100 });
  const 警覺1 = {
    goodId: "feat.警覺.1",
    name: "警覺1",
    lineageId: "feat.警覺",
    featLevel: 1,
    category: "專長",
    price: "3XP",
    featAttributeCaps: ["感知"],
    effects: [{ kind: "檢定加骰", skill: "偵察", amount: 1 }],
    sourceRef: "測試用",
  };
  const 警覺2 = { ...警覺1, goodId: "feat.警覺.2", name: "警覺2", featLevel: 2, price: "6XP" };

  const 跳級 = evaluatePurchase(c, wallet, 警覺2);
  assert.equal(跳級.ok, false);
  assert.match(跳級.blockers.find((b) => b.code === "順序未達").message, /還缺 1 級/);

  const 買了1 = purchase(c, wallet, 警覺1);
  assert.equal(evaluatePurchase(買了1.character, 買了1.wallet, 警覺2).ok, true);

  // 感知3 的角色不能學到4級(第6852行：等級不得超過該屬性數值)
  const 警覺4 = { ...警覺1, goodId: "feat.警覺.4", name: "警覺4", featLevel: 4, price: "12XP" };
  const 超上限 = evaluatePurchase(買了1.character, 買了1.wallet, 警覺4);
  assert.ok(超上限.blockers.some((b) => b.code === "屬性上限"));
});

test("非消耗品不可重複購買，消耗品可以", () => {
  const wallet = createWallet({ tokens: { C: 1 }, points: 5000 });
  const first = purchase(hero(), wallet, 匕首);
  const second = evaluatePurchase(first.character, first.wallet, 匕首);
  assert.ok(second.blockers.some((b) => b.code === "已持有"));

  const 藥 = {
    goodId: "test.藥",
    name: "治療藥",
    category: "物品",
    price: "200",
    consumable: true,
    effects: [{ kind: "治療", severity: "L", amount: 2 }],
    sourceRef: "測試用",
  };
  const a = purchase(hero(), wallet, 藥);
  const b = purchase(a.character, a.wallet, 藥);
  assert.equal(b.ok, true, "消耗品應該可以買第二份");
});

test("血統的自由屬性點：分配必須剛好用完、單項不得超過模板上限，而且由呼叫端指定不是AI決定", () => {
  const 阿蘭斯D = {
    goodId: "bl.阿蘭斯.D",
    name: "阿蘭斯血統D級",
    lineageId: "bl.阿蘭斯",
    rank: "D",
    startsAtRank: true,
    category: "模板能力",
    resourceType: "血統",
    exclusiveGroup: "血統",
    price: "D+600",
    attributePool: { points: 4, capPerAttribute: 2 },
    effects: [{ kind: "敘事", text: "阿蘭斯公民" }],
    sourceRef: "測試用",
  };
  const wallet = createWallet({ tokens: { D: 1 }, points: 600 });

  assert.ok(
    evaluatePurchase(hero(), wallet, 阿蘭斯D).blockers.some((b) => b.code === "待分配屬性"),
    "沒給分配表就不能成交"
  );
  assert.ok(
    evaluatePurchase(hero(), wallet, 阿蘭斯D, { allocation: { 力量: 3 } }).blockers.some(
      (b) => b.code === "分配不符"
    ),
    "只分配3點(少於4點)要擋"
  );
  assert.ok(
    evaluatePurchase(hero(), wallet, 阿蘭斯D, { allocation: { 力量: 3, 敏捷: 1 } }).blockers.some(
      (b) => b.code === "分配不符"
    ),
    "單項3點超過上限2點要擋"
  );

  const ok = purchase(hero(), wallet, 阿蘭斯D, { allocation: { 力量: 2, 耐力: 2 } });
  assert.equal(ok.ok, true, JSON.stringify(ok.blockers));
  assert.equal(ok.character.attributes.力量, 5);
  assert.equal(ok.character.attributes.耐力, 3);
  // 分配結果要寫進持有紀錄，之後洗點/復活計價才有依據
  const owned = ok.character.abilities.at(-1);
  assert.equal(owned.effects.filter((e) => e.kind === "屬性").length, 2);
});

test("成交後錢包與角色卡都是新物件，原本的不動", () => {
  const c = hero();
  const wallet = createWallet({ tokens: { D: 1 }, points: 500 });
  const result = purchase(c, wallet, 匕首);
  assert.equal(result.ok, true);
  assert.equal(c.abilities.length, 0, "原角色卡不可被就地修改");
  assert.equal(wallet.points, 500, "原錢包不可被就地修改");
  assert.equal(result.character.abilities.length, 1);
  assert.equal(result.wallet.points, 0);
  assert.equal(result.receipt.pricePaid, "D+500");
});

test("貨架把買不起的商品也列出來，並附上阻擋理由", () => {
  const shelf = buildStorefront(hero(), createWallet({ points: 100 }), [匕首]);
  assert.equal(shelf.length, 1);
  assert.equal(shelf[0].purchasable, false);
  assert.equal(shelf[0].price, "D+500");
  assert.ok(shelf[0].blockers.length > 0);
});

// ---------- 商品結構驗證 ----------

test("validateGood：缺 sourceRef / 空 effects / 丟掉特性沒寫理由，都要擋", () => {
  assert.equal(validateGood(匕首).valid, true);

  const 無出處 = { ...匕首, sourceRef: undefined };
  assert.ok(validateGood(無出處).errors.some((e) => /sourceRef/.test(e)));

  const 空效果 = { ...匕首, effects: [] };
  assert.ok(validateGood(空效果).errors.some((e) => /空陣列/.test(e)));

  const 無理由 = { ...匕首, droppedTraits: [{ trait: "破甲2" }] };
  assert.ok(validateGood(無理由).errors.some((e) => /reason/.test(e)));
});

test("auditGoodPricing：拿商品價格去對模板，落差只回報不覆蓋", () => {
  const 血統D = {
    ...匕首,
    goodId: "bl.x.D",
    resourceType: "血統",
    rank: "D",
    lineageId: "bl.x",
    price: "D+600",
  };
  assert.equal(auditGoodPricing(血統D).matches, true, "血統模板D級是600");

  const 亂寫價 = { ...血統D, price: "D+500" };
  const audit = auditGoodPricing(亂寫價);
  assert.equal(audit.matches, false);
  assert.match(audit.discrepancies[0], /模板規定D級應為600分/);

  // 沒有 resourceType 的商品(例如服務)不適用模板稽核
  assert.equal(auditGoodPricing(匕首).applicable, false);
});

test("formatPrice 與商品定價的往返一致(商店UI顯示的價格就是書上的寫法)", () => {
  const shelf = buildStorefront(hero(), createWallet({ tokens: { S: 1 }, points: 99999, xp: 99 }), [匕首]);
  assert.equal(shelf[0].price, "D+500");
});
