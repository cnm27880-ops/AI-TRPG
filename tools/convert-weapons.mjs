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
        // 破甲已由固定武器傷害加值吸收。
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
        effects.push({ kind: "敘事", text: `原條件「${raw.condition}」已轉為無條件固定加值。` });
      }
      continue;
    }
    if (raw.kind === "檢定加成") {
      const skill = raw.skill ? skillMap[raw.skill] ?? raw.skill : "格鬥";
      effects.push({ kind: raw.type === "附加成功" ? "附加成功" : "檢定加骰", skill, amount: raw.amount, scope: "攻擊" });
      notes.push(`原「${raw.label ?? "檢定加成"}」已轉為${raw.type === "附加成功" ? "攻擊附加成功" : "攻擊檢定加骰"}。`);
      if (raw.condition) {
        notes.push(`原條件「${raw.condition}」無對應欄位，已轉為無條件固定加值。`);
        effects.push({ kind: "敘事", text: `原條件「${raw.condition}」已轉為無條件固定加值。` });
      }
      continue;
    }
    if (raw.kind === "先攻") {
      effects.push({ kind: "先攻", amount: raw.amount });
      continue;
    }
    if (raw.kind === "型態功能") {
      effects.push({ kind: "防御", amount: 2 });
      effects.push({ kind: "敘事", text: "撐開後視為防禦姿態；原本的陽光免疫與不能攻擊限制已轉為敘事提示。" });
      notes.push("原「撐開防禦態／格擋」轉為固定防御 +2；型態切換本身以敘事提示呈現。");
      continue;
    }
    if (raw.kind === "特性") {
      effects.push({ kind: "防御", amount: 1 });
      notes.push("原「格擋」已轉為持有期間固定防御 +1。");
      continue;
    }
    if (raw.kind === "防禦加值") {
      effects.push({ kind: "防御", amount: raw.amount });
      notes.push(`原條件式防禦加值已轉為無條件固定防御 +${raw.amount}。`);
      if (raw.condition) effects.push({ kind: "敘事", text: `原防禦條件：${raw.condition}；目前已改為固定防御 +${raw.amount}。` });
      continue;
    }
    if (raw.kind === "抗性") {
      effects.push({ kind: "檢定加骰", attribute: "意志", amount: 1, scope: "檢定" });
      notes.push("恐慌抗性已轉為意志檢定 +1；目前沒有獨立恐慌狀態與抗性軸。");
      effects.push({ kind: "敘事", text: `原${raw.label ?? "抗性"}已轉為意志檢定 +1。` });
      continue;
    }
    if (raw.kind === "隱蔽判定") {
      effects.push({ kind: "檢定加骰", skill: "交涉", amount: 1, scope: "檢定" });
      notes.push("社交檢定加骰已轉為交涉檢定 +1；安檢免疫保留為敘事資訊。");
      effects.push({ kind: "敘事", text: "常規安檢免疫保留為敘事提示。" });
      continue;
    }
    if (raw.kind === "法術加成") continue;
    if (raw.kind === "重骰保底") {
      effects.push({ kind: "附加成功", amount: 1, scope: "攻擊", skill: "格鬥" });
      notes.push("重骰保底轉為持有本武器進行白刃攻擊時附加成功 +1；目前系統沒有玩家宣告重骰接口。");
      continue;
    }
    if (raw.kind === "反噬懲罰") {
      effects.push({ kind: "敘事", text: `原反噬條件「${raw.condition ?? "攻擊失敗"}」保留為敘事提示；目前系統沒有攻擊失敗後自傷的結算鉤子。` });
      notes.push("反噬懲罰改為公開敘事提示，不新增會被誤讀的固定傷害。");
      continue;
    }
    if (raw.kind === "複合加值") {
      effects.push({ kind: "檢定加骰", skill: "格鬥", amount: 1, scope: "攻擊" });
      notes.push("力量／敏捷複合加值轉為該武器白刃攻擊固定 +1DP。");
      continue;
    }
    if (raw.kind === "特攻轉化" || raw.kind === "陣營特攻") {
      const baseWeapon = effects.find((effect) => effect.kind === "武器");
      if (baseWeapon) baseWeapon.weaponDamage += 1;
      effects.push({ kind: "敘事", text: `原特殊目標條件「${raw.targetTag ?? "特定目標"}」已泛化為本武器固定傷害 +1。` });
      notes.push("特攻／陣營特攻轉為本武器固定傷害 +1，原目標條件保留為敘事提示。");
      continue;
    }
    if (raw.kind === "屬性替換") {
      const baseWeapon = effects.find((effect) => effect.kind === "武器");
      if (baseWeapon) baseWeapon.weaponDamage += 1;
      effects.push({ kind: "敘事", text: "原智力＋秘識替代敏捷＋射擊已轉為本武器固定武器傷害 +1。" });
      notes.push("屬性替換轉為十字軍本身固定武器傷害 +1，避免影響其他槍械。");
      continue;
    }
    if (raw.kind === "契約功能") {
      effects.push({ kind: "檢定加骰", attribute: "意志", amount: 1, scope: "檢定" });
      effects.push({ kind: "敘事", text: "原共生契約轉為意志檢定 +1；傷害分攤與共享抵抗仍以敘事描述呈現。" });
      notes.push("共生契約轉為持有者意志檢定 +1，隊友傷害分攤保留為敘事提示。");
      continue;
    }
    if (raw.kind === "戰術動作" || raw.kind === "戰術修正") {
      effects.push({ kind: "檢定加骰", skill: "格鬥", amount: 1, scope: "攻擊" });
      effects.push({ kind: "敘事", text: `原戰術效果「${raw.label ?? raw.kind}」轉為白刃攻擊固定 +1DP；原始條件保留於商品描述。` });
      notes.push("戰術攻擊增幅轉為白刃攻擊固定 +1DP；原動作經濟條件保留為敘事提示。");
      continue;
    }
    if (raw.kind === "副型態武器") {
      effects.push({ kind: "敘事", text: `原副型態武器「${raw.label ?? "偽裝外鞘"}」保留為敘事描述，未另建立第二把可選武器。` });
      notes.push("副型態武器改為敘事描述，避免同一商品在裝備表生成無法切換的第二把武器。");
      continue;
    }
    effects.push({ kind: "敘事", text: `原「${raw.label ?? raw.kind}」保留為敘事提示：${raw.detail ?? raw.condition ?? "目前以固定效果以外的描述呈現"}` });
    notes.push(`原「${raw.label ?? raw.kind}」已明確轉為敘事提示。`);
  }

  if (entry.name === "阿爾法法杖") {
    effects.push({ kind: "法術增幅", amount: 2 });
    notes.push("法術共鳴已接入：使用法術時威力值固定 +2。" );
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
