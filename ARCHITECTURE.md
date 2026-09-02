# 無限恐怖 TRPG AI - 專案精簡地圖

## 最高原則
1. AI 不做算術（判定、成功數、HP、傷害減免均由程式碼計算）。
2. AI 敘事語氣必須與數值結果分級一致。
3. 數值系統一律有嚴格公式，不交由 AI 臨場發揮。

## 目錄與模組速查
- `core/`: 純運算引擎（Node/瀏覽器通用，不含 AI 呼叫）
  - `schema.js`: 屬性與人物卡骨架
  - `check.js`: 檢定與骰池
  - `health.js` & `deathAndRevival.js`: 生命傷勢軌 (B/L/A) 與復活
  - `combat/v2/`: 戰術戰鬥引擎 (actionBudget, resolveTurn, battleState 等)
  - `character.js`: 戰鬥資料模型與 Profile 轉接
- `content/`: 遊戲邏輯與內容包
  - `scenario/`: 劇本引擎 (threat 迫近度軌, repetition 套路遞減, referenceAdapter 世界真相裁定)
  - `chargen/`: 美德/惡德五題心理測驗、自動配點與甦醒流程
  - `shop/`: 主神兌換 (wallet 貨幣, catalog 貨架, forms 暫時型態, effects 效果詞彙)
  - `llm/` & `gemini/`: 多供應商 API 轉接 (Groq/SiliconFlow/Gemini/OpenAI 相容協議)
- `functions/api/`: Cloudflare Pages 後端 API 端點
  - `turn.js`: 每回合推進主接口
  - `narrate.js`: 呼叫 AI 產生文字
  - `combat/v2/turn.js`: 戰鬥回合結算
- `public/`: 前端介面
  - `index.html` & `app.js`: 主神空間白色平台 hub 與輪迴者手錶 HUD 控制
  - `combatV2.js`: 戰鬥介面專用渲染

> 詳細歷史決策與規則推導請見 `ARCHITECTURE_HISTORY.md`（已加入 .claudeignore）。
