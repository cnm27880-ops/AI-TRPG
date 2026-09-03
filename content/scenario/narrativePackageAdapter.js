// 《包.txt》內容包 adapter。
//
// 這一層只提供玩家可見的場景／轉場／NPC 演出素材；canonical reference
// 仍是事件、effects、位置、物品、威脅與結局的唯一真相。
// 尚未完成 canonical mapping 的內容保留在 package 中，但不會自動被 runtime 使用。

import alienContentPackage from "./examples/alienNostromo_v2_contentPackage.js";
import jurassicParkContentPackage from "./examples/jurassicPark_v1_contentPackage.js";

// 每個副本各自的演出素材包，用 sourcePackId 對照。新副本要接演出素材時，
// 在這裡多登記一筆就好，不用改下面任何一個 export function。
const CONTENT_PACKAGES = Object.freeze({
  "scenario.nostromo-01-v2": alienContentPackage,
  "scenario.jurassic-park-01-v1": jurassicParkContentPackage,
});

// Alien V2 專用的場景→NPC 對照表（沒有在 reference.npcs[] 宣告
// contactFlags／presenceScenes 的舊副本，繼續吃這張表）。
const SCENE_NPCS = Object.freeze({
  // [2026-09-03] 陸遠從休眠室這一刻起就在場（玩家一睜眼就看到他），不是到了 A 甲板
  // 才第一次登場——canonical entryNarration 已經把他寫進休眠室的開場敘述。
  // 少了這一行，[NPC_ACTIVE_STATE] 不會把他列進在場名單，AI 就只能演出一個無名男子，
  // 到了 A 甲板才「正式介紹」，變成同一個人被介紹兩次。
  evt_cryo_clearance: ["npc_luyuan"],
  evt_deck_a_recon: ["npc_luyuan"],
  evt_meet_ash: ["npc_ash"],
  evt_ash_ambush: ["npc_ash"],
  evt_meet_ripley: ["npc_ripley", "npc_lambert"],
  evt_engine_coolant_prep: ["npc_parker"],
  evt_trigger_overload: ["npc_parker"],
  evt_vent_ambush_escape: ["npc_parker"],
});

const ALARM_FLAGS = new Set([
  "flag_overload_active",
  "flag_ship_destroyed",
  "flag_alarm_active",
  "flag_self_destruct_started",
]);

const HIGH_THREAT_FLAGS = new Set([
  "flag_noise_made",
  "flag_ash_hostile",
  "flag_ash_hostile_pending",
  "flag_alien_followed",
  "flag_xenomorph_contact",
]);

function flagsOf(state) {
  return new Set(Array.isArray(state?.flags) ? state.flags : []);
}

function packageLocationById(pack, packageId) {
  const approved = pack.approvedExplorationGap?.locations ?? [];
  return approved.find((item) => item?.locationId === packageId || item?.id === packageId)
    ?? (pack.locations ?? []).find((item) => item?.id === packageId)
    ?? null;
}

function packageTransitionById(pack, packageId) {
  const approved = pack.approvedExplorationGap?.transitions ?? [];
  return approved.find((item) => item?.routeId === packageId || item?.id === packageId)
    ?? (pack.transitions ?? []).find((item) => item?.id === packageId)
    ?? null;
}

function packageNpcById(pack, npcId) {
  return (pack.npcs ?? []).find((item) => item?.id === npcId) ?? null;
}

export function narrativePackageFor(reference) {
  return CONTENT_PACKAGES[reference?.sourcePackId] ?? null;
}

export function narrativeLocationFor(reference, canonicalLocationId) {
  const pack = narrativePackageFor(reference);
  const mapping = pack?.canonicalLocationMap?.[canonicalLocationId];
  if (!pack || !mapping?.packageId || !["direct", "alias"].includes(mapping.status)) return null;
  return packageLocationById(pack, mapping.packageId);
}

export function narrativeTransitionFor(reference, canonicalTransitionId) {
  const pack = narrativePackageFor(reference);
  const mapping = pack?.canonicalRouteMap?.[canonicalTransitionId];
  if (!pack || !mapping?.packageId || !["direct", "alias"].includes(mapping.status)) return null;
  return packageTransitionById(pack, mapping.packageId);
}

function locationVariant(location, state) {
  const variants = Array.isArray(location?.revisitVariants) ? location.revisitVariants : [];
  if (!variants.length) return null;
  const locationId = location?.locationId ?? location?.id;
  const flags = flagsOf(state);
  const ashDestroyed = state?.npcStatuses?.npc_ash === "destroyed" || flags.has("flag_ash_destroyed");
  const orderRevealed = flags.has("flag_order_937_revealed");
  const alarm = [...ALARM_FLAGS].some((flag) => flags.has(flag)) || state?.shipStatus === "overload_started";
  const highThreat = [...HIGH_THREAT_FLAGS].some((flag) => flags.has(flag));
  const activeLabels = [];
  if (ashDestroyed) activeLabels.push("Ash 被擊毀後");
  if (orderRevealed) activeLabels.push("查詢 937 指令後");
  if (alarm) activeLabels.push("警報", "自毀");
  if (highThreat) activeLabels.push("高威脅", "異形", "追入", "現身");

  const matched = variants.find((variant) => activeLabels.some((label) => variant.label.includes(label)));
  if (matched) return matched;
  if (locationId && state?.locationVisitCounts && Number(state.locationVisitCounts[locationId]) > 1) {
    return variants.find((variant) => variant.label.includes("常規回訪")) ?? variants[0];
  }
  return null;
}

/** 只回傳已親自到過地點的公開內容；鄰近但未到過的地點不提前顯示完整描述。 */
export function narrativeLocationView(reference, state, canonicalLocationId, { visited = false } = {}) {
  const location = narrativeLocationFor(reference, canonicalLocationId);
  if (!location || !visited) return null;
  const variant = locationVariant(location, state);
  return {
    description: location.playerVisibleDescription,
    atmosphere: location.atmosphere || null,
    landmarks: Array.isArray(location.knownLandmarks) ? location.knownLandmarks.slice(0, 4) : [],
    hazardHints: Array.isArray(location.visibleHazardHints) ? location.visibleHazardHints.slice(0, 3) : [],
    purpose: location.playerPurpose || null,
    ...(variant ? { revisitVariant: variant.text, revisitVariantLabel: variant.label } : {}),
  };
}

function transitionVariant(transition, state) {
  if (!transition) return null;
  const flags = flagsOf(state);
  const alarm = [...ALARM_FLAGS].some((flag) => flags.has(flag)) || state?.shipStatus === "overload_started";
  const highThreat = [...HIGH_THREAT_FLAGS].some((flag) => flags.has(flag));
  if (alarm && transition.alarm) return { state: "alarm", text: transition.alarm };
  if (highThreat && transition.highThreat) return { state: "highThreat", text: transition.highThreat };
  if (transition.standard) return { state: "standard", text: transition.standard };
  return null;
}

/** 只有 canonical route mapping 有明確對應時才會使用；不接受任意目的地或任意文字。 */
export function narrativeTransitionText(reference, state, canonicalTransitionId) {
  const transition = narrativeTransitionFor(reference, canonicalTransitionId);
  return transitionVariant(transition, state);
}

function sceneApproaches(scene) {
  return [
    ...(Array.isArray(scene?.approaches) ? scene.approaches : []),
    ...(Array.isArray(scene?.phases) ? scene.phases.flatMap((phase) => phase?.approaches ?? []) : []),
  ];
}

function hasCanonicalOutcome(reference, sceneId, approachId, outcomeTier) {
  const scene = reference?.scenes?.find((item) => item?.id === sceneId);
  const approach = sceneApproaches(scene).find((item) => item?.id === approachId);
  return Boolean(approach?.outcomes && Object.prototype.hasOwnProperty.call(approach.outcomes, outcomeTier));
}

function actionMatchesSelection(selection, actionText) {
  if (!selection || typeof selection !== "object") return false;
  const text = String(actionText ?? "").trim();
  if (!text) return false;
  return Array.isArray(selection.any) && selection.any.some((keyword) => text.includes(keyword));
}

/**
 * 只挑選已通過 canonical binding 的重大場景演出 overlay。
 * 這不是結果裁定器：scene、approach、outcomeTier 必須先由 reference adapter／engine 決定，
 * overlay 只能補畫面與對話，不能建立任何 effects、狀態、物品、傷勢或結局。
 */
export function narrativeMajorSceneVariant(reference, {
  sceneId,
  approachId,
  outcomeTier,
  actionText = "",
} = {}) {
  const pack = narrativePackageFor(reference);
  const variants = pack?.approvedMajorSceneVariants?.variants ?? [];
  if (!sceneId || !approachId || !outcomeTier || !hasCanonicalOutcome(reference, sceneId, approachId, outcomeTier)) return null;

  const candidates = variants.filter((variant) =>
    variant?.sceneId === sceneId &&
    variant?.approachId === approachId &&
    variant?.outcomeTier === outcomeTier
  );
  if (!candidates.length) return null;
  const selected = candidates.find((variant) => actionMatchesSelection(variant.selection, actionText))
    ?? candidates.find((variant) => variant.selection?.default === true)
    ?? candidates[0];
  if (!selected?.text) return null;
  return {
    id: selected.id,
    sceneId: selected.sceneId,
    approachId: selected.approachId,
    outcomeTier: selected.outcomeTier,
    narrativeMode: selected.narrativeMode ?? "normal",
    text: selected.text,
    npcContext: Array.isArray(selected.npcContext) ? selected.npcContext.slice() : [],
  };
}

// 副本可以在 reference.npcs[] 宣告 contactFlags／presenceScenes（見 referenceAdapter.js
// 的 npcHasPublicContact，同一套宣告兩邊共用）；沒有宣告的舊副本（Alien V2）
// 繼續吃檔頭那張寫死的 SCENE_NPCS 對照表，行為完全不變。
function declaredContactIds(reference, state) {
  const flags = new Set(Array.isArray(state?.flags) ? state.flags : []);
  const sceneId = state?.currentSceneId;
  return (reference?.npcs ?? [])
    .filter((npc) => Array.isArray(npc?.contactFlags) || Array.isArray(npc?.presenceScenes))
    .filter((npc) =>
      (npc.contactFlags ?? []).some((flag) => flags.has(flag)) ||
      (npc.presenceScenes ?? []).includes(sceneId)
    )
    .map((npc) => npc.id);
}

/**
 * 這一刻**在場**的 NPC id（不是「已接觸過」——那是 referenceAdapter 的 npcHasPublicContact）。
 *
 * 匯出是為了讓 npcStateMachine.js 共用同一份在場判定。同一個概念在專案裡出現第二份實作，
 * 兩份遲早會對不上，然後會出現「語氣庫演了他、狀態機沒算他」這種只在特定場景才看得到的 bug。
 */
export function onStageNpcIds(reference, state) {
  const sceneId = state?.currentSceneId;
  const declared = declaredContactIds(reference, state);
  const sceneNpcIds = declared.length ? declared : (SCENE_NPCS[sceneId] ?? []);
  const canonicalIds = new Set((reference?.npcs ?? []).map((npc) => npc?.id).filter(Boolean));
  return sceneNpcIds.filter((id) => {
    if (!canonicalIds.has(id)) return false;
    const status = state?.npcStatuses?.[id] ?? "alive";
    return !["dead", "destroyed"].includes(status);
  });
}

function relationshipLabel(npcId, state) {
  const trust = Number(state?.npcTrust?.[npcId]);
  if (Number.isFinite(trust) && trust <= -3) return "敵對反擊";
  if (Number.isFinite(trust) && trust < 0) return "戒備懷疑";
  if (Number.isFinite(trust) && trust >= 3) return "深度信任";
  if (Number.isFinite(trust) && trust > 0) return "暫時合作";
  return "初始／保持距離";
}

function relationLine(npc, label) {
  const lines = Array.isArray(npc?.關係階段反應) ? npc.關係階段反應 : [];
  return lines.find((line) => line.includes(label)) ?? lines[0] ?? null;
}

function safeNpcFields(npc, npcId, state) {
  if (!npc) return null;
  const ashUnconfirmed = npcId === "npc_ash" && !flagsOf(state).has("flag_ash_synthetic_known");
  const observableBehavior = Object.entries(npc).find(([key]) => key.startsWith("可觀察行為特徵"))?.[1] ?? [];
  return {
    id: npcId,
    title: npc.title,
    appearance: (npc["外在形象與初次目擊"] ?? []).slice(0, ashUnconfirmed ? 1 : 2),
    speech: (npc["說話語氣與節奏"] ?? []).slice(0, 2),
    relationship: relationLine(npc, relationshipLabel(npcId, state)),
    observableBehavior: ashUnconfirmed ? [] : observableBehavior.slice(0, 2),
    reactionLibrary: ashUnconfirmed ? [] : (npc["線索觸發反應"] ?? []).slice(0, 3),
  };
}

/**
 * Ash 的語氣素材是唯一有「揭露閘門」的一份：他的生化人破綻要等公開旗標才能送出。
 * 那個閘門吃 state，所以他的語氣庫不能跟其他人一樣搬進靜態層——見下面兩個函式的分工。
 */
const REVEAL_GATED_NPC_IDS = new Set(["npc_ash"]);

/**
 * 【靜態層】一個 NPC 的固定語氣素材：外在、語氣、可觀察習慣、反應參考。
 *
 * [2026-08-31] 這些字以前每回合跟著 <NPC_Voice_Bible> 送進動態層，佔 reference block
 * 的 44%（場上兩個 NPC 就 1077 字元）。但它們一個字都不會變——它們是內容包裡
 * 寫死的角色素材，不吃任何 state。只有「當前關係演出參考」那一行會隨信任變動。
 *
 * 所以拆開：素材進靜態層付一次，關係那一行留在動態層。
 * 這是同一種病的第三次發作，前兩次是合作契約與 Agenda／Taboo／Knowledge 基線。
 *
 * @returns {string|null} 沒有素材、或這個 NPC 有揭露閘門時回傳 null
 */
export function narrativeNpcVoiceProfile(reference, npcId) {
  if (REVEAL_GATED_NPC_IDS.has(npcId)) return null;
  const pack = narrativePackageFor(reference);
  const npc = pack ? packageNpcById(pack, npcId) : null;
  if (!npc) return null;
  const observableBehavior = Object.entries(npc).find(([key]) => key.startsWith("可觀察行為特徵"))?.[1] ?? [];
  const lines = [];
  const appearance = (npc["外在形象與初次目擊"] ?? []).slice(0, 2);
  const speech = (npc["說話語氣與節奏"] ?? []).slice(0, 2);
  if (appearance.length) lines.push(`  外在與動作：${appearance.join("；")}`);
  if (speech.length) lines.push(`  語氣：${speech.join("；")}`);
  if (observableBehavior.length) lines.push(`  可觀察習慣：${observableBehavior.slice(0, 2).join("；")}`);
  const reactions = (npc["線索觸發反應"] ?? []).slice(0, 3);
  if (reactions.length) lines.push(`  可用反應參考：${reactions.join("；")}`);
  return lines.length ? lines.join("\n") : null;
}

/**
 * 【動態層】每回合仍然會變的那一小段語氣資訊。
 *
 * 現在只剩兩種東西：
 *   1. 在場 NPC 的「當前關係演出參考」——它隨信任跨過分級而換一句。
 *   2. 有揭露閘門的 NPC（Ash）的完整語氣素材——他的破綻不能提前進靜態層。
 *
 * 固定素材在 npcCooperationContract.js 的 NPC 固定檔案裡（靜態層，整場付一次）。
 */
export function buildNarrativeNpcPromptBlock(reference, state) {
  const pack = narrativePackageFor(reference);
  if (!pack) return "";
  const entries = onStageNpcIds(reference, state)
    .map((npcId) => safeNpcFields(packageNpcById(pack, npcId), npcId, state))
    .filter(Boolean);
  if (!entries.length) return "";

  const body = [];
  for (const entry of entries) {
    const gated = REVEAL_GATED_NPC_IDS.has(entry.id);
    const rows = [];
    if (entry.relationship) rows.push(`  當前關係演出參考：${entry.relationship}`);
    if (gated) {
      // 只有揭露閘門後面的 NPC 才在這裡重送固定素材——因為他的素材本來就是分階段的。
      if (entry.appearance.length) rows.push(`  外在與動作：${entry.appearance.join("；")}`);
      if (entry.speech.length) rows.push(`  語氣：${entry.speech.join("；")}`);
      if (entry.observableBehavior.length) rows.push(`  可觀察習慣：${entry.observableBehavior.join("；")}`);
      if (entry.reactionLibrary.length) rows.push(`  可用反應參考：${entry.reactionLibrary.join("；")}`);
    }
    if (rows.length) body.push(`- ${entry.id}／${entry.title}`, ...rows);
  }
  if (!body.length) return "";

  return [
    "<NPC_Voice_Bible>",
    "【在場 NPC 這一回合的關係與已解鎖素材】固定的語氣素材見系統提示的 NPC 固定檔案。",
    ...body,
    "</NPC_Voice_Bible>",
  ].join("\n");
}

export function narrativePackageCoverage(reference) {
  const pack = narrativePackageFor(reference);
  if (!pack) return null;
  return {
    locations: (pack.locations ?? []).length,
    transitions: (pack.transitions ?? []).length,
    npcs: (pack.npcs ?? []).length,
    mappedLocations: Object.values(pack.canonicalLocationMap ?? {}).filter((item) => item?.packageId && ["direct", "alias"].includes(item.status)).length,
    mappedTransitions: Object.values(pack.canonicalRouteMap ?? {}).filter((item) => item?.packageId && ["direct", "alias"].includes(item.status)).length,
    approvedLocations: pack.approvedExplorationGap?.locations?.length ?? 0,
    approvedTransitions: pack.approvedExplorationGap?.transitions?.length ?? 0,
    approvedMajorSceneVariants: pack.approvedMajorSceneVariants?.variants?.length ?? 0,
  };
}
