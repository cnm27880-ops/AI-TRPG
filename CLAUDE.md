# CLAUDE.md

本專案的 AI 協作規則統一維護在 **[`AGENTS.md`](AGENTS.md)**，請先完整讀過那一份。
這裡不重複內容——同一條規則存兩份，兩份就會漂移。

## 開始寫程式之前必讀

- **[`AGENTS.md`](AGENTS.md)** —— 專案原則、不可協商的規則、開發流程、專案地圖
- **[`docs/PROMPT_CACHE_CONTRACT.md`](docs/PROMPT_CACHE_CONTRACT.md)** ——
  **任何**會進到 LLM 的文字都必須遵守的三層契約。
  由 `npm run lint:prompt-cache` 與 `test/promptCache.test.js` 強制執行。

## 一句話版本

LLM 請求永遠是三層，順序即變動頻率由低到高：
**static（`system`）→ history（只在尾端追加）→ dynamic（最後一個 `user` message）**。
新增提示時問自己：這段文字下一回合會不會不一樣？會 → 動態層；不會 → 靜態層；
判斷不出來就當成會變。

把靜態文字接在動態內容後面是最貴的錯誤，而且它不會讓任何測試變紅。

## 送出前

```bash
npm test && npm run lint:prompt-cache && npm run lint:workflows
```
