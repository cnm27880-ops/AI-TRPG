# AI-TRPG 通用副本驗證規範

**文件版本：2.0.0**

**適用範圍：所有進入 AI-TRPG runtime 的副本，尤其是第二與第三副本**

本規範定義副本從 Gemini 產出到可供其他玩家測試之間的固定驗收流程。任何一項阻擋級錯誤未修正前，副本不得標記為 `candidate-for-playtest`。

## 1. 驗證對象與責任邊界

> **Canonical reference 與 engine 是唯一的世界真相；narrative package 只能演出已授權的事實。**

| 層級 | 驗證內容 | 失敗後果 |
|---|---|---|
| 結構層 | JSON、欄位、型別、ID 唯一性 | 阻擋接入 |
| Canonical 層 | 地圖、事件、approach、tier、effects、flags、物品、NPC 狀態與結局來源 | 阻擋接入 |
| 敘事層 | 地點、轉場、NPC、clue、question、result variant 是否完整且可追溯 | 阻擋對外測試 |
| 安全層 | gmTruth、privateGoals、秘密、敵人位置、未解鎖身份是否外洩 | 立即阻擋 |
| Runtime 層 | server state、公開 response、prompt、前端渲染是否一致 | 阻擋部署或測試 |
| 體驗層 | 玩家方向感、失敗可玩性、節奏、結算清楚度 | 內部 playtest 前修正 |

Gemini 不得決定 DC、骰池、檢定結果、effects、位置、物品、傷勢、感染、死亡、威脅、NPC 狀態、結局、XP 或獎勵。模型產出的任何此類欄位都只能作為 proposal，不能直接載入 runtime。

## 2. 阻擋級規則

以下任一項成立，驗證必須 fail：

1. `packId`、location、route、scene、approach、NPC、item、clue、question 或 ending ID 重複。
2. route 的 `from`、`to`、`entryEventId` 不存在，或與 map connections 不一致。
3. 使用不存在的 scene、approach、result key、outcome tier、item、flag、clue、question 或 ending。
4. 使用非正式 tier，例如 `narrow_success`、`critical_failure`，而 reference 沒有同名 tier。
5. prose 宣稱 engine 沒有授權的物品、傷勢、治療、感染、死亡、位置、旗標、威脅、回合、倒數或結局。
6. travel 文字宣稱抵達後事件已完成，或 free action 將嘗試寫成持久結果。
7. NPC secret、gmTruth、privateGoals、完整 reference state、敵人確切位置或未解鎖身份進入 public response 或無條件 prompt。
8. clue presentation 沒有對應 canonical `effects.cluesAdd`，或只因玩家輸入／模型文字就建立 clue。
9. question update 使用不存在的 question ID，或把推測直接標成 answered。
10. result variant 改寫 canonical effects、結果、位置、狀態或結局。
11. `arrivalNarration`、`openingNarration`、`openingOptions` 不符合現行建卡／開場合約。
12. 任何副本 validator、`npm test` 或 Cloudflare Functions build 失敗。

## 3. 自動驗證報告契約

每個副本 validator 必須產出下列格式，並在 CI 中以 `packErrors.length === 0` 作為必要條件：

```json
{
  "packId": "scenario.example-01-v1",
  "canonicalVersion": "1.0.0",
  "narrativeVersion": "1.0.0",
  "packErrors": [],
  "locations": 0,
  "routes": 0,
  "chapters": 0,
  "nodes": 0,
  "scenes": 0,
  "resultLocations": 0,
  "npcs": 0,
  "items": 0,
  "clues": 0,
  "questions": 0,
  "endings": 0,
  "openingWarnings": [],
  "publicLeakWarnings": [],
  "unmappedNarrativeIds": [],
  "invalidCanonicalIds": [],
  "effectConflicts": [],
  "questionMappingWarnings": [],
  "coverageWarnings": []
}
```

欄位統計必須來自實際資料，不能由 Gemini 自行填一個看似完整的數字。`unmappedNarrativeIds`、`invalidCanonicalIds`、`effectConflicts`、`publicLeakWarnings` 任一非空，都必須人工處理。

## 4. 各層驗證項目

### 4.1 Schema 與 ID

驗證輸出可被標準 JSON parser 讀取；所有必填欄位型別正確；所有 ID 唯一；所有引用都能追溯到相同副本的 manifest 或 canonical reference。未知欄位可以保留在 authoring sidecar，但不得在沒有 adapter 支援時進入 runtime。

### 4.2 Map 與 travel

逐條驗證 `from`／`to` 存在、彼此相鄰、required 條件可被 state 表達、entry event 存在、time cost 由 server 採用。文字只能演出移動過程與已知環境，不能自行宣告搜查完成、取得物品、開門、戰鬥或抵達後事件結果。

### 4.3 Scene、approach 與 result

逐一檢查 approach 的 attribute、skill、difficulty 與 required 條件；逐一檢查每個正式 outcome tier 是否有合法 result；比較 prose 與 result effects，若文字比 effects 多宣稱任何狀態，標成 `effectConflicts`。

重大變體必須由 `sceneId + approachId + outcomeTier` 完整綁定，且只能作為 canonical result 上方的 narrative overlay。不能依 `resultKey` 文字猜測 tier，也不能以模型回覆覆蓋 server 選出的 result。

### 4.4 NPC 與公開資訊

每名 NPC 必須分出 `observed`、`reported`、`inferred`、`secret`。測試至少包含：初次接觸未公開秘密、已完成正確 flag 後公開確認、錯誤 flag 時仍然隱藏。NPC 台詞不得代替 trust、status、位置或戰鬥效果更新。

### 4.5 Clue 與 question

每個 clue 必須有：

```text
clueId → canonical effects.cluesAdd → source scene → source approach → actual result tier → public discovery
```

每個 question 必須有合法 ID、開啟條件、證據 clue、進度狀態與回答條件。`open`、`updated`、`answered` 必須由 server state 推導。補充文字不能自行建立新 question；若確實需要新問題，先列入 `proposedQuestions`，待 canonical schema 審核後才可加入 reference。

### 4.6 結算

結局 ID、grade、quality、XP、獎勵、NPC 命運、傷勢與 evidence status 必須由 server 組合。debrief 只可使用 placeholder；測試需確認模型或文字包不能改變結算結果。

## 5. 固定 CI 指令

每個副本與整個專案至少執行：

```bash
npm test
node validate_<scenario>.mjs
npx wrangler pages functions build functions
git diff --check
```

若是由 canonical JSON 生成 Cloudflare 相容 JS sidecar，必須先重新生成，再執行 sidecar sync test；不可只修改產物 JS。

## 6. 固定 runtime smoke test

每個副本至少驗證以下路徑：

| 流程 | 必測結果 |
|---|---|
| 建立角色 | server 重建角色，不信任客戶端 attributes／HP／XP／abilities |
| 開場 | 固定文字、位置、第一個方向與合法選項正常 |
| 探索 | 主要地點均可由合法 route 抵達，未造訪區域不洩漏完整描述 |
| 判定 | 每個核心 scene 至少測一次成功與一次失敗 |
| 自由行動 | 未命中 approach 時沒有免費完成持久效果 |
| 線索 | canonical cluesAdd 後才出現 discovery，question 狀態正確更新 |
| NPC | 接觸條件、trust、status 與 knowledge exposure 一致 |
| 回訪 | threat／alarm／visited state 會改變演出，不改變 engine truth |
| 重大場景 | overlay 不取代 result，不新增 effects |
| 結算 | 所有 ending 都由 state 推導，debrief 與 facts 一致 |
| 重玩 | 新 session 不繼承前一角色的 state 或 secrets |

## 7. 雙副本對外測試閘門

第二與第三副本至少各完成一輪內部驗證後，才可以邀請其他玩家。兩個副本都必須符合：

- metadata、blueprint、reference、narrative package、NPC bible、clue／question bank 與 debrief skeleton 齊全。
- 所有自動測試、各自 validator、Functions build 通過。
- 沒有阻擋級公開資訊洩漏或 canonical mapping error。
- 每個主要區域都有清楚的位置、用途與下一步方向。
- 失敗會改變可用方法、資源、位置或威脅，不會原地無限重試。
- 至少三名內部測試者各跑一輪，記錄方向誤解、卡死、劇情斷裂、等待時間與錯誤回覆。
- 重大問題修正後建立 immutable candidate tag；標記後不得邊測邊修改 canonical schema。

候選標記格式建議：

```text
scenario-<short-name>-candidate-v1
```

## 8. 版本管理

只修改公開文字、不改 state contract 時，只升 `narrativeVersion`。任何 location、route、approach、effects、flag、NPC state、question condition 或 ending condition 的變更，都必須升 `canonicalVersion`，重新執行完整 smoke test，並檢查舊存檔相容性。

## 9. 驗證結果判定

| 判定 | 條件 |
|---|---|
| `draft` | Gemini 已產出，但尚未完成 ID／規則／安全審核 |
| `schema-reviewed` | 結構與 ID 通過，仍可能有敘事或規則問題 |
| `canonical-reviewed` | effects、state、結局與 question mapping 通過人工審核 |
| `runtime-integrated` | adapter、prompt、public view 與前端已接線 |
| `internal-playtest` | 內部 smoke test 與測試者回饋完成 |
| `candidate-for-playtest` | 雙副本門檻與所有阻擋項目清零 |

任何文件自評「完全通過」都不能取代 validator、測試與人工 audit。
