// Combat V2 測試共用夾具。
//
// 每個測試都自己組一張角色卡與一場戰鬥，而且**一律鎖 seed**——Combat V2 的骰子來自
// 戰鬥狀態裡的 seed（見 core/combat/v2/rng.js），所以同一個 seed 一定跑出同一場戰鬥。
// 沒有這一點的話，「結算順序對不對」「重送會不會重複扣血」這些測試只能靠機率碰運氣。

import { emptyCharacter } from "../../core/schema.js";
import { computeDerivedStats } from "../../core/derivedStats.js";
import { startBattleV2 } from "../../content/combat/v2/battleFactory.js";
import { createBattle } from "../../core/combat/v2/battleState.js";
import { buildLoadout } from "../../content/combat/v2/loadout.js";
import { CARGO_BAY_SCENE, getEncounterV2 } from "../../content/combat/v2/encountersV2.js";

/** 一張夠打的角色卡：屬性與技能都給得起，測試才不會全部卡在「打不中」。 */
export function playerCharacter(overrides = {}) {
  const character = emptyCharacter(overrides.name ?? "V2 測試者");
  Object.assign(character.attributes, { 力量: 4, 敏捷: 4, 耐力: 4, 智力: 3, 感知: 3, 意志: 3 }, overrides.attributes ?? {});
  Object.assign(character.skills, { 格鬥: 3, 射擊: 3, 體魄: 2 }, overrides.skills ?? {});
  character.derived = computeDerivedStats(character.attributes, { size: 5 });
  return character;
}

/**
 * 開一場測試用戰鬥。
 * @param {{ startRange?: string, encounterId?: string, seed?: number, character?: object }} [opts]
 */
export function makeBattle({ startRange = "medium", encounterId, seed = 20260829, character } = {}) {
  const encounter = getEncounterV2(encounterId);
  const pc = character ?? playerCharacter();
  const battle = createBattle({
    battleId: "test_battle",
    playerEntry: {
      name: pc.name,
      attributes: pc.attributes,
      skills: pc.skills,
      combatProfile: { skillCorrection: 3, equipmentDefense: 0, armor: 0 },
      hpState: pc.derived.hp,
      initiative: pc.derived.initiative,
    },
    enemyEntries: encounter.enemies.map((enemy) => ({ ...enemy })),
    scene: JSON.parse(JSON.stringify(CARGO_BAY_SCENE)),
    loadout: buildLoadout(pc),
    startRange,
    seed,
  });
  battle.encounterId = encounter.id;
  return battle;
}

/** 直接走正式的工廠（含商店/型態接線），給需要驗證接線的測試用。 */
export function makeBattleViaFactory(opts = {}) {
  return startBattleV2({
    character: opts.character ?? playerCharacter(),
    battleId: opts.battleId ?? "test_battle",
    encounterId: opts.encounterId,
    forms: opts.forms,
    seed: opts.seed ?? 20260829,
  });
}

/** 從選單裡找一張卡。找不到就直接讓測試失敗，而不是回 undefined 讓錯誤延後爆開。 */
export function findAction(menu, actionId) {
  const found = menu.find((entry) => entry.id === actionId);
  if (!found) {
    throw new Error(`選單裡沒有「${actionId}」。目前有：${menu.map((m) => m.id).join(", ")}`);
  }
  return found;
}
