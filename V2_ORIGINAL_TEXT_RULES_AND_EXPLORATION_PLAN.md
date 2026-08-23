# V2 原始 Gemini 劇本文字接入、規則優化與探索體驗方案

## 一、核心結論

目前最適合的方向不是把原始 Gemini 劇本重新縮寫成目前的 reference 文字，也不是把原始規則資料完全原封不動塞進引擎。應該明確分成三層：**Gemini 原始文字、reference 規則資料、引擎與前端呈現**。

> **Gemini 原始文字負責玩家看到的情境、角色台詞、氣氛、事件過程與結果演出；reference 負責前置條件、檢定、骰子結果、時間、威脅、位置、物品、NPC、旗標、轉場與結局；引擎負責裁定，前端負責讓玩家看懂自己在哪裡、能去哪裡以及這次行動改變了什麼。**

因此，原文接入前需要調整的是**規則接線與資料結構**，不是重新創作玩家演出文字。

## 二、原始劇本與目前 V2 的主要差異

原始四份事件文件包含 20 個事件，補充稿包含 A–I 九個重大場景。現行 V2 reference 有 10 個 Scenes，並不是 20 個原案事件的完整接入。現在最重要的不是只修正開場，而是恢復原案的事件節拍與文字來源。

| 類別 | 原始 Gemini 劇本 | 目前 V2 | 接入判斷 |
|---|---:|---:|---|
| 事件卡 | 20 個 | 10 個 reference Scenes | 需要補回缺少的事件或建立正式事件層 |
| 重大場景 | A–I 九個 | 被壓縮到目前 Scenes | 需要保留原始進入、推進與離場文字 |
| 玩家進入文字 | 每場約 239–623 字元 | 每場約 94–153 字元 | 目前是短版重寫，應改接原文 |
| 結果演出 | 各事件多有五級結果文字 | 多數為短句 | 應改接原始結果文字 |
| 地圖 | 原稿已有地點、連接、物件與門檻 | reference 也已有 map | 資料已在，但尚未成為玩家可見探索介面 |
| 時間規則 | 原稿多處寫十四回合／十四小時 | V2 已改為 50 回合 | 保留原文氛圍，但動態規則數值必須以 50 回合為準 |

## 三、接回原始文字前必須調整的規則部分

### 3.1 建立原始事件與 runtime Scene 的明確 mapping

目前 `evt_cryo_inspect` 被改成 `evt_cryo_clearance`，`evt_deck_a_terminal`、`evt_vent_creak` 與 `evt_luyuan_briefing` 也被合併到其他 Scenes。這會造成兩個問題：第一，原始文字 ID 找不到；第二，原案的「陸遠考核」「通風管異響」「A 甲板終端」等事件順序消失。

建議建立正式的 `eventMapping`，並優先保留原始事件 ID 作為 narrative source ID。例如：

```json
{
  "runtimeSceneId": "evt_cryo_clearance",
  "narrativeEventId": "evt_cryo_inspect",
  "sourceFile": "異形(三).md",
  "sourceSection": "事件 01",
  "preserveOrder": true
}
```

對於原稿中目前完全缺少的事件，不能只在 mapping 寫一個別名；必須新增可執行的 event／scene data。已確認需要補回的事件包括醫療區、中央貨艙、工具櫃、Ripley、主機核心房、工程區冷卻準備，以及水仙號脫離。

### 3.2 把原稿的五級結果接到目前骰子引擎

原稿使用：

```text
success
narrow_success
minor_failure
failure
critical_failure
```

目前 V2 engine 使用較細的中文結果：

```text
大成功、成功、驚險成功、些微失敗、失敗、慘烈失敗
```

這是必要的規則映射，不是文字改寫。第一版可使用以下保守 mapping：

| Engine 結果 | 原稿文字 tier | 說明 |
|---|---|---|
| 大成功 | success | 使用原稿成功文字，效果採大成功的較佳規則效果 |
| 成功 | success | 使用原稿成功文字 |
| 驚險成功 | narrow_success | 使用原稿勉強成功文字 |
| 些微失敗 | minor_failure | 使用原稿輕微失敗文字 |
| 失敗 | failure | 使用原稿失敗文字 |
| 慘烈失敗 | critical_failure | 使用原稿慘烈失敗文字 |

如果之後要讓大成功與普通成功在文字上完全不同，可以由 Gemini 另補 `critical_success`，但在「保留目前原文」的第一階段不應擅自創作新的段落。

### 3.3 將原稿自然語言後果抽成正式 effects

原稿中很多後果已經寫得很完整，但部分規則仍藏在文字裡，例如「陸遠信任度提升」「獲得地圖」「威脅上升」「工具損壞」「感染狀態改變」。這些需要抽成 machine-readable effects，否則 Gemini 文字雖然正確，下一回合引擎仍可能忘記結果。

每個 outcome 至少應能表達：

| Effects 類別 | 例子 |
|---|---|
| 時間 | `timeCost: 1` |
| 威脅 | `threatDelta: 1` 或作者指定 `immediateCombat` |
| 位置 | `playerLocation: "loc_deck_a"` |
| 物品 | `itemsAdd`、`itemsRemove`、`itemsDamage` |
| 線索 | `cluesAdd`、`cluesRemove` |
| NPC | `npcStatusChanges`、`npcTrustDelta` |
| 傷勢 | `injuriesAdd` |
| 世界旗標 | `worldFlagsAdd`、`worldFlagsRemove` |
| 船況 | `shipStatus`、`airlockPhase` |
| 感染與樣本 | `infectionStatus`、`sampleStatus` |
| 轉場 | `nextEvent`、`sceneTransition` |
| 結局 | `endingId` 或結算旗標 |

**原始文字仍然照原稿顯示，effects 只是從規則上描述同一個結果。**如果文字和 effects 矛盾，應先修正 effects 或標記原稿規則矛盾，不讓 Gemini 自行猜。

### 3.4 修正原稿中的資料契約問題

以下是可以修正而不影響文學文字的資料層問題：

| 問題 | 必要修正 |
|---|---|
| 純屬性檢定有時寫成字串 `"null"` | 改成 JSON `null` |
| 事件文字 ID 有完整格式與短格式混用 | 保留原文內容，統一 narrative ID lookup 規則 |
| 物品／NPC／線索有時只寫中文名 | 補上正式 ID，保留原始顯示名稱 |
| 部分事件只寫觸發條件，沒有完整 `requires` | 將位置、物品、旗標與 NPC 條件抽成欄位 |
| 結果文字寫了狀態，但沒有 `effects` | 補 effects，不改結果文字 |
| 事件完成、節點完成、轉場混用 | 分開 `eventCompleted`、`nodeCompleted`、`nextEvent`、`playerLocation` |
| 失敗後是否可重試不明確 | 為每個 approach 增加 `retryPolicy` 或一次性旗標 |
| 事件可回頭與不可回頭不明確 | 由 map connection、sceneExit 與 `canReturn` 統一裁定 |

### 3.5 50 回合與原稿十四回合／十四小時的衝突

這是唯一會直接碰到玩家文字的規則衝突。原稿部分台詞和手錶文字寫著十四回合或十四小時，而使用者後來已明確把效率資源改為 50 回合。

不能默默讓文字繼續說十四、HUD 卻顯示 50，否則玩家會以為遊戲壞掉。建議採取以下方式：

1. 以原稿句子、段落、語氣與資訊順序為 canonical。
2. 把原稿中的時間數字標記為可替換 token，例如 `{{time_budget_label}}`。
3. 由 runtime 將 token 顯示成目前規則的「50 個行動回合」。
4. 除了必要的數值 token，不重寫原稿句子。
5. 在劇本 authoring 檔保留原始文字與 `sourceText`，避免日後無法追查哪裡做過動態替換。

如果使用者希望完全不動原稿字面，另一個選擇是保留十四小時作世界內的倒數敘事，並將 50 回合稱為玩家效率資源；但這需要在 UI 明確區分「船上倒數」與「玩家效率回合」，否則仍會產生理解衝突。我比較建議第一種 token 化方式。

## 四、目前「沒有遊戲感」的探索問題

這個判斷是正確的。現在 server state 已經有 `currentLocation`，reference JSON 也已經有完整 `map`，但前端只顯示目前目標、主線進度、迫近度與剩餘回合，玩家看不到位置、房間連接與移動目的。因此玩家即使發生了 `playerLocation` 轉移，也只會覺得敘事突然換場。

目前缺少的不是單純一張圖片，而是三個連續的認知回饋：

> **我現在在哪裡？我能去哪裡？我去那裡是為了什麼？**

### 4.1 第一階段：文字按鈕地圖

不需要先做圖片地圖，可以直接用目前 reference map 做一張「船艦探索面板」。建議放在左側角色 HUD 的副本區塊，或主故事區上方，預設顯示摘要，按鈕展開完整地圖。

地圖每個節點顯示：

| 資訊 | 玩家看到的內容 |
|---|---|
| 當前位置 | 高亮，例如「目前位置：A 甲板主走廊」 |
| 已探索 | 已經到過的地點，以較亮色顯示 |
| 已知但未探索 | 已從地圖／NPC／終端知道，但還沒到過的地點 |
| 可前往 | 目前位置相鄰、且條件允許的地點，顯示為按鈕 |
| 尚未可達 | 存在連接但被門禁、事件或船況阻擋的地點，顯示原因 |
| 故事目的 | 每個地點附一行目的，例如「科學實驗區：查 Ash／樣本」 |
| 危險提示 | 只顯示玩家已知的風險，不提前洩漏主持真相 |

最簡單的文字呈現可以是：

```text
諾斯托羅莫號探索圖

[休眠室] ── [A 甲板主走廊] ── [橋樓]
                         ├── [科學實驗區]
                         └── [中央貨艙]
                                ├── [下層維修甲板]
                                └── [水仙號接駁氣閘]

目前位置：A 甲板主走廊
可採取行動：
[前往科學實驗區：尋找 Ash／樣本線索]
[前往中央貨艙：搜尋工具／觀察異形活動]
[前往橋樓：確認船員狀態／航行資料]
```

### 4.2 第二階段：目前位置與場景身份固定顯示

不應只在地圖展開時顯示位置。HUD 應永久顯示：

```text
目前位置：A 甲板主走廊
目前事件：陸遠的考核與生存規則
目前目的：確認船艦現況，選擇下一個調查方向
```

每一筆故事訊息上方也可以加一行小型場景標籤：

```text
[位置：A 甲板主走廊｜事件：陸遠的考核]
```

這是 UI metadata，不是改寫 Gemini 原文，因此不會破壞文風。

### 4.3 第三階段：把移動變成真正的遊戲行動

目前 `map.connections` 存在，但 `buildReferenceOptions()` 主要只回傳 scene 內 approaches；地圖連線沒有獨立成玩家可理解的移動行動。應新增 server-authoritative travel contract：

```json
{
  "type": "travel",
  "from": "loc_deck_a",
  "to": "loc_science",
  "label": "前往科學實驗區",
  "purpose": "尋找 Ash 與生物樣本線索",
  "timeCost": 1,
  "required": {
    "locations": ["loc_deck_a"],
    "connections": ["loc_science"]
  },
  "effects": {
    "playerLocation": "loc_science"
  }
}
```

這些按鈕不是取代自由輸入，而是讓玩家知道「移動」也是可做的事。玩家仍可輸入「我沿著維修梯前往貨艙」「我先去橋樓」，由 server 依 map connection、位置、工具、旗標與威脅裁定是否合法。

移動回合的建議規則如下：

| 移動情況 | 建議規則 |
|---|---|
| 相鄰且沒有特殊危險 | 花費 1 個效率回合，通常不需骰 |
| 有門禁／封鎖／高溫／黑暗 | 轉成原稿對應的檢定 approach |
| 啟動超載後 | 仍可移動，但某些路線關閉或必須檢定 |
| 威脅達接觸 | 移動按鈕不一定消失，但可能先進戰鬥或受到固定阻擋 |
| 移動到新事件場景 | 先套用位置與旗標，再顯示原稿 entry text |

### 4.4 地圖的可見資訊與主持真相分離

reference map 裡的 `features`、`hazards`、NPC 位置與所有連線不應無條件全部公開。建議 server 回傳三種資料：

```json
{
  "exploration": {
    "currentLocation": "loc_deck_a",
    "visitedLocations": ["loc_cryo", "loc_deck_a"],
    "knownLocations": ["loc_cryo", "loc_deck_a", "loc_bridge", "loc_science"],
    "routes": [],
    "locationCards": []
  }
}
```

其中 `knownLocations` 可由開場 briefing、主控台地圖、陸遠說明與已取得線索逐步增加；`locationCards` 只包含玩家已知的描述。這樣地圖會有探索與解鎖感，不會變成一張把所有秘密都列出來的攻略表。

## 五、建議的實作順序

### 第一批：先恢復文字保真與資料契約

先建立原始 narrative source，不碰 Gemini 原句。將 20 個事件和 A–I 場景全部放入可查詢的 source layer，補上事件 mapping、tier mapping、effects、位置、重試與轉場規則。這一批完成後，再讓 V2 adapter 從原文取結果，而不是從目前短版文字取結果。

### 第二批：補地圖與位置 HUD

在不改劇情文字的情況下，擴充 `referenceStateForResponse()` 或 `scenarioHudView()`，回傳探索 view；前端新增目前位置卡、可展開文字地圖、已探索／已知／未探索狀態，以及每筆故事訊息的場景標籤。

### 第三批：補正式移動 action

新增 travel contract，讓 map connection 成為 server-authoritative 的行動來源。每次移動都記錄位置、花費回合、可能威脅變化與進入事件；不要讓前端自己改 `currentLocation`。

### 第四批：逐段以真實 Gemini 測試

測試重點不只是 Gemini 文筆，而是確認：固定原稿 entry text 是否正常出現、結果 tier 是否取對原文、移動後位置是否正確、地圖是否同步、自由輸入是否仍能走非按鈕路線，以及 50 回合與劇情中的時間描述是否一致。

## 六、目前不應做的事

目前不應再做以下事情：

1. 以目前短版 reference 文字為底，請 Gemini 再擴寫一次。
2. 把缺少的原案事件只改名成已有 Scene，然後宣稱已完整接入。
3. 讓 Gemini 自己決定玩家位置、移動是否合法或某個事件是否完成。
4. 只做一張靜態地圖圖片，卻不把位置與移動寫入 server state。
5. 用 HUD 顯示位置，但沒有可理解的移動目的與相鄰路線。
6. 為了配合 50 回合，全面重寫原始劇本文字；只應處理必要的動態數值 token。

## 七、建議結論

原始文字接入前確實需要改規則，但需要改的是**資料契約、事件 mapping、效果抽取、tier 對應、50 回合數值衝突與轉場裁定**；不需要改的是 Gemini 原本寫出的場景氣氛、角色互動、台詞、結果演出與重大場景節拍。

探索體驗則應以現有原始 map 為基礎，先做文字按鈕地圖，再把目前位置、已探索地點、可達路線與移動目的固定顯示在 HUD，最後才把移動接成正式的 server-authoritative action。這會直接修正目前「我好像被傳送到另一個地方，但不知道自己在哪裡，也不知道為什麼要去那裡」的問題。 
