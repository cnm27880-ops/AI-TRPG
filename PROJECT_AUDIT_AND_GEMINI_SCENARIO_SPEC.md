# AI-TRPG 專案程式碼審查與 Gemini 副本劇情生成規格

**審查對象：** `cnm27880-ops/AI-TRPG`

**審查版本：** `main` 分支，當前 HEAD `c92f41d`（工作樹乾淨）

**測試結果：** `npm test` 通過，772 個測試案例全部通過，0 失敗。

> 本文件分成兩個用途：第一部分說明目前專案已經做到什麼、還缺什麼；第二部分是一份可以直接交給 Gemini 的副本劇情與文字生成規格。Gemini 不需要讀完整個 GitHub 專案，只要讀第二部分與你另外提供的副本設定即可。

---

## 一、先說結論

這個專案目前已經不是單純的「AI 寫一段故事、玩家按下一個選項」原型。規則引擎、骰池、角色建立、傷勢、存檔、副本節點、迫近度、套路遞減、戰鬥 MVP、Gemini 呼叫層與前端故事流都已經有相當完整的骨架，而且目前的自動化測試是綠的。

但是，**目前實際運作的副本系統仍然主要是「AI 生成四個選項＋接續敘事」模式，而不是完整的「AI GM＋固定世界模型＋自由行動裁定」模式**。你想要的方向是可行的，但必須先分清楚：目前已有的是「規則與敘事邊界」，尚未完成的是「副本世界狀態與事件裁定資料庫」。

目前最重要的三個技術缺口如下：

| 優先級 | 缺口 | 影響 |
|---|---|---|
| P0 | `TURN_RESPONSE_SCHEMA` 沒有宣告 `nodeComplete` | 使用 Gemini 結構化輸出時，正常節點可能無法完成，因為程式雖然在 prompt 要求它回傳，schema 卻沒有這個欄位 |
| P0 | `baseDC`、地點、地圖、NPC、物品與事件後果尚未真正接入回合狀態 | 目前 AI 沒有足夠資料擔任真正的 GM；它只能依照當前節點與最近文字即興續寫 |
| P0 | 自訂輸入目前只是關鍵字推導檢定 | 玩家可以自由打字，但還不是語意層面的自由行動；不同做法、目標、工具與後果尚未被結構化 |
| P1 | `onExpireNodeId` 目前只產生提醒，沒有自動切換劣化結局 | `n-expire` 雖然存在，但時間耗盡後不一定真的進入該結局 |
| P1 | 九宮格陣營尚未存在 | 現在已有的是七美德／七惡德與性格核心，不是善惡×守序混亂軸 |
| P1 | DM 備忘錄尚未包含重要物品、重要 NPC、好感度與世界狀態 | 長期劇情會依賴最近八回合文字，容易忘記較早的事實 |

因此，Gemini 現在最適合先做的是：**依照一份明確的副本資料契約，批量生成固定的副本文字素材與事件卡文字，而不是每回合從零發明劇情規則。**

---

## 二、目前已經做到的功能

### 2.1 規則引擎與數值邊界已經相當完整

`core/` 是不依賴 AI 的純運算層。六維屬性是力量、敏捷、耐力、智力、感知、意志；技能分為戰鬥、身手、心智與社交類別，目前包含格鬥、射擊、體魄、潛行、求生、偵察、技藝、醫療、秘識與交涉。

`core/dice.js` 和 `core/check.js` 已經負責骰池、D10、成功數、加骰、機運骰、技能等級、未受訓懲罰、傳奇加值、DC 比較與 margin。AI 不應計算骰子，也不應自行決定 DC 數字。

`core/health.js`、`core/derivedStats.js`、`core/deathAndRevival.js`、`core/rest.js`、`core/xp.js` 與 `core/campaignXp.js` 已經提供生命值、傷勢、衍生屬性、死亡／復活、休息與經驗值邏輯。這些系統的正確性由程式與測試保護，不應交給 Gemini 在文字裡自行解釋或修改。

### 2.2 建卡已經從模板選職業改成生平問答

目前前端實際使用的是 `content/chargen/lifePath.js` 搭配 `content/characterBuilder.js` 的生平問答流程，而不是早期的「特戰隊員／科技專家／軍醫」身分模板。

現行流程大致如下：

1. 玩家回答五道美德／惡德／性格相關問題。
2. 系統依所有答案綜合計分，而不是只看最後一題。
3. 系統自動分配屬性與技能。
4. 玩家在甦醒階段取得五點自由屬性重塑點。
5. 系統建立背景故事、性格核心、美德、惡德與影子美德／影子惡德。
6. 角色卡保存背景、能力、傷勢、XP、復活次數與其他資料。

角色背景與美德／惡德目前已經會透過 `moralityHints()`、`narrativeFeatHints()` 和 `buildDmMemo()` 部分送進 AI 敘事提示。因此 Gemini 可以依照角色的人生背景與性格傾向寫 NPC 反應，但不能把性格提示當成玩家必定會做出的行動。

### 2.3 主回合 `/api/turn` 已經有完整的規則先行流程

目前實際遊戲的主要回合流程位於 `functions/api/turn.js`，順序如下：

```text
讀取 session 與角色卡
  ↓
確認角色是否昏迷或死亡
  ↓
載入副本與目前節點
  ↓
如果是首次開場，直接回傳固定開場，不呼叫 AI
  ↓
查驗玩家選項，或接收玩家自訂文字
  ↓
推導檢定組合
  ↓
套用套路遞減與能力加值
  ↓
由程式擲骰、計算成功數、比較 DC
  ↓
依判定結果套用迫近度
  ↓
把場景、前情、日誌、角色與節點指引組成 prompt
  ↓
呼叫 LLM 產生敘事與下一輪選項
  ↓
解析及查驗 AI 回覆
  ↓
必要時重試一次 JSON
  ↓
處理節點完成、獎勵、時間與通關結算
  ↓
寫入 history、event log 與 session
```

因此，專案目前已經遵守一項很重要的原則：**規則先算完，AI 後寫文。** `core/narration.js` 會把結果分成大成功、成功、驚險成功、些微失敗、失敗與慘烈失敗等級，並要求 AI 把成功和失敗寫成不同處境。

### 2.4 選項系統已經有一些防止「只看數字」的設計

`content/turnOptions.js` 目前要求 AI 每回合產生四個選項，前端再固定提供自訂行動入口，因此玩家實際上是「四個 AI 選項＋一個自由輸入」。

選項目前包含以下欄位：

| 欄位 | 作用 |
|---|---|
| `label` | 玩家看得到的行動文字 |
| `hint` | 玩家想從這個行動得到什麼 |
| `requiresCheck` | 是否需要檢定 |
| `attribute` | 使用哪個屬性 |
| `skill` | 使用哪個技能，也可以是純屬性檢定 |
| `difficulty` | 容易、普通、困難、很困難、極難 |
| `dc` | 由引擎依難度查表產生，不接受 AI 自己填入 |

系統限制每回合最多兩個純敘事、不擲骰選項，至少保留兩個需要檢定的選項；若 AI 回覆壞掉，會用通用保底選項補滿四個。玩家也能在按下選項前看到骰池、難度、未受訓風險與套路遞減提示。

這些設計已經改善了「每一回合都只按骰池最大的選項」問題，但還沒有完全解決。因為目前 AI 仍然會每回合生成四個帶有屬性、技能與難度的選項，玩家仍然可以把它當成一張最佳化表格閱讀。

### 2.5 《異形》副本目前已經有固定開場、節點圖與迫近度

目前預設副本是 `content/scenario/examples/alienNostromo.js` 的《異形》諾斯托羅莫號，內容包含：

| 已有內容 | 實際狀態 |
|---|---|
| 副本簡介 | 已有 `briefing.title/premise/objective/caution`，會顯示在玩家 HUD |
| 時間軸 | 已有 `timeWindow`，描述原作時間位置與副本跨度 |
| 甦醒過場 | 已有 `arrivalNarration`，而且有固定收尾要求 |
| 固定開場 | 已有 `openingNarration`，首次開場不呼叫 AI |
| 固定開場選項 | 已有四個 `openingOptions`，並會經過同一套選項查驗 |
| 迫近度 | 已有 0 至 6 的 `threatTrack` 與四個階段：潛伏、追蹤、貼近、接觸 |
| 異形遭遇 | 已有 `threatEncounter`，迫近度到頂時會自動轉入戰鬥 |
| 主線節點 | 已有 `n1` 至 `n4`，依前置節點線性推進 |
| 劣化節點 | 已有 `n-expire` 的資料，但自動觸發仍未完成 |
| 最終戰 | `n4` 設為 `isFinale:true`，需要 `bossEncounter` |
| 異形戰鬥資料 | 已有一隻成體異形的屬性、技能、護甲、體型與預告動作 |

目前四個主要節點是：離開休眠室並理解船況、發現母親的特別指令、啟動主機超載並前往水仙號、在水仙號上處理跟來的異形。這是一個清楚的線性教學副本，適合先驗證系統，但它還不是多路線事件網路。

### 2.6 迫近度、套路遞減與時間預算已經能把失敗留下來

`content/scenario/threat.js` 會把判定結果轉成持續存在的迫近度。成功通常讓威脅拉遠，失敗讓威脅靠近；威脅階段會被送給 AI，並在前端顯示。

`content/scenario/repetition.js` 會記錄連續使用的「屬性＋技能」組合。第三次開始提高 DC，換一個方法就歸零，並要求 AI 把它描述成「世界學會了這一招」，而不是玩家突然變笨。

`content/scenario/timeBudget.js` 會讓玩家的主線推進與其他消耗時間的活動共享同一筆回合預算。諾斯托羅莫號目前設定為十四回合。

這三個系統已經是你想要的「世界會對玩家行為產生持續反應」的基礎。不過迫近度目前是單一威脅軌，尚未細分成地點、物品、NPC 或事件狀態。

### 2.7 戰鬥與前端接線已有可玩的單敵人 MVP

`core/combat/` 已經包含先攻、防禦、攻擊、護甲、行動經濟與完整攻擊流程；`content/combat/encounterState.js` 已經能處理玩家與單一敵人的交替攻擊、敵人預告、戰鬥勝負與戰鬥外／戰鬥內型態。

目前限制也很清楚：這是單敵人、一對一、固定敵人行為的 MVP。多敵人、隊友隨行戰鬥、範圍攻擊、混合傷害、不良狀態、載具戰鬥與大量真實裝備資料尚未完成。

### 2.8 Gemini 呼叫層、結構化輸出與降級處理已有骨架

`content/llm/client.js` 已經提供 Gemini、DeepSeek、OpenRouter、Workers AI 與 OpenAI 相容端點的統一呼叫層。Gemini 使用 `generateContent` 格式，並支援 `responseMimeType: application/json` 與 JSON schema。

目前還沒有在這個沙盒裡真正打過 Gemini API；相關測試使用假的 fetch 或 Cloudflare AI binding。因此，Gemini 的實際金鑰、模型名稱、配額、端點可用性仍須由部署環境驗證。

目前每次一般 `/api/turn` 大致會產生一次 LLM 呼叫；若回覆不是合法 JSON，而且沒有被判斷為截斷，會自動重試一次。固定開場不呼叫 AI，純敘事選項本身仍然會呼叫 AI，因為它需要生成下一段敘事與下一輪選項。

---

## 三、目前還沒有做到的功能與程式缺口

### 3.1 P0：目前還沒有真正的「副本世界模型」

目前的 `content/scenario/schema.js` 主要描述章節與節點：`id`、`title`、`canonSummary`、`prerequisites`、`baseRewardPoints`、`baseDC`、`isFinale` 與 `bossEncounter`。它沒有正式描述以下資料：

- 房間與通道的地圖連接。
- 玩家目前的真實位置。
- 門、電力、通風管、警報與設備狀態。
- NPC 名單、位置、知識、目標、恐懼與好感度。
- 玩家取得、遺失或損壞的物品。
- 已發現與未發現的線索。
- 事件的前置條件、可用方法與成功／失敗後果。
- 各種事件對其他事件、NPC、物品與結局的影響。

因此，現在的 `canonSummary` 本質上是「這個節點原本應該發生什麼」，不是一套可以讓 AI 查詢與裁定的世界資料庫。若只把更多劇情梗概塞進 `canonSummary`，AI 仍然是在讀小說大綱，不是在操作一個遊戲世界。

### 3.2 P0：`nodeComplete` 沒有放進目前的回合 JSON schema

`content/scenario/nodePrompt.js` 會在 prompt 裡要求一般節點完成時回傳：

```json
{ "divergenceTier": 2 }
```

而 `functions/api/turn.js` 會讀取 `parsed.data.nodeComplete`，再交給 `validateNodeComplete()` 與 `completeNodeAndAdvance()`。

但 `content/turnOptions.js` 的 `TURN_RESPONSE_SCHEMA` 目前只宣告：

```text
st_thought
narration
options
```

schema 的 properties 沒有 `nodeComplete`。副本整合測試使用假的 AI 回應字串，所以測試仍然可以手動塞入 `nodeComplete` 並通過；但實際 Gemini 若使用結構化輸出，這個欄位很可能被模型端省略或拒絕。

這是目前最應該先修正的問題。正確方向是把 `nodeComplete` 加入 schema，並讓它可以是 `null` 或含有 `divergenceTier` 的物件；同時補一個真正使用 Gemini schema 的整合測試，確認一般節點確實能完成、最終戰不會被敘事信號跳過。

### 3.3 P0：`baseDC` 已存在，但目前不是真正的玩家行動 DC

副本節點有 `baseDC`，`content/scenario/divergence.js` 也有 `computeNodeDC()`，可以依扭轉度計算節點 DC。但目前搜尋實際呼叫路徑可以看到：

- AI 生成選項使用 `difficulty` 查表成 DC 1 至 5。
- 玩家自訂輸入在 `content/checkIntent.js` 使用預設 DC 3。
- `computeNodeDC()` 目前主要由測試驗證，沒有真正接入 `/api/turn` 的玩家行動判定。
- `completeNode()` 雖然回傳計算後的 `dc`，但 `turn.js` 的節點結算並沒有用它來決定本次行動是否成功。

所以目前副本作者在節點裡設定 `baseDC: 1/2/3/4`，不代表玩家完成該節點時真的會面對那個 DC。這個欄位目前比較像預留資料，而不是完整生效的機制。

若改成 AI GM 架構，建議不要再讓 AI 直接替節點決定 DC，而是讓每個事件的每種處理方法都在副本資料裡定義固定的檢定組合與難度。

### 3.4 P0：自訂輸入目前是關鍵字路由，不是語意理解

`content/checkIntent.js` 的 `inferCheckParams()` 目前做的是：

1. 將玩家文字轉成字串。
2. 依照 `INTENT_TABLE` 的順序尋找第一個命中的關鍵字。
3. 依關鍵字選出固定屬性、技能與 DC。
4. 找不到關鍵字時退回感知檢定，預設 DC 3。

例如「觀察、搜索、檢查」會導向感知＋偵察；「修理、終端、系統」會導向智力＋技藝；「說服、威脅、騙」會導向意志＋交涉。

這代表玩家確實可以輸入自訂行動，但目前以下差異不會被真正理解：

- 玩家要達成什麼目標。
- 玩家使用了什麼方法。
- 玩家是否有必要的工具。
- 玩家是否同時描述了多個行動。
- 玩家是在對 NPC 交涉、欺騙、威脅還是安撫。
- 玩家是否改變了目前事件的解法，而不只是換了一個關鍵字。

未來可以讓 AI 只負責把自然語言轉成 `intent`，例如「封鎖醫療艙」；但合法性、地圖、工具、DC、後果與狀態更新仍要由事件資料與程式驗證。不能讓 AI 直接回傳一個數字就算數。

### 3.5 P1：時間耗盡目前沒有真正自動切換劣化結局

副本章節可以設定：

```js
{
  timeLimitRounds: 14,
  onExpireNodeId: "n-expire"
}
```

`findActiveNode()` 會排除這個劣化節點，避免玩家在正常情況下直接走進去；`spendChapterTime()` 會記錄時間耗盡，`turn.js` 也會加上警告。

但目前沒有看到時間耗盡後自動完成或切換到 `onExpireNodeId` 的完整流程。實際上，時間耗盡後主要是得到「接下來應該轉向劣化結局」的提示，並不是引擎立刻把玩家導向 `n-expire`。

因此 Gemini 可以寫好劣化結局文字，但在程式補上自動路由前，玩家不一定會穩定看到它。

### 3.6 P1：場景位置沒有成為持久化的權威狀態

目前 session 有 `scene.context`，建立存檔時會先放入章節的 `openingScene`。但在一般回合裡，前端沒有持續送出新的結構化位置，`turn.js` 也沒有從 AI 回覆取得 `location` 或 `statePatch`。

因此，AI 會看到：

- 最近幾輪的文字 history，最多八輪。
- 最近十二筆事件摘要。
- 初始或外部傳入的 `sceneContext`。
- 當前節點、迫近度與時間預算。

但它沒有一個由程式確認的「玩家現在位於哪個艙室」欄位。這是目前不能直接稱作完整 AI GM 的主要原因之一。文字裡寫玩家走到了貨艙，不代表下一回合的引擎真的知道玩家在貨艙。

### 3.7 P1：DM 備忘錄還沒有重要 NPC、物品與好感度

`buildDmMemo()` 目前主要包含：

- 玩家名稱。
- 傷勢。
- XP。
- 玩家背景。
- 時間倒數。

程式碼本身已經留下 TODO，說明未來要加入重要物品表與重要角色／好感度表。`eventLog` 也已經支援好感度變化類型，但諾斯托羅莫號副本目前沒有一個完整的 NPC roster 和可供回合更新的 NPC 狀態表。

因此，Gemini 目前不能可靠地記住「某個 NPC 已經受傷、已經不信任玩家、手上拿著哪一把鑰匙、知道哪一條秘密通道」。這些必須先做成資料，才有可能穩定地寫進長篇副本。

### 3.8 P1：目前沒有九宮格陣營系統

現行 `content/chargen/virtueVice.js` 是七美德與七惡德：慈愛、信念、剛毅、希望、正義、穩重、節制，以及驕傲、嫉妒、憤怒、貪欲、懶惰、色欲、縱欲。

它目前的用途是：

- 建卡時依五道問題計分。
- 產生一個美德與一個惡德。
- 產生性格核心。
- 透過 `moralityHints()` 送進敘事 prompt。

它不是 D&D 的善良／邪惡與守序／混亂九宮格。目前程式裡沒有 `alignment` 欄位、沒有善惡軸分數、沒有守序混亂軸分數、沒有依玩家行動更新陣營，也沒有在副本結算時真正計算美德／惡德觸發；`settlement.js` 的 `virtueTriggers` 與 `viceTriggers` 目前固定為 0。

### 3.9 P1：目前的記憶仍是短期記憶

`sessionStore.js` 的 `HISTORY_LIMIT` 是 8；`turn.js` 餵給 AI 的事件日誌摘要上限是 12。這是一個合理的成本控制方式，但長副本會遇到早期資訊被裁掉的問題。

完整 event log 仍然保存在存檔中，所以資料沒有消失；只是目前沒有自動摘要、長期狀態表或檢索機制把它重新送給 AI。若未來副本變成二十至四十回合以上，應該依賴結構化世界狀態，而不能只增加 history 上限。

### 3.10 其他目前刻意未完成的範圍

以下不是本次 AI GM 改造的第一優先，但程式文件已明確記錄為未完成：

- 500 多頁資源型錄的批量轉換工具。
- 完整血統、道具、技能樹與裝備資料。
- 多敵人、隊友隨行、範圍攻擊、混合傷害與不良狀態。
- 完整契約數值與 NPC 帶出副本系統。
- 真正的建卡分數帳本；目前復活費用有以 XP 帳本代打的近似實作。
- Cloudflare Pages、KV、Google 登入與 Gemini 真實環境連線驗證。

---

## 四、目前每回合會花多少 AI 呼叫

| 情況 | 是否呼叫 AI | 說明 |
|---|---:|---|
| 首次進入副本，有 `openingNarration` 與 `openingOptions` | 否 | 固定文字直接回傳，零延遲 |
| 玩家選擇一般檢定選項 | 是 | 產生敘事、`st_thought` 與四個下一輪選項 |
| 玩家選擇純敘事選項 | 是 | 不擲骰，但仍要生成敘事與下一輪選項 |
| 玩家輸入自訂行動 | 是 | 先由關鍵字表推導檢定，再生成敘事與選項 |
| AI 回覆格式錯誤 | 通常再一次 | `turn.js` 會自動重試一次 JSON |
| AI 回覆不足四個合法選項 | 不增加呼叫 | 用程式保底選項補滿 |

目前最浪費呼叫的地方不是骰子，而是：**每一個回合都要求 AI 同時寫一段長敘事、思考欄位與四個完整選項。** 若未來改成事件卡系統，最理想的方向是：

1. 由程式根據當前事件列出合法行動類型。
2. 由副本資料固定每種行動的檢定與後果。
3. Gemini 只生成這次結果的文字，或一次輸出短敘事與簡要行動提示。
4. 不要讓 Gemini 每回合重新發明 DC、地圖、道具與事件規則。

---

## 五、九宮格陣營應該怎麼加入

### 5.1 不要取代現在的美德／惡德

建議保留目前的美德／惡德，因為它們描述的是「這個人容易被什麼驅動」；九宮格陣營描述的則是「這個人面對他人、權威、規則與自由時通常採用什麼價值方向」。兩者用途不同。

可以讓角色同時擁有：

```js
morality: {
  virtue: "正義",
  vice: "憤怒",
  shadowVirtue: "穩重",
  shadowVice: "驕傲",
  core: { name: "拿著刀的好人", description: "..." }
},

alignment: {
  goodEvil: "中立",
  lawChaos: "混亂",
  scores: {
    goodEvil: 0,
    lawChaos: 2
  }
}
```

### 5.2 陣營不應該是玩家的行動限制

陣營應該影響：

- NPC 對玩家的初始信任與反應。
- 哪些事件更容易被觸發。
- 某些 NPC 是否願意合作。
- 結局文字與副本獎勵評價。
- 企業命令、船員生存、個人自由之間的衝突表現。

陣營不應該直接禁止玩家做事。例如「善良角色不能殺人」「守序角色不能說謊」會把 TRPG 變成道德測驗，也會阻止玩家做出有趣的掙扎。

比較好的做法是讓行動產生標籤：

| 行動標籤 | 善惡軸傾向 | 守序混亂軸傾向 |
|---|---:|---:|
| 救助無辜者 | 善良 | 0 |
| 為了生存犧牲他人 | 邪惡或偏邪惡 | 0 |
| 遵守明確承諾 | 0 | 守序 |
| 服從企業命令 | 0 | 守序 |
| 反抗權威保護自己 | 0 | 混亂 |
| 為了結果偽造規則 | 視目標而定 | 混亂 |
| 為了救人而違反命令 | 善良 | 混亂 |
| 為了娛樂故意製造混亂 | 邪惡 | 混亂 |

「絕對混亂」的玩家不需要特殊按鈕。只要事件資料允許合理的替代方案，玩家可以提出非常奇怪的做法；系統只需要檢查這個做法是否符合地圖、工具、能力與物理條件。若合法，就讓它進入檢定或直接產生後果。

### 5.3 陣營更新最好由事件資料提供，不要讓 AI 自行決定

未來可以讓每個事件結果包含：

```json
{
  "alignmentSignals": [
    { "axis": "goodEvil", "delta": -1, "reason": "救下受傷船員" },
    { "axis": "lawChaos", "delta": 1, "reason": "為了救人違反企業命令" }
  ]
}
```

但 `delta` 必須由副本作者在事件卡中事先定義。Gemini 可以把這件事寫成文字，不能自己判斷「玩家這次應該增加三點善良」。

---

# 六、給 Gemini 的副本劇情生成規格

以下部分可以直接複製給 Gemini。它描述的不是「請自由寫一個異形故事」，而是「請為這個 AI-TRPG 專案製作一份可以接入系統的副本內容包」。

## 6.1 Gemini 的角色定位

```text
你是 AI-TRPG 專案的副本內容編劇，不是規則裁判，也不是自由創作小說家。

你的工作是依照我提供的副本世界真相、地圖、NPC、事件、檢定難度與後果，
生成可以被遊戲引擎使用的玩家可見文字、AI GM 內部資料與事件演出文字。

你不可自行改變：
- 世界真相
- 地圖連接
- NPC 身分與秘密
- 事件前置條件
- 檢定屬性、技能、難度與 DC
- 獎勵數值
- 物品數量與效果
- 已指定的成功、驚險成功、失敗與慘烈失敗後果

你可以做的事是：
- 把已確定的事件寫成有畫面、有節奏的中文敘事。
- 為 NPC 生成符合其性格、知識與當前狀態的對白。
- 把玩家可以感知的結果寫得清楚。
- 為同一個事件的不同結果提供不同場景文字。
- 提供簡短、非強制性的行動提示。
- 在不改變規則的前提下，安排場景節奏與敘事順序。
```

## 6.2 Gemini 必須生成的文字種類

副本文字分成「玩家可見文字」與「AI GM 內部資料」。兩者不能混在一起。

### A. 玩家可見文字

| 文字項目 | 目前程式是否已能直接使用 | 寫作要求 |
|---|---:|---|
| 副本標題 | 是 | 短、容易辨識，不要在標題中放隱藏真相 |
| 副本 premise | 是 | 1 至 3 句，說明玩家身處什麼局面；不要塞完整劇透 |
| 副本 objective | 是 | 清楚說明玩家目前最終要完成什麼 |
| 副本 caution | 是 | 告知類型與基本危險，不要直接代替玩家做決定 |
| arrivalNarration | 是 | 角色剛抵達副本時看到的第一段文字 |
| openingNarration | 是 | 固定開場，不呼叫 AI，必須高品質且可重複使用 |
| openingOptions | 是 | 固定開場的四個簡短行動提示 |
| 節點 playerGoal | 是 | 顯示在 HUD，必須是玩家看得懂的具體目標 |
| 事件 setup | 目前否 | 玩家進入事件時可看到的場景、人物、物件與線索 |
| 事件 success prose | 目前否 | 目標達成後的新處境，不能只寫「你成功了」 |
| 事件 narrow success prose | 目前否 | 目標達成但付出小而具體的代價 |
| 事件 failure prose | 目前否 | 行動失敗且局勢具體惡化，不能讓玩家原地重試 |
| 事件 critical failure prose | 目前否 | 不可逆的重大後果與新的位置／威脅 |
| NPC 對白 | 目前否 | 依 NPC 當前知識、恐懼、利益與信任程度生成 |
| 線索描述 | 目前否 | 不直接公布真相，只讓玩家可以推理 |
| 結局文字 | 目前否 | 依玩家實際完成的條件與代價生成，不只分好結局／壞結局 |
| 異形 telegraph | 是 | 只寫玩家看得見的動作，不直接寫「它準備殺你」 |

### B. AI GM 內部資料

這些內容不是直接印給玩家看的，目的是讓遊戲回合有可以遵循的世界邏輯。

| 內部資料 | 用途 |
|---|---|
| `immutableTruths` | 副本中絕對不能被 AI 改寫的真相 |
| `mapFacts` | 房間、通道、門、通風管與設備之間的真實連接 |
| `npcKnowledge` | 每名 NPC 知道什麼、不知道什麼、隱瞞什麼 |
| `npcGoals` | 每名 NPC 當前想達成的目標 |
| `npcFears` | 什麼情況會讓 NPC 逃跑、背叛、合作或失控 |
| `itemFacts` | 物品位置、用途、是否消耗、是否可以損壞 |
| `eventTrigger` | 事件的前置條件與可觸發時機 |
| `eventTruth` | 事件實際發生了什麼，只有 GM 能看見 |
| `availableApproaches` | 玩家可以用哪些不同方法處理事件 |
| `outcomes` | 成功、壓線成功、失敗、慘烈失敗的固定後果 |
| `clueVisibility` | 哪些資訊在什麼條件下可以被玩家知道 |
| `alignmentSignals` | 事件結果對善惡軸與守序混亂軸的預定影響 |
| `unlockEvents` | 事件完成後可以開啟哪些後續事件 |
| `closeEvents` | 哪些事件或路線會因此永久關閉 |

---

## 6.3 副本內容的分層結構

請 Gemini 將每個副本拆成以下六層，而不是只寫一篇從頭到尾的小說。

### 第一層：副本簡介

這些內容會顯示在玩家 HUD，因此不能放只有 AI 才能知道的秘密。

```json
{
  "briefing": {
    "title": "USCSS 諾斯托羅莫號",
    "premise": "玩家目前身處什麼局面。",
    "objective": "玩家最終需要完成的公開目標。",
    "caution": "給玩家的類型提示與基本危險。"
  }
}
```

### 第二層：抵達與固定開場

`arrivalNarration` 接在通用甦醒過場之後，最後必須留下防護罩仍在或即將散開的畫面，並且不能與章節 `openingNarration` 重複同一個節拍。

`openingNarration` 是玩家第一次正式看到副本的固定文字。它不應該替玩家決定：

- 玩家感到害怕。
- 玩家決定往哪裡走。
- 玩家已經拿起某個物品。
- 玩家已經相信某個 NPC。
- 玩家已經完成任何需要檢定的行動。

開場應該提供可以互動的具體物件，例如半開的艙門、拖痕、通風管聲音、閃爍的終端、還亮著的手電筒或等待回覆的廣播。

目前程式要求 `openingNarration` 與 `openingOptions` 必須成對出現；若寫了其中一個而沒有另一個，副本驗證會失敗。

### 第三層：固定劇情里程碑

里程碑是副本必須逐步抵達的劇情節點，但不代表玩家一定要用同一種方式完成它。

例如《異形》副本可以有：

```text
M1：玩家知道船員正在失蹤，且失蹤不是正常撤離。
M2：玩家知道船上存在非人類威脅。
M3：玩家知道母親接到要求保留樣本的特別指令。
M4：玩家啟動逃生或自毀程序。
M5：玩家進入最終逃生階段。
```

每個里程碑應該列出三至六種可能完成方式，例如：

```json
{
  "id": "threat_confirmed",
  "title": "確認船上存在非人類威脅",
  "required": true,
  "possibleEvidence": [
    "在貨艙發現不可能由人類造成的屍體痕跡",
    "從動作偵測器捕捉到不符合船員數量的移動",
    "聽取倖存者證詞",
    "在通風管內發現生物分泌物"
  ]
}
```

### 第四層：事件卡

事件卡是整個副本的核心。它不是一段小說，而是「一個可以被不同玩家行動處理的局面」。

建議每張事件卡包含以下內容：

```json
{
  "id": "medical_bay_quarantine",
  "title": "醫療艙隔離爭議",
  "phase": "contamination",
  "truth": "醫療艙內的傷者尚未確認感染，但他的傷口與通風系統有關。",
  "trigger": {
    "all": [
      "player_knows_threat_exists",
      "medical_bay_power_unstable"
    ]
  },
  "visibleSetup": "玩家能看到的場景與人物，不直接說明 truth。",
  "playerGoal": "決定是否隔離傷者並保住醫療艙。",
  "approaches": [
    {
      "id": "convince_crew",
      "label": "說服船員先完成檢查",
      "intent": "用交涉降低衝突",
      "check": {
        "attribute": "意志",
        "skill": "交涉",
        "difficulty": "困難"
      },
      "successTextId": "medical_bay_quarantine.success.convince",
      "nearSuccessTextId": "medical_bay_quarantine.success_narrow.convince",
      "failureTextId": "medical_bay_quarantine.failure.convince",
      "criticalFailureTextId": "medical_bay_quarantine.critical_failure.convince"
    },
    {
      "id": "seal_door",
      "label": "直接封鎖醫療艙",
      "intent": "用工程手段隔離危險",
      "check": {
        "attribute": "智力",
        "skill": "技藝",
        "difficulty": "很困難"
      },
      "successTextId": "medical_bay_quarantine.success.seal",
      "failureTextId": "medical_bay_quarantine.failure.seal"
    }
  ],
  "clues": [
    {
      "id": "vent_residue",
      "visibleWhen": "player_inspects_floor",
      "textId": "clue.vent_residue"
    }
  ],
  "stateEffects": {
    "success": ["medical_bay.sealed", "crew_trust.plus_1"],
    "nearSuccess": ["medical_bay.partial_seal", "threat.plus_1"],
    "failure": ["crew_trust.minus_1", "threat.plus_2", "route.medical_bay.closed"],
    "criticalFailure": ["npc.mara.injured", "player.location.service_corridor"]
  },
  "alignmentSignals": {
    "convince_crew.success": [],
    "seal_door.success": [{ "axis": "lawChaos", "delta": 1 }]
  },
  "unlocks": ["ventilation_intercept", "crew_quarantine_conflict"],
  "closes": ["medical_bay_free_search"]
}
```

上面範例中的檢定組合與後果應由副本作者先確認。Gemini 的工作主要是產生 `textId` 對應的文字，不是自行更改 `difficulty` 或 `stateEffects`。

### 第五層：NPC 資料與對白

NPC 不應只是一個名字與一句背景。每名重要 NPC 至少要有：

```json
{
  "id": "mara",
  "name": "Mara",
  "role": "工程師",
  "publicFacts": [
    "負責維修船艦的電力與通風系統"
  ],
  "secretFacts": [
    "曾經看過通風管內的生物痕跡，但沒有告訴其他人"
  ],
  "knows": [
    "工程區有一條通往貨艙的維修路線"
  ],
  "doesNotKnow": [
    "不知道企業特別指令的完整內容"
  ],
  "goal": "活著離開船艦並保護工程區的電力",
  "fear": "被留在沒有照明的狹窄空間",
  "trustStart": "冷漠",
  "trustRules": {
    "player_saves_crew": 1,
    "player_lies_about_injury": -1,
    "player_follows_corporate_order": -1
  },
  "speechStyle": "短句，技術用語，壓力大時會重複確認設備狀態"
}
```

Gemini 寫 NPC 對白時必須遵守「NPC 只知道自己知道的事」。NPC 不可以因為作者知道真相，就在對話中直接說出他沒有取得的秘密。

### 第六層：結局與路線

結局不要只分成「成功逃生」與「死亡」。每個結局至少要由以下條件組成：

- 玩家是否離開母船。
- 異形是否仍然存活。
- 是否救出或犧牲 NPC。
- 是否帶走生物樣本或企業資料。
- 船艦是否自毀。
- 玩家是否違反或服從企業命令。
- 玩家目前的傷勢與資源代價。
- 玩家在善惡與守序／混亂軸上的行動傾向。

```json
{
  "id": "escape_with_survivor",
  "title": "帶著倖存者離開",
  "requires": [
    "shuttle_launched",
    "at_least_one_npc_alive",
    "xenomorph_not_on_shuttle"
  ],
  "textId": "ending.escape_with_survivor",
  "rewardProfile": "survival_with_compassion"
}
```

結局文字應該描述玩家真正付出的代價。不要只寫「你成功逃離，獲得勝利」；應該寫燃料不足、傷勢、被留下的人、未完成的任務、帶走的資料或仍然存在的威脅。

---

## 6.4 成功、壓線成功、失敗與慘烈失敗的寫作規則

目前 `core/narration.js` 已經把結果分成六個主要敘事等級。Gemini 必須把它們寫成不同的世界處境，而不是同一段文字換形容詞。

| 判定結果 | Gemini 必須寫出 | 禁止寫成 |
|---|---|---|
| 大成功 | 目標確實達成，並取得額外可用成果或捷徑 | 只有「你表現得非常好」 |
| 成功 | 目標確實達成，玩家進入新位置或取得新資訊 | 成功後又用一句話把成果抵銷 |
| 驚險成功 | 目標確實達成，但留下聲音、痕跡、時間或物品代價 | 變成「其實沒有成功」 |
| 些微失敗 | 行動可能部分完成，但立刻引發更糟後果 | 讓玩家站在原地再試同一招 |
| 失敗 | 明確損失、退路減少或威脅靠近 | 「你失敗了，但其實沒什麼」 |
| 慘烈失敗 | 不可逆代價，並且把玩家物理上推入新位置或新威脅 | 輕描淡寫、下一句回到原狀 |

每個失敗文字都應至少改變以下三者之一：

1. 玩家所在位置。
2. 原本使用的方法是否仍可使用。
3. 現場有哪些人或威脅存在。

### 寫作範例

```text
不好的失敗：
你沒有成功打開艙門，但你可以再試一次。

好的失敗：
卡榫沒有鬆開。扭力扳手在門縫裡折斷，金屬短柄掉進下方的格柵。
門內傳來兩下沉重的撞擊，鎖舌往外凸了一截。

現在這扇門不只打不開，門後的東西也知道你在外面。
```

---

## 6.5 AI GM 的視角與資訊限制

Gemini 生成的敘事必須遵守以下資訊層級：

| 層級 | 玩家能否直接看到 | 內容 |
|---|---:|---|
| 世界真相 | 否 | 異形位置、NPC 真正目的、企業隱藏指令 |
| GM 可用線索 | 不一定 | 玩家可透過檢查、對話或冒險取得的資訊 |
| 玩家當前感知 | 是 | 看到的門、聽到的聲音、聞到的氣味、NPC 當下動作 |
| 玩家推論 | 是，但不保證正確 | 玩家依線索自行形成的判斷 |

判定失敗不代表玩家突然知道真相。Gemini 應該寫玩家感受到的結果，而不是直接宣布「異形發現了你」「那個人就是內鬼」。

玩家沒有看到的事不能直接寫進玩家視角；如果需要讓玩家察覺，必須透過新的線索、聲音、痕跡、NPC 反應或空間變化呈現。

---

## 6.6 文風規格

目前專案預設使用 `白描` 文風，並附帶人格面具、活場法、防全知、段落節奏與定向要求。Gemini 生成的固定文字應該遵守以下共同規則：

- 使用第二人稱「你」與現在式。
- 不替玩家決定情緒、想法或下一步行動。
- 不替玩家做出未宣告的動作。
- 讓玩家知道自己在哪裡、為什麼在這裡、下一步能往哪裡去。
- 具體寫人與物，不用「氣氛很緊張」代替場景。
- NPC 對白獨立成段。
- 每段敘事都要提供新資訊、新威脅或明確位置變化。
- 不重複貼上上一段環境描寫或玩家剛剛輸入的行動。
- 失敗之後不能讓玩家原地用同樣方法重試。
- 成功之後不能再用轉折把成功偷偷取消。
- 重要場景使用多個段落；不要把整回合壓成一大坨文字。

《異形》風格特別要求：

- 恐怖主要來自資訊不足與空間壓迫，不是每一回合都展示怪物全貌。
- 異形的存在先透過痕跡、聲音、熱源、通風管震動與 NPC 反應呈現。
- 不要讓異形變成只會在劇情需要時出現的傳送怪物；它必須受地圖、通風系統與當前狀態限制。
- 不要讓所有 NPC 都用同一種語氣說話。
- 不要用「突然、詭異、毛骨悚然」等詞直接替玩家下結論，優先描寫具體細節。

---

## 七、目前可直接放進專案的副本包格式

如果要先生成能對應現有程式的版本，Gemini 必須先使用目前的 `scenario pack` 形狀：

```js
export const SCENARIO = {
  id: "scenario.example-01",
  type: "副本",
  version: "1.0.0",
  sourceRef: "[設計] ...",
  difficulty: "簡單",

  briefing: {
    title: "玩家可見的副本標題",
    premise: "玩家可見的局勢簡介",
    objective: "玩家可見的公開目標",
    caution: "玩家可見的危險提示"
  },

  timeWindow: {
    entryPoint: "故事位於哪個時間點",
    span: "副本大約跨越多久"
  },

  arrivalNarration: "甦醒過場中的副本房間文字，必須遵守固定收尾要求",

  threatTrack: {
    name: "這個副本的威脅軌名稱",
    subject: "威脅主體",
    stages: {
      潛伏: "威脅尚未接近時的具體表現",
      追蹤: "威脅正在縮小範圍時的具體表現",
      貼近: "威脅與玩家只隔一層遮蔽物時的具體表現",
      接觸: "威脅已經直接面對玩家時的具體表現"
    }
  },

  threatEncounter: {
    name: "威脅的戰鬥資料",
    attributes: {},
    skills: {},
    weaponKey: "unarmed",
    armor: 0,
    size: 1,
    telegraphs: []
  },

  entries: [
    {
      id: "ch1",
      name: "第一章",
      timeLimitRounds: 14,
      onExpireNodeId: "n-expire",
      openingScene: "給 AI 的事實背景，不是玩家可見小說",
      openingNarration: "固定開場文字",
      openingOptions: [
        {
          label: "玩家可以立刻採取的行動",
          hint: "這個行動想得到什麼",
          attribute: "感知",
          skill: "偵察",
          difficulty: "容易"
        }
      ],
      nodes: [
        {
          id: "n1",
          title: "節點標題",
          playerGoal: "顯示給玩家的具體目標",
          canonSummary: "給 AI 判斷劇情扭轉度的原設定基準",
          prerequisites: [],
          baseRewardPoints: 100,
          baseDC: 1
        }
      ]
    }
  ]
};
```

### 目前格式的注意事項

1. `openingNarration` 和 `openingOptions` 必須一起存在。
2. 開場選項會經過 `validateOption()`，不要省略必要的屬性與技能資料。
3. `playerGoal` 會顯示給玩家，不要寫成作者術語。
4. `canonSummary` 主要是給 AI 與扭轉度系統使用，不要把它當玩家可見簡介。
5. `isFinale:true` 必須搭配 `bossEncounter`。
6. `threatTrack` 的階段名稱必須與 `潛伏／追蹤／貼近／接觸` 對應，否則通用威脅指令無法正確套用。
7. 目前 schema 對副本的深層欄位驗證仍然很少；多塞 `map`、`npcs` 或 `events` 欄位不代表程式已經會使用它們。
8. 目前 `baseDC` 與 `onExpireNodeId` 尚未完整接入實際回合裁定，不能只靠生成副本資料就假設它們已生效。
9. 目前 `nodeComplete` 與結構化回覆 schema 有落差，正式使用 Gemini 前應先修正。

---

## 八、建議的未來 AI GM 事件格式

這是目標格式，不代表目前程式已經能直接讀取。建議之後把副本從「節點＋canonSummary」擴充成「世界資料＋事件卡＋狀態變更」。

```json
{
  "scenario": {
    "id": "scenario.nostromo-01",
    "briefing": {},
    "immutableTruths": [],
    "rules": [],
    "map": {
      "locations": [],
      "connections": [],
      "interactables": []
    },
    "npcs": [],
    "items": [],
    "events": [],
    "milestones": [],
    "endings": []
  },
  "state": {
    "round": 0,
    "location": "sleeping_quarters",
    "threatLevel": 0,
    "timeRemaining": 14,
    "flags": {},
    "inventory": [],
    "npcs": {},
    "alignment": {
      "goodEvil": 0,
      "lawChaos": 0
    }
  }
}
```

未來每一回合的 AI 回應可設計成：

```json
{
  "intent": {
    "type": "seal_area",
    "target": "medical_bay",
    "method": "override_security_door"
  },
  "resolution": {
    "eventId": "medical_bay_quarantine",
    "approachId": "seal_door",
    "checkRequired": true,
    "checkId": "medical_bay_quarantine.seal_door"
  },
  "statePatch": [
    {
      "op": "replace",
      "path": "/location",
      "value": "service_corridor"
    },
    {
      "op": "add",
      "path": "/flags/medical_bay_partial_seal",
      "value": true
    }
  ],
  "nodeComplete": null,
  "narration": "玩家實際看得到的結果文字",
  "actionHints": [
    "沿維修梯離開",
    "檢查通風管",
    "要求 NPC 說明傷口來源"
  ]
}
```

這個格式的重點是：AI 可以提出 `intent` 與 `narration`，但 `statePatch` 必須經過程式驗證；檢定結果、DC、獎勵與合法性不能由 AI 自己寫入世界。

---

## 九、給 Gemini 的完整可複製工作提示詞

以下提示詞可在你已經準備好副本機械資料後使用：

```text
請閱讀以下 AI-TRPG 專案規格，擔任副本內容編劇。

你的任務不是自由創作一篇小說，而是為一個由程式裁定規則、由 AI 擔任敘事 GM 的單人 TRPG 副本，生成可接入遊戲的固定文字素材。

請把輸出分成四部分：

A. 副本公開資料
- briefing.title
- briefing.premise
- briefing.objective
- briefing.caution
- arrivalNarration
- openingNarration
- openingOptions

B. AI GM 事實資料
- immutableTruths
- mapFacts
- NPC 的 publicFacts、secretFacts、knows、doesNotKnow、goal、fear
- itemFacts
- eventTruth
- clueVisibility

C. 事件演出文字
對每一個事件、每一種合法處理方法，分別生成：
- setup
- successText
- narrowSuccessText
- failureText
- criticalFailureText
- NPC reactions
- new clues
- scene ending hook

D. 結局文字
依照提供的 ending conditions，生成每個結局的：
- title
- player-visible narration
- surviving NPC 狀態
- remaining threat
- material cost
- reward tone

嚴格遵守以下規則：

1. 不要自行改變任何數值。檢定屬性、技能、難度、DC、時間、獎勵、傷害與狀態效果以我提供的資料為準。
2. 不要新增我沒有提供的關鍵 NPC、房間、物品、超自然能力或事件條件；如果你認為需要新增，先列在「待確認提案」，不要直接寫進正式內容。
3. 玩家可自由描述行動，但文字要建立在地圖、工具、位置與事件條件之上。
4. 不要替玩家決定情緒、想法、信念或下一步行動。
5. NPC 可以有內心與秘密，但只能知道自己資料中列出的內容。
6. 玩家看不到的真相不要直接放進玩家視角；使用痕跡、聲音、氣味、物件、NPC 反應與空間變化提供線索。
7. 成功與失敗必須造成不同的世界處境，不可以只更換形容詞。
8. 成功必須真正帶來位置、資訊、物品或退路的改善。
9. 驚險成功必須同時完成目標與付出一個小而具體的代價。
10. 失敗必須讓玩家失去資源、退路、位置優勢、NPC 信任或安全時間中的至少一項。
11. 慘烈失敗必須造成不可逆後果，並把玩家推入新的位置或威脅。
12. 失敗後不可讓玩家原地使用同一方法無限重試。
13. 每段文字都必須讓玩家知道：現在在哪裡、為什麼在這裡、下一步可以往哪裡去。
14. 《異形》風格以資訊不足、封閉空間、設備聲音、通風系統、痕跡與 NPC 壓力為主，不要每回合展示怪物完整外貌。
15. 九宮格陣營只影響 NPC 反應、事件偏好與結局，不禁止玩家做出任何合理行動；極端混亂或非常奇怪的玩家行動只要符合世界條件，就應該有可處理的結果。
16. 目前使用第二人稱、現在式、白描風格；固定開場必須能重複使用，不依賴 AI 臨場生成。
17. 開場選項是玩家參考，不是玩家行動的限制。選項只需提供常見路線，自訂輸入仍然是正式遊戲路徑。
18. 請把所有文字 ID、事件 ID、NPC ID、物品 ID 與節點 ID 維持一致，不要同一個對象換名字。

輸出時請將「正式內容」與「待確認提案」分開。正式內容不能包含未經提供資料支持的數值或世界真相。
```

---

## 十、建議實作順序

### 第一階段：先讓目前副本包可以穩定使用

1. 把 `nodeComplete` 加入 `TURN_RESPONSE_SCHEMA`。
2. 補 Gemini 結構化輸出的節點完成整合測試。
3. 把 `baseDC` 的用途定清楚：它是節點完成的基準、事件檢定的基準，還是僅供顯示。
4. 把 `onExpireNodeId` 接成真正的自動劣化路線。
5. 讓 Gemini 先生成目前 schema 能直接吃的 `briefing`、`arrivalNarration`、`openingNarration`、`openingOptions`、`playerGoal` 與 `canonSummary`。

### 第二階段：建立最小 AI GM 世界狀態

先不要一次做整艘船的所有系統。建議只做：

- 6 至 8 個地點。
- 4 名重要 NPC。
- 8 至 12 件關鍵物品或線索。
- 10 至 15 張事件卡。
- 玩家位置、威脅位置、門狀態、NPC 信任、已知線索五類狀態。

每張事件卡先只支援兩至四種處理方法，並由副本資料固定檢定與後果。

### 第三階段：升級自由輸入

將 `inferCheckParams()` 從單純關鍵字表升級成：

```text
玩家自然語言
  ↓
AI 或解析器：intent、target、method、purpose
  ↓
程式：地圖、位置、工具、能力與事件合法性查驗
  ↓
副本事件：尋找對應 approach
  ↓
程式：擲骰與套用固定後果
  ↓
Gemini：生成玩家可見敘事
```

AI 可以幫忙理解「我要做什麼」，但不能讓它自行決定「這個世界有沒有這條路」或「這個 DC 應該是多少」。

### 第四階段：加入九宮格陣營

先新增軸分數與行動標籤，再加入 NPC 反應與結局條件。不要一開始就讓陣營直接給玩家能力加值，否則它會和目前的美德／惡德、技能與商店效果混在一起。

---

## 十一、最終判斷

你目前已經完成的是一個**規則邊界清楚、敘事品質控制逐步加強、具有副本節點與 AI 接口的 AI TRPG 核心**。目前還沒有完成的是一個能讓 AI 在固定地圖、NPC、事件條件與持久化狀態中自由主持的完整 AI GM 世界。

因此，下一步不是單純叫 Gemini 把《異形》故事寫得更長，而是讓 Gemini 按照本文件生成：

> **固定真相、地圖資料、NPC 資料、事件卡、每種結果的文字、線索文字、結局文字，以及目前程式可以直接消費的副本包欄位。**

只要這些資料先被結構化，玩家就可以不被選項綁死；選項只會變成「系統提醒你目前常見的幾種做法」，而不是「遊戲只允許這四個答案」。玩家說出奇怪但合理的行動時，AI 可以理解它，程式可以依照副本規則裁定它，Gemini 再把結果寫成具有《異形》氣氛的場景。

這才是你想要的「AI 當 GM」與單純「AI 搜尋電影後續寫」之間的真正區隔。

---

## 程式碼證據索引

| 主張 | 主要檔案 |
|---|---|
| 規則由程式計算，AI 負責敘事 | `README.md`、`ARCHITECTURE.md` |
| 主回合流程 | `functions/api/turn.js` |
| 選項格式、難度與驗證 | `content/turnOptions.js` |
| 自訂輸入目前是關鍵字推導 | `content/checkIntent.js` |
| Gemini prompt 與 DM memo | `content/gemini/promptContract.js` |
| 回合 JSON schema | `content/turnOptions.js` 的 `TURN_RESPONSE_SCHEMA` |
| 節點完成信號 | `content/scenario/nodePrompt.js` |
| 節點推進與時間 | `content/scenario/progress.js` |
| 扭轉度與節點 DC／獎勵 | `content/scenario/divergence.js` |
| 迫近度 | `content/scenario/threat.js` |
| 套路遞減 | `content/scenario/repetition.js` |
| 目前《異形》副本 | `content/scenario/examples/alienNostromo.js` |
| 現行美德／惡德 | `content/chargen/virtueVice.js` |
| 通關時美德／惡德目前未實際計數 | `content/scenario/settlement.js` |
| 存檔 history 只保留最近八輪 | `content/storage/sessionStore.js` |
| 目前所有自動化測試 | `npm test`：772 pass，0 fail |
