// Combat V2 —— 把內部戰鬥狀態轉成不洩漏秘密的公開 payload（規格第13節的 publicState）。
//
// 這是一份**白名單**，不是黑名單。理由：黑名單（「把 seed 刪掉再回傳」）只要有人在
// battleState 裡加一個新欄位就會靜靜地漏出去，而且沒有任何測試會紅。白名單的失敗方向
// 相反——忘記加欄位只會讓畫面少一格，那是看得見的。
//
// 絕對不會出現在回傳值裡的東西（規格第3節第7點、第6.2節）：
//   seed / rngCursor      —— 骰子的可預測性
//   敵人的精確 hpState    —— 只給 publicHealthTier 的等級文字
//   敵人的 ai 檔案        —— 「敵方內部標籤：ambush_ready」講的就是這個
//   秘密 DC / 骰池 / 權重 —— 這些從頭到尾就不在戰鬥狀態裡，只存在於結算的區域變數
//   requestLog            —— 冪等紀錄是伺服器內務

import { publicBudget } from "./actionBudget.js";
import { getAvailableCombatActions, groupActionsByType } from "./availableActions.js";
import { ACTION_TYPE_LIST, ACTION_TYPE_LABELS, ACTION_TYPE_COST_HINTS } from "./actionTypes.js";
import { COMBAT_RANGES, RANGE_DESCRIPTIONS, RANGE_LABELS } from "./range.js";
import { getRange, isDown, livePlayerCombatProfile, playerOf, primaryRange, publicHealthTier } from "./battleState.js";

/** 玩家自己的狀態卡（規格第7.1節B區）。玩家看得到自己的精確 HP，那是他自己的角色。 */
function publicPlayer(battle) {
  const player = playerOf(battle);
  return {
    id: player.id,
    name: player.name,
    hp: { ...player.hpState },
    healthTier: publicHealthTier(player.hpState),
    down: isDown(player),
    statuses: player.statuses.map((s) => ({ id: s.id, label: s.label, description: s.description ?? null })),
    coverFeatureId: player.coverFeatureId,
    // 現查而不是讀 player.armor 快照——見 livePlayerCombatProfile 的接線缺口說明，
    // 否則型態在戰鬥中途授予的護甲會在傷害計算裡生效、畫面上卻沒有跟著變。
    armor: livePlayerCombatProfile(battle).armor,
    // 進行中的型態。玩家要看得到自己現在變著什麼身、還要付幾輪維持成本，
    // 否則「鬼魅身每輪扣 1 點內力」在畫面上是完全隱形的。
    forms: (battle.forms?.active ?? []).map((form) => ({
      formId: form.formId,
      label: form.label,
      sourceName: form.sourceName,
      mode: form.mode?.label ?? null,
      paid: form.paid ?? null,
      hasUpkeep: Boolean(form.upkeep),
      expiresAfterRound: form.expiresAfterRound ?? null,
      unit: form.unit ?? null,
    })),
  };
}

/** 敵人的公開狀態卡（規格第7.1節C區）。**沒有精確 HP、沒有 AI、沒有隱藏弱點。** */
function publicEnemy(battle, enemy) {
  return {
    id: enemy.id,
    name: enemy.name,
    threatLabel: enemy.threatLabel,
    healthTier: publicHealthTier(enemy.hpState),
    down: isDown(enemy),
    // 只有「看得出來的」狀態。內部旗標沒有 label，就不會出現在這裡。
    statuses: enemy.statuses.filter((s) => s.label).map((s) => ({ id: s.id, label: s.label, description: s.description ?? null })),
    range: getRange(battle, "player", enemy.id),
    rangeLabel: RANGE_LABELS[getRange(battle, "player", enemy.id)] ?? null,
    inCover: Boolean(enemy.coverFeatureId),
    visible: enemy.visible,
    // 意圖預告是刻意公開的敘事線索，不是內部資料：它不進任何公式，不影響命中、傷害或先攻。
    telegraph: enemy.currentTelegraph ?? null,
  };
}

/**
 * 型態會花的資源：意志力與能量池。這是玩家自己的角色卡，給精確數字沒有洩漏問題。
 * 角色卡沒帶進戰鬥時（純規則測試）回 null，UI 那一格就不畫。
 */
function publicResources(character) {
  if (!character?.derived) return null;
  const pools = character.derived.energyPools ?? {};
  return {
    willpower: character.derived.willpower
      ? { current: character.derived.willpower.current, max: character.derived.willpower.max }
      : null,
    energyPools: Object.fromEntries(
      Object.entries(pools).map(([name, pool]) => [name, { current: pool.current, max: pool.max }])
    ),
  };
}

/** 玩家的裝備摘要（規格第7.1節B區：武器與彈藥）。 */
function publicLoadout(loadout) {
  return {
    weapons: loadout.weapons.map((w) => ({
      key: w.key,
      label: w.label,
      category: w.category,
      attackType: w.attackType,
      validRanges: [...w.validRanges],
      ammo: loadout.ammo?.[w.key]
        ? { loaded: loadout.ammo[w.key].loaded, magazine: loadout.ammo[w.key].magazine, spareMagazines: loadout.ammo[w.key].spareMagazines }
        : null,
    })),
    items: { ...(loadout.items ?? {}) },
  };
}

/**
 * 把整場戰鬥轉成公開 payload。這是**唯一**能離開伺服器的戰鬥形狀。
 *
 * @param {object} battle
 * @param {{ includeActions?: boolean }} [opts] includeActions=false 用在戰鬥已結束時，
 *   不需要再產生一份選單。
 */
export function toPublicBattle(battle, { includeActions = true } = {}) {
  const actions = includeActions && battle.active ? getAvailableCombatActions({ battle }) : [];
  const range = primaryRange(battle);

  return {
    battleId: battle.battleId,
    engine: battle.engine,
    active: battle.active,
    round: battle.round,
    phase: battle.phase,
    stateVersion: battle.stateVersion,
    scene: {
      id: battle.scene.id,
      label: battle.scene.label,
      description: battle.scene.description,
      terrain: battle.scene.terrain,
      lightsOut: Boolean(battle.scene.lightsOut),
      features: (battle.scene.features ?? []).map((f) => ({
        id: f.id,
        label: f.label,
        description: f.description ?? "",
        tags: [...(f.tags ?? [])],
        validRanges: [...(f.validRanges ?? [])],
        state: f.state ?? "ready",
      })),
    },
    // 距離帶（規格第7.1節D區）。三段都送出去，前端只負責把 current 那一格高亮。
    distance: {
      current: range,
      currentLabel: range ? RANGE_LABELS[range] : null,
      band: COMBAT_RANGES.map((value) => ({
        value,
        label: RANGE_LABELS[value],
        description: RANGE_DESCRIPTIONS[value],
        current: value === range,
      })),
    },
    player: publicPlayer(battle),
    enemies: battle.participants.filter((p) => p.side === "enemy").map((enemy) => publicEnemy(battle, enemy)),
    order: [...battle.order],
    // 動作額度（規格第7.1節B區：只顯示三個基礎池，整輪/全回合顯示在行動卡上）。
    playerActionBudget: publicBudget(battle.budgets.player),
    actionTypes: ACTION_TYPE_LIST.map((type) => ({
      type,
      label: ACTION_TYPE_LABELS[type],
      costHint: ACTION_TYPE_COST_HINTS[type],
    })),
    availableActions: actions,
    actionsByType: groupActionsByType(actions),
    loadout: publicLoadout(battle.loadout),
    // 型態的成本來源。沒有這一格，玩家看不出「洞察眼按不下去」是因為查克拉空了。
    resources: publicResources(battle.character),
    publicLog: [...battle.publicLog],
    outcome: battle.outcome,
  };
}

/**
 * 給敘事層（LLM）的公開事件摘要（規格第9節）。
 *
 * 它只拿得到「已經裁定完的結果」——命中與否、公開的傷害嚴重度標籤、距離變化、
 * 誰倒下了。拿不到骰點、DC、精確 HP，所以就算 LLM 想改寫結果，它手上也沒有可以改的數字。
 */
export function buildNarrationContext(battle, resolution) {
  return {
    round: battle.round,
    scene: { id: battle.scene.id, label: battle.scene.label, terrain: battle.scene.terrain },
    distance: primaryRange(battle),
    playerActions: resolution.playerActions.map((action) => ({
      label: action.label,
      ok: action.ok,
      text: action.publicText,
      severityTag: action.severityTag ?? null,
    })),
    enemyActions: resolution.enemyActions.map((action) => ({
      enemyId: action.enemyId,
      kind: action.kind,
      hit: action.hit ?? null,
      severityTag: action.severityTag ?? null,
    })),
    outcome: battle.outcome,
    // 明確告訴敘事層它的職責邊界。這句話會進 prompt。
    constraints: "所有結果已由規則引擎裁定，敘事層只能描寫，不得更改命中、傷害、距離或勝敗。",
  };
}
