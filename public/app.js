// 無限恐怖TRPG —— 前端應用層 (六維十技能純淨版)

let currentCharacter = null;
let currentOptions = [];
let turnInFlight = false;
let currentSessionId = null;
let chargenRules = null;
let lastChargenErrors = [];

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

const chargenDraft = {
  concept: { name: "", gender: "男", age: 24, background: "" },
  attributes: { 力量: 1, 敏捷: 1, 耐力: 1, 智力: 1, 感知: 1, 意志: 1 },
  skills: Object.fromEntries(SKILL_NAMES.map(s => [s, 0])),
  archetypeId: null,
  backstoryChoiceId: null,
  customDetails: {},
};

function legendaryAttributeBonus(val) {
  return Math.max(0, Math.floor((val - 1) / 5));
}

// --- 建卡初始化 ---
async function startNewChargen() {
  showScreen("chargen");

  if (!chargenRules) {
    try {
      const res = await (await fetch("/api/character")).json();
      chargenRules = res.rules;
    } catch (err) {
      document.getElementById("cg-errors").innerHTML = `<div class="text-xs text-red-400">無法連線到後端規則引擎：${err.message}</div>`;
      return;
    }
  }

  renderArchetypeCards();
  renderChargenAttributes();
  renderChargenSkills();
  await validateChargen();
}

const ARCHETYPE_ICONS = ["fa-crosshairs", "fa-user-ninja", "fa-flask", "fa-shield-halved"];

function renderArchetypeCards() {
  const container = document.getElementById("archetype-container");
  if (!container || !chargenRules?.archetypes) return;

  container.innerHTML = Object.entries(chargenRules.archetypes).map(([key, arch], i) => `
    <button onclick="applyArchetype('${key}')" id="arch-btn-${key}" class="archetype-card text-left p-3 rounded bg-zinc-950 border hairline-border hover:border-emerald-500/50 hover:-translate-y-0.5 transition-all space-y-1.5">
      <div class="flex items-center gap-1.5 font-bold text-emerald-300 text-xs">
        <i class="fas ${ARCHETYPE_ICONS[i % ARCHETYPE_ICONS.length]} text-[11px]"></i>
        <span>${escapeHtml(arch.name)}</span>
      </div>
      <div class="text-[11px] text-zinc-400 leading-snug">${escapeHtml(arch.desc)}</div>
    </button>
  `).join("");
}

function applyArchetype(key) {
  const arch = chargenRules?.archetypes?.[key];
  if (!arch) return;

  // 重設高亮
  document.querySelectorAll(".archetype-card").forEach(c => c.classList.remove("active"));
  document.getElementById(`arch-btn-${key}`)?.classList.add("active");

  // 套用屬性
  for (const k of ATTRIBUTE_DISPLAY.map(a => a.key)) {
    chargenDraft.attributes[k] = arch.attributes[k] ?? 1;
  }
  // 套用技能
  for (const k of SKILL_NAMES) {
    chargenDraft.skills[k] = arch.skills[k] ?? 0;
  }

  // 換模板等於換一整套背景/專長，先前選的背景與自訂欄位都不再適用
  chargenDraft.archetypeId = key;
  chargenDraft.backstoryChoiceId = null;
  chargenDraft.customDetails = {};

  renderChargenAttributes();
  renderChargenSkills();
  renderIdentitySection(arch);
  validateChargen();
}

// --- 背景故事 / 自訂欄位 / 專長 ---
function renderIdentitySection(arch) {
  const section = document.getElementById("cg-identity-section");
  if (!section) return;
  section.style.display = "";

  renderBackstoryOptions(arch);
  renderCustomFields(arch);
  renderFeats(arch);
}

function renderBackstoryOptions(arch) {
  const container = document.getElementById("cg-backstory-container");
  if (!container) return;

  container.innerHTML = (arch.backstoryOptions ?? []).map((b, i) => {
    const selected = chargenDraft.backstoryChoiceId === b.id;
    return `
      <button data-backstory="${escapeHtml(b.id)}"
        class="backstory-card text-left p-3 rounded bg-zinc-950 border text-[11px] leading-relaxed transition-all ${
          selected
            ? "border-emerald-500 text-emerald-100 bg-emerald-500/10"
            : "hairline-border text-zinc-400 hover:border-emerald-500/50"
        }">
        <div class="flex items-center gap-1.5 mb-1 font-bold ${selected ? "text-emerald-300" : "text-zinc-300"}">
          <i class="fas ${selected ? "fa-circle-check" : "fa-circle"} text-[10px]"></i>
          <span>背景 ${String.fromCharCode(65 + i)}</span>
        </div>
        ${escapeHtml(b.text)}
      </button>`;
  }).join("");
}

function renderCustomFields(arch) {
  const container = document.getElementById("cg-customfield-container");
  if (!container) return;

  const backstory = (arch.backstoryOptions ?? []).find((b) => b.id === chargenDraft.backstoryChoiceId);
  if (!backstory) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = (backstory.customizableFields ?? []).map((f) => `
    <div class="flex flex-col gap-1">
      <label class="text-[11px] font-mono text-zinc-400">${escapeHtml(f.label)}</label>
      <input type="text" data-customfield="${escapeHtml(f.key)}" maxlength="40"
        value="${escapeHtml(chargenDraft.customDetails[f.key] ?? "")}"
        placeholder="${escapeHtml(f.placeholder ?? "")}"
        class="bg-zinc-950 border hairline-border rounded px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:border-emerald-500/60 focus:outline-none" />
    </div>`).join("");
}

function renderFeats(arch) {
  const container = document.getElementById("cg-feats-container");
  if (!container) return;

  container.innerHTML = (arch.feats ?? []).map((f) => {
    const isNarrative = f.effect?.type === "narrative";
    // 敘事型專長刻意用不同配色與標籤：它不影響任何數值，玩家不該以為自己拿到了加成。
    const badge = isNarrative
      ? `<span class="shrink-0 px-1.5 py-0.5 rounded border border-violet-500/40 bg-violet-500/10 text-violet-300 text-[10px] font-bold">純敘事/性格特質</span>`
      : `<span class="shrink-0 px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px] font-bold">${escapeHtml(f.effect.skill)} +${f.effect.amount}</span>`;

    return `
      <div class="flex items-start gap-2 p-2.5 rounded bg-zinc-950 border ${isNarrative ? "border-violet-500/30" : "hairline-border"}">
        <div class="flex-1 space-y-0.5">
          <div class="text-xs font-bold ${isNarrative ? "text-violet-200" : "text-emerald-200"}">${escapeHtml(f.name)}</div>
          <div class="text-[11px] text-zinc-400 leading-snug">${escapeHtml(f.description)}</div>
        </div>
        ${badge}
      </div>`;
  }).join("");
}

function selectBackstory(id) {
  const arch = chargenRules?.archetypes?.[chargenDraft.archetypeId];
  if (!arch) return;
  if (!(arch.backstoryOptions ?? []).some((b) => b.id === id)) return;

  chargenDraft.backstoryChoiceId = id;
  chargenDraft.customDetails = {};
  renderBackstoryOptions(arch);
  renderCustomFields(arch);
  validateChargen();
}

function stepperHtml(kind, name, value, min, max) {
  return `
    <div class="flex items-center justify-between bg-zinc-950 border hairline-border px-2.5 py-1.5 rounded text-xs font-mono">
      <span class="text-zinc-200">${name}</span>
      <span class="flex items-center gap-2">
        <button data-step="${kind}" data-name="${name}" data-delta="-1" class="w-5 h-5 border hairline-border rounded hover:bg-zinc-800 hover:border-emerald-500/40 transition leading-none disabled:opacity-30" ${value <= min ? "disabled" : ""}>−</button>
        <span class="w-4 text-center font-bold text-emerald-300">${value}</span>
        <button data-step="${kind}" data-name="${name}" data-delta="1" class="w-5 h-5 border hairline-border rounded hover:bg-zinc-800 hover:border-emerald-500/40 transition leading-none disabled:opacity-30" ${value >= max ? "disabled" : ""}>+</button>
      </span>
    </div>`;
}

function renderChargenAttributes() {
  document.getElementById("cg-attr-grid").innerHTML = ATTRIBUTE_DISPLAY.map(({ key }) => 
    stepperHtml("attr", key, chargenDraft.attributes[key] ?? 1, 1, 5)
  ).join("");
}

function renderChargenSkills() {
  document.getElementById("cg-skill-grid").innerHTML = SKILL_NAMES.map(name => 
    stepperHtml("skill", name, chargenDraft.skills[name] ?? 0, 0, 3)
  ).join("");
}

async function validateChargen() {
  chargenDraft.concept.name = document.getElementById("cg-name")?.value.trim() || "";
  chargenDraft.concept.gender = document.getElementById("cg-gender")?.value || "男";

  let data;
  try {
    const res = await fetch("/api/character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: chargenDraft }),
    });
    data = await res.json();
  } catch (err) {
    return;
  }

  const ab = data.budgets?.attributes;
  const sb = data.budgets?.skills;

  document.getElementById("cg-attr-budget").textContent = ab ? `已用 ${ab.totalCost} / ${ab.totalBudget} 點` : "—";
  document.getElementById("cg-skill-budget").textContent = sb ? `已用 ${sb.totalCost} / ${sb.totalBudget} 點` : "—";

  const d = data.character?.derived;
  if (d) {
    document.getElementById("cg-derived").textContent = `衍生數值：生命 ${d.hp.max} · 意志 ${d.willpower.max} · 先攻 ${d.initiative} · 防禦 ${d.baseDefense}`;
  }

  // 「還沒選背景故事」也會讓 valid=false，光看點數預算看不出原因，所以錯誤要列出來。
  const errBox = document.getElementById("cg-errors");
  if (errBox) {
    const errors = data.errors ?? [];
    errBox.innerHTML = errors
      .map((msg) => `<div class="text-xs font-mono text-red-400">· ${escapeHtml(msg)}</div>`)
      .join("");
  }

  lastChargenErrors = data.errors ?? [];
  return data.valid;
}

// --- 進入遊戲 ---
async function startNewGame() {
  const nameInput = document.getElementById("cg-name");
  if (!nameInput.value.trim()) {
    alert("請輸入輪迴者姓名！");
    nameInput.focus();
    return;
  }

  const isValid = await validateChargen();
  if (!isValid) {
    alert(lastChargenErrors.length ? `建卡還沒完成：\n${lastChargenErrors.join("\n")}` : "建卡尚未完成，請檢查上方提示！");
    return;
  }

  const submitBtn = document.getElementById("cg-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = "傳送進主神空間中...";

  try {
    const res = await (await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: chargenDraft, sceneContext: "" }),
    })).json();

    if (!res.ok) throw new Error(res.error || "建卡失敗");

    currentSessionId = res.session.id;
    localStorage.setItem(SESSION_KEY, currentSessionId);
    adoptCharacter(res.session.character);
    showScreen("game");
    await runTurn({ opening: true });
  } catch (err) {
    alert(`進入遊戲失敗：${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "完成建卡並進入輪迴世界";
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
  const provider = localStorage.getItem("user_llm_provider") || "";
  if (!provider) return { ok: true, payload: {} }; // 用伺服器預設，什麼都不帶

  const meta = PROVIDER_UI_META[provider] ?? {};
  const apiKey = (localStorage.getItem("user_api_key") || "").trim();
  const baseUrl = (localStorage.getItem("user_llm_base_url") || "").trim();
  const model = (localStorage.getItem("user_llm_model") || "").trim();

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
  return { ok: true, payload };
}

/** 上一次送出的回合參數，讓「重試」按鈕不用玩家重打一次自訂行動。 */
let lastTurnRequest = null;

async function runTurn({ chosenOption, playerAction, opening } = {}) {
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
    if (res.ok === false) {
      renderTurnWarnings(res.warnings);
      if (res.checkResult) await renderCheckResult(res.checkResult);
      appendTurnError(res.error || `回合失敗（HTTP ${httpRes.status}）`, res);
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
  const cause = degraded.parseFailed ? "成因：AI 的回覆不是合法 JSON。" : "";

  appendFeedBlock(
    `<span class="text-yellow-300">SYSTEM.FALLBACK // 保底內容</span>`,
    `${escapeHtml(detail)}${cause ? " " + escapeHtml(cause) : ""}`,
    "font-mono text-[11px] text-yellow-200/80 bg-yellow-500/5 p-2 rounded border border-yellow-500/30"
  );
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
  const titleEl = document.getElementById("scenario-node-title");
  if (scenario.progress?.scenarioComplete) {
    titleEl.innerHTML = `<i class="fas fa-flag-checkered"></i> 主線已完成`;
  } else if (node.isFinale) {
    titleEl.innerHTML = `<i class="fas fa-skull-crossbones text-red-400"></i> 當前目標：${escapeHtml(node.title)}`;
  } else {
    titleEl.textContent = `當前目標：${node.title}`;
  }

  const pct = scenario.progress?.overallCompletionPct ?? 0;
  const currentChapter = scenario.progress?.chapters?.[scenario.progress?.currentChapterIndex ?? 0];
  document.getElementById("scenario-progress-bar").style.width = `${pct}%`;
  document.getElementById("scenario-progress-text").textContent = currentChapter
    ? `主線進度：節點 ${currentChapter.completedNodes}/${currentChapter.totalNodes}（${pct}%）`
    : `主線進度：${pct}%`;

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
    badge.className = `ml-auto px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 ${TIME_STATUS_STYLE[status] ?? ""}`;
  } else {
    badge.textContent = "";
    badge.className = "ml-auto px-2 py-0.5 rounded border text-[10px] font-bold shrink-0";
  }

  // 「遭遇戰鬥」按鈕只在最終戰節點才顯示：一般敘事節點顯示這顆按鈕，玩家隨時可能
  // 在毫無劇情鋪陳的情況下手滑點下去，憑空跳出一隻佔位怪物，破壞AI辛苦營造的沉浸感。
  const combatBtn = document.getElementById("combat-start-btn");
  if (combatBtn) {
    const isFinale = Boolean(node?.isFinale);
    combatBtn.style.display = isFinale ? "" : "none";
    combatBtn.classList.toggle("pulse-glow", isFinale);
  }
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

    return `
    <button onclick="selectOption(${i})" class="anim-fade-up text-left p-2.5 pl-3 rounded bg-panel hover:bg-zinc-800 border ${isFallback ? "border-yellow-500/30" : "hairline-border"} hover:border-emerald-500/40 transition-all hover:-translate-y-px hover:shadow-[0_8px_20px_-10px_rgba(16,185,129,0.4)] flex items-start gap-2.5 text-xs" style="animation-delay:${i * .06}s">
      <span class="shrink-0 w-5 h-5 mt-0.5 flex items-center justify-center rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] font-bold">${i+1}</span>
      <span class="flex flex-col gap-1 flex-1 min-w-0">
        <span class="font-bold text-zinc-100 flex items-center justify-between gap-2">
          <span class="truncate">${escapeHtml(opt.label)}</span>
          <span class="shrink-0 flex items-center gap-1.5">
            ${fallbackTag}
            <span class="text-emerald-400 text-[10px] font-mono border border-emerald-500/30 px-1.5 py-0.5 rounded bg-emerald-500/10">DP ${dp}</span>
          </span>
        </span>
        <span class="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5 flex-wrap">
          <span>檢定: ${escapeHtml(opt.attribute)}${opt.skill ? ' + ' + escapeHtml(opt.skill) : ''} · ${escapeHtml(opt.difficulty)} (DC${opt.dc})</span>
          ${warningHtml}
        </span>
      </span>
    </button>`;
  }).join("");
}

function selectOption(index) {
  const opt = currentOptions[index];
  if (opt) runTurn({ chosenOption: opt });
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
    }
  } catch {}
}

async function resumeLocalSession() {
  const savedId = localStorage.getItem(SESSION_KEY);
  if (savedId) await resumeSession(savedId);
}

async function resumeSession(id) {
  try {
    const res = await (await fetch(`/api/session?id=${encodeURIComponent(id)}`)).json();
    if (!res.ok) return false;

    currentSessionId = id;
    localStorage.setItem(SESSION_KEY, id);
    adoptCharacter(res.session.character);
    showScreen("game");

    const feed = document.getElementById("story-feed");
    feed.innerHTML = "";
    (res.session.history || []).forEach(h => {
      if (h.action) appendFeedBlock("▶ 輪迴者行動", escapeHtml(h.action), "font-mono italic text-emerald-400/80");
      if (h.narration) appendNarrationBlock(h.narration);
    });

    renderOptions(res.session.scene?.options || []);
    if (!(res.session.scene?.options || []).length) await runTurn({ opening: true });
    return true;
  } catch {
    return false;
  }
}

// --- 戰鬥（單敵人 MVP，見 content/combat/encounterState.js） ---
let currentCombat = null;
let combatInFlight = false;

const COMBAT_WEAPON_LABELS = { unarmed: "徒手", pistol: "手槍" };

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
      alert(`無法開始戰鬥：${res.error}`);
      return;
    }

    currentCombat = res.combat;
    document.getElementById("combat-log").innerHTML = "";
    document.getElementById("combat-over-banner").style.display = "none";
    document.getElementById("story-feed").style.display = "none";
    document.getElementById("story-action-panel").style.display = "none";
    document.getElementById("combat-panel").style.display = "flex";

    // 敵人若贏得先攻，開戰當下就已經打了第一擊（見 functions/api/combat/start.js）
    (res.openingEnemyAttacks || []).forEach((atk) => {
      appendCombatLog({ actor: "enemy", weaponKey: currentCombat.enemy.weaponKey, hit: atk.hit, damage: atk.finalDamage ?? 0 });
    });
    if (res.character) adoptCharacter(res.character);
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
      alert(`行動失敗：${res.error}`);
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
    renderCombat();
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

  const summary = won ? `擊敗了${enemyName}，戰鬥結束。` : `在與${enemyName}的戰鬥中落敗，勉強脫身。`;
  runTurn({ playerAction: summary });
}

async function handleResumeFromModal() {
  const id = document.getElementById("input-resume-session").value.trim();
  if (!id) return;
  closeModal("sessionModal");
  const ok = await resumeSession(id);
  if (!ok) alert("找不到該 Session ID 的存檔。");
}

document.addEventListener("DOMContentLoaded", async () => {
  showScreen("portal");
  await checkLocalSession();

  document.getElementById("cg-submit")?.addEventListener("click", startNewGame);
  document.getElementById("cg-name")?.addEventListener("input", validateChargen);
  document.getElementById("cg-gender")?.addEventListener("change", validateChargen);

  // Stepper 事件委派
  for (const gridId of ["cg-attr-grid", "cg-skill-grid"]) {
    document.getElementById(gridId)?.addEventListener("click", e => {
      const btn = e.target.closest("[data-step]");
      if (!btn) return;
      const { step, name, delta } = btn.dataset;
      const bucket = step === "attr" ? chargenDraft.attributes : chargenDraft.skills;
      const next = (bucket[name] ?? (step === "attr" ? 1 : 0)) + Number(delta);
      const min = step === "attr" ? 1 : 0;
      const max = step === "attr" ? 5 : 3;
      if (next < min || next > max) return;
      bucket[name] = next;
      if (step === "attr") renderChargenAttributes();
      else renderChargenSkills();
      validateChargen();
    });
  }

  // 背景故事二選一
  document.getElementById("cg-backstory-container")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-backstory]");
    if (!btn) return;
    selectBackstory(btn.dataset.backstory);
  });

  // 背景自訂欄位（選填，超過40字後端會截斷）
  document.getElementById("cg-customfield-container")?.addEventListener("input", e => {
    const input = e.target.closest("[data-customfield]");
    if (!input) return;
    chargenDraft.customDetails[input.dataset.customfield] = input.value;
    validateChargen();
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
window.applyArchetype = applyArchetype;
window.startCombat = startCombat;
window.endCombat = endCombat;
