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
  assert.match(sessionApi, /recentChronicleTotal: chronicleTotal/);
  assert.match(turnApi, /recentChronicleTotal: Array\.isArray\(session\?\.chronicle\)/);
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

test("PWA metadata、Service Worker 與前端 cache-bust 保持有效", () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.match(index, /apple-mobile-web-app-capable/);
  assert.match(index, /app\.js\?v=20260823-r12/);
  assert.match(sw, /CACHE_VERSION = "v4"/);
});
