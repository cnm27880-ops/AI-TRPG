# 無限恐怖 TRPG 2.35 —— AI 文字遊戲與核心規則引擎

這個專案將《無限恐怖》2.35 規則整理成可測試的純運算核心，並在其上提供 AI 敘事、Cloudflare Pages Functions API 與單頁文字遊戲介面。**骰子、成功數、生命值轉換、經驗值、商店價格與戰鬥結果由程式碼計算；AI 只負責依照引擎結果產生敘事與下一輪選項。**

> **文件對照基準：** 本 README 以目前工作樹與最新 `main` 的 Alien V2 runtime 為準；提交 hash 會在本輪驗證完成後由 Git 歷史記錄。規則推導與長期架構請搭配 `ARCHITECTURE.md`、`TEST_PLAN.md` 與 `CHANGELOG.md` 閱讀。

## 專案定位

專案分成三層。`core/` 是不依賴 AI、內容包或 Cloudflare 的規則引擎；`content/` 是副本、建卡、商店、LLM、登入與存檔等可替換內容／服務層；`functions/api/` 與 `public/` 則把這些能力接成 Cloudflare Pages 上可使用的 API 與瀏覽器遊戲。

前端不重新計算規則數值。它只負責讀取 API 回應、呈現角色卡與故事流、發送玩家行動，以及在戰鬥、商店、型態、休息、日誌與存檔功能之間切換。這個分工是專案最重要的邊界：**任何必須與規則一致的數字，都應由引擎或 API 回傳。**

## 快速開始

先安裝 Node.js 與 npm，再在專案根目錄執行：

```bash
npm install
npm test
```

目前測試套件共有 **67 個 `.test.js` 測試檔案、831 個可重現測試案例**，正常結果應為 `# pass 831`、`# fail 0`。測試除規則核心外，也涵蓋 API 存檔、劇情回顧、跨副本 facts isolation、LLM 失敗後的 pending-turn retry、Alien V2 reference runtime，以及手機設定／PWA／故事主畫面 UI 靜態契約。兩個 `runRealGemini*.mjs` 是需要本地 `.dev.vars` 與真實供應商金鑰的手動連線測試，不會納入一般 `npm test`；可用 `npm run test:real-gemini` 額外執行。

若要重新產生前端使用的 Tailwind 靜態 CSS，執行：

```bash
npm run build:css
```

開發期間可使用監看模式：

```bash
npm run watch:css
```

若要在本機同時預覽 `public/` 與 `functions/`，應使用 Cloudflare Pages 的本機開發伺服器。Wrangler 目前不是 `package.json` 的固定依賴，因此第一次使用時先安裝到本專案：

```bash
npm install -D wrangler
npx wrangler pages dev
```

部署前請先閱讀 `DEPLOYMENT.md`，因為 Cloudflare 帳號、KV namespace、AI binding、登入密鑰與外部 LLM 金鑰都需要在使用者自己的環境設定。

可用的 npm scripts 如下：

| 指令 | 用途 |
|---|---|
| `npm test` | 執行 67 個可重現 `.test.js` 測試檔案，共 831 個案例 |
| `npm run test:real-gemini` | 使用本地 `.dev.vars` 執行兩個真實 Gemini／Alien V2 連線 smoke test |
| `npm run build:css` | 由 `src/tailwind.css` 產生 `public/tailwind.css` |
| `npm run watch:css` | 監看 CSS 來源並持續產生靜態 CSS |
| `npm run deploy` | 執行 `wrangler pages deploy`；正式部署前請先完成 Cloudflare 設定 |

## 目錄結構

```text
core/                       純規則運算核心，不呼叫 AI
  schema.js                 九維屬性、技能表與角色骨架
  dice.js                   D10 骰池、加骰、機運骰、DC 與傳奇附加成功
  check.js                  屬性、技能、專業與傳奇加值的判定組裝層
  health.js                 完好／衝擊 B／嚴重 L／惡性 A 傷勢轉換
  derivedStats.js           生命、意志、先攻、基礎防禦等衍生數值
  xp.js                     建卡與成長的 XP 花費
  campaignXp.js             跑團後經驗值與 RP 表現獎勵
  narration.js              將判定 margin 轉為固定敘事結果契約
  deathAndRevival.js        死亡與復活費用
  eventLog.js               append-only 事件日誌
  legendaryAttributes.js    傳奇屬性與附加成功規則
  energyPools.js            能量池與相關資源
  rest.js                   休息與恢復規則
  character.js              戰鬥角色檔案形狀
  combat/                   先攻、防禦、攻擊、護甲、行動經濟與完整攻擊流程

content/                    可替換內容與服務層
  characterBuilder.js       建卡組裝與預算驗證
  chargen/                  人生路徑、甦醒、點數分配、重塑與美德／惡德
  turnOptions.js             AI 選項查驗與保底選項
  checkIntent.js             自然語言行動到檢定參數的對照層
  narrativeStyle.js          說書人文筆與人格設定
  scenario/                  副本註冊、節點、進度、迫近度、時間預算、reference adapter 與結算
    examples/                 Alien V1／V2 範例副本與 V2 GM reference authoring/runtime sidecar
  combat/                    遭遇狀態與目前的單敵人戰鬥內容
  shop/                      商店目錄、價格、錢包、購買、型態與存取規則
  contracts/                 契約內容包結構
  auth/                      Google OIDC、登入票、所有權與匿名存檔認領
  storage/                   Cloudflare KV 存檔與無 binding 時的記憶體 fallback
  llm/                       LLM 供應商註冊與統一呼叫層
  gemini/                    Gemini 整合與敘事 prompt contract
  packs/                     副本、資源、商店與範例內容包

functions/api/               Cloudflare Pages Functions API
  auth/login.js              啟動 Google 登入
  auth/callback.js           Google 登入回呼
  auth/logout.js             登出
  auth/me.js                 查詢登入狀態
  character.js               取得建卡規則並驗證建卡
  check.js                   執行單次判定
  turn.js                    主遊戲回合：讀檔、查驗、擲骰、敘事、產生選項、寫回；LLM失敗可安全重試
  narrate.js                 判定與敘事，不產生下一輪選項
  session.js                 建立、讀取、刪除與列出存檔；runtime view 只帶最近劇情與 pending retry
  journal.js                 讀取事件日誌摘要
  chronicle.js               讀取完整劇情回顧與副本 AI-ready 劇情包
  scenario.js                副本與節點相關資料
  rest.js                    休息與恢復
  revive.js                  復活
  shop.js                    商店貨架與購買
  forms.js                   型態／資源啟動
  combat/start.js            開始遭遇戰
  combat/act.js              執行戰鬥回合行動
  combat/resolve.js          執行完整攻擊行動

public/                      Cloudflare Pages 靜態資源
  index.html                 單頁遊戲介面、建卡、角色 HUD、最近五則故事窗口與戰鬥面板
  app.js                     前端應用層與 API 呼叫，不做規則運算；含最近五則、回顧邊界提示與 pending retry UX
  tailwind.css               預先編譯的靜態 CSS
  manifest.webmanifest       PWA 安裝資訊
  sw.js                      Service Worker

src/tailwind.css             Tailwind CSS 輸入來源
test/                        67 個 `.test.js` 測試檔案，共 824 個測試案例；另有2個手動連線 smoke script
rules-2.35.txt               原始規則書資料
wrangler.toml                Cloudflare Pages、AI binding 與 KV 設定骨架
```

## 目前的玩家流程

前端目前提供從邀請頁、建卡、主神空間到副本回合的完整主路徑。玩家可以建立角色、進行人生路徑問答與肉體重塑，建立存檔後進入回合循環；每輪由 API 回傳最多四個經過查驗的選項，玩家也可以輸入第五種自訂行動。

遊戲主畫面包含角色 HUD、任務與副本狀態、最近五則故事窗口、決策卡、休息、輪迴者檔案、主神商店、型態／資源啟動、事件日誌，以及目前的單敵人戰鬥面板；Alien V2 另在角色側欄提供副本人物 roster、存活狀態與 server-owned 好感度摘要。主畫面只保留最近五則現場訊息；完整長期劇情由主神商店旁的「劇情回顧」頁按需讀取，支援小說式回顧、事件事實與副本結束後可複製／下載的 AI-ready 劇情包。當 LLM 在規則層完成後暫時失敗，伺服器會保存 pendingTurn，玩家重試時沿用原骰面，不會重複扣時間、迫近度或寫入重複歷史。寬桌面決策卡會依螢幕寬度由 2×2 切換為 4×1，手機則保留單欄與角色抽屜操作模型。

所有副本都是單向道：活躍中的輪迴者檔案只能接續目前進度，不能回到過去 scene 或重玩同一副本；想重玩時必須回到主神空間／首頁建立一名新的輪迴者。登入不是遊戲的必要條件。未登入時可以使用匿名輪迴者檔案；登入後，新檔案會綁定帳號，既有的瀏覽器匿名檔案也會在登入後嘗試認領。未來 Google 登入的檔案頁應管理多名角色及各自歷程，而不是作為回放選單。存檔、登入與 KV 的詳細取捨請看 `DEPLOYMENT.md` 與 `ARCHITECTURE.md`。

## 已對照規則書或引擎契約驗證的部分

下列項目已透過書中範例、數學推導、模組不變量或整合測試驗證：

| 領域 | 已驗證內容 |
|---|---|
| 骰池與判定 | D10 骰池、成功數、DC 比較、機運骰、傳奇屬性／技能附加成功與未受訓扣減 |
| 生命與傷勢 | 完好、衝擊 B、嚴重 L、惡性 A 的轉換順序與書中 20 點生命範例 |
| 衍生數值 | 生命、意志、先攻、基礎防禦、敏感範圍與傳奇效果 |
| XP 與建卡 | 屬性、技能、專業、專長、語言與重塑預算驗證，包括書中角色建卡範例 |
| 敘事契約 | 判定 margin 到固定敘事方向的分級，避免 AI 自己改判定結果 |
| 選項查驗 | 屬性／技能／難度／DC、純敘事選項、保底選項與回合輸出 schema |
| 劇本狀態 | 副本節點、進度、迫近度、時間預算、重複行動與結算 |
| 戰鬥 | 先攻、防禦、攻擊類型、護甲、行動經濟、傷害減免與完整攻擊流程 |
| 內容包 | 結構驗證、跨包撞名、資源模板稽核、商店目錄與價格檢查 |
| API 與服務 | session、journal、chronicle、shop、forms、rest、auth、scenario、combat 與 LLM 整合路徑的測試；含 LLM failure retry 不重骰回歸 |

完整的「規則條文／程式碼／驗證方式／狀態」對照請看 `TEST_PLAN.md`；目前所有自動化測試均通過。

## 測試與開發約定

修改規則時，應先確認數值的唯一來源，再同步更新對應測試；不要在前端、AI prompt 或內容包中複製一份未受測試保護的公式。修改前端 class 或 HTML 後，若涉及 Tailwind utility，請執行 `npm run build:css` 並把產生的 `public/tailwind.css` 一起檢查。

新增 API 時，應先確認它呼叫的核心模組是否已有測試，再補上端點輸入、錯誤與存檔狀態的測試。新增 LLM 供應商時，請同步檢查 `content/llm/providers.js`、`content/llm/client.js`、設定介面、`LLM_PROVIDERS.md` 與相關測試。

程式碼註解中的 `[規則書]` 表示直接來自 `rules-2.35.txt` 的規則；`[設計]` 表示為本專案需求新增的機制。設計數值可以調整，但應修改集中式常數或表格並補測試，不應讓 AI 自己決定。

## 目前刻意保留的未完成範圍

本專案仍在分期開發，以下內容不是 README 遺漏，而是目前明確保留的工作：

- 500+ 頁資源型錄的全面批量轉換工具，以及更完整的血統、技能樹與道具資料。
- 戰鬥的進階動作、範圍攻擊、混合傷害、不良狀態、載具與多敵人內容仍需擴充；目前的戰鬥 UI 與單敵人 MVP 不代表完整戰鬥內容已完成。
- 建卡目前使用輕量化的角色建立路徑；完整規則書建卡模型與遊戲內 XP 升級流程仍需視產品方向補齊。
- 資源包套用、NPC 長期記憶／對話分支與更完整的副本內容包仍在擴充；Alien V2 已接上 reference adapter、公開人物 roster、狀態與好感度摘要，但 GM privateGoals／knowledge 不會直接暴露給玩家。
- Cloudflare Pages 正式部署、KV binding、Google 登入與各家 LLM 供應商的實際連線，仍必須在使用者自己的帳號、網域與金鑰環境驗證。Repository 內的 `wrangler.toml` 與相關文件是部署骨架與操作指南，不是本地測試已完成的部署證明。

## 重要文件

| 文件 | 用途 |
|---|---|
| `ARCHITECTURE.md` | 給接手開發者或 Claude Code 的架構、設計原則與 Phase 進度 |
| `TEST_PLAN.md` | 規則條文、程式模組、驗證方式與目前狀態的對照 |
| `RULES_DIGEST.md` | 規則數值與公式的速查表 |
| `CONVERSION_RULES.md` | 把規則書資源轉成內容包／商店商品時的轉換規則 |
| `DEPLOYMENT.md` | Cloudflare Pages、KV、AI binding、登入與正式部署步驟 |
| `GEMINI_INTEGRATION.md` | Gemini 金鑰與整合設定說明 |
| `LLM_PROVIDERS.md` | Gemini、DeepSeek、OpenRouter、Workers AI 與 OpenAI 相容供應商設定 |
| `CHANGELOG.md` | 已推送版本的介面變更、測試結果與後續動畫設計提案 |
| `UI_LAYOUT_REVIEW.md` | 故事流、決策卡與桌面版面設計審查 |
| `UI_AUDIT_NOTES.md` | UI 實測尺寸、瀏覽器驗證與迭代紀錄 |

## AI 在這個架構裡的角色

AI 會收到引擎已經算好的結果，例如玩家使用某個屬性與技能對指定 DC 進行判定，並取得實際成功數、傷害、迫近度或其他狀態變化。`core/narration.js` 與相關 prompt contract 會把這些結果轉成固定的敘事方向；AI 的工作是把結果寫成有畫面的文字，並依 schema 產生下一輪選項。

AI 不應自行編造骰子、成功數、生命值、獎勵、價格或勝負判定。這個邊界同時保護規則一致性，也讓前端可以把 API 回應直接呈現給玩家，而不必猜測 AI 文字中的數字是否可信。
