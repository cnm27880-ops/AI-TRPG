import fs from "node:fs";

const json = JSON.parse(fs.readFileSync("content/packs/shop-starter-items.json", "utf8"));
const targetPath = "content/packs/shopStarterPacks.js";
const source = fs.readFileSync(targetPath, "utf8");
const marker = "export const SHOP_STARTER_PACKS = [";
const start = source.indexOf(marker);
if (start < 0) throw new Error("找不到 SHOP_STARTER_PACKS 匯出");
const firstObjectStart = source.indexOf("  {", start);
if (firstObjectStart < 0) throw new Error("找不到第一個商品包");
let depth = 0;
let inString = false;
let escaped = false;
let objectEnd = -1;
for (let i = firstObjectStart; i < source.length; i += 1) {
  const ch = source[i];
  if (inString) {
    if (escaped) escaped = false;
    else if (ch === "\\") escaped = true;
    else if (ch === '"') inString = false;
    continue;
  }
  if (ch === '"') { inString = true; continue; }
  if (ch === "{") depth += 1;
  else if (ch === "}") {
    depth -= 1;
    if (depth === 0) { objectEnd = i + 1; break; }
  }
}
if (objectEnd < 0) throw new Error("找不到第一個商品包結尾");
const replacement = JSON.stringify(json, null, 2).split("\n").map((line, index) => index === 0 ? `  ${line}` : `  ${line}`).join("\n");
const updated = source.slice(0, firstObjectStart) + replacement + source.slice(objectEnd);
fs.writeFileSync(targetPath, updated);
console.log(`已同步 ${json.entries.length} 件物品至 ${targetPath}`);
