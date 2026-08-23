# 《異形：生化深淵》V2 真實第三方 Gemini 互動測試報告

**測試狀態：已完成多輪真實呼叫，但尚未達到可宣稱正式上線的敘事服從標準**
**測試日期：2026-08-23**
**測試目的：確認真實第三方 Gemini 能否經由 V2 `/api/session` 與 `/api/turn` 完成沉浸式敘事、reference state 持久化、自由輸入與威脅提議流程。**

## 一、測試環境與保密範圍

本次使用使用者提供的第三方 **custom OpenAI-compatible** endpoint，模型為 `gemini-3-flash-preview`。測試從專案的 custom provider 路徑進入，沿用 `/v1/chat/completions` 相容協定；沒有改成 Google 原生 Gemini protocol，也沒有要求玩家在前端填寫 API key。

API key 只存在本地權限為 600 的 `.dev.vars`，沒有寫入本報告、測試摘要、Git commit 或回覆內容。測試結果檔 `REAL_GEMINI_V2_INTERACTION_RESULTS.json` 只保留回合摘要與有限敘事內容，仍屬本地測試資料，不應提交至 repository。

## 二、測試歷程

測試先從最小文字 smoke 開始。第一次使用過低的輸出上限時，Gemini 在思考與可見輸出共同計算的 completion budget 內被截斷，回傳 `finish_reason=length`，導致 JSON 不完整並觸發既有的 AI fallback。將測試上限提高到 2048 後，最小 smoke 正常完成；V2 隨後改用依敘事規模分配的 token policy，而不是按 50 回合總數固定長度。

| 階段 | 使用方式 | 結果 |
|---|---|---|
| 初始 smoke | 過低 token 上限 | 被截斷，JSON 不完整；確認不是單純文筆問題 |
| smoke 修正 | 提高至 2048 token | 正常完成，`finishReason=stop` |
| V2 互動前三輪 | 開場、休眠室、Ash、unmatched／major free input | API 流程正常，主要回合均完成；發現 AI 會把合理的文學補充寫成未經 reference 授權的世界事實 |
| 第四輪重測 | V2 token policy＋JSON schema 模式 | 四次真實 LLM 回合皆 HTTP 200、`ok=true`、`finishReason=stop`；仍存在敘事越界，沒有宣稱問題已完全解決 |

目前 V2 的敘事 token policy 為 `micro=768`、`normal=1536`、`major=2304`、`reveal=3072`、`combat=2560`。這是依玩家行動規模分配的上限：開門或短觀察不需要長文，揭露與戰鬥才使用較大預算；50 回合本身不會使每回合都變成長篇呼叫。

## 三、第四輪實際互動結果

第四輪測試啟用 custom provider 的 JSON schema 模式，共完成四次實際 LLM 回合。固定開場仍由 authored opening 直接提供，因此不計入 LLM 呼叫；其後依序執行休眠室偵察、Ash 正常交涉、micro unmatched free input 與 major unmatched free input。

| 回合 | 引擎／敘事模式 | HTTP／完成狀態 | reference 狀態結果 | threatAssessment |
|---|---|---|---|---|
| 固定開場 | authored opening | 不呼叫 LLM | `evt_cryo_clearance`，威脅 0 | 無 |
| 休眠室偵察 | major | 200、`stop`、未截斷 | 進入 `evt_meet_ash`，威脅 1 | 無，固定 approach 不走 AI assessment |
| Ash 正常交涉 | normal | 200、`stop`、未截斷 | 仍在 `evt_meet_ash`，場景回合累加，威脅 2 | 無，固定 approach 的效果由 reference 決定 |
| Ash micro 自由輸入 | micro | 200、`stop`、未截斷 | reference scene 不變，威脅仍為 2 | 模型輸出不在允許 enum，伺服器拒絕並採用 stable |
| Ash major 自由輸入 | major | 200、`stop`、未截斷 | reference scene 不變，威脅仍為 2 | 模型輸出不在允許 enum，伺服器拒絕並採用 stable |

最後一份測試存檔摘要顯示 `historyLength=5`、`referenceActionCount=2`、目前事件仍是 `evt_meet_ash`、`sceneTurnCount=1`。這證明真實 Gemini 回合完成後，reference action、敘事 history 與 reference state 仍有被持久化，且 AI 沒有直接改變 options、物品、旗標、位置、結局或威脅數值。

## 四、確認到的沉浸優點

真實 Gemini 已經展現出適合本副本的聲線與場景感。它能將固定結果轉成冷、窄、帶有金屬與污染感的感官描寫；Ash 的說話方式大致維持平靜、機械化、缺少人類延遲的特徵；不同敘事模式也有可感知的長度差異。normal Ash 對話不再像最初低 token 測試那樣在半句中斷，micro 回合能維持短促壓力，major 回合則能讓玩家感到局勢正在收緊。

模型也能承接上一回合的場景、Ash 的存在、通風管異響與玩家行動意圖。就「讓固定 reference 結果有畫面」而言，真實第三方 Gemini 已經具備可用的初步品質。這也是保留 AI 演出層的理由：規則引擎不必自己寫長篇小說，而 Gemini 能為已裁定的結果提供聲音、節奏與感官密度。

## 五、仍存在的敘事越界

本次最重要的負面結果是：**Gemini 沒有因為收到更多禁止條款，就完全停止合理但未授權的擴寫。**第四輪在 prompt 已加入 reference block、response spec、全域契約、最終 prompt 尾端覆寫與 threat directive 保守覆寫後，模型仍曾把以下內容寫成確定事實：

| 類型 | 第四輪觀察 | 是否改變 server 真相 |
|---|---|---|
| 精確數字／距離 | 「三公尺」「幾公尺」「幾十公尺」等 reference 未提供的距離 | 沒有；只出現在 narration |
| 未授權門禁狀態 | 門已鎖死、退路已封閉、某道門成為唯一避難所 | 沒有；`referenceState` 未因此改變 |
| 未授權物品結果 | 玩家輸入「抓起工具」後，模型寫成特定撬棍／扳手損壞 | 沒有；inventory 沒有增加或移除對應物品 |
| 未授權通道結果 | 維修面板出現裂縫、通道不能容身、通路被封死等具體結構 | 沒有；位置與可用 approach 仍由 adapter 決定 |
| 未授權異形位置／接觸 | 異形落在門外、守在門口、已選定降落位置或直接逼近 | 沒有；威脅軌與 pendingCombat 仍由引擎控制 |
| 未授權 NPC／系統指令 | Ash 按下紅色撥桿、輸入特殊指令、宣告額外條款 | 沒有；除固定 reference result 外沒有新 effects |

這代表目前已達成的是「AI 不直接修改 authoritative state」，尚未達成「玩家看到的每一句敘事都完全只來自 authoritative facts」。兩者必須分開驗收。前者已由 adapter、server state、options 重建與威脅 validator 保護；後者仍需要更強的敘事安全層或受限自由行動合約。

另一個觀察是，Gemini 在兩個 unmatched free input 回合中回傳了不在允許 enum 的 threatAssessment level。validator 正確拒絕該提議，回傳 `accepted=false`、`level=stable`、`delta=0`，因此沒有讓模型任意把威脅推到戰鬥。這是規則安全性成功，但也說明真實模型未必會穩定遵守自由輸入的 assessment enum；目前 response 會保留拒絕原因供除錯。

## 六、本輪採取的修正

為降低自由輸入被寫成既成事實的機率，本輪做了以下最小修正：

第一，`referenceAdapter.js` 的 `buildReferencePromptBlock()` 現在會辨識 `resolution.mode === "unmatched"`，明確把該回合標成「未命中任何 approach 的自由行動」，並告知模型本回合只有一次嘗試與引擎判定，沒有新的 reference effect。它列出允許描寫的阻力、聲音、氣味、光線、NPC 可觀察反應與不確定威脅，也列出門、通道、物品、NPC 特殊指令、異形接觸、位置、傷勢與精確數字等禁區。

第二，`buildReferenceResponseSpec()` 與全域 `SYSTEM_INSTRUCTION` 都補上 free input 例外；`functions/api/turn.js` 另外把這段限制放到最終 prompt 尾端，讓它不容易被前情敘事、威脅階段或 major 一般規則蓋掉。major 的通用文字也改成「只有引擎已授權的狀態才可寫成實質改變」，不再暗示 major 必然要改變位置。

第三，`buildThreatDirective()` 在 unmatched free input 時增加保守覆寫，要求模型依目前已裁定的威脅階段描寫痕跡、聲音、方向與壓力，不要把追蹤誇寫成同一空間內的接觸或已發生戰鬥。`validateThreatAssessment()` 也會把空 reason 正規化成可審計訊息，而不是回傳空字串。

第四，新增 smoke regression 斷言，確認真正送到 LLM 的 prompt 具備「引擎本回合判定分級」「門已打開／鎖死」與「只能寫成這次嘗試的可觀察成功部分」等關鍵保護文字；並補上 threat directive 與空 reason 的單元測試。

## 七、結論與下一個品質閘門

真實第三方 Gemini 已經能穩定完成 V2 的基本互動，且提升 token policy 後，Ash 對話、micro 自由輸入與 major 自由輸入在本次四回合測試中都以 `finishReason=stop` 完成。這證明 custom OpenAI-compatible 連線、JSON schema 路徑、reference state 持久化與敘事規模分流可以一起工作。

但本次不能宣稱「Gemini 已完全遵守 reference」。它仍會把合理的小說細節寫成未由 reference 或 engine effect 授權的門禁、工具、距離、異形位置與 NPC 行動。因為這些文字雖然沒有改寫 server state，卻可能誤導玩家對當前可行動空間的理解，所以正式上線前仍應保留人工審讀或新增敘事安全檢查。

下一個品質閘門建議是：對 unmatched free input 先採用「受限自由行動裁定合約」，只授權 `attempt_only`、`observable_reaction`、`bounded_change` 等由 adapter 明確列出的有限結果；若模型輸出的敘事含有未授權的完成式狀態，則進行一次短重寫，仍不合格時改用不改變世界真相的安全敘事模板。這個閘門應先在《異形：生化深淵》V2 驗證，暫不擴張到排行榜、跨副本承接或 world memory。

目前測試結果檔位於 `REAL_GEMINI_V2_INTERACTION_RESULTS.json`，完整測試腳本位於 `test/runRealGeminiV2Interaction.mjs`。兩者都只適合本地 QA 使用，不應包含或接觸 API key。
