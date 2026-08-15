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
 * 示範角色 —— 形狀對應 core/schema.js 的 emptyCharacter()。
 * 屬性/技能數值刻意落在建卡合法範圍內(屬性1~5、技能0~3)，敏捷特意給到6是為了展示
 * 「跨過傳奇屬性門檻」的顯示效果(6以上是建卡後用XP成長來的，不是建卡當下能買到的)。
 */
function createDemoCharacter() {
  const attributes = {
    力量: 4,
    敏捷: 6,
    耐力: 3,
    智力: 3,
    感知: 4,
    決心: 3,
    風度: 2,
    操控: 2,
    沉著: 3,
  };

  const skills = {
    運動: 2, 肉搏: 1, 駕駛: 0, 槍械: 3, 手上功夫: 0, 躲藏: 2, 求生: 1, 白刃: 2, 弓箭: 0,
    學識: 1, 電腦: 2, 手藝: 0, 調查: 2, 醫學: 1, 神秘學: 0, 科學: 0,
    馴獸: 0, 感受: 2, 表達: 1, 脅迫: 1, 交際: 1, 掩飾: 0,
  };

  return {
    concept: {
      name: "亞倫 · 懷特",
      gender: "男",
      age: 28,
      background: "前特勤隊員，第一次進入輪迴空間。",
    },
    attributes,
    skills,
    specializations: { 槍械: ["步槍"], 調查: ["痕跡辨識"] },
    feats: [],
    derived: {
      // 傷勢軌：20點生命，目前受過3點沖擊傷(B)、2點嚴重傷(L)
      hp: { max: 20, intact: 15, B: 3, L: 2, A: 0 },
      willpower: { max: 3, current: 3, temp: 0 },
      energyPools: {},
    },
    xp: { earned: 50, spent: 0 },
    abilities: [],
    // [顯示用] 資源卡，還沒接上 content/packs/ 的真實資料，見 content/loader.js
    traits: [
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
    ],
  };
}

function initCharacter() {
  currentCharacter = createDemoCharacter();
  renderCharacter(currentCharacter);
  renderCards(currentCharacter.traits);
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

/**
 * 送出玩家行動。
 *
 * [刻意設計] 這裡**不**決定「這次行動要用哪個屬性搭哪個技能」，只把玩家原話送出去。
 * 那個判斷是規則層面的決定(選錯技能會直接影響成功率，甚至觸發技能0的自動失敗)，
 * 依 ARCHITECTURE.md 的最高原則，規則決定必須待在引擎層、有測試蓋住，
 * 所以它住在 content/checkIntent.js，由 /api/narrate 在後端做，不是在瀏覽器裡做。
 */
async function sendPlayerAction(actionText) {
  if (!actionText || actionText.trim() === "") return;
  const text = actionText.trim();

  clearActionInputs();
  appendPlayerActionBlock(text);

  let res;
  try {
    res = await fetch("/api/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        character: currentCharacter,
        playerAction: text,
        sceneContext: `劇本 ${currentScenarioId}`,
        recentEvents: [],
      }),
    });
  } catch (err) {
    appendSystemErrorBlock(`無法連線到 /api/narrate：${err.message}`);
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    appendSystemErrorBlock(`/api/narrate 回傳的不是合法JSON(HTTP ${res.status})`);
    return;
  }

  // 後端就算Gemini敘事失敗(502)，也會把已經算好的checkResult一起回傳，
  // 所以這裡先把規則層的結果畫出來，再處理敘事的部分。
  if (data.checkResult) {
    backendOnline = true;
    if (data.provider) lastProvider = data.model ? `${data.provider}/${data.model}` : data.provider;
    updateBackendBadge();
    appendCheckResultBlock(data.checkResult);
  }

  if (data.ok && data.narration) {
    appendDMNarrationBlock(data.narration);
  } else {
    appendSystemErrorBlock(data.error ?? `/api/narrate 失敗(HTTP ${res.status})`);
  }
}

/**
 * 手動觸發一次檢定(PERFORM CHECK按鈕)。骰子動畫只是視覺效果，
 * 顯示出來的成功數一律來自後端 /api/check 的回傳值，前端不自己擲骰、也不自己決定擲什麼。
 *
 * 送出的是輸入框裡的行動文字(空白就送一個中性的觀察動作)，由後端的 content/checkIntent.js
 * 推導該用哪個屬性/技能。
 */
async function performCheckRoll(actionText) {
  const intentText = (actionText ?? readActionInput() ?? "").trim() || "我謹慎地觀察四周";

  window.openDiceModal?.();

  let result = null;
  let errorMessage = null;

  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character: currentCharacter, playerAction: intentText }),
    });
    const data = await res.json();
    if (data.ok) {
      result = data.result;
      backendOnline = true;
    } else {
      errorMessage = data.error ?? `/api/check 失敗(HTTP ${res.status})`;
    }
  } catch (err) {
    errorMessage = `無法連線到 /api/check：${err.message}`;
  }

  updateBackendBadge();

  if (errorMessage) {
    window.showDiceError?.();
    appendSystemErrorBlock(errorMessage);
    return;
  }

  const formula = result.autoFail
    ? result.reason
    : `${(result.note ?? []).join(" + ")} → 成功數 ${result.totalSuccesses} vs 難度 ${result.dc}`;

  window.showDiceResult?.(result.autoFail ? "×" : String(result.totalSuccesses), formula);
  appendCheckResultBlock(result);
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

// --- 綁定 ---

document.addEventListener("DOMContentLoaded", () => {
  initCharacter();
  updateBackendBadge();

  document.querySelectorAll("[data-action-input]").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendPlayerAction(e.target.value);
      }
    });
  });

  document.querySelectorAll("[data-action-button]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sendPlayerAction(btn.dataset.actionButton);
    });
  });

  document.querySelectorAll("[data-perform-check]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.closeDrawerIfOpen?.();
      performCheckRoll();
    });
  });
});

window.performCheckRoll = performCheckRoll;
window.sendPlayerAction = sendPlayerAction;
