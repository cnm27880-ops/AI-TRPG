// 把 *_gm_reference.json（authoring 來源）重新產生成同名 .js（Cloudflare runtime 載入的模組）。
//
// 為什麼需要它：JSON 是作者要編輯的那一份，.js 是 esbuild 相容的產物，兩份必須逐字一致
// （test/scenarioRegistry.test.js 與 test/jurassicParkV1.test.js 各釘住一個副本）。
// 在這支腳本之前沒有任何工具做這件事，所以每次改 JSON 都得手動同步 7000 多行的 .js——
// 那是「一定會有人忘記、而且忘記時測試才會告訴你」的那種工作。
//
// 用法：
//   node scripts/regen-reference-modules.mjs           # 重新產生全部
//   node scripts/regen-reference-modules.mjs --check   # 只檢查是否同步（CI 用，不寫檔）
//
// --check 在發現不同步時以離開碼 1 結束。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXAMPLES_DIR = fileURLToPath(new URL("../content/scenario/examples/", import.meta.url));
const checkOnly = process.argv.includes("--check");

function moduleSource(jsonBasename, data) {
  return `// Generated from ${jsonBasename} for Cloudflare esbuild compatibility.
// Keep the JSON sidecar as the authoring/source file; regenerate this module after source edits.
// 重新產生：node scripts/regen-reference-modules.mjs
export default ${JSON.stringify(data, null, 2)};
`;
}

const jsonFiles = fs
  .readdirSync(EXAMPLES_DIR)
  .filter((name) => name.endsWith("_gm_reference.json"))
  .sort();

let changed = 0;
for (const jsonName of jsonFiles) {
  const jsonPath = path.join(EXAMPLES_DIR, jsonName);
  const jsPath = jsonPath.replace(/\.json$/, ".js");
  // 先 parse 再 stringify：JSON 本身若有語法錯誤，這裡就會炸，不會產生半殘的模組。
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const next = moduleSource(jsonName, data);
  const current = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, "utf8") : null;

  if (current === next) {
    console.log(`[同步] ${path.basename(jsPath)}`);
    continue;
  }
  changed += 1;
  if (checkOnly) {
    console.error(`[不同步] ${path.basename(jsPath)} 與 ${jsonName} 不一致，請執行 node scripts/regen-reference-modules.mjs`);
    continue;
  }
  fs.writeFileSync(jsPath, next);
  console.log(`[已更新] ${path.basename(jsPath)}`);
}

if (checkOnly && changed > 0) {
  console.error(`\n${changed} 個 runtime 模組與 authoring JSON 不同步。`);
  process.exit(1);
}
console.log(`\n完成：檢查 ${jsonFiles.length} 個副本，${changed} 個需要更新。`);
