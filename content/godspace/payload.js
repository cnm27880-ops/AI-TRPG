// 主神空間 Phase A 的 server-owned response payload。
// 只讀取 session 與副本包；所有 action enabled 都在這裡計算，前端不自行猜。

import { getDownState, revivalQuote } from "../downState.js";
import { buildScenarioDebrief } from "./debrief.js";
import { getScenarioReference } from "../scenario/registry.js";
import { GODSPACE_API_VERSION, GODSPACE_SCHEMA_VERSION, publicGodspaceProfile } from "./schema.js";
import { evaluateGodspaceAction, godspaceLifecycle } from "./lifecycleGate.js";

function action(id, label, enabled, reason, extra = {}) {
  return { id, label, enabled: Boolean(enabled), reason, ...extra };
}

const GODSPACE_ACTION_META = Object.freeze([
  ["view_debrief", "view_debrief", "查看上一場結算"],
  ["rest", "rest", "完全恢復"],
  ["revive", "revive", "復活"],
  ["shop", "shop", "主神兌換"],
  ["start_scenario", "start_scenario", "開始輪迴"],
  ["resume_scenario", "resume_scenario", "繼續當前副本"],
  ["enter_godspace", "enter", "進入主神空間"],
]);

export function buildGodspaceActions({ session, pack, lifecycle }) {
  return GODSPACE_ACTION_META.map(([id, gateAction, label]) => {
    const result = evaluateGodspaceAction({ session, pack, lifecycle, action: gateAction });
    const extra = result.quote ? { quote: result.quote } : {};
    return action(id, label, result.allowed, result.reason, extra);
  });
}

function actionSnapshot(actions, actionId) {
  const item = actions.find((candidate) => candidate.id === actionId);
  return item
    ? { id: item.id, label: item.label, enabled: item.enabled, reason: item.reason }
    : { id: actionId, label: actionId, enabled: false, reason: "這個操作目前沒有可用資料。" };
}

/**
 * C1 玩家導引：只把 server 已判定的生命週期與 action gate 翻譯成可理解的下一步。
 * 這不是另一套規則，也不會把 private state 或 reference truth 傳給前端。
 */
export function buildGodspaceGuide({ lifecycle, debrief, health, actions } = {}) {
  const status = lifecycle?.status ?? "no_scenario";
  const dead = Boolean(health?.downState?.dead);
  const action = (id) => actionSnapshot(actions ?? [], id);

  if (status === "settled") {
    const scenarioTitle = debrief?.scenario?.title ?? "上一場副本";
    const endingLabel = debrief?.scenario?.endingPresentation?.title ?? "已封存結局";
    const recoveryAction = dead ? action("revive") : action("rest");
    return {
      phase: "aftercare",
      title: "上一場副本已封存",
      summary: `${scenarioTitle} · ${endingLabel}。先看結算，再整理角色，最後決定是否開始下一場。`,
      nextAction: action("view_debrief"),
      steps: [
        { id: "review", number: 1, title: "查看上一場結果", description: "確認結局、評價、剩餘回合與這次行動留下的後果。", action: action("view_debrief") },
        { id: "recover", number: 2, title: dead ? "處理復活" : "整理角色狀態", description: dead ? "角色已死亡，先處理復活；不能用完全恢復取代復活。" : "查看傷勢、意志力、能量池與副本道具；需要時使用完全恢復。", action: recoveryAction },
        { id: "depart", number: 3, title: "準備下一場輪迴", description: "建立新的輪迴者檔案；目前沒有第二個副本時，系統會清楚標示可用內容。", action: action("start_scenario") },
      ],
    };
  }

  if (["active", "combat", "combat_required", "terminal_unsettled"].includes(status)) {
    return {
      phase: "in_scenario",
      title: "目前仍在副本中",
      summary: "這份檔案尚未完成結算。返回主神空間前，必須先完成目前的場景、戰鬥或終局處理。",
      nextAction: action("resume_scenario"),
      steps: [
        { id: "resume", number: 1, title: "回到目前副本", description: lifecycle?.reason ?? "接續保存的場景進度。", action: action("resume_scenario") },
        { id: "blocked", number: 2, title: "結算尚未開放", description: "角色狀態、獎勵與結局必須由副本引擎完成後才能整理。", action: { id: "view_debrief", label: "查看上一場結算", enabled: false, reason: "副本尚未結算。" } },
      ],
    };
  }

  return {
    phase: "ready",
    title: "還沒有已封存的副本",
    summary: "這裡是每場副本之間的安全區。先建立輪迴者檔案，完成建卡後才會收到第一場副本。",
    nextAction: action("start_scenario"),
    steps: [
      { id: "create", number: 1, title: "建立輪迴者檔案", description: "回答背景問題並選擇三項起始專長。", action: action("start_scenario") },
      { id: "play", number: 2, title: "進入第一場副本", description: "建卡完成後解除防護罩，從開場事件開始行動。", action: action("start_scenario") },
    ],
  };
}

function publicCharacter(character) {
  if (!character) return null;
  return {
    concept: { ...(character.concept ?? {}) },
    attributes: { ...(character.attributes ?? {}) },
    skills: { ...(character.skills ?? {}) },
    morality: { ...(character.morality ?? {}) },
    derived: {
      hp: { ...(character.derived?.hp ?? {}) },
      willpower: { ...(character.derived?.willpower ?? {}) },
      energyPools: Object.fromEntries(
        Object.entries(character.derived?.energyPools ?? {}).map(([id, pool]) => [id, {
          current: Number(pool.current) || 0,
          max: Number(pool.max) || 0,
        }])
      ),
    },
    xp: { ...(character.xp ?? {}) },
    reviveCount: Number(character.reviveCount) || 0,
    abilities: (character.abilities ?? []).map((ability) => ({
      goodId: ability.goodId ?? null,
      name: ability.name ?? null,
      category: ability.category ?? null,
      rank: ability.rank ?? null,
    })),
  };
}

/**
 * 組裝主神空間 read payload。`lifecycle` 可由呼叫端傳入，避免一次 request 重複做判定。
 */
export function buildGodspacePayload({ session, pack = null, reference = null, persistent = null, lifecycle = null } = {}) {
  const resolvedLifecycle = godspaceLifecycle({ session, pack, lifecycle });
  const downState = getDownState(session?.character);
  const profile = publicGodspaceProfile(session?.godspace);
  const resolvedReference = reference ?? getScenarioReference(pack);
  const debrief = buildScenarioDebrief({ pack, reference: resolvedReference, session });
  const revival = downState.dead ? revivalQuote(session.character) : null;
  const health = {
    ...(debrief?.aftercare ?? {
      hp: { ...(session?.character?.derived?.hp ?? {}) },
      willpower: { ...(session?.character?.derived?.willpower ?? {}) },
      energyPools: {},
      downState,
      revival,
    }),
  };
  const actions = buildGodspaceActions({ session, pack, lifecycle: resolvedLifecycle });

  return {
    ok: true,
    apiVersion: GODSPACE_API_VERSION,
    schemaVersion: GODSPACE_SCHEMA_VERSION,
    profile,
    ...(persistent == null ? {} : { persistent }),
    sessionId: session?.id ?? null,
    location: resolvedLifecycle.location,
    lifecycle: resolvedLifecycle,
    guide: buildGodspaceGuide({ lifecycle: resolvedLifecycle, debrief, health, actions }),
    sessionMeta: {
      updatedAt: session?.updatedAt ?? session?.createdAt ?? null,
      createdAt: session?.createdAt ?? null,
      turns: Number(session?.turns) || 0,
      eventCount: session?.log?.events?.length ?? 0,
      scenarioId: session?.scenario?.packId ?? null,
    },
    character: publicCharacter(session?.character),
    health,
    resources: debrief?.resources ?? {
      wallet: session?.wallet ?? null,
      referenceInventory: [],
      damagedItems: [],
      ownedAbilities: [],
      activeForms: [],
    },
    debrief,
    actions,
  };
}
