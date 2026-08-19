// [設計] 威脅軌（迫近度）—— 讓「骰子的成敗」產生**引擎層面**的差異，而不只是敘事語氣差異。
//
// 為什麼需要這個模組（這是實際測玩回報的問題，逐字記錄）：
//   「骰子成功和失敗造成的影響沒有什麼決定性差異，我成功了也會引來異形探查，
//     失敗了AI就描述我可以再潛行一次，而沒有更強烈的戲劇張力」
//
// 診斷：在這之前，一次判定的成敗**唯一**的下場是 core/narration.js 給AI的一句語氣指令。
// 那句話沒有任何持續性——它不會被寫進存檔、下一回合的prompt也看不到它，
// 於是「成功」與「失敗」在第3回合看起來完全一樣：場景還在原地，玩家可以再潛行一次。
// 語氣指令再怎麼寫得兇，也擋不住這件事，因為問題不在文筆，在於**世界狀態沒有變**。
//
// 這個模組補上那個狀態：一條 0~6 的迫近度軌道，存在存檔裡，每一回合依判定分級查表增減。
//   成功 -> 威脅遠離（買到距離、買到時間）
//   失敗 -> 威脅逼近（而且是累積的，連兩次失敗就跨一個階段）
// 階段一變，餵給AI的強制指令就跟著換一段完全不同的文字（見 THREAT_STAGES）。
// 也就是說「失敗」不再是「再試一次」，而是「這個房間的處境變了」。
//
// 分工照舊：**增減多少、現在是哪個階段，全部由這裡查表決定，AI一個數字都不碰。**
// AI 只負責把「威脅現在貼到你背後」這件既定事實寫成一段有畫面的文字。
//
// 這是 [設計]，規則書沒有這套機制，數值是草案，之後依實際測玩調整
// （調整時記得同步更新 test/threat.test.js，不要無測試地改）。

/** 迫近度上限。到頂＝威脅直接站在玩家面前，見 THREAT_STAGES 的「接觸」階段。 */
export const THREAT_MAX = 6;

/** 開戰後迫近度回落到哪一級（追兵變成正面衝突，追蹤過程重新開始累積）。 */
export const THREAT_AFTER_ENCOUNTER = 3;

/**
 * 判定分級 -> 迫近度增減。key 必須跟 core/narration.js 的 TIERS id 完全一致。
 *
 * 數值設計的意圖：
 * - 一次乾淨的成功可以「還債」一次普通失敗，但還不完一次嚴重失敗——玩家會感覺到
 *   犯錯的代價比做對的收益重，這正是恐怖類型該有的傾斜。
 * - [2026-08-18 修正] 驚險成功(margin=0)原本設計成 +1（規則上是成功，但敘事上「差一點被發現」
 *   仍推高迫近度）。實際測玩回報這一點違反直覺：玩家骰到剛好打平DC、判定結果明明是
 *   「成功」，卻眼睜睜看著追蹤格往上跳，感覺判定沒有被尊重。改成 0——驚險成功不再幫玩家
 *   拉開距離（跟乾淨的「成功」比仍然差一級），但也絕不會讓一次貨真價實的成功推近威脅。
 *   只有真正低於DC的分級（些微失敗以下）才會讓迫近度上升。
 */
export const OUTCOME_THREAT_DELTA = Object.freeze({
  大成功: -2,
  成功: -1,
  驚險成功: 0,
  些微失敗: +1,
  失敗: +2,
  慘烈失敗: +3,
  "大失敗(命定)": +3,
  自動失敗: +2,
});

/**
 * 迫近度階段表。level 落在 maxLevel 以內的第一個階段就是目前階段。
 *
 * directive 是**強制敘事指令**，會被原文塞進每回合的prompt（見 buildThreatDirective）。
 * 刻意寫成「這一回合必須出現什麼」而不是「氣氛應該如何」——後者AI會當形容詞讀過去，
 * 前者是可以檢查的具體要求。
 */
export const THREAT_STAGES = [
  {
    id: "潛伏",
    maxLevel: 1,
    summary: "威脅還不知道你在哪裡",
    directive:
      "威脅目前不知道你的位置。這一回合可以讓玩家真的推進、真的拿到東西，" +
      "但場景裡至少要留一個「它剛剛來過」的痕跡（不是聲音，是痕跡：殘骸、黏液、被撞開的門）。",
  },
  {
    id: "追蹤",
    maxLevel: 3,
    summary: "威脅正在往你這個方向搜索",
    directive:
      "威脅已經開始朝你這一區搜索。這一回合必須寫出「它正在縮小範圍」的具體證據" +
      "（腳步/管線震動由遠而近、某扇門被打開、燈光依序熄滅），並且要明確到玩家能判斷它從哪個方向來。" +
      "不可以只寫「你感覺被盯上了」這種沒有方位的模糊句子。",
  },
  {
    id: "貼近",
    maxLevel: 5,
    summary: "威脅就在同一個空間裡，只隔一層遮蔽",
    directive:
      "威脅已經進到你所在的這個空間，只隔著一層遮蔽物（一道門、一排貨櫃、一段管道）。" +
      "這一回合必須讓玩家在敘事結尾面對一個「立刻要決定」的處境：躲、跑、還是動手。" +
      "不可以讓玩家在這個階段還能從容地搜索、調查或思考——時間已經不夠了。",
  },
  {
    id: "接觸",
    maxLevel: Infinity,
    summary: "威脅已經直接面對你",
    directive:
      "【強制】威脅已經站在玩家面前，沒有任何遮蔽。這一回合的敘事必須寫出它撲上來的那一刻，" +
      "並且必須讓玩家付出一個具體的代價（受傷、丟下手上的東西、退路被切斷、被逼進死路擇一）。" +
      "絕對禁止寫成「它又消失在通風管裡」「你僥倖躲過」——那等於把這一整條迫近度歸零重來。" +
      "玩家接下來只有兩條路：正面戰鬥，或付出更大代價脫身。",
  },
];

/** 建立一條全新的迫近度軌道。 */
export function createThreatTrack(initialLevel = 0) {
  return { level: clampLevel(initialLevel), peak: clampLevel(initialLevel), encounters: 0 };
}

function clampLevel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(THREAT_MAX, Math.max(0, Math.round(n)));
}

/**
 * 這個判定分級會讓迫近度增減多少。
 * 查不到的分級一律回 0（寧可不動，也不要憑空猜一個數字）。
 * @param {{tier: string}|null|undefined} outcome core/narration.js 的 classifyOutcome() 回傳值
 */
export function threatDeltaForOutcome(outcome) {
  if (!outcome?.tier) return 0;
  return OUTCOME_THREAT_DELTA[outcome.tier] ?? 0;
}

/**
 * 把一次判定結果套用到迫近度上。純函式，回傳新的軌道物件。
 *
 * @param {object} track createThreatTrack() 的形狀（給 null/undefined 會自動視為全新軌道）
 * @param {{tier: string}|null} outcome
 * @returns {{track: object, before: number, after: number, delta: number, stage: object, escalated: boolean, contact: boolean}}
 *   escalated：這次是不是**跨了一個階段**（用來決定要不要在畫面上特別提示玩家）
 *   contact：這次是不是撞到頂（接觸），呼叫端據此開放/強制戰鬥
 */
export function applyOutcomeToThreat(track, outcome) {
  const current = normalizeTrack(track);
  const delta = threatDeltaForOutcome(outcome);
  const before = current.level;
  const after = clampLevel(before + delta);

  const next = {
    ...current,
    level: after,
    peak: Math.max(current.peak ?? 0, after),
  };

  return {
    track: next,
    before,
    after,
    delta,
    stage: getThreatStage(after),
    escalated: getThreatStage(after).id !== getThreatStage(before).id,
    contact: after >= THREAT_MAX,
  };
}

/** 開戰時呼叫：追兵變成正面衝突，迫近度回落，encounters 計數 +1。 */
export function dischargeThreat(track) {
  const current = normalizeTrack(track);
  return {
    ...current,
    level: THREAT_AFTER_ENCOUNTER,
    encounters: (current.encounters ?? 0) + 1,
  };
}

/** 舊存檔（沒有 threat 欄位）或壞掉的資料一律當成全新軌道，不讓遊戲卡住。 */
export function normalizeTrack(track) {
  if (!track || typeof track !== "object") return createThreatTrack(0);
  return {
    level: clampLevel(track.level),
    peak: clampLevel(track.peak ?? track.level),
    encounters: Number.isFinite(track.encounters) ? track.encounters : 0,
  };
}

/** 目前迫近度落在哪一個階段。 */
export function getThreatStage(level) {
  const value = clampLevel(level);
  return THREAT_STAGES.find((s) => value <= s.maxLevel) ?? THREAT_STAGES[THREAT_STAGES.length - 1];
}

/**
 * 組出要塞進 prompt 的迫近度指令。
 *
 * @param {object} track
 * @param {object} [flavor] 副本包自己的風味設定（見 content/scenario/schema.js 的 threatTrack 欄位）：
 *   { name: "異形迫近度", subject: "異形", stages: { 潛伏: "這個副本裡潛伏長什麼樣", ... } }
 *   沒給就用通用文字，副本包不寫這個欄位也能運作。
 * @param {{delta: number, before: number}} [change] 這一回合的變化，有給的話會一起寫進指令，
 *   讓AI知道「這一格是因為玩家剛剛失敗才推上來的」，敘事才接得上因果。
 */
export function buildThreatDirective(track, flavor = {}, change = null) {
  const current = normalizeTrack(track);
  const stage = getThreatStage(current.level);
  const subject = flavor.subject ?? "威脅";
  const name = flavor.name ?? "迫近度";
  const packStageText = flavor.stages?.[stage.id];

  const lines = [
    `【${name}：${current.level}/${THREAT_MAX}（${stage.id}）】` +
      `這個數字由引擎依判定結果計算，不是你決定的，也不可以在敘事裡出現數字本身。`,
  ];

  if (change && change.delta !== 0) {
    lines.push(
      change.delta > 0
        ? `這一回合因為判定結果，${subject}往你推進了 ${change.delta} 格（${change.before} → ${current.level}）。` +
            `敘事必須讓玩家感覺到「情況比上一回合更糟」，而不是回到原點重試。`
        : `這一回合因為判定結果，${subject}被拉開了 ${Math.abs(change.delta)} 格（${change.before} → ${current.level}）。` +
            `敘事必須把這份距離兌現成玩家真的能用的東西：一段安全的時間、一條打開的路、一個能帶走的資訊。`
    );
  }

  lines.push(stage.directive.replaceAll("威脅", subject));
  if (packStageText) lines.push(`這個副本在這個階段的具體樣貌：${packStageText}`);

  return lines.join("\n");
}

/** 給前端HUD用的摘要（不含 directive，那是給AI看的，玩家不需要看到指令原文）。 */
export function threatSummary(track, flavor = {}) {
  const current = normalizeTrack(track);
  const stage = getThreatStage(current.level);
  return {
    level: current.level,
    max: THREAT_MAX,
    stage: stage.id,
    summary: flavor.stages?.[stage.id] ?? stage.summary,
    name: flavor.name ?? "迫近度",
    contact: current.level >= THREAT_MAX,
    encounters: current.encounters ?? 0,
  };
}
