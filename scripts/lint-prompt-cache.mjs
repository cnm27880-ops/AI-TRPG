#!/usr/bin/env node
/**
 * Prompt cache 三層契約的**結構鎖**。
 *
 * 這支檢查存在的理由，跟 test/promptCache.test.js 是同一個，但角度不同：
 * 那組測試驗的是「現在跑起來的行為對不對」，這支驗的是「原始碼的形狀有沒有被改壞」。
 * 兩者都需要，因為破壞這套分層的典型方式**不會讓任何測試變紅**——
 * 新功能想加一段提示，作者順手接在 prompt 字串後面，遊戲照跑、測試照過，
 * 只有帳單和 TTFT 悄悄變差。這種退化沒有人會在 code review 裡看出來。
 *
 * 所以規則寫在這裡，由 CI 執行，而不是寫在文件裡祈禱有人讀。
 * 文件版（給人與AI讀的完整說明）在 docs/PROMPT_CACHE_CONTRACT.md。
 *
 * 檢查的是**結構不變式**，不是風格：每一條都對應一種「會讓快取命中率崩掉、
 * 但功能完全正常」的具體改法。誤判時請改這支檢查，不要繞過它——
 * 繞過它的那次改動，就是下一次帳單暴增的原因。
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_DOC = "docs/PROMPT_CACHE_CONTRACT.md";

/** 唯一允許組裝 provider messages 陣列的檔案。 */
const MESSAGE_ASSEMBLY_OWNER = "content/llm/client.js";

/** 掃描範圍：正式程式碼。測試與腳本要能自由建構假訊息，所以不掃。 */
const SCAN_DIRS = ["content", "functions", "core"];

/**
 * 動態值的來源識別字。這些是「這一回合才算得出來」的東西，
 * 出現在靜態層就代表 system message 每回合都會變。
 */
const DYNAMIC_IDENTIFIERS = [
  "dmMemo",
  "recentEvents",
  "threatDirective",
  "retreadDirective",
  "nodeGuidance",
  "referenceBlock",
  "actionText",
  "outcome",
  "specialtyNarrationDirective",
  "freeActionContractPrompt",
  "narrativeMode",
  "historyMessages",
  "stalledRounds",
];

/** 這些動態來源必須**留在**動態層。少一個代表有人把它搬走或刪掉了。 */
const REQUIRED_IN_DYNAMIC = [
  "dmMemo",
  "recentEvents",
  "threatDirective",
  "retreadDirective",
  "nodeGuidance",
  "referenceBlock",
];

const problems = [];
function fail(file, rule, detail) {
  problems.push({ file, rule, detail });
}

async function listJsFiles(dir) {
  const abs = path.join(ROOT, dir);
  const out = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
    }
  }
  await walk(abs);
  return out;
}

/**
 * 取出一個具名陣列常數的字面內容，例如 `const staticBlocks = [ ... ];`。
 * 用括號配對而不是正則，因為裡面有巢狀的函式呼叫與物件。
 */
function extractArrayLiteral(source, declaration) {
  const start = source.indexOf(declaration);
  if (start === -1) return null;
  const open = source.indexOf("[", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

/** 去掉註解，避免「註解裡提到 dmMemo」被誤判成程式碼真的用了它。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function mentionsIdentifier(text, identifier) {
  return new RegExp(`\\b${identifier}\\b`).test(text);
}

// ---------------------------------------------------------------------------
// 規則 1：只有 client.js 可以組 provider 的 messages 陣列
// ---------------------------------------------------------------------------
//
// 專案裡如果有第二個地方會產生 `{ role: "system", ... }`，那就有第二套分層順序，
// 而第二套遲早會跟第一套不一樣。層次順序是這整件事的全部，不能有兩份。
async function ruleSingleMessageAssembler() {
  for (const dir of SCAN_DIRS) {
    for (const file of await listJsFiles(dir)) {
      const rel = path.relative(ROOT, file);
      if (rel === MESSAGE_ASSEMBLY_OWNER) continue;
      const code = stripComments(await readFile(file, "utf8"));
      if (/role\s*:\s*["'`]system["'`]/.test(code)) {
        fail(
          rel,
          "single-message-assembler",
          `只有 ${MESSAGE_ASSEMBLY_OWNER} 可以組 provider 的 messages 陣列。` +
            `要送靜態指令請走 callLlm() 的 systemInstruction 參數。`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 規則 2／3：turn.js 的靜態層與動態層各自該有什麼、不該有什麼
// ---------------------------------------------------------------------------
//
// 這是整套檢查的核心。新功能要加一段提示時，作者必須做一個明確的選擇：
// 它是每回合都變的嗎？是就進 dynamicBlocks，不是才進 staticBlocks。
// 這兩條規則讓「選錯邊」變成一個會讓 CI 變紅的錯誤，而不是一個沒人發現的成本。
async function rulePartition() {
  const rel = "functions/api/turn.js";
  const source = await readFile(path.join(ROOT, rel), "utf8");

  const staticLiteral = extractArrayLiteral(source, "const staticBlocks = ");
  if (staticLiteral === null) {
    fail(rel, "partition", "找不到 `const staticBlocks = [...]`——分層的靜態層不見了。");
  } else {
    const code = stripComments(staticLiteral);
    for (const id of DYNAMIC_IDENTIFIERS) {
      if (mentionsIdentifier(code, id)) {
        fail(
          rel,
          "static-layer-purity",
          `staticBlocks 裡出現了動態值 \`${id}\`。它每回合都會變，` +
            `混進 system message 會讓整段靜態前綴每回合失效。請改放 dynamicBlocks。`
        );
      }
    }
  }

  const dynamicStart = source.indexOf("const dynamicBlocks = ");
  const dynamicEnd = source.indexOf("return buildLayeredRequest(");
  if (dynamicStart === -1 || dynamicEnd === -1 || dynamicEnd < dynamicStart) {
    fail(rel, "partition", "找不到 dynamicBlocks 的組裝區塊——分層的動態層不見了。");
  } else {
    const dynamicRegion = stripComments(source.slice(dynamicStart, dynamicEnd));
    for (const id of REQUIRED_IN_DYNAMIC) {
      if (!mentionsIdentifier(dynamicRegion, id)) {
        fail(
          rel,
          "dynamic-layer-completeness",
          `動態層不再包含 \`${id}\`。它是每回合都變的值：` +
            `如果它被搬進靜態層，快取會失效；如果它被刪掉，敘事會少一份引擎事實。`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 規則 4：每個帶 systemInstruction 的 LLM 呼叫都要一起帶 history
// ---------------------------------------------------------------------------
//
// 漏掉 history 不會壞掉任何東西——模型只是失憶，而且失憶的方式看起來像「AI變笨」，
// 沒有人會聯想到快取。這條規則讓「新增一個 LLM 呼叫點時忘了接歷史層」當場現形。
async function ruleHistoryAlwaysPassed() {
  for (const file of await listJsFiles("functions")) {
    const rel = path.relative(ROOT, file);
    const source = await readFile(file, "utf8");
    // 逐個掃 `xxx({ ... })` 形狀的呼叫參數物件，只看有 systemInstruction 的那些。
    const callPattern = /(callLlm|callLlmWithFallback|invokeNarrativeLlm|callNarrativeLlm)\s*\(\s*\{/g;
    let match;
    while ((match = callPattern.exec(source)) !== null) {
      const open = source.indexOf("{", match.index);
      let depth = 0;
      let close = -1;
      for (let i = open; i < source.length; i += 1) {
        if (source[i] === "{") depth += 1;
        else if (source[i] === "}") {
          depth -= 1;
          if (depth === 0) {
            close = i;
            break;
          }
        }
      }
      if (close === -1) continue;
      const args = stripComments(source.slice(open, close + 1));
      if (!/\bsystemInstruction\b/.test(args)) continue;
      if (!/\bhistory\s*:/.test(args)) {
        const line = source.slice(0, match.index).split("\n").length;
        fail(
          `${rel}:${line}`,
          "history-layer-wired",
          `${match[1]}() 帶了 systemInstruction 卻沒有帶 history。` +
            `對話歷史要走 history 層（只在尾端追加），不可以壓成字串塞進 prompt。`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 規則 5：不可以退回「把歷史壓成一段字串」的舊寫法
// ---------------------------------------------------------------------------
//
// historyToPromptText() 仍然存在（相容用），但正式路徑一旦用回它，
// 歷史就變回一段每回合開頭都不同的字串，這整套分層就白做了。
async function ruleNoHistoryBlob() {
  for (const file of await listJsFiles("functions")) {
    const rel = path.relative(ROOT, file);
    const code = stripComments(await readFile(file, "utf8"));
    if (/\bhistoryToPromptText\b/.test(code)) {
      fail(
        rel,
        "no-history-blob",
        "functions/ 不可以使用 historyToPromptText()：它把歷史壓成一段字串，" +
          "窗口一滑動整段前綴就變。請改用 cacheLayers.js 的 historyToMessages()。"
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 規則 6：歷史窗必須維持遲滯（追加為主，偶爾才整段裁切）
// ---------------------------------------------------------------------------
async function ruleHysteresisWindow() {
  const rel = "content/storage/sessionStore.js";
  const source = await readFile(path.join(ROOT, rel), "utf8");
  if (!/export const HISTORY_MAX\s*=\s*(\d+)/.test(source)) {
    fail(
      rel,
      "hysteresis-window",
      "HISTORY_MAX 不見了。少了它，pushHistory() 會退回每回合 slice()，" +
        "歷史前綴就變成每回合都不一樣。"
    );
    return;
  }
  const max = Number(source.match(/export const HISTORY_MAX\s*=\s*(\d+)/)[1]);
  const limitMatch = source.match(/export const HISTORY_LIMIT\s*=\s*(\d+)/);
  const limit = limitMatch ? Number(limitMatch[1]) : NaN;
  if (!(max > limit)) {
    fail(
      rel,
      "hysteresis-window",
      `HISTORY_MAX(${max}) 必須大於 HISTORY_LIMIT(${limit})，遲滯窗才有作用。` +
        `兩者相等就等於每回合都裁一格。`
    );
  }
}

// ---------------------------------------------------------------------------
// 規則 7：契約文件與各家 AI 工具的指標檔都必須存在，而且真的指向契約
// ---------------------------------------------------------------------------
//
// 這一條看起來像在檢查文件，實際上檢查的是「規則有沒有出現在下一個協作者眼前」。
// 換一個 AI 工具協作時，它讀的是自己那個慣例檔——AGENTS.md、CLAUDE.md、
// .github/copilot-instructions.md、.cursor/rules/。任何一份被刪掉或不再指向契約，
// 那個工具就會在完全不知道有這套分層的情況下改程式，而它改壞的東西不會有測試抓得到。
//
// 內容刻意只維護一份（CONTRACT_DOC）：指標檔複製內容就會各自漂移，
// 然後沒有人知道哪一份才算數。所以這裡只要求「存在，而且指向那一份」。
async function ruleContractDocExists() {
  let doc;
  try {
    doc = await readFile(path.join(ROOT, CONTRACT_DOC), "utf8");
  } catch {
    fail(
      CONTRACT_DOC,
      "contract-doc",
      "契約文件不見了。AGENTS.md / CLAUDE.md / Copilot / Cursor 的指標檔全都指向它，" +
        "刪掉它等於把規則從所有協作者眼前拿走。"
    );
    return;
  }
  for (const layer of ["static", "history", "dynamic"]) {
    if (!doc.includes(layer)) {
      fail(CONTRACT_DOC, "contract-doc", `契約文件沒有描述 ${layer} 層，可能被截斷或改壞了。`);
    }
  }

  // 各家 AI 工具的慣例檔。少一份 = 那個工具的使用者拿不到規則。
  const pointers = [
    { file: "AGENTS.md", tool: "Codex / Cursor / Copilot coding agent / Jules / Aider 等" },
    { file: "CLAUDE.md", tool: "Claude Code" },
    { file: ".github/copilot-instructions.md", tool: "GitHub Copilot" },
    { file: ".cursor/rules/prompt-cache-contract.mdc", tool: "Cursor" },
  ];
  for (const { file, tool } of pointers) {
    let text;
    try {
      text = await readFile(path.join(ROOT, file), "utf8");
    } catch {
      fail(
        file,
        "agent-pointer",
        `${tool} 讀的指標檔不見了。沒有它，用那個工具的協作者不會知道有這套分層契約。`
      );
      continue;
    }
    if (!text.includes("PROMPT_CACHE_CONTRACT.md")) {
      fail(
        file,
        "agent-pointer",
        `這份指標檔沒有指向 ${CONTRACT_DOC}。指標檔只放指標、不複製內容——` +
          `複製出去的規則會漂移，然後沒有人知道哪一份才算數。`
      );
    }
  }
}

async function main() {
  await ruleSingleMessageAssembler();
  await rulePartition();
  await ruleHistoryAlwaysPassed();
  await ruleNoHistoryBlob();
  await ruleHysteresisWindow();
  await ruleContractDocExists();

  if (problems.length === 0) {
    console.log("prompt cache 分層契約檢查通過。");
    return;
  }

  console.error("\nprompt cache 分層契約被破壞了：\n");
  for (const { file, rule, detail } of problems) {
    console.error(`  [${rule}] ${file}`);
    console.error(`      ${detail}\n`);
  }
  console.error(`完整規則見 ${CONTRACT_DOC}。`);
  console.error(
    "這些檢查擋的是「功能正常、但每回合都重新計費」的改動——" +
      "請修正分層，不要停用這支檢查。\n"
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("prompt cache 分層檢查本身失敗了：", err);
  process.exitCode = 1;
});
