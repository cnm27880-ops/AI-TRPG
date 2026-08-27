// 2026-08-27 全頁排查 —— 這一輪抓到的都是「程式碼看起來寫好了、但那條線根本沒接上」
// 或「接上了但馬上被自己的重繪抹掉」的問題。
//
// 前端沒有辦法在 node:test 裡真的跑起來（沒有 DOM），所以這裡沿用本專案既有的做法：
// 把每一項修正釘成一條可讀的原始碼契約，讓下一次有人把線再拆掉時測試會紅。
// 路由那一項是唯一能真的驗到行為的：它比對「前端打哪些路徑」與「functions/ 底下有哪些檔」。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

// ---------------------------------------------------------------------------
// 1) 前端打的每一個 /api 路徑，functions/ 底下都要有對應的檔案
//
// Cloudflare Pages Functions 是檔案路徑即路由。少一個檔案不會有任何建置錯誤，
// 請求會安靜地掉到靜態資源那一層拿回 index.html，前端 response.json() 才炸開，
// 而錯誤訊息長得像「Unexpected token '<'」，跟真正的原因差了十萬八千里。
// /api/godspace/enter 就是這樣壞了一整輪：handler 一直都在，只是掛錯地方。
// ---------------------------------------------------------------------------
function frontendApiPaths(source) {
  const paths = new Set();
  for (const match of source.matchAll(/["'`](\/api\/[a-zA-Z0-9/_-]+)/g)) paths.add(match[1]);
  return [...paths].sort();
}

function routeFileFor(apiPath) {
  const candidates = [
    path.join(root, "functions", `${apiPath}.js`),
    path.join(root, "functions", apiPath, "index.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

test("前端呼叫的每一個 /api 路徑都有對應的 Cloudflare Function 檔", () => {
  const missing = frontendApiPaths(app + index).filter((apiPath) => !routeFileFor(apiPath));
  assert.deepEqual(missing, [], `這些路徑在 functions/ 底下沒有對應檔案，正式部署會回 index.html：${missing.join(", ")}`);
});

test("POST /api/godspace/enter 有自己的路由檔，不是只靠 /api/godspace 那一份", () => {
  const enter = path.join(root, "functions/api/godspace/enter.js");
  assert.ok(fs.existsSync(enter), "functions/api/godspace/enter.js 必須存在，否則結算後的「返回主神空間」打不到後端");
  assert.match(fs.readFileSync(enter, "utf8"), /onRequestPost/);
  assert.match(app, /fetch\("\/api\/godspace\/enter"/);
});

// ---------------------------------------------------------------------------
// 2) 「輪迴者檔案」清單的接續／刪除按鈕要真的接得上
//
// 舊狀態：renderSessionList() 畫出 data-load-session / data-delete-session 兩顆按鈕，
// deleteSession() 也寫好了，但沒有任何地方監聽——兩顆按鈕按下去完全沒有反應。
// ---------------------------------------------------------------------------
test("輪迴者檔案清單的接續與刪除按鈕有委派監聽器接著", () => {
  assert.match(app, /data-load-session="/, "清單仍要畫出接續按鈕");
  assert.match(app, /data-delete-session="/, "清單仍要畫出刪除按鈕");
  assert.match(app, /closest\("\[data-load-session\]"\)/, "接續按鈕必須有監聽器，否則按下去沒反應");
  assert.match(app, /closest\("\[data-delete-session\]"\)/, "刪除按鈕必須有監聽器，否則按下去沒反應");
  assert.match(app, /deleteSession\(remove\.getAttribute\("data-delete-session"\)\)/);
});

// ---------------------------------------------------------------------------
// 3) 重試按鈕要活得過下一次重繪
//
// 舊狀態：重試控制是事後 insertAdjacentHTML 到 DOM 上的，沒有寫回 recentStoryEntries。
// runTurn() 的 finally 裡就有一次 hideNarratorPending() → renderRecentStoryWindow()，
// 按鈕在玩家看到它之前就被整份重建抹掉了。
// ---------------------------------------------------------------------------
test("回合與移動的重試是事件資料的一部分，不是事後插進 DOM 的裝飾", () => {
  assert.match(app, /FEED_RETRY_LABELS/);
  assert.match(app, /retry: "turn"/, "回合失敗要在事件資料上標記可重試");
  assert.match(app, /retry: "travel"/, "移動失敗要在事件資料上標記可重試");
  assert.match(app, /data-feed-retry="/, "重試按鈕由 feedEventInnerHtml 產生");
  assert.match(app, /closest\("\[data-feed-retry\]"\)/, "重試按鈕必須用委派監聽，區塊會被就地改寫");
  assert.doesNotMatch(app, /insertAdjacentHTML\(\s*"beforeend",\s*`<div class="feed-event-actions"/, "不要再把重試按鈕事後插進 DOM");
  assert.doesNotMatch(app, /function appendTravelRetryControl\(/, "舊的事後插入版本要移除");
  assert.match(app, /opts\.retry \?\? ""/, "重試狀態要進入 signature，否則就地更新時按鈕不會出現");
});

// ---------------------------------------------------------------------------
// 4) 故事流增量更新（串流不再整片閃爍）
//
// 舊狀態：每次重繪都是 replaceChildren()，五則全部重建 → .feed-block-enter 全部重播。
// 串流敘事每 18 個字送一次 delta，一段 900 字就是 50 次全視窗重建。
// ---------------------------------------------------------------------------
test("最近五則故事用增量比對更新，不整片重建 DOM", () => {
  assert.match(app, /const renderedStoryBlocks = new Map\(\)/);
  assert.match(app, /function storyEntrySignature\(/);
  assert.match(app, /function applyFeedEvent\(/);
  assert.doesNotMatch(app, /current\.replaceChildren\(/, "整片重建會讓每一則重播進場動畫");
  assert.match(app, /current\.insertBefore\(node, cursor\)/, "只搬位置真的不對的節點");
  assert.match(app, /recentStoryChronicleTotal > RECENT_STORY_LIMIT/, "章節提示的既有契約不變");
  assert.match(app, /function updateRecentStoryHistoryHint\(/);
});

test("還沒有任何一則時保留故事區的佔位文字", () => {
  assert.match(index, /class="story-current-empty"/);
  assert.match(app, /function storyEmptyPlaceholder\(/);
  assert.match(app, /if \(!desired\.length\)/);
});

// ---------------------------------------------------------------------------
// 5) 戰鬥畫面的 body class 只有一個地方負責拆掉
//
// index.html 的 body.is-combat-view #story-current { display:none !important } 帶 !important，
// 光把 inline style 設回 flex 是壓不過它的。舊的 attemptRevive() 抄了三行顯示切換卻漏掉
// 這個 class，於是「戰鬥中被打死 → 復活」之後畫面是一片空白，而且回不去。
// ---------------------------------------------------------------------------
test("離開戰鬥畫面只有一份實作，且一定會拿掉 is-combat-view", () => {
  assert.match(app, /function leaveCombatView\(\)/);
  assert.match(app, /if \(currentCombat\) leaveCombatView\(\);/, "復活後要走同一份離開流程");
  assert.equal(
    (app.match(/classList\.remove\("is-combat-view"\)/g) ?? []).length,
    1,
    "拆掉 is-combat-view 的地方只能有一處（leaveCombatView），抄第二份就會再漏一次",
  );
  assert.match(index, /body\.is-game-screen\.is-combat-view #story-current \{ display: none !important; \}/);
});

// ---------------------------------------------------------------------------
// 6) escapeHtml 要跳脫引號
//
// 這個函式有二十幾個呼叫點寫在屬性值裡（title="…"、aria-label="…"、data-*="…"），
// 來源包含副本文案、NPC 名稱與 AI 敘事。少跳脫引號就是可以提前關掉屬性＝HTML 注入。
// ---------------------------------------------------------------------------
test("escapeHtml 跳脫引號，跟 index.html 的 escapeAttr 同一個標準", () => {
  const body = app.slice(app.indexOf("function escapeHtml("));
  assert.match(body.slice(0, 400), /replace\(\/"\/g, "&quot;"\)/);
  assert.match(body.slice(0, 400), /replace\(\/'\/g, "&#39;"\)/);
  // 屬性值裡確實有在用它——這是上面那條為什麼是必要的，不是潔癖。
  assert.match(app, /title="\$\{escapeHtml\(/);
  assert.match(app, /aria-label="\$\{escapeHtml\(/);
});

// ---------------------------------------------------------------------------
// 7) 小東西：toast 種類與重複請求
// ---------------------------------------------------------------------------
test("showToast 只用 TOAST_STYLES 認得的種類", () => {
  const known = new Set(["error", "warn", "info"]);
  const used = [...(app + index).matchAll(/showToast\([^)]*\{[^}]*kind:\s*["']([a-z]+)["']/g)].map((m) => m[1]);
  const unknown = [...new Set(used)].filter((kind) => !known.has(kind));
  assert.deepEqual(unknown, [], `TOAST_STYLES 沒有這些種類，會靜靜地退回紅色錯誤樣式：${unknown.join(", ")}`);
});

test("輪迴者檔案清單同時間只發一個請求", () => {
  assert.match(app, /let sessionListRequest = null;/);
  assert.match(app, /if \(sessionListRequest\) return sessionListRequest;/);
  assert.match(app, /async function loadSessionList\(/);
});
