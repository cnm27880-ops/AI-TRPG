// Combat V2 戰術控制台 —— 前端。
//
// **這個檔案不做任何規則判定。** 它只做三件事：把伺服器回的公開狀態畫出來、
// 收集玩家的選擇、把選擇送回去。哪一顆按鈕能按、消耗什麼、距離合不合法、
// 打不打得中——全部由伺服器決定並寫在 payload 裡（規格第12節第1點）。
//
// 具體來說，這裡刻意**沒有**：
//   - 任何距離比較（不會出現 range === "close" 這種判斷來決定按鈕能不能按）
//   - 任何 cost 計算（cost 直接印伺服器給的 action.cost / action.costHint）
//   - 任何命中或傷害的推算
//   - 任何戰鬥用的自由文字輸入框（規格第3節第4點、第11.5節第10點）
//
// 唯一的例外是「整輪／全回合會鎖住哪些低階動作」的即時視覺回饋：那是在等伺服器
// 回預覽結果之前的樂觀繪製，鎖定的**權威**仍然是伺服器 preview 回來的選單。

/* global currentSessionId, adoptCharacter, escapeHtml */

// --- 狀態（全部來自伺服器，除了「玩家還沒送出的選擇」）---
let cv2Battle = null;          // 伺服器回的公開戰鬥狀態
let cv2Selection = [];         // [{ actionId, targetId }] —— 還沒確認的本回合選擇
let cv2Busy = false;           // 有請求在飛（resolving），期間所有按鈕鎖定
let cv2Notice = null;          // { text, level } 給玩家的一句提示（409、驗證失敗）

const CV2_TYPE_ORDER = ["swift", "move", "standard", "fullRound", "fullTurn"];

function cv2El(id) {
  return document.getElementById(id);
}

/** 產生一個 requestId。同一次確認重試時沿用同一個，讓伺服器的冪等機制生效。 */
function cv2NewRequestId() {
  return `cv2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// 進出戰鬥畫面
// ---------------------------------------------------------------------------

function enterCombatV2View() {
  document.body.classList.add("is-combat-v2-view");
  const panel = cv2El("combat-v2-panel");
  if (panel) panel.style.display = "flex";
}

function leaveCombatV2View() {
  cv2Battle = null;
  cv2Selection = [];
  cv2Notice = null;
  document.body.classList.remove("is-combat-v2-view");
  const panel = cv2El("combat-v2-panel");
  if (panel) panel.style.display = "none";
}

/** 開始一場 Combat V2 戰鬥。 */
async function startCombatV2(encounterId = null) {
  if (!currentSessionId || cv2Busy) return;
  cv2Busy = true;
  try {
    const res = await fetch("/api/combat/v2/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId, encounterId }),
    });
    const payload = await res.json();
    if (!payload.ok) {
      cv2Notice = { text: payload.error ?? "無法開始戰鬥", level: "error" };
      // 已經有一場在進行中：直接把它接回來，而不是留一個打不開的按鈕。
      if (payload.code === "BATTLE_IN_PROGRESS") await restoreCombatV2();
      return;
    }
    cv2Battle = payload.battle;
    cv2Selection = [];
    cv2Notice = null;
    if (payload.character && typeof adoptCharacter === "function") adoptCharacter(payload.character);
    enterCombatV2View();
  } catch (err) {
    console.error("[COMBAT_V2] /api/combat/v2/start 失敗", err);
    cv2Notice = { text: `連線失敗：${err.message}`, level: "error" };
  } finally {
    cv2Busy = false;
    renderCombatV2();
  }
}

/**
 * 從伺服器把目前戰鬥狀態接回來。**斷線重連與 409 之後一律走這條**：
 * 前端不重播任何本地狀態，一切以伺服器為準（規格第10節最後一列、第7.2節第7點）。
 */
async function restoreCombatV2({ quiet = false } = {}) {
  if (!currentSessionId) return false;
  try {
    const res = await fetch(`/api/combat/v2/state?sessionId=${encodeURIComponent(currentSessionId)}`);
    const payload = await res.json();
    if (!payload.ok) return false;
    cv2Battle = payload.battle;
    // 狀態換了一版，之前選的東西不再保證合法，一律清空要求玩家重新確認。
    cv2Selection = [];
    if (!quiet) cv2Notice = { text: "戰鬥狀態已更新，請重新確認你的選擇。", level: "warn" };
    if (payload.character && typeof adoptCharacter === "function") adoptCharacter(payload.character);
    enterCombatV2View();
    renderCombatV2();
    return true;
  } catch (err) {
    console.error("[COMBAT_V2] 還原戰鬥狀態失敗", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// 選擇
// ---------------------------------------------------------------------------

function cv2FindAction(actionId) {
  return (cv2Battle?.availableActions ?? []).find((a) => a.id === actionId) ?? null;
}

function cv2IsSelected(actionId) {
  return cv2Selection.some((s) => s.actionId === actionId);
}

/**
 * 按下一張行動卡。選了就取消、沒選就加入，然後向伺服器要一次預覽——
 * 預覽回來的選單才是權威（規格第5.1節第8點）。
 */
async function cv2ToggleAction(actionId) {
  if (cv2Busy || !cv2Battle?.active) return;
  const action = cv2FindAction(actionId);
  if (!action) return;

  if (cv2IsSelected(actionId)) {
    cv2Selection = cv2Selection.filter((s) => s.actionId !== actionId);
  } else {
    if (!action.available) return;   // 不可用的卡不接受點擊（伺服器也會擋，這裡只是不浪費一次往返）
    cv2Selection = [...cv2Selection, { actionId, targetId: action.targetId ?? null }];
  }
  cv2Notice = null;
  renderCombatV2();
  await cv2Preview();
}

function cv2ClearSelection() {
  if (cv2Busy) return;
  cv2Selection = [];
  cv2Notice = null;
  // 清空之後要拿回「沒有任何選擇」的那份選單，否則畫面上還留著被鎖住的卡。
  restoreCombatV2({ quiet: true });
}

/**
 * 向伺服器要一次預覽：這組選擇合不合法、扣完之後還剩什麼、選單變成什麼樣。
 * **不改變任何狀態**，所以玩家每按一顆按鈕都可以問一次。
 */
async function cv2Preview() {
  if (!cv2Battle?.active || cv2Selection.length === 0) return;
  try {
    const res = await fetch("/api/combat/v2/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: currentSessionId,
        battleId: cv2Battle.battleId,
        stateVersion: cv2Battle.stateVersion,
        preview: true,
        selectedActions: cv2Selection,
      }),
    });
    const payload = await res.json();
    if (res.status === 409) {
      await restoreCombatV2();
      return;
    }
    if (!payload.ok) return;

    if (payload.valid) {
      // 用伺服器算出來的「扣完之後」的額度與選單重畫，locked/unavailable 才會正確。
      cv2Battle = { ...cv2Battle, playerActionBudget: payload.playerActionBudget, availableActions: payload.availableActions };
      cv2Notice = null;
    } else {
      cv2Notice = { text: payload.error ?? "這組選擇目前不合法", level: "warn" };
    }
  } catch (err) {
    console.error("[COMBAT_V2] 預覽失敗", err);
  } finally {
    renderCombatV2();
  }
}

/** 確認並結算。送出後進入 resolving，所有按鈕鎖定，避免重複送出。 */
async function cv2Confirm() {
  if (cv2Busy || !cv2Battle?.active || cv2Selection.length === 0) return;
  cv2Busy = true;
  cv2Notice = null;
  renderCombatV2();

  const requestId = cv2NewRequestId();
  try {
    const res = await fetch("/api/combat/v2/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: currentSessionId,
        battleId: cv2Battle.battleId,
        stateVersion: cv2Battle.stateVersion,
        requestId,
        // **只送 ID 與目標。** 沒有 cost、沒有 actionType、沒有距離、沒有結果。
        selectedActions: cv2Selection.map((s) => ({ actionId: s.actionId, targetId: s.targetId })),
      }),
    });
    const payload = await res.json();

    if (res.status === 409) {
      // 狀態版本衝突：重新取得狀態並要求玩家重新確認，**不靜默重送**（規格第8.4節第4點）。
      cv2Battle = payload.battle ?? cv2Battle;
      cv2Selection = [];
      cv2Notice = { text: payload.error ?? "戰鬥狀態已更新，請重新確認你的選擇。", level: "warn" };
      if (!payload.battle) await restoreCombatV2();
      return;
    }
    if (!payload.ok) {
      cv2Battle = payload.battle ?? cv2Battle;
      cv2Selection = [];
      cv2Notice = { text: payload.error ?? "這一輪的行動被拒絕", level: "error" };
      return;
    }

    cv2Battle = payload.battle;
    cv2Selection = [];
    if (payload.character && typeof adoptCharacter === "function") adoptCharacter(payload.character);
  } catch (err) {
    console.error("[COMBAT_V2] 結算失敗", err);
    // 連線失敗時**不自動重試**：同一個 requestId 重送是安全的，但要由玩家決定。
    cv2Notice = { text: `連線失敗，這一輪可能沒有送出。請重新確認。：${err.message}`, level: "error" };
    await restoreCombatV2({ quiet: true });
  } finally {
    cv2Busy = false;
    renderCombatV2();
  }
}

// ---------------------------------------------------------------------------
// 繪製
// ---------------------------------------------------------------------------

function cv2Escape(text) {
  if (typeof escapeHtml === "function") return escapeHtml(String(text ?? ""));
  return String(text ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function renderCombatV2() {
  if (!cv2Battle) return;
  const b = cv2Battle;

  // A. 狀態列
  const phaseLabels = {
    player_selection: "戰鬥中·選擇行動",
    resolving: "結算中",
    enemy_resolution: "敵方行動",
    ended: "戰鬥結束",
  };
  const phaseEl = cv2El("cv2-phase");
  if (phaseEl) {
    phaseEl.textContent = cv2Busy ? "結算中" : (phaseLabels[b.phase] ?? b.phase);
    phaseEl.dataset.phase = cv2Busy ? "resolving" : b.phase;
  }
  const roundEl = cv2El("cv2-round");
  if (roundEl) roundEl.textContent = b.round;
  const sceneEl = cv2El("cv2-scene");
  if (sceneEl) {
    sceneEl.textContent = b.scene.label;
    sceneEl.title = b.scene.label;
  }

  cv2RenderPlayerCard(b);
  cv2RenderEnemyCards(b);
  cv2RenderField(b);
  cv2RenderActions(b);
  cv2RenderSummary(b);
  cv2RenderLog(b);
  cv2RenderOutcome(b);
}

/** B. 玩家狀態卡。 */
function cv2RenderPlayerCard(b) {
  const box = cv2El("cv2-player-card");
  if (!box) return;
  const p = b.player;
  const weapons = b.loadout.weapons
    .map((w) => `${cv2Escape(w.label)}${w.ammo ? `（${w.ammo.loaded}/${w.ammo.magazine}，備彈匣 ${w.ammo.spareMagazines}）` : ""}`)
    .join("、");
  const items = Object.entries(b.loadout.items ?? {})
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${cv2Escape(key === "medkit" ? "醫療包" : key)}×${count}`)
    .join("、");

  box.innerHTML = `
    <div class="cv2-card-title">
      <span class="cv2-card-name">${cv2Escape(p.name)}</span>
      <span>${cv2Escape(p.healthTier)}</span>
    </div>
    <div class="cv2-kv">
      <span>生命 <b>${p.hp.intact}/${p.hp.max}</b></span>
      <span>傷勢 <b>沖擊 ${p.hp.B}／嚴重 ${p.hp.L}／惡性 ${p.hp.A}</b></span>
      <span>護甲 <b>${p.armor}</b></span>
      <span>距離 <b>${cv2Escape(b.distance.currentLabel ?? "—")}</b></span>
    </div>
    <div class="cv2-kv" style="margin-top:.3rem">
      <span>武器 <b>${weapons || "—"}</b></span>
      ${items ? `<span>物品 <b>${items}</b></span>` : ""}
      ${p.coverFeatureId ? `<span>掩體 <b>有</b></span>` : ""}
    </div>
    <div>${p.statuses.map((s) => `<span class="cv2-status-chip" title="${cv2Escape(s.description ?? "")}">${cv2Escape(s.label)}</span>`).join("")}</div>
    ${cv2BudgetHtml(b.playerActionBudget)}
  `;
}

/**
 * 五類動作的剩餘量。**只畫三個基礎池**——整輪與全回合不是資源，
 * 它們的消耗寫在行動卡上（規格第7.1節B區）。
 */
function cv2BudgetHtml(budget) {
  const labels = { swift: "迅捷", move: "移動", standard: "標準" };
  const pills = ["swift", "move", "standard"].map((pool) => {
    const left = budget.remaining[pool];
    const cls = left > 0 ? "is-available" : "is-spent";
    return `<span class="cv2-budget-pill ${cls}">${labels[pool]} <b>${left}</b></span>`;
  });
  return `<div class="cv2-budget" aria-label="剩餘動作額度">${pills.join("")}</div>`;
}

/** C. 敵方狀態卡。只畫伺服器願意給的公開欄位——這裡沒有敵人的精確 HP 可畫。 */
function cv2RenderEnemyCards(b) {
  const box = cv2El("cv2-enemy-cards");
  if (!box) return;
  box.innerHTML = b.enemies
    .map(
      (e) => `
      <div class="cv2-card cv2-card-enemy ${e.down ? "is-down" : ""}">
        <div class="cv2-card-title">
          <span class="cv2-card-name">${cv2Escape(e.name)}</span>
          <span>${cv2Escape(e.healthTier)}</span>
        </div>
        <div class="cv2-kv">
          <span>威脅 <b>${cv2Escape(e.threatLabel)}</b></span>
          <span>距離 <b>${cv2Escape(e.rangeLabel ?? "—")}</b></span>
          <span>${e.inCover ? "在掩體後" : "無掩體"}</span>
          <span>${e.visible ? "視線內" : "視線外"}</span>
        </div>
        <div>${e.statuses.map((s) => `<span class="cv2-status-chip">${cv2Escape(s.label)}</span>`).join("")}</div>
        ${e.telegraph ? `<div class="cv2-telegraph"><i class="fas fa-eye" aria-hidden="true"></i> ${cv2Escape(e.telegraph)}</div>` : ""}
      </div>`
    )
    .join("");
}

/** D. 距離帶與戰場資訊。 */
function cv2RenderField(b) {
  const box = cv2El("cv2-field");
  if (!box) return;
  const band = b.distance.band
    .map(
      (seg) => `
      <div class="cv2-band-seg ${seg.current ? "is-current" : ""}" ${seg.current ? 'aria-current="true"' : ""}>
        ${cv2Escape(seg.label)}<small>${cv2Escape(seg.description)}</small>
      </div>`
    )
    .join("");
  const features = b.scene.features
    .map(
      (f) => `<span class="cv2-feature ${f.state !== "ready" ? "is-used" : ""}" title="${cv2Escape(f.description)}">${cv2Escape(f.label)}</span>`
    )
    .join("");

  box.innerHTML = `
    <h4 class="cv2-section-title"><i class="fas fa-location-crosshairs" aria-hidden="true"></i> 戰場</h4>
    <div class="cv2-band" role="group" aria-label="目前距離：${cv2Escape(b.distance.currentLabel ?? "未知")}">${band}</div>
    <div class="cv2-field-line">目前位置：<b>${cv2Escape(b.scene.label)}</b></div>
    <div class="cv2-field-line">可見環境：${cv2Escape(b.scene.description || "—")}</div>
    <div class="cv2-field-line">戰場狀態：${cv2Escape(b.scene.terrain || "—")}${b.scene.lightsOut ? "、照明已切斷" : ""}</div>
    <div class="cv2-field-line">可互動：${features || "—"}</div>
  `;
}

/** E. 行動選單。依五類動作分組，每一組一個標題。 */
function cv2RenderActions(b) {
  const box = cv2El("cv2-actions");
  if (!box) return;
  if (!b.active) {
    box.innerHTML = "";
    return;
  }

  const groupNames = {
    swift: "迅捷行動",
    move: "移動行動",
    standard: "標準行動",
    fullRound: "整輪行動",
    fullTurn: "全回合行動",
  };
  const costHints = Object.fromEntries((b.actionTypes ?? []).map((t) => [t.type, t.costHint]));

  const html = CV2_TYPE_ORDER.map((type) => {
    const actions = (b.availableActions ?? []).filter((a) => a.actionType === type);
    if (actions.length === 0) return "";
    return `
      <div class="cv2-group">
        <div class="cv2-group-head">
          <span class="cv2-group-name">${groupNames[type]}</span>
          <span class="cv2-group-cost">${cv2Escape(costHints[type] ?? "")}</span>
        </div>
        <div class="cv2-group-grid">${actions.map(cv2ActionCardHtml).join("")}</div>
      </div>`;
  }).join("");

  box.innerHTML = `<h4 class="cv2-section-title"><i class="fas fa-hand-pointer" aria-hidden="true"></i> 本回合可用行動</h4>${html}`;
}

/**
 * 一張行動卡。四種狀態的區別：
 *   selected     已選
 *   locked       因為整輪／全回合的選擇而失去這個動作額度（伺服器算的，理由裡有「已使用」）
 *   unavailable  距離、裝備、資源或前置條件不符
 *   available    可選
 */
function cv2ActionCardHtml(action) {
  const selected = cv2IsSelected(action.id);
  const lockedByComposite = !action.available && /動作已使用/.test(action.unavailableReason ?? "") && cv2Selection.length > 0;
  const state = cv2Busy
    ? "resolving"
    : selected
      ? "selected"
      : action.available
        ? "available"
        : lockedByComposite
          ? "locked"
          : "unavailable";

  const disabled = cv2Busy || (!action.available && !selected);
  const ranges = action.validRanges.length ? action.validRanges.map(cv2RangeLabel).join("／") : "不限距離";

  return `
    <button type="button" class="cv2-action" data-cv2-action="${cv2Escape(action.id)}"
      data-state="${state}" ${disabled ? "disabled" : ""}
      aria-pressed="${selected}"
      aria-label="${cv2Escape(action.label)}，${cv2Escape(action.actionTypeLabel)}，${cv2Escape(action.costHint)}${action.available ? "" : `，目前不可用：${cv2Escape(action.unavailableReason ?? "")}`}">
      <span class="cv2-action-name">${selected ? "✓ " : ""}${cv2Escape(action.label)}</span>
      <span class="cv2-action-meta">${cv2Escape(action.actionTypeLabel)}｜${cv2Escape(action.costHint)}｜${cv2Escape(ranges)}｜${cv2Escape(cv2TargetLabel(action))}</span>
      <span class="cv2-action-desc">${cv2Escape(action.display.description)}</span>
      ${action.available ? "" : `<span class="cv2-action-why">${cv2Escape(action.unavailableReason ?? "")}</span>`}
    </button>`;
}

function cv2RangeLabel(range) {
  return { close: "近", medium: "中", far: "遠" }[range] ?? range;
}

function cv2TargetLabel(action) {
  return (
    {
      single_enemy: "單一敵人",
      self: "自身",
      ally: "隊友",
      feature: "場景物件",
      none: "無對象",
    }[action.targetMode] ?? action.targetMode
  );
}

/** F. 本回合選擇摘要。 */
function cv2RenderSummary(b) {
  const box = cv2El("cv2-summary");
  if (!box) return;
  if (!b.active) {
    box.innerHTML = `<div class="cv2-summary-rows"><span>戰鬥已結束。</span></div>`;
    return;
  }

  const byType = { swift: [], move: [], standard: [], fullRound: [], fullTurn: [] };
  for (const selection of cv2Selection) {
    const action = cv2FindAction(selection.actionId);
    if (action) byType[action.actionType]?.push(action.label);
  }
  const line = (label, list) => `<span>${label}：<b>${list.length ? cv2Escape(list.join("、")) : "未選擇"}</b></span>`;
  const remaining = b.playerActionBudget.remaining;

  box.innerHTML = `
    <div class="cv2-summary-rows">
      <span style="width:100%;color:var(--ink-400)">本回合選擇</span>
      ${line("迅捷", byType.swift)}
      ${line("移動", byType.move)}
      ${line("標準", byType.standard)}
      ${byType.fullRound.length ? line("整輪", byType.fullRound) : ""}
      ${byType.fullTurn.length ? line("全回合", byType.fullTurn) : ""}
      <span style="width:100%">剩餘：<b>迅捷 ${remaining.swift}／移動 ${remaining.move}／標準 ${remaining.standard}</b></span>
    </div>
    ${cv2Notice ? `<div class="cv2-notice ${cv2Notice.level === "error" ? "is-error" : ""}" role="alert">${cv2Escape(cv2Notice.text)}</div>` : ""}
    <div class="cv2-summary-buttons">
      <button type="button" class="cv2-clear" id="cv2-clear-btn" ${cv2Busy || cv2Selection.length === 0 ? "disabled" : ""}>清除選擇</button>
      <button type="button" class="cv2-confirm" id="cv2-confirm-btn" ${cv2Busy || cv2Selection.length === 0 ? "disabled" : ""}>
        ${cv2Busy ? "結算中…" : "確認並結算"}
      </button>
    </div>`;
}

/** G. 戰鬥紀錄。 */
function cv2RenderLog(b) {
  const box = cv2El("cv2-log");
  if (!box) return;
  box.innerHTML = (b.publicLog ?? [])
    .slice(-40)
    .map((line) => `<li data-kind="${cv2Escape(line.kind)}">${cv2Escape(line.text)}</li>`)
    .join("");
  box.scrollTop = box.scrollHeight;
}

function cv2RenderOutcome(b) {
  const box = cv2El("cv2-over");
  const text = cv2El("cv2-over-text");
  if (!box || !text) return;
  if (b.active || !b.outcome) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  text.textContent = b.outcome.winner === "player" ? "戰鬥結束——你活下來了。" : "你倒下了。";
}

// ---------------------------------------------------------------------------
// 事件（用事件委派，因為行動卡是每次重繪都重建的）
// ---------------------------------------------------------------------------

document.addEventListener("click", (event) => {
  const actionBtn = event.target.closest?.("[data-cv2-action]");
  if (actionBtn) {
    cv2ToggleAction(actionBtn.dataset.cv2Action);
    return;
  }
  if (event.target.closest?.("#cv2-confirm-btn")) { cv2Confirm(); return; }
  if (event.target.closest?.("#cv2-clear-btn")) { cv2ClearSelection(); return; }
  if (event.target.closest?.("#cv2-help-btn")) {
    const help = cv2El("cv2-help");
    if (help) help.hidden = !help.hidden;
    return;
  }
  if (event.target.closest?.("#cv2-over-close")) { leaveCombatV2View(); return; }
  if (event.target.closest?.("#cv2-exit-btn")) {
    // 進行中的戰鬥不得未經確認直接離開（規格第7.1節A區）。
    if (cv2Battle?.active && !window.confirm("戰鬥仍在進行中。離開後這場戰鬥仍會保留，之後可以回來繼續。確定離開嗎？")) return;
    leaveCombatV2View();
  }
});

// 鍵盤：Esc 收起說明。行動卡本身是 <button>，Tab／Enter／Space 由瀏覽器原生處理，
// 不需要（也不該）自己攔截——自製的鍵盤處理最容易漏掉輔助技術的操作路徑。
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const help = cv2El("cv2-help");
  if (help && !help.hidden) help.hidden = true;
});

// 匯出給 index.html 的 onclick 與 app.js 的續戰流程使用。
if (typeof window !== "undefined") {
  window.startCombatV2 = startCombatV2;
  window.restoreCombatV2 = restoreCombatV2;
  window.leaveCombatV2View = leaveCombatV2View;
  window.renderCombatV2 = renderCombatV2;
}
