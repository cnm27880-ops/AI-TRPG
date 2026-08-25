//
// Supplement clue presentation adapter for Alien V2.
//
// The canonical reference remains the only owner of clue existence, effects,
// flags, injuries, locations, items and endings. This module only selects a
// public discovery sentence after the engine has already added a canonical clue.
//
// Never use a presentation here to create a clue or to infer a result tier.

const PACK_ID = "scenario.nostromo-01-v2";
const APPROVED_TIERS = new Set([
  "大成功",
  "成功",
  "驚險成功",
  "些微失敗",
  "失敗",
  "慘烈失敗",
  "自動失敗",
  "大失敗(命定)",
  "自動",
]);

function binding(sceneId, approachId, outcomeTier, text, reviewNotes, { requiredFlags = [] } = {}) {
  return Object.freeze({
    sceneId,
    approachId,
    outcomeTier,
    text,
    reviewNotes,
    requiredFlags: Object.freeze([...requiredFlags]),
  });
}

const APPROVED_PRESENTATIONS = Object.freeze({
  clue_alien_trace: Object.freeze([
    binding(
      "evt_cryo_clearance",
      "app_cryo_recon",
      "大成功",
      "你沿著拖痕檢查斷裂鋼板，半透明黏液在金屬邊緣留下蜂窩狀腐蝕；通風格柵旁的擠壓痕跡與硬質刮痕，足以確認這不是普通的搬運事故。",
      "休眠室大成功：保留完整物理痕跡，但不宣告異形此刻的位置。",
    ),
    binding(
      "evt_cryo_clearance",
      "app_cryo_recon",
      "成功",
      "黏液還沒有乾，拖痕穿過門縫朝 A 甲板延伸。你只能從腐蝕痕跡與地面留下的壓痕判斷，襲擊者體型遠超人類。",
      "休眠室成功：保留可觀察痕跡與有限推論，不增加新的威脅或位置事實。",
    ),
    binding(
      "evt_cryo_clearance",
      "app_cryo_recon",
      "驚險成功",
      "你確認殘留液體具備強烈腐蝕性，卻也察覺自己的動作讓通風管深處回了一聲金屬刮擦。線索已經足夠提醒你避開近距離接觸，但來源仍無法完全判定。",
      "休眠室驚險成功：不新增酸蝕傷勢，只描寫 canonical result 已授權的風險。",
    ),
    binding(
      "evt_cryo_clearance",
      "app_cryo_recon",
      "些微失敗",
      "你辨認出液體與血痕混在一起，卻無法從現場可靠判斷生物的體型或習性；這條線索只留下『有東西經過』的模糊結論。",
      "休眠室些微失敗：使用低置信度描述，不沿用補充文件的完整生物推論。",
    ),
  ]),

  clue_ash_synthetic: Object.freeze([
    binding(
      "evt_meet_ash",
      "app_ash_observe_abnormal",
      "大成功",
      "你抓住 Ash 與檢疫終端短暫不同步的瞬間：他的權限紀錄繞過了正常指揮鏈，動作與說明卻仍維持著近乎例行公事的精準。這些細節彼此重疊，讓那張平靜的人類外表再也無法掩蓋底下的異常。",
      "Ash 觀察大成功：只有 canonical identity flag 已成立時，才整合已證實的非人異常。",
      { requiredFlags: ["flag_ash_synthetic_known"] },
    ),
    binding(
      "evt_meet_ash",
      "app_ash_observe_abnormal",
      "成功",
      "你注意到 Ash 的操作權限與船上的公開指揮鏈對不上；終端留下的獨立通道紀錄，至少證明他曾執行未向其他船員說明的任務，但還不足以判定他的真正身分。",
      "Ash 觀察成功：呈現權限異常，不把推測寫成新的身分或公司命令。",
    ),
    binding(
      "evt_meet_ash",
      "app_ash_observe_abnormal",
      "驚險成功",
      "你只來得及抓住一個被迅速收回的異常權限畫面。它讓 Ash 更加可疑，卻還不足以回答他究竟在替誰工作，更不能證明他不是人類。",
      "Ash 觀察驚險成功：保留不確定性，禁止提前說出完整身分真相。",
    ),
  ]),

  clue_order_937: Object.freeze([
    binding(
      "evt_order_937_reveal",
      "app_order_query",
      "大成功",
      "最後一個字元輸入後，機械打字機吐出完整的 `SPECIAL ORDER 937` 與 `PRIORITY ONE：RECOVER ORGANISM FOR ANALYSIS`；紙帶末端只留下四個令人窒息的字：`CREW EXPENDABLE`。",
      "937 查詢大成功：完整文字只在 canonical result 已授權揭露時使用。",
    ),
    binding(
      "evt_order_937_reveal",
      "app_order_query",
      "成功",
      "紙帶逐行吐出 `SPECIAL ORDER 937`、樣本優先回收，以及 `CREW EXPENDABLE`。你終於知道，這艘船的最高優先級從來不是船員安全。",
      "937 查詢成功：使用 canonical 事件已授權的完整揭露。",
    ),
    binding(
      "evt_order_937_reveal",
      "app_order_query",
      "驚險成功",
      "你只來得及讀到「樣本優先」與「船員可犧牲」兩行，介面便被蜂鳴聲切斷。情報已經足以改變判斷，但完整的簽發細節仍然缺失。",
      "937 查詢驚險成功：只提供片段，不宣告完整公司背景。",
    ),
    binding(
      "evt_order_937_reveal",
      "app_order_query",
      "些微失敗",
      "亂碼覆蓋了大部分文件，你只辨認出一個與樣本回收有關的優先級標記；這項發現仍不足以還原完整指令。",
      "937 查詢些微失敗：維持低完整度，避免把片段當成完整真相。",
    ),
    binding(
      "evt_meet_ash",
      "app_ash_terminal_peek",
      "大成功",
      "你在 Ash 的終端上看見 `MU-TH-UR DIRECTIVE 937` 與通往主機核心的路徑，還來得及記下權限代碼的一部分；真正的指令內容仍被終端遮住。",
      "Ash 終端大成功：只呈現 canonical result 已授權的標題與路徑。",
    ),
    binding(
      "evt_meet_ash",
      "app_ash_terminal_peek",
      "成功",
      "你只看清文件名稱：`SPECIAL ORDER 937`。終端隨即黑屏，這個標題足以證明 Ash 隱瞞了某項公司指令。",
      "Ash 終端成功：維持標題級資訊，不提前顯示完整紙帶內容。",
    ),
    binding(
      "evt_meet_ash",
      "app_ash_terminal_peek",
      "驚險成功",
      "你瞥見特別指令 937 的標題，收回視線時終端已經鎖定。你知道自己碰到了不該看的資料，但還不知道內容。",
      "Ash 終端驚險成功：只保留標題級線索。",
    ),
    binding(
      "evt_order_937_reveal",
      "app_order_manual_read",
      "自動",
      "你讀到一份被裁切過的 937 摘要：樣本回收優先，船員安全被置於次位；缺失的段落讓簽發細節仍無法完全確認。",
      "937 手動閱讀：沿用 canonical 自動結果的摘要完整度。",
    ),
    binding(
      "evt_order_937_reveal",
      "app_order_copy_watch",
      "成功",
      "複製程序留下了足夠的 937 標記與樣本優先字樣，但遠端審計同時記錄了這次存取；你取得的是可用線索，不是未受限制的完整檔案。",
      "937 監看複製成功：只補充 canonical result 已授權的審計與片段資訊。",
    ),
  ]),

  clue_narcissus_prep: Object.freeze([
    binding(
      "evt_meet_ripley",
      "app_ripley_show_evidence",
      "大成功",
      "Ripley 把帶血的資料板攤在副控室燈下，畫面上顯示水仙號的維生與推進系統仍可使用；她同時指出，外部機械固定掛鉤必須在脫離前由駕駛艙手動處理。",
      "Ripley 證據大成功：只描寫 canonical clue 已授權的水仙號操作條件。",
    ),
    binding(
      "evt_meet_ripley",
      "app_ripley_show_evidence",
      "成功",
      "Ripley 願意共享水仙號的基本資料：接駁艇仍有獨立維生與推進能力，但脫離不是按下按鈕就會完成，機械掛鉤必須另外處理。",
      "Ripley 證據成功：不宣告燃料數值或新增發射流程。",
    ),
    binding(
      "evt_meet_ripley",
      "app_ripley_calm_lambert",
      "大成功",
      "Lambert 終於能把水仙號的預熱參數說清楚，Ripley 也補上最關鍵的限制：登艇之後仍要處理外部固定掛鉤，才能真正脫離母船。",
      "Ripley／Lambert 大成功：保留 canonical 給予的預熱與脫離限制。",
    ),
    binding(
      "evt_meet_ripley",
      "app_ripley_calm_lambert",
      "成功",
      "Lambert 提供了水仙號的預熱資訊。你們知道那艘接駁艇具備獨立維生能力，但真正離開前仍有一項必須在駕駛艙完成的機械操作。",
      "Ripley／Lambert 成功：保持操作限制的抽象描述，不新增回合或物品效果。",
    ),
  ]),
});

function canonicalClueExists(reference, clueId) {
  return Array.isArray(reference?.clues) && reference.clues.some((clue) => clue?.id === clueId);
}

function flagsOf(state) {
  return new Set(Array.isArray(state?.flags) ? state.flags : []);
}

function presentationFlagsAllowed(presentation, state) {
  const flags = flagsOf(state);
  return (presentation?.requiredFlags ?? []).every((flag) => flags.has(flag));
}

/**
 * Return a presentation only for a server-authorized canonical clue result.
 * The caller must pass the actual selected result key, not a model-proposed tier.
 * Some entries also require a post-effect state flag, such as Ash's confirmed
 * identity, before a stronger disclosure can be used.
 */
export function cluePresentationFor(
  reference,
  { clueId, sceneId, approachId, outcomeTier, state } = {},
) {
  if (reference?.sourcePackId !== PACK_ID) return null;
  if (!clueId || !sceneId || !approachId || !APPROVED_TIERS.has(outcomeTier)) return null;
  if (!canonicalClueExists(reference, clueId)) return null;
  if (!Array.isArray(state?.clues) || !state.clues.includes(clueId)) return null;
  const match = APPROVED_PRESENTATIONS[clueId]?.find(
    (entry) => entry.sceneId === sceneId
      && entry.approachId === approachId
      && entry.outcomeTier === outcomeTier
      && presentationFlagsAllowed(entry, state),
  );
  return match ? { ...match } : null;
}

export function approvedCluePresentationCount() {
  return Object.values(APPROVED_PRESENTATIONS).reduce((total, entries) => total + entries.length, 0);
}

export function approvedClueIds() {
  return Object.freeze(Object.keys(APPROVED_PRESENTATIONS));
}
