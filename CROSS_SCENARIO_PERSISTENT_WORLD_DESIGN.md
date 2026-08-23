# AI-TRPG 跨副本持久世界與 NPC 記憶設計

## 一、核心提案

你想做的功能不應該只是「把上一個副本的結尾文字貼到下一個副本的開場」。那樣短期看起來會記得玩家，長期一定會變成一大段難以控制的歷史文字，而且 AI 很容易把旁白當成事實、遺漏早期後果或讓 NPC 知道不應該知道的事情。

比較穩定的設計是建立一個**持久世界狀態層**：每個副本仍然有自己的局部地圖、事件、敵人與時間限制；副本結束時，則由程式和副本資料共同產生一份「世界變更紀錄」。下一個同世界觀、較後時間線的副本讀取這份變更紀錄，決定新的初始狀態、NPC 反應、可用事件、傳聞、敵對勢力與結局條件。

> **上一個副本不是被下一個副本重播，而是改變下一個副本成立的條件。**

這會讓你的遊戲從一連串互不相關的電影副本，變成同一個世界中的互動式歷史。

---

## 二、必須分開的四種狀態

不要把所有資料都放在同一個 `scenarioState` 裡。建議至少分成以下四層：

| 狀態層 | 生命週期 | 例子 | 是否跨副本 |
|---|---|---|---|
| **回合狀態** | 一次玩家行動 | 本回合是否已擲骰、目前結果 tier | 否 |
| **副本狀態** | 一次副本遊玩 | 諾斯托羅莫號目前威脅、貨艙門是否焊死 | 通常否 |
| **世界線狀態** | 同一條時間線 | 諾斯托羅莫號是否毀滅、樣本是否流出 | 是 |
| **玩家／角色狀態** | 角色整個輪迴生涯 | 傷勢、裝備、獎勵、聲望、曾救過誰 | 是 |

NPC 記憶屬於世界線狀態的一部分，但每個 NPC 必須有自己的知識範圍。世界知道某件事，不代表所有 NPC 都知道；玩家知道某件事，也不代表某個未在場的 NPC 知道。

### 2.1 副本狀態

副本內可以保存完整而細節豐富的資料，例如：

```json
{
  "scenarioId": "alien_biochemical_depths",
  "runId": "run_2026_0001",
  "currentNode": "n3",
  "currentLocation": "loc_engine",
  "threatTrack": 4,
  "timeRemaining": 6,
  "inventory": ["item_flashlight", "item_blowtorch"],
  "cluesFound": ["clue_alien_trace", "clue_order_937"],
  "worldFlags": ["overload_started"],
  "npcState": {
    "npc_luyuan": {
      "status": "injured",
      "location": "loc_engine",
      "trust": 2
    }
  }
}
```

副本結束後，不要把這整份狀態原封不動地塞給下一個副本。應該由副本結算規則把它轉換成少量、穩定、可檢索的世界變更。

### 2.2 世界線狀態

世界線狀態是未來副本真正讀取的歷史。它應該保存事實，而不是保存長篇旁白：

```json
{
  "worldId": "alien_universe",
  "worldlineId": "worldline_0001",
  "currentEra": "after_nostromo_incident",
  "facts": {
    "nostromo.status": "destroyed",
    "nostromo.publicExplanation": "reactor_failure",
    "special_order_937.status": "partially_exposed",
    "alien_specimen.status": "destroyed",
    "company.coverup.status": "active"
  },
  "activeThreads": [
    "corporate_recovery_operation",
    "unverified_survivor_report",
    "unknown_alien_biological_residue"
  ]
}
```

### 2.3 玩家狀態

玩家角色的狀態要與世界狀態分離。玩家可能在下一個副本仍保留某些傷勢、物品、聲望或行動紀錄，但這不代表世界線會因玩家持有一把槍而改變。

建議保存：

```json
{
  "playerId": "player_001",
  "characterId": "character_001",
  "persistentTraits": [],
  "injuries": [],
  "inventory": [],
  "reputation": {
    "company": -2,
    "survivors": 3,
    "main_god": 1
  },
  "knownWorldEvents": [
    "nostromo_incident"
  ],
  "importantChoices": [
    "destroyed_alien_sample",
    "rescued_luyuan"
  ]
}
```

---

## 三、不要讓所有行動都成為世界歷史

如果玩家每一次「查看桌面」「踢了一下門」「對 NPC 說了一句話」都被保存成跨副本歷史，系統很快會失控。需要把影響分級。

| 影響等級 | 保存內容 | 例子 |
|---|---|---|
| `none` | 只在目前回合有效 | 玩家本回合看向左邊還是右邊 |
| `local` | 只在目前副本有效 | 貨艙某扇門被破壞 |
| `personal` | 某個 NPC 對玩家的記憶 | Ripley 記得玩家救過 Lambert |
| `scenario` | 影響本次副本結算 | 玩家是否找到 937 指令 |
| `world` | 改變未來同世界觀副本 | 諾斯托羅莫號被摧毀 |
| `timeline` | 改變整條時間線的大事件 | 異形樣本被帶入公司研究設施 |

每張事件卡應該明確標記哪些效果能離開副本。例如：

```json
{
  "eventId": "evt_order_937_reveal",
  "effects": {
    "local": ["threatStage:+1"],
    "scenario": ["clue_order_937_found"],
    "personal": ["npc_luyuan_trust:+1"],
    "world": ["company_coverup.status:active"],
    "timeline": []
  }
}
```

這樣可以避免 AI 因為一次普通交涉，就在下一個作品裡宣稱整個企業帝國已經垮台。

---

## 四、時間線與世界線模型

### 4.1 每個世界都要有穩定 ID

同一個世界觀不能只用作品名稱判斷。建議每個副本都擁有以下識別資料：

```json
{
  "worldId": "alien_universe",
  "scenarioId": "alien_biochemical_depths",
  "timelineId": "nostromo_era",
  "timePosition": {
    "absolute": "2122-06-24",
    "relativeLabel": "諾斯托羅莫號事件後"
  }
}
```

下一個副本可以寫成：

```json
{
  "worldId": "alien_universe",
  "scenarioId": "company_recovery_station",
  "timelineId": "nostromo_era",
  "timePosition": {
    "absolute": "2122-07-03",
    "relativeLabel": "諾斯托羅莫號事件後九天"
  },
  "requiresWorldFacts": [
    "nostromo.status"
  ]
}
```

這樣系統知道兩個副本屬於同一世界，也知道第二個副本在第一個副本之後。

### 4.2 重玩副本不能直接覆蓋舊歷史

玩家可能會重新遊玩《異形：生化深淵》。如果重玩結果直接覆蓋之前的世界狀態，玩家可能先救了 Ripley，重玩後 Ripley 又死了，接著下一個副本不知道該相信哪個結果。

建議採用以下規則：

- 每次完整副本遊玩都建立一個 `runId`。
- 第一次通關結果可以寫入目前世界線。
- 在同一世界線上重新遊玩已完成副本時，預設建立新的 `worldlineId`，或明確標記為「非正史測試」。
- 若玩家想重新挑戰但不想分裂世界，可以只重置副本狀態，不覆蓋既有世界歷史；這種遊玩結果不應影響未來副本。
- 未來可以提供「建立新時間線」或「讀取這個結局繼續」兩種選項。

這一步非常重要，否則你的跨副本記憶系統會在玩家重玩時產生大量矛盾。

### 4.3 未玩過前作時的預設狀態

後續副本不能要求玩家一定先玩過所有前作。每個後續副本都應提供一份 baseline 世界狀態：

```json
{
  "fallbackWorldFacts": {
    "nostromo.status": "lost",
    "special_order_937.status": "unknown",
    "alien_specimen.status": "unknown",
    "ripley.status": "unknown"
  }
}
```

如果玩家有前作歷史，就用實際歷史覆蓋 baseline；如果沒有，就使用預設狀態。這讓每個副本既能獨立遊玩，也能承接長期世界線。

---

## 五、NPC 記憶的正確設計

### 5.1 NPC 不能共享全知記憶

NPC 記得玩家，不應該等於「AI 在 prompt 裡看過玩家以前所有劇情」。每名 NPC 都要保存自己的記憶集合，而且每筆記憶要有來源、可信度、情感與可見範圍。

```json
{
  "npcId": "npc_ripley",
  "memories": [
    {
      "id": "mem_ripley_player_rescued_lambert",
      "type": "direct_observation",
      "subject": "player_001",
      "fact": "玩家在諾斯托羅莫號事件中冒險返回醫療區救出 Lambert。",
      "confidence": 1.0,
      "emotionalValence": "trust",
      "importance": 4,
      "sourceRunId": "run_2026_0001",
      "createdAt": "2122-06-24",
      "decay": "none",
      "visibility": "npc_private"
    }
  ]
}
```

### 5.2 記憶應該有四種來源

| 記憶來源 | NPC 是否親眼知道 | 例子 | 可信度 |
|---|---:|---|---:|
| `direct_observation` | 是 | Ripley 親眼看見玩家拉她離開貨艙 | 高 |
| `reported_by_other` | 否 | Parker 告訴 Ripley 玩家救過陸遠 | 中高 |
| `public_record` | 否 | 公司報告寫玩家是事故責任人 | 視來源而定 |
| `rumor_or_misinformation` | 否 | 傳聞說玩家把異形帶走 | 低至中 |

這會產生很有趣的戲劇效果：Ripley 親眼知道玩家救過她，但公司高層只知道玩家可能攜帶樣本；某名後續 NPC 只知道一則把玩家描述成恐怖分子的錯誤傳聞。

### 5.3 記憶不是裝飾，而是行為規則的輸入

NPC 記憶應該影響遊戲，不只是讓 NPC 在對話中說一句「我記得你」。建議每筆重要記憶可以觸發：

- 初始信任或敵意。
- 是否願意提供資訊。
- 是否願意同行或支援。
- 是否提高交易價格或拒絕合作。
- 是否在危險時優先救玩家。
- 是否隱瞞某項情報。
- 是否把玩家交給公司或敵對勢力。
- 是否解鎖特殊事件或特殊結局。

```json
{
  "memoryId": "mem_ripley_player_rescued_lambert",
  "behaviorEffects": {
    "trustDelta": 3,
    "unlocks": ["evt_ripley_private_warning"],
    "initialCooperation": "likely",
    "willRiskLifeForPlayer": true
  }
}
```

### 5.4 NPC 只應記得自己有機會知道的事

每個事件的結果都應記錄「誰在場」「誰知道」「誰可以推測」。例如玩家在主機核心房獨自備份 937，Ripley 不應自動知道；如果玩家把資料交給她，或她後來讀取了終端，才建立新的記憶。

建議事件結果加入：

```json
{
  "knowledgePropagation": {
    "directWitnesses": ["npc_luyuan"],
    "receivers": [],
    "publicRecord": false,
    "rumorChance": 0.2
  }
}
```

---

## 六、玩家影響如何進入下一個《異形》副本

以《異形：生化深淵》為例，副本結束時不要只輸出「結局 2：火種重燃」。應該產生一份機器可讀的 `scenarioOutcome`：

```json
{
  "scenarioId": "alien_biochemical_depths",
  "runId": "run_2026_0001",
  "worldId": "alien_universe",
  "worldlineId": "worldline_0001",
  "outcomeId": "end_heroic_rescue",
  "timestamp": "2122-06-24",
  "playerOutcome": {
    "alive": true,
    "injuries": ["burn_minor"],
    "infectionStatus": "cleared",
    "inventoryCarryOver": ["item_desert_eagle"]
  },
  "worldDelta": [
    {
      "key": "nostromo.status",
      "value": "destroyed",
      "persistence": "world",
      "provenance": "evt_trigger_overload"
    },
    {
      "key": "alien_specimen.status",
      "value": "destroyed",
      "persistence": "timeline",
      "provenance": "evt_narcissus_final_purge"
    },
    {
      "key": "company.coverup.status",
      "value": "active",
      "persistence": "world",
      "provenance": "evt_order_937_reveal"
    }
  ],
  "npcDeltas": [
    {
      "npcId": "npc_ripley",
      "status": "alive",
      "relationshipWithPlayer": "trusted_ally",
      "memorySeeds": ["player_helped_survivors"]
    },
    {
      "npcId": "npc_luyuan",
      "status": "alive",
      "relationshipWithPlayer": "mentor_and_comrade",
      "memorySeeds": ["player_survived_heroic_escape"]
    },
    {
      "npcId": "npc_ash",
      "status": "destroyed",
      "memorySeeds": ["ash_core_data_may_be_recoverable"]
    }
  ],
  "unresolvedThreads": [
    "company_wants_to_recover_937_data",
    "official_report_will_hide_the_real_cause",
    "survivors_may_be_questioned_or_hunted"
  ]
}
```

如果玩家選的是 `end_corporate_agent`，則可以產生完全不同的結果：樣本存在、公司對玩家有利用價值、Ripley 或其他倖存者可能對玩家抱有敵意、Ash 的資料可能被帶回企業研究部門。後續副本的核心危機就不必重新介紹異形，而可以直接從「企業已經開始使用那份樣本」開始。

如果玩家選的是 `end_dark_infection`，後續副本則可以從玩家回歸主神空間後的感染風險、醫療費用、身體異常或隱瞞真相展開。這個結局不只是結尾文字，而是下一個副本的前置條件。

---

## 七、後續副本應該如何撰寫

未來每個副本都不應只提供「劇情簡介＋幾個節點」。建議使用以下八個部分：

### 7.1 副本元資料

描述它屬於哪個世界、哪個時間、哪個地點，以及它能讀取哪些前作結果。

```json
{
  "scenarioId": "company_recovery_station",
  "worldId": "alien_universe",
  "timelineId": "nostromo_era",
  "timePosition": "2122-07-03",
  "locations": ["salvage_station", "corporate_lab"],
  "imports": [
    "nostromo.status",
    "alien_specimen.status",
    "company.coverup.status"
  ]
}
```

### 7.2 baseline 與歷史分支

作者要明確寫出「沒有前作記錄時會怎樣」以及「前作不同結局時會怎樣」。不要讓 AI 自行猜測分支。

```json
{
  "historyVariants": [
    {
      "when": {"alien_specimen.status": "destroyed"},
      "openingVariant": "公司以貨運事故為名封鎖打撈站，暗中搜尋殘留生物證據。"
    },
    {
      "when": {"alien_specimen.status": "intact"},
      "openingVariant": "打撈站已收到高優先級生物樣本，所有人員被要求服從保密與隔離程序。"
    },
    {
      "when": {"npc_ripley.status": "alive", "npc_ripley.relationship": "trusted_ally"},
      "openingVariant": "Ripley 私下聯絡玩家，要求調查公司隱瞞的另一艘失聯貨船。"
    }
  ]
}
```

### 7.3 新副本自己的固定真相

後續副本必須擁有新的問題，不要只是把上一個副本的問題換一個房間重播。例如第一個副本解決的是「在諾斯托羅莫號生還」，第二個副本可以處理「公司如何掩蓋事件」「樣本是否流出」「倖存者如何被追查」「玩家是否成為感染源」等新衝突。

### 7.4 進場記憶與 NPC 反應

每個重要 NPC 都要寫：

- 他是否在前作遇見玩家。
- 他知道哪些前作事實。
- 他對玩家的第一個情緒反應。
- 他願意提供什麼或拒絕什麼。
- 哪些歷史條件會使他改變立場。
- 玩家必須做什麼才能修復或破壞關係。

### 7.5 歷史影響事件

不要只在開場提到前作。前作影響應該在遊戲過程中變成可互動內容，例如：

- 公司檔案把玩家描述成恐怖分子。
- Ripley 的證詞可以替玩家解除某道安全門。
- Ash 的殘留資料可能成為錯誤情報或危險陷阱。
- 玩家曾帶回的樣本導致某個區域被隔離。
- 玩家曾救過的 NPC 在關鍵時刻提供協助。
- 玩家曾背叛的人在後續副本中成為追捕者或證人。

### 7.6 新副本的未解線索

一個副本結束後，不要把所有事情都關閉。每個副本最好輸出一至三條 `unresolvedThreads`，讓後續作品可以選擇承接，但不必全部承接。

```json
{
  "threadId": "company_recovery_operation",
  "status": "active",
  "knownBy": ["npc_ripley", "company_agent_07"],
  "urgency": 3,
  "possibleFollowUps": [
    "company_recovery_station",
    "survivor_interrogation",
    "black_market_biotech_lab"
  ]
}
```

### 7.7 不同歷史不必導向完全不同的整個副本

分支設計不宜把每個結局都做成一套完全獨立的劇本，否則內容量會爆炸。建議採用：

- 70% 共用地圖與核心事件。
- 20% 依前作世界狀態變化的 NPC、線索與處理方法。
- 10% 只有特定歷史才出現的事件、結局或隱藏路線。

這樣玩家會感覺歷史真的產生差異，但作者不需要維護數十條完全分離的劇情。

### 7.8 後續副本也要輸出下一份世界變更

每個副本都是一個「歷史轉換器」：讀取前一份世界狀態，讓玩家行動，最後產生新的 `worldDelta`。這使副本可以串成：

```text
世界基準狀態
  ↓
《異形：生化深淵》
  ↓ worldDelta_01
公司回收站副本
  ↓ worldDelta_02
倖存者審訊副本
  ↓ worldDelta_03
黑市生化研究所副本
```

---

## 八、給副本作者的標準寫作模板

之後撰寫任何新副本時，可以要求作者提供以下資料：

```markdown
# 副本名稱

## 1. 世界與時間線
- worldId：
- scenarioId：
- timelineId：
- 時間位置：
- 地點：
- 與哪些前作相容：

## 2. baseline 世界狀態
沒有前作紀錄時，世界的預設事實、NPC 狀態與公共傳聞。

## 3. 可讀取的前作影響
每一個影響列出：
- world fact key
- 可接受的值
- 對開場、NPC、事件、資源或結局的影響
- 若沒有這個資料時的 fallback

## 4. 本副本固定真相
不能被玩家或 AI 任意改寫的事實。

## 5. 本副本主要 NPC
每人列出：
- 穩定 NPC ID
- 本副本位置
- 公開目標
- 私人目標
- 已知資訊
- 不知道的資訊
- 前作記憶接點
- 信任、恐懼與背叛條件

## 6. 地圖與物品
列出區域、連接、門禁、資源、危險與可改變狀態。

## 7. 主線與事件卡
每張事件列出：
- 前置條件
- 場景真相
- 可見資訊
- 預設處理方法
- 自由行動裁定範圍
- 檢定規則
- 結果 effects
- NPC 知識傳播
- 可持久化的世界影響

## 8. 歷史分支
列出前作結果如何改變本副本，但不要讓 AI 自己猜分支。

## 9. 結局
每個結局列出：
- 達成條件
- 排除條件
- 玩家狀態
- NPC 狀態
- 世界變更
- 未解線索
- 可供下一副本讀取的記憶種子

## 10. scenarioOutcome
最後輸出機器可讀的 worldDelta、npcDeltas、playerCarryOver 與 unresolvedThreads。
```

---

## 九、AI 在跨副本系統中的正確工作範圍

AI 可以做以下事情：

- 將結構化世界事實轉成玩家看得懂的敘事。
- 根據 NPC 的記憶與行為規則撰寫不同反應。
- 把玩家自由輸入歸類成某個合法行動意圖。
- 從目前副本資料中挑選最合理的事件反應。
- 提出候選的 NPC 記憶，但由程式或副本規則驗證是否可保存。
- 根據已確定的世界狀態，生成不同版本的開場、對話、線索與結局。

AI 不可以做以下事情：

- 自行決定上一個副本到底發生了哪個結局。
- 讓一個未在場的 NPC 知道秘密資料。
- 自行把普通行動升級成足以改變整個世界的歷史事件。
- 自行復活已經被標記為死亡的 NPC。
- 直接修改世界線 ID、時間位置、NPC 穩定 ID 或正式物品 ID。
- 直接決定 DC、骰子結果、傷勢數值與結局條件。
- 用「我記得玩家以前做過某事」取代正式的 NPC memory 記錄。

---

## 十、對目前專案最實際的開發順序

不要一開始就開發完整的時間線圖與全知 NPC 記憶。最小可行版本可以分成四步。

### 第一步：在副本結算時產生歷史摘要

先擴充 `settlement` 的輸出，增加：

```json
{
  "outcomeId": "end_heroic_rescue",
  "worldDelta": [],
  "npcDeltas": [],
  "unresolvedThreads": [],
  "memorySeeds": []
}
```

這一步不必立刻讓世界狀態影響下一個副本，只要先把資料保存下來。

### 第二步：讓下一個副本讀取有限的 world facts

先只支援五至十個穩定欄位，例如：

```text
nostromo.status
alien_specimen.status
special_order_937.status
company.coverup.status
npc_ripley.status
npc_ripley.relationship
npc_luyuan.status
npc_ash.status
```

不要一開始讓 AI 讀取所有 event log。

### 第三步：加入 NPC memory seed

先支援三種記憶：

- 親眼看見玩家救援或背叛。
- 從可信任角色聽到的事件。
- 從公司檔案或公共傳聞得知的事件。

每一種記憶都要有 `npcId`、`subject`、`fact`、`source`、`confidence` 與 `behaviorEffects`。

### 第四步：再加入分支開場與事件條件

當前面三步穩定後，才讓後續副本根據 `worldDelta` 改變開場、NPC、可用事件、資源與結局。此時你就已經擁有真正可感受到的跨副本記憶，而不必先完成龐大的世界模擬器。

---

## 十一、最終設計原則

你的長期目標可以濃縮成以下五句話：

1. **副本是一次冒險，世界線是所有冒險留下的歷史。**
2. **AI 不保存歷史；資料系統保存歷史，AI 只讀取與演出相關的歷史。**
3. **NPC 不共享全知記憶，每名 NPC 只知道自己看見、聽見或合理推測的事情。**
4. **真正會改變後續副本的，必須是明確的 world facts、NPC memory 與 unresolved threads。**
5. **後續副本不應重播前作，而應該從前作造成的新世界條件開始。**

以《異形：生化深淵》為例，最有價值的承接不是下一個副本再介紹一次異形，而是讓玩家在之後發現：公司已經對事故提出官方說法、某份 937 資料仍然被追查、Ripley 會依照玩家曾經救她或背叛她而採取不同態度、Ash 的殘留資料可能成為危險遺產，而玩家自己在這場事件中的名聲已經開始流傳。

這樣玩家會真正感覺到：**自己不是跑完一個副本，而是在改寫一個會繼續運轉的世界。**
