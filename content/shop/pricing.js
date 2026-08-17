// [規則書] 公式定價的商品 —— 價格不是寫死在型錄裡，而是依角色現況算出來的那些。
// 出處集中在兩頁：
//   - 「特殊兌換」(主神修復.htm)，rules-2.35.txt 第7743~7752行 —— 療傷/修復/洗點/精神時光屋
//   - 「自我強化」(核心規則部分.htm)第452~464行 與「屬性值的增減」第674~674行、
//     「屬性值的增減」與「技能」兩頁 —— 屬性與技能直購
//       (這兩頁已於2026-08-17精簡移出，行號現在指到移出標記，原文取回方式見 RULES_TRIM.md)
//
// 這一整頁在本專案裡的地位很特別：它是**唯一一批完全不需要「簡化轉換」的商品**。
// 型錄裡的血統/物品/專長全都得先過 effects.js 的詞彙表(因為它們的效果講的是完整版規則的語言)，
// 但療傷、洗點、買屬性、買技能講的是「生命值軌」「屬性值」「技能等級」——這些欄位在簡化規則裡
// 原封不動地存在。所以這批商品的價格與效果可以逐字照抄，是商店最先能真的跑起來的一塊。

import { attributeRaiseCost, skillRaiseCost } from "../../core/xp.js";

/** 屬性直購(分數)：1點屬性 = 當前屬性值 × 200 分。第674行：1→5 需 200+400+600+800=2000 分。 */
export const POINTS_PER_ATTRIBUTE_MULTIPLIER = 200;

/**
 * 提升 1 點屬性的分數價。
 * 第674行：「在使用分數和經驗兌換屬性時，不計算購買的能力，受到的屬性傷害，只計算屬性基礎值」
 * —— 所以呼叫端要傳的是**基礎屬性值**，不是加上血統/裝備加值之後的顯示值。
 * 第674行(規則4)：從 0 買到 1 的價格與從 1 買到 2 相同，故 0 與 1 同價。
 */
export function attributePointPrice(baseValue) {
  const effective = Math.max(1, baseValue);
  return effective * POINTS_PER_ATTRIBUTE_MULTIPLIER;
}

/** 同一點屬性改用經驗買的價格(第674行：當前屬性值 × 4XP)，規則4同樣適用。 */
export function attributeXpPrice(baseValue) {
  return attributeRaiseCost(Math.max(1, baseValue));
}

/** 技能只能用 XP 買(第686行)，沒有分數價。0→1 固定 3XP，其餘 (等級-1)×2 且最低 1。 */
export function skillXpPrice(currentLevel) {
  return skillRaiseCost(currentLevel);
}

/**
 * 特殊兌換的固定價目表，逐字照抄第7743~7743行。
 * 沖擊/嚴重傷害修復免費是書上明寫的，不是我們送的。
 */
export const REPAIR_PRICES = Object.freeze({
  沖擊傷害: 0,
  嚴重傷害: 0,
  惡性傷害每點: 200,
  解除不良狀態每點: 50,
  修復器官每件: 200,
  修復全身: 1000,
  屬性傷害每點: 200,
});

/** 解除超自然效果，依效果本身的支線等級收費(第7743行)，S級以上與S級同價。 */
export const DISPEL_PRICE_BY_RANK = Object.freeze({
  無支線: 0,
  D: 200,
  C: 400,
  B: 600,
  A: 800,
  S: 1000,
});

export function dispelPrice(rank) {
  return DISPEL_PRICE_BY_RANK[rank] ?? DISPEL_PRICE_BY_RANK.S;
}

/** 洗點固定價(第7743行)：C+3000。 */
export const RESPEC_PRICE = "C+3000";

/**
 * 精神時光屋(第7743行)：每次進去付 D+1000，拿滿 11XP 就會被踢出來，
 * 每次在主神空間的休息時限用一次。
 */
export const TIME_CHAMBER = Object.freeze({
  price: "D+1000",
  xpGranted: 11,
  perRestLimit: 1,
});

/**
 * 依角色目前的傷勢軌算出「把身體修回完好」要多少分。
 * 直接吃 core/health.js 的 hpState 形狀 { max, intact, B, L, A }。
 * B 與 L 免費是書上寫的，所以帳單其實只跟惡性傷害 A 有關。
 * @returns {{ points: number, breakdown: object }}
 */
export function fullRepairPrice(hpState) {
  const breakdown = {
    沖擊傷害: (hpState.B ?? 0) * REPAIR_PRICES.沖擊傷害,
    嚴重傷害: (hpState.L ?? 0) * REPAIR_PRICES.嚴重傷害,
    惡性傷害: (hpState.A ?? 0) * REPAIR_PRICES.惡性傷害每點,
  };
  return {
    points: Object.values(breakdown).reduce((a, b) => a + b, 0),
    breakdown,
  };
}

/**
 * 把公式定價的服務包成 catalog.js 認得的商品形狀，讓它們跟型錄商品站在同一個貨架上。
 * 這裡每次呼叫都要傳當下的角色狀態，因為價格是動態的——這正是它跟靜態商品包的差別。
 */
export function buildServiceGoods(character) {
  const goods = [];
  const hp = character.derived?.hp ?? { max: 0, intact: 0, B: 0, L: 0, A: 0 };
  const repair = fullRepairPrice(hp);

  if ((hp.A ?? 0) > 0) {
    goods.push({
      goodId: "service.惡性傷害修復",
      name: `惡性傷害修復(${hp.A}點)`,
      category: "服務",
      price: repair.points,
      consumable: true,
      effects: [{ kind: "治療", severity: "A", amount: hp.A }],
      sourceRef: "rules-2.35.txt 第7743行(主神修復.htm)：惡性傷害每1點修復需要200分獎勵點",
    });
  }
  goods.push({
    goodId: "service.精神時光屋",
    name: "精神時光屋",
    category: "服務",
    price: TIME_CHAMBER.price,
    consumable: true,
    effects: [
      {
        kind: "敘事",
        text:
          `進入主神空間內部的小型訓練空間修行，取得 ${TIME_CHAMBER.xpGranted}XP 後被主神踢出。` +
          "每次在主神空間的休息時限用一次。",
      },
    ],
    // XP 的實際發放走 core/campaignXp.js 的入帳流程，不是 effects 詞彙表的效果——
    // 效果詞彙表只描述「對角色卡做什麼」，錢包/經驗的加減一律由呼叫端處理。
    grantsXp: TIME_CHAMBER.xpGranted,
    sourceRef: "rules-2.35.txt 第7743行(主神修復.htm)：精神時光屋，每次D+1000，獲得11XP即被踢出",
  });
  goods.push({
    goodId: "service.洗點",
    name: "洗點(重置所有用分數購買的兌換)",
    category: "服務",
    price: RESPEC_PRICE,
    consumable: true,
    effects: [
      {
        kind: "敘事",
        text:
          "重置所有用分數購買的屬性、裝備、血統、改造等兌換，回到剛進入主神空間的狀態。" +
          "用經驗購買的能力不會被重置(那是自己鑽研來的)。洗點沒有次數限制。",
      },
    ],
    respec: true,
    sourceRef: "rules-2.35.txt 第7743行(主神修復.htm)：洗點花費C+3000",
  });
  return goods;
}
