# 《努布拉島：維修站撤離》V1 接入審核紀錄

**packId：** `scenario.jurassic-park-01-v1`
**canonicalVersion：** 1.0.0　**narrativeVersion：** 1.0.0
**目前判定：** `runtime-integrated`（依 `docs/SCENARIO_VALIDATION_SPEC.md` 第 9 節）
**尚未達成：** `internal-playtest`、`candidate-for-playtest` —— 需要至少三名內部測試者各跑一輪。

## 1. 來源與交付物

本副本由玩家提供的 Gemini 七個批次產出轉寫而成，對應 `docs/SCENARIO_AUTHORING_STANDARD.md` 第 9 節的固定批次：

| 批次 | 內容 | 落到哪裡 |
|---|---|---|
| 1 blueprint | metadata、章節、節點、地點、路線、結局矩陣 | `jurassicPark_v1.js`、reference 的 `map` / `travelTransitions` / `endings` |
| 2 rule-audit | 4 個重大事件、16 條進路、各階層後果 | reference 的 `scenes[].approaches[].outcomes` |
| 3 opening-location | briefing、arrival、opening、地點深度設定與回訪變體 | `jurassicPark_v1.js` 的開場、reference 的 `map[].playerVisible` |
| 4 npc-bible | 三名 NPC 的知識分層、語氣、暴露階層、記憶規則 | reference 的 `npcs` |
| 5 travel-clue | 道具、線索、未解問題、轉場、ambient | reference 的 `items` / `clues` / `unresolvedQuestions` / `ambient` |
| 6 result-variants | 代表性進路的七階層演出文字、自由行動映射 | 直接作為 canonical result `text` |
| 7 debrief | 六個結局的結算模板與未來延伸 | reference 的 `endings` / `debriefTemplates` |

實際檔案：

- `content/scenario/examples/jurassicPark_v1.js` —— runtime scenario pack（只用 `schema.js` 已支援的欄位）。
- `content/scenario/examples/jurassicPark_v1_gm_reference.json` —— canonical reference，authoring 來源。
- `content/scenario/examples/jurassicPark_v1_gm_reference.js` —— 由 JSON 產生的 Cloudflare 相容 sidecar（測試會比對兩者是否同步）。
- `validate_jurassic_v1.mjs` —— 副本專屬 validator，輸出驗證規範第 3 節的報告契約。
- `test/jurassicParkV1.test.js` —— 接入與主線流程測試。

## 2. Proposal → Canonical 的轉換

批次輸出的 `threatDeltaProposal`、`outcomeEffectsProposal`、`riskProposal` 都只是提案。轉成 canonical 時做了以下決定，全部記在 reference 的 `authoredDeviations`：

1. **威脅軌**：批次提案五階段；引擎的威脅軌固定四階段（潛伏／追蹤／貼近／接觸）。五階段的描述被壓縮進 `pack.threatTrack.stages` 的四個鍵。
2. **旗標命名**：批次混用 `dock_cleared` 與 `flag_power_restored`；全部正規化為 `flag_*`，validator 會擋下不合規的命名。
3. **結果階層**：批次的「大失敗」對應引擎正式階層「大失敗(命定)」。
4. **事件 ID**：批次的線索與演出變體用 `evt_embryo_sublab` 指稱實驗室事件，事件本身卻是 `evt_embryo_lab_entry`；統一為後者。
5. **路線補齊**：地圖宣告管廊與發電機房、實驗室相鄰，批次卻只給了 8 條 route。補上 4 條反向／分支 route，否則地圖會宣稱相鄰但無法通行。
6. **新增兩個事件**：`evt_service_tunnel_transit`（管廊取道）與 `evt_evacuation_departure`（離場結算），讓批次描述的地下動線與結算收尾有可落地的場景。
7. **新增一條進路**：`app_dock_survey_jeep`，對應批次的開場選項「觀察空地吉普車與泥地痕跡」，同時是 `flag_jeep_repaired` 的唯一來源（沒有它，批次的吉普車衝刺路線永遠不可用）。
8. **死亡處理**：批次在實驗室正面戰鬥的「大失敗」提案即死；改為重傷，交由既有 HP／倒地機制處理。玩家死亡旗標只出現在最終停機坪事件的最嚴重階層。
9. **結局判定**：改為有序規則表 `endingRules`。完美撤離不再硬性要求恢復供電（供電改為計入品質分數），「斷尾求生」作為所有登機路線的保底結局，避免出現無法推導結局的狀態組合。

## 3. 為了第二副本所做的引擎調整

這些調整全部是**加法**：沒有宣告新欄位的副本（Alien V2）行為完全不變，回歸測試在 `test/jurassicParkV1.test.js` 最後一項。

| 檔案 | 調整 | 新欄位 |
|---|---|---|
| `content/scenario/referenceAdapter.js` | 結局判定、最終戰完成條件、戰鬥勝利收尾、狀態軸起始值、NPC 接觸條件、地點用途與事件標題全部改為可由 reference 宣告 | `endingRules`、`finaleCompletion`、`finaleVictory`、`initialStateAxes`、`npcs[].contactFlags`、`npcs[].presenceScenes`、`scenes[].title`、`map[].playerVisible` |
| `content/scenario/explorationState.js` | 路線風險規則改為可由 reference 宣告，並支援依「從哪裡來」區分風險 | `travelRiskRules`（含 `from`） |
| `content/scenario/settlement.js` | 證據加分不再只認異形副本的旗標 | `flag_evidence_secured` |
| `functions/api/travel.js` | 解除「只有 V2 異形副本可用探索移動」的白名單，改成檢查 reference 是否具備地圖與已授權 route；並支援移動即結算節點 | `travelCompletesNodes` |
| `functions/api/turn.js` | reference 明確完成的節點可以結算自己指名的節點（非線性副本會先繞去別的模組）。AI 自己宣稱的 `nodeComplete` 仍只能用在目前主線節點上 | — |

`travelCompletesNodes` 是本副本需要的：這個副本的節點是「區域」而不是單一事件鏈，玩家可能先繞去實驗室再回頭恢復供電。沒有它，走路離開節點現場就永遠不會結算。

## 4. Validator 報告

```
node validate_jurassic_v1.mjs
```

```json
{
  "packId": "scenario.jurassic-park-01-v1",
  "packErrors": [],
  "locations": 5,
  "routes": 12,
  "chapters": 1,
  "nodes": 5,
  "scenes": 7,
  "resultLocations": 140,
  "npcs": 3,
  "items": 6,
  "clues": 7,
  "questions": 3,
  "endings": 6,
  "openingWarnings": [],
  "publicLeakWarnings": [],
  "unmappedNarrativeIds": [],
  "invalidCanonicalIds": [],
  "effectConflicts": [],
  "questionMappingWarnings": [],
  "coverageWarnings": []
}
```

validator 另外檢查了三件驗證規範點名、但泛用 schema 檢查不到的事：

- 每個失敗階層都必須改變旗標、傷勢、裝備、位置、威脅或時間其中一項（杜絕原地刷骰）。
- 每個線索都必須有 canonical `cluesAdd` 來源，而不是只靠文字宣稱。
- NPC 秘密與 `gmTruth` 的原文不得出現在任何玩家可見文字裡。

## 5. 已完成的 smoke 覆蓋

`test/jurassicParkV1.test.js`（15 項）涵蓋：

- 副本包、開場選項、sidecar 同步、registry 註冊。
- 主線走通：n1 → n2 → n3 依序結算、最終戰由登機完成、狀態軸與物品正確。
- 六個結局全部能由 state 推導，且沒有「已登機卻推不出結局」的狀態組合。
- 戰鬥勝利收尾改由資料決定。
- 移動：地圖相鄰檢查、前置旗標鎖、風險規則（開車衝山路 2 vs 爬管廊 1、無照明 +1）。
- 公開視圖不洩漏 `gmTruth` 與 NPC 秘密；NPC 只在接觸條件成立後才進名冊。

## 6. 尚未完成（進 playtest 前要補）

1. **內部 playtest**：至少三名測試者各跑一輪，記錄卡點、方向誤解與劇情斷裂。
2. **NPC 演出素材接線**：`content/scenario/narrativePackageAdapter.js` 目前只服務異形副本（`SUPPORTED_SOURCE_PACK_ID`）。本副本的 NPC 語氣庫與回訪變體已在 reference 裡，但還沒有對應的 narrative package adapter，NPC 對白目前完全交給模型依 reference 的語氣規範即興。
3. **`cluePresentationAdapter`**：同樣只服務異形副本，本副本的線索發現目前直接使用 `clue.reveals`。
4. **`freeActionMappings`**：批次 6 提供的自由行動意圖映射尚未接入 `freeActionContract`，目前自由行動走既有的泛用合約。
5. **永久隊友招募鉤子**：批次 7 的 `recruitmentHooks` 仍停留在 proposal 層，需要跨副本隊友池與陣營聲望模組才能落地，未寫進 reference。
