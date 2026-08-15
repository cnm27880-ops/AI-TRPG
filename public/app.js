// 無限恐怖TRPG —— 前端應用層 (精簡純淨版)

let currentCharacter = null;
let currentOptions = [];
let turnInFlight = false;
let currentSessionId = null;
let chargenRules = null;
let hasAttemptedSubmit = false; // 標記：是否已經按過提交，未按過前不顯示紅字報錯

const SESSION_KEY = "ai-trpg-session-id";

const ATTRIBUTE_DISPLAY = [
  { key: "力量", en: "STR" },
  { key: "敏捷", en: "DEX" },
  { key: "耐力", en: "CON" },
  { key: "智力", en: "INT" },
  { key: "感知", en: "PER" },
  { key: "決心", en: "WIL" },
  { key: "風度", en: "PRE" },
  { key: "操控", en: "MAN" },
  { key: "沉著", en: "COM" },
];

const chargenDraft = {
  concept: { name: "", gender: "", age: null, background: "" },
  attributeCategoryAllocation: {},
  attributes: {},
  skillCategoryAllocation: {},
  skills: {},
  specializations: {},
};

function legendaryAttributeBonus(val) {
  return Math.max(0, Math.floor((val - 1) / 5));
}

// --- 建卡初始化 ---
async function startNewChargen() {
  hasAttemptedSubmit = false;
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

  const a = chargenRules.attributes;
  const sk = chargenRules.skills;

  for (const key of a.keys) chargenDraft.attributes[key] = a.startValue;
  for (const list of Object.values(sk.byCategory)) {
    for (const name of list) chargenDraft.skills[name] = sk.startValue;
  }

  renderAllocPickers();
  renderChargenAttributes();
  renderChargenSkills();
  renderSpecInputs();
  await validateChargen(false); // 初始驗證，不顯示紅字
}

function renderAllocPickers() {
  const build = (containerId, categories, budgets, target) => {
    const el = document.getElementById(containerId);
    el.innerHTML = categories.map(cat => `
      <label class="flex items-center gap-1 bg-zinc-950 border hairline-border px-2 py-1 rounded">
        <span class="text-zinc-400">${cat}</span>
        <select data-alloc="${target}" data-cat="${cat}" class="bg-transparent text-emerald-400 font-bold focus:outline-none">
          <option value="">—</option>
          ${budgets.map(b => `<option value="${b}">${b} 點</option>`).join("")}
        </select>
      </label>`).join("");
  };

  build("cg-attr-alloc", Object.keys(chargenRules.attributes.byCategory), chargenRules.attributes.categoryBudgets, "attributeCategoryAllocation");
  build("cg-skill-alloc", Object.keys(chargenRules.skills.byCategory), chargenRules.skills.categoryBudgets, "skillCategoryAllocation");

  document.querySelectorAll("[data-alloc]").forEach(sel => {
    sel.addEventListener("change", () => {
      const bucket = chargenDraft[sel.dataset.alloc];
      if (sel.value === "") delete bucket[sel.dataset.cat];
      else bucket[sel.dataset.cat] = Number(sel.value);
      validateChargen(hasAttemptedSubmit);
    });
  });
}

function stepperHtml(kind, name, value, min, max) {
  return `
    <div class="flex items-center justify-between bg-zinc-950 border hairline-border px-2.5 py-1.5 rounded text-xs font-mono">
      <span class="text-zinc-300">${name}</span>
      <span class="flex items-center gap-2">
        <button data-step="${kind}" data-name="${name}" data-delta="-1" class="w-5 h-5 border hairline-border rounded hover:bg-zinc-800 leading-none disabled:opacity-30" ${value <= min ? "disabled" : ""}>−</button>
        <span class="w-4 text-center font-bold text-emerald-400">${value}</span>
        <button data-step="${kind}" data-name="${name}" data-delta="1" class="w-5 h-5 border hairline-border rounded hover:bg-zinc-800 leading-none disabled:opacity-30" ${value >= max ? "disabled" : ""}>+</button>
      </span>
    </div>`;
}

function renderChargenAttributes() {
  const a = chargenRules.attributes;
  document.getElementById("cg-attr-grid").innerHTML = Object.entries(a.byCategory).map(([cat, list]) => `
    <div class="space-y-1.5">
      <div class="text-[10px] font-mono text-zinc-500 uppercase">${cat}屬性</div>
      ${list.map(x => stepperHtml("attr", x.key, chargenDraft.attributes[x.key], a.startValue, a.cap)).join("")}
    </div>`).join("");
}

function renderChargenSkills() {
  const sk = chargenRules.skills;
  document.getElementById("cg-skill-grid").innerHTML = Object.entries(sk.byCategory).map(([cat, list]) => `
    <div class="space-y-1.5">
      <div class="text-[10px] font-mono text-zinc-500 uppercase">${cat}技能</div>
      ${list.map(n => stepperHtml("skill", n, chargenDraft.skills[n], sk.startValue, sk.cap)).join("")}
    </div>`).join("");
}

function renderSpecInputs() {
  const count = chargenRules.specializations.free;
  document.getElementById("cg-spec-list").innerHTML = Array.from({ length: count }).map((_, i) => `
    <div class="flex gap-2">
      <select data-spec-skill="${i}" class="flex-1 bg-zinc-950 border hairline-border px-2 py-1.5 text-xs font-mono rounded text-zinc-300">
        <option value="">（不使用此專業名額）</option>
      </select>
      <input data-spec-name="${i}" type="text" placeholder="專業名稱 (例: 步槍)" class="flex-1 bg-zinc-950 border hairline-border px-2 py-1.5 text-xs rounded text-zinc-200">
    </div>`).join("");
  refreshSpecSkillOptions();

  document.getElementById("cg-spec-list").addEventListener("change", collectSpecializations);
  document.getElementById("cg-spec-list").addEventListener("input", collectSpecializations);
}

function refreshSpecSkillOptions() {
  const trained = Object.entries(chargenDraft.skills).filter(([, lv]) => lv >= 1).map(([name]) => name);
  document.querySelectorAll("[data-spec-skill]").forEach(sel => {
    const current = sel.value;
    sel.innerHTML = `<option value="">（不使用此專業名額）</option>` + trained.map(n => `<option value="${n}">${n}</option>`).join("");
    if (trained.includes(current)) sel.value = current;
  });
}

function collectSpecializations() {
  const specs = {};
  document.querySelectorAll("[data-spec-skill]").forEach(sel => {
    const i = sel.dataset.specSkill;
    const nameInput = document.querySelector(`[data-spec-name="${i}"]`);
    const skill = sel.value;
    const specName = nameInput?.value.trim();
    if (skill && specName) (specs[skill] ??= []).push(specName);
  });
  chargenDraft.specializations = specs;
  validateChargen(hasAttemptedSubmit);
}

async function validateChargen(showErrors = true) {
  chargenDraft.concept.name = document.getElementById("cg-name").value.trim();
  chargenDraft.concept.gender = document.getElementById("cg-gender").value.trim();
  const ageRaw = document.getElementById("cg-age").value;
  chargenDraft.concept.age = ageRaw ? Number(ageRaw) : null;
  chargenDraft.concept.background = document.getElementById("cg-background").value.trim();

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

  const budgetText = b => b ? `花費 ${b.totalCost}/${b.totalBudget} (剩 ${b.remaining})` : "—";
  document.getElementById("cg-attr-budget").textContent = budgetText(data.budgets?.attributes);
  document.getElementById("cg-skill-budget").textContent = budgetText(data.budgets?.skills);
  document.getElementById("cg-spec-budget").textContent = `已選 ${data.budgets?.specializations?.totalSpecs || 0} / 3`;

  // 只有按了送出且有錯時才顯示紅字，否則保持乾淨
  if (showErrors && data.errors && data.errors.length > 0) {
    document.getElementById("cg-errors").innerHTML = `
      <div class="p-3 bg-red-500/10 border border-red-500/40 rounded text-xs font-mono text-red-400 space-y-1">
        ${data.errors.map(e => `<div>• ${e}</div>`).join("")}
      </div>`;
  } else {
    document.getElementById("cg-errors").innerHTML = "";
  }

  const d = data.character?.derived;
  if (d) {
    document.getElementById("cg-derived").textContent = `預覽衍生：生命 ${d.hp.max} · 意志 ${d.willpower.max} · 先攻 ${d.initiative} · 防御 ${d.baseDefense}`;
  }

  return data.valid;
}

// --- 遊戲運行 ---
async function startNewGame() {
  hasAttemptedSubmit = true;
  const isValid = await validateChargen(true);
  if (!isValid) return;

  const submitBtn = document.getElementById("cg-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = "正在傳送進輪迴世界...";

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
  hpBar.innerHTML = "";
  hpBar.style.gridTemplateColumns = `repeat(${hp.max}, minmax(0, 1fr))`;
  const segments = [
    ...Array(hp.intact).fill("bg-emerald-500"),
    ...Array(hp.B).fill("bg-yellow-500"),
    ...Array(hp.L).fill("bg-orange-500"),
    ...Array(hp.A).fill("bg-red-600"),
  ];
  segments.forEach(cls => {
    const d = document.createElement("div");
    d.className = `${cls} rounded-xs`;
    hpBar.appendChild(d);
  });

  // 渲染九維屬性
  const attrGrid = document.getElementById("attr-grid");
  attrGrid.innerHTML = ATTRIBUTE_DISPLAY.map(({ key, en }) => {
    const val = charData.attributes[key] || 1;
    const bonus = legendaryAttributeBonus(val);
    const bonusTag = bonus > 0 ? `<span class="text-emerald-400 text-[10px]">+${bonus}★</span>` : "";
    return `
      <div class="px-2.5 py-1.5 rounded bg-zinc-900 border hairline-border flex justify-between items-center font-mono text-xs">
        <span class="text-zinc-400">${en} ${key}</span>
        <span class="font-bold text-zinc-100">${val} ${bonusTag}</span>
      </div>`;
  }).join("");
}

async function runTurn({ chosenOption, playerAction, opening } = {}) {
  if (turnInFlight) return;
  turnInFlight = true;

  if (playerAction) appendFeedBlock(`▶ 輪迴者行動`, playerAction, "font-mono italic text-emerald-400/80");

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
      appendFeedBlock(
        `SYSTEM.CHECK // ${r.autoFail ? "自動失敗" : (r.success ? "SUCCESS" : "FAILURE")}`,
        `${r.note?.join(" + ")} ➔ 成功數: ${r.totalSuccesses} (DC: ${r.dc}) 骰面: [${r.rolls?.join(",")}]`,
        "font-mono text-xs text-zinc-400 bg-zinc-900/60 p-2.5 rounded border hairline-border"
      );
    }

    if (res.narration) {
      appendFeedBlock("說書人", res.narration, "leading-relaxed whitespace-pre-wrap text-zinc-200");
    }

    renderOptions(res.options || []);
    if (res.turnCount) document.getElementById("turn-counter").textContent = res.turnCount;
  } catch (err) {
    appendFeedBlock("SYSTEM.ERROR", `回合執行失敗: ${err.message}`, "text-xs text-red-400 font-mono");
  } finally {
    turnInFlight = false;
  }
}

function renderOptions(options) {
  currentOptions = options;
  const grid = document.getElementById("option-grid");
  if (!options || options.length === 0) {
    grid.innerHTML = `<div class="col-span-2 text-xs font-mono text-zinc-500 p-2 border hairline-border border-dashed text-center">本回合無預設選項，請於下方自訂行動。</div>`;
    return;
  }

  grid.innerHTML = options.map((opt, i) => `
    <button onclick="selectOption(${i})" class="text-left p-2.5 rounded bg-zinc-900 hover:bg-zinc-800 border hairline-border transition flex flex-col gap-1 text-xs">
      <div class="font-bold text-zinc-200 flex items-center gap-1.5">
        <span class="text-emerald-400 font-mono">[${i+1}]</span> ${opt.label}
      </div>
      <div class="text-[10px] font-mono text-zinc-500">
        檢定: ${opt.attribute}${opt.skill ? ' + ' + opt.skill : ''} · ${opt.difficulty} (DC${opt.dc})
      </div>
    </button>`).join("");
}

function selectOption(index) {
  const opt = currentOptions[index];
  if (opt) runTurn({ chosenOption: opt });
}

function appendFeedBlock(title, content, extraClass = "") {
  const feed = document.getElementById("story-feed");
  const block = document.createElement("div");
  block.className = `space-y-1 ${extraClass}`;
  block.innerHTML = `<div class="text-[11px] font-bold opacity-75 font-mono">${title}</div><div>${content}</div>`;
  feed.appendChild(block);
  feed.scrollTop = feed.scrollHeight;
}

// --- 首頁存檔接續 ---
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
      if (h.action) appendFeedBlock("▶ 輪迴者行動", h.action, "font-mono italic text-emerald-400/80");
      if (h.narration) appendFeedBlock("說書人", h.narration, "leading-relaxed whitespace-pre-wrap text-zinc-200");
    });

    renderOptions(res.session.scene?.options || []);
    if (!(res.session.scene?.options || []).length) await runTurn({ opening: true });
    return true;
  } catch {
    return false;
  }
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

  // Stepper 事件委派
  for (const gridId of ["cg-attr-grid", "cg-skill-grid"]) {
    document.getElementById(gridId)?.addEventListener("click", e => {
      const btn = e.target.closest("[data-step]");
      if (!btn) return;
      const { step, name, delta } = btn.dataset;
      const bucket = step === "attr" ? chargenDraft.attributes : chargenDraft.skills;
      const rules = step === "attr" ? chargenRules.attributes : chargenRules.skills;
      const next = bucket[name] + Number(delta);
      if (next < rules.startValue || next > rules.cap) return;
      bucket[name] = next;
      if (step === "attr") renderChargenAttributes();
      else {
        renderChargenSkills();
        refreshSpecSkillOptions();
        collectSpecializations();
      }
      validateChargen(hasAttemptedSubmit);
    });
  }

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
