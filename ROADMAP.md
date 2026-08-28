# 主神空間與跨副本世界：現況與後續路線圖

這份文件整合了三份原本分散的規劃稿——`MAIN_GOD_SPACE_INTERACTION_ROADMAP.md`（主神空間互動藍圖）、
`CROSS_SCENARIO_PERSISTENT_WORLD_DESIGN.md`（跨副本持久世界設計）、
`V2_EXPLORATION_IMMERSION_AND_NPC_DISCOVERY_BLUEPRINT.md`（探索沉浸與 NPC 揭露藍圖）——三份文件寫於
2026-08-23，當時專案只有一個副本、探索系統尚未實作。這份文件保留三者仍然成立的設計原則與優先序，
並依 2026-08-28 的實際狀態重寫「已完成」與「還沒做」的清單，避免後續讀者把已經做完的事又規劃一次。

## 一、現況：三份原稿假設的前提，哪些已經改變

| 原稿假設 | 現在的狀態 |
|---|---|
| 只有一個副本（異形 V2），Phase B「兩至三個副本」還很遙遠 | 已有兩個副本：`scenario.nostromo-01-v2`、`scenario.jurassic-park-01-v1`，見 `content/scenario/registry.js` |
| 探索是 UI 裝飾，移動不是正式 action | `POST /api/travel` 是 server-authoritative action：地圖相鄰、旗標前置、路線風險、抵達文字全部由 server 裁定，見 `content/scenario/explorationState.js` |
| 玩家看不到自己在哪、地點沒有回訪變化 | `buildExplorationView()` 提供目前位置、已知地點、鄰近路線與回訪變體（`revisitVariants`），兩個副本都已授權 |
| 結算沒有輸出可承接的世界變更資料 | 兩個副本的每個結局都已經有 `worldDelta`／`npcDeltas`／`memorySeeds`／`unresolvedThreads`／`crossScenarioExportTemplate`（對應 CROSS_SCENARIO 設計的「第一步」），見各自的 `endings[]` |
| NPC 好感度只是一個數字 | `npcTrust` 已經有分級標籤（觀望／信任／緊密…），但仍是單一數值，不是多軸模型 |
| NPC 檔案揭露層級只是提案 | **仍是提案**：`reference.npcs[].exposureStages` 已經被兩個副本的 reference 寫了資料，但目前沒有任何程式碼讀取它——這是本文件目前最優先的落地缺口，見下面 P0 |

## 二、已完成，不要重新規劃

- 文字按鈕地圖、目前位置／事件標籤固定顯示、地點回訪變體、探索紀錄（`recentDiscoveries`）與未解問題追蹤（`unresolvedQuestions`）——見 `content/scenario/referenceAdapter.js`、`explorationState.js`。
- NPC public／private 資訊分層：`publicNpcRoster()` 只回傳 id／name／role／status／trust，`knowledge.secret`、`privateGoals`、`gmTruth` 不進玩家可見的 response 或無條件 prompt。
- 正式 travel action 與移動代價：見上表。
- 主神空間 Phase A：`GET /api/godspace`、`POST /api/godspace/enter`、`content/godspace/debrief.js` 的白名單 payload、`#portal-aftercare-panel`。細節見 `ARCHITECTURE.md` 對應章節。
- 副本結算輸出可承接的世界變更資料形狀（`worldDelta`／`npcDeltas`／`memorySeeds`）：兩個副本都已經寫了，但**還沒有任何下一個副本去讀它**——這是跨副本承接四步驟裡唯一做完的「第一步」，第二步以後仍是空的。

## 三、還沒做的，依優先級排列

### P0：把已經寫好但沒人讀的資料接起來

1. **NPC exposureStages 沒有消費端。** 兩個副本的 reference 都花力氣寫了 `surface／suspicious／confirmed` 三階層的揭露條件，但 `referenceAdapter.js`、`narrativePackageAdapter.js` 都沒有讀取它——NPC 揭露層級目前完全不影響任何 prompt 或 response。要嘛把它接進 `buildNarrativeNpcPromptBlock()`（依旗標選擇要不要把某個 stage 的內容送進 prompt），要嘛承認短期不做、把欄位從新副本的 authoring 標準裡拿掉，不要繼續生產沒人讀的資料。
2. **跨副本承接的第二步：讀取有限的 world facts。** 目前的 `worldDelta` 只是寫進結算結果、不會被任何東西讀回來。先只支援五到十個穩定欄位（不要一次讀完整 event log），讓後續副本可以在開場宣告「我接受哪些 delta 鍵」。
3. **跨副本承接的第三步：NPC memory seed。** 結局已經在寫 `memorySeeds`，但沒有下一個副本可以讀。先支援三種來源：親眼見證、從可信任角色聽說、從公開紀錄／傳聞得知；每條都要有 `npcId`、`subject`、`fact`、`source`、`confidence`。

### P1：讓好感度與揭露感覺像關係，不是分數

4. NPC 好感度改成多軸或至少多一層（例如 fear／respect／dependency 其中一到兩軸），不要一次做完整三軸——先驗證一軸能不能穩定影響語氣與協助程度。
5. 感知差異與不可靠資訊：低感知或特定判定失敗時，玩家看到的線索描述可以有意無意地不準確，而不是永遠給出正確答案的摘要。

### P2：主神空間 Phase B（等第三個副本穩定後再開始）

6. **受限主神任務板**：列出已解鎖的下一個副本／訓練／特殊挑戰，前置條件、風險與資源消耗都由 server 定義；AI 只能在「已解鎖」的任務上生成低頻氣氛宣告，不能創造新的任務條件或獎勵。
7. **訓練與休息經濟**：先只做「短休」與「完整恢復」兩種清楚行動，時間／點數／恢復上限都由 server 重算，不做無限刷點。
8. **紀念櫃**：只保存玩家明確帶出的結構化成果（實體記錄、權限卡、樣本、結局徽記、NPC 證詞），不宣稱能自動影響尚未設計的副本。
9. **輪迴檔案**：保存每次 `runSummary`、角色版本、主要結局、評價與事件日誌摘要——只是「我確實走過這一場」的紀錄，不是給 AI 推導新世界狀態的素材。

### P3：主神空間 Phase C（多副本、多版本、多人都成熟後才開始）

10. **版本化排行榜**：必須同時存 `scenarioId`、`scenarioVersion`、規則版本、角色版本、是否使用允許的輔助功能，並區分速度榜／品質榜／綜合評價，否則規則調整後新舊玩家的紀錄會混在一起失去公信力。
11. **完整跨副本 delta 系統**：每個副本版本聲明自己輸出與接受的 delta schema，每條 delta 都要有來源、版本、見證條件與衝突處理規則——不能只是「玩家讓某艘船變得更危險」這種模糊旗標。
12. **社交與工坊**：玩家創作副本需要 schema validator、內容審核、版本鎖定與資料隔離，不是多接一個 AI prompt 就能做完。

## 四、主神人格與 AI 使用的邊界（原則不變，持續適用）

主神的人格不靠每次進入 hub 呼叫 LLM 維持——那會增加成本、拖慢等待，也讓「主神說了什麼」變成不可預期的內容。
第一版原則是**固定狀態文案＋少量事件模板**：首次接管、結算封存、傷勢未恢復、解鎖新副本、進入副本前確認，全
部由狀態欄位選固定語句。如果之後要用 LLM，只用在低頻的「系統宣告」（首次接管、首次特殊結局、首次感染狀態等），
每次生成都要附結構化 facts，結果只能是展示文字，不能回寫規則、物品、狀態或任務內容。

## 五、四個反模式（持續適用，任何新功能上線前先自問有沒有踩到）

1. **把主神空間做成「AI 什麼都能說」的房間。** 只要主神能自由回答，玩家很快會用話術要求送獎勵、改傷勢、提前
   透露答案，這與 reference／engine 裁定的分工直接衝突。
2. **把整份自然語言歷史當成 world memory。** 敘事文字裡有 AI 自己的誤寫、玩家的自我宣稱、未成功的嘗試——這些
   只能留作回顧文本，不能自動變成下一個副本的世界真相。
3. **先做漂亮入口，不處理狀態邊界。** 結算頁看起來能重來但角色仍有死亡閘門、商店顯示物品但購買沒寫進事件
   日誌、返回 hub 看不到上一場結局、refresh 後劇情重播——這些都比新增一句主神台詞更值得優先修。
4. **用主神人格掩蓋規則不清楚。** 玩家不知道為什麼不能進下一副本時，應該顯示前置條件與缺少的欄位，而不是
   讓主神用神秘語氣搪塞。神秘感只能包裝已確定的規則，不能取代規則。

## 六、下一步實際建議

按 P0 → P1 → P2 → P3 的順序做，P0 尤其優先：那三項都是「資料已經寫好、只差接線」的低成本高價值工作，不需要
新設計就能讓 reference 裡已經存在的內容真正發揮作用。P2、P3 在啟動前都要先確認：內容版本、資料 schema 與結算
規則是否已經在多個副本上驗證穩定，而不是先做系統再找副本填內容。
