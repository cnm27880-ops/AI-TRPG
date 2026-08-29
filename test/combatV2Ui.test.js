// Combat V2 —— 戰鬥頁面的契約測試（規格第11.5節，10 條全部覆蓋）。
//
// 前端在 node:test 裡跑不起來（沒有 DOM），所以這裡沿用本專案既有的做法
// （見 test/frontendRegressions.test.js 的檔頭）：把每一條 UI 規格釘成一條可讀的
// 原始碼契約，讓下一次有人把線拆掉時測試會紅。
//
// 有兩條是真的能驗到行為的：
//   - 「戰鬥中沒有自由文字輸入」比對的是實際的 DOM 結構
//   - 「前端不做規則判定」掃的是 combatV2.js 裡有沒有出現規則運算
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const view = fs.readFileSync(path.join(root, "public/combatV2.js"), "utf8");
const index = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");

/** 抓出 #combat-v2-panel 那一段 HTML，避免測試被頁面其他部分的字誤判。 */
function combatV2Panel() {
  const start = index.indexOf('id="combat-v2-panel"');
  assert.ok(start > 0, "index.html 必須有 #combat-v2-panel");
  const end = index.indexOf("<!-- d20 擲骰結算覆蓋層 -->", start);
  return index.slice(start, end);
}

test("戰鬥頁面存在，而且與舊的 #combat-panel 是兩個獨立面板", () => {
  assert.match(index, /id="combat-v2-panel"/);
  assert.match(index, /id="combat-panel"/, "舊面板不得被刪除");
  assert.match(view, /combat-v2-panel/);
});

test("11.5.1 玩家能看到目前距離：三段距離帶由伺服器的 distance.band 渲染", () => {
  assert.match(view, /b\.distance\.band/, "距離帶必須來自伺服器狀態");
  assert.match(view, /is-current/, "目前距離必須高亮");
  assert.match(index, /\.cv2-band-seg\.is-current/, "高亮樣式必須存在");
  // 距離也同時出現在玩家卡與每一張敵人卡上。
  assert.match(view, /距離 <b>\$\{cv2Escape\(b\.distance\.currentLabel/);
  assert.match(view, /距離 <b>\$\{cv2Escape\(e\.rangeLabel/);
});

test("11.5.2 玩家能看到五類動作與剩餘額度（整輪/全回合不畫成第六、第七種資源）", () => {
  assert.match(view, /function cv2BudgetHtml/);
  assert.match(view, /\["swift", "move", "standard"\]\.map/, "剩餘額度只有三個基礎池");
  assert.equal(/remaining\.fullRound|remaining\.fullTurn/.test(view), false, "整輪/全回合不得當成資源池顯示");
  // 但五類動作的分組標題都要在。
  for (const label of ["迅捷行動", "移動行動", "標準行動", "整輪行動", "全回合行動"]) {
    assert.ok(view.includes(label), `行動選單缺少分組「${label}」`);
  }
});

test("swift 在 UI 上一律是「迅捷」，絕不翻成「反應」（規格第3節注意事項）", () => {
  const panel = combatV2Panel();
  assert.equal(/反應/.test(panel), false, "戰鬥頁面不得出現「反應」");
  assert.equal(/反應/.test(view), false, "combatV2.js 不得出現「反應」");
  assert.ok(view.includes("迅捷"));
});

test("11.5.3 玩家能知道 action 的消耗：行動卡印伺服器給的 costHint，不自己算", () => {
  assert.match(view, /action\.costHint/);
  assert.match(view, /action\.actionTypeLabel/);
  assert.equal(/cost\.(swift|move|standard)\s*[+*-]/.test(view), false, "前端不得對 cost 做算術");
});

test("11.5.4 玩家能知道 action 為何不可用：不可用的卡仍然顯示，並印出原因", () => {
  assert.match(view, /action\.unavailableReason/);
  assert.match(index, /\.cv2-action\[data-state="unavailable"\]\s*\{[^}]*opacity/, "不可用要降低視覺強度而不是隱藏");
  assert.equal(/filter\(\(a\) => a\.available\)/.test(view), false, "不得把不可用的行動濾掉");
});

test("11.5.5 fullRound／fullTurn 選擇時 UI 正確鎖定其他動作（鎖定狀態由伺服器算）", () => {
  assert.match(index, /\.cv2-action\[data-state="locked"\]/);
  assert.match(view, /lockedByComposite/);
  // 鎖定的權威是伺服器 preview 回來的選單，不是前端自己推的。
  assert.match(view, /payload\.availableActions/);
  assert.match(view, /preview: true/);
});

test("11.5.6 確認中所有按鈕鎖定（避免重複送出）", () => {
  assert.match(view, /cv2Busy = true;/);
  assert.match(view, /const disabled = cv2Busy \|\|/, "行動卡在結算中要 disabled");
  assert.match(view, /\$\{cv2Busy \|\| cv2Selection\.length === 0 \? "disabled" : ""\}/, "確認與清除按鈕也要 disabled");
  assert.match(index, /\.cv2-action\[data-state="resolving"\]/);
});

test("11.5.7 409 後顯示狀態已更新，要求玩家重新確認，且不靜默重送", () => {
  assert.match(view, /res\.status === 409/);
  assert.match(view, /cv2Selection = \[\];/);
  assert.match(view, /請重新確認你的選擇/);
  assert.match(view, /restoreCombatV2/);
  // 「不靜默重送」＝ 409 分支裡沒有再送一次 turn。
  const conflictBlock = view.slice(view.indexOf("if (res.status === 409) {\n      // 狀態版本衝突"));
  const nextFetch = conflictBlock.indexOf("fetch(\"/api/combat/v2/turn\"");
  assert.equal(nextFetch, -1, "409 之後不得自動重送玩家的選擇");
});

test("11.5.8 手機尺寸下仍能操作：垂直堆疊，但距離與剩餘動作不被隱藏", () => {
  const mobile = index.slice(index.indexOf("@media (max-width: 480px)"));
  const block = mobile.slice(0, mobile.indexOf("}\n\n"));
  assert.match(block, /grid-template-columns: 1fr/, "小螢幕改成單欄");
  assert.equal(/cv2-band|cv2-budget|cv2-summary/.test(block), false, "距離帶與剩餘動作不得在手機上被隱藏");
  // 摘要列固定在底部，捲到哪裡都看得到。
  assert.match(index, /\.cv2-summary\s*\{[^}]*flex: 0 0 auto/);
  assert.match(index, /\.cv2-statusbar\s*\{[^}]*position: sticky/);
});

test("11.5.9 鍵盤焦點與 aria-label 正確", () => {
  assert.match(view, /aria-label="\$\{cv2Escape\(action\.label\)\}/, "每一張行動卡都要有 aria-label");
  assert.match(view, /aria-pressed="\$\{selected\}"/, "已選狀態要能被輔助技術讀到");
  assert.match(index, /\.cv2-action:focus-visible\s*\{[^}]*outline/);
  assert.match(index, /\.cv2-confirm:focus-visible, \.cv2-clear:focus-visible/);
  // 行動卡是原生 <button>，Tab/Enter/Space 交給瀏覽器，不自己攔截。
  assert.match(view, /<button type="button" class="cv2-action"/);
  const panel = combatV2Panel();
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /role="status"/);
});

test("11.5.10 戰鬥頁面不存在自由文字輸入框", () => {
  const panel = combatV2Panel();
  assert.equal(/<input|<textarea|contenteditable/.test(panel), false, "戰鬥面板不得有任何輸入框");
  // 而且進入戰鬥時，故事的自由輸入面板要被關掉。
  assert.match(index, /body\.is-game-screen\.is-combat-v2-view #story-action-panel \{ display: none !important; \}/);
  assert.match(view, /classList\.add\("is-combat-v2-view"\)/);
  assert.match(view, /classList\.remove\("is-combat-v2-view"\)/);
});

test("前端只送 actionId 與 targetId，不送 cost／actionType／距離／任何結果", () => {
  const confirmBlock = view.slice(view.indexOf("async function cv2Confirm"), view.indexOf("// ---------------------------------------------------------------------------\n// 繪製"));
  assert.match(confirmBlock, /selectedActions: cv2Selection\.map\(\(s\) => \(\{ actionId: s\.actionId, targetId: s\.targetId \}\)\)/);
  for (const forbidden of ["hit:", "damage:", "cost:", "actionType:", "distance:", "successes"]) {
    assert.equal(confirmBlock.includes(forbidden), false, `送出的 payload 不得含「${forbidden}」`);
  }
});

test("前端不做任何規則判定：沒有距離比較、沒有命中/傷害運算", () => {
  // 距離的字面值只會出現在「翻譯成中文標籤」那一個地方，不會出現在判斷式裡。
  assert.equal(/if\s*\([^)]*===\s*["']close["']/.test(view), false, "前端不得自己比對距離");
  assert.equal(/Math\.random\(\)\s*\*\s*(10|20|6)/.test(view), false, "前端不得擲骰");
  for (const forbidden of ["defenseDC", "rollDicePool", "applyDamage", "successes >="]) {
    assert.equal(view.includes(forbidden), false, `前端不得含規則運算「${forbidden}」`);
  }
});

test("戰鬥中不得未經確認直接離開（規格第7.1節A區）", () => {
  assert.match(view, /cv2Battle\?\.active && !window\.confirm/);
});

test("V2 的路由都有對應的 Cloudflare Function 檔（Pages 是檔案路徑即路由）", () => {
  const paths = new Set();
  for (const match of (view + index + app).matchAll(/["'`](\/api\/combat\/v2\/[a-zA-Z0-9/_-]+)/g)) paths.add(match[1]);
  assert.deepEqual([...paths].sort(), ["/api/combat/v2/start", "/api/combat/v2/state", "/api/combat/v2/turn"]);
  for (const apiPath of paths) {
    assert.ok(fs.existsSync(path.join(root, "functions", `${apiPath}.js`)), `${apiPath} 沒有對應的 function 檔`);
  }
});

test("重整頁面回來時，V2 續戰以伺服器狀態為準（不從存檔直接讀）", () => {
  assert.match(app, /res\.session\.combatV2\?\.active/);
  assert.match(app, /window\.restoreCombatV2/);
  assert.match(view, /fetch\(`\/api\/combat\/v2\/state\?sessionId=/);
});

test("舊戰鬥面板與 V2 面板不共用任何狀態變數", () => {
  assert.equal(/currentCombat\b/.test(view), false, "combatV2.js 不得碰舊面板的狀態");
  assert.equal(/cv2Battle/.test(app), false, "app.js 不得碰 V2 的狀態");
});
