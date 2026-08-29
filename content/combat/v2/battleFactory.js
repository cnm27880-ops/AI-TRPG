// Combat V2 —— 把角色卡 + 遭遇樣板組成一場戰鬥。
//
// core/combat/v2/battleState.js 是純規則層，它不知道角色卡長什麼樣、也不知道商店賣什麼。
// 這一層負責把兩邊接起來：從角色卡算出衍生數值與戰鬥檔案、從商店與型態算出裝備清單，
// 然後交給 createBattle()。放在 content/ 而不是 core/ 是本專案既有的分界
// （core = 規則運算，content = 這個世界的資料與接線）。

import { createBattle } from "../../../core/combat/v2/battleState.js";
import { combatProfileFrom } from "../../shop/effects.js";
import { activeGrantSources } from "../../shop/forms.js";
import { buildLoadout } from "./loadout.js";
import { encounterFromTemplate, getEncounterV2 } from "./encountersV2.js";
import { buildFormActionDefinitions } from "./formActions.js";
import { createFormsState } from "../../shop/forms.js";

/**
 * @param {object} params
 * @param {object} params.character 角色卡（core/schema.js 形狀）
 * @param {string} params.battleId
 * @param {string} [params.encounterId] 內建遭遇的 id（沒有 enemyTemplate 時才看它）
 * @param {object} [params.enemyTemplate] 副本包裡的敵人樣板（最終戰的 bossEncounter 或
 *   迫近度到頂的 threatEncounter）。有帶就用它，內建的佔位遭遇只是沒有副本時的退路——
 *   否則玩家在異形副本裡按下去會跳出一隻不相干的「掠奪者」，世界觀當場穿幫。
 * @param {object} [params.forms] content/shop/forms.js 的型態狀態（型態授予的天生武器要進裝備表）
 * @param {string} [params.sceneKey] 以「場景」計時的型態要記下啟動當下的地點，
 *   語意見 content/shop/access.js 的 sceneKeyOf()。戰鬥不是一個獨立的場景——
 *   打一場架不會改變你站在哪裡，所以這裡用的是 session 的場景鑰匙，不是 battle.scene.id。
 * @param {number} [params.seed] 測試用：鎖定整場戰鬥的骰子
 */
export function startBattleV2({ character, battleId, encounterId, enemyTemplate, forms, sceneKey = null, seed, encounterLabel }) {
  // 角色卡壞掉時**要當場報清楚**，不要用一個編出來的預設值撐過去。
  // 先前這裡寫 `character.derived?.hp ?? { max: 10, ... }`，那看起來像防禦性寫法，
  // 實際效果是：存檔壞掉的玩家會進到一場自己血量憑空變成 10 的戰鬥，而且沒有任何
  // 地方會說出哪裡不對。開不了的戰鬥好過一場數字是假的戰鬥。
  if (!character?.derived?.hp || typeof character.derived.hp.max !== "number") {
    throw new Error(
      `角色卡沒有可用的生命值狀態（character.derived.hp）——無法建立戰鬥。` +
        `這通常代表存檔的衍生數值沒有算過，見 core/derivedStats.js 的 computeDerivedStats()。`
    );
  }

  const encounter = enemyTemplate
    ? encounterFromTemplate(enemyTemplate, { id: encounterId ?? "scenario_encounter", label: encounterLabel ?? "副本遭遇" })
    : getEncounterV2(encounterId);
  const extraSources = activeGrantSources(forms);

  const combatProfile = combatProfileFrom(character, {
    skillCorrection: Math.max(character.skills?.格鬥 ?? 0, character.skills?.體魄 ?? 0),
    extraSources,
  });

  const battle = createBattle({
    battleId,
    playerEntry: {
      name: character.name ?? "輪迴者",
      attributes: character.attributes ?? {},
      skills: character.skills ?? {},
      combatProfile,
      hpState: character.derived.hp,
      initiative: (character.derived.initiative ?? 0) + (combatProfile.initiativeBonus ?? 0),
    },
    enemyEntries: encounter.enemies.map((enemy) => ({ ...enemy })),
    scene: encounter.scene,
    loadout: buildLoadout(character, { extraSources }),
    startRange: encounter.startRange ?? "medium",
    seed,
  });

  battle.encounterId = encounter.id;
  // 型態系統需要的三樣東西跟著戰鬥狀態一起存，續戰時才拿得回同一份。
  //   character —— 型態要扣意志力／能量池，而那些數字在角色卡上（結算後由 API 層存回存檔）
  //   forms     —— 戰鬥外的型態帶進來，收兵時再帶回去（跟舊流程同一個約定）
  //   sceneKey  —— 以「場景」計時的型態的唯一到期條件
  battle.character = character;
  battle.forms = forms ?? createFormsState();
  battle.sceneKey = sceneKey;
  // 型態是每個角色不一樣的，所以它的行動定義在開戰當下從角色卡長出來
  // （靜態目錄只能放所有人共通的行動）。
  battle.dynamicActions = buildFormActionDefinitions(character);
  return battle;
}
