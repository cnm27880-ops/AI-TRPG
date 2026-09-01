// [設計] 重大劇情節點評估器 —— 第二階段。
//
// 場景事件與重大劇情節點是兩層不同的東西：
//
//   場景事件      搜索貨艙、查看終端、修理設備   控制當前可採取的行動與場景進度
//   劇情階段      覺醒／調查／真相與對立／逃生   表示玩家在故事中的位置（見 hudView 的 storyPhase）
//   重大劇情節點  陸遠的命運、937 真相、異形的命運  表示不可逆或高代價的故事轉折
//
// ---------------------------------------------------------------------------
// 這個模組最重要的性質：它拿不到敘事
// ---------------------------------------------------------------------------
// evaluateMajorStoryNodes(reference, state) 的簽章裡**沒有任何參數可以傳敘事文字**，
// 跟 deriveEndingId(reference, state) 是同一種形狀。所以「AI 寫了陸遠死了」
// 在結構上就不可能讓節點解決——不需要靠檢查或防呆擋，靠的是型別。
//
// 這是討論稿 §九 那條流程的落實：
//
//   玩家輸入 → 引擎分類 → 骰子 → 套用 reference effects
//   → 更新 flags/clues/NPC status/時間/戰鬥結果 → **重新評估重大劇情節點**
//   → 發放新獲得的扭轉獎勵 → 把已確定的結果交給 AI 描寫
//
// ---------------------------------------------------------------------------
// 單向性：這個模組唯一需要記住的規則
// ---------------------------------------------------------------------------
//   hidden → discovered            揭露之後不會再變回未揭露
//   unresolved → resolved | missed 解決或錯失之後就鎖定，不再每回合重新推測
//
// 沒有這條，重大節點會變成一個「每回合重算、可能被後續 effect 抹掉」的東西，
// 那正是 §十.4「不允許 dead → alive」要擋的事——只是層級更高一點。
//
// [2026-09-01] 扭轉獎勵在這一階段**只計算、不發放**：節點記下自己值多少分，
// 實際入帳是第三階段獎勵帳本（rewardType: "turning_point"）的工作。
// 所以 rewardGranted 目前恆為 false，HUD 上會顯示 unclaimed——那是誠實的現況，
// 不是漏掉。

import { matchReferenceCondition } from "./conditions.js";

/** 節點的解決度。玩家看得到的只有這三種，加上 visibility 那一軸。 */
export const MAJOR_NODE_STATUSES = Object.freeze(["unresolved", "resolved", "missed"]);

/** 揭露度。hidden 的節點在公開投影裡**整條不出現**（見 hudView 的 publicMajorStoryNodes）。 */
export const MAJOR_NODE_VISIBILITIES = Object.freeze(["hidden", "discovered"]);

function catalogueOf(reference) {
  return Array.isArray(reference?.majorStoryNodes) ? reference.majorStoryNodes.filter((node) => node?.id) : [];
}

function freshEntry() {
  return {
    visibility: "hidden",
    status: "unresolved",
    resolution: null,
    resolvedAtTurn: null,
    // 解決的當下，是哪些引擎事實促成的。只存 id，不存敘事——這份紀錄要能被稽核。
    evidence: [],
    rewardPoints: 0,
    rewardGranted: false,
  };
}

/** 舊存檔沒有這個欄位、或 reference 加了新節點時補成可用形狀；已解決的結果一個字都不動。 */
export function normalizeMajorStoryState(reference, raw) {
  const stored = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const node of catalogueOf(reference)) {
    const entry = stored[node.id];
    if (!entry || typeof entry !== "object") {
      out[node.id] = freshEntry();
      continue;
    }
    const status = MAJOR_NODE_STATUSES.includes(entry.status) ? entry.status : "unresolved";
    out[node.id] = {
      visibility: MAJOR_NODE_VISIBILITIES.includes(entry.visibility) ? entry.visibility : "hidden",
      status,
      resolution: status === "resolved" && typeof entry.resolution === "string" ? entry.resolution : null,
      resolvedAtTurn: Number.isInteger(entry.resolvedAtTurn) ? entry.resolvedAtTurn : null,
      evidence: Array.isArray(entry.evidence) ? entry.evidence.filter((id) => typeof id === "string") : [],
      rewardPoints: Number.isFinite(Number(entry.rewardPoints)) ? Math.max(0, Math.trunc(Number(entry.rewardPoints))) : 0,
      rewardGranted: Boolean(entry.rewardGranted),
    };
  }
  return out;
}

/**
 * 這個 resolution 成立時，是哪些引擎事實讓它成立的。
 *
 * 只收條件裡真的被列出來、而且 state 裡真的有的那些 id。這份清單會存進存檔，
 * 是「節點為什麼解決」的稽核紀錄——沒有它，一個已解決的節點就只是一個結論，
 * 沒有辦法回頭查是哪一回合的哪個 effect 造成的。
 */
function evidenceFor(condition, state) {
  if (!condition || typeof condition !== "object") return [];
  const flags = new Set(state?.flags ?? []);
  const clues = new Set(state?.clues ?? []);
  const found = [];
  for (const key of ["allFlags", "anyFlags"]) {
    for (const flag of condition[key] ?? []) if (flags.has(flag)) found.push(flag);
  }
  for (const key of ["allClues", "anyClues"]) {
    for (const clue of condition[key] ?? []) if (clues.has(clue)) found.push(clue);
  }
  for (const [npcId, allowed] of Object.entries(condition.npcStatusAny ?? {})) {
    const values = Array.isArray(allowed) ? allowed : [allowed];
    const current = state?.npcStatuses?.[npcId];
    if (values.includes(current)) found.push(`${npcId}=${current}`);
  }
  for (const [axis, expected] of Object.entries(condition.stateEquals ?? {})) {
    if (String(state?.[axis]) === String(expected)) found.push(`${axis}=${expected}`);
  }
  for (const nested of condition.any ?? []) found.push(...evidenceFor(nested, state));
  return [...new Set(found)];
}

/** 依宣告順序找第一個成立的 resolution。onlyOnClose 的只在窗口關閉時才納入。 */
function matchResolution(node, state, { onClose = false } = {}) {
  for (const resolution of node.resolutions ?? []) {
    if (!resolution?.id) continue;
    if (resolution.onlyOnClose && !onClose) continue;
    if (!matchReferenceCondition(resolution.when ?? {}, state)) continue;
    return resolution;
  }
  return null;
}

/**
 * 把 reference 宣告的重大節點跟目前的 engine state 對一次。
 *
 * **只讀 state，不讀敘事。** 回傳新的 majorStoryState 與這一回合真的變動的項目。
 *
 * @param {object} reference AI GM reference sidecar（節點目錄住在 reference.majorStoryNodes）
 * @param {object} state referenceState（flags / clues / npcStatuses / 狀態軸）
 * @param {object} [options]
 * @param {number} [options.turnNumber] 記進 resolvedAtTurn，用來稽核「哪一回合定案的」
 * @returns {{ majorStoryState: object, changes: Array<{id, title, from, to, resolution, points, evidence}> }}
 */
export function evaluateMajorStoryNodes(reference, state, { turnNumber = 0 } = {}) {
  const catalogue = catalogueOf(reference);
  const current = normalizeMajorStoryState(reference, state?.majorStoryState);
  const next = {};
  const changes = [];

  for (const node of catalogue) {
    const before = current[node.id];
    const entry = { ...before };

    // ---- 揭露：單向，揭露過就不會再變回 hidden ----
    if (entry.visibility === "hidden" && matchReferenceCondition(node.visibility ?? {}, state)) {
      entry.visibility = "discovered";
      changes.push({
        id: node.id,
        title: node.title ?? node.id,
        from: "hidden",
        to: "discovered",
        resolution: null,
        points: 0,
        evidence: evidenceFor(node.visibility ?? {}, state),
      });
    }

    // ---- 解決：已經定案的節點不再重新推測 ----
    if (entry.status === "unresolved") {
      // 先看解決、再看窗口關閉。同一回合兩者都成立時，解決勝出——
      // 玩家是在最後一刻做到的，不該被判成錯失。
      const windowClosed = node.window?.closesWhen
        ? matchReferenceCondition(node.window.closesWhen, state)
        : false;
      const resolution = matchResolution(node, state, { onClose: windowClosed });

      if (resolution) {
        const evidence = evidenceFor(resolution.when ?? {}, state);
        entry.status = "resolved";
        entry.resolution = resolution.id;
        entry.resolvedAtTurn = turnNumber;
        entry.evidence = [...new Set([...entry.evidence, ...evidence])];
        entry.rewardPoints = Math.max(0, Math.trunc(Number(resolution.points) || 0));
        // 解決本身就是揭露：玩家不可能在完全不知情的狀況下看到一個節點定案。
        if (entry.visibility === "hidden") entry.visibility = "discovered";
        changes.push({
          id: node.id,
          title: node.title ?? node.id,
          from: "unresolved",
          to: "resolved",
          resolution: resolution.id,
          points: entry.rewardPoints,
          evidence,
        });
      } else if (windowClosed) {
        entry.status = "missed";
        entry.resolvedAtTurn = turnNumber;
        changes.push({
          id: node.id,
          title: node.title ?? node.id,
          from: "unresolved",
          to: "missed",
          resolution: null,
          points: 0,
          evidence: evidenceFor(node.window.closesWhen, state),
        });
      }
    }

    next[node.id] = entry;
  }

  return { majorStoryState: next, changes };
}

/**
 * 【動態層】這一回合真的變動的重大節點 + 仍然未定案的清單。
 *
 * 只送 id 與轉移，不送條件、不送證據 id、不送 gmTruth。「這個節點為什麼解決」
 * 是伺服器的稽核資料，不是模型的演出素材——給了它反而會被寫進敘事裡。
 *
 * **沒有變動時整段不送**（回 ""），呼叫端就不放這一段。理由跟 npcStateMachine 的
 * `Override: "SEIZE_CONTROL"` 一樣：旗標要稀有才有力量，每回合都出現的東西
 * 會被模型當成背景噪音略過。
 *
 * 「還沒定案」那一行則每回合都送，因為它是一條**禁令**而不是一則通知：
 * 模型需要在每一回合都知道哪些結果它不可以寫。
 */
export function buildMajorStoryNodeBlock(reference, state, changes = []) {
  const catalogue = catalogueOf(reference);
  if (catalogue.length === 0) return "";
  const stored = normalizeMajorStoryState(reference, state?.majorStoryState);

  const lines = [];
  if (changes.length) {
    lines.push("[MAJOR_NODES_CHANGED] 這一回合由引擎裁定的重大劇情變動（只有這些是已定案的事實）：");
    for (const change of changes) {
      const target = change.to === "resolved" && change.resolution ? `resolved(${change.resolution})` : change.to;
      lines.push(`- ${change.title}：${change.from} → ${target}`);
    }
  }

  const unresolved = catalogue
    .filter((node) => stored[node.id]?.status === "unresolved")
    .map((node) => node.title ?? node.id);
  if (unresolved.length) {
    lines.push(`[MAJOR_NODES_LOCKED] 尚未定案，本回合不得寫成已經發生：${unresolved.join("／")}`);
  }

  return lines.join("\n");
}

/**
 * 【靜態層】怎麼讀上面那兩行。
 *
 * 整場遊戲逐字不變，所以住在 system message、每回合命中快取。
 * 這是 NPC_STATE_LEGEND 用過的同一刀：解釋文字付一次，資料每回合只付幾十個 token。
 */
export const MAJOR_STORY_NODE_LEGEND = `【重大劇情節點的讀法（動態層可能送出 [MAJOR_NODES_CHANGED] 與 [MAJOR_NODES_LOCKED]）】
重大劇情節點是這個副本裡「不可逆或高代價」的故事轉折：關鍵人物的生死、真相是否揭露、
樣本與感染的去向。它們的狀態**只由引擎裁定**，依據是已經套用的判定結果與世界狀態。

- [MAJOR_NODES_CHANGED]：這一回合剛剛定案的變動。這些是**事實**，你必須照著寫，
  而且只能寫這一行講的那個結果。沒有出現這一段，就代表這一回合沒有任何重大節點定案。
- [MAJOR_NODES_LOCKED]：列出來的節點**尚未定案**。這一回合的敘事不可以把它們寫成
  已經發生、已經揭露或已經解決：不可以宣告某人已經死亡或確定獲救、不可以宣告真相
  已經被完整揭露、不可以宣告異形已經被殺死、不可以宣告樣本或感染的最終結果。

你可以自由描寫節點**內部**的過程、感官、情緒、NPC 的反應與未完成的嘗試——
張力來自過程，那正是你該發揮的地方。你不能決定的只有結果。

這些節點的名稱與狀態是給你的**演出前提**，不是可以說出口的資訊：
不可以把「重大劇情節點」「已定案」「尚未定案」這種說法寫進敘事，
玩家看到的是一個故事，不是一塊儀表板。`;
