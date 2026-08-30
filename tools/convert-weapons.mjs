import fs from "node:fs";

function parseFirstJsonObject(text) {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("找不到第一個 JSON 物件");
}

const input = parseFirstJsonObject(fs.readFileSync("/home/ubuntu/upload/gemini-code-1788063568807.json", "utf8"));
const priceByName = {
  "特別定制的太陽傘": 700,
  "圓月扇刃": 700,
  "處女座": 700,
  "手杖劍": 700,
  "龍膽": 750,
  "惡德戰斧": 700,
  "戰闊劍": 800,
  "風切之刃": 650,
  "落陽": 650,
  "勇士巨劍": 900,
  "念珠": 350,
  "薙刀": 700,
  "阿爾法法杖": 450,
  "十字軍": 750,
  "名劍工布（偽）": 900,
  "桃木劍": 750,
  "執子": 600,
};
const skillMap = { 白刃: "格鬥", 掩飾: "交涉", 神秘: "秘識" };
const dropped = (trait, reason) => ({ trait, reason });

function convertEntry(entry) {
  const effects = [];
  const droppedTraits = [];
  const notes = [];
  let weaponEffectCount = 0;

  for (const raw of entry.effects ?? []) {
    if (raw.kind === "武器") {
      const weapon = {
        kind: "武器",
        label: raw.label ?? entry.name,
        attackType: raw.attackType ?? entry.attackType,
        weaponDamage: raw.weaponDamage ?? entry.damage,
        severity: raw.severity ?? entry.damageType ?? "B",
        ranged: raw.attackType === "槍械" || raw.attackType === "弓箭" || raw.ranged === true,
      };
      if (raw.weaponRange != null || entry.rangedDistance != null) {
        weapon.weaponRange = raw.weaponRange ?? entry.rangedDistance;
      }
      effects.push(weapon);
      weaponEffectCount += 1;
      if (raw.penetration) {
        weapon.weaponDamage += raw.penetration;
        notes.push(`原「破甲${raw.penetration}」轉為固定武器傷害 +${raw.penetration}；目前系統沒有獨立破甲層。`);
        droppedTraits.push(dropped(`破甲${raw.penetration}`, "破甲"));
      }
      continue;
    }
    if (raw.kind === "檢定加骰") {
      effects.push({
        kind: "檢定加骰",
        ...(raw.attribute ? { attribute: raw.attribute } : {}),
        ...(raw.skill ? { skill: skillMap[raw.skill] ?? raw.skill } : {}),
        amount: raw.amount,
        scope: raw.scope ?? "全部",
      });
      if (raw.condition) {
        notes.push(`原條件「${raw.condition}」無對應欄位，已轉為無條件固定加值。`);
        droppedTraits.push(dropped(`情境條件：${raw.condition}`, "情境條件"));
      }
      continue;
    }
    if (raw.kind === "檢定加成") {
      const skill = raw.skill ? skillMap[raw.skill] ?? raw.skill : "格鬥";
      effects.push({ kind: raw.type === "附加成功" ? "附加成功" : "檢定加骰", skill, amount: raw.amount, scope: "攻擊" });
      notes.push(`原「${raw.label ?? "檢定加成"}」已轉為${raw.type === "附加成功" ? "攻擊附加成功" : "攻擊檢定加骰"}。`);
      if (raw.condition) {
        notes.push(`原條件「${raw.condition}」無對應欄位，已轉為無條件固定加值。`);
        droppedTraits.push(dropped(`情境條件：${raw.condition}`, "情境條件"));
      }
      continue;
    }
    if (raw.kind === "先攻") {
      effects.push({ kind: "先攻", amount: raw.amount });
      continue;
    }
    if (raw.kind === "型態功能") {
      effects.push({ kind: "防御", amount: 2 });
      notes.push("原「撐開防禦態／格擋」已轉為持有期間固定防御 +2；型態切換、不能攻擊、陽光免疫與體積效果不納入戰鬥引擎。");
      droppedTraits.push(dropped("型態切換、格擋、免疫陽光、撐開後無法攻擊", "格擋"));
      droppedTraits.push(dropped("型態切換的啟動與結束條件", "動作經濟細節"));
      continue;
    }
    if (raw.kind === "特性") {
      effects.push({ kind: "防御", amount: 1 });
      notes.push("原「格擋」已轉為持有期間固定防御 +1。");
      droppedTraits.push(dropped(raw.label ?? "格擋", "格擋"));
      continue;
    }
    if (raw.kind === "防禦加值") {
      effects.push({ kind: "防御", amount: raw.amount });
      notes.push(`原條件式防禦加值已轉為無條件固定防御 +${raw.amount}。`);
      if (raw.condition) droppedTraits.push(dropped(`原防禦條件：${raw.condition}`, "情境條件"));
      continue;
    }
    if (raw.kind === "抗性") {
      effects.push({ kind: "檢定加骰", attribute: "意志", amount: 1, scope: "檢定" });
      notes.push("恐慌抗性已轉為意志檢定 +1；目前沒有獨立恐慌狀態與抗性軸。");
      droppedTraits.push(dropped(raw.label ?? "抗性", "豁免"));
      continue;
    }
    if (raw.kind === "隱蔽判定") {
      effects.push({ kind: "檢定加骰", skill: "交涉", amount: 1, scope: "檢定" });
      notes.push("社交檢定加骰已轉為交涉檢定 +1；安檢免疫保留為敘事資訊。");
      droppedTraits.push(dropped("常規安檢免疫", "情境條件"));
      continue;
    }
    if (raw.kind === "法術加成") continue;
    const reason = raw.kind === "重骰保底" ? "重擲" : raw.kind === "反噬懲罰" ? "情境條件" : raw.kind === "副型態武器" ? "目前沒有型態切換與副武器狀態的戰鬥接口，無法安全轉換" : raw.kind === "戰術動作" || raw.kind === "戰術修正" ? "進階戰鬥動作" : raw.kind === "複合加值" ? "情境條件" : raw.kind === "特攻轉化" || raw.kind === "陣營特攻" ? "傷害類型" : raw.kind === "屬性替換" ? "情境條件" : raw.kind === "契約功能" ? "隊友" : raw.kind === "法術加成" ? "法術攻擊結算端尚未接線，無法由現有系統讀取" : "情境條件";
    droppedTraits.push(dropped(raw.label ?? raw.kind, reason));
    notes.push(`原「${raw.label ?? raw.kind}」目前沒有可安全對應的戰鬥接口，明確標記為未實作。`);
  }

  // 法杖能力依已確認設計轉成敘事標記，避免在法術結算端尚未接線時假裝生效。
  if (entry.name === "阿爾法法杖") {
    droppedTraits.push(dropped("法術共鳴：法術威力值 +2", "法術攻擊結算端尚未接線，無法由現有系統讀取"));
    notes.push("已確認的法術共鳴設計先保留為未接線標記；待法術攻擊結算端接入後，改為正式法術威力值 +2 效果。");
  }

  const uniqueDropped = [];
  const seen = new Set();
  for (const item of droppedTraits) {
    const key = `${item.trait}|${item.reason}`;
    if (!seen.has(key)) { seen.add(key); uniqueDropped.push(item); }
  }
  const out = {
    name: entry.name,
    goodId: entry.goodId.replace(/^weapon\./, "item.weapon."),
    category: "物品",
    resourceType: "物品",
    rank: null,
    price: priceByName[entry.name],
    consumable: false,
    prerequisites: Object.fromEntries(Object.entries(entry.prerequisites ?? {}).map(([key, values]) => [key, Object.fromEntries(Object.entries(values).map(([name, value]) => [skillMap[name] ?? name, value]))])),
    originalPrerequisite: Object.entries(entry.prerequisites ?? {}).flatMap(([key, values]) => Object.entries(values).map(([name, value]) => `${name}${value}`)).join("、") || undefined,
    effects,
    droppedTraits: uniqueDropped,
    conversionNote: notes.join(" "),
    narrative: entry.description,
    sourceRef: "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。",
  };
  if (!out.originalPrerequisite) delete out.originalPrerequisite;
  if (!out.conversionNote) delete out.conversionNote;
  return out;
}

const output = {
  id: "shop-starter.物品",
  type: "商品",
  version: "1.0.0",
  sourceRef: "rules-2.35.txt 第276789行起(武器型錄轉換)；附件 tier-d-equipment-weapons",
  note: "17 件特殊武器以純分數定價。可執行的能力已轉成現有效果；無法安全對應 Combat V2 的能力均列入 droppedTraits 並附轉換說明。",
  skillMappingNote: "原始技能白刃→格鬥、掩飾→交涉、神秘→秘識；前置與固定效果均採本專案十技能鍵。",
  entries: input.entries.map(convertEntry),
};
fs.writeFileSync("content/packs/shop-starter-items.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(`已產生 ${output.entries.length} 件轉化後物品`);
for (const entry of output.entries) console.log(`${entry.name}\t${entry.price}\t${entry.effects.map((e) => e.kind).join("/")}\tdropped:${entry.droppedTraits.length}`);
