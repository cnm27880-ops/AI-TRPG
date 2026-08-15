// 無限恐怖TRPG —— 前端應用層
//
// [重要契約] 這個檔案裡的角色卡形狀必須跟 core/schema.js 的 emptyCharacter() 完全一致，
// 因為它會被原封不動地 POST 給 /api/check 與 /api/narrate，後端直接餵給 core/check.js 的
// performCheck()。任何欄位名稱對不上，後端不是算錯，是直接丟例外。具體來說：
//   - attributes 的 key 是中文九維屬性(力量/敏捷/耐力/智力/感知/決心/風度/操控/沉著)，
//     不是 STR/DEX/INT/WIL。數值範圍是建卡的 1~5(傳奇屬性 6 以上要靠 XP 成長)，
//     不是 D&D 那種 10~18。
//   - 沒有「等級/職業/attribute modifier」這種東西，那是D&D的概念，這套規則沒有。
//     屬性帶來的加值是「傳奇屬性附加成功」= floor((屬性值-1)/5)，屬性6才開始有。
//   - 生命值是四段傷勢軌 {max, intact, B, L, A}(完好/沖擊/嚴重/惡性)，
//     不是 current/max 這種單一數字條。見 core/health.js。
//
// [已知簡化] 目前的角色卡是寫死在前端的示範角色，還沒有真正的建卡流程與存檔後端，
// 所以重新整理頁面就會回到初始狀態。要做成真的遊戲需要 /api/character + 持久化儲存，
// 見 README 的後續工作說明。

// --- 應用狀態 ---
let currentCharacter = null;
let currentScenarioId = "SCENARIO-01";
let backendOnline = null; // null=尚未測試, true/false=最近一次API呼叫的結果
// 最近一次敘事實際由哪一家AI產生。刻意顯示出來：自動偵測會在沒設金鑰時退到Workers AI，
// 沒有這個顯示的話，你會以為自己在用Gemini、其實一直在用退路供應商而不自知。
let lastProvider = null;
// 這一回合 AI 提出、且已通過後端規則查驗的選項
let currentOptions = [];
// 防連點：一個回合送出後到收到回應之前，不接受第二次送出（否則會擲兩次骰）
let turnInFlight = false;
// 目前這場遊戲的存檔ID。存在 localStorage，重整頁面靠它接續。
let currentSessionId = null;

// 屬性顯示順序與英文縮寫，順序沿用 core/schema.js 的 ATTRIBUTES
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

// 資源卡分類 -> 固定的Tailwind class字串。
// 刻意不用 `bg-${x}-100` 這種動態拼接：Tailwind只會產生它在原始碼裡「literally看得到」的class，
// 拼出來的字串在正式build(非CDN)下會直接沒有樣式。
const CARD_STYLES = {
  cyber: {
    badge:
      "bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 border-cyan-300 dark:border-cyan-800/50",
  },
  title: {
    badge:
      "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800/50",
  },
  blood: {
    badge:
      "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800/50",
  },
  default: {
    badge:
      "bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700",
  },
};

/**
 * 傳奇屬性附加成功 —— 必須跟 core/dice.js 的 legendaryAttributeBonus() 保持一致。
 * 這裡重算一次純粹是為了「顯示」，實際判定一律以後端回傳的數字為準，前端不做任何規則運算。
 */
function legendaryAttributeBonus(attributeValue) {
  return Math.max(0, Math.floor((attributeValue - 1) / 5));
}

/**
 * 資源卡的顯示資料。
 * [已知簡化] 還沒接上 content/packs/ 的真實資源包，也還沒有「把資源效果套用到角色身上」的機制
 * （見 content/loader.js 與 README 的待辦）。目前純粹是側欄的展示內容。
 */
function placeholderTraits() {
  return [
    {
      title: "光學視覺補正器",
      type: "義體 CYBERNETIC",
      category: "cyber",
      desc: "進行感知相關檢定時，骰池 +1。",
      tags: ["耐久: 100%", "D級"],
    },
    {
      title: "邊緣獵手",
      type: "稱號 TITLE",
      category: "title",
      desc: "在低光或廢墟環境中進行躲藏檢定時，骰池 +2。",
      tags: ["被動生效", "D級"],
    },
    {
      title: "自癒基因微粒",
      type: "血脈 BLOODLINE",
      category: "blood",
      desc: "每場戰鬥結束後，恢復 2 點沖擊傷(B → 完好)。",
      tags: ["冷卻: 1 場戰鬥", "等級 1"],
    },
  ];
}

// --- 角色面板渲染 ---

function renderCharacter(charData) {
  setText("char-name", charData.concept.name);
  setText("char-class", `輪迴者 / 未使用XP ${charData.xp.earned - charData.xp.spent}`);

  renderHp(charData.derived.hp);
  renderAttributes(charData.attributes);
}

/**
 * 渲染四段傷勢軌。這套規則沒有「剩餘HP」的概念，20點生命的角色受傷後總量永遠還是20，
 * 只是從「完好」被轉換成 沖擊(B)/嚴重(L)/惡性(A)，所以進度條要分四段畫，不是畫一條剩餘量。
 */
function renderHp(hp) {
  const intactText = `${hp.intact} <span class="text-zinc-500">/</span> ${hp.max}`;
  const detail = `B${hp.B} L${hp.L} A${hp.A}`;

  setHtml("hp-text", intactText);
  setText("hp-detail", `完好 ${hp.intact} ・ 沖擊 ${hp.B} ・ 嚴重 ${hp.L} ・ 惡性 ${hp.A}`);
  setText("mobile-hp-text", `完好 ${hp.intact}/${hp.max} (${detail})`);

  const container = document.getElementById("hp-bar-container");
  if (!container) return;

  // 一格 = 一點生命，直接照傷勢軌的實際點數上色，不做比例換算(避免四捨五入騙人)
  container.innerHTML = "";
  container.style.gridTemplateColumns = `repeat(${hp.max}, minmax(0, 1fr))`;

  const segments = [
    ...Array(hp.intact).fill("bg-emerald-500"),
    ...Array(hp.B).fill("bg-yellow-500"),
    ...Array(hp.L).fill("bg-orange-500"),
    ...Array(hp.A).fill("bg-red-600"),
  ];

  for (const cls of segments) {
    const seg = document.createElement("div");
    seg.className = `${cls} rounded-sm`;
    container.appendChild(seg);
  }
}

function renderAttributes(attributes) {
  const grid = document.getElementById("attr-grid");
  if (!grid) return;

  grid.innerHTML = ATTRIBUTE_DISPLAY.map(({ key, en }) => {
    const value = attributes[key] ?? 0;
    const bonus = legendaryAttributeBonus(value);
    // 傳奇屬性附加成功才是這套規則的「加值」，D&D那種 modifier 在這裡不存在
    const bonusHtml = bonus > 0
      ? `<span class="text-emerald-500 text-[10px]" title="傳奇屬性附加成功">+${bonus}★</span>`
      : `<span class="text-zinc-500 text-[10px]">—</span>`;

    return `
      <div class="px-2.5 py-1.5 rounded bg-zinc-100 dark:bg-zinc-900/90 border hairline-border flex justify-between items-center hud-corner-box transition-colors">
        <span class="text-zinc-500 dark:text-zinc-400">${en} ${key}</span>
        <span class="font-bold text-zinc-800 dark:text-zinc-100">${value} ${bonusHtml}</span>
      </div>`;
  }).join("");

  const mobileSummary = ATTRIBUTE_DISPLAY.slice(0, 3)
    .map(({ key, en }) => `${en} ${attributes[key] ?? 0}`)
    .join(" | ");
  setText("mobile-attr-text", mobileSummary);
}

function renderCards(traits) {
  const stackContainer = document.getElementById("cardStack");
  if (!stackContainer) return;

  const stateClasses = ["active", "behind-1", "behind-2"];

  stackContainer.innerHTML = traits
    .map((trait, index) => {
      const style = CARD_STYLES[trait.category] ?? CARD_STYLES.default;
      const stateClass = stateClasses[index] ?? "behind-2";
      return `
      <div id="card-${index + 1}" class="stack-card ${stateClass} asymmetric-card p-3.5 bg-zinc-100 dark:bg-zinc-900 border hairline-border space-y-1.5 shadow-xl transition-colors">
        <div class="flex items-center justify-between">
          <span class="px-1.5 py-0.5 text-[9px] font-mono font-bold border rounded-sm ${style.badge}">${escapeHtml(trait.type)}</span>
        </div>
        <h4 class="text-xs font-bold text-zinc-800 dark:text-zinc-100">${escapeHtml(trait.title)}</h4>
        <p class="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug font-sans">${escapeHtml(trait.desc)}</p>
        <div class="pt-1 flex justify-between items-center text-[9px] font-mono text-zinc-500">
          <span>${escapeHtml(trait.tags[0] ?? "")}</span>
          <span>${escapeHtml(trait.tags[1] ?? "")}</span>
        </div>
      </div>`;
    })
    .join("");

  // 卡片堆疊的循環狀態要跟著重建後的卡片數量重設，否則點擊切換會抓到不存在的 id
  window.resetCardCycle?.(traits.length);
}

// --- 敘事流渲染 ---

function appendPlayerActionBlock(actionText) {
  appendToFeed(`
    <div class="bg-zinc-200/50 dark:bg-zinc-900/80 border hairline-border p-4 rounded-sm text-zinc-900 dark:text-zinc-200 transition-colors animate-fade-in">
      <p class="italic text-sm text-zinc-600 dark:text-zinc-400 mb-1 transition-colors font-mono">▶ Player Intent</p>
      <p>${escapeHtml(actionText)}</p>
    </div>`);
}

function appendDMNarrationBlock(narrationText, promptQuestion) {
  let html = `
    <div class="border-l hairline-border pl-4 animate-fade-in">
      <p class="text-zinc-800 dark:text-zinc-300 leading-relaxed transition-colors whitespace-pre-wrap">${escapeHtml(narrationText)}</p>
    </div>`;

  if (promptQuestion) {
    html += `
    <div class="border-l-2 border-emerald-500 pl-4 animate-fade-in">
      <p class="font-bold text-zinc-900 dark:text-zinc-100 transition-colors">${escapeHtml(promptQuestion)}</p>
    </div>`;
  }
  appendToFeed(html);
}

/**
 * 顯示判定結果。這裡刻意把後端算出來的每一個數字都攤開來顯示(骰池/原始成功/附加成功/懲罰)，
 * 因為整個專案的設計原則就是「規則運算全部由引擎負責、AI只負責敘事」，
 * 玩家要能看到引擎到底怎麼算的，才不會覺得AI在黑箱裡偷改結果。
 */
function appendCheckResultBlock(result) {
  if (result.autoFail) {
    appendToFeed(`
      <div class="bg-zinc-200/50 dark:bg-zinc-950/80 border hairline-border p-3 font-mono text-xs hud-corner-box transition-colors animate-fade-in">
        <div class="text-zinc-600 dark:text-zinc-500 mb-1">SYSTEM.CHECK_RESOLUTION</div>
        <div class="flex justify-between items-center text-sm">
          <span class="text-zinc-900 dark:text-zinc-300">檢定結果</span>
          <span class="text-red-600 dark:text-red-500">AUTO FAIL</span>
        </div>
        <div class="text-zinc-600 dark:text-zinc-500 mt-1">${escapeHtml(result.reason ?? "")}</div>
      </div>`);
    return;
  }

  const statusClass = result.success
    ? "text-emerald-600 dark:text-emerald-500"
    : "text-red-600 dark:text-red-500";
  const statusText = result.success ? "SUCCESS" : "FAILURE";
  const fumbleTag = result.fumble
    ? ` <span class="text-red-500">/ FUMBLE 大失敗</span>`
    : "";
  const fortuneTag = result.isFortuneDie ? "機運骰" : `骰池 ${result.dp}`;

  const breakdown = [
    `原始成功 ${result.rawSuccesses}`,
    `附加成功 +${result.bonusSuccessesApplied}`,
    result.flatPenaltyApplied ? `固定扣減 -${result.flatPenaltyApplied}` : null,
  ]
    .filter(Boolean)
    .join(" ・ ");

  appendToFeed(`
    <div class="bg-zinc-200/50 dark:bg-zinc-950/80 border hairline-border p-3 font-mono text-xs hud-corner-box transition-colors animate-fade-in">
      <div class="text-zinc-600 dark:text-zinc-500 mb-1">SYSTEM.CHECK_RESOLUTION</div>
      <div class="flex justify-between items-center text-sm">
        <span class="text-zinc-900 dark:text-zinc-300">${escapeHtml((result.note ?? []).join(" + ")) || "檢定結果"}</span>
        <span class="${statusClass}">${statusText}${fumbleTag}</span>
      </div>
      <div class="text-zinc-600 dark:text-zinc-500 mt-1">
        ${fortuneTag} = 成功數 <span class="text-zinc-900 dark:text-zinc-200">${result.totalSuccesses}</span> vs 難度 (${result.dc})
      </div>
      <div class="text-zinc-500 dark:text-zinc-600 mt-1">${breakdown}</div>
      <div class="text-zinc-500 dark:text-zinc-600 mt-1 break-all">骰面: ${(result.rolls ?? []).join(", ")}</div>
    </div>`);
}

/**
 * API失敗時顯示的錯誤區塊。
 * [刻意設計] 這裡不再像舊版那樣「API失敗就用 Math.random() 生一個假的成功結果」——
 * 那會讓玩家與開發者都無法分辨「引擎真的算出成功」跟「後端根本沒接上」，
 * 是這個專案最不能接受的一種錯誤(整套架構的前提就是數字必須來自引擎)。
 */
function appendSystemErrorBlock(message) {
  backendOnline = false;
  updateBackendBadge();
  appendToFeed(`
    <div class="border border-red-500/50 bg-red-500/5 p-3 font-mono text-xs text-red-600 dark:text-red-400 rounded-sm animate-fade-in">
      <div class="font-bold mb-1">SYSTEM.ERROR</div>
      <div class="break-words">${escapeHtml(message)}</div>
      <div class="mt-1 text-red-500/70">後端規則引擎未回應，本回合沒有產生任何判定結果。請確認已部署到 Cloudflare Pages(見 DEPLOYMENT.md)。</div>
    </div>`);
}

/**
 * 顯示規則查驗過程中的修正。
 * 例如 AI 挑了一個不存在的技能而被降級成純屬性檢定——這種事必須讓玩家/開發者看得到，
 * 靜靜修掉的話，你永遠不會知道你的 AI 供應商其實常常在亂挑技能。
 */
function appendWarningBlock(warnings) {
  const items = warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("");
  appendToFeed(`
    <div class="border-l-2 border-amber-500/60 pl-3 py-1 font-mono text-[10px] text-amber-700 dark:text-amber-500/80 animate-fade-in">
      <div class="font-bold mb-0.5">SYSTEM.RULE_CHECK</div>
      <ul class="list-disc list-inside space-y-0.5">${items}</ul>
    </div>`);
}

/** 重新載入存檔時，把完整的判定紀錄摘要顯示出來 */
function renderJournal(events) {
  const checks = events.filter((e) => e.type === "check");
  if (checks.length === 0) return;

  const rows = checks
    .map((e) => {
      const p = e.payload ?? {};
      const cls = p.success
        ? "text-emerald-600 dark:text-emerald-500"
        : "text-red-600 dark:text-red-500";
      return `<div class="flex justify-between gap-3">
        <span class="truncate">${escapeHtml(p.label ?? "")}</span>
        <span class="${cls} shrink-0">${p.success ? "成功" : "失敗"} ${p.totalSuccesses}/${p.dc}</span>
      </div>`;
    })
    .join("");

  appendToFeed(`
    <div class="border hairline-border bg-zinc-100/60 dark:bg-zinc-900/60 p-3 font-mono text-[10px] text-zinc-600 dark:text-zinc-400 rounded-sm">
      <div class="font-bold mb-1.5 text-zinc-500">SAVE.JOURNAL　共 ${checks.length} 次判定</div>
      <div class="space-y-0.5">${rows}</div>
    </div>`);
}

function appendToFeed(html) {
  const feed = document.getElementById("story-feed");
  if (!feed) return;
  feed.insertAdjacentHTML("beforeend", html);
  feed.scrollTop = feed.scrollHeight;
}

function updateBackendBadge() {
  const badge = document.getElementById("backend-status");
  if (!badge) return;
  if (backendOnline === true) {
    badge.textContent = lastProvider ? `ENGINE ONLINE · ${lastProvider}` : "ENGINE ONLINE";
    badge.className =
      "px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono";
  } else if (backendOnline === false) {
    badge.textContent = "ENGINE OFFLINE";
    badge.className =
      "px-2 py-0.5 rounded bg-red-500/10 border border-red-500/40 text-red-600 dark:text-red-400 text-[10px] font-mono";
  } else {
    badge.textContent = "ENGINE ?";
    badge.className =
      "px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border hairline-border text-zinc-500 text-[10px] font-mono";
  }
}

// --- API 呼叫 ---

// --- 選項渲染 ---

/**
 * 畫出 AI 提出、引擎查驗過的行動選項。
 *
 * [刻意設計] 每個選項都把它對應的「屬性+技能・難度」直接顯示在按鈕上。
 * 這不是裝飾：玩家有權在下注前知道自己要賭什麼。整個專案的原則就是引擎的運算要攤開來，
 * 如果選項的檢定藏起來，玩家就無法判斷「用我練過的槍械」還是「用沒練過的神秘學」，
 * 那四個選項就變成瞎猜，選擇本身失去意義。
 */
function renderOptions(options) {
  currentOptions = Array.isArray(options) ? options : [];

  const desktop = document.getElementById("option-grid");
  const mobile = document.getElementById("option-grid-mobile");

  if (currentOptions.length === 0) {
    const empty = `<div class="col-span-2 text-xs font-mono text-zinc-500 border hairline-border border-dashed p-3 text-center">
      本回合沒有可用選項，請用下方的自訂行動繼續
    </div>`;
    if (desktop) desktop.innerHTML = empty;
    if (mobile) mobile.innerHTML = empty;
    return;
  }

  const html = currentOptions
    .map((opt, i) => {
      // 檢定摘要：力量 + 運動・困難 (DC3)
      const skillPart = opt.skill ? ` + ${escapeHtml(opt.skill)}` : "";
      const specPart = opt.specialization ? `(${escapeHtml(opt.specialization)})` : "";
      const check = `${escapeHtml(opt.attribute)}${skillPart}${specPart}`;
      return `
      <button data-option-index="${i}" class="text-left bg-zinc-100 dark:bg-zinc-900 border hairline-border p-2.5 text-sm text-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition asymmetric-card">
        <div class="flex items-start gap-2">
          <span class="font-mono text-xs text-zinc-500 shrink-0 mt-0.5">[${i + 1}]</span>
          <span class="leading-snug">${escapeHtml(opt.label)}</span>
        </div>
        <div class="mt-1.5 pl-6 font-mono text-[10px] text-zinc-500 flex items-center gap-1.5">
          <span class="text-emerald-600 dark:text-emerald-500">${check}</span>
          <span class="text-zinc-400 dark:text-zinc-600">・</span>
          <span>${escapeHtml(opt.difficulty)} DC${opt.dc}</span>
        </div>
      </button>`;
    })
    .join("");

  if (desktop) desktop.innerHTML = html;
  if (mobile) mobile.innerHTML = html;
}

/** 送出回合期間把選項鎖住，避免玩家連點造成兩次擲骰。 */
function setOptionsDisabled(disabled) {
  document.querySelectorAll("[data-option-index]").forEach((btn) => {
    btn.disabled = disabled;
    btn.classList.toggle("opacity-40", disabled);
    btn.classList.toggle("pointer-events-none", disabled);
  });
}

// --- 回合迴圈 ---

/**
 * 跑一個回合。
 *
 * [刻意設計] 這裡**不**決定「這次行動要用哪個屬性搭哪個技能」。
 * 選項模式下那個組合是 AI 挑的（規則書把這件事指派給 ST），並且由後端重新查驗過；
 * 自訂行動模式下則由後端的 content/checkIntent.js 推導。兩條路徑都在伺服器端，
 * 因為那是規則決定，必須待在測得到的地方（ARCHITECTURE.md 最高原則第1條）。
 *
 * @param {object} params
 * @param {object} [params.chosenOption] 玩家點選的選項（原封不動送回後端重新查驗）
 * @param {string} [params.playerAction] 玩家自己打的行動文字
 * @param {boolean} [params.opening] 開場模式：不擲骰，只要場景敘述與第一批選項
 */
async function runTurn({ chosenOption, playerAction, opening } = {}) {
  if (turnInFlight) return;
  turnInFlight = true;
  setOptionsDisabled(true);

  const actionLabel = chosenOption?.label ?? playerAction;
  if (actionLabel) appendPlayerActionBlock(actionLabel);
  if (chosenOption) window.openDiceModal?.();

  let res;
  try {
    res = await fetch("/api/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: currentSessionId,
        // 沒有存檔時才會用到這個(相容模式)。有存檔的話後端一律以存檔裡的角色卡為準，
        // 不吃前端送的——否則改一下 localStorage 就能把屬性改成99。
        character: currentSessionId ? undefined : currentCharacter,
        chosenOption,
        playerAction,
      }),
    });
  } catch (err) {
    window.showDiceError?.();
    appendSystemErrorBlock(`無法連線到 /api/turn：${err.message}`);
    turnInFlight = false;
    setOptionsDisabled(false);
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    window.showDiceError?.();
    appendSystemErrorBlock(`/api/turn 回傳的不是合法JSON(HTTP ${res.status})`);
    turnInFlight = false;
    setOptionsDisabled(false);
    return;
  }

  backendOnline = true;
  if (data.provider) lastProvider = data.model ? `${data.provider}/${data.model}` : data.provider;
  updateBackendBadge();

  // 規則層的結果一定先畫出來 —— 就算敘事層失敗，判定也已經真的發生了。
  if (data.checkResult) {
    const r = data.checkResult;
    const formula = r.autoFail
      ? r.reason
      : `${(r.note ?? []).join(" + ")} → 成功數 ${r.totalSuccesses} vs 難度 ${r.dc}`;
    window.showDiceResult?.(r.autoFail ? "×" : String(r.totalSuccesses), formula);
    appendCheckResultBlock(r);
  }

  if (typeof data.persistent === "boolean") {
    updateSaveBadge({ persistent: data.persistent, hasSession: Boolean(data.sessionId) });
  }

  if (data.ok) {
    if (data.narration) appendDMNarrationBlock(data.narration);
    renderOptions(data.options);
  } else {
    if (!data.checkResult) window.showDiceError?.();
    appendSystemErrorBlock(data.error ?? `/api/turn 失敗(HTTP ${res.status})`);
    renderOptions([]);
  }

  // 查驗過程中的修正(AI挑了不存在的技能之類)如實顯示，不靜靜吞掉
  if (Array.isArray(data.warnings) && data.warnings.length > 0) {
    appendWarningBlock(data.warnings);
  }

  turnInFlight = false;
  setOptionsDisabled(false);
}

async function sendPlayerAction(actionText) {
  const text = (actionText ?? "").trim();
  if (!text) return;
  clearActionInputs();
  await runTurn({ playerAction: text });
}

// --- 小工具 ---

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHtml(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

function clearActionInputs() {
  document.querySelectorAll("[data-action-input]").forEach((input) => {
    input.value = "";
  });
}

/** 取目前可見的行動輸入框內容(桌機/手機抽屜各有一個，取有填東西的那個)。 */
function readActionInput() {
  for (const input of document.querySelectorAll("[data-action-input]")) {
    if (input.value.trim()) return input.value;
  }
  return "";
}

/** 玩家輸入與AI回傳的文字一律經過跳脫再插進DOM，避免內容裡的角括號破壞版面或被當成HTML執行 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===========================================================================
// 建卡畫面
// ===========================================================================
//
// 所有預算數字都來自 GET /api/character，前端**不寫死任何規則常數**。
// 每次玩家調整加點就打一次 POST /api/character 拿即時的預算回饋與錯誤訊息——
// 加點合不合法一律由引擎判斷，前端只負責畫出來。

let chargenRules = null;
const chargenDraft = {
  concept: { name: "", gender: "", age: null, background: "" },
  attributeCategoryAllocation: {},
  attributes: {},
  skillCategoryAllocation: {},
  skills: {},
  specializations: {},
};

async function initChargen() {
  showScreen("chargen");

  let res;
  try {
    res = await (await fetch("/api/character")).json();
  } catch (err) {
    document.getElementById("chargen-intro").textContent = `無法載入建卡規則：${err.message}`;
    return;
  }
  chargenRules = res.rules;

  const a = chargenRules.attributes;
  const sk = chargenRules.skills;
  document.getElementById("chargen-intro").textContent =
    `屬性：分類預算 ${a.categoryBudgets.join("/")} + 自由 ${a.freePoints} 點，上限 ${a.cap}（4→5 那級要花 2 點）　|　` +
    `技能：分類預算 ${sk.categoryBudgets.join("/")} + 自由 ${sk.freePoints} 點，上限 ${sk.cap}`;

  // 屬性從1開始、技能從0開始（規則書的起始值，由後端提供）
  for (const key of a.keys) chargenDraft.attributes[key] = a.startValue;
  for (const list of Object.values(sk.byCategory)) {
    for (const name of list) chargenDraft.skills[name] = sk.startValue;
  }

  renderAllocPickers();
  renderChargenAttributes();
  renderChargenSkills();
  renderSpecInputs();
  await validateChargen();
}

/** 分類預算分配：玩家決定哪個分類拿到哪個數字（例如生理3/心智2/互動1） */
function renderAllocPickers() {
  const build = (containerId, categories, budgets, target) => {
    const el = document.getElementById(containerId);
    el.innerHTML = categories
      .map(
        (cat) => `
      <label class="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 border hairline-border px-2 py-1 rounded-sm">
        <span class="text-zinc-500">${cat}</span>
        <select data-alloc="${target}" data-cat="${cat}" class="bg-transparent text-zinc-900 dark:text-zinc-100 focus:outline-none">
          <option value="">—</option>
          ${budgets.map((b) => `<option value="${b}">${b}</option>`).join("")}
        </select>
      </label>`
      )
      .join("");
  };

  const attrCats = Object.keys(chargenRules.attributes.byCategory);
  const skillCats = Object.keys(chargenRules.skills.byCategory);
  build("cg-attr-alloc", attrCats, chargenRules.attributes.categoryBudgets, "attributeCategoryAllocation");
  build("cg-skill-alloc", skillCats, chargenRules.skills.categoryBudgets, "skillCategoryAllocation");

  document.querySelectorAll("[data-alloc]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const bucket = chargenDraft[sel.dataset.alloc];
      if (sel.value === "") delete bucket[sel.dataset.cat];
      else bucket[sel.dataset.cat] = Number(sel.value);
      validateChargen();
    });
  });
}

function stepperHtml(kind, name, value, min, max) {
  return `
    <div class="flex items-center justify-between bg-zinc-100 dark:bg-zinc-900 border hairline-border px-2.5 py-1.5 rounded-sm text-xs font-mono">
      <span class="text-zinc-600 dark:text-zinc-400">${escapeHtml(name)}</span>
      <span class="flex items-center gap-2">
        <button data-step="${kind}" data-name="${escapeHtml(name)}" data-delta="-1"
          class="w-5 h-5 border hairline-border rounded-sm hover:bg-zinc-200 dark:hover:bg-zinc-800 leading-none disabled:opacity-30"
          ${value <= min ? "disabled" : ""}>−</button>
        <span class="w-4 text-center font-bold text-zinc-900 dark:text-zinc-100">${value}</span>
        <button data-step="${kind}" data-name="${escapeHtml(name)}" data-delta="1"
          class="w-5 h-5 border hairline-border rounded-sm hover:bg-zinc-200 dark:hover:bg-zinc-800 leading-none disabled:opacity-30"
          ${value >= max ? "disabled" : ""}>+</button>
      </span>
    </div>`;
}

function renderChargenAttributes() {
  const a = chargenRules.attributes;
  document.getElementById("cg-attr-grid").innerHTML = Object.entries(a.byCategory)
    .map(
      ([cat, list]) => `
      <div class="space-y-1.5">
        <div class="text-[10px] font-mono text-zinc-500">${cat}</div>
        ${list.map((x) => stepperHtml("attr", x.key, chargenDraft.attributes[x.key], a.startValue, a.cap)).join("")}
      </div>`
    )
    .join("");
}

function renderChargenSkills() {
  const sk = chargenRules.skills;
  document.getElementById("cg-skill-grid").innerHTML = Object.entries(sk.byCategory)
    .map(
      ([cat, list]) => `
      <div class="space-y-1.5">
        <div class="text-[10px] font-mono text-zinc-500">${cat}</div>
        ${list.map((n) => stepperHtml("skill", n, chargenDraft.skills[n], sk.startValue, sk.cap)).join("")}
      </div>`
    )
    .join("");
}

/** 專業輸入欄：數量由後端給的免費配額決定 */
function renderSpecInputs() {
  const count = chargenRules.specializations.free;
  document.getElementById("cg-spec-list").innerHTML = Array.from({ length: count })
    .map(
      (_, i) => `
      <div class="flex gap-2">
        <select data-spec-skill="${i}" class="flex-1 bg-zinc-100 dark:bg-zinc-900 border hairline-border px-2 py-1.5 text-xs font-mono focus:outline-none rounded-sm">
          <option value="">（不使用這個專業名額）</option>
        </select>
        <input data-spec-name="${i}" type="text" placeholder="專業名稱" class="flex-1 bg-zinc-100 dark:bg-zinc-900 border hairline-border px-2 py-1.5 text-xs focus:outline-none rounded-sm">
      </div>`
    )
    .join("");
  refreshSpecSkillOptions();

  document.getElementById("cg-spec-list").addEventListener("change", collectSpecializations);
  document.getElementById("cg-spec-list").addEventListener("input", collectSpecializations);
}

/** 只讓玩家把專業掛在等級≥1的技能上（規則書：不能掛0級技能） */
function refreshSpecSkillOptions() {
  const trained = Object.entries(chargenDraft.skills)
    .filter(([, lv]) => lv >= 1)
    .map(([name]) => name);

  document.querySelectorAll("[data-spec-skill]").forEach((sel) => {
    const current = sel.value;
    sel.innerHTML =
      `<option value="">（不使用這個專業名額）</option>` +
      trained.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
    if (trained.includes(current)) sel.value = current;
  });
}

function collectSpecializations() {
  const specs = {};
  document.querySelectorAll("[data-spec-skill]").forEach((sel) => {
    const i = sel.dataset.specSkill;
    const nameInput = document.querySelector(`[data-spec-name="${i}"]`);
    const skill = sel.value;
    const specName = nameInput?.value.trim();
    if (skill && specName) (specs[skill] ??= []).push(specName);
  });
  chargenDraft.specializations = specs;
  validateChargen();
}

/** 送去後端驗證，把預算與錯誤畫出來。加點合不合法一律由引擎判斷。 */
async function validateChargen() {
  chargenDraft.concept.name = document.getElementById("cg-name").value;
  chargenDraft.concept.gender = document.getElementById("cg-gender").value;
  const ageRaw = document.getElementById("cg-age").value;
  chargenDraft.concept.age = ageRaw ? Number(ageRaw) : null;
  chargenDraft.concept.background = document.getElementById("cg-background").value;

  let data;
  try {
    data = await (
      await fetch("/api/character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: chargenDraft }),
      })
    ).json();
  } catch (err) {
    document.getElementById("cg-errors").innerHTML =
      `<div class="text-xs font-mono text-red-500">無法連線到 /api/character：${escapeHtml(err.message)}</div>`;
    return;
  }

  const budgetText = (b) =>
    b ? `花費 ${b.totalCost} / ${b.totalBudget}　剩 ${b.remaining}` : "—";
  const budgetClass = (b) =>
    b && b.remaining < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-500";

  const ab = data.budgets?.attributes;
  const sb = data.budgets?.skills;
  const pb = data.budgets?.specializations;
  const attrEl = document.getElementById("cg-attr-budget");
  const skillEl = document.getElementById("cg-skill-budget");
  const specEl = document.getElementById("cg-spec-budget");
  attrEl.textContent = budgetText(ab);
  attrEl.className = `text-xs font-mono ${budgetClass(ab)}`;
  skillEl.textContent = budgetText(sb);
  skillEl.className = `text-xs font-mono ${budgetClass(sb)}`;
  specEl.textContent = pb ? `已用 ${pb.totalSpecs} / ${chargenRules.specializations.free}` : "—";
  specEl.className = `text-xs font-mono ${pb && pb.remaining < 0 ? "text-red-500" : "text-zinc-500"}`;

  document.getElementById("cg-errors").innerHTML = data.errors.length
    ? `<div class="border-l-2 border-red-500/60 pl-3 py-1 space-y-0.5">${data.errors
        .map((e) => `<div class="text-xs font-mono text-red-600 dark:text-red-400">${escapeHtml(e)}</div>`)
        .join("")}</div>`
    : "";

  const submit = document.getElementById("cg-submit");
  submit.disabled = !data.valid;

  // 衍生屬性即時預覽，讓玩家看到加耐力真的會變HP
  const d = data.character?.derived;
  document.getElementById("cg-derived").textContent = d
    ? `生命 ${d.hp.max}（耐力+體積）・意志 ${d.willpower.max}・先攻 ${d.initiative}・基礎防御 ${d.baseDefense}`
    : "";
}

// ===========================================================================
// 存檔生命週期
// ===========================================================================

const SESSION_KEY = "ai-trpg-session-id";

function updateSaveBadge({ persistent, hasSession }) {
  const el = document.getElementById("save-status");
  if (!el) return;
  if (!hasSession) {
    el.textContent = "尚未建卡";
    el.className = "px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border hairline-border text-zinc-500 text-[10px] font-mono";
  } else if (persistent) {
    el.textContent = "已存檔";
    el.className = "px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono";
  } else {
    // 記憶體模式：一定要讓玩家知道，否則他會以為有存檔然後某天發現全沒了
    el.textContent = "未持久化";
    el.className = "px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/40 text-amber-600 dark:text-amber-500 text-[10px] font-mono";
  }
}

/**
 * 切換建卡／遊戲畫面。
 *
 * 刻意直接操作 style.display，不用 Tailwind 的 .hidden class：
 * 那個 class 需要 Tailwind CSS 載入才有作用，而這份 UI 的 CSS 是從外部 CDN 來的。
 * CDN 慢或掛掉時，用 class 的話兩個畫面會同時顯示（玩家會看到建卡表單疊在遊戲畫面上）。
 * 畫面切換是功能不是樣式，不應該依賴外部資源。
 */
function showScreen(which) {
  const chargen = document.getElementById("chargen-screen");
  const game = document.getElementById("app-viewport");
  if (chargen) chargen.style.display = which === "chargen" ? "block" : "none";
  if (game) game.style.display = which === "game" ? "flex" : "none";
}

function showGameScreen() {
  showScreen("game");
}

/** 建卡完成 → 建立存檔 → 進遊戲 → 跑開場回合 */
async function startNewGame() {
  const submit = document.getElementById("cg-submit");
  submit.disabled = true;
  submit.textContent = "建立中…";

  let data;
  try {
    data = await (
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: chargenDraft, sceneContext: "" }),
      })
    ).json();
  } catch (err) {
    submit.disabled = false;
    submit.textContent = "完成建卡並開始遊戲";
    document.getElementById("cg-errors").innerHTML =
      `<div class="text-xs font-mono text-red-500">建立存檔失敗：${escapeHtml(err.message)}</div>`;
    return;
  }

  if (!data.ok) {
    submit.disabled = false;
    submit.textContent = "完成建卡並開始遊戲";
    document.getElementById("cg-errors").innerHTML =
      `<div class="text-xs font-mono text-red-500">${escapeHtml(data.error ?? "建立存檔失敗")}</div>`;
    return;
  }

  currentSessionId = data.session.id;
  localStorage.setItem(SESSION_KEY, currentSessionId);
  adoptCharacter(data.session.character);
  updateSaveBadge({ persistent: data.persistent, hasSession: true });
  showGameScreen();
  await runTurn({ opening: true });
}

/** 把角色卡套進側欄。存檔載入與建卡完成都走這裡，確保只有一個入口。 */
function adoptCharacter(character) {
  currentCharacter = character;
  renderCharacter(character);
  renderCards(character.traits ?? placeholderTraits());
}

/** 重整頁面後接續上次的存檔 */
async function resumeSession(id) {
  let data;
  try {
    data = await (await fetch(`/api/session?id=${encodeURIComponent(id)}`)).json();
  } catch {
    return false;
  }
  if (!data.ok) return false;

  currentSessionId = id;
  adoptCharacter(data.session.character);
  updateSaveBadge({ persistent: data.persistent, hasSession: true });
  showGameScreen();

  // 事件日誌是完整的判定紀錄（不像 history 只留最近幾輪），先摘要顯示在最前面。
  // 這也是 core/eventLog.js 當初設計「角色日誌回顧」時要的東西。
  renderJournal(data.session.log?.events ?? []);

  // 把存檔裡的歷史畫回敘事區，讓玩家看得到之前發生過什麼
  for (const turn of data.session.history ?? []) {
    if (turn.action) appendPlayerActionBlock(turn.action);
    if (turn.narration) appendDMNarrationBlock(turn.narration);
  }
  renderOptions(data.session.scene?.options ?? []);

  // 沒有可用選項時（例如上次剛好AI回傳壞掉）跑一次接續回合把選項要回來
  if (!(data.session.scene?.options ?? []).length) await runTurn({ opening: true });
  return true;
}

async function newGame() {
  localStorage.removeItem(SESSION_KEY);
  currentSessionId = null;
  currentOptions = [];
  const feed = document.getElementById("story-feed");
  if (feed) feed.innerHTML = "";
  updateSaveBadge({ persistent: false, hasSession: false });
  await initChargen();
}

// --- 綁定 ---


document.addEventListener("DOMContentLoaded", async () => {
  updateBackendBadge();

  document.getElementById("btn-new-game")?.addEventListener("click", newGame);
  document.getElementById("cg-submit")?.addEventListener("click", startNewGame);
  ["cg-name", "cg-gender", "cg-age", "cg-background"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", validateChargen);
  });

  // 加減點按鈕用事件委派，因為 stepper 是動態產生的
  for (const gridId of ["cg-attr-grid", "cg-skill-grid"]) {
    document.getElementById(gridId)?.addEventListener("click", (e) => {
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
      validateChargen();
    });
  }

  document.querySelectorAll("[data-action-input]").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendPlayerAction(e.target.value);
      }
    });
  });

    document.querySelectorAll("[data-send-custom]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.closeDrawerIfOpen?.();
      sendPlayerAction(readActionInput());
    });
  });

  // 選項按鈕是動態產生的，所以用事件委派綁在容器上，而不是每次renderOptions後重綁。
  // 送出的是 currentOptions 裡那個原始物件——後端會再查驗一次，前端不做任何規則判斷。
  for (const id of ["option-grid", "option-grid-mobile"]) {
    const container = document.getElementById(id);
    if (!container) continue;
    container.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-option-index]");
      if (!btn) return;
      const option = currentOptions[Number(btn.dataset.optionIndex)];
      if (!option) return;
      window.closeDrawerIfOpen?.();
      runTurn({ chosenOption: option });
    });
  }

  // 有存檔就接續，沒有就進建卡畫面
  const savedId = localStorage.getItem(SESSION_KEY);
  if (!savedId || !(await resumeSession(savedId))) {
    localStorage.removeItem(SESSION_KEY);
    await initChargen();
  }
});

window.sendPlayerAction = sendPlayerAction;
window.runTurn = runTurn;
