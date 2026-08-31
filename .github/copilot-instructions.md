# GitHub Copilot instructions

本專案的 AI 協作規則統一維護在 **[`AGENTS.md`](../AGENTS.md)**（不在這裡複製一份，避免漂移）。

動任何會進到 LLM 的文字之前，必讀 **[`docs/PROMPT_CACHE_CONTRACT.md`](../docs/PROMPT_CACHE_CONTRACT.md)**。

摘要：LLM 請求永遠是三層，順序即變動頻率由低到高——
**static（`system`）→ history（只在尾端追加的 user/assistant 訊息）→ dynamic（最後一個 user message）**。
新增提示時問：這段文字下一回合會不會不一樣？會 → 動態層；不會 → 靜態層；判斷不出來就當成會變。
把靜態文字接在動態內容後面（例如 `` `${prompt}${spec}` ``）是最貴的錯誤，
而且遊戲照跑、測試照過，只有帳單和 TTFT 會變差。

規則由 `npm run lint:prompt-cache`（CI 會跑）與 `test/promptCache.test.js` 強制執行。
