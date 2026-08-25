# AI-TRPG 通用副本製作標準

**文件版本：1.0**

**適用範圍：第二副本、第三副本，以及之後所有要進入公開測試的副本**

**參考實作：`scenario.nostromo-01-v2`《異形：生化深淵》V2**

## 1. 核心原則

副本不是一份交給模型自由發揮的長篇小說，而是一個由 **canonical reference、規則引擎、公開敘事素材與模型主持層**共同構成的可驗證內容包。

> **Engine 決定世界發生了什麼；副本文字描述玩家如何看見、聽見、理解與感受已被 Engine 授權的事情。**

所有新副本都必須維持以下分層：

| 層級 | 內容 | 誰能修改 |
|---|---|---|
| **Canonical Truth** | 地圖連線、事件條件、檢定、DC、effects、物品、傷勢、威脅、旗標、NPC 狀態、感染、樣本、結局與獎勵 | 副本作者提出；開發者／審核流程核准後才進 reference |
| **Public Narrative** | 地點描述、轉場、感官、NPC 語氣、線索發現、已授權結果的演出變體 | Gemini 生成；經 schema 與人工審核後接入 |
| **Private Authoring Notes** | `canonSummary`、private goals、秘密、完整結局條件、NPC 真實知識 | 只供 server／authoring；不得進玩家 response 或無條件 prompt |
| **Runtime State** | 玩家當前位置、已造訪地點、flags、clues、questions、NPC status、threat、time budget | 只能由 server engine 寫入；模型不能自行改動 |

模型永遠不能透過文字新增或裁定：

- 新地點、任意路線或新目的地。
- 新物品、取得／遺失、傷害、治療、感染或死亡。
- NPC 已被說服、已離開、已死亡、已攻擊或已改變關係數值。
- 威脅軌、回合數、旗標、事件完成、結局、XP、獎勵或評價。
- Ash 或其他 NPC 的未解鎖秘密。

## 2. 副本交付物總覽

每個副本進入 runtime 前，必須產出下列資料包。不要把所有內容塞進一份沒有分層的 Markdown。

| 交付物 | 建議檔案 | 必填 | 用途 |
|---|---|---:|---|
| 副本 metadata | `scenarioMetadata.json` | 是 | ID、名稱、難度、時間軸、簡介 |
| canonical blueprint | `scenarioBlueprint.json` | 是 | 地圖、節點、事件、路線、狀態與結局條件 |
| canonical reference | `scenarioReference.js` | 是 | runtime 實際載入的 server truth |
| public narrative package | `narrativePackage.js` | 是 | 地點、轉場、NPC、線索與演出變體 |
| NPC knowledge／voice bible | `npcVoiceBible.json` | 是 | 公開層、推測層、秘密層與語氣規範 |
| clue／question bank | `clueBank.json` | 是 | 發現演出、暫時解讀與問題更新 |
| settlement/debrief pack | `debriefPack.json` | 是 | 僅根據 server facts 組合收尾文字 |
| validation report | `authoringAudit.md` | 是 | ID、規則、安全與內容覆蓋檢查結果 |
| Gemini generation record | `generationManifest.json` | 建議 | 模型、版本、批次、人工修改與審核紀錄 |

## 3. 固定製作流程

### Phase 0：副本企劃一頁紙

在生成任何長文字前，先完成以下資料。若這一頁紙不清楚，不准進入大量生成。

```json
{
  "packId": "scenario.example-01-v1",
  "title": "副本名稱",
  "sourceWork": "原作／原創世界觀名稱",
  "timeline": {
    "entryPoint": "玩家切入世界的時間位置",
    "span": "本副本涵蓋的時間範圍"
  },
  "playerFantasy": "玩家在這個副本最主要的體驗，例如調查、逃生、守護、反抗或取捨。",
  "coreQuestion": "玩家離開副本前必須面對的核心問題。",
  "canonicalPremise": "無論玩家怎麼行動，本副本必須存在的基礎狀況。",
  "divergenceBoundary": "玩家可以改變哪些事情，哪些事情仍由原作／副本主線固定。",
  "difficulty": "簡單／中等／困難",
  "timeBudget": {
    "totalRounds": 50,
    "speedRewardPolicy": "由 server 計算，文字不可自行評分"
  }
}
```

### Phase 1：先寫 canonical blueprint，再寫 prose

副本作者必須先決定可機械驗證的世界結構：

1. 地圖地點與合法相鄰路線。
2. 場景／事件的順序、前置條件與完成條件。
3. 每個可檢定 approach 的 attribute、skill、difficulty 或 DC 來源。
4. 成功、失敗、重大成功與重大失敗各自授權的 effects。
5. 物品、傷勢、威脅、旗標、NPC 狀態與結局條件。
6. 哪些內容是固定主線，哪些內容可由玩家自由改變。
7. 哪些資訊在何時對玩家公開。

現行 scenario schema 已有的固定概念包括 `type: "副本"`、`entries`、`nodes`、`openingNarration`、`openingOptions`、`timeLimitRounds`、`onExpireNodeId`、`speedReward`、`isFinale` 與 `bossEncounter`。新副本應沿用這些概念，不要自行發明第二套節點格式。

### Phase 2：由 3.1 Pro 產生規範與關鍵內容

3.1 Pro 負責以下工作：

- canonical blueprint 的文字化說明與欄位補齊。
- 地圖拓撲、事件順序、玩家可見邊界的審核。
- 主要 NPC 的 voice bible、knowledge exposure 與秘密分層。
- 線索與 unresolved questions 的對應關係。
- 重大場景與結果變體的設計。
- 結算 facts 到 debrief 文案的組合規範。

3.1 Pro 不應直接決定 runtime effects；它只能提出建議，最後由人類確認並寫進 reference。

### Phase 3：由 3.7 Flash 批量產生短內容

3.7 Flash 負責已經有明確 ID 與條件的批量素材：

- 地點短變體。
- travel transition 的 standard／highThreat／alarm 版本。
- ambient 短句。
- 已確認 trigger 的 NPC 短回應。
- 同一個 canonical result 的鏡頭變體。

3.7 Flash 不得自行創造新地圖、新 NPC 動機、新 clue ID、新 result key 或秘密。任何無法確認的 ID 必須回報 `null`，交給人工審核。

### Phase 4：schema／安全／canonical 審核

所有模型輸出必須先經過：

1. JSON syntax 檢查。
2. schema 欄位與型別檢查。
3. ID 與 reference 交叉檢查。
4. 地圖 route 的 from／to 檢查。
5. effects、flags、items、NPC status 與結局條件檢查。
6. 公開／推測／秘密資訊分層檢查。
7. 敏感內容檢查：`gmTruth`、`privateGoals`、未揭露身份、異形位置、完整 reference state。
8. 文字與 canonical result 是否矛盾的人工抽查。

### Phase 5：接入與自動測試

接入順序固定為：

> metadata → canonical reference → registry → narrative adapter → public exploration view → prompt injection → frontend display → tests → validator → Cloudflare build

不能先把大量 prose 塞進前端，再回頭猜 engine 要怎麼接。

### Phase 6：內容鎖定與測試候選版

副本必須通過本文件第 10 節的驗收門檻後，才能標記為 `candidate-for-playtest`。在兩個副本都通過前，不應對外宣稱整個遊戲已達正式測試品質。

## 4. 通用 canonical blueprint 欄位

### 4.1 Metadata

```json
{
  "packId": "scenario.example-01-v1",
  "type": "副本",
  "title": "副本名稱",
  "description": "不含重大劇透的玩家可見簡介",
  "difficulty": "中等",
  "timeWindow": {
    "entryPoint": "時間軸定位",
    "span": "涵蓋時長"
  },
  "arrivalNarration": "副本專屬甦醒房間，最後必須停在玩家被半透明防護罩罩住、暫時動不了。",
  "startingInventory": [],
  "chapters": [],
  "publicContentVersion": "narrative-1"
}
```

`arrivalNarration` 與 `openingNarration` 不可以重複同一個甦醒節拍。固定開場若存在，必須同時提供經過 `validateOption()` 的 `openingOptions`。

### 4.2 Location

```json
{
  "id": "loc_example_room",
  "name": "地點名稱",
  "connections": ["loc_adjacent_room"],
  "features": ["canonical_feature_key"],
  "hazards": ["canonical_hazard_key"],
  "playerVisible": {
    "firstArrival": "第一次抵達描述",
    "atmosphere": "感官基調",
    "knownLandmarks": [],
    "playerPurpose": "可調查方向",
    "visibleHazardHints": [],
    "revisitVariants": []
  }
}
```

`connections` 是 engine 真正允許的地圖拓撲；敘事文字不能新增連線。`playerPurpose` 只能提示方向，不能保證結果。

### 4.3 Travel route

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

每條 route 必須有明確起點與終點。禁止 `任意房間`、`任意連通區域`、`玩家自行決定落點` 等無法 server 驗證的設計。

### 4.4 Scene／Node／Event

```json
{
  "id": "evt_example_investigation",
  "location": "loc_example_room",
  "nodeId": "node_example",
  "entryNarration": "固定或 canonical entry text",
  "approaches": [
    {
      "id": "app_example_search",
      "label": "玩家可理解的行動方向",
      "attribute": "感知",
      "skill": "偵察",
      "difficulty": "由 reference／規則層定義",
      "allowedOutcomes": ["success", "failure"],
      "resultKey": "result_example_search"
    }
  ],
  "freeActionBoundary": "未命中 approach 時可寫什麼、禁止寫什麼",
  "narrativeSource": {
    "entryText": "不要被 UI 或模型摘要取代",
    "outcomes": {}
  }
}
```

Approach 只代表玩家可能採取的方向，不代表限制玩家只能選那些行動。自由輸入仍由 server 依合約裁定；沒有 engine effect 時，敘事不能寫成完成的持久世界改變。

### 4.5 NPC

```json
{
  "id": "npc_example",
  "name": "NPC 名稱",
  "role": "職務／表面身份",
  "knowledge": {
    "public": [],
    "reported": [],
    "inferred": [],
    "secret": []
  },
  "memoryRules": [],
  "voiceBibleRef": "npc_example_voice",
  "statusStates": ["alive", "injured", "dead", "unknown"]
}
```

Voice bible 必須另外分成 `observed`、`reported`、`inferred`、`secret`。`secret` 不得無條件進入 prompt。NPC 的台詞庫只能提供語氣與反應素材，不得隱含未授權 effect。

### 4.6 Clue／unresolved question

```json
{
  "clueId": "clue_example",
  "sourceEventId": "evt_example_investigation",
  "knowledgeLevel": "observed",
  "publicDiscoveryText": "玩家如何發現",
  "currentInterpretation": "目前可以合理理解的部分",
  "questionUpdates": [
    {
      "questionId": "question_example",
      "status": "open",
      "publicText": "問題如何被更新"
    }
  ],
  "forbiddenClaims": ["completeSecretTruth", "exactEnemyLocation"]
}
```

### 4.7 Ending／Debrief

結局條件、XP、獎勵、grade、quality、speed、NPC 命運與資源狀態由 server 組合。文字只接收已計算的 placeholder：

```json
{
  "endingId": "end_example",
  "title": "固定結局標題",
  "debriefTemplates": {
    "opening": "固定開場句",
    "speed": {
      "fast": "{{remainingRounds}}",
      "normal": "{{remainingRounds}}",
      "slow": "{{remainingRounds}}"
    },
    "injury": [],
    "npcOutcome": [],
    "evidence": [],
    "unresolvedQuestions": []
  }
}
```

模型不得從文字反推或自行決定評分結果。

## 5. 通用 public narrative package

每個副本至少應準備：

| 類型 | 最低數量 | 備註 |
|---|---:|---|
| 地點第一次抵達描述 | 每個 canonical location 1 | 80～150 字 |
| 地點回訪變體 | 每個地點 2～3 | 依 threat／alarm／visited state |
| travel transition | 每條 route 3 | standard／highThreat／alarm |
| NPC 初次目擊 | 每名 NPC 2 | 不揭露秘密 |
| NPC 語氣規範 | 每名 NPC 1 | 不一定是可直接輸出的台詞 |
| NPC 普通回應 | 每名 NPC 6 | 只在有 trigger 時使用 |
| NPC 關係階段反應 | 每名 NPC 3～4 | 綁定 server trust/status |
| clue discovery | 每個公開 clue 1 | 包含暫時解讀 |
| unresolved question 更新 | 每個問題 2～3 | open／updated／answered |
| 重大場景 result 變體 | 每個核心場景 3 | 綁定 exact result key |
| ambient 短句 | 每個副本 30～50 | P2，最後補 |

所有可接入文字都應有最小 metadata：

```json
{
  "id": "travel_example_a_b_high_01",
  "kind": "travel_narration",
  "scope": "public",
  "sourceId": "travel_example_a_b",
  "state": "highThreat",
  "allowedFacts": ["from", "to", "threatStage", "lighting"],
  "forbiddenClaims": ["newItem", "newInjury", "npcDeath", "ending"],
  "text": "……",
  "reviewStatus": "draft"
}
```

## 6. 模型分工標準

| 內容 | 3.1 Pro | 3.7 Flash |
|---|---|---|
| 副本 premise、核心問題、固定主線 | 首稿與審核 | 不負責 |
| canonical map／route 對照 | 首稿與審核 | 不得自行改拓撲 |
| NPC knowledge／秘密分層 | 首稿與審核 | 只能依既定分層補短句 |
| clue／question 關係 | 設計與審核 | 擴寫 discovery 短文 |
| 地點完整描述 | 首稿 | 回訪變體 |
| travel transition | 抽查與修訂 | 批量生成 |
| 重大場景結果變體 | 首稿與審核 | 受限擴寫 |
| ambient | 抽查 | 批量生成 |
| debrief | 模板設計 | 固定 placeholder 變體 |
| canonical／安全 audit | 主要負責 | 不得自行放行 |

模型分工不能取代人類審核。3.1 Pro 也不能直接把自己的猜測寫進 canonical reference。

## 7. 固定審核清單

### 7.1 結構審核

- `packId` 唯一且符合命名規則。
- 所有 location、route、scene、node、event、NPC、clue、question、ending ID 唯一。
- route 的 `from`、`to` 都存在於 map。
- scene 的 location、node、event ID 都存在。
- `openingNarration` 與 `openingOptions` 成對出現。
- `isFinale` 必須有合法 `bossEncounter`。
- 所有 result key 都能追溯到 canonical reference。
- 所有 NPC、item、flag、clue、question 都能追溯到既有 registry 或 authoring manifest。

### 7.2 規則審核

- DC、檢定、effects 與結局條件由 engine 定義，不由 prose 宣稱。
- 文字沒有寫出未授權的傷害、治療、物品、位置變更、旗標或威脅變化。
- travel text 沒有把抵達前的移動寫成事件已完成。
- free action text 沒有把嘗試寫成持久結果。
- 失敗結果的文字沒有偷偷補成成功。
- NPC 反應沒有代替 server 更新 trust、status 或 action。
- debrief 沒有讓模型決定 grade、XP、獎勵、誰存活或結局。

### 7.3 公開資訊審核

- `gmTruth`、`privateGoals`、完整 `referenceState` 不進 public view。
- Ash／反派／核心秘密依 exposure level 逐步揭露。
- `exactAlienLocation`、未公開身份與未觸發結局不出現在一般 prompt。
- `observed`、`reported`、`inferred`、`secret` 分層清楚。
- 玩家只看到已造訪地點的完整 description；未造訪地點只顯示安全的方向資訊。

### 7.4 文案審核

- 每個地點都有明確空間差異與玩家可理解用途。
- 每條 route 都讓玩家感受到「從哪裡到哪裡」與沿途變化。
- 每個 clue 都有「發現」而非只是一個名詞。
- 每個 unresolved question 都能隨線索變得更具體，而不是直接公布答案。
- NPC 語氣在不同回合與關係階段保持一致。
- 重大變體只改變鏡頭與節奏，不改變 canonical facts。
- 沒有連續大量使用相同形容詞、同一種恐懼反應或同一種轉場句式。

## 8. 自動驗證與 playtest 門檻

### 8.1 每個副本的 CI 必須通過

```bash
npm test
node validate_<scenario>.mjs
npx wrangler pages functions build functions
git diff --check
```

副本專屬 validator 至少要報告：

```json
{
  "packId": "scenario.example-01-v1",
  "packErrors": [],
  "locations": 0,
  "routes": 0,
  "nodes": 0,
  "scenes": 0,
  "resultLocations": 0,
  "npcs": 0,
  "clues": 0,
  "questions": 0,
  "endings": 0,
  "openingWarnings": [],
  "publicLeakWarnings": [],
  "unmappedNarrativeIds": []
}
```

### 8.2 內部 smoke test

每個副本至少要跑通：

1. 建立新角色並進入副本。
2. 開場固定文字與選項／自由行動正常顯示。
3. 從起點走到每一個主要區域。
4. 每個主要節點至少測一次成功與一次失敗。
5. 至少測一次未命中 approach 的自由行動。
6. 確認失敗不會被文字偽裝成成功。
7. 確認線索會進入 `recentDiscoveries`，問題會正確更新。
8. 確認 NPC 只在合法場景與公開層級出現。
9. 確認回訪地點會依 state 改變，但不新增未授權效果。
10. 確認所有結局都能由 server state 推導，不依賴模型聲稱。
11. 確認結算頁只顯示 server 計算的 facts。
12. 確認同一副本重開時，沒有上一個角色的 state 汙染。

### 8.3 兩副本公開測試門檻

至少兩個副本都必須達到以下條件，才能邀請其他玩家測試：

| 門檻 | 要求 |
|---|---|
| 內容完整度 | 每個副本至少有完整 metadata、map、scene/node、NPC、clue、ending、debrief skeleton |
| 規則穩定度 | `npm test`、各自 validator、Cloudflare build 全部通過 |
| 路線可靠度 | 玩家不會因文字而誤以為可前往不存在的地點 |
| 敘事安全 | 沒有確認過的 GM truth、NPC secret、異形位置外洩 |
| 失敗可玩性 | 失敗會造成可理解的代價或局勢變化，不是無限原地重試 |
| 玩家方向感 | 每個主要回合都能理解目前位置、目的與可行動方向 |
| 結算一致性 | 評價、XP、獎勵、結局與 server state 一致 |
| 體驗測試 | 至少 3 名內部測試者各跑一輪，記錄卡點、誤解、API 等待與劇情斷裂 |
| 內容鎖定 | 重大問題修正後建立 tagged candidate build，不再邊測邊大改 schema |

## 9. 新副本的固定生成批次

之後每個新副本都按以下批次生成，不再使用「玩到哪裡才發現缺什麼」的方式：

### Batch 1：Blueprint

輸出 premise、核心問題、時間軸、玩家可改變邊界、metadata、map、routes、chapters、nodes、events、endings。

### Batch 2：Canonical rule audit

逐一列出每個 event 的 approach、check、result、effects、flags、items、NPC status、questions 與 ending dependency。此批不生成長文。

### Batch 3：Opening and location

輸出 arrival、opening、每個地點第一次抵達描述、地標、用途、危險提示與回訪狀態。

### Batch 4：NPC bible

輸出每名 NPC 的公開外觀、語氣、知識層、普通回應、關係階段、可觀察行為與線索反應。先審核秘密分層，再進 runtime。

### Batch 5：Travel and clue

輸出每條 canonical route 的 3 種轉場、每個 clue 的 discovery text、current interpretation 與 question update。

### Batch 6：Major result variants

只針對核心節點與已存在的 result key 補少量變體；不重寫 canonical outcome。

### Batch 7：Debrief and ambient

最後生成 ambient、回訪短句、結算 debrief placeholder 變體與 replay flavor。

## 10. 內容版本與變更管理

每個副本的 canonical 與 public narrative 必須分開版本：

```text
canonicalVersion: 1.0.0
narrativeVersion: 1.0.0
```

只修改文字、不改狀態契約時，可以只升 `narrativeVersion`。只要新增或修改地圖、route、effect、flag、結局條件，就必須升 `canonicalVersion`，重新跑完整 smoke test，並檢查舊存檔相容性。

每次模型生成都應保存：

```json
{
  "batch": "location-and-travel",
  "model": "Gemini 3.1 Pro",
  "generatedAt": "YYYY-MM-DD",
  "sourceFiles": [],
  "humanReviewed": false,
  "canonicalAudit": "pending",
  "acceptedItems": [],
  "rejectedItems": [],
  "revisionNotes": []
}
```

## 11. 最終標準

未來第二、第三副本不應再從「先寫一大包文字，接入後才發現缺東缺西」開始。正確流程是：

> **先定義 canonical blueprint → 再批量生成固定欄位 → 再做公開／秘密分層 → 再做 schema 與 engine audit → 再接入 narrative adapter → 最後進行雙副本 playtest。**

《異形：生化深淵》V2 的經驗可以繼續改善模板，但不能再把每個副本當成一次全新的臨時工程。模板的目的不是限制創意，而是把創意與規則、公開資訊和 runtime state 分開，讓之後的副本可以更快、更便宜、更穩定地製作。
