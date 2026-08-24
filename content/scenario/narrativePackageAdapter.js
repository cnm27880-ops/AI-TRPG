// 《包.txt》內容包 adapter。
//
// 這一層只提供玩家可見的場景／轉場／NPC 演出素材；canonical reference
// 仍是事件、effects、位置、物品、威脅與結局的唯一真相。
// 尚未完成 canonical mapping 的內容保留在 package 中，但不會自動被 runtime 使用。

import contentPackage from "./examples/alienNostromo_v2_contentPackage.js";

const SUPPORTED_SOURCE_PACK_ID = "scenario.nostromo-01-v2";

const SCENE_NPCS = Object.freeze({
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

function sourceMatches(reference) {
  return reference?.sourcePackId === SUPPORTED_SOURCE_PACK_ID;
}

function packageLocationById(packageId) {
  const approved = contentPackage.approvedExplorationGap?.locations ?? [];
  return approved.find((item) => item?.locationId === packageId || item?.id === packageId)
    ?? contentPackage.locations.find((item) => item?.id === packageId)
    ?? null;
}

function packageTransitionById(packageId) {
  const approved = contentPackage.approvedExplorationGap?.transitions ?? [];
  return approved.find((item) => item?.routeId === packageId || item?.id === packageId)
    ?? contentPackage.transitions.find((item) => item?.id === packageId)
    ?? null;
}

function packageNpcById(npcId) {
  return contentPackage.npcs.find((item) => item?.id === npcId) ?? null;
}

export function narrativePackageFor(reference) {
  return sourceMatches(reference) ? contentPackage : null;
}

export function narrativeLocationFor(reference, canonicalLocationId) {
  const pack = narrativePackageFor(reference);
  const mapping = pack?.canonicalLocationMap?.[canonicalLocationId];
  if (!mapping?.packageId || !["direct", "alias"].includes(mapping.status)) return null;
  return packageLocationById(mapping.packageId);
}

export function narrativeTransitionFor(reference, canonicalTransitionId) {
  const pack = narrativePackageFor(reference);
  const mapping = pack?.canonicalRouteMap?.[canonicalTransitionId];
  if (!mapping?.packageId || !["direct", "alias"].includes(mapping.status)) return null;
  return packageTransitionById(mapping.packageId);
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

function publicContactIds(reference, state) {
  const sceneId = state?.currentSceneId;
  const sceneNpcIds = SCENE_NPCS[sceneId] ?? [];
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
 * 產生只供 server-side prompt 使用的 NPC Voice Bible 區塊。
 * 不回傳 privateGoals，也不在 Ash 未確認前送出會直接證明身分的破綻。
 */
export function buildNarrativeNpcPromptBlock(reference, state) {
  const pack = narrativePackageFor(reference);
  if (!pack) return "";
  const entries = publicContactIds(reference, state)
    .map((npcId) => safeNpcFields(packageNpcById(npcId), npcId, state))
    .filter(Boolean);
  if (!entries.length) return "";

  const lines = [
    "<NPC_Voice_Bible>",
    "【已接觸 NPC 的可觀察演出規範（只供本回合敘事）】",
    "以下內容只規範說話方式、可觀察反應與已公開層級；不能新增 NPC 行動、傷勢、物品、旗標或關係數值。",
  ];
  for (const entry of entries) {
    lines.push(`- ${entry.id}／${entry.title}`);
    if (entry.appearance.length) lines.push(`  外在與動作：${entry.appearance.join("；")}`);
    if (entry.speech.length) lines.push(`  語氣：${entry.speech.join("；")}`);
    if (entry.relationship) lines.push(`  當前關係演出參考：${entry.relationship}`);
    if (entry.observableBehavior.length) lines.push(`  可觀察習慣：${entry.observableBehavior.join("；")}`);
    if (entry.reactionLibrary.length) lines.push(`  可用反應參考：${entry.reactionLibrary.join("；")}`);
  }
  lines.push(
    "NPC 只能知道自己親眼看見、親耳聽見或已由 Engine_Result／Reference_Event 明示的事情。",
    "不要把語氣庫中的反應當成已發生的 engine effect；若本回合沒有對應 trigger，就只維持語氣與可觀察姿態。",
    "Ash 的生化人身分在未出現公開解鎖旗標前，不得直接說破、不得用語氣庫暗示成確定事實。",
    "</NPC_Voice_Bible>",
  );
  return lines.join("\n");
}

export function narrativePackageCoverage(reference) {
  const pack = narrativePackageFor(reference);
  if (!pack) return null;
  return {
    locations: pack.locations.length,
    transitions: pack.transitions.length,
    npcs: pack.npcs.length,
    mappedLocations: Object.values(pack.canonicalLocationMap).filter((item) => item?.packageId && ["direct", "alias"].includes(item.status)).length,
    mappedTransitions: Object.values(pack.canonicalRouteMap).filter((item) => item?.packageId && ["direct", "alias"].includes(item.status)).length,
    approvedLocations: pack.approvedExplorationGap?.locations?.length ?? 0,
    approvedTransitions: pack.approvedExplorationGap?.transitions?.length ?? 0,
  };
}
