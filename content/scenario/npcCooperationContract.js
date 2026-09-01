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

/**
 * 白名單每一類最多列幾條。跟 npcStateMachine.js 的 KNOWLEDGE_LIMIT 是同一個數字。
 *
 * [2026-09-01] 上限改成「每一類各 3 條」而不是「全部合計 3 條」。
 * 舊的合計上限造成一個安靜的資料遺失：陸遠宣告了四筆 knowledge，
 * `slice(0, 3)` 把第四筆「玩家不是原船員」整個切掉——**他實測時說出口的那句話，
 * 根本不在送給模型的白名單上**。而白名單少一條不會讓任何測試變紅。
 *
 * 這一層是靜態契約，整場只付一次錢，所以「合計 3 條」這個上限本來就是從
 * 動態層（npcStateMachine 的每回合狀態行）繼承來的、放錯地方的節儉。
 */
const KNOWLEDGE_LIMIT = 3;

/**
 * Knowledge 的兩種寫法都要吃得下，並且**分成兩類**輸出。
 *
 * 為什麼要分：舊格式是一串主題字串（`["玩家不是原船員"]`），模型無從分辨這是
 * 「他可以直接斷言的事實」還是「他可以探討的主題」，於是選了對話上更自然的後者——
 * 實測症狀就是陸遠開口第一句是「你應該想想自己為什麼不在船員名單上」。
 * 那句話沒有違反白名單（他確實知道），但它把一件**他已經知道的事**演成了
 * 他正在調查的謎團，資訊優先序整個顛倒。
 *
 * 新格式（見 docs 與 npcs[].knowledge）：
 *   { id, fact, source, canSay, scope }
 *
 * 裸字串一律當成**主題**，不是事實。理由是保守：一個沒有附帶斷言的主題標籤
 * （「主神副本規則」）被當成可直接陳述的事實，等於替作者發明了他沒有寫下的確定性。
 * 舊資料因此行為完全不變，要升級的副本自己改成物件即可。
 *
 * canSay: false 的條目兩類都不進——那是「他知道但不能說」，列進提示只會誘導模型說出來。
 */
function normalizeKnowledge(declared) {
  const entries = Array.isArray(declared?.knowledge) ? declared.knowledge : [];
  const facts = [];
  const topics = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      if (entry.trim()) topics.push(entry.trim());
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    if (entry.canSay === false) continue;
    const text = typeof entry.fact === "string" ? entry.fact.trim() : "";
    if (!text) continue;
    // scope 是作者對「這件事可以怎麼被使用」的補充限制，最容易被模型忽略的那一條，
    // 所以直接接在事實後面，而不是另開一段規則。
    const scope = typeof entry.scope === "string" && entry.scope.trim() ? `（${entry.scope.trim()}）` : "";
    facts.push(`${text}${scope}`);
  }
  return { facts: facts.slice(0, KNOWLEDGE_LIMIT), topics: topics.slice(0, KNOWLEDGE_LIMIT) };
}

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
下面每個角色的「已知事實」與「Knowledge 白名單基線」就是那份白名單，不在上面的事他不知道。

Knowledge 是這個 NPC **可以使用的已知事實**，不是一份待調查的謎團清單。
標為「已知事實」的條目他已經確定了：在適合的時機應該**直接陳述**，
不可以先用反問把已知事實偽裝成未知，也不可以裝作正在推理它。
（例如：他知道玩家不是原船員，就該直說「你不是這艘船的原船員」；
不可以說成「你應該想想自己為什麼不在船員名單上」——後者把他已知的事推給玩家去解謎。）
如果他知道某件事、但不知道它的**原因**，可以直說事實再表明原因不明，
而不是把整件事都退回成疑問。

「Knowledge 白名單基線」列的是他熟悉的**主題**：他可以談、可以提及，
但細節沒有被作者定案，不可以就地編出具體的數字、條款、時間或人名。

NPC 只能根據親眼所見、親耳所聞、個人經驗與引擎明示的資料推論，
不得由作者視角補全尚未發生的事件、其他角色的隱藏身分或結局。

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
  // [2026-09-01 第五階段] 動機清單。整場逐字不變，所以住在這裡付一次錢；
  // 動態層每回合只送 `Motive: "<ID>"` 那幾個字（見 npcStateMachine 的 selectMotive）。
  //
  // 把「為什麼」跟「這一刻是哪一條」寫在一起是最自然、也最貴的錯法：
  // 說明有幾百字，跟著 ID 進動態層就等於每回合重付一次它的錢。
  const motivations = Array.isArray(persona?.motivations) ? persona.motivations : [];
  if (motivations.length) {
    lines.push("  動機（伺服器每回合挑出最強的一條，動態層送 Motive: <ID>；照那一條的行為演，措辭自己決定）：");
    for (const motive of motivations) {
      const payoff = motive.payoff ? `　收益：${motive.payoff}` : "";
      lines.push(`    ${motive.id} — 動機：${motive.motive}　行為：${motive.action}${payoff}`);
    }
  }

  const { facts, topics } = normalizeKnowledge(declared);
  // 事實排在主題前面，順序即優先序：他要先講他確定的事，再談他只知道大概的事。
  if (facts.length) lines.push(`  已知事實（可直接陳述，不得演成未知）：${facts.join("／")}`);
  if (topics.length) lines.push(`  Knowledge 白名單基線：${topics.join("／")}`);
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
