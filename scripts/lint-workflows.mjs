#!/usr/bin/env node
/**
 * `.github/workflows/*.yml` 的靜態檢查（P2：CI 增加 workflow 靜態檢查）。
 *
 * 只做兩件事，刻意不重造 actionlint 那種完整驗證器：
 *   1. YAML 語法本身要能解析——CI設定壞掉最常見的成因就是縮排或引號打錯，
 *      而這種壞掉不會被「跑起來的CI」自己抓到：如果 ci.yml 本身壞了，GitHub
 *      Actions 根本不會觸發任何 job，所以需要一個獨立於「CI是否能跑」的檢查。
 *   2. 結構上該有的欄位有沒有漏——每個 job 至少要有 runs-on 與 steps，
 *      workflow 至少要有 on 與 jobs，這幾個漏了通常代表複製貼上時漏了一段。
 * 失敗時列出所有問題並以非零 exit code 結束。
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { load as loadYaml } from "js-yaml";

const WORKFLOWS_DIR = new URL("../.github/workflows/", import.meta.url);

async function findWorkflowFiles() {
  const dirPath = path.resolve(new URL(WORKFLOWS_DIR).pathname);
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => path.join(dirPath, entry.name));
}

function checkStructure(doc, fileName) {
  const problems = [];
  if (!doc || typeof doc !== "object") {
    problems.push("整個檔案沒有解析出一個物件");
    return problems;
  }
  // YAML 1.1 把裸的 `on:` 讀成布林鍵 `true`；js-yaml 預設用YAML 1.1相容模式，
  // 所以這裡兩種鍵名都要接受，不能只認字串 "on"。
  if (!("on" in doc) && !(true in doc) && !("true" in doc)) {
    problems.push('缺少 "on" 觸發條件');
  }
  if (!doc.jobs || typeof doc.jobs !== "object" || !Object.keys(doc.jobs).length) {
    problems.push('缺少 "jobs"，或 jobs 是空的');
    return problems;
  }
  for (const [jobId, job] of Object.entries(doc.jobs)) {
    if (!job || typeof job !== "object") {
      problems.push(`job "${jobId}" 不是一個物件`);
      continue;
    }
    if (!job["runs-on"]) problems.push(`job "${jobId}" 缺少 "runs-on"`);
    if (!Array.isArray(job.steps) || !job.steps.length) {
      problems.push(`job "${jobId}" 缺少 "steps"，或 steps 是空的`);
    }
  }
  return problems;
}

async function main() {
  const files = await findWorkflowFiles();
  if (!files.length) {
    console.log("沒有找到任何 .github/workflows/*.yml，跳過檢查。");
    return;
  }

  let hasProblem = false;
  for (const file of files) {
    const label = path.basename(file);
    const text = await readFile(file, "utf8");
    let doc;
    try {
      doc = loadYaml(text);
    } catch (error) {
      hasProblem = true;
      console.error(`[FAIL] ${label}：YAML 語法錯誤 —— ${error.message}`);
      continue;
    }
    const problems = checkStructure(doc, label);
    if (problems.length) {
      hasProblem = true;
      console.error(`[FAIL] ${label}：`);
      for (const problem of problems) console.error(`  - ${problem}`);
    } else {
      console.log(`[OK] ${label}`);
    }
  }

  if (hasProblem) {
    process.exitCode = 1;
  } else {
    console.log(`workflow 靜態檢查通過：共檢查 ${files.length} 個檔案。`);
  }
}

main().catch((error) => {
  console.error("workflow 靜態檢查執行時發生未預期錯誤：", error?.stack ?? error);
  process.exitCode = 1;
});
