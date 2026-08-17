// [設計] 暫時性增益容器(「型態」) —— 變身／爆發／開眼這類「付代價換一段時間的強化」。
//
// 為什麼需要它：CONVERSION_RULES.md 第12節的轉換率表把它列為第一順位待辦，理由是
// 模板能力類(尤其血統)的價值幾乎整個寫在這個形狀上——「花一個移動動作消耗1點意志力變身，
// 持續一個場景，變身中獲得3點天生防禦與3L天生武器」。沒有這個容器，這種條目只有兩條路：
// 整條丟掉(貨架空掉)，或硬轉成常態生效(把「變身後才有」的好處白送，那不是簡化是加強)。
//
// 這個模組同時是 **意志力的第一個消費端**。在此之前 character.derived.willpower 只是一個
// 算得出來、但沒有任何程式碼會扣的數字(見 CONVERSION_RULES.md 第二部分 A 節「意志值」)，
// 而規則書裡「支付1點意志力」是啟動這類能力最常見的代價。啟動型態時真的會扣，扣不起就啟動不了。
//
// 三個刻意的設計選擇：
//
// 1. **型態不改角色卡。** 啟動只是在 formsState.active 裡放一筆紀錄，加值由
//    effects.js 的三個查表函式(checkModifiersFor／combatProfileFrom／weaponsFrom)在
//    每次用到時把 activeGrantSources() 併進來。於是「到期」不需要有人記得回收加值——
//    紀錄一移除，下一次查表就查不到了。意志力是唯一真的被改寫的東西，而它不該退回。
//
// 2. **只吃兩個時鐘：戰鬥輪與場景。** 兩個都是引擎裡真的在前進的計數器
//    (combat.round 由 encounterState.advanceTurn() 遞增；場景結束由呼叫端明確宣告)。
//    書上的「10分鐘」「每天一次」沒有對應的時鐘，硬寫進去就會變成一個永不過期的型態——
//    那正是 CONVERSION_RULES.md 第8節拿 tickWorsening() 當反例在講的事。
//
// 3. **同一個型態不能疊。** 已經在進行中就不准再啟動一次，這順便把書上大量出現的
//    「每場景一次」表達掉了：一個持續整個場景的型態，本來就不可能在同一個場景裡啟動第二次。

import { useFree, useSwift, useMove, useStandard, useFullRound, useFullTurn } from "../../core/combat/actionEconomy.js";
import { spendEnergy } from "../../core/energyPools.js";

/**
 * 空的型態狀態。存檔裡有兩份：`session.forms`(戰鬥外)與 `combat.forms`(戰鬥中)，
 * 開戰時前者帶進後者、收兵時再帶回來，見 content/combat/encounterState.js。
 */
export function createFormsState() {
  return { active: [], log: [] };
}

/** 型態的識別字串。同一件商品可能給多個型態，所以要帶上 label。 */
export function formIdOf(goodId, label) {
  return `${goodId}:${label}`;
}

/** 這個角色身上所有「可以啟動的型態」(不管現在有沒有在進行中)。 */
export function formsOf(character) {
  const out = [];
  for (const owned of character.abilities ?? []) {
    for (const effect of owned.effects ?? []) {
      if (effect.kind !== "型態") continue;
      out.push({
        formId: formIdOf(owned.goodId, effect.label),
        goodId: owned.goodId,
        sourceName: owned.name,
        effect,
      });
    }
  }
  return out;
}

/**
 * 這個型態實際持續幾輪。書上大量寫成「持續你的感知值*1輪」，那是角色卡上的數字，
 * 引擎算得出來，所以 duration 可以掛在一個屬性上而不是寫死。至少1輪——
 * 屬性為0時如果算出0輪，這個型態會在啟動的同一輪就過期，那等於買了不能用。
 */
export function durationRounds(duration, character) {
  if (duration?.roundsFromAttribute) {
    return Math.max(1, character?.attributes?.[duration.roundsFromAttribute] ?? 0);
  }
  return duration?.rounds ?? 1;
}

export function isFormActive(formsState, formId) {
  return (formsState?.active ?? []).some((f) => f.formId === formId);
}

function applyActionCost(budget, action) {
  switch (action) {
    case "自由":
      return useFree(budget, "啟動型態");
    case "迅捷":
      return useSwift(budget);
    case "移動":
      return useMove(budget);
    case "標準":
      return useStandard(budget);
    case "整輪":
      return useFullRound(budget);
    case "全回合":
      return useFullTurn(budget);
    default:
      throw new Error(`未知的啟動動作等級：${action}`);
  }
}

/**
 * 啟動一個型態。
 *
 * 跟 catalog.js 的 evaluatePurchase() 同樣的哲學：把所有擋下來的理由一次列齊，
 * 不是遇到第一個就回傳——玩家要能一次看到「意志力不夠、而且這輪的移動動作也用掉了」。
 *
 * @param {object} character 角色卡(不會被修改)
 * @param {object} formsState createFormsState() 的形狀(不會被修改)
 * @param {string} formId formIdOf() 產生的識別字串
 * @param {{ round?: number, budget?: object, sceneKey?: string }} [ctx]
 *   round    —— 目前的戰鬥輪數，duration.unit==="輪" 時必須提供
 *   budget   —— 目前這一輪的動作額度(core/combat/actionEconomy.js)，有給才會檢查動作成本
 *   sceneKey —— 現在人在哪(content/shop/access.js 的 sceneKeyOf())。以「場景」計時的型態
 *               會把它記在自己身上，之後鑰匙一變就到期，見 expireOnSceneChange()
 * @returns {{ ok: boolean, blockers: {code:string,message:string}[],
 *             character?: object, formsState?: object, budget?: object, form?: object }}
 */
export function activateForm(character, formsState, formId, { round = null, budget = null, sceneKey = null } = {}) {
  const blockers = [];
  const found = formsOf(character).find((f) => f.formId === formId);
  if (!found) {
    return {
      ok: false,
      blockers: [{ code: "沒有這個型態", message: `角色身上沒有型態「${formId}」` }],
    };
  }
  const { effect } = found;

  if (isFormActive(formsState, formId)) {
    blockers.push({
      code: "已在進行中",
      message: `「${effect.label}」已經在進行中，不能重複啟動(書上的『每場景一次』就是靠這一條表達的)`,
    });
  }

  // 意志力
  const costWillpower = effect.activation?.willpower ?? 0;
  const willpower = character.derived?.willpower;
  if (costWillpower > 0) {
    const current = willpower?.current ?? 0;
    if (current < costWillpower) {
      blockers.push({
        code: "意志力不足",
        message: `啟動「${effect.label}」需要${costWillpower}點意志力，目前只有${current}點`,
      });
    }
  }

  // 能量池(劍氣/查克拉/…)。跟意志力同一個約定：扣不起就整筆不成立，不扣一半。
  // 這是 2026-08-17 第二次補機制加上的——在那之前 activation 只吃意志力，
  // 於是所有「消耗1點劍氣變身」的條目都轉不出來。
  const poolCost = effect.activation?.pool;
  let nextPools = character.derived?.energyPools ?? {};
  if (poolCost) {
    const spent = spendEnergy(nextPools, poolCost.name, poolCost.amount);
    if (!spent.ok) {
      blockers.push({ code: "能量不足", message: `啟動「${effect.label}」${spent.reason}` });
    } else {
      nextPools = spent.pools;
    }
  }

  // 動作額度。呼叫端沒有給 budget 就代表「現在不在戰鬥裡，動作額度不適用」——
  // 這是刻意的：敘事迴圈裡沒有回合制的動作額度，強迫它有一個等於憑空發明規則。
  let nextBudget = budget;
  if (budget && effect.activation?.action) {
    try {
      nextBudget = applyActionCost(budget, effect.activation.action);
    } catch (e) {
      blockers.push({ code: "動作額度不足", message: e.message });
    }
  }

  // 期限
  const unit = effect.duration?.unit;
  if (unit === "輪" && !Number.isInteger(round)) {
    blockers.push({
      code: "缺少輪數",
      message: `「${effect.label}」以輪計時，啟動時必須告訴它現在是第幾輪`,
    });
  }

  if (blockers.length > 0) return { ok: false, blockers };

  const entry = {
    formId,
    goodId: found.goodId,
    sourceName: found.sourceName,
    label: effect.label,
    grants: effect.grants,
    unit,
    activatedAtRound: round,
    // 以「場景」計時的型態記下啟動當下的地點。這是它唯一的到期條件——
    // 使用者定義的場景就是「當下所在的地點」，所以鑰匙一變就代表換場了。
    // 以「輪」計時的不需要，它有 expiresAfterRound。
    sceneKey: unit === "場景" ? sceneKey : null,
    // 以輪計時的型態：啟動當輪算第1輪，所以第 round+rounds-1 輪結束後失效。
    expiresAfterRound: unit === "輪" ? round + durationRounds(effect.duration, character) - 1 : null,
  };

  const changesCharacter = costWillpower > 0 || poolCost != null;
  const nextCharacter = changesCharacter
    ? {
        ...character,
        derived: {
          ...character.derived,
          willpower:
            costWillpower > 0 ? { ...willpower, current: willpower.current - costWillpower } : character.derived.willpower,
          energyPools: nextPools,
        },
      }
    : character;

  return {
    ok: true,
    blockers: [],
    character: nextCharacter,
    formsState: {
      active: [...(formsState.active ?? []), entry],
      log: [
        ...(formsState.log ?? []),
        { event: "啟動", formId, round, willpowerSpent: costWillpower, poolSpent: poolCost ?? null },
      ],
    },
    budget: nextBudget,
    form: entry,
  };
}

/** 主動結束一個型態(玩家自己收功，或被某個效果打斷)。意志力不退。 */
export function deactivateForm(formsState, formId, reason = "主動結束") {
  const active = formsState?.active ?? [];
  if (!active.some((f) => f.formId === formId)) return { formsState, ended: [] };
  const ended = active.filter((f) => f.formId === formId);
  return {
    formsState: {
      active: active.filter((f) => f.formId !== formId),
      log: [...(formsState.log ?? []), { event: "結束", formId, reason }],
    },
    ended,
  };
}

/**
 * 戰鬥推進到第 round 輪時呼叫，讓以「輪」計時的型態到期。
 * 由 content/combat/encounterState.js 的 advanceTurn() 呼叫——這是它真正的消費端，
 * 不是一個等著有人來接的函式。
 */
export function tickFormsOnRound(formsState, round) {
  // formsState 可能是 undefined：舊存檔裡的 combat 物件沒有 forms 欄位(型態是 2026-08-17 才有的)。
  // 舊存檔不該因為多了一個新機制就在戰鬥中途爆炸，所以這裡當成「沒有任何型態」處理。
  const active = formsState?.active ?? [];
  const expired = active.filter((f) => f.unit === "輪" && round > f.expiresAfterRound);
  if (expired.length === 0) return { formsState, expired };
  return {
    formsState: {
      active: active.filter((f) => !expired.includes(f)),
      log: [
        ...(formsState.log ?? []),
        ...expired.map((f) => ({ event: "到期", formId: f.formId, round, reason: "持續輪數用盡" })),
      ],
    },
    expired,
  };
}

/**
 * [使用者決定 2026-08-17] **場景 ＝ 當下所在的地點**，所以「換場」＝ 地點變了。
 *
 * 這是以「場景」計時的型態在戰鬥外唯一的到期條件，也是 `session.forms` 能夠存在的前提：
 * 在這個函式出現之前，戰鬥外沒有任何東西讓場景型態到期，於是那個存檔欄位從第五輪建好
 * 之後就沒有人敢讀它（讀了就等於發一個永久加值）。
 *
 * **刻意寫成「每次讀取前先對一次鑰匙」而不是「換地點時記得清一次」**：後者要求每一個
 * 會改變地點的地方都記得呼叫，漏掉一個就是一個永不過期的型態，而漏掉的那個地方
 * 不會有任何症狀——這正是本專案一再踩到的那種洞。前者只要讀取路徑都經過這裡就不可能漏。
 *
 * @param {object} formsState
 * @param {string} sceneKey content/shop/access.js 的 sceneKeyOf()
 */
export function expireOnSceneChange(formsState, sceneKey) {
  const active = formsState?.active ?? [];
  // sceneKey 是 null 的型態＝以「輪」計時的，不歸這個函式管(它們由 tickFormsOnRound/endCombat 收)。
  const expired = active.filter((f) => f.unit === "場景" && f.sceneKey != null && f.sceneKey !== sceneKey);
  if (expired.length === 0) return { formsState: formsState ?? createFormsState(), expired };
  return {
    formsState: {
      active: active.filter((f) => !expired.includes(f)),
      log: [
        ...(formsState.log ?? []),
        ...expired.map((f) => ({
          event: "到期",
          formId: f.formId,
          reason: `離開了啟動時所在的地點(${f.sceneKey} → ${sceneKey})`,
        })),
      ],
    },
    expired,
  };
}

/**
 * 一次讀取的標準入口：**先對場景鑰匙，再把還算數的型態攤成效果來源。**
 *
 * 所有要用到型態的地方(檢定、敘事、開戰)都應該走這一個函式，而不是自己去讀
 * `session.forms.active`——這樣「換地點就到期」不可能被某一條路徑漏掉。
 * 回傳的 formsState 要寫回存檔（到期是一個狀態改變，不是只在這次計算裡當作沒看到）。
 *
 * @returns {{ formsState: object, extraSources: object[], expired: object[] }}
 */
export function formsForScene(formsState, sceneKey) {
  const { formsState: next, expired } = expireOnSceneChange(formsState, sceneKey);
  return { formsState: next, extraSources: activeGrantSources(next), expired };
}

/**
 * 戰鬥結束時呼叫。**只收以「輪」計時的型態**，因為戰鬥外沒有輪可以數，
 * 留著它等於永不過期。
 *
 * [修正 2026-08-17] 先前這裡呼叫的是 `endScene()`，把兩種型態一起清掉——那是在
 * 「場景」還沒有定義的時候的權宜作法。使用者把場景定義成地點之後它就錯了：
 * **打一場架不會改變你站在哪裡**，所以一個「持續一個場景」的變身撐得過一場戰鬥，
 * 直到你離開這個地點為止。
 */
export function endCombat(formsState, reason = "戰鬥結束，戰鬥輪不再前進") {
  const active = formsState?.active ?? [];
  const expired = active.filter((f) => f.unit === "輪");
  if (expired.length === 0) return { formsState: formsState ?? createFormsState(), expired };
  return {
    formsState: {
      active: active.filter((f) => !expired.includes(f)),
      log: [...(formsState.log ?? []), ...expired.map((f) => ({ event: "到期", formId: f.formId, reason }))],
    },
    expired,
  };
}

/**
 * 清掉所有還在進行中的型態，不管是哪一種計時。
 * 現在的用途是「明確宣告一切重來」(例如讀檔測試)，日常的到期走
 * expireOnSceneChange()(換地點) 與 endCombat()(戰鬥結束) 兩條。
 */
export function endScene(formsState, reason = "場景結束") {
  const active = formsState?.active ?? [];
  if (active.length === 0) return { formsState, expired: [] };
  return {
    formsState: {
      active: [],
      log: [
        ...(formsState.log ?? []),
        ...active.map((f) => ({ event: "到期", formId: f.formId, reason })),
      ],
    },
    expired: active,
  };
}

/**
 * 把進行中的型態攤成「跟持有商品一模一樣的形狀」，餵給 effects.js 的三個查表函式。
 * 形狀刻意跟 catalog.js 的 owned 一致(goodId/name/effects)，這樣那三個函式完全不需要
 * 知道型態這回事——它們只是多拿到幾個效果來源。
 */
export function activeGrantSources(formsState) {
  return (formsState?.active ?? []).map((f) => ({
    goodId: f.formId,
    name: `${f.sourceName}·${f.label}`,
    effects: f.grants,
  }));
}

/** 給 UI 與 AI 敘事備忘錄用的一句話摘要。沒有進行中的型態時回傳空陣列。 */
export function describeActiveForms(formsState, { round = null } = {}) {
  return (formsState?.active ?? []).map((f) => {
    if (f.unit === "輪") {
      const left = Number.isInteger(round) ? Math.max(0, f.expiresAfterRound - round + 1) : null;
      return left == null
        ? `${f.sourceName}·${f.label}(進行中)`
        : `${f.sourceName}·${f.label}(還剩${left}輪)`;
    }
    return `${f.sourceName}·${f.label}(持續到場景結束)`;
  });
}
