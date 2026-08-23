// content/scenario/registry.js 的測試 —— 主要是鎖住「內建範例副本本身結構合法」這件事，
// 因為 registry.js 載入時就會跑 validateScenarioPack()，壞掉的話整個模組import就會throw，
// 會讓 functions/api/session.js、turn.js、combat/* 全部連帶掛掉，值得專門測。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import runtimeReference from "../content/scenario/examples/alienNostromo_v2_gm_reference.js";
import { SCENARIO_REGISTRY, DEFAULT_SCENARIO_ID, getScenarioPack, getScenarioReference, listScenarios } from "../content/scenario/registry.js";
import { validateScenarioPack } from "../content/scenario/schema.js";

test("內建範例副本本身要通過 validateScenarioPack", () => {
  const pack = getScenarioPack(DEFAULT_SCENARIO_ID);
  assert.ok(pack, "應該找得到預設副本");
  const check = validateScenarioPack(pack);
  assert.equal(check.valid, true, check.errors.join("；"));
});

test("內建範例副本結構符合這次的需求：初始場景 + 三個重大節點 + 最終戰", () => {
  const pack = getScenarioPack(DEFAULT_SCENARIO_ID);
  const chapter = pack.entries[0];
  assert.ok(chapter.openingScene, "章節要有開場場景敘述");

  const mainNodes = chapter.nodes.filter((n) => n.id !== chapter.onExpireNodeId);
  const finaleNodes = mainNodes.filter((n) => n.isFinale);
  assert.equal(finaleNodes.length, 1, "應該剛好有一個最終戰節點");
  assert.equal(mainNodes.length - finaleNodes.length, 3, "扣掉最終戰應該剛好是三個重大節點");
  assert.ok(finaleNodes[0].bossEncounter, "最終戰節點要帶敵人樣板");
});

test("新建流程預設使用 Alien V2，舊 V1 仍可顯式讀取", () => {
  assert.equal(DEFAULT_SCENARIO_ID, "scenario.nostromo-01-v2");
  assert.equal(getScenarioPack("scenario.nostromo-01-v2")?.id, "scenario.nostromo-01-v2");
  assert.equal(getScenarioPack("scenario.nostromo-01")?.id, "scenario.nostromo-01");
});

test("Alien V2 authoring JSON 與 Cloudflare runtime sidecar 保持同步", () => {
  const source = JSON.parse(fs.readFileSync(new URL("../content/scenario/examples/alienNostromo_v2_gm_reference.json", import.meta.url), "utf8"));
  assert.deepEqual(runtimeReference, source);
});

test("Alien V2 所有事件都是單向道，不允許回返旗標", () => {
  const reference = getScenarioReference("scenario.nostromo-01-v2");
  assert.ok(reference?.scenes?.length, "V2 應該載入 GM reference scenes");
  assert.ok(reference.scenes.every((scene) => scene.sceneExit?.canReturn === false));
});

test("getScenarioPack：查無此ID回傳null，不丟錯", () => {
  assert.equal(getScenarioPack("scenario.not-exist"), null);
});

test("listScenarios：回傳的摘要不含canonSummary(避免劇透節點內容)", () => {
  const list = listScenarios();
  assert.ok(list.length >= 1);
  for (const entry of list) {
    assert.equal(typeof entry.id, "string");
    assert.equal("canonSummary" in entry, false);
  }
});

test("SCENARIO_REGISTRY：每個註冊的包都能用自己的id查到自己", () => {
  for (const [id, pack] of Object.entries(SCENARIO_REGISTRY)) {
    assert.equal(pack.id, id);
  }
});
