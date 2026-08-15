// 防御值組裝 —— [規則書] 出處：建卡頁「防御預設」數值區塊(rules2.35.txt 第2256~2320行)
// + 傳奇屬性效果(屬性概述.htm「傳奇敏捷」「傳奇感知」段落，完整原文見 core/legendaryAttributes.js)。
//
// 防御分成兩組完全不同的數字，這是這次讀規則書時最容易搞混、也最重要的一點：
//   1) 「防御值」(this.total)：直接從攻擊方的DP扣掉(骰池變小)，包含：
//        基礎防御 = min(敏捷, 感知)  ← 見下方[修正記錄2]
//        閃避防御 = 傳奇敏捷提供的 n(legendaryAttributeBonus(敏捷))
//        洞察防御 = 傳奇感知提供的 n(legendaryAttributeBonus(感知))
//        格擋防御 = 白刃技能等級 + 肉搏技能等級 + 盾牌防御(裝備體積來源，外部資料)
//        盔甲防御/天生防御 = 裝備/血統資源提供的數值(外部資料，Phase 3才會有真正的資料)
//        全力防御 = 使用「全力防御」標準動作時，再疊加一次基礎防御(書中「全力防御=基礎防御」，
//                    可信度：中——只找到角色卡欄位的公式，沒找到全力防御動作觸發條件的完整說明，
//                    需要之後找到更明確的段落再確認)
//   2) 「防御附加成功」(this.bonusSuccesses)：攻擊方擲出來的原始成功數要大於這個數字才算命中
//      (第13687行「成功命中...若你的檢定成功數大於目標的防御附加成功數，即為命中」)。
//
//      [修正記錄] 這個欄位原本漏算了一個來源：傳奇敏捷跟傳奇感知都會貢獻「防御附加成功」，
//      不是只有傳奇敏捷。使用者後來提供了「傳奇感知」的完整原文才發現這裡漏掉了——原文明講
//      「獲得n點防御附加成功，獲得可以疊加的n點洞察防御」，跟傳奇敏捷「獲得n點防御附加成功，
//      閃避防御增加n」是完全對稱的結構。之前只把 dodge(敏捷來源) 算進 bonusSuccesses，
//      insight(感知來源) 沒有算進去，已修正。這個例子也印證了「洞察防御公式本身」當初的推測
//      (洞察防御=legendaryAttributeBonus(感知))是對的，只是漏了它同時也貢獻防御附加成功。
//
//      [修正記錄2] 基礎防御原本實作成 max(敏捷, 感知)，是錯的，已改為 min。
//      當初的依據是建卡頁防御預設欄位寫「基礎防御 = 敏捷（0）/ 感知（0）」——那個「/」沒有
//      說明是取高還是取低，所以被推測成取高。但規則書「衍生屬性段」(第1784行)有明確的文字敘述：
//        「基礎防御：用于決定人物的防御值，初始值為**敏捷和感知中較低者**。」
//      明確的文字敘述優先於含糊的欄位符號。這個錯誤會讓每個角色的防御值都偏高，
//      連帶讓所有攻擊的命中率偏低，是實際會影響戰鬥結果的bug，不是數值草案調整。
//
// 這個模組刻意只吃「已經算好的零件數字」(屬性值、技能等級、裝備/血統來源的防御值)，
// 不假設角色物件長什麼樣子——因為裝備/血統資料還沒做(Phase 3)，呼叫端目前要自己把這些數字準備好。

import { legendaryAttributeBonus } from "../dice.js";

/**
 * @param {object} params
 * @param {number} params.agility 敏捷值
 * @param {number} params.perception 感知值
 * @param {number} [params.meleeWeaponSkill] 白刃技能等級，預設0
 * @param {number} [params.unarmedSkill] 肉搏技能等級，預設0
 * @param {number} [params.shieldDefense] 盾牌防御(裝備體積來源)，預設0
 * @param {number} [params.armorDefense] 盔甲防御(裝備來源)，預設0
 * @param {number} [params.naturalDefense] 天生防御(血統/改造來源)，預設0
 * @param {boolean} [params.fullDefense] 是否使用「全力防御」標準動作，預設false
 * @param {number} [params.extraBonusSuccesses] 其他來源的防御附加成功，預設0
 */
export function computeDefenseProfile({
  agility,
  perception,
  meleeWeaponSkill = 0,
  unarmedSkill = 0,
  shieldDefense = 0,
  armorDefense = 0,
  naturalDefense = 0,
  fullDefense = false,
  extraBonusSuccesses = 0,
}) {
  const base = Math.min(agility, perception);
  const dodge = legendaryAttributeBonus(agility);
  const insight = legendaryAttributeBonus(perception);
  const block = meleeWeaponSkill + unarmedSkill + shieldDefense;
  const fullDefenseBonus = fullDefense ? base : 0;

  const total = base + dodge + insight + block + armorDefense + naturalDefense + fullDefenseBonus;
  // 傳奇敏捷與傳奇感知都貢獻防御附加成功(見檔案頭部的[修正記錄])
  const bonusSuccesses = dodge + insight + extraBonusSuccesses;

  return {
    base,
    dodge,
    insight,
    block,
    armor: armorDefense,
    natural: naturalDefense,
    fullDefenseBonus,
    total,
    bonusSuccesses,
  };
}
