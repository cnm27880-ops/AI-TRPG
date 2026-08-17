// [規則書] 能量池 —— 內力／劍氣／查克拉／魔力這一類「有上限、會消耗、會恢復」的資源。
//
// 出處：生命.htm「能量池」段落。**注意這一頁在 2026-08-17 的 rules-2.35.txt 精簡中被移出了**，
// 原文用 `git show 2ee0820:rules-2.35.txt | sed -n '10580,10946p'` 取回，關鍵條文逐字：
//
//   「能量池一般都擁有自己的關鍵屬性。關鍵屬性決定了能量池的上限。
//     關鍵屬性一般為2個屬性，這2個屬性之和即為該能量池大小的基礎上限。
//     例：假設某一個能量池，其關鍵屬性為耐力+風度，若耐力為3，風度為4，則該能量池的基礎上限為7。」
//
//   「當人物因為任何來源而開啟能量池時，若之前已經擁有了相同的能量池，那么作為補償，
//     他可以在這個能量池上獲得一定程度的提升。這個來源必須是完全不同的…
//     第一次重復獲得時，可以獲得額外的5點上限；第二次則是3點，第三次和第四次則是1點，
//     之后再次重復獲得相同能量池將不會再獲得提升。」
//
// [決策記錄 2026-08-17] 這條「上限＝關鍵屬性之和」的通則，是這一輪最重要的發現，
// 因為**上一輪的結論說它不存在**。當時查書查到的是第604行「每種能量在獲得時，都會同時獲得
// 它的運作機制」，加上三個掛名條目都沒寫自己池子的大小，於是判斷「書上刻意沒有通用公式，
// 能量池卡在資料不是卡在程式」。那個判斷是錯的——通用公式一直都在，只是**被我們自己的
// 精簡輪刪掉了**，而且刪除紀錄還寫著「能量池整套不實作」，讓它看起來沒有東西可以失去。
// 教訓寫在 RULES_TRIM.md 與 ARCHITECTURE.md：精簡「目前不實作」的規則，等於預先刪掉
// 未來要實作它時需要的說明書。
//
// 簡化取捨(標記為 🟡)：書上的大分類(東方/西方/特殊)、小分類(生理系/心智系/互動系)、
// 兼容性(不兼容會爆體而亡)、代替消耗、節能消耗都**沒有實作**——單人簡化規則裡沒有
// 「免疫心智系能量」這種對抗效果，那些分類目前沒有消費端。只留下有消費端的三件事：
// 上限、消耗、恢復。分類欄位仍然照抄進資料裡當紀錄，但引擎不讀它，這一點寫在 POOL_DEFS。

import { ATTRIBUTES } from "./schema.js";

const ATTRIBUTE_KEYS = new Set(ATTRIBUTES.map((a) => a.key));

/**
 * 重複開啟同一個能量池的上限補償，依序是 +5/+3/+1/+1，之後不再增加。
 * 書中原文見檔頭。索引 0 = 第一次重複獲得。
 */
export const REOPEN_BONUSES = Object.freeze([5, 3, 1, 1]);

/**
 * 已經查證過關鍵屬性的能量池。**每一筆都要附行號**，跟商品的 sourceRef 是同一個要求。
 *
 * 只收「兩個關鍵屬性都在簡化規則的六維裡」的池子——書上有些池子的關鍵屬性是風度/決心，
 * 那四維在這個專案不存在(見 CONVERSION_RULES.md 第4節)，那種池子算不出上限，不收。
 */
export const POOL_DEFS = Object.freeze({
  劍氣: {
    keyAttributes: ["敏捷", "感知"],
    category: "東方通用", // 只是紀錄，引擎不讀(沒有兼容性/免疫的消費端)
    recovery: "長休息全滿；打坐15分鐘做一次敏捷+感知檢定，恢復等同成功數",
    sourceRef: "rules-2.35.txt 第320247行(劍氣.htm)：劍氣的關鍵屬性為敏捷+感知",
  },
  查克拉: {
    keyAttributes: ["耐力", "感知"],
    category: "東方通用",
    recovery: "一天自行恢復完全；打坐15分鐘做一次關鍵屬性檢定，恢復等同成功數",
    sourceRef: "rules-2.35.txt 第323806行(查克拉.htm)：查克拉的關鍵屬性為耐力+感知",
  },
});

/** 這個池子的基礎上限 = 兩個關鍵屬性之和。 */
export function baseCapacity(poolName, attributes) {
  const def = POOL_DEFS[poolName];
  if (!def) throw new Error(`沒有登錄的能量池「${poolName}」，合法值：${Object.keys(POOL_DEFS).join("/")}`);
  let sum = 0;
  for (const key of def.keyAttributes) {
    if (!ATTRIBUTE_KEYS.has(key)) {
      throw new Error(`能量池「${poolName}」的關鍵屬性「${key}」不在六維裡，這個池子不該被登錄`);
    }
    sum += attributes?.[key] ?? 0;
  }
  return sum;
}

/** 重複開啟 N 次(N=0 代表第一次開啟)之後累積的額外上限。 */
export function reopenBonus(reopenCount) {
  let bonus = 0;
  for (let i = 0; i < reopenCount; i++) bonus += REOPEN_BONUSES[i] ?? 0;
  return bonus;
}

/**
 * 開啟一個能量池(或重複開啟)。回傳新的 energyPools(不改動傳入物件)。
 *
 * @param {object} pools character.derived.energyPools 的形狀
 * @param {string} poolName
 * @param {object} attributes 角色的六維
 * @param {string} source 這次是哪個資源開的——重複開啟的補償要求「來源必須完全不同」，
 *   所以要記下來源清單，同一個來源開兩次不算重複開啟。
 */
export function openPool(pools, poolName, attributes, source) {
  const existing = pools?.[poolName];
  const base = baseCapacity(poolName, attributes);

  if (!existing) {
    return {
      ...pools,
      [poolName]: { max: base, current: base, sources: [source], reopens: 0 },
    };
  }
  if (existing.sources.includes(source)) {
    // 同一個來源不算重複開啟(書上明講「這個來源必須是完全不同的」)
    return pools;
  }
  const reopens = existing.reopens + 1;
  const max = base + reopenBonus(reopens);
  return {
    ...pools,
    [poolName]: {
      ...existing,
      max,
      // 上限變大時，多出來的那幾點是空的，不是免費補滿——跟 effects.js 的「生命上限」
      // 刻意不同：那裡多出來的以「完好」入帳(身體變大了)，這裡是容器變大，內容物沒變。
      current: Math.min(existing.current, max),
      sources: [...existing.sources, source],
      reopens,
    },
  };
}

/** 目前的上限(關鍵屬性可能因為買了屬性而變動，所以要能重算)。 */
export function capacityOf(pools, poolName, attributes) {
  const pool = pools?.[poolName];
  if (!pool) return 0;
  return baseCapacity(poolName, attributes) + reopenBonus(pool.reopens);
}

/**
 * 消耗能量。不夠就不扣，回傳 ok:false 與差多少——跟 wallet.js 的 canAfford 同一個約定：
 * 「扣不起就整筆不成立」，不允許扣成負數，也不允許扣一半。
 */
export function spendEnergy(pools, poolName, amount) {
  const pool = pools?.[poolName];
  if (!pool) {
    return { ok: false, reason: `沒有「${poolName}」這個能量池`, pools };
  }
  if (!(amount >= 0) || !Number.isInteger(amount)) {
    throw new Error("消耗的能量必須是非負整數");
  }
  if (pool.current < amount) {
    return {
      ok: false,
      reason: `${poolName}不足：需要${amount}點，目前${pool.current}點`,
      shortfall: amount - pool.current,
      pools,
    };
  }
  return {
    ok: true,
    pools: { ...pools, [poolName]: { ...pool, current: pool.current - amount } },
  };
}

/** 恢復能量，不會超過上限。 */
export function recoverEnergy(pools, poolName, amount, attributes) {
  const pool = pools?.[poolName];
  if (!pool) return pools;
  const max = attributes ? capacityOf(pools, poolName, attributes) : pool.max;
  return { ...pools, [poolName]: { ...pool, max, current: Math.min(max, pool.current + amount) } };
}

/** 長休息：所有能量池回滿(書上每個池子的恢復手段都包含這一條)。 */
export function longRestPools(pools, attributes) {
  const next = {};
  for (const [name, pool] of Object.entries(pools ?? {})) {
    const max = attributes ? capacityOf(pools, name, attributes) : pool.max;
    next[name] = { ...pool, max, current: max };
  }
  return next;
}

/** 給 UI 與 AI 敘事備忘錄用的一行摘要。 */
export function describePools(pools) {
  return Object.entries(pools ?? {}).map(([name, p]) => `${name} ${p.current}/${p.max}`);
}
