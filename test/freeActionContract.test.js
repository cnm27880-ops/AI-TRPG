import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUnmatchedFreeActionContract,
  buildFreeActionContractPrompt,
  buildFreeActionRewritePrompt,
  buildEngineSafeNarration,
} from "../content/scenario/freeActionContract.js";
import { validateNarrationAgainstContract } from "../content/scenario/narrationGuard.js";

test("bounded free action contract 第一版固定為 attempt_only 且沒有 authorizedChanges", () => {
  const contract = buildUnmatchedFreeActionContract({
    actionText: "我試著用未知方式影響船艦",
    narrativeMode: "major",
    outcome: { tier: "成功", success: true },
    scene: { title: "休眠室", location: "下層甲板" },
    threat: { level: 2, stage: { id: "追蹤" } },
    checkParams: { attribute: "感知", skill: "偵察", dc: 3 },
  });
  assert.equal(contract.mode, "unmatched_free_input");
  assert.equal(contract.authorizationScope, "attempt_only");
  assert.deepEqual(contract.authorizedChanges, []);
  assert.equal(contract.resolution.stateChangeAuthorized, false);
  const prompt = buildFreeActionContractPrompt(contract);
  assert.match(prompt, /Engine Free Action Contract v1/);
  assert.match(prompt, /authorizedChanges 是空陣列/);
  assert.match(prompt, /即使判定成功/);
  assert.match(buildFreeActionRewritePrompt(contract, [{ category: "door_state" }]), /Narration Safety Rewrite/);
});

test("narration guard 攔截高風險完成式，但放行保留不確定性的沉浸描寫", () => {
  const contract = buildUnmatchedFreeActionContract({ actionText: "我觀察艙門" });
  const unsafe = validateNarrationAgainstContract("門已鎖死，距離三公尺，異形就在門口。", contract);
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.severity, "high");
  assert.deepEqual(new Set(unsafe.violations.map((v) => v.category)), new Set(["door_state", "invented_numeric_fact", "threat_contact"]));

  const uncertain = validateNarrationAgainstContract("艙門似乎仍然卡住，尚未確認另一側是否有動靜。", contract);
  assert.equal(uncertain.ok, true, JSON.stringify(uncertain));
});

test("engine-safe narration 只使用 contract facts，不會帶入 unsafe 原文", () => {
  const contract = buildUnmatchedFreeActionContract({
    actionText: "我敲擊艙門",
    outcome: { tier: "驚險成功", success: true },
    threat: { level: 1, stage: { id: "潛伏" } },
  });
  const safe = buildEngineSafeNarration(contract);
  assert.match(safe, /敲擊艙門/);
  assert.match(safe, /驚險成功/);
  assert.match(safe, /沒有任何新的道路、物品、位置或傷勢變化被確認/);
  assert.doesNotMatch(safe, /鎖死|三公尺|異形就在/);
});
