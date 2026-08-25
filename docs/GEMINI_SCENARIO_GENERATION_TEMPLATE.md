# AI-TRPG 通用副本生成模板

**文件版本：2.0.0**

**適用範圍：第二副本、第三副本，以及之後所有要進入 AI-TRPG runtime 的副本**

這份文件是可以直接貼給 Gemini 的生成合約。使用時必須替換所有 `{{PLACEHOLDER}}`，並同時附上目前專案的 schema、canonical reference 與現行 adapter。不要只提供一句「請幫我寫一個副本」，也不要讓模型先寫長篇小說再回頭猜規則。

---

## 一、可直接貼給 Gemini 的固定指令

請為繁體中文 AI-TRPG 專案生成一個**可被 server-authoritative engine 驗證、審核與接入**的副本內容包。

本次副本資料如下：

```text
packId：{{PACK_ID}}
title：{{TITLE}}
sourceWork：{{SOURCE_WORK}}
timelineEntryPoint：{{TIMELINE_ENTRY_POINT}}
timelineSpan：{{TIMELINE_SPAN}}
difficulty：{{簡單／中等／困難}}
timeLimitRounds：{{ROUND_LIMIT_OR_NULL}}
playerFantasy：{{玩家最主要的體驗}}
coreQuestion：{{玩家離開副本前必須面對的核心問題}}
canonicalPremise：{{不論玩家怎麼行動都成立的基礎狀況}}
divergenceBoundary：{{玩家可以改變什麼、哪些結果固定}}
knownCanonicalIds：{{已核准的 location／route／scene／approach／NPC／item／clue／question／ending ID 清單}}
requiredOutputBatches：{{A,B,C,D,E,F,G,H}}
```

### 必須閱讀的專案資料

請先閱讀以下檔案，並以它們為唯一程式結構依據：

```text
content/scenario/schema.js
content/scenario/registry.js
content/scenario/referenceAdapter.js
content/scenario/explorationState.js
content/scenario/cluePresentationAdapter.js
content/scenario/nodePrompt.js
content/scenario/progress.js
content/scenario/threat.js
content/scenario/settlement.js
content/scenario/examples/{{REFERENCE_FILE}}
```

若某個檔案不存在，請在 `coverageReport.missingInputs` 中列出，不得自行發明另一套 schema。

> **Engine 決定世界發生了什麼；文字只描述玩家如何看見、聽見、理解與感受已被 Engine 授權的事情。**

如果無法確認任何 ID、狀態、效果、結果分級或前置條件，必須填 `null`，並加上 `canonicalIdRequired: true`；禁止猜測。

---

## 二、不可違反的世界真相與安全邊界

輸出必須把以下四種資料分開：

| 層級 | 可以包含的內容 | 是否可以直接給玩家 |
|---|---|---:|
| `canonicalTruth` | 地圖、事件、檢定、effects、flags、NPC status、物品、傷勢、威脅、結局條件 | 否，只有 server reference 使用 |
| `publicNarrative` | 地點、轉場、感官、NPC 台詞、線索發現、已核准結果的演出 | 是，但必須通過公開資訊審核 |
| `privateAuthoring` | gm truth、private goals、完整秘密、結局依賴與作者註記 | 否 |
| `runtimeState` | 位置、flags、clues、questions、NPC status、threat、time budget | 否，不能由模型直接修改 |

Gemini 不得透過 prose 或 JSON 自行新增或裁定下列事項：

1. DC、骰池、成功數、屬性、技能或 outcome tier。
2. 物品的取得、遺失、消耗、損壞或複製。
3. 傷勢、治療、感染、死亡或 NPC 生還。
4. 玩家位置、路線是否打通、門是否已開、事件是否完成。
5. 威脅軌、回合數、flags、NPC trust、NPC status、結局、XP、獎勵或評價。
6. 敵人確切位置、未解鎖 NPC 身分、gmTruth、privateGoals 或完整 reference state。
7. 任何不在現行 reference 中的精確時間、距離、數量、溫度或容量，除非它被明列為 canonical fact。

---

## 三、固定生成批次

不得跳過批次，也不得使用「其餘類推」「略」「待補」取代必填內容。每批次都必須包含 `coverageReport`，誠實列出未完成與需要人工確認的欄位。

### Batch A：metadata、入口與玩家方向

輸出副本 metadata、無重大劇透的玩家可見簡介、時間軸定位、arrival narration、opening narration、opening options，以及第一個可理解的玩家方向。

`arrivalNarration` 與 `openingNarration` 不得重複同一段甦醒節拍。若有固定開場，`openingOptions` 必須能對應現行 `validateOption()` 合約。開場結束時必須清楚交代玩家所在位置、目前困境與至少一個可探索方向。

### Batch B：canonical map 與 travel routes

每個 location 必須輸出：

```json
{
  "id": "loc_example_room",
  "name": "地點名稱",
  "connections": ["loc_adjacent_room"],
  "features": [],
  "hazards": [],
  "playerVisible": {
    "firstArrival": "第一次抵達描述",
    "atmosphere": "光線、聲音、氣味與空間感",
    "knownLandmarks": [],
    "playerPurpose": "可調查方向，不是保證結果",
    "visibleHazardHints": [],
    "revisitVariants": []
  }
}
```

每條 route 必須有固定起點、終點、前置條件、回合成本、entry event 與 effects：

```json
{
  "id": "travel_example_a_b",
  "from": "loc_example_a",
  "to": "loc_example_b",
  "required": {
    "flags": [],
    "items": [],
    "flagsAbsent": []
  },
  "timeCost": 1,
  "entryEventId": "evt_example_arrival",
  "effects": {
    "flagsAdd": [],
    "cluesAdd": []
  },
  "narrativeRef": "travel_example_a_b"
}
```

禁止使用「任意房間」「任意連通區域」「玩家自行指定落點」或任何 server 無法驗證的目的地。

### Batch C：chapters、nodes、scenes、events 與 rule matrix

每個 chapter／node／scene 都必須清楚說明：

- 玩家目前看得懂的目標。
- canonical 前置條件與可用 approach。
- 每個 approach 的檢定資料來源。
- 正式 outcome tier 與每一 tier 的 engine effects。
- 哪些結果由玩家改變，哪些是固定主線。
- 未命中 approach 的 free-action boundary。
- 事件完成、離場、過期與下一節點的合法銜接。

所有檢定、effects、flags、物品、NPC 狀態與結局都必須先在 canonical blueprint 中列出，再由開發者寫進 reference；Gemini 不得以散文取代這些欄位。

### Batch D：NPC knowledge 與 voice bible

每名 NPC 必須輸出：

```json
{
  "npcId": "npc_example",
  "role": "公開身份",
  "firstSight": [],
  "voice": {
    "tone": "",
    "rhythm": "",
    "vocabulary": [],
    "avoid": []
  },
  "knowledge": {
    "observed": [],
    "reported": [],
    "inferred": [],
    "secret": []
  },
  "exposureStages": [
    { "stage": "surface", "requiredFlags": [], "text": "" },
    { "stage": "suspicious", "requiredFlags": [], "text": "" },
    { "stage": "confirmed", "requiredFlags": [], "text": "" }
  ],
  "relationshipStages": [],
  "observableBehaviors": [],
  "ordinaryResponses": [],
  "clueReactions": [],
  "statusStates": ["alive", "injured", "dead", "unknown"]
}
```

`secret` 不得進入一般 prompt 或 public response。NPC 的語氣庫只提供聲音、動作與反應，不得自行改變 trust、status、位置或事件結果。涉及身分秘密的 NPC 必須有明確 `requiredFlags` 或其他 server gate。

### Batch E：clues 與 unresolved questions

每個 clue 必須指出它由哪個**已授權的 canonical result** 產生：

```json
{
  "clueId": "clue_example",
  "sourceBindings": [
    {
      "sceneId": "evt_example",
      "approachId": "app_example_search",
      "outcomeTier": "成功",
      "requiredFlags": [],
      "publicDiscoveryText": "玩家實際如何發現",
      "currentInterpretation": "目前合理能理解的部分"
    }
  ],
  "questionUpdates": [
    {
      "canonicalQuestionId": "q_example",
      "status": "updated",
      "publicText": "問題如何變得更具體"
    }
  ],
  "knowledgeLevel": "observed",
  "forbiddenClaims": [
    "completeSecretTruth",
    "exactEnemyLocation",
    "newEffect",
    "newFlag",
    "newEnding"
  ]
}
```

規則如下：

- `clueId` 必須已存在於 canonical reference；若不存在，填 `null` 並標記 `canonicalIdRequired: true`。
- `sourceBindings` 必須完全匹配 scene、approach 與現行 outcome tier。
- 線索演出只能在 server 已套用 `effects.cluesAdd` 後出現。
- `questionUpdates` 必須使用現有 `canonicalQuestionId`；新問題只能列在 `proposedQuestions`，不得直接進 runtime。
- 「合理懷疑」不能寫成「已確定真相」。
- 線索文字不能自行建立感染、死亡、NPC 身分、敵人位置、倒數或結局條件。

### Batch F：travel、revisit 與 ambient

每條已核准 route 至少輸出三種狀態：

```json
{
  "routeId": "travel_example_a_b",
  "standard": "一般狀態轉場",
  "highThreat": "高威脅轉場",
  "alarm": "警報／自毀轉場",
  "allowedFacts": ["from", "to", "threatStage", "lighting", "alarmState"],
  "forbiddenClaims": ["newItem", "newInjury", "npcDeath", "alienLocation", "ending"]
}
```

每個地點至少有兩個回訪變體。ambient 只能描述聲音、光線、氣味、溫度與遠處動靜，不能代替事件結果或建立 persistent state。

### Batch G：重大場景 result variants

只針對已存在的 canonical scene／approach／outcome tier 生成演出變體：

```json
{
  "sceneId": "evt_example",
  "approachId": "app_example",
  "outcomeTier": "成功",
  "narrativeMode": "normal",
  "variantPurpose": "只改變鏡頭、節奏與感官焦點",
  "text": "演出變體",
  "allowedFacts": ["canonicalResultFacts", "authorizedNpcPresence", "authorizedEffects"],
  "forbiddenClaims": [
    "newDamage",
    "newItem",
    "newNpcDeath",
    "newLocationChange",
    "newFlag",
    "newThreatDelta",
    "newEnding",
    "secretBeforeReveal"
  ]
}
```

禁止新增 result key、非正式 tier、effects 或結局。若不知道正式 tier，必須填 `null`，不能使用 `narrow_success`、`critical_failure` 等未經 reference 核准的名稱。

### Batch H：debrief、結算與 replay flavor

結算文字只能使用 server 已計算的 placeholder：

```text
{{ending_title}}
{{ending_summary}}
{{grade}}
{{quality}}
{{remaining_rounds}}
{{threat_level}}
{{injury_summary}}
{{surviving_npcs}}
{{evidence_status}}
{{sample_status}}
{{open_questions}}
{{xp}}
{{reward}}
```

模型不能自行決定上述欄位的值，只能提供不同 facts 組合下的文字模板。

---

## 四、固定輸出 JSON

請只輸出一個合法 JSON 物件，不要輸出 Markdown、解說、註解或程式碼：

```json
{
  "packId": "{{PACK_ID}}",
  "canonicalVersion": "{{CANONICAL_VERSION}}",
  "narrativeVersion": "{{NARRATIVE_VERSION}}",
  "generationBatch": "full-scenario-authoring",
  "metadata": {},
  "locations": [],
  "routes": [],
  "chapters": [],
  "nodes": [],
  "events": [],
  "npcs": [],
  "clues": [],
  "questions": [],
  "proposedQuestions": [],
  "travelNarration": [],
  "ambient": [],
  "resultVariants": [],
  "debrief": [],
  "coverageReport": {
    "requiredLocations": 0,
    "requiredRoutes": 0,
    "requiredChapters": 0,
    "requiredNodes": 0,
    "requiredEvents": 0,
    "requiredNpcs": 0,
    "requiredClues": 0,
    "requiredQuestions": 0,
    "requiredEndings": 0,
    "missingInputs": [],
    "missingItems": [],
    "canonicalIdsNeedingReview": [],
    "potentialFactConflicts": [],
    "secretLeakWarnings": [],
    "ruleAmbiguities": [],
    "unmappedNarrativeIds": []
  }
}
```

若輸出的是單一批次，`generationBatch` 必須改成實際批次名稱，例如 `blueprint`、`npc-bible`、`clue-and-question`；不得假裝尚未完成的批次已完成。

---

## 五、模型交付前自我審核

在輸出 JSON 前，請自行檢查並把問題寫入 `coverageReport`：

1. JSON 是否可以被標準 parser 讀取。
2. 所有 ID 是否唯一且符合命名規則。
3. 所有 route 起點、終點與 entry event 是否存在。
4. 所有 scene／approach／outcome 是否能追溯到 canonical reference。
5. outcome tier 是否使用 reference 的正式字串。
6. 每個 clue 是否由 canonical `effects.cluesAdd` 授權。
7. 每個 question 是否使用合法 canonical question ID。
8. 所有秘密是否有 exposure gate，是否可能提前洩漏。
9. 所有 public narrative 是否有 `forbiddenClaims`。
10. 是否把嘗試寫成已完成結果，或把失敗寫成成功。
11. 是否自行創造精確時間、距離、數量、傷勢、物品或狀態。
12. 是否存在與 canonical reference 衝突的地點、NPC、物品、結局或主線。

請不要在本批次修改專案程式碼。先交付 JSON，讓開發者完成 canonical／schema／安全審核後，再由 adapter 接入 runtime。

---

## 六、模型分工

| 工作 | Gemini 3.1 Pro | Gemini 3.7 Flash |
|---|---:|---:|
| premise、canonical blueprint、地圖拓撲 | 主要負責 | 不負責 |
| scene／approach／effects audit | 主要負責 | 不負責 |
| NPC knowledge 與秘密分層 | 主要負責 | 依既定層級補短句 |
| clue／question mapping | 主要負責 | 只能擴寫已核准 binding |
| 地點完整描述 | 首稿與抽查 | 短變體 |
| travel transition | 抽查與修訂 | 批量生成 |
| 重大 scene result variant | 首稿與審核 | 受限擴寫 |
| ambient | 抽查 | 批量生成 |
| debrief placeholder 模板 | 設計 | 固定變體 |
| canonical／安全 audit | 主要負責 | 不得自行放行 |

這個模板的目的不是限制副本創意，而是把創意、規則、公開資訊與 runtime state 分開，使第二、第三副本可以使用同一套入口、同一套欄位與同一套驗收流程。

## 參考檔案

- [`content/scenario/schema.js`](../content/scenario/schema.js)
- [`content/scenario/referenceAdapter.js`](../content/scenario/referenceAdapter.js)
- [`content/scenario/explorationState.js`](../content/scenario/explorationState.js)
- [`content/scenario/cluePresentationAdapter.js`](../content/scenario/cluePresentationAdapter.js)
- [`content/scenario/registry.js`](../content/scenario/registry.js)
