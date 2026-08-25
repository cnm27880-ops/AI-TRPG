# 《異形補充二》剩餘 Clue／Question 接入計畫

**文件版本：1.0.0**

**目前基準：Alien V2 canonical reference／`main`**

**狀態：規劃中，尚未修改 runtime**

本文件只處理《異形補充二.md》中尚未授權的 clue 與 question。現有四個 canonical clue 的 tier presentation 已由 `content/scenario/cluePresentationAdapter.js` 接入；本文件中的項目不可直接追加到該 adapter，必須先完成 canonical mapping、state 審核與測試。

## 1. 目前未授權範圍

### 1.1 四個新 clue ID

| 補充 ID | 主題 | 目前問題 | 暫定處置 |
|---|---|---|---|
| `clue_roster_anomaly` | 休眠名冊沒有玩家／輪迴者記錄 | canonical reference 沒有此 ID；且「輪迴者」涉及主神空間與玩家背景，不是普通船員線索 | 第一階段只研究是否能轉成既有 `q_player_manifest` 的公開觀察；未完成前不新增 clue |
| `clue_crew_status` | 原船員遇襲／死亡紀錄 | 涉及多名 NPC 命運，現有 canonical 只對部分人物有獨立命運條件 | 先建立 NPC status matrix，再決定拆成既有 NPC clue、`q_brett_fate` 更新，或另開 canonical clue |
| `clue_coolant_overload` | 冷卻系統、反應爐超載與倒數 | 可能把四座閥門、倒數時間誤寫成新 mechanics；現有 engine 已有 overload flags，但不代表有同名 clue | 優先掛到既有 overload preparation／finale result；若只是演出，不新增 persistent clue |
| `clue_infection_signs` | 抱臉體感染與潛伏風險 | 可能直接影響 `infectionStatus` 與 `end_dark_infection`，目前沒有對應的中間 clue／檢查 state | 先完成感染 state、檢定與結局依賴 audit；在此之前只能作為非持久的失敗／觀察文字 |

### 1.2 八個補充 question ID

補充文件中的八個 question 都不是目前正式 question ID：

```text
q_crew_identity
q_crew_whereabouts
q_creature_nature
q_ash_motivation
q_company_directive
q_escape_shuttle
q_destroy_ship
q_infection_risk
```

目前 canonical question ID 為：

```text
q_player_manifest
q_alien_route
q_ash_identity
q_order_937
q_narcissus_safety
q_brett_fate
```

其中 `q_company_directive` 已經安全轉為 `q_order_937` 的 `progressText`，本計畫不再新增它。其餘八個補充項目中，真正仍待處理的是另外七個；若將已完成的 `q_company_directive` 也列入審核清單，必須標記為 `migrated`，不能重複建立。

## 2. Question 接入決策矩陣

| 補充 question | 建議分類 | 下一步 | 驗收條件 |
|---|---|---|---|
| `q_crew_identity` | 候選：更新 `q_player_manifest` | 先確認玩家未列入休眠名冊是否為 canonical premise；若只是主神空間背景，不應寫成船內可證實的答案 | 玩家只能看到「名冊與自身記憶不一致」；不能直接得出輪迴者真相 |
| `q_crew_whereabouts` | 需要拆分／暫不新增 | 先逐一對照 Kane、Dallas、Brett 與其他船員在 reference 中的 status／scene 結果 | 任何回答都只能來自已授權 NPC status 或 result；不能用一題宣布全員命運 |
| `q_creature_nature` | 候選：不新增，作 `q_alien_route` 的進度解讀 | 使用 `clue_alien_trace` 的觀察結果，將「生物是什麼」保持為暫時解讀，不改變 route question 的答案 | `open`／`updated` 不得直接變成完整物種真相；不新增敵人位置 |
| `q_ash_motivation` | 需要 canonical 設計 | 先決定它是否與 `q_ash_identity` 分開；若要保留，新增 question 必須定義 openWhen、evidence clues、answerWhenFlags | Ash 動機只能在公司指令／身分等既有 flags 足夠時回答；一般對話不得直接揭露 |
| `q_company_directive` | **已遷移** | 使用現有 `q_order_937.progressText` 與 `clue_order_937` | 不存在 `q_company_directive` runtime state；未完整揭露時顯示 progress，揭露後顯示 canonical answer |
| `q_escape_shuttle` | 候選：更新 `q_narcissus_safety` | 將「如何離開」轉為水仙號安全條件的部分解讀，不宣告已具備發射能力 | 必須引用已授權 `clue_narcissus_prep`、airlock phase 與 route；不能自行消耗物品或完成登艇 |
| `q_destroy_ship` | 需要 canonical 設計 | 先對照 overload preparation、shipStatus、`flag_overload_active` 與 final purge 依賴 | 若新增 question，答案必須由 server flag／shipStatus 推導，文字不能建立倒數或爆炸結果 |
| `q_infection_risk` | 需要 canonical 設計，優先級最高 | 盤點 `infectionStatus` 的所有寫入、感染來源、檢查方式與 `end_dark_infection` 條件 | 任何感染 hint 都不能直接改 `infectionStatus`；必須有明確 result effects 與結局測試 |

## 3. Clue 接入分階段計畫

### Phase C0：只做來源盤點，不改 state

建立一份 `clueSourceAudit`，逐筆列出補充文字想描述的 scene、approach、result tier、canonical effects 與目前已存在的 flags。若找不到完全相同的 source binding，就標為 `unmapped`，不能用相似場景代替。

此階段的必要測試是：任何未知 clue ID 不會進入 `referenceState.clues`、`recentDiscoveries` 或 public question；任何沒有 `effects.cluesAdd` 的 result 都不能呼叫補充 clue presentation。

### Phase C1：可由既有 canonical clue 吸收的內容

優先處理不需要新增 state 的部分：

- `clue_roster_anomaly` 的「名冊異常」文字，評估改為 `q_player_manifest` 的 `progressText`，但不要保留「輪迴者」字眼作為船內確定真相。
- `clue_crew_status` 的個別觀察，只有在對應 NPC status 已由 canonical result 授權時，才作為既有 NPC clue 或 `q_brett_fate` 的更新。
- `clue_coolant_overload` 的感官演出，若 canonical result 已加入 `flag_overload_active` 或 `shipStatus` 改變，才作為 result／scene overlay；不先建立新 clue。

C1 的通過條件是：不新增 persistent state、不新增 ending dependency、不增加新的物品／傷勢／威脅／時間效果，且所有演出均可由既有 canonical result 追溯。

### Phase C2：需要新 canonical state 的內容

以下內容要先寫 canonical design proposal，再決定是否開發：

- `clue_infection_signs` 與 `q_infection_risk`：定義感染的可觀察階段、真正感染來源、server 寫入時機、可逆／不可逆狀態與結局依賴。
- `q_ash_motivation`：定義動機與身分是否分離，以及各自的 evidence clue 與 reveal flag。
- `q_destroy_ship`：定義反應爐超載、船艦狀態、倒數是否為規則資料，以及結局如何由 server 推導。

C2 未通過 canonical review 前，Gemini 只可以生成候選文字，不得生成 runtime-ready clue 或 question。

## 4. 每個項目的固定測試計畫

### Clue 測試

每個新接入的 clue 必須至少有以下測試：

1. 正確 scene／approach／actual result tier 且 `effects.cluesAdd` 已成立時，才會出現 discovery。
2. 同一 scene 的錯誤 tier、錯誤 approach、錯誤 scene 都回退 canonical text 或回傳 `null`。
3. 沒有 canonical `cluesAdd` 時，玩家輸入與模型文字都不能建立 clue。
4. discovery 不得包含 `gmTruth`、private goals、exact enemy location、未解鎖 NPC identity 或未授權 mechanics。
5. 重複取得同一 clue 不會重複污染 recentDiscoveries。
6. 舊存檔沒有新欄位時，normalize 後仍可遊玩。

### Question 測試

每個既有 question 更新或新 question proposal 必須至少有以下測試：

1. 未取得證據時保持 `open`，不顯示 progress 或 answer。
2. 取得指定 clue 後只變成 `updated`，顯示目前解讀，不顯示完整答案。
3. 只有 canonical answer flag／state 成立後才變成 `answered`。
4. 錯誤 clue、玩家自稱、NPC 台詞或模型文字不能讓 question 變成 `answered`。
5. 新 question 若沒有正式 schema／ID，不得出現在 public runtime response。
6. question 的更新不改變 effects、ending、NPC status 或 threat。

### 感染相關額外測試

如果未來核准 `clue_infection_signs` 或 `q_infection_risk`，必須增加：

- 未感染玩家看到感染線索時，`infectionStatus` 仍保持原值。
- 只有指定 canonical result 才能寫入 `infectionStatus`。
- 感染、未感染、未知三種狀態都能正確導向結算。
- `end_dark_infection` 只能由 server state 推導，不能由 clue 文案直接觸發。

## 5. 建議實作順序

1. 完成 `clueSourceAudit`，不寫 runtime。
2. 先處理 `q_crew_identity`／`q_player_manifest` 與 `q_escape_shuttle`／`q_narcissus_safety` 的合併可行性。
3. 將 `q_creature_nature` 改為 `clue_alien_trace` 的暫時解讀，不新增 question。
4. 逐一拆解 `clue_crew_status`，確認是否能使用現有 NPC status 與 `q_brett_fate`。
5. 把 `clue_coolant_overload` 限制成已授權 overload result 的 scene／result overlay。
6. 最後才決定是否為 Ash 動機、摧毀船艦與感染風險新增 canonical question／state。
7. 每完成一個項目，就依 `SCENARIO_VALIDATION_SPEC.md` 執行 targeted tests、完整 `npm test`、validator 與 Functions build。

## 6. 暫定狀態標記

```text
q_company_directive      migrated
q_crew_identity          candidate_existing_question_update
q_crew_whereabouts       blocked_requires_npc_status_audit
q_creature_nature        candidate_interpretation_only
q_ash_motivation         blocked_requires_new_question_design
q_escape_shuttle         candidate_existing_question_update
q_destroy_ship            blocked_requires_ship_state_design
q_infection_risk         blocked_requires_infection_state_audit

clue_roster_anomaly      blocked_new_id_and_player_lore_risk
clue_crew_status         blocked_requires_npc_status_audit
clue_coolant_overload    candidate_existing_overload_result_only
clue_infection_signs     blocked_requires_infection_state_design
```

本計畫的完成標準不是「八個 question 都出現在 UI」，而是每個問題都能說明其證據來源、server state、公開階段、回答條件與失敗時的安全行為。若做不到，保留為 authoring proposal 比錯誤加入 runtime 更安全。
