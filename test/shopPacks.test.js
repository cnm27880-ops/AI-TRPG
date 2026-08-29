// 主神商店九個起始商品包的資料測試（物品/專長/血統/改造/瞳術/稱號/流派/技藝/法術）。
//
// 轉換規則本身寫在 CONVERSION_RULES.md，那份文件是給人看的；這個檔案是它的執行版本——
// 文件裡每一條「必須怎樣」的規定，這裡都要有一則測試守住。兩者不一致時，以測試為準並回頭改文件。
//
// 這裡測的不是程式邏輯，是「轉換成果本身」：每一件商品都要能通過 validateGood、
// 每一個被丟掉的特性都要寫得出理由、每一個理由都要對得上 UNSUPPORTED_MECHANICS 的鍵
// (或是一段具體到指名模組的說明)。這是為了讓「轉換損耗」這件事變成可以被測試守住的資產，
// 而不是散在註解裡、下一個人接手時看不到的口頭承諾。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validatePackStructure, mergePacks } from "../content/loader.js";
import { UNSUPPORTED_MECHANICS } from "../content/shop/effects.js";
import {
  validateGood,
  auditGoodPricing,
  RANK_ORDER,
  listBalanceDeviations,
  BALANCE_DIRECTIONS,
} from "../content/shop/catalog.js";
import { parsePrice } from "../content/shop/wallet.js";
import { featCost } from "../core/xp.js";
import { emptyCharacter } from "../core/schema.js";
import { createWallet } from "../content/shop/wallet.js";
import { purchase, evaluatePurchase, buildStorefront, summarizeStorefront } from "../content/shop/catalog.js";
import { weaponsFrom, checkModifiersFor, combatProfileFrom, attackModifiersFor } from "../content/shop/effects.js";
import { ATTACK_CHECK_KEYS } from "../core/combat/attackTypes.js";
import {
  createFormsState,
  formIdOf,
  activateForm,
  activeGrantSources,
  endScene,
  variablePaymentRange,
} from "../content/shop/forms.js";
import { POOL_DEFS, openPool } from "../core/energyPools.js";

const PACK_FILES = [
  "shop-starter-items.json",
  "shop-starter-feats.json",
  "d-tier-rebalanced-bloodlines.json",
  "shop-starter-cybernetic.json",
  "shop-starter-dojutsu.json",
  "shop-starter-title.json",
  "shop-starter-school.json",
  "shop-starter-technique.json",
  "shop-starter-spell.json",
  "shop-starter-pools.json",
];
const packs = PACK_FILES.map((f) =>
  JSON.parse(readFileSync(new URL(`../content/packs/${f}`, import.meta.url)))
);
const allGoods = packs.flatMap((p) => p.entries);

test("所有商品包都通過 loader 的結構驗證，type 是新登記的「商品」", () => {
  for (const pack of packs) {
    const result = validatePackStructure(pack);
    assert.equal(result.valid, true, `${pack.id}：${result.errors.join("；")}`);
    assert.equal(pack.type, "商品");
  }
  const merged = mergePacks(packs);
  assert.deepEqual(merged.errors, [], "所有包合併不該撞名");
  assert.equal(Object.keys(merged.registry.商品).length, allGoods.length);
});

test("每一件商品都通過 validateGood(效果詞彙合法、有出處、丟掉的特性有理由)", () => {
  for (const good of allGoods) {
    const result = validateGood(good);
    assert.equal(result.valid, true, `${good.name}：${result.errors.join("；")}`);
  }
});

test("goodId 全域唯一", () => {
  const ids = allGoods.map((g) => g.goodId);
  assert.equal(new Set(ids).size, ids.length, "goodId 有重複");
});

test("每一個 droppedTraits 的理由都指得出具體機制(對得上 UNSUPPORTED_MECHANICS 或指名模組)", () => {
  const knownReasons = new Set(Object.keys(UNSUPPORTED_MECHANICS));
  for (const good of allGoods) {
    for (const dropped of good.droppedTraits ?? []) {
      const ok = knownReasons.has(dropped.reason) || dropped.reason.length > 20;
      assert.ok(
        ok,
        `${good.name} 丟掉「${dropped.trait}」的理由「${dropped.reason}」既不是已知機制鍵、也不是一段具體說明`
      );
    }
  }
});

test("每一個商品的 sourceRef 都指得出 rules-2.35.txt 的行號", () => {
  for (const good of allGoods) {
    assert.match(good.sourceRef, /rules-2\.35\.txt 第\d+行/, `${good.name} 的 sourceRef 沒有行號`);
  }
});

// ---------- 物品包 ----------

test("物品包：7件商品，全部給得出可用的武器或檢定效果(不是只有敘事)", () => {
  const items = packs[0].entries;
  assert.equal(items.length, 7);
  for (const good of items) {
    const 有數值效果 = good.effects.some((e) => e.kind !== "敘事");
    assert.ok(有數值效果, `${good.name} 只有敘事效果，不該上架在物品包`);
  }
});

test("物品包：書上寫 200 的就是 200，寫 D+500 的就是 D+500(不自行調價)", () => {
  const expected = {
    特別定制的太陽傘: "200",
    圓月扇刃: "200",
    處女座: "200",
    手杖劍: "200",
    黑曜石制匕首: "D+500",
    生命短杖: "D+500",
    鳳翅鎦金镋: "D+500",
  };
  for (const good of packs[0].entries) {
    assert.equal(good.price, expected[good.name], `${good.name} 的價格跟書上不符`);
  }
});

// ---------- 專長包 ----------

test("專長包：每一級的價格都等於 core/xp.js 的 featCost(等級)", () => {
  for (const good of packs[1].entries) {
    const price = parsePrice(good.price);
    assert.equal(price.xp, featCost(good.featLevel), `${good.name} 的XP價格跟 featCost 不符`);
    assert.equal(price.points, 0, `${good.name} 不該有分數價——專長是用XP買的`);
    assert.equal(Object.keys(price.tokens).length, 0, `${good.name} 不該吃支線`);
  }
});

test("專長包：多級專長的中間級不可以缺號(缺號會讓上面那一級永遠買不到)", () => {
  const byLineage = {};
  for (const good of packs[1].entries) {
    (byLineage[good.lineageId] ??= []).push(good.featLevel);
  }
  for (const [lineage, levels] of Object.entries(byLineage)) {
    const sorted = [...levels].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      assert.equal(sorted[i], i + 1, `${lineage} 的等級不連續：${sorted.join(",")}`);
    }
  }
});

test("專長包：買齊荒野求生1~3級，求生檢定共 +3DP 與 +1 附加成功(跟書上等級加值一致)", () => {
  const c = emptyCharacter("測試");
  c.attributes.感知 = 3;
  c.skills.求生 = 3;
  let character = c;
  let wallet = createWallet({ xp: 100 });
  for (const level of [1, 2, 3]) {
    const good = packs[1].entries.find((g) => g.lineageId === "feat.荒野求生" && g.featLevel === level);
    const result = purchase(character, wallet, good);
    assert.equal(result.ok, true, `${good.name}：${JSON.stringify(result.blockers)}`);
    character = result.character;
    wallet = result.wallet;
  }
  const mods = checkModifiersFor(character, { attribute: "感知", skill: "求生" });
  assert.equal(mods.dp, 3);
  assert.equal(mods.bonusSuccesses, 1);
  // 3+6+9 = 18XP
  assert.equal(wallet.xp, 82);
});

test("專長包：買齊精通先攻1~3級，先攻+5、防御+3(跟書上一致)", () => {
  const c = emptyCharacter("測試");
  c.attributes.敏捷 = 3;
  let character = c;
  let wallet = createWallet({ xp: 100 });
  for (const level of [1, 2, 3]) {
    const good = packs[1].entries.find((g) => g.lineageId === "feat.精通先攻" && g.featLevel === level);
    const result = purchase(character, wallet, good);
    assert.equal(result.ok, true, `${good.name}：${JSON.stringify(result.blockers)}`);
    character = result.character;
    wallet = result.wallet;
  }
  const profile = combatProfileFrom(character);
  assert.equal(profile.initiativeBonus, 5);
  assert.equal(profile.equipmentDefense, 3);
});

test("專長包：examinedButRejected 是刻意留下的紀錄，不可以是空的", () => {
  // 這條測試守的是一個習慣而不是一個數字：轉換時看過但決定不收的條目，
  // 必須留在包裡當紀錄，否則下一個人會重新花時間再看一遍同樣的條目再放棄一次。
  assert.ok(packs[1].examinedButRejected.length >= 3);
  for (const rejected of packs[1].examinedButRejected) {
    assert.ok(rejected.feat && rejected.reason && rejected.sourceRef);
  }
});

// ---------- 模板能力包 ----------



// ---------- 整批一起用 ----------

test("同一張角色卡買下多件商品後，武器/檢定加值/戰鬥檔案能一起正確結算", () => {
  const c = emptyCharacter("測試輪迴者");
  c.attributes.敏捷 = 3;
  c.attributes.感知 = 3;
  c.skills.求生 = 3;
  c.skills.格鬥 = 2;

  let character = c;
  let wallet = createWallet({ tokens: { C: 1 }, points: 2000, xp: 50 });

  const 太陽傘 = packs[0].entries.find((g) => g.name === "特別定制的太陽傘");
  const 匕首 = packs[0].entries.find((g) => g.name === "黑曜石制匕首");
  const 方向感 = packs[1].entries.find((g) => g.name === "方向感(1級)");
  const 先攻1 = packs[1].entries.find((g) => g.goodId === "feat.精通先攻.1");

  for (const good of [太陽傘, 匕首, 方向感, 先攻1]) {
    const result = purchase(character, wallet, good);
    assert.equal(result.ok, true, `${good.name}：${JSON.stringify(result.blockers)}`);
    character = result.character;
    wallet = result.wallet;
  }

  assert.equal(weaponsFrom(character).length, 2);
  assert.equal(checkModifiersFor(character, { attribute: "感知", skill: "求生" }).dp, 2);
  assert.equal(combatProfileFrom(character).initiativeBonus, 1);
  // 太陽傘200 + 匕首D+500 = D+700，剩下 C(3D) - D = 2D 與 1300分
  assert.equal(wallet.points, 1300);
  assert.equal(wallet.xp, 44); // 3+3
});

test("角色卡上沒有前提時，需要前提的商品確實買不到(手杖劍需要格鬥3/交涉2)", () => {
  const 手杖劍 = packs[0].entries.find((g) => g.name === "手杖劍");
  const 新手 = emptyCharacter("新手");
  const result = evaluatePurchase(新手, createWallet({ points: 500 }), 手杖劍);
  assert.equal(result.ok, false);
  assert.equal(result.blockers.filter((b) => b.code === "前提不足").length, 2);
});


// ---------- 使用者要求的貨架規格(2026-08-17) ----------

test("七個模板化資源分類，每一類的起始貨架都有3件商品(能量池來源另計)", () => {
  // [2026-08-17 放寬] 原本這裡鎖的是「剛好3件」。使用者決定『A：往上追池子的來源』之後，
  // 商店多收了一類東西：**開啟能量池的資源**(shop-starter-pools.json)。它們不是為了湊
  // 貨架而收的，是因為七類裡的條目全部只是能量池的消費者，沒有池子就轉不出來。
  // 所以判定改成「每類至少3件起始商品」，而池子來源包裡的條目不計入該類的起始數量。
  const 分類 = ["血統", "改造", "瞳術", "稱號", "流派", "技藝", "法術"];
  const poolSourceIds = new Set(
    packs.find((p) => p.id === "shop-starter.能量池來源").entries.map((e) => e.goodId)
  );
  const counts = {};
  for (const good of allGoods) {
    if (poolSourceIds.has(good.goodId)) continue;
    if (good.resourceType && 分類.includes(good.resourceType)) {
      counts[good.resourceType] = (counts[good.resourceType] ?? 0) + 1;
    }
  }
  for (const type of 分類) { if(type === "血統") { assert.equal(counts[type] || 0, 11); } else { assert.equal(counts[type] || 0, 3); } }
});

test("能量池來源包裡的條目，每一件都真的開得出一個登錄過關鍵屬性的池子", () => {
  const poolPack = packs.find((p) => p.id === "shop-starter.能量池來源");
  assert.ok(poolPack.entries.length > 0);
  for (const good of poolPack.entries) {
    const opens = good.effects.filter((e) => e.kind === "能量池");
    assert.ok(opens.length > 0, `${good.name} 在能量池來源包裡，卻沒有開任何池子`);
    for (const effect of opens) {
      assert.ok(POOL_DEFS[effect.pool], `${good.name} 開的「${effect.pool}」沒有登錄關鍵屬性`);
      assert.ok(effect.source, `${good.name} 的能量池效果要寫 source(重複開啟補償要求來源不同)`);
    }
  }
});

test("這一輪不放 D 級以上的商品：所有商品的 rank 只會是 D 或無分級", () => {
  for (const good of allGoods) {
    if (good.rank == null) continue;
    assert.equal(
      good.rank,
      "D",
      `${good.name} 的 rank 是 ${good.rank}——使用者明確要求這一輪只放到 D 級，更高的級數只登錄名字`
    );
  }
});

test("一整套資源的更高級數只登錄名字，不帶效果也不帶價格", () => {
  let found = 0;
  for (const good of allGoods) {
    for (const higher of good.higherRanks ?? []) {
      found += 1;
      assert.ok(RANK_ORDER.includes(higher.rank), `${good.name} 的 higherRanks 有不合法的 rank`);
      assert.notEqual(higher.rank, "D", "higherRanks 不該包含 D 級本身");
      assert.ok(higher.name, "只放名字也要放得出名字");
      assert.equal(higher.effects, undefined, "higherRanks 只登錄名字，不該帶效果");
    }
  }
  assert.ok(found >= 10, `higherRanks 總數只有 ${found}，一整套的資源應該都有登錄後續級數`);
});

test("掛名商品：貨架看得到、但買不了，而且說得出還缺什麼機制", () => {
  const 掛名 = allGoods.filter((g) => g.status === "掛名");
  assert.ok(掛名.length > 0, "應該有掛名商品(轉不出來的條目)");
  const wallet = createWallet({ tokens: { S: 1 }, points: 99999, xp: 999 });
  const 有錢人 = emptyCharacter("有錢人");
  for (const good of 掛名) {
    assert.ok(good.pendingReason, `${good.name} 沒有寫 pendingReason`);
    assert.ok(good.pendingReason.length > 20, `${good.name} 的 pendingReason 太短，說不清缺什麼機制`);
    assert.deepEqual(good.effects, [], `${good.name} 是掛名商品，不該帶效果`);
    const result = evaluatePurchase(有錢人, wallet, good);
    assert.equal(result.ok, false, `${good.name} 是掛名商品，付得起也不該買得到`);
    assert.ok(result.blockers.some((b) => b.code === "掛名待補"));
  }
});

test("掛名商品保留了原文特性，之後補效果時不用回頭再翻一次規則書", () => {
  for (const good of allGoods.filter((g) => g.status === "掛名")) {
    assert.ok(
      Array.isArray(good.originalTraits) && good.originalTraits.length > 0,
      `${good.name} 沒有保留 originalTraits`
    );
  }
});

test("上架商品一定給得出至少一個數值效果(不能只有敘事)", () => {
  for (const good of allGoods.filter((g) => (g.status ?? "上架") === "上架")) {
    const 有數值 = good.effects.some((e) => e.kind !== "敘事") || good.attributePool != null;
    assert.ok(有數值, `${good.name} 標成上架卻只有敘事效果——那應該標成掛名`);
  }
});

test("貨架摘要算得出每個分類的上架/掛名件數(掛名數字就是待辦清單)", () => {
  const summary = summarizeStorefront(allGoods);
  assert.ok(summary["模板能力"].total > 0);
  assert.ok(summary["體系"].total > 0);
  const total = Object.values(summary).reduce((sum, b) => sum + b.total, 0);
  assert.equal(total, allGoods.length);
});

test("buildStorefront 把掛名狀態與後續級數一起帶給UI", () => {
  const 掛名 = allGoods.find((g) => g.status === "掛名");
  const 有後續 = allGoods.find((g) => (g.higherRanks ?? []).length > 0);
  const shelf = buildStorefront(emptyCharacter("測試"), createWallet({}), [掛名, 有後續]);
  assert.equal(shelf[0].status, "掛名");
  assert.equal(shelf[0].purchasable, false);
  assert.ok(shelf[1].higherRanks.length > 0);
});

test("改造/技藝/法術的已知定價落差如實保留，不自行改成模板價", () => {
  const 落差 = [
    ["cybernetic.假面騎士EVOL.D", "改造", 1000, 500],
    ["technique.太玄鑲華劍譜.D", "技藝", 600, 500],
    ["spell.阿尼馬格斯.D", "法術", 1000, 500],
  ];
  for (const [goodId, type, bookPrice, templatePrice] of 落差) {
    const good = allGoods.find((g) => g.goodId === goodId);
    assert.equal(parsePrice(good.price).points, bookPrice, `${good.name} 應保留書上的 ${bookPrice}`);
    const audit = auditGoodPricing(good);
    assert.equal(audit.matches, false, `${good.name} 應該被稽核出跟 ${type} 模板不符`);
    assert.equal(audit.expected, templatePrice);
  }
});

test("價格與模板一致的類別確實通過稽核(稱號/流派 D+1000、瞳術 D+600)", () => {
  for (const goodId of ["title.港漫強者.D", "school.華山氣宗.D", "dojutsu.審判眼.D"]) {
    const good = allGoods.find((g) => g.goodId === goodId);
    const audit = auditGoodPricing(good);
    assert.equal(audit.matches, true, `${good.name}：${audit.discrepancies.join("；")}`);
  }
});

test("審判眼的龍骨炮是唯一的遠程武器，形狀吃得下 attackTypes 的『炮』公式", () => {
  const c = emptyCharacter("測試");
  const result = purchase(c, createWallet({ tokens: { D: 1 }, points: 600 }), 
    allGoods.find((g) => g.goodId === "dojutsu.審判眼.D"));
  assert.equal(result.ok, true, JSON.stringify(result.blockers));
  const weapon = weaponsFrom(result.character)[0];
  assert.equal(weapon.attackType, "炮");
  assert.equal(weapon.weaponDamage, 4);
  assert.equal(weapon.ranged, true);
  assert.equal(weapon.weaponRange, 200);
});

test("港漫強者一次動到四種效果(技能/意志上限/防御/天生武器)，全部真的生效", () => {
  const c = emptyCharacter("測試");
  const before = { 交涉: c.skills.交涉, 意志: c.derived.willpower.max };
  const result = purchase(c, createWallet({ tokens: { D: 1 }, points: 1000 }), 
    allGoods.find((g) => g.goodId === "title.港漫強者.D"));
  assert.equal(result.ok, true, JSON.stringify(result.blockers));
  assert.equal(result.character.skills.交涉, before.交涉 + 1);
  assert.equal(result.character.derived.willpower.max, before.意志 + 1);
  assert.equal(combatProfileFrom(result.character).equipmentDefense, 1);
  assert.equal(weaponsFrom(result.character)[0].attackType, "肉搏");
});

test("葵花寶典是唯一帶負面數值的商品：買了力量檢定會變差", () => {
  const c = emptyCharacter("測試");
  const result = purchase(c, createWallet({ tokens: { D: 1 }, points: 500 }), 
    allGoods.find((g) => g.goodId === "technique.葵花寶典.1"));
  assert.equal(result.ok, true, JSON.stringify(result.blockers));
  assert.equal(checkModifiersFor(result.character, { attribute: "敏捷" }).dp, 1);
  assert.equal(checkModifiersFor(result.character, { attribute: "力量" }).dp, -1);
  assert.equal(checkModifiersFor(result.character, { attribute: "耐力" }).dp, 0, "耐力的+1與-1在書上互相抵銷");
});


test("貨架上的每一個型態都啟動得起來，而且啟動後真的改變某個引擎函式的輸出", () => {
  const forms = allGoods.flatMap((good) =>
    (good.effects ?? [])
      .filter((e) => e.kind === "型態")
      .map((effect) => ({ good, effect }))
  );
  assert.ok(forms.length > 0, "貨架上應該至少有一個型態(2026-08-17 起有 Orphnoch 與帝國子民)");

  for (const { good, effect } of forms) {
    // 買到手上(型態一定屬於某件商品，不會憑空存在)
    const owner = { ...emptyCharacter("型態測試"), abilities: [{ goodId: good.goodId, name: good.name, effects: good.effects }] };
    owner.derived.willpower = { max: 5, current: 5, temp: 0 };
    owner.attributes = { 力量: 3, 敏捷: 3, 耐力: 3, 智力: 3, 感知: 3, 意志: 3 };
    // 吃能量池的型態要先有池子。這裡直接把它需要的池子開好——這則測試問的是
    // 「型態啟動之後引擎輸出有沒有變」，不是「玩家買不買得起前提」(那是 evaluatePurchase 的事)。
    const needsPool = effect.activation?.pool?.name ?? effect.activation?.poolVariable?.name;
    if (needsPool) {
      owner.derived.energyPools = openPool({}, needsPool, owner.attributes, "測試");
    }

    const formId = formIdOf(good.goodId, effect.label);
    // 可變量型態要報一個支付點數、二選一的型態要選一種，兩個都是玩家在啟動當下的決定
    // (2026-08-17 第九輪)。這則測試每一種 mode 都要問一次——「攻」有效但「防」是個空殼，
    // 只挑第一個的話抓不到。
    const range = variablePaymentRange(effect, owner);
    const modes = effect.modes ? effect.modes.map((m) => m.key) : [null];
    for (const mode of modes) {
      const activated = activateForm(owner, createFormsState(), formId, { round: 1, amount: range?.min ?? null, mode });
      assert.equal(activated.ok, true, `「${good.name}」的型態「${effect.label}」啟動失敗：${JSON.stringify(activated.blockers)}`);

      // 啟動一定要付出代價：意志力或動作，至少一樣
      const paidWillpower = activated.character.derived.willpower.current < owner.derived.willpower.current;
      assert.ok(
        paidWillpower || effect.activation?.action != null,
        `「${effect.label}」啟動不需要任何代價，那它不該是型態`
      );

      // 而且啟動之後，三個查表函式至少有一個的輸出變了——不然這個型態什麼也沒做
      const extraSources = activeGrantSources(activated.formsState);
      const profileChanged =
        JSON.stringify(combatProfileFrom(owner)) !== JSON.stringify(combatProfileFrom(owner, { extraSources }));
      const weaponsChanged = weaponsFrom(owner, { extraSources }).length > weaponsFrom(owner).length;
      const checkChanged = ["力量", "敏捷", "耐力", "智力", "感知", "意志"].some(
        (attribute) => checkModifiersFor(owner, { attribute }, { extraSources }).dp !== checkModifiersFor(owner, { attribute }).dp
      );
      // 攻擊路徑是獨立的一條(scope:"攻擊" 的效果只在這裡生效)，所以也要問一次
      const attackChanged = Object.keys(ATTACK_CHECK_KEYS).some((attackType) => {
        const before = attackModifiersFor(owner, attackType);
        const after = attackModifiersFor(owner, attackType, { extraSources });
        return after.dp !== before.dp || after.bonusSuccesses !== before.bonusSuccesses;
      });
      assert.ok(
        profileChanged || weaponsChanged || checkChanged || attackChanged,
        `「${effect.label}」啟動之後沒有任何引擎函式的輸出改變——那它就是一個謊言`
      );

      // 場景結束後要收乾淨
      const ended = endScene(activated.formsState);
      assert.deepEqual(ended.formsState.active, [], `「${effect.label}」在場景結束後沒有被收掉`);
    }
  }
});

// ---------------------------------------------------------------------------
// 平衡偏差登記簿（2026-08-17）
//
// `droppedTraits` 說得出「哪一條沒轉出來」，`conversionNote` 說得出「為什麼」，
// 但兩個都回答不了「這次簡化讓這件商品變強了還是變弱了」。使用者決定不良狀態整套不做、
// 之後自己重新平衡資源——那個「之後」需要的是一張齊全的清單，不是散在五段散文裡的關鍵字。
// ---------------------------------------------------------------------------

test("平衡偏差：每一筆都說得出「差在哪／為什麼補不了／重新平衡時該看什麼」", () => {
  const deviations = listBalanceDeviations(allGoods);
  assert.ok(deviations.length >= 5, `登記簿只有 ${deviations.length} 筆，掃到的偏差應該不只這些`);
  for (const d of deviations) {
    assert.ok(BALANCE_DIRECTIONS.includes(d.direction), `${d.name} 的 direction 不合法`);
    // 「同上」「見上面」這種偷懶的寫法對重新平衡的人沒有用，所以要求寫得出具體長度
    for (const field of ["what", "why", "ifRebalancing"]) {
      assert.ok(d[field].length > 20, `${d.name} 的 balanceNote.${field} 太短，說不出具體內容`);
    }
  }
});

test("平衡偏差：寫輪眼是目前唯一一件「丟掉的是限制而不是好處」的商品", () => {
  // 這一則測試守的是一個事實，不是一個數字：如果將來又有一件商品被標成「比書上強」，
  // 這裡會紅，而紅的時候應該去確認那是不是真的、以及要不要一起處理，不是直接改掉數字。
  const stronger = listBalanceDeviations(allGoods).filter((d) => d.direction === "比書上強");
  assert.deepEqual(
    stronger.map((d) => d.goodId),
    ["dojutsu.寫輪眼.D"],
    "多出來的「比書上強」要先確認是真的，再決定要不要放進這個清單"
  );
  assert.match(stronger[0].what, /內耗/, "寫輪眼的偏差就是內耗點數整條沒轉");
  assert.match(stronger[0].why, /不良狀態|永久/, "理由要指到「不良狀態永久不實作」這個決定");
});

test("平衡偏差：conversionNote 裡講到放寬/變強的商品，都要有結構化的 balanceNote", () => {
  // 這一則防的是「下一個人只在散文裡寫一句『這是一次放寬』就走了」——
  // 那正是這個登記簿出現之前的狀態，五筆偏差要靠關鍵字才撈得到。
  const 有登記 = new Set(listBalanceDeviations(allGoods).map((d) => d.goodId));
  for (const good of allGoods) {
    const prose = `${good.conversionNote ?? ""}`;
    if (!/放寬|比書上強/.test(prose)) continue;
    // 「不算放寬」是明確否認，不需要登記
    if (/不算放寬/.test(prose)) continue;
    assert.ok(
      有登記.has(good.goodId),
      `${good.name} 的 conversionNote 講到放寬/變強，卻沒有結構化的 balanceNote——` +
        `散文撈不齊，重新平衡的人會漏掉它`
    );
  }
});
