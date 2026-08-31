# Prompt Cache 分層契約

> **這份文件是本專案組裝 LLM 請求的唯一規範。**
> 不論你是人、Claude、GPT、Gemini 還是任何其他協作者：
> 只要你要動任何會進到 LLM 的文字，先讀完這一頁。
>
> 規則由 `npm run lint:prompt-cache`（CI 會跑）與 `test/promptCache.test.js` 強制執行。
> 這兩者不是建議，是門檻。

---

## 為什麼有這份契約

本專案跑在支援 **automatic prefix caching** 的端點上（DeepSeek V4 系列、
硅基流動上的同型模型、多數 OpenAI 相容端點）。這類端點會從第 0 個 token 開始，
比對這次請求跟先前請求的**前綴**：命中的部分算便宜價、不用重算 KV，TTFT 明顯下降。

關鍵是它比的是**前綴**，不是集合：

> **一旦碰到第一個不同的 token，從那裡到最後全部重算。**

所以「這次送了多少 token」不是重點，**「變動的東西有沒有全部排在不變的東西後面」才是**。
一段三千字、整場遊戲一字不改的規格，只要被排在「玩家這回合打的字」後面，
就永遠一次都不會命中——而且從功能上完全看不出來。

這就是這份契約要防的那種錯誤：

> **破壞分層不會讓任何東西壞掉。遊戲照跑、測試照過、玩家沒感覺。
> 唯一的差別是每一回合都重新計費、TTFT 變慢。**

沒有人會在 code review 裡看出來，也不會有人回報。所以規則寫成程式，由 CI 執行。

---

## 三層

一次請求永遠是這三層，順序即是**變動頻率由低到高**，不可調換：

| 層 | 送到哪 | 放什麼 | 多久變一次 |
| --- | --- | --- | --- |
| **static** | `system` message | 敘事者面具、場景固定背景、回應格式規格（`buildOptionsSpec()`）、已封存副本摘要、NPC 狀態矩陣的**讀法**（`NPC_STATE_LEGEND`）、文筆層＋規則契約 | 整場遊戲不變 |
| **history** | 中段的 `user` / `assistant` messages | `session.history` 拆成的對話輪次 | **只在尾端追加** |
| **dynamic** | **最後一個** `user` message | NPC 狀態矩陣的**數值**（`[NPC_ACTIVE_STATE]`，排在這一層最頂端）、DM 備忘錄（血量／XP／剩餘回合）、事件日誌、迫近度、卡關提醒、reference 事件資料、玩家這次的輸入、判定結果、JSON 強制指令 | 每回合全變 |

實作位置：

- `content/llm/cacheLayers.js` —— 契約本身（`buildLayeredRequest()`、`historyToMessages()`、`detectDynamicLeaks()`）
- `functions/api/turn.js` 的 `buildPromptLayers()` —— 主要遊戲回合的組裝
- `functions/api/narrate.js` —— demo/BYOK 端點，同一套分層
- `content/llm/client.js` —— **唯一**可以組 provider `messages` 陣列的檔案
- `content/scenario/npcStateMachine.js` —— NPC 狀態矩陣。**同一個檔案同時產出靜態與動態兩段**
  （`NPC_STATE_LEGEND` 是靜態的軸定義，`buildNpcActiveStateBlock()` 是每回合的數值）。
  這是這份契約在實務上最容易被「順手合併」的一組：兩段講的是同一件事，讀起來像該放在一起，
  合併之後所有測試照樣綠，只有那幾百字的 legend 從此每回合重付一次

---

## 你要新增一段提示時，只需回答一個問題

> **這段文字的內容，下一回合會不會不一樣？**

```
會不一樣（血量、回合數、判定結果、玩家輸入、隨機值、時間、卡關計數…）
    → dynamicBlocks（最後一個 user message）

不會不一樣（規則、格式規格、世界觀設定、角色固定背景、文筆要求…）
    → staticBlocks（system message）

是「上一輪發生的事」
    → history 層，走 cacheLayers.js 的 historyToMessages()，不要自己拼字串
```

**判斷不出來就當成會變**，放動態層。放錯到動態層只是多付那一段的錢；
放錯到靜態層是把它**後面所有東西**的快取一起賠掉。

---

## 絕對不可以做的事

以下每一條都會讓命中率崩掉，而且每一條都**不會讓任何測試自然變紅**
（所以才需要 `lint:prompt-cache` 專門盯著）：

1. **不要把靜態內容接在動態內容後面。**
   `` `${prompt}${optionsSpec}` `` 這種寫法，等於用玩家打的字把 `optionsSpec` 擋在快取外。
   靜態內容一律往 `staticBlocks` 放，不管它看起來多像「提示的收尾」。

2. **不要把每回合都變的值放進 `system`。**
   回合數、血量、剩餘時間、判定結果、迫近度、時間戳記、隨機數——一個都不行。
   `detectDynamicLeaks()` 會抓常見的幾種並記 `[PROMPT_CACHE_STATIC_LEAK]` log，
   但它是安全網，不是許可證：它抓不到的形狀一樣是違規。

3. **不要把對話歷史壓成一段字串。**
   壓成字串之後，滑動窗口一往前移，整段的**開頭**就變了。
   歷史必須是獨立的 `user`/`assistant` messages，這樣新增一輪才只是尾端追加。

4. **不要讓歷史每回合都從頭部裁掉一格。**
   `pushHistory()` 的遲滯窗（`HISTORY_MAX` 16 → 裁回 `HISTORY_LIMIT` 8）是刻意的：
   每回合裁一格 = 每回合都重排前綴 = 快取等於關掉。
   要調整記憶長度就改這兩個常數，不要改成「每次都裁」。

5. **不要在 `content/llm/client.js` 以外的地方組 `messages` 陣列。**
   有第二個組裝點，就會有第二套層次順序，而第二套遲早跟第一套不一樣。

6. **不要用非決定性的順序拼接靜態內容。**
   `Object.keys()`、`Set` 迭代、`Math.random()`、依 `Date` 排序——
   順序只要每次不同，內容一樣也命不中。用固定陣列。

7. **不要把歷史做字串中段截斷。**
   截斷點會隨長度浮動。要縮短就**從最舊的整則丟起**（`clampHistoryMessages()` 的作法）。

---

## 例外（已經想過，不要「順手修正」）

- **JSON 強制指令留在動態層最後一行**，即使它是靜態文字。
  它只有幾十個 token，搬進 `system` 換來的快取收益，遠小於它待在最後一行對輸出格式的實測效果。
- **規則契約（`SYSTEM_INSTRUCTION`）排在靜態層最後**，不是最前面。
  靜態層內部怎麼排對快取沒有影響（整層都是靜態的），所以這裡讓安全性的順序需求優先：
  `composeSystemInstruction()` 結尾那句「衝突時一律以規則契約為準」必須是系統提示的最後一句。

---

## 怎麼確認你的改動沒有破壞它

```bash
npm run lint:prompt-cache   # 結構鎖：原始碼的形狀
npm test                    # 含 test/promptCache.test.js 的四個不變式
```

`test/promptCache.test.js` 釘住的四件事：

1. 連續回合之間，`system` message **逐字相同**
2. `system` 裡沒有任何動態值
3. 歷史層只在尾端追加，既有的每一則不變
4. `messages` 順序是 system → 歷史 → 這一回合的輸入（最後一則）

線上驗證：成功回合會寫一行

```
[PROMPT_CACHE] {"provider":"deepseek","model":"deepseek-v4-flash","hit":8960,"miss":1216,"promptTokens":10176,"ratio":0.881}
```

同一份資料也出現在 `/api/turn` 回應的 `promptCache` 欄位。
供應商沒回報快取欄位時整個欄位不存在（**不是** `hit: 0`——「沒回報」跟「命中 0」是兩件事）。

---

## 如果檢查擋住了你

先假設檢查是對的。它擋的每一條都對應一種真實的成本退化。

真的是誤判時：**修正這支檢查，並在 PR 說明為什麼**
（`scripts/lint-prompt-cache.mjs`，每條規則都有註解說明它在防什麼）。
不要用 `// eslint-disable` 之類的方式繞過，也不要把它從 CI 拿掉——
繞過它的那一次改動，就是下一次帳單暴增的原因。
