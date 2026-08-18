// [設計] 單敵人戰鬥遭遇的狀態機——把 core/combat/ 的引擎模組（先攻、行動經濟、命中判定、
// 傷害減免、生命值）接成一場「玩家 vs 一個敵人」的完整回合制流程。
//
// 範圍限制（刻意，MVP）：
//   - 只支援一對一（玩家 vs 單一敵人），不支援多敵人/隊友——多參戰單位需要重新設計
//     session 的資料形狀（陣營列表而非單一對手），留到之後有實際需求再做。
//   - 敵人 AI 是固定行為（永遠用自己配備的唯一武器攻擊），不做任何戰術決策，因為
//     「AI 不做算術」的最高原則同樣適用在敵人身上——敵人的行動不需要用到 LLM。
//   - 武器/敵人資料來自 content/combat/placeholderEncounters.js 的臨時佔位資料，
//     不是真實資源型錄，見該檔案的檔頭說明。
//   - 戰鬥判定本身完全不呼叫 AI；AI 只在戰鬥結束後，透過既有的 /api/turn 敘事迴圈
//     把結果寫成故事（呼叫端自己組一句 playerAction 摘要餵回去）。
//
// [決策記錄 2026-08-15] 底下呼叫 resolveCombatAction() 時組出的 defenderCombatProfile
// 已經改用單一DC+單一護甲值的簡化形狀（見 core/character.js 的 emptyCombatProfile()），
// 技能補正固定取「格鬥/體魄兩者較高者」，對應使用者新規則的「技能補正(格鬥/體魄)」。

import { rollInitiative, determineTurnOrder } from "../../core/combat/turnOrder.js";
import { createActionBudget } from "../../core/combat/actionEconomy.js";
import { resolveCombatAction } from "../../core/combat/resolveCombatAction.js";
import { emptyCombatProfile } from "../../core/character.js";
import { createHpState } from "../../core/health.js";
import { computeDerivedStats } from "../../core/derivedStats.js";
import { combatProfileFrom, weaponsFrom, attackModifiersFor } from "../shop/effects.js";
import {
  createFormsState,
  formsOf,
  activateForm,
  activeGrantSources,
  tickFormsOnRound,
  payUpkeep,
  variablePaymentRange,
  endCombat,
} from "../shop/forms.js";
import { PLACEHOLDER_WEAPONS, buildAttackParams, PLACEHOLDER_ENEMY } from "./placeholderEncounters.js";

/**
 * 玩家這一刻能用的武器表 = 佔位武器 ＋ 商店買到的武器 ＋ 進行中型態授予的天生武器。
 * 後者兩項來自 content/shop/effects.js 的 weaponsFrom()，型態一到期，天生武器就跟著
 * 從這張表裡消失(不需要有人記得收回)。
 */
export function playerWeapons(combat, character) {
  const table = { ...PLACEHOLDER_WEAPONS };
  for (const weapon of weaponsFrom(character, { extraSources: activeGrantSources(combat.forms) })) {
    table[weapon.key] = weapon;
  }
  return table;
}

/**
 * 玩家的防御/護甲檔案。改用 combatProfileFrom() 之後，商品與型態給的
 * 防御/護甲/先攻才會真的進到命中判定裡——在此之前這裡是寫死的 emptyCombatProfile()，
 * 也就是說買了防具也不會變難打(見 ARCHITECTURE.md 2026-08-17 的接線決策記錄)。
 */
export function playerCombatProfile(combat, character) {
  return combatProfileFrom(character, {
    skillCorrection: Math.max(character.skills?.格鬥 ?? 0, character.skills?.體魄 ?? 0),
    extraSources: activeGrantSources(combat.forms),
  });
}

/**
 * [設計 2026-08-17] **這一輪玩家按得下去的東西**，由引擎算好給 UI 畫。
 *
 * 為什麼是引擎算：本專案第4條最高原則對前端一樣適用。在這個函式出現之前，戰鬥畫面的
 * 行動按鈕是 index.html 裡**寫死的兩顆**（徒手、手槍），於是有兩個後果：
 *
 * 1. **買到的武器在戰鬥裡按不到。** 引擎其實吃得下（`resolvePlayerAttack()` 內部就是查
 *    `playerWeapons()`），但 UI 從來沒問過那張表——買了審判眼的龍骨炮也只能徒手打。
 * 2. **戰鬥中變不了身。** `resolveFormActivation()` 在 2026-08-17 之前**沒有任何正式呼叫端**，
 *    血統/瞳術那一整類商品的價值在戰鬥裡完全按不下去。
 *
 * 兩件事是同一個病：引擎做得到、沒有人問它。所以這裡一次把兩張表都給出去。
 */
export function combatOptions(combat, character) {
  const weapons = Object.entries(playerWeapons(combat, character)).map(([key, w]) => ({
    key,
    label: w.label ?? key,
    attackType: w.attackType,
    weaponDamage: w.weaponDamage,
    ranged: w.ranged ?? false,
    // 型態授予的天生武器，型態一結束就會從這張表消失，UI 標一下讓玩家知道它是暫時的
    fromForm: (combat.forms?.active ?? []).some((f) => key.startsWith(`${f.formId}`)),
  }));
  const forms = formsOf(character).map((f) => ({
    formId: f.formId,
    label: f.effect.label,
    sourceName: f.sourceName,
    activation: f.effect.activation,
    duration: f.effect.duration,
    upkeep: f.effect.upkeep ?? null,
    // 玩家在啟動當下要做的兩個決定，範圍由引擎算好給 UI 畫(前端不自己算上限——
    // 「最多不超過敏捷或感知取低」是規則，不是介面細節)。
    variable: variablePaymentRange(f.effect, character),
    modes: (f.effect.modes ?? []).map((m) => ({ key: m.key, label: m.label })),
    active: (combat.forms?.active ?? []).some((a) => a.formId === f.formId),
  }));
  return { weapons, forms };
}

/**
 * [設計 2026-08-18] 抽一句敵人的意圖預告（見 Phase 5.3 任務5）。
 *
 * 抽取時機是**每一輪開始、玩家選行動之前**（createEncounter 與 advanceTurn 跨輪那一刻），
 * 所以玩家按下攻擊鍵之前就看得到「牠正在做什麼」——按完才知道等於沒有預告。
 *
 * pickFn 是依賴注入的隨機來源，跟戰鬥骰子的 rollFn 同一個約定：測試要能鎖住結果，
 * 不然這個功能只能靠肉眼看畫面驗證。預設用 Math.random，敵人沒有 telegraphs 資料
 * （舊的敵人樣板、echoInstitute 的 bossEncounter）就回 null——沒有預告不是錯誤，
 * 只是那隻怪還沒寫預告文案，戰鬥照常進行。
 *
 * @param {string[]} [telegraphs]
 * @param {() => number} [pickFn] 回傳 [0,1) 的亂數
 * @returns {string | null}
 */
export function pickTelegraph(telegraphs, pickFn = Math.random) {
  if (!Array.isArray(telegraphs) || telegraphs.length === 0) return null;
  const index = Math.min(telegraphs.length - 1, Math.max(0, Math.floor(pickFn() * telegraphs.length)));
  return telegraphs[index];
}

/**
 * 建立一場新的戰鬥遭遇。雙方各擲一次先攻，決定行動順序。
 * @param {object} character 玩家角色卡（core/schema.js 形狀，需要 attributes/skills/derived.hp）
 * @param {object} [enemyTemplate] 預設用 PLACEHOLDER_ENEMY
 * @param {{ forms?: object, pickFn?: Function }} [opts] forms：content/shop/forms.js 的型態狀態。
 *   帶進來的話，戰鬥中的變身會扣它、也會由它到期；不帶就是一份空的。
 *   pickFn：抽敵人意圖預告用的亂數來源（測試用依賴注入，見 pickTelegraph）。
 */
export function createEncounter(character, enemyTemplate = PLACEHOLDER_ENEMY, { forms, pickFn } = {}) {
  // 開戰當下就先驗武器，不要等到敵人第一次揮拳才炸——那時候戰鬥已經寫進存檔了，
  // 玩家會卡在一場永遠打不下去的戰鬥裡（見 /api/combat/act 的錯誤處理）。
  if (!PLACEHOLDER_WEAPONS[enemyTemplate.weaponKey]) {
    throw new Error(
      `敵人樣板「${enemyTemplate.name}」的武器「${enemyTemplate.weaponKey}」不在武器型錄裡` +
        `（可用的有：${Object.keys(PLACEHOLDER_WEAPONS).join("/")}）。` +
        `請檢查該樣板的 weaponKey，見 content/combat/placeholderEncounters.js`
    );
  }

  const enemyDerived = computeDerivedStats(enemyTemplate.attributes, { size: enemyTemplate.size ?? 5 });

  const formsState = forms ?? createFormsState();
  // 商品/型態給的先攻加值要進開戰的那一擲。型態在開戰當下通常還沒啟動(變身本身要花動作)，
  // 但持有物的先攻加值一定算數，先前這裡完全沒有讀它。
  const { initiativeBonus } = combatProfileFrom(character, {
    extraSources: activeGrantSources(formsState),
  });
  const playerInitiative = rollInitiative(character.derived.initiative + initiativeBonus);
  const enemyInitiative = rollInitiative(enemyDerived.initiative);

  const { order, needsManualTieBreak } = determineTurnOrder([
    { id: "player", initiative: playerInitiative, agility: character.attributes?.敏捷 ?? 1 },
    { id: "enemy", initiative: enemyInitiative, agility: enemyTemplate.attributes.敏捷 ?? 1 },
  ]);

  return {
    active: true,
    round: 1,
    turnIndex: 0,
    order,
    winner: null,
    initiative: { player: playerInitiative, enemy: enemyInitiative, needsManualTieBreak },
    forms: formsState,
    player: {
      hpState: { ...character.derived.hp },
      budget: createActionBudget(),
    },
    enemy: {
      name: enemyTemplate.name,
      attributes: enemyTemplate.attributes,
      skills: enemyTemplate.skills,
      weaponKey: enemyTemplate.weaponKey,
      armor: enemyTemplate.armor ?? 0,
      hpState: createHpState(enemyDerived.hp.max),
      budget: createActionBudget(),
      // 意圖預告的文案跟著戰鬥狀態一起進存檔：續戰的玩家（重整頁面回來）也要看得到
      // 同一隻敵人的預告，不能因為敵人樣板是從別的地方查來的就變成空的。
      telegraphs: enemyTemplate.telegraphs ?? [],
    },
    // 這一輪敵人的意圖預告。**第一輪在這裡就先抽好**，玩家開戰後第一次做決定之前就看得到。
    currentTelegraph: pickTelegraph(enemyTemplate.telegraphs, pickFn ?? Math.random),
    log: [],
  };
}

export function isCombatOver(combat) {
  if (combat.enemy.hpState.dead || combat.enemy.hpState.unconscious) {
    return { over: true, winner: "player" };
  }
  if (combat.player.hpState.dead || combat.player.hpState.unconscious) {
    return { over: true, winner: "enemy" };
  }
  return { over: false, winner: null };
}

/**
 * 推進行動順位。回到第一個人＝新的一輪，於是這裡是引擎唯一會週期性回頭處理型態的地方：
 * 先讓時鐘走完的型態到期，再向還活著的型態收維持成本。
 *
 * @param {object} combat 直接被修改
 * @param {object} character 角色卡(不修改)
 * @returns {object} 扣完維持成本的角色卡——**呼叫端有義務把它存回去**，
 *   跟 resolveFormActivation() 回傳 character 是同一個約定。沒有存回去的話，
 *   維持成本會每輪都「扣了但沒扣」，型態就變成免費的。
 */
function advanceTurn(combat, character, { pickFn } = {}) {
  const nextIndex = (combat.turnIndex + 1) % combat.order.length;
  combat.turnIndex = nextIndex;
  if (nextIndex !== 0) return character;

  combat.round += 1;
  combat.player.budget = createActionBudget();
  combat.enemy.budget = createActionBudget();
  // 新的一輪＝新的意圖預告。抽在這裡（而不是敵人攻擊完之後）是刻意的：
  // 這一行執行完，行動順位才回到玩家身上，所以玩家永遠是「先看到預告，再決定要做什麼」。
  combat.currentTelegraph = pickTelegraph(combat.enemy.telegraphs, pickFn ?? Math.random);
  // 型態的唯一「輪」時鐘就在這裡。新的一輪開始時才結算到期，所以「持續1輪」的型態
  // 在啟動的那一輪內完整有效，下一輪開始才消失。
  const ticked = tickFormsOnRound(combat.forms, combat.round);
  combat.forms = ticked.formsState;
  for (const form of ticked.expired) {
    combat.log.push({ actor: "player", event: "型態到期", label: form.label, round: combat.round });
  }

  // 維持成本(書上的「每輪需以一個自由動作支付1點內力維持此效果」)。
  // 動作額度用剛重置的這一輪的——維持動作是真的要從這一輪的額度裡花掉的，
  // 不是一個只寫在資料裡的裝飾。
  const upkeep = payUpkeep(combat.forms, character, combat.round, combat.player.budget);
  combat.forms = upkeep.formsState;
  combat.player.budget = upkeep.budget;
  for (const p of upkeep.paid) {
    combat.log.push({ actor: "player", event: "型態維持", label: p.label, round: combat.round });
  }
  for (const form of upkeep.ended) {
    combat.log.push({
      actor: "player",
      event: "型態到期",
      label: form.label,
      round: combat.round,
      reason: form.endReason,
    });
  }
  return upkeep.character;
}

function finalizeIfOver(combat) {
  const status = isCombatOver(combat);
  if (status.over) {
    combat.active = false;
    combat.winner = status.winner;
    // [修正 2026-08-17] 戰鬥結束**不等於**場景結束。使用者把場景定義成「當下所在的地點」，
    // 而打一場架不會改變你站在哪裡——所以只收以「輪」計時的型態(戰鬥外沒有輪可以數)，
    // 以「場景」計時的跟著 combat.forms 一起被呼叫端帶回 session.forms，
    // 直到玩家離開這個地點才由 expireOnSceneChange() 收掉。
    const ended = endCombat(combat.forms);
    combat.forms = ended.formsState;
    for (const form of ended.expired) {
      combat.log.push({ actor: "player", event: "型態到期", label: form.label, round: combat.round });
    }
  }
  return status;
}

/**
 * 在戰鬥中啟動一個型態(變身/開眼/爆發)。這是玩家的一個行動，會扣意志力與動作額度。
 * 不推進行動順位——書上這類啟動花的是移動/自由動作，玩家本輪還可以出手攻擊。
 *
 * @returns {{ ok: boolean, blockers?: object[], combat: object, character?: object }}
 *   character 是扣完意志力的新角色卡，呼叫端有義務存回去(這個模組不改角色卡本身，
 *   跟 resolveEnemyAttack() 回傳 newHpState 的約定一致)。
 */
export function resolveFormActivation(combat, character, formId, { amount = null, mode = null } = {}) {
  if (!combat.active) throw new Error("戰鬥已經結束");
  if (combat.order[combat.turnIndex] !== "player") throw new Error("現在不是玩家的行動順位");

  const result = activateForm(character, combat.forms, formId, {
    round: combat.round,
    budget: combat.player.budget,
    amount,
    mode,
  });
  if (!result.ok) return { ok: false, blockers: result.blockers, combat };

  combat.forms = result.formsState;
  combat.player.budget = result.budget;
  combat.log.push({
    actor: "player",
    event: "型態啟動",
    label: result.form.label,
    round: combat.round,
  });
  return { ok: true, combat, character: result.character, form: result.form };
}

/**
 * 玩家攻擊敵人。呼叫端(API層)要先確認 combat.order[combat.turnIndex] === "player"。
 * @param {object} combat createEncounter() 回傳的物件（會被直接修改並回傳同一份參照）
 * @param {object} character 玩家角色卡
 * @param {keyof PLACEHOLDER_WEAPONS} weaponKey
 */
export function resolvePlayerAttack(combat, character, weaponKey, { rollFn, pickFn } = {}) {
  if (!combat.active) throw new Error("戰鬥已經結束");
  if (combat.order[combat.turnIndex] !== "player") throw new Error("現在不是玩家的行動順位");

  const available = playerWeapons(combat, character);
  const weapon = available[weaponKey];
  if (!weapon) {
    throw new Error(`不合法的武器：${weaponKey}（可用的有：${Object.keys(available).join("/")}）`);
  }

  const attackParams = buildAttackParams(weapon.attackType, character, weapon);
  // 商品/型態給的攻擊加值。在這行出現之前，玩家買到的檢定加值只影響敘事迴圈的檢定，
  // 戰鬥攻擊完全吃不到——同一個「+2DP」在兩種場合行為不一致。
  const attackMods = attackModifiersFor(character, weapon.attackType, {
    extraSources: activeGrantSources(combat.forms),
  });

  const result = resolveCombatAction({
    attackType: weapon.attackType,
    attackParams,
    attackDpModifier: attackMods.dp,
    attackBonusSuccesses: attackMods.bonusSuccesses,
    distance: 0,
    weaponRange: weapon.weaponRange ?? Infinity,
    defenderAttributes: combat.enemy.attributes,
    defenderCombatProfile: {
      ...emptyCombatProfile(),
      skillCorrection: Math.max(combat.enemy.skills?.格鬥 ?? 0, combat.enemy.skills?.體魄 ?? 0),
      armor: combat.enemy.armor ?? 0,
    },
    defenderHpState: combat.enemy.hpState,
    severity: weapon.severity,
    ...(rollFn ? { rollFn } : {}),
  });

  combat.enemy.hpState = result.newHpState;
  combat.log.push({ actor: "player", weaponKey, ...summarizeResult(result) });

  const status = finalizeIfOver(combat);
  // 回傳的 character 可能因為維持成本而變(見 advanceTurn)，呼叫端要存回去。
  const nextCharacter = status.over ? character : advanceTurn(combat, character, { pickFn });

  return { result, combat, character: nextCharacter };
}

/**
 * 敵人攻擊玩家（固定行為：用自己配備的武器攻擊）。呼叫端要先確認輪到敵人行動。
 * 回傳的 result.newHpState 要由呼叫端同步回 character.derived.hp（這個模組不改角色卡本身）。
 */
export function resolveEnemyAttack(combat, character, { rollFn, pickFn } = {}) {
  if (!combat.active) throw new Error("戰鬥已經結束");
  if (combat.order[combat.turnIndex] !== "enemy") throw new Error("現在不是敵人的行動順位");

  // 敵人的武器一律查表，查不到就明確報錯——先前這裡直接讀 weapon.attackType，
  // 敵人樣板寫了一個型錄裡沒有的 weaponKey 時會丟 "Cannot read properties of undefined"，
  // 看log的人完全不知道要去改哪一份資料。目前內建敵人都是 unarmed 所以碰不到，
  // 但之後新增boss樣板時這是最容易踩的一格。
  const weapon = PLACEHOLDER_WEAPONS[combat.enemy.weaponKey];
  if (!weapon) {
    throw new Error(
      `敵人「${combat.enemy.name}」的武器「${combat.enemy.weaponKey}」不在武器型錄裡` +
        `（可用的有：${Object.keys(PLACEHOLDER_WEAPONS).join("/")}）。` +
        `請檢查該敵人樣板的 weaponKey，見 content/combat/placeholderEncounters.js`
    );
  }
  const attackParams = buildAttackParams(weapon.attackType, {
    attributes: combat.enemy.attributes,
    skills: combat.enemy.skills,
  }, weapon);

  const result = resolveCombatAction({
    attackType: weapon.attackType,
    attackParams,
    distance: 0,
    weaponRange: weapon.weaponRange ?? Infinity,
    defenderAttributes: character.attributes,
    defenderCombatProfile: playerCombatProfile(combat, character),
    defenderHpState: combat.player.hpState,
    severity: weapon.severity,
    ...(rollFn ? { rollFn } : {}),
  });

  combat.player.hpState = result.newHpState;
  combat.log.push({ actor: "enemy", weaponKey: weapon.key, ...summarizeResult(result) });

  const status = finalizeIfOver(combat);
  const nextCharacter = status.over ? character : advanceTurn(combat, character, { pickFn });

  return { result, combat, character: nextCharacter };
}

/**
 * 若敵人贏得先攻、搶在玩家之前行動，開戰當下就要先把敵人的開場攻擊解決掉，
 * 不然玩家永遠等不到自己的行動順位（/api/combat/act 只接受玩家發起）。
 * 只有兩個參戰單位時最多執行一次，但寫成迴圈以防未來擴充成多參戰單位。
 *
 * [2026-08-17 第九輪] 回傳形狀從「結果陣列」改成 `{ results, character }`：迴圈裡每一次
 * 敵人攻擊都可能跨過一輪的界線，而跨過界線就要收維持成本。回傳陣列的話那筆扣款無處可去。
 * @returns {{ results: object[], character: object }}
 */
export function resolveLeadingEnemyTurns(combat, character, { rollFn, pickFn } = {}) {
  const results = [];
  let current = character;
  while (combat.active && combat.order[combat.turnIndex] === "enemy") {
    const attack = resolveEnemyAttack(combat, current, { rollFn, pickFn });
    current = attack.character;
    results.push(attack.result);
  }
  return { results, character: current };
}

function summarizeResult(result) {
  return {
    hit: result.hit,
    damage: result.finalDamage,
    rawSuccesses: result.attackResult?.rawSuccesses ?? null,
    // 傷害嚴重度標籤（core/combat/resolveCombatAction.js 算的）。寫進戰鬥紀錄是為了讓
    // 前端的戰鬥log與之後餵給AI的戰鬥摘要拿得到同一份文字，不用各自再推論一次。
    damageSeverity: result.damageSeverity ?? null,
    damageSeverityTag: result.damageSeverityTag ?? null,
  };
}
