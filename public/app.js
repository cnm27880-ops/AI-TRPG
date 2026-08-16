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
  openrouter: { label: "OpenRouter（聚合）", needsKey: true, needsBaseUrl: false, needsModel: true },
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

// --- 建卡初始化 ---
// ===========================================================================
// 建卡 —— 生平問答（見 content/chargen/lifePath.js）
//
// [2026-08-16 改版] 這一整段原本是「選身分模板 -> 選背景故事 -> 手動配點」。
// 使用者的要求(逐字)：「我想把目前預設的背景故事拿掉，要透過一些更有代入感的方式讓玩家
// 可以逐步建立一個他心目中的角色…這樣屬性跟技能都改成後台，透過建卡系統自動幫玩家分配好」
//
// 所以現在是一個一次一題的精靈：姓名 -> 六個關於「被抓走之前的人生」的問題 -> 這個人是誰。
// 玩家從頭到尾看不到任何一個數字（想看的人可以在最後一步展開摺疊區）。
// 一次只顯示一題是刻意的：六題全部攤在同一頁會變成一張問卷，玩家會用掃的；
// 一次一題他才會真的讀完四個選項，那四個選項就是這個角色的個性。
// ===========================================================================

/** 目前走到第幾步。0 = 基本資料，1..N = 第幾題，N+1 = 檢視。 */
let chargenStep = 0;
/** 玩家的答案 { 題目id: 選項id }。 */
let chargenAnswers = {};
/** 最後一步從後端拿回來的完整結果（小傳、傾向、角色卡）。 */
let chargenPreview = null;

function lifePathQuestions() {
  return chargenRules?.lifePath ?? [];
}

function reviewStepIndex() {
  return lifePathQuestions().length + 1;
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
  chargenPreview = null;
  renderChargenStep();
}

function renderChargenStep() {
  const questions = lifePathQuestions();
  const total = questions.length + 1; // 基本資料 + 六題（檢視那一步不算進度）
  const basic = document.getElementById("cg-step-basic");
  const question = document.getElementById("cg-step-question");
  const review = document.getElementById("cg-step-review");
  const back = document.getElementById("cg-back");
  const submit = document.getElementById("cg-submit");

  basic.style.display = chargenStep === 0 ? "" : "none";
  question.style.display = chargenStep >= 1 && chargenStep <= questions.length ? "" : "none";
  review.style.display = chargenStep === reviewStepIndex() ? "" : "none";
  back.style.visibility = chargenStep === 0 ? "hidden" : "visible";
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
    document.getElementById("cg-step-label").textContent = "這個人是誰";
    document.getElementById("cg-step-count").textContent = "完成";
    submit.textContent = "進入輪迴世界";
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
  setTimeout(() => advanceChargen(), 160); // 讓玩家看得到自己選中的那一格亮起來
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
    if (chargenStep === reviewStepIndex()) await loadChargenPreview();
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
 * 問完之後跟後端要一次完整結果：小傳、傾向描述、以及換算好的角色卡。
 * 換算一律在後端做（跟建卡驗證同一段程式碼），前端不自己算任何一個數字。
 */
async function loadChargenPreview() {
  const submit = document.getElementById("cg-submit");
  submit.disabled = true;
  submit.classList.add("opacity-40");
  document.getElementById("cg-review-background").textContent = "整理中……";

  try {
    const res = await (await fetch("/api/character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lifePath: { concept: readChargenConcept(), answers: chargenAnswers } }),
    })).json();

    if (!res.valid) {
      showChargenError((res.errors ?? ["建卡驗證失敗"]).join("；"));
      document.getElementById("cg-review-background").textContent = "";
      return;
    }

    chargenPreview = res;
    renderChargenReview(res);
  } catch (err) {
    console.error("[CHARGEN_PREVIEW_FAILURE]", err);
    showChargenError(`無法連線到後端規則引擎（${err.message}）`);
    document.getElementById("cg-review-background").textContent = "";
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

function renderChargenReview(res) {
  const c = res.character;
  document.getElementById("cg-review-background").textContent = res.lifePath.background;
  document.getElementById("cg-review-tendency").textContent = res.lifePath.tendency;

  document.getElementById("cg-review-traits").innerHTML = (c.feats ?? [])
    .map(
      (f) => `
      <div class="flex items-start gap-2 p-2.5 rounded bg-zinc-950 border border-violet-500/30">
        <div class="flex-1 space-y-0.5">
          <div class="text-xs font-bold text-violet-200">${escapeHtml(f.name)}</div>
          <div class="text-[11px] text-zinc-400 leading-snug">${escapeHtml(f.description)}</div>
        </div>
        <span class="shrink-0 px-1.5 py-0.5 rounded border border-violet-500/40 bg-violet-500/10 text-violet-300 text-[10px] font-bold">性格特質</span>
      </div>`
    )
    .join("");

  document.getElementById("cg-review-attributes").innerHTML = ATTRIBUTE_DISPLAY.map(
    ({ key }) => statChipHtml(key, c.attributes[key] ?? 1)
  ).join("");

  document.getElementById("cg-review-skills").innerHTML = SKILL_NAMES.filter((s) => (c.skills[s] ?? 0) > 0)
    .map((s) => statChipHtml(s, c.skills[s]))
    .join("");

  const d = c.derived;
  document.getElementById("cg-derived").textContent =
    `生命 ${d.hp.max} · 意志 ${d.willpower.max} · 先攻 ${d.initiative} · 防禦 ${d.baseDefense}`;
}

function statChipHtml(label, value) {
  return `
    <div class="flex justify-between items-center bg-zinc-950 border hairline-border px-2 py-1 rounded">
      <span class="text-zinc-400">${escapeHtml(label)}</span>
      <span class="font-bold text-emerald-300">${value}</span>
    </div>`;
}

async function submitChargen() {
  const submit = document.getElementById("cg-submit");
  submit.disabled = true;
  submit.textContent = "傳送進主神空間中...";

  try {
    const res = await (await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lifePath: { concept: readChargenConcept(), answers: chargenAnswers },
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
    submit.textContent = "進入輪迴世界";
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
    const bonusTag = bonus > 0 ? `<span class="text-emerald-300 text-[10px] align-top ml-0.5">+${bonus}★</span>` : "";
    return `
      <div class="stat-tile hud-corners px-2.5 py-1.5 rounded flex justify-between items-center gap-2 font-mono">
        <span class="text-zinc-400 text-[11px] leading-tight">${en}<br><span class="text-zinc-500 text-[10px]">${key}</span></span>
        <span class="font-bold text-zinc-100 text-lg leading-none">${val}${bonusTag}</span>
      </div>`;
  }).join("");

  // 渲染技能清單（含已登記的專業，否則玩家會忘記自己有專業加成）
  document.getElementById("skill-display-grid").innerHTML = Object.entries(charData.skills || {}).map(([skill, lv]) => {
    const specs = charData.specializations?.[skill];
    const specText = Array.isArray(specs) && specs.length
      ? `<span class="text-[9px] text-zinc-500 ml-1">(${specs.map(escapeHtml).join("、")})</span>`
      : "";
    return `
    <div class="stat-tile hud-corners px-2.5 py-1.5 rounded flex justify-between items-center font-mono text-xs">
      <span class="text-zinc-300">${escapeHtml(skill)}${specText}</span>
      <span class="font-bold ${lv > 0 ? 'text-emerald-300' : 'text-zinc-500'}">${lv}</span>
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

// --- 特質 / 資源卡 3D 堆疊抽屜 ---
let currentTraits = [];
let traitIndex = 0;

function renderTraitCards(charData) {
  currentTraits = Array.isArray(charData.traits) ? charData.traits : [];
  traitIndex = 0;
  renderTraitStage();
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
      <div data-trait-index="${i}" class="trait-card ${posClass} stat-tile hud-corners rounded p-3 flex flex-col justify-between cursor-pointer">
        <span class="text-[10px] font-mono text-emerald-300 font-semibold">[${escapeHtml(t.category || "資源")}]</span>
        <div class="font-bold text-zinc-100 text-sm">${escapeHtml(t.name || "未命名")}</div>
        <div class="text-[11px] font-mono text-zinc-400 leading-snug line-clamp-2">${escapeHtml(t.desc || "")}</div>
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
  feed.scrollTop = feed.scrollHeight;

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
      grid.children[pressedIndex]?.classList.add("option-pending");
    } else if (!locked) {
      grid.querySelectorAll(".option-pending").forEach((el) => el.classList.remove("option-pending"));
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
      "SYSTEM.CONFIG",
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
          `<span class="text-red-400">SYSTEM.DOWN // 無法行動</span>`,
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

    if (res.narration) {
      appendNarrationBlock(res.narration);
    }

    renderTurnQuality(res.degraded);
    renderOptions(res.options || []);
    if (res.turnCount) document.getElementById("turn-counter").textContent = res.turnCount;
    if (res.scenario) updateScenarioHud(res.scenario);
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
    `<span class="${outcomeColor}">SYSTEM.CHECK // ${r.autoFail ? "自動失敗" : (r.success ? "SUCCESS" : "FAILURE")}</span>`,
    `${r.note?.join(" + ")} ➔ 成功數: <span class="text-zinc-200 font-bold">${r.totalSuccesses}</span> (DC: ${r.dc}) 骰面: [${r.rolls?.join(",")}]`,
    "font-mono text-xs text-zinc-500 bg-panel/70 p-2.5 rounded border hairline-border hud-corners"
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
    `<span class="text-yellow-300">SYSTEM.FALLBACK // 保底內容</span>`,
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
      appendFeedBlock("SYSTEM.REVIVE", `復活失敗：${escapeHtml(res.error)}`, "text-xs text-red-300 font-mono");
      return;
    }

    adoptCharacter(res.character);
    appendFeedBlock(
      `<span class="text-emerald-300">SYSTEM.REVIVE</span>`,
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
    appendFeedBlock("SYSTEM.ERROR", `復活請求失敗：${escapeHtml(err.message)}`, "text-xs text-red-300 font-mono");
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
  block.className = "space-y-1 feed-block-enter text-xs font-mono text-red-300 bg-red-500/5 p-2.5 rounded border border-red-500/40";
  block.innerHTML =
    `<div class="text-[11px] font-bold opacity-80">SYSTEM.ERROR</div>` +
    `<div>${escapeHtml(message)}</div>` +
    (hint ? `<div class="text-yellow-300/80">${escapeHtml(hint)}</div>` : "") +
    `<button data-turn-retry class="mt-1 px-3 py-1 rounded border border-red-400/50 bg-red-500/10 hover:bg-red-500/20 transition text-red-200 font-bold">重試這一回合</button>`;
  block.querySelector("[data-turn-retry]")?.addEventListener("click", () => {
    block.remove();
    if (lastTurnRequest) runTurn(lastTurnRequest);
  });
  feed.appendChild(block);
  feed.scrollTop = feed.scrollHeight;
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
      `<span class="text-yellow-300">SYSTEM.SCENARIO</span>`,
      escapeHtml(w),
      "font-mono text-[11px] text-yellow-200/80 bg-yellow-500/5 p-2 rounded border border-yellow-500/30"
    );
  });

  if (scenario.nodeCompleted) {
    const n = scenario.nodeCompleted;
    appendFeedBlock(
      `<span class="text-emerald-300">劇情節點完成</span>`,
      `「${escapeHtml(n.title)}」已達成 · 扭轉度 ${n.divergenceTier} 級 · 獲得 <span class="text-emerald-300 font-bold">${n.reward}</span> 點經驗`,
      "font-mono text-xs text-zinc-300 bg-emerald-500/5 p-2.5 rounded border border-emerald-500/30 hud-corners pulse-glow"
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
    titleEl.innerHTML = `<i class="fas fa-flag-checkered"></i> 主線已完成`;
    titleEl.title = "";
  } else if (node.isFinale) {
    titleEl.innerHTML = `<i class="fas fa-skull-crossbones text-red-400"></i> 當前目標：${escapeHtml(goalText)}`;
    titleEl.title = node.title;
  } else {
    titleEl.textContent = `當前目標：${goalText}`;
    titleEl.title = node.title;
  }

  const pct = scenario.progress?.overallCompletionPct ?? 0;
  const currentChapter = scenario.progress?.chapters?.[scenario.progress?.currentChapterIndex ?? 0];
  document.getElementById("scenario-progress-bar").style.width = `${pct}%`;
  document.getElementById("scenario-progress-text").textContent = currentChapter
    ? `主線進度：節點 ${currentChapter.completedNodes}/${currentChapter.totalNodes}（${pct}%）`
    : `主線進度：${pct}%`;

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
    badge.className = `px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 ${TIME_STATUS_STYLE[status] ?? ""}`;
  } else {
    badge.textContent = "";
    badge.className = "px-2 py-0.5 rounded border text-[10px] font-bold shrink-0";
  }

  // 「遭遇戰鬥」按鈕只在最終戰節點才顯示：一般敘事節點顯示這顆按鈕，玩家隨時可能
  // 在毫無劇情鋪陳的情況下手滑點下去，憑空跳出一隻佔位怪物，破壞AI辛苦營造的沉浸感。
  // 迫近度到頂(接觸)時也要開放這顆按鈕：那一刻威脅已經站在玩家面前了，
  // 後端會直接用副本自己的追兵樣板開戰（見 functions/api/combat/start.js），
  // 不是憑空跳出一隻佔位怪物，所以不違反上面那個「不要破壞沉浸感」的原則。
  const combatBtn = document.getElementById("combat-start-btn");
  if (combatBtn) {
    const isFinale = Boolean(node?.isFinale);
    const cornered = Boolean(scenario.threat?.contact);
    const canFight = isFinale || cornered;
    combatBtn.style.display = canFight ? "" : "none";
    combatBtn.classList.toggle("pulse-glow", canFight);
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
  label.className = `text-[10px] font-bold ${
    tone >= 4 ? "text-red-400" : tone === 3 ? "text-orange-300" : tone === 2 ? "text-yellow-300" : "text-emerald-300"
  }`;

  pips.innerHTML = Array.from({ length: threat.max }, (_, i) =>
    `<span class="threat-pip ${i < threat.level ? `on-${tone}` : ""}"></span>`
  ).join("");
  box.classList.toggle("pulse-glow", Boolean(threat.contact));

  if (threat.stage !== lastThreatStage && lastThreatStage !== null && threat.delta) {
    const worse = threat.delta > 0;
    appendFeedBlock(
      `<span class="${worse ? "text-orange-300" : "text-emerald-300"}">SYSTEM.THREAT // ${escapeHtml(threat.stage)}</span>`,
      `${escapeHtml(threat.name)}${worse ? "上升" : "下降"}至「${escapeHtml(threat.stage)}」：${escapeHtml(threat.summary ?? "")}`,
      `font-mono text-[11px] p-2 rounded border ${
        worse ? "text-orange-200/90 bg-orange-500/5 border-orange-500/30" : "text-emerald-200/90 bg-emerald-500/5 border-emerald-500/30"
      }`
    );
  }
  lastThreatStage = threat.stage;
}

function renderOptions(options) {
  currentOptions = options;
  const grid = document.getElementById("option-grid");
  if (!options || options.length === 0) {
    grid.innerHTML = `<div class="col-span-2 text-xs font-mono text-zinc-400 p-2.5 border hairline-border border-dashed text-center rounded">本回合無預設選項，請於下方自訂行動。</div>`;
    return;
  }

  grid.innerHTML = options.map((opt, i) => {
    // 試算玩家目前的骰池(DP)，讓玩家點下去之前就知道自己大概有幾顆骰子可拼，
    // 而不是看著「屬性+技能」的組合名稱自己臆測。
    const attrVal = currentCharacter?.attributes?.[opt.attribute] ?? 1;
    const skillVal = opt.skill ? (currentCharacter?.skills?.[opt.skill] ?? 0) : null;
    const dp = attrVal + (skillVal ?? 0);

    let warningHtml = "";
    if (opt.skill && skillVal === 0) {
      const category = SKILL_CATEGORY[opt.skill];
      warningHtml = category === "心智"
        ? `<span class="text-red-400 font-bold whitespace-nowrap">⚠ 自動失敗</span>`
        : `<span class="text-yellow-400 whitespace-nowrap">⚠ 未受訓 ${category === "社交" ? "-2" : "-1"}成功</span>`;
    }

    // 引擎墊出來的保底選項標一個小標籤：它跟這一輪的敘事完全無關（見 content/turnOptions.js
    // 的 FALLBACK_OPTIONS），玩家有權知道自己按下去的是不是AI真的替這個場景想出來的行動。
    const isFallback = opt.source === "fallback";
    const fallbackTag = isFallback
      ? `<span class="shrink-0 text-yellow-300/90 text-[10px] font-mono border border-yellow-500/40 px-1.5 py-0.5 rounded bg-yellow-500/10" title="這個選項是引擎的通用保底選項，不是AI針對本回合劇情產生的">保底</span>`
      : "";

    // 套路懲罰預告（見 content/scenario/repetition.js）。玩家必須在**按下去之前**就看到
    // 「這是連續第3次用潛行，DC會+1」，這個標籤才有意義——按完才知道等於在罰他，不是在設計。
    const retreadTag = opt.retread
      ? `<span class="shrink-0 text-orange-300 text-[10px] font-mono border border-orange-500/40 px-1.5 py-0.5 rounded bg-orange-500/10" title="同一個「屬性＋技能」連續使用會愈來愈難。換個做法就會歸零。">${escapeHtml(opt.retread.label)}</span>`
      : "";
    const shownDc = opt.effectiveDc ?? opt.dc;

    // hint（這個行動想達成什麼）刻意排在第二行、字級比骰池數字大：
    // 測玩回饋是「我就是看選項哪個數字高就按哪個」——那不是玩家的問題，是版面把
    // 唯一醒目的資訊做成了數字。現在最醒目的是「做這件事想得到什麼」，
    // 檢定組合與DP退到最後一行的灰字。
    const hintHtml = opt.hint
      ? `<span class="text-[11px] text-zinc-300 leading-snug">↳ ${escapeHtml(opt.hint)}</span>`
      : "";

    return `
    <button onclick="selectOption(${i})" class="anim-fade-up text-left p-2.5 pl-3 rounded bg-panel hover:bg-zinc-800 border ${isFallback ? "border-yellow-500/30" : "hairline-border"} hover:border-emerald-500/40 transition-all hover:-translate-y-px hover:shadow-[0_8px_20px_-10px_rgba(16,185,129,0.4)] flex items-start gap-2.5 text-xs" style="animation-delay:${i * .06}s">
      <span class="shrink-0 w-5 h-5 mt-0.5 flex items-center justify-center rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] font-bold">${i+1}</span>
      <span class="flex flex-col gap-1 flex-1 min-w-0">
        <span class="font-bold text-zinc-100 flex items-start justify-between gap-2">
          <span class="flex-1">${escapeHtml(opt.label)}</span>
          <span class="shrink-0 flex items-center gap-1.5">
            ${fallbackTag}
            ${retreadTag}
          </span>
        </span>
        ${hintHtml}
        <span class="text-[10px] font-mono text-zinc-500 flex items-center gap-1.5 flex-wrap">
          <span>${escapeHtml(opt.attribute)}${opt.skill ? '+' + escapeHtml(opt.skill) : ''} · ${escapeHtml(opt.difficulty)} DC${shownDc} · 骰池${dp}</span>
          ${warningHtml}
        </span>
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

function appendFeedBlock(title, content, extraClass = "") {
  const feed = document.getElementById("story-feed");
  const block = document.createElement("div");
  block.className = `space-y-1 feed-block-enter ${extraClass}`;
  block.innerHTML = `<div class="text-[11px] font-bold opacity-80 font-mono">${title}</div><div>${content}</div>`;
  feed.appendChild(block);
  feed.scrollTop = feed.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 僅將故事最後一句 DM 提問標記為翡翠綠引導條 + 粗體白字
function renderNarrationHtml(text) {
  const trimmed = String(text || "").trim();
  const lastQ = Math.max(trimmed.lastIndexOf("？"), trimmed.lastIndexOf("?"));
  if (lastQ === -1) return escapeHtml(trimmed);

  const tail = trimmed.slice(lastQ + 1).trim();
  if (tail.length > 2) return escapeHtml(trimmed); // 問號不在段落結尾，維持純文字

  let start = 0;
  for (const punct of ["。", "！", "\n"]) {
    const idx = trimmed.lastIndexOf(punct, lastQ - 1);
    if (idx + 1 > start) start = idx + 1;
  }

  const before = trimmed.slice(0, start).trim();
  const question = trimmed.slice(start, lastQ + 1).trim();
  const beforeHtml = before ? `<div>${escapeHtml(before)}</div>` : "";
  return `${beforeHtml}<div class="feed-final-question"><strong>${escapeHtml(question)}</strong></div>`;
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
  if (!savedId) return;

  try {
    const res = await (await fetch(`/api/session?id=${encodeURIComponent(savedId)}`)).json();
    if (res.ok && res.session) {
      document.getElementById("portal-resume-box").style.display = "block";
      document.getElementById("resume-char-name").textContent = res.session.character?.concept?.name || "未命名輪迴者";
      // 存檔不是持久的時候，「繼續遊戲」這個框本身就是最該講這件事的地方——
      // 玩家正要按下去的按鈕，很可能指向一份已經蒸發的存檔。
      const note = document.getElementById("resume-persistence-note");
      if (note) note.style.display = res.persistent ? "none" : "block";
    } else if (!res.ok) {
      // 存檔查不到不是壞事(可能只是舊ID)，但也不該完全靜音——留給F12看得到。
      console.warn("[SESSION_LOOKUP] 本機記著的存檔ID讀不到：", savedId, res.error);
    }
  } catch (err) {
    console.warn("[SESSION_LOOKUP] 查詢本機存檔時連線失敗", err);
  }
}

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
}

async function resumeLocalSession() {
  const savedId = localStorage.getItem(SESSION_KEY);
  if (!savedId) return;
  // [2026-08-16 修正] 這裡以前是 `if (savedId) await resumeSession(savedId)`，
  // 而 resumeSession() 內部用 `catch { return false }` 吞掉一切錯誤、呼叫端又不看回傳值。
  // 玩家按下「繼續遊戲」之後畫面完全不動，也沒有任何訊息，只能自己猜是不是壞了。
  try {
    await resumeSession(savedId);
  } catch (err) {
    console.error("[RESUME_FAILURE]", err);
    alert(`讀取存檔失敗：${err.message}\n\n存檔ID：${savedId}\n（如果這份存檔是在沒有KV設定的環境下建立的，它可能已經消失了。）`);
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
  renderDownState(res.downState, res.revival);

  // [2026-08-16 修正] 還原「重整頁面時人在戰鬥中」的狀態。
  //
  // 舊行為：這裡只還原故事流與選項，完全不看 session.combat。可是存檔裡那場戰鬥的
  // active 仍然是 true，於是玩家重整之後戰鬥面板消失、再按「遭遇戰鬥」永遠拿到
  // 409「已經有進行中的戰鬥」——那個節點如果是最終戰，這張存檔的主線就再也推不完了。
  // 戰鬥狀態本來就完整存在 session.combat 裡，只是沒有人把它讀回來。
  if (res.session.combat?.active) {
    currentCombat = res.session.combat;
    enterCombatView();
    document.getElementById("combat-log").innerHTML = "";
    (currentCombat.log || []).forEach((entry) => appendCombatLog({
      actor: entry.actor,
      weaponKey: entry.weaponKey,
      hit: entry.hit,
      damage: entry.damage ?? 0,
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
        "SYSTEM.ERROR",
        `無法開始戰鬥：${escapeHtml(res.error)}`,
        "text-xs text-red-300 font-mono bg-red-500/5 p-2.5 rounded border border-red-500/40"
      );
      return;
    }

    currentCombat = res.combat;
    document.getElementById("combat-log").innerHTML = "";
    enterCombatView();

    // 敵人若贏得先攻，開戰當下就已經打了第一擊（見 functions/api/combat/start.js）
    (res.openingEnemyAttacks || []).forEach((atk) => {
      appendCombatLog({ actor: "enemy", weaponKey: currentCombat.enemy.weaponKey, hit: atk.hit, damage: atk.finalDamage ?? 0 });
    });
    if (res.character) adoptCharacter(res.character);
    renderPersistenceWarning(res.persistent);
  } catch (err) {
    // [2026-08-16 修正] 這裡以前只有 finally、沒有 catch：網路錯誤會變成 unhandled
    // rejection，按鈕解鎖但畫面毫無反應，玩家不知道自己按了到底有沒有用。
    console.error("[COMBAT_FAILURE] /api/combat/start 呼叫失敗", err);
    appendFeedBlock(
      "SYSTEM.ERROR",
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

  const actionsEnabled = c.active && c.order[c.turnIndex] === "player" && !combatInFlight;
  document.querySelectorAll("[data-combat-attack]").forEach((btn) => {
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
  const block = document.createElement("div");
  block.className = "feed-block-enter p-2 rounded bg-panel/70 border hairline-border text-[11px] text-zinc-300";
  block.innerHTML = `<span class="${color} font-bold">${escapeHtml(actorLabel)}</span> 使用${escapeHtml(weaponLabel)} → ${escapeHtml(outcome)}`;
  log.appendChild(block);
  log.scrollTop = log.scrollHeight;
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
      appendCombatLog({ actor: "player", weaponKey, hit: res.playerAttack.hit, damage: res.playerAttack.finalDamage ?? 0 });
    }
    if (res.enemyAttack) {
      appendCombatLog({
        actor: "enemy",
        weaponKey: currentCombat.enemy.weaponKey,
        hit: res.enemyAttack.hit,
        damage: res.enemyAttack.finalDamage ?? 0,
      });
    }

    currentCombat = res.combat;
    if (res.character) adoptCharacter(res.character);
    if (res.scenario?.nodeCompleted) {
      const n = res.scenario.nodeCompleted;
      const block = document.createElement("div");
      block.className = "feed-block-enter p-2.5 rounded bg-emerald-500/10 border border-emerald-500/40 text-[11px] text-emerald-200 font-bold hud-corners pulse-glow";
      block.innerHTML = `<i class="fas fa-trophy"></i> 副本節點「${escapeHtml(n.title)}」完成 · 獲得 ${n.reward} 點經驗`;
      document.getElementById("combat-log").appendChild(block);
    }
    // 打贏最終戰卻沒結算成獎勵時，後端會說明原因（見 functions/api/combat/act.js）。
    // 這種事以前是完全靜音的：玩家打贏boss、沒有XP、沒有提示，跟沒打贏長得一樣。
    (res.scenario?.warnings || []).forEach((w) => appendCombatSystemLine(w, "text-yellow-300"));
    renderCombat();
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
        `<span class="text-red-400">SYSTEM.DOWN</span>`,
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
    alert(`讀取存檔失敗：${err.message}`);
  }
}

// --- Google 登入 ---------------------------------------------------------
// 前端這一側刻意做得很薄：登入票是 HttpOnly cookie，JavaScript 讀不到也不需要讀
// （那正是它防 XSS 的方式）。這裡只負責「問後端我是誰」與「畫出來」。

let currentUser = null;

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
}

/** 剛登入回來時，把網址上的 ?login=ok 洗掉，免得玩家重整又看到一次提示。 */
function consumeLoginRedirect() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("login");
  if (!status) return;
  history.replaceState(null, "", window.location.pathname);
  if (status === "ok") {
    console.info("[AUTH] 登入成功");
  } else if (status === "cancelled") {
    console.info("[AUTH] 使用者取消了登入");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  showScreen("portal");
  consumeLoginRedirect();
  await refreshAuthState();
  await checkLocalSession();

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
});

window.showScreen = showScreen;
window.startNewChargen = startNewChargen;
window.resumeLocalSession = resumeLocalSession;
window.selectOption = selectOption;
window.handleResumeFromModal = handleResumeFromModal;
window.startCombat = startCombat;
window.endCombat = endCombat;
window.startGoogleLogin = startGoogleLogin;
window.googleLogout = googleLogout;
