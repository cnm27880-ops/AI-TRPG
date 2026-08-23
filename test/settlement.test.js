import test from "node:test";
import assert from "node:assert/strict";
import { emptyCharacter } from "../core/schema.js";
import { createWallet } from "../content/shop/wallet.js";
import { buildRunSummary, deriveEvaluation, deriveSpeedBonus, settleScenario } from "../content/scenario/settlement.js";

const PACK = {
  id: "scenario.test-speed",
  version: "1.2.3",
  speedReward: { pointsPerRemainingRound: 1, maxPoints: 50 },
  entries: [
    {
      nodes: [
        { id: "n1", title: "調查", isFinale: false },
        { id: "n4", title: "終局", isFinale: true },
      ],
    },
  ],
};

function progress(spentRounds = 12) {
  return {
    nodes: {
      n1: { completed: true, divergenceTier: 2 },
      n4: { completed: false, divergenceTier: null },
    },
    timeBudget: { totalRounds: 50, spentRounds, log: [] },
    threat: { level: 4, peak: 6, encounters: 1 },
  };
}

test("deriveSpeedBonus uses server timeBudget and caps the V2 speed policy", () => {
  const speed = deriveSpeedBonus(PACK, progress(12));
  assert.deepEqual(speed, {
    totalRounds: 50,
    spentRounds: 12,
    remainingRounds: 38,
    pointsPerRemainingRound: 1,
    maxPoints: 50,
    speedBonusPoints: 38,
  });
  assert.equal(deriveSpeedBonus(PACK, progress(0)).speedBonusPoints, 50);
});

test("settleScenario credits XP and speed points once and stores an immutable-shaped runSummary", () => {
  const wallet = createWallet();
  const character = emptyCharacter("結算測試者");
  const referenceState = {
    endingId: "end_solo_survivor",
    flags: ["flag_937_evidence_saved"],
    sampleStatus: "preserved",
    infectionStatus: "cleared",
    npcStatuses: { npc_luyuan: "survived" },
  };
  const first = settleScenario(PACK, progress(12), character, wallet, { referenceState });

  assert.equal(first.settled, true);
  assert.equal(first.speedBonusPoints, 38);
  assert.equal(first.wallet.points, 38);
  assert.equal(first.wallet.xp, first.xp);
  assert.equal(first.progress.runSummary.contractVersion, 1);
  assert.equal(first.progress.runSummary.scenarioVersion, "1.2.3");
  assert.equal(first.progress.runSummary.remainingRounds, 38);
  assert.equal(first.progress.runSummary.endingId, "end_solo_survivor");
  assert.deepEqual(first.progress.runSummary.objectiveIds, ["n1"]);
  assert.equal(first.progress.runSummary.objectiveTotal, 2);
  assert.equal(first.progress.runSummary.threat.peak, 6);
  assert.ok(first.progress.runSummary.qualityScore > 0);
  assert.equal(first.progress.runSummary.overallScore, first.progress.runSummary.qualityScore + 38);
  assert.equal(first.progress.runSummary.evaluation.grade, "C");
  assert.equal(first.progress.runSummary.evaluation.overallScore, first.progress.runSummary.overallScore);

  const second = settleScenario(PACK, first.progress, character, first.wallet, { referenceState });
  assert.equal(second.settled, false);
  assert.equal(second.wallet, first.wallet);
  assert.equal(second.progress, first.progress);
});

test("deriveEvaluation uses only fixed quality thresholds", () => {
  assert.equal(deriveEvaluation(0, 50).grade, "D");
  assert.equal(deriveEvaluation(55, 0).grade, "C");
  assert.equal(deriveEvaluation(145, 0).grade, "A");
  assert.equal(deriveEvaluation(190, 12).grade, "S");
  assert.equal(deriveEvaluation(190, 12).overallScore, 202);
});

test("buildRunSummary remains deterministic when no referenceState is available", () => {
  const summary = buildRunSummary(PACK, progress(50), emptyCharacter("無 reference"), { xp: 12 });
  assert.equal(summary.remainingRounds, 0);
  assert.equal(summary.speedBonusPoints, 0);
  assert.equal(summary.xp, 12);
  assert.deepEqual(summary.npcStatuses, {});
  assert.equal(summary.sampleStatus, null);
});
