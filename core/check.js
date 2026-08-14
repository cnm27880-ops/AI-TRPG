// 無限恐怖 TRPG 2.35 —— 「組一次判定」的組裝層
// 把屬性、技能、專業有無、傳奇屬性/技能附加成功 全部串起來，餵給 dice.js 的 resolveCheck。
// AI(說書人)只需要告訴這個函式「用哪個屬性、哪個技能、DC是多少」，其餘全部是純運算，
// 這正是使用者要的「計算交給電腦，AI只看最後結果做判斷」。

import { skillCategory } from "./schema.js";
import { legendaryAttributeBonus, skillBonusSuccesses, resolveCheck } from "./dice.js";

/**
 * @param {object} character 完整人物卡物件(見 schema.js emptyCharacter)
 * @param {object} params
 * @param {string} params.attribute 使用的屬性名，例如 "力量"
 * @param {string} [params.skill] 使用的技能名，屬性檢定(無技能)可省略
 * @param {string} [params.specialization] 本次判定使用的專業名稱，若技能要求專業但沒填，套用減半規則
 * @param {number} [params.dc] 難度(競爭)；對抗檢定請改傳對方本次判定的成功數
 * @param {number} [params.otherDpModifier] 其他情境/道具/能力帶來的 DP 加減值
 * @param {number} [params.otherBonusSuccesses] 其他能力帶來的額外附加成功
 * @param {object} [params.diceOpts] 傳給 dice.js 的加骰門檻等設定(供有「9加骰」之類能力時使用)
 */
export function performCheck(character, params) {
  const {
    attribute,
    skill,
    specialization,
    dc = 0,
    otherDpModifier = 0,
    otherBonusSuccesses = 0,
    diceOpts = {},
  } = params;

  const attrValue = character.attributes[attribute];
  if (attrValue == null) {
    throw new Error(`人物卡沒有屬性「${attribute}」`);
  }

  let dp = attrValue;
  let note = [`${attribute}(${attrValue})`];
  let bonus = legendaryAttributeBonus(attrValue) + otherBonusSuccesses;
  let flatPenalty = 0;

  if (skill) {
    const level = character.skills[skill];
    if (level == null) {
      throw new Error(`人物卡沒有技能「${skill}」，若是自創技能請先加進 character.skills`);
    }

    const category = skillCategory(skill);
    const hasSpecList = character.specializations?.[skill] ?? [];
    const needsSpecializationCheck = hasSpecList.length > 0; // 有登記過專業，才需要檢查本次是否命中
    const matchedSpecialization = specialization && hasSpecList.includes(specialization);

    let effectiveLevel = level;
    if (needsSpecializationCheck && !matchedSpecialization) {
      // 規則：沒有對應專業時，技能級數視為下降一半(向下取整)，但技能本身仍算擁有
      effectiveLevel = Math.floor(level / 2);
      note.push(`無對應專業，技能減半 ${level}->${effectiveLevel}`);
    }

    if (level === 0) {
      // 技能為0的處理，依三大分類而不同
      if (category === "心智") {
        return {
          autoFail: true,
          reason: `心智系技能「${skill}」為0，視為判定自動失敗`,
        };
      }
      if (category === "生理") {
        flatPenalty += 1; // 生理技能0：仍可嘗試，但失去1個成功數(與附加成功是否生效無關)
        note.push("生理技能為0，損失1個成功數");
      } else if (category === "互動") {
        flatPenalty += 2; // 互動技能0：仍可嘗試，但失去2個成功數
        note.push("互動技能為0，損失2個成功數");
      }
    } else {
      dp += effectiveLevel;
      bonus += skillBonusSuccesses(effectiveLevel);
      note.push(`${skill}(${effectiveLevel})`);
    }
  }

  dp += otherDpModifier;
  if (otherDpModifier) note.push(`情境/道具調整 ${otherDpModifier >= 0 ? "+" : ""}${otherDpModifier}`);

  const result = resolveCheck({
    dp,
    dc,
    bonusSuccesses: Math.max(0, bonus),
    flatPenalty,
    diceOpts,
  });

  return {
    autoFail: false,
    dp,
    bonusSuccessesRaw: bonus,
    note,
    ...result,
  };
}
