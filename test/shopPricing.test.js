// 公式定價商品(特殊兌換/直接強化)的測試 —— 全部拿書中原文的例子當驗證基準。
import test from "node:test";
import assert from "node:assert/strict";
import {
  attributePointPrice,
  attributeXpPrice,
  skillXpPrice,
  REPAIR_PRICES,
  dispelPrice,
  fullRepairPrice,
  RESPEC_PRICE,
  TIME_CHAMBER,
  buildServiceGoods,
} from "../content/shop/pricing.js";
import { validateGood } from "../content/shop/catalog.js";
import { emptyCharacter } from "../core/schema.js";
import { createHpState, applyDamage, healDamage } from "../core/health.js";

test("屬性直購：書中範例『將力量從1提升到5需要200+400+600+800=2000分』", () => {
  const steps = [1, 2, 3, 4].map(attributePointPrice);
  assert.deepEqual(steps, [200, 400, 600, 800]);
  assert.equal(steps.reduce((a, b) => a + b, 0), 2000);
});

test("屬性直購(經驗)：書中範例『將力量從1提升到5需要4+8+12+16=40XP』", () => {
  const steps = [1, 2, 3, 4].map(attributeXpPrice);
  assert.deepEqual(steps, [4, 8, 12, 16]);
  assert.equal(steps.reduce((a, b) => a + b, 0), 40);
});

test("屬性直購：0買到1的價格與1買到2相同(第674行的規則4)", () => {
  assert.equal(attributePointPrice(0), attributePointPrice(1));
  assert.equal(attributeXpPrice(0), attributeXpPrice(1));
});

test("技能直購：0→1是3XP，1→2受『最低為1點』的下限保護", () => {
  assert.equal(skillXpPrice(0), 3);
  assert.equal(skillXpPrice(1), 1, "第686行『最低為1點』，不是 (1-1)*2=0");
  assert.equal(skillXpPrice(2), 2);
  assert.equal(skillXpPrice(5), 8);
});

test("特殊兌換價目表逐字對得上書中原文", () => {
  assert.equal(REPAIR_PRICES.沖擊傷害, 0);
  assert.equal(REPAIR_PRICES.嚴重傷害, 0);
  assert.equal(REPAIR_PRICES.惡性傷害每點, 200);
  assert.equal(REPAIR_PRICES.解除不良狀態每點, 50);
  assert.equal(REPAIR_PRICES.修復器官每件, 200);
  assert.equal(REPAIR_PRICES.修復全身, 1000);
  assert.equal(RESPEC_PRICE, "C+3000");
  assert.equal(TIME_CHAMBER.price, "D+1000");
  assert.equal(TIME_CHAMBER.xpGranted, 11);
});

test("解除超自然效果依等級收費，S級以上與S級同價", () => {
  assert.equal(dispelPrice("無支線"), 0);
  assert.equal(dispelPrice("D"), 200);
  assert.equal(dispelPrice("A"), 800);
  assert.equal(dispelPrice("S"), 1000);
  assert.equal(dispelPrice("SS"), 1000, "S級以上的等級花費與S級相同");
});

test("療傷帳單只跟惡性傷害有關(沖擊/嚴重免費是書上寫的)", () => {
  let hp = createHpState(10);
  hp = applyDamage(hp, 4, "B");
  hp = applyDamage(hp, 3, "A");
  const quote = fullRepairPrice(hp);
  assert.equal(quote.breakdown.沖擊傷害, 0);
  assert.equal(quote.breakdown.嚴重傷害, 0);
  assert.equal(quote.points, hp.A * 200);
});

test("healDamage 是治療語意(單軌直接回完好)，不是 applyDamage 的反向層疊", () => {
  let hp = createHpState(10);
  hp = applyDamage(hp, 5, "A");
  assert.equal(hp.A, 5);
  const healed = healDamage(hp, 3, "A");
  assert.equal(healed.A, 2);
  assert.equal(healed.intact, 8, "A傷直接回完好，不會退成L");
  assert.equal(healed.L, 0);
  // 超額治療只治得到實際有的點數
  assert.equal(healDamage(healed, 99, "A").A, 0);
  assert.equal(healDamage(healed, 99, "A").healed, 2);
});

test("服務貨架：受了惡性傷害才會出現療傷商品，而且價格照傷勢算", () => {
  const 健康 = emptyCharacter("健康的人");
  const 健康貨架 = buildServiceGoods(健康);
  assert.equal(健康貨架.some((g) => g.goodId === "service.惡性傷害修復"), false);

  const 重傷 = emptyCharacter("重傷的人");
  重傷.derived.hp = applyDamage(createHpState(6), 3, "A");
  const 重傷貨架 = buildServiceGoods(重傷);
  const 療傷 = 重傷貨架.find((g) => g.goodId === "service.惡性傷害修復");
  assert.equal(療傷.price, 600, "3點惡性傷害 × 200分");
  assert.deepEqual(療傷.effects, [{ kind: "治療", severity: "A", amount: 3 }]);
});

test("服務貨架上的每一件都通過 validateGood", () => {
  const 重傷 = emptyCharacter("重傷的人");
  重傷.derived.hp = applyDamage(createHpState(6), 2, "A");
  for (const good of buildServiceGoods(重傷)) {
    const result = validateGood(good);
    assert.equal(result.valid, true, `${good.name}：${result.errors.join("；")}`);
  }
});
