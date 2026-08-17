// 主神商店貨幣帳本的測試。
// 驗證方式分三層：
//   1) 書中原文範例：D+500 的解析、DD+4600 的復活費用寫法、3D=1C 的拆組。
//   2) 不變量：拆組是無損的(任何面額組合換算成D當量再攤回去，總值不變)。
//   3) 行為鎖定：付不起要擋、付得起要留下正確的帳本紀錄。
import test from "node:test";
import assert from "node:assert/strict";
import {
  createWallet,
  parsePrice,
  formatPrice,
  tokenValueInD,
  normalizeTokens,
  canAfford,
  pay,
  earn,
  buildRevivalWalletFromShopWallet,
  TOKEN_VALUE_IN_D,
} from "../content/shop/wallet.js";
import { computeRevivalCost } from "../core/deathAndRevival.js";

test("價格標記法：書中出現過的每一種寫法都要解析得出來", () => {
  // 第456行原文：「一桿高能粒子脈沖步槍的標價為D+500，這就意味著你需要支付一個D支線和500獎勵點數」
  assert.deepEqual(parsePrice("D+500"), { tokens: { D: 1 }, points: 500, xp: 0, raw: "D+500" });
  // 第7743行原文的復活費用範例：DD+4600(同面額連寫代表數量)
  assert.deepEqual(parsePrice("DD+4600").tokens, { D: 2 });
  assert.equal(parsePrice("DD+4600").points, 4600);
  // 第7743行：洗點 C+3000
  assert.deepEqual(parsePrice("C+3000"), { tokens: { C: 1 }, points: 3000, xp: 0, raw: "C+3000" });
  // 只要分數的物品(第276792行 太陽傘 200分)
  assert.deepEqual(parsePrice("200").tokens, {});
  assert.equal(parsePrice("200分").points, 200);
  // 只要經驗的專長(第723行：每個專長點數3XP)
  assert.deepEqual(parsePrice("3XP"), { tokens: {}, points: 0, xp: 3, raw: "3XP" });
  // 免費(第7743行：沖擊/嚴重傷害修復免費)
  assert.equal(parsePrice("免費").points, 0);
  assert.equal(parsePrice(0).points, 0);
});

test("價格標記法：看不懂的寫法要吵，不可以默默當成0元", () => {
  assert.throws(() => parsePrice("D+五百"), /看不懂的價格片段/);
  assert.throws(() => parsePrice("Z+100"), /看不懂的價格片段/);
});

test("支線拆組是3進位且無損：3D=1C，3C=1B，3B=1A，3A=1S", () => {
  assert.equal(TOKEN_VALUE_IN_D.C, 3 * TOKEN_VALUE_IN_D.D);
  assert.equal(TOKEN_VALUE_IN_D.B, 3 * TOKEN_VALUE_IN_D.C);
  assert.equal(TOKEN_VALUE_IN_D.A, 3 * TOKEN_VALUE_IN_D.B);
  assert.equal(TOKEN_VALUE_IN_D.S, 3 * TOKEN_VALUE_IN_D.A);
  // 不變量：任意組合 → D當量 → 攤回面額，總值必須一樣
  for (const tokens of [{ D: 5 }, { C: 2, D: 2 }, { S: 1, B: 4 }, { A: 3 }, {}]) {
    const value = tokenValueInD(tokens);
    assert.equal(tokenValueInD(normalizeTokens(value)), value);
  }
  // 第443行原文：「一個C可以被拆開來購買3個不同的D支線資源」
  assert.equal(tokenValueInD({ C: 1 }), tokenValueInD({ D: 3 }));
});

test("拆組無損直接決定了付款行為：手上1個C可以買3件D級商品", () => {
  let wallet = createWallet({ tokens: { C: 1 }, points: 3000 });
  for (const name of ["匕首", "短杖", "扇刃"]) {
    const check = canAfford(wallet, parsePrice("D+500"));
    assert.equal(check.affordable, true, `買${name}時應該還付得起`);
    wallet = pay(wallet, parsePrice("D+500"), name);
  }
  assert.equal(tokenValueInD(wallet.tokens), 0, "1個C剛好拆成3個D用完");
  assert.equal(wallet.points, 1500);
  // 第四件就買不起了
  assert.equal(canAfford(wallet, parsePrice("D+500")).affordable, false);
  assert.throws(() => pay(wallet, parsePrice("D+500"), "第四件"), /餘額不足/);
});

test("付款不改動原本的錢包，並把花費記進 spentLedger", () => {
  const before = createWallet({ tokens: { D: 2 }, points: 1000, xp: 10 });
  const after = pay(before, parsePrice("D+600"), "阿蘭斯血統");
  assert.equal(before.points, 1000, "原錢包不可被就地修改");
  assert.equal(Object.keys(before.spentLedger).length, 0);
  assert.equal(after.points, 400);
  assert.deepEqual(after.spentLedger["阿蘭斯血統"], { tokenD: 1, points: 600, xp: 0 });
});

test("同一個名目付兩次，帳本要累加而不是覆蓋", () => {
  let wallet = createWallet({ points: 1000 });
  wallet = pay(wallet, parsePrice("200"), "治療");
  wallet = pay(wallet, parsePrice("200"), "治療");
  assert.deepEqual(wallet.spentLedger["治療"], { tokenD: 0, points: 400, xp: 0 });
});

test("XP 是獨立的第三種貨幣，買專長只扣XP不扣分數", () => {
  const wallet = createWallet({ tokens: { D: 1 }, points: 500, xp: 20 });
  const after = pay(wallet, parsePrice("9XP"), "荒野求生3級");
  assert.equal(after.xp, 11);
  assert.equal(after.points, 500);
  assert.equal(tokenValueInD(after.tokens), 1);
});

test("formatPrice 印回書上的寫法(先攤成最大面額)", () => {
  assert.equal(formatPrice(parsePrice("D+500")), "D+500");
  assert.equal(formatPrice(parsePrice("DDD+100")), "C+100", "3個D會被攤成1個C");
  assert.equal(formatPrice(parsePrice("3XP")), "3XP");
  assert.equal(formatPrice(parsePrice("免費")), "免費");
});

test("earn 入帳", () => {
  const wallet = earn(createWallet({ points: 100 }), { tokens: { D: 3 }, points: 400, xp: 11 });
  assert.equal(formatPrice({ tokens: wallet.tokens, points: 0, xp: 0 }), "C");
  assert.equal(wallet.points, 500);
  assert.equal(wallet.xp, 11);
});

test("復活費用：書中的 D+1000未花 + D+600血統 + 3000屬性 = DD+4600 範例", () => {
  // 書中範例(第7743行)是用「支線+分數」表達的；這裡的錢包把支線折成分數之後，
  // computeRevivalCost 會給出單一數字。驗證的是「兩邊的支線數與分數總額都對得上」，
  // 不是硬要湊出字串 "DD+4600"。
  let wallet = createWallet({ tokens: { D: 2 }, points: 4600 });
  wallet = pay(wallet, parsePrice("D+600"), "血統");
  wallet = pay(wallet, parsePrice("3000"), "屬性");
  // 花完之後身上剩 D+1000 未花，這正是書中範例的起點
  assert.equal(tokenValueInD(wallet.tokens), 1);
  assert.equal(wallet.points, 1000);

  const revivalWallet = buildRevivalWalletFromShopWallet(wallet);
  // 未花：1個D(折1000分) + 1000分 = 2000
  assert.equal(revivalWallet.unspentPoints, 2000);
  // 已花：血統 D+600 → 1600、屬性 3000
  assert.deepEqual(revivalWallet.spentLedger, { 血統: 1600, 屬性: 3000 });
  // 總費用 = 未花 + 已花 = 2000+1600+3000 = 6600，
  // 對照書上的 DD+4600 = 2個D(折2000) + 4600 = 6600。數字一致。
  assert.equal(computeRevivalCost(revivalWallet), 6600);
});
