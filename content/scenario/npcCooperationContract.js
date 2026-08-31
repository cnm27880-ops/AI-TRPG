// 【靜態層】NPC 合作契約 —— 四個 NPC 共用的那一份，只送一次。
//
// 這個檔案是這次重構的重點。在它存在之前，四個 `*CooperationPolicy.js` 各自在
// **動態層**輸出一段 600 字的區塊，而其中幾乎每一行都是逐字相同的：
//
//   「不得自行創造：傷勢、死亡、位置改變、門或通路狀態、物品、flags、威脅值、
//     戰鬥結果、結局、獎勵或未授權 canonical clue。」
//   「玩家仍可拒絕、改道、繼續提問或採取任何合理自由行動；X 的策略只改變
//     他的合作方式與可觀察反應。」
//
// 兩個問題疊在一起：
//   1. 同一段規則被抄了四份，四份會各自漂移（實際上已經漂了——每個 NPC 的
//      「不得自行創造」清單長度都不一樣，而沒有人能說出為什麼 Lambert 那份多了「昏迷」）。
//   2. 它是**整場遊戲逐字不變的文字**，卻住在每回合重算的動態層。場上有兩個 NPC，
//      就是每回合白付兩份。
//
// 現在它是一段靜態文字，進 system message，整場只付一次錢
// （見 docs/PROMPT_CACHE_CONTRACT.md）。各 NPC 獨有的人設一句話也一起放進來——
// 那同樣整場不變，以前卻跟著每回合的狀態一起送。
//
// 動態層剩下什麼：只剩每回合真的會變的那幾個字，而且已經併進
// npcStateMachine.js 的 [NPC_ACTIVE_STATE] 那一行（Stance / Beat 兩個欄位）。

import { NPC_PERSONAS, personaFor } from "./npcPersonaRegistry.js";
import { narrativeNpcVoiceProfile } from "./narrativePackageAdapter.js";

/** 白名單最多列幾條。跟 npcStateMachine.js 的 KNOWLEDGE_LIMIT 是同一個上限。 */
const KNOWLEDGE_LIMIT = 3;

/**
 * 四個 NPC 共用的安全契約。
 *
 * 這裡的每一條都是從舊的四份區塊合併來的**聯集**，不是最小公倍數：
 * 合併時取最嚴格的版本（例如 Lambert 那份獨有的「昏迷、失去行動權」也保留），
 * 因為這些限制沒有一條是「只對某個 NPC 才危險」的。
 */
const SHARED_RULES = `【NPC 合作契約（適用於本副本所有具名 NPC）】
這些 NPC 都是有獨立目標與風險判斷的人，不是等玩家提問才反應的背景角色。
他們的自主性只改變**合作方式與可觀察反應**，不改變世界的任何事實。

不得自行創造，一項都不行：
玩家或 NPC 的傷勢、死亡、昏迷、失去行動權、位置改變、門或通路的開關狀態、
物品的取得或遺失、旗標、威脅值、戰鬥結果、設備修復或啟動的結果、導航完成、
感染、結局、主神獎勵，以及任何未授權的 canonical 線索或秘密。
以上每一項都只能由引擎裁定；敘事只能寫已經定案的結果。

NPC 可以有情緒、可以拒絕、可以保留情報、可以自己先走——
但他不能把「他打算做什麼」寫成「他已經做完了」。
指揮意向不等於隊伍已經移動，警告不等於門已經關上，準備超載不等於超載已經啟動。

玩家的選擇永遠保留：他仍然可以拒絕、改道、繼續提問，或採取任何合理的自由行動。
NPC 的態度不會關掉玩家的選項，只會改變他要付出的代價。

NPC 只能知道自己親眼看見、親耳聽見，或已由引擎明示的事情。
狀態行裡的 Knowledge 欄位就是那份白名單，不在上面的事他不知道。

下面每個角色的語氣素材只規範**說話方式與可觀察反應**，不是已經發生的事：
沒有對應的 trigger，就只維持語氣與姿態，不要把反應參考寫成 engine effect。
Ash 的生化人身分在未出現公開解鎖旗標前，不得直接說破，也不得用語氣庫暗示成確定事實。`;

/**
 * 這份契約要描述哪些 NPC，依什麼順序。
 *
 * 以 `reference.npcs` 為準而不是以人設登記處為準，因為語氣素材是**每個副本各自有一份**：
 * 侏羅紀副本的三名 NPC 不在 NPC_PERSONAS 裡（他們沒有合作策略），但他們一樣有語氣素材。
 * 只跑登記處的話，那三個人的素材會從提示裡整個消失——而且不會有任何測試變紅，
 * 因為動態層仍然會送出他們的關係台詞，看起來像「素材本來就這麼少」。
 *
 * 順序來自 reference 的固定陣列，所以整場遊戲逐字相同（見 PROMPT_CACHE_CONTRACT
 * 的「不要用非決定性的順序拼接靜態內容」）。
 */
function contractNpcs(reference) {
  const declared = (reference?.npcs ?? []).filter((npc) => npc?.id);
  if (declared.length) {
    return declared.map((npc) => ({ npcId: npc.id, name: npc.name ?? npc.id, persona: personaFor(npc.id), declared: npc }));
  }
  // 沒有 reference（demo 端點、測試）時退回登記處，至少人設還在。
  return NPC_PERSONAS.map((persona) => ({ npcId: persona.npcId, name: persona.name, persona, declared: null }));
}

/**
 * 一個 NPC 的固定檔案：人設一句話、自主性範圍、Agenda 基線、Taboo、Knowledge 白名單、語氣素材。
 *
 * [2026-08-31] 這裡的每一項原本都住在動態層，每回合重送一次：
 * 人設與安全規則來自四段 <NPC_Cooperation_Contract>，Agenda／Taboo／Knowledge 來自
 * [NPC_ACTIVE_STATE]，語氣素材來自 <NPC_Voice_Bible>。三者都幾乎不變，
 * 三者都被搬到這裡付一次。動態層只留真的會變的部分。
 */
function personaDossier(reference, { npcId, name, persona, declared }) {
  const lines = [`- ${name}（${npcId}）：${persona?.stance ?? declared?.role ?? "副本人物"}`];
  if (persona?.autonomy) lines.push(`  自主性可以表現在：${persona.autonomy}`);
  const agenda = persona?.agenda ?? (Array.isArray(declared?.privateGoals) ? declared.privateGoals[0] : null);
  if (agenda) lines.push(`  Agenda 基線：${agenda}`);
  if (persona?.taboo) lines.push(`  Taboo：${persona.taboo}`);
  const knowledge = Array.isArray(declared?.knowledge) ? declared.knowledge.slice(0, KNOWLEDGE_LIMIT) : [];
  if (knowledge.length) lines.push(`  Knowledge 白名單基線：${knowledge.join("／")}`);
  // 語氣素材（外在、語氣、可觀察習慣、反應參考）以前每回合跟著 <NPC_Voice_Bible> 送，
  // 佔 reference block 的 44%。它一個字都不會變，所以搬到這裡。
  // 有揭露閘門的 NPC（Ash）不在這裡——他的破綻要等旗標，見 narrativeNpcVoiceProfile()。
  const voice = narrativeNpcVoiceProfile(reference, npcId);
  if (voice) lines.push(voice);
  return lines.join("\n");
}

/**
 * 【靜態層】完整的合作契約區塊。
 *
 * 呼叫端把它放進 staticBlocks（見 functions/api/turn.js 的 buildPromptLayers）。
 *
 * 它只吃 `reference`——副本在一場遊戲裡是固定的，所以產生的字串整場逐字相同，
 * 這是它能待在 system message 的前提。**不要把 state 傳進來**（例如為了「只送在場的
 * NPC」）：那會讓整段靜態前綴每次進出場景就失效一次，省下的幾十個 token 遠不抵那個代價。
 */
export function buildNpcCooperationContract(reference) {
  return `${SHARED_RULES}

【本副本 NPC 的固定檔案】
以下每一項都是**基線**。動態層的 [NPC_ACTIVE_STATE] 只會在偏離基線時送出覆寫標記：
- 「Agenda: SELF_PRESERVE」代表他這一刻放棄了上面那個目標，先顧自己。
- 「Taboo: TRIPPED」代表玩家這一回合剛好踩到上面那條禁忌。
- 「+Known」代表他在這一局裡額外學到的東西，接在白名單基線後面。
沒有出現覆寫標記，就照下面的基線演。

${contractNpcs(reference).map((entry) => personaDossier(reference, entry)).join("\n")}`;
}
