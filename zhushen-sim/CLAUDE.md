# CLAUDE.md（主神空間主管模擬器）

這個資料夾是獨立的新專案。**外層 AI-TRPG 的 CLAUDE.md 規則（六維十技能、Prompt 快取契約等）不適用於這裡**；外層的舊檔案不要動。

## 必讀
- 設計計畫：`docs/GAME_DESIGN_PLAN.md`（第 16 節是三個 Phase 的範圍，第 18 節是給你的原則）。
- 進度與「待確認的設計問題」：`README.md`。

## 原則
1. 照 Phase 順序做，一次只做一個 Phase；不要偷跑後面 Phase 的功能。
2. 數字一律放 `src/data/config.js`，內容（副本、標籤、事件）一律放 `src/data/` 的資料表，不要寫死在邏輯裡（之後要擴充到 171 個標籤、20 個副本）。
3. `src/engine/` 不可以碰 DOM、不可以用 `Math.random()`（一律用 `rng.js`，亂數狀態存在 state 裡，測試才能重現）。畫面上純裝飾的隨機（小人走位）可以用 `Math.random()`。
4. 引擎函式直接修改 state，用 `emit(state, type, text)` 寫日誌；畫面層依 `PAUSE_EVENTS` 決定是否自動暫停。新增會暫停的事件 → 在 `PAUSE_EVENTS` 加一行。
5. 計畫書沒寫或有歧義的地方：先填暫定值、列進 README「待確認」，並回報給使用者；不要當成 bug 直接改設計。
6. 零外部依賴（no dependencies）。

## Phase 2 的掛鉤（已預留）
- `engine/dungeon.js`：`relationBonus()`、`tagBonus()`、`rewardMultiplier()`（首次開荒、獎勵遞減接這裡；`state.dungeonStats` 已記錄 attempts / clears）。
- `engine/dispatch.js`：`areEnemies()`（「禁止仇恨／死敵同隊」開關已接好，只差關係資料）。
- 輪迴者物件已有 `tags: []`。

## 驗收
```bash
cd zhushen-sim && npm test
```
改畫面後用 `npm start` 開 http://localhost:5173 實際點一輪（派遣、抽卡、回收、自動派遣）。
