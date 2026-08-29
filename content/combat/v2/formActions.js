// Combat V2 —— 把角色身上的「型態」變成行動目錄裡的條目（規格第6.1節的「特殊能力」分類）。
//
// 型態（變身／開眼／爆發）跟其他行動有一個結構上的差別：**它是每個角色不一樣的**。
// 靜態目錄（core/combat/v2/actionCatalog.js）只能放所有人共通的行動，所以型態的條目
// 在開戰當下由這裡從角色卡長出來，跟著戰鬥狀態一起存。
//
// 資料來源是 content/shop/forms.js 的 formsOf()，也就是商店買到的東西。它被包成一張
// 標準的 action card，跟射擊、移動走完全同一套驗證與結算路徑，沒有任何特例分支。
//
// [設計順序] 商品型錄目前是佔位資料，所以這裡的原則是**戰鬥系統是基準、商品往它對齊**：
// 舊的六個動作等級由 fromLegacyActionLevel() 翻成 V2 的五類（自由→迅捷，理由見該處註解），
// 翻不出來的型態會變成一張**不可用**的卡並寫明原因，而不是被安靜地濾掉——
// 買了東西卻在選單上完全找不到，是最難查的那種 bug。

import { formsOf, isFormActive, variablePaymentRange } from "../../shop/forms.js";
import { fromLegacyActionLevel, ACTION_TYPE_LABELS } from "../../../core/combat/v2/actionTypes.js";
import { ACTION_CATEGORIES, TARGET_MODES } from "../../../core/combat/v2/actionCatalog.js";

/** 型態行動的 id 前綴。用它就能一眼分辨「這張卡是動態長出來的」。 */
export const FORM_ACTION_PREFIX = "form:";

export function isFormActionId(actionId) {
  return typeof actionId === "string" && actionId.startsWith(FORM_ACTION_PREFIX);
}

/** 從 action id 取回 formId 與（二選一型態的）mode key。 */
export function parseFormActionId(actionId) {
  const rest = actionId.slice(FORM_ACTION_PREFIX.length);
  const at = rest.lastIndexOf("@");
  return at < 0 ? { formId: rest, mode: null } : { formId: rest.slice(0, at), mode: rest.slice(at + 1) };
}

/** 啟動成本的一句人話（意志力／能量池／可變量），給行動卡顯示用。 */
function costText(activation, range) {
  const parts = [];
  if (activation?.willpower) parts.push(`${activation.willpower} 點意志力`);
  if (activation?.pool) parts.push(`${activation.pool.amount} 點${activation.pool.name}`);
  if (range) parts.push(`${range.min}～${range.max} 點${range.poolName}（由你決定）`);
  return parts.join("＋") || "無額外成本";
}

/** 期限的一句人話。 */
function durationText(duration) {
  if (!duration) return "";
  if (duration.unit === "場景") return "持續一個場景";
  if (duration.untilUpkeepFails) return "持續到付不出維持成本為止";
  if (duration.roundsFromAttribute) return `持續${duration.roundsFromAttribute}值輪`;
  return `持續 ${duration.rounds ?? 1} 輪`;
}

/**
 * 產生這個角色所有型態的行動定義。形狀跟 actionCatalog.js 的靜態條目完全一致，
 * 所以 availableActions／resolveTurn／resolveAction 不需要為型態寫任何特例分支。
 *
 * 二選一的型態（書上的「由你自己選擇」）**一個選項一張卡**：選擇點就在按下去的那一瞬間，
 * 不需要多一層「先選模式再啟動」的狀態（跟舊 UI 的作法一致）。
 *
 * @param {object} character 角色卡
 * @returns {object[]} 行動定義（尚未判定可用性，那是 availableActions 的事）
 */
export function buildFormActionDefinitions(character) {
  const definitions = [];

  for (const form of formsOf(character)) {
    const { effect } = form;
    const actionType = fromLegacyActionLevel(effect.activation?.action);
    const range = variablePaymentRange(effect, character);
    const modes = effect.modes ?? [];

    const make = (mode) => {
      const id = mode ? `${FORM_ACTION_PREFIX}${form.formId}@${mode.key}` : `${FORM_ACTION_PREFIX}${form.formId}`;
      return {
        id,
        label: mode ? `${effect.label}·${mode.label}` : effect.label,
        category: ACTION_CATEGORIES.SPECIAL,
        // 翻不出動作等級時，actionType 先給 standard 讓卡片畫得出來，
        // 但 requirements.unsupportedActionLevel 會讓它一定是不可用的（見 availableActions）。
        actionType: actionType ?? "standard",
        validRanges: [],
        targetMode: TARGET_MODES.SELF,
        requirements: {
          form: form.formId,
          ...(actionType ? {} : { unsupportedActionLevel: effect.activation?.action ?? "(未寫)" }),
          ...(range ? { variablePayment: { min: range.min, max: range.max, poolName: range.poolName } } : {}),
        },
        display: {
          description: `${form.sourceName}：啟動「${effect.label}」${mode ? `（${mode.label}）` : ""}。`,
          hint: [costText(effect.activation, range), durationText(effect.duration)].filter(Boolean).join("，"),
          risk: effect.upkeep
            ? `每輪要再付一次維持成本（${costText(effect.upkeep, null)}＋${ACTION_TYPE_LABELS[fromLegacyActionLevel(effect.upkeep.action)] ?? "一個動作"}），付不出來當場結束。`
            : "啟動後無法提前取消。",
        },
        resolutionKey: "resolve_activate_form",
        // 型態是「先變身再出手」，所以排在攻擊之前、跟其他戰術行動同一相位。
        resolutionPhase: "tactical",
        // 型態專屬的附加資料。結算函式從這裡拿 formId 與 mode，不必再解析 action id。
        form: {
          formId: form.formId,
          label: effect.label,
          modeKey: mode?.key ?? null,
          hasVariablePayment: Boolean(range),
        },
      };
    };

    if (modes.length) definitions.push(...modes.map(make));
    else definitions.push(make(null));
  }

  return definitions;
}

/** 這個型態現在是不是已經在進行中（已在進行中的不能重複啟動，見 forms.js）。 */
export function formAlreadyActive(formsState, formId) {
  return isFormActive(formsState, formId);
}
