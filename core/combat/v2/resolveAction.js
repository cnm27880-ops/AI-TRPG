// Combat V2 —— 單一玩家行動的規則結算（規格第9節）。
//
// 這裡是「規則說這一下發生了什麼」的唯一答案來源。命中、傷害、距離、資源、狀態
// 全部在這一層算完；敘事層（LLM）只會拿到算完之後的公開摘要，不能改動任何一個數字
// （規格第9節的禁止清單）。
//
// 每個結算函式的約定：
//   - 直接修改 battle（呼叫端已經在一份可寫的副本上）
//   - 回傳 { ok, summary, publicText, effects }，publicText 就是要寫進戰鬥紀錄的那一行
//   - 需要擲骰時一律用傳進來的 rng（戰鬥自己的可重播亂數，見 rng.js），不呼叫 Math.random

import { resolveCombatAction } from "../resolveCombatAction.js";
import { emptyCombatProfile } from "../../character.js";
import { healDamage } from "../../health.js";
import { buildAttackParams, COMBAT_WEAPONS } from "../../../content/combat/v2/weapons.js";
import {
  addStatus,
  getParticipant,
  getRange,
  getStatus,
  hasStatus,
  isDown,
  publicHealthTier,
  removeStatus,
  setRange,
} from "./battleState.js";
import { RANGE_LABELS, canChangeRange, stepRange } from "./range.js";
import { seededRollFn } from "./rng.js";
import {
  consumeAmmo,
  consumeItem,
  findWeapon,
  reloadWeapon,
  rebuildWeapons,
  usableWeaponsOfCategory,
} from "../../../content/combat/v2/loadout.js";
import { activateForm, activeGrantSources } from "../../../content/shop/forms.js";
import { attackModifiersFor } from "../../../content/shop/effects.js";

/** 狀態效果的具名定義。每一個都要有公開文案——玩家看得懂身上有什麼才能做決定。 */
export const STATUS_DEFS = Object.freeze({
  cover: { id: "cover", label: "掩體", description: "身形被遮蔽，較難被命中。", defenseBonus: 2 },
  hunkered: { id: "hunkered", label: "低身形", description: "壓低重心，較難被命中，但出手比較勉強。", defenseBonus: 1, attackPenalty: 1 },
  aiming: { id: "aiming", label: "鎖定", description: "已鎖定目標，本輪對牠的攻擊更容易奏效。", bonusSuccesses: 1 },
  flanking: { id: "flanking", label: "側翼", description: "站在目標側面，本輪攻擊更容易奏效。", defenseReduction: 1 },
  grappled: { id: "grappled", label: "被擒抱", description: "被壓制住，無法移動。" },
  suppressed: { id: "suppressed", label: "被壓制", description: "被火力壓住，行動受限。" },
  darkness: { id: "darkness", label: "黑暗", description: "照明被切斷，所有人都難以瞄準。", attackPenalty: 2 },
  entry_held: { id: "entry_held", label: "入口被封鎖", description: "從那個方向靠近會被拖慢。" },
  covered_ally: { id: "covered_ally", label: "受到掩護", description: "有人替你壓住火力。", defenseBonus: 2 },
});

/** 目前這個參戰者的防禦加值（掩體、低身形、隊友掩護疊加）。 */
export function defenseBonusOf(participant) {
  return participant.statuses.reduce((sum, status) => sum + (STATUS_DEFS[status.id]?.defenseBonus ?? 0), 0);
}

/** 目前這個參戰者攻擊時的 DP 減值（低身形、黑暗）。 */
export function attackPenaltyOf(participant, battle) {
  let penalty = participant.statuses.reduce(
    (sum, status) => sum + (STATUS_DEFS[status.id]?.attackPenalty ?? 0),
    0
  );
  if (battle.scene.lightsOut) penalty += STATUS_DEFS.darkness.attackPenalty;
  return penalty;
}

/**
 * 一次攻擊的完整判定。攻守雙方都走這一條，所以敵人的攻擊不可能用到跟玩家不同的公式。
 *
 * @returns {{ hit: boolean, damage: number, severityTag: string, newHpState: object }}
 */
export function performAttack({ battle, attacker, defender, weapon, rng, extraBonusSuccesses = 0 }) {
  const attackParams = buildAttackParams(
    weapon.attackType,
    { attributes: attacker.attributes, skills: attacker.skills },
    weapon
  );

  // 側翼優勢寫成「降低目標的技能補正」，不是「攻擊方多骰」——繞到側面削弱的是對方的
  // 防備，不是讓你突然更會打。這個區別會在數學上表現出來（防禦DC下降對低DP的角色幫助更大）。
  const flanking = getStatus(attacker, `flanking@${defender.id}`);
  const aiming = getStatus(attacker, `aiming@${defender.id}`);
  const defenseReduction = flanking ? STATUS_DEFS.flanking.defenseReduction : 0;

  // 商品與型態給的攻擊加值。**沒有這一段，玩家買到的「攻擊 +2DP」在戰鬥裡完全吃不到**——
  // 同一個加值在敘事迴圈的檢定生效、在戰鬥裡卻無聲消失，那是最難查的一種不一致。
  // 只有玩家有角色卡；敵人的加值寫在牠自己的樣板數值裡，沒有商品這一層。
  const mods = attacker.id === "player" && battle.character
    ? attackModifiersFor(battle.character, weapon.attackType, { extraSources: activeGrantSources(battle.forms) })
    : { dp: 0, bonusSuccesses: 0 };

  const result = resolveCombatAction({
    attackType: weapon.attackType,
    attackParams,
    attackDpModifier: mods.dp - attackPenaltyOf(attacker, battle),
    attackBonusSuccesses:
      (aiming ? STATUS_DEFS.aiming.bonusSuccesses : 0) + extraBonusSuccesses + (mods.bonusSuccesses ?? 0),
    // 距離減值：三段距離對應的公尺數是給遠程武器射程公式用的近似值。
    // 三段距離本身仍然是規則上的真實狀態，這裡只是把它翻成 attackTypes.rangePenalty() 吃的形狀。
    distance: rangeToMeters(getRange(battle, attacker.id, defender.id)),
    weaponRange: weapon.weaponRange ?? Infinity,
    defenderAttributes: defender.attributes,
    defenderCombatProfile: {
      ...emptyCombatProfile(),
      skillCorrection: Math.max(
        0,
        Math.max(defender.skills?.格鬥 ?? 0, defender.skills?.體魄 ?? 0) - defenseReduction
      ),
      equipmentDefense: (defender.combatProfile?.equipmentDefense ?? 0) + defenseBonusOf(defender),
      armor: defender.armor ?? 0,
    },
    defenderHpState: defender.hpState,
    severity: weapon.severity ?? "B",
    rollFn: seededRollFn(rng),
  });

  return {
    hit: result.hit,
    damage: result.finalDamage,
    severityTag: result.damageSeverityTag,
    severityKey: result.damageSeverity,
    newHpState: result.newHpState,
  };
}

/** 三段距離對應的近似公尺數（只給遠程射程減值公式用，不是距離系統本身）。 */
function rangeToMeters(range) {
  return { close: 0, medium: 8, far: 25 }[range] ?? 0;
}

/** 挑一把符合類別、現在打得出來的武器。玩家沒有選武器 UI 時用「傷害最高的那把」。 */
function pickWeapon(loadout, category, preferredKey) {
  if (preferredKey) {
    const exact = findWeapon(loadout, preferredKey);
    if (exact && exact.category === category) return exact;
  }
  const usable = usableWeaponsOfCategory(loadout, category);
  return usable.sort((a, b) => (b.weaponDamage ?? 0) - (a.weaponDamage ?? 0))[0] ?? null;
}

// ---------------------------------------------------------------------------
// 結算函式表。resolutionKey -> 函式。
// ---------------------------------------------------------------------------

const RESOLVERS = {
  resolve_melee_strike: (ctx) => attackWith(ctx, "melee", { label: "近戰攻擊" }),
  resolve_firearm_shot: (ctx) => attackWith(ctx, "firearm", { label: "射擊", ammo: 1 }),

  resolve_grapple(ctx) {
    const { battle, target } = ctx;
    addStatus(target, { ...STATUS_DEFS.grappled, expiresRound: battle.round + 1 });
    return {
      ok: true,
      publicText: `你壓制住${target.name}，牠這一輪很難移動。`,
      effects: [{ type: "status_applied", targetId: target.id, statusId: "grappled" }],
    };
  },

  resolve_suppressing_fire(ctx) {
    const { battle, actor, target, rng } = ctx;
    const weapon = pickWeapon(battle.loadout, "firearm", ctx.parameters.weaponKey);
    if (!weapon) return { ok: false, reason: "需要一把可用槍械" };
    const spent = consumeAmmo(battle.loadout, weapon.key, 3);
    if (!spent) return { ok: false, reason: "彈藥不足" };
    battle.loadout = spent;

    const attack = performAttack({ battle, attacker: actor, defender: target, weapon, rng });
    if (attack.hit) target.hpState = attack.newHpState;
    addStatus(target, { ...STATUS_DEFS.suppressed, expiresRound: battle.round + 1 });
    return {
      ok: true,
      publicText: attack.hit
        ? `壓制射擊命中，${target.name}被打得抬不起頭。`
        : `壓制射擊沒有命中，但${target.name}被火力壓在原地。`,
      effects: [
        { type: "ammo_spent", weaponKey: weapon.key, rounds: 3 },
        { type: "status_applied", targetId: target.id, statusId: "suppressed" },
        ...(attack.hit ? [{ type: "damage", targetId: target.id, severityTag: attack.severityTag }] : []),
      ],
    };
  },

  resolve_all_out_assault(ctx) {
    const { battle, actor, target, rng } = ctx;
    const weapon = pickWeapon(battle.loadout, "melee", ctx.parameters.weaponKey);
    if (!weapon) return { ok: false, reason: "需要一件可用的近戰武器" };

    const before = getRange(battle, actor.id, target.id);
    // 全回合動作明確允許跨過中距離撲進接觸距離——這是規格第4節第2點所說的
    // 「除非能力明確允許跨越多格」，寫在這個行動自己的結算裡，而不是放寬全域規則。
    if (before !== "close") setRange(battle, actor.id, target.id, "close");
    removeStatus(actor, "cover");
    actor.coverFeatureId = null;

    const attack = performAttack({ battle, attacker: actor, defender: target, weapon, rng, extraBonusSuccesses: 1 });
    if (attack.hit) target.hpState = attack.newHpState;
    return {
      ok: true,
      publicText: attack.hit
        ? `你撲進接觸距離全力打擊，命中${target.name}。${attack.damage > 0 ? "" : "但牠擋下了大部分衝擊。"}`
        : `你撲進接觸距離全力打擊，但${target.name}側身閃開了。`,
      effects: [
        ...(before !== "close" ? [{ type: "range_changed", targetId: target.id, from: before, to: "close" }] : []),
        ...(attack.hit ? [{ type: "damage", targetId: target.id, severityTag: attack.severityTag }] : []),
      ],
    };
  },

  resolve_advance: (ctx) => moveRange(ctx, "closer", 1),
  resolve_withdraw: (ctx) => moveRange(ctx, "away", 1),

  resolve_flank(ctx) {
    const { battle, actor, target } = ctx;
    addStatus(actor, {
      ...STATUS_DEFS.flanking,
      id: `flanking@${target.id}`,
      // 側翼優勢只到本輪結束。expiresRound 是「哪一輪開始時清掉」，所以是下一輪。
      expiresRound: battle.round + 1,
    });
    removeStatus(actor, "cover");
    actor.coverFeatureId = null;
    return {
      ok: true,
      publicText: `你繞到${target.name}的側面。`,
      effects: [{ type: "status_applied", targetId: actor.id, statusId: "flanking" }],
    };
  },

  resolve_sprint_retreat(ctx) {
    const { battle, actor } = ctx;
    const changes = [];
    for (const enemy of battle.participants.filter((p) => p.side === "enemy" && !isDown(p))) {
      const from = getRange(battle, actor.id, enemy.id);
      const to = stepRange(from, "away", 2);
      if (from !== to) {
        setRange(battle, actor.id, enemy.id, to);
        changes.push({ type: "range_changed", targetId: enemy.id, from, to });
      }
    }
    removeStatus(actor, "cover");
    actor.coverFeatureId = null;
    return {
      ok: changes.length > 0,
      reason: changes.length ? null : "你已經在最遠的距離了",
      publicText: "你放棄還手，一口氣拉開距離。",
      effects: changes,
    };
  },

  resolve_take_cover(ctx) {
    const { battle, actor, feature } = ctx;
    actor.coverFeatureId = feature.id;
    addStatus(actor, { ...STATUS_DEFS.cover, sourceLabel: feature.label });
    return {
      ok: true,
      publicText: `你把${feature.label}當作掩體。`,
      effects: [{ type: "status_applied", targetId: actor.id, statusId: "cover", featureId: feature.id }],
    };
  },

  resolve_hunker_down(ctx) {
    const { battle, actor } = ctx;
    addStatus(actor, { ...STATUS_DEFS.hunkered, expiresRound: battle.round + 1 });
    return { ok: true, publicText: "你壓低身形。", effects: [{ type: "status_applied", targetId: actor.id, statusId: "hunkered" }] };
  },

  resolve_hold_entry(ctx) {
    const { battle, feature } = ctx;
    battle.scene.heldEntryId = feature.id;
    return {
      ok: true,
      publicText: `你把武器指向${feature.label}，守住那個方向。`,
      effects: [{ type: "scene_changed", featureId: feature.id, state: "held" }],
    };
  },

  resolve_focus_aim(ctx) {
    const { battle, actor, target } = ctx;
    addStatus(actor, { ...STATUS_DEFS.aiming, id: `aiming@${target.id}`, expiresRound: battle.round + 1 });
    return {
      ok: true,
      publicText: `你把注意力集中在${target.name}身上。`,
      effects: [{ type: "status_applied", targetId: actor.id, statusId: "aiming" }],
    };
  },

  resolve_cover_ally(ctx) {
    const { battle, target } = ctx;
    addStatus(target, { ...STATUS_DEFS.covered_ally, expiresRound: battle.round + 1 });
    return {
      ok: true,
      publicText: `你替${target.name}壓住火力。`,
      effects: [{ type: "status_applied", targetId: target.id, statusId: "covered_ally" }],
    };
  },

  resolve_assess_enemy(ctx) {
    const { target } = ctx;
    // 觀察只會給玩家**本來就看得到**的東西：公開生命狀態與可見狀態。
    // 不會給精確 HP、弱點或 AI 意圖——那些是秘密（規格第7.1節C區）。
    const visible = target.statuses.map((s) => s.label).filter(Boolean);
    return {
      ok: true,
      publicText: `你判斷${target.name}目前${publicHealthTier(target.hpState)}${visible.length ? `，${visible.join("、")}` : ""}。`,
      effects: [{ type: "intel", targetId: target.id }],
    };
  },

  resolve_env_close_door(ctx) {
    const { battle, feature } = ctx;
    feature.state = "closed";
    return {
      ok: true,
      publicText: `${feature.label}關上了。`,
      effects: [{ type: "scene_changed", featureId: feature.id, state: "closed" }],
    };
  },

  resolve_env_cut_lights(ctx) {
    const { battle, feature } = ctx;
    feature.state = "used";
    battle.scene.lightsOut = true;
    return {
      ok: true,
      publicText: "照明熄滅了，整個空間只剩下應急燈。",
      effects: [{ type: "scene_changed", featureId: feature.id, state: "used" }],
    };
  },

  resolve_env_drop_crane(ctx) {
    const { battle, feature, rng } = ctx;
    feature.state = "used";
    // 吊臂砸的是「所有在中距離以內的敵人」——環境攻擊不挑目標，這正是它的代價與威力。
    const hits = [];
    for (const enemy of battle.participants.filter((p) => p.side === "enemy" && !isDown(p))) {
      const range = getRange(battle, "player", enemy.id);
      if (range === "far") continue;
      const roll = rng.d10();
      if (roll >= 5) {
        enemy.hpState = { ...enemy.hpState };
        const attack = performAttack({
          battle,
          attacker: { attributes: { 力量: 6 }, skills: { 格鬥: 2 }, statuses: [], id: "environment" },
          defender: enemy,
          weapon: { key: "crane", attackType: "肉搏", weaponDamage: 4, severity: "L" },
          rng,
        });
        if (attack.hit) enemy.hpState = attack.newHpState;
        hits.push({ id: enemy.id, name: enemy.name, hit: attack.hit });
      } else {
        hits.push({ id: enemy.id, name: enemy.name, hit: false });
      }
    }
    return {
      ok: true,
      publicText: hits.some((h) => h.hit)
        ? `吊臂上的載重砸落，${hits.filter((h) => h.hit).map((h) => h.name).join("、")}被壓在下面。`
        : "吊臂上的載重砸落，但沒有砸中任何人。",
      effects: hits.map((h) => ({ type: h.hit ? "damage" : "miss", targetId: h.id })),
    };
  },

  resolve_reload(ctx) {
    const { battle } = ctx;
    const candidate = battle.loadout.weapons.find((w) => {
      const ammo = battle.loadout.ammo?.[w.key];
      return ammo && ammo.loaded < ammo.magazine && ammo.spareMagazines > 0;
    });
    if (!candidate) return { ok: false, reason: "沒有需要換彈的武器" };
    const next = reloadWeapon(battle.loadout, candidate.key);
    if (!next) return { ok: false, reason: "沒有備用彈匣了" };
    battle.loadout = next;
    return {
      ok: true,
      publicText: `你替${candidate.label}換上新的彈匣。`,
      effects: [{ type: "reloaded", weaponKey: candidate.key }],
    };
  },

  resolve_use_medkit(ctx) {
    const { battle, actor } = ctx;
    const next = consumeItem(battle.loadout, "medkit", 1);
    if (!next) return { ok: false, reason: "身上沒有醫療包了" };
    battle.loadout = next;
    // 戰鬥中的緊急處理只能拉回沖擊傷（B），嚴重傷與惡性傷要離開戰鬥才處理得了。
    actor.hpState = healDamage(actor.hpState, 2, "B");
    return {
      ok: true,
      publicText: "你用醫療包壓住傷口，狀況穩定了一些。",
      effects: [{ type: "healed", targetId: actor.id }],
    };
  },

  /**
   * 啟動一個型態（變身／開眼／爆發）。
   *
   * 動作額度**已經由 resolveTurn 用計數池扣掉了**。content/shop/forms.js 只管資源
   * （意志力／能量池）與期限，不碰動作額度——「這個型態要花一個迅捷動作」是戰鬥系統的
   * 規則，該由戰鬥系統用自己的模型執行。
   */
  resolve_activate_form(ctx) {
    const { battle, definition, parameters } = ctx;
    const character = battle.character;
    if (!character) return { ok: false, reason: "這場戰鬥沒有帶上角色卡，無法啟動型態" };

    const result = activateForm(character, battle.forms, definition.form.formId, {
      round: battle.round,
      sceneKey: battle.sceneKey ?? null,
      // 玩家在啟動當下的兩個決定。它們是**選擇**不是結果，所以可以由前端送上來——
      // 合法範圍仍然由 forms.js 驗（「不超過敏捷或感知取低」是規則，不是介面細節）。
      amount: Number.isInteger(parameters.amount) ? parameters.amount : null,
      mode: definition.form.modeKey ?? parameters.mode ?? null,
    });

    if (!result.ok) {
      // 變不成不是系統錯誤，是遊戲狀態。把 forms.js 列齊的理由原樣帶出去。
      return { ok: false, reason: result.blockers.map((b) => b.message).join("；") };
    }

    battle.forms = result.formsState;
    // activateForm 不改角色卡本身，它回傳一份扣完意志力／能量池的新卡，
    // **呼叫端有義務接住**（forms.js 的既有約定）。這裡接住，resolveTurn 再交還給 API 層存檔。
    battle.character = result.character;
    // 型態可能授予天生武器（金剛狼的骨爪那一類）。裝備表是開戰當下算好的，
    // 不重算的話那把武器這場戰鬥都按不到——型態就少了一半的價值。
    battle.loadout = rebuildWeapons(battle.loadout, result.character, activeGrantSources(battle.forms));

    const chose = [
      result.form.mode?.label,
      result.form.paid != null ? `支付 ${result.form.paid} 點` : null,
    ].filter(Boolean).join("，");
    return {
      ok: true,
      publicText: `你啟動了${result.form.label}${chose ? `（${chose}）` : ""}。`,
      effects: [{ type: "form_activated", formId: definition.form.formId, label: result.form.label }],
    };
  },

  resolve_drop_item(ctx) {
    const { battle } = ctx;
    const next = consumeItem(battle.loadout, "medkit", 1);
    if (!next) return { ok: false, reason: "身上沒有可以丟的東西了" };
    battle.loadout = next;
    return { ok: true, publicText: "你把手上的東西丟開。", effects: [{ type: "item_dropped", itemKey: "medkit" }] };
  },
};

/** 共用的攻擊結算（近戰與射擊差在武器類別與要不要扣彈藥）。 */
function attackWith(ctx, category, { label, ammo = 0 }) {
  const { battle, actor, target, rng } = ctx;
  const weapon = pickWeapon(battle.loadout, category, ctx.parameters.weaponKey);
  if (!weapon) return { ok: false, reason: category === "firearm" ? "需要一把可用槍械" : "需要一件可用的近戰武器" };

  if (ammo > 0) {
    const spent = consumeAmmo(battle.loadout, weapon.key, ammo);
    if (!spent) return { ok: false, reason: "彈藥不足" };
    battle.loadout = spent;
  }

  const attack = performAttack({ battle, attacker: actor, defender: target, weapon, rng });
  if (attack.hit) target.hpState = attack.newHpState;

  const down = isDown(target);
  return {
    ok: true,
    publicText: attack.hit
      ? `${label}命中${target.name}${attack.damage > 0 ? "" : "，但被護甲擋下"}。${down ? `${target.name}倒下了。` : ""}`
      : `${label}落空，${target.name}閃開了。`,
    // severityTag 是給敘事層的視覺提示（見 core/combat/resolveCombatAction.js），
    // 它不是數字，玩家看得到也不會洩漏任何規則資訊。
    severityTag: attack.severityTag,
    effects: [
      ...(ammo > 0 ? [{ type: "ammo_spent", weaponKey: weapon.key, rounds: ammo }] : []),
      attack.hit
        ? { type: "damage", targetId: target.id, severityTag: attack.severityTag, down }
        : { type: "miss", targetId: target.id },
    ],
  };
}

/** 共用的移動結算。距離的合法性由 range.js 判定，不在這裡重寫一份。 */
function moveRange(ctx, direction, steps) {
  const { battle, actor, target } = ctx;
  if (hasStatus(actor, "grappled")) return { ok: false, reason: "你被壓制住了，無法移動" };
  const from = getRange(battle, actor.id, target.id);
  const to = stepRange(from, direction, steps);
  const check = canChangeRange(from, to, { maxSteps: steps });
  if (!check.ok) return { ok: false, reason: check.reason };
  setRange(battle, actor.id, target.id, to);
  // 離開掩體是移動的必然後果，不是可選的——不然玩家可以躲在貨櫃後面滿場跑。
  removeStatus(actor, "cover");
  actor.coverFeatureId = null;
  return {
    ok: true,
    publicText: `你從${RANGE_LABELS[from]}${direction === "closer" ? "接近到" : "拉開到"}${RANGE_LABELS[to]}。`,
    effects: [{ type: "range_changed", targetId: target.id, from, to }],
  };
}

/**
 * 執行一個已經通過驗證的玩家行動。
 *
 * @param {object} params
 * @param {object} params.battle 內部戰鬥狀態（會被修改）
 * @param {object} params.action availableActions 產生的那張卡
 * @param {object} params.definition actionCatalog 的定義
 * @param {object} params.rng
 * @param {object} [params.parameters] 前端傳來的附加選擇（例如指定武器）；
 *   **只有具名的白名單欄位會被讀**，前端塞 damage/hit 進來不會有任何作用。
 */
export function resolveSingleAction({ battle, action, definition, rng, parameters = {} }) {
  const resolver = RESOLVERS[definition.resolutionKey];
  if (!resolver) throw new Error(`行動「${definition.id}」沒有對應的結算函式：${definition.resolutionKey}`);

  const actor = getParticipant(battle, "player");
  const target = action.targetId ? getParticipant(battle, action.targetId) : null;
  const feature = action.targetId
    ? (battle.scene.features ?? []).find((f) => f.id === action.targetId) ?? null
    : null;

  const outcome = resolver({
    battle,
    actor,
    target,
    feature,
    rng,
    definition,
    // 白名單。這三個都是玩家的**選擇**，不是結果：要用哪把武器、可變量型態付幾點、
    // 二選一型態選哪一種。命中、傷害、骰點、距離結果一律不接受（規格第6.3節），
    // 而且合法範圍全部由伺服器再驗一次。
    parameters: {
      weaponKey: typeof parameters.weaponKey === "string" ? parameters.weaponKey : null,
      amount: Number.isInteger(parameters.amount) ? parameters.amount : null,
      mode: typeof parameters.mode === "string" ? parameters.mode : null,
    },
  });

  return {
    actionId: action.id,
    definitionId: definition.id,
    label: action.label,
    actionType: definition.actionType,
    targetId: action.targetId,
    ok: outcome.ok !== false,
    reason: outcome.reason ?? null,
    publicText: outcome.publicText ?? null,
    severityTag: outcome.severityTag ?? null,
    effects: outcome.effects ?? [],
  };
}

export { RESOLVERS as __RESOLVERS_FOR_TEST };
