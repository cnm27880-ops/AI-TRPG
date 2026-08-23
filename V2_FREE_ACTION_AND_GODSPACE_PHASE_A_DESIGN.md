# V2 受限自由行動合約與主神空間 Phase A 技術設計

**文件狀態：核心方案已實作，持續以真實第三方 Gemini 驗證**
**適用專案：`/home/ubuntu/AI-TRPG`**
**核心原則：reference／規則引擎裁定真相，AI 只演出已授權事實；前端只呈現 server-owned 狀態。**

## 一、這份設計要解決的兩個問題

目前 V2 已經能在規則層保護物品、旗標、位置、HP、威脅、結局與獎勵不被 Gemini 直接寫回，但這還不等於玩家看到的 narration 每一句都完全符合 reference。真實測試中，unmatched free input 仍可能產生「門已鎖死」「維修通道已經封閉」「異形在門外幾公尺」「工具掉落或損壞」等合理卻未經 engine effect 授權的敘述。

第二個問題是主神空間目前已有結算頁、首次劇情、商店、休息、復活與存檔，但結算後返回主神空間主要仍是前端切頁。玩家需要的是一個由伺服器確認的 hub 狀態：上一場副本是否真的封存、有哪些結果、角色受了什麼傷、資源剩多少、哪些功能現在合法可用。

因此本設計分成兩道互相獨立的閘門：

| 閘門 | 解決的問題 | 是否改變遊戲真相 |
|---|---|---|
| **受限自由行動裁定合約** | 明確表示 unmatched 行動本回合只獲得哪種引擎判定與哪些有限授權 | 由 engine 決定；AI 不得增加授權 |
| **不合格時安全重寫** | 若 AI narration 仍把未授權內容寫成完成事實，重寫或改用安全模板 | 不重新擲骰、不重套 effects，只替換展示文字 |

## 二、目前程式流程與設計插點

現在玩家的自訂文字會先經 `resolveReferenceAction()`。若命中 reference approach，adapter 回傳 `mode: "matched"`，使用作者定義的檢定參數與 outcomes；若沒有命中，回傳 `mode: "unmatched"`，接著 `/api/turn` 目前會用 `inferCheckParams()` 做關鍵字推導，完全命中不到時退回「感知」的 fallback 檢定。

這個 fallback 可以保留作為「本回合如何擲骰」的保守預設，但不能再被誤讀成「玩家已經完成了某種世界改變」。尤其是 `major` 只代表這次玩家描述的行動規模較大，不代表引擎授權拆開面板、移動位置、取得物品或改變路線。

目前最適合的安全重寫插點是 `/api/turn` 第一次 LLM 回覆已完成 parse、但 `session.history` 寫回之前。這個位置有三個好處：reference effects、check、threatAssessment 已經由伺服器處理；options 仍可由 adapter 重新生成；替換 narration 不會重複計算任何遊戲狀態。

```text
玩家自由輸入
    ↓
resolveReferenceAction()
    ├─ matched    → reference check/effect/result，由 engine 完成
    └─ unmatched  → generic check + bounded free action contract
                         ↓
                    engine 建立 contract
                         ↓
                    Gemini 只看 contract 寫 narration
                         ↓
                    parse JSON
                         ↓
                    narration compliance scan
                    ├─ 合格       → 採用 narration
                    ├─ 不合格     → 最多一次安全重寫
                    │                ├─ 合格 → 採用 rewritten narration
                    │                └─ 仍不合格／失敗 → engine-safe fallback
                    └─ JSON失敗／截斷 → 不信任原文，直接 safe fallback
                         ↓
                    不重擲骰、不重套 effects、不重算 threat
                         ↓
                    寫 history、回傳 reference options 與 audit metadata
```

## 三、受限自由行動裁定合約

### 3.1 合約的語意

合約不是另一套 AI 規則，也不是讓 AI 自己判斷「這次行動能不能成功」。它是 engine 在一次 unmatched action 完成後產生的**敘事授權清單**。模型只能在清單範圍內描述嘗試、阻力、感官反應與已由引擎確認的結果。

最重要的語意是：**骰子結果不是世界效果。**

例如玩家輸入「我用扳手拆開維修面板」而該文字沒有命中作者 approach。即使 fallback 感知檢定結果為成功，若 reference 沒有授權拆卸面板的 effect，contract 仍應是 `attempt_only`。Gemini 可以寫「面板在施力下發出聲音、卡榫有所鬆動但是否能通行尚未確認」，不可以寫「面板已拆開，維修通道可以進入」。

### 3.2 建議的 contract 形狀

建議在 `content/scenario/referenceAdapter.js` 或獨立的 `content/scenario/freeActionContract.js` 新增純函式 `buildFreeActionContract()`。它只接收已裁定資料，不接收 AI 自己的世界判斷。

```js
{
  contractVersion: 1,
  mode: "unmatched_free_input",
  actionText: "玩家原始自由輸入",
  narrativeMode: "micro|normal|major|reveal|combat",
  resolution: {
    source: "generic_fallback",
    outcomeTier: "成功|驚險成功|些微失敗|失敗|慘烈失敗|自動失敗",
    success: true,
    // margin、DC 與骰池可留在 server audit，不必全部送給模型
    stateChangeAuthorized: false
  },
  authorizedChanges: [],
  authorizedFacts: [
    "玩家已嘗試指定行動",
    "本回合引擎判定分級為……",
    "威脅目前處於由 engine 提供的階段……"
  ],
  observableAllowance: [
    "施力與阻力",
    "聲音、氣味、光線與震動",
    "NPC 對玩家嘗試的可觀察反應",
    "尚未確認的危險與不確定感"
  ],
  prohibitedClaims: [
    "未授權的門開啟或鎖死",
    "未授權的通道可通或封閉",
    "未授權的物品取得、遺失或損壞",
    "未授權的位置移動、傷勢、NPC特殊指令或異形直接接觸",
    "reference 未提供的精確距離、時間、數量、傷害或條款"
  ],
  threat: {
    before: 2,
    after: 2,
    delta: 0,
    assessmentAccepted: false,
    assessmentReason: "模型提議不在本場景允許 enum"
  }
}
```

實際送入模型的 prompt 不必暴露所有內部欄位。尤其 `margin`、原始骰池與伺服器內部錯誤資訊不應變成 AI 可以重新計算的第二套規則。模型需要知道的是：這次是 unmatched、引擎判定是哪個級別、哪些狀態確實已改變、哪些狀態明確沒有授權改變，以及目前威脅階段能寫到哪裡。

### 3.3 `checkIntent.js` 的最小改動

目前 `inferCheckParams()` 回傳 `{ attribute, skill?, dc, matched }`。建議增加敘事用途欄位，但不讓它直接變成 world effect：

```js
{
  attribute: "感知",
  dc: 3,
  matched: false,
  intentClass: "generic_observation",
  authorizationScope: "attempt_only"
}
```

`authorizationScope` 不是由關鍵字決定的「行動成功類型」，而是 unmatched 的保守上限。命中關鍵字只代表選用哪個檢定池；它不能把「拆」「開」「拿」「移動」等動詞自動升格成物品、位置或路徑 effect。

未來若某個副本作者希望允許自由輸入改變一個有限狀態，應由 reference 明確提供 `freeInputPolicy` 或 bounded action catalog，由 adapter 在伺服器端比對後產生 `authorizedChanges`。玩家文字與 Gemini 都只能提出意圖，不能自行創造 catalog 以外的效果。

### 3.4 建議的有限授權層級

第一版建議只實作 `attempt_only`，不要急著開放 free input 直接修改世界。待測試證明安全後，才逐步增加以下狀態，而且每一層都必須由 reference author 明確列出。

| scope | 允許內容 | 第一版是否開放 |
|---|---|---|
| `attempt_only` | 嘗試、阻力、感官反應、未完成操作、NPC 可觀察反應 | **開放** |
| `observable_reaction` | 只有資料明確允許的既定 NPC／威脅反應 | 暫不開放或逐場景開放 |
| `bounded_change` | catalog 指定的一個有限旗標、物品或位置變化 | 等有明確 adapter contract 後開放 |
| `scene_transition` | 僅 reference `nextEvent`／`nextByLocation` 或明確 exit condition | 不由 unmatched 自由輸入直接觸發 |
| `combat_trigger` | 只有威脅 validator 與 contact／policy 條件成立才可進入 | 不由 narration 觸發 |

## 四、不合格時安全重寫

### 4.1 為什麼不能只繼續加 prompt

目前已經有 reference block、response spec、全域敘事契約、prompt 尾端 override 與威脅 directive override。這些提示能降低越界，但不能保證模型永遠不會把「可能」「阻力」寫成「已完成」。因此需要第二道程式閘門，直接檢查要顯示給玩家的 narration。

這道閘門不是要理解所有文學修辭，也不應試圖用正則表達式取代整個語言模型。它只需要抓住**高風險的完成式世界主張**：物品、門、通道、位置、傷勢、異形接觸、NPC 權限命令與未授權數字。

### 4.2 合規檢查器

建議新增純函式 `validateNarrationAgainstContract(narration, contract)`，輸出：

```js
{
  ok: false,
  severity: "high",
  violations: [
    {
      code: "UNAUTHORIZED_WORLD_COMPLETION",
      category: "door_state",
      evidence: "門鎖指示燈轉為死紅",
      message: "unmatched 回合沒有授權改變門禁狀態"
    }
  ],
  safeRewriteRequired: true
}
```

檢查器建議分三層：

第一層是**固定事實白名單**。reference 已提供的場景事實可以進入 `authorizedFacts`，例如開場本來就有一扇半開的門，模型描述「那扇門仍半開」不應被誤判。檢查器不能只看到「門」就拒絕，而要比對是否出現矛盾或新的完成式變化。

第二層是**高風險完成式模式**。例如「已打開」「鎖死」「通道可以通過」「拿到」「掉落」「損壞」「受傷」「撲上來」「就在門外」「三公尺」「幾十公尺」等。第一版應優先檢查明確的完成式與數字，不必阻止「似乎」「可能」「尚未確認」「被阻住」這些保留不確定性的詞。

第三層是**狀態衝突檢查**。若本回合 contract `authorizedChanges=[]`，但 narration 先宣告場景位置已換、inventory 已改、HP 已變、門禁已變或戰鬥已開始，直接視為 high severity。若只是氛圍性描寫而沒有完成式主張，則放行。

建議的 violation category 如下：

| category | high-risk 例子 | 處理 |
|---|---|---|
| `door_state` | 門已鎖死、門已完全打開 | 觸發重寫 |
| `path_state` | 維修通道已打通、唯一出口被封死 | 觸發重寫 |
| `item_delta` | 玩家取得、遺失、摔壞工具或樣本 | 觸發重寫 |
| `location_delta` | 玩家已進入橋樓、位置移到門外 | 觸發重寫 |
| `injury_delta` | 玩家被割傷、HP 下降 | 觸發重寫 |
| `threat_contact` | 異形撲到面前、已在門口、戰鬥開始 | 觸發重寫 |
| `npc_authority` | Ash 執行未授權特殊指令、系統新增條款 | 觸發重寫 |
| `invented_numeric_fact` | 三公尺、幾十公尺、十秒、兩盞燈等新數字 | 觸發重寫；若是 harmless count 也可先降為 medium |

### 4.3 重寫請求的規則

若第一次回覆 parse 成功，但 narration 不合格，只允許一次安全重寫。重寫請求必須包含原始 contract、違規類別與「只改 narration，不改本回合判定」的強制文字。

```text
【安全重寫：上一版 narration 越界】
本回合的 engine contract 不允許任何 authorizedChanges。
請只重寫 narration，保留玩家嘗試與已裁定 outcomeTier，刪除所有未授權的完成式世界主張。
可以寫：施力、阻力、聲音、氣味、光線、NPC可觀察反應、尚未確認的危險。
不可寫：門開／鎖死、通道可通／封閉、物品取得／遺失／損壞、位置移動、傷勢、異形直接接觸、戰鬥開始、精確距離／時間／數量／條款。
不要重新計算骰子、威脅、effect、選項、結局或獎勵。
只輸出原本 schema 的合法 JSON。
```

重寫時要沿用原本的 `narrativeMaxTokens`，不因修正而無限增加輸出。重寫本身是異常路徑，若真的需要節省成本，也可以使用比原模式小一級的上限，但不能讓 major 被壓回 320 token 那種會導致 JSON 截斷的低值。

### 4.4 重寫的狀態安全規則

這是整個方案最重要的實作約束：安全重寫只改展示文字，不能重新執行任何引擎流程。

| 項目 | 第一次回覆後已完成的狀態 | 安全重寫時的行為 |
|---|---|---|
| `performCheck()` | 已完成 | **不重跑** |
| `applyReferenceResult()` | unmatched 不會呼叫；若未來 bounded change 已套用，也已完成 | **不重跑** |
| `applyThreat...()` | AI assessment 已由 validator 處理一次 | **不重跑** |
| `completeNodeAndAdvance()` | 已依 engine signal 處理 | **不重跑** |
| options | 已由 reference adapter 重建 | 忽略模型重寫回傳的 options |
| settlement | 已在同一回合算好 | 不因 narration 重寫而改變 |
| `session.history` | 尚未寫回 | 只寫入最後合格的 narration |
| `st_thought` | 僅 debug 欄位 | 不進 history；重寫版本可丟棄 |

若重寫呼叫失敗、再次被判定為 high severity、被截斷或 JSON 無法解析，直接使用 `buildEngineSafeNarration(contract)`。這個 fallback 不應是空白或「AI 生成失敗」，而應保持沉浸感，例如：

```text
你已經嘗試了「{actionText}」。
施力沒有轉化成一個可以確認的結果；阻力、聲音與周遭反應仍停留在眼前。
引擎判定為「{outcomeTier}」，但沒有任何新的道路、物品、位置或傷勢變化被確認。
威脅仍依目前的迫近階段存在。下一個決定仍由你做出。
```

這個模板中的 `actionText`、`outcomeTier`、威脅階段與「沒有授權的變化」都來自 engine contract；不能把原始不合格 narration 的句子拼回去。

### 4.5 response metadata

建議把下列資料放到現有 `degraded` 物件中，方便 QA 與真實模型測試，不放入玩家故事流：

```js
{
  narrationSource: "ai|ai-rewritten|engine-safe|ai-extracted|ai-raw",
  narrativeSafety: {
    checked: true,
    contractVersion: 1,
    initialPass: false,
    rewriteAttempted: true,
    rewritePassed: true,
    violations: ["door_state", "invented_numeric_fact"],
    fallbackUsed: false,
    rewriteFinishReason: "stop"
  }
}
```

對玩家可見的 warning 只需要顯示「本回合敘事已由引擎安全整理」；不要把 regex evidence 或內部 prompt 細節塞進故事流。

### 4.6 threatAssessment 的處理

原始回覆中的 `threatAssessment` 只能驗證一次。若它不在 enum、超出場景 policy 或不符合 immediate combat 條件，照現有 validator 拒絕並保存理由。安全重寫只取得新的 narration，不接受模型在重寫階段偷偷送來另一個 threatAssessment。

若第一輪 AI response 的 narration 不合格，但 threatAssessment 合法且已套用，重寫後仍保留原本已驗證的 assessment 結果；若第一輪 parse 失敗，則依目前規則使用 engine outcome fallback，不採用不明 JSON 中任何 AI 數值。

## 五、主神空間 Phase A 的目標與邊界

Phase A 的完成定義不是做一個自由聊天的主神，而是讓單副本閉環可靠：玩家看得到上一場副本的 server 結果、傷勢與資源，能合法回到主神空間，能使用已存在的休息／復活／商店功能，並在重新整理或重新登入後得到相同狀態。

目前已存在的能力包括：

| 現有能力 | 現況 | Phase A 做法 |
|---|---|---|
| 全頁結算頁 | `showScenarioSettlement()` 已依 `runSummary` 顯示結局與評價 | 保留，作為第一次封存時的完整 debrief |
| 回到主神空間 | `returnToMainGodSpace()` 目前主要是切畫面 | 改為先呼叫 server 合法返回，再切 hub |
| 商店 | `/api/shop` 已有 location／owner／affordability 驗證 | 不重寫規則，只在 hub 重新載入 storefront |
| 休息 | `/api/rest` 已有主神完全恢復與副本打坐 | hub 沿用；另補死亡閘門與回傳 hub payload |
| 復活 | `/api/revive` 已有費用、次數與 owner 驗證 | hub 顯示 revival quote，按鈕只在 server 允許時出現 |
| 存檔回訪 | `/api/session` 已能帶回 HUD、runSummary、downState | 新增 hub summary／lifecycle，避免只靠前端猜位置 |

## 六、Phase A 的狀態機與合法返回

### 6.1 建議增加 scenario lifecycle 純函式

目前 `locationOf()` 主要透過 `getProgressSummary().scenarioComplete` 判定是否回到主神空間。Phase A 應把「進行中、戰鬥中、終局但未封存、已封存」明確分開，新增 `content/scenario/lifecycle.js`：

```js
{
  status: "active|combat_required|combat|terminal_unsettled|settled|no_scenario",
  location: "恐怖片中|主神空間",
  canAct: true,
  canEnterGodspace: false,
  canViewDebrief: false,
  reason: "副本仍在進行中／已完成結算／必須先復活……"
}
```

推薦判定順序如下：

1. 沒有 `session.scenario`：`no_scenario`，人在主神空間。
2. `session.combat.active`：`combat`，不能休息、不能返回、不能開新副本。
3. `progress.pendingCombat`：`combat_required`，必須先進入戰鬥。
4. `progress.settledAt && progress.runSummary`：`settled`，合法返回主神空間。
5. `referenceState.endingId` 或明確 terminal flag 已成立但尚未結算：`terminal_unsettled`，先讓 server 完成一次結算，再允許返回。
6. 其餘為 `active`，仍在副本中。

這也修補一個重要邊界：死亡、感染、逾時等終局不應因為未完成所有正常節點而永遠卡在副本中。只要 reference 已產生 terminal ending，settlement adapter 就應能封存一份 `runSummary`，即使 objectiveIds 不完整。

### 6.2 `locationOf()` 的相容修改

保留既有 `locationOf(session, getPack)` API，但內部改用 lifecycle 判定。只有 `status === "settled"` 或 `no_scenario` 才回傳「主神空間」。`terminal_unsettled` 不應直接被當成已經可以購買或完全恢復；它必須先經過一次 server settlement。

這樣可以避免以下錯誤：

- 前端因看到 `endingId` 就自行切回主神空間，但 server 尚未入帳 XP／speed points。
- 死亡角色因 `locationOf()` 回到主神空間而直接呼叫完全恢復，繞過 `/api/revive`。
- 戰鬥中的角色在 refresh 後被誤判為 hub，能購買或休息。

## 七、Phase A API 設計

### 7.1 新增 `GET /api/godspace?sessionId=...`

這是主神空間的 canonical read API。它只讀取 session、執行純函式 summary builder，不呼叫 LLM，不接受前端傳入角色卡、wallet、ending 或恢復數值。

成功回應建議如下：

```json
{
  "ok": true,
  "apiVersion": "godspace.v1",
  "persistent": true,
  "storeKind": "kv",
  "sessionId": "session-id",
  "location": "主神空間",
  "lifecycle": {
    "status": "settled",
    "canAct": false,
    "canEnterGodspace": true,
    "canViewDebrief": true,
    "reason": "副本已結算"
  },
  "sessionMeta": {
    "updatedAt": "2026-08-23T00:00:00.000Z",
    "turns": 34,
    "eventCount": 58
  },
  "character": { "...": "public character view" },
  "health": {
    "downState": { "dead": false, "unconscious": false, "worsening": false, "canAct": true },
    "hp": { "max": 6, "intact": 4, "B": 1, "L": 1, "A": 0 },
    "willpower": { "max": 2, "current": 1, "temp": 0 },
    "energyPools": { "...": "current and max only" },
    "revival": null
  },
  "resources": {
    "wallet": { "...": "server wallet view" },
    "referenceItems": ["item_xenomorph_tissue"],
    "damagedItems": [],
    "ownedAbilities": [],
    "activeForms": []
  },
  "debrief": { "...": "server-built debrief or null" },
  "actions": [
    { "id": "view_debrief", "enabled": true },
    { "id": "rest", "enabled": true, "reason": "主神空間可完全恢復" },
    { "id": "revive", "enabled": false, "reason": "角色尚未死亡" },
    { "id": "shop", "enabled": true },
    { "id": "start_scenario", "enabled": true }
  ]
}
```

這個 payload 必須是 whitelist view，不要把整份 `session` 或 raw `referenceState` 原樣送到主神空間。現有 `GET /api/session?id=...` 為了相容可以暫時保留 `session`，但新的 hub 前端不應依賴 raw session；後續可把 `/api/session` 的 `session` 逐步收斂成 `sessionView`。

未完成副本呼叫此端點時，建議回 `409` 而不是假裝成功：

```json
{
  "ok": false,
  "code": "NOT_IN_GODSPACE",
  "error": "副本尚未結算，不能進入主神空間",
  "location": "恐怖片中",
  "lifecycle": { "status": "active", "canEnterGodspace": false }
}
```

### 7.2 新增 `POST /api/godspace/enter`

這是合法返回的 server gate。body 只接受：

```json
{ "sessionId": "...", "source": "settlement|resume|manual" }
```

`source` 只用於 audit／UI，不得影響規則。端點執行順序如下：

1. 解析 JSON，要求 `sessionId`。
2. 使用 `resolveSessionStore()` 讀取 session。
3. 使用 `canAccessSession()` 驗證 owner；未授權仍回 404。
4. 使用 scenario lifecycle 驗證沒有 active combat、pendingCombat 或 active scenario。
5. 若是 `terminal_unsettled`，先在 server 內完成一次 settlement；若仍不能結算，回 409。
6. 寫入可選的 `session.hub.lastEnteredAt` 或一筆 `GODSPACE_ENTER` audit event。這些欄位只作 UI／稽核，不參與世界真相。
7. 回傳與 `GET /api/godspace` 相同的 payload。

此端點必須是 idempotent。玩家重複點擊、refresh 後再次呼叫，不得重複發 XP、speed points 或清除傷勢。`settleScenario()` 現有的 `progress.settledAt` 防重複機制應繼續作為最後保護。

### 7.3 `GET /api/godspace/debrief?sessionId=...` 是否需要

第一版不建議另做獨立 debrief API。`GET /api/godspace` 已經需要回傳 hub summary，將 debrief 放在同一個 payload 可以避免前端先載 hub、再載結算、再載角色狀態造成多次 race condition。

只有當未來結算頁需要分享、分頁載入或大量歷史輪迴查詢時，才考慮另加 `GET /api/debrief`。目前保持一個 canonical hub read API 比較穩定。

### 7.4 擴充既有 `POST /api/rest`

現有 `/api/rest` 已經是 Phase A 最接近完成的 API：它做 owner check、用 `locationOf()` 判定地點、在主神空間呼叫 `fullRecovery()`、寫 `REST` event、存回 session，再回傳 character。

建議只做以下變更，不重新發明恢復規則：

| 改動 | 原因 |
|---|---|
| 在呼叫 `fullRecovery()` 前先檢查 `getDownState(character).dead` | 完全恢復不能變成免費復活；死亡必須走 `/api/revive` |
| 主神空間完全恢復後回傳 `health` 與 `hub` summary | 前端不用再額外 GET 才能刷新狀態 |
| 若角色已經全滿，可回 `changed:false` 且不重複寫 REST event | 避免玩家連點造成無意義的日誌噪音 |
| 副本中仍沿用 3 回合打坐與時間預算 | 不把 Phase A 的 hub 整理規則混進副本休息規則 |
| 正在戰鬥中維持目前 blocker | 戰鬥狀態機與角色數值不可被中途改寫 |

死亡角色的建議回應：

```json
{
  "ok": false,
  "code": "REVIVAL_REQUIRED",
  "blockers": [{ "code": "死亡", "message": "角色已死亡，請先使用復活流程。" }],
  "downState": { "dead": true, "canAct": false },
  "revival": { "canRevive": true, "cost": 120, "shortfall": 0 }
}
```

實際復活費用仍由既有 `revivalQuote()`／`reviveCharacter()` 決定，前端不計算。

### 7.5 沿用既有 `POST /api/revive` 與 `POST /api/shop`

`/api/revive` 已經有 owner check、費用查詢、復活次數、permaDeath、清除型態與寫回流程。Phase A 只需要在 `/api/godspace` 的 `actions` 中正確呈現 `revivalQuote()`，並在成功後讓前端重新載入 hub payload；不需要再做第二套復活 API。

`/api/shop` 已經有 `locationOf()`、戰鬥阻擋、價格驗證、wallet 寫回、purchase event 與 storefront payload。Phase A 不改商品規則，只讓主神空間 hub 的商店入口在購買完成後重新呼叫 `/api/godspace`，更新 wallet、abilities、forms 與可用 actions。

### 7.6 擴充 `GET /api/session?id=...`

為保持既有 resume 流程相容，第一版可在原回應新增：

```json
{
  "lifecycle": { "status": "settled", "location": "主神空間" },
  "godspace": { "available": true, "summary": "..." }
}
```

前端若 `lifecycle.status === "settled"`，就不應先進入 game screen 再在裡面顯示 settlement；應直接進 portal hub，讓玩家看見「上一場已封存」的狀態。完整結算仍可由 hub 的「查看上場結算」按鈕打開全頁 `scenario-settlement-screen`。

## 八、debrief builder 與資料白名單

### 8.1 新增 `content/godspace/debrief.js`

建議新增純函式：

```js
export function buildScenarioDebrief({ pack, session, lifecycle }) {
  // 只讀取 session；不修改角色、不入帳、不呼叫 LLM
}
```

它應使用 `progress.runSummary` 作為分數與結局主來源，再從 `eventLog` 的結構化事件補足玩家真正需要看的細節。不要把 history 的自然語言當成事實。

### 8.2 debrief payload 建議

```js
{
  summaryVersion: 1,
  status: "settled",
  scenario: {
    id: "scenario.nostromo-01-v2",
    version: 2,
    title: "異形：生化深淵",
    endingId: "end_solo_survivor",
    endingPresentation: {
      title: "孤獨生還者",
      copy: "固定 authored 結局文字，不由 AI 生成"
    },
    settledAt: "..."
  },
  evaluation: {
    grade: "A",
    label: "高品質生還",
    qualityPoints: 165,
    speedPoints: 12,
    overallScore: 177,
    summary: "固定評價文字"
  },
  tempo: {
    totalRounds: 50,
    spentRounds: 38,
    remainingRounds: 12,
    threatPeak: 6,
    encounters: 1
  },
  objectives: [
    {
      id: "node_937",
      title: "937 證據",
      completed: true,
      divergenceTier: 3,
      rewardPoints: 20
    }
  ],
  consequences: {
    npcStatuses: { npc_ash: "destroyed", npc_luyuan: "survived" },
    sampleStatus: "preserved",
    infectionStatus: "cleared",
    injuriesReceived: ["acid_burn_minor"],
    itemsAdded: ["item_xenomorph_tissue"],
    itemsRemoved: []
  },
  aftercare: {
    hp: { max: 6, intact: 4, B: 1, L: 1, A: 0 },
    willpower: { max: 2, current: 1, temp: 0 },
    energyPools: { "...": "current/max" },
    downState: { dead: false, unconscious: false, worsening: false, canAct: true },
    revival: null
  },
  resources: {
    wallet: { "...": "server wallet view" },
    referenceInventory: ["item_xenomorph_tissue"],
    damagedItems: [],
    ownedAbilities: [],
    activeForms: []
  },
  activity: {
    turns: 34,
    eventCount: 58,
    checks: 21,
    combatActions: 7,
    rests: 1,
    purchases: 0
  }
}
```

`endingPresentation` 應從固定 content mapping 或 reference 的 authored ending text 產生。不要繼續只在 `public/app.js` 維護一份與 server 可能漂移的結局文字。這是內容資料，不是 AI 結果，但 server 應該決定最後送給前端的版本。

### 8.3 不能放進 debrief 的資料

下列資料可以留在 server 或 QA log，但不應原樣暴露給主神空間：完整 `referenceState`、AI prompt、API provider 設定、API key、完整 raw LLM 回覆、未整理的內部 flags、骰池細節、未經玩家知道的 NPC 祕密與未採用的 threatAssessment 數值。

這不是要隱瞞玩家，而是維持「玩家看到的是遊戲內可得資訊」。若某個 flag 是玩家已經取得的證據，debrief 應把它映射成「937 證據已保存」；不要直接把 `flag_937_evidence_saved` 這種內部名稱放上畫面。

## 九、Phase A 前端實作細節

### 9.1 portal DOM 新增區塊

現有 `#portal-main-content` 有邀請、接管、白色平台、resume box 與四個 action tiles；現有 `#scenario-settlement-screen` 已有完整全頁結算。建議不拆掉既有結算頁，而是在 portal hub 增加一個常駐但可收合的 `#portal-aftercare-panel`：

```text
#portal-aftercare-panel
  #hub-status-strip
  #hub-last-run-card
    - 上一場副本名稱／版本
    - 結局與 S/A/B/C/D
    - 查看完整結算
  #hub-health-card
    - HP B/L/A
    - 意志力
    - 能量池
    - 死亡／昏迷／惡化狀態
    - 完全恢復／復活按鈕
  #hub-resource-card
    - XP
    - 支線／獎勵點數
    - 可帶出道具與損壞道具
    - 型態／能力摘要
  #hub-action-row
    - 主神兌換
    - 整理／休息
    - 輪迴記錄
    - 開始下一場（目前仍可沿用既有入口）
```

所有數字、傷勢與按鈕可用性都由 `GET /api/godspace` 的 payload 填入。前端不自行判斷 `hp.A === max` 是否死亡、不自行加總 wallet、不自行推導「已回到主神空間」。

### 9.2 `app.js` 建議新增的狀態與函式

```js
let currentGodspacePayload = null;
let godspaceBusy = false;

async function loadGodspace(sessionId, { reveal = true } = {}) {}
async function enterGodspaceFromSettlement(source = "settlement") {}
function renderGodspace(payload) {}
function renderGodspaceActions(actions) {}
function openLastRunDebrief() {}
async function refreshGodspaceAfterMutation() {}
```

`returnToMainGodSpace()` 的新流程應是：先呼叫 `POST /api/godspace/enter`；成功後保存 payload；隱藏 settlement layer；切換到 portal；呼叫 `finishPortalReveal("resume")`；最後 `renderGodspace(payload)`。如果 API 回 409，應保留結算頁並顯示原因，不要直接讓玩家進入一個 server 認為不合法的 hub。

`resumeSession(id)` 應先看 `GET /api/session` 新增的 lifecycle：

```js
if (res.lifecycle?.status === "settled" || res.godspace?.available) {
  const hub = await loadGodspace(id, { reveal: true });
  // 直接進主神空間；完整結算由「查看上場結算」開啟
  return;
}
// active scenario 才進入 game screen
```

這能修正目前「回訪已結算存檔先進 game，再依 `runSummary` 顯示結算」的路徑，使玩家看到的第一個畫面就是合法的 hub 狀態。

### 9.3 action metadata

不要讓前端只憑「有 session 就顯示所有按鈕」。server 應回傳：

```js
[
  {
    id: "rest",
    enabled: true,
    label: "完全恢復",
    reason: "主神空間可恢復生命、意志力與能量池"
  },
  {
    id: "revive",
    enabled: false,
    label: "復活",
    reason: "角色尚未死亡"
  },
  {
    id: "shop",
    enabled: true,
    label: "主神兌換",
    reason: "主神空間已開放支線與獎勵點數兌換"
  }
]
```

前端只負責 render disabled state 與呼叫對應 API。玩家可以手動修改 DOM，但 server 仍會在 `/api/rest`、`/api/revive`、`/api/shop` 再次驗證。

## 十、建議的 API 模組與檔案變更

### 10.1 新增檔案

| 檔案 | 職責 |
|---|---|
| `content/scenario/freeActionContract.js` | 建立 unmatched contract、列出授權與禁區 |
| `content/scenario/narrationGuard.js` | 合規掃描、違規分類、safe fallback |
| `content/scenario/lifecycle.js` | active／combat／terminal／settled 狀態判定 |
| `content/godspace/debrief.js` | 從 runSummary、event log、character、wallet 建立 whitelist debrief |
| `content/godspace/payload.js` | 組裝 `GET /api/godspace` 的 hub payload 與 action metadata |
| `functions/api/godspace.js` | GET hub payload、POST 合法返回；或拆成 `godspace/enter.js` |
| `test/freeActionContract.test.js` | contract 與授權邊界測試 |
| `test/narrationGuard.test.js` | 合規、重寫、safe fallback 測試 |
| `test/godspace.test.js` | lifecycle、debrief、action metadata 純函式測試 |
| `test/apiGodspace.test.js` | owner／409／idempotency／payload integration 測試 |

### 10.2 修改檔案

| 檔案 | 變更 |
|---|---|
| `content/checkIntent.js` | unmatched 回傳 `intentClass`／`authorizationScope`，不改現有 fallback DC |
| `content/scenario/referenceAdapter.js` | 回傳並建立 free action contract；未命中時明確 `authorizedChanges=[]` |
| `functions/api/turn.js` | 建立 contract；LLM parse 後掃描 narration；最多一次安全重寫；不重跑 engine |
| `content/turnOptions.js` | response spec 增加 contract semantics 與安全重寫格式要求；threat level 保留 enum |
| `content/scenario/threat.js` | 保留目前 free input conservative override，必要時回傳可供 contract 使用的 threat facts |
| `content/shop/access.js` | 改由 lifecycle 判定主神空間／副本中，保留既有價格規則 |
| `functions/api/rest.js` | 加死亡 blocker、hub payload、changed/no-op metadata |
| `functions/api/session.js` | 增加 lifecycle／hub availability，逐步避免前端依 raw session 判斷 |
| `functions/api/revive.js` | 成功後可附 hub／aftercare summary，規則仍沿用現有 revive engine |
| `content/scenario/settlement.js` | 支援 terminal ending 即使正常 objectives 未全完成；保持 settledAt 防重複 |
| `content/scenario/hudView.js` | 如有需要將 runSummary 與 lifecycle view 分開，避免暴露 raw reference state |
| `public/app.js` | 新增 load/render hub、合法返回、aftercare panel 與 mutation 後刷新 |
| `public/index.html` | 在 portal hub 增加 aftercare/debrief/resource DOM 區塊 |
| `core/eventLog.js` | 若需要 QA 稽核可新增 `NARRATIVE_GUARD`／`GODSPACE_ENTER`，不要把 prompt 或 key 寫入 event log |

## 十一、測試與驗收矩陣

### 11.1 free action contract

| 測試 | 預期 |
|---|---|
| unmatched + success | contract 仍是 `attempt_only`，`authorizedChanges=[]` |
| unmatched + failure | 可描述阻力與威脅反應，但不能創造門、物品、位置或傷勢結果 |
| unmatched + major | narrativeMode 可是 major，但不自動升格成 scene transition |
| matched reference approach | 不套用 unmatched guard 的錯誤版本；依 reference effects 正常敘述 |
| valid threatAssessment | 僅 validator 通過的 delta 寫入一次 |
| invalid threatAssessment | `accepted=false`，採 stable 或 engine fallback，不開戰 |

### 11.2 narration guard／safe rewrite

| 測試 | 預期 |
|---|---|
| 合格 narration | 只一次 LLM call，`narrationSource=ai` |
| 含「門已鎖死」 | 觸發一次重寫；若重寫合格，`narrationSource=ai-rewritten` |
| 含未授權距離 | 觸發重寫；結果仍有距離則 `engine-safe` |
| 重寫 API 失敗 | 回 safe fallback，不影響已完成的 check／threat／effects |
| 第一次 JSON 截斷 | 不把半段 raw text 當可靠世界事實；使用既有 JSON retry 或 safe fallback |
| 重寫回傳不同 threatAssessment | 忽略，不重新驗證或套用第二次 |
| 重寫回傳 options | 忽略，仍由 reference adapter 生成 options |
| 連續重複請求 | 每個 turn 最多一次安全重寫，不進入 retry loop |

### 11.3 Phase A API

| 流程 | 預期 |
|---|---|
| settled session → GET godspace | 200，回傳 debrief、health、resources、actions |
| active session → POST godspace/enter | 409，不切 hub |
| pendingCombat → POST godspace/enter | 409，要求先戰鬥 |
| active combat → GET godspace | 顯示恐怖片中，不能提供 hub actions |
| dead character → POST rest | 409 `REVIVAL_REQUIRED`，不清除死亡 |
| dead + eligible → POST revive | 200，沿用既有費用與復活次數規則 |
| settled → POST godspace/enter twice | 兩次都可回相同 payload，不重發 XP／points |
| no KV | 所有 payload 保留 `persistent:false`，前端顯示存檔不持久警告 |
| session owner mismatch | 404，不洩漏 session 是否存在 |
| refresh after settlement | 直接回 hub／debrief，不依賴先送一個 turn |

### 11.4 真實 Gemini 品質閘門

正式宣稱 free input 可用前，建議至少完成 10–20 個真實 unmatched case，包含微型、普通、major、成功、驚險成功、失敗、威脅穩定與 threatAssessment 不合法等組合。合格標準不是「模型從不犯錯」，而是：

- 高嚴重度未授權世界主張在安全重寫後為 0。
- 每個 turn 最多增加 1 次重寫呼叫。
- 重寫不改變任何 server state。
- `engine-safe` fallback 仍能讓玩家繼續遊戲，不會卡死。
- 既有 normal／major／combat 文筆品質沒有因所有回合都套用保守模板而被壓扁。

## 十二、實作順序與成本控制

目前已依此順序完成核心接線：先建立 lifecycle 與 Phase A hub payload，再接 free input safety guard 與安全重寫，最後補上前端 aftercare。後續交付順序應改為：持續擴充 contract／guard 回歸案例、觀察第三方模型的安全重寫率，再視結果決定是否開放任何 reference 明確授權的 bounded change。

| 步驟 | 內容 | 風險控制 |
|---|---|---|
| 1 | 新增 lifecycle 純函式，修正 settled／terminal／combat 邊界 | 不改 UI，先跑 scenario／shop／rest／revive tests |
| 2 | 新增 debrief builder 與 godspace payload | 所有資料 whitelist，禁止 raw referenceState |
| 3 | 新增 GET godspace 與 POST godspace/enter | owner、409、idempotency 測試先完成 |
| 4 | 接 portal aftercare panel 與 resume flow | API 成功後才切畫面，失敗保留原畫面 |
| 5 | 修正 rest 死亡閘門，串 revive／shop refresh | 不增加新治療規則 |
| 6 | 新增 free action contract 純函式 | 第一版只開 `attempt_only` |
| 7 | 新增 narration guard 與 safe fallback | 先做 deterministic tests，再接 mock LLM |
| 8 | 接一次安全重寫呼叫 | 僅 high severity 觸發；最多一次 |
| 9 | 真實 Gemini 10–20 case gate | summary 只記錄 compliance metadata，不回顯 key |
| 10 | 進行人工完整副本遊玩 | 檢查玩家理解、節奏、fallback 是否仍沉浸 |

安全重寫只在偵測到高風險越界時增加一次 API 呼叫，正常合格回合不增加成本。若使用者希望將成本壓到最低，可以先不讓模型當 free input 的 threatAssessment 來源，而完全使用引擎分級的 threat delta；但這會減少玩家自由行動的威脅彈性，應由遊戲設計決定，而不是為了省呼叫偷偷改規則。

## 十三、明確不在本次 Phase A 做的事

本輪已落地 bounded free action contract、deterministic narration guard、最多一次安全重寫、engine-safe fallback，以及 Phase A 的 server-owned godspace payload／合法返回閘門／aftercare UI。仍不加入排行榜、不建立跨副本 world delta、不做跨副本 NPC 記憶、不開放主神自由聊天，也不讓主神 AI 代替玩家解題。Phase A 的 hub 只讀取本場副本已封存的 runSummary、角色狀態、wallet、reference item summary 與事件統計；它不會把自然語言 history 自動變成下一場副本的世界真相。

同樣地，受限自由行動合約第一版不會讓玩家靠一句自由輸入直接開啟新場景、取得未登錄道具、創造 NPC 關係、改變結局或觸發戰鬥。若未來要開放 bounded change，必須先在 reference sidecar 定義 effect catalog、前置條件、衝突處理與測試 fixture。

## 十四、最終建議

這個方案的核心不是讓 AI 變得「不敢寫」，而是把它從「自行補完世界」改成「在一個小而明確的舞台上演出」。合格的 free input narration 仍然可以有金屬聲、冷凝水、Ash 的停頓、模糊的氣味與威脅方向；只是門是否真的鎖死、通道是否真的可通、異形是否真的接觸、工具是否真的損壞，必須由 reference／engine effect 決定。

Phase A 也遵循同一個原則。主神空間不需要一個什麼都會說的 AI；它需要一個能正確告訴玩家「上一場發生了什麼、我現在受了什麼傷、我有什麼資源、哪些按鈕真的可以按」的 server-owned hub。先完成這條可靠閉環，再考慮更長期的主神人格、跨副本承接與多世界互動。
