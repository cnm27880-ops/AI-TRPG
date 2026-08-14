// 傷害類型與防御類型 —— [規則書] 出處：傷害類型與防御類型.htm，
// rules2.35.txt 第13205~13618行。
//
// 傷害減免的完整運算順序(書中原文第13548~13574行，8個步驟)：
//   1) 命中判定，命中後傷害上限生效(見 core/combat/attack.js，不在這個檔案處理)
//   2) 傷害免疫生效
//   3) 傷害忽略生效
//   4) 硬度生效
//   5) 傷害吸收生效(若為複數傷害類型，物理傷害吸收要延後到第7步一起算——這個檔案目前
//      只處理單一傷害類型，不會遇到這個延後規則，見下方「範圍與已知簡化」)
//   6) 傷害轉化生效(攻擊方先，防御方按盾牌->盔甲->角色本身順序)
//   7) 能量抗力或傷害減免生效
//   8) 傷害抵消生效
// 這個模組的 applyDamageMitigation() 依序跑過 2)~8) 這七步，算出最終傷害。
//
// 範圍與已知簡化(刻意，不是遺漏，都有原因)：
//   - 只處理「單一傷害類型」的傷害。書中「混合傷害類型」(一個傷害同時是兩種以上類型)的三個
//     範例(第13360~13366行)彼此對照後解讀不完全一致，沒辦法憑猜測歸納出一條乾淨的規則，
//     這裡不硬做，混合傷害類型的計算目前不支援，需要你協助確認正確讀法後再實作。
//   - 硬度對能量傷害「作用於物體只造成一半傷害」的規則不實作——這條主要影響對物品/環境的
//     傷害，不是生物 vs 生物的戰鬥場景，這個引擎目前預設目標永遠是生物(全額傷害)。但「哪些
//     能量子類型對生物也無視硬度」(雷電/腐蝕/音波/光能)這條有直接影響戰鬥，所以有實作。
//   - DR/能量抗力的「特定弱點來源」(DR/魔法、DR/銀、特定能量子類型的抗力 vs 全能量抗力)
//     不內建比對邏輯——呼叫端要自己判斷"這次攻擊符不符合弱點條件"，再把算好的單一數字
//     (resistanceOrDR)傳進來。`takeHighest()` 提供「多個來源取最高，不能疊加」的通用工具，
//     但「這個來源適不適用於這次攻擊」的判斷留給呼叫端(通常要對照武器/技能資料，Phase 3才有)。
//   - 傷害轉化(第6步)只提供「呼叫端傳一個轉化函式進來」的掛勾，不內建任何具體轉化能力
//     (例如【防彈】)，這些屬於資源/技能資料，還沒做。
//   - 墜落/墜落物傷害「怎麼算出基礎傷害點數」(3米起算、每3米1點、上限20點)不在這裡，
//     這裡只处理墜落傷害「怎麼被減免」，基礎點數公式之後需要時再獨立做。

const ENERGY_SUBTYPES_BYPASS_HARDNESS = new Set(["雷電", "腐蝕", "音波", "光能"]);

// 各大類傷害適用哪些減免手段(true=適用)，逐條對照書中原文整理。
export const DAMAGE_CATEGORY_RULES = {
  物理: {
    immunity: true, ignore: true, hardness: true,
    physicalAbsorption: true, fullAbsorption: true,
    energyResistance: false, physicalDR: true, negation: true,
  },
  能量: {
    immunity: true, ignore: true, hardness: true,
    physicalAbsorption: false, fullAbsorption: true,
    energyResistance: true, physicalDR: false, negation: true,
  },
  精神: {
    immunity: true, ignore: true, hardness: false,
    physicalAbsorption: false, fullAbsorption: true,
    energyResistance: false, physicalDR: false, negation: true,
  },
  力場: {
    // physicalDR:false 是「一般DR」，但 DR/-(無弱點例外)仍然對力場傷害如常生效，
    // 見 applyDamageMitigation 的 unconditionalPhysicalDR 參數。
    immunity: true, ignore: true, hardness: false,
    physicalAbsorption: false, fullAbsorption: true,
    energyResistance: false, physicalDR: false, negation: true,
  },
  毒素: {
    // 毒素傷害幾乎不能被任何常規手段減免，只有免疫能完全擋下，書中原文明講
    // 「傷害減免、硬度，傷害忽略效果均無法對毒素傷害起效」，抵消/吸收的預設適用範圍列表
    // 也都沒有列入毒素傷害。
    immunity: true, ignore: false, hardness: false,
    physicalAbsorption: false, fullAbsorption: false,
    energyResistance: false, physicalDR: false, negation: false,
  },
  墜落: {
    // 這裡把「墜落傷害」跟「墜落物傷害」合併成同一類簡化處理，兩者在書中對DR的排除文字
    // 略有差異(墜落物本身被定義為物理傷害)，這個簡化的影響範圍很小，之後如果發現有實際
    // 差異需要區分，再拆成兩個category。
    immunity: true, ignore: true, hardness: true,
    physicalAbsorption: true, fullAbsorption: true,
    energyResistance: false, physicalDR: false, negation: true,
  },
};

/** 多個同類型的減免來源，取最高的生效，不能疊加(書中原文對DR/吸收/抗力都是這條規則)。 */
export function takeHighest(values) {
  return Math.max(0, ...values);
}

/**
 * 把一筆傷害依序跑過完整的減免流程(書中原文第2~8步)，算出最終傷害。
 * @param {object} params
 * @param {number} params.amount 傷害點數(已經是命中後、傷害上限套用完的結果，見attack.js)
 * @param {keyof DAMAGE_CATEGORY_RULES} params.category 傷害大類
 * @param {string} [params.energySubtype] category="能量"時的子類型(火焰/寒冰/雷電/腐蝕/音波/
 *   光能/光明/黑暗/純能量)，這裡只用來判斷是否無視硬度，其他子類型專屬規則(例如對黑暗生物
 *   傷害+1級)不在這個檔案處理。
 * @param {boolean} [params.isImmune] 目標是否免疫這個傷害類型，免疫時直接回傳0並跳過其他步驟
 * @param {number} [params.ignoreAmount] 傷害忽略點數(第二種忽略：每次受到傷害忽略X點)
 * @param {number} [params.ignoreThreshold] 「忽略X點以下的傷害」門檻(第一種忽略)，
 *   傷害小於等於這個門檻時整筆歸零
 * @param {number} [params.hardness] 硬度
 * @param {number} [params.physicalAbsorption] 物理傷害吸收
 * @param {number} [params.fullAbsorption] 全傷害吸收
 * @param {(amount:number) => number} [params.convert] 傷害轉化函式，呼叫端自己組合攻防雙方的
 *   轉化能力(按盾牌->盔甲->角色本身的順序疊加好)後傳一個函式進來
 * @param {number} [params.resistanceOrDR] 能量抗力或物理傷害減免(依category決定用哪一種語意)
 * @param {boolean} [params.unconditionalPhysicalDR] resistanceOrDR 是否為 DR/-(無弱點)，
 *   DR/-可以對力場傷害如常生效，即使力場一般不適用物理傷害減免
 * @param {number} [params.negation] 傷害抵消點數(花費資源池換來的抵消)
 */
export function applyDamageMitigation({
  amount,
  category,
  energySubtype,
  isImmune = false,
  ignoreAmount = 0,
  ignoreThreshold = 0,
  hardness = 0,
  physicalAbsorption = 0,
  fullAbsorption = 0,
  convert,
  resistanceOrDR = 0,
  unconditionalPhysicalDR = false,
  negation = 0,
}) {
  const rules = DAMAGE_CATEGORY_RULES[category];
  if (!rules) {
    throw new Error(`不合法的傷害大類：${category}，合法值：${Object.keys(DAMAGE_CATEGORY_RULES).join("/")}`);
  }
  if (amount < 0) throw new Error("傷害點數不能是負數");

  // 2) 傷害免疫
  if (rules.immunity && isImmune) {
    return { finalDamage: 0, stoppedAt: "immunity" };
  }

  let remaining = amount;

  // 3) 傷害忽略
  if (rules.ignore) {
    if (ignoreThreshold > 0 && remaining <= ignoreThreshold) {
      return { finalDamage: 0, stoppedAt: "ignoreThreshold" };
    }
    remaining = Math.max(0, remaining - ignoreAmount);
  }

  // 4) 硬度(能量傷害裡，雷電/腐蝕/音波/光能對生物無視硬度)
  const hardnessApplies =
    rules.hardness && !(category === "能量" && ENERGY_SUBTYPES_BYPASS_HARDNESS.has(energySubtype));
  if (hardnessApplies) {
    remaining = Math.max(0, remaining - hardness);
  }

  // 5) 傷害吸收(物理吸收只對物理/墜落系有效；全吸收適用範圍更廣；兩者不疊加，取高)
  const applicableAbsorption = [];
  if (rules.physicalAbsorption) applicableAbsorption.push(physicalAbsorption);
  if (rules.fullAbsorption) applicableAbsorption.push(fullAbsorption);
  if (applicableAbsorption.length > 0) {
    remaining = Math.max(0, remaining - takeHighest(applicableAbsorption));
  }

  // 6) 傷害轉化
  if (typeof convert === "function") {
    remaining = Math.max(0, convert(remaining));
  }

  // 7) 能量抗力或物理傷害減免
  const drApplies = rules.physicalDR || (category === "力場" && unconditionalPhysicalDR);
  if (drApplies || rules.energyResistance) {
    remaining = Math.max(0, remaining - resistanceOrDR);
  }

  // 8) 傷害抵消
  if (rules.negation) {
    remaining = Math.max(0, remaining - negation);
  }

  return { finalDamage: remaining, stoppedAt: null };
}
