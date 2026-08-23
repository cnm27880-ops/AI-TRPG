// [規則書] 主神商店的開門條件 —— 「什麼時候買得到東西」。
//
// 出處：rules-2.35.txt 第469行(核心規則部分.htm「自我強化」段落)，逐字：
//
//   「消耗支線與獎勵點數除非特殊情況，則必須在主神空間才可以，兌換資源是一個自由動作。
//     消耗經驗則可以在主神空間和恐怖片中都可以直接消耗，若選擇在恐怖片中，
//     則沒有特殊情況（如：光戰，人皇）則需要消耗原本*2的經驗，消耗經驗習得新的能力無需動作。」
//
// 所以書上的規則不是「副本中什麼都不能買」，而是**兩種貨幣兩種待遇**：
//
//   支線／獎勵點數 —— 只能在主神空間花。副本中連買都不能買。
//   經驗(XP)      —— 兩邊都能花，但在副本中要付兩倍。
//
// 這個差別是有道理的：支線與點數是主神給的兌換額度，要回主神空間才兌換得到；
// 經驗是自己身上的東西，隨時可以拿來鑽研，只是在副本裡邊打邊練效率差一半。
// 本專案的「專長」整個貨架都是XP定價的，所以這條規則直接影響到玩家在副本中還能做什麼。
//
// [設計] 「現在算不算在主神空間」由引擎自己從存檔算出來，不是AI說了算：
//   沒有副本            → 主神空間(還沒進本)
//   副本主線全部完成    → 主神空間(打完出來了)
//   副本進行中          → 恐怖片中
//   戰鬥中              → 恐怖片中(而且另外擋一次，理由見 shopAccess)

import { findActiveNode, getProgressSummary } from "../scenario/progress.js";
import { scenarioLifecycle } from "../scenario/lifecycle.js";
import { formatPrice } from "./wallet.js";

export const LOCATIONS = Object.freeze(["主神空間", "恐怖片中"]);

/** 副本給玩家看的名字。副本包的顯示名在 briefing.title，id 只是內部代號。 */
function packLabel(pack) {
  return pack?.briefing?.title ?? pack?.id ?? "未知副本";
}

/** 副本中買XP商品的加倍係數(書上原文：需要消耗原本*2的經驗)。 */
export const IN_MOVIE_XP_MULTIPLIER = 2;

/**
 * 這份存檔現在人在哪。
 * @param {object} session 存檔(需要 scenario 與 combat 兩個欄位，兩個都可以不存在)
 * @param {(packId: string) => object|null} getPack 用 packId 取回副本包的函式
 *   (由呼叫端注入，避免這個模組相依 scenario/registry.js 的載入順序)
 * @returns {{ location: "主神空間"|"恐怖片中", reason: string, inCombat: boolean }}
 */
export function locationOf(session, getPack) {
  const inCombat = Boolean(session?.combat?.active);
  const pack = session?.scenario ? getPack?.(session.scenario.packId) ?? null : null;
  if (session?.scenario && !pack) {
    // 副本包找不到時，保守地當成「還在副本裡」——寧可讓玩家買不到，
    // 也不要因為一個查不到的 packId 就把主神空間的門打開。
    return { location: "恐怖片中", reason: `副本包「${session.scenario.packId}」查不到，保守視為仍在副本中`, inCombat };
  }

  const lifecycle = scenarioLifecycle({ session, pack });
  const legacyComplete = Boolean(
    session.scenario?.progress &&
      getProgressSummary(pack, session.scenario.progress).scenarioComplete
  );
  if (lifecycle.location === "主神空間" || legacyComplete) {
    const reason = lifecycle.status === "no_scenario"
      ? "還沒進入任何副本"
      : lifecycle.status === "settled"
        ? `副本「${packLabel(pack)}」已通關並完成封存，回到主神空間`
        : `副本「${packLabel(pack)}」主線已完成，沿用舊存檔相容地視為主神地點`;
    return { location: "主神空間", reason, inCombat };
  }
  return { location: "恐怖片中", reason: lifecycle.reason, inCombat };
}

/**
 * 這個價格在這個地點買不買得成、要付多少。
 *
 * 回傳的 price 是**實際要付的價格**(副本中的XP已經加倍)，呼叫端應該拿它去扣款，
 * 不要自己再乘一次。blockers 沿用 catalog.js 的 {code, message} 形狀。
 *
 * @param {object} price parsePrice() 的結果
 * @param {"主神空間"|"恐怖片中"} location
 * @param {{ inCombat?: boolean }} [opts]
 */
export function priceAt(price, location, { inCombat = false } = {}) {
  const blockers = [];
  const usesTokens = Object.values(price.tokens ?? {}).some((n) => n > 0);
  const usesPoints = (price.points ?? 0) > 0;
  const usesXp = (price.xp ?? 0) > 0;

  if (location === "恐怖片中") {
    if (usesTokens || usesPoints) {
      blockers.push({
        code: "不在主神空間",
        message:
          "支線與獎勵點數只能在主神空間消耗(規則書第469行)。" +
          "副本結束回到主神空間之後才買得到，副本中只買得起用經驗換的東西。",
      });
    }
    // 戰鬥中連XP兌換都擋掉。書上說兌換是自由動作、消耗經驗無需動作，理論上戰鬥中做得到，
    // 但這個引擎的戰鬥是一個獨立的狀態機，中途改角色卡會讓已經算好的先攻/防御/血量對不上。
    // 這是實作限制，不是規則，所以理由要寫清楚是實作限制。
    if (inCombat) {
      blockers.push({
        code: "戰鬥中",
        message: "戰鬥進行中不能兌換——這是本引擎的實作限制(戰鬥狀態機已經把角色數值算好了)，不是書上的規則。",
      });
    }
  }

  const multiplier = location === "恐怖片中" && usesXp ? IN_MOVIE_XP_MULTIPLIER : 1;
  const effective = multiplier === 1 ? price : { ...price, xp: price.xp * multiplier };

  return {
    price: effective,
    blockers,
    xpMultiplier: multiplier,
    surcharged: multiplier > 1,
  };
}

/**
 * 給商店UI用的一句話：現在能做什麼、不能做什麼。
 * 這句話要一直被看見——玩家在副本中打開商店時，最需要知道的是「為什麼大部分東西是灰的」。
 */
export function describeAccess({ location, reason, inCombat }) {
  if (location === "主神空間") {
    return `主神空間（${reason}）。所有兌換都開放。`;
  }
  if (inCombat) {
    return `恐怖片中（${reason}），而且正在戰鬥。戰鬥結束前不能兌換任何東西。`;
  }
  return (
    `恐怖片中（${reason}）。支線與獎勵點數要回主神空間才能花；` +
    `用經驗買的東西現在買得到，但要付 ${IN_MOVIE_XP_MULTIPLIER} 倍經驗（規則書第469行）。`
  );
}

/**
 * [設計＋使用者決定 2026-08-17] **場景 ＝ 當下所在的地點。**
 *
 * 這個函式是那句話的程式版本：把存檔壓成一把字串鑰匙，鑰匙一變就代表換場了。
 *
 *     主神空間
 *     恐怖片中:alien-nostromo:node-corridor-3
 *
 * 為什麼需要它：`content/shop/forms.js` 的型態只認兩個時鐘，「輪」與「場景」。
 * 「輪」在戰鬥裡由 `advanceTurn()` 遞增，一直都有人推；**「場景」在戰鬥外一直沒有定義**，
 * 於是存檔裡的 `session.forms` 從第五輪建好之後就沒有任何人讀寫——一個持續整個場景的型態，
 * 在戰鬥外沒有東西能讓它到期，寫進去就是永久加值。使用者把場景定義成「當下所在的地點」，
 * 這一句話讓它變得算得出來：副本的活動節點就是玩家現在站的地方。
 *
 * 三個刻意的性質：
 *
 * 1. **純粹從存檔算出來，沒有新欄位。** 跟 `locationOf()` 同一個原則——
 *    「現在算不算換場了」由引擎自己算，不是 AI 敘事時說了算，也不是前端傳進來的。
 * 2. **主神空間整個算一個地點。** 回到主神空間是一次換場（副本裡開的眼會關掉），
 *    但在主神空間裡逛商店不會一直換場。
 * 3. **戰鬥不是一個獨立的場景。** 打一場架不會改變你站在哪裡，所以以「場景」計時的型態
 *    撐得過一場戰鬥的開始與結束；以「輪」計時的則在戰鬥結束時就收掉（戰鬥外沒有輪可以數，
 *    見 forms.js 的 `endCombat()`）。
 *
 * @param {object} session 存檔
 * @param {(packId: string) => object|null} getPack 跟 locationOf() 同一個注入
 * @returns {string} 場景鑰匙
 */
export function sceneKeyOf(session, getPack) {
  const { location } = locationOf(session, getPack);
  if (location === "主神空間") return "主神空間";

  const packId = session?.scenario?.packId ?? "未知副本";
  // reference adapter 若已建立房間狀態，房間就是更精確的場景邊界；
  // 舊副本與舊存檔沒有這欄位時，退回原本的 active node 行為。
  const referenceLocation = session?.scenario?.referenceState?.currentLocation;
  if (referenceLocation) return `恐怖片中:${packId}:${referenceLocation}`;
  const pack = getPack?.(packId) ?? null;
  // 副本包查不到時退回 packId 當地點：不精確，但仍然是一把穩定的鑰匙——
  // 不會每次呼叫都變（那會讓型態一啟動就過期），也不會跟別的地點撞在一起。
  const node = pack ? findActiveNode(pack, session.scenario.progress) : null;
  return `恐怖片中:${packId}:${node?.id ?? "未知節點"}`;
}

/** 把一件商品在目前地點的售價寫成人看得懂的字串，加倍時附上原價。 */
export function formatPriceAt(price, location, opts) {
  const at = priceAt(price, location, opts);
  if (!at.surcharged) return formatPrice(at.price);
  return `${formatPrice(at.price)}（副本中加倍，原價 ${formatPrice(price)}）`;
}
