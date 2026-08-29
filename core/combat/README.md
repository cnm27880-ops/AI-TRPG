# 戰鬥系統

專案目前只有**一套**戰鬥系統：戰術戰鬥（程式碼路徑上仍寫 `v2/`，那是歷史命名——
它取代的舊系統已於 2026-08-29 移除，留著這個名字是為了不做一次純粹改名的大搬遷）。

| | 位置 |
|---|---|
| 規則核心 | `core/combat/v2/` |
| 內容與接線 | `content/combat/v2/` |
| 戰後結算 | `content/combat/finaleSettlement.js` |
| API | `POST /api/combat/v2/start`、`GET /api/combat/v2/state`、`POST /api/combat/v2/turn` |
| 存檔欄位 | `session.combatV2` |
| 前端 | `#combat-v2-panel`（`public/combatV2.js`） |

底下這一層是**兩套系統時期就共用**的規則書算術，戰術戰鬥直接用它，沒有另寫一份：
`core/dice.js`、`core/combat/attack.js`、`defense.js`、`armor.js`、`attackTypes.js`、
`resolveCombatAction.js`、`core/health.js`、`core/combat/turnOrder.js`。

## 戰鬥怎麼開始

**沒有手動的「遭遇戰鬥」按鈕。** 戰鬥由局勢觸發，前端在兩種情況下自動打 `/api/combat/v2/start`：

1. **迫近度到頂（接觸）** —— 威脅已經欺到臉前。這時候還要玩家自己去點一顆按鈕，
   等同於系統知道玩家被逮到了卻假裝沒事、繼續顯示敘事選項。
2. **主線推進到最終戰節點** —— 那場仗本來就是節點本身。

打誰**由伺服器依副本進度決定**，不是前端指定：最終戰節點掛的 `bossEncounter` >
迫近度到頂時副本自己的 `threatEncounter` > 內建的佔位遭遇。副本敵人樣板由
`content/combat/v2/encountersV2.js` 的 `enemyFromTemplate()` 轉成戰鬥要的形狀，
生命值與先攻由屬性推導（`core/derivedStats.js`），不要副本作者另外寫一個會走鐘的數字。

## 舊系統移除時，哪些東西沒有跟著消失

- **型態容器**（`content/shop/forms.js`）留著，但**不再碰動作額度**。舊版的
  `activateForm()` 收一個 budget 參數並自己扣，那份 boolean 額度模型跟計數池不相容；
  現在它只管資源（意志力／能量池）與期限，動作額度由 `core/combat/v2/actionBudget.js` 扣。
  `effect.activation.action` 仍然是資料的一部分——戰鬥系統讀它決定要扣哪一種動作。
- **武器表與攻擊參數轉接**從 `content/combat/placeholderEncounters.js` 搬到
  `content/combat/v2/weapons.js`，內容沒改。
- **最終戰結算**從 `functions/api/combat/act.js` 抽成 `content/combat/finaleSettlement.js`，
  行為逐字保留（包含全部六處「不靜音」的分支）。

## 舊資料的動作等級

商品型錄寫的是舊系統的六個動作等級，其中「自由」在這裡不存在。轉接表在
`core/combat/v2/actionTypes.js` 的 `LEGACY_ACTION_LEVEL_TO_V2`：**自由映成迅捷**，
不是映成零消耗（理由見該處註解）。這是暫時層——**戰鬥系統是基準，商品往它對齊**，
型錄改寫成直接用五類動作之後那張表可以刪掉。

## 測試

`test/combatV2*.test.js`。舊系統的測試（`actionEconomy` / `encounterState` / `combatTelegraph`）
隨程式碼一起移除；其中**驗的行為還在的那些被搬到 V2 測試檔，不是刪掉**——
`test/shopForms.test.js` 中段留了一段註解列出每一則搬去哪裡。
