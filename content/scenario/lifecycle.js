// 副本與主神空間的 server-owned lifecycle 判定。
// 不讀取前端狀態，不呼叫 LLM，也不修改 session。

import { getProgressSummary } from "./progress.js";
import { getDownState } from "../downState.js";

export const SCENARIO_LIFECYCLE = Object.freeze([
  "no_scenario",
  "active",
  "combat_required",
  "combat",
  "terminal_unsettled",
  "settled",
]);

/**
 * @param {{session?: object|null, pack?: object|null}} input
 * @returns {{status: string, location: string, canAct: boolean, canEnterGodspace: boolean, canViewDebrief: boolean, reason: string}}
 */
export function scenarioLifecycle({ session = null, pack = null } = {}) {
  if (!session?.scenario) {
    return {
      status: "no_scenario",
      location: "主神空間",
      canAct: true,
      canEnterGodspace: true,
      canViewDebrief: false,
      reason: "尚未進入任何副本",
    };
  }

  const progress = session.scenario.progress;
  const downState = getDownState(session.character);
  if (session.combat?.active) {
    return {
      status: "combat",
      location: "恐怖片中",
      canAct: !downState.dead,
      canEnterGodspace: false,
      canViewDebrief: false,
      reason: "戰鬥正在進行中，必須先完成戰鬥",
    };
  }
  if (progress?.pendingCombat) {
    return {
      status: "combat_required",
      location: "恐怖片中",
      canAct: false,
      canEnterGodspace: false,
      canViewDebrief: false,
      reason: "威脅已經接觸，必須先進入戰鬥",
    };
  }
  if (progress?.settledAt && progress?.runSummary) {
    return {
      status: "settled",
      location: "主神空間",
      canAct: false,
      canEnterGodspace: true,
      canViewDebrief: true,
      reason: "副本已完成封存與結算",
    };
  }

  const progressSummary = pack && progress ? getProgressSummary(pack, progress) : null;
  const terminal = Boolean(
    session.scenario.referenceState?.endingId ||
      session.scenario.referenceState?.flags?.includes("flag_hypersleep_entered") ||
      progress?.endingId
  );
  if (terminal || progressSummary?.scenarioComplete) {
    return {
      status: "terminal_unsettled",
      location: "恐怖片中",
      canAct: false,
      canEnterGodspace: false,
      canViewDebrief: false,
      reason: "副本已到達終局，但結算尚未封存",
    };
  }

  return {
    status: "active",
    location: "恐怖片中",
    canAct: !downState.dead && !downState.unconscious,
    canEnterGodspace: false,
    canViewDebrief: false,
    reason: downState.dead
      ? "角色已死亡，必須先處理復活或終局"
      : downState.unconscious
        ? "角色目前昏迷，不能自行返回主神空間"
        : "副本仍在進行中",
  };
}

export function isSettledScenario(session, pack = null) {
  return scenarioLifecycle({ session, pack }).status === "settled";
}
