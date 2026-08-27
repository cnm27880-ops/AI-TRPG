import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { onRequestPost as createSession } from "../functions/api/session.js";
import { onRequestGet as getGodspace, onRequestPost as enterGodspace } from "../functions/api/godspace.js";
import { resolveSessionStore } from "../content/storage/sessionStore.js";
import { getScenarioPack, getScenarioReference } from "../content/scenario/registry.js";
import { createReferenceState, deriveEndingId } from "../content/scenario/referenceAdapter.js";
import { settleScenario } from "../content/scenario/settlement.js";

const PACK_ID = "scenario.nostromo-01-v2";
const ENDINGS = [
  {
    id: "end_solo_survivor",
    label: "孤獨生還者",
    state: (reference) => ({
      ...createReferenceState(reference),
      flags: ["flag_xenomorph_killed", "flag_hypersleep_entered"],
      currentLocation: "loc_narcissus",
    }),
  },
  {
    id: "end_heroic_rescue",
    label: "帶著證人離開",
    state: (reference) => ({
      ...createReferenceState(reference),
      flags: ["flag_xenomorph_killed", "flag_hypersleep_entered"],
      currentLocation: "loc_narcissus",
      npcStatuses: { ...createReferenceState(reference).npcStatuses, npc_luyuan: "survived" },
    }),
  },
  {
    id: "end_corporate_agent",
    label: "公司的新鑰匙",
    state: (reference) => ({
      ...createReferenceState(reference),
      flags: ["flag_xenomorph_killed", "flag_hypersleep_entered"],
      currentLocation: "loc_narcissus",
      sampleStatus: "preserved",
    }),
  },
  {
    id: "end_dark_infection",
    label: "沉睡的感染",
    state: (reference) => ({
      ...createReferenceState(reference),
      flags: ["flag_xenomorph_killed", "flag_hypersleep_entered"],
      currentLocation: "loc_narcissus",
      infectionStatus: "infected",
    }),
  },
  {
    id: "end_expire_ruins",
    label: "倒數中的殘骸",
    state: (reference) => ({
      ...createReferenceState(reference),
      flags: ["flag_expire_triggered"],
      currentLocation: "loc_deck_a",
    }),
  },
  {
    id: "end_death_alien_feast",
    label: "通風管裡的名字",
    state: (reference) => ({
      ...createReferenceState(reference),
      flags: ["flag_player_dead_combat"],
      currentLocation: "loc_lower_deck",
    }),
  },
  {
    id: "end_death_overload_vaporized",
    label: "高溫抹除",
    state: (reference) => ({
      ...createReferenceState(reference),
      flags: ["flag_player_dead_overload"],
      currentLocation: "loc_engineering",
    }),
  },
  {
    id: "end_death_vacuum_breach",
    label: "深空失壓",
    state: (reference) => ({
      ...createReferenceState(reference),
      flags: ["flag_player_dead_vacuum"],
      currentLocation: "loc_narcissus_airlock",
    }),
  },
];

function postRequest(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json(response) {
  return { status: response.status, body: await response.json() };
}

async function createSettledEnding(ending) {
  const env = {};
  const store = resolveSessionStore(env);
  const created = await createSession({
    request: postRequest("https://c0.test/api/session", {
      character: emptyCharacter(`C0 ${ending.id}`),
      scenarioId: PACK_ID,
    }),
    env,
  });
  const createdBody = await created.json();
  assert.equal(created.status, 200, JSON.stringify(createdBody));
  let session = await store.get(createdBody.session.id);
  const pack = getScenarioPack(PACK_ID);
  const reference = getScenarioReference(pack);
  const derivedEndingId = deriveEndingId(reference, ending.state(reference));
  assert.equal(
    derivedEndingId,
    ending.id,
    `${ending.id} 的 trigger 應由 canonical state 推導`
  );
  // 正式 final action 會把 engine 推導的 endingId 寫入 referenceState；
  // fixture 也要保留這個已封存的結果，才能驗證 settlement/debrief contract。
  const referenceState = { ...ending.state(reference), endingId: derivedEndingId };

  const progress = {
    ...session.scenario.progress,
    timeBudget: {
      ...session.scenario.progress.timeBudget,
      totalRounds: 50,
      spentRounds: 17,
    },
    nodes: {
      ...session.scenario.progress.nodes,
      n1: { ...(session.scenario.progress.nodes?.n1 ?? {}), completed: true, divergenceTier: 2 },
    },
  };
  const settlement = settleScenario(pack, progress, session.character, session.wallet, { referenceState });
  assert.equal(settlement.settled, true, `${ending.id} 第一次 settlement 應成功`);
  assert.equal(settlement.runSummary.endingId, ending.id);
  assert.ok(settlement.wallet.xp > 0, `${ending.id} 應取得 server 結算 XP`);
  assert.ok(settlement.speedBonusPoints >= 0, `${ending.id} 應產生速度點數欄位`);

  const replay = settleScenario(pack, settlement.progress, session.character, settlement.wallet, { referenceState });
  assert.equal(replay.settled, false, `${ending.id} 第二次 settlement 必須是 idempotent`);
  assert.deepEqual(replay.wallet, settlement.wallet, `${ending.id} replay 不得重複入帳`);

  session = {
    ...session,
    wallet: settlement.wallet,
    scenario: {
      ...session.scenario,
      referenceState,
      progress: settlement.progress,
    },
  };
  await store.put(session);
  return { env, store, session, pack, reference };
}

for (const ending of ENDINGS) {
  test(`C0 結局矩陣：${ending.id}（${ending.label}）`, async () => {
    const { session, reference } = await createSettledEnding(ending);
    const result = await json(await getGodspace({
      request: new Request(`https://c0.test/api/godspace?sessionId=${session.id}`),
      env: {},
    }));

    assert.equal(result.status, 200, `${ending.id} GET godspace 應成功`);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.lifecycle.status, "settled");
    assert.equal(result.body.debrief.status, "settled");
    assert.equal(result.body.debrief.scenario.endingId, ending.id);
    assert.equal(result.body.debrief.runSummary.endingId, ending.id);

    const authored = reference.endings.find((item) => item.id === ending.id);
    assert.ok(authored?.narrativeSource?.text, `${ending.id} 必須有 canonical ending text`);
    assert.equal(result.body.debrief.scenario.endingPresentation.source, "canonical_gemini_narrative");
    assert.equal(result.body.debrief.scenario.endingPresentation.copy, authored.narrativeSource.text);

    assert.ok(result.body.debrief.evaluation);
    assert.ok(result.body.debrief.tempo);
    assert.ok(result.body.debrief.aftercare);
    assert.ok(result.body.debrief.resources);
    const publicText = JSON.stringify(result.body);
    for (const secretKey of ["referenceState", "gmTruth", "privateGoals", "stThought"]) {
      assert.equal(publicText.includes(secretKey), false, `${ending.id} public debrief 不得洩漏 ${secretKey}`);
    }

    const entered = await json(await enterGodspace({
      request: postRequest("https://c0.test/api/godspace/enter", { sessionId: session.id, source: "settlement" }),
      env: {},
    }));
    assert.equal(entered.status, 200, `${ending.id} 應可合法返回安全區`);
    assert.equal(entered.body.lifecycle.status, "settled");
    assert.equal(entered.body.debrief.scenario.endingId, ending.id);
  });
}

test("C0 結局矩陣總數：8 個 canonical ending 均有明確測試案例", () => {
  assert.equal(ENDINGS.length, 8);
  assert.deepEqual(
    ENDINGS.map((ending) => ending.id),
    [
      "end_solo_survivor",
      "end_heroic_rescue",
      "end_corporate_agent",
      "end_dark_infection",
      "end_expire_ruins",
      "end_death_alien_feast",
      "end_death_overload_vaporized",
      "end_death_vacuum_breach",
    ]
  );
});
