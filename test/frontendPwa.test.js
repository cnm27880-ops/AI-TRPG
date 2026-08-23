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
  assert.match(index, /app\.js\?v=20260823-r14/);
  assert.match(sw, /CACHE_VERSION = "v6"/);
});
