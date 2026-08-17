// 攻擊方式公式表 —— [規則書] 出處：戰！戰！戰！.htm 各攻擊方式段落，
// rules2.35.txt 第4470~4470行(肉搏/白刃/投擲/弓箭/槍械/炮)。
//
// 七種攻擊方式的公式形狀完全一致：DP = 關鍵屬性 + 技能 + 武器(或天生武器)傷害值(遠程再扣距離減值)，
// 每個成功數造成1點傷害，傷害有各自的上限公式封頂。這裡把公式抽成資料表而不是寫七個重複的函式，
// 之後如果書裡又冒出第八種攻擊方式，照同樣的形狀加一條資料就好。
//
// 每個 profile 的 dp()/damageCap() 函式吃同一組具名參數(用不到的欄位可以不傳，內部用 ?? 0 兜底)，
// 呼叫端(未來的武器/裝備資料，Phase 3才會做)負責把正確的數字放進對應欄位。
//
// [決策記錄 2026-08-15] dp() 依然是計算攻擊骰池大小的依據，繼續被 resolveCombatAction() 使用。
// damageCap() 從這輪開始不再被呼叫——新的單一DC戰鬥數學(見 core/combat/defense.js)不再對
// 傷害設武器別的上限，基礎傷害改成「總成功數 - 防御DC」。這裡保留 damageCap() 的公式資料
// 純粹是規則書原文的參考記錄，不是遺留的錯誤，之後若要恢復傷害上限機制可以直接復用。

export const ATTACK_TYPES = {
  肉搏: {
    label: "肉搏(天生武器)",
    ranged: false,
    dp: ({ strength = 0, unarmedSkill = 0, weaponDamage = 0 } = {}) => strength + unarmedSkill + weaponDamage,
    damageCap: ({ strength = 0, unarmedSkill = 0, weaponDamage = 0 } = {}) => weaponDamage + unarmedSkill + strength,
  },
  白刃: {
    label: "白刃(人造近戰武器)",
    ranged: false,
    dp: ({ strength = 0, meleeWeaponSkill = 0, weaponDamage = 0 } = {}) => strength + meleeWeaponSkill + weaponDamage,
    damageCap: ({ strength = 0, meleeWeaponSkill = 0, weaponDamage = 0 } = {}) =>
      weaponDamage + meleeWeaponSkill + strength,
  },
  投擲_輕: {
    label: "投擲(輕投擲武器)",
    ranged: true,
    maxRangeMultiplier: ({ strength = 0 } = {}) => strength, // 書中原文：距離上限=1倍射程單位*力量值
    dp: ({ agility = 0, athleticsSkill = 0, weaponDamage = 0 } = {}) => agility + athleticsSkill + weaponDamage,
    damageCap: ({ strength = 0, athleticsSkill = 0, weaponDamage = 0 } = {}) =>
      weaponDamage + athleticsSkill + strength,
  },
  投擲_重: {
    label: "投擲(重投擲武器)",
    ranged: true,
    maxRangeMultiplier: ({ strength = 0 } = {}) => strength,
    dp: ({ strength = 0, athleticsSkill = 0, weaponDamage = 0 } = {}) => strength + athleticsSkill + weaponDamage,
    damageCap: ({ strength = 0, athleticsSkill = 0, weaponDamage = 0 } = {}) =>
      weaponDamage + athleticsSkill + strength,
  },
  弓箭: {
    label: "弓箭",
    ranged: true,
    maxRangeMultiplier: () => 8,
    dp: ({ agility = 0, bowSkill = 0, weaponDamage = 0 } = {}) => agility + bowSkill + weaponDamage,
    damageCap: ({ bowSkill = 0, weaponDamage = 0, bowStrengthRequirement = 0 } = {}) =>
      weaponDamage * 2 + bowSkill + bowStrengthRequirement,
  },
  槍械: {
    label: "槍械/弩(非炮類)",
    ranged: true,
    maxRangeMultiplier: () => 5,
    dp: ({ agility = 0, gunSkill = 0, weaponDamage = 0 } = {}) => agility + gunSkill + weaponDamage,
    damageCap: ({ gunSkill = 0, weaponDamage = 0 } = {}) => weaponDamage * 2 + gunSkill,
  },
  炮: {
    label: "炮類(火炮/迫擊炮/載具主炮等)",
    ranged: true,
    maxRangeMultiplier: () => 4,
    dp: ({ intelligence = 0, gunSkill = 0, weaponDamage = 0 } = {}) => intelligence + gunSkill + weaponDamage,
    damageCap: ({ gunSkill = 0, weaponDamage = 0 } = {}) => weaponDamage * 2 + gunSkill,
  },
};

/**
 * 每種攻擊方式在六維十技能裡的「關鍵屬性＋技能」是哪一組。
 *
 * [決策記錄 2026-08-17] 上面的 dp() 吃的是 strength/unarmedSkill 這種**具名參數**，
 * 那是為了讓公式表跟角色卡的欄位名解耦。但這也造成一個後果：外面完全看不出
 * 「肉搏攻擊算的是力量+格鬥」，於是商品效果的匹配鍵(attribute/skill)沒有辦法對上攻擊。
 * 結果是型錄裡極常見的「攻擊檢定+X」轉不出來，而且已經上架的檢定加值買了之後
 * 在戰鬥裡靜靜地不生效(narrative check 有效、attack 無效，同一個加值兩種行為)。
 *
 * 這張表把那個對應關係講出來，讓 content/shop/effects.js 的 attackModifiersFor()
 * 可以用跟一般檢定完全相同的匹配規則去比對攻擊。**這不是改寫攻擊公式**
 * (CONVERSION_RULES.md 第5節仍然成立：個別條目不可以改寫公式)，只是把公式裡本來就
 * 用到的那兩個欄位標示出來。
 */
export const ATTACK_CHECK_KEYS = Object.freeze({
  肉搏: { attribute: "力量", skill: "格鬥" },
  白刃: { attribute: "力量", skill: "格鬥" },
  投擲_輕: { attribute: "敏捷", skill: "體魄" },
  投擲_重: { attribute: "力量", skill: "體魄" },
  弓箭: { attribute: "敏捷", skill: "射擊" },
  槍械: { attribute: "敏捷", skill: "射擊" },
  炮: { attribute: "智力", skill: "射擊" },
});

/** 這種攻擊方式算的是哪一組屬性＋技能。 */
export function attackCheckKeys(attackType) {
  const keys = ATTACK_CHECK_KEYS[attackType];
  if (!keys) throw new Error(`不合法的攻擊方式：${attackType}，合法值：${Object.keys(ATTACK_CHECK_KEYS).join("/")}`);
  return keys;
}

/**
 * 距離減值：目標距離每超過1倍武器射程，攻擊判定承受2DP減值(書中原文對投擲/弓箭/槍械/炮通用)。
 * @param {number} distance 實際距離
 * @param {number} weaponRange 武器的射程單位
 */
export function rangePenalty(distance, weaponRange) {
  if (!(weaponRange > 0)) throw new Error("武器射程必須是正數");
  if (distance < 0) throw new Error("距離不能是負數");
  const multiplesOver = Math.max(0, Math.ceil(distance / weaponRange) - 1);
  return multiplesOver * 2;
}

/**
 * 檢查距離是否超出這種攻擊方式的最大有效距離(超出則「或許可以扔得更遠，但無法進行有意義的攻擊」)。
 * @param {string} attackType ATTACK_TYPES 的 key
 * @param {number} distance
 * @param {number} weaponRange
 * @param {object} params 傳給 maxRangeMultiplier 的參數(例如力量值)
 */
export function isWithinMaxRange(attackType, distance, weaponRange, params = {}) {
  const profile = getAttackType(attackType);
  if (!profile.ranged) return true; // 近戰不適用射程上限，交由「觸及(reach)」規則另外處理，不在這個函式範圍內
  const multiplier = profile.maxRangeMultiplier(params);
  return distance <= weaponRange * multiplier;
}

export function getAttackType(key) {
  const profile = ATTACK_TYPES[key];
  if (!profile) throw new Error(`不合法的攻擊方式：${key}，合法值：${Object.keys(ATTACK_TYPES).join("/")}`);
  return profile;
}
