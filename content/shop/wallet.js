// [規則書] 主神商店的貨幣帳本 —— 三種貨幣與價格標記法。
// 出處：rules-2.35.txt 第704~749行(「自我強化」段落，核心規則部分.htm)，原文摘要：
//
//   「在無限恐怖TRPG中，有三種主要貨幣：
//     支線：支線分為5種，分別為DCBAS。…支線可以自由地拆分或組裝。3個D可以拼成一個C，
//           然后3個C可以拼成一個B，以此類推。同樣的，反向的拆解也是可以進行的，
//           一個C可以被拆開來購買3個不同的D支線資源。
//     獎勵點數：又被稱作分數…比如一桿高能粒子脈沖步槍的標價為D+500，這就意味著你需要
//           支付一個D支線和500獎勵點數來換取這一昂貴的未來科技武器。
//     經驗：又稱XP。…一個人獲得的XP不可能轉讓給另外一個人。」
//
// 另見第754行：「消耗支線與獎勵點數除非特殊情況，則必須在主神空間才可以，兌換資源是一個自由動作。」
// —— 這條是本商店「只能在主神空間開店、開店中不消耗回合」的規則依據。
//
// 設計重點(為什麼支線用「D當量」存)：
// 書上明講支線可以無損地雙向拆分/組裝(3D=1C=1/3B…)，所以「手上有幾個C」這件事本身沒有
// 資訊量——一個C跟三個D是同一筆錢。這裡內部一律換算成 D 當量的整數來運算，只有要顯示給
// 玩家看的時候才用 normalizeTokens() 貪心攤回 S/A/B/C/D 的面額。這樣做的好處是
// 「1個C能不能買3件D級商品」這種問題不用寫任何特例，減法自己就答對了。
//
// [已知落差] 本檔案同時是 core/deathAndRevival.js 檔頭寫的那筆「分數帳本」缺口的補件：
// 那個模組的復活費用公式需要「未花分數 + 已花分數明細」，而 core/schema.js 的
// emptyCharacter() 只有 xp 帳本。createWallet() 的 spentLedger 就是那份明細，
// 接法見 buildRevivalWalletFromShopWallet()。

/** 支線面額對 D 的當量(3進位)，出處同上：3D=1C，3C=1B，3B=1A，3A=1S。 */
export const TOKEN_TIERS = Object.freeze(["S", "A", "B", "C", "D"]);
export const TOKEN_VALUE_IN_D = Object.freeze({ D: 1, C: 3, B: 9, A: 27, S: 81 });

/** 洗點時「分數不夠就用支線抵」的換算率，出處：主神修復.htm，rules-2.35.txt 第17679行
 *  「按照每1000分=1個D支線進行扣除」。只在明確指定的場合使用，不是通用匯率。 */
export const POINTS_PER_D_TOKEN_WHEN_FORCED = 1000;

export function createWallet({ tokens = {}, points = 0, xp = 0 } = {}) {
  for (const [tier, count] of Object.entries(tokens)) {
    if (!TOKEN_VALUE_IN_D[tier]) throw new Error(`不存在的支線面額「${tier}」，合法值：${TOKEN_TIERS.join("/")}`);
    if (!Number.isInteger(count) || count < 0) throw new Error(`支線「${tier}」的數量必須是非負整數`);
  }
  if (!Number.isInteger(points) || points < 0) throw new Error("獎勵點數(分數)必須是非負整數");
  if (!Number.isInteger(xp) || xp < 0) throw new Error("XP必須是非負整數");
  return {
    tokens: { ...tokens },
    points,
    xp,
    /** 已花費明細：{ [商品名稱]: { tokenD, points, xp } }，給復活費用公式與洗點用。 */
    spentLedger: {},
  };
}

/** 把一組支線換算成 D 當量整數。 */
export function tokenValueInD(tokens = {}) {
  return Object.entries(tokens).reduce((sum, [tier, count]) => {
    const unit = TOKEN_VALUE_IN_D[tier];
    if (!unit) throw new Error(`不存在的支線面額「${tier}」`);
    return sum + unit * count;
  }, 0);
}

/** 把 D 當量整數攤回面額(由大到小貪心)，只用於顯示。 */
export function normalizeTokens(valueInD) {
  if (!Number.isInteger(valueInD) || valueInD < 0) throw new Error("D當量必須是非負整數");
  const out = {};
  let rest = valueInD;
  for (const tier of TOKEN_TIERS) {
    const unit = TOKEN_VALUE_IN_D[tier];
    const n = Math.floor(rest / unit);
    if (n > 0) {
      out[tier] = n;
      rest -= n * unit;
    }
  }
  return out;
}

/**
 * 解析書上的價格標記法。書裡實際出現過的寫法都要吃得下：
 *   "D+500"   → 1個D支線 + 500分   (高能粒子脈沖步槍的例子)
 *   "DD+4600" → 2個D支線 + 4600分  (復活費用的例子，同面額連寫代表數量)
 *   "C+3000"  → 1個C支線 + 3000分  (洗點)
 *   "D"       → 1個D支線，不用分數
 *   "200" / "200分" → 只要分數
 *   "25"      → 只要分數(毒品JET)
 *   "無支線" / "免費" / 0 → 完全免費(沖擊/嚴重傷害的修復)
 *   "11XP" / "3XP" → 只要經驗(專長系列走這條)
 * 混寫如 "D+500+3XP" 也支援，因為技藝類有「符合條件則可以經驗購買」的雙軌定價。
 * @returns {{ tokens: Record<string, number>, points: number, xp: number, raw: string }}
 */
export function parsePrice(raw) {
  if (raw == null || raw === 0 || raw === "0") return { tokens: {}, points: 0, xp: 0, raw: String(raw ?? "免費") };
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < 0) throw new Error(`價格數字不合法：${raw}`);
    return { tokens: {}, points: raw, xp: 0, raw: String(raw) };
  }
  const text = String(raw).replace(/\s/g, "").replace(/分$/, "");
  if (text === "無支線" || text === "免費") return { tokens: {}, points: 0, xp: 0, raw: String(raw) };

  const tokens = {};
  let points = 0;
  let xp = 0;
  for (const part of text.split("+")) {
    if (part === "") continue;
    const xpMatch = /^(\d+)XP$/i.exec(part);
    if (xpMatch) {
      xp += Number(xpMatch[1]);
      continue;
    }
    if (/^\d+$/.test(part)) {
      points += Number(part);
      continue;
    }
    if (/^[SABCD]+$/.test(part)) {
      for (const ch of part) tokens[ch] = (tokens[ch] ?? 0) + 1;
      continue;
    }
    throw new Error(`看不懂的價格片段「${part}」(完整價格：${raw})`);
  }
  return { tokens, points, xp, raw: String(raw) };
}

/** 把解析後的價格印回書上的寫法，給UI顯示用。 */
export function formatPrice(price) {
  const parts = [];
  const tokenD = tokenValueInD(price.tokens);
  if (tokenD > 0) {
    const norm = normalizeTokens(tokenD);
    parts.push(TOKEN_TIERS.filter((t) => norm[t]).map((t) => t.repeat(norm[t])).join(""));
  }
  if (price.points > 0) parts.push(String(price.points));
  if (price.xp > 0) parts.push(`${price.xp}XP`);
  return parts.length ? parts.join("+") : "免費";
}

/**
 * 這筆錢付不付得起。支線因為可以自由拆組，只比 D 當量總額即可。
 * @returns {{ affordable: boolean, shortfall: { tokenD: number, points: number, xp: number } }}
 */
export function canAfford(wallet, price) {
  const need = { tokenD: tokenValueInD(price.tokens), points: price.points ?? 0, xp: price.xp ?? 0 };
  const have = { tokenD: tokenValueInD(wallet.tokens), points: wallet.points, xp: wallet.xp };
  const shortfall = {
    tokenD: Math.max(0, need.tokenD - have.tokenD),
    points: Math.max(0, need.points - have.points),
    xp: Math.max(0, need.xp - have.xp),
  };
  return {
    affordable: shortfall.tokenD === 0 && shortfall.points === 0 && shortfall.xp === 0,
    shortfall,
  };
}

/**
 * 扣款。回傳新的 wallet(不改動傳入的物件)，並把這筆花費記進 spentLedger。
 * 付不起會 throw —— 呼叫端應該先用 canAfford() 或 catalog.js 的 evaluatePurchase() 擋掉。
 * @param {object} wallet
 * @param {object} price parsePrice() 的結果
 * @param {string} label 記帳用的名目(通常是商品名稱)
 */
export function pay(wallet, price, label) {
  const check = canAfford(wallet, price);
  if (!check.affordable) {
    throw new Error(
      `餘額不足，無法支付「${label}」：還差 支線${check.shortfall.tokenD}D當量/${check.shortfall.points}分/${check.shortfall.xp}XP`
    );
  }
  const tokenD = tokenValueInD(price.tokens);
  const spent = wallet.spentLedger[label] ?? { tokenD: 0, points: 0, xp: 0 };
  return {
    ...wallet,
    tokens: normalizeTokens(tokenValueInD(wallet.tokens) - tokenD),
    points: wallet.points - (price.points ?? 0),
    xp: wallet.xp - (price.xp ?? 0),
    spentLedger: {
      ...wallet.spentLedger,
      [label]: {
        tokenD: spent.tokenD + tokenD,
        points: spent.points + (price.points ?? 0),
        xp: spent.xp + (price.xp ?? 0),
      },
    },
  };
}

/** 入帳(任務獎勵)。同樣回傳新的 wallet。 */
export function earn(wallet, { tokens = {}, points = 0, xp = 0 } = {}) {
  return {
    ...wallet,
    tokens: normalizeTokens(tokenValueInD(wallet.tokens) + tokenValueInD(tokens)),
    points: wallet.points + points,
    xp: wallet.xp + xp,
  };
}

/**
 * 把商店錢包轉成 core/deathAndRevival.js 的 computeRevivalCost() 要吃的形狀。
 *
 * 書中原文(主神修復.htm，第17660行)：「復活的價格等于該角色身上的支線與分數以及其通過支線和
 * 分數兌換的所有價格（包括血統等模板能力，包括技能樹，包括物品等）總和。」
 * 書中範例：D+1000未花 + D+600血統 + 3000屬性 = DD+4600。
 *
 * 這裡採用的統一單位是「分數」，支線用洗點段落明寫的 1000分=1個D 換算(見上方常數)——
 * 書上沒有給復活費用專用的支線換算率，這是本專案為了讓公式能算出單一數字而挑的最接近依據，
 * 標記為 [設計-取近] 而非 [規則書]。要換別的換算率只要改 POINTS_PER_D_TOKEN_WHEN_FORCED。
 * 注意 XP 不列入：書上明講經驗是自己鑽研來的，洗點不返還、也不屬於「透過支線和分數兌換」。
 */
export function buildRevivalWalletFromShopWallet(wallet) {
  const unspentPoints =
    wallet.points + tokenValueInD(wallet.tokens) * POINTS_PER_D_TOKEN_WHEN_FORCED;
  const spentLedger = {};
  for (const [label, spent] of Object.entries(wallet.spentLedger)) {
    spentLedger[label] = spent.points + spent.tokenD * POINTS_PER_D_TOKEN_WHEN_FORCED;
  }
  return { unspentPoints, spentLedger };
}
