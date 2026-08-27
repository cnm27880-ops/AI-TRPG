# AI敘事供應商設定

這份文件說明「怎麼把敘事用的AI換成你想要的那一家」。
規則運算完全不經過AI（見 `ARCHITECTURE.md` 最高原則第1條），所以換供應商**不會影響遊戲的正確性**，
只會影響敘事文字的品質與風格。

## 先講結論：你該選哪個

| 情況 | 建議 | 要不要申請金鑰 |
|---|---|---|
| 想先用免費 provider 跑公開測試 | **Groq** | 要，Free Plan；依模型有 RPM/RPD/TPM/TPD 限制 |
| 不想管理任何第三方金鑰 | **Cloudflare Workers AI** | 不用，靠 `wrangler.toml` 的 `[ai] binding` 與 Cloudflare allocation |
| 想要中文敘事品質與免費額度的折衷 | **SiliconFlow** | 要；免費模型與限流依帳戶當下資料 |
| 想要另一個官方 hosted 模型候補 | **NVIDIA NIM** | 要，Developer Program；模型與 RPM 依帳戶 |
| 想要另一個官方免費候補 | **Mistral Free mode** | 要；每月 included usage 與 limits 依帳戶 |
| 要正式玩，想要較高品質模型 | **Gemini** | 要；API 額度與 Cloud Billing 另計 |
| 想用中文推理能力強的付費模型 | **DeepSeek** | 要，付費 |
| 想一把金鑰試很多模型 / 想用免費模型 | **OpenRouter** | 要，有免費模型，但目前不作預設首選 |
| 你已經有慣用的第三方中轉接口 | **custom** | 依該服務 |

**什麼都不設定但有 `[ai] binding` 的話，程式會使用 Cloudflare Workers AI**；如果同時設了 Groq key，則會先用 Groq。
目前 server-managed fallback 的免費優先順序是：**Groq → Cloudflare Workers AI → SiliconFlow → NVIDIA NIM → Mistral**。
未設定 `LLM_FALLBACK_PROVIDERS` 時，沒有配置 key／binding 的 provider 會自動跳過。

## 關於「網路上的免費／公益 API」

你問到能不能找一個網路上的公益API當預設。我查了一輪，這裡老實說明我的判斷：

**我沒有把任何「免金鑰的公共代理」設成預設**，理由有三個，都不是小問題：

1. **會無預警消失。** 這類服務通常是個人架的，關掉不會通知任何人。你的遊戲會在某天突然壞掉，
   而且錯誤訊息會很難懂。
2. **來源不明的金鑰池。** 相當一部分「免費免key」的接口，背後是轉發別人的付費金鑰（有些是外洩的）。
   用它等於把你的專案建立在一個隨時可能被封的、而且來源可疑的基礎上。
3. **隱私。** 玩家輸入的所有行動描述、角色卡內容都會送到那個伺服器。你不知道對方留不留log。

真正「免費而且正當」的選項是**各家官方的免費額度**，那需要你自己申請一把金鑰（免費），
或者用 **Cloudflare Workers AI**——它用的是你自己Cloudflare帳號的免費額度，
不需要額外申請金鑰，也不經過任何第三方。所以我把它設成預設。

查證當下（2026-08-27）值得列入 server fallback 的正當選項：

- **Groq** —— 官方 Free Plan，依模型與帳戶有 RPM／RPD／TPM／TPD 限制；官方會在 429 回應提供 `retry-after` 與 rate-limit headers。Groq 使用 OpenAI-compatible endpoint，適合低延遲候補（[rate limits](https://console.groq.com/docs/rate-limits)）。
- **Cloudflare Workers AI** —— 使用 `[ai] binding`，不需第三方 API key；免費 allocation 與 Neurons 計費依 Cloudflare 方案而變。現在的 registry 預設使用 `@cf/qwen/qwen3-30b-a3b-fp8`，model catalog 會變動（[pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)、[models](https://developers.cloudflare.com/workers-ai/models/)）。
- **SiliconFlow** —— 免費模型費用為 0，免費模型有固定限流；實際免費 slug、帳戶條件與 JSON 支援要以帳戶當下頁面確認（[rate limits](https://docs.siliconflow.com/en/userguide/rate-limits/rate-limit-and-upgradation)）。
- **NVIDIA NIM** —— NVIDIA Developer Program 提供 hosted NIM 原型使用；RPM、credits 與模型可用性依帳戶與模型變動，適合內部測試或第二順位候補（[build.nvidia.com](https://build.nvidia.com/)）。
- **Mistral Free mode** —— Free mode 有每月 included usage，實際可用模型與 limits 以 Admin Panel 顯示為準；適合低流量候補（[usage limits](https://docs.mistral.ai/admin/billing-usage/usage-limits)）。
- **Google Gemini** —— API 有獨立 model-specific Free Tier；AI Pro 會員主要提高 AI Studio 介面權益，不等於 API quota。若啟用 Cloud Billing，應搭配 application hard stop（[pricing](https://ai.google.dev/gemini-api/docs/pricing)、[Google AI plans](https://ai.google.dev/gemini-api/docs/google-ai-plans)）。
- **OpenRouter** —— 有一批 `:free` 結尾模型，但 slug 會輪替且目前線上曾遇到 429；保留作最後候補，不當唯一 production provider（[models](https://openrouter.ai/models)）。

## 怎麼設定

供應商完全由環境變數決定，**不需要改任何程式碼**。

### 環境變數一覽

| 變數 | 用途 |
|---|---|
| `LLM_PROVIDER` | `groq` / `workers-ai` / `siliconflow` / `nvidia` / `mistral` / `gemini` / `deepseek` / `openrouter` / `custom`。不設就依 server 優先序自動偵測 |
| `LLM_MODEL` | 覆寫模型名稱 |
| `LLM_BASE_URL` | 第三方中轉接口的網址（要含 `/v1`，不要含 `/chat/completions`） |
| `LLM_API_KEY` | 通用金鑰欄位（`custom` 用這個） |
| `GEMINI_API_KEY` | Gemini 金鑰 |
| `DEEPSEEK_API_KEY` | DeepSeek 金鑰 |
| `GROQ_API_KEY` | Groq API 金鑰 |
| `SILICONFLOW_API_KEY` | SiliconFlow 硅基流動 金鑰（也吃舊名 `SiliconFlow_API_KEY`） |
| `NVIDIA_API_KEY` | NVIDIA NIM (build.nvidia.com) 金鑰 |
| `MISTRAL_API_KEY` | Mistral API 金鑰 |
| `OPENROUTER_API_KEY` | OpenRouter 金鑰（也吃舊名 `API_KEY`） |
| `LLM_FALLBACK_PROVIDERS` | server fallback 順序，例如 `groq=openai/gpt-oss-120b,workers-ai=@cf/qwen/qwen3-30b-a3b-fp8`；不設則使用免費優先序 |
| `LLM_ALLOW_PAID_FALLBACK` | 必須明確設為 `true` 才允許 Gemini／DeepSeek／OpenRouter 自動加入 fallback；預設不允許 |
| `LLM_MAX_TOKENS` | 輸出長度上限，預設 2048。**不要調到 1000 以下**，原因見下方 |
| `NARRATIVE_STYLE` | 文筆設定檔名稱：`白描`（預設）/`標準`/`恐怖懸疑`/`冷硬寫實`/`電影感` |
| `NARRATOR_PERSONA` | 敘事者人格面具：`RUTHLESS_JUDGE`（預設）/`GENTLE_GOD`/`PANIC_SURVIVOR` |

> **為什麼 `LLM_MAX_TOKENS` 不能調小**：每一回合要模型輸出「敘事 + 4個選項」的完整 JSON。
> 上限太低時，模型會在寫完敘事、還沒開始寫 `options` 的地方被切斷，於是 JSON 解析失敗、
> 選項整組退回通用保底選項——畫面上看起來就是「每一輪的四個選項一字不差」。
> 這不是假設：2026-08-16 線上實測時，Workers AI 沒指定 max_tokens 的預設值是 256，
> 中文又特別吃 token，敘事寫到 100 字出頭就被切斷，每一輪都吃保底選項。

自動偵測的順序是：`LLM_PROVIDER` → Groq key → Workers AI binding → SiliconFlow／NVIDIA／Mistral／Gemini／DeepSeek／OpenRouter key → custom → 報錯。
未帶 `provider` 的 server-managed `/api/turn` 與允許 server LLM 的 `/api/narrate` 會使用 fallback chain；玩家在前端明確選 provider 並帶 BYOK 時，仍然只呼叫該 provider，不會混用 server chain。
**任何情況下都不會偷偷產生假的敘事文字**，失敗就是明確報錯。

### Server fallback chain

Fallback 只套用在 server-managed request。第一家 provider 遇到 429、timeout、暫時性 5xx、Workers AI binding failure 或 response shape failure 時，才會依序嘗試下一家；401、403、400、404、SSRF block 與設定錯誤不會自動跳過，避免把錯誤金鑰或錯誤模型名掩蓋掉。

預設只允許免費／平台既有額度 provider 自動加入。Gemini、DeepSeek、OpenRouter 被標記為可能產生付費用量，必須明確設定 `LLM_ALLOW_PAID_FALLBACK=true` 才能進入自動 fallback。`custom` 永遠不能放進 fallback chain。

最簡設定如下：

```bash
LLM_PROVIDER=groq
LLM_FALLBACK_PROVIDERS=groq,workers-ai,siliconflow,nvidia,mistral
LLM_ALLOW_PAID_FALLBACK=false
```

如果需要固定每一家候補模型，可寫成 `provider=model`；fallback 的模型不會沿用主 provider 的 `LLM_MODEL`：

```bash
LLM_PROVIDER=groq
LLM_MODEL=openai/gpt-oss-120b
LLM_FALLBACK_PROVIDERS=workers-ai=@cf/qwen/qwen3-30b-a3b-fp8,siliconflow=Qwen/Qwen3-30B-A3B-Instruct,nvidia=meta/llama-3.3-70b-instruct,mistral=mistral-small-latest
```

若你確實接受付費候補，才加入：

```bash
LLM_ALLOW_PAID_FALLBACK=true
LLM_FALLBACK_PROVIDERS=groq,workers-ai,siliconflow,nvidia,mistral,gemini=gemini-3.7-flash,deepseek=deepseek-v4-flash
```

Fallback 不會重新擲骰、重新套用 NPC policy 或改變 canonical state。`/api/turn` 仍先完成規則層，只有敘事 provider 失敗時才切換；所有 provider 都失敗時沿用現有 `pendingTurn`，`retryPending` 不會重算規則層。

### 玩家自己在遊戲裡覆寫（「系統與文筆設定」）

除了上面的環境變數，玩家也可以在遊戲畫面右上的「系統與文筆設定」裡自己選供應商、
填自己的金鑰。這條路徑的優先序高於伺服器端的環境變數（見 `content/llm/providers.js`
的 `resolveProvider()`）。金鑰只存在玩家瀏覽器的 localStorage，只在送出回合時隨該次請求帶上。

| 供應商 | 金鑰 | Base URL | 模型 |
|---|---|---|---|
| Groq | 必填 | 內建 | 選填（留空用預設） |
| Google Gemini | 必填 | 內建 | 選填（留空用預設） |
| DeepSeek | 必填 | 內建 | 選填 |
| SiliconFlow 硅基流動 | 必填 | 內建 | 選填（免費模型 slug 會輪替，建議自己填） |
| NVIDIA NIM | 必填 | 內建 | 選填 |
| Mistral | 必填 | 內建 | 選填（留空用預設） |
| OpenRouter | 必填 | 內建 | 選填（有預設值，但 `:free` 的 slug 常變動，收到 404 就自己填一個） |
| Cloudflare Workers AI | 不需要 | 不適用 | 選填 |
| 自訂（相容OpenAI） | 必填 | **必填** | **必填** |

「自訂」涵蓋沒有共用網址、或不在上面清單裡的服務：Azure OpenAI（每個人的資源名稱不同）、
Cohere、AI21、自架的 vLLM / LiteLLM 等，只要它是 OpenAI 相容格式就能用，**後端不需要為它多寫任何整合邏輯**。

必填欄位沒填時，前端在送出前就會擋下並指名缺什麼（`public/index.html` 的 `saveSettings()`
與 `public/app.js` 的 `buildLlmOverrides()`），後端 `functions/api/turn.js` 另有同一道檢查當最後防線。
這是刻意的：舊版會讓「選了供應商但沒填金鑰」的半設定請求送到後端，然後偷偷改用伺服器自己的金鑰
——玩家以為在用自己選的那一家，其實不是。

### LLM 失敗時要去哪裡看

敘事層失敗**不會**被靜默轉成保底內容，而是留下三種痕跡：

| 痕跡 | 在哪裡看 | 代表什麼 |
|---|---|---|
| `[LLM_FAILURE]` | `npx wrangler pages deployment tail` | 呼叫直接失敗。帶 provider / model / stage / HTTP狀態碼 / 供應商回應本文 |
| `[LLM_DEGRADED]` | 同上 | 呼叫成功但內容不能用，選項被通用保底選項墊掉 |
| `SYSTEM.FALLBACK` 黃色提示 + 選項上的「保底」標籤 | 遊戲畫面 | 同上，給玩家/測試者看的版本 |

`stage` 的意思：`config` = 設定問題（金鑰／Base URL／模型沒填，重試沒有用）、
`http` = 供應商回了錯誤狀態碼（401金鑰無效／402額度用盡／429太頻繁）、
`shape` = 回應格式不符（第三方中轉其實沒完全相容）、`binding` = Workers AI binding 的問題（常見是模型被下架）。

### 設定金鑰（部署到 Cloudflare）

金鑰**絕對不能**寫進 `wrangler.toml`、`public/` 底下任何檔案、或任何會被commit的地方：

```bash
# 依你實際啟用的 provider 設定；每一行只需執行一次，絕對不要提交 secret 值
npx wrangler pages secret put GROQ_API_KEY --project-name=wxh-engine
npx wrangler pages secret put SILICONFLOW_API_KEY --project-name=wxh-engine
npx wrangler pages secret put NVIDIA_API_KEY --project-name=wxh-engine
npx wrangler pages secret put MISTRAL_API_KEY --project-name=wxh-engine
npx wrangler pages secret put GEMINI_API_KEY --project-name=wxh-engine
npx wrangler pages secret put DEEPSEEK_API_KEY --project-name=wxh-engine
npx wrangler pages secret put OPENROUTER_API_KEY --project-name=wxh-engine
```

非機密的設定（模型名稱、文筆）可以直接放在 Cloudflare Dashboard 的環境變數，或用 `[vars]`。

### 把某一家設成「整個網站的預設」

想讓所有玩家不用自己填金鑰就能玩，就在部署環境設定 server provider。公開測試建議先用 Groq：

```bash
# 金鑰用 secret，不會出現在程式碼、也不會被送到瀏覽器
npx wrangler pages secret put GROQ_API_KEY --project-name=wxh-engine
# 以下是非機密設定，可放 Cloudflare Dashboard environment variables 或 [vars]
LLM_PROVIDER=groq
LLM_MODEL=openai/gpt-oss-120b
LLM_FALLBACK_PROVIDERS=groq,workers-ai,siliconflow,nvidia,mistral
LLM_ALLOW_PAID_FALLBACK=false
```

**金鑰只能放在伺服器端。** 這個專案的設計是：金鑰只在 `functions/api/*` 裡讀 `env`，
永遠不會出現在回應內容裡，也不會被寫進 `public/`。原因很直接——`public/` 底下的東西
會原封不動送到每一個訪客的瀏覽器，把金鑰寫在那裡等於公開它；commit 進 repo 也一樣，
就算之後刪掉，git 歷史裡還在。

**設成網站預設之後，所有訪客的回合都算在你的額度上。** 個人自己玩沒問題，
但如果網址會流出去，先確認你的日上限撐得住（見上面 SiliconFlow 那節的第 2 點）。
想讓玩家用自己的金鑰，就不要設 `LLM_PROVIDER`，讓他們在遊戲裡的「系統與文筆設定」自己選
——那條路徑的金鑰只存在他們自己的瀏覽器。

### 本機測試

在專案根目錄建 `.dev.vars`（**已經在 `.gitignore` 裡**，不會被commit）：

```
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的金鑰
LLM_MODEL=deepseek-v4-flash
NARRATIVE_STYLE=恐怖懸疑
```

然後 `npx wrangler pages dev`。

## 各供應商的查證資訊

以下是 **2026-08-27** 查官方文件當下的值。這類資訊（尤其模型名稱）變動頻率很高，
本專案的原則是「會變動的資訊不能杜撰成確定事實」，所以列出查證日期與出處，**部署前請自己再核對一次**。

### Groq（官方，OpenAI-compatible）

- 端點：`https://api.groq.com/openai/v1/chat/completions`
- 預設模型：`openai/gpt-oss-120b`
- 認證：`Authorization: Bearer <key>`
- Free Plan 的 RPM／RPD／TPM／TPD 依模型與帳戶顯示；官方 rate-limit headers 會提供剩餘額度與 `retry-after`。
- Structured Outputs 的 strict mode 目前支援部分 GPT-OSS 模型；本專案先使用既有 best-effort JSON schema，若模型不接受則沿用 schema fallback。
- 文件：https://console.groq.com/docs/rate-limits

```bash
LLM_PROVIDER=groq
GROQ_API_KEY=你的金鑰
LLM_MODEL=openai/gpt-oss-120b
```

### Gemini（官方）

- 端點：`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- 預設模型：`gemini-3.7-flash`
- 認證：`x-goog-api-key` header（不是 Bearer）
- 文件：https://ai.google.dev/gemini-api/docs/pricing

**關於 generateContent 被標為 legacy**：先前的交接文件警告過這件事，現在有確定的答案了。
Google 已把 Interactions API 列為 GA 並建議新專案採用，`generateContent` 標為 legacy，
但官方**明確聲明 generateContent 仍完整支援**，而且對「單次、無狀態、低延遲」的呼叫
（正好是本專案每回合敘事的形狀）建議就是繼續用 generateContent。

所以這裡**刻意不遷移**——遷移沒有實際好處，只有破壞既有測試的風險。
之後如果要用到需要狀態或工具呼叫的功能（例如讓AI自己查詢角色卡），那才是該遷移的時機。

### DeepSeek（官方）

- 端點：`https://api.deepseek.com/v1/chat/completions`（OpenAI相容）
- 模型：`deepseek-v4-flash`（預設）/ `deepseek-v4-pro`
- 認證：`Authorization: Bearer <key>`
- 文件：https://api-docs.deepseek.com/

### SiliconFlow 硅基流動（聚合，含免費模型）

- 端點：`https://api.siliconflow.com/v1/chat/completions`（OpenAI相容）
- 預設模型：`Qwen/Qwen3-30B-A3B-Instruct`
- 認證：`Authorization: Bearer <key>`
- 文件：https://docs.siliconflow.com/en/userguide/quickstart

```
LLM_PROVIDER=siliconflow
SILICONFLOW_API_KEY=你的金鑰
```

**三件部署前一定要自己確認的事：**

1. **`.com` 與 `.cn` 是兩個站，帳號與金鑰分開。** 程式預設用官方英文文件給的 `.com`。
   如果你的金鑰是在 `.cn` 站申請的，設 `LLM_BASE_URL=https://api.siliconflow.cn/v1`。
   用錯站別會拿到 **401**（金鑰無效），不是 404 —— 錯誤訊息不會告訴你是站別問題，很容易誤判成金鑰打錯。

2. **額度對單人遊戲來說綽綽有餘。** 2026-08-16 由主控台實際確認（不是第三方轉述）：
   免費模型的限流是 **500 RPM / 2,000,000 TPM**，而且 L0～L5 六個用量級別完全相同
   —— 官方文件說「免費模型的限流是固定的、付費模型才隨級別變動」，各級別相同正好佐證
   這是免費模型的頁面。**那張表沒有「每日請求數」這一欄。**

   換算成這個專案的實際用量：線上實測一個回合約 **4,300 tokens**（prompt 3,938 + completion 約 350），
   所以 TPM 的天花板約等於每分鐘 465 個回合，跟 500 RPM 幾乎落在同一個位置。
   人類一分鐘頂多玩幾個回合，等於有兩個數量級的餘裕。

   > 網路上有些第三方追蹤站寫「免費模型未儲值 50 次/日」，但主控台的限流頁沒有這一欄。
   > 如果你之後遇到跟次數有關的 429，再回主控台確認一次是不是有另外一層日配額。

3. **免費模型清單會輪替。** `Qwen/Qwen3-30B-A3B-Instruct` 是查證當下（2026-08-16）第三方追蹤站列出的常駐免費
   模型之一，官方沒有「保證永遠免費」的承諾。部署前對一次目前真的免費的 slug，要換設 `LLM_MODEL`。

**選模型時的注意事項**：官方的 [JSON schema 說明頁](https://docs.siliconflow.cn/en/userguide/guides/json-mode)
註明 **DeepSeek 的 R1 系列與 V3 不支援 JSON mode**。這個專案每回合都要模型輸出結構化 JSON，
選到那些模型會讓結構化輸出失效（程式會自動退回純 prompt 模式，遊戲照樣能玩，
但保底選項的觸發率會回升，見上面的「LLM 失敗時要去哪裡看」）。
同一頁官方自己也提醒「max_tokens 要設得夠大，避免 JSON 字串被截斷」——
本專案的 `LLM_MAX_TOKENS` 預設 2048 就是為了這件事。

### Mistral（官方 Free mode）

- 端點：`https://api.mistral.ai/v1/chat/completions`
- 預設模型：`mistral-small-latest`
- 認證：`Authorization: Bearer <key>`
- Free mode 有每月 included usage；實際 RPM／TPM 與可用模型以 Mistral Admin Panel 為準。
- 官方 chat endpoint 支援 `response_format` 的 JSON object／JSON schema 模式。
- 文件：https://docs.mistral.ai/admin/billing-usage/usage-limits

```bash
LLM_PROVIDER=mistral
MISTRAL_API_KEY=你的金鑰
LLM_MODEL=mistral-small-latest
```

### NVIDIA NIM（官方，build.nvidia.com）

- 端點：`https://integrate.api.nvidia.com/v1/chat/completions`（OpenAI相容）
- 預設模型：`meta/llama-3.3-70b-instruct`（推理/指令遵循較強，也可以換 `nvidia/mistral-nemotron`，
  官方特別強調它在agentic/function-calling/指令遵循上的表現）
- 認證：`Authorization: Bearer <key>`
- NVIDIA Developer Program 提供 hosted NIM 原型使用；目前不應把它描述成無總量上限。RPM、credits、可用模型與試用條件依帳戶／模型而變，部署前應從 build.nvidia.com 的模型頁與帳戶介面確認。
- 文件：https://build.nvidia.com/

```
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=你的金鑰
```

### OpenRouter（聚合）

- 端點：`https://openrouter.ai/api/v1/chat/completions`（OpenAI相容）
- 預設模型：`z-ai/glm-5.2:free`（2026-08-18 由使用者指定，2026-08-20 對過型錄確認當下存在）
- 文件：https://openrouter.ai/models

這裡原本**刻意不給預設模型**：免費模型的slug每週在變，寫死一個等於保證未來某天壞掉。
現在有預設值了，所以那個風險是真的存在的——收到 404／`No endpoints found` 這類錯誤時，
到 [models頁](https://openrouter.ai/models) 挑一個當下存在的，設 `LLM_MODEL` 即可（不用改程式碼）。

### Cloudflare Workers AI（免金鑰）

- 不走HTTP，走 `wrangler.toml` 的 `[ai] binding = "AI"`
- 預設模型：`@cf/qwen/qwen3-30b-a3b-fp8`
- Cloudflare 官方 model catalog 目前列出 Qwen3 30B A3B FP8，具有多語言、reasoning 與 function calling 能力；model catalog 會變動，部署前仍應在帳戶中實測。
- 文件：https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/

```bash
# wrangler.toml
[ai]
binding = "AI"

# 可選；模型名稱是非機密設定
LLM_PROVIDER=workers-ai
LLM_MODEL=@cf/qwen/qwen3-30b-a3b-fp8
```

Cloudflare Workers AI 的每日免費 allocation 與 Neurons 計費依方案而變；超過免費 allocation 後可能產生計費，不應把 `[ai] binding` 誤當成無限免費。


**注意**：這個binding只在Cloudflare上執行時存在。直接用瀏覽器開 `public/index.html` 是沒有的，
本機要用 `npx wrangler pages dev`。另外免費額度是「你的Cloudflare帳號」的額度，超過會需要升級。

Workers AI 的定位是「不需第三方 API key 就能先跑起來」，但它使用你的 Cloudflare allocation，並非無限免費；中文敘事品質要用本專案的 reference prompt 實測後再決定是否提升順位。

### custom（任意第三方／自架）

絕大多數第三方中轉接口都相容 OpenAI 格式，所以**不需要改程式碼**：

```
LLM_PROVIDER=custom
LLM_BASE_URL=https://你的中轉網域/v1
LLM_MODEL=你要用的模型名
LLM_API_KEY=你的金鑰
```

如果它其實沒有完全相容，程式會丟出一個明確指出這件事的錯誤訊息，而不是回傳空白敘事。

## 文筆設定檔

系統提示分成**兩層**（見 `content/narrativeStyle.js` 檔頭）：

- **規則契約層**（不可協商）：AI 不能重算數字、不能因玩家話術改變結果基調。
- **文筆層**（隨時可換）：怎麼寫、句子長短、禁用哪些詞。

組裝順序是「文筆 → 規則契約 → 優先序宣告」，所以模型讀到的最後一句永遠是
「以規則契約為準」。改文筆碰不到規則，這是結構上的保證。

| 設定檔 | 用途 |
|---|---|
| `白描`（預設） | 使用者自訂的文筆規範：長短句交錯、動詞驅動、狀態內嵌，並用大量黑名單清掉AI寫作的慣性套路 |
| `標準` | 中性基準線，用來對照 |
| `恐怖懸疑` | 貼近《無限恐怖》原作調性，感官壓迫 |
| `冷硬寫實` | 克制、去情緒化，適合戰鬥與潛入 |
| `電影感` | 鏡頭調度，適合重大轉折 |

切換方式有兩種：設 `NARRATIVE_STYLE` 環境變數（全域），
或在呼叫 `/api/turn` 時帶 `style` 欄位（單次，方便 A/B 對照）：

```bash
curl -X POST http://localhost:8788/api/turn \
  -H "content-type: application/json" \
  -d '{"character": {...}, "style": "冷硬寫實"}'
```

### 敘事者人格面具（persona）

文筆設定檔管「怎麼寫」（句子長短、修辭密度、禁用詞），人格面具管「**誰**在寫」。
兩者互相獨立，可以任意搭配：同一份白描規範，換一個面具讀起來就是另一個人在講這場輪迴。

| 面具 key | 是誰 |
|---|---|
| `RUTHLESS_JUDGE`（預設） | 主神的冷酷裁判：冷酷、簡練，永遠讓代價與死亡氣息被看見 |
| `GENTLE_GOD` | 溫柔的異界神明：旁觀者視角、悲憫、如詠嘆調 |
| `PANIC_SURVIVOR` | 崩潰的倖存者：神經質、急促，只看得見陰影與血 |

切換方式同樣兩種：`NARRATOR_PERSONA` 環境變數（全域），或呼叫時帶 `persona` 欄位：

```bash
curl -X POST http://localhost:8788/api/turn \
  -H "content-type: application/json" \
  -d '{"sessionId": "...", "persona": "PANIC_SURVIVOR"}'
```

面具跟文筆一樣屬於**文筆層**：它只影響語氣與取鏡，組進系統提示時仍然排在規則契約之前，
最後一句仍然是「以規則契約為準」（見 `content/narrativeStyle.js` 的 `buildStylePrompt`）。

### 兩個為了配合單人TRPG而做的調整

使用者提供的原始規範是寫給**小說**的，有兩處跟單人TRPG的形式衝突，已調整並記錄在此：

1. **人稱**：原規範是「潛入角色的第三視角」，已改為第二人稱「你」稱呼玩家角色
   （NPC 仍用名字）。理由：系統其他提示詞與前端「Player Intent」都建立在第二人稱上。
2. **內心獨白**：原規範要求「思考具象化」，但在單人TRPG裡**玩家角色的想法是玩家的權利**，
   AI 替他寫「亞倫決定衝上去」等於奪走主導權。已限定為：NPC 的心理活動盡情發揮，
   玩家角色只寫可觀察到的部分。

另外，原規範的「過度生理化」黑名單（胸腔起伏／生理性的…）跟通用守則原本寫的
「可以描寫生理反應（心跳加速、手在抖）」直接打架，已把通用守則改成不指定替代寫法，
兩層規範不再互相矛盾（`test/narrativeStyle.test.js` 有測試鎖住這件事）。

## 怎麼驗證真的接上了

部署後（或 `wrangler pages dev` 後）打一次：

```bash
curl -X POST http://localhost:8788/api/narrate \
  -H "content-type: application/json" \
  -d '{
    "character": {"attributes":{"敏捷":6},"skills":{"運動":2}},
    "playerAction": "我翻滾閃避撲過來的東西"
  }'
```

回傳裡會有 `provider` 與 `model` 兩個欄位，告訴你**實際上是誰在回應**；如果啟用了 fallback，這裡會是最後成功的 provider，而不是原本的 primary。

建議再用一個故意回傳 429 的測試 endpoint 或測試 fake fetch 驗證 fallback；不要為了測試而在 production 反覆消耗真實 API 額度。檢查 Cloudflare log 的 `[LLM_FALLBACK]` 與 `[LLM_FAILURE]`，公開 response 只會保留安全的 provider／model／stage 摘要。
