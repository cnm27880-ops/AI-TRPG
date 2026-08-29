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

兩者**共用**下層的規則引擎：`core/dice.js`、`core/combat/attack.js`、`defense.js`、
`armor.js`、`attackTypes.js`、`resolveCombatAction.js`、`core/health.js`、`core/combat/turnOrder.js`。
那一層是規則書的算術，沒有理由分岔——分岔才會讓「同一把槍在兩個模式裡傷害不一樣」。

## 被隔離、但沒有刪除的機制

Combat V2 規格第3節明令不採用玩家反應窗口。下列機制**仍然存在於舊模組**，
Combat V2 的任何檔案都沒有 import 它們：

- `core/combat/actionEconomy.js` 的 `useReflex()` / `reflexAvailable` / `swiftLostFromReflex`
  —— 反射動作（規則書的「可以在對方回合做出的動作」）。V2 不啟用。
- 同檔案的 `prepared`（準備動作，寫在檔頭註解裡的規則說明）與 `useFree()` —— V2 不啟用自由動作。
- 同檔案的 `startFocus()` / `stopFocus()` —— 專注效果。V2 不啟用。
- `content/combat/encounterState.js` 的 `resolveFormActivation()`（戰鬥中變身）
  —— V2 的行動目錄目前沒有「特殊能力」分類的實際條目，型態系統尚未接進 V2 的
  action generator。這是**已知未完成項**，不是被移除的功能。

要在 V2 啟用其中任何一項，正確的做法是在 `core/combat/v2/actionCatalog.js` 新增條目
並在 `resolveAction.js` 補結算函式，而不是去 import 舊模組——舊模組的 boolean 旗標形狀
跟 V2 的計數池模型不相容（規格第12節第6點）。

## 舊測試

`test/actionEconomy.test.js` 測的是舊的 boolean 旗標模型（含反射動作與自由動作），
`test/resolveCombatAction.test.js`、`test/encounterState.test.js` 測的是 V1 的流程。
它們**照舊全部通過**，不是「跟 V2 規格衝突的過時測試」——它們測的是另一套仍在使用的系統。
Combat V2 的測試獨立放在 `test/combatV2*.test.js`。
