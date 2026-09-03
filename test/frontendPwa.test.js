import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const index = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const sessionApi = fs.readFileSync(path.join(root, "functions/api/session.js"), "utf8");
const turnApi = fs.readFileSync(path.join(root, "functions/api/turn.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.webmanifest"), "utf8"));
const sw = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");


// [2026-08-31] 這一題的問法整個換掉了，因為前提沒了。
//
// 舊版問的是「玩家的供應商下拉選單裡有沒有不該出現的免費 provider」——那假設玩家
// 有一個供應商下拉選單。現在玩家一個都沒有：API 金鑰、Base URL、模型、文筆、面具
// 全部改由伺服器端環境變數決定，設定視窗整個拆掉了。
//
// 所以現在該問的是更強的一句話：**前端完全不提供任何選供應商或填金鑰的入口**。
// 這比「清單裡不要有某幾個 id」嚴格得多，而且不會因為新增一家供應商就要回來改測試。
test("前端不提供任何 LLM 供應商／金鑰入口，一律由伺服器端決定", () => {
  // 設定視窗與它的每一個欄位都不該存在。
  assert.doesNotMatch(index, /id="settingsModal"/);
  for (const id of ["setting-provider", "setting-api-key", "setting-base-url", "setting-model", "setting-max-tokens"]) {
    assert.doesNotMatch(index, new RegExp(`id="${id}"`), `${id} 應該已經隨設定視窗一起刪掉`);
  }
  // 供應商 id 不該出現在任何 <option> 裡（含以前開放 BYOK 的那三家）。
  for (const id of ["groq", "siliconflow", "nvidia", "mistral", "openrouter", "workers-ai", "gemini", "deepseek", "custom"]) {
    assert.doesNotMatch(index, new RegExp(`<option\\s+value=["']${id}["']`), `不該還有 ${id} 的選項`);
  }
  // app.js 這一側的組裝邏輯也要一起消失，否則就是「前端沒有入口、但路還通」。
  assert.doesNotMatch(app, /const PROVIDER_UI_META\s*=/);
  assert.doesNotMatch(app, /function buildLlmOverrides\s*\(/);
  assert.doesNotMatch(app, /function readActiveProfile\s*\(/);
  // 回合請求不得再帶 provider/apiKey/style/persona。
  // 比對的是**物件屬性的寫法**（`apiKey:`），不是這個詞本身——
  // 檔案裡還留著一段說明「這條路已經拆掉了」的註解，那是刻意保留的。
  for (const field of ["apiKey", "baseUrl", "provider", "style", "persona"]) {
    assert.doesNotMatch(
      app,
      new RegExp(`^\\s*${field}\\s*:`, "m"),
      `回合請求不該再組出 ${field} 欄位`
    );
  }
  assert.doesNotMatch(app, /localStorage\.getItem\("user_narrative_style"\)/);
  assert.doesNotMatch(app, /localStorage\.getItem\("user_narrator_persona"\)/);
});

// [2026-09-03] 這一題的問法也換掉了：左下角常駐的 SYS dock（#theme-tool-dock）
// 本身被拿掉了，玩家已經用不到——存檔狀態跟回合數側欄都看得到，留著只是一顆
// 多餘的浮動按鈕。主題切換的入口現在只剩側欄 #sidebar-tool-actions 裡那顆
// [data-theme-toggle] 按鈕，所以這裡改成斷言 dock 消失、側欄按鈕還在。
test("左下角浮動 dock 已拆掉，主題切換入口留在側欄", () => {
  assert.doesNotMatch(index, /id="system-tool-dock"/, "齒輪 dock 應該已經拆掉");
  assert.doesNotMatch(index, /id="theme-tool-dock"/, "左下角浮動 SYS dock 應該已經拆掉");
  assert.match(index, /data-theme-toggle onclick="toggleTheme\(\)"/, "側欄要留一顆主題按鈕");
  assert.doesNotMatch(index, /openModal\('settingsModal'\)/, "三個設定入口都要移除");
  // 主題本身仍然要能運作。
  assert.match(index, /function toggleTheme\(\)/);
  assert.match(index, /function applyTheme\(/);
});

test("主畫面移除近期現場標題並保留頂端劇情回顧提示契約", () => {
  assert.doesNotMatch(index, />近期現場</);
  assert.match(app, /data-chronicle-hint/);
  assert.match(app, /更早的故事請看劇情回顧/);
  assert.match(app, /function updateRecentStoryHistoryHint\(/);
  assert.match(app, /recentStoryChronicleTotal > RECENT_STORY_LIMIT/);
  assert.match(sessionApi, /function publicSessionView\(session\)/);
  assert.match(sessionApi, /recentChronicleTotal: chronicle\.length/);
  assert.match(turnApi, /recentChronicleTotal: Array\.isArray\(session\?\.chronicle\)/);
});

// [2026-09-03] 這一題原本斷言的是側欄還是五個分頁（attr/skills/traits/npcs/journal）
// 的年代，人物關係有自己的 #tab-btn-npcs。後來的側欄改版把它併進「物資與情報」
// （#tab-btn-inventory）底下的 #sidebar-tab-npcs 區塊，變成兩頁架構——
// 這個測試從那時候起就一直是假紅燈：不是這次改動弄壞的，是題目沒跟著改版更新。
// 這裡改成斷言目前實際的兩頁架構：人物關係區塊仍然完整存在，只是掛在情報頁下面。
test("Alien V2 人物關係區塊具備 roster、信任 tone，掛在情報頁（兩頁架構）下面", () => {
  assert.match(index, /id="tab-btn-inventory"/);
  assert.match(index, /id="sidebar-tab-npcs"/);
  assert.match(index, /id="npc-roster"/);
  assert.match(index, /class="npc-tab-count"/);
  assert.match(index, /\.npc-card/);
  assert.match(app, /NPC_TRUST_TONE_CLASS/);
  assert.match(app, /function renderNpcRelationships\(npcs\)/);
  assert.match(app, /renderNpcRelationships\(scenario\?\.reference\?\.npcs \?\? \[\]\)/);
  assert.match(index, /function switchSidebarTab\(tabKey\)/);
  assert.match(index, /兩頁架構/);
});

test("玩家行動、命運判定與說書人 pending 使用不同視覺層級", () => {
  assert.match(index, /#recent-story-list > \.feed-event-action/);
  assert.match(index, /#recent-story-list > \.feed-event-check/);
  assert.match(index, /#recent-story-list > #narrator-pending/);
  assert.match(index, /narratorPaperFloat/);
  assert.match(index, /narratorPaperSheen/);
  assert.match(index, /typingBlink/);
});

// [2026-09-03 第二次修正] 選項只在**一個**地方出現，而且重新公開檢定資訊。
//
// 上一版把同一批選項畫在兩個地方（故事流裡的 #inline-decision-panel 大卡片 +
// 輸入框上方的 #tactical-chips 小晶片），玩家等於把同一件事讀兩次；而且卡片刻意
// 藏起了屬性／技能／DC／骰池，玩家的體感變成「按了才知道又失敗」。
// 現在改成柏德之門式的資訊公開：唯一的選項區在輸入框正上方（#decision-dock），
// 卡片上直接標示會擲什麼、多難、骰池幾顆，點下去立刻擲骰。
test("V2 正常遊玩兩軌並存：唯一的選項區在輸入框上方，且公開檢定資訊", () => {
  assert.doesNotMatch(index, /id="dm-action-guidance"/);
  assert.doesNotMatch(index, /id="dm-action-hint"/);
  assert.doesNotMatch(index, /id="dm-action-hints"/);
  assert.match(index, /id="option-grid"/);
  assert.match(index, /你現在要怎麼做？/);
  assert.match(index, /data-action-input[^>]*maxlength="1000"/);
  assert.match(index, /data-action-count/);
  assert.doesNotMatch(app, /function renderDmPrompt\(/);
  // 第二個選項出口整個拿掉：舊的晶片列不能再從任何一邊復活。
  assert.doesNotMatch(index, /id="tactical-chips"/);
  assert.doesNotMatch(index, /id="inline-decision-panel"/);
  assert.doesNotMatch(app, /renderTacticalChips/);
  // 選項區必須在輸入框所在的操作面板裡，不在故事流裡。
  const dockIndex = index.indexOf('id="decision-dock"');
  const actionPanelIndex = index.indexOf('id="story-action-panel"');
  const storyListIndex = index.indexOf('id="recent-story-list"');
  assert.ok(dockIndex > actionPanelIndex && actionPanelIndex > storyListIndex, "選項區要在輸入框所在的操作面板內");
  // 檢定資訊回到卡片上（柏德之門式的資訊公開）。
  assert.match(app, /decision-card-meta/);
  assert.match(app, /decision-card-chip-pool/);
  assert.match(app, /骰池 \$\{dp\}/);
  assert.match(app, /自動失敗/);
  assert.match(app, /decisionTitle\.textContent = "你現在要怎麼做？"/);
  assert.doesNotMatch(app, /question\.textContent =/);
  assert.match(app, /referenceMode: Boolean\(res\.scenario\?\.reference\?\.enabled\)/);
  assert.match(app, /Array\.from\(input\?\.value \?\? \"\"\)\.length/);
});

test("探索終端顯示內容包的空間、感官、地標、危險與回訪變化", () => {
  assert.match(app, /environment\.description/);
  assert.match(app, /environment\.atmosphere/);
  assert.match(app, /environment\.landmarks/);
  assert.match(app, /environment\.hazardHints/);
  assert.match(app, /environment\.revisitVariant/);
  assert.match(app, /question\.progressText/);
  assert.match(app, /目前解讀/);
  assert.match(app, /可見地標/);
  assert.match(app, /可見危險/);
  assert.match(app, /回訪變化/);
});

test("回合輸出使用安全 NDJSON lifecycle 與 narration fallback", () => {
  assert.match(turnApi, /function wantsTurnStream\(/);
  assert.match(turnApi, /function streamTurnResponse\(/);
  assert.match(turnApi, /type: "rules_resolved"/);
  assert.match(turnApi, /type: "narrator_writing"/);
  assert.match(turnApi, /type: "narration_delta"/);
  assert.match(turnApi, /type: "complete"/);
  assert.match(app, /async function readTurnResponse\(/);
  assert.match(app, /application\/x-ndjson/);
  assert.match(app, /narrationStreamed/);
  assert.match(app, /Accept.*application\/x-ndjson/s);
  assert.match(app, /stream: true/);
  assert.doesNotMatch(turnApi, /stThought,\s*\/\//);
});

test("建卡以十選三起始專長取代純敘事特性", () => {
  assert.match(index, /id="cg-step-specialties"/);
  assert.match(index, /id="cg-specialty-options"/);
  assert.match(index, /每項都會讓對應技能的相關檢定多一顆骰子/);
  assert.match(app, /function renderStartingSpecialties\(/);
  assert.match(app, /function toggleStartingSpecialty\(/);
  assert.match(app, /startingSpecialties: chargenStartingSpecialties/);
  assert.match(app, /a\.system\.startingSpecialties/);
  assert.doesNotMatch(app, /a\.system\.traits/);
  assert.match(sessionApi, /requireStartingSpecialties: true/);
  assert.match(index, /起始專長 \/ 資源/);
});

test("portal 移除白色 first-story 並以暗色慢亮接入，建卡後有全黑祝福過場", () => {
  assert.doesNotMatch(index, /id="portal-first-story"|godspace-first-story/);
  assert.doesNotMatch(app, /GODSPACE_FIRST_STORY_KEY|showFirstGodspaceStory|continueFirstGodspaceStory/);
  assert.match(index, /html\[data-theme="dark"\]\[data-stage="godspace"\] #portal-screen/);
  assert.match(index, /portalMainReveal 1\.15s/);
  assert.match(index, /filter: brightness\(\.42\)/);
  assert.match(index, /id="chargen-release-overlay"/);
  assert.match(index, /\.chargen-release-overlay\.is-leaving/);
  assert.match(app, /async function playChargenReleaseTransition\(/);
  assert.match(app, /那麼，祝你好運。/);
  assert.match(app, /await playChargenReleaseTransition\(\);/);
});

test("C1 主神空間以安全區導引串起結算、整備與出發", () => {
  assert.match(index, /id="hub-guide-card"/);
  assert.match(index, /id="hub-guide-next-button"/);
  assert.match(index, /id="hub-guide-step-review"/);
  assert.match(index, /id="hub-guide-step-recover"/);
  assert.match(index, /id="hub-guide-step-depart"/);
  assert.match(index, /安全區導引/);
  assert.match(index, /低亮度/);
  assert.match(app, /function renderGodspaceGuide\(guide\)/);
  assert.match(app, /guide\.nextAction/);
  assert.match(app, /guide\.steps/);
  assert.match(app, /applyHubActionButton\("hub-start-button", "start_scenario"\)/);
  assert.match(app, /applyHubActionButton\("hub-shop-button", "shop"\)/);
});

test("C1 導引卡依 server steps 動態呈現 active／ready 流程並拒絕未知 action", () => {
  assert.match(app, /const steps = Array\.isArray\(guide\.steps\) \? guide\.steps\.slice\(0, slots\.length\) : \[\]/);
  assert.match(app, /stepCard\.dataset\.guideStepId = step\.id/);
  assert.match(app, /const resolvedHandler = handler \?\? \(action\?\.id \? hubGuideHandler\(action\.id\) : null\)/);
  assert.match(app, /const enabled = Boolean\(action\?\.enabled && resolvedHandler\)/);
  assert.doesNotMatch(app, /guide\.steps\?\.find\(\(candidate\) => candidate\.id === stepId\)/);
});

test("設定 modal 的 light theme 會覆蓋原生表單 dark appearance", () => {
  assert.match(index, /html\[data-theme="light"\] \.modal-panel :is\(input, select, textarea\)/);
  assert.match(index, /color-scheme: light/);
  assert.match(index, /html\[data-theme="light"\] \.modal-panel \.text-zinc-300/);
  assert.match(index, /html\[data-theme="light"\] \.modal-panel \.bg-zinc-900/);
});

test("手機 modal 有安全區域、高度上限與內部觸控捲動", () => {
  assert.match(index, /\.modal-backdrop \{ align-items: flex-start; overflow-y: auto;/);
  assert.match(index, /max-height: calc\(100dvh - 1\.5rem/);
  assert.match(index, /-webkit-overflow-scrolling: touch/);
});

test("PWA 在 iOS 與 Android 沒有自動 prompt 時仍提供安裝指引入口", () => {
  assert.match(index, /function isIosDevice\(\)/);
  assert.match(index, /function isMobileDevice\(\)/);
  assert.match(index, /if \(isMobileDevice\(\) \|\| isIosDevice\(\)\)/);
  assert.match(index, /openModal\('pwaInstallModal'\)/);
});

test("輪迴者檔案文案區分接續目前角色與建立新角色", () => {
  assert.match(index, /輪迴者檔案/);
  assert.match(index, /查看／接續不同角色/);
  assert.match(index, /接續目前輪迴/);
  assert.match(index, /不是回溯或重玩/);
  assert.match(app, /不是回溯副本進度/);
  assert.match(app, /名其他輪迴者/);
});

test("PWA metadata、Service Worker 與前端 cache-bust 保持有效", () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.match(index, /apple-mobile-web-app-capable/);
  assert.match(index, /app.js\?v=20260827-r19/);
  assert.match(sw, /CACHE_VERSION = "v8"/);
  assert.match(sw, /"\.\/combatV2\.js"/);
});
