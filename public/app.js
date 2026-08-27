// 無限恐怖TRPG —— 前端應用層 (六維十技能純淨版)

let currentCharacter = null;
let currentOptions = [];
let currentReferenceMode = false;
const MAX_FREE_ACTION_CHARS = 1000;
let turnInFlight = false;
let travelInFlight = false;
let currentSessionId = null;
let chargenRules = null;
let lastTravelRequest = null;
// scenario HUD 可能因 turn、travel、重整與戰鬥回應反覆重繪；同一 session 的系統通知只進故事流一次。
let scenarioNoticeSessionId = null;
const scenarioNoticeKeys = new Set();

const SESSION_KEY = "ai-trpg-session-id";
const RETIRED_SCENARIO_ID = "scenario.nostromo-01";

/**
 * 前端這邊要知道的供應商差異——只有三件事：要不要金鑰、要不要自己填Base URL、有沒有預設模型。
 *
 * [設計] 這份表刻意跟後端 content/llm/providers.js 的 PROVIDERS 分開，只抄「玩家設定畫面
 * 需要的欄位」，不抄 baseUrl / defaultModel 那些會變動的值——前端猜不到也不需要知道，
 * 真正的解析一律在後端做（後端 turn.js 也有同一組檢查當最後防線）。
 * 新增一家OpenAI相容供應商時，這裡加一列、index.html 的 <option> 加一行，不用改任何邏輯。
 */
const PROVIDER_UI_META = {
  groq: { label: "Groq（官方 Free Plan）", needsKey: true, needsBaseUrl: false, needsModel: false },
  gemini: { label: "Google Gemini（官方）", needsKey: true, needsBaseUrl: false, needsModel: false },
  deepseek: { label: "DeepSeek（官方）", needsKey: true, needsBaseUrl: false, needsModel: false },
  siliconflow: { label: "SiliconFlow 硅基流動", needsKey: true, needsBaseUrl: false, needsModel: false },
  nvidia: { label: "NVIDIA NIM（build.nvidia.com）", needsKey: true, needsBaseUrl: false, needsModel: false },
  mistral: { label: "Mistral（官方 Free mode）", needsKey: true, needsBaseUrl: false, needsModel: false },
  // [2026-08-20] openrouter 在 2026-08-18 被指定了預設模型，所以 needsModel 從 true 改成 false——
  // 留著 true 的話，前端會擋下「選了 OpenRouter 但沒填模型」的回合，
  // 但後端其實有預設模型可以用，變成前端自己擋自己。
  openrouter: { label: "OpenRouter（聚合）", needsKey: true, needsBaseUrl: false, needsModel: false },
  "workers-ai": { label: "Cloudflare Workers AI（免金鑰）", needsKey: false, needsBaseUrl: false, needsModel: false },
  custom: { label: "自訂（相容OpenAI）", needsKey: true, needsBaseUrl: true, needsModel: true },
};

// 六維屬性顯示
const ATTRIBUTE_DISPLAY = [
  { key: "力量", en: "STR" },
  { key: "敏捷", en: "DEX" },
  { key: "耐力", en: "CON" },
  { key: "智力", en: "INT" },
  { key: "感知", en: "PER" },
  { key: "意志", en: "WIL" },
];

// 十大核心技能
const SKILL_NAMES = [
  "格鬥", "射擊", "體魄", "潛行", "求生",
  "偵察", "技藝", "醫療", "秘識", "交涉"
];

// 技能分類（對應 core/schema.js 的 SKILLS，用來在前端試算 0 級技能的懲罰提示）
const SKILL_CATEGORY = {
  格鬥: "戰鬥", 射擊: "戰鬥",
  體魄: "身手", 潛行: "身手", 求生: "身手",
  偵察: "心智", 技藝: "心智", 醫療: "心智", 秘識: "心智",
  交涉: "社交",
};

function legendaryAttributeBonus(val) {
  return Math.max(0, Math.floor((val - 1) / 5));
}

// --- 屬性／技能小磚的視覺換算 ---------------------------------------------
// [2026-08-18 修正] 舊版把屬性跟技能共用同一條「5」刻度（建卡當下的分配上限），
// 用一顆一顆的點畫等級，超過5顆之後用溢出點接下去。實際遊戲裡屬性可以一路長到
// 30、技能長到15（core/dice.js 的 legendaryAttributeBonus()/skillBonusSuccesses()
// 兩條加值曲線都是照這個範圍設計的），一顆一顆的點在那個尺度下要嘛擠成一長條完全
// 看不出刻度，要嘛乾脆把版面撐爆——不是「畫錯」，是這個畫法本身撐不起這個數值範圍。
// 改成一條連續的迷你進度條，按「目前值 / 真正上限」算填多少，兩種屬性/技能各自用
// 各自的真實上限，不再共用同一把尺；滿足加值門檻（傳奇屬性/技能附加成功開始生效）
// 之後變色，讓「已經開始拿到加值」這件事還是一眼看得出來，不會因為改用連續條就消失。
const ATTRIBUTE_MAX = 30;
const SKILL_MAX = 15;
/** 超過這個值就在條上變色：屬性6開始有傳奇屬性加值，技能5開始有第一個附加成功門檻。 */
const ATTRIBUTE_BONUS_FLOOR = 5;
const SKILL_BONUS_FLOOR = 5;

/** 等級軌（小磚左緣的上升條）要填多高。回傳可以直接塞進 CSS 的百分比字串。 */
function levelPercent(value, max) {
  const pct = Math.max(0, Math.min(1, (Number(value) || 0) / max)) * 100;
  return `${pct}%`;
}

/** 小磚右側的迷你進度條：連續填色，不是逐點計數，才撐得住 0~30／0~15 這種範圍。 */
function miniMeterHtml(value, max, bonusFloor) {
  const v = Math.max(0, Number(value) || 0);
  const pct = Math.max(0, Math.min(1, v / max)) * 100;
  const legendary = v > bonusFloor;
  return `<span class="stat-meter" title="${v} / ${max}">` +
    `<span class="stat-meter-fill${legendary ? " stat-meter-legendary" : ""}" style="--fill-pct:${pct}%"></span>` +
    `</span>`;
}

// --- 建卡初始化 ---
// ===========================================================================
// 建卡 —— 五題問答 + 三選起始專長 + 甦醒（見 content/chargen/lifePath.js、startingSpecialties.js 與 awakening.js）
//
// [2026-08-18 改版] 六道生平問答換成五道美德/惡德問答；之後選三項起始專長，再進入「甦醒」。
// 使用者的要求(逐字)：
//   「請協助我將建卡問題替換成七美德/七惡德/角色特性的決定，並根據選項自動分配大部分基礎點」
//   「所以應該是用五道題目綜合判斷七美德/七惡德，有點類似心理測驗」
//
// 流程：姓名 -> 五題 -> 十選三起始專長 -> 甦醒（主神掃描 + 5點自由屬性）-> 進入副本。
// 一次只顯示一題是刻意的：五題全部攤在同一頁會變成一張問卷，玩家會用掃的；
// 一次一題他才會真的讀完每個選項，那些選項就是這個角色。
//
// 玩家看不到任何權重與美德惡德的分數——那些**不會**被送到前端（見 questionsForClient）。
// 看得到分表的玩家可以直接反推出想要的結果，主神掃描那一幕就沒有意義了。
// ===========================================================================

/** 目前走到第幾步。0 = 基本資料，1..N = 第幾題，N+1 = 起始專長，N+2 = 甦醒。 */
let chargenStep = 0;
/** 玩家的答案 { 題目id: 選項id }。 */
let chargenAnswers = {};
/** 玩家選取的三個 server 白名單起始專長 ID。 */
let chargenStartingSpecialties = [];
/** 甦醒那一幕從後端拿回來的完整結果（過場、掃描、小傳、角色卡）。 */
let chargenAwakening = null;
/** 玩家在肉體重塑分掉的點 { 屬性: 加幾級 }。 */
let chargenReshape = {};

function lifePathQuestions() {
  return chargenRules?.lifePath ?? [];
}

function startingSpecialtyStepIndex() {
  return lifePathQuestions().length + 1;
}

function awakeningStepIndex() {
  return startingSpecialtyStepIndex() + 1;
}

function startingSpecialtyRules() {
  return chargenRules?.startingSpecialties ?? { count: 3, options: [] };
}

let portalMode = "invitation";
let portalTransitionTimer = null;
let chargenAdvanceTimer = null;
let chargenReleaseRun = 0;

function resetPortalInvitation() {
  window.clearTimeout(portalTransitionTimer);
  portalMode = "invitation";
  const portal = document.getElementById("portal-screen");
  const invitation = document.getElementById("portal-invitation-view");
  const takeover = document.getElementById("portal-takeover");
  const main = document.getElementById("portal-main-content");
  const acceptButton = document.getElementById("accept-invitation-btn");
  if (!portal || !invitation || !takeover || !main) return;

  // 第一幕：邀請頁。舞台由 <html data-stage> 決定，色彩全部跟著它走
  // （見 index.html 的「舞台與主題的色彩 token」）。
  document.documentElement.setAttribute("data-stage", "invitation");
  invitation.style.display = "flex";
  invitation.classList.remove("is-leaving");
  invitation.removeAttribute("aria-hidden");
  takeover.classList.remove("is-active");
  takeover.setAttribute("aria-hidden", "true");
  main.classList.remove("is-visible", "is-resume");
  main.setAttribute("aria-hidden", "true");
  if (acceptButton) {
    acceptButton.disabled = false;
    acceptButton.removeAttribute("aria-busy");
  }
}

function finishPortalReveal(reason = "new") {
  const portal = document.getElementById("portal-screen");
  const invitation = document.getElementById("portal-invitation-view");
  const takeover = document.getElementById("portal-takeover");
  const main = document.getElementById("portal-main-content");
  if (!portal || !invitation || !takeover || !main) return;

  portalMode = "main";
  window.clearTimeout(portalTransitionTimer);
  // 第三幕：主神空間。過場結束才切，讓黑色接管畫面成為兩幕之間真正的斷點。
  document.documentElement.setAttribute("data-stage", "godspace");
  invitation.style.display = "none";
  invitation.setAttribute("aria-hidden", "true");
  takeover.classList.remove("is-active");
  takeover.setAttribute("aria-hidden", "true");
  main.classList.toggle("is-resume", reason === "resume");
  main.classList.add("is-visible");
  main.setAttribute("aria-hidden", "false");

  if (reason === "new") {
    window.setTimeout(() => document.querySelector("#portal-main-content .action-tile.primary")?.focus(), 1200);
  }
}

function revealMainGodSpace(reason = "new") {
  if (portalMode === "main") return;
  const portal = document.getElementById("portal-screen");
  const invitation = document.getElementById("portal-invitation-view");
  const takeover = document.getElementById("portal-takeover");
  const main = document.getElementById("portal-main-content");
  if (!portal || !invitation || !takeover || !main) return;

  if (reason !== "new") {
    finishPortalReveal(reason);
    return;
  }

  portalMode = "transition";
  document.getElementById("accept-invitation-btn")?.setAttribute("aria-busy", "true");
  const acceptButton = document.getElementById("accept-invitation-btn");
  if (acceptButton) acceptButton.disabled = true;
  invitation.classList.add("is-leaving");
  takeover.classList.add("is-active");
  takeover.setAttribute("aria-hidden", "false");
  portalTransitionTimer = window.setTimeout(() => finishPortalReveal(reason), 2500);
}

function acceptMainGodInvitation() {
  revealMainGodSpace("new");
}

async function startNewChargen() {
  const meta = hubAction("start_scenario");
  if (meta && !meta.enabled) {
    showToast(meta.reason || "目前不能開始新的副本。", { kind: "warn" });
    return;
  }
  showScreen("chargen");

  if (!chargenRules) {
    try {
      const res = await (await fetch("/api/character")).json();
      chargenRules = res.rules;
    } catch (err) {
      document.getElementById("cg-errors").innerHTML =
        `<div class="text-xs text-red-400">無法連線到後端規則引擎：${escapeHtml(err.message)}</div>`;
      return;
    }
  }

  chargenStep = 0;
  chargenAnswers = {};
  chargenStartingSpecialties = [];
  chargenAwakening = null;
  chargenReshape = {};
  renderChargenStep();
}

function renderChargenStep() {
  const questions = lifePathQuestions();
  const total = questions.length + 2; // 基本資料 + 五題 + 起始專長（甦醒顯示為完成）
  const basic = document.getElementById("cg-step-basic");
  const question = document.getElementById("cg-step-question");
  const specialty = document.getElementById("cg-step-specialties");
  const awakening = document.getElementById("cg-step-awakening");
  const back = document.getElementById("cg-back");
  const submit = document.getElementById("cg-submit");

  basic.style.display = chargenStep === 0 ? "" : "none";
  question.style.display = chargenStep >= 1 && chargenStep <= questions.length ? "" : "none";
  specialty.style.display = chargenStep === startingSpecialtyStepIndex() ? "" : "none";
  awakening.style.display = chargenStep === awakeningStepIndex() ? "" : "none";
  back.style.visibility = chargenStep === 0 ? "hidden" : "visible";
  const activeStep = chargenStep === 0
    ? basic
    : chargenStep <= questions.length
      ? question
      : chargenStep === startingSpecialtyStepIndex()
        ? specialty
        : awakening;
  // 題目內容是連續閱讀流程，不要在每次回答後重播整個 section 的進場動畫；
  // 那會讓題目、選項與背景一起閃一下。基本資料與甦醒仍保留一次性的進場過場。
  if (activeStep !== question) replayEnterAnim(activeStep);
  else activeStep.classList.remove("screen-enter");
  document.getElementById("cg-errors").innerHTML = "";

  const done = Math.min(chargenStep, total);
  document.getElementById("cg-progress-bar").style.width = `${(done / total) * 100}%`;

  if (chargenStep === 0) {
    document.getElementById("cg-step-label").textContent = "基本資料";
    document.getElementById("cg-step-count").textContent = `之後還有 ${questions.length} 個問題`;
    submit.textContent = "開始";
    document.getElementById("cg-name")?.focus();
  } else if (chargenStep <= questions.length) {
    const q = questions[chargenStep - 1];
    document.getElementById("cg-step-label").textContent = `問題 ${chargenStep}`;
    document.getElementById("cg-step-count").textContent = `${chargenStep} / ${questions.length}`;
    document.getElementById("cg-question-title").textContent = q.title;
    document.getElementById("cg-question-subtitle").textContent = q.subtitle;
    renderQuestionOptions(q);
    // 選項本身就是下一步；題目頁不再顯示沒有作用的底部按鈕。
    submit.style.display = "none";
    submit.textContent = "";
  } else if (chargenStep === startingSpecialtyStepIndex()) {
    const rules = startingSpecialtyRules();
    const count = Number(rules.count) || 3;
    const selected = chargenStartingSpecialties.length;
    submit.style.display = "";
    document.getElementById("cg-step-label").textContent = "起始專長";
    document.getElementById("cg-step-count").textContent = `選 ${selected} / ${count}`;
    submit.textContent = selected === count ? "確認起始專長" : `還需選 ${count - selected} 項`;
    renderStartingSpecialties();
  } else {
    submit.style.display = "";
    document.getElementById("cg-step-label").textContent = "甦醒";
    document.getElementById("cg-step-count").textContent = "最終的肉體重塑";
    submit.textContent = "解除防護罩";
  }

  const specialtyIncomplete = chargenStep === startingSpecialtyStepIndex()
    && chargenStartingSpecialties.length !== (Number(startingSpecialtyRules().count) || 3);
  submit.disabled = specialtyIncomplete;
  submit.classList.toggle("opacity-40", specialtyIncomplete);
  if (chargenStep === 0) submit.style.display = "";
}

function renderQuestionOptions(question) {
  const container = document.getElementById("cg-question-options");
  const chosen = chargenAnswers[question.id];

  container.innerHTML = question.options
    .map((o, i) => {
      const selected = chosen === o.id;
      return `
      <button data-lifepath-option="${escapeHtml(o.id)}"
        class="lifepath-option text-left p-3 rounded border transition-all hover:-translate-y-px ${
          selected
            ? "border-emerald-500 bg-emerald-500/10"
            : "hairline-border bg-zinc-950 hover:border-emerald-500/50"
        }" style="animation-delay:${i * 0.04}s">
          <div class="lifepath-option-label text-xs font-bold ${selected ? "text-emerald-200" : "text-zinc-100"} leading-snug">
          ${escapeHtml(o.label)}
        </div>
        <div class="text-[11px] font-mono text-zinc-400 mt-1 leading-snug">${escapeHtml(o.detail)}</div>
      </button>`;
    })
    .join("");
}

/** 選一個答案就直接往下一題走——多按一次「下一步」只是多餘的一次點擊。 */
function renderStartingSpecialties() {
  const container = document.getElementById("cg-specialty-options");
  const countLabel = document.getElementById("cg-specialty-count");
  if (!container) return;

  const rules = startingSpecialtyRules();
  const options = Array.isArray(rules.options) ? rules.options : [];
  const required = Number(rules.count) || 3;
  const selected = new Set(chargenStartingSpecialties);
  if (countLabel) countLabel.textContent = `已選 ${selected.size} / ${required}`;

  container.innerHTML = options.map((specialty) => {
    const isSelected = selected.has(specialty.id);
    const isLocked = !isSelected && selected.size >= required;
    return `
      <button type="button" data-starting-specialty="${escapeHtml(specialty.id)}"
        aria-pressed="${isSelected ? "true" : "false"}" ${isLocked ? "disabled" : ""}
        class="starting-specialty-card text-left p-3 rounded border transition-all ${
          isSelected
            ? "border-emerald-500 bg-emerald-500/10"
            : isLocked
              ? "hairline-border bg-zinc-950 opacity-40 cursor-not-allowed"
              : "hairline-border bg-zinc-950 hover:border-emerald-500/50 hover:-translate-y-px"
        }">
        <div class="flex items-start justify-between gap-2">
          <span class="text-xs font-bold ${isSelected ? "text-emerald-200" : "text-zinc-100"}">${escapeHtml(specialty.name)}</span>
          <span class="shrink-0 text-[10px] font-mono ${isSelected ? "text-emerald-300" : "text-zinc-500"}">${escapeHtml(specialty.skill)} · ${escapeHtml(specialty.bonusText || "+1 顆相關檢定骰")}</span>
        </div>
        <div class="text-[11px] font-mono text-zinc-400 mt-1 leading-snug">${escapeHtml(specialty.description)}</div>
      </button>`;
  }).join("");
}

function toggleStartingSpecialty(specialtyId) {
  const rules = startingSpecialtyRules();
  const options = Array.isArray(rules.options) ? rules.options : [];
  if (!options.some((specialty) => specialty.id === specialtyId)) return;

  const required = Number(rules.count) || 3;
  const selected = new Set(chargenStartingSpecialties);
  if (selected.has(specialtyId)) {
    selected.delete(specialtyId);
  } else {
    if (selected.size >= required) return;
    selected.add(specialtyId);
  }
  chargenStartingSpecialties = [...selected];
  renderStartingSpecialties();
  const submit = document.getElementById("cg-submit");
  const complete = chargenStartingSpecialties.length === required;
  if (submit) {
    submit.disabled = !complete;
    submit.classList.toggle("opacity-40", !complete);
    submit.textContent = complete ? "確認起始專長" : `還需選 ${required - chargenStartingSpecialties.length} 項`;
  }
}

function chooseLifePathOption(optionId) {
  const questions = lifePathQuestions();
  const q = questions[chargenStep - 1];
  if (!q) return;

  chargenAnswers[q.id] = optionId;
  const container = document.getElementById("cg-question-options");
  container?.querySelectorAll("[data-lifepath-option]").forEach((button) => {
    const selected = button.dataset.lifepathOption === optionId;
    button.classList.toggle("border-emerald-500", selected);
    button.classList.toggle("bg-emerald-500/10", selected);
    button.classList.toggle("lifepath-option-selected", selected);
    button.classList.toggle("hairline-border", !selected);
    button.classList.toggle("bg-zinc-950", !selected);
    const label = button.querySelector(".lifepath-option-label");
    if (label) {
      label.classList.toggle("text-emerald-200", selected);
      label.classList.toggle("text-zinc-100", !selected);
    }
  });
  window.clearTimeout(chargenAdvanceTimer);
  chargenAdvanceTimer = window.setTimeout(() => advanceChargen(), 180);
}

async function advanceChargen() {
  const questions = lifePathQuestions();

  if (chargenStep === 0) {
    const name = document.getElementById("cg-name").value.trim();
    if (!name) {
      showChargenError("請先給這個角色一個名字。");
      document.getElementById("cg-name").focus();
      return;
    }
    chargenStep = 1;
    renderChargenStep();
    return;
  }

  if (chargenStep <= questions.length) {
    const q = questions[chargenStep - 1];
    if (!chargenAnswers[q.id]) {
      showChargenError("請先選一個答案。");
      return;
    }
    chargenStep += 1;
    renderChargenStep();
    return;
  }

  if (chargenStep === startingSpecialtyStepIndex()) {
    const required = Number(startingSpecialtyRules().count) || 3;
    if (chargenStartingSpecialties.length !== required) {
      showChargenError(`請選滿 ${required} 項起始專長。`);
      return;
    }
    chargenStep += 1;
    renderChargenStep();
    await loadAwakening();
    return;
  }

  await submitChargen();
}

function retreatChargen() {
  if (chargenStep === 0) return;
  chargenStep -= 1;
  renderChargenStep();
}

function showChargenError(message) {
  document.getElementById("cg-errors").innerHTML =
    `<div class="text-xs font-mono text-red-400">· ${escapeHtml(message)}</div>`;
}

/**
 * 五題答完之後跟後端要甦醒那一幕：過場文字、主神掃描結果、小傳、以及自動配好的角色卡。
 * 換算一律在後端做（跟建卡驗證同一段程式碼），前端不自己算美德惡德，也不自己配點。
 */
async function loadAwakening() {
  const submit = document.getElementById("cg-submit");
  submit.disabled = true;
  submit.classList.add("opacity-40");
  document.getElementById("cg-awakening-narration").textContent = "連線中……";

  try {
    const res = await (await fetch("/api/character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lifePath: {
          concept: readChargenConcept(),
          answers: chargenAnswers,
          startingSpecialties: chargenStartingSpecialties,
        },
      }),
    })).json();

    if (!res.valid || !res.awakening) {
      showChargenError((res.errors ?? ["建卡驗證失敗"]).join("；"));
      document.getElementById("cg-awakening-narration").textContent = "";
      return;
    }

    chargenAwakening = res;
    const scanPanel = document.getElementById("cg-main-god-panel");
    scanPanel?.classList.remove("awakening-scan-active");
    if (scanPanel) {
      void scanPanel.offsetWidth;
      scanPanel.classList.add("awakening-scan-active");
    }
    // 預設先填後端算好的建議分配，玩家想改再改。三十秒的緊張感底下，
    // 逼一個沒看過規則的人從零開始配點是很糟的第一印象。
    chargenReshape = { ...res.awakening.reshape.suggestion };
    renderAwakening(res);
  } catch (err) {
    console.error("[CHARGEN_AWAKENING_FAILURE]", err);
    showChargenError(`無法連線到後端規則引擎（${err.message}）`);
    document.getElementById("cg-awakening-narration").textContent = "";
  } finally {
    submit.disabled = false;
    submit.classList.remove("opacity-40");
  }
}

function readChargenConcept() {
  return {
    name: document.getElementById("cg-name").value.trim(),
    gender: document.getElementById("cg-gender").value || "未知",
  };
}

function renderAwakening(res) {
  const a = res.awakening;

  document.getElementById("cg-awakening-narration").textContent = `${a.transition}\n\n${a.arrival}`;

  document.getElementById("cg-scan-header").textContent = a.system.header;

  // 五句引用。玩家沒有直接勾選美德惡德，所以掃描結果必須說得出理由，
  // 否則那個結論讀起來會像亂數（見 content/chargen/awakening.js 檔頭）。
  document.getElementById("cg-scan-echoes").innerHTML = a.system.echoes
    .map((line, i) => `<div class="text-[11px] font-mono text-violet-200/70 leading-snug anim-fade-up" style="animation-delay:${i * 0.06}s">${escapeHtml(line)}</div>`)
    .join("");

  const cards = [];
  if (a.system.virtue) cards.push(scanCardHtml("美德", a.system.virtue.key, a.system.virtue.description, "virtue"));
  if (a.system.vice) cards.push(scanCardHtml("惡德", a.system.vice.key, a.system.vice.description, "vice"));
  for (const specialty of a.system.startingSpecialties ?? []) {
    cards.push(scanCardHtml(
      "起始專長",
      specialty.name,
      `${specialty.description}（${specialty.skill} +${specialty.bonus} 顆相關檢定骰）`,
      "specialty",
    ));
  }
  document.getElementById("cg-scan-result").innerHTML = cards.join("");

  document.getElementById("cg-scan-core").innerHTML = a.system.core
    ? `<span class="text-zinc-400">性格核心：</span><span class="font-bold text-violet-200">${escapeHtml(a.system.core.name)}</span>
       <div class="text-zinc-400 mt-0.5">${escapeHtml(a.system.core.description)}</div>`
    : "";

  document.getElementById("cg-scan-footer").textContent = a.system.footer;

  document.getElementById("cg-review-background").textContent = res.lifePath.background;
  document.getElementById("cg-review-tendency").textContent = res.lifePath.tendency;

  renderReshape();
}

/**
 * 掃描結果的三種卡片配色。
 * 刻意寫成完整的類別字串而不是用 `border-${color}-500` 拼出來——Tailwind 是靠掃描原始碼
 * 產生類別的，拼接出來的名字在原始碼裡不存在，能不能生效只能靠 CDN 版的執行期掃描，
 * 那是一種「現在剛好會動」的狀態。寫死三份反而是最不會壞的做法。
 */
const SCAN_CARD_STYLES = {
  virtue: { box: "border-emerald-500/30", tag: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", name: "text-emerald-200" },
  vice: { box: "border-rose-500/30", tag: "border-rose-500/40 bg-rose-500/10 text-rose-300", name: "text-rose-200" },
  trait: { box: "border-violet-500/30", tag: "border-violet-500/40 bg-violet-500/10 text-violet-300", name: "text-violet-200" },
  specialty: { box: "border-emerald-500/30", tag: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", name: "text-emerald-200" },
};

function scanCardHtml(tag, name, description, kind) {
  const style = SCAN_CARD_STYLES[kind] ?? SCAN_CARD_STYLES.trait;
  return `
    <div class="p-2.5 rounded bg-zinc-950 border ${style.box} space-y-0.5">
      <div class="flex items-center gap-1.5">
        <span class="px-1.5 py-0.5 rounded border ${style.tag} text-[10px] font-bold">${escapeHtml(tag)}</span>
        <span class="text-xs font-bold ${style.name}">${escapeHtml(name)}</span>
      </div>
      <div class="text-[11px] text-zinc-400 leading-snug">${escapeHtml(description)}</div>
    </div>`;
}

/**
 * 屬性從 value 升到 value+1 要幾點。
 * 成本表是後端給的（chargenRules.attributes.cumulativeCost），前端不自己抄一份常數——
 * 抄了之後規則改了但前端沒改，玩家看到的價格會跟後端驗的不一樣。
 */
function attributeStepCost(value) {
  const table = chargenRules?.attributes?.cumulativeCost ?? {};
  const here = table[value];
  const next = table[value + 1];
  if (here == null || next == null) return null;
  return next - here;
}

function reshapeState() {
  const conf = chargenAwakening?.awakening?.reshape;
  if (!conf) return null;
  let spent = 0;
  const values = {};
  for (const { key } of ATTRIBUTE_DISPLAY) {
    const base = conf.base[key] ?? 1;
    const added = chargenReshape[key] ?? 0;
    values[key] = base + added;
    const table = chargenRules?.attributes?.cumulativeCost ?? {};
    spent += (table[base + added] ?? 0) - (table[base] ?? 0);
  }
  return { conf, values, spent, remaining: conf.points - spent };
}

function renderReshape() {
  const state = reshapeState();
  if (!state) return;
  const { conf, values, remaining } = state;

  document.getElementById("cg-reshape-remaining").textContent = `${remaining} / ${conf.points}`;

  document.getElementById("cg-reshape-grid").innerHTML = ATTRIBUTE_DISPLAY.map(({ key, en }) => {
    const base = conf.base[key] ?? 1;
    const value = values[key];
    const added = value - base;
    const cost = attributeStepCost(value);
    const canAdd = value < conf.cap && cost != null && cost <= remaining;
    return `
      <div class="flex items-center gap-2 bg-zinc-950 border hairline-border px-2.5 py-1.5 rounded">
        <div class="flex-1 min-w-0">
          <span class="text-xs text-zinc-300">${escapeHtml(key)}</span>
          <span class="text-[10px] font-mono text-zinc-600 ml-1">${en}</span>
        </div>
        <span class="text-[10px] font-mono ${added > 0 ? "text-violet-300" : "text-zinc-600"}">${added > 0 ? `+${added}` : ""}</span>
        <span class="text-sm font-bold ${added > 0 ? "text-violet-200" : "text-emerald-300"} w-4 text-center">${value}</span>
        <button data-reshape-down="${escapeHtml(key)}" ${added > 0 ? "" : "disabled"}
          class="w-6 h-6 rounded border text-xs font-bold transition-all ${added > 0 ? "border-zinc-600 text-zinc-300 hover:border-violet-400 hover:text-violet-200" : "border-zinc-800 text-zinc-700 cursor-not-allowed"}">−</button>
        <button data-reshape-up="${escapeHtml(key)}" ${canAdd ? "" : "disabled"}
          class="w-6 h-6 rounded border text-xs font-bold transition-all ${canAdd ? "border-violet-500/50 text-violet-200 hover:bg-violet-500/20" : "border-zinc-800 text-zinc-700 cursor-not-allowed"}">+</button>
        <span class="w-8 text-right text-[10px] font-mono ${canAdd ? "text-zinc-400" : "text-zinc-700"}">${value >= conf.cap ? "上限" : cost == null ? "—" : `${cost}點`}</span>
      </div>`;
  }).join("");

  renderChargenNumbers(values);
}

/**
 * 摺疊區裡那份「系統換算出來的詳細數值」。
 * 屬性要跟著重塑即時變動，所以掛在 renderReshape() 後面而不是只畫一次——
 * 玩家按了 +1 卻看到摺疊區還是舊數字，會直接懷疑這個介面有沒有真的生效。
 */
function renderChargenNumbers(values) {
  const character = chargenAwakening?.character;
  if (!character) return;

  document.getElementById("cg-review-attributes").innerHTML = ATTRIBUTE_DISPLAY.map(
    ({ key }) => statChipHtml(key, values[key] ?? character.attributes[key] ?? 1)
  ).join("");

  document.getElementById("cg-review-skills").innerHTML = SKILL_NAMES.filter((s) => (character.skills[s] ?? 0) > 0)
    .map((s) => statChipHtml(s, character.skills[s]))
    .join("");

  // 衍生數值只標「自動配點時」的基準：耐力被重塑加上去之後生命值也會變，
  // 但那要重算 computeDerivedStats，而那是後端的事——前端不自己算任何一個數字。
  // 最終數值在進遊戲之後的角色卡上（那份是後端算的）。
  const d = character.derived;
  document.getElementById("cg-derived").textContent =
    `重塑前：生命 ${d.hp.max} · 意志 ${d.willpower.max} · 先攻 ${d.initiative} · 防禦 ${d.baseDefense}`;
}

function statChipHtml(label, value) {
  return `
    <div class="flex justify-between items-center bg-zinc-950 border hairline-border px-2 py-1 rounded">
      <span class="text-zinc-400">${escapeHtml(label)}</span>
      <span class="font-bold text-emerald-300">${value}</span>
    </div>`;
}

function adjustReshape(key, delta) {
  const state = reshapeState();
  if (!state) return;
  const base = state.conf.base[key] ?? 1;
  const current = state.values[key];

  if (delta > 0) {
    const cost = attributeStepCost(current);
    if (current >= state.conf.cap || cost == null || cost > state.remaining) return;
  } else if (current <= base) {
    return;
  }

  chargenReshape[key] = (chargenReshape[key] ?? 0) + delta;
  renderReshape();
}

function sleepForTransition(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function cancelChargenReleaseTransition() {
  chargenReleaseRun += 1;
  const overlay = document.getElementById("chargen-release-overlay");
  if (!overlay) return;
  overlay.classList.remove("is-visible", "is-leaving");
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
}

async function playChargenReleaseTransition() {
  const overlay = document.getElementById("chargen-release-overlay");
  const message = document.getElementById("chargen-release-message");
  if (!overlay || !message) return;

  const run = ++chargenReleaseRun;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const lines = ["防護罩解除。", "你的名字，已經不再屬於原本的世界。", "那麼，祝你好運。"];
  overlay.style.display = "flex";
  overlay.classList.remove("is-leaving");
  overlay.classList.add("is-visible");
  overlay.setAttribute("aria-hidden", "false");
  overlay.setAttribute("aria-busy", "true");
  message.textContent = "";
  message.focus();

  try {
    for (const line of lines) {
      if (run !== chargenReleaseRun) return;
      message.textContent = line;
      await sleepForTransition(reducedMotion ? 120 : 680);
    }
    if (run !== chargenReleaseRun) return;
    await sleepForTransition(reducedMotion ? 80 : 900);
    if (run !== chargenReleaseRun) return;
    overlay.classList.add("is-leaving");
    await sleepForTransition(reducedMotion ? 0 : 720);
  } finally {
    if (run === chargenReleaseRun) {
      overlay.classList.remove("is-visible", "is-leaving");
      overlay.style.display = "none";
      overlay.setAttribute("aria-hidden", "true");
      overlay.removeAttribute("aria-busy");
    }
  }
}

async function submitChargen() {
  const state = reshapeState();
  if (!state) {
    showChargenError("甦醒資料還沒載入完成，請稍候再試。");
    return;
  }
  // 主神給的點數必須剛好用完（後端也會再驗一次，見 content/chargen/reshape.js）。
  // 擋在這裡只是為了不用等一趟往返才告訴玩家他還有點沒花。
  if (state.remaining !== 0) {
    showChargenError(`還有 ${state.remaining} 點自由屬性沒有分配，防護罩解除前必須用完。`);
    return;
  }

  const submit = document.getElementById("cg-submit");
  submit.disabled = true;
  submit.textContent = "重塑中...";

  try {
    const res = await (await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lifePath: {
          concept: readChargenConcept(),
          answers: chargenAnswers,
          startingSpecialties: chargenStartingSpecialties,
          reshape: chargenReshape,
        },
        sceneContext: "",
      }),
    })).json();

    if (!res.ok) throw new Error((res.errors ?? []).join("；") || res.error || "建卡失敗");

    currentSessionId = res.session.id;
    lastTravelRequest = null;
    resetScenarioNoticeDedup(currentSessionId);
    localStorage.setItem(SESSION_KEY, currentSessionId);
    lastThreatStage = null;
    currentReferenceMode = Boolean(res.scenario?.reference?.enabled || res.session?.scenario?.reference?.enabled);
    currentOptions = [];
    adoptCharacter(res.session.character);
    recentStoryEntries = [];
    pendingStoryEntry = null;
    activeNarrationStream = null;
    renderRecentStoryWindow({ forceBottom: true });
    await playChargenReleaseTransition();
    showScreen("game");
    renderPersistenceWarning(res.persistent);
    await runTurn({ opening: true });
  } catch (err) {
    showChargenError(`進入遊戲失敗：${err.message}`);
  } finally {
    submit.disabled = false;
    submit.textContent = "解除防護罩";
  }
}

function adoptCharacter(charData) {
  currentCharacter = charData;
  document.getElementById("char-name").textContent = charData.concept.name;
  document.getElementById("char-class").textContent = `輪迴者 / XP: ${charData.xp.earned - charData.xp.spent}`;

  // 窄化 rail 只保留玩家最常需要瞄一眼的四個狀態，仍由同一份角色資料驅動。
  const compactHp = document.getElementById("char-compact-hp");
  const compactWill = document.getElementById("char-compact-will");
  const compactDefense = document.getElementById("char-compact-defense");
  const compactInitiative = document.getElementById("char-compact-initiative");
  if (compactHp) compactHp.textContent = `${charData.derived.hp.intact}/${charData.derived.hp.max}`;
  if (compactWill) compactWill.textContent = `${charData.derived.willpower.current}/${charData.derived.willpower.max}`;
  if (compactDefense) compactDefense.textContent = String(charData.derived.baseDefense);
  if (compactInitiative) compactInitiative.textContent = String(charData.derived.initiative);

  // 渲染生命傷勢軌
  const hp = charData.derived.hp;
  document.getElementById("hp-text").textContent = `${hp.intact} / ${hp.max}`;
  document.getElementById("hp-detail").textContent = `完好 ${hp.intact} · 沖擊 ${hp.B} · 嚴重 ${hp.L} · 惡性 ${hp.A}`;
  renderHpBar("hp-bar-container", hp);

  // 衍生數值：防禦/先攻/意志 —— 建卡時算給玩家看過，進遊戲後不該就此消失
  const d = charData.derived;
  const derivedBar = document.getElementById("derived-stats-bar");
  if (derivedBar && d) {
    derivedBar.innerHTML = `
      <span>防禦 <strong class="text-emerald-300 text-xs">${d.baseDefense}</strong></span>
      <span>先攻 <strong class="text-emerald-300 text-xs">${d.initiative}</strong></span>
      <span>意志 <strong class="text-emerald-300 text-xs">${d.willpower.current}/${d.willpower.max}</strong></span>
    `;
  }

  // 渲染六維屬性（緊湊 2 欄，數值右側大字號）
  document.getElementById("attr-grid").innerHTML = ATTRIBUTE_DISPLAY.map(({ key, en }) => {
    const val = charData.attributes[key] || 1;
    const bonus = legendaryAttributeBonus(val);
    const bonusTag = bonus > 0 ? `<span class="stat-tile-star">+${bonus}★</span>` : "";
    return `
      <div class="stat-tile stat-tile-rail px-3 py-1.5 rounded" style="--lv-pct:${levelPercent(val, ATTRIBUTE_MAX)}">
        <div class="stat-tile-line">
          <span class="stat-tile-copy">
            <span class="stat-tile-en">${en}</span>
            <span class="stat-tile-cn">${key}</span>
          </span>
          <span class="stat-tile-value">${val}${bonusTag}</span>
        </div>
      </div>`;
  }).join("");

  // 渲染技能清單（含已登記的專業，否則玩家會忘記自己有專業加成）
  document.getElementById("skill-display-grid").innerHTML = Object.entries(charData.skills || {}).map(([skill, lv]) => {
    const specs = charData.specializations?.[skill];
    const specText = Array.isArray(specs) && specs.length
      ? `<span class="stat-tile-cn ml-1">(${specs.map(escapeHtml).join("、")})</span>`
      : "";
    return `
    <div class="stat-tile stat-tile-rail ${lv > 0 ? "" : "stat-tile-empty"} pl-3 pr-2.5 py-1.5 rounded flex justify-between items-center gap-2"
         style="--lv-pct:${levelPercent(lv, SKILL_MAX)}">
      <span class="text-xs text-zinc-300 truncate">${escapeHtml(skill)}${specText}</span>
      <span class="flex items-center gap-2 shrink-0">
        <span class="font-mono font-bold text-sm ${lv > 0 ? "text-emerald-300" : "text-zinc-500"}">${lv}</span>
      </span>
    </div>`;
  }).join("");

  renderTraitCards(charData);
}

/** 生命傷勢軌繪製：用 flex-grow 按比例分配寬度，不論生命上限多高都是一條等比例的軌道，
 *  不會像過去用 CSS grid 逐格畫方塊那樣，血量一高就變成密密麻麻的「條碼」。
 *  回傳這次血量狀態是否比上次有變化，供呼叫端決定要不要疊加額外的受擊動畫。 */
function renderHpBar(containerId, hpState) {
  const bar = document.getElementById(containerId);
  if (!bar) return false;
  bar.classList.remove("grid");
  bar.classList.add("flex", "overflow-hidden");
  bar.style.gridTemplateColumns = "";

  const prevKey = bar.dataset.hpKey;
  const nextKey = `${hpState.intact}-${hpState.B}-${hpState.L}-${hpState.A}`;
  bar.innerHTML = "";
  [
    { count: hpState.intact, cls: "hp-seg hp-seg-intact" },
    { count: hpState.B, cls: "hp-seg hp-seg-b" },
    { count: hpState.L, cls: "hp-seg hp-seg-l" },
    { count: hpState.A, cls: "hp-seg hp-seg-a" },
  ].forEach(seg => {
    if (seg.count <= 0) return;
    const d = document.createElement("div");
    d.className = seg.cls;
    d.style.flex = seg.count;
    bar.appendChild(d);
  });
  bar.dataset.hpKey = nextKey;

  const changed = Boolean(prevKey && prevKey !== nextKey);
  if (changed) flashElement(bar);
  return changed;
}

function flashElement(el) {
  el.classList.remove("hp-flash");
  void el.offsetWidth; // 強制重排以重新觸發動畫
  el.classList.add("hp-flash");
}

// --- 側欄「日誌」分頁 ------------------------------------------------------
//
// [2026-08-20 新增] 這個分頁的版面(index.html 的 #journal-feed)與資料層
// (core/eventLog.js 的 summarizeForJournal，有測試)一直都在，但**沒有任何程式碼
// 把兩邊接起來**——所以它從上線起就是一片空白，連「目前沒有紀錄」都不寫，
// 玩家點進去只會以為畫面壞掉了。
//
// 摘要文字一律由伺服器產生(GET /api/journal)，前端不自己組字串：日誌上寫的
// 跟餵給AI當事實記憶的必須是同一份，兩邊各寫一次遲早會對不起來。
/**
 * 日誌條目 → 事件種類。
 *
 * [2026-08-21] 原本這裡各自指定一個 Tailwind 顏色 class，跟故事流那邊的色彩
 * 各走各的；同一件事（例如判定）在兩個地方長得不一樣，玩家要記兩套。
 * 改成指向故事流那套事件種類（見 FEED_EVENT_KICKERS），兩條流從此共用一套語言，
 * 顏色也一起交給語意 token，換舞台時會自動跟著走。
 */
const JOURNAL_TYPE_STYLE = {
  check: { label: "判定", kind: "check" },
  damage: { label: "傷害", kind: "harm" },
  combat_action: { label: "戰鬥", kind: "harm" },
  death: { label: "死亡", kind: "harm" },
  xp_grant: { label: "經驗", kind: "ledger" },
  points_grant: { label: "點數", kind: "ledger" },
  purchase: { label: "購買", kind: "ledger" },
  form: { label: "型態", kind: "arcane" },
  revival: { label: "復活", kind: "arcane" },
  rest: { label: "休息", kind: "respite" },
  node_complete: { label: "節點", kind: "world", tone: "good" },
  affection_change: { label: "好感", kind: "world" },
  time_spent: { label: "時間", kind: "world" },
};

/** 日誌分頁目前是不是被打開著。關著就不用每回合去抓（省一次請求）。 */
function journalTabIsOpen() {
  const panel = document.getElementById("sidebar-tab-journal");
  return Boolean(panel) && !panel.classList.contains("hidden");
}

function renderJournalMessage(text) {
  const feed = document.getElementById("journal-feed");
  if (!feed) return;
  feed.innerHTML = `<div class="text-[11px] font-mono text-zinc-500 text-center py-6 border hairline-border border-dashed rounded">${escapeHtml(text)}</div>`;
}

function renderJournalEntries(entries) {
  const feed = document.getElementById("journal-feed");
  if (!feed) return;
  if (!entries.length) {
    renderJournalMessage("目前還沒有任何紀錄。判定、傷害、購買、休息都會記在這裡。");
    return;
  }
  // 最新的放最上面：日誌是拿來回頭確認「剛剛發生了什麼」的，不是從頭讀的日記。
  feed.innerHTML = [...entries]
    .reverse()
    .map((e) => {
      const style = JOURNAL_TYPE_STYLE[e.type] ?? { label: "事件", kind: "world" };
      return buildFeedEvent(style.kind, escapeHtml(style.label), escapeHtml(e.summary ?? ""), {
        tone: style.tone,
        animate: false,
      }).outerHTML;
    })
    .join("");
}

/**
 * 去伺服器拿目前這份存檔的日誌並畫出來。
 * 沒有存檔、或請求失敗時都要寫一句話——空白畫面跟壞掉的畫面長得一模一樣。
 */
async function loadJournal() {
  const feed = document.getElementById("journal-feed");
  if (!feed) return;
  if (!currentSessionId) {
    renderJournalMessage("還沒有進行中的存檔。");
    return;
  }
  try {
    const res = await (await fetch(`/api/journal?sessionId=${encodeURIComponent(currentSessionId)}`)).json();
    if (!res.ok) {
      renderJournalMessage(`讀取日誌失敗：${res.error ?? "未知錯誤"}`);
      return;
    }
    renderJournalEntries(res.entries ?? []);
  } catch (err) {
    console.error("[JOURNAL_FAILURE] /api/journal 呼叫失敗", err);
    renderJournalMessage(`讀取日誌失敗（連線問題）：${err.message}`);
  }
}

/** 回合／戰鬥／購物結束後呼叫：只有分頁真的開著才去抓，關著的時候不浪費請求。 */
function refreshJournalIfOpen() {
  if (journalTabIsOpen()) loadJournal();
}

// --- 起始專長 / 資源卡 3D 堆疊抽屜 ---
let currentTraits = [];
let traitIndex = 0;

function renderTraitCards(charData) {
  const feats = Array.isArray(charData.feats) ? charData.feats : [];
  currentTraits = feats
    .filter((feat) => feat?.effect?.type === "skillBonus")
    .map((feat) => ({
      ...feat,
      category: "起始專長",
      description: `${feat.description}（${feat.effect.skill} +${feat.effect.amount} 顆相關檢定骰）`,
    }));
  traitIndex = 0;
  renderTraitStage();
}

/**
 * 專長／資源卡上的說明文字。
 * 舊存檔仍可能帶有 desc 欄位，所以保留相容讀取；新建角色只會由 server
 * 產生 skillBonus 起始專長，不再生成 lifePath 純敘事特質。
 */
function traitDescription(trait) {
  return trait?.description ?? trait?.desc ?? "";
}

function renderTraitStage() {
  const stage = document.getElementById("trait-carousel");
  const empty = document.getElementById("trait-empty");
  if (!stage || !empty) return;

  if (!currentTraits.length) {
    stage.innerHTML = "";
    stage.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  stage.classList.remove("hidden");
  empty.classList.add("hidden");

  const n = currentTraits.length;
  stage.innerHTML = currentTraits.map((t, i) => {
    const rel = (i - traitIndex + n) % n;
    let posClass = "trait-card-hidden";
    if (rel === 0) posClass = "trait-card-active";
    else if (rel === 1) posClass = "trait-card-next";
    else if (rel === n - 1) posClass = "trait-card-prev";
    return `
      <div data-trait-index="${i}" class="trait-card ${posClass} stat-tile rounded p-3 flex flex-col justify-between cursor-pointer">
        <span class="text-[10px] font-mono text-emerald-300 font-semibold">[${escapeHtml(t.category || t.kind || "特質")}]</span>
        <div class="font-bold text-zinc-100 text-sm">${escapeHtml(t.name || "未命名")}</div>
        <div class="text-[11px] font-mono text-zinc-400 leading-snug line-clamp-3" title="${escapeHtml(traitDescription(t))}">${escapeHtml(traitDescription(t))}</div>
      </div>`;
  }).join("");
}

function stepTrait(delta) {
  if (!currentTraits.length) return;
  traitIndex = (traitIndex + delta + currentTraits.length) % currentTraits.length;
  renderTraitStage();
}

/**
 * 送出回合前檢查玩家的LLM設定有沒有「選了供應商卻沒填金鑰」這種半設定狀態。
 *
 * 為什麼要在前端擋：這種請求送到後端之後，後端只能改用伺服器自己的金鑰（玩家以為在用
 * 自己選的那一家，其實不是），或是一路深入到 content/llm/client.js 才丟出「沒有讀到金鑰」
 * ——兩種都是玩家看不懂、也不知道要去哪裡改的結果。在送出前擋下並直接指名缺什麼最省事。
 * 後端 functions/api/turn.js 有同一道檢查當最後防線（前端可以被繞過）。
 *
 * @returns {{ok: true, payload: object} | {ok: false, message: string}}
 */
function buildLlmOverrides() {
  // 設定改成「一組設定 = 一筆有名字的設定檔」之後，這裡只讀目前啟用的那一筆。
  // 金鑰跟著供應商一起存在同一筆裡，不會出現「換了供應商但金鑰還是上一家的」那種錯配。
  const profile = readActiveProfile();
  const provider = profile.provider || "";
  if (!provider) return { ok: true, payload: {} }; // 用伺服器預設，什麼都不帶

  const meta = PROVIDER_UI_META[provider] ?? {};
  const apiKey = (profile.apiKey || "").trim();
  const baseUrl = (profile.baseUrl || "").trim();
  const model = (profile.model || "").trim();
  const maxTokens = Number(profile.maxTokens);

  if (meta.needsKey && !apiKey) {
    return { ok: false, message: `你選了「${meta.label}」，但沒有填 API Key。請到「系統與文筆設定」補上，或把供應商改回「（使用伺服器預設）」。` };
  }
  if (meta.needsBaseUrl && !baseUrl) {
    return { ok: false, message: `你選了「${meta.label}」，但沒有填 Base URL（例如 https://你的服務/v1）。請到「系統與文筆設定」補上。` };
  }
  if (meta.needsModel && !model) {
    return { ok: false, message: `你選了「${meta.label}」，它沒有預設模型，必須自己填模型名稱。請到「系統與文筆設定」補上。` };
  }

  const payload = { provider };
  if (apiKey) payload.apiKey = apiKey;
  if (baseUrl) payload.baseUrl = baseUrl;
  if (model) payload.model = model;
  if (Number.isFinite(maxTokens) && maxTokens > 0) payload.maxTokens = Math.floor(maxTokens);
  return { ok: true, payload };
}

/**
 * 讀目前啟用的 API 設定檔。設定檔的寫入端在 public/index.html 的行內script
 * （那裡是設定視窗的 UI 邏輯），這裡只負責讀。
 * 讀不到或格式壞掉時回一個空設定＝「用伺服器預設」，不讓壞掉的 localStorage 卡住遊戲。
 */
function readActiveProfile() {
  try {
    const profiles = JSON.parse(localStorage.getItem("user_llm_profiles") || "null");
    if (Array.isArray(profiles) && profiles.length) {
      const activeId = localStorage.getItem("user_llm_active_profile");
      return profiles.find((p) => p.id === activeId) || profiles[0];
    }
  } catch (err) {
    console.warn("[PROFILES] 設定檔讀取失敗，本回合改用伺服器預設", err);
  }
  // 還沒開過設定視窗的舊使用者：沿用舊版的散裝 key，不要讓他們的設定突然失效
  return {
    provider: localStorage.getItem("user_llm_provider") || "",
    apiKey: localStorage.getItem("user_api_key") || "",
    baseUrl: localStorage.getItem("user_llm_base_url") || "",
    model: localStorage.getItem("user_llm_model") || "",
    maxTokens: "",
  };
}

/** 上一次送出的回合參數，讓「重試」按鈕不用玩家重打一次自訂行動。 */
let lastTurnRequest = null;

// ---------------------------------------------------------------------------
// 「說書人書寫中」—— 送出回合到收到敘事之間的等待狀態。
//
// [2026-08-16 新增] 這一段是回應實際測玩的回饋（逐字）：
//   「按鍵反饋的部分，應該要設定說書人書寫中之類的動畫，按下按鈕也要有反饋，
//     我一開始還以為是網頁當掉，結果只是回覆時間太久，過幾十秒才開始動作」
//
// 在這之前，runTurn() 從按下按鈕到 fetch 回來為止，畫面上**沒有任何變化**：
// 選項還在（還可以再按）、沒有任何載入指示、d20動畫要等回應回來才播。
// 一個要跑 20~40 秒的請求配上完全靜止的畫面，看起來就是當掉了——玩家的判斷是對的，
// 是這個介面沒有告訴他真相。
//
// 這裡做三件事，缺一不可：
//   1) 立刻鎖住選項並把按下的那一顆標起來（玩家知道系統收到的是哪一個）
//   2) 在故事流末端插一個會動的「說書人書寫中」區塊（畫面有東西在動＝沒當）
//   3) 秒數往上跑，並在夠久之後主動說明「模型比較慢，這是正常的」（管理預期）
// ---------------------------------------------------------------------------

/** 超過這個秒數就補一句說明，免得玩家在第20秒開始懷疑是不是又掛了。 */
const SLOW_TURN_HINT_SECONDS = 15;

let pendingTimer = null;

function showNarratorPending() {
  setDecisionContext(currentReferenceMode
    ? "說書人書寫中 · 自由行動已鎖定"
    : "說書人書寫中 · 這些選項已鎖定");
  hideNarratorPending();

  pendingStoryEntry = {
    id: `recent-story-pending-${++storyEntrySequence}`,
    kind: "narration",
    label: `書寫中<span class="typing-dots"><span></span><span></span><span></span></span>`,
    content: `<span data-pending-elapsed class="tabular-nums">0.0s</span>`,
    opts: { note: `<span data-pending-hint></span>` },
  };
  renderRecentStoryWindow({ forceBottom: true });

  const startedAt = Date.now();
  pendingTimer = setInterval(() => {
    const seconds = (Date.now() - startedAt) / 1000;
    const block = document.getElementById("narrator-pending");
    const el = block?.querySelector("[data-pending-elapsed]");
    if (el) el.textContent = `${seconds.toFixed(1)}s`;
    const hint = block?.querySelector("[data-pending-hint]");
    if (hint && seconds >= SLOW_TURN_HINT_SECONDS && !hint.textContent) {
      hint.textContent =
        "模型正在生成這一回合的敘事，較慢的模型需要 30 秒以上，畫面沒有當掉。";
    }
  }, 100);
}

function hideNarratorPending() {
  if (pendingTimer) {
    clearInterval(pendingTimer);
    pendingTimer = null;
  }
  pendingStoryEntry = null;
  document.getElementById("narrator-pending")?.remove();
  renderRecentStoryWindow({ forceBottom: true });
}

/**
 * 送出回合的當下就鎖住輸入。
 * @param {boolean} locked
 * @param {number} [pressedIndex] 玩家按的是第幾個選項。沒傳代表這一回合不是從選項來的
 *   （自訂行動／開場／戰鬥結束後的自動回合），那就沒有特定按鈕需要標記。
 */
function updateActionInputCount(input = document.querySelector("[data-action-input]")) {
  const counter = document.querySelector("[data-action-count]");
  if (!counter) return;
  const actual = Array.from(input?.value ?? "").length;
  counter.textContent = `${actual} / ${MAX_FREE_ACTION_CHARS}`;
  counter.classList.toggle("text-red-400", actual > MAX_FREE_ACTION_CHARS);
  counter.classList.toggle("text-zinc-500", actual <= MAX_FREE_ACTION_CHARS);
  if (input) input.setCustomValidity(actual > MAX_FREE_ACTION_CHARS ? `自由行動不能超過 ${MAX_FREE_ACTION_CHARS} 字` : "");
}

function setTurnInputLocked(locked, pressedIndex) {
  const grid = document.getElementById("option-grid");
  if (grid) {
    grid.classList.toggle("options-locked", locked);
    if (locked && pressedIndex != null && pressedIndex >= 0) {
      grid.children[pressedIndex]?.classList.add("decision-card-pending");
    } else if (!locked) {
      grid.querySelectorAll(".decision-card-pending").forEach((el) => el.classList.remove("decision-card-pending"));
    }
  }

  const input = document.querySelector("[data-action-input]");
  if (input) {
    input.disabled = locked;
    input.placeholder = locked
      ? "> 說書人正在書寫這一回合……"
      : "> 描述你想做的事，DM 會依當前情勢裁定……";
    updateActionInputCount(input);
  }

  const sendBtn = document.querySelector("[data-send-custom]");
  if (sendBtn) {
    sendBtn.disabled = locked;
    sendBtn.classList.toggle("opacity-40", locked);
    sendBtn.classList.toggle("cursor-not-allowed", locked);
    // 按鈕本身也要換文字：這是玩家眼睛最先落點的地方，比故事流裡的區塊更早被看到。
    sendBtn.innerHTML = locked
      ? `<span>書寫中</span><i class="fas fa-circle-notch fa-spin text-[10px]"></i>`
      : `<span>執行</span><i class="fas fa-arrow-right text-[10px]"></i>`;
  }
}

function updateNarratorPendingHint(text) {
  const hint = document.querySelector("#narrator-pending [data-pending-hint]");
  if (hint && text) hint.textContent = text;
}

function beginNarrationStream() {
  hideNarratorPending();
  clearPreviousFinalQuestions();
  const entry = appendFeedEvent(
    "narration",
    `書寫中<span class="typing-dots"><span></span><span></span><span></span></span>`,
    "",
    { note: `<span data-stream-state>說書人正在把這一回合寫進現場……</span>` }
  );
  activeNarrationStream = { id: entry?.dataset.recentStoryId ?? null, text: "" };
  return activeNarrationStream;
}

function updateNarrationStream(delta) {
  if (!activeNarrationStream || typeof delta !== "string") return;
  activeNarrationStream.text += delta;
  if (!activeNarrationStream.id) return;
  recentStoryEntries = recentStoryEntries.map((entry) =>
    entry.id === activeNarrationStream.id
      ? { ...entry, content: renderNarrationHtml(activeNarrationStream.text), opts: {} }
      : entry
  );
  renderRecentStoryWindow({ forceBottom: true });
}

function endNarrationStream() {
  if (activeNarrationStream) activeNarrationStream.ended = true;
}

function finalizeNarrationStream(finalText) {
  if (!activeNarrationStream) return false;
  const id = activeNarrationStream.id;
  const text = String(finalText ?? activeNarrationStream.text ?? "");
  recentStoryEntries = recentStoryEntries.map((entry) =>
    entry.id === id
      ? { ...entry, label: "", content: renderNarrationHtml(text), opts: {} }
      : entry
  );
  activeNarrationStream = null;
  renderRecentStoryWindow({ forceBottom: true });
  return true;
}

function cancelNarrationStream() {
  if (!activeNarrationStream) return;
  const id = activeNarrationStream.id;
  recentStoryEntries = recentStoryEntries.filter((entry) => entry.id !== id);
  activeNarrationStream = null;
  renderRecentStoryWindow({ forceBottom: true });
}

/**
 * 讀取 server 的 NDJSON transport。只有 complete event 的 payload 會進入既有
 * 回合處理；narration_delta 是 server 已完成 guard／canonical 敘事後的展示副本，
 * 前端不解析、不信任任何 provider 原始 token。
 */
async function readTurnResponse(httpRes) {
  const contentType = httpRes.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-ndjson")) {
    try {
      return { payload: await httpRes.json(), status: httpRes.status };
    } catch {
      throw new Error(`伺服器回應不是JSON（HTTP ${httpRes.status}）`);
    }
  }
  if (!httpRes.body || typeof httpRes.body.getReader !== "function") {
    throw new Error("瀏覽器不支援文字串流，請重新整理後再試一次");
  }

  const reader = httpRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = null;
  let narrationStreamed = false;
  const consumeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      throw new Error("串流資料格式錯誤，請稍後重試");
    }
    switch (event.type) {
      case "accepted":
        updateNarratorPendingHint("已收到行動，正在確認這一回合的現場規則……");
        break;
      case "rules_resolved":
        updateNarratorPendingHint("現場規則已確認，說書人正在接手……");
        break;
      case "narrator_writing":
        updateNarratorPendingHint("說書人正在組織這一回合的敘事……");
        break;
      case "narration_start":
        beginNarrationStream();
        break;
      case "narration_delta":
        updateNarrationStream(event.delta);
        break;
      case "narration_end":
        endNarrationStream();
        break;
      case "complete":
        narrationStreamed = finalizeNarrationStream(event.payload?.narration) || narrationStreamed;
        complete = { payload: event.payload, status: Number(event.status) || httpRes.status };
        break;
      case "error":
        throw new Error(typeof event.message === "string" ? event.message : "串流回合失敗，請稍後重試");
      default:
        // 未知事件不改變回合 state，保留向後相容性。
        break;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(consumeLine);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeLine(buffer);
  if (!complete?.payload) throw new Error("串流在回合完成前中斷，請稍後重試");
  return { ...complete, narrationStreamed };
}

async function runTurn({ chosenOption, playerAction, opening, pressedIndex, retryPending = false, turnRequestId } = {}) {
  if (turnInFlight) return;

  const overrides = buildLlmOverrides();
  if (!overrides.ok) {
    appendFeedEvent("arcane", "主神調整了這一回合", escapeHtml(overrides.message));
    return;
  }

  turnInFlight = true;
  let keepTurnLocked = false;
  const stableRequestId = turnRequestId || `turn:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  lastTurnRequest = { chosenOption, playerAction, opening, retryPending, turnRequestId: stableRequestId };

  // 重試沿用同一個 DOM action／check；只有首次送出才插入玩家行動，避免錯誤卡重試時疊加。
  if (!retryPending && playerAction) appendFeedEvent("action", "", escapeHtml(playerAction));
  // 選項是AI寫的文字，玩家按下去之後也該在故事流裡留下紀錄——否則捲回去看的時候，
  // 只剩下敘事，看不出當時自己選了什麼。
  if (!retryPending && chosenOption?.label) {
    appendFeedEvent("action", "", escapeHtml(chosenOption.label));
  }

  setTurnInputLocked(true, pressedIndex);
  showNarratorPending();

  try {
    const httpRes = await fetch("/api/turn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/x-ndjson, application/json",
      },
      body: JSON.stringify({
        sessionId: currentSessionId,
        chosenOption,
        playerAction,
        style: localStorage.getItem("user_narrative_style") || "白描",
        // 敘事者人格面具（見 content/narrativeStyle.js 的 NARRATOR_PERSONAS）。
        persona: localStorage.getItem("user_narrator_persona") || "RUTHLESS_JUDGE",
        ...overrides.payload,
        turnRequestId: stableRequestId,
        retryPending,
        // server 會以 NDJSON 先送安全狀態事件，再送完整 canonical response；
        // 不支援串流的舊部署仍會因 Accept fallback 回傳普通 JSON。
        stream: true,
      })
    });

    let res;
    let responseStatus = httpRes.status;
    let narrationStreamed = false;
    try {
      const streamed = await readTurnResponse(httpRes);
      res = streamed.payload;
      responseStatus = streamed.status;
      narrationStreamed = Boolean(streamed.narrationStreamed);
    } catch (err) {
      cancelNarrationStream();
      throw err;
    }

    // [2026-08-16 修正] 這裡以前完全沒有檢查 res.ok。後端敘事失敗時回的是
    // 502 + { ok:false, error, options: [] }，前端照樣往下跑：沒有敘事可印、
    // 選項是空的，於是畫面看起來只是「這回合沒有選項」，玩家完全不知道AI掛了。
    // 現在明確把錯誤印出來，並給一顆重試按鈕。判定結果照樣顯示——規則層是對的，
    // 只有敘事層失敗，不該連帶把已經擲出來的骰子也藏起來。
    // 收到回應就把等待指示收掉：接下來的骰子動畫與敘事才是玩家該看的東西。
    hideNarratorPending();
    renderPersistenceWarning(res.persistent);
    renderDownState(res.downState, res.revival);

    if (res.ok === false) {
      renderTurnWarnings(res.warnings);
      if (res.checkResult && !res.reusedCheck) await renderCheckResult(res.checkResult);
      // 傷勢閘門(409)不是「壞掉」，是規則上的結果——不要給重試按鈕，重試永遠會是同一個答案。
      if (responseStatus === 409 && res.downState) {
        appendFeedEvent("harm", "身體拒絕行動", escapeHtml(res.error));
      } else {
        const pending = res.pendingTurn;
        if (pending?.requestId) {
          // 玩家若誤點另一個選項，下一次「重試」仍應回到伺服器保存的原回合，
          // 不能沿用這個被 409 擋下的新行動。
          lastTurnRequest = {
            chosenOption: pending.chosenOption ?? undefined,
            playerAction: pending.playerAction ?? undefined,
            opening: Boolean(pending.opening),
            retryPending: true,
            turnRequestId: pending.requestId,
          };
        }
        keepTurnLocked = Boolean(res.retryable || res.pendingTurn);
        appendTurnError(res.error || `回合失敗（HTTP ${responseStatus}）`, res);
      }
      return;
    }

    if (res.checkResult && !res.reusedCheck) await renderCheckResult(res.checkResult);

    renderTurnWarnings(res.warnings);

    // [安全][2026-08-24] 說書人的後台盤算(st_thought)已經不會出現在 API 回應裡了
    // (見 functions/api/turn.js 的說明：只印伺服器 log，不進任何會回到瀏覽器的欄位)，
    // 這裡也就沒有東西可讀。以前這裡讀 res.stThought 印到 console，等於還是讓
    // 打開開發者工具的玩家看得到這段本來設計成「玩家看不到」的文字。

    if (res.narration && !narrationStreamed) {
      appendNarrationBlock(res.narration);
    }

    renderTurnQuality(res.degraded);
    renderOptions(res.options || [], {
      referenceMode: Boolean(res.scenario?.reference?.enabled),
      dmPrompt: res.scenario?.reference?.dmPrompt,
    });
    if (res.turnCount) document.getElementById("turn-counter").textContent = res.turnCount;
    if (Number.isFinite(Number(res.recentChronicleTotal))) {
      recentStoryChronicleTotal = Number(res.recentChronicleTotal);
      renderRecentStoryWindow();
    }
    if (res.scenario) {
      updateScenarioHud(res.scenario);
      if (res.scenario.chroniclePackage) {
        showToast("副本已封存為 AI-ready 劇情包；開啟「劇情回顧」即可複製或下載。", { kind: "info", timeout: 6000 });
      }
      if (res.scenario.settlement?.runSummary) showScenarioSettlement(res.scenario.settlement);
    }
    // 日誌分頁開著的時候要跟著這一回合更新，不然玩家會看到一份停在上一回合的日誌。
    refreshJournalIfOpen();
  } catch (err) {
    cancelNarrationStream();
    console.error("[TURN_FAILURE] /api/turn 呼叫失敗", err);
    // 網路層沒有拿到伺服器回應，無法安全判斷是否已保存 pendingTurn；重試卡會
    // 用明確 retryPending 讓伺服器自行驗證，有 pending 就回放，沒有就回 409，不會盲目重骰。
    appendTurnError(`回合執行失敗: ${err.message}`, null);
  } finally {
    turnInFlight = false;
    // 這兩個一定要在 finally：任何一條失敗路徑忘了解鎖，玩家就永遠按不了下一個選項，
    // 而且畫面上還掛著一個永遠轉不完的「說書人書寫中」——比原本沒有指示還糟。
    hideNarratorPending();
    setTurnInputLocked(keepTurnLocked);
  }
}

async function renderCheckResult(r) {
  await playDiceRollAnimation(r);
  const outcomeColor = r.autoFail || !r.success ? "text-red-400" : "text-emerald-400";
  appendFeedEvent(
    "check",
    r.autoFail ? "命運拒絕" : (r.success ? "驚險成功" : "失敗"),
    `${r.note?.join(" + ")} ➔ 成功數 <span class="fe-num">${r.totalSuccesses}</span> ／ DC <span class="fe-num">${r.dc}</span> · 骰面 [${r.rolls?.join(",")}]`,
    { tone: r.success && !r.autoFail ? "good" : "bad" }
  );
}

/**
 * 把後端的 warnings 陣列送進 console。
 *
 * [2026-08-16 新增] 後端一直都有在回 warnings（存檔不是持久的、AI選項被捨棄、
 * 節點結算被擋下…），但前端從來沒有任何地方讀它，所以那些警告等於寫給空氣看。
 * 這裡不做成畫面上的彈窗——大部分警告對玩家沒有意義、跳出來只會干擾遊戲；
 * 印進 console 讓測試時按F12就能一眼看到，才是這些訊息真正該待的地方。
 */
function renderTurnWarnings(warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) return;
  console.warn("[TURN_WARNINGS]", warnings);
}

/**
 * 顯示「這一輪的選項不是AI給的」提示。
 *
 * 這是任務A要求的那個「看得出來的訊號」：在此之前，AI每一輪都沒照JSON格式輸出時，
 * 後端會安靜地用 FALLBACK_OPTIONS 墊滿四個選項，然後以 HTTP 200 ok:true 回傳，
 * 畫面上跟正常回合一模一樣——唯一的線索是選項文字逐字重複，得靠肉眼比對才會發現。
 *
 * 提示刻意做成一行小字、不擋任何操作：遊戲照樣能玩，但測試時掃一眼就知道現在吃的是保底內容。
 */
function renderTurnQuality(degraded) {
  if (!degraded) return;
  const fallbackCount = degraded.fallbackOptionCount ?? 0;
  if (fallbackCount <= 0) return;

  const allFallback = (degraded.aiOptionCount ?? 0) === 0;
  console.warn(
    `[TURN_DEGRADED] 本回合有 ${fallbackCount} 個選項是引擎保底產生的` +
      (allFallback ? "（整組都是保底，AI這輪沒有給出任何可用選項）" : "") +
      (degraded.parseFailed ? "，原因：AI回覆無法解析成JSON" : ""),
    degraded
  );

  const detail = allFallback
    ? "AI 這一輪沒有給出任何可用選項，底下四個全是與劇情無關的通用保底選項（每輪都會是同一組文字）。"
    : `AI 只給了 ${degraded.aiOptionCount} 個可用選項，其餘 ${fallbackCount} 個為通用保底選項。`;

  // 「寫到一半被切斷」跟「格式寫錯」是兩件不同的事，解法也完全不同：
  // 前者調高長度上限就好，後者要換模型。講同一句話只會讓人往錯的方向修。
  let cause = "";
  if (degraded.truncated) {
    cause = "成因：AI 的回覆寫到一半被切斷（長度上限用完了）。請到「系統與文筆設定」把『單次回覆長度上限』調大——會思考的模型要 8192 以上，因為思考用掉的額度也算在裡面。";
  } else if (degraded.parseFailed) {
    cause = "成因：AI 的回覆不是合法 JSON。";
  }

  appendFeedEvent("arcane", "主神提供的退路", `${escapeHtml(detail)}${cause ? " " + escapeHtml(cause) : ""}`);
}

/**
 * 顯示「角色昏迷／死亡」的橫幅，並在死亡時提供復活按鈕。
 *
 * [2026-08-16 新增] core/health.js 一直都會算出 dead / unconscious 旗標，
 * core/deathAndRevival.js 也早就寫好復活規則，但兩者在整個 functions/ 與 content/
 * 底下一次都沒被引用過。玩家在戰鬥裡被打死之後，照樣可以選選項、擲骰、推進劇情，
 * 畫面上一切正常——規則層算對了，結果卻沒有生效。
 */
function renderDownState(downState, revival) {
  const banner = document.getElementById("down-state-banner");
  if (!banner) return;

  // downState 沒帶回來時（例如敘事層失敗的502）什麼都不做：那代表「這次不知道」，
  // 不代表「角色沒事」。把橫幅清掉會讓一個已經倒下的角色看起來又好了。
  if (!downState) return;

  if (downState.canAct) {
    banner.style.display = "none";
    banner.innerHTML = "";
    return;
  }

  const title = downState.dead ? "角色已死亡" : "角色陷入昏迷";
  const lines = [escapeHtml(downState.reason ?? "")];
  if (downState.worsening) lines.push("傷勢正在惡化中。");

  let actionHtml = "";
  if (downState.dead && revival) {
    const left = revival.maxRevivals - revival.reviveCount;
    if (left <= 0) {
      lines.push(`已用完 ${revival.maxRevivals} 次復活機會，這張角色卡無法再復活，請重新創角。`);
    } else if (!revival.affordable) {
      lines.push(`復活需要 ${revival.cost} 點，目前只有 ${revival.available} 點，還差 ${revival.cost - revival.available} 點。`);
    } else {
      lines.push(`復活需要 ${revival.cost} 點（目前有 ${revival.available} 點），還剩 ${left} 次機會。`);
      actionHtml = `<button data-revive class="mt-1 px-3 py-1 rounded border border-emerald-400/50 bg-emerald-500/10 hover:bg-emerald-500/20 transition text-emerald-200 font-bold">花費 ${revival.cost} 點復活</button>`;
    }
  }

  banner.style.display = "block";
  banner.innerHTML =
    `<div class="text-[11px] font-bold">${escapeHtml(title)}</div>` +
    lines.filter(Boolean).map((l) => `<div>${l}</div>`).join("") +
    actionHtml;
  banner.querySelector("[data-revive]")?.addEventListener("click", attemptRevive);
}

async function attemptRevive() {
  if (!currentSessionId) return;
  try {
    const res = await (await fetch("/api/revive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId }),
    })).json();

    renderDownState(res.downState, res.revival);
    if (!res.ok) {
      appendFeedEvent("fault", "主神修復失敗", `復活失敗：${escapeHtml(res.error)}`);
      return;
    }

    adoptCharacter(res.character);
    refreshJournalIfOpen();
    appendFeedEvent(
      "arcane",
      "主神修復完成",
      `花費 <span class="fe-num">${res.cost}</span> 點 · 這是第 <span class="fe-num">${res.reviveCount}</span> 次復活`
    );
    // 復活後那場戰鬥已經在後端標記結束了，把畫面切回故事流。
    if (currentCombat) leaveCombatView();
    await runTurn({ opening: true });
  } catch (err) {
    console.error("[REVIVE_FAILURE]", err);
    appendFeedEvent("fault", "復活請求失敗", escapeHtml(err.message));
  }
}

/** 回合失敗時的錯誤區塊：講清楚哪裡壞了，並給一顆重試按鈕，不讓玩家卡在沒反應的畫面。 */
function appendTurnError(message, res) {
  const stage = res?.llmFailure?.stage;
  const httpStatus = res?.llmFailure?.httpStatus;
  const hint = stage === "config" || stage === "binding"
    ? "這是設定問題（金鑰／Base URL／模型／binding），重試不會有幫助，請先到「系統與文筆設定」檢查。"
    : httpStatus === 429
      ? "供應商回報請求過於頻繁或額度用盡，稍等一下再重試。"
      : "";

  setDecisionContext("回合沒有完成 · 可以重試或改用自訂行動");
  // retry 寫在事件資料裡而不是事後插進 DOM：故事流會被重畫很多次（光是 runTurn 的
  // finally 就有一次），只掛在 DOM 上的按鈕活不過下一次重畫。
  appendFeedEvent("fault", "這一回合沒有完成", escapeHtml(message), {
    note: hint ? escapeHtml(hint) : undefined,
    retry: "turn",
  });
}

// --- Alien V2 人物關係：資料由 server-owned reference response 提供 ---
const NPC_TRUST_TONE_CLASS = Object.freeze({
  muted: "npc-trust-muted",
  neutral: "npc-trust-neutral",
  good: "npc-trust-good",
  strong: "npc-trust-strong",
  warn: "npc-trust-warn",
  danger: "npc-trust-danger",
});

function renderNpcRelationships(npcs) {
  const tab = document.getElementById("tab-btn-npcs");
  const panel = document.getElementById("sidebar-tab-npcs");
  const roster = document.getElementById("npc-roster");
  const empty = document.getElementById("npc-empty");
  const count = document.getElementById("npc-tab-count");
  const note = document.getElementById("npc-panel-note");
  const list = Array.isArray(npcs) ? npcs.filter((npc) => npc?.id && npc?.name) : [];

  const hadActiveNpcTab = Boolean(tab?.classList.contains("active"));
  if (tab) tab.hidden = list.length === 0;
  if (panel) {
    panel.setAttribute("aria-hidden", list.length === 0 ? "true" : "false");
    panel.classList.toggle("hidden", list.length === 0 || !hadActiveNpcTab);
  }
  if (!list.length && hadActiveNpcTab) window.switchSidebarTab?.("attr");
  if (count) {
    count.hidden = list.length === 0;
    count.textContent = list.length ? String(list.length) : "";
  }
  if (!roster || !empty) return;
  if (!list.length) {
    roster.innerHTML = "";
    empty.style.display = "block";
    if (note) note.textContent = "等待副本資料";
    return;
  }

  empty.style.display = "none";
  if (note) note.textContent = `${list.length} 位人物`;
  roster.innerHTML = list.map((npc) => {
    const tone = NPC_TRUST_TONE_CLASS[npc.trustTone] ?? NPC_TRUST_TONE_CLASS.muted;
    const trustValue = npc.trust === null || npc.trust === undefined
      ? "—"
      : `${Number(npc.trust) > 0 ? "+" : ""}${npc.trust}`;
    return `<article class="npc-card ${tone}" data-npc-id="${escapeHtml(npc.id)}">
      <div class="npc-card-head">
        <div class="min-w-0">
          <div class="npc-card-name">${escapeHtml(npc.name)}</div>
          <div class="npc-card-role">${escapeHtml(npc.role ?? "副本人物")}</div>
        </div>
        <span class="npc-card-status">${escapeHtml(npc.statusLabel ?? npc.status ?? "未知")}</span>
      </div>
      <div class="npc-card-foot">
        <span>關係</span>
        <strong>${escapeHtml(npc.trustLabel ?? "待接觸")} <em>${escapeHtml(trustValue)}</em></strong>
      </div>
    </article>`;
  }).join("");
}

// --- 船艦探索終端：位置／路線／已知情報的單一情境面板 ---
let lastExplorationView = null;

function explorationLocationLabel(location) {
  return location?.name ?? location?.id ?? "未知位置";
}

function renderExplorationTerminal(view) {
  lastExplorationView = view ?? null;
  const location = view?.currentLocation;
  const event = view?.currentEvent;
  const currentLocationText = document.getElementById("scenario-location-text");
  const currentEventText = document.getElementById("scenario-event-text");
  const sceneText = document.getElementById("current-scene-text");
  if (currentLocationText) {
    currentLocationText.textContent = explorationLocationLabel(location);
    currentLocationText.title = location?.name ?? "目前位置尚未確認";
  }
  if (currentEventText) {
    currentEventText.textContent = event?.label ?? "目前事件";
    currentEventText.title = event?.id ?? "";
  }
  if (sceneText && location) {
    sceneText.textContent = `位置：${explorationLocationLabel(location)}`;
    sceneText.title = event?.label ? `${explorationLocationLabel(location)} · ${event.label}` : explorationLocationLabel(location);
  }

  const terminalSubtitle = document.getElementById("exploration-terminal-subtitle");
  const terminalLocation = document.getElementById("exploration-current-location");
  const terminalEvent = document.getElementById("exploration-current-event");
  const terminalObjective = document.getElementById("exploration-current-objective");
  const terminalMap = document.getElementById("exploration-terminal-map");
  const terminalRoutes = document.getElementById("exploration-terminal-routes");
  const terminalDiscoveries = document.getElementById("exploration-terminal-discoveries");
  const terminalQuestions = document.getElementById("exploration-terminal-questions");
  const terminalNpcs = document.getElementById("exploration-terminal-npcs");
  const terminalEnvironment = document.getElementById("exploration-terminal-environment");
  if (!terminalMap) return;

  if (!view?.currentLocation) {
    if (terminalSubtitle) terminalSubtitle.textContent = "等待副本位置資料……";
    if (terminalLocation) terminalLocation.textContent = "—";
    if (terminalEvent) terminalEvent.textContent = "—";
    if (terminalObjective) terminalObjective.textContent = "—";
    terminalMap.innerHTML = `<div class="text-[11px] text-zinc-500">目前尚未取得玩家可見的地圖資料。</div>`;
    if (terminalRoutes) terminalRoutes.innerHTML = "";
    if (terminalDiscoveries) terminalDiscoveries.textContent = "尚未記錄新的發現。";
    if (terminalQuestions) terminalQuestions.textContent = "目前沒有待追查的問題。";
    if (terminalNpcs) terminalNpcs.textContent = "目前沒有已確認的附近人物。";
    if (terminalEnvironment) terminalEnvironment.textContent = "等待位置資料……";
    return;
  }

  if (terminalSubtitle) terminalSubtitle.textContent = `${view.visitedLocations?.length ?? 0} 個已探索地點 · 地圖只顯示目前已知資訊`;
  if (terminalLocation) terminalLocation.textContent = explorationLocationLabel(location);
  if (terminalEvent) terminalEvent.textContent = event?.label ?? "目前事件";
  if (terminalObjective) terminalObjective.textContent = view.objective ?? "確認環境並決定下一步";

  const knownLocations = Array.isArray(view.knownLocations) ? view.knownLocations : [];
  terminalMap.innerHTML = knownLocations.length
    ? `<div class="exploration-map-legend" aria-label="地圖圖例"><span><b aria-hidden="true">◆</b> 目前位置</span><span><b aria-hidden="true">●</b> 已探索</span><span><b aria-hidden="true">○</b> 已知、尚未探索</span></div><div class="exploration-map-row">${knownLocations.map((item, index) => {
        const stateClass = item.id === location.id ? "is-current" : item.status === "visited" ? "is-visited" : item.status === "known" ? "is-known" : "is-unknown";
        const marker = item.id === location.id ? "◆" : item.status === "visited" ? "●" : "○";
        const separator = index ? `<span class="exploration-map-link" aria-hidden="true">—</span>` : "";
        const currentLabel = item.id === location.id ? "，目前位置" : "";
        return `${separator}<span class="exploration-map-node ${stateClass}" role="listitem" aria-current="${item.id === location.id ? "location" : "false"}" title="${escapeHtml(item.purpose ?? "")}"><span aria-hidden="true">${marker}</span>${escapeHtml(item.name)}${currentLabel}</span>`;
      }).join("")}</div>`
    : `<div class="text-[11px] text-zinc-500">目前沒有可顯示的已知路線。</div>`;

  const routes = Array.isArray(view.nearbyRoutes) ? view.nearbyRoutes : [];
  if (terminalRoutes) {
    terminalRoutes.innerHTML = routes.length
      ? routes.map((route) => {
          const available = route.actionReady === true;
          const lockedText = route.lockReason ?? "目前尚未由主線事件授權";
          const actionText = available
            ? (travelInFlight ? "移動中……" : `移動 · ${Number(route.timeCost) || 1} 回合`)
            : `暫不可用 · ${lockedText}`;
          const risk = available && route.riskLabel
            ? `<span class="exploration-route-risk">${escapeHtml(route.riskLabel)}</span>`
            : "";
          const routeDescriptionId = `exploration-route-description-${String(route.to).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          const accessibleAction = available
            ? `移動至${route.label}，消耗 ${Number(route.timeCost) || 1} 回合${route.riskLabel ? `，${route.riskLabel}` : ""}`
            : `前往${route.label}目前不可用：${lockedText}`;
          return `<div class="exploration-route-card ${available ? "is-available" : "is-locked"}">
            <div class="min-w-0 flex-1"><strong>${escapeHtml(route.label)}</strong><br><span id="${routeDescriptionId}">${escapeHtml(route.purpose ?? "確認這條路線的狀況")}</span></div>
            <div class="exploration-route-action">
              ${available
                ? `<button type="button" class="exploration-route-btn" data-travel-to="${escapeHtml(route.to)}" aria-label="${escapeHtml(accessibleAction)}" aria-describedby="${routeDescriptionId}" ${travelInFlight ? "disabled" : ""}>${escapeHtml(actionText)}</button>`
                : `<span role="status" title="${escapeHtml(lockedText)}" aria-label="${escapeHtml(accessibleAction)}">${escapeHtml(actionText)}</span>`}
              ${risk}
            </div>
          </div>`;
        }).join("")
      : `<div class="rounded border hairline-border border-dashed p-2.5 text-[11px] text-zinc-500">目前沒有可確認的相鄰路線。</div>`;
    terminalRoutes.querySelectorAll("[data-travel-to]").forEach((button) => {
      button.addEventListener("click", () => travelToLocation(button.dataset.travelTo));
    });
  }

  const discoveries = Array.isArray(view.recentDiscoveries) ? view.recentDiscoveries : [];
  if (terminalDiscoveries) {
    terminalDiscoveries.innerHTML = discoveries.length
      ? discoveries.map((item) => {
          const title = typeof item === "string" ? "已記錄發現" : item.title ?? item.label ?? "已記錄發現";
          const text = typeof item === "string" ? item : item.text ?? "已記錄發現";
          return `<div class="mb-1 last:mb-0"><strong class="text-zinc-200">${escapeHtml(title)}</strong><br><span>· ${escapeHtml(text)}</span></div>`;
        }).join("")
      : "尚未記錄新的發現。";
  }

  const questions = Array.isArray(view.unresolvedQuestions) ? view.unresolvedQuestions : [];
  if (terminalQuestions) {
    terminalQuestions.innerHTML = questions.length
      ? questions.map((question) => {
          const status = question.status ?? "open";
          const answer = status === "answered" && question.answer
            ? `<div class="mt-1 text-emerald-200/90">${escapeHtml(question.answer)}</div>`
            : "";
          const progress = status !== "answered" && question.progressText
            ? `<div class="mt-1 text-sky-200/90">目前解讀：${escapeHtml(question.progressText)}</div>`
            : "";
          const evidence = Array.isArray(question.evidence) && question.evidence.length
            ? `<div class="mt-1 text-zinc-500">已有 ${question.evidence.length} 項相關線索</div>`
            : "";
          return `<div class="exploration-question is-${escapeHtml(status)} mb-1 last:mb-0"><div>${escapeHtml(question.text ?? "待追查問題")}</div><div class="exploration-question-status">${escapeHtml(question.statusLabel ?? "未解")}</div>${evidence}${progress}${answer}</div>`;
        }).join("")
      : "目前沒有待追查的問題。";
  }

  const nearbyNpcs = Array.isArray(view.nearbyNpcs) ? view.nearbyNpcs : [];
  if (terminalNpcs) {
    terminalNpcs.innerHTML = nearbyNpcs.length
      ? nearbyNpcs.map((npc) => `<div class="mb-1 last:mb-0"><strong class="text-zinc-200">${escapeHtml(npc.name)}</strong> <span>· ${escapeHtml(npc.role ?? "副本人物")} · ${escapeHtml(npc.trustLabel ?? "待接觸")}</span></div>`).join("")
      : "目前沒有已確認的附近人物。";
  }

  const environment = view.environmentState ?? {};
  const features = Array.isArray(environment.featureSummary) ? environment.featureSummary : [];
  const hazards = Array.isArray(environment.hazardSummary) ? environment.hazardSummary : [];
  const landmarks = Array.isArray(environment.landmarks) ? environment.landmarks : [];
  const hazardHints = Array.isArray(environment.hazardHints) ? environment.hazardHints : [];
  if (terminalEnvironment) {
    const lines = [];
    if (environment.description) lines.push(`<div class="mb-2 text-zinc-200 leading-relaxed">${escapeHtml(environment.description)}</div>`);
    if (environment.atmosphere) lines.push(`<div class="mb-1"><span class="text-zinc-500">感官基調：</span>${escapeHtml(environment.atmosphere)}</div>`);
    if (landmarks.length) {
      const landmarkText = landmarks.map((item) => typeof item === "string" ? item : `${item.id ? `${item.id}：` : ""}${item.text ?? ""}`).join("；");
      lines.push(`<div class="mb-1"><span class="text-zinc-500">可見地標：</span>${escapeHtml(landmarkText)}</div>`);
    }
    if (features.length) lines.push(`<div class="mb-1"><span class="text-zinc-500">已確認物件：</span>${features.map(escapeHtml).join("、")}</div>`);
    if (hazardHints.length) lines.push(`<div class="mb-1"><span class="text-zinc-500">可見危險：</span>${hazardHints.map(escapeHtml).join("；")}</div>`);
    if (hazards.length) lines.push(`<div class="mb-1"><span class="text-zinc-500">已知環境風險：</span>${hazards.map(escapeHtml).join("、")}</div>`);
    if (environment.revisitVariant) lines.push(`<div class="mt-2 border-l-2 border-amber-500/40 pl-2 text-amber-100/90"><span class="text-amber-400/70">${escapeHtml(environment.revisitVariantLabel ?? "回訪變化")}：</span>${escapeHtml(environment.revisitVariant)}</div>`);
    terminalEnvironment.innerHTML = lines.length ? lines.join("") : "目前沒有額外的環境狀態記錄。";
  }
}

async function travelToLocation(destinationId, existingRequestId = null) {
  if (!destinationId || !currentSessionId || turnInFlight || travelInFlight) return;
  const requestId = existingRequestId || `travel:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  lastTravelRequest = { destinationId, requestId };
  travelInFlight = true;
  setTurnInputLocked(true);
  renderExplorationTerminal(lastExplorationView);
  try {
    const httpResponse = await fetch("/api/travel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId, to: destinationId, requestId }),
    });
    const response = await httpResponse.json().catch(() => ({ ok: false, error: "伺服器回傳不是合法 JSON", invalidJson: true }));
    if (!httpResponse.ok || !response.ok) {
      appendFeedEvent(
        "fault",
        response.invalidJson ? "移動結果未確認" : "移動未獲准",
        escapeHtml(response.error ?? `移動失敗（HTTP ${httpResponse.status}）`),
        response.invalidJson ? { retry: "travel" } : {}
      );
      if (response.scenario) updateScenarioHud(response.scenario);
      return;
    }

    appendFeedEvent("action", "探索移動", escapeHtml(`前往${response.travel?.label ?? destinationId}`));
    if (response.narration) appendNarrationBlock(response.narration);
    const risk = response.travel?.risk;
    if (risk?.label) {
      appendFeedEvent(
        "world",
        "環境回饋",
        escapeHtml(risk.label),
        { tone: Number(risk.threatDelta) > 0 ? "bad" : "neutral" }
      );
    }
    if (response.character) adoptCharacter(response.character);
    renderOptions(response.options || [], {
      referenceMode: Boolean(response.scenario?.reference?.enabled),
      dmPrompt: response.scenario?.reference?.dmPrompt,
    });
    if (response.turnCount) document.getElementById("turn-counter").textContent = response.turnCount;
    if (response.scenario) updateScenarioHud(response.scenario);
    lastTravelRequest = null;
    refreshJournalIfOpen();
  } catch (err) {
    console.error("[TRAVEL_FAILURE] /api/travel 呼叫失敗", err);
    appendFeedEvent("fault", "移動結果未確認", escapeHtml(`無法確認移動是否已保存：${err.message}`), { retry: "travel" });
  } finally {
    travelInFlight = false;
    setTurnInputLocked(false);
    renderExplorationTerminal(lastExplorationView);
  }
}

function openExplorationTerminal() {
  if (!lastExplorationView?.currentLocation) {
    showToast("目前尚未取得副本位置資料。開始副本後，副本情報面板會在這裡顯示。", { kind: "info" });
    return;
  }
  renderExplorationTerminal(lastExplorationView);
  openModal("explorationTerminal");
}

// --- 副本節點 HUD：目前目標 / 主線進度 / 時間預算狀態 ---
const TIME_STATUS_STYLE = {
  充裕: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  吃緊: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  危急: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  逾時: "border-red-500/40 bg-red-500/10 text-red-300",
};

function resetScenarioNoticeDedup(sessionId) {
  scenarioNoticeSessionId = sessionId ?? null;
  scenarioNoticeKeys.clear();
}

function appendScenarioNoticeOnce(key, append) {
  if (!key || scenarioNoticeKeys.has(key)) return;
  scenarioNoticeKeys.add(key);
  append();
}

function updateScenarioHud(scenario) {
  if (scenarioNoticeSessionId !== currentSessionId) resetScenarioNoticeDedup(currentSessionId);
  const hud = document.getElementById("scenario-hud");
  const referenceMode = Boolean(scenario?.reference?.enabled);
  currentReferenceMode = referenceMode;
  renderDmPrompt(scenario?.reference?.dmPrompt ?? null, { visible: referenceMode });
  renderNpcRelationships(scenario?.reference?.npcs ?? []);
  renderExplorationTerminal(scenario?.reference?.exploration ?? null);
  if (!hud) return;

  // 節點結算被引擎擋下時，玩家會看到「我明明做完了，進度條卻沒動」。
  // 這種事以前只進 warnings 陣列(沒人讀)，現在直接寫進故事流講清楚原因。
  (scenario.warnings || []).forEach((w) => {
    appendScenarioNoticeOnce(`warning:${String(w)}`, () => {
      appendFeedEvent("world", "副本異常", escapeHtml(w), { tone: "bad" });
    });
  });

  if (scenario.nodeCompleted) {
    const n = scenario.nodeCompleted;
    appendScenarioNoticeOnce(`node:${n.nodeId ?? n.title}:${n.reward ?? ""}`, () => {
      appendFeedEvent(
        "world",
        `劇情節點完成：${escapeHtml(n.title)}`,
        `扭轉度 <span class="fe-num">${n.divergenceTier}</span> 級 · 獲得 <span class="fe-num">${n.reward}</span> 點經驗`,
        { tone: "good" }
      );
    });
  }

  const node = scenario.activeNode;
  if (!node && !scenario.progress?.scenarioComplete) {
    hud.style.display = "none";
    return;
  }
  hud.style.display = "flex";

  // 「目前目標」跟「主線進度」是兩件不同的事：前者是這個節點的名字，
  // 後者是整個劇本的完成度。過去黏在一起顯示（例如「醒來的代價 0%」）會讓玩家
  // 誤以為要把這個節點推進到100%才算完成，實際上通常過一回合節點就結束了。
  renderBriefing(scenario.briefing);

  // 「當前目標」顯示的是節點的 playerGoal（玩家看得懂的一句話），不是節點標題。
  // 標題是寫給副本作者看的索引（「母親的特別指令」對還沒玩到那裡的人就是一句謎語），
  // 玩家需要的是「我現在具體要幹嘛」——這正是測玩回饋卡住的地方。
  const titleEl = document.getElementById("scenario-node-title");
  const goalText = node?.goal || node?.title || "";
  if (scenario.progress?.scenarioComplete) {
    titleEl.textContent = "主線已完成";
    titleEl.title = "";
  } else if (node.isFinale) {
    titleEl.textContent = `最終目標：${goalText}`;
    titleEl.title = node.title;
  } else {
    titleEl.textContent = goalText;
    titleEl.title = node.title;
  }

  const pct = scenario.progress?.overallCompletionPct ?? 0;
  const currentChapter = scenario.progress?.chapters?.[scenario.progress?.currentChapterIndex ?? 0];
  const progressDetail = currentChapter
    ? `主線進度：節點 ${currentChapter.completedNodes}/${currentChapter.totalNodes}（${pct}%）`
    : `主線進度：${pct}%`;
  document.getElementById("scenario-progress-bar").style.width = `${pct}%`;
  document.getElementById("scenario-progress-text").textContent = `${pct}%`;
  const progressMetric = document.querySelector(".mission-progress-metric");
  if (progressMetric) progressMetric.title = progressDetail;

  renderThreatMeter(scenario.threat);

  const badge = document.getElementById("scenario-time-badge");
  const timeStatus = badge?.querySelector(".mission-time-status");
  const timeRemaining = badge?.querySelector(".mission-time-remaining");
  const timeTrack = badge?.querySelector(".mission-time-track");
  const status = scenario.progress?.timeStatus;
  const timeBudget = scenario.progress?.timeBudget;
  if (badge && status) {
    const totalRounds = Number(timeBudget?.totalRounds);
    const spentRounds = Number(timeBudget?.spentRounds);
    const hasBudget = Number.isFinite(totalRounds) && totalRounds > 0 && Number.isFinite(spentRounds);
    const remain = hasBudget ? Math.max(0, totalRounds - spentRounds) : null;
    badge.className = `mission-time-badge border ${TIME_STATUS_STYLE[status] ?? ""}`;
    if (timeStatus) timeStatus.textContent = status;
    if (timeRemaining) timeRemaining.textContent = remain === null ? "—" : `${remain}/${totalRounds}`;
    if (timeTrack) {
      const filled = remain === null ? 0 : Math.ceil((remain / totalRounds) * 7);
      timeTrack.innerHTML = Array.from({ length: 7 }, (_, i) =>
        `<span class="mission-time-pip ${i < filled ? "is-remaining" : ""}" aria-hidden="true"></span>`
      ).join("");
      timeTrack.hidden = remain === null;
      if (remain !== null) timeTrack.setAttribute("aria-label", `剩餘回合 ${remain}/${totalRounds}`);
      else timeTrack.removeAttribute("aria-label");
    }
    if (!timeStatus || !timeRemaining) badge.textContent = remain === null ? `時間：${status}` : `時間：${status} (${remain}/${totalRounds})`;
    badge.title = remain === null ? `時間狀態：${status}` : `剩餘 ${remain} 回合／共 ${totalRounds} 回合`;
  } else if (badge) {
    badge.textContent = "";
    badge.className = "mission-time-badge";
    badge.removeAttribute("title");
    if (timeTrack) {
      timeTrack.innerHTML = "";
      timeTrack.hidden = true;
      timeTrack.removeAttribute("aria-label");
    }
  }

  // 「遭遇戰鬥」按鈕只在最終戰節點才顯示：一般敘事節點顯示這顆按鈕，玩家隨時可能
  // 在毫無劇情鋪陳的情況下手滑點下去，憑空跳出一隻佔位怪物，破壞AI辛苦營造的沉浸感。
  // 迫近度到頂(接觸)時也要開放這顆按鈕：那一刻威脅已經站在玩家面前了，
  // 後端會直接用副本自己的追兵樣板開戰（見 functions/api/combat/start.js），
  // 不是憑空跳出一隻佔位怪物，所以不違反上面那個「不要破壞沉浸感」的原則。
  const combatBtn = document.getElementById("combat-start-btn");
  const cornered = Boolean(scenario.threat?.contact);
  if (combatBtn) {
    const isFinale = Boolean(node?.isFinale);
    const canFight = isFinale || cornered;
    combatBtn.style.display = canFight ? "" : "none";
    combatBtn.classList.toggle("pulse-glow", canFight);
  }

  // [2026-08-18] 迫近度到頂時自動切進戰鬥畫面，不再只讓玩家自己注意到右上角那顆小按鈕。
  //
  // 起因：實際測玩回報「遭遇戰鬥不要只有出現在右上方」——「接觸」代表威脅已經欺到臉前，
  // 這種時候還要玩家自己發現角落多了一顆按鈕、手動點下去才會進戰鬥畫面，等同於系統已經
  // 知道玩家被逮到了，卻假裝沒事、繼續顯示敘事選項。上面那顆按鈕保留不拿掉——玩家仍然
  // 可以在最終戰節點手動觸發，這裡只是多加一條「不用等他自己按」的路徑。
  // 用 combatInFlight 跟 currentCombat.active 擋兩層重複觸發：同一次 contact 只會開一次戰，
  // 戰鬥開始後 functions/api/combat/start.js 會呼叫 dischargeThreat() 把迫近度降回去，
  // 之後的畫面就不會再帶著 contact:true 回來，不需要在前端額外記一個「這次打過了」的旗標。
  if (cornered && !combatInFlight && !(currentCombat && currentCombat.active)) {
    startCombat();
  }
}

/**
 * 副本簡介條（資料來自副本包的 briefing 欄位，作者寫死的，不是AI生的）。
 *
 * 收合狀態交給 <details> 自己管，這裡只負責填內容與決定要不要顯示整塊。
 * 沒有 briefing 的副本(例如 echoInstitute)整塊不顯示，行為跟以前一樣。
 */
const SETTLEMENT_ENDINGS = Object.freeze({
  end_solo_survivor: { title: "孤獨生還者", copy: "水仙號在深空中留下微弱藍光。沒有人能替你證明那艘船上發生過什麼；只有傷勢、腕錶裡的紀錄，以及一段沒有被公司承認的座標。" },
  end_heroic_rescue: { title: "帶著證人離開", copy: "水仙號的兩具休眠艙同時亮起綠燈。你沒有只把自己塞進逃生路線；有人會帶著對 937、Ash 與異形的第一手記憶一起離開。" },
  end_corporate_agent: { title: "公司的新鑰匙", copy: "低溫儲格在休眠艙旁持續發出冷卻聲。你帶走的不只是組織，而是一把能打開公司下一個計畫的鑰匙。" },
  end_dark_infection: { title: "沉睡的感染", copy: "休眠艙合上的時候，你以為任務已經結束。真正的警報在傳送之後才出現：體內有某個不屬於人類的東西，正在等待下一次醒來。" },
  end_expire_ruins: { title: "倒數中的殘骸", copy: "倒數歸零，船體在你身邊解體。主神機制把你從爆炸邊緣拖回來，但沒有把隊友、證據與原本可以取得的報酬一起帶走。" },
  end_death_alien_feast: { title: "通風管裡的名字", copy: "最後留下的不是你的名字，而是通風管內拖行的聲音。異形把你的遺留物帶進黑暗，母船的倒數仍然繼續。" },
  end_death_overload_vaporized: { title: "高溫抹除", copy: "母親的倒數在核心崩潰中歸零。船、樣本、異形與玩家的所有行動一起被高溫抹去。" },
  end_death_vacuum_breach: { title: "深空失壓", copy: "沒有宇航服，也沒有安全繩。你被氣閘的風帶入深空，水仙號在視線中縮成一點藍光。" },
});

const SETTLEMENT_STATUS_LABELS = Object.freeze({
  sampleStatus: { none: "未取得", tissue: "未穩定組織", preserved: "已保存", destroyed: "已毀損" },
  infectionStatus: { unknown: "未知", suspected: "疑似", infected: "已感染", cleared: "已排除" },
});
const SETTLEMENT_NPC_LABELS = Object.freeze({ npc_ash: "Ash", npc_luyuan: "陸遠", npc_ripley: "Ripley", npc_parker: "Parker" });

function settlementValue(map, value) {
  return map?.[value] ?? (value == null ? "未記錄" : String(value));
}

function showScenarioSettlement(settlement) {
  const summary = settlement?.runSummary;
  const layer = document.getElementById("scenario-settlement-screen");
  const shell = layer?.querySelector(".settlement-shell");
  if (!summary || !layer || !shell) return;
  const evaluation = summary.evaluation ?? {};
  // 新結算一律採用 server canonical presentation；本地短文只保留給沒有新欄位的舊存檔。
  const ending = settlement.endingPresentation ?? summary.endingPresentation ?? SETTLEMENT_ENDINGS[summary.endingId] ?? {
    title: "未命名結局",
    copy: "這份輪迴紀錄已封存，但結局文字尚未登錄。",
  };
  const nodes = [
    ["樣本", settlementValue(SETTLEMENT_STATUS_LABELS.sampleStatus, summary.sampleStatus)],
    ["感染", settlementValue(SETTLEMENT_STATUS_LABELS.infectionStatus, summary.infectionStatus)],
    ["完成節點", `${summary.objectiveIds?.length ?? 0} / ${summary.objectiveTotal ?? summary.objectiveIds?.length ?? 0}`],
  ];
  const npcEntries = Object.entries(summary.npcStatuses ?? {})
    .filter(([, status]) => status === "survived" || status === "dead" || status === "injured" || status === "destroyed")
    .map(([id, status]) => [SETTLEMENT_NPC_LABELS[id] ?? id, status === "survived" ? "已帶離" : status === "dead" ? "死亡" : status === "destroyed" ? "摧毀" : "受傷"]);
  nodes.push(...npcEntries);

  document.getElementById("settlement-version").textContent = summary.scenarioVersion ? `V${summary.scenarioVersion}` : "V2";
  document.getElementById("settlement-title").textContent = "副本結算";
  document.getElementById("settlement-subtitle").textContent = summary.endingId?.startsWith("end_death") ? "這次輪迴沒有回到休眠艙，但紀錄仍然完成封存。" : "這場輪迴留下的，不只有一個活下來的人。";
  document.getElementById("settlement-grade").textContent = evaluation.grade ?? "—";
  document.getElementById("settlement-grade-label").textContent = evaluation.label ?? "歷史結算";
  document.getElementById("settlement-evaluation").textContent = evaluation.summary ?? "評價由伺服器根據本次輪迴的引擎事實產生。";
  document.getElementById("settlement-ending-title").textContent = ending.title;
  document.getElementById("settlement-ending-copy").textContent = ending.copy;
  document.getElementById("settlement-ending-id").textContent = summary.endingId ?? "ENDING_PENDING";
  document.getElementById("settlement-spent-rounds").textContent = `${summary.spentRounds ?? 0}`;
  document.getElementById("settlement-remaining-rounds").textContent = `${summary.remainingRounds ?? 0}`;
  document.getElementById("settlement-threat-peak").textContent = `${summary.threat?.peak ?? summary.threat?.level ?? 0} / 7`;
  document.getElementById("settlement-encounters").textContent = `${summary.threat?.encounters ?? 0}`;
  document.getElementById("settlement-quality-score").textContent = `${evaluation.qualityScore ?? summary.qualityScore ?? 0}`;
  document.getElementById("settlement-speed-score").textContent = `+${evaluation.speedScore ?? summary.speedScore ?? summary.speedBonusPoints ?? 0}`;
  document.getElementById("settlement-overall-score").textContent = `${evaluation.overallScore ?? summary.overallScore ?? 0}`;
  document.getElementById("settlement-xp").textContent = `${summary.xp ?? settlement.xp ?? 0}`;
  document.getElementById("settlement-quality-meter-text").textContent = `${evaluation.qualityScore ?? summary.qualityScore ?? 0} pts`;
  const qualityScore = Number(evaluation.qualityScore ?? summary.qualityScore ?? 0);
  document.getElementById("settlement-quality-meter-fill").style.width = `${Math.min(100, Math.max(0, Math.round((qualityScore / 225) * 100)))}%`;
  document.getElementById("settlement-outcomes").innerHTML = nodes.map(([label, value]) =>
    `<div class="settlement-outcome-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
  ).join("");
  document.getElementById("settlement-note").textContent =
    `紀錄已封存。${summary.remainingRounds > 0 ? `你保留了 ${summary.remainingRounds} 回合效率資源。` : "你把最後一點時間也留在了這艘船上。"} 獎勵已由主神系統入帳。`;

  layer.style.display = "flex";
  layer.removeAttribute("aria-hidden");
  document.body.classList.add("is-settlement-open");
  requestAnimationFrame(() => shell.focus());
}

let currentGodspacePayload = null;
let godspaceBusy = false;

async function loadGodspace(sessionId = currentSessionId, { reveal = false } = {}) {
  if (!sessionId) {
    currentGodspacePayload = null;
    renderGodspace(null);
    return null;
  }
  const res = await (await fetch(`/api/godspace?sessionId=${encodeURIComponent(sessionId)}`)).json();
  if (!res.ok) throw new Error(res.error || "主神空間記錄讀取失敗");
  currentGodspacePayload = res;
  if (reveal) {
    showScreen("portal");
    finishPortalReveal("resume");
  }
  renderGodspace(res);
  return res;
}

function hubAction(id) {
  return currentGodspacePayload?.actions?.find((item) => item.id === id) ?? null;
}

function applyHubActionButton(buttonId, actionId) {
  const button = document.getElementById(buttonId);
  const meta = hubAction(actionId);
  if (!button) return;
  button.disabled = !meta?.enabled;
  button.title = meta?.reason ?? "目前不可用";
  button.classList.toggle("opacity-40", !meta?.enabled);
  button.classList.toggle("cursor-not-allowed", !meta?.enabled);
}

function hubGuideHandler(actionId) {
  return {
    view_debrief: openLastRunDebrief,
    rest: restFromGodspace,
    revive: reviveFromGodspace,
    start_scenario: startNewChargen,
    resume_scenario: resumeLocalSession,
  }[actionId] ?? null;
}

function applyGuideActionButton(button, action, handler = null) {
  if (!button) return;
  button.disabled = !action?.enabled;
  button.textContent = action?.label ?? "目前不可用";
  button.title = action?.reason ?? "目前不可用";
  button.classList.toggle("is-disabled", !action?.enabled);
  button.onclick = action?.enabled ? (handler ?? hubGuideHandler(action.id)) : null;
}

function renderGodspaceGuide(guide) {
  const card = document.getElementById("hub-guide-card");
  if (!card) return;
  if (!guide) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";
  setText("hub-guide-title", guide.title ?? "安全區導引");
  setText("hub-guide-summary", guide.summary ?? "");
  const nextAction = guide.nextAction ?? null;
  const nextButton = document.getElementById("hub-guide-next-button");
  applyGuideActionButton(nextButton, nextAction);
  setText("hub-guide-next-reason", nextAction?.reason ?? "");

  const slots = [
    ["review", "hub-guide-step-review", "hub-guide-step-review-title", "hub-guide-step-review-copy", "hub-guide-step-review-button"],
    ["recover", "hub-guide-step-recover", "hub-guide-step-recover-title", "hub-guide-step-recover-copy", "hub-guide-step-recover-button"],
    ["depart", "hub-guide-step-depart", "hub-guide-step-depart-title", "hub-guide-step-depart-copy", "hub-guide-step-depart-button"],
  ];
  for (const [stepId, cardId, titleId, copyId, buttonId] of slots) {
    const step = guide.steps?.find((candidate) => candidate.id === stepId) ?? null;
    const stepCard = document.getElementById(cardId);
    const stepButton = document.getElementById(buttonId);
    if (!stepCard) continue;
    stepCard.style.display = step ? "flex" : "none";
    stepCard.classList.toggle("is-current", Boolean(step && nextAction?.id === step.action?.id));
    setText(titleId, step?.title ?? "");
    setText(copyId, step?.description ?? "");
    applyGuideActionButton(stepButton, step?.action ?? null);
  }
}

function renderGodspace(payload) {
  const panel = document.getElementById("portal-aftercare-panel");
  renderGodspaceGuide(payload?.guide ?? null);
  if (!panel) return;
  const debrief = payload?.debrief;
  const lifecycle = payload?.lifecycle;
  if (!payload || (!debrief && lifecycle?.status === "no_scenario")) {
    panel.style.display = "none";
    applyHubActionButton("hub-rest-button", "rest");
    applyHubActionButton("hub-revive-button", "revive");
    return;
  }
  panel.style.display = "block";
  setText("hub-aftercare-title", debrief?.scenario?.title ?? "主神空間記錄");
  setText("hub-aftercare-status", lifecycle?.reason ?? "server 已回傳目前狀態");
  setText("hub-aftercare-grade", debrief?.evaluation?.grade ?? "—");
  setText("hub-aftercare-evaluation", debrief?.evaluation?.label ?? "尚無結算資料");
  setText(
    "hub-aftercare-score",
    debrief
      ? `QUALITY ${debrief.evaluation.qualityPoints ?? 0} · SPEED ${debrief.evaluation.speedPoints ?? 0} · OVERALL ${debrief.evaluation.overallScore ?? 0}`
      : "等待副本結算封存",
  );

  const health = payload.health ?? {};
  const hp = health.hp ?? {};
  setText("hub-health-hp", `HP ${hp.intact ?? 0} 完好 · B ${hp.B ?? 0} · L ${hp.L ?? 0} · A ${hp.A ?? 0}`);
  setText("hub-health-willpower", `意志力 ${health.willpower?.current ?? 0} / ${health.willpower?.max ?? 0}`);
  const poolText = Object.entries(health.energyPools ?? {})
    .map(([id, pool]) => `${id} ${pool.current}/${pool.max}`)
    .join(" · ") || "無能量池資料";
  setText("hub-health-energy", `能量池 ${poolText}`);
  const down = health.downState ?? {};
  const healthStatus = down.dead ? "角色已死亡 · 需要復活" : down.unconscious ? "角色昏迷 · 暫不可行動" : "狀態可行動";
  setText("hub-health-status", healthStatus);
  const healthStatusEl = document.getElementById("hub-health-status");
  if (healthStatusEl) healthStatusEl.className = `mt-2 text-[10px] ${down.dead ? "text-rose-300" : down.unconscious ? "text-amber-300" : "text-emerald-300"}`;

  const wallet = payload.resources?.wallet ?? {};
  const tokens = Object.entries(wallet.tokens ?? {}).filter(([, count]) => count > 0).map(([tier, count]) => `${tier}×${count}`).join(" ") || "無支線";
  setText("hub-resource-wallet", `支線 ${tokens} · 獎勵點數 ${wallet.points ?? 0} · XP ${wallet.xp ?? 0}`);
  const items = payload.resources?.referenceInventory ?? [];
  setText("hub-resource-items", `副本道具：${items.length ? items.join("、") : "無"}`);
  const activity = debrief?.activity;
  setText("hub-resource-activity", activity ? `回合 ${activity.turns ?? 0} · 判定 ${activity.checks ?? 0} · 戰鬥 ${activity.combatActions ?? 0}` : "尚無副本活動統計");

  const objectives = debrief?.objectives ?? [];
  setText(
    "hub-aftercare-objectives",
    objectives.length
      ? `已封存節點：${objectives.map((objective) => `${objective.title}${objective.divergenceTier != null ? `（${objective.divergenceTier}）` : ""}`).join("、")}`
      : debrief ? "本場沒有可列出的已完成節點。" : "目前沒有已封存的副本結算。",
  );
  applyHubActionButton("hub-view-debrief", "view_debrief");
  applyHubActionButton("hub-rest-button", "rest");
  applyHubActionButton("hub-revive-button", "revive");
  applyHubActionButton("hub-start-button", "start_scenario");
  applyHubActionButton("hub-shop-button", "shop");
}

function openLastRunDebrief() {
  const summary = currentGodspacePayload?.debrief?.runSummary;
  if (!summary) {
    showToast("目前沒有可查看的已封存結算。");
    return;
  }
  showScenarioSettlement({
    runSummary: summary,
    endingPresentation: currentGodspacePayload?.debrief?.scenario?.endingPresentation ?? null,
  });
}

async function enterGodspaceFromSettlement(source = "settlement") {
  if (!currentSessionId) {
    showScreen("portal");
    finishPortalReveal("resume");
    return true;
  }
  if (godspaceBusy) return false;
  godspaceBusy = true;
  const errorEl = document.getElementById("hub-aftercare-error");
  if (errorEl) errorEl.style.display = "none";
  try {
    const response = await (await fetch("/api/godspace/enter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId, source }),
    })).json();
    if (!response.ok) throw new Error(response.error || "目前不能返回主神空間");
    currentGodspacePayload = response;
    const layer = document.getElementById("scenario-settlement-screen");
    if (layer) {
      layer.style.display = "none";
      layer.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("is-settlement-open");
    currentCombat = null;
    showScreen("portal");
    document.getElementById("portal-subtitle").textContent = "上一場副本已封存。你可以查看結果、整理角色，或準備下一場副本。";
    finishPortalReveal("resume");
    renderGodspace(response);
    return true;
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error.message;
      errorEl.style.display = "block";
    }
    showToast(`不能返回主神空間：${error.message}`);
    return false;
  } finally {
    godspaceBusy = false;
  }
}

async function returnToMainGodSpace() {
  await enterGodspaceFromSettlement("settlement");
}

async function restFromGodspace() {
  if (!currentSessionId || godspaceBusy) return;
  const meta = hubAction("rest");
  if (!meta?.enabled) {
    showToast(meta?.reason || "目前不能完全恢復");
    return;
  }
  godspaceBusy = true;
  try {
    const response = await (await fetch("/api/rest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId }),
    })).json();
    if (!response.ok) throw new Error(response.error || response.blockers?.[0]?.message || "完全恢復失敗");
    if (response.character) adoptCharacter(response.character);
    if (response.hub?.ok) {
      currentGodspacePayload = response.hub;
      renderGodspace(response.hub);
    } else {
      await loadGodspace(currentSessionId);
    }
    showToast(response.summary || "主神空間已完成恢復。");
  } catch (error) {
    showToast(`完全恢復失敗：${error.message}`);
  } finally {
    godspaceBusy = false;
  }
}

async function reviveFromGodspace() {
  if (!currentSessionId || godspaceBusy) return;
  const meta = hubAction("revive");
  if (!meta?.enabled) {
    showToast(meta?.reason || "目前不能復活");
    return;
  }
  godspaceBusy = true;
  try {
    const response = await (await fetch("/api/revive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId }),
    })).json();
    if (!response.ok) throw new Error(response.error || "復活失敗");
    if (response.character) adoptCharacter(response.character);
    await loadGodspace(currentSessionId);
    showToast(`復活完成，支付 ${response.cost ?? 0} 點。`);
  } catch (error) {
    showToast(`復活失敗：${error.message}`);
  } finally {
    godspaceBusy = false;
  }
}

function renderBriefing(briefing) {
  const box = document.getElementById("scenario-briefing");
  if (!box) return;
  if (!briefing) {
    box.style.display = "none";
    return;
  }
  box.style.display = "block";
  setText("briefing-title", briefing.title ?? "副本簡介");
  setText("briefing-objective", briefing.objective ?? "");
  setText("briefing-premise", briefing.premise ?? "");
  setText("briefing-caution", briefing.caution ?? "");
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * 迫近度指示燈（資料來自 content/scenario/threat.js，經 /api/turn 的 scenario.threat 回來）。
 *
 * 為什麼要畫出來：迫近度是「判定成敗會累積」這件事唯一的實體。玩家如果看不到它，
 * 失敗的後果就只剩下敘事裡的一句話，跟修正之前一模一樣。畫成一排燈而不是數字，
 * 是因為玩家要的是「又靠近了一格」這個感覺，不是精確的整數。
 *
 * 階段升高時額外在故事流插一行提示——那一格通常就是玩家剛剛失敗的那一次，
 * 把因果直接講明，比讓他自己從敘事裡推論有效。
 */
let lastThreatStage = null;

function renderThreatMeter(threat) {
  const box = document.getElementById("scenario-threat");
  const pips = document.getElementById("scenario-threat-pips");
  const label = document.getElementById("scenario-threat-label");
  if (!box || !pips || !label) return;

  if (!threat) {
    box.style.display = "none";
    lastThreatStage = null;
    return;
  }

  const STAGE_TONE = { 潛伏: 1, 追蹤: 2, 貼近: 3, 接觸: 4 };
  const tone = STAGE_TONE[threat.stage] ?? 1;

  box.style.display = "flex";
  box.title = `${threat.name}：${threat.stage} — ${threat.summary ?? ""}`;
  label.textContent = threat.stage;
  label.className = `mission-metric-value threat-stage-label ${
    tone >= 4 ? "text-red-400" : tone === 3 ? "text-orange-300" : tone === 2 ? "text-yellow-300" : "text-emerald-300"
  }`;

  const threatLevel = Math.max(0, Math.min(7, Number(threat.level) || 0));
  pips.innerHTML = Array.from({ length: 7 }, (_, i) =>
    `<span class="threat-pip ${i < threatLevel ? `on-${tone}` : ""}" aria-hidden="true"></span>`
  ).join("");
  pips.setAttribute("aria-label", `迫近度 ${threatLevel}/7`);
  box.classList.toggle("pulse-glow", Boolean(threat.contact));

  if (threat.stage !== lastThreatStage && lastThreatStage !== null && threat.delta) {
    const worse = threat.delta > 0;
    appendFeedEvent(
      "world",
      `迫近度${worse ? "上升" : "下降"}至「${escapeHtml(threat.stage)}」`,
      `${escapeHtml(threat.name)}：${escapeHtml(threat.summary ?? "")}`,
      { tone: worse ? "bad" : "good" }
    );
  }
  lastThreatStage = threat.stage;
}

function setDecisionContext(text) {
  const el = document.getElementById("decision-context");
  if (el) el.textContent = text;
}

/**
 * V2 的行動出口：問題與方向提示由 server/reference 的 safe view 提供，
 * 不把 options 畫成必須點選的卡片。所有文字仍經 escapeHtml，避免任何敘事資料成為 HTML。
 */
function renderDmPrompt(dmPrompt, { visible = currentReferenceMode } = {}) {
  const panel = document.getElementById("dm-action-guidance");
  const hint = document.getElementById("dm-action-hint");
  const hints = document.getElementById("dm-action-hints");
  if (!panel || !hint || !hints) return;

  panel.hidden = !visible;
  if (!visible) {
    hints.innerHTML = "";
    return;
  }

  const data = dmPrompt && typeof dmPrompt === "object" ? dmPrompt : {};
  hint.textContent = typeof data.hint === "string" && data.hint.trim()
    ? data.hint.trim()
    : "可參考的行動方向如下；你也可以描述其他合理行動，提示不是限制。";
  const safeHints = Array.isArray(data.referenceHints)
    ? data.referenceHints.filter((value) => typeof value === "string" && value.trim()).slice(0, 3)
    : [];
  hints.innerHTML = safeHints.length
    ? `<span class="dm-hints-label">情境提示</span>${safeHints.map((value) => `<span class="dm-hint-pill">${escapeHtml(value.trim())}</span>`).join("")}`
    : "";
}

function renderOptions(options, { referenceMode = currentReferenceMode, dmPrompt = null } = {}) {
  const grid = document.getElementById("option-grid");
  const decisionKicker = document.getElementById("decision-kicker");
  const decisionTitle = document.getElementById("decision-title");
  const safeOptions = Array.isArray(options) ? options : [];
  currentReferenceMode = Boolean(referenceMode);
  if (currentReferenceMode) {
    currentOptions = [];
    if (grid) {
      grid.hidden = true;
      grid.innerHTML = "";
    }
    if (decisionKicker) decisionKicker.textContent = "行動方向";
    if (decisionTitle) decisionTitle.textContent = "可參考的情境線索";
    setDecisionContext("自由行動 · 不使用預設選項");
    renderDmPrompt(dmPrompt, { visible: true });
    return;
  }

  currentOptions = safeOptions;
  if (decisionKicker) decisionKicker.textContent = "下一步";
  if (decisionTitle) decisionTitle.textContent = "你現在要怎麼做？";
  if (grid) grid.hidden = false;
  renderDmPrompt(null, { visible: false });
  if (!safeOptions.length) {
    setDecisionContext("沒有預設方案 · 請描述自己的行動");
    grid.innerHTML = `<div class="decision-grid-empty">本回合沒有預設方案。你可以在下方描述自己的行動，說書人會根據當前局勢推導判定。</div>`;
    return;
  }

  const freeCount = safeOptions.filter((opt) => opt.requiresCheck === false).length;
  setDecisionContext(`${safeOptions.length} 個可行方案${freeCount ? ` · ${freeCount} 個無需檢定` : " · 選擇會改變局勢"}`);

  grid.innerHTML = safeOptions.map((opt, i) => {
    // 純敘事選項（requiresCheck === false，見 content/turnOptions.js）：沒有屬性、
    // 沒有技能、沒有DC，所以底下那一整行檢定資訊全部不畫——畫出來會是「null+null DCnull」。
    // 改成一個明確的「無需檢定」標籤：玩家有權在按下去之前就知道這一手不會擲骰。
    const isFreeAction = opt.requiresCheck === false;

    // 試算玩家目前的骰池(DP)，讓玩家點下去之前就知道自己大概有幾顆骰子可拼，
    // 而不是看著「屬性+技能」的組合名稱自己臆測。
    const attrVal = currentCharacter?.attributes?.[opt.attribute] ?? 1;
    const skillVal = opt.skill ? (currentCharacter?.skills?.[opt.skill] ?? 0) : null;
    const dp = attrVal + (skillVal ?? 0);

    let warningHtml = "";
    if (!isFreeAction && opt.skill && skillVal === 0) {
      const category = SKILL_CATEGORY[opt.skill];
      warningHtml = category === "心智"
        ? `<span class="decision-card-risk decision-card-risk-danger whitespace-nowrap">⚠ 自動失敗</span>`
        : `<span class="decision-card-risk whitespace-nowrap">⚠ 未受訓 ${category === "社交" ? "-2" : "-1"}成功</span>`;
    }

    // 引擎墊出來的保底選項標一個小標籤：它跟這一輪的敘事完全無關（見 content/turnOptions.js
    // 的 FALLBACK_OPTIONS），玩家有權知道自己按下去的是不是AI真的替這個場景想出來的行動。
    const isFallback = opt.source === "fallback";
    const fallbackTag = isFallback
      ? `<span class="decision-card-tag decision-card-tag-fallback" title="這個選項是引擎的通用保底選項，不是AI針對本回合劇情產生的">保底</span>`
      : "";

    // 套路懲罰預告（見 content/scenario/repetition.js）。玩家必須在**按下去之前**就看到
    // 「這是連續第3次用潛行，DC會+1」，這個標籤才有意義——按完才知道等於在罰他，不是在設計。
    const freeTag = isFreeAction
      ? `<span class="decision-card-tag decision-card-tag-free" title="這個行動不需要擲骰，不會失敗，但場景仍然會推進">無需檢定</span>`
      : "";

    const retreadTag = opt.retread
      ? `<span class="decision-card-tag decision-card-tag-retread" title="同一個「屬性＋技能」連續使用會愈來愈難。換個做法就會歸零。">${escapeHtml(opt.retread.label)}</span>`
      : "";
    const rawDc = opt.effectiveDc ?? opt.dc;
    const shownDc = Number.isFinite(Number(rawDc)) ? String(rawDc) : "待裁定";

    // hint（這個行動想達成什麼）刻意排在第二行、字級比骰池數字大：
    // 測玩回饋是「我就是看選項哪個數字高就按哪個」——那不是玩家的問題，是版面把
    // 唯一醒目的資訊做成了數字。現在最醒目的是「做這件事想得到什麼」，
    // 檢定組合與DP退到最後一行的灰字。
    const hintHtml = opt.hint
      ? `<span class="decision-card-hint">${escapeHtml(opt.hint)}</span>`
      : "";

    // 玩家先看行動意義，再看規則細節；這裡只負責把後端已算好的資訊分層呈現。
    const metaHtml = isFreeAction
      ? `<span class="decision-card-meta"><span class="decision-card-rule-primary"><i class="fas fa-comment-dots"></i>純敘事行動</span><span class="decision-card-rule-secondary">不擲骰 · 場景仍會推進</span></span>`
      : `<span class="decision-card-meta"><span class="decision-card-rule-primary"><i class="fas fa-dice-d20"></i>${escapeHtml(opt.attribute)}${opt.skill ? '+' + escapeHtml(opt.skill) : ''} · ${escapeHtml(opt.difficulty)} DC${escapeHtml(shownDc)}</span><span class="decision-card-rule-secondary">骰池 ${dp}</span>${warningHtml ? `<span class="decision-card-risk-wrap">${warningHtml}</span>` : ""}</span>`;

    const cardTone = isFallback ? "decision-card-fallback" : isFreeAction ? "decision-card-free" : "";

    return `
    <button onclick="selectOption(${i})" ${i < 9 ? `title="按數字鍵 ${i + 1} 也可以選這一項" aria-keyshortcuts="${i + 1}"` : ""} class="decision-card decision-card-enter ${cardTone}" style="animation-delay:${i * .06}s">
      <span class="decision-card-key">${i + 1}</span>
      <span class="decision-card-main">
        <span class="decision-card-head">
          <span class="decision-card-label">${escapeHtml(opt.label)}</span>
          <span class="decision-card-tags">
            ${freeTag}
            ${fallbackTag}
            ${retreadTag}
          </span>
        </span>
        ${hintHtml || `<span class="decision-card-hint">描述這個行動可能帶來的改變</span>`}
        ${metaHtml}
      </span>
    </button>`;
  }).join("");
}

function selectOption(index) {
  const opt = currentOptions[index];
  // pressedIndex 讓 setTurnInputLocked() 知道要把哪一顆標成「已按下」——
  // 送出之後選項還留在畫面上，沒有這個標記，玩家會忘記自己按的是哪一個。
  if (opt) runTurn({ chosenOption: opt, pressedIndex: index });
}

// 幾何 d20 擲骰結算動畫：純視覺呈現既有 checkResult 數據，不影響骰值計算
function playDiceRollAnimation(checkResult) {
  const overlay = document.getElementById("dice-roll-overlay");
  const d20 = document.getElementById("dice-d20");
  const numEl = document.getElementById("dice-d20-number");
  if (!overlay || !d20 || !numEl) return Promise.resolve();

  return new Promise(resolve => {
    numEl.textContent = "";
    d20.classList.remove("d20-spin", "d20-settle");
    void d20.offsetWidth; // 強制重排以重新觸發動畫
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
    d20.classList.add("d20-spin");

    setTimeout(() => {
      numEl.textContent = String(checkResult.totalSuccesses ?? "—");
      d20.classList.remove("d20-spin");
      d20.classList.add("d20-settle");
    }, 820);

    setTimeout(() => {
      overlay.classList.add("hidden");
      overlay.classList.remove("flex");
      resolve();
    }, 1500);
  });
}

// ---------------------------------------------------------------------------
// 畫面內通知（toast）
//
// [2026-08-18] 取代三處原生的 alert()（讀檔失敗 ×2、刪檔失敗 ×1）。
// alert() 有兩個實際的問題，不只是好不好看：它會**卡住整個 JS 執行緒**
// （後面的重試、狀態更新全部要等玩家按掉），而且在已安裝的 PWA 裡跳出來的
// 系統對話框看起來就像網頁當掉了。
//
// 錯誤類的通知不自動消失——玩家可能正在看別的地方，錯過了就再也不知道發生什麼事；
// 訊息類的會自己收掉。兩種都可以手動關。
// ---------------------------------------------------------------------------

const TOAST_STYLES = {
  error: { box: "border-red-500/40 bg-red-500/10 text-red-200", icon: "fa-circle-exclamation", role: "alert" },
  warn: { box: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200", icon: "fa-triangle-exclamation", role: "status" },
  info: { box: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200", icon: "fa-circle-info", role: "status" },
};

/**
 * @param {string} message 要顯示的文字（純文字，會被跳脫）
 * @param {object} [options]
 * @param {"error"|"warn"|"info"} [options.kind] 預設 error
 * @param {number|null} [options.timeout] 幾毫秒後自動收掉。null＝不自動收（錯誤的預設）
 */
function showToast(message, { kind = "error", timeout } = {}) {
  const tray = document.getElementById("toast-tray");
  if (!tray) {
    console.warn("[TOAST] 找不到 #toast-tray，改用 console 輸出：", message);
    return;
  }
  const style = TOAST_STYLES[kind] ?? TOAST_STYLES.error;
  const autoHide = timeout === undefined ? (kind === "error" ? null : 4000) : timeout;

  const el = document.createElement("div");
  el.className =
    `pointer-events-auto feed-block-enter flex items-start gap-2.5 rounded border p-3 ` +
    `font-mono text-xs leading-relaxed shadow-lg backdrop-blur ${style.box}`;
  el.setAttribute("role", style.role);
  el.innerHTML =
    `<i class="fas ${style.icon} mt-0.5 shrink-0"></i>` +
    `<span class="flex-1 whitespace-pre-line">${escapeHtml(message)}</span>` +
    `<button type="button" aria-label="關閉這則通知" class="shrink-0 px-1 opacity-70 hover:opacity-100 transition-opacity">` +
    `<i class="fas fa-times"></i></button>`;

  const dismiss = () => {
    clearTimeout(timer);
    el.remove();
  };
  el.querySelector("button").addEventListener("click", dismiss);
  const timer = autoHide == null ? null : setTimeout(dismiss, autoHide);

  tray.appendChild(el);
  // 疊太多會蓋掉畫面，只留最近的三則。
  while (tray.children.length > 3) tray.firstElementChild.remove();
}

/**
 * 事件時間線的視覺語法（審查報告 §3.5）。
 *
 * 在這之前，故事流的每一個呼叫點都自己手寫一串 Tailwind class，於是同一種事情
 * 在不同地方有時有框有時沒框、padding 有三種、字級有三種。玩家沒辦法在餘光裡
 * 分辨「剛跳出來那一塊是判定、是世界變化、還是連線出錯」，只能逐段讀完。
 *
 * 現在事件種類是唯一要傳的樣式資訊，顏色與排版由 CSS 依種類決定
 * （見 index.html 的「事件時間線的視覺語法」）。要新增一種事件就在這裡加一行，
 * 而不是在呼叫點再拼一次 class 字串。
 *
 * tone 只在同一種事件內部微調，不會換成別的顏色系：
 *   good → 這件事對玩家有利（判定成功、迫近度下降）
 *   bad  → 不利（判定失敗、迫近度上升）
 */
const FEED_EVENT_KICKERS = {
  action: "你的行動",
  check: "命運判定",
  narration: "說書人",
  world: "世界改變了",
  ledger: "主神帳本",
  arcane: "主神系統",
  harm: "身體狀態",
  respite: "喘息",
  fault: "訊號中斷",
};

/**
 * 事件區塊上那顆「再試一次」的按鈕。
 *
 * [2026-08-27 修正] 重試按鈕以前是在 appendFeedEvent() 回傳的 DOM 上用
 * insertAdjacentHTML() 額外插進去的，**沒有寫回 recentStoryEntries**。
 * 但故事流每次重畫都是從 recentStoryEntries 重建整份 DOM，於是那顆按鈕的壽命是零：
 * runTurn() 的 finally 裡就有一次 hideNarratorPending() → renderRecentStoryWindow()，
 * 按鈕在玩家看到它之前就已經被抹掉了。回合失敗時畫面上只剩一行「這一回合沒有完成」，
 * 沒有任何辦法重試——而伺服器那邊其實保存著 pendingTurn，重試是不會重骰的。
 * 現在重試是事件資料的一部分（entry.opts.retry），重畫幾次都還在。
 */
const FEED_RETRY_LABELS = Object.freeze({
  turn: "重試這一回合",
  travel: "重試這次移動",
});

function feedEventInnerHtml(kind, label, content, opts = {}) {
  const retryLabel = FEED_RETRY_LABELS[opts.retry];
  const retryHtml = retryLabel
    ? `<div class="feed-event-actions"><button type="button" data-feed-retry="${escapeHtml(opts.retry)}" class="feed-event-retry">${escapeHtml(retryLabel)}</button></div>`
    : "";
  return `<span class="feed-event-rail" aria-hidden="true"></span>` +
    `<div class="feed-event-body">` +
      `<div class="feed-event-head">` +
        `<span class="feed-event-kicker">${FEED_EVENT_KICKERS[kind] ?? "事件"}</span>` +
        (label ? `<span class="feed-event-label">${label}</span>` : "") +
      `</div>` +
      (content ? `<div class="feed-event-content">${content}</div>` : "") +
      (opts.note ? `<div class="feed-event-note">${opts.note}</div>` : "") +
      retryHtml +
    `</div>`;
}

/** 把一則事件的內容寫進既有的區塊。animate=false 是「這是同一則的更新」，不重播進場動畫。 */
function applyFeedEvent(block, kind, label, content, opts = {}, { animate = false } = {}) {
  block.dataset.feedKind = kind;
  const tone = opts.tone === "good" ? " is-good" : opts.tone === "bad" ? " is-bad" : "";
  const enter = animate ? "feed-block-enter " : "";
  block.className = `${enter}feed-event feed-event-${kind}${tone}`;
  block.innerHTML = feedEventInnerHtml(kind, label, content, opts);
}

/**
 * @param {string} kind  FEED_EVENT_KICKERS 的其中一個鍵
 * @param {string} label 這一則事件的一句話標題（已經是安全的 HTML）
 * @param {string} content 內文（已經是安全的 HTML）
 * @param {{tone?: "good"|"bad", note?: string, animate?: boolean, retry?: "turn"|"travel"}} [opts]
 * @returns {HTMLElement} 建好的區塊
 */
function buildFeedEvent(kind, label, content, opts = {}) {
  const block = document.createElement("article");
  block.dataset.feedEntry = "true";
  // 日誌是一次畫出整份清單的，二十則同時播進場動畫只會變成一片閃爍；
  // 故事流則是一次追加一則，動畫正是「有新東西進來了」的訊號。
  applyFeedEvent(block, kind, label, content, opts, { animate: opts.animate !== false });
  return block;
}

// 主畫面只保留最近五則「現場訊息」。完整劇情由 session.chronicle 保存，並在玩家
// 開啟劇情回顧時按需讀取；這裡不再把整份故事建成 DOM，也不再依賴 DOM 反推目前敘事。
const RECENT_STORY_LIMIT = 5;
let recentStoryEntries = [];
let pendingStoryEntry = null;
let activeNarrationStream = null;
let storyEntrySequence = 0;
let recentStoryChronicleTotal = 0;

function updateRecentStoryHistoryHint(current = document.getElementById("recent-story-list")) {
  const hint = current?.querySelector("[data-chronicle-hint]");
  if (!hint || !current) return;
  const atTop = current.scrollTop <= 18;
  hint.classList.toggle("is-visible", atTop);
  hint.setAttribute("aria-hidden", String(!atTop));
}

/**
 * 已經畫在畫面上的區塊：entry.id → { node, signature }。
 *
 * [2026-08-27 效能／閃爍修正] 這個視窗以前每次重畫都是一次 replaceChildren，
 * 也就是把五則全部丟掉、全部重建。問題在於 `.feed-block-enter` 是一段 0.35 秒的進場動畫：
 * 節點一重建，五則就全部從頭再播一次。而串流敘事是每 18 個字送一次 delta
 * （見 functions/api/turn.js 的 chunkByCodePoints(payload.narration, 18)，間隔 12ms），
 * 一段 900 字的敘事就是 50 次全視窗重建 → 玩家看到的是整片持續閃爍，
 * 而且每次重建都要把累積到目前為止的整段文字重新跑一次 renderNarrationHtml()，
 * 成本是 O(字數²)。
 *
 * 現在改成對照 id 做增量更新：新的才建、變了的只改自己那一則的內容、
 * 位置沒動的完全不碰。順帶讓 clearPreviousFinalQuestions() 真的有效——
 * 它清掉的 class 以前會在下一次重建時從 entry.content 原封不動長回來。
 */
const renderedStoryBlocks = new Map();

function storyEntrySignature(entry) {
  const opts = entry.opts ?? {};
  return [entry.kind, entry.label, entry.content, opts.tone ?? "", opts.note ?? "", opts.retry ?? ""].join("\u0000");
}

/** index.html 裡那句「等待第一段故事回應……」。被清掉過就重新建一個一樣的。 */
let storyEmptyPlaceholderNode = null;
function storyEmptyPlaceholder(current) {
  if (!storyEmptyPlaceholderNode) {
    storyEmptyPlaceholderNode = current.querySelector(".story-current-empty");
  }
  if (!storyEmptyPlaceholderNode) {
    storyEmptyPlaceholderNode = document.createElement("div");
    storyEmptyPlaceholderNode.className = "story-current-empty";
    storyEmptyPlaceholderNode.textContent = "等待第一段故事回應……";
  }
  return storyEmptyPlaceholderNode;
}

function buildChronicleHintButton() {
  const hint = document.createElement("button");
  hint.type = "button";
  hint.className = "story-chronicle-hint";
  hint.dataset.chronicleHint = "true";
  hint.setAttribute("aria-hidden", "true");
  hint.innerHTML = `<i class="fas fa-book-open" aria-hidden="true"></i><span>已到最近五則的起點・更早的故事請看劇情回顧</span><i class="fas fa-arrow-up" aria-hidden="true"></i>`;
  hint.addEventListener("click", () => openChronicle());
  return hint;
}

/** 故事流上的按鈕一律用委派：區塊會被就地改寫，逐顆綁定會在改寫後失效。 */
function bindRecentStoryDelegates(current) {
  if (current.dataset.storyDelegatesBound) return;
  current.addEventListener("scroll", () => updateRecentStoryHistoryHint(current), { passive: true });
  current.addEventListener("click", (event) => {
    const button = event.target.closest("[data-feed-retry]");
    if (!button) return;
    const kind = button.getAttribute("data-feed-retry");
    const id = button.closest("[data-recent-story-id]")?.dataset.recentStoryId;
    if (id) {
      recentStoryEntries = recentStoryEntries.filter((entry) => entry.id !== id);
      renderRecentStoryWindow({ forceBottom: true });
    }
    if (kind === "travel") {
      const pending = lastTravelRequest;
      if (pending) travelToLocation(pending.destinationId, pending.requestId);
    } else if (kind === "turn" && lastTurnRequest) {
      runTurn({ ...lastTurnRequest, retryPending: true });
    }
  });
  current.dataset.storyDelegatesBound = "true";
}

function renderRecentStoryWindow({ forceBottom = false } = {}) {
  const current = document.getElementById("recent-story-list");
  if (!current) return;

  bindRecentStoryDelegates(current);

  const wasNearBottom = current.scrollHeight - current.clientHeight - current.scrollTop <= 28;
  const entries = [...recentStoryEntries.slice(-RECENT_STORY_LIMIT)];
  if (pendingStoryEntry) entries.push(pendingStoryEntry);

  const desired = [];
  if (recentStoryChronicleTotal > RECENT_STORY_LIMIT) {
    desired.push(current.querySelector("[data-chronicle-hint]") ?? buildChronicleHintButton());
  }

  for (const entry of entries) {
    const isPending = entry.id === pendingStoryEntry?.id;
    const signature = storyEntrySignature(entry);
    let record = renderedStoryBlocks.get(entry.id);
    if (!record) {
      const node = buildFeedEvent(entry.kind, entry.label, entry.content, entry.opts);
      node.dataset.recentStoryId = entry.id;
      record = { node, signature };
      renderedStoryBlocks.set(entry.id, record);
    } else if (record.signature !== signature) {
      applyFeedEvent(record.node, entry.kind, entry.label, entry.content, entry.opts, { animate: false });
      record.signature = signature;
    }
    record.node.classList.toggle("pending-sweep", isPending);
    record.node.classList.toggle("is-pending", isPending);
    if (isPending) record.node.id = "narrator-pending";
    else record.node.removeAttribute("id");
    desired.push(record.node);
  }

  // 還沒有任何一則的時候留住 index.html 裡那句佔位文字。
  // 舊版的 replaceChildren() 在 DOMContentLoaded 那一次就把它清掉了，於是開局到第一段
  // 敘事回來之間，故事區是完全空白的一塊——那跟「畫面壞了」長得一模一樣。
  if (!desired.length) {
    desired.push(storyEmptyPlaceholder(current));
  }

  // 只動真的需要動的節點：先移掉不該在的，再把位置不對的搬過去。
  // 一次換掉全部子節點會讓每一則都重新插入 DOM，動畫與捲動位置一起被重設。
  // 用 childNodes 而不是 children：標記裡的換行會留下文字節點，只掃元素的話清不掉。
  const keep = new Set(desired);
  for (const child of [...current.childNodes]) {
    if (!keep.has(child)) child.remove();
  }
  let cursor = current.firstChild;
  for (const node of desired) {
    if (cursor === node) {
      cursor = cursor.nextSibling;
      continue;
    }
    current.insertBefore(node, cursor);
  }
  for (const [id, record] of renderedStoryBlocks) {
    if (!keep.has(record.node)) renderedStoryBlocks.delete(id);
  }

  updateRecentStoryHistoryHint(current);

  const count = document.getElementById("story-current-count");
  if (count) count.textContent = `${Math.min(recentStoryEntries.length, RECENT_STORY_LIMIT)} / ${RECENT_STORY_LIMIT}`;

  if (forceBottom || wasNearBottom) {
    requestAnimationFrame(() => { current.scrollTop = current.scrollHeight; });
  }
}

function resetStoryFeedReadingState() {
  // 舊版的閱讀鎖定只服務完整 story-feed；最近五則沒有高頻 filter/lock 狀態。
  // 保留函式名稱讓舊存檔／外部 debug 呼叫不會丟錯。
  return undefined;
}

function updateStoryFeedCount() {
  const count = document.getElementById("story-current-count");
  if (count) count.textContent = `${Math.min(recentStoryEntries.length, RECENT_STORY_LIMIT)} / ${RECENT_STORY_LIMIT}`;
}

function updateStoryFeedView() {
  // 相容 no-op：完整故事流已移出主畫面，任何舊呼叫都不再掃描大量 DOM。
  renderRecentStoryWindow();
}

function updateStoryFeedLatestButton() {
  // 相容 no-op：最近五則不存在「跳到完整 feed 最新位置」按鈕。
}

function setStoryFeedFilter() {
  // 相容 no-op：主畫面不再提供事件／敘事篩選，完整內容改由劇情回顧頁呈現。
}

function syncCurrentStoryFromFeed() {
  renderRecentStoryWindow();
}

function appendFeedEvent(kind, label, content, opts = {}) {
  const current = document.getElementById("recent-story-list");
  if (!current) return null;
  const entry = {
    id: `recent-story-${++storyEntrySequence}`,
    kind,
    label,
    content,
    opts: { ...opts },
  };
  const wasNearBottom = current.scrollHeight - current.clientHeight - current.scrollTop <= 28;
  recentStoryEntries = [...recentStoryEntries, entry].slice(-RECENT_STORY_LIMIT);
  renderRecentStoryWindow({ forceBottom: wasNearBottom });
  return current.querySelector(`[data-recent-story-id="${entry.id}"]`);
}

function hydrateRecentStoryFromChronicle(chronicle = [], { total = null } = {}) {
  recentStoryEntries = [];
  pendingStoryEntry = null;
  const turns = Array.isArray(chronicle) ? chronicle : [];
  recentStoryChronicleTotal = Number.isFinite(Number(total)) ? Number(total) : turns.length;
  for (const entry of turns.slice(-RECENT_STORY_LIMIT)) {
    if (entry?.action) appendFeedEvent("action", "", escapeHtml(entry.action), { animate: false });
    if (entry?.narration) appendNarrationBlock(entry.narration, { animate: false });
  }
  renderRecentStoryWindow({ forceBottom: true });
}

function scrollFeedToBottom() {
  const current = document.getElementById("recent-story-list");
  if (!current) return;
  requestAnimationFrame(() => { current.scrollTop = current.scrollHeight; });
}

// ---------------------------------------------------------------------------
// 休息
//
// 哪一種休息、恢復多少、要不要扣時間預算，全部由 POST /api/rest 依地點決定
// （主神空間完全恢復；副本中打坐並消耗3回合）。前端一如往常什麼都不算——
// 這是本專案第4條最高原則對前端的同一條要求。
// ---------------------------------------------------------------------------

let restBusy = false;

async function doRest() {
  if (!currentSessionId || restBusy) return;
  if (currentCombat?.active) {
    appendFeedEvent("respite", "沒辦法休息", "戰鬥中不能休息。");
    return;
  }
  restBusy = true;
  const btn = document.getElementById("rest-btn");
  if (btn) btn.disabled = true;
  try {
    const res = await (await fetch("/api/rest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId }),
    })).json();

    if (!res.ok) {
      const why = (res.blockers ?? []).map((b) => b.message).join("；") || res.error || "未知原因";
      appendFeedEvent("respite", "休息不成", escapeHtml(why));
      return;
    }
    appendFeedEvent(
      "respite",
      res.location === "主神空間" ? "在主神空間休息" : "在副本中打坐",
      escapeHtml(res.summary)
    );
    if (res.timeBudget) {
      appendFeedEvent(
        "world",
        "時間預算",
        `已用 <span class="fe-num">${res.timeBudget.spentRounds}</span>/<span class="fe-num">${res.timeBudget.totalRounds}</span> 回合（${escapeHtml(res.timeBudget.status)}）`
      );
    }
    // 恢復會改角色卡的生命、意志力與能量池，側邊欄要跟著更新
    if (res.character) adoptCharacter(res.character);
    refreshJournalIfOpen();
  } catch (err) {
    appendFeedEvent("fault", "休息請求失敗", escapeHtml(err.message));
  } finally {
    restBusy = false;
    if (btn) btn.disabled = false;
  }
}

/**
 * 把任意文字變成可以安全塞進 HTML 的字串。
 *
 * [2026-08-27 修正] 引號原本沒有被跳脫，但這個函式有超過二十個呼叫點是寫在
 * **屬性值**裡的（`title="${escapeHtml(...)}"`、`aria-label="..."`、`data-npc-id="..."`
 * 等等），只要來源文字帶一個雙引號就能提前關掉屬性、把後面的內容變成新的屬性——
 * 那不是「顯示怪怪的」，那是 HTML 注入。副本文案、AI 敘事、NPC 名稱都會走到這裡，
 * 沒有一個是我們能保證不含引號的。
 * 同一份檔案裡的 index.html 早就有一個會跳脫引號的 escapeAttr()，這裡補齊到同一個標準，
 * 之後兩邊行為一致，不用再記「哪個地方要用哪一個」。
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 僅將故事最後一句 DM 提問標記為翡翠綠引導條 + 粗體白字
// ---------------------------------------------------------------------------
// 敘事排版
//
// [2026-08-18] 使用者回報（逐字）：「除了最開始固定的故事開頭之外，後續的AI回覆
// 都沒有長短段落交錯，全部都擠在一團，看起來很難閱讀」。
//
// 真正的修法在提示詞那一層（content/narrativeStyle.js 的 PACING_RULES 現在有一節
// 【分段與換行】），因為只有模型知道哪裡該斷。但那是「請模型配合」，不是保證——
// 便宜或小的模型常常整段吐回來一坨字，而玩家換模型是這個專案的核心功能之一。
// 所以這裡再補一層前端的保險：模型有分段就完全照它的分段，一行都不動；
// 真的一個換行都沒有回，才由前端按句子把它切開。切開的品質一定不如模型自己分的，
// 但「還算能讀」永遠好過「一整團」。
// ---------------------------------------------------------------------------

/** 短於這個長度就不自動切——三兩句話本來就該是一段。 */
const AUTO_PARAGRAPH_MIN_LENGTH = 150;

/**
 * 自動分段時，每一段至少要累積到幾個字才收尾。
 * 兩個值輪流用，切出來才會是「長段、短段、長段、短段」的節奏，
 * 而不是一排長度一模一樣的方塊——後者讀起來跟一整團字沒有差多少。
 */
const AUTO_PARAGRAPH_LENGTHS = [110, 55];

/** 把一段沒有任何換行的長文字按句子切成長短交錯的段落。 */
function autoParagraphs(text) {
  if (text.length < AUTO_PARAGRAPH_MIN_LENGTH) return [text];

  // 句尾標點後面可能還跟著收尾的引號括號，要一起帶走，不然「」會被切到下一段開頭。
  const sentences = text.match(/[^。！？!?…]*[。！？!?…]+[」』）)"']*|[^。！？!?…]+$/g);
  if (!sentences || sentences.length < 2) return [text];

  const paragraphs = [];
  let current = "";
  let turn = 0;
  for (const sentence of sentences) {
    current += sentence;
    if (current.length >= AUTO_PARAGRAPH_LENGTHS[turn % AUTO_PARAGRAPH_LENGTHS.length]) {
      paragraphs.push(current.trim());
      current = "";
      turn++;
    }
  }
  // 收尾不足一段的殘句併回前一段，避免最後留下一句孤零零的碎片。
  if (current.trim()) {
    if (paragraphs.length > 0 && current.trim().length < 18) paragraphs[paragraphs.length - 1] += current.trim();
    else paragraphs.push(current.trim());
  }
  return paragraphs.length > 0 ? paragraphs : [text];
}

/** 敘事切成段落：模型有分段就照它的，沒有才自己切。 */
function splitNarrationParagraphs(text) {
  const byBlankLine = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;

  // 只用單換行分段的模型也不少，一樣算它有分段。
  const byLine = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;

  return autoParagraphs(text);
}

/**
 * 把最後一段裡「丟回給玩家的那個問句」拆出來單獨標示。
 * @returns {{ body: string, question: string } | null} 不是以問句收尾就回傳 null
 */
function splitTrailingQuestion(paragraph) {
  const lastQ = Math.max(paragraph.lastIndexOf("？"), paragraph.lastIndexOf("?"));
  if (lastQ === -1) return null;
  if (paragraph.slice(lastQ + 1).trim().length > 2) return null; // 問號不在結尾，不是收束句

  let start = 0;
  for (const punct of ["。", "！", "!"]) {
    const idx = paragraph.lastIndexOf(punct, lastQ - 1);
    if (idx + 1 > start) start = idx + 1;
  }
  return { body: paragraph.slice(0, start).trim(), question: paragraph.slice(start, lastQ + 1).trim() };
}

function renderNarrationHtml(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";

  const paragraphs = splitNarrationParagraphs(trimmed);
  const last = paragraphs[paragraphs.length - 1];
  const tail = splitTrailingQuestion(last);

  const blocks = paragraphs.slice(0, -1).map((para) => `<p class="feed-para">${escapeHtml(para)}</p>`);
  if (!tail) {
    blocks.push(`<p class="feed-para">${escapeHtml(last)}</p>`);
    return blocks.join("");
  }

  if (tail.body) blocks.push(`<p class="feed-para">${escapeHtml(tail.body)}</p>`);
  blocks.push(`<div class="feed-final-question"><strong>${escapeHtml(tail.question)}</strong></div>`);
  return blocks.join("");
}

// 新提問出現後，卸除故事流中先前的引導條高亮（僅保留最新一則）
function clearPreviousFinalQuestions() {
  document.querySelectorAll("#recent-story-list .feed-final-question").forEach(el => {
    el.classList.remove("feed-final-question");
  });
}

function appendNarrationBlock(text, opts = {}) {
  clearPreviousFinalQuestions();
  appendFeedEvent("narration", "", renderNarrationHtml(text), opts);
}

// --- 首頁輪迴者檔案 ---
async function checkLocalSession() {
  const savedId = localStorage.getItem(SESSION_KEY);
  const box = document.getElementById("portal-resume-box");
  const accountNote = document.getElementById("resume-account-note");
  const accountText = document.getElementById("resume-account-text");

  // 登入的人先問帳號：輪迴者檔案綁在帳號上，localStorage 只是「這台瀏覽器上次接續哪一名角色」。
  // 換一台電腦、清過瀏覽器資料的玩家，localStorage 是空的但帳號裡的角色檔案還在，
  // 這時候仍然要讓他在首頁直接看得到、點得到——那正是登入的意義。
  if (currentUser) await refreshSessionList();

  const fallback = currentUser
    ? mySessions.find((session) => session.scenarioId !== RETIRED_SCENARIO_ID)
    : null; // 清單已依最近更新排序
  const targetId = savedId || fallback?.id;
  if (!targetId) {
    if (box) box.style.display = "none";
    return;
  }

  try {
    const res = await (await fetch(`/api/session?id=${encodeURIComponent(targetId)}`)).json();
    if (res.ok && res.session) {
      resumeTargetId = targetId;
      if (box) box.style.display = "block";
      // 有效的輪迴者檔案已被主神選中；這是接續目前角色，不是回溯副本進度。
      revealMainGodSpace("resume");
      document.getElementById("resume-char-name").textContent =
        res.session.character?.concept?.name || "未命名輪迴者";

      // 檔案不是持久的時候，「接續目前輪迴」這個框本身就是最該講這件事的地方——
      // 玩家正要按下去的按鈕，很可能指向一份已經蒸發的角色檔案。
      const note = document.getElementById("resume-persistence-note");
      if (note) note.style.display = res.persistent ? "none" : "block";

      // 帳號裡還有別名輪迴者時講一聲，並指路到輪迴者檔案——否則玩家只會看到最新的一名，
      // 以為其他角色都不見了。
      if (accountNote && accountText) {
        if (currentUser && mySessions.length > 1) {
          accountText.textContent = `這個帳號底下還有 ${mySessions.length - 1} 名其他輪迴者，可到「輪迴者檔案」切換。`;
          accountNote.style.display = "block";
        } else if (currentUser && res.persistent) {
          accountText.textContent = "已綁定你的 Google 帳號，換裝置登入就找得回來。";
          accountNote.style.display = "block";
        } else {
          accountNote.style.display = "none";
        }
      }
    } else {
      if (res.retiredScenario || res.scenarioId === RETIRED_SCENARIO_ID) {
        if (localStorage.getItem(SESSION_KEY) === targetId) localStorage.removeItem(SESSION_KEY);
        resumeTargetId = null;
        console.warn("[RETIRED_SCENARIO]", res.error);
      } else {
        // 角色檔案查不到不是壞事（可能只是舊 ID），但也不該完全靜音——留給 F12 看得到。
        console.warn("[SESSION_LOOKUP] 記著的存檔ID讀不到：", targetId, res.error);
      }
      if (box) box.style.display = "none";
    }
  } catch (err) {
    console.warn("[SESSION_LOOKUP] 查詢存檔時連線失敗", err);
  }
}

/** 首頁「接續目前輪迴」實際要讀的那一份（可能來自帳號清單，不一定是 localStorage 那個）。 */
let resumeTargetId = null;

/**
 * 顯示／隱藏「存檔不是持久的」警告條。
 *
 * [2026-08-16 修正] content/storage/sessionStore.js 的 memorySessionStore 註解、
 * functions/api/session.js 的檔頭、wrangler.toml 三個地方都白紙黑字寫著
 * 「呼叫端必須把 persistent:false 顯示給使用者看，不能假裝存檔成功了」，
 * 但在此之前 `persistent` 這個字在整個 public/ 底下一次都沒有出現過。
 * 沒有設定 KV binding 時，玩家的存檔隨時會歸零，而且完全沒有警示。
 */
function renderPersistenceWarning(persistent) {
  const bar = document.getElementById("persistence-warning");
  if (!bar) return;
  if (persistent === false) {
    bar.style.display = "flex";
    console.warn("[STORAGE] 存檔目前只存在記憶體裡(persistent:false)，隨時可能消失。請設定 KV binding，見 DEPLOYMENT.md。");
  } else if (persistent === true) {
    bar.style.display = "none";
  }
  renderSaveStatus(persistent);
}

/**
 * 遊戲畫面右上角的存檔狀態徽章。
 *
 * [2026-08-16 修正] 這顆徽章原本是寫死在 HTML 裡的「已存檔」三個字——不管有沒有存檔、
 * 有沒有設定 KV、這一回合有沒有寫回去，它永遠都說已存檔。那比沒有這顆徽章更糟：
 * 它是一個看起來像狀態、實際上是裝飾的東西，而玩家會相信它。
 * 現在它真的反映三種狀態，並在剛寫回存檔時閃一下，讓玩家知道剛才那一回合有被記下來。
 */
function renderSaveStatus(persistent) {
  const el = document.getElementById("save-status");
  if (!el) return;

  let text = "未存檔";
  let cls = "text-zinc-400";
  if (currentSessionId && persistent === false) {
    text = "記憶體暫存";
    cls = "text-yellow-300";
  } else if (currentSessionId) {
    text = currentUser ? "已存檔 · 已綁定帳號" : "已存檔";
    cls = "text-emerald-300";
  }

  const changed = el.dataset.saveState !== text;
  el.dataset.saveState = text;
  el.textContent = text;
  el.className = `px-2 py-0.5 rounded bg-panel border hairline-border ${cls}`;
  el.title = currentUser
    ? "輪迴者檔案已綁定你的 Google 帳號，換裝置登入後可以在「輪迴者檔案」裡找到。"
    : "輪迴者檔案目前只跟這台瀏覽器綁在一起。登入 Google 之後才會綁到帳號。";
  if (changed) flashElement(el);
}

async function resumeLocalSession() {
  const savedId = resumeTargetId || localStorage.getItem(SESSION_KEY);
  if (!savedId) return;
  // [2026-08-16 修正] 這裡以前是 `if (savedId) await resumeSession(savedId)`；此處只接續目前角色，不能重玩已走過的副本。
  // 而 resumeSession() 內部用 `catch { return false }` 吞掉一切錯誤、呼叫端又不看回傳值。
  // 玩家按下「接續目前輪迴」之後畫面完全不動，也沒有任何訊息，只能自己猜是不是壞了。
  try {
    await resumeSession(savedId);
  } catch (err) {
    console.error("[RESUME_FAILURE]", err);
    showToast(
      `讀取輪迴者檔案失敗：${err.message}\n檔案 ID：${savedId}\n（如果這份檔案是在沒有 KV 設定的環境下建立的，它可能已經消失了。）`
    );
  }
}

async function resumeSession(id) {
  const res = await (await fetch(`/api/session?id=${encodeURIComponent(id)}&view=runtime`)).json();
  if (!res.ok) {
    if (res.retiredScenario || res.scenarioId === RETIRED_SCENARIO_ID) {
      if (localStorage.getItem(SESSION_KEY) === id) localStorage.removeItem(SESSION_KEY);
      resumeTargetId = null;
    }
    throw new Error(res.error || "讀取輪迴者檔案失敗");
  }

  currentSessionId = id;
  lastTravelRequest = null;
  resetScenarioNoticeDedup(currentSessionId);
  localStorage.setItem(SESSION_KEY, id);
  // 已結算存檔直接進 server-owned 主神空間；不要先進 game screen 再由前端猜 runSummary。
  if (res.lifecycle?.canEnterGodspace) {
    lastThreatStage = null;
    adoptCharacter(res.session.character);
    renderPersistenceWarning(res.persistent);
    currentCombat = null;
    await loadGodspace(id, { reveal: true });
    return true;
  }
  // 換一份存檔＝換一條迫近度軌，上一場的階段不能留著，否則第一次更新會誤報一次「階段變化」。
  lastThreatStage = null;
  adoptCharacter(res.session.character);
  showScreen("game");
  renderPersistenceWarning(res.persistent);

  resetStoryFeedReadingState();
  hydrateRecentStoryFromChronicle(
    res.session.recentChronicle ?? res.session.chronicle ?? res.session.history ?? [],
    { total: res.session.recentChronicleTotal }
  );

  renderOptions(res.session.scene?.options || [], {
    referenceMode: Boolean(res.scenario?.reference?.enabled),
    dmPrompt: res.scenario?.reference?.dmPrompt,
  });
  // [2026-08-20 修正] 副本 HUD（當前目標／簡介／主線進度／迫近度／時間預算）也要在
  // 讀取存檔時就畫出來。先前這一份只有 /api/turn 的回應才有，於是重整頁面接續遊戲的人
  // 會看到一條空的頂欄，一直到他再送出一個回合為止——那正是最需要「我現在要幹嘛」的時刻。
  if (res.scenario) {
    updateScenarioHud(res.scenario);
    if (res.scenario.runSummary) showScenarioSettlement({ runSummary: res.scenario.runSummary });
  }
  renderDownState(res.downState, res.revival);

  // [2026-08-16 修正] 還原「重整頁面時人在戰鬥中」的狀態。
  //
  // 舊行為：這裡只還原故事流與選項，完全不看 session.combat。可是存檔裡那場戰鬥的
  // active 仍然是 true，於是玩家重整之後戰鬥面板消失、再按「遭遇戰鬥」永遠拿到
  // 409「已經有進行中的戰鬥」——那個節點如果是最終戰，這張存檔的主線就再也推不完了。
  // 戰鬥狀態本來就完整存在 session.combat 裡，只是沒有人把它讀回來。
  if (res.session.combat?.active) {
    currentCombat = res.session.combat;
    // 續戰的行動列由伺服器算好一起送來(2026-08-17 第九輪)。先前這裡是 null，
    // 於是重整之後只剩 index.html 裡寫死的兩顆按鈕——買到的武器與型態全部按不到。
    currentCombatOptions = res.combatOptions ?? null;
    enterCombatView();
    document.getElementById("combat-log").innerHTML = "";
    (currentCombat.log || []).forEach((entry) => appendCombatLog({
      actor: entry.actor,
      weaponKey: entry.weaponKey,
      hit: entry.hit,
      damage: entry.damage ?? 0,
      damageSeverity: entry.damageSeverity,
      damageSeverityTag: entry.damageSeverityTag,
    }));
    appendCombatSystemLine("已還原重整前進行中的戰鬥。", "text-zinc-400");
    renderCombat();
  } else if (res.session.pendingTurn) {
    const pending = res.session.pendingTurn;
    appendFeedEvent(
      "world",
      "上一回合尚未完成",
      "伺服器已保存上一回合的判定；系統會自動接續敘事，不會重新擲骰或重複扣除規則效果。請等待這次接續完成。",
      { tone: "neutral" }
    );
    await runTurn({
      chosenOption: pending.chosenOption ?? undefined,
      playerAction: pending.playerAction ?? undefined,
      opening: Boolean(pending.opening),
      retryPending: true,
      turnRequestId: pending.requestId ?? undefined,
    });
  } else if (!(res.session.scene?.options || []).length) {
    await runTurn({ opening: true });
  }
  return true;
}

// --- 戰鬥（單敵人 MVP，見 content/combat/encounterState.js） ---
let currentCombat = null;
// 這一輪按得下去的東西(武器＋型態)，由 /api/combat/start 與 act 回傳，前端不自己算。
let currentCombatOptions = null;
let combatInFlight = false;

const COMBAT_WEAPON_LABELS = { unarmed: "徒手", pistol: "手槍" };

/** 切換到戰鬥畫面。開新戰鬥與「重整後還原戰鬥」共用同一段，避免兩邊的顯示狀態走鐘。 */
function enterCombatView() {
  document.body.classList.add("is-combat-view");
  document.getElementById("combat-over-banner").style.display = "none";
  closeModal("chronicleModal");
  document.getElementById("story-current").style.display = "none";
  document.getElementById("story-action-panel").style.display = "none";
  document.getElementById("combat-panel").style.display = "flex";
}

/**
 * 離開戰鬥畫面、回到故事流。
 *
 * [2026-08-27 修正] 這段以前被抄在兩個地方（endCombat 與 attemptRevive），而且抄過去的
 * 那一份漏掉了把 body 上的 is-combat-view 拿掉。那不是可有可無的一行：
 * index.html 裡的
 *   body.is-game-screen.is-combat-view #story-current      { display: none !important; }
 *   body.is-game-screen.is-combat-view #story-action-panel { display: none !important; }
 * 帶 !important，會直接蓋掉下面那兩行 inline style。結果就是「在戰鬥中被打死 → 按下復活」
 * 之後，戰鬥面板收起來了、故事流與行動列卻仍然被 CSS 壓著不顯示，玩家看到一片空白，
 * 而且沒有任何辦法回到遊戲。現在只留這一份實作，兩邊都叫它。
 */
function leaveCombatView() {
  currentCombat = null;
  document.body.classList.remove("is-combat-view");
  document.getElementById("combat-panel").style.display = "none";
  document.getElementById("story-current").style.display = "flex";
  document.getElementById("story-action-panel").style.display = "block";
}

/** 在戰鬥紀錄裡插一行系統訊息（錯誤、還原提示…），跟攻擊紀錄用不同顏色區分。 */
function appendCombatSystemLine(text, colorClass = "text-red-300") {
  const log = document.getElementById("combat-log");
  if (!log) return;
  const block = document.createElement("div");
  block.className = `feed-block-enter p-2 rounded bg-panel/70 border hairline-border text-[11px] font-mono ${colorClass}`;
  block.textContent = text;
  log.appendChild(block);
  log.scrollTop = log.scrollHeight;
}

async function startCombat() {
  if (!currentSessionId || combatInFlight) return;
  combatInFlight = true;
  try {
    const res = await (await fetch("/api/combat/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId }),
    })).json();

    if (!res.ok) {
      appendFeedEvent("fault", "無法開始戰鬥", escapeHtml(res.error));
      return;
    }

    currentCombat = res.combat;
    currentCombatOptions = res.options ?? currentCombatOptions;
    document.getElementById("combat-log").innerHTML = "";
    enterCombatView();

    // 敵人若贏得先攻，開戰當下就已經打了第一擊（見 functions/api/combat/start.js）
    (res.openingEnemyAttacks || []).forEach((atk) => {
      appendCombatLog({
        actor: "enemy",
        weaponKey: currentCombat.enemy.weaponKey,
        hit: atk.hit,
        damage: atk.finalDamage ?? 0,
        damageSeverity: atk.damageSeverity,
        damageSeverityTag: atk.damageSeverityTag,
      });
    });
    if (res.character) adoptCharacter(res.character);
    renderPersistenceWarning(res.persistent);
  } catch (err) {
    // [2026-08-16 修正] 這裡以前只有 finally、沒有 catch：網路錯誤會變成 unhandled
    // rejection，按鈕解鎖但畫面毫無反應，玩家不知道自己按了到底有沒有用。
    console.error("[COMBAT_FAILURE] /api/combat/start 呼叫失敗", err);
    appendFeedEvent(
      "fault",
      "無法開始戰鬥（連線失敗）",
      escapeHtml(err.message),
      { note: "請確認網路後再試一次。" }
    );
  } finally {
    combatInFlight = false;
    renderCombat();
  }
}

function renderCombat() {
  if (!currentCombat) return;
  const c = currentCombat;

  document.getElementById("combat-enemy-name").textContent = c.enemy.name;
  document.getElementById("combat-round").textContent = c.round;

  renderCombatHpBar("combat-enemy-hp-bar", "combat-enemy-hp-text", c.enemy.hpState);
  renderCombatHpBar("combat-player-hp-bar", "combat-player-hp-text", c.player.hpState);

  const turnLabel = c.order[c.turnIndex] === "player" ? "輪到你行動" : `輪到${c.enemy.name}行動`;
  document.getElementById("combat-turn-indicator").textContent = c.active ? turnLabel : "戰鬥結束";

  // 敵人這一輪的意圖預告。戰鬥結束後就不再顯示——那時候「牠正在做什麼」已經沒有意義了。
  const telegraphBox = document.getElementById("combat-telegraph");
  if (telegraphBox) {
    const telegraph = c.active ? c.currentTelegraph : null;
    telegraphBox.style.display = telegraph ? "flex" : "none";
    if (telegraph) document.getElementById("combat-telegraph-text").textContent = telegraph;
  }

  const actionsEnabled = c.active && c.order[c.turnIndex] === "player" && !combatInFlight;
  renderCombatActions(actionsEnabled);
  document.querySelectorAll("[data-combat-attack],[data-combat-form]").forEach((btn) => {
    btn.disabled = !actionsEnabled;
    btn.classList.toggle("opacity-40", !actionsEnabled);
  });

  if (!c.active) {
    const banner = document.getElementById("combat-over-banner");
    const text = document.getElementById("combat-over-text");
    if (c.winner === "player") {
      text.textContent = `擊敗了${c.enemy.name}`;
      text.className = "text-lg font-bold text-emerald-400";
    } else {
      text.textContent = "戰鬥失利";
      text.className = "text-lg font-bold text-red-400";
    }
    banner.style.display = "block";
  }
}

function renderCombatHpBar(barId, textId, hpState) {
  document.getElementById(textId).textContent = `${hpState.intact} / ${hpState.max}`;
  const changed = renderHpBar(barId, hpState);
  if (changed) {
    const wrap = document.getElementById(barId === "combat-enemy-hp-bar" ? "combat-enemy-hp-wrap" : "combat-player-hp-wrap");
    if (wrap) {
      wrap.classList.remove("shake-hit");
      void wrap.offsetWidth; // 強制重排以重新觸發動畫
      wrap.classList.add("shake-hit");
    }
  }
}

function appendCombatLog(entry) {
  const log = document.getElementById("combat-log");
  const actorLabel = entry.actor === "player" ? "你" : currentCombat.enemy.name;
  const weaponLabel = COMBAT_WEAPON_LABELS[entry.weaponKey] ?? entry.weaponKey;
  const outcome = entry.hit ? `命中，造成 ${entry.damage} 點傷害` : "未命中";
  const color = entry.actor === "player" ? "text-emerald-300" : "text-red-300";
  // 傷害嚴重度標籤由引擎產生（見 core/combat/resolveCombatAction.js）。它同時也被送給AI
  // 當描寫強度的依據，所以畫面上也給玩家看——玩家與說書人看到的是同一件事。
  const severityColor = {
    critical: "text-red-400",
    serious: "text-orange-300",
    light: "text-yellow-200/80",
    absorbed: "text-sky-300",
    miss: "text-zinc-500",
  }[entry.damageSeverity] ?? "text-zinc-400";
  const tagHtml = entry.damageSeverityTag
    ? ` <span class="${severityColor}">${escapeHtml(entry.damageSeverityTag)}</span>`
    : "";
  const block = document.createElement("div");
  block.className = "feed-block-enter p-2 rounded bg-panel/70 border hairline-border text-[11px] text-zinc-300";
  block.innerHTML = `<span class="${color} font-bold">${escapeHtml(actorLabel)}</span> 使用${escapeHtml(weaponLabel)} → ${escapeHtml(outcome)}${tagHtml}`;
  log.appendChild(block);
  log.scrollTop = log.scrollHeight;
}

/**
 * 戰鬥行動按鈕。**整排都是伺服器算出來的**（`options` 由 /api/combat/start 與 act 回傳）。
 *
 * [2026-08-17] 在這之前，index.html 裡是寫死的兩顆按鈕（徒手、手槍），於是：
 * 買到的武器在戰鬥裡按不到（引擎其實吃得下），身上的型態也變不了身
 * （`resolveFormActivation()` 當時沒有任何呼叫端）。兩件事是同一個病：引擎做得到、
 * 沒有人問它。現在按鈕從 `combatOptions()` 長出來，買什麼就按得到什麼。
 */
function renderCombatActions(enabled) {
  const box = document.getElementById("combat-actions");
  if (!box) return;
  const opts = currentCombatOptions;
  // 還沒拿到 options（舊存檔續戰、或伺服器版本較舊）就保留原本畫面，不要把按鈕清空
  if (!opts) return;

  const weaponBtn = (w) => `
    <button data-combat-attack="${escapeHtml(w.key)}" class="action-tile !p-2.5 !flex-row justify-center">
      <i class="fas ${w.ranged ? "fa-crosshairs" : "fa-hand-fist"} action-tile-icon !text-base"></i>
      <span class="flex flex-col items-start leading-tight">
        <span class="action-tile-label">${escapeHtml(w.label)}${w.fromForm ? "（型態）" : ""}</span>
        <span class="action-tile-sub">${escapeHtml(w.attackType)}${w.weaponDamage ? ` · 傷害${w.weaponDamage}` : ""}</span>
      </span>
    </button>`;

  // 可變量型態的支付點數選單。範圍是伺服器算的(「不超過敏捷或感知取低」是規則，
  // 不是介面細節)，這裡只把 min~max 攤成選項。
  const amountPicker = (f) => {
    if (!f.variable || f.active) return "";
    const options = [];
    for (let n = f.variable.min; n <= f.variable.max; n++) {
      options.push(`<option value="${n}">${n}</option>`);
    }
    return `
      <label class="flex items-center gap-1 text-[10px] font-mono text-zinc-400 px-1">
        支付
        <select data-form-amount="${escapeHtml(f.formId)}"
          class="bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-violet-200">${options.join("")}</select>
        點${escapeHtml(f.variable.poolName)}
      </label>`;
  };

  // 二選一的型態(書上的「由你自己選擇」)一個選項畫一顆按鈕：選擇點在啟動的那一瞬間，
  // 所以它就是按下去的那一下，不需要另外一層「先選模式再啟動」的狀態。
  const formBtn = (f) => {
    const upkeepNote = f.upkeep ? `，每輪${escapeHtml(costText(f.upkeep))}維持` : "";
    const one = (mode) => `
    <button data-combat-form="${escapeHtml(f.formId)}" ${mode ? `data-combat-form-mode="${escapeHtml(mode.key)}"` : ""}
      ${f.active ? "disabled" : ""}
      class="action-tile !p-2.5 !flex-row justify-center ${f.active ? "opacity-50" : "!border-violet-500/50"}">
      <i class="fas fa-wand-magic-sparkles action-tile-icon !text-base ${f.active ? "" : "!text-violet-300"}"></i>
      <span class="flex flex-col items-start leading-tight">
        <span class="action-tile-label">${escapeHtml(f.label)}${mode ? `·${escapeHtml(mode.label)}` : ""}${f.active ? "（進行中）" : ""}</span>
        <span class="action-tile-sub">${escapeHtml(costText(f.activation))}${upkeepNote}</span>
      </span>
    </button>`;
    const buttons = f.modes?.length ? f.modes.map(one).join("") : one(null);
    return amountPicker(f) + buttons;
  };

  box.innerHTML = [...opts.weapons.map(weaponBtn), ...opts.forms.map(formBtn)].join("");
  box.querySelectorAll("button,select").forEach((b) => {
    if (!enabled) b.disabled = true;
  });
}

/**
 * 戰鬥中啟動型態。跟攻擊走同一個端點，差在 action="型態"——它不推進行動順位。
 * @param {string} formId
 * @param {{ mode?: string|null }} [opts] mode：書上「由你自己選擇」的那個選擇，
 *   支付點數則直接從同一個型態的選單讀(可變量型態才有那個選單)。
 */
async function combatActivateForm(formId, { mode = null } = {}) {
  if (!currentCombat?.active || combatInFlight) return;
  if (currentCombat.order[currentCombat.turnIndex] !== "player") return;
  const picker = document.querySelector(`[data-form-amount="${CSS.escape(formId)}"]`);
  const amount = picker ? Number(picker.value) : null;
  combatInFlight = true;
  renderCombat();
  try {
    const res = await (await fetch("/api/combat/act", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId, formId, action: "型態", amount, mode }),
    })).json();

    if (!res.ok) {
      appendCombatSystemLine(
        `變身失敗：${(res.blockers ?? []).map((b) => b.message).join("；") || res.error || "未知原因"}`,
        "text-yellow-300"
      );
      if (res.options) currentCombatOptions = res.options;
      return;
    }
    currentCombat = res.combat;
    currentCombatOptions = res.options ?? currentCombatOptions;
    if (res.character) adoptCharacter(res.character);
    // 玩家在啟動當下做的兩個決定要回顯出來：同一個型態付3點跟付1點強度差三倍，
    // 畫面上只寫「劍氣 啟動」的話，玩家看不出這次到底變多強。
    const chose = [res.form.mode?.label, res.form.paid != null ? `支付${res.form.paid}點` : null]
      .filter(Boolean)
      .join("，");
    appendCombatSystemLine(`${res.form.label} 啟動${chose ? `（${chose}）` : ""}`, "text-violet-300");
  } catch (err) {
    appendCombatSystemLine(`變身失敗（連線失敗）：${err.message}`);
  } finally {
    combatInFlight = false;
    renderCombat();
  }
}

async function combatAttack(weaponKey) {
  if (!currentCombat?.active || combatInFlight) return;
  if (currentCombat.order[currentCombat.turnIndex] !== "player") return;

  combatInFlight = true;
  renderCombat();
  try {
    const checkResult = { totalSuccesses: 0 };
    const res = await (await fetch("/api/combat/act", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId, weaponKey }),
    })).json();

    if (!res.ok) {
      // 戰鬥中用 alert 會把玩家整個打斷，訊息按掉之後也查不回去；改成寫進戰鬥紀錄。
      appendCombatSystemLine(`行動失敗：${res.error}`);
      return;
    }

    if (res.playerAttack) {
      checkResult.totalSuccesses = res.playerAttack.rawSuccesses ?? 0;
      await playDiceRollAnimation(checkResult);
      appendCombatLog({
        actor: "player",
        weaponKey,
        hit: res.playerAttack.hit,
        damage: res.playerAttack.finalDamage ?? 0,
        damageSeverity: res.playerAttack.damageSeverity,
        damageSeverityTag: res.playerAttack.damageSeverityTag,
      });
    }
    if (res.enemyAttack) {
      appendCombatLog({
        actor: "enemy",
        weaponKey: currentCombat.enemy.weaponKey,
        hit: res.enemyAttack.hit,
        damage: res.enemyAttack.finalDamage ?? 0,
        damageSeverity: res.enemyAttack.damageSeverity,
        damageSeverityTag: res.enemyAttack.damageSeverityTag,
      });
    }

    // 跨輪時型態的維持成本被收走了(或收不到而斷氣)。不說一聲的話，玩家只會看到
    // 防御突然變低、內力莫名其妙少了一點——引擎收走了東西，畫面上要有紀錄。
    for (const ev of res.formEvents ?? []) {
      appendCombatSystemLine(
        ev.event === "型態到期" ? `${ev.label} 結束${ev.reason ? `：${ev.reason}` : ""}` : `${ev.label} 維持中（已支付這一輪的維持成本）`,
        ev.event === "型態到期" ? "text-yellow-300" : "text-violet-300"
      );
    }

    currentCombat = res.combat;
    currentCombatOptions = res.options ?? currentCombatOptions;
    if (res.character) adoptCharacter(res.character);
    if (res.scenario?.nodeCompleted) {
      const n = res.scenario.nodeCompleted;
      const block = document.createElement("div");
      block.className = "feed-block-enter p-2.5 rounded bg-emerald-500/10 border border-emerald-500/40 text-[11px] text-emerald-200 font-bold pulse-glow";
      block.innerHTML = `<i class="fas fa-trophy"></i> 副本節點「${escapeHtml(n.title)}」完成 · 獲得 ${n.reward} 點經驗`;
      document.getElementById("combat-log").appendChild(block);
    }
    // 打贏最終戰卻沒結算成獎勵時，後端會說明原因（見 functions/api/combat/act.js）。
    // 這種事以前是完全靜音的：玩家打贏boss、沒有XP、沒有提示，跟沒打贏長得一樣。
    (res.scenario?.warnings || []).forEach((w) => appendCombatSystemLine(w, "text-yellow-300"));
    if (res.scenario) {
      updateScenarioHud(res.scenario);
      if (res.scenario.settlement?.runSummary) showScenarioSettlement(res.scenario.settlement);
    }
    renderCombat();
    refreshJournalIfOpen();
  } catch (err) {
    console.error("[COMBAT_FAILURE] /api/combat/act 呼叫失敗", err);
    appendCombatSystemLine(`行動失敗（連線失敗）：${err.message}。請確認網路後再按一次。`);
  } finally {
    combatInFlight = false;
    renderCombat();
  }
}

function endCombat() {
  const won = currentCombat?.winner === "player";
  const enemyName = currentCombat?.enemy?.name ?? "敵人";
  leaveCombatView();

  // [2026-08-16 修正] 這裡以前不管輸贏都送「勉強脫身」回主迴圈，於是打到死掉的角色
  // 也照樣繼續玩下去。現在輸掉時先問伺服器角色到底是什麼狀態：真的倒下就不送行動回合
  // (會被 /api/turn 的傷勢閘門擋下)，改成顯示昏迷/死亡橫幅與復活選項。
  if (!won) {
    refreshDownStateThenContinue(enemyName);
    return;
  }

  runTurn({ playerAction: `擊敗了${enemyName}，戰鬥結束。` });
}

async function refreshDownStateThenContinue(enemyName) {
  try {
    const res = await (await fetch(`/api/revive?id=${encodeURIComponent(currentSessionId)}`)).json();
    if (res.ok && res.downState && !res.downState.canAct) {
      renderDownState(res.downState, res.revival);
      appendFeedEvent(
        "harm",
        "倒下",
        `在與${escapeHtml(enemyName)}的戰鬥中倒下。${escapeHtml(res.downState.reason ?? "")}`
      );
      renderOptions([]);
      return;
    }
  } catch (err) {
    console.error("[DOWNSTATE_LOOKUP] 查詢傷勢狀態失敗", err);
  }
  // 還撐得住（只是打輸了但沒倒下）就照舊回主迴圈。
  runTurn({ playerAction: `在與${enemyName}的戰鬥中落敗，勉強脫身。` });
}

async function handleResumeFromModal() {
  const id = document.getElementById("input-resume-session").value.trim();
  if (!id) return;
  closeModal("sessionModal");
  try {
    await resumeSession(id);
  } catch (err) {
    console.error("[RESUME_FAILURE]", err);
    showToast(`讀取輪迴者檔案失敗：${err.message}`);
  }
}

// --- Google 登入 ---------------------------------------------------------
// 前端這一側刻意做得很薄：登入票是 HttpOnly cookie，JavaScript 讀不到也不需要讀
// （那正是它防 XSS 的方式）。這裡只負責「問後端我是誰」與「畫出來」。

let currentUser = null;
/** 這個部署到底有沒有設定 Google 登入（沒設定就不要給玩家一顆一定失敗的按鈕）。 */
let authEnabled = false;

function startGoogleLogin() {
  // 整頁導向而不是開彈出視窗：OAuth 流程要跨網域，彈出視窗常被瀏覽器擋，
  // 而且行動裝置上的體驗更差。導回來時網址會帶 ?login=ok。
  window.location.href = "/api/auth/login";
}

async function googleLogout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (err) {
    console.warn("[AUTH] 登出請求失敗", err);
  }
  // 不管後端回什麼都重整：cookie 若已清掉就會變成訪客，沒清掉也會重新問一次狀態。
  window.location.href = "/";
}

// ---------------------------------------------------------------------------
// 「我的輪迴者檔案」清單
//
// [2026-08-16 新增] Google 登入接上、KV binding 也接上之後，前端還缺最後一塊：
// **登入了，然後呢**。在這之前登入只會讓右上角多一顆頭像，輪迴者檔案仍然只能靠 localStorage
// 記著的那一個 ID 找回來——換一台電腦、清一次瀏覽器資料，那份存在 KV 裡好好的角色檔案
// 就再也點不到了。檔案綁在帳號上這件事，玩家要看得到才算數。
// ---------------------------------------------------------------------------

/** 上一次抓到的輪迴者檔案清單，首頁與檔案視窗共用，不重複打 API。 */
let mySessions = [];
/**
 * 正在進行中的清單請求。
 *
 * [2026-08-27 優化] 開站時這支 API 會被打兩次：refreshAuthState() → renderAuthState()
 * 呼一次（不 await），緊接著 checkLocalSession() 又 await 一次。兩個請求同時在飛，
 * 後回來的覆蓋先回來的，內容一樣、成本雙倍。開啟「輪迴者檔案」視窗時也可能疊上第三次。
 * 同一個時間點只留一份請求就夠了。
 */
let sessionListRequest = null;

function refreshSessionList() {
  if (sessionListRequest) return sessionListRequest;
  sessionListRequest = loadSessionList().finally(() => { sessionListRequest = null; });
  return sessionListRequest;
}

async function loadSessionList() {
  const list = document.getElementById("session-list");
  const status = document.getElementById("session-list-status");
  if (!list) return;

  if (!currentUser) {
    // 沒登入不是錯誤，是一個可以修正的狀態——所以這裡給的是一個入口，不是一句抱怨。
    // 但如果這個部署根本沒設定 Google 登入，就不能給一顆按下去一定失敗的按鈕。
    list.innerHTML = authEnabled
      ? `<div class="p-3 rounded border hairline-border border-dashed text-center space-y-2">
          <div class="text-[11px] text-zinc-400 leading-snug">
            輪迴者檔案目前只跟這台瀏覽器綁在一起。登入之後，檔案會綁到你的 Google 帳號，
            換裝置或清掉瀏覽器資料都找得回來。
          </div>
          <button onclick="startGoogleLogin()" class="px-3 py-1.5 rounded bg-panel hover:bg-zinc-800 border hairline-border text-[11px] text-zinc-200 transition-all">
            <i class="fab fa-google text-[10px]"></i> 以 Google 登入
          </button>
        </div>`
      : `<div class="p-3 rounded border hairline-border border-dashed text-[11px] text-zinc-400 leading-snug">
          這個部署沒有設定 Google 登入，輪迴者檔案只跟這台瀏覽器綁在一起。
          用下面的 Session ID 手動保存，換裝置時貼回來就能接續目前輪迴。
        </div>`;
    if (status) status.textContent = "";
    return;
  }

  if (status) status.textContent = "讀取中…";
  try {
    const res = await (await fetch("/api/session")).json();
    mySessions = (res.sessions ?? []).filter((session) => session.scenarioId !== RETIRED_SCENARIO_ID);
    renderSessionList(mySessions);
    if (status) status.textContent = `${mySessions.length} 名`;
  } catch (err) {
    console.error("[SESSION_LIST_FAILURE]", err);
    list.innerHTML = `<div class="text-[11px] text-red-400">輪迴者檔案清單讀取失敗：${escapeHtml(err.message)}</div>`;
    if (status) status.textContent = "";
  }
}

function renderSessionList(sessions) {
  const list = document.getElementById("session-list");
  if (!list) return;

  if (!sessions.length) {
    list.innerHTML = `<div class="text-[11px] text-zinc-400 p-2">這個帳號底下還沒有輪迴者檔案。</div>`;
    return;
  }

  list.innerHTML = sessions
    .map((s) => {
      const active = s.id === currentSessionId;
      return `
      <div class="flex items-center gap-2 p-2 rounded border ${active ? "border-emerald-500/50 bg-emerald-500/5" : "hairline-border bg-zinc-950"}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="font-bold text-zinc-100 truncate">${escapeHtml(s.name)}</span>
            ${s.dead ? `<span class="shrink-0 text-[9px] px-1 py-0.5 rounded border border-red-500/40 text-red-300">已死亡</span>` : ""}
            ${active ? `<span class="shrink-0 text-[9px] px-1 py-0.5 rounded border border-emerald-500/40 text-emerald-300">進行中</span>` : ""}
          </div>
          <div class="text-[10px] text-zinc-500">${escapeHtml(formatSaveTime(s.updatedAt))} · ${s.turns ?? 0} 回合 · ${s.eventCount ?? 0} 筆紀錄</div>
        </div>
        <button data-load-session="${escapeHtml(s.id)}" class="shrink-0 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold hover:bg-emerald-500/25 transition-all">接續</button>
        <button data-delete-session="${escapeHtml(s.id)}" title="刪除這名輪迴者的檔案" class="shrink-0 px-2 py-1 rounded border hairline-border text-zinc-400 hover:text-red-400 hover:border-red-500/40 transition-all">
          <i class="fas fa-trash text-[10px]"></i>
        </button>
      </div>`;
    })
    .join("");
}

/** 輪迴者檔案時間顯示成「幾分鐘前」這種人看得懂的相對時間，絕對時間放 title。 */
function formatSaveTime(iso) {
  if (!iso) return "時間未知";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "時間未知";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.round(hours / 24)} 天前`;
}

async function deleteSession(id) {
  if (!confirm("確定要刪除這名輪迴者的檔案嗎？這個動作沒辦法復原。")) return;
  try {
    const res = await (await fetch(`/api/session?id=${encodeURIComponent(id)}`, { method: "DELETE" })).json();
    if (!res.ok) throw new Error(res.error || "刪除失敗");
    if (id === currentSessionId) {
      currentSessionId = null;
      lastTravelRequest = null;
      localStorage.removeItem(SESSION_KEY);
    }
    await refreshSessionList();
    await checkLocalSession();
  } catch (err) {
    console.error("[SESSION_DELETE_FAILURE]", err);
    showToast(`刪除輪迴者檔案失敗：${err.message}`);
  }
}

async function refreshAuthState() {
  const boxes = [...document.querySelectorAll("#auth-box, [data-auth-box]")];
  try {
    const res = await (await fetch("/api/auth/me")).json();
    if (!res.enabled) {
      // 這個部署沒設定 Google 登入：整塊藏起來，不要給一顆一定會失敗的按鈕。
      boxes.forEach((box) => { box.style.display = "none"; });
      return;
    }
    boxes.forEach((box) => { box.style.display = "flex"; });
    currentUser = res.user;
    renderAuthState(res.user);
  } catch (err) {
    console.warn("[AUTH] 查詢登入狀態失敗", err);
    boxes.forEach((box) => { box.style.display = "none"; });
  }
}

function renderAuthState(user) {
  const loginButtons = [...document.querySelectorAll("#auth-login-btn, [data-auth-login]")];
  const userBoxes = [...document.querySelectorAll("#auth-user, [data-auth-user]")];
  if (!loginButtons.length && !userBoxes.length) return;

  loginButtons.forEach((button) => { button.style.display = user ? "none" : ""; });
  userBoxes.forEach((box) => { box.style.display = user ? "flex" : "none"; });
  if (!user) return;

  document.querySelectorAll("#auth-avatar, [data-auth-avatar]").forEach((avatar) => {
    if (user.picture) { avatar.src = user.picture; avatar.style.display = ""; }
    else avatar.style.display = "none";
  });
  document.querySelectorAll("#auth-name, [data-auth-name]").forEach((name) => {
    name.textContent = user.name || user.email || "已登入";
  });

// 登入狀態一變，「我的輪迴者檔案」就要跟著變。沒有這一步的話，玩家登入後打開檔案視窗
      // 還是會看到「請先登入」——因為那塊是上一次的狀態畫的。
  refreshSessionList();
}

/**
 * 剛登入回來時，把網址上的 ?login=ok 洗掉，免得玩家重整又看到一次提示。
 *
 * [2026-08-16 補上] 順便告訴玩家「剛才那份匿名存檔已經綁到你的帳號了」。
 * 後端在讀取存檔時會自動認領匿名存檔（見 content/auth/ownership.js 的 claimSession），
 * 這是一件對玩家有意義的好事——但在這之前它是完全靜音的，玩家不會知道自己的進度
 * 從「只存在這台瀏覽器」變成了「跟著帳號走」。
 */
function consumeLoginRedirect() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("login");
  if (!status) return;
  history.replaceState(null, "", window.location.pathname);

  if (status === "ok") {
    console.info("[AUTH] 登入成功");
    if (localStorage.getItem(SESSION_KEY)) {
      pendingLoginNotice = "已登入。這台瀏覽器上的輪迴者檔案已經綁定到你的 Google 帳號，換裝置登入後也找得回來。";
    }
  } else if (status === "cancelled") {
    console.info("[AUTH] 使用者取消了登入");
  }
}

/** 登入回來要顯示給玩家的一句話（等首頁畫好之後才顯示，否則會被後續渲染蓋掉）。 */
let pendingLoginNotice = null;

function flushLoginNotice() {
  if (!pendingLoginNotice) return;
  const box = document.getElementById("portal-login-notice");
  if (!box) return;
  box.textContent = pendingLoginNotice;
  box.style.display = "block";
  pendingLoginNotice = null;
}

document.addEventListener("DOMContentLoaded", async () => {
  showScreen("portal");
  consumeLoginRedirect();
  document.documentElement.setAttribute("data-booting", "true");
  try {
    await refreshAuthState();
    await checkLocalSession();
    flushLoginNotice();
  } finally {
    // 有效存檔已在 checkLocalSession() 內直接切到主神空間；
    // 沒有存檔則在這裡一次揭示邀請頁，避免啟動時先閃出封面再被替換。
    document.documentElement.removeAttribute("data-booting");
  }

  // --- 建卡精靈 ---
  document.getElementById("cg-submit")?.addEventListener("click", advanceChargen);
  document.getElementById("cg-back")?.addEventListener("click", retreatChargen);
  // 姓名欄按 Enter 直接進第一題，不用把手移到按鈕上
  document.getElementById("cg-name")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") advanceChargen();
  });
  // 選項用事件委派：選項是每一題重新渲染的，逐顆綁定會在重畫之後失效
  document.getElementById("cg-question-options")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lifepath-option]");
    if (btn) chooseLifePathOption(btn.dataset.lifepathOption);
  });
  document.getElementById("cg-specialty-options")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-starting-specialty]");
    if (btn && !btn.disabled) toggleStartingSpecialty(btn.dataset.startingSpecialty);
  });
  // 肉體重塑的加減點。同樣用委派——整格會在每次加減之後重畫。
  document.getElementById("cg-reshape-grid")?.addEventListener("click", (e) => {
    const up = e.target.closest("[data-reshape-up]");
    if (up) return adjustReshape(up.dataset.reshapeUp, 1);
    const down = e.target.closest("[data-reshape-down]");
    if (down) return adjustReshape(down.dataset.reshapeDown, -1);
  });
  document.getElementById("cg-reshape-reset")?.addEventListener("click", () => {
    const suggestion = chargenAwakening?.awakening?.reshape?.suggestion;
    if (!suggestion) return;
    chargenReshape = { ...suggestion };
    renderReshape();
  });

  // 特質 / 資源卡：滾輪與點擊切換
  const traitStage = document.getElementById("trait-carousel");
  traitStage?.addEventListener("wheel", e => {
    e.preventDefault();
    stepTrait(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  traitStage?.addEventListener("click", e => {
    const card = e.target.closest("[data-trait-index]");
    if (!card) return;
    traitIndex = Number(card.dataset.traitIndex);
    renderTraitStage();
  });

  // 戰鬥行動按鈕
  document.getElementById("combat-actions")?.addEventListener("click", (e) => {
    const form = e.target.closest("[data-combat-form]");
    if (form && !form.disabled) {
      combatActivateForm(form.dataset.combatForm, { mode: form.dataset.combatFormMode ?? null });
      return;
    }
    const btn = e.target.closest("[data-combat-attack]");
    if (!btn || btn.disabled) return;
    combatAttack(btn.dataset.combatAttack);
  });

  function submitCustomAction(input) {
    if (!input || turnInFlight || travelInFlight) return;
    const actualCharacters = Array.from(input.value).length;
    updateActionInputCount(input);
    if (actualCharacters > MAX_FREE_ACTION_CHARS) {
      input.reportValidity();
      return;
    }
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    updateActionInputCount(input);
    runTurn({ playerAction: text });
  }

  // 自訂行動 Enter 發送；Shift+Enter 保留給需要換行的輸入習慣。
  document.querySelector("[data-action-input]")?.addEventListener("input", (e) => {
    updateActionInputCount(e.target);
  });
  document.querySelector("[data-action-input]")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitCustomAction(e.target);
    }
  });

  // 主畫面只初始化最近五則訊息；完整 chronicle 不在頁面載入時建立 DOM。
  renderRecentStoryWindow({ forceBottom: true });
  document.getElementById("chronicle-copy-btn")?.addEventListener("click", copyChroniclePackage);
  document.getElementById("chronicle-download-btn")?.addEventListener("click", downloadChroniclePackage);

  document.querySelector("[data-send-custom]")?.addEventListener("click", () => {
    submitCustomAction(document.querySelector("[data-action-input]"));
  });
  updateActionInputCount();

  // 數字鍵直接選選項。
  //
  // [2026-08-18] 每一顆選項卡左邊本來就印著 1/2/3/4 的編號，但那個編號沒有綁任何按鍵，
  // 純粹是裝飾。玩家一局要按幾十次選項，鍵盤上一個鍵能解決的事沒有理由要移動滑鼠。
  //
  // 幾個必要的但書：
  //   - 焦點在輸入框裡的時候不能攔（玩家正在打自訂行動，數字是內容不是指令）
  //   - 有 modal 開著的時候不能攔（那時畫面焦點在商店或設定上）
  //   - 帶了 Ctrl/Alt/Meta 的組合鍵不攔，那些是瀏覽器自己的快捷鍵
  //   - 送出中（turnInFlight）不攔，理由跟選項被鎖住時不能點是同一個
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key < "1" || event.key > "9") return;

    const active = document.activeElement;
    const tag = active?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active?.isContentEditable) return;
    if (document.querySelector(".modal-backdrop.modal-open")) return;
    if (turnInFlight) return;

    const index = Number(event.key) - 1;
    if (!currentOptions?.[index]) return;
    event.preventDefault();
    selectOption(index);
  });
});


// ---------------------------------------------------------------------------
// 劇情回顧／AI 劇情包
//
// 這裡才建立完整 chronicle 的 DOM。主畫面永遠只維持 RECENT_STORY_LIMIT 則，避免長局
// 每次追加事件都重排整本故事；玩家主動打開書時才按需請求 /api/chronicle。
// ---------------------------------------------------------------------------
let chronicleState = null;
let chroniclePackageText = "";

function chronicleScenarioTitle(scenarioId, packages = []) {
  return packages.find((item) => item.scenarioId === scenarioId)?.scenarioTitle
    || (scenarioId ? `副本 ${scenarioId}` : "未分章故事");
}

function renderChronicleBook(entries, packages) {
  const book = document.getElementById("chronicle-book");
  if (!book) return;
  if (!entries.length) {
    book.innerHTML = `<div class="chronicle-empty"><i class="fas fa-feather-pointed"></i><p>這本手稿還是空白的。</p><span>完成第一個行動後，說書人的文字會在這裡留下來。</span></div>`;
    return;
  }

  let previousScenario = Symbol("start");
  const html = [];
  for (const entry of entries) {
    const scenarioId = entry.scenarioId ?? "legacy";
    if (scenarioId !== previousScenario) {
      html.push(
        `<div class="chronicle-chapter-heading">` +
          `<span class="chronicle-chapter-rule"></span>` +
          `<span>${escapeHtml(chronicleScenarioTitle(entry.scenarioId, packages))}</span>` +
          `<span class="chronicle-chapter-rule"></span>` +
        `</div>`
      );
      previousScenario = scenarioId;
    }
    html.push(
      `<section class="chronicle-entry">` +
        `<div class="chronicle-entry-mark">第 ${escapeHtml(String(entry.turn))} 回</div>` +
        (entry.action
          ? `<div class="chronicle-action"><span class="chronicle-entry-label">你的行動</span><span>${escapeHtml(entry.action)}</span></div>`
          : "") +
        (entry.narration
          ? `<div class="chronicle-narration">${renderNarrationHtml(entry.narration)}</div>`
          : "") +
      `</section>`
    );
  }
  book.innerHTML = html.join("");
}

function renderChronicle() {
  const state = chronicleState;
  if (!state) return;
  const entries = state.entries ?? [];
  const packages = state.packages ?? [];
  const pack = state.aiPackage;
  const characterName = pack?.character?.name || currentCharacter?.concept?.name || "—";
  const title = pack?.scenarioTitle || (state.currentScenarioId ? chronicleScenarioTitle(state.currentScenarioId, packages) : "玩家的輪迴手稿");
  const complete = Boolean(pack?.scenarioComplete);

  document.getElementById("chronicle-title")?.replaceChildren(document.createTextNode(title));
  const subtitle = document.getElementById("chronicle-subtitle");
  if (subtitle) subtitle.textContent = complete
    ? "這一章已封存；你可以把下方的 AI 劇情包帶到下一段創作。"
    : "完整故事只在你打開這本書時載入，不干擾目前回合。";
  const status = document.getElementById("chronicle-status");
  if (status) {
    status.textContent = complete ? "副本已封存" : "進行中";
    status.classList.toggle("is-complete", complete);
  }
  const character = document.getElementById("chronicle-character");
  if (character) character.textContent = characterName;
  const turns = document.getElementById("chronicle-turns");
  if (turns) turns.textContent = `${pack?.entries?.length ?? entries.length} 回合`;
  const total = document.getElementById("chronicle-total");
  if (total) total.textContent = `${entries.length} 則長期紀錄`;

  const chapterList = document.getElementById("chronicle-chapter-list");
  if (chapterList) {
    const chapters = [];
    const seen = new Set();
    for (const entry of entries) {
      const key = entry.scenarioId ?? "legacy";
      if (seen.has(key)) continue;
      seen.add(key);
      chapters.push(`<span class="chronicle-chapter-chip">${escapeHtml(chronicleScenarioTitle(entry.scenarioId, packages))}</span>`);
    }
    chapterList.innerHTML = chapters.join("") || `<span class="chronicle-chapter-chip muted">尚未分章</span>`;
  }

  renderChronicleBook(entries, packages);
  const note = document.getElementById("chronicle-package-note");
  if (note) note.textContent = complete
    ? "此章已整理成 AI-ready 劇情包：由完整敘事與結構化事實 deterministic 組成，尚未自動傳送給任何外部 AI。"
    : "進行中的故事會持續累積；副本完成後會封存成可交給 AI 的劇情包。";

  const facts = document.getElementById("chronicle-facts");
  const factList = (pack?.facts ?? []).slice(-8).reverse();
  if (facts) {
    facts.innerHTML = factList.length
      ? `<div class="chronicle-facts-label">最近事實</div>` + factList.map((fact) => `<div class="chronicle-fact"><span>${escapeHtml(fact.type ?? "事件")}</span>${escapeHtml(fact.summary ?? "")}</div>`).join("")
      : `<div class="chronicle-facts-empty">尚無結構化事件摘要</div>`;
  }

  chroniclePackageText = pack?.text ?? "";
  const copy = document.getElementById("chronicle-copy-btn");
  const download = document.getElementById("chronicle-download-btn");
  if (copy) copy.disabled = !chroniclePackageText;
  if (download) download.disabled = !chroniclePackageText;
}

async function openChronicle(scenarioId = null) {
  if (!currentSessionId) {
    showToast("先建立輪迴者檔案，主神才會替你保存劇情。", { kind: "warn" });
    return;
  }
  if (currentCombat?.active) return;
  openModal("chronicleModal");
  const book = document.getElementById("chronicle-book");
  if (book) book.innerHTML = `<div class="chronicle-loading"><i class="fas fa-feather-pointed fa-bounce"></i> 正在翻閱存檔……</div>`;
  try {
    const suffix = scenarioId ? `&scenarioId=${encodeURIComponent(scenarioId)}` : "";
    const res = await (await fetch(`/api/chronicle?sessionId=${encodeURIComponent(currentSessionId)}&includePackage=1${suffix}`)).json();
    if (!res.ok) throw new Error(res.error || "劇情回顧載入失敗");
    chronicleState = res;
    renderChronicle();
  } catch (err) {
    if (book) book.innerHTML = `<div class="chronicle-empty is-error"><i class="fas fa-triangle-exclamation"></i><p>劇情回顧載入失敗</p><span>${escapeHtml(err.message)}</span></div>`;
  }
}

async function copyChroniclePackage() {
  if (!chroniclePackageText) return;
  try {
    await navigator.clipboard.writeText(chroniclePackageText);
  } catch {
    const area = document.createElement("textarea");
    area.value = chroniclePackageText;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const button = document.getElementById("chronicle-copy-btn");
  if (button) {
    const original = button.innerHTML;
    button.innerHTML = `<i class="fas fa-check"></i><span>已複製，可交給 AI</span>`;
    setTimeout(() => { button.innerHTML = original; }, 1800);
  }
}

function downloadChroniclePackage() {
  if (!chroniclePackageText) return;
  const blob = new Blob([chroniclePackageText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(chronicleState?.aiPackage?.scenarioTitle || "chronicle").replace(/[^\w\u4e00-\u9fff-]+/g, "-")}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// 主神商店
//
// 這一段刻意什麼都不算。價格、買不買得起、為什麼買不到、副本中XP要不要加倍——
// 全部由 GET/POST /api/shop 回傳，前端只負責畫出來。本專案第4條最高原則
// (數值系統一律要有嚴格公式) 對前端一樣適用：前端算出來的數字沒有測試守著，
// 而且會跟伺服器的答案不一致，那比不顯示更糟。
// ---------------------------------------------------------------------------

let shopState = null;
let shopCategory = "全部";
let shopBusy = false;

async function openHubExchange() {
  if (!currentSessionId) {
    showToast("先建立輪迴者檔案，主神才會開放兌換。", { kind: "warn" });
    return;
  }
  const meta = hubAction("shop");
  if (meta && !meta.enabled) {
    showToast(meta.reason || "目前不能使用兌換。", { kind: "warn" });
    return;
  }
  await openShop();
}

async function openShop() {
  if (!currentSessionId) return;
  openModal("shopModal");
  document.getElementById("shop-shelf").innerHTML =
    `<div class="text-xs font-mono text-zinc-500 p-4 text-center">載入貨架中…</div>`;
  await refreshShop();
}

async function refreshShop() {
  if (!currentSessionId) return;
  try {
    const res = await (await fetch(`/api/shop?sessionId=${encodeURIComponent(currentSessionId)}`)).json();
    if (!res.ok) {
      document.getElementById("shop-shelf").innerHTML =
        `<div class="text-xs font-mono text-red-400 p-4">貨架載入失敗：${escapeHtml(res.error || "未知錯誤")}</div>`;
      return;
    }
    shopState = res;
    renderShop();
    // 型態的即時狀態(哪些正在進行中、有沒有因為換地點而到期)只有 /api/forms 知道，
    // /api/shop 給的那一份只有「身上有哪些型態」。
    await refreshForms();
  } catch (err) {
    document.getElementById("shop-shelf").innerHTML =
      `<div class="text-xs font-mono text-red-400 p-4">無法連線到商店：${escapeHtml(err.message)}</div>`;
  }
}

function renderShop() {
  if (!shopState) return;
  const inHub = shopState.access.location === "主神空間";

  const accessEl = document.getElementById("shop-access");
  accessEl.className =
    "px-4 py-2 text-[11px] font-mono shrink-0 flex items-start gap-2 hairline-b " +
    (inHub ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200");
  accessEl.innerHTML =
    `<i class="fas ${inHub ? "fa-door-open" : "fa-triangle-exclamation"} mt-0.5 shrink-0"></i>` +
    `<span>${escapeHtml(shopState.access.description)}</span>`;

  const w = shopState.wallet;
  const tokenText = Object.entries(w.tokens ?? {})
    .filter(([, n]) => n > 0)
    .map(([tier, n]) => `${tier}×${n}`)
    .join(" ") || "無";
  document.getElementById("shop-wallet-tokens").textContent = tokenText;
  document.getElementById("shop-wallet-points").textContent = w.points ?? 0;
  document.getElementById("shop-wallet-xp").textContent = w.xp ?? 0;

  const totals = Object.values(shopState.summary ?? {}).reduce(
    (acc, c) => ({ 上架: acc.上架 + c.上架, 掛名: acc.掛名 + c.掛名 }),
    { 上架: 0, 掛名: 0 }
  );
  document.getElementById("shop-summary").textContent = `上架 ${totals.上架} · 掛名 ${totals.掛名}`;

  const categories = ["全部", ...new Set(shopState.shelf.map((s) => s.good.category))];
  document.getElementById("shop-tabs").innerHTML = categories
    .map((c) => {
      const active = c === shopCategory;
      return `<button data-shop-cat="${escapeHtml(c)}" class="px-2.5 py-1 rounded border transition-colors ${
        active
          ? "bg-amber-500/20 border-amber-500/50 text-amber-200 font-bold"
          : "bg-panel hairline-border text-zinc-400 hover:text-zinc-200"
      }">${escapeHtml(c)}</button>`;
    })
    .join("");

  const items = shopState.shelf.filter((s) => shopCategory === "全部" || s.good.category === shopCategory);
  document.getElementById("shop-shelf").innerHTML = items.map(shopItemHtml).join("");

  renderForms();
}

// ---------------------------------------------------------------------------
// 型態（變身／開眼／爆發）
//
// 跟貨架一樣：能不能啟動、要付多少代價、什麼時候到期，全部由 /api/forms 算好回傳，
// 前端只畫。到期條件是「離開當下所在的地點」——那把鑰匙由伺服器從存檔算出來，
// 前端連問都不用問。
// ---------------------------------------------------------------------------

let formsState = null;
let formsBusy = false;

function costText(activation) {
  const parts = [];
  if (activation?.action) parts.push(`${activation.action}動作`);
  if (activation?.willpower) parts.push(`意志力${activation.willpower}`);
  if (activation?.pool) parts.push(`${activation.pool.name}${activation.pool.amount}`);
  return parts.join(" + ") || "無代價";
}

function renderForms() {
  const box = document.getElementById("shop-forms");
  if (!box) return;
  const forms = formsState?.forms ?? shopState?.forms ?? [];
  if (!forms.length) {
    box.style.display = "none";
    return;
  }
  box.style.display = "block";

  // 戰鬥中不讓這裡動：戰鬥中的變身要在戰鬥畫面做，那裡才扣得到動作額度。
  const inCombat = Boolean(formsState?.inCombat ?? shopState?.access?.inCombat);
  const note = inCombat
    ? `<span class="text-amber-300/80">戰鬥中——變身請在戰鬥畫面操作（那裡才扣得到動作額度）</span>`
    : `<span class="text-zinc-500">持續一個場景的型態，會在你離開現在這個地點時結束</span>`;

  box.innerHTML =
    `<div class="text-[11px] font-mono flex items-center gap-2"><span class="text-zinc-400">型態</span>${note}</div>` +
    forms
      .map((f) => {
        const label = `${escapeHtml(f.sourceName)}·${escapeHtml(f.label)}`;
        // 以「輪」計時的型態(含所有帶維持成本的)在戰鬥外根本啟動不了——沒有輪可以數，
        // 引擎會回「缺少輪數」。與其讓玩家按下去吃一個看不懂的錯誤，不如在這裡就講清楚。
        const roundBound = f.duration?.unit === "輪";
        const button = inCombat
          ? `<span class="px-2 py-0.5 rounded border border-zinc-700 text-zinc-600 text-[10px] font-mono shrink-0">戰鬥中</span>`
          : roundBound && !f.active
            ? `<span class="px-2 py-0.5 rounded border border-zinc-700 text-zinc-600 text-[10px] font-mono shrink-0">只能在戰鬥中</span>`
            : `<button data-form-toggle="${escapeHtml(f.formId)}" data-form-action="${f.active ? "收功" : "啟動"}"
              class="px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 transition-all ${
                f.active
                  ? "bg-zinc-700/40 border border-zinc-600 text-zinc-300 hover:bg-zinc-700/60"
                  : "bg-violet-500/20 border border-violet-500/50 text-violet-200 hover:bg-violet-500/30"
              }">${f.active ? "收功" : "啟動"}</button>`;
        const upkeep = f.upkeep ? `｜每輪${escapeHtml(costText(f.upkeep))}維持` : "";
        const variable = f.variable
          ? `｜支付${f.variable.min}～${f.variable.max}點${escapeHtml(f.variable.poolName)}，加值等額`
          : "";
        return `
          <div class="flex items-center gap-2 text-[11px] font-mono">
            <span class="${f.active ? "text-violet-200 font-bold" : "text-zinc-300"}">${label}</span>
            ${f.active ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200">進行中</span>` : ""}
            <span class="text-[10px] text-zinc-500">${escapeHtml(costText(f.activation))}${variable}${upkeep}</span>
            <span class="ml-auto"></span>
            ${button}
          </div>`;
      })
      .join("");
}

async function refreshForms() {
  if (!currentSessionId) return;
  try {
    const res = await (await fetch(`/api/forms?sessionId=${encodeURIComponent(currentSessionId)}`)).json();
    if (res.ok) {
      formsState = res;
      renderForms();
    }
  } catch {
    // 型態面板讀不到不該讓整個商店壞掉——貨架是主體，這一區是附加的。
  }
}

async function toggleForm(formId, action) {
  if (!currentSessionId || formsBusy) return;
  formsBusy = true;
  const toast = document.getElementById("shop-toast");
  try {
    const res = await (await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId, formId, action }),
    })).json();

    toast.style.display = "block";
    if (!res.ok) {
      toast.className = "px-4 py-2 text-[11px] font-mono shrink-0 hairline-t text-red-300 bg-red-500/10";
      toast.textContent = `${action}不成：${(res.blockers ?? []).map((b) => b.message).join("；") || res.error || "未知原因"}`;
      if (res.forms) { formsState = res; renderForms(); }
      return;
    }
    formsState = res;
    renderForms();
    toast.className = "px-4 py-2 text-[11px] font-mono shrink-0 hairline-t text-violet-300 bg-violet-500/10";
    toast.textContent =
      action === "啟動"
        ? `「${res.form?.label ?? ""}」啟動，持續到你離開這個地點`
        : `已收功${res.ended?.length ? `：${res.ended.join("、")}` : ""}`;
    // 啟動會扣意志力與能量池，側邊欄要跟著更新
    if (res.character) adoptCharacter(res.character);
  } catch (err) {
    toast.style.display = "block";
    toast.className = "px-4 py-2 text-[11px] font-mono shrink-0 hairline-t text-red-300 bg-red-500/10";
    toast.textContent = `連線失敗：${err.message}`;
  } finally {
    formsBusy = false;
  }
}

function shopItemHtml(item) {
  const good = item.good;
  const pending = item.status === "掛名";
  // 掛名商品的樣式刻意跟「買不起」不一樣：買不起是玩家的問題，掛名是我們還沒做完，
  // 兩者混在一起會讓玩家以為自己再存一點錢就買得到。
  const border = pending
    ? "border-zinc-700/60 bg-zinc-950/40"
    : item.purchasable
    ? "border-emerald-500/30 bg-emerald-500/[0.04]"
    : "hairline-border bg-panel";

  const blockers = (item.blockers ?? [])
    .map(
      (b) =>
        `<div class="text-[10px] text-zinc-500 leading-snug"><span class="text-zinc-400 font-semibold">${escapeHtml(
          b.code
        )}</span> · ${escapeHtml(b.message)}</div>`
    )
    .join("");

  const higher = (item.higherRanks ?? []).length
    ? `<div class="text-[10px] text-zinc-600 mt-1">後續級數：${item.higherRanks
        .map((h) => escapeHtml(`${h.rank} ${h.name}`))
        .join(" · ")}</div>`
    : "";

  const button = pending
    ? `<span class="px-2.5 py-1 rounded border border-zinc-700 text-zinc-600 text-[10px] font-mono shrink-0">掛名</span>`
    : `<button data-shop-buy="${escapeHtml(good.goodId)}" ${item.purchasable ? "" : "disabled"}
        class="px-2.5 py-1 rounded text-[10px] font-mono font-bold shrink-0 transition-all ${
          item.purchasable
            ? "bg-amber-500/20 border border-amber-500/50 text-amber-200 hover:bg-amber-500/30 hover:-translate-y-px"
            : "border hairline-border text-zinc-600 cursor-not-allowed"
        }">兌換</button>`;

  return `
    <div class="rounded-lg border ${border} p-3 flex gap-3 items-start">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[10px] font-mono text-zinc-500">[${escapeHtml(good.category)}]</span>
          <span class="text-xs font-bold text-zinc-100">${escapeHtml(good.name)}</span>
          ${good.rank ? `<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">${escapeHtml(good.rank)}級</span>` : ""}
        </div>
        <div class="text-[11px] font-mono text-amber-300/90 mt-0.5">${escapeHtml(item.price)}</div>
        ${pending && good.pendingReason ? `<div class="text-[10px] text-zinc-500 mt-1 leading-snug">還缺什麼：${escapeHtml(good.pendingReason)}</div>` : ""}
        ${blockers}
        ${higher}
      </div>
      ${button}
    </div>`;
}

async function buyGood(goodId) {
  if (!currentSessionId || shopBusy) return;
  shopBusy = true;
  const toast = document.getElementById("shop-toast");
  try {
    const res = await (await fetch("/api/shop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId, goodId }),
    })).json();

    toast.style.display = "block";
    if (!res.ok) {
      toast.className = "px-4 py-2 text-[11px] font-mono shrink-0 hairline-t text-red-300 bg-red-500/10";
      toast.textContent = `買不成：${(res.blockers ?? []).map((b) => b.message).join("；") || res.error || "未知原因"}`;
      return;
    }
    shopState = res;
    renderShop();
    toast.className = "px-4 py-2 text-[11px] font-mono shrink-0 hairline-t text-emerald-300 bg-emerald-500/10";
    toast.textContent = `已兌換「${res.receipt.name}」，付出 ${res.receipt.pricePaid}`;
    // 買到的東西會改角色卡（屬性/技能/生命上限），側邊欄要跟著更新
    if (res.character) adoptCharacter(res.character);
    refreshJournalIfOpen();
    if (currentGodspacePayload?.lifecycle?.canEnterGodspace) await loadGodspace(currentSessionId);
  } catch (err) {
    toast.style.display = "block";
    toast.className = "px-4 py-2 text-[11px] font-mono shrink-0 hairline-t text-red-300 bg-red-500/10";
    toast.textContent = `連線失敗：${err.message}`;
  } finally {
    shopBusy = false;
  }
}

document.addEventListener("click", (e) => {
  const cat = e.target.closest("[data-shop-cat]");
  if (cat) {
    shopCategory = cat.getAttribute("data-shop-cat");
    renderShop();
    return;
  }
  const buy = e.target.closest("[data-shop-buy]");
  if (buy && !buy.disabled) buyGood(buy.getAttribute("data-shop-buy"));
  const form = e.target.closest("[data-form-toggle]");
  if (form) toggleForm(form.getAttribute("data-form-toggle"), form.getAttribute("data-form-action"));
});

// 「輪迴者檔案」清單裡的「接續」與「刪除」。
//
// [2026-08-27 修正] renderSessionList() 一直都會畫出這兩顆按鈕，deleteSession() 也一直都在，
// 但**沒有任何地方把它們接起來**——整份專案裡 `data-load-session` 只出現在產生 HTML 的
// 那一行，`deleteSession` 除了自己的定義之外沒有第二個引用。所以登入之後打開輪迴者檔案，
// 兩顆按鈕按下去完全沒有反應：既換不了角色，也刪不掉舊檔案。那正是登入這件事本來要
// 解決的問題（換裝置找回角色），卻卡在最後一步。
// 用委派而不是逐顆綁定：清單每次重畫都是新的 DOM，逐顆綁的話重畫一次就全部失效。
document.addEventListener("click", async (e) => {
  const load = e.target.closest("[data-load-session]");
  if (load) {
    const id = load.getAttribute("data-load-session");
    if (!id || id === currentSessionId) {
      closeModal("sessionModal");
      return;
    }
    closeModal("sessionModal");
    try {
      await resumeSession(id);
    } catch (err) {
      console.error("[RESUME_FAILURE]", err);
      showToast(`讀取輪迴者檔案失敗：${err.message}`);
    }
    return;
  }
  const remove = e.target.closest("[data-delete-session]");
  if (remove) deleteSession(remove.getAttribute("data-delete-session"));
});

window.showScreen = showScreen;
window.startNewChargen = startNewChargen;
window.acceptMainGodInvitation = acceptMainGodInvitation;
window.openChronicle = openChronicle;
window.openExplorationTerminal = openExplorationTerminal;
// 舊版外部入口相容：故事紀錄已改名為劇情回顧，但不讓舊 bookmark／debug 呼叫失效。
window.openStoryLog = openChronicle;
window.revealMainGodSpace = revealMainGodSpace;
window.resetPortalInvitation = resetPortalInvitation;
window.cancelChargenReleaseTransition = cancelChargenReleaseTransition;
window.returnToMainGodSpace = returnToMainGodSpace;
window.loadGodspace = loadGodspace;
window.openLastRunDebrief = openLastRunDebrief;
window.restFromGodspace = restFromGodspace;
window.reviveFromGodspace = reviveFromGodspace;
window.showScenarioSettlement = showScenarioSettlement;
window.resumeLocalSession = resumeLocalSession;
window.selectOption = selectOption;
window.handleResumeFromModal = handleResumeFromModal;
window.startCombat = startCombat;
window.openShop = openShop;
window.doRest = doRest;
window.endCombat = endCombat;
window.startGoogleLogin = startGoogleLogin;
// index.html 的 openModal() 是行內 script，跟 app.js 不同作用域，要掛上 window 才叫得到
window.refreshSessionList = refreshSessionList;
window.loadJournal = loadJournal;
window.googleLogout = googleLogout;
