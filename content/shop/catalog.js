// [設計＋規則書] 主神商店的商品結構與購買流程。
//
// 分工：
//   wallet.js   [規則書] 錢長什麼樣、怎麼扣            (支線/分數/XP)
//   effects.js  [設計]   商品能做什麼的封閉詞彙表        (效果 → 引擎欄位)
//   catalog.js  這一層   商品長什麼樣、什麼情況不准買    (前提/排他/順序/餘額)
//   pricing.js  [規則書] 公式定價的商品(屬性/技能/療傷/復活/洗點)
//
// 購買限制的規則書出處：
//   - 「模板能力」五類排他：rules-2.35.txt 第659~660行(核心規則部分.htm)
//     「以上分類中，血統、改造、瞳術、修真、魔導書這五項具有排他性，這種兌換只能兌換一種，
//       之后只能升級而不能再購買同一分類的其他兌換」
//   - 依序購買：rules-2.35.txt 第11312行起(洗點.htm「總綱」)
//     「若沒有特殊說明，則主神空間的所有強化默認必須按順序購買，D-C-B-A-S」
//   - 兌換是自由動作、且只能在主神空間：rules-2.35.txt 第469行
//
// [設計] 前提檢查(prerequisites)是本專案的翻譯結果，不是書上的欄位格式：書中前提寫成
// 「需求敏捷3，運動技能2級並擁有專業"輕投擲武器"」這種自由文字，其中「專業」在簡化規則
// 裡不存在(見 effects.js 的 UNSUPPORTED_MECHANICS)，而「運動」這種技能名要先對映到十技能。
// 所以 prerequisites 是轉換時人工翻譯出來的結構化欄位，原文保留在 sourceRef 旁的 note 裡。

import { getTemplate } from "../templates.js";
import { validateEffect, applyPermanentEffects } from "./effects.js";
import { parsePrice, canAfford, pay, formatPrice } from "./wallet.js";
import { priceAt, formatPriceAt } from "./access.js";

/** 模板能力五類，一個角色一輩子只能挑一類裡的一個(可升級，不可換)。 */
export const EXCLUSIVE_TEMPLATE_TYPES = Object.freeze(["血統", "改造", "瞳術", "修真", "魔導書"]);

/** 依序購買的階梯。AA 只出現在血統/稱號/流派，其餘分類跳過即可。 */
export const RANK_ORDER = Object.freeze(["D", "C", "B", "A", "AA", "S"]);

/**
 * 商品的上架狀態。這是 2026-08-17 依使用者「轉不出來的先放名字就好」的決定加上的第三態，
 * 在此之前只有「轉得出來就上架」與「轉不出來就不收」兩種下場。
 *
 *   上架 —— 效果已經完整轉成 effects.js 的詞彙，可以購買，買了會真的改變引擎的輸出。
 *   掛名 —— 只登錄名稱、價格、出處與「為什麼還轉不出來」，**不可購買**。
 *           它存在的意義是讓貨架看得出「這個分類還有什麼東西在等」，
 *           而不是讓玩家以為這個分類只有那幾件。
 *
 * 掛名不是偷懶的擋箭牌：`pendingReason` 是必填，而且必須指得出具體缺什麼機制。
 * 一件掛名商品之所以掛名，理由永遠是「引擎缺某個東西」，不會是「還沒空轉」。
 */
export const GOOD_STATUS = Object.freeze(["上架", "掛名"]);

/** 商店貨架分類。跟 content/loader.js 的 KNOWN_TYPES 是同一組概念，但商店多了「服務」。 */
export const SHOP_CATEGORIES = Object.freeze([
  "服務", // 特殊兌換：療傷/復活/洗點/精神時光屋
  "直接強化", // 屬性/技能直購(公式定價，見 pricing.js)
  "物品", // 武器/防具/輔助物品/消耗品
  "專長", // 個人專長(XP定價)
  "模板能力", // 血統/改造/瞳術/修真/魔導書
  "體系", // 稱號/流派/技藝/法術
]);

/**
 * 驗證一個商品條目。這是型錄轉換的守門員：轉出來的 JSON 過不了這關就不准進商店。
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateGood(good) {
  const errors = [];
  const where = good?.name ? `商品「${good.name}」` : "商品(無名稱)";
  if (!good || typeof good !== "object") return { valid: false, errors: ["商品不是物件"] };

  if (!good.goodId) errors.push(`${where} 缺少 goodId`);
  if (!good.name) errors.push(`${where} 缺少 name`);
  if (!SHOP_CATEGORIES.includes(good.category)) {
    errors.push(`${where} 的 category「${good.category}」不合法，合法值：${SHOP_CATEGORIES.join("/")}`);
  }
  if (!("price" in good)) errors.push(`${where} 缺少 price(免費請明確寫 "免費" 或 0，不要省略)`);
  else {
    try {
      parsePrice(good.price);
    } catch (e) {
      errors.push(`${where} 的 price 解析失敗：${e.message}`);
    }
  }
  if (good.rank != null && !RANK_ORDER.includes(good.rank)) {
    errors.push(`${where} 的 rank「${good.rank}」不合法，合法值：${RANK_ORDER.join("/")}`);
  }
  if (good.rank != null && !good.lineageId) {
    errors.push(`${where} 有 rank 卻沒有 lineageId——依序購買需要知道「這是哪一條資源的第幾級」`);
  }
  if (good.featLevel != null) {
    if (!Number.isInteger(good.featLevel) || good.featLevel < 1 || good.featLevel > 5) {
      errors.push(`${where} 的 featLevel「${good.featLevel}」不合法(專長等級是1~5)`);
    }
    if (!good.lineageId) errors.push(`${where} 有 featLevel 卻沒有 lineageId——按序學習需要知道是哪一個專長`);
    if (good.category !== "專長") errors.push(`${where} 有 featLevel 卻不是「專長」分類`);
  }
  if (good.attributePool != null) {
    const pool = good.attributePool;
    if (!Number.isInteger(pool.points) || pool.points <= 0) {
      errors.push(`${where} 的 attributePool.points 必須是正整數`);
    }
    if (!Number.isInteger(pool.capPerAttribute) || pool.capPerAttribute <= 0) {
      errors.push(`${where} 的 attributePool.capPerAttribute 必須是正整數(模板規定的單項屬性上限)`);
    }
  }
  const status = good.status ?? "上架";
  if (!GOOD_STATUS.includes(status)) {
    errors.push(`${where} 的 status「${status}」不合法，合法值：${GOOD_STATUS.join("/")}`);
  }
  if (status === "掛名") {
    if (!good.pendingReason) {
      errors.push(
        `${where} 是掛名商品卻沒有 pendingReason——掛名的理由永遠是「引擎缺某個機制」，必須指名是哪一個`
      );
    }
    if (Array.isArray(good.effects) && good.effects.some((e) => e.kind !== "敘事")) {
      errors.push(`${where} 是掛名商品，不該帶有數值效果(掛名代表效果還轉不出來)`);
    }
  }

  if (!Array.isArray(good.effects)) {
    errors.push(`${where} 的 effects 必須是陣列(沒有數值效果請寫成一個 kind:"敘事" 的效果，不要留空欄位)`);
  } else {
    if (good.effects.length === 0 && !good.attributePool && status !== "掛名") {
      errors.push(`${where} 的 effects 是空陣列——一個什麼都不做的商品不該上架`);
    }
    good.effects.forEach((effect, i) => {
      errors.push(...validateEffect(effect, `${where} effects[${i}]`));
    });
  }

  // 一整套(D→C→B→A→S)的資源，這一輪只轉 D 級，更高的級數只登錄名稱。
  if (good.higherRanks != null) {
    if (!Array.isArray(good.higherRanks)) errors.push(`${where} 的 higherRanks 必須是陣列`);
    else {
      good.higherRanks.forEach((h, i) => {
        if (!RANK_ORDER.includes(h.rank)) {
          errors.push(`${where} higherRanks[${i}] 的 rank「${h.rank}」不合法`);
        }
        if (h.rank === "D") {
          errors.push(`${where} higherRanks[${i}] 不該是 D 級——D 級是這件商品本身`);
        }
        if (!h.name) errors.push(`${where} higherRanks[${i}] 缺少 name(只放名字也要放得出名字)`);
      });
    }
  }
  if (good.droppedTraits != null) {
    if (!Array.isArray(good.droppedTraits)) errors.push(`${where} 的 droppedTraits 必須是陣列`);
    else {
      good.droppedTraits.forEach((d, i) => {
        if (!d?.trait) errors.push(`${where} droppedTraits[${i}] 缺少 trait(原文特性名)`);
        if (!d?.reason) {
          errors.push(
            `${where} droppedTraits[${i}] 缺少 reason——丟掉一個特性一定要寫明理由，` +
              `理由字串建議直接用 effects.js 的 UNSUPPORTED_MECHANICS 的鍵`
          );
        }
      });
    }
  }
  // 平衡偏差是選填的，但一旦填了就要填齊——「有偏差」三個字對重新平衡的人沒有用。
  if (good.balanceNote != null) {
    const note = good.balanceNote;
    if (!BALANCE_DIRECTIONS.includes(note.direction)) {
      errors.push(
        `${where} 的 balanceNote.direction「${note.direction}」不合法，合法值：${BALANCE_DIRECTIONS.join("/")}`
      );
    }
    for (const field of ["what", "why", "ifRebalancing"]) {
      if (!note[field]) {
        errors.push(
          `${where} 的 balanceNote 缺少「${field}」——一筆平衡偏差要說得出` +
            `「差在哪(what)、為什麼補不了(why)、重新平衡時該看什麼(ifRebalancing)」`
        );
      }
    }
  }
  if (!good.sourceRef) {
    errors.push(`${where} 缺少 sourceRef——每個商品都要能回頭核對 rules-2.35.txt 的行號`);
  }
  return { valid: errors.length === 0, errors };
}

/** 拿商品去跟 templates.js 的模板定價比對(只有已模板化的 resourceType 有意義)。 */
export function auditGoodPricing(good) {
  if (!good.resourceType || !good.rank) return { applicable: false, discrepancies: [] };
  let template;
  try {
    template = getTemplate(good.resourceType);
  } catch {
    return { applicable: false, discrepancies: [] };
  }
  const expected = template.price[good.rank];
  if (expected == null) return { applicable: false, discrepancies: [] };

  const parsed = parsePrice(good.price);
  const discrepancies = [];
  if (parsed.points !== expected) {
    discrepancies.push(
      `價格不符：商品寫${formatPrice(parsed)}(分數${parsed.points})，${good.resourceType}模板規定${good.rank}級應為${expected}分`
    );
  }
  return { applicable: true, matches: discrepancies.length === 0, discrepancies, expected };
}

function ownedList(character) {
  return character.abilities ?? [];
}

/** 這個角色已經佔用了哪一個模板能力分類(血統/改造/…)，回傳 {分類: 已持有的lineageId}。 */
export function ownedExclusiveTemplates(character) {
  const out = {};
  for (const owned of ownedList(character)) {
    if (owned.exclusiveGroup) out[owned.exclusiveGroup] = owned.lineageId ?? owned.goodId;
  }
  return out;
}

/**
 * 評估一筆購買，把所有擋下來的理由一次列齊(不是遇到第一個就回傳)——
 * 商店UI要能一次告訴玩家「你差500分、而且力量不夠」，而不是修一個冒一個。
 * @returns {{ ok: boolean, blockers: {code: string, message: string}[], price: object }}
 */
export function evaluatePurchase(character, wallet, good, options = {}) {
  const blockers = [];
  const listedPrice = parsePrice(good.price);

  // 地點門禁(規則書第469行)：支線/獎勵點數只能在主神空間花，XP在副本中要付兩倍。
  // 預設「主神空間」是為了讓不在乎地點的呼叫端(測試、稽核工具)行為不變——
  // 真正的遊戲流程一定會把 location 傳進來，見 functions/api/shop.js。
  const location = options.location ?? "主神空間";
  const access = priceAt(listedPrice, location, { inCombat: options.inCombat === true });
  const price = access.price;
  blockers.push(...access.blockers);

  // 掛名商品在貨架上看得到、但買不了。這一條擺在最前面而且不 return，
  // 是為了讓玩家同時看到「這件還沒做好」與「就算做好了你也還差500分」——
  // 兩件事都是他想知道的。
  if (good.status === "掛名") {
    blockers.push({
      code: "掛名待補",
      message: `「${good.name}」目前只登錄了名稱，效果還轉不出來：${good.pendingReason}`,
    });
  }

  // 0) 屬性點數分配。血統/改造/瞳術每一級都會給一包「自由分配的屬性點」
  //    (見 content/templates.js 的 attributePerRank / attributeCapPerRank)，
  //    分配是玩家的選擇，所以由呼叫端傳進來，這裡只負責檢查合不合法——
  //    這正是本專案第4條最高原則的做法：玩家/AI 只能在有限選項裡挑，數值由程式碼把關。
  if (good.attributePool) {
    const allocation = options.allocation;
    if (!allocation) {
      blockers.push({
        code: "待分配屬性",
        message: `本商品提供${good.attributePool.points}點自由屬性點(單項上限${good.attributePool.capPerAttribute})，購買時必須指定怎麼分配`,
      });
    } else {
      const total = Object.values(allocation).reduce((a, b) => a + b, 0);
      if (total !== good.attributePool.points) {
        blockers.push({
          code: "分配不符",
          message: `屬性點必須剛好分配完${good.attributePool.points}點，目前分配了${total}點`,
        });
      }
      for (const [attr, amount] of Object.entries(allocation)) {
        if (character.attributes?.[attr] == null) {
          blockers.push({ code: "分配不符", message: `角色卡沒有屬性「${attr}」` });
        }
        if (!Number.isInteger(amount) || amount < 0) {
          blockers.push({ code: "分配不符", message: `「${attr}」的分配點數必須是非負整數` });
        } else if (amount > good.attributePool.capPerAttribute) {
          blockers.push({
            code: "分配不符",
            message: `「${attr}」分配了${amount}點，超過模板規定的單項上限${good.attributePool.capPerAttribute}點`,
          });
        }
      }
    }
  }

  // 1) 餘額
  const afford = canAfford(wallet, price);
  if (!afford.affordable) {
    const parts = [];
    if (afford.shortfall.tokenD) parts.push(`支線還差${afford.shortfall.tokenD}個D當量`);
    if (afford.shortfall.points) parts.push(`分數還差${afford.shortfall.points}`);
    if (afford.shortfall.xp) parts.push(`XP還差${afford.shortfall.xp}`);
    blockers.push({ code: "餘額不足", message: parts.join("、") });
  }

  // 2) 前提(屬性/技能)
  for (const [attr, need] of Object.entries(good.prerequisites?.attributes ?? {})) {
    const have = character.attributes?.[attr] ?? 0;
    if (have < need) blockers.push({ code: "前提不足", message: `需要${attr}${need}，目前${have}` });
  }
  for (const [skill, need] of Object.entries(good.prerequisites?.skills ?? {})) {
    const have = character.skills?.[skill] ?? 0;
    if (have < need) blockers.push({ code: "前提不足", message: `需要${skill}技能${need}級，目前${have}級` });
  }
  // 「必須先擁有某件商品」——2026-08-17 追能量池來源時加的。書上大量條目的前提是
  // 另一個資源(青蓮劍歌總決的前提是混元劍經第一層)，那種前提在此之前只能寫在註解裡，
  // 擋不住任何人。現在它是一個真的擋得住的欄位。
  for (const requiredId of good.prerequisites?.goods ?? []) {
    if (!ownedList(character).some((o) => o.goodId === requiredId)) {
      const name = requiredId;
      blockers.push({ code: "前提不足", message: `需要先擁有「${name}」` });
    }
  }

  // 3) 重複購買(消耗品除外)
  if (!good.consumable && ownedList(character).some((o) => o.goodId === good.goodId)) {
    blockers.push({ code: "已持有", message: `已經擁有「${good.name}」，不需要重複購買` });
  }

  // 4) 模板能力排他
  if (good.exclusiveGroup) {
    if (!EXCLUSIVE_TEMPLATE_TYPES.includes(good.exclusiveGroup)) {
      blockers.push({
        code: "設定錯誤",
        message: `exclusiveGroup「${good.exclusiveGroup}」不是模板能力五類之一：${EXCLUSIVE_TEMPLATE_TYPES.join("/")}`,
      });
    } else {
      const occupied = ownedExclusiveTemplates(character)[good.exclusiveGroup];
      if (occupied && occupied !== (good.lineageId ?? good.goodId)) {
        blockers.push({
          code: "模板能力排他",
          message: `已經有${good.exclusiveGroup}「${occupied}」，同一分類只能擁有一種，之後只能升級不能改買別的`,
        });
      }
    }
  }

  // 5a) 專長的等級順序。專長不走 DCBAS，走 1~5 級，規則書「專長概述」(第723行)明文：
  //     「若一個專長擁有多個等級，你必須為每一等級單獨學習，并且必須按順序學習。」
  if (good.featLevel != null) {
    const ownedLevels = new Set(
      ownedList(character)
        .filter((o) => o.lineageId === good.lineageId && o.featLevel != null)
        .map((o) => o.featLevel)
    );
    const missing = [];
    for (let lv = good.startsAtFeatLevel ?? 1; lv < good.featLevel; lv++) {
      if (!ownedLevels.has(lv)) missing.push(lv);
    }
    if (missing.length > 0) {
      blockers.push({
        code: "順序未達",
        message: `專長必須按順序學習，還缺 ${missing.join("/")} 級`,
      });
    }
    // 專長概述第730行：「對于基本前提和屬性掛鉤的專長，其等級不得超過該屬性數值」
    for (const attr of good.featAttributeCaps ?? []) {
      const have = character.attributes?.[attr] ?? 0;
      if (good.featLevel > have) {
        blockers.push({
          code: "屬性上限",
          message: `本專長的等級不得超過${attr}數值(目前${have})，無法學到${good.featLevel}級`,
        });
      }
    }
  }

  // 5b) 依序購買 D→C→B→A→(AA)→S
  if (good.rank) {
    const idx = RANK_ORDER.indexOf(good.rank);
    const ownedRanks = new Set(
      ownedList(character)
        .filter((o) => o.lineageId === good.lineageId && o.rank)
        .map((o) => o.rank)
    );
    // AA 是血統/稱號/流派限定的岔路，往前找時允許跳過(A 之後可以直接上 S)。
    const missing = RANK_ORDER.slice(0, idx).filter((r) => r !== "AA" && !ownedRanks.has(r));
    if (missing.length > 0 && !good.startsAtRank) {
      blockers.push({
        code: "順序未達",
        message: `${good.rank}級之前必須先擁有 ${missing.join("→")} 級(書中預設強化按 D-C-B-A-S 順序購買)`,
      });
    }
  }

  return { ok: blockers.length === 0, blockers, price };
}

/**
 * 實際成交。回傳新的 character 與 wallet(都不改動傳入物件)。
 * 呼叫端有義務先看 evaluatePurchase()——這裡再擋一次是防呆，不是備援。
 * @returns {{ ok: boolean, blockers?: object[], character?: object, wallet?: object, receipt?: object }}
 */
export function purchase(character, wallet, good, options = {}) {
  const evaluation = evaluatePurchase(character, wallet, good, options);
  if (!evaluation.ok) return { ok: false, blockers: evaluation.blockers };

  // 自由分配的屬性點在成交當下才變成具體的「屬性」效果，之後就跟寫死的效果沒有分別
  // (包含洗點時要退回來的部分，看的都是同一份 owned.effects)。
  const allocationEffects = good.attributePool
    ? Object.entries(options.allocation)
        .filter(([, amount]) => amount > 0)
        .map(([attribute, amount]) => ({ kind: "屬性", attribute, amount }))
    : [];
  const effects = [...good.effects, ...allocationEffects];

  const nextWallet = pay(wallet, evaluation.price, good.name);
  const owned = {
    goodId: good.goodId,
    name: good.name,
    category: good.category,
    lineageId: good.lineageId ?? null,
    rank: good.rank ?? null,
    featLevel: good.featLevel ?? null,
    exclusiveGroup: good.exclusiveGroup ?? null,
    consumable: good.consumable === true,
    effects,
    sourceRef: good.sourceRef,
  };
  const withAbility = { ...character, abilities: [...ownedList(character), owned] };
  const nextCharacter = applyPermanentEffects(withAbility, effects);

  return {
    ok: true,
    character: nextCharacter,
    wallet: nextWallet,
    receipt: {
      goodId: good.goodId,
      name: good.name,
      pricePaid: formatPrice(evaluation.price),
      droppedTraits: good.droppedTraits ?? [],
    },
  };
}

/**
 * 把商品包(type="商品")攤成貨架，順便標記每一件「這個角色現在買不買得起／買不買得到」。
 * 不會把買不到的商品濾掉——玩家看得到但買不了，才知道要往哪個方向練。
 */
export function buildStorefront(character, wallet, goods, options = {}) {
  const location = options.location ?? "主神空間";
  return goods.map((good) => {
    const evaluation = evaluatePurchase(character, wallet, good, options);
    // 「還沒指定屬性點怎麼分配」不是買不起，是還沒填表單。貨架上要跟真正的阻擋分開顯示，
    // 否則每個血統/改造都會長得像買不起。
    const blockers = evaluation.blockers.filter((b) => b.code !== "待分配屬性");
    return {
      good,
      price: formatPriceAt(parsePrice(good.price), location, { inCombat: options.inCombat === true }),
      status: good.status ?? "上架",
      purchasable: blockers.length === 0,
      needsAllocation: good.attributePool != null,
      // 一整套資源的後續級數，只有名字。UI 拿它顯示「這條線之後還會長成什麼樣」。
      higherRanks: good.higherRanks ?? [],
      blockers,
    };
  });
}

/**
 * 平衡偏差的方向。**這三個值講的都是「跟書上比」，不是「跟其他商品比」。**
 *   比書上強 —— 原文的某個**限制**沒有被轉出來（丟掉一條代價＝白送好處）
 *   比書上弱 —— 原文的某個好處沒有被轉出來，而且轉不出來是永久的
 *   放寬範圍 —— 效果本身照抄，但生效範圍變大了（最常見：子項專業→整個技能）
 */
export const BALANCE_DIRECTIONS = Object.freeze(["比書上強", "比書上弱", "放寬範圍"]);

/**
 * [設計 2026-08-17] **平衡偏差登記簿。**
 *
 * `droppedTraits` 記的是「哪一條特性沒轉出來」，`conversionNote` 記的是「為什麼」。
 * 但這兩個都回答不了一個問題：**這次簡化到底讓這件商品變強了還是變弱了？**
 *
 * 這個問題本來散在各條目的 `conversionNote` 散文裡（有五件，用字各不相同：
 * 「刻意放寬」「明顯的放寬」「比書上強」…），要靠關鍵字去撈才找得齊。使用者說
 * 「不良狀態全部刪除，之後我自己看資源要怎麼平衡」——那個「之後」需要的正是一張齊全的清單，
 * 而不是五段散文。
 *
 * **為什麼是結構化欄位而不是只寫在文件裡**：文件會跟資料走鐘，欄位不會——
 * `test/shopPacks.test.js` 守著「每一筆的四個欄位都要填、direction 必須合法」，
 * 而 CONVERSION_RULES.md 第14節那張表是從這裡抄出來的。
 *
 * 最重要的一筆是**寫輪眼**：它是目前唯一一件「丟掉的是限制、不是好處」的商品。
 */
export function listBalanceDeviations(goods) {
  return goods
    .filter((g) => g.balanceNote)
    .map((g) => ({ goodId: g.goodId, name: g.name, ...g.balanceNote }))
    .sort((a, b) => BALANCE_DIRECTIONS.indexOf(a.direction) - BALANCE_DIRECTIONS.indexOf(b.direction));
}

/**
 * 貨架的統計摘要 —— 每個分類各有幾件上架、幾件掛名。
 * 這個函式存在的理由跟 CONVERSION_RULES.md 的「轉換率」那一節是同一件事：
 * 掛名數字本身就是待辦清單，它應該一直被看見，而不是埋在JSON裡。
 */
export function summarizeStorefront(goods) {
  const summary = {};
  for (const good of goods) {
    const bucket = (summary[good.category] ??= { 上架: 0, 掛名: 0, total: 0 });
    bucket[good.status ?? "上架"] += 1;
    bucket.total += 1;
  }
  return summary;
}
