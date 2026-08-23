// 主神空間 Phase B0 的 server-owned lifecycle gate。
// Gate 只判定目前 session 是否允許某個固定 action；不接受前端狀態、不呼叫 LLM、不修改 session。

import { getDownState, revivalQuote } from "../downState.js";
import { scenarioLifecycle } from "../scenario/lifecycle.js";
import { normalizeGodspaceProfile } from "./schema.js";

export const GODSPACE_ACTIONS = Object.freeze([
  "enter",
  "view_debrief",
  "rest",
  "revive",
  "shop",
  "start_scenario",
  "resume_scenario",
  "archive",
  "mission_board",
  "training",
  "cabinet",
]);

const HUB_STATUSES = new Set(["no_scenario", "settled"]);
const FEATURE_FOR_ACTION = Object.freeze({
  archive: "archive",
  mission_board: "missionBoard",
  training: "training",
  cabinet: "cabinet",
});

function decision(action, allowed, code, reason, extra = {}) {
  return {
    action,
    allowed: Boolean(allowed),
    code: allowed ? null : code,
    reason,
    ...extra,
  };
}

function lifecycleFor({ session = null, pack = null, lifecycle = null } = {}) {
  return lifecycle ?? scenarioLifecycle({ session, pack });
}

/**
 * 將既有 scenarioLifecycle 擴充成 B0 hub 可用的 server-owned view。
 * 保留原欄位，新增欄位只描述 gate，不另造一份 scenario 真相。
 */
export function godspaceLifecycle({ session = null, pack = null, lifecycle = null } = {}) {
  const resolved = lifecycleFor({ session, pack, lifecycle });
  const downState = getDownState(session?.character);
  const hubAvailable = HUB_STATUSES.has(resolved.status);
  return {
    ...resolved,
    hubAvailable,
    canStartScenario: hubAvailable && !downState.dead,
    canResumeScenario: resolved.status === "active" && resolved.canAct,
    downState: {
      dead: Boolean(downState.dead),
      unconscious: Boolean(downState.unconscious),
      canAct: Boolean(downState.canAct),
    },
  };
}

/**
 * 判定一個固定主神空間 action 是否可以執行。
 * `profile` 只影響 B0 feature flag action；生命週期、死亡與復活費用仍由 server session 重算。
 */
export function evaluateGodspaceAction({
  action,
  session = null,
  pack = null,
  lifecycle = null,
  profile = null,
} = {}) {
  const resolved = godspaceLifecycle({ session, pack, lifecycle });
  const downState = getDownState(session?.character);
  const normalizedProfile = normalizeGodspaceProfile(profile ?? session?.godspace);
  const featureKey = FEATURE_FOR_ACTION[action];

  if (!GODSPACE_ACTIONS.includes(action)) {
    return decision(action ?? null, false, "UNKNOWN_ACTION", "這個主神空間操作不存在。", {
      lifecycle: resolved,
    });
  }

  if (featureKey && !normalizedProfile.featureFlags[featureKey]) {
    return decision(action, false, "FEATURE_DISABLED", "這項主神空間功能目前尚未開放。", {
      feature: featureKey,
      lifecycle: resolved,
    });
  }

  switch (action) {
    case "enter":
      return resolved.canEnterGodspace
        ? decision(action, true, null, resolved.reason, { lifecycle: resolved })
        : decision(action, false, "NOT_IN_GODSPACE", resolved.reason, { lifecycle: resolved });
    case "view_debrief":
      return resolved.status === "settled"
        ? decision(action, true, null, "可以查看上一場已封存的副本結算。", { lifecycle: resolved })
        : decision(action, false, "DEBRIEF_UNAVAILABLE", "尚未有可查看的已封存副本結算。", { lifecycle: resolved });
    case "rest":
      if (!resolved.hubAvailable) {
        return decision(action, false, "NOT_IN_GODSPACE", "只有回到主神空間後才能完全恢復。", { lifecycle: resolved });
      }
      return downState.dead
        ? decision(action, false, "REVIVAL_REQUIRED", "角色已死亡，必須先走復活流程，不能用完全恢復取代復活。", { lifecycle: resolved })
        : decision(action, true, null, "主神空間允許非死亡角色完全恢復。", { lifecycle: resolved });
    case "revive": {
      const quote = downState.dead ? revivalQuote(session?.character) : null;
      if (!resolved.hubAvailable) {
        return decision(action, false, "NOT_IN_GODSPACE", "只有回到主神空間後才能復活。", { lifecycle: resolved, quote });
      }
      if (!downState.dead) {
        return decision(action, false, "NOT_DEAD", "角色尚未死亡，不需要復活。", { lifecycle: resolved, quote });
      }
      return quote?.affordable
        ? decision(action, true, null, "可以依照 server quote 執行復活。", { lifecycle: resolved, quote })
        : decision(action, false, "REVIVAL_UNAVAILABLE", "復活費用不足或復活次數已用完。", { lifecycle: resolved, quote });
    }
    case "shop":
      return resolved.hubAvailable && !downState.dead
        ? decision(action, true, null, "主神空間兌換已開放。", { lifecycle: resolved })
        : decision(
            action,
            false,
            downState.dead ? "REVIVAL_REQUIRED" : "NOT_IN_GODSPACE",
            downState.dead ? "死亡角色必須先處理復活。" : "副本尚未結算，不能使用主神空間兌換。",
            { lifecycle: resolved }
          );
    case "start_scenario":
      return resolved.hubAvailable && !downState.dead
        ? decision(action, true, null, "可以建立新的輪迴存檔。", { lifecycle: resolved })
        : decision(
            action,
            false,
            downState.dead ? "REVIVAL_REQUIRED" : "SCENARIO_IN_PROGRESS",
            downState.dead ? "死亡角色不能直接開始下一場輪迴。" : "目前仍有副本進行中。",
            { lifecycle: resolved }
          );
    case "resume_scenario":
      return resolved.canResumeScenario
        ? decision(action, true, null, "可以接續目前副本進度。", { lifecycle: resolved })
        : decision(action, false, "RESUME_UNAVAILABLE", resolved.reason, { lifecycle: resolved });
    case "archive":
    case "mission_board":
    case "training":
    case "cabinet":
      return decision(action, false, "FEATURE_DISABLED", "這項主神空間功能目前尚未開放。", {
        feature: featureKey,
        lifecycle: resolved,
      });
    default:
      return decision(action, false, "UNKNOWN_ACTION", "這個主神空間操作不存在。", { lifecycle: resolved });
  }
}

/**
 * API 使用的 gate helper。成功回傳 decision；失敗時仍保留結構化 code，
 * 呼叫端可自行決定 HTTP 409／422，而不需要解析自然語言。
 */
export function requireGodspaceAction(options = {}) {
  const result = evaluateGodspaceAction(options);
  return result.allowed ? result : { ...result, ok: false };
}
