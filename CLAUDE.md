# CLAUDE.md
本專案為跑團/文字冒險遊戲（前端 SPA + Cloudflare Functions + LLM 敘事轉接）。

## 一、核心原則 (不可違背)
1. **AI 不做算術**：骰池、成功數、HP、傷害減免、XP 發放一律由程式碼計算，AI 僅依計算結果撰寫情境。
2. **六維十技能標準**：角色屬性為生理/心智/互動六維，不可混入 D&D 數值。
3. **UI 樣式鐵則**：畫面切換一律操作 `style.display`，禁止使用 Tailwind 的 `.hidden`。

## 二、Prompt 快取三層契約 (最貴的錯誤，嚴禁違背)
LLM 請求永遠是嚴格三層架構（變動頻率由低到高）：
**static (`system`) → history (僅尾端追加) → dynamic (最後一個 `user` message)**
- **判斷法則**：新增提示時問自己「這段文字下一回合會不會不一樣？」會 → 動態層；不會 → 靜態層。
- **嚴禁行為**：絕對不可將靜態文字接在動態內容後面，這會導致 Prefix Cache 徹底失效。

## 三、模組除錯導航 (查 Bug 優先路徑)
- **戰鬥、骰池、傷勢軌、衍生數值**：優先檢查 `core/` (`core/combat/v2/`, `core/health.js`)。
- **劇本推進、NPC 狀態機、迫近度軌**：優先檢查 `content/scenario/`。
- **主神兌換、型態變身、能量池**：優先檢查 `content/shop/`。
- **畫面按鈕、HUD 數值、DOM 操作**：優先檢查 `public/app.js`, `public/combatV2.js`。
- **後端 API 轉接與端點**：優先檢查 `functions/api/`。

## 四、驗收指令
修改代碼後，送出分支前務必在容器內確認通過：
```bash
npm test && npm run lint:prompt-cache && npm run lint:workflows
