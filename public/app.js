// 無限恐怖TRPG —— 前端應用層 (六維十技能純淨版)

let currentCharacter = null;
let currentOptions = [];
let turnInFlight = false;
let currentSessionId = null;
let chargenRules = null;

const SESSION_KEY = "ai-trpg-session-id";

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

const chargenDraft = {
  concept: { name: "", gender: "男", age: 24, background: "" },
  attributes: { 力量: 1, 敏捷: 1, 耐力: 1, 智力: 1, 感知: 1, 意志: 1 },
  skills: Object.fromEntries(SKILL_NAMES.map(s => [s, 0])),
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

  renderChargenAttributes();
  renderChargenSkills();
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
    alert("配點超支，請調整後再開始！");
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

  const hpBar = document.getElementById("hp-bar-container");
  const prevHpKey = hpBar.dataset.hpKey;
  const nextHpKey = `${hp.intact}-${hp.B}-${hp.L}-${hp.A}`;
  hpBar.innerHTML = "";
  hpBar.style.gridTemplateColumns = `repeat(${hp.max}, minmax(0, 1fr))`;
  const segments = [
    ...Array(hp.intact).fill("hp-seg hp-seg-intact"),
    ...Array(hp.B).fill("hp-seg hp-seg-b"),
    ...Array(hp.L).fill("hp-seg hp-seg-l"),
    ...Array(hp.A).fill("hp-seg hp-seg-a"),
  ];
  segments.forEach(cls => {
    const d = document.createElement("div");
    d.className = cls;
    hpBar.appendChild(d);
  });
  hpBar.dataset.hpKey = nextHpKey;
  if (prevHpKey && prevHpKey !== nextHpKey) flashElement(hpBar);

  // 渲染六維屬性（緊湊 2 欄，數值右側大字號）
  document.getElementById("attr-grid").innerHTML = ATTRIBUTE_DISPLAY.map(({ key, en }) => {
    const val = charData.attributes[key] || 1;
    const bonus = legendaryAttributeBonus(val);
    const bonusTag = bonus > 0 ? `<span class="text-emerald-300 text-[10px] align-top ml-0.5">+${bonus}★</span>` : "";
    return `
      <div class="px-2.5 py-1.5 rounded bg-zinc-900 border hairline-border flex justify-between items-center gap-2 font-mono">
        <span class="text-zinc-400 text-[11px] leading-tight">${en}<br><span class="text-zinc-500 text-[10px]">${key}</span></span>
        <span class="font-bold text-zinc-100 text-lg leading-none">${val}${bonusTag}</span>
      </div>`;
  }).join("");

  // 渲染技能清單
  document.getElementById("skill-display-grid").innerHTML = Object.entries(charData.skills || {}).map(([skill, lv]) => `
    <div class="px-2.5 py-1.5 rounded bg-zinc-900 border hairline-border flex justify-between items-center font-mono text-xs">
      <span class="text-zinc-300">${skill}</span>
      <span class="font-bold ${lv > 0 ? 'text-emerald-300' : 'text-zinc-500'}">${lv}</span>
    </div>
  `).join("");

  renderTraitCards(charData);
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
      <div data-trait-index="${i}" class="trait-card ${posClass} bg-zinc-900 border hairline-border rounded p-3 flex flex-col justify-between cursor-pointer">
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

async function runTurn({ chosenOption, playerAction, opening } = {}) {
  if (turnInFlight) return;
  turnInFlight = true;

  if (playerAction) appendFeedBlock(`▶ 輪迴者行動`, escapeHtml(playerAction), "font-mono italic text-emerald-400/80");

  try {
    const res = await (await fetch("/api/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: currentSessionId,
        chosenOption,
        playerAction,
        style: localStorage.getItem("user_narrative_style") || "白描"
      })
    })).json();

    if (res.checkResult) {
      const r = res.checkResult;
      await playDiceRollAnimation(r);
      const outcomeColor = r.autoFail || !r.success ? "text-red-400" : "text-emerald-400";
      appendFeedBlock(
        `<span class="${outcomeColor}">SYSTEM.CHECK // ${r.autoFail ? "自動失敗" : (r.success ? "SUCCESS" : "FAILURE")}</span>`,
        `${r.note?.join(" + ")} ➔ 成功數: <span class="text-zinc-200 font-bold">${r.totalSuccesses}</span> (DC: ${r.dc}) 骰面: [${r.rolls?.join(",")}]`,
        "font-mono text-xs text-zinc-500 bg-panel/70 p-2.5 rounded border hairline-border hud-corners"
      );
    }

    if (res.narration) {
      appendNarrationBlock(res.narration);
    }

    renderOptions(res.options || []);
    if (res.turnCount) document.getElementById("turn-counter").textContent = res.turnCount;
    if (res.scenario) updateScenarioHud(res.scenario);
  } catch (err) {
    appendFeedBlock("SYSTEM.ERROR", `回合執行失敗: ${err.message}`, "text-xs text-red-400 font-mono");
  } finally {
    turnInFlight = false;
  }
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

  const titleEl = document.getElementById("scenario-node-title");
  if (scenario.progress?.scenarioComplete) {
    titleEl.innerHTML = `<i class="fas fa-flag-checkered"></i> 主線已完成`;
  } else if (node.isFinale) {
    titleEl.innerHTML = `<i class="fas fa-skull-crossbones text-red-400"></i> ${escapeHtml(node.title)}`;
  } else {
    titleEl.textContent = node.title;
  }

  const pct = scenario.progress?.overallCompletionPct ?? 0;
  document.getElementById("scenario-progress-bar").style.width = `${pct}%`;
  document.getElementById("scenario-progress-text").textContent = `${pct}%`;

  const badge = document.getElementById("scenario-time-badge");
  const status = scenario.progress?.timeStatus;
  if (status) {
    badge.textContent = `時間：${status}`;
    badge.className = `ml-auto px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 ${TIME_STATUS_STYLE[status] ?? ""}`;
  } else {
    badge.textContent = "";
    badge.className = "ml-auto px-2 py-0.5 rounded border text-[10px] font-bold shrink-0";
  }

  const combatBtn = document.getElementById("combat-start-btn");
  if (combatBtn) combatBtn.classList.toggle("pulse-glow", Boolean(node?.isFinale));
}

function renderOptions(options) {
  currentOptions = options;
  const grid = document.getElementById("option-grid");
  if (!options || options.length === 0) {
    grid.innerHTML = `<div class="col-span-2 text-xs font-mono text-zinc-400 p-2.5 border hairline-border border-dashed text-center rounded">本回合無預設選項，請於下方自訂行動。</div>`;
    return;
  }

  grid.innerHTML = options.map((opt, i) => `
    <button onclick="selectOption(${i})" class="anim-fade-up text-left p-2.5 pl-3 rounded bg-panel hover:bg-zinc-800 border hairline-border hover:border-emerald-500/40 transition-all hover:-translate-y-px hover:shadow-[0_8px_20px_-10px_rgba(16,185,129,0.4)] flex items-start gap-2.5 text-xs" style="animation-delay:${i * .06}s">
      <span class="shrink-0 w-5 h-5 mt-0.5 flex items-center justify-center rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] font-bold">${i+1}</span>
      <span class="flex flex-col gap-1">
        <span class="font-bold text-zinc-100">${escapeHtml(opt.label)}</span>
        <span class="text-[11px] font-mono text-zinc-400">
          檢定: ${escapeHtml(opt.attribute)}${opt.skill ? ' + ' + escapeHtml(opt.skill) : ''} · ${escapeHtml(opt.difficulty)} (DC${opt.dc})
        </span>
      </span>
    </button>`).join("");
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
  const bar = document.getElementById(barId);
  const prevKey = bar.dataset.hpKey;
  const nextKey = `${hpState.intact}-${hpState.B}-${hpState.L}-${hpState.A}`;
  bar.innerHTML = "";
  bar.style.gridTemplateColumns = `repeat(${hpState.max}, minmax(0, 1fr))`;
  const segments = [
    ...Array(hpState.intact).fill("hp-seg hp-seg-intact"),
    ...Array(hpState.B).fill("hp-seg hp-seg-b"),
    ...Array(hpState.L).fill("hp-seg hp-seg-l"),
    ...Array(hpState.A).fill("hp-seg hp-seg-a"),
  ];
  segments.forEach((cls) => {
    const d = document.createElement("div");
    d.className = cls;
    bar.appendChild(d);
  });
  bar.dataset.hpKey = nextKey;
  if (prevKey && prevKey !== nextKey) {
    flashElement(bar);
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
