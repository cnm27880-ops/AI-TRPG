# AI敘事供應商設定

這份文件說明「怎麼把敘事用的AI換成你想要的那一家」。
規則運算完全不經過AI（見 `ARCHITECTURE.md` 最高原則第1條），所以換供應商**不會影響遊戲的正確性**，
只會影響敘事文字的品質與風格。

## 先講結論：你該選哪個

| 情況 | 建議 | 要不要申請金鑰 |
|---|---|---|
| 只想先把整條鏈路跑起來看看 | **Cloudflare Workers AI**（預設） | **不用**，靠 `wrangler.toml` 的 `[ai]` binding |
| 要正式玩，想要中文敘事品質好一點 | **Gemini** 免費層 | 要，但免費 |
| 想用中文推理能力強的模型 | **DeepSeek** | 要，付費 |
| 想一把金鑰試很多模型 / 想用免費模型 | **OpenRouter** | 要，有免費模型 |
| 你已經有慣用的第三方中轉接口 | **custom** | 依該服務 |

**什麼都不設定的話，程式會自動用 Cloudflare Workers AI**，因為它是唯一不需要申請任何東西的選項。

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

查證當下（2026-08-15）確認有免費額度的正當選項：

- **Cloudflare Workers AI** —— 每天 10,000 Neurons 免費（[定價頁](https://developers.cloudflare.com/workers-ai/platform/pricing/)）
- **Google Gemini** —— 多個 flash 系列模型在免費層可用（[定價頁](https://ai.google.dev/gemini-api/docs/pricing)）
- **OpenRouter** —— 有一批 `:free` 結尾的免費模型，但**slug每週在變**，要自己去 [models頁](https://openrouter.ai/models) 挑當下存在的

## 怎麼設定

供應商完全由環境變數決定，**不需要改任何程式碼**。

### 環境變數一覽

| 變數 | 用途 |
|---|---|
| `LLM_PROVIDER` | `gemini` / `deepseek` / `openrouter` / `workers-ai` / `custom`。不設就自動偵測 |
| `LLM_MODEL` | 覆寫模型名稱 |
| `LLM_BASE_URL` | 第三方中轉接口的網址（要含 `/v1`，不要含 `/chat/completions`） |
| `LLM_API_KEY` | 通用金鑰欄位（`custom` 用這個） |
| `GEMINI_API_KEY` | Gemini 金鑰 |
| `DEEPSEEK_API_KEY` | DeepSeek 金鑰 |
| `OPENROUTER_API_KEY` | OpenRouter 金鑰 |
| `NARRATIVE_STYLE` | 文筆設定檔名稱：`白描`（預設）/`標準`/`恐怖懸疑`/`冷硬寫實`/`電影感` |

自動偵測的順序是：`LLM_PROVIDER` → 有哪把金鑰 → 都沒有就用 Workers AI → 連binding都沒有才報錯。
**任何情況下都不會偷偷產生假的敘事文字**，失敗就是明確報錯。

### 設定金鑰（部署到 Cloudflare）

金鑰**絕對不能**寫進 `wrangler.toml` 或任何會被commit的檔案：

```bash
npx wrangler pages secret put DEEPSEEK_API_KEY --project-name=wxh-engine
```

非機密的設定（模型名稱、文筆）可以直接放在 Cloudflare Dashboard 的環境變數，或用 `[vars]`。

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

以下是 **2026-08-15** 查官方文件當下的值。這類資訊（尤其模型名稱）變動頻率很高，
本專案的原則是「會變動的資訊不能杜撰成確定事實」，所以列出查證日期與出處，**部署前請自己再核對一次**。

### Gemini（官方）

- 端點：`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- 預設模型：`gemini-3.6-flash`
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

### OpenRouter（聚合）

- 端點：`https://openrouter.ai/api/v1/chat/completions`（OpenAI相容）
- 模型：**沒有預設值**，必須自己設 `LLM_MODEL`
- 文件：https://openrouter.ai/models

程式刻意不給預設模型：免費模型的slug每週在變，寫死一個等於保證未來某天壞掉。
沒設 `LLM_MODEL` 時會直接報錯並告訴你要去哪裡挑。

### Cloudflare Workers AI（免金鑰）

- 不走HTTP，走 `wrangler.toml` 的 `[ai] binding = "AI"`
- 預設模型：`@cf/meta/llama-3.1-8b-instruct`
- 文件：https://developers.cloudflare.com/workers-ai/models/

**注意**：這個binding只在Cloudflare上執行時存在。直接用瀏覽器開 `public/index.html` 是沒有的，
本機要用 `npx wrangler pages dev`。另外免費額度是「你的Cloudflare帳號」的額度，超過會需要升級。

小模型的中文敘事品質明顯不如 Gemini/DeepSeek，它的定位是「不用申請任何東西就能先跑起來」，
真的要玩建議還是申請一把免費的 Gemini 金鑰。

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

回傳裡會有 `provider` 與 `model` 兩個欄位，告訴你**實際上是誰在回應**——
這是刻意加的，避免你以為在用 Gemini、其實一直退到 Workers AI 而不自知。
