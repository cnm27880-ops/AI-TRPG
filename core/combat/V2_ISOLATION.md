# Combat V2 與舊戰鬥流程的隔離說明

Combat V2（`core/combat/v2/`、`content/combat/v2/`、`functions/api/combat/v2/`）是一套
**全新**的戰術戰鬥系統，不是舊戰鬥介面的改版。舊的流程一行都沒有刪，理由與邊界如下。

## 兩條線各自是什麼

| | 舊戰鬥（V1） | Combat V2 |
|---|---|---|
| 狀態存在哪 | `session.combat` | `session.combatV2` |
| 狀態機 | `content/combat/encounterState.js` | `core/combat/v2/battleState.js` |
| 動作經濟 | `core/combat/actionEconomy.js` | `core/combat/v2/actionBudget.js` |
| API | `POST /api/combat/start`、`/api/combat/act`、`/api/combat/resolve` | `POST /api/combat/v2/start`、`GET /api/combat/v2/state`、`POST /api/combat/v2/turn` |
| 前端 | `#combat-panel`（`public/app.js`） | `#combat-v2-panel`（`public/combatV2.js`） |
| 距離 | 無（固定 `distance: 0`） | close / medium / far，server state |
| 敵人 | 單一，固定行為 | 多敵人，規則式 AI（`core/combat/v2/enemyTurn.js`） |
| 型態啟動 | `encounterState.resolveFormActivation()` | 行動目錄的一張卡（`content/combat/v2/formActions.js`） |
| 最終戰結算 | `content/combat/finaleSettlement.js`（共用） | 同左 |

兩者**共用**下層的規則引擎：`core/dice.js`、`core/combat/attack.js`、`defense.js`、
`armor.js`、`attackTypes.js`、`resolveCombatAction.js`、`core/health.js`、`core/combat/turnOrder.js`。
那一層是規則書的算術，沒有理由分岔——分岔才會讓「同一把槍在兩個模式裡傷害不一樣」。

同樣的理由，這兩塊也是共用的，不是各寫一份：

- `content/shop/forms.js`（型態容器）—— 兩邊用同一個 `activateForm()` / `payUpkeep()`，
  所以同一件商品在兩套戰鬥系統裡的成本、期限與到期條件完全一致。差別只在動作額度
  扣在哪個模型上：V1 傳自己的 boolean budget 進去，V2 傳 `null` 並自己扣計數池。
- `content/combat/finaleSettlement.js`（最終戰戰後結算）—— 打贏 boss 之後要結算節點、
  發獎勵點數、跑通關結算、封存劇情包。這件事跟哪一套引擎算出勝負完全無關，
  而它有六處會靜音失敗的分支（見 `test/silentFailures.test.js`），抄第二份遲早只有一份修對。

### 型態的動作等級

商品型錄寫的是舊戰鬥流程的六個動作等級，其中「自由」在 V2 不存在（規格第3節）。
轉接表在 `core/combat/v2/actionTypes.js` 的 `LEGACY_ACTION_LEVEL_TO_V2`：**自由映成迅捷**，
不是映成零消耗，理由見該處註解。這一層是暫時的——**戰鬥系統是基準，商品往它對齊**，
型錄改寫成直接使用 V2 的五類動作之後，那張表就可以整個刪掉。

## 被隔離、但沒有刪除的機制

Combat V2 規格第3節明令不採用玩家反應窗口。下列機制**仍然存在於舊模組**，
Combat V2 的任何檔案都沒有 import 它們：

- `core/combat/actionEconomy.js` 的 `useReflex()` / `reflexAvailable` / `swiftLostFromReflex`
  —— 反射動作（規則書的「可以在對方回合做出的動作」）。V2 不啟用。
- 同檔案的 `prepared`（準備動作，寫在檔頭註解裡的規則說明）與 `useFree()` —— V2 不啟用自由動作。
- 同檔案的 `startFocus()` / `stopFocus()` —— 專注效果。V2 不啟用。
~~- `content/combat/encounterState.js` 的 `resolveFormActivation()`（戰鬥中變身）~~
  **[2026-08-29 已接上]** 型態現在是 V2 行動目錄的「特殊能力」分類，見
  `content/combat/v2/formActions.js`。V2 沒有呼叫舊的 `resolveFormActivation()`——
  它直接用 `content/shop/forms.js` 的 `activateForm()`，並傳 `budget: null`
  讓那個函式跳過動作額度檢查（動作額度由 V2 自己的計數池扣）。舊模組因此一行都沒改。

要在 V2 啟用其中任何一項，正確的做法是在 `core/combat/v2/actionCatalog.js` 新增條目
並在 `resolveAction.js` 補結算函式，而不是去 import 舊模組——舊模組的 boolean 旗標形狀
跟 V2 的計數池模型不相容（規格第12節第6點）。

## 舊測試

`test/actionEconomy.test.js` 測的是舊的 boolean 旗標模型（含反射動作與自由動作），
`test/resolveCombatAction.test.js`、`test/encounterState.test.js` 測的是 V1 的流程。
它們**照舊全部通過**，不是「跟 V2 規格衝突的過時測試」——它們測的是另一套仍在使用的系統。
Combat V2 的測試獨立放在 `test/combatV2*.test.js`。
