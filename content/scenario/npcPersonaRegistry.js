// 副本 NPC 人設的單一登記處。
//
// 為什麼需要它：同一份人設有兩個消費者——
//   npcCooperationContract.js  組靜態層的人設段落
//   npcStateMachine.js         取 S.A.E.P. 基線、Agenda、Taboo 與自保狀態表
// 沒有這個登記處的話，兩邊都得各自 import 四個 policy 檔，然後其中一邊遲早會漏掉
// 新加的第五個 NPC，而漏掉的症狀是「這個角色的耐心值永遠是預設值」——不會有人發現。
//
// **順序是固定的陣列，不是 Object.keys()。** 靜態層的內容只要順序變動就整段 cache miss，
// 見 docs/PROMPT_CACHE_CONTRACT.md 的「不要用非決定性的順序拼接靜態內容」。

import { LUYUAN_PERSONA } from "./npcCooperationPolicy.js";
import { RIPLEY_PERSONA } from "./ripleyCooperationPolicy.js";
import { PARKER_PERSONA } from "./parkerCooperationPolicy.js";
import { LAMBERT_PERSONA } from "./lambertCooperationPolicy.js";

/**
 * Ash 沒有合作策略，因為他不合作。
 *
 * 他的行為由 canonical 場景與 937 指令決定，不由玩家的互動推進——
 * 給他一張「玩家做 A 他就配合 B」的轉場表會直接違背這個角色的設計。
 * 但他仍然需要 S.A.E.P. 基線與禁忌，所以在這裡補一份只有人設、沒有 policy 的登記。
 */
const ASH_PERSONA = {
  npcId: "npc_ash",
  name: "Ash",
  sourcePackId: "scenario.nostromo-01-v2",
  stance:
    "Ash 是科學官，表面配合、實際上在執行只有他知道的指令。" +
    "他的禮貌是工具：他不需要玩家配合，只需要玩家不要礙事。",
  autonomy: "提供看似有用的資訊、把話題引開、在必要時擋住某條路線。",
  agenda: "保護並回收樣本",
  taboo: "破壞或處置樣本",
  tabooPatterns: [
    /(?:燒|毀|殺|處理掉|丟掉|清除)[^。]{0,6}(?:樣本|標本|生物|卵)/,
    /(?:曝露|公開)(?:937|特別指令)/,
  ],
  // 表面配合（SOC 高）、暗中主導（ACT 高）、極度利己（EGO 滿）、
  // 耐心高到不自然——他不趕時間，趕時間的是別人。
  saep: { SOC: 6, ACT: 6, EGO: 10, PAT: 8 },
  states: { selfPreserving: ["hostile", "hostile_pending"] },
};

/** 固定順序。新增 NPC 就往**尾端**加，不要插在中間——插進去等於改寫靜態層前綴。 */
export const NPC_PERSONAS = Object.freeze([
  LUYUAN_PERSONA,
  RIPLEY_PERSONA,
  PARKER_PERSONA,
  LAMBERT_PERSONA,
  ASH_PERSONA,
]);

const BY_ID = new Map(NPC_PERSONAS.map((persona) => [persona.npcId, persona]));

/** 找不到就回 null；呼叫端自己決定要不要退回通用值。 */
export function personaFor(npcId) {
  return BY_ID.get(npcId) ?? null;
}
