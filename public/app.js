// 無限恐怖TRPG —— 前端應用層 (六維十技能純淨版)

let currentCharacter = null;
let currentOptions = [];
let turnInFlight = false;
let currentSessionId = null;
let chargenRules = null;

const SESSION_KEY = "ai-trpg-session-id";

/**
 * 前端這邊要知道的供應商差異——只有三件事：要不要金鑰、要不要自己填Base URL、有沒有預設模型。
 *
 * [設計] 這份表刻意跟後端 content/llm/providers.js 的 PROVIDERS 分開，只抄「玩家設定畫面
 * 需要的欄位」，不抄 baseUrl / defaultModel 那些會變動的值——前端猜不到也不需要知道，
 * 真正的解析一律在後端做（後端 turn.js 也有同一組檢查當最後防線）。
 * 新增一家OpenAI相容供應商時，這裡加一列、index.html 的 <option> 加一行，不用改任何邏輯。
 */
const PROVIDER_UI_META = {
  gemini: { label: "Google Gemini（官方）", needsKey: true, needsBaseUrl: false, needsModel: false },
  deepseek: { label: "DeepSeek（官方）", needsKey: true, needsBaseUrl: false, needsModel: false },
  siliconflow: { label: "SiliconFlow 硅基流動", needsKey: true, needsBaseUrl: false, needsModel: false },
  nvidia: { label: "NVIDIA NIM（build.nvidia.com）", needsKey: true, needsBaseUrl: false, needsModel: false },
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
// 建卡 —— 五題問答 + 甦醒（見 content/chargen/lifePath.js 與 awakening.js）
//
// [2026-08-18 改版] 六道生平問答換成五道美德/惡德/特性問答，最後多一幕「甦醒」。
// 使用者的要求(逐字)：
//   「請協助我將建卡問題替換成七美德/七惡德/角色特性的決定，並根據選項自動分配大部分基礎點」
//   「所以應該是用五道題目綜合判斷七美德/七惡德，有點類似心理測驗」
//
// 流程：姓名 -> 五題 -> 甦醒（主神掃描 + 5點自由屬性）-> 進入副本。
// 一次只顯示一題是刻意的：五題全部攤在同一頁會變成一張問卷，玩家會用掃的；
// 一次一題他才會真的讀完每個選項，那些選項就是這個角色。
//
// 玩家看不到任何權重與美德惡德的分數——那些**不會**被送到前端（見 questionsForClient）。
// 看得到分表的玩家可以直接反推出想要的結果，主神掃描那一幕就沒有意義了。
// ===========================================================================

/** 目前走到第幾步。0 = 基本資料，1..N = 第幾題，N+1 = 甦醒。 */
let chargenStep = 0;
/** 玩家的答案 { 題目id: 選項id }。 */
let chargenAnswers = {};
/** 甦醒那一幕從後端拿回來的完整結果（過場、掃描、小傳、角色卡）。 */
let chargenAwakening = null;
/** 玩家在肉體重塑分掉的點 { 屬性: 加幾級 }。 */
let chargenReshape = {};

function lifePathQuestions() {
  return chargenRules?.lifePath ?? [];
}

function awakeningStepIndex() {
  return lifePathQuestions().length + 1;
}

let portalMode = "invitation";
let portalTransitionTimer = null;

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
  main.classList.remove("is-visible");
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
  main.classList.add("is-visible");
  main.setAttribute("aria-hidden", "false");

  if (reason === "new") {
    window.setTimeout(() => document.querySelector("#portal-main-content .action-tile.primary")?.focus(), 600);
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
  chargenAwakening = null;
  chargenReshape = {};
  renderChargenStep();
}

function renderChargenStep() {
  const questions = lifePathQuestions();
  const total = questions.length + 1; // 基本資料 + 五題（甦醒那一步不算進度）
  const basic = document.getElementById("cg-step-basic");
  const question = document.getElementById("cg-step-question");
  const awakening = document.getElementById("cg-step-awakening");
  const back = document.getElementById("cg-back");
  const submit = document.getElementById("cg-submit");

  basic.style.display = chargenStep === 0 ? "" : "none";
  question.style.display = chargenStep >= 1 && chargenStep <= questions.length ? "" : "none";
  awakening.style.display = chargenStep === awakeningStepIndex() ? "" : "none";
  back.style.visibility = chargenStep === 0 ? "hidden" : "visible";
  const activeStep = chargenStep === 0 ? basic : chargenStep <= questions.length ? question : awakening;
  replayEnterAnim(activeStep);
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
    // 選項本身就是「下一步」，所以按鈕只在已經答過這題時才有意義（用來改完之後往前走）
    submit.textContent = chargenAnswers[q.id] ? "下一步" : "選一個";
  } else {
    document.getElementById("cg-step-label").textContent = "甦醒";
    document.getElementById("cg-step-count").textContent = "最終的肉體重塑";
    submit.textContent = "解除防護罩";
  }

  submit.disabled = false;
  submit.classList.remove("opacity-40");
}

function renderQuestionOptions(question) {
  const container = document.getElementById("cg-question-options");
  const chosen = chargenAnswers[question.id];

  container.innerHTML = question.options
    .map((o, i) => {
      const selected = chosen === o.id;
      return `
      <button data-lifepath-option="${escapeHtml(o.id)}"
        class="anim-fade-up text-left p-3 rounded border transition-all hover:-translate-y-px ${
          selected
            ? "border-emerald-500 bg-emerald-500/10"
            : "hairline-border bg-zinc-950 hover:border-emerald-500/50"
        }" style="animation-delay:${i * 0.04}s">
        <div class="text-xs font-bold ${selected ? "text-emerald-200" : "text-zinc-100"} leading-snug">
          ${escapeHtml(o.label)}
        </div>
        <div class="text-[11px] font-mono text-zinc-400 mt-1 leading-snug">${escapeHtml(o.detail)}</div>
      </button>`;
    })
    .join("");
}

/** 選一個答案就直接往下一題走——多按一次「下一步」只是多餘的一次點擊。 */
function chooseLifePathOption(optionId) {
  const questions = lifePathQuestions();
  const q = questions[chargenStep - 1];
  if (!q) return;

  chargenAnswers[q.id] = optionId;
  renderQuestionOptions(q);
  const selected = document.querySelector(`[data-lifepath-option="${CSS.escape(optionId)}"]`);
  selected?.classList.add("lifepath-option-confirmed");
  setTimeout(() => advanceChargen(), 240); // 讓玩家看得到自己選中的那一格亮起來
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
    if (chargenStep === awakeningStepIndex()) await loadAwakening();
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
      body: JSON.stringify({ lifePath: { concept: readChargenConcept(), answers: chargenAnswers } }),
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
  for (const t of a.system.traits) cards.push(scanCardHtml("特性", t.name, t.description, "trait"));
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
        lifePath: { concept: readChargenConcept(), answers: chargenAnswers, reshape: chargenReshape },
        sceneContext: "",
      }),
    })).json();

    if (!res.ok) throw new Error((res.errors ?? []).join("；") || res.error || "建卡失敗");

    currentSessionId = res.session.id;
    localStorage.setItem(SESSION_KEY, currentSessionId);
    lastThreatStage = null;
    adoptCharacter(res.session.character);
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
      <div class="stat-tile stat-tile-rail pl-3 pr-2.5 py-1.5 rounded space-y-1" style="--lv-pct:${levelPercent(val, ATTRIBUTE_MAX)}">
        <div class="flex items-baseline justify-between gap-2">
          <span class="stat-tile-en">${en}</span>
          <span class="stat-tile-value">${val}${bonusTag}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="stat-tile-cn">${key}</span>
          ${miniMeterHtml(val, ATTRIBUTE_MAX, ATTRIBUTE_BONUS_FLOOR)}
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
        ${miniMeterHtml(lv, SKILL_MAX, SKILL_BONUS_FLOOR)}
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
const JOURNAL_TYPE_STYLE = {
  check: { label: "判定", color: "text-emerald-300" },
  damage: { label: "傷害", color: "text-red-300" },
  combat_action: { label: "戰鬥", color: "text-red-300" },
  xp_grant: { label: "經驗", color: "text-amber-300" },
  points_grant: { label: "點數", color: "text-amber-300" },
  purchase: { label: "購買", color: "text-sky-300" },
  form: { label: "型態", color: "text-violet-300" },
  rest: { label: "休息", color: "text-sky-300" },
  node_complete: { label: "節點", color: "text-emerald-300" },
  death: { label: "死亡", color: "text-red-400" },
  revival: { label: "復活", color: "text-violet-300" },
  // 用 rose 而不是 pink：淺色主題的色票對照表(index.html)有 rose 的覆寫、沒有 pink，
  // 用 pink 會變成白底上的淺粉字。
  affection_change: { label: "好感", color: "text-rose-300" },
  time_spent: { label: "時間", color: "text-zinc-400" },
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
      const style = JOURNAL_TYPE_STYLE[e.type] ?? { label: "事件", color: "text-zinc-400" };
      return `<div class="p-2 rounded bg-panel/70 border hairline-border leading-snug">
        <span class="${style.color} font-bold">[${escapeHtml(style.label)}]</span>
        <span class="text-zinc-300">${escapeHtml(e.summary ?? "")}</span>
      </div>`;
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

// --- 特質 / 資源卡 3D 堆疊抽屜 ---
let currentTraits = [];
let traitIndex = 0;

function renderTraitCards(charData) {
  currentTraits = Array.isArray(charData.traits) ? charData.traits : [];
  traitIndex = 0;
  renderTraitStage();
}

/**
 * 特質卡上的說明文字。
 *
 * [2026-08-18 修正] 這裡以前直接寫 `t.desc`，但建卡產生的特質物件是
 * `{ id, name, description, effect }`（見 content/chargen/lifePath.js 的 collectTraits），
 * 根本沒有 desc 這個欄位——所以特質分頁的說明**永遠是空字串**，
 * 玩家看到的一直是「[資源] + 一個名字」，那張卡等於只有一半。
 * 兩個名字都收下：日後從商店買進來的資源如果用的是 desc，也不會再壞一次。
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
  setDecisionContext("說書人書寫中 · 這些選項已鎖定");
  const feed = document.getElementById("story-feed");
  if (!feed) return;
  hideNarratorPending();

  const block = document.createElement("div");
  block.id = "narrator-pending";
  block.className =
    "space-y-1 feed-block-enter pending-sweep font-mono text-[11px] text-emerald-200/80 " +
    "bg-emerald-500/5 p-2.5 rounded border border-emerald-500/30";
  block.innerHTML =
    `<div class="flex items-center gap-2">` +
    `<i class="fas fa-feather-pointed"></i>` +
    `<span class="font-bold">說書人書寫中</span>` +
    `<span class="typing-dots"><span></span><span></span><span></span></span>` +
    `<span data-pending-elapsed class="ml-auto tabular-nums text-emerald-300/70">0.0s</span>` +
    `</div>` +
    `<div data-pending-hint class="text-[10px] text-zinc-400"></div>`;
  feed.appendChild(block);
  scrollFeedToBottom();

  const startedAt = Date.now();
  pendingTimer = setInterval(() => {
    const seconds = (Date.now() - startedAt) / 1000;
    const el = block.querySelector("[data-pending-elapsed]");
    if (el) el.textContent = `${seconds.toFixed(1)}s`;
    const hint = block.querySelector("[data-pending-hint]");
    if (hint && seconds >= SLOW_TURN_HINT_SECONDS && !hint.textContent) {
      hint.textContent =
        "模型正在生成這一回合的敘事與選項，較慢的模型需要 30 秒以上，畫面沒有當掉。";
    }
  }, 100);
}

function hideNarratorPending() {
  if (pendingTimer) {
    clearInterval(pendingTimer);
    pendingTimer = null;
  }
  document.getElementById("narrator-pending")?.remove();
}

/**
 * 送出回合的當下就鎖住輸入。
 * @param {boolean} locked
 * @param {number} [pressedIndex] 玩家按的是第幾個選項。沒傳代表這一回合不是從選項來的
 *   （自訂行動／開場／戰鬥結束後的自動回合），那就沒有特定按鈕需要標記。
 */
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
      : "> 描述你的行動，系統將自動推導檢定屬性（例：舉槍瞄準並向後方翻滾）...";
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

async function runTurn({ chosenOption, playerAction, opening, pressedIndex } = {}) {
  if (turnInFlight) return;

  const overrides = buildLlmOverrides();
  if (!overrides.ok) {
    appendFeedBlock(
      "主神設定",
      escapeHtml(overrides.message),
      "text-xs text-yellow-300 font-mono bg-yellow-500/5 p-2.5 rounded border border-yellow-500/40"
    );
    return;
  }

  turnInFlight = true;
  lastTurnRequest = { chosenOption, playerAction, opening };

  if (playerAction) appendFeedBlock(`▶ 輪迴者行動`, escapeHtml(playerAction), "font-mono italic text-emerald-400/80");
  // 選項是AI寫的文字，玩家按下去之後也該在故事流裡留下紀錄——否則捲回去看的時候，
  // 只剩下敘事，看不出當時自己選了什麼。
  if (chosenOption?.label) {
    appendFeedBlock(`▶ 輪迴者行動`, escapeHtml(chosenOption.label), "font-mono italic text-emerald-400/80");
  }

  setTurnInputLocked(true, pressedIndex);
  showNarratorPending();

  try {
    const httpRes = await fetch("/api/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: currentSessionId,
        chosenOption,
        playerAction,
        style: localStorage.getItem("user_narrative_style") || "白描",
        // 敘事者人格面具（見 content/narrativeStyle.js 的 NARRATOR_PERSONAS）。
        persona: localStorage.getItem("user_narrator_persona") || "RUTHLESS_JUDGE",
        ...overrides.payload,
      })
    });

    let res;
    try {
      res = await httpRes.json();
    } catch {
      throw new Error(`伺服器回應不是JSON（HTTP ${httpRes.status}）`);
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
      if (res.checkResult) await renderCheckResult(res.checkResult);
      // 傷勢閘門(409)不是「壞掉」，是規則上的結果——不要給重試按鈕，重試永遠會是同一個答案。
      if (httpRes.status === 409 && res.downState) {
        appendFeedBlock(
          `<span class="text-red-400">身體拒絕行動</span>`,
          escapeHtml(res.error),
          "font-mono text-xs text-red-200 bg-red-500/5 p-2.5 rounded border border-red-500/40"
        );
      } else {
        appendTurnError(res.error || `回合失敗（HTTP ${httpRes.status}）`, res);
      }
      return;
    }

    if (res.checkResult) await renderCheckResult(res.checkResult);

    renderTurnWarnings(res.warnings);

    // 說書人的後台盤算（思維鏈）。**刻意只進 console，不進故事流**：它是模型動筆前的
    // 筆記（「這次是些微失敗，要關掉通風管這條路」），印給玩家看等於先劇透這一回合的結局。
    // 留在 console 是為了讓開發時看得出「模型到底有沒有照著判定結果想事情」——
    // 那是調這一層唯一有效的線索，回傳了卻沒有任何地方讀它才是這個專案要避免的模式。
    if (res.stThought) console.debug("[ST_THOUGHT]", res.stThought);

    if (res.narration) {
      appendNarrationBlock(res.narration);
    }

    renderTurnQuality(res.degraded);
    renderOptions(res.options || []);
    if (res.turnCount) document.getElementById("turn-counter").textContent = res.turnCount;
    if (res.scenario) updateScenarioHud(res.scenario);
    // 日誌分頁開著的時候要跟著這一回合更新，不然玩家會看到一份停在上一回合的日誌。
    refreshJournalIfOpen();
  } catch (err) {
    console.error("[TURN_FAILURE] /api/turn 呼叫失敗", err);
    appendTurnError(`回合執行失敗: ${err.message}`, null);
  } finally {
    turnInFlight = false;
    // 這兩個一定要在 finally：任何一條失敗路徑忘了解鎖，玩家就永遠按不了下一個選項，
    // 而且畫面上還掛著一個永遠轉不完的「說書人書寫中」——比原本沒有指示還糟。
    hideNarratorPending();
    setTurnInputLocked(false);
  }
}

async function renderCheckResult(r) {
  await playDiceRollAnimation(r);
  const outcomeColor = r.autoFail || !r.success ? "text-red-400" : "text-emerald-400";
  appendFeedBlock(
    `<span class="${outcomeColor}">命運擲骰 · ${r.autoFail ? "命運拒絕" : (r.success ? "驚險成功" : "失敗")}</span>`,
    `${r.note?.join(" + ")} ➔ 成功數: <span class="text-zinc-200 font-bold">${r.totalSuccesses}</span> (DC: ${r.dc}) 骰面: [${r.rolls?.join(",")}]`,
    "font-mono text-xs text-zinc-500 bg-panel/70 p-2.5 rounded border hairline-border"
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

  appendFeedBlock(
    `<span class="text-yellow-300">主神提供的退路</span>`,
    `${escapeHtml(detail)}${cause ? " " + escapeHtml(cause) : ""}`,
    "font-mono text-[11px] text-yellow-200/80 bg-yellow-500/5 p-2 rounded border border-yellow-500/30"
  );
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
      appendFeedBlock("主神修復失敗", `復活失敗：${escapeHtml(res.error)}`, "text-xs text-red-300 font-mono");
      return;
    }

    adoptCharacter(res.character);
    refreshJournalIfOpen();
    appendFeedBlock(
      `<span class="text-emerald-300">主神修復完成</span>`,
      `主神修復完成 · 花費 ${res.cost} 點 · 這是第 ${res.reviveCount} 次復活`,
      "font-mono text-xs text-emerald-200 bg-emerald-500/5 p-2.5 rounded border border-emerald-500/30"
    );
    // 復活後那場戰鬥已經在後端標記結束了，把畫面切回故事流。
    if (currentCombat) {
      currentCombat = null;
      document.getElementById("combat-panel").style.display = "none";
      document.getElementById("story-feed").style.display = "flex";
      document.getElementById("story-action-panel").style.display = "block";
    }
    await runTurn({ opening: true });
  } catch (err) {
    console.error("[REVIVE_FAILURE]", err);
    appendFeedBlock("主神訊息中斷", `復活請求失敗：${escapeHtml(err.message)}`, "text-xs text-red-300 font-mono");
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

  const feed = document.getElementById("story-feed");
  const block = document.createElement("div");
  setDecisionContext("回合沒有完成 · 可以重試或改用自訂行動");
  block.className = "space-y-1 feed-block-enter text-xs font-mono text-red-300 bg-red-500/5 p-2.5 rounded border border-red-500/40";
  block.innerHTML =
    `<div class="text-[11px] font-bold opacity-80">主神訊息中斷</div>` +
    `<div>${escapeHtml(message)}</div>` +
    (hint ? `<div class="text-yellow-300/80">${escapeHtml(hint)}</div>` : "") +
    `<button data-turn-retry class="mt-1 px-3 py-1 rounded border border-red-400/50 bg-red-500/10 hover:bg-red-500/20 transition text-red-200 font-bold">重試這一回合</button>`;
  block.querySelector("[data-turn-retry]")?.addEventListener("click", () => {
    block.remove();
    if (lastTurnRequest) runTurn(lastTurnRequest);
  });
  feed.appendChild(block);
  scrollFeedToBottom();
}

// --- 副本節點 HUD：目前目標 / 主線進度 / 時間預算狀態 ---
const TIME_STATUS_STYLE = {
  充裕: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  吃緊: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  危急: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  逾時: "border-red-500/40 bg-red-500/10 text-red-300",
};

function updateScenarioHud(scenario) {
  const hud = document.getElementById("scenario-hud");
  if (!hud) return;

  // 節點結算被引擎擋下時，玩家會看到「我明明做完了，進度條卻沒動」。
  // 這種事以前只進 warnings 陣列(沒人讀)，現在直接寫進故事流講清楚原因。
  (scenario.warnings || []).forEach((w) => {
    appendFeedBlock(
      `<span class="text-yellow-300">副本異常</span>`,
      escapeHtml(w),
      "font-mono text-[11px] text-yellow-200/80 bg-yellow-500/5 p-2 rounded border border-yellow-500/30"
    );
  });

  if (scenario.nodeCompleted) {
    const n = scenario.nodeCompleted;
    appendFeedBlock(
      `<span class="text-emerald-300">劇情節點完成</span>`,
      `「${escapeHtml(n.title)}」已達成 · 扭轉度 ${n.divergenceTier} 級 · 獲得 <span class="text-emerald-300 font-bold">${n.reward}</span> 點經驗`,
      "font-mono text-xs text-zinc-300 bg-emerald-500/5 p-2.5 rounded border border-emerald-500/30 pulse-glow"
    );
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
  const status = scenario.progress?.timeStatus;
  const timeBudget = scenario.progress?.timeBudget;
  if (status) {
    let text = `時間：${status}`;
    // 光寫「充裕/吃緊」玩家沒有實感，直接把剩餘回合數標出來(13/16)化解「沒在跑」的錯覺。
    if (timeBudget) {
      const remain = Math.max(0, timeBudget.totalRounds - timeBudget.spentRounds);
      text += ` (${remain}/${timeBudget.totalRounds})`;
    }
    badge.textContent = text;
    badge.className = `mission-time-badge border ${TIME_STATUS_STYLE[status] ?? ""}`;
  } else {
    badge.textContent = "";
    badge.className = "mission-time-badge";
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
  label.className = `mission-metric-value text-[10px] font-bold ${
    tone >= 4 ? "text-red-400" : tone === 3 ? "text-orange-300" : tone === 2 ? "text-yellow-300" : "text-emerald-300"
  }`;

  pips.innerHTML = Array.from({ length: threat.max }, (_, i) =>
    `<span class="threat-pip ${i < threat.level ? `on-${tone}` : ""}"></span>`
  ).join("");
  box.classList.toggle("pulse-glow", Boolean(threat.contact));

  if (threat.stage !== lastThreatStage && lastThreatStage !== null && threat.delta) {
    const worse = threat.delta > 0;
    appendFeedBlock(
      `<span class="${worse ? "text-orange-300" : "text-emerald-300"}">迫近度變化 · ${escapeHtml(threat.stage)}</span>`,
      `${escapeHtml(threat.name)}${worse ? "上升" : "下降"}至「${escapeHtml(threat.stage)}」：${escapeHtml(threat.summary ?? "")}`,
      `font-mono text-[11px] p-2 rounded border ${
        worse ? "text-orange-200/90 bg-orange-500/5 border-orange-500/30" : "text-emerald-200/90 bg-emerald-500/5 border-emerald-500/30"
      }`
    );
  }
  lastThreatStage = threat.stage;
}

function setDecisionContext(text) {
  const el = document.getElementById("decision-context");
  if (el) el.textContent = text;
}

function renderOptions(options) {
  const grid = document.getElementById("option-grid");
  const safeOptions = Array.isArray(options) ? options : [];
  currentOptions = safeOptions;
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
    const shownDc = opt.effectiveDc ?? opt.dc;

    // hint（這個行動想達成什麼）刻意排在第二行、字級比骰池數字大：
    // 測玩回饋是「我就是看選項哪個數字高就按哪個」——那不是玩家的問題，是版面把
    // 唯一醒目的資訊做成了數字。現在最醒目的是「做這件事想得到什麼」，
    // 檢定組合與DP退到最後一行的灰字。
    const hintHtml = opt.hint
      ? `<span class="decision-card-hint">${escapeHtml(opt.hint)}</span>`
      : "";

    // 玩家先看行動意義，再看規則細節；這裡只負責把後端已算好的資訊分層呈現。
    const metaHtml = isFreeAction
      ? `<span class="decision-card-meta"><i class="fas fa-comment-dots"></i><span>純敘事行動 · 不擲骰 · 場景仍會推進</span></span>`
      : `<span class="decision-card-meta"><span>${escapeHtml(opt.attribute)}${opt.skill ? '+' + escapeHtml(opt.skill) : ''}</span><span>·</span><span>${escapeHtml(opt.difficulty)} DC${shownDc}</span><span>·</span><span>骰池 ${dp}</span>${warningHtml ? `<span>·</span>${warningHtml}` : ""}</span>`;

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

function appendFeedBlock(title, content, extraClass = "") {
  const feed = document.getElementById("story-feed");
  const block = document.createElement("div");
  block.className = `space-y-1 feed-block-enter ${extraClass}`;
  block.innerHTML = `<div class="text-[11px] font-bold opacity-80 font-mono">${title}</div><div>${content}</div>`;
  feed.appendChild(block);
  scrollFeedToBottom();
}

/**
 * 把故事流捲到最底。
 *
 * [2026-08-18 修正] 以前每個呼叫點都是直接寫 `feed.scrollTop = feed.scrollHeight`，
 * 而且是在剛 appendChild 完的同一個 tick 就算。那個時間點量到的高度不一定是最後的高度——
 * 送出回合時底部輸入列的按鈕會換成「書寫中」而變高、選項列同時被鎖住重繪，
 * 故事流的可視高度接著被壓縮，於是「剛剛捲到的底」就不再是底，最後一塊只露出半條。
 *
 * 改成排到下一個影格再捲：那時版面已經重算完，量到的才是真的高度。
 * 為了不讓玩家在等待期間看到畫面先跳一下再跳第二下，同一個影格內只捲一次。
 */
let feedScrollQueued = false;
function scrollFeedToBottom() {
  if (feedScrollQueued) return;
  feedScrollQueued = true;
  requestAnimationFrame(() => {
    feedScrollQueued = false;
    const feed = document.getElementById("story-feed");
    if (feed) feed.scrollTop = feed.scrollHeight;
  });
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
    appendFeedBlock("休息", "戰鬥中沒辦法休息。", "text-yellow-300");
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
      appendFeedBlock("休息", escapeHtml(`休息不成：${why}`), "text-yellow-300");
      return;
    }
    appendFeedBlock(
      res.location === "主神空間" ? "休息（主神空間）" : "打坐（副本中）",
      escapeHtml(res.summary),
      "text-sky-300"
    );
    if (res.timeBudget) {
      appendFeedBlock(
        "時間預算",
        escapeHtml(`已用 ${res.timeBudget.spentRounds}/${res.timeBudget.totalRounds} 回合（${res.timeBudget.status}）`),
        "text-zinc-400"
      );
    }
    // 恢復會改角色卡的生命、意志力與能量池，側邊欄要跟著更新
    if (res.character) adoptCharacter(res.character);
    refreshJournalIfOpen();
  } catch (err) {
    appendFeedBlock("休息", escapeHtml(`連線失敗：${err.message}`), "text-red-300");
  } finally {
    restBusy = false;
    if (btn) btn.disabled = false;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
  document.querySelectorAll("#story-feed .feed-final-question").forEach(el => {
    el.classList.remove("feed-final-question");
  });
}

function appendNarrationBlock(text) {
  clearPreviousFinalQuestions();
  appendFeedBlock("說書人", renderNarrationHtml(text), "feed-block-dm whitespace-pre-wrap text-zinc-200");
}

// --- 首頁存檔 ---
async function checkLocalSession() {
  const savedId = localStorage.getItem(SESSION_KEY);
  const box = document.getElementById("portal-resume-box");
  const accountNote = document.getElementById("resume-account-note");
  const accountText = document.getElementById("resume-account-text");

  // 登入的人先問帳號：存檔是綁在帳號上的，localStorage 只是「這台瀏覽器上次玩哪一份」。
  // 換一台電腦、清過瀏覽器資料的玩家，localStorage 是空的但帳號裡的存檔還在，
  // 這時候仍然要讓他在首頁直接看得到、點得到——那正是登入的意義。
  if (currentUser) await refreshSessionList();

  const fallback = currentUser ? mySessions[0] : null; // 清單已依最近更新排序
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
      // 有有效存檔的回訪玩家已經被主神選中，不必再次觀看初次邀請過場。
      revealMainGodSpace("resume");
      document.getElementById("resume-char-name").textContent =
        res.session.character?.concept?.name || "未命名輪迴者";

      // 存檔不是持久的時候，「繼續遊戲」這個框本身就是最該講這件事的地方——
      // 玩家正要按下去的按鈕，很可能指向一份已經蒸發的存檔。
      const note = document.getElementById("resume-persistence-note");
      if (note) note.style.display = res.persistent ? "none" : "block";

      // 帳號裡還有別份存檔時講一聲，並指路到存檔管理——否則玩家只會看到最新的那一份，
      // 以為其他角色都不見了。
      if (accountNote && accountText) {
        if (currentUser && mySessions.length > 1) {
          accountText.textContent = `這個帳號底下還有 ${mySessions.length - 1} 份其他存檔，可到「存檔管理」切換。`;
          accountNote.style.display = "block";
        } else if (currentUser && res.persistent) {
          accountText.textContent = "已綁定你的 Google 帳號，換裝置登入就找得回來。";
          accountNote.style.display = "block";
        } else {
          accountNote.style.display = "none";
        }
      }
    } else {
      // 存檔查不到不是壞事(可能只是舊ID)，但也不該完全靜音——留給F12看得到。
      console.warn("[SESSION_LOOKUP] 記著的存檔ID讀不到：", targetId, res.error);
      if (box) box.style.display = "none";
    }
  } catch (err) {
    console.warn("[SESSION_LOOKUP] 查詢存檔時連線失敗", err);
  }
}

/** 首頁「接續輪迴任務」實際要讀的那一份（可能來自帳號清單，不一定是 localStorage 那個）。 */
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
    ? "存檔已綁定你的 Google 帳號，換裝置登入後可以在「存檔管理」裡找到。"
    : "存檔目前只跟這台瀏覽器綁在一起。登入 Google 之後才會綁到帳號。";
  if (changed) flashElement(el);
}

async function resumeLocalSession() {
  const savedId = resumeTargetId || localStorage.getItem(SESSION_KEY);
  if (!savedId) return;
  // [2026-08-16 修正] 這裡以前是 `if (savedId) await resumeSession(savedId)`，
  // 而 resumeSession() 內部用 `catch { return false }` 吞掉一切錯誤、呼叫端又不看回傳值。
  // 玩家按下「繼續遊戲」之後畫面完全不動，也沒有任何訊息，只能自己猜是不是壞了。
  try {
    await resumeSession(savedId);
  } catch (err) {
    console.error("[RESUME_FAILURE]", err);
    showToast(
      `讀取存檔失敗：${err.message}\n存檔ID：${savedId}\n（如果這份存檔是在沒有KV設定的環境下建立的，它可能已經消失了。）`
    );
  }
}

async function resumeSession(id) {
  const res = await (await fetch(`/api/session?id=${encodeURIComponent(id)}`)).json();
  if (!res.ok) throw new Error(res.error || "讀取存檔失敗");

  currentSessionId = id;
  localStorage.setItem(SESSION_KEY, id);
  // 換一份存檔＝換一條迫近度軌，上一場的階段不能留著，否則第一次更新會誤報一次「階段變化」。
  lastThreatStage = null;
  adoptCharacter(res.session.character);
  showScreen("game");
  renderPersistenceWarning(res.persistent);

  const feed = document.getElementById("story-feed");
  feed.innerHTML = "";
  (res.session.history || []).forEach(h => {
    if (h.action) appendFeedBlock("▶ 輪迴者行動", escapeHtml(h.action), "font-mono italic text-emerald-400/80");
    if (h.narration) appendNarrationBlock(h.narration);
  });

  renderOptions(res.session.scene?.options || []);
  // [2026-08-20 修正] 副本 HUD（當前目標／簡介／主線進度／迫近度／時間預算）也要在
  // 讀取存檔時就畫出來。先前這一份只有 /api/turn 的回應才有，於是重整頁面接續遊戲的人
  // 會看到一條空的頂欄，一直到他再送出一個回合為止——那正是最需要「我現在要幹嘛」的時刻。
  if (res.scenario) updateScenarioHud(res.scenario);
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
  document.getElementById("combat-over-banner").style.display = "none";
  document.getElementById("story-feed").style.display = "none";
  document.getElementById("story-action-panel").style.display = "none";
  document.getElementById("combat-panel").style.display = "flex";
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
      appendFeedBlock(
        "主神訊息中斷",
        `無法開始戰鬥：${escapeHtml(res.error)}`,
        "text-xs text-red-300 font-mono bg-red-500/5 p-2.5 rounded border border-red-500/40"
      );
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
    appendFeedBlock(
      "主神訊息中斷",
      `無法開始戰鬥（連線失敗）：${escapeHtml(err.message)}。請確認網路後再試一次。`,
      "text-xs text-red-300 font-mono bg-red-500/5 p-2.5 rounded border border-red-500/40"
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
  currentCombat = null;

  document.getElementById("combat-panel").style.display = "none";
  document.getElementById("story-feed").style.display = "flex";
  document.getElementById("story-action-panel").style.display = "block";

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
      appendFeedBlock(
        `<span class="text-red-400">倒下</span>`,
        `在與${escapeHtml(enemyName)}的戰鬥中倒下。${escapeHtml(res.downState.reason ?? "")}`,
        "font-mono text-xs text-red-200 bg-red-500/5 p-2.5 rounded border border-red-500/40"
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
    showToast(`讀取存檔失敗：${err.message}`);
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
// 「我的存檔」清單
//
// [2026-08-16 新增] Google 登入接上、KV binding 也接上之後，前端還缺最後一塊：
// **登入了，然後呢**。在這之前登入只會讓右上角多一顆頭像，存檔仍然只能靠 localStorage
// 記著的那一個 ID 找回來——換一台電腦、清一次瀏覽器資料，那份存在 KV 裡好好的存檔
// 就再也點不到了。存檔綁在帳號上這件事，玩家要看得到才算數。
// ---------------------------------------------------------------------------

/** 上一次抓到的存檔清單，首頁與存檔管理視窗共用，不重複打API。 */
let mySessions = [];

async function refreshSessionList() {
  const list = document.getElementById("session-list");
  const status = document.getElementById("session-list-status");
  if (!list) return;

  if (!currentUser) {
    // 沒登入不是錯誤，是一個可以修正的狀態——所以這裡給的是一個入口，不是一句抱怨。
    // 但如果這個部署根本沒設定 Google 登入，就不能給一顆按下去一定失敗的按鈕。
    list.innerHTML = authEnabled
      ? `<div class="p-3 rounded border hairline-border border-dashed text-center space-y-2">
          <div class="text-[11px] text-zinc-400 leading-snug">
            存檔目前只跟這台瀏覽器綁在一起。登入之後，存檔會綁到你的 Google 帳號，
            換裝置或清掉瀏覽器資料都找得回來。
          </div>
          <button onclick="startGoogleLogin()" class="px-3 py-1.5 rounded bg-panel hover:bg-zinc-800 border hairline-border text-[11px] text-zinc-200 transition-all">
            <i class="fab fa-google text-[10px]"></i> 以 Google 登入
          </button>
        </div>`
      : `<div class="p-3 rounded border hairline-border border-dashed text-[11px] text-zinc-400 leading-snug">
          這個部署沒有設定 Google 登入，存檔只跟這台瀏覽器綁在一起。
          用下面的 Session ID 手動保存，換裝置時貼回來就能繼續。
        </div>`;
    if (status) status.textContent = "";
    return;
  }

  if (status) status.textContent = "讀取中…";
  try {
    const res = await (await fetch("/api/session")).json();
    mySessions = res.sessions ?? [];
    renderSessionList(mySessions);
    if (status) status.textContent = `${mySessions.length} 份`;
  } catch (err) {
    console.error("[SESSION_LIST_FAILURE]", err);
    list.innerHTML = `<div class="text-[11px] text-red-400">存檔清單讀取失敗：${escapeHtml(err.message)}</div>`;
    if (status) status.textContent = "";
  }
}

function renderSessionList(sessions) {
  const list = document.getElementById("session-list");
  if (!list) return;

  if (!sessions.length) {
    list.innerHTML = `<div class="text-[11px] text-zinc-400 p-2">這個帳號底下還沒有存檔。</div>`;
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
        <button data-load-session="${escapeHtml(s.id)}" class="shrink-0 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold hover:bg-emerald-500/25 transition-all">讀取</button>
        <button data-delete-session="${escapeHtml(s.id)}" title="刪除這份存檔" class="shrink-0 px-2 py-1 rounded border hairline-border text-zinc-400 hover:text-red-400 hover:border-red-500/40 transition-all">
          <i class="fas fa-trash text-[10px]"></i>
        </button>
      </div>`;
    })
    .join("");
}

/** 存檔時間顯示成「幾分鐘前」這種人看得懂的相對時間，絕對時間放 title。 */
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
  if (!confirm("確定要刪除這份存檔嗎？這個動作沒辦法復原。")) return;
  try {
    const res = await (await fetch(`/api/session?id=${encodeURIComponent(id)}`, { method: "DELETE" })).json();
    if (!res.ok) throw new Error(res.error || "刪除失敗");
    if (id === currentSessionId) {
      currentSessionId = null;
      localStorage.removeItem(SESSION_KEY);
    }
    await refreshSessionList();
    await checkLocalSession();
  } catch (err) {
    console.error("[SESSION_DELETE_FAILURE]", err);
    showToast(`刪除存檔失敗：${err.message}`);
  }
}

async function refreshAuthState() {
  const box = document.getElementById("auth-box");
  try {
    const res = await (await fetch("/api/auth/me")).json();
    if (!res.enabled) {
      // 這個部署沒設定 Google 登入：整塊藏起來，不要給一顆一定會失敗的按鈕。
      if (box) box.style.display = "none";
      return;
    }
    if (box) box.style.display = "flex";
    currentUser = res.user;
    renderAuthState(res.user);
  } catch (err) {
    console.warn("[AUTH] 查詢登入狀態失敗", err);
    if (box) box.style.display = "none";
  }
}

function renderAuthState(user) {
  const loginBtn = document.getElementById("auth-login-btn");
  const userBox = document.getElementById("auth-user");
  if (!loginBtn || !userBox) return;

  if (!user) {
    loginBtn.style.display = "";
    userBox.style.display = "none";
    return;
  }
  loginBtn.style.display = "none";
  userBox.style.display = "flex";
  const avatar = document.getElementById("auth-avatar");
  if (avatar) {
    if (user.picture) { avatar.src = user.picture; avatar.style.display = ""; }
    else avatar.style.display = "none";
  }
  const name = document.getElementById("auth-name");
  if (name) name.textContent = user.name || user.email || "已登入";

  // 登入狀態一變，「我的存檔」就要跟著變。沒有這一步的話，玩家登入後打開存檔管理
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
      pendingLoginNotice = "已登入。這台瀏覽器上的存檔已經綁定到你的 Google 帳號，換裝置登入後也找得回來。";
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
  await refreshAuthState();
  await checkLocalSession();
  flushLoginNotice();

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

  // 自訂行動 Enter 發送
  document.querySelector("[data-action-input]")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const text = e.target.value.trim();
      if (text) {
        e.target.value = "";
        runTurn({ playerAction: text });
      }
    }
  });

  document.querySelector("[data-send-custom]")?.addEventListener("click", () => {
    const input = document.querySelector("[data-action-input]");
    const text = input.value.trim();
    if (text) {
      input.value = "";
      runTurn({ playerAction: text });
    }
  });

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
    showToast("先建立輪迴者檔案，主神才會開放兌換。", { kind: "warning" });
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

window.showScreen = showScreen;
window.startNewChargen = startNewChargen;
window.acceptMainGodInvitation = acceptMainGodInvitation;
window.revealMainGodSpace = revealMainGodSpace;
window.resetPortalInvitation = resetPortalInvitation;
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
