// 無限恐怖 TRPG —— 判定運算核心（六維十技能輕量版）
import { skillCategory } from "./schema.js";
import { legendaryAttributeBonus, skillBonusSuccesses, resolveCheck } from "./dice.js";

export function performCheck(character, params) {
  const {
    attribute,
    skill,
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
    const level = character.skills[skill] ?? 0;
    const category = skillCategory(skill);

    if (level === 0) {
      // 0級技能懲罰
      if (category === "心智") {
        // [2026-09-03 修正] 這裡以前只回 { autoFail, reason }，沒有骰子結果所以
        // 沒有 rolls 是對的（test/integration.test.js 鎖住這一點），但連 note／dc／
        // totalSuccesses／success／margin 也一起漏掉了——這些不是「骰出來的東西」，
        // 是「這次判定的結論摘要」，任何讀 checkResult 的地方（前端 renderCheckResult()、
        // functions/api/turn.js 寫回事件日誌那段）都預期它們存在。少了它們，畫面上
        // 印出的是一整排「undefined」，存檔裡也是一整排 undefined，這是純粹的資料
        // 缺角，不是刻意不擲骰的那個設計決定。
        const reason = `心智系技能「${skill}」為0，缺乏專業知識，判定自動失敗`;
        note.push(reason);
        return {
          autoFail: true,
          reason,
          dp,
          note,
          bonusSuccessesRaw: 0,
          totalSuccesses: 0,
          dc,
          success: false,
          margin: 0 - dc,
        };
      }
      if (category === "戰鬥" || category === "身手") {
        flatPenalty += 1;
        note.push("戰鬥/身手技能為0，損失1個成功數");
      } else if (category === "社交") {
        flatPenalty += 2;
        note.push("社交技能為0，損失2個成功數");
      }
    } else {
      dp += level;
      bonus += skillBonusSuccesses(level);
      note.push(`${skill}(${level})`);
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
