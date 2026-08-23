// 主神空間 Phase A 的 server-owned debrief / aftercare view。
// 只讀取已保存的 engine facts，不呼叫 LLM、不修改 session、不重新計算結算。

import { EVENT_TYPES } from "../../core/eventLog.js";
import { getDownState, revivalQuote } from "../downState.js";
import { formsOf } from "../shop/forms.js";

const ENDING_PRESENTATIONS = Object.freeze({
  end_solo_survivor: { title: "孤獨生還者", copy: "水仙號在深空中留下微弱藍光。沒有人能替你證明那艘船上發生過什麼；只有傷勢、腕錶裡的紀錄，以及一段沒有被公司承認的座標。" },
  end_heroic_rescue: { title: "帶著證人離開", copy: "水仙號的兩具休眠艙同時亮起綠燈。你沒有只把自己塞進逃生路線；有人會帶著對 937、Ash 與異形的第一手記憶一起離開。" },
  end_corporate_agent: { title: "公司的新鑰匙", copy: "低溫儲格在休眠艙旁持續發出冷卻聲。你帶走的不只是組織，而是一把能打開公司下一個計畫的鑰匙。" },
  end_dark_infection: { title: "沉睡的感染", copy: "休眠艙合上的時候，你以為任務已經結束。真正的警報在傳送之後才出現：體內有某個不屬於人類的東西，正在等待下一次醒來。" },
  end_expire_ruins: { title: "倒數中的殘骸", copy: "倒數歸零，船體在你身邊解體。主神機制把你從爆炸邊緣拖回來，但沒有把隊友、證據與原本可以取得的報酬一起帶走。" },
  end_death_alien_feast: { title: "通風管裡的名字", copy: "最後留下的不是你的名字，而是通風管內拖行的聲音。異形把你的遺留物帶進黑暗，母船的倒數仍然繼續。" },
  end_death_overload_vaporized: { title: "高溫抹除", copy: "母親的倒數在核心崩潰中歸零。船、樣本、異形與玩家的所有行動一起被高溫抹去。" },
  end_death_vacuum_breach: { title: "深空失壓", copy: "沒有宇航服，也沒有安全繩。你被氣閘的風帶入深空，水仙號在視線中縮成一點藍光。" },
});

function clone(value, fallback) {
  if (value == null) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function publicHealth(character) {
  const derived = character?.derived ?? {};
  const hp = derived.hp ?? {};
  return {
    hp: {
      max: Number(hp.max) || 0,
      intact: Number(hp.intact) || 0,
      B: Number(hp.B) || 0,
      L: Number(hp.L) || 0,
      A: Number(hp.A) || 0,
    },
    willpower: {
      max: Number(derived.willpower?.max) || 0,
      current: Number(derived.willpower?.current) || 0,
      temp: Number(derived.willpower?.temp) || 0,
    },
    energyPools: Object.fromEntries(
      Object.entries(derived.energyPools ?? {}).map(([id, pool]) => [id, {
        current: Number(pool.current) || 0,
        max: Number(pool.max) || 0,
      }])
    ),
    downState: getDownState(character),
    revival: getDownState(character).dead ? revivalQuote(character) : null,
  };
}

function publicForms(character) {
  return formsOf(character).map((form) => ({
    formId: form.formId,
    label: form.effect?.label ?? form.formId,
    sourceName: form.sourceName ?? null,
    activation: form.effect?.activation ?? null,
    duration: form.effect?.duration ?? null,
  }));
}

function eventStats(events) {
  const count = (type) => events.filter((event) => event.type === type).length;
  return {
    eventCount: events.length,
    checks: count(EVENT_TYPES.CHECK),
    combatActions: count(EVENT_TYPES.COMBAT_ACTION),
    rests: count(EVENT_TYPES.REST),
    purchases: count(EVENT_TYPES.PURCHASE),
    referenceActions: count(EVENT_TYPES.REFERENCE_ACTION),
  };
}

function objectiveView(events, summary) {
  const completed = new Map(
    events
      .filter((event) => event.type === EVENT_TYPES.NODE_COMPLETE)
      .map((event) => [event.payload?.nodeId, event.payload ?? {}])
  );
  return (summary?.objectiveIds ?? []).map((id) => {
    const event = completed.get(id) ?? {};
    return {
      id,
      title: event.title ?? id,
      completed: true,
      divergenceTier: event.divergenceTier ?? null,
      rewardPoints: Number(event.reward) || 0,
    };
  });
}

function consequenceView(referenceState, events) {
  return {
    npcStatuses: clone(referenceState?.npcStatuses, {}),
    sampleStatus: referenceState?.sampleStatus ?? null,
    infectionStatus: referenceState?.infectionStatus ?? null,
    injuriesReceived: clone(referenceState?.injuries, []),
    itemsAdded: events
      .filter((event) => event.type === EVENT_TYPES.REFERENCE_ACTION)
      .flatMap((event) => event.payload?.effects?.itemsAdded ?? []),
    itemsRemoved: events
      .filter((event) => event.type === EVENT_TYPES.REFERENCE_ACTION)
      .flatMap((event) => event.payload?.effects?.itemsRemoved ?? []),
  };
}

/** 建立一份可直接回傳給主神空間的副本 debrief。 */
export function buildScenarioDebrief({ pack = null, session = null } = {}) {
  const progress = session?.scenario?.progress;
  const summary = progress?.runSummary ?? null;
  if (!summary) return null;
  const events = Array.isArray(session?.log?.events) ? session.log.events : [];
  const ending = ENDING_PRESENTATIONS[summary.endingId] ?? {
    title: "未命名結局",
    copy: "這份輪迴紀錄已封存，但結局文字尚未登錄。",
  };
  const referenceState = session?.scenario?.referenceState ?? null;
  const health = publicHealth(session.character);

  return {
    summaryVersion: 1,
    status: "settled",
    // 這是已封存的 server runSummary，只供既有結算頁重現；前端不得修改或重算。
    runSummary: clone(summary, {}),
    scenario: {
      id: summary.scenarioId ?? pack?.id ?? null,
      version: summary.scenarioVersion ?? pack?.version ?? null,
      title: pack?.briefing?.title ?? summary.scenarioId ?? "未知副本",
      endingId: summary.endingId ?? null,
      endingPresentation: ending,
      settledAt: progress.settledAt ?? null,
    },
    evaluation: {
      grade: summary.evaluation?.grade ?? null,
      label: summary.evaluation?.label ?? null,
      summary: summary.evaluation?.summary ?? null,
      qualityPoints: Number(summary.qualityScore ?? summary.evaluation?.qualityScore) || 0,
      speedPoints: Number(summary.speedBonusPoints ?? summary.speedScore ?? summary.evaluation?.speedScore) || 0,
      overallScore: Number(summary.overallScore ?? summary.evaluation?.overallScore) || 0,
    },
    tempo: {
      totalRounds: Number(summary.totalRounds) || 0,
      spentRounds: Number(summary.spentRounds) || 0,
      remainingRounds: Number(summary.remainingRounds) || 0,
      threatPeak: Number(summary.threat?.peak) || 0,
      encounters: Number(summary.threat?.encounters) || 0,
    },
    objectives: objectiveView(events, summary),
    consequences: consequenceView(referenceState, events),
    aftercare: health,
    resources: {
      wallet: clone(session.wallet, { tokens: {}, points: 0, xp: 0, spentLedger: {} }),
      referenceInventory: clone(referenceState?.inventory, []),
      damagedItems: clone(referenceState?.damagedItems, []),
      ownedAbilities: (session.character?.abilities ?? []).map((ability) => ({
        goodId: ability.goodId ?? null,
        name: ability.name ?? null,
        category: ability.category ?? null,
        rank: ability.rank ?? null,
      })),
      activeForms: publicForms(session.character),
    },
    activity: {
      turns: Number(session.turns) || 0,
      ...eventStats(events),
    },
  };
}

export { ENDING_PRESENTATIONS };
