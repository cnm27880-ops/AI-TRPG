// Combat V2 —— 純 server-side 的動態行動選單生成器（規格第6節）。
//
// 這是整個 V2 的核心約束點：前端**不判斷任何一顆按鈕能不能按**。它拿到的每一張行動卡
// 都已經帶著 available 與 unavailableReason，而 reason 是一句玩家看得懂的話
// （「需要近距離」「彈藥不足」），絕不是 DC、骰池、AI 權重（規格第6.2節）。
//
// 不可用的行動**照樣回傳**（規格第6.2節）：玩家要看得到「現在不能做什麼、為什麼」，
// 這是戰術資訊；把它們濾掉只會讓選單看起來莫名其妙地變來變去。

import {
  ACTION_CATEGORY_LABELS,
  TARGET_MODES,
  allActionDefinitions,
  resolveActionDefinition,
  resolutionPhaseIndex,
} from "./actionCatalog.js";
import { ACTION_TYPE_COST_HINTS, ACTION_TYPE_LABELS, costOf } from "./actionTypes.js";
import { canSpend, spendBlockReason } from "./actionBudget.js";
import { RANGE_LABELS, rangeBlockReason, stepRange } from "./range.js";
import { getRange, isDown, livingEnemies, playerOf } from "./battleState.js";
import { ammoOf, ownsWeaponOfCategory, usableWeaponsOfCategory } from "../../../content/combat/v2/loadout.js";
import { formAlreadyActive } from "../../../content/combat/v2/formActions.js";
import { formsOf } from "../../../content/shop/forms.js";

/**
 * 產生目前這個角色能看到的完整行動選單。
 *
 * @param {object} params
 * @param {object} params.battle 內部戰鬥狀態
 * @param {string} [params.actorId] 預設 "player"
 * @param {object} [params.budgetOverride] 已經選了一些行動時，用「扣掉那些之後」的額度
 *   來重算選單（規格第5.1節第8點：選擇改變後要重新取得最新 action state）。
 * @param {Array<{definitionId:string,targetId:string|null}>} [params.pending]
 *   玩家**已經選但還沒結算**的行動。因為結算順序是伺服器決定的（移動永遠先於攻擊，
 *   見 actionCatalog.js 的 RESOLUTION_PHASES），選了「接近」之後，這一輪的射擊
 *   實際上會在近距離發生。把 pending 帶進來，選單就會用**移動之後的距離**去判定，
 *   玩家不會選到一個顯示可用、結算時卻必定不合法的組合。
 * @returns {object[]} 每一條都是規格第6節的 action schema
 */
export function getAvailableCombatActions({
  battle,
  actorId = "player",
  budgetOverride = null,
  pending = [],
} = {}) {
  const actor = actorId === "player" ? playerOf(battle) : battle.participants.find((p) => p.id === actorId);
  if (!actor) return [];
  const budget = budgetOverride ?? battle.budgets[actor.id];
  const enemies = livingEnemies(battle);
  const loadout = battle.loadout;

  const projected = projectRanges(battle, pending);

  const actions = [];
  // 靜態目錄 ＋ 這場戰鬥動態長出來的條目（型態）。型態走完全同一條驗證路徑，
  // 沒有任何特例分支——那正是把它包成標準 action card 的目的。
  for (const definition of allActionDefinitions(battle)) {
    for (const bound of bindTargets(definition, battle, actor, enemies)) {
      actions.push(evaluate({ definition, bound, battle, actor, budget, loadout, projected }));
    }
  }

  // 顯示順序要有唯一答案，否則同一份狀態在兩次請求之間會長得不一樣。
  return actions.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.actionType.localeCompare(b.actionType) ||
      a.id.localeCompare(b.id)
  );
}

/**
 * 把一條目錄定義展開成「一個或多個具體可按的行動」。
 * 針對單一敵人的行動，每個活著的敵人一張卡；針對場景物件的行動，每個符合 tag 的物件一張卡。
 * 沒有任何合法對象時仍然回一張**不可用**的卡，並附上原因——選單不能無聲地少一格
 * （玩家會以為這個遊戲根本沒有這個行動）。
 */
function bindTargets(definition, battle, actor, enemies) {
  if (definition.targetMode === TARGET_MODES.SINGLE_ENEMY) {
    if (enemies.length === 0) {
      return [{ instanceId: definition.id, targetId: null, blocked: "沒有可攻擊的目標" }];
    }
    return enemies.map((enemy) => ({
      instanceId: enemies.length > 1 ? `${definition.id}@${enemy.id}` : definition.id,
      targetId: enemy.id,
      targetLabel: enemy.name,
    }));
  }

  if (definition.targetMode === TARGET_MODES.FEATURE) {
    const tag = definition.requirements.featureTag;
    const features = (battle.scene.features ?? []).filter((f) => (f.tags ?? []).includes(tag));
    if (features.length === 0) {
      return [{ instanceId: definition.id, targetId: null, blocked: "這個場景沒有可以這樣使用的物件" }];
    }
    return features.map((feature) => ({
      instanceId: features.length > 1 ? `${definition.id}@${feature.id}` : definition.id,
      targetId: feature.id,
      targetLabel: feature.label,
      feature,
    }));
  }

  if (definition.targetMode === TARGET_MODES.ALLY) {
    const allies = battle.participants.filter((p) => p.side === "player" && p.id !== actor.id && !isDown(p));
    if (allies.length === 0) {
      return [{ instanceId: definition.id, targetId: null, blocked: "目前無可掩護的隊友" }];
    }
    return allies.map((ally) => ({ instanceId: `${definition.id}@${ally.id}`, targetId: ally.id, targetLabel: ally.name }));
  }

  return [{ instanceId: definition.id, targetId: null }];
}

/**
 * 判定一張卡可不可用，並產生規格第6節的完整 schema。
 *
 * 檢查順序刻意固定：目標 -> 距離 -> 裝備/資源 -> 動作額度。理由是「哪一個原因先講」
 * 對玩家是有意義的——距離不對的時候告訴他「標準動作已使用」沒有幫助。
 */
function evaluate({ definition, bound, battle, actor, budget, loadout, projected }) {
  const reasons = [];

  if (bound.blocked) reasons.push(bound.blocked);

  // --- 距離 ---
  // 行動自己的距離限制（validRanges）與場景物件的距離限制（feature.validRanges）
  // 是兩件事，兩個都要過。物件的限制寫在資料裡（見 encountersV2.js），不寫在程式碼裡。
  //
  // 用哪一份距離：移動相位的行動用**目前**的距離（它們自己就是最先結算的那一批），
  // 其餘用**移動之後**的距離。這一段就是「先接近再射擊」與「先射擊再接近」在同一輪
  // 只有前者成立的地方——順序是伺服器定的，選單必須誠實反映那個順序。
  const usesProjected = resolutionPhaseIndex(definition) > 0;
  const rangeSource = usesProjected ? projected : null;
  const currentRange = rangeOf(battle, actor, bound.targetId, rangeSource);

  if (currentRange) {
    const rangeReason = rangeBlockReason(definition.validRanges, currentRange);
    if (rangeReason) {
      reasons.push(
        usesProjected && projected.changed
          ? `${rangeReason}——本回合選擇的移動會讓你在${RANGE_LABELS[currentRange]}`
          : rangeReason
      );
    }
    if (bound.feature?.validRanges?.length) {
      const featureReason = rangeBlockReason(bound.feature.validRanges, currentRange);
      if (featureReason) reasons.push(`${bound.feature.label}：${featureReason}`);
    }
  }

  // --- 目標狀態 ---
  if (definition.targetMode === TARGET_MODES.SINGLE_ENEMY && bound.targetId) {
    const target = battle.participants.find((p) => p.id === bound.targetId);
    if (!target || isDown(target)) reasons.push("目標已經倒下");
    else if (!target.visible) reasons.push("目標不在視線內");
  }

  // --- 裝備、資源與場景物件狀態 ---
  reasons.push(...requirementReasons(definition, bound, loadout));
  reasons.push(...formReasons(definition, battle, battle.character ?? null));

  // --- 動作額度（最後才問，理由見上面）---
  if (!canSpend(budget, definition.actionType)) {
    reasons.push(spendBlockReason(budget, definition.actionType));
  }

  const available = reasons.length === 0;
  return {
    id: bound.instanceId,
    definitionId: definition.id,
    label: bound.targetLabel && definition.targetMode === TARGET_MODES.SINGLE_ENEMY
      ? `${definition.label}：${bound.targetLabel}`
      : bound.targetLabel && definition.targetMode === TARGET_MODES.FEATURE
        ? `${definition.label}（${bound.targetLabel}）`
        : definition.label,
    category: definition.category,
    categoryLabel: ACTION_CATEGORY_LABELS[definition.category],
    actionType: definition.actionType,
    actionTypeLabel: ACTION_TYPE_LABELS[definition.actionType],
    // cost 一律由 actionTypes.costOf() 導出。**前端送回來的 cost 永遠不會被讀**
    // （規格第11.4節第1點的測試對象）。
    cost: costOf(definition.actionType),
    costHint: ACTION_TYPE_COST_HINTS[definition.actionType],
    // 顯示用的距離限制：行動自己沒有限制、但目標物件有的時候（尋找掩體、關閉艙門），
    // 要印物件的那一份。印「不限距離」而實際上構不到，等於在騙玩家。
    validRanges: definition.validRanges.length
      ? [...definition.validRanges]
      : [...(bound.feature?.validRanges ?? [])],
    currentRange,
    targetMode: definition.targetMode,
    targetId: bound.targetId,
    targetLabel: bound.targetLabel ?? null,
    requirements: publicRequirements(definition.requirements),
    display: { ...definition.display },
    available,
    // 只講第一個原因。一次列四條「而且距離也不對、而且沒有子彈」不會讓玩家更清楚，
    // 完整清單留在 unavailableReasons 給需要的人（例如測試）。
    unavailableReason: available ? null : reasons[0],
    unavailableReasons: available ? [] : reasons,
    resolutionKey: definition.resolutionKey,
  };
}

function primaryRangeOf(battle, actor, projected) {
  const enemies = livingEnemies(battle);
  if (enemies.length === 0) return null;
  return rangeOf(battle, actor, enemies[0].id, projected);
}

/**
 * 某個目標的距離。有 projected 就用推算後的，沒有就用目前的。
 *
 * targetId 可能是**場景物件**（環境行動的目標是控制面板、艙門這種東西），
 * 而距離表只記參戰者之間的距離。那種情況要退回「玩家目前所在的那一段距離」——
 * 沒有這個退路的話，所有環境行動的 currentRange 都會是 null，
 * 距離檢查整段被跳過，控制面板在遠距離也按得到。
 */
function rangeOf(battle, actor, targetId, projected) {
  if (!targetId) return primaryRangeOf(battle, actor, projected);
  if (projected?.ranges?.[targetId]) return projected.ranges[targetId];
  return getRange(battle, actor.id, targetId) ?? primaryRangeOf(battle, actor, projected);
}

/**
 * 依已選但未結算的行動，推算這一輪結算移動之後的距離。
 *
 * 這裡只讀目錄上宣告的 rangeEffect，**不執行任何結算函式**——推算不擲骰、不改狀態，
 * 所以它可以在玩家每按一顆按鈕時安全地重跑一次。
 *
 * @returns {{ ranges: Record<string,string>, changed: boolean }}
 */
export function projectRanges(battle, pending = []) {
  const ranges = {};
  let changed = false;
  const enemies = livingEnemies(battle);

  for (const selection of pending) {
    const definition = resolveActionDefinition(battle, selection.definitionId);
    const effect = definition?.rangeEffect;
    if (!effect) continue;

    const targets = effect.allTargets
      ? enemies.map((enemy) => enemy.id)
      : [selection.targetId].filter(Boolean);

    for (const targetId of targets) {
      const from = ranges[targetId] ?? getRange(battle, "player", targetId);
      if (!from) continue;
      const to = effect.set ?? stepRange(from, effect.direction, effect.steps ?? 1);
      if (to !== from) changed = true;
      ranges[targetId] = to;
    }
  }

  return { ranges, changed };
}

/**
 * 把宣告式的 requirements 翻成公開原因。**每一條都要有人話**，
 * 這裡沒有 default case 回「條件不符」——那種訊息等於沒說。
 */
function requirementReasons(definition, bound, loadout) {
  const reasons = [];
  const req = definition.requirements ?? {};

  if (req.weaponCategory) {
    const usable = usableWeaponsOfCategory(loadout, req.weaponCategory);
    if (usable.length === 0) {
      const owns = ownsWeaponOfCategory(loadout, req.weaponCategory);
      // 「沒有槍」跟「有槍但沒子彈」是玩家要做出的兩種完全不同的決定，不能講成同一句。
      reasons.push(
        owns
          ? "彈藥不足，需要先換彈"
          : req.weaponCategory === "firearm"
            ? "需要一把可用槍械"
            : "需要一件可用的近戰武器"
      );
    } else if (req.ammunition) {
      const enough = usable.some((w) => (ammoOf(loadout, w.key)?.loaded ?? 0) >= req.ammunition);
      if (!enough) reasons.push(`彈藥不足（這個行動需要 ${req.ammunition} 發）`);
    }
  }

  if (req.spareMagazine) {
    const hasSpare = loadout.weapons.some(
      (w) => (ammoOf(loadout, w.key)?.spareMagazines ?? 0) >= req.spareMagazine
    );
    if (!hasSpare) reasons.push("沒有備用彈匣了");
    else {
      const needsReload = loadout.weapons.some((w) => {
        const ammo = ammoOf(loadout, w.key);
        return ammo && ammo.loaded < ammo.magazine && ammo.spareMagazines > 0;
      });
      if (!needsReload) reasons.push("目前的彈匣是滿的");
    }
  }

  if (req.item) {
    const count = loadout.items?.[req.item] ?? 0;
    if (count <= 0) reasons.push(`身上沒有${itemLabel(req.item)}了`);
  }

  if (req.featureState && bound.feature && bound.feature.state !== req.featureState) {
    reasons.push(`${bound.feature.label}已經被使用過了`);
  }

  return reasons;
}

/**
 * 型態專屬的檢查。分開寫是因為它要讀 battle.forms 與角色卡，而上面那些只要讀裝備表。
 *
 * 這裡**只查玩家能自己看出來的前提**（已在進行中、意志力／能量池夠不夠、動作等級翻不翻得出來）。
 * 真正權威的判定仍然在 content/shop/forms.js 的 activateForm()——它會把所有理由一次列齊。
 * 兩邊重複判斷是刻意的：選單要在按下去之前就講清楚，結算要在按下去之後再查一次。
 */
function formReasons(definition, battle, character) {
  const req = definition.requirements ?? {};
  if (!req.form) return [];
  const reasons = [];

  if (req.unsupportedActionLevel) {
    reasons.push(`這個型態的啟動動作「${req.unsupportedActionLevel}」還沒有對應到五類動作`);
    return reasons;
  }
  if (formAlreadyActive(battle.forms, req.form)) {
    reasons.push(`「${definition.form.label}」已經在進行中`);
  }

  const activation = formActivationOf(character, req.form);
  if (activation) {
    const wp = activation.willpower ?? 0;
    if (wp > 0 && (character?.derived?.willpower?.current ?? 0) < wp) {
      reasons.push(`意志力不足（需要 ${wp} 點）`);
    }
    const pool = activation.pool;
    if (pool && (character?.derived?.energyPools?.[pool.name]?.current ?? 0) < pool.amount) {
      reasons.push(`${pool.name}不足（需要 ${pool.amount} 點）`);
    }
    const variable = req.variablePayment;
    if (variable && (character?.derived?.energyPools?.[variable.poolName]?.current ?? 0) < variable.min) {
      reasons.push(`${variable.poolName}不足（至少要付 ${variable.min} 點）`);
    }
  }

  return reasons;
}

/** 查一個型態的啟動成本。查不到回 null（角色卡上沒有那件商品了）。 */
function formActivationOf(character, formId) {
  for (const form of formsOf(character ?? {})) {
    if (form.formId === formId) return form.effect.activation ?? {};
  }
  return null;
}

const ITEM_LABELS = Object.freeze({ medkit: "醫療包" });
function itemLabel(key) {
  return ITEM_LABELS[key] ?? key;
}

/**
 * requirements 的公開形狀。這裡是**白名單**：只有玩家本來就知道的條件會出去
 * （要什麼武器、要幾發子彈、要什麼物品）。之後若有人在 requirements 裡加了
 * 秘密欄位（隱藏 DC、AI 旗標），它不會因為忘記過濾就漏出去。
 */
function publicRequirements(requirements = {}) {
  const out = {};
  if (requirements.weaponCategory) out.weaponCategory = requirements.weaponCategory;
  if (requirements.ammunition) out.ammunition = requirements.ammunition;
  if (requirements.item) out.item = requirements.item;
  if (requirements.featureTag) out.featureTag = requirements.featureTag;
  if (requirements.ally) out.ally = true;
  if (requirements.spareMagazine) out.spareMagazine = requirements.spareMagazine;
  // 型態：玩家本來就知道自己買了什麼、要付幾點，這兩項可以公開。
  if (requirements.form) out.form = requirements.form;
  if (requirements.variablePayment) out.variablePayment = { ...requirements.variablePayment };
  return out;
}

/**
 * 依動作類型把選單分組（規格第7.1節E區：不要一串無差別按鈕）。
 * 分組本身也在伺服器算，前端只是照著畫。
 */
export function groupActionsByType(actions) {
  const groups = {};
  for (const action of actions) {
    (groups[action.actionType] ??= []).push(action);
  }
  return groups;
}

/** 查一張已產生的行動卡（結算時用它比對前端送上來的 actionId）。 */
export function findGeneratedAction(actions, actionId) {
  return actions.find((action) => action.id === actionId) ?? null;
}
