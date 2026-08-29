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
import { getEncounterV2 } from "./encountersV2.js";
import { buildFormActionDefinitions } from "./formActions.js";
import { createFormsState } from "../../shop/forms.js";

/**
 * @param {object} params
 * @param {object} params.character 角色卡（core/schema.js 形狀）
 * @param {string} params.battleId
 * @param {string} [params.encounterId]
 * @param {object} [params.forms] content/shop/forms.js 的型態狀態（型態授予的天生武器要進裝備表）
 * @param {string} [params.sceneKey] 以「場景」計時的型態要記下啟動當下的地點，
 *   語意見 content/shop/access.js 的 sceneKeyOf()。戰鬥不是一個獨立的場景——
 *   打一場架不會改變你站在哪裡，所以這裡用的是 session 的場景鑰匙，不是 battle.scene.id。
 * @param {number} [params.seed] 測試用：鎖定整場戰鬥的骰子
 */
export function startBattleV2({ character, battleId, encounterId, forms, sceneKey = null, seed }) {
  const encounter = getEncounterV2(encounterId);
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
      hpState: character.derived?.hp ?? { max: 10, intact: 10, B: 0, L: 0, A: 0 },
      initiative: (character.derived?.initiative ?? 0) + (combatProfile.initiativeBonus ?? 0),
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
