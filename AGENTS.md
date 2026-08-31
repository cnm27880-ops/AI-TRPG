# AGENTS.md — 給所有 AI 協作者的專案規則

本檔是本專案給 AI 編碼協作者的共同入口，遵循 [agents.md](https://agents.md) 慣例。
Claude Code、Codex、Cursor、Copilot、Gemini、Jules、Aider 等工具都會讀這個檔案，
或由同目錄的短指標檔（`CLAUDE.md`、`.github/copilot-instructions.md`、`.cursor/rules/`）指向這裡。

**只維護這一份。** 其他工具的設定檔一律只放指標，不複製內容——
複製出去的規則會各自漂移，然後沒有人知道哪一份才算數。

---

## 這個專案是什麼

單人 TRPG 引擎（「無限恐怖」跑團），部署在 Cloudflare Pages Functions。
核心設計原則是使用者最早訂下的那一句：

> 「AI 只負責敘事，不負責算數。」

規則判定、擲骰、傷害、獎勵全部由 `core/` 與 `content/` 的引擎算完，
LLM 只把**已經定案的結果**翻譯成敘事文字。任何讓 LLM 決定數值或勝負的改動都是錯的。

---

## 動任何 LLM 相關的程式碼之前：先讀契約

> ### 📌 [`docs/PROMPT_CACHE_CONTRACT.md`](docs/PROMPT_CACHE_CONTRACT.md)
>
> **這是硬性要求，不是建議。** 由 `npm run lint:prompt-cache`（CI 會跑）
> 與 `test/promptCache.test.js` 強制執行。

三十秒版本：

本專案跑在支援 **prefix caching** 的端點上。這類端點比對的是**前綴**——
碰到第一個不同的 token，從那裡到最後全部重算。所以每一次 LLM 請求都必須是三層，
順序即是變動頻率由低到高：

| 層 | 送到哪 | 放什麼 |
| --- | --- | --- |
| **static** | `system` message | 規則契約、文筆層、敘事者面具、場景固定背景、回應格式規格 |
| **history** | 中段 `user`/`assistant` messages | 對話歷史與場景簡報，**只在尾端追加** |
| **dynamic** | **最後一個** `user` message | 血量／回合數／判定結果／玩家輸入／迫近度／JSON 指令 |

要新增一段提示時，只需回答一個問題：**這段文字下一回合會不會不一樣？**
會 → `dynamicBlocks`。不會 → `staticBlocks`。判斷不出來就當成會變。

**最常見、也最貴的錯誤**：把一段靜態文字接在動態內容**後面**
（例如 `` `${prompt}${optionsSpec}` ``）。這會讓那段靜態文字永遠命不中，
而且遊戲照跑、測試照過、沒有人會發現。

破壞這套分層不會壞掉任何功能，只會讓帳單變貴、TTFT 變慢。
這正是它需要被程式強制、而不是被文件提醒的原因。

---

## 其他不可協商的規則

1. **不可以編造數值。** 傷害、經驗值、機率、道具數量一律由引擎給。
   程式不可以在 LLM 失敗時「湊」一段敘事出來冒充 AI 寫的——玩家分不出來，
   那會侵蝕整個遊戲的可信度。失敗就明確回報失敗。
2. **角色卡以存檔為準**，不吃前端送來的角色卡（否則改 localStorage 就能把屬性改成 99）。
3. **玩家不能指定 LLM 供應商或金鑰。** 前端沒有設定面板，`/api/turn` 也不讀 body 的
   `provider` / `apiKey` / `baseUrl` / `model` / `style` / `persona`。要新增這類設定之前先想清楚：
   「前端沒有入口」不等於「後端不接受」，兩邊要一起關。
4. **不要把第三方供應商的原始回應本文送回瀏覽器**。公開錯誤訊息走
   `describeLlmFailure()`，完整原因只寫進 server log。
5. **註解寫「為什麼」，不寫「做了什麼」。** 這個 codebase 的註解密度偏高而且刻意如此：
   很多決策是踩過線上 bug 換來的，寫下當時的判斷才不會被下一個人「順手優化」掉。
   請沿用這個風格，包括保留既有註解裡的決策記錄。
6. **測試不可以為了變綠而放寬。** 斷言改了就要說明為什麼新的斷言問的是對的問題。
   絕對不要跳過、停用或隔離測試。

---

## 開發流程

```bash
npm test                    # 完整回歸（1180+ 項）
npm run test:coverage       # CI 用的覆蓋率門檻版本
npm run lint:prompt-cache   # prompt cache 分層結構鎖
npm run lint:workflows      # GitHub Actions YAML 靜態檢查
npm run test:extreme        # 極端回合／provider 錯誤矩陣
npm run eval:narrative      # 敘事行為 eval（要金鑰；沒有就跳過）
```

`eval:narrative` 是唯一一支驗「**模型真的照做了嗎**」的檢查。其餘測試對提示詞的斷言
只能證明「字串在 prompt 裡」，不能證明模型因此改變了行為。改動反客服協定、第四面牆條款
或任何靜態層的約束之後，這一支才是能告訴你「有沒有效」的東西。

送出改動前，`npm test`、`npm run lint:prompt-cache`、`npm run lint:workflows` 都要綠。

---

## 專案地圖

| 路徑 | 是什麼 |
| --- | --- |
| `core/` | 規則引擎：擲骰、判定、敘事分級、事件日誌。**不認識 LLM。** |
| `content/llm/` | 供應商抽象層。`cacheLayers.js` 是分層契約，`client.js` 是唯一組 messages 的地方 |
| `content/gemini/promptContract.js` | 規則契約層 + 三層的區塊組裝函式 |
| `content/narrativeStyle.js` | 文筆層（面具、文筆設定檔、篇幅節奏）。跟規則契約層嚴格分開 |
| `content/scenario/` | 副本、節點、迫近度、reference 事件 |
| `content/scenario/npcStateMachine.js` | NPC 的 S.A.E.P. 四維矩陣與 CRPG 狀態標籤。「他現在什麼心情」由 JS 算，不由提示詞寫 |
| `content/scenario/npcCooperationEngine.js` | 四個 NPC 共用的合作分類／狀態機。各 `*CooperationPolicy.js` 只放人設 |
| `content/scenario/npcCooperationContract.js` | **靜態層**的 NPC 固定檔案（共用安全規則 + 各角色人設、Agenda／Taboo／Knowledge 基線、語氣素材） |
| `functions/api/` | Cloudflare Pages Functions 的 HTTP 端點 |
| `content/storage/usageLedger.js` | 每日 token 用量帳本（KV，key 前綴 `usage:`） |
| `functions/api/admin/` | 管理員專用端點。非管理員一律 404，不是 403 |
| `public/admin.html` | 用量與成本面板（只有 `ADMIN_DISCORD_IDS` 白名單看得到） |
| `test/` | Node 內建 test runner，離線、不需要金鑰 |

延伸閱讀：`ARCHITECTURE.md`、`LLM_PROVIDERS.md`、`docs/SCENARIO_AUTHORING_STANDARD.md`。
