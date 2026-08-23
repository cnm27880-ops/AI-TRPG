import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const SOURCE_ROOTS = ["content", "functions", "public", "test"];
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".tsx"]);
const FORBIDDEN_JSON_IMPORT_ATTRIBUTES = /(?:from\s+["'][^"']+\.json["']|\.json)\s+(?:with|assert)\s*\{/;

async function collectSourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
    } else if (SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      files.push(path);
    }
  }
  return files;
}

test("Cloudflare Functions source does not use unsupported JSON import attributes", async () => {
  const files = (await Promise.all(SOURCE_ROOTS.map((root) => collectSourceFiles(root)))).flat();
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (FORBIDDEN_JSON_IMPORT_ATTRIBUTES.test(source)) violations.push(file);
  }
  assert.deepEqual(violations, [], `不支援的 JSON import attributes 出現在：${violations.join(", ")}`);
});
