# Changelog

本文件記錄 AI-無限恐怖 TRPG 的可觀察介面變更、測試重點與後續動畫設計方向，供開發者、測試人員與後續協作者使用。

## [REFACTOR-2026.08.31d] — 場景固定素材搬進歷史層

**影響範圍：** `content/llm/cacheLayers.js`、`content/storage/sessionStore.js`、
`content/scenario/referenceAdapter.js`、`functions/api/turn.js`；
新增 `test/sceneBrief.test.js`；更新 `AGENTS.md`、`ARCHITECTURE.md`、`docs/PROMPT_CACHE_CONTRACT.md`

**變更性質：** 提示詞分層。判定公式、骰池、傷害、獎勵與角色卡格式沒有動。
`session.history` 的每一則多一個 `sceneId` 欄位（舊存檔沒有也能跑，見下方）。

### 為什麼

`buildReferencePromptBlock()` 每回合 1590 字元，連續兩回合逐行比對 **97% 相同**。
但它**兩邊都不屬於**：進 `system` 的話，換一次場景就讓整個靜態前綴加上全部歷史一起失效
（一場遊戲換十幾次場景，比每回合付 1590 還貴）；留在動態層就是每回合重付。

答案是**歷史層**——契約裡一直就有，但一直只被當成「對話輪次」用。它的性質是
「只在尾端追加」，正好是「換場景時追加一次、之後永遠命中前綴」需要的東西。

```
每回合的 reference block   1590 → 927 字元（−663）
場景簡報                  664 字元，換場景時付一次
```

### 三個非做不可的約束

1. **簡報插在時間軸上**（換場景的那一則之前），不是插在最前面——插最前面等於把
   prefix cache 關掉，那正是這件事要解決的問題。
2. **`sceneBriefFor` 只吃 `sceneId`，不吃 `state`。** 吃了 state，舊場景的簡報就會隨著
   玩家撿到線索而改變。環境素材因此只取不吃 state 的那一半（空間、氣氛、地標、可見危險），
   回訪變化留在動態層；玩家走到場景預設房間以外時，動態層會補該房間的描述。
3. **`gmTruth` 絕對不能進 `session.history`。** history 是會隨 session 送回瀏覽器的
   （`public/app.js` 有 `?? res.session.history` 的 fallback）。存檔只存 `sceneId`
   （公開資料），簡報只在組 prompt 時於 server 端推導。有測試釘住。

### 舊存檔

沒有 `sceneId` 的歷史不會壞，也不會憑空生出簡報；接上新回合之後，簡報從第一則帶
`sceneId` 的那一格開始，而且不會改寫舊存檔那幾則（有測試釘住）。

### 一個只有 e2e 才抓得到的坑

第一次端到端驗證顯示簡報「沒有送到模型」——但那是測試動作選錯了：那一回合命中
canonical approach，走了 `canonicalDirectSend` 直送路徑、根本沒有呼叫 LLM。
換成不會命中的自由行動之後才驗到真的行為。離線測試不會告訴你這件事，
因為它們不經過那條分支。

### 測試

新增 `test/sceneBrief.test.js`（9 項）：簡報是 state-free、gmTruth 進得了簡報但進不了存檔、
同場景多回合只送一次且前綴只在尾端成長、換場景時新簡報排在既有歷史之後、
A→B→A 會重新提醒、舊存檔相容、沒給 `sceneBriefFor` 時行為完全不變、
每回合的 block 不再重述已進簡報的段落、走到預設房間以外仍補得到描述。

全套 1260 項通過，`lint:prompt-cache`、`lint:workflows`、`test:extreme` 皆綠。

## [FEATURE-2026.08.31c] — 敘事行為 eval：第一支驗「模型真的照做了嗎」的檢查

**影響範圍：** 新增 `scripts/narrative-behaviour-eval.mjs`、`test/narrativeBehaviourEval.test.js`；
修改 `package.json`、`.github/workflows/ci.yml`、`AGENTS.md`

**變更性質：** 新增檢查。沒有改動任何 runtime 程式碼。

### 為什麼

到目前為止，所有關於提示詞的斷言長這樣：

```js
assert.match(ANTI_ASSISTANT_PROTOCOL, /接下來該怎麼辦/);
```

那只證明**字串在 prompt 裡**，不證明模型因此改變了行為。我們花了三輪把 S.A.E.P.
算得很精準、把分層壓得很省，但沒有任何證據說明 NPC 真的不再問「你接下來想怎麼做？」、
`SEIZE_CONTROL` 那一回合真的出現了打斷、白名單以外的事真的沒有被說出來。

最後一項特別值得擔心，而且是重構自己引進的風險：把 1226 字元的合作契約從動態層搬進
`system` 之後，**模型還讀得到它嗎**？`system` 裡的東西被忽略是很常見的失敗模式，
而它不會讓任何離線測試變紅。

### 新增

`npm run eval:narrative` —— 四個場景，用 **production 真正在用的組裝函式**
（`composeSystemInstruction` / `buildNpcCooperationContract` / `buildNpcActiveStateBlock` /
`buildReferencePromptBlock`）經同一個 `buildLayeredRequest()` 分層，打真實模型，
然後對**輸出**下斷言。不走 `/api/turn` 端點是因為要驗「耐心見底時會不會奪權」就得先讓
耐心見底，透過端點得打十幾個真實回合才到得了，又慢又不決定性。

兩種探針：

| | 方式 | 擋不擋 CI | 用途 |
|---|---|---|---|
| 硬性 | 機械正則 | 擋（exit 1） | 徵詢句、系統語言、白名單外的秘密——「絕對不可以出現」 |
| 參考 | LLM judge | 不擋 | 奪權、禁忌反應——「必須出現」，沒辦法用正則做 |

judge 不拿來擋 CI 是因為它自己也會看錯；它的用途是標出哪一回合要人工複查。

沒有金鑰就優雅跳過（exit 0），掛在既有的 `workflow_dispatch` job 上，
跟 `test:real-provider` 同一個約定。

### 這支 eval 自己也有測試

`test/narrativeBehaviourEval.test.js`（6 項，離線、不發任何請求）。理由很直接：
**一支沒有人驗過的檢查等於沒有檢查**——探針的正則寫錯不會有任何跡象，
等到有人真的拿金鑰跑的時候，得到的是一個沒有意義的綠燈或紅燈。

驗三件事：探針抓得到已知違規也不誤傷正常敘事；場景 fixture 真的到得了它要測的那一格
（狀態行裡真的有 `SEIZE_CONTROL` 與 `TRIPPED`）；eval 組出來的 prompt 是 production
的那一份而且分層沒有壞。

寫這組測試當場抓到兩個問題：一條 `/等你(決定|開口|回答)/` 沒有任何樣本涵蓋
（等於永遠不會被驗證），以及 `/骰(子|池)?[^幹]/` 是一條寫壞的正則
（本意是避開誤判，實際上會讓句尾的「骰」抓不到）。

全套 1251 項通過。

## [REFACTOR-2026.08.31b] — 把「幾乎不變」的東西全部趕出動態層，並修掉兩個沉默的分類 bug

**影響範圍：** `content/scenario/npcCooperationContract.js`、`npcStateMachine.js`、
`narrativePackageAdapter.js`、`npcCooperationEngine.js`、四個 `*CooperationPolicy.js`、
`functions/api/turn.js`、`scripts/lint-prompt-cache.mjs`；新增 `test/npcCooperationEngine.test.js`；
更新 `test/{npcStateMachine,npcCooperationPolicy,multiNpcPressure,jurassicParkV1}.test.js`

**變更性質：** 提示詞分層優化 + 兩個分類修正。判定公式、骰池、傷害、獎勵、角色卡格式與
存檔格式一行都沒有動。

### 提示詞分層

階段二之後我用同一把尺回頭量剩下的動態層，發現同一個形狀還在另外兩個地方：

| 位置 | 每回合送出 | 其中逐字不變 |
|---|---|---|
| `[NPC_ACTIVE_STATE]` 的 Agenda／Taboo／Knowledge | 420 字元（2 名 NPC） | 169（40%） |
| `<NPC_Voice_Bible>` 的語氣素材 | reference block 2422 字元 | 1077（44%） |

基線一律搬進 `buildNpcCooperationContract(reference)`（靜態層），動態層只留偏離基線的
覆寫標記：`Agenda: "SELF_PRESERVE"`、`Taboo: "TRIPPED"`、`+Known: "…"`。

```
動態層（場上 2 名 NPC 的一回合）  2842 → 1831 字元／回合（−36%）
靜態層（整場付一次）             1226 → 4484 字元
```

約 3.2 回合回本；五十回合的副本省下四萬多字元的重複計費。

**兩個刻意的界線**：Ash 的語氣素材**不**搬進靜態層（他的生化人破綻有揭露閘門，
而靜態層沒辦法表達「等旗標亮了才給」）；固定檔案的順序跟著 `reference.npcs` 而不是
人設登記處（侏羅紀那三名 NPC 不在登記處裡，只跑登記處會讓他們的素材整個消失，
而且不會有任何測試變紅）。

### 修正

- **陸遠的四條 friction 規則從來沒有被觸發過。** `express_distrust` / `reject_path` /
  `declare_solo` / `passive_questioning` 的觸發詞一個都不在場景關鍵字清單裡，
  所以玩家除非叫出「陸遠」兩個字，否則說「我不信任你」「我要離隊」得到的是完全沒有反應。
  唯一的痕跡是 `friction` 這條分支的覆蓋率一直是 0。
- **「玩家在對誰說話」的動詞清單被抄成四份而且漂開了。** 陸遠那份有「威脅」，
  Lambert 那份沒有——後果是「我再次威脅 Parker，叫他滾開」在 Ripley 的場景裡被算成
  **對 Lambert 大吼**，她於是無緣無故進入 panic。收成一份聯集（`addressesOneOf()`）。
- **陸遠的場景關鍵字補上 `[?？]`。**（這一條是 #51 引進的，當時的差分語料裡沒有
  「在他的場景裡打一個問號」的句子，所以沒被抓到。）他的場景裡只有他一個人，
  玩家打一個問號就是在問他；舊清單只認得幾種特定問法，「這裡怎麼這麼冷？」會完全沒有反應。
  影響被 `transitions.survival_question` 的 `onlyTopics` 擋住：認不出話題的雜問他仍然要回答，
  但不算完成簡報。

差分測試（642 句語料 × 4 NPC × 2~4 場景 = 8346 組）對照階段二之前的 `main`：
**13 組差異，全部是上述修正的方向**——10 組是明確點名其他 NPC 的句子不再算到旁人頭上，
其中兩組先前是真的誤判。

### 測試

新增 `test/npcCooperationEngine.test.js`（12 項）：專門測**開不起來**。
`defineCooperationPolicy()` 的七個護欄分支先前覆蓋率是 0——護欄沒有測試就等於沒有護欄，
哪天有人把 `throw` 改成 `console.warn`，一樣不會有東西變紅。
`npcCooperationEngine.js` 覆蓋率 96.21% → **100%** 行、89.61% → 95.81% 分支。

另外把侏羅紀副本的「禁止透露清單」檢查跟著搬進靜態契約一起驗——
不然就是把洩漏的出口從動態層換到靜態層，而測試還是綠的。

全套 1245 項通過，`lint:prompt-cache`、`lint:workflows`、`test:extreme` 皆綠。

## [REFACTOR-2026.08.31] — 共用樣板抽離：四份合作策略瘦身成一個引擎 + 四份人設

**影響範圍：** 新增 `content/scenario/npcCooperationEngine.js`、`npcCooperationContract.js`、
`npcPersonaRegistry.js`；重寫 `content/scenario/{npcCooperationPolicy,ripleyCooperationPolicy,parkerCooperationPolicy,lambertCooperationPolicy}.js`；
修改 `content/scenario/npcStateMachine.js`、`referenceAdapter.js`、`examples/alienNostromo_v2_contentPackage.js`、
`functions/api/turn.js`、`scripts/lint-prompt-cache.mjs`；更新六個測試檔

**變更性質：** 重構。判定公式、骰池、傷害、獎勵與角色卡格式一行都沒有動。
合作狀態的欄位名有變（見下方「存檔相容」）。

### 為什麼

四個 `*CooperationPolicy.js` 各 450~650 行，其中只有約八十行是那個角色獨有的。
其餘全是同一套東西抄四遍。抄四遍的代價不是行數，是**它們會各自漂移**——而且已經漂了：
四個 NPC 的「玩家越線次數」分別叫 `threatCount` / `boundaryIncidents` / `pressureIncidents`，
於是狀態機必須寫成 `threatCount ?? boundaryIncidents ?? pressureIncidents` 才讀得到同一個概念。

### 調整

| 位置 | 原本 | 現在 |
|---|---|---|
| 分類、計數、轉場的流程 | 四份各自實作 | `npcCooperationEngine.js` 一份，`defineCooperationPolicy(persona)` |
| 安全規則與人設描述 | 四段**動態**區塊各抄一份 | `npcCooperationContract.js`，**靜態層**一份 |
| 角色檔 | 450~650 行（含罐頭台詞表） | 110~176 行，只有人設資料 |
| 越線次數 | `threatCount` / `boundaryIncidents` / `pressureIncidents` | 統一的 `incidents` |
| 每回合的合作狀態 | 兩段 600 字區塊 | 併進 `[NPC_ACTIVE_STATE]` 的 `Stance` / `Beat` |

程式碼：四個 policy 檔 **2124 行 → 1035 行**（含新增的引擎、契約與登記處三個檔）。
提示詞（場上兩名 NPC 的一回合）：動態層 **1695 字元 → 併進既有那一行的 +80 字元**，
搬出去的 1226 字元合作契約住進整場只付一次的靜態層。

### 移除

- **四張 ENTRIES 表**（陸遠 32 筆、Ripley 18、Parker 13、Lambert 14）。它們是寫死的分支走向：
  每一筆是一個 IF 配一段預先寫好的 NPC 台詞。階段一的 S.A.E.P. 狀態機已經能算出
  「他現在什麼心情」，演出就該交還給模型。ENTRIES 裡唯一不能交給模型的東西——
  合作階段的轉場——留了下來，變成每個角色的 `transitions` 表。
- **`reviewedRuntimeText()`**（六十行的字串替換表）。它存在的唯一理由是消毒那些罐頭台詞，
  確保它們不會宣告未授權的世界事實；罐頭沒了，消毒也就不需要了。
- `contentPackage.approvedNpcCooperation` 的 runtime 接線。原始的 Gemini 劇本文字仍保存在
  `examples/alienNostromo_v2_luyuanCooperation.js` 作為寫作參考，但不再 import 進 runtime，
  也不再每回合送進 prompt（`test/npcCooperationPolicy.test.js` 有一條斷言擋著「有人順手接回去」）。

### 存檔相容

`normalizeReferenceState()` 會把舊存檔的 `npcCooperation` 正規化成新的欄位組，
合作階段（`state`）、`trust` 與 `contactEstablished` 照原樣保留。

舊的角色專屬越線計數（`threatCount` / `boundaryIncidents` / `pressureIncidents` /
`panicIncidents` / `commandChallenges`）會**搬進**統一的 `incidents`。這一步是必要的：
不搬移的話計數歸零，合作階段還在（`self_preserving` 仍是 `self_preserving`），
但威脅階梯的位置沒了，下一次威脅會落回第一階——玩家會看到「NPC 忽然原諒我了」。
其餘不再被讀取的角色專屬計數器（`evidenceConfidence`、`crewCohesion`…）不搬移：
它們只餵給已經移除的 entry 選擇條件。

### 怎麼確認沒改壞

這種重構最危險的是「分類器的行為悄悄變了」，而那不會讓任何既有測試變紅。所以先做**差分測試**：
把重構前的四個檔案從 git 取出來，用 642 句語料跨 4 個 NPC × 2~4 個場景跑 **8346 組比對**，
要求新舊分類逐欄相同。第一輪抓到兩個真的回歸（「工程師／自毀程序協助者」被判成玩家在提問、
Lambert 的 question topic 順序被改掉），修好之後 8346 組全等。
階段轉場另跑 1600 條隨機六步序列，98.7% 相同；剩下 1.3% 集中在 Ripley 的 evidence／risk
交互作用，那是把 11 個角色專屬計數器收斂成 3 個共用計數器的直接後果。

### 測試

六個測試檔的斷言從 `entryId` 與罐頭台詞改成規則問題（大吼會不會進恐慌？再吼一次會不會封閉？
降溫會不會抹掉紀錄？三次威脅走不走完階梯？）。**一條行為問題都沒有刪**，
另外補了幾條新的（還沒吵架就先道歉不該推進階段、abandoned 是終點、
純敘述文字不該被當成提問）。`scripts/lint-prompt-cache.mjs` 新增 `REQUIRED_IN_STATIC`：
把整場不變的大區塊搬回動態層會讓 CI 變紅，而不是只讓帳單變貴。
全套 1226 項通過，`lint:prompt-cache`、`lint:workflows`、`test:extreme` 皆綠。

## [FEATURE-2026.08.31] — NPC 動態狀態機（S.A.E.P.）與全域反客服協定

**影響範圍：** 新增 `content/scenario/npcStateMachine.js`、`test/npcStateMachine.test.js`；
修改 `content/narrativeStyle.js`、`content/scenario/referenceAdapter.js`、
`content/scenario/narrativePackageAdapter.js`、`functions/api/turn.js`、
`scripts/lint-prompt-cache.mjs`、`AGENTS.md`、`ARCHITECTURE.md`、`docs/PROMPT_CACHE_CONTRACT.md`

**變更性質：** 新增。判定公式、骰池、傷害、獎勵、角色卡格式與既有存檔一行都沒有動——
狀態機不產生任何 engine effect，只決定「NPC 這回合用什麼姿態演出」。
舊存檔沒有 `npcRuntime` 欄位時由 `normalizeReferenceState()` 補上基線。

### 為什麼

NPC 的劇本提示詞越寫越長之後，模型反而退化成客服小幫手：有問必答、句句順著玩家、
每一段都以「你接下來想怎麼做？」收尾。成因是**指令超載**——幾千字的 IF-ELSE 劇本文字丟給
輕量級／高速模型，它會挑最容易照做的那一條執行，而「當一個樂於助人的助理」正是它最熟的行為。

作法是把「判斷」交還給程式、只把「演出」留給 AI：NPC 生不生氣由 JavaScript 算（0 token、
決定性、可存檔），送進 prompt 的只有一行極短的數值矩陣。

### 新增

- **S.A.E.P. 四維矩陣**（0-10）：`SOC` 社交意願／`ACT` 行動主導權／`EGO` 利己主義／
  `PAT` 耐心值。PAT 是唯一有累積記憶的軸，扣分來源全部是引擎已知的事實：
  玩家卡在同一個場景或節點、這回合沒有可判定的目標（純演出／情緒／閒聊）、NPC 自己受傷、
  玩家對他動手、踩到禁忌；道歉、完成交辦與局勢推進會回補，上限鎖在基線。
- **CRPG 狀態標籤**：`Status`（引擎判定過的狀態）、`Knowledge`（**白名單**，防 AI 劇透）、
  `Agenda`（來自 reference 的 canonical 私人目標）、`Taboo`（踩到當回合標記 `(TRIPPED)`）。
- **`Override: "SEIZE_CONTROL"`**：耐心見底時強制 NPC 奪走場面主導權（打斷／否決／獨走）。
  只在觸發的那一回合出現，而且奪權後回補耐心——常駐的旗標會被當成背景噪音忽略，
  連續回合都奪權則會讓 NPC 從客服變成連環喝斥機器。
- **`ANTI_ASSISTANT_PROTOCOL`**（`content/narrativeStyle.js`，文筆層）：世界不等玩家、
  NPC 嚴禁把決策丟回給玩家、低耐心強制沒收場面主導權、第四面牆條款（引擎的數字不存在於世界裡）。

### 分層

狀態機同時產出兩段文字，而且刻意分開：軸的定義（`NPC_STATE_LEGEND`）整場不變，進 `system`；
數字每回合都變，進動態層的**最頂端**（比 DM 備忘錄還前面——它是這一回合所有演出決策的前提）。
`scripts/lint-prompt-cache.mjs` 把 `npcActiveState` 同時列進「不可進靜態層」與「必須留在動態層」，
所以之後把 legend 跟數值「順手合併」會讓 CI 變紅，而不是只讓帳單變貴。

### 刻意沒做的事

- **不輸出「HP 80%」。** 引擎從來沒有替 NPC 記過血量，生一個百分比出來就是編造數值，
  而且模型會很樂意把它寫進敘事變成玩家看得到的假事實。Status 只送 reference 判定過的狀態軸。
- **不在狀態行裡重複 cooperation objective。** 那份資料已經由既有的
  `<NPC_Cooperation_Contract>` 區塊逐字送出，再送一次只是加 token。

### 測試

新增 `test/npcStateMachine.test.js`（14 項）：基線與舊存檔相容、耐心曲線的升降與回復上限、
威脅／道歉、奪權與其遲滯、禁忌標記、不在場的 NPC 不跑狀態機也不進 prompt、
狀態行不含 HP 百分比與內部欄位、legend 與數值分層、反客服協定四條約束都在。
全套 1222 項通過，`lint:prompt-cache`、`lint:workflows`、`test:extreme` 皆綠。

## [BREAKING-2026.08.29] — 移除舊戰鬥系統，戰術戰鬥成為唯一戰鬥；戰鬥改由局勢觸發

**影響範圍：** 移除 `core/combat/actionEconomy.js`、`content/combat/encounterState.js`、`content/combat/placeholderEncounters.js`、`functions/api/combat/{start,act,resolve}.js`、`public/index.html` 的 `#combat-panel` 與「遭遇戰鬥」按鈕；新增 `content/combat/v2/weapons.js`、`core/combat/README.md`；修改 `content/shop/forms.js`、`functions/api/session.js`、`public/app.js`、`public/combatV2.js`、`content/combat/v2/{encountersV2,battleFactory}.js`、`functions/api/combat/v2/start.js`

**變更性質：** 破壞性——舊的 `/api/combat/{start,act,resolve}` 三個端點與 `session.combat` 欄位不再存在。判定公式、骰池、角色數值計算與角色卡格式不變。

### 移除

- 舊的單敵人戰鬥系統整套（狀態機、動作經濟、API、前端面板）。它與戰術戰鬥並存了一版，兩套並存最容易出的錯是「兩邊各記一份在不在戰鬥中」，現在只有一個答案來源。
- **「遭遇戰鬥」按鈕**。戰鬥由局勢觸發：迫近度到頂（接觸）或主線推進到最終戰節點時自動開戰。打誰由伺服器依副本進度決定（最終戰的 `bossEncounter` > 副本自己的 `threatEncounter` > 內建佔位遭遇）。

### 調整

| 位置 | 原本 | 現在 |
|---|---|---|
| `content/shop/forms.js` | `activateForm()`／`payUpkeep()` 收 budget 並自己扣動作額度 | 只管資源與期限；動作額度由 `core/combat/v2/actionBudget.js` 扣。`effect.activation.action` 仍是資料，戰鬥系統讀它 |
| `functions/api/session.js` | 自己攤平一份戰鬥狀態回給前端 | 只回「有沒有仗在打」的旗標，完整狀態走 `/api/combat/v2/state` 的白名單（兩份攤平邏輯遲早有一份忘記過濾） |
| 副本敵人樣板 | 只有舊系統讀得懂 | `enemyFromTemplate()` 轉成戰術戰鬥的形狀，生命值與先攻由屬性推導，boss 難度不變 |
| 武器表 | `content/combat/placeholderEncounters.js` | `content/combat/v2/weapons.js`（內容未改） |

### 順帶修掉的兩個問題

- **商品的攻擊加值在戰術戰鬥裡吃不到。** `performAttack()` 沒有呼叫 `attackModifiersFor()`，所以買到的「攻擊 +2DP」在敘事迴圈的檢定生效、在戰鬥裡卻無聲消失。這是移植舊測試時才發現的。
- **角色卡壞掉時會用編出來的預設值開戰。** `battleFactory` 原本寫 `character.derived?.hp ?? { max: 10, ... }`，存檔壞掉的玩家會進到一場自己血量憑空變成 10 的戰鬥。改成當場報清楚——開不了的戰鬥好過一場數字是假的戰鬥。

### 測試

移除 `actionEconomy` / `encounterState` / `combatTelegraph` 三個測試檔（它們測的程式碼不存在了）。**驗的行為還在的那些全部搬走，不是刪掉**：`test/shopForms.test.js` 中段留了一段註解列出每一則搬到哪裡，`downState`／`formsApi`／`referenceV2Smoke`／`scenarioIntegration`／`security2026_08_24`／`silentFailures` 六個檔案改打戰術戰鬥的端點。全套 1151 項通過。另以 Chromium 實測：按鈕與舊面板都不存在、自動開戰進得去、戰鬥中沒有自由文字輸入、結算換輪正常、無 console 錯誤。

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
