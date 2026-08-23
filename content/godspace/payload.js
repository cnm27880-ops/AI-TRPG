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

  return {
    ok: true,
    apiVersion: GODSPACE_API_VERSION,
    schemaVersion: GODSPACE_SCHEMA_VERSION,
    profile,
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
