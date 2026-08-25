// 建卡起始專長：所有人以普通人身分開始，從十項生活經驗／基礎能力中選三項。
//
// 這不是原始規則的完整「專業／戰鬥專長」系統，也不是商店能力：
//   - 不消耗 XP
//   - 不要求特殊身份
//   - 不提供高階戰鬥招式
//   - 每項只對一個 canonical 技能提供 +1 顆相關檢定骰
//
// 效果資料留在 server。前端只會收到 id/name/description/skill 的安全顯示資料，
// 最終由 resolveStartingSpecialties() 依白名單重建 skillBonus，不能相信玩家傳來的 effect。

import { SKILLS } from "../../core/schema.js";

const ALL_SKILLS = Object.values(SKILLS).flat();

export const STARTING_SPECIALTY_COUNT = 3;

export const STARTING_SPECIALTIES = [
  {
    id: "melee_reflex",
    name: "街頭鬥狠",
    skill: "格鬥",
    description: "在底層摸爬滾打練出的狠勁，你懂得如何在狹小死角用拳頭和碎玻璃搶下先機。",
    narrationHint: "不要使用華麗武術；描寫專挑喉嚨、關節、下陰等死角，或就地抄起碎玻璃、管線、鐵棍等雜物痛擊要害的街頭狠勁。",
  },
  {
    id: "firearm_aim",
    name: "軍械直覺",
    skill: "射擊",
    description: "長期把玩槍械的肌肉記憶，即便在劇烈心跳下也能憑本能完成三點一線。",
    narrationHint: "描寫在劇烈喘息、紅光閃爍或震動中，雙手與呼吸憑藉肌肉記憶瞬間鎖定準星，在最短時間內精準出槍。",
  },
  {
    id: "agile_movement",
    name: "跑酷身手",
    skill: "體魄",
    description: "習慣在水泥叢林中奔逃翻滾，你的身體總能搶在障礙堵死前找到受力點。",
    narrationHint: "描寫在障礙物間極限蹬牆、滑鏟或翻滾卸力，利用動量流暢避開坍塌或撕裂口。",
  },
  {
    id: "quiet_steps",
    name: "無聲匿跡",
    skill: "潛行",
    description: "像影子般融入環境的本能，你知道如何壓低重心、讓每一步都隱沒在背景雜音中。",
    narrationHint: "描寫配合引擎換氣、金屬震顫等環境雜音同時落步，利用陰影死角消除足音與呼吸聲。",
  },
  {
    id: "survival_sense",
    name: "荒野本能",
    skill: "求生",
    description: "長期對抗惡劣天候的經驗，哪怕只有一絲微風也能讓你嗅出水源與死地的邊界。",
    narrationHint: "描寫透過空氣溫度、氣味酸度、微弱風向變化，提前察覺環境隱患或安全動線。",
  },
  {
    id: "crisis_observer",
    name: "危險預感",
    skill: "偵察",
    description: "在無數次直面惡意後磨出的第六感，後頸的刺痛總能提醒你暗處正有視線窺伺。",
    narrationHint: "描寫後頸泛起寒意、瞳孔瞬間聚焦暗處的金屬反光或陰影抽動，搶在危險爆發前警覺。",
  },
  {
    id: "hands_on",
    name: "百工為家",
    skill: "技藝",
    description: "對精密機械的直覺理解，只要手邊有一根鐵絲與螺絲起子，就沒有打不開的閘門。",
    narrationHint: "描寫手指靈巧地利用隨身鐵絲、螺絲刀或殘破電線短接電路、拆卸卡榫，動作熟練乾脆。",
  },
  {
    id: "first_aid",
    name: "急救技術",
    skill: "醫療",
    description: "直視過無數淋漓鮮血的冷靜手法，能在隊友休克前的幾秒內用布條與止血鉗搶回一命。",
    narrationHint: "描寫冷靜忽視噴濺的血跡，手指迅速壓迫止血點、固定骨折部位並以俐落手法包紮止血。",
  },
  {
    id: "occult_literacy",
    name: "玄秘怪談",
    skill: "秘識",
    description: "從小對都市傳說與隱秘禁忌的偏執研究，讓你能一眼辨認出非人存在留下的詭異痕跡。",
    narrationHint: "描寫一眼看出腐蝕邊緣、黏液排列規律或奇怪圖騰等非自然痕跡，迅速聯想起怪談禁忌並理解其象徵意義。",
  },
  {
    id: "situational_talk",
    name: "洞悉人心",
    skill: "交涉",
    description: "在利益博弈中練就的察言觀色，能從對手微微抽搐的眼角看穿對方的底牌與恐懼。",
    narrationHint: "描寫從對方緊繃的下頜、游移的視線或微顫的手指，精準抓住心理破綻並用言語反制。",
  },
];

const BY_ID = new Map(STARTING_SPECIALTIES.map((specialty) => [specialty.id, specialty]));
const SUCCESS_NARRATION_TIERS = new Set(["成功", "大成功"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** 給前端的安全顯示資料，不包含任何可直接套用的 effect 物件。 */
export function startingSpecialtiesForClient() {
  return STARTING_SPECIALTIES.map(({ id, name, skill, description }) => ({
    id,
    name,
    skill,
    description,
    bonusText: `${skill}相關檢定 +1 顆骰`,
    effectText: `${skill}相關檢定 +1 顆骰`,
  }));
}

/**
 * 驗證並解析玩家提交的起始專長 ID。
 * `required:false` 只供舊的低階測試／預覽呼叫相容；正式建立 session 必須傳三項。
 */
export function resolveStartingSpecialties(rawIds, { required = false } = {}) {
  if (rawIds === undefined || rawIds === null) {
    if (required) {
      return { valid: false, errors: [`請選擇 ${STARTING_SPECIALTY_COUNT} 項起始專長。`], specialties: [] };
    }
    return { valid: true, errors: [], specialties: [] };
  }

  if (!Array.isArray(rawIds)) {
    return { valid: false, errors: ["起始專長選擇格式不正確。"], specialties: [] };
  }

  const ids = rawIds.filter(isNonEmptyString).map((id) => id.trim());
  const errors = [];
  if (ids.length !== rawIds.length) errors.push("起始專長 ID 格式不正確。");
  if (ids.length !== STARTING_SPECIALTY_COUNT) {
    errors.push(`起始專長必須剛好選 ${STARTING_SPECIALTY_COUNT} 項。`);
  }
  if (new Set(ids).size !== ids.length) errors.push("起始專長不可重複選擇。");

  const specialties = ids.map((id) => BY_ID.get(id) ?? null);
  for (let i = 0; i < specialties.length; i++) {
    if (!specialties[i]) errors.push(`找不到起始專長「${ids[i]}」。`);
  }

  if (errors.length > 0) return { valid: false, errors, specialties: [] };
  return { valid: true, errors: [], specialties };
}

/**
 * 只有 server 已裁定的成功／大成功，且實際使用的 skill 對應到角色已持有的
 * server 生成起始專長時，才建立一次性敘事指引。這不是效果，也不應被當成無條件人格提示。
 */
export function startingSpecialtyNarrationDirective(character, { skill, outcomeTier } = {}) {
  if (!SUCCESS_NARRATION_TIERS.has(outcomeTier) || typeof skill !== "string" || !skill) return null;
  const feat = (Array.isArray(character?.feats) ? character.feats : []).find((candidate) => {
    const id = String(candidate?.id ?? "");
    return id.startsWith("starting-specialty-")
      && candidate?.effect?.type === "skillBonus"
      && candidate.effect.skill === skill;
  });
  if (!feat) return null;
  const specialtyId = String(feat.id).slice("starting-specialty-".length);
  const specialty = BY_ID.get(specialtyId);
  if (!specialty?.narrationHint) return null;
  return `這次 ${skill} 檢定已由引擎裁定為「${outcomeTier}」。請在成功敘事中自然融入以下一到兩句具體的肌肉記憶、感官反應或行為細節：${specialty.narrationHint} 不要直接提到專長名稱、不要說「因為玩家有某項專長」，也不要新增未經 Engine_Result／Reference_Event 授權的效果、傷勢、物品、位置、旗標或威脅；這段只是在已授權成功上增加動作質感。`;
}

/** 將 server 已驗證的選項轉成 buildCharacter() 能消費的 skillBonus feats。 */
export function startingSpecialtyFeats(specialties = []) {
  return specialties.map((specialty) => ({
    id: `starting-specialty-${specialty.id}`,
    name: specialty.name,
    description: specialty.description,
    effect: { type: "skillBonus", skill: specialty.skill, amount: 1 },
  }));
}

/** 供後端把選擇寫進 lifePath 公開結果與甦醒掃描，不暴露內部 Map。 */
export function publicStartingSpecialties(specialties = []) {
  return specialties.map(({ id, name, skill, description }) => ({
    id,
    name,
    skill,
    description,
    effectText: `${skill}相關檢定 +1 顆骰`,
    bonus: 1,
  }));
}

// 這個 assertion 讓模組本身在規則表被改壞時立即失敗，而不是產生沒有消費端的專長。
if (STARTING_SPECIALTIES.length !== ALL_SKILLS.length || new Set(STARTING_SPECIALTIES.map((s) => s.skill)).size !== ALL_SKILLS.length) {
  throw new Error("起始專長必須一對一覆蓋十個 canonical 技能");
}
