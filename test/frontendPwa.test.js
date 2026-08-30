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

test("Alien V2 人物關係分頁具備 roster、信任 tone 與無 reference 隱藏契約", () => {
  assert.match(index, /id="tab-btn-npcs"/);
  assert.match(index, /id="sidebar-tab-npcs"/);
  assert.match(index, /id="npc-roster"/);
  assert.match(index, /class="npc-tab-count"/);
  assert.match(index, /\.npc-card/);
  assert.match(app, /NPC_TRUST_TONE_CLASS/);
  assert.match(app, /function renderNpcRelationships\(npcs\)/);
  assert.match(app, /renderNpcRelationships\(scenario\?\.reference\?\.npcs \?\? \[\]\)/);
  assert.match(index, /\['attr', 'skills', 'traits', 'npcs', 'journal'\]/);
  assert.match(index, /五個分頁/);
});

test("玩家行動、命運判定與說書人 pending 使用不同視覺層級", () => {
  assert.match(index, /#recent-story-list > \.feed-event-action/);
  assert.match(index, /#recent-story-list > \.feed-event-check/);
  assert.match(index, /#recent-story-list > #narrator-pending/);
  assert.match(index, /narratorPaperFloat/);
  assert.match(index, /narratorPaperSheen/);
  assert.match(index, /typingBlink/);
});

test("V2 正常遊玩以 DM 自由行動為主，選項只保留 server 相容資料流", () => {
  assert.match(index, /id="dm-action-guidance"/);
  assert.doesNotMatch(index, /id="dm-action-question"/);
  assert.match(index, /id="dm-action-hint"/);
  assert.match(index, /id="dm-action-hints"/);
  assert.match(index, /可參考的情境線索/);
  assert.match(index, /data-action-input[^>]*maxlength="1000"/);
  assert.match(index, /data-action-count/);
  assert.match(app, /function renderDmPrompt\(/);
  assert.match(app, /currentOptions = \[\];/);
  assert.match(app, /decisionTitle\.textContent = "可參考的情境線索"/);
  assert.match(app, /decisionTitle\.textContent = "你現在要怎麼做？"/);
  assert.doesNotMatch(app, /question\.textContent =/);
  assert.match(app, /自由行動 · 不使用預設選項/);
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
