// [設計] 傾向權重 -> 實際配點。建卡的「後台」那一半。
//
// 玩家在生平問答裡回答的是六個關於人生的問題（見 lifePath.js），這個模組負責把那些答案
// 換算成屬性與技能的實際數值。玩家從頭到尾看不到這裡的任何一個數字。
//
// 三個必須守住的性質（每一個都對應一次實際踩過的坑）：
//
// 1. **決定性（deterministic）**：同樣的答案一定得到同樣的角色卡。
//    絕對不可以在這裡擲骰——建卡結果會被寫進存檔、也會被測試鎖住，隨機化會讓
//    「為什麼我這次的角色跟上次不一樣」變成一個沒有人查得出來的問題。
//    所有排序都有明確的 tie-break，不依賴 Object.keys 的順序。
//
// 2. **不會產生極端專精**：屬性上限鎖在 4（不是建卡規則的 5）。
//    理由是實際測玩回饋：「只要玩家把單一屬性+單一技能點高，就能一直用同一個檢定通關」。
//    自動配點如果照著權重一路堆到 5，等於系統親手幫玩家造出那張最無聊的卡。
//    遞增成本（見 content/characterBuilder.js）已經讓堆高很貴，這裡再加一道硬上限。
//
// 3. **一定會有廣度**：配完之後保證至少 MIN_TRAINED_SKILLS 個技能 ≥1。
//    副本裡的選項規格要求「四個選項的技能全部不同」，如果角色只練了兩個技能，
//    那四個選項裡永遠有兩個是未受訓的死路——那不是挑戰，是版面在騙人。
//
// 演算法是「性價比貪婪法」：每一步都買「權重 ÷ 這一級要花的點數」最高的那一級。
// 因為成本遞增，同一條線買到後面性價比會自然下降，權重次高的線就會被輪到，
// 不需要另外寫「要平均分配」的規則——曲線本身就會做這件事。

import { ATTRIBUTES, SKILLS } from "../../core/schema.js";
import { nextStepCost, ATTRIBUTE_BUDGET, SKILL_BUDGET } from "../characterBuilder.js";

const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key);
const ALL_SKILLS = Object.values(SKILLS).flat();

/** 自動配點的屬性上限。比建卡規則的 5 低一級，理由見檔頭第2點。 */
export const AUTO_ATTRIBUTE_CAP = 4;
/** 自動配點的技能上限（跟建卡規則一致）。 */
export const AUTO_SKILL_CAP = 3;
/** 配完之後至少要有幾個技能 ≥1，理由見檔頭第3點。 */
export const MIN_TRAINED_SKILLS = 4;

/**
 * 性價比貪婪配點。
 *
 * @param {string[]} keys 所有可以加點的項目（依固定順序，決定 tie-break）
 * @param {Record<string, number>} weights 傾向權重，沒列到的視為 0
 * @param {object} opts { startValue, cap, budget, kind }
 * @returns {Record<string, number>}
 */
function greedyAllocate(keys, weights, { startValue, cap, budget, kind, maxAtCap = Infinity, seed = {} }) {
  const result = Object.fromEntries(keys.map((k) => [k, seed[k] ?? startValue]));
  let remaining = budget;

  while (remaining > 0) {
    // 已經有幾條線頂到上限。maxAtCap 限制「最多幾條線可以到頂」——
    // 沒有這一道的話，權重最高的兩個屬性會各自吃掉4點，其餘四個屬性全部停在1，
    // 配出來的是一張耐力1（生命值6）的玻璃大砲。玩家答的是六個關於人生的問題，
    // 不是「我要玩極端build」，系統不該替他做這個決定。
    const atCap = keys.filter((k) => result[k] >= cap).length;

    let best = null;
    for (const key of keys) {
      const value = result[key];
      if (value >= cap) continue;
      if (value + 1 >= cap && atCap >= maxAtCap) continue;

      const cost = nextStepCost(kind, value);
      if (cost == null || cost > remaining) continue;

      // 權重 0 的項目不主動買（那是玩家的答案完全沒指向的方向），
      // 廣度保障留到後面的 ensureBreadth() 統一處理，不要在這裡混進來。
      const weight = weights[key] ?? 0;
      if (weight <= 0) continue;

      const ratio = weight / cost;
      // tie-break：性價比同分時比權重，再同分就比 keys 的固定順序（先出現的贏）。
      // 不寫這一層的話，結果會依賴物件屬性的列舉順序，那是不該依賴的東西。
      if (
        !best ||
        ratio > best.ratio ||
        (ratio === best.ratio && weight > best.weight)
      ) {
        best = { key, ratio, weight, cost };
      }
    }

    if (!best) break; // 買不動了（預算不夠買任何一級，或每條線都到頂）
    result[best.key] += 1;
    remaining -= best.cost;
  }

  return { values: result, remaining };
}

/**
 * 廣度保障：先把 MIN_TRAINED_SKILLS 個技能各買到 1 級，剩下的預算才交給貪婪法。
 *
 * [實作記錄] 第一版是反過來做的——先貪婪、再拿剩下的點數補廣度。結果是廣度保障
 * 幾乎永遠不會生效：貪婪法會把預算花光（潛行3+偵察3+格鬥2 剛好 10 點），
 * 補廣度那一步拿到的 remaining 是 0，於是那張卡只有三個技能能用，
 * 而副本每回合的四個選項要求技能全部不同——其中永遠有一個是未受訓的死路。
 * 保障要有效就必須**先付錢**，這是順序問題，不是門檻問題。
 *
 * 順序依權重由高到低（權重相同照 ALL_SKILLS 的固定順序），所以結果仍然是決定性的。
 */
function seedBreadth(weights) {
  const seed = {};
  let spent = 0;
  const cost = nextStepCost("skill", 0);

  const ranked = [...ALL_SKILLS].sort((a, b) => {
    const diff = (weights[b] ?? 0) - (weights[a] ?? 0);
    if (diff !== 0) return diff;
    return ALL_SKILLS.indexOf(a) - ALL_SKILLS.indexOf(b);
  });

  for (const skill of ranked.slice(0, MIN_TRAINED_SKILLS)) {
    seed[skill] = 1;
    spent += cost;
  }
  return { seed, spent };
}

/**
 * 把生平問答的權重換成一張角色卡的屬性與技能。
 *
 * @param {{attributes: object, skills: object}} weights collectLifePath() 的回傳值
 * @returns {{attributes: object, skills: object, spent: {attributes: number, skills: number}}}
 */
export function allocateFromWeights(weights = {}) {
  const attrResult = greedyAllocate(ATTRIBUTE_KEYS, weights.attributes ?? {}, {
    startValue: 1,
    cap: AUTO_ATTRIBUTE_CAP,
    budget: ATTRIBUTE_BUDGET,
    kind: "attr",
    // 最多一個屬性到頂。剩下的預算會被推到第二、第三高的屬性上，
    // 配出來的角色才會是「有一項很強、幾項還行」而不是「兩項很強、四項完全不行」。
    maxAtCap: 1,
  });

  const { seed, spent } = seedBreadth(weights.skills ?? {});
  const skillResult = greedyAllocate(ALL_SKILLS, weights.skills ?? {}, {
    startValue: 0,
    cap: AUTO_SKILL_CAP,
    budget: SKILL_BUDGET - spent,
    kind: "skill",
    seed,
  });

  return {
    attributes: attrResult.values,
    skills: skillResult.values,
    spent: {
      attributes: ATTRIBUTE_BUDGET - attrResult.remaining,
      skills: SKILL_BUDGET - skillResult.remaining,
    },
  };
}

/**
 * 把配點結果翻譯成**玩家看得懂的一句話**（不出現任何數字）。
 *
 * 這是「屬性技能改成後台」的配套：玩家不該看到「敏捷4 潛行3」，但他有權知道
 * 自己拼出來的這個人擅長什麼。用比較級的形容詞而不是數字，也是為了避免玩家
 * 回頭去反推權重、又變成在最佳化build。
 */
const ATTRIBUTE_PHRASES = {
  力量: "力氣比一般人大",
  敏捷: "身手比一般人快",
  耐力: "比一般人耐得住折騰",
  智力: "腦子轉得比一般人快",
  感知: "比一般人更早發現不對勁",
  意志: "比一般人更難被動搖",
};

export function describeCharacterTendency(attributes, skills) {
  const topAttributes = ATTRIBUTE_KEYS.filter((k) => (attributes[k] ?? 1) >= 3)
    .sort((a, b) => (attributes[b] ?? 1) - (attributes[a] ?? 1) || ATTRIBUTE_KEYS.indexOf(a) - ATTRIBUTE_KEYS.indexOf(b))
    .slice(0, 2)
    .map((k) => ATTRIBUTE_PHRASES[k])
    .filter(Boolean);

  const topSkills = ALL_SKILLS.filter((s) => (skills[s] ?? 0) >= 2)
    .sort((a, b) => (skills[b] ?? 0) - (skills[a] ?? 0) || ALL_SKILLS.indexOf(a) - ALL_SKILLS.indexOf(b))
    .slice(0, 3);

  const parts = [];
  if (topAttributes.length) parts.push(`你${topAttributes.join("，也")}。`);
  if (topSkills.length) parts.push(`這幾年下來，你最拿得出手的是${topSkills.join("、")}。`);
  parts.push("其他事情你不是不能做，只是沒有比別人有把握。");
  return parts.join("");
}
