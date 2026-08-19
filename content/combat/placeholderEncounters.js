// [設計-臨時佔位資料] 戰鬥 MVP 用的武器與敵人資料。
//
// 這不是規則書內容，也不是正式的資源型錄資料——content/packs/ 裡的血統/改造/瞳術等
// 條目目前是自由文字描述（例如金剛狼的「骨爪：3L天生武器，破甲1」），還沒有轉成
// core/combat/attackTypes.js 的 dp()/damageCap() 可以直接吃的結構化欄位（那是之後
// Phase 3 型錄轉換工具要處理的事）。這裡先給兩把最陽春的武器與一個測試用敵人，
// 讓「戰鬥引擎 -> UI」這條路先接通、可以玩起來，之後型錄資料接上時，
// 只要把 ATTACK_TYPE_PARAM_BUILDERS 這層 adapter 的資料來源換成真實裝備/血統資料，
// 不需要改動 UI 或 API 邏輯。
//
// 敵人只支援單一對手（見 content/combat/encounterState.js 的範圍限制）。

export const PLACEHOLDER_WEAPONS = {
  unarmed: {
    key: "unarmed",
    label: "徒手（肉搏）",
    attackType: "肉搏",
    weaponDamage: 0,
    severity: "B",
    ranged: false,
  },
  pistol: {
    key: "pistol",
    label: "制式手槍（槍械）",
    attackType: "槍械",
    weaponDamage: 2,
    weaponRange: 20,
    severity: "B",
    ranged: true,
  },
};

/** 每種攻擊方式需要的具名參數不同（見 core/combat/attackTypes.js），這裡把角色資料轉成對應形狀。 */
export function buildAttackParams(attackType, character, weapon) {
  const attrs = character.attributes ?? {};
  const skills = character.skills ?? {};
  const weaponDamage = weapon.weaponDamage ?? 0;

  switch (attackType) {
    case "肉搏":
      return { strength: attrs.力量 ?? 1, unarmedSkill: skills.格鬥 ?? 0, weaponDamage };
    case "白刃":
      return { strength: attrs.力量 ?? 1, meleeWeaponSkill: skills.格鬥 ?? 0, weaponDamage };
    case "槍械":
      return { agility: attrs.敏捷 ?? 1, gunSkill: skills.射擊 ?? 0, weaponDamage };
    default:
      throw new Error(`placeholderEncounters 尚未支援攻擊方式：${attackType}`);
  }
}


/**
 * [設計 2026-08-18] 敵人意圖預告（telegraphs，見 Phase 5.3 任務5）。
 *
 * 每個回合開始時（玩家還沒選行動之前），引擎會從敵人的這張表裡抽一句，存進
 * encounterState 的 currentTelegraph，前端把它顯示在戰鬥畫面上、下一輪再餵給AI當敘事背景。
 *
 * 為什麼要有它：在此之前戰鬥畫面上玩家能看到的只有雙方血條與「輪到你了」。
 * 敵人做什麼、要做什麼，玩家一無所知，於是最佳策略永遠是「按同一顆攻擊鍵到分出勝負」，
 * 沒有任何可以據以判斷的資訊 —— 那不是戰鬥，是等結果。預告給玩家一個
 * 「這一輪牠正在做什麼」的線索，決策才開始有意義。
 *
 * 這是**純敘事資料**：它不進任何公式，不影響命中、傷害、先攻。真的要讓預告帶有機制效果
 * （「翹起尾巴的下一輪傷害+2」）是另一件事，需要規則書依據，不在這一輪的範圍內。
 * 現在刻意保持它完全無害，這樣資料寫錯也只會讓畫面上多一句怪話，不會弄壞戰鬥數學。
 *
 * 資料放這裡而不是散在各個敵人樣板裡：之後接上真實怪物型錄時，這張表整個被取代，
 * 敵人樣板只要帶一個 telegraphs 欄位就好，不用改狀態機。
 */
export const TELEGRAPHS = {
  掠奪者: [
    "掠奪者正在為霰彈槍重新上膛，黃銅彈殼叮噹落地",
    "掠奪者換了握法，把撬棍橫在身前，重心壓低",
    "掠奪者側身往你的左邊挪了半步，想繞開你的視線",
    "掠奪者朝身後的黑暗喊了一聲，像是在叫人",
  ],
};

/** 單一測試用敵人（掠奪者）。之後接上真實怪物資料包後，這裡會改成從 content/loader.js 的 registry 挑選。 */
// 數值刻意調低（相對於一般建卡角色）：新的單一DC防御公式下，雙方若技能等級相同，
// 防御DC會逼近攻擊DP本身，命中率會低到不像樣（見 ARCHITECTURE.md「戰鬥數學簡化」決策記錄
// 的實測結果）。[2026-08-18] core/combat/attack.js 的命中門檻已從「嚴格大於DC」修正成
// 「大於等於DC」，緩解了一部分這個問題，但攻擊方技能為0（沒受過訓練）時DP仍然只等於
// 屬性值本身，面對有技能補正的防御方還是很容易打不中——這仍然是公式本身的性質，不是bug；
// 真正的怪物強度平衡留給之後接上真實型錄資料時再調，這裡先給一個「打得到、有來有回」的
// 入門對手，只用於驗證引擎-UI串接。
export const PLACEHOLDER_ENEMY = {
  name: "掠奪者",
  attributes: { 力量: 2, 敏捷: 1, 耐力: 2, 智力: 1, 感知: 1, 意志: 1 },
  skills: { 格鬥: 1 },
  weaponKey: "unarmed",
  armor: 0,
  size: 5,
  telegraphs: TELEGRAPHS.掠奪者,
};
