// [設計-臨時佔位資料] Combat V2 的場景與敵人樣板。
//
// 跟 content/combat/v2/weapons.js 同樣的定位：不是規則書內容，也不是正式的怪物型錄。
// 副本包裡的真實敵人樣板（bossEncounter／threatEncounter）由底下的 enemyFromTemplate()
// 轉成這裡的形狀，所以打副本時用的是副本自己的怪，不是這份佔位資料。
//
// scene.features 是規格第7.1節D區的「可互動環境」：每一個都對應行動選單裡的一顆
// 環境行動按鈕，並且帶著自己的距離限制。玩家在遠距離就按不到中央的控制面板，
// 這個限制寫在資料裡，不寫在 UI 裡。

/**
 * 場景可互動物件的類型。行動目錄（core/combat/v2/actionCatalog.js）用 tag 去找它，
 * 所以之後新增場景只要沿用同一組 tag，就自動長出對應的環境行動，不用改程式碼。
 */
import { computeDerivedStats } from "../../../core/derivedStats.js";
import { COMBAT_WEAPONS } from "./weapons.js";

export const FEATURE_TAGS = Object.freeze({
  COVER: "cover",
  DOOR: "door",
  LIGHTING: "lighting",
  MACHINERY: "machinery",
});

export const CARGO_BAY_SCENE = Object.freeze({
  id: "cargo_bay",
  label: "中央貨艙",
  description: "挑高兩層的貨艙，兩側疊著貨櫃，天車吊臂懸在正上方。",
  terrain: "照明不穩、通風管有異常聲響",
  features: Object.freeze([
    {
      id: "container_stack",
      label: "貨櫃堆",
      tags: [FEATURE_TAGS.COVER],
      // 這個物件在哪些距離按得到。貨櫃就在附近，近/中距離都構得到。
      validRanges: ["close", "medium"],
      description: "半人高的貨櫃可以擋住大部分身形。",
    },
    {
      id: "bay_door",
      label: "貨艙艙門",
      tags: [FEATURE_TAGS.DOOR],
      validRanges: ["medium", "far"],
      description: "液壓艙門，關上之後要花不少力氣才能撬開。",
    },
    {
      id: "control_panel",
      label: "控制面板",
      tags: [FEATURE_TAGS.LIGHTING],
      validRanges: ["close"],
      description: "右側牆上的照明與通風控制面板。",
    },
    {
      id: "cargo_crane",
      label: "天車吊臂",
      tags: [FEATURE_TAGS.MACHINERY],
      validRanges: ["medium", "far"],
      description: "懸在貨艙上方的吊臂，操作台在遠端走道。",
    },
  ]),
});

/**
 * 敵人 AI 檔案。**這是內部資料**，永遠不進公開 payload（規格第6.2節）。
 *   melee_rusher  只有近戰手段，會一路逼近；被打到重傷也不退。
 *   ranged_holder 有遠程武器，傾向維持中距離；被貼身時會先拉開再開火。
 */
export const AI_PROFILES = Object.freeze({
  MELEE_RUSHER: "melee_rusher",
  RANGED_HOLDER: "ranged_holder",
});

/**
 * 預設遭遇：一隻掠奪者。數值刻意調低（相對於一般建卡角色）——單一DC防御公式下，
 * 雙方技能相同時防御DC會逼近攻擊DP本身，命中率低到不像樣（見 ARCHITECTURE.md
 * 「戰鬥數學簡化」的實測結果）。這裡先給一個「打得到、有來有回」的入門對手，
 * 真正的怪物強度平衡留給接上真實型錄資料時再調。
 */
export const DEFAULT_ENCOUNTER_V2 = Object.freeze({
  id: "cargo_bay_raider",
  label: "貨艙遭遇",
  scene: CARGO_BAY_SCENE,
  startRange: "medium",
  enemies: Object.freeze([
    Object.freeze({
      id: "enemy_01",
      name: "掠奪者",
      threatLabel: "普通",
      attributes: { 力量: 2, 敏捷: 1, 耐力: 2, 智力: 1, 感知: 1, 意志: 1 },
      skills: { 格鬥: 1 },
      weaponKey: "unarmed",
      armor: 0,
      hp: 12,
      initiative: 2,
      ai: { profile: AI_PROFILES.MELEE_RUSHER },
      telegraphs: [
        "掠奪者換了握法，重心壓低",
        "掠奪者側身往你的左邊挪了半步",
        "掠奪者朝身後的黑暗喊了一聲，像是在叫人",
      ],
    }),
  ]),
});

/** 雙敵人遭遇：一個逼近、一個在遠端壓制，用來驗證多目標與目標選擇。 */
export const CROSSFIRE_ENCOUNTER_V2 = Object.freeze({
  id: "cargo_bay_crossfire",
  label: "貨艙交叉火力",
  scene: CARGO_BAY_SCENE,
  startRange: "medium",
  enemies: Object.freeze([
    Object.freeze({
      id: "enemy_01",
      name: "掠奪者",
      threatLabel: "普通",
      attributes: { 力量: 2, 敏捷: 1, 耐力: 2, 智力: 1, 感知: 1, 意志: 1 },
      skills: { 格鬥: 1 },
      weaponKey: "unarmed",
      armor: 0,
      hp: 12,
      initiative: 2,
      ai: { profile: AI_PROFILES.MELEE_RUSHER },
      telegraphs: ["掠奪者換了握法，重心壓低"],
    }),
    Object.freeze({
      id: "enemy_02",
      name: "持槍看守",
      threatLabel: "威脅",
      attributes: { 力量: 2, 敏捷: 2, 耐力: 2, 智力: 2, 感知: 2, 意志: 1 },
      skills: { 射擊: 1 },
      weaponKey: "pistol",
      armor: 1,
      hp: 10,
      initiative: 3,
      ai: { profile: AI_PROFILES.RANGED_HOLDER },
      telegraphs: ["看守把槍口抬起來，找你的位置"],
    }),
  ]),
});

/**
 * 把副本包裡的敵人樣板（bossEncounter／threatEncounter）轉成戰鬥系統要的形狀。
 *
 * 副本資料寫的是 `{ name, attributes, skills, weaponKey, armor, size, telegraphs }`，
 * 缺兩樣戰鬥需要的東西：生命值上限與先攻值。兩者都**由屬性推導**，而不是要副本作者
 * 另外寫一個數字——推導公式（core/derivedStats.js）是規則書的算術，讓資料重複寫一次
 * 只會多一個會走鐘的地方。這也正是舊戰鬥系統當初的作法，所以現有 boss 的難度不變。
 *
 * @param {object} template 副本包裡的敵人樣板
 * @param {{ id?: string, threatLabel?: string }} [opts]
 */
export function enemyFromTemplate(template, { id = "enemy_01", threatLabel } = {}) {
  if (!template?.attributes) {
    throw new Error(`敵人樣板「${template?.name ?? "(未命名)"}」缺少 attributes，無法推導生命值與先攻`);
  }
  const derived = computeDerivedStats(template.attributes, { size: template.size ?? 5 });
  const weapon = COMBAT_WEAPONS[template.weaponKey];
  if (!weapon) {
    // 開戰當下就報清楚，不要等到敵人第一次揮拳才炸——那時戰鬥已經寫進存檔，
    // 玩家會卡在一場打不下去的戰鬥裡。
    throw new Error(
      `敵人樣板「${template.name}」的武器「${template.weaponKey}」不在武器型錄裡` +
        `（可用的有：${Object.keys(COMBAT_WEAPONS).join("/")}）。見 content/combat/v2/weapons.js`
    );
  }

  return {
    id,
    name: template.name,
    // 副本資料可以自己寫 threatLabel；沒寫就用一個中性的公開分級，
    // 不要從內部數值推——那等於把戰力數字換一個說法漏出去。
    threatLabel: template.threatLabel ?? threatLabel ?? "威脅",
    attributes: template.attributes,
    skills: template.skills ?? {},
    weaponKey: template.weaponKey,
    armor: template.armor ?? 0,
    hp: derived.hp.max,
    initiative: derived.initiative,
    // AI 檔案從武器推：有遠程武器的會想維持距離，只有近戰的會一路逼近。
    ai: { profile: weapon.ranged ? AI_PROFILES.RANGED_HOLDER : AI_PROFILES.MELEE_RUSHER },
    telegraphs: template.telegraphs ?? [],
  };
}

/**
 * 用一個副本敵人樣板組一場遭遇。場景仍用佔位的貨艙——副本資料目前沒有描述戰場的欄位，
 * 那是之後接上真實地點時要補的（見 ROADMAP）。
 */
export function encounterFromTemplate(template, { id = "scenario_encounter", label = "副本遭遇" } = {}) {
  return {
    id,
    label,
    scene: CARGO_BAY_SCENE,
    startRange: "medium",
    enemies: [enemyFromTemplate(template)],
  };
}

export const ENCOUNTERS_V2 = Object.freeze({
  [DEFAULT_ENCOUNTER_V2.id]: DEFAULT_ENCOUNTER_V2,
  [CROSSFIRE_ENCOUNTER_V2.id]: CROSSFIRE_ENCOUNTER_V2,
});

/** 查一個遭遇樣板。查不到就用預設的，不丟錯——找不到遭遇不該讓玩家卡在開不了的戰鬥。 */
export function getEncounterV2(encounterId) {
  return ENCOUNTERS_V2[encounterId] ?? DEFAULT_ENCOUNTER_V2;
}
