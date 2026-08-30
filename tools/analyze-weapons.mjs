import fs from "node:fs";

function parseFirstJsonObject(text) {
  const start = text.indexOf("{");
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("找不到完整 JSON 物件");
}

const incoming = parseFirstJsonObject(fs.readFileSync("/home/ubuntu/upload/gemini-code-1788063568807.json", "utf8"));
const existing = JSON.parse(fs.readFileSync("content/packs/shop-starter-items.json", "utf8"));

const supportedEffectKinds = new Set(["屬性", "技能", "生命上限", "意志上限", "先攻", "防御", "護甲", "檢定加骰", "附加成功", "武器", "治療", "好感度", "敘事", "能量池", "型態"]);
const effects = new Map();
const existingNames = new Set(existing.entries.map((entry) => entry.name));
const weaponRows = incoming.entries.map((entry) => {
  for (const effect of entry.effects ?? []) effects.set(effect.kind, (effects.get(effect.kind) ?? 0) + 1);
  return {
    id: entry.goodId,
    name: entry.name,
    price: entry.price,
    size: entry.size,
    damage: entry.damage,
    damageType: entry.damageType,
    attackType: entry.attackType,
    penetration: entry.penetration ?? 0,
    exclusiveGroup: entry.exclusiveGroup,
    prerequisites: entry.prerequisites ?? null,
    traits: entry.traits ?? [],
    effects: (entry.effects ?? []).map((effect) => effect.kind),
    unsupportedEffects: (entry.effects ?? []).map((effect) => effect.kind).filter((kind) => !supportedEffectKinds.has(kind)),
    duplicateOfExisting: existingNames.has(entry.name),
  };
});

console.log(JSON.stringify({
  incomingPack: { packId: incoming.packId, status: incoming.status, count: incoming.entries.length },
  priceCounts: Object.fromEntries(Object.entries(Object.groupBy(incoming.entries, (entry) => entry.price)).map(([price, rows]) => [price, rows.length])),
  effectKinds: Object.fromEntries(effects),
  unsupportedEffectKinds: [...new Set(weaponRows.flatMap((row) => row.unsupportedEffects))],
  duplicateNames: weaponRows.filter((row) => row.duplicateOfExisting).map((row) => row.name),
  existingPack: { packId: existing.packId, status: existing.status, count: existing.entries.length, entries: existing.entries.map((entry) => ({ goodId: entry.goodId, name: entry.name, price: entry.price, category: entry.category, effects: (entry.effects ?? []).map((effect) => effect.kind) })) },
  weaponRows,
}, null, 2));
