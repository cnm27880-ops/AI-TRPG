# 《異形：生化深淵》V2 規則引擎升級報告

## 交付結論

本次已完成 V2 從「AI 生成選項並單次推進事件」轉向「reference JSON 提供世界真相與事件卡、規則引擎裁定狀態、AI 擔任受限敘事 GM」的第一個可執行版本。V2 仍以 `scenario.nostromo-01-v2` 載入，**沒有取代舊異形預設副本，也沒有部署到正式網站**。

本輪也完成了精美副本結算頁、server-computed S/A/B/C/D 評價、首次進入主神空間的一次性劇情、bounded free action contract、deterministic narration guard、最多一次安全重寫、engine-safe fallback、主神空間 Phase A server API／aftercare UI，以及真實第三方 Gemini 的 V2 互動測試。測試證明 custom OpenAI-compatible endpoint、JSON schema 路徑、reference state 持久化與依行動規模分流的敘事 token policy 可以一起運作；模型越界時現在會被重寫或降到不改變世界狀態的安全模板，但仍不能把模型原始文筆宣稱為完全可靠，因此目前仍需人工審查後才可正式上線。

本輪暫緩排行榜、跨副本承接與 world memory。`runSummary` 目前只作為玩家自己的 server-computed 結算紀錄，主神空間則以結算回流、狀態整理與後續規劃為主。

## 主要功能變更

| 領域 | 已完成內容 | 引擎責任 | AI 責任 |
| --- | --- | --- | --- |
| 回合資源 | V2 chapter `timeLimitRounds` 為 50；新增 `speedReward`，剩餘回合可換速度 points，並受副本上限控制 | 計算 spent／remaining rounds 與入帳 | 不可提供或修改數字 |
| 場景生命週期 | reference scene 使用 `defaultTransition`、`exitConditions`、`nextByLocation`、result-level `nextEvent` | 判定是否留場、是否轉場、轉往哪個事件 | 只描述已裁定局面 |
| 場景回合 | `referenceState.sceneTurnCount` 持久化；留場時累加，轉場時歸零 | 保存事件卡持續的回合數 | 依場景與行動規模調整敘事 |
| 威脅軌 | 0–7 格；0–6 為潛伏、追蹤、貼近，7 為接觸 | clamp、contact、pendingCombat、戰鬥後 discharge | 只能提出受限 threatAssessment |
| 自由輸入威脅 | AI 可提議 `relief_2`、`relief_1`、`stable`、`rise_1`、`rise_2`、`rise_3`、`immediate_combat` | 驗證 enum、場景 policy、固定條件並套用 delta | 提議 level 與理由；不合法即不採用 |
| 敘事規模 | `micro`、`normal`、`major`、`reveal`、`combat` | 依 scene phase 與 action scope 推導 token 上限 | 依指定規模寫敘事，不按 50 回合擴寫 |
| 終局結算 | speed points、quality score、overall score、固定 S/A/B/C/D 評價、版本化 `runSummary` | 由時間、節點、威脅、reference 狀態計算 | 不可輸出獎勵數字 |
| 結算頁 | 全頁 `scenario-settlement-screen` 顯示結局、評價、速度、品質、威脅、XP、NPC、樣本與感染 | 由 server `runSummary` 提供資料 | 不參與評價數值 |
| 主神空間 | 結算返回既有白色平台；首次接管有一次性劇情 overlay；refresh 可重現結算頁 | 保存 session、結算狀態與返回路徑 | 首次劇情採固定演出，不增加每次 hub API 成本 |
| Free action contract | unmatched free input 固定產生 `attempt_only`、`authorizedChanges=[]` 的 contract | 只由 engine 提供 outcome／scene／threat facts | 只能依 contract 寫嘗試、阻力、感官反應與不確定危險 |
| Narration safety | 對門、路徑、物品、位置、傷勢、威脅接觸、NPC authority、精確量做 deterministic scan | 不採用越界文本為世界真相；最多重寫一次，失敗則 engine-safe | 只替換 narration，不重算骰子／effects／threat／node／settlement |
| Godspace Phase A | `/api/godspace` 與 `/api/godspace/enter` 回傳 whitelist hub payload；aftercare 顯示 debrief／health／resources | lifecycle、owner、settled、combat、revival 與 action metadata 由 server 判定 | 前端只呈現與呼叫 server action，不自行計算 |
| LLM resilience | OpenAI-compatible request 有 `LLM_REQUEST_TIMEOUT_MS`，預設 90 秒、上限 300 秒 | timeout 轉成受控 LLM error，避免回合永久掛起 | 第三方端點無回應時不假裝成功 |

## Reference scene 轉場

`referenceAdapter.js` 不再把每一次成功套用都視為事件完成。休眠室 `evt_cryo_clearance` 暫時保留 `defaultTransition: "advance"`，因此既有開場流程仍能從偵察進入 Ash 場景；Ash、937、Ash 伏擊、超載與逃生場景則以 `stay` 為安全預設。

Ash 場景的普通交涉完成後，`sceneTurnCount` 會變成 1，`currentSceneId` 仍是 `evt_meet_ash`。只有玩家離開位置、觸發 Ash 伏擊旗標，或 result effects 明確指定 `nextEvent` 時才會切換。`nextByLocation` 讓 `loc_deck_a`、`loc_lower_deck`、`loc_engine`、`loc_narcissus_airlock` 等位置各自對應作者指定的下一事件，不再依 reference scene array 順序猜測。

V2 reference sidecar 現在包含 9 個場景、固定世界真相、NPC、道具、線索、場景 approach、分級結果、effects、轉場與 8 個結局。起始裝備包含 `item_desert_eagle` 與 `item_emergency_medkit`；下層可以取得焊槍，水仙號可以取得低溫冷卻噴霧，Ash 驚險射擊結果會同步加入可保存的 `item_xenomorph_tissue`。

## 七格威脅與戰鬥閘門

威脅軌上限由 `THREAT_MAX = 7` 統一控制，第 6 格仍是「貼近」，第 7 格是「接觸」。當 direct threat、判定結果或合法 AI assessment 讓軌道到達 7 時，turn API 會把 `pendingCombat` 寫入 scenario progress，回應 `combatRequired: true`，並拒絕玩家繼續普通敘事行動。`/api/combat/start` 使用 `scenarioPack.threatEncounter` 建立副本專屬追兵戰鬥，開戰後由 `dischargeThreatOnEncounter()` 將威脅回落並清除 pending 狀態。

`immediate_combat` 不會因 AI 任意輸出就成立。若場景沒有 `threatPolicy` 或固定條件，validator 會將該提議改為 `stable`；V2 只有作者指定旗標成立的場景才開放此級別。第四輪真實測試中，Gemini 的 threatAssessment level 曾不符合允許 enum，validator 正確拒絕提議並維持 `stable/delta=0`，沒有讓 AI 直接推進威脅或開戰。

## 結算與評價契約

`settlement.js` 的 server-side 函式維持以下責任：

| 函式 | 用途 |
| --- | --- |
| `deriveSpeedBonus()` | 從 `progress.timeBudget` 與副本 `speedReward` 計算剩餘回合與速度 points |
| `deriveQualityScore()` | 從完成節點、扭轉度、最終戰、937 證據、樣本與 NPC survived 狀態計算品質分數 |
| `buildRunSummary()` | 建立包含 scenario id／version、結局、目標節點總數、回合、威脅、NPC、樣本、感染、XP、speed／quality／overall 分數與評價的資料摘要 |
| `deriveEvaluation()` | 依固定品質門檻產生 S/A/B/C/D、評價名稱與說明，不接受 AI 或前端數字 |
| `settleScenario()` | XP 與速度 points 一次入帳，以 `progress.settledAt` 防止重複發放 |

V2 最終戰勝利後不會立刻結算。reference adapter 會先把狀態送到 `evt_hypersleep_return`，玩家仍可處理感染、樣本與生還者日誌；在 `flag_hypersleep_entered` 或死亡／逾時結局成立後才結算。這保留了「慢玩可以追求更高品質結局」的核心設計。

## AI 回合契約與本輪 prompt 修正

Reference mode 使用 `REFERENCE_TURN_RESPONSE_SCHEMA`，不再要求 AI 生成會被 adapter 丟棄的四個 options。AI 回覆可包含：

```json
{
  "st_thought": "玩家看不到的短摘要",
  "narration": "依已裁定事實寫出的敘事",
  "narrativeMode": "micro",
  "threatAssessment": {
    "level": "stable",
    "reason": "自由行動對威脅的短說明"
  }
}
```

`narrativeMode` 以引擎依 scene phase 與 action scope 推導的結果為準；AI 欄位不會改變 token policy。reference options 一律由 adapter 依目前 reference state 重建，前端傳回的 metadata 仍會再次查驗。

本輪針對 unmatched free input 增加了四層提示防護。`buildReferencePromptBlock()` 會明確標示「未命中任何 approach 的自由行動」，把引擎判定分級傳給模型，並說明本回合沒有新的 reference effect；`buildReferenceResponseSpec()` 與全域 `SYSTEM_INSTRUCTION` 加入「只能描寫嘗試、阻力、感官反應與不確定威脅」的例外；`buildPrompt()` 把同一限制放到最終 prompt 尾端；`buildThreatDirective()` 在自由輸入時要求依已裁定階段寫威脅，不要把追蹤誇寫成接觸或戰鬥。

`validateThreatAssessment()` 也會把模型空白 reason 正規化為可審計訊息。現在 `freeActionContract.js` 會把 unmatched action 固定成 `attempt_only`；`narrationGuard.js` 會攔截高風險完成式；`turn.js` 只在第一次 JSON parse 成功但 narration 越界時進行一次安全重寫，重寫仍不合格或無法解析時使用 engine-safe fallback。這些修改不會授權 AI 改變物品、旗標、位置、HP、結局、骰子、獎勵或 options；它們只替換展示文字，不重跑任何 authoritative engine。

## 驗證結果

截至本報告更新，工作樹的最新驗證如下：

| 驗證 | 結果 |
| --- | --- |
| `npm test` | **807 passed / 0 failed**（最新完整回歸） |
| `node validate_alien_v2.mjs` | 通過；5 nodes、9 scenes、117 result locations、8 endings、4 opening options、64 registered flags、reference bytes 90616 |
| `git diff --check` | 通過 |
| JavaScript `node --check` | `functions/api/turn.js`、`content/scenario/threat.js`、`content/gemini/promptContract.js`、`content/scenario/referenceAdapter.js`、`content/turnOptions.js` 與相關 V2 檔案通過 |
| V2 fixed LLM smoke | 通過；固定開場 → `app_cryo_recon` → Ash，Ash action 留在 `evt_meet_ash` |
| Free input prompt regression | 通過；實際 prompt 含 unmatched free input、引擎判定分級、禁止門／通道／物品等未授權改變的文字 |
| Free input threatAssessment smoke | 通過；`rise_2` 被引擎採用，options 仍全部由 reference 產生 |
| Threat directive regression | 通過；自由輸入覆寫不影響既有 0–7 威脅軌與副本風味文字 |
| Settlement tests | 通過；速度 points、品質／綜合分數、固定評價級別、節點總數與防重複入帳均有測試 |
| V2 full route tests | 通過；成功路線、最終戰後延後結算、死亡／感染結局、起始裝備、焊槍逃生與樣本來源均有測試 |
| Frontend visual checks | 已完成本地瀏覽器檢查；首次主神空間劇情、結算頁桌面版與返回主神空間流程可顯示 |
| 真實第三方 Gemini | 最後一輪 4 個邏輯回合共 6 次 LLM 呼叫，皆 HTTP 200、`ok=true`、`finishReason=stop`、未截斷；micro 一次重寫成功，major 一次重寫後仍越界而使用 engine-safe fallback |

## 真實 Gemini 測試結論

真實測試使用 custom OpenAI-compatible endpoint 與 `gemini-3-flash-preview`。低 token smoke 曾因 Gemini thinking 與 visible output 共用 completion budget 而回傳 `finish_reason=length`；提高上限後正常完成，V2 也改為依 micro／normal／major／reveal／combat 分流的 token policy。

最新驗證流程涵蓋固定開場、休眠室偵察、Ash 正常交涉、Ash micro unmatched free input 與 Ash major unmatched free input。固定開場不呼叫 LLM；4 個邏輯回合共 6 次真實 LLM 呼叫皆完成，Ash 聲線、金屬／污染感官描寫、場景連貫與 reference state 持久化均有可用表現。最後測試存檔 `historyLength=5`、`referenceActionCount=2`、目前事件仍為 `evt_meet_ash`、`sceneTurnCount=1`。

Gemini 原始回覆仍可能加入 reference 未提供的精確距離、額外門禁狀態、工具損壞、通道結構、異形位置或 NPC 特別指令。最後一輪中，micro 回合的高風險 NPC authority 主張被一次安全重寫修正；major 回合的 path-state 主張在重寫後仍未通過，因此伺服器採用 engine-safe fallback。這代表高風險原文不會直接進入玩家 history，也沒有改變 server authoritative state；但 deterministic guard 不可能理解所有文學語意，仍不能宣稱「每一句 AI 敘事都已完全受 reference 約束」。完整分析見 `REAL_GEMINI_V2_TEST_REPORT.md`。

本輪已完成第一版品質閘門：unmatched free input 產生 `attempt_only` contract；不合格 narration 只重寫一次；重寫仍不合格時使用 engine-safe fallback。最後一輪真實測試顯示 micro 回合重寫成功，major 回合因重寫仍含 path-state 主張而安全降級；這是保守且可審計的行為，但 fallback 文本較短，正式上線前仍應由產品決定安全性與文學密度的平衡。`observable_reaction` 與 `bounded_change` 仍不開放，且不擴張至排行榜、跨副本承接或 world memory。

## 主神空間與長期範圍

主神空間目前以結算回流、角色狀態、商店、存檔、首次固定劇情與 Phase A aftercare panel 為基礎。新增的 `/api/godspace` 與 `/api/godspace/enter` 只允許 server 判定可進入的狀態，`/api/rest` 也不再允許死亡角色以完全恢復繞過 `/api/revive`。長期規劃已另存於 `MAIN_GOD_SPACE_INTERACTION_ROADMAP.md`，分成三個階段：Phase A 完成單副本後的 debrief、狀態整理與合法再次進入；Phase B 在兩至三個副本穩定後加入受限任務板、訓練／休息、紀念櫃與結構化輪迴檔案；Phase C 在多玩家或多世界成熟後才考慮版本化排行榜、world delta persistence、社交與工坊。

排行榜、跨副本承接與 world memory 本輪沒有實作。可以保留未來資料欄位與版本欄位，但不讓它們現在參與 V2 結局、獎勵或主神裁定，也不在前端放出會讓玩家誤以為已經可用的入口。

## 工作樹與安全界線

本輪所有修改仍在 `/home/ubuntu/AI-TRPG` 工作樹中，新增／修改包含 `freeActionContract.js`、`narrationGuard.js`、`lifecycle.js`、`godspace/debrief.js`、`godspace/payload.js`、`functions/api/godspace.js`、`public/app.js`、`content/llm/client.js` 與 Phase A／安全測試。**沒有 commit、沒有 push、沒有部署、沒有替換舊預設副本**。`.dev.vars` 與 `REAL_GEMINI_V2_INTERACTION_RESULTS.json` 都不應提交；前者含秘密設定，後者含真實測試資料。正式啟用前仍應由專案作者審查 V2 reference 文字、人工遊玩完整路線、真實 Gemini 敘事、結算頁在不同結局下的顯示、`combatRequired` UX 與自由輸入敘事安全閘門。
