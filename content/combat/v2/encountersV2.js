// [設計-臨時佔位資料] Combat V2 的場景與敵人樣板。
//
// 跟 content/combat/placeholderEncounters.js 同樣的定位：不是規則書內容，也不是正式的
// 怪物型錄。V2 需要的東西比舊資料多兩塊——**場景可互動物件**與**敵人 AI 檔案**——
// 所以另開一份，而不是去改舊檔案（舊戰鬥流程還在用它，見 core/combat/V2_ISOLATION.md）。
//
// scene.features 是規格第7.1節D區的「可互動環境」：每一個都對應行動選單裡的一顆
// 環境行動按鈕，並且帶著自己的距離限制。玩家在遠距離就按不到中央的控制面板，
// 這個限制寫在資料裡，不寫在 UI 裡。

/**
 * 場景可互動物件的類型。行動目錄（core/combat/v2/actionCatalog.js）用 tag 去找它，
 * 所以之後新增場景只要沿用同一組 tag，就自動長出對應的環境行動，不用改程式碼。
 */
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
 * 預設遭遇：一隻掠奪者。數值沿用 placeholderEncounters.js 的 PLACEHOLDER_ENEMY
 * （同樣刻意調低，理由見該檔案的說明），另外補上 V2 需要的 hp / threatLabel / ai。
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

export const ENCOUNTERS_V2 = Object.freeze({
  [DEFAULT_ENCOUNTER_V2.id]: DEFAULT_ENCOUNTER_V2,
  [CROSSFIRE_ENCOUNTER_V2.id]: CROSSFIRE_ENCOUNTER_V2,
});

/** 查一個遭遇樣板。查不到就用預設的，不丟錯——找不到遭遇不該讓玩家卡在開不了的戰鬥。 */
export function getEncounterV2(encounterId) {
  return ENCOUNTERS_V2[encounterId] ?? DEFAULT_ENCOUNTER_V2;
}
