# Changelog

本文件記錄 AI-無限恐怖 TRPG 的可觀察介面變更、測試重點與後續動畫設計方向，供開發者、測試人員與後續協作者使用。

## [FEATURE-2026.08.29] — Combat V2：戰術戰鬥系統與新戰鬥頁面

**影響範圍：** `core/combat/v2/*`（新增）、`content/combat/v2/*`（新增）、`functions/api/combat/v2/*`（新增）、`public/combatV2.js`（新增）、`public/index.html`、`public/app.js`、`core/combat/V2_ISOLATION.md`（新增）、`test/combatV2*.test.js`（新增）

**變更性質：** 新增一套獨立的 server-authoritative 戰術戰鬥系統。**舊戰鬥流程一行都沒有刪、也沒有改判定**——兩者的狀態、API 與前端面板完全分離（對照表見 `core/combat/V2_ISOLATION.md`）。判定公式、骰池、角色數值計算與既有存檔格式不變。

### 新增

- **五類動作經濟**（`core/combat/v2/actionTypes.js`、`actionBudget.js`）：迅捷／移動／標準各 1，整輪＝移動＋標準、全回合＝迅捷＋移動＋標準（原子消耗）。模型是**計數池＋消耗紀錄**，不是 boolean 旗標；單向轉化（標準→移動→迅捷）每一次都留下來源紀錄。整輪／全回合不是額外的資源池，回合結束與否由結算後真正剩下的額度決定。
- **三段距離系統**（`range.js`）：`close`／`medium`／`far` 是 server state。一般移動一次只能改變一格，例外要由能力明確宣告（`rangeEffect`）。
- **動態行動選單**（`actionCatalog.js`、`availableActions.js`）：21 條行動、涵蓋規格的七個分類與全部五種動作類型。不可用的行動照樣回傳，並附上玩家看得懂的原因（「需要近距離」「彈藥不足」「目前無可掩護的隊友」）。`requirements` 走白名單，秘密欄位不會因為忘記過濾而外洩。
- **回合結算**（`resolveAction.js`、`resolveTurn.js`、`enemyTurn.js`）：結算順序由伺服器決定（移動 → 環境 → 戰術 → 攻擊 → 支援），並依該順序重驗每一張卡的可用性——所以「接近＋近戰」成立、「接近＋射擊」被擋下。敵方 AI 是規則式的，跟玩家用同一套動作經濟，完全不經過 LLM。
- **可重播的戰鬥骰子**（`rng.js`）：每場戰鬥帶一個 seed，同一個 seed 跑出同一場戰鬥；seed 不出現在任何公開 payload。
- **公開狀態白名單**（`publicState.js`）：敵人只給公開生命等級（未受傷／受傷／重創／瀕死／已倒下），不給精確 HP、AI 檔案、秘密 DC 或骰池。
- **API**：`POST /api/combat/v2/start`、`GET /api/combat/v2/state`、`POST /api/combat/v2/turn`（含 `preview` 模式）。所有改變狀態的請求都要帶 `stateVersion` 與 `requestId`：版本不符回 409 並附最新狀態，同一個 `requestId` 重送回原結果不重複結算。
- **戰鬥頁面**（`public/combatV2.js` + `#combat-v2-panel`）：狀態列、玩家與敵方公開狀態卡、三段距離帶與戰場資訊、依五類動作分組的行動選單、本回合選擇摘要與確認流程、戰鬥紀錄。戰鬥中**沒有自由文字輸入**；前端不做任何規則判定，每次改變選擇都向伺服器要一次預覽。

### 被隔離、但沒有刪除

`core/combat/actionEconomy.js` 的反射動作（`useReflex`）、自由動作（`useFree`）與專注（`startFocus`）仍留在舊模組供舊流程使用，Combat V2 的任何檔案都沒有 import 它們。戰鬥中的型態啟動（`resolveFormActivation`）尚未接進 V2 的行動目錄——這是已知未完成項，不是被移除的功能。細節見 `core/combat/V2_ISOLATION.md`。

### 測試

新增 `test/combatV2ActionBudget.test.js`（25）、`combatV2Range.test.js`（15）、`combatV2ActionMenu.test.js`（14）、`combatV2Turn.test.js`（24）、`combatV2Api.test.js`（18）、`combatV2Ui.test.js`（18），共 114 項，涵蓋規格第 11.1～11.5 節的全部 45 條要求。全套測試 1162 項通過（既有 1048 項無回歸）。桌機（1280×900）與手機（390×844）以 Chromium 實測過開戰、選擇、整輪鎖定、確認結算與換輪。

## [CONTENT-2026.08.28] — 第二副本《努布拉島：維修站撤離》接入

**影響範圍：** `content/scenario/examples/jurassicPark_v1*`、`content/scenario/registry.js`、`content/scenario/referenceAdapter.js`、`content/scenario/explorationState.js`、`content/scenario/settlement.js`、`functions/api/travel.js`、`functions/api/turn.js`、`validate_jurassic_v1.mjs`、`test/jurassicParkV1.test.js`、`docs/JURASSIC_PARK_V1_AUTHORING_AUDIT.md`

**變更性質：** 新增一個內建副本，並把引擎裡原本寫死給異形副本的判定改成由 reference 資料宣告。判定公式、骰池、存檔格式與角色數值計算不變。

### 新增

- 第二個內建副本 `scenario.jurassic-park-01-v1`《努布拉島：維修站撤離》：5 個地點、12 條路線、7 個事件、16+ 條進路、140 個結果位置、3 名 NPC、6 件道具、7 條線索、3 個未解問題、6 個結局。難度「中等」，時間預算 40 回合。
- `validate_jurassic_v1.mjs`：依 `docs/SCENARIO_VALIDATION_SPEC.md` 第 3 節輸出報告契約，另外擋下「失敗沒有造成任何局勢改變」「線索沒有 canonical 來源」「NPC 秘密外洩到玩家可見文字」三類問題。
- `docs/JURASSIC_PARK_V1_AUTHORING_AUDIT.md`：接入審核紀錄，含 proposal → canonical 的每一項轉換決定與尚未完成的項目。

### 調整（全部向後相容，未宣告新欄位的副本行為不變）

| 位置 | 原本 | 現在 |
|---|---|---|
| `referenceAdapter.deriveEndingId` | 寫死異形副本的旗標與結局 | 副本可用 `endingRules` 宣告有序判定表 |
| `referenceAdapter` 最終戰 | 寫死 `airlockPhase=secured` 且 `flag_xenomorph_killed` | 副本可用 `finaleCompletion` / `finaleVictory` 宣告 |
| `referenceAdapter` 狀態軸 | 起始值寫死 | 副本可用 `initialStateAxes` 覆寫引擎已知的軸 |
| `referenceAdapter` NPC 名冊 | 寫死五名異形副本 NPC 的接觸旗標與場景 | 副本可用 `npcs[].contactFlags` / `presenceScenes` 宣告 |
| `referenceAdapter` 地點用途／事件標題 | 只有異形副本的對照表 | 改為優先讀 `map[].playerVisible` 與 `scenes[].title` |
| `explorationState` 路線風險 | 寫死異形副本的四條規則 | 副本可用 `travelRiskRules` 宣告，並支援依出發地區分風險 |
| `settlement` 證據加分 | 只認 `flag_937_evidence_saved` | 加上通用的 `flag_evidence_secured` |
| `POST /api/travel` | 只允許 `scenario.nostromo-01-v2` | 改為檢查 reference 是否具備地圖與已授權 route |
| `POST /api/turn` 節點結算 | 只結算目前主線節點 | reference 明確完成的節點可以結算自己指名的節點（前置與重複結算仍由 `completeNodeAndAdvance` 查驗）；AI 自己宣稱的 `nodeComplete` 仍只能用在目前主線節點上 |

### 測試

新增 `test/jurassicParkV1.test.js`（15 項），涵蓋主線三個節點依序結算、最終戰完成信號、六個結局的 state 推導、移動的相鄰與前置檢查、風險規則差異、公開視圖不洩漏 `gmTruth` 與 NPC 秘密，以及一項異形副本的回歸。全套測試 1047 項通過；`validate_alien_v2.mjs`、`validate_jurassic_v1.mjs` 與 Cloudflare Functions build 均通過。

## [FIX-2026.08.27] — 全頁排查：接不上的線與會被自己抹掉的 UI

**影響範圍：** `public/app.js`、`public/index.html`、`public/sw.js`、`functions/api/godspace/enter.js`、`test/frontendRegressions.test.js`

**變更性質：** 前端缺陷修正與一項路由補齊，不涉及規則引擎、判定公式、存檔格式或角色數值計算。

### 修正

| # | 症狀（玩家看到的） | 成因 | 修正 |
|---|---|---|---|
| 1 | 副本結算後按「返回主神空間」跳出 `Unexpected token '<'`，卡在結算頁 | 前端打 `POST /api/godspace/enter`，但 Cloudflare Pages Functions 是檔案路徑即路由，`functions/api/godspace.js` 只接得到 `/api/godspace`；請求落到靜態資源拿回 `index.html` | 新增 `functions/api/godspace/enter.js` 掛上既有 handler。既有測試是直接 import handler，繞過路由層才沒抓到 |
| 2 | 登入後「輪迴者檔案」裡的「接續」「刪除」按下去沒有反應 | `renderSessionList()` 畫了 `data-load-session` / `data-delete-session`，但沒有任何監聽器；`deleteSession()` 從未被呼叫 | 補上委派監聽器 |
| 3 | 回合失敗時的「重試這一回合」按鈕看不到 | 重試控制事後 `insertAdjacentHTML` 到 DOM，沒有寫回 `recentStoryEntries`；`runTurn()` 的 `finally` 會重畫故事流並把它抹掉 | 重試改成事件資料的一部分（`opts.retry`），並改用委派監聽。移動失敗的重試同樣處理 |
| 4 | 串流敘事時故事區整片持續閃爍 | 每則 delta（每 18 個字）都 `replaceChildren` 重建整個視窗，五則的 `.feed-block-enter` 進場動畫一起重播；同時整段文字被重複重排，成本 O(字數²) | 改成依 `entry.id` 做增量比對：新的才建、變了的只改自己那一則、位置沒動的完全不碰 |
| 5 | 戰鬥中被打死並復活後，畫面一片空白且回不去 | `attemptRevive()` 抄了顯示切換卻漏掉拿掉 `is-combat-view`，而 CSS 用 `!important` 壓著故事流與行動列 | 抽出唯一的 `leaveCombatView()`，兩個呼叫點共用 |
| 6 | — | `escapeHtml()` 沒有跳脫引號，但有二十幾個呼叫點寫在 `title="…"`、`aria-label="…"`、`data-*="…"` 等屬性值裡，來源包含副本文案、NPC 名稱與 AI 敘事 | 補上 `"` 與 `'`，與 `index.html` 既有的 `escapeAttr()` 同一個標準 |
| 7 | 開局到第一段敘事回來之間故事區是全白的一塊 | `replaceChildren` 在 `DOMContentLoaded` 那一次就把標記裡的佔位文字清掉了 | 沒有任何一則時保留「等待第一段故事回應……」 |
| 8 | 兩則提示以紅色錯誤樣式出現 | `showToast(..., { kind: "warning" })`，但 `TOAST_STYLES` 的鍵是 `warn`，靜靜退回 `error` | 改用 `warn`，並加測試把種類釘死 |

### 調整

- 「輪迴者檔案」清單改為同一時間只發一個請求。開站時 `refreshAuthState()` 與 `checkLocalSession()` 會各打一次 `/api/session`，兩個請求同時在飛、內容一樣。
- `#4` 的增量更新順帶讓兩件既有行為真的生效：`clearPreviousFinalQuestions()` 清掉的 class 不再於下一次重建時長回來；「說書人書寫中」的計時秒數不再每次重畫被重置。`aria-live="polite"` 的故事區也不再於每則 delta 重新朗讀整份清單。
- `CACHE_VERSION` 升到 `v7`、`app.js?v=` 升到 `20260827-r18`，讓已安裝 PWA 的離線殼換到新的 `app.js`。

### 測試

新增 `test/frontendRegressions.test.js`（10 項）。其中「前端呼叫的每一個 `/api` 路徑都有對應的 Cloudflare Function 檔」是唯一能驗到真實行為的一項：它比對 `public/` 裡出現的 `/api/...` 字串與 `functions/` 底下的檔案，專門擋 `#1` 這一類「handler 寫好了但掛錯路徑」的問題。其餘沿用本專案既有做法，把每一項修正釘成可讀的原始碼契約。

全套測試 1000 項通過。

## [UI-2026.08.22] — 決策卡與故事流閱讀體驗升級

**對應 commit：** [`35b19c0`](https://github.com/cnm27880-ops/AI-TRPG/commit/35b19c0) [1]

**影響範圍：** `public/index.html`、`public/app.js`、`UI_LAYOUT_REVIEW.md`、`UI_AUDIT_NOTES.md`

**變更性質：** 前端 UI 與互動體驗調整，不涉及規則引擎、AI 回合 API、存檔格式或角色數值計算。

### 新增

#### 故事流檢視工具列

故事流頂部新增「全部」「敘事」「事件」三種檢視。全部模式保留完整時間線；敘事模式只顯示說書人正文，方便長文閱讀；事件模式集中顯示玩家行動、判定、世界變化、傷害、休息與系統事件，方便測試人員確認規則結果。

篩選採用暫時隱藏而非移除資料的方式。被篩掉的事件仍保留在 DOM 與目前故事流中，因此切換檢視不會改變事件順序，也不會造成存檔內容遺失。

#### 回合分隔線

玩家行動前會新增低干擾的「回合 N」分隔線。分隔線只提供閱讀定位，不新增敘事文字，也不改變後端事件。重載存檔時，歷史中的玩家行動會依相同規則重建回合邊界。

#### 故事流紀錄計數與最新定位

工具列會顯示目前故事流的事件數量。當玩家向上回看且故事流仍有未閱讀的新內容時，會顯示「最新」按鈕；點擊後返回最底部。一般環境使用平滑捲動，開啟減少動態偏好時改用立即定位。

#### 事件資料標記

故事流事件現在會在節點上保留 `data-feed-entry` 與 `data-feed-kind`。這讓敘事、玩家行動、判定、世界變化、傷害、錯誤等事件能共用篩選、計數與後續動畫狀態，而不需要依賴各呼叫點自行猜測 CSS class。

#### 決策卡資訊層級

決策卡改為「行動意圖 → 預期結果 → 規則摘要」三層結構。行動標題使用較醒目的敘事字體；hint 說明這個選擇可能帶來的結果；屬性、技能、難度、骰池與風險則集中在較弱的規則摘要列。玩家因此可以先理解要做什麼，再判斷代價與風險。

純敘事選項會顯示「純敘事行動」與「不擲骰 · 場景仍會推進」，不再與一般檢定卡混用空白規則欄位。

### 調整

| 項目 | 調整前 | 調整後 | 測試意義 |
|---|---|---|---|
| 決策卡主標題 | 與規則資訊競爭視覺焦點 | 主標題優先，規則退到摘要列 | 測試人員應先驗證行動意圖，再驗證規則欄位 |
| 規則摘要 | 屬性、DC、骰池與警告混在同一串 | 屬性＋技能與 DC 為主規則，骰池與風險為次要資訊 | 長選項下仍能辨認主要規則 |
| 故事事件 | 主要依視覺樣式區分 | 每個事件保留明確 `data-feed-kind` | 篩選與未來事件動畫可以共用資料語意 |
| 錯誤事件 | 特殊建立路徑，可能與一般事件標記不一致 | 直接使用共同事件建構器 | 回合失敗、重試與事件計數行為一致 |
| 回看操作 | 只能手動捲回底部 | 提供「最新」定位按鈕 | 測試需確認不強迫打斷玩家回看 |
| 動態效果 | 沒有依使用者偏好做定位差異 | 支援 `prefers-reduced-motion` | 測試需涵蓋減少動態環境 |
| 桌面選項排列 | 寬螢幕仍容易形成 2×2 | 1536px 以上使用 4×1 | 寬桌面不應留下過多垂直空間浪費 |

### 相容性與未變更範圍

本版沒有修改核心規則引擎、骰子計算、角色數值、AI 回合資料格式、存檔資料結構、戰鬥規則或手機版角色抽屜。`max-width: 767px` 的手機版單欄故事流仍然沿用既有操作模型；桌面版的新增工具列與決策卡樣式會隨寬度調整。

### 驗證結果

本版以本地靜態預覽與固定測試資料驗證 UI 行為。由於靜態預覽沒有後端 API，瀏覽器驗證聚焦在 DOM、CSS、篩選、捲動與長內容，不代表已完成實際 AI 供應商連線測試。

| 測試項目 | 結果 |
|---|---|
| JavaScript 語法檢查 | 通過 `node --check public/app.js` |
| Git 差異格式檢查 | 通過 `git diff --check` |
| 核心自動化測試 | 772 / 772 通過 |
| 故事流事件計數 | 8 則事件正確計數 |
| 回合分隔 | 2 個玩家行動產生 2 個分隔 |
| 敘事篩選 | 只顯示 narration，其他事件保留並隱藏 |
| 事件篩選 | 保留 action、check、world、harm 與 divider |
| 最新定位 | 回看上方時顯示，定位後可更新狀態 |
| 錯誤與重試事件 | fault 事件具備共同資料標記與重試按鈕 |
| 長選項 | 自然換行，無水平溢出 |
| 長故事流 | 無水平溢出，事件順序保持不變 |
| 中型桌面 | 1280px 維持 2×2 選項 |
| 寬桌面 | 1536px 以上切換 4×1 選項 |

## 開發者注意事項

新增故事流事件時，應優先透過 `buildFeedEvent()` 或 `appendFeedEvent()` 建立，不要在呼叫點自行拼接另一套事件 class。若新增事件種類，請同步確認 `FEED_EVENT_KICKERS`、事件顏色 token、篩選分類與測試資料是否需要更新。

決策卡的規則數值仍然由後端回傳，前端只負責安全呈現。不要在 UI 動畫或 CSS 狀態中重新計算骰池、DC、成功數、傷害或任何角色數值。

任何新增的動畫都必須能在 `prefers-reduced-motion: reduce` 下退化為無動畫或短暫淡入。動畫不可阻塞選項點擊、鍵盤數字選擇、故事流捲動或重試按鈕。

## 進階動畫與過場設計提案

目前的基礎視覺語法已經具備事件種類、回合分隔與資料標記，因此下一步適合增加**語意化、一次性、可跳過**的動態效果，而不是讓整個畫面持續閃爍。所有動畫都應服務於「我剛剛做了什麼」「規則結果是什麼」「故事現在更新到哪裡」這三個問題。

### 建議優先級

| 優先級 | 動畫／過場 | 使用時機 | 預期效果 | 風險 |
|---|---|---|---|---|
| P0 | 決策卡階梯式進場 | 新一輪選項生成完成 | 讓玩家依序掃描 1–4 張卡 | 低；需避免等待過久 |
| P0 | 選定卡鎖定與同儕退場 | 玩家點擊或按數字鍵後 | 清楚表示已選擇，避免重複操作 | 低；不能隱藏已選文字 |
| P0 | 故事事件短暫淡入 | 新事件加入故事流 | 指出新內容位置，不干擾閱讀 | 低 |
| P0 | 最新位置提示 | 玩家停留在歷史位置時有新事件 | 不強迫捲動，提供可控回到最新的入口 | 低 |
| P1 | 判定結果骰面過場 | action 後收到 check 事件 | 把「行動」和「結果」建立視覺因果 | 中；不能延遲正文過久 |
| P1 | 事件種類微動效 | check、harm、world、fault 等事件加入時 | 讓玩家在餘光中辨識事件種類 | 中；紅色與警示效果需克制 |
| P1 | 篩選切換交叉淡入 | 全部／敘事／事件切換時 | 減少大量節點突然消失造成的跳動感 | 中；必須保留鍵盤與讀屏狀態 |
| P2 | 選項到判定事件的共享元素過場 | 支援 View Transitions API 時 | 讓選項卡視覺上轉化為故事中的玩家行動 | 中高；需要 fallback |
| P2 | 節點或場景轉場 | 副本節點改變、進入戰鬥或離開戰鬥 | 讓劇情階段切換更有重量 | 高；容易遮住重要資訊，不宜先做 |

### P0：決策卡階梯式進場

當 `renderOptions()` 完成一輪選項渲染後，可以為每張 `.decision-card` 加上 `style="--card-index: 0"` 類似的順序值，並使用 `animation-delay: calc(var(--card-index) * 55ms)` 進行短暫的透明度與位移過場。建議動畫長度控制在 180–240ms，卡片只移動約 6–10px，避免看起來像彈出式廣告。

這個效果的重點不是炫技，而是建立「這四張卡是同一輪新情報」的感覺。測試人員應確認動畫播放期間仍可使用數字鍵選擇，並確認 API 回應很快時不會出現長時間空白。

### P0：選定卡鎖定與同儕退場

玩家選擇卡片後，應立即為該卡加入 `is-selected`，其他卡加入 `is-dimmed`，並將選定卡的邊框或左側色條提高對比度。選定卡可以做一次 120ms 的微幅放大或亮度提升，其他卡則在 160ms 內降低透明度，但不要把它們 `display: none`，以免玩家看不到剛才選了什麼。

在 `turnInFlight` 狀態下，卡片應同步保持 disabled，並顯示簡短的「命運判定中」或「說書人整理中」狀態。這個狀態不能依賴動畫本身判斷是否送出完成；動畫只是狀態的視覺表現。

### P0：故事事件短暫淡入與回合邊界脈衝

目前已有 `feed-block-enter` 基礎效果，下一步可以把它分成更細的事件進場版本。narration 使用柔和的透明度與上移；action 使用短暫的左側線條亮起；check 使用一次性的骰子圖示旋轉或亮度變化；world 使用很短的水平掃描線；harm 使用一次很輕的紅色邊框脈衝；fault 使用靜態紅色狀態，不建議持續閃爍。

這些動畫應該只播放一次，而且不應改變事件的實際高度。若動畫改變高度，玩家正在閱讀時會被推動，故事流就會出現不舒服的跳動。

### P0：不強迫捲動的最新提示

當玩家已經向上回看時，新事件不應自動把故事流拉回底部。可以讓「最新」按鈕做一次非常短的亮度脈衝，並在按鈕旁顯示新增數量，例如「最新 · 2」。玩家按下後才捲到底部，按鈕再淡出。

這個模式與目前的 `story-feed-latest` 狀態很接近，實作成本低，也比在新故事進來時直接搶走捲動位置更適合長篇 TRPG。

### P1：判定結果骰面過場

在玩家選擇與 check 事件之間，可以加入一個短暫的「判定中」狀態：已選卡的規則摘要保留在原位，骰子圖示做一次 360 度旋轉或數字短暫變換，接著切換為真正的成功數、DC 與結果。這個過場只應持續 350–600ms，並且在 API 已經返回時立刻可以跳過。

不要用假的隨機骰面製造長時間的期待，也不要讓動畫中的數字被誤認為真實結果。若要顯示骰面動畫，應使用明確的「判定中」標籤，真正結果一旦回傳就直接以後端資料覆蓋。

### P1：事件種類微動效

事件動畫可以依 `data-feed-kind` 交給 CSS 處理，例如 `.feed-event-check.is-entering`、`.feed-event-harm.is-entering`。這樣 JavaScript 只負責加入或移除狀態，不需要知道每種動畫的細節。建議把動效控制在不超過一次脈衝，並讓內容文字本身保持穩定。

對於 harm 與 fault，顏色應該是資訊提示而不是恐怖遊戲的畫面震動。可以用邊框、左側 rail 或小圖示表現；不要讓整個故事區閃紅、抖動或播放大面積遮罩，否則玩家會把「介面在警告」誤讀成「角色正在遭遇新的劇情」。

### P1：篩選切換交叉淡入

篩選時目前事件會立即 hidden。若未來故事流變長，可以在切換前加上短暫的 `is-filtering` 狀態，先讓現有事件淡出，再更新 hidden 狀態，最後讓新事件淡入。過場總長度建議不超過 160ms，並且在減少動態偏好下直接跳到最終狀態。

測試時要特別確認：切換後捲動位置不會意外跳到頂部、焦點仍停留在篩選按鈕、讀屏工具能知道按鈕的 `aria-pressed` 狀態，而且篩選不會改動紀錄計數。

### P2：選項到事件的共享元素過場

如果瀏覽器支援 View Transitions API，可以讓被選中的決策卡與稍後故事流中的「你的行動」事件共享一個短暫的視覺識別。概念上是卡片左側編號或標題在過場中移動到故事流的 action 事件，而不是整張卡片飛過畫面。

這是高階效果，必須提供沒有 View Transitions API 時的 CSS fallback。它也必須在使用鍵盤選擇、手機觸控與快速重試時保持正確，不應只為滑鼠點擊設計。

### P2：副本節點與戰鬥過場

未來在主神空間、劇情節點、戰鬥介面之間切換時，可以使用「介面狀態先收束、下一個階段再展開」的過場：任務 HUD 的文字淡出、主欄保留一條短暫的定位線、下一個面板從同一條線展開。這種過場能讓副本階段更有重量，但它與真正的戰鬥 UI、節點資料與 API 狀態高度相關，應在那些功能穩定後再做。

## 建議避免的效果

不建議把說書人正文做成逐字打字機效果。長篇中文敘事若每個字都等待，會降低閱讀速度，也會讓玩家誤以為 AI 還沒有完成回覆。較好的做法是正文一次出現，再讓段落或事件容器做短暫淡入；若要增加等待感，應放在「說書人整理中」狀態，而不是截斷已完成的正文。

不建議讓所有 hover、border、icon 與背景同時動起來。這會破壞事件層級，使玩家無法知道哪些動效代表新內容、哪些只是游標經過。也不建議使用無限循環的紅色脈衝、整頁震動或高對比閃白，尤其是在 harm、fault 與死亡相關事件上。

## 動畫實作與測試檢查表

| 類別 | 檢查項目 |
|---|---|
| 狀態正確性 | 動畫只反映已存在的 UI 狀態，不自行推算規則結果 |
| 可跳過性 | API 已回應時，動畫可以立即結束或直接顯示最終結果 |
| 動態偏好 | `prefers-reduced-motion: reduce` 下無旋轉、震動、長位移或連續脈衝 |
| 鍵盤 | 數字鍵 1–4、Tab、Enter 與焦點順序不受動畫阻塞 |
| 觸控 | 手機點擊選項後不會因 hover 狀態卡住或重複送出 |
| 捲動 | 玩家向上回看時不被新事件強制捲到底部 |
| 篩選 | 切換後 `aria-pressed`、可見種類、紀錄計數與焦點狀態一致 |
| 長內容 | 長標題、長 hint、長敘事與錯誤訊息不產生水平溢出 |
| 失敗路徑 | API 失敗、429、設定錯誤與重試狀態都有穩定的靜態 fallback |
| 效能 | 以 `transform`、`opacity` 為主，避免頻繁觸發 layout 的動畫屬性 |
| 可理解性 | 動畫結束後，玩家仍能清楚回答「我選了什麼、結果是什麼、現在在哪裡」 |

## 建議開發順序

第一階段先完成 P0：決策卡階梯式進場、選定卡鎖定、故事事件短暫淡入與不強迫捲動的最新提示。這些效果都能建立在目前的 `data-feed-kind`、`story-feed-latest` 與 `turnInFlight` 狀態上，且不需要改動後端。

第二階段再加入 P1：判定結果過場、事件種類微動效與篩選交叉淡入。這一階段需要更完整的瀏覽器 fixture，尤其要測試「玩家正在回看時 AI 回覆抵達」與「錯誤後按重試」兩條路徑。

第三階段才評估 P2：共享元素過場與副本／戰鬥階段轉場。這些效果的視覺收益較高，但會與未來的戰鬥 UI、節點推進與真正 API 時序耦合，應避免過早把動畫寫死在目前的單頁結構中。

## References

[1]: https://github.com/cnm27880-ops/AI-TRPG/commit/35b19c0 "UI commit 35b19c0"
[2]: https://github.com/cnm27880-ops/AI-TRPG/blob/main/UI_LAYOUT_REVIEW.md "UI layout review"
