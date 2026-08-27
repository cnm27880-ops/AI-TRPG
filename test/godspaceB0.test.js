import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { createSession, ensureSessionShape } from "../content/storage/sessionStore.js";
import { getScenarioPack, getScenarioReference } from "../content/scenario/registry.js";
import { initScenarioProgress } from "../content/scenario/progress.js";
import { createReferenceState } from "../content/scenario/referenceAdapter.js";
import { buildGodspacePayload } from "../content/godspace/payload.js";
import {
  GODSPACE_API_VERSION,
  GODSPACE_SCHEMA_VERSION,
  createGodspaceProfile,
  normalizeGodspaceProfile,
  publicGodspaceProfile,
  validateGodspacePayload,
} from "../content/godspace/schema.js";
import {
  evaluateGodspaceAction,
  godspaceLifecycle,
} from "../content/godspace/lifecycleGate.js";

const pack = getScenarioPack("scenario.nostromo-01-v2");
const reference = getScenarioReference(pack);

function activeSession() {
  const session = createSession({
    id: "b0-test-session",
    character: emptyCharacter("B0 測試者"),
  });
  session.scenario = {
    packId: pack.id,
    progress: initScenarioProgress(pack),
    referenceState: createReferenceState(reference),
  };
  return session;
}

test("B0 godspace profile：新建與舊存檔 migration 都有固定 schema 與 server flags", () => {
  const created = createGodspaceProfile();
  assert.equal(created.schemaVersion, GODSPACE_SCHEMA_VERSION);
  assert.deepEqual(created.featureFlags, {
    phaseB: false,
    missionBoard: false,
    training: false,
    archive: false,
    cabinet: false,
  });

  const legacy = ensureSessionShape({ id: "legacy-b0", character: emptyCharacter("舊角色") });
  assert.deepEqual(legacy.godspace, created);

  const fixed = normalizeGodspaceProfile({
    schemaVersion: 99,
    firstArrivalAt: "not-empty",
    featureFlags: { archive: true, unknown: true, training: "yes" },
    internalFutureField: "preserved only on session merge",
  });
  assert.equal(fixed.schemaVersion, GODSPACE_SCHEMA_VERSION);
  assert.equal(fixed.featureFlags.archive, true);
  assert.equal(fixed.featureFlags.training, false);
  assert.equal("unknown" in fixed.featureFlags, false);
  assert.deepEqual(publicGodspaceProfile(fixed), {
    schemaVersion: GODSPACE_SCHEMA_VERSION,
    firstArrivalAt: "not-empty",
    lastSeenAt: null,
    featureFlags: {
      phaseB: false,
      missionBoard: false,
      training: false,
      archive: true,
      cabinet: false,
    },
  });
});

test("B0 payload：公開 contract 有版本與 profile，但不原樣暴露 godspace 內部欄位或 referenceState", () => {
  const session = activeSession();
  session.godspace.internalOnly = "must-not-be-public";
  const payload = buildGodspacePayload({ session, pack, reference, persistent: false });
  assert.equal(payload.apiVersion, GODSPACE_API_VERSION);
  assert.equal(payload.schemaVersion, GODSPACE_SCHEMA_VERSION);
  assert.deepEqual(payload.profile.featureFlags, createGodspaceProfile().featureFlags);
  assert.equal("internalOnly" in payload.profile, false);
  assert.equal("referenceState" in payload, false);
  assert.equal(JSON.stringify(payload).includes("must-not-be-public"), false);
  assert.equal(validateGodspacePayload(payload).valid, true);
  assert.equal(payload.guide.phase, "in_scenario");
  assert.equal(payload.guide.nextAction.id, "resume_scenario");
  assert.match(payload.guide.summary, /尚未完成結算/);
});

test("B0 gate：active 副本不能進主神空間，B0 未開放功能回傳固定 disabled code", () => {
  const session = activeSession();
  const lifecycle = godspaceLifecycle({ session, pack });
  assert.equal(lifecycle.status, "active");
  assert.equal(lifecycle.hubAvailable, false);

  const enter = evaluateGodspaceAction({ action: "enter", session, pack, lifecycle });
  assert.equal(enter.allowed, false);
  assert.equal(enter.code, "NOT_IN_GODSPACE");

  const archive = evaluateGodspaceAction({ action: "archive", session, pack, lifecycle });
  assert.equal(archive.allowed, false);
  assert.equal(archive.code, "FEATURE_DISABLED");
  assert.equal(archive.feature, "archive");

  const unknown = evaluateGodspaceAction({ action: "change_world_truth", session, pack, lifecycle });
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.code, "UNKNOWN_ACTION");
});

test("B0 gate：pending combat、combat、terminal unsettled 與 settled 各自停在正確邊界", () => {
  const session = activeSession();

  session.scenario.progress = {
    ...session.scenario.progress,
    pendingCombat: true,
  };
  assert.equal(godspaceLifecycle({ session, pack }).status, "combat_required");
  assert.equal(evaluateGodspaceAction({ action: "enter", session, pack }).allowed, false);

  session.scenario.progress = { ...session.scenario.progress, pendingCombat: false };
  session.combat = { active: true };
  assert.equal(godspaceLifecycle({ session, pack }).status, "combat");
  assert.equal(evaluateGodspaceAction({ action: "enter", session, pack }).allowed, false);

  session.combat = null;
  session.scenario.referenceState = {
    ...session.scenario.referenceState,
    endingId: "end_solo_survivor",
  };
  assert.equal(godspaceLifecycle({ session, pack }).status, "terminal_unsettled");
  assert.equal(evaluateGodspaceAction({ action: "enter", session, pack }).allowed, false);

  session.scenario.progress = {
    ...session.scenario.progress,
    settledAt: "2026-08-24T00:00:00.000Z",
    runSummary: { endingId: "end_solo_survivor" },
  };
  assert.equal(godspaceLifecycle({ session, pack }).status, "settled");
  assert.equal(evaluateGodspaceAction({ action: "enter", session, pack }).allowed, true);
  assert.equal(evaluateGodspaceAction({ action: "view_debrief", session, pack }).allowed, true);
});

test("B0 gate：死亡角色在主神空間只能走 revive，不能用 rest 或 start scenario 繞過", () => {
  const session = activeSession();
  session.scenario = null;
  session.character.derived.hp = {
    ...session.character.derived.hp,
    intact: 0,
    B: 0,
    L: 0,
    A: session.character.derived.hp.max,
  };
  const lifecycle = godspaceLifecycle({ session, pack: null });
  assert.equal(lifecycle.status, "no_scenario");
  assert.equal(evaluateGodspaceAction({ action: "rest", session, pack: null, lifecycle }).code, "REVIVAL_REQUIRED");
  assert.equal(evaluateGodspaceAction({ action: "start_scenario", session, pack: null, lifecycle }).code, "REVIVAL_REQUIRED");
  assert.equal(evaluateGodspaceAction({ action: "revive", session, pack: null, lifecycle }).allowed, true);
});
