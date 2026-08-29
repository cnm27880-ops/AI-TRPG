// Combat V2 —— 戰場狀態（規格第5節、第8.1節）。
//
// 這一份是**內部**狀態，含 seed、敵人完整 HP、AI 檔案等不可外洩的欄位；
// 要送給前端之前一律先過 publicState.js 的白名單（規格第6.2節、第7.1節C區）。
//
// 設計原則：所有規則相關的量都是**具名資料**，不是散落的 boolean。距離放在一張
// 對稱的 ranges 表、動作額度放在 actionBudget.js 的池子、狀態效果放在 statuses 陣列，
// 這樣新增一種效果不需要動任何判斷式。

import { createHpState, evaluateStatus } from "../../health.js";
import { createActionBudget } from "./actionBudget.js";
import { COMBAT_RANGES, isValidRange, rangeKey } from "./range.js";
import { rollBattleInitiative } from "./initiative.js";
import { createRng, createSeed } from "./rng.js";
import { createFormsState, endCombat as endCombatForms, payUpkeep, tickFormsOnRound } from "../../../content/shop/forms.js";
import { ACTION_TYPE_LABELS, fromLegacyActionLevel } from "./actionTypes.js";
import { spendAction } from "./actionBudget.js";

/** 回合狀態機的相位（規格第5節）。 */
export const BATTLE_PHASES = Object.freeze({
  PLAYER_SELECTION: "player_selection",
  RESOLVING: "resolving",
  ENEMY_RESOLUTION: "enemy_resolution",
  ENDED: "ended",
});

/** 公開生命狀態（規格第7.1節C區：只給等級，不給數字）。 */
export const PUBLIC_HEALTH_TIERS = Object.freeze(["未受傷", "受傷", "重創", "瀕死", "已倒下"]);

/**
 * 把一份 hpState 翻成公開等級。**這是敵人生命值唯一能離開伺服器的形狀**——
 * 精確 HP、剩幾點完好、傷勢分佈都不會出去（規格第7.1節C區）。
 */
export function publicHealthTier(hpState) {
  const status = evaluateStatus(hpState);
  if (status.dead || status.unconscious) return "已倒下";
  const max = hpState.max || 1;
  const remaining = hpState.intact / max;
  if (status.worsening) return "瀕死";
  if (remaining >= 1) return "未受傷";
  if (remaining >= 0.6) return "受傷";
  if (remaining > 0.25) return "重創";
  return "瀕死";
}

export function isDown(participant) {
  const status = evaluateStatus(participant.hpState);
  return status.dead || status.unconscious;
}

/**
 * 建立一場 Combat V2 戰鬥。
 *
 * @param {object} params
 * @param {string} params.battleId
 * @param {object} params.playerEntry 玩家參戰者：{ name, attributes, skills, hpState, combatProfile, initiative }
 * @param {object[]} params.enemyEntries 敵人參戰者樣板（見 content/combat/v2/encountersV2.js）
 * @param {object} params.scene 場景：{ id, label, description, terrain, features }
 * @param {object} params.loadout 玩家的武器/彈藥/物品（見 content/combat/v2/loadout.js）
 * @param {string} [params.startRange] 開場距離，預設 medium
 * @param {number} [params.seed] 測試用：鎖定整場戰鬥的骰子
 */
export function createBattle({
  battleId,
  playerEntry,
  enemyEntries,
  scene,
  loadout,
  startRange = "medium",
  seed,
}) {
  if (!Array.isArray(enemyEntries) || enemyEntries.length === 0) {
    throw new Error("一場戰鬥至少要有一個敵人");
  }
  if (!isValidRange(startRange)) {
    throw new Error(`開場距離不合法：${startRange}（只能是 ${COMBAT_RANGES.join("/")}）`);
  }

  const battleSeed = Number.isInteger(seed) ? seed >>> 0 : createSeed();
  const rng = createRng(battleSeed, 0);

  const player = {
    id: "player",
    side: "player",
    name: playerEntry.name ?? "輪迴者",
    attributes: playerEntry.attributes ?? {},
    skills: playerEntry.skills ?? {},
    combatProfile: playerEntry.combatProfile ?? {},
    hpState: { ...playerEntry.hpState },
    armor: playerEntry.combatProfile?.armor ?? 0,
    statuses: [],
    // 掩體是「在不在某個 scene feature 後面」，不是一個孤立的 boolean——
    // 這樣掩體被摧毀/被繞側翼時，取消它只要把這一格清掉。
    coverFeatureId: null,
    visible: true,
  };

  const enemies = enemyEntries.map((template, index) => ({
    id: template.id ?? `enemy_${String(index + 1).padStart(2, "0")}`,
    side: "enemy",
    name: template.name,
    // 公開威脅等級（規格第7.1節C區）。這是可以給玩家看的粗分級，不是內部戰力數值。
    threatLabel: template.threatLabel ?? "未知",
    attributes: template.attributes,
    skills: template.skills ?? {},
    weaponKey: template.weaponKey,
    armor: template.armor ?? 0,
    hpState: createHpState(template.hp ?? 12),
    statuses: [],
    coverFeatureId: null,
    visible: true,
    // AI 檔案是**內部資料**，永遠不進公開 payload（規格第6.2節的反例
    // 「敵方內部標籤：ambush_ready」講的就是這一格）。
    ai: template.ai ?? { profile: "melee_rusher" },
    telegraphs: template.telegraphs ?? [],
    currentTelegraph: null,
  }));

  const participants = [player, ...enemies];

  const { order, rolls, needsManualTieBreak } = rollBattleInitiative(
    participants.map((p) => ({
      id: p.id,
      initiative: p.side === "player"
        ? (playerEntry.initiative ?? 0)
        : (enemyEntries.find((e) => (e.id ?? null) === p.id || e.name === p.name)?.initiative ?? 0),
      agility: p.attributes?.敏捷 ?? 1,
    })),
    rng
  );

  // 距離表。開場時每個敵人跟玩家都在 startRange；敵人彼此之間的距離目前不影響任何規則，
  // 但鍵值形狀已經是對稱的 pair key，之後要加也不用改資料形狀。
  const ranges = {};
  for (const enemy of enemies) {
    ranges[rangeKey("player", enemy.id)] = startRange;
  }

  const budgets = {};
  for (const p of participants) budgets[p.id] = createActionBudget();

  for (const enemy of enemies) {
    enemy.currentTelegraph = rng.pick(enemy.telegraphs) ?? null;
  }

  return {
    battleId,
    engine: "combat-v2",
    active: true,
    round: 1,
    phase: BATTLE_PHASES.PLAYER_SELECTION,
    // 樂觀鎖定用（規格第8.4節）。**每一次改變戰鬥狀態都要 +1。**
    stateVersion: 1,
    seed: battleSeed,
    rngCursor: rng.cursor,
    scene: {
      id: scene.id,
      label: scene.label,
      description: scene.description ?? "",
      terrain: scene.terrain ?? "",
      features: (scene.features ?? []).map((f) => ({ ...f, state: f.state ?? "ready" })),
    },
    order,
    initiativeRolls: rolls,
    needsManualTieBreak,
    participants,
    ranges,
    budgets,
    loadout,
    publicLog: [],
    // 已處理過的請求（規格第8.4節第2點：同一個 requestId 重送不重複結算）。
    requestLog: [],
    outcome: null,
  };
}

// --- 讀取工具（全部是純函式，呼叫端不必知道內部形狀）---

export function getParticipant(battle, id) {
  return battle.participants.find((p) => p.id === id) ?? null;
}

export function playerOf(battle) {
  return getParticipant(battle, "player");
}

export function enemiesOf(battle) {
  return battle.participants.filter((p) => p.side === "enemy");
}

export function livingEnemies(battle) {
  return enemiesOf(battle).filter((enemy) => !isDown(enemy));
}

/** 玩家與某個目標之間的距離。距離是對稱的，只有一份。 */
export function getRange(battle, aId, bId) {
  return battle.ranges[rangeKey(aId, bId)] ?? null;
}

export function setRange(battle, aId, bId, next) {
  if (!isValidRange(next)) throw new Error(`不合法的戰鬥距離：${next}`);
  battle.ranges[rangeKey(aId, bId)] = next;
}

/** 玩家目前「所在的那一段距離」＝離最近的活著的敵人多遠（UI 的距離帶用它高亮）。 */
export function primaryRange(battle) {
  const alive = livingEnemies(battle);
  if (alive.length === 0) return null;
  return alive
    .map((enemy) => getRange(battle, "player", enemy.id))
    .filter(Boolean)
    .sort((a, b) => COMBAT_RANGES.indexOf(a) - COMBAT_RANGES.indexOf(b))[0] ?? null;
}

// --- 狀態效果 ---

/**
 * 掛一個狀態效果。`expiresRound` 是「哪一輪開始時要清掉」，null＝直到被明確移除。
 * 狀態全部具名並帶公開文案，因為玩家要看得懂自己身上有什麼（規格第7.1節B區）。
 */
export function addStatus(participant, status) {
  const next = participant.statuses.filter((s) => s.id !== status.id);
  next.push({ ...status });
  participant.statuses = next;
  return participant;
}

export function removeStatus(participant, statusId) {
  participant.statuses = participant.statuses.filter((s) => s.id !== statusId);
  return participant;
}

export function hasStatus(participant, statusId) {
  return participant.statuses.some((s) => s.id === statusId);
}

export function getStatus(participant, statusId) {
  return participant.statuses.find((s) => s.id === statusId) ?? null;
}

/** 清掉這一輪該過期的狀態。新的一輪開始時呼叫。 */
export function expireStatuses(participant, round) {
  participant.statuses = participant.statuses.filter(
    (s) => s.expiresRound == null || s.expiresRound > round
  );
  return participant;
}

// --- 戰鬥紀錄 ---

/**
 * 寫一筆公開紀錄（規格第7.1節G區）。**只有這個函式能寫 publicLog**，
 * 因為它是唯一保證「不會不小心把秘密 DC/骰池寫進玩家看得到的地方」的入口：
 * 它只收 text 與一組具名的公開欄位，收不進 attackResult 那種整包內部結果。
 */
export function pushLog(battle, { actor, text, kind = "info", round }) {
  battle.publicLog.push({
    seq: battle.publicLog.length + 1,
    round: round ?? battle.round,
    actor: actor ?? "system",
    kind,
    text,
  });
  // 紀錄無上限會讓存檔一直長大，而玩家實際上只掃讀最近的幾十行。
  if (battle.publicLog.length > 120) battle.publicLog = battle.publicLog.slice(-120);
  return battle;
}

/** 每一次狀態改變都要走這裡，讓 stateVersion 不可能忘記 +1（規格第8.4節）。 */
export function bumpStateVersion(battle) {
  battle.stateVersion += 1;
  return battle;
}

/** 取這場戰鬥的擲骰器；用完要 commitRng() 把 cursor 寫回去。 */
export function battleRng(battle) {
  return createRng(battle.seed, battle.rngCursor ?? 0);
}

export function commitRng(battle, rng) {
  battle.rngCursor = rng.cursor;
  return battle;
}

/**
 * 戰鬥是否結束（規格第9節第13點）。玩家倒下＝敗，敵人全倒＝勝，
 * 玩家成功脫離＝撤離。判定集中在這裡，前端與敘事層都不做這個判斷。
 */
export function evaluateBattleEnd(battle) {
  if (battle.outcome) return battle.outcome;
  const player = playerOf(battle);
  if (isDown(player)) return { over: true, winner: "enemy", reason: "player_down" };
  if (livingEnemies(battle).length === 0) return { over: true, winner: "player", reason: "enemies_down" };
  return { over: false, winner: null, reason: null };
}

/**
 * 把戰鬥收尾。
 *
 * 以「輪」計時的型態在這裡結束（戰鬥外沒有輪可以數），以「場景」計時的**留著**——
 * 打一場架不會改變你站在哪裡，它要等玩家離開這個地點才由 expireOnSceneChange() 收掉。
 * 這是舊流程既有的判斷（見 encounterState.js 的 finalizeIfOver），V2 沿用同一套。
 */
export function finalizeBattle(battle, outcome) {
  battle.active = false;
  battle.phase = BATTLE_PHASES.ENDED;
  battle.outcome = { ...outcome, endedAtRound: battle.round };
  if (battle.forms) {
    const ended = endCombatForms(battle.forms);
    battle.forms = ended.formsState;
    for (const form of ended.expired) {
      pushLog(battle, { actor: "player", kind: "info", text: `${form.label} 隨戰鬥結束。` });
    }
  }
  return battle;
}

/**
 * 進入下一輪：重置所有人的動作額度、過期狀態、抽新的意圖預告。
 * **不判斷「因為用了整輪動作所以回合結束」**——回合會不會結束是玩家按下確認之後
 * 由結算結果決定的，不是由某個 actionType 決定的（規格第2.4節）。
 */
export function beginNextRound(battle) {
  battle.round += 1;
  battle.phase = BATTLE_PHASES.PLAYER_SELECTION;
  const rng = battleRng(battle);
  for (const p of battle.participants) {
    battle.budgets[p.id] = createActionBudget();
    expireStatuses(p, battle.round);
  }
  for (const enemy of enemiesOf(battle)) {
    if (!isDown(enemy)) enemy.currentTelegraph = rng.pick(enemy.telegraphs) ?? null;
  }
  commitRng(battle, rng);
  pushLog(battle, { actor: "system", kind: "round", text: `第 ${battle.round} 輪開始。` });
  tickForms(battle);
  return battle;
}

/**
 * 型態的「輪」時鐘。新的一輪開始、額度剛重置之後跑，所以：
 *   - 「持續1輪」的型態在啟動的那一輪內完整有效，下一輪開始才消失
 *   - 維持成本花的是**這一輪剛拿到的**額度，不是上一輪的殘額
 * 兩點都跟舊流程（encounterState.js 的 advanceTurn）一致——同一套型態規則在兩個戰鬥
 * 系統裡不該有不同的到期時機。
 *
 * 動作額度的扣法是 V2 自己的：payUpkeep() 傳 `budget: null` 讓它只收意志力與能量池，
 * 動作那一份由這裡用 V2 的計數池扣。付不出動作額度時型態當場結束，跟付不出錢一樣。
 */
function tickForms(battle) {
  if (!battle.forms || !battle.character) return battle;

  const ticked = tickFormsOnRound(battle.forms, battle.round);
  battle.forms = ticked.formsState;
  for (const form of ticked.expired) {
    pushLog(battle, { actor: "player", kind: "info", text: `${form.label} 已到期。` });
  }

  // 先扣動作額度（V2 的池子），再讓 forms.js 收意志力／能量池。
  // 順序反過來的話，會出現「錢付了但動作不夠」而錢收不回來的半套狀態。
  const stillActive = [];
  for (const form of battle.forms.active ?? []) {
    if (!form.upkeep?.action) {
      stillActive.push(form);
      continue;
    }
    const actionType = fromLegacyActionLevel(form.upkeep.action);
    const spend = actionType
      ? spendAction(battle.budgets.player, actionType, {}, { actionId: `upkeep:${form.formId}`, label: form.label, round: battle.round })
      : { ok: false, reason: `維持成本的動作等級「${form.upkeep.action}」沒有對應到五類動作` };
    if (!spend.ok) {
      pushLog(battle, { actor: "player", kind: "info", text: `${form.label} 結束（${spend.reason}）。` });
      continue;
    }
    battle.budgets.player = spend.budget;
    // 維持成本花掉的動作額度要寫進紀錄。「自由動作」在 V2 映成迅捷（見 actionTypes.js 的
    // LEGACY_ACTION_LEVEL_TO_V2），那是一個真的會少一個行動的代價——不講的話，玩家
    // 只會看到自己這一輪的迅捷莫名其妙不見了。
    pushLog(battle, {
      actor: "player",
      kind: "info",
      text: `維持${form.label}消耗了${ACTION_TYPE_LABELS[actionType]}。`,
    });
    stillActive.push(form);
  }
  battle.forms = { ...battle.forms, active: stillActive };

  const upkeep = payUpkeep(battle.forms, battle.character, battle.round, null);
  battle.forms = upkeep.formsState;
  battle.character = upkeep.character;
  for (const paid of upkeep.paid) {
    const cost = [
      paid.willpower > 0 ? `${paid.willpower} 點意志力` : null,
      paid.pool ? `${paid.pool.amount} 點${paid.pool.name}` : null,
    ].filter(Boolean).join("＋");
    pushLog(battle, { actor: "player", kind: "info", text: `維持${paid.label}${cost ? `，付出 ${cost}` : ""}。` });
  }
  for (const form of upkeep.ended) {
    pushLog(battle, { actor: "player", kind: "info", text: `${form.label} 結束（${form.endReason}）。` });
  }
  return battle;
}
