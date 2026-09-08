// 死旗標稽核 —— 「寫了但沒有任何地方讀」的世界旗標。
//
// 為什麼需要這支腳本（2026-09-07 排查結論）：
//
// 副本用 worldFlagsAdd 記錄失敗的後果（手電筒掉了、Ripley 拒絕了、引擎受損了），
// 但這些旗標如果沒有被任何 approach.required、場景離場條件、conditionalEffects
// 或結局規則讀到，它們就只是**被寫進存檔然後永遠沒人看**。
//
// 實測兩個內建副本：Alien 33 個失敗專屬旗標裡 22 個是死的，侏羅紀 40 個裡 29 個是死的。
// 這是「檢定失敗了就卡殼」的資料層成因——失敗只會關掉舊的路（靠 required.flagsAbsent），
// 從來不會開啟新的路（沒有任何 required.flags 讀失敗旗標）。
//
// 死旗標不會讓任何測試變紅，也不會讓遊戲壞掉，只會讓失敗變得沒有意義。
// 所以跟 lint-prompt-cache 一樣，寫成腳本讓它可被看見。
//
// 這支腳本**只報告、不修改**：要怎麼接是副本設計的決定（哪個失敗該開哪條路、
// 會不會讓某個結局變成不可達），不是引擎可以自動推導的。
//
// 用法：
//   node scripts/audit-dead-flags.mjs            # 全部副本
//   node scripts/audit-dead-flags.mjs --json     # 機器可讀
//
// 離開碼一律 0：死旗標是待辦事項，不是建置錯誤。

import { SCENARIO_REGISTRY, getScenarioReference } from "../content/scenario/registry.js";

const asJson = process.argv.includes("--json");

/** 場景底下所有 approach（含 phase 裡的）。 */
function allApproaches(scene) {
  return [...(scene.approaches ?? []), ...(scene.phases ?? []).flatMap((phase) => phase.approaches ?? [])];
}

/** 深走整個結構，收集所有「讀取」旗標的位置（required.flags/flagsAbsent、條件、結局規則…）。 */
function collectFlagReads(node, path, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectFlagReads(item, `${path}[${index}]`, out));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    // worldFlagsAdd / worldFlagsRemove 是「寫」，不是「讀」——它們正是我們要找的來源端。
    if (key === "worldFlagsAdd" || key === "worldFlagsRemove") continue;
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      if (/flag/i.test(key)) for (const flag of value) out.push({ flag, at: `${path}.${key}` });
      continue;
    }
    collectFlagReads(value, `${path}.${key}`, out);
  }
}

function auditReference(scenarioId, reference) {
  const writes = new Map(); // flag -> [{at, tier}]
  for (const scene of reference.scenes ?? []) {
    for (const approach of allApproaches(scene)) {
      for (const [tier, outcome] of Object.entries(approach.outcomes ?? {})) {
        const effectSets = [outcome.effects ?? {}, ...(outcome.conditionalEffects ?? []).map((c) => c.effects ?? {})];
        for (const effects of effectSets) {
          for (const flag of effects.worldFlagsAdd ?? []) {
            if (!writes.has(flag)) writes.set(flag, []);
            writes.get(flag).push({ at: `${scene.id}/${approach.id}`, tier });
          }
        }
      }
    }
  }

  const reads = [];
  collectFlagReads(reference, scenarioId, reads);
  const readFlags = new Set(reads.map((entry) => entry.flag));

  const rows = [];
  for (const [flag, sources] of writes) {
    const tiers = new Set(sources.map((s) => s.tier));
    const failureOnly = [...tiers].every((tier) => /失敗/.test(tier));
    if (readFlags.has(flag)) continue;
    rows.push({
      flag,
      failureOnly,
      writes: sources.length,
      sources: sources.slice(0, 3).map((s) => `${s.at}/${s.tier}`),
    });
  }
  // 失敗專屬的排前面：那些正是「失敗沒有後果」的直接證據。
  rows.sort((a, b) => (b.failureOnly - a.failureOnly) || a.flag.localeCompare(b.flag));

  // 順便報「有幾個旗標沒有人話說明」。沒說明的旗標仍會進 <World_State>，
  // 只是以原始 id 的形式送給模型——讀得懂，但不如一句描述精準。
  // 這一項刻意也只是報告：新增旗標時忘了寫說明不該讓建置變紅，
  // 但應該看得到，否則覆蓋率會隨著副本長大而慢慢流失。
  const undescribed = [...writes.keys()].filter((flag) => !(reference.flagMeanings ?? {})[flag]).sort();

  return { scenarioId, totalWritten: writes.size, dead: rows, undescribed };
}

const reports = [];
for (const scenarioId of Object.keys(SCENARIO_REGISTRY)) {
  const reference = getScenarioReference(scenarioId);
  if (!reference) continue;
  reports.push(auditReference(scenarioId, reference));
}

if (asJson) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const report of reports) {
    const failureOnly = report.dead.filter((row) => row.failureOnly);
    console.log(`\n=== ${report.scenarioId}`);
    console.log(`   寫入過的旗標：${report.totalWritten}；沒有任何地方讀：${report.dead.length}（其中只由失敗寫入：${failureOnly.length}）`);
    console.log(
      `   有人話說明的：${report.totalWritten - report.undescribed.length}/${report.totalWritten}` +
        (report.undescribed.length ? `；未描述：${report.undescribed.join("、")}` : "（全部都有）")
    );
    if (!report.dead.length) {
      console.log("   （沒有死旗標）");
      continue;
    }
    for (const row of report.dead) {
      console.log(`   ${row.failureOnly ? "[失敗專屬]" : "[一般]    "} ${row.flag.padEnd(32)} 寫入 ${row.writes} 次  例：${row.sources[0]}`);
    }
  }
  const totalDead = reports.reduce((sum, r) => sum + r.dead.length, 0);
  const totalFailureOnly = reports.reduce((sum, r) => sum + r.dead.filter((x) => x.failureOnly).length, 0);
  console.log(`\n合計 ${totalDead} 個死旗標，其中 ${totalFailureOnly} 個只由失敗寫入。`);
  console.log("接法：把它填進某個 approach 的 required.flags，讓這次失敗開啟一條原本沒有的路；");
  console.log("或填進場景的 exitConditions，讓失敗本身推進劇情。動資料前請先確認不會讓任何結局變成不可達。");
}
