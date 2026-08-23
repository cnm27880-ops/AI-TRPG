// 主神空間 Phase A 的 server-owned response payload。
// 只讀取 session 與副本包；所有 action enabled 都在這裡計算，前端不自行猜。

import { getDownState, revivalQuote } from "../downState.js";
import { scenarioLifecycle } from "../scenario/lifecycle.js";
import { buildScenarioDebrief } from "./debrief.js";

function action(id, label, enabled, reason, extra = {}) {
  return { id, label, enabled: Boolean(enabled), reason, ...extra };
}

export function buildGodspaceActions({ session, pack, lifecycle }) {
  const downState = getDownState(session?.character);
  const canUseHub = lifecycle.status === "no_scenario" || lifecycle.status === "settled";
  const revival = downState.dead ? revivalQuote(session.character) : null;

  return [
    action(
      "view_debrief",
      "查看上一場結算",
      lifecycle.status === "settled",
      lifecycle.status === "settled" ? "讀取已封存的 server 結算" : "尚未有可查看的副本結算"
    ),
    action(
      "rest",
      "完全恢復",
      canUseHub && !downState.dead,
      downState.dead
        ? "角色已死亡，必須先走復活流程"
        : canUseHub
          ? "主神空間可恢復生命、意志力與能量池"
          : "只有回到主神空間後才能完全恢復"
    ),
    action(
      "revive",
      "復活",
      canUseHub && Boolean(revival?.affordable),
      !downState.dead
        ? "角色尚未死亡"
        : revival?.affordable
          ? "可支付復活費用"
          : "復活費用不足或復活次數已用完",
      revival ? { quote: revival } : {}
    ),
    action(
      "shop",
      "主神兌換",
      canUseHub && !downState.dead,
      downState.dead
        ? "死亡角色必須先處理復活"
        : canUseHub
          ? "主神空間已開放兌換"
          : "副本尚未結算"
    ),
    action(
      "start_scenario",
      "開始輪迴",
      canUseHub && !downState.dead,
      downState.dead
        ? "死亡角色不能直接開始下一場輪迴"
        : canUseHub
          ? "可以建立新的輪迴存檔"
          : "目前仍有副本進行中"
    ),
    action(
      "resume_scenario",
      "繼續當前副本",
      lifecycle.status === "active" && lifecycle.canAct,
      lifecycle.status === "active" ? "只可接續目前進度，副本沒有回頭路" : lifecycle.reason
    ),
    action(
      "enter_godspace",
      "進入主神空間",
      lifecycle.canEnterGodspace,
      lifecycle.reason
    ),
  ];
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
export function buildGodspacePayload({ session, pack = null, persistent = null, lifecycle = null } = {}) {
  const resolvedLifecycle = lifecycle ?? scenarioLifecycle({ session, pack });
  const downState = getDownState(session?.character);
  const debrief = buildScenarioDebrief({ pack, session });
  const revival = downState.dead ? revivalQuote(session.character) : null;

  return {
    ok: true,
    apiVersion: "godspace.v1",
    ...(persistent == null ? {} : { persistent }),
    sessionId: session?.id ?? null,
    location: resolvedLifecycle.location,
    lifecycle: resolvedLifecycle,
    sessionMeta: {
      updatedAt: session?.updatedAt ?? session?.createdAt ?? null,
      createdAt: session?.createdAt ?? null,
      turns: Number(session?.turns) || 0,
      eventCount: session?.log?.events?.length ?? 0,
      scenarioId: session?.scenario?.packId ?? null,
    },
    character: publicCharacter(session?.character),
    health: {
      ...(debrief?.aftercare ?? {
        hp: { ...(session?.character?.derived?.hp ?? {}) },
        willpower: { ...(session?.character?.derived?.willpower ?? {}) },
        energyPools: {},
        downState,
        revival,
      }),
    },
    resources: debrief?.resources ?? {
      wallet: session?.wallet ?? null,
      referenceInventory: [],
      damagedItems: [],
      ownedAbilities: [],
      activeForms: [],
    },
    debrief,
    actions: buildGodspaceActions({ session, pack, lifecycle: resolvedLifecycle }),
  };
}
