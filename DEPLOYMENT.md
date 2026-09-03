# Cloudflare Pages 部署骨架 —— 使用說明

這份文件只涵蓋「怎麼把這個repo部署到Cloudflare Pages」，跟遊戲規則本身無關。
**這裡的設定檔跟API端點我沒辦法在這個沙盒環境裡實際跑過**(沒有Cloudflare帳號、沒有網路能連到
Cloudflare的部署服務)，所以以下步驟是照官方文件寫的骨架，你照著做的時候如果卡住，
最可能的原因是Cloudflare那邊的介面/指令又改版了——這是時效性資訊，請以你當下看到的
Cloudflare官方文件(https://developers.cloudflare.com/pages/)為準。

## 這個骨架目前有什麼

```
wrangler.toml              Cloudflare Pages的設定檔(靜態資源目錄、Node相容性flag)
package.json                npm專案設定，"test"跑單元測試，"deploy"是部署捷徑指令
public/index.html           前端UI(單頁)，這就是玩家會看到的畫面
public/app.js               前端應用層，負責渲染角色卡與呼叫下面這些API
functions/api/check.js      POST /api/check —— 呼叫 core/check.js 做一次判定
functions/api/narrate.js    POST /api/narrate —— 無存檔示範端點；BYOK 單一 provider 或受旗標控制的 server fallback
functions/api/turn.js       POST /api/turn —— server-authoritative 回合、規則層與 server fallback 敘事
functions/api/combat/resolve.js  POST /api/combat/resolve —— 呼叫 resolveCombatAction() 跑一次完整攻擊
```

這些 API 端點直接複用引擎與內容層的可重現測試；目前完整套件為 **1001 個案例**，**沒有因 LLM fallback 新增任何規則裁定**。規則、骰子、NPC cooperation、地圖與效果仍由 server-authoritative 程式碼決定，provider 只負責在規則層完成後生成敘事。

`public/` 就是 `wrangler.toml` 裡 `pages_build_output_dir` 指到的目錄——**網站只會發佈這個目錄
底下的檔案**，repo根目錄的規則書全文(`rules-2.35.txt`，15MB)與各種.md文件都不會被公開發佈。

## 部署前你需要準備

1. 一個Cloudflare帳號(免費方案就夠用，Pages的免費額度對個人專案通常足夠，但確切額度數字
   請你自己去 https://developers.cloudflare.com/pages/platform/limits/ 確認，這是會變動的資訊，
   我不確認記憶中的數字現在還準不準)。
2. 本機(你的Windows 11 PC)要有Node.js跟npm——你既有的開發環境應該已經有了，
   在PowerShell或終端機打 `node -v` 確認有裝就好。

## 詳細步驟

### 步驟1：把repo放到你自己的電腦上

如果這個repo是我幫你打包成zip檔送出的，先解壓縮到你想要的資料夾，例如
`C:\Users\你的使用者名稱\Projects\wxh_engine`。

### 步驟2：安裝專案依賴套件(wrangler)

打開終端機(PowerShell)，切換到專案資料夾，執行：

```powershell
cd C:\Users\你的使用者名稱\Projects\wxh_engine
npm install -D wrangler
```

這會抓最新版的wrangler(Cloudflare官方的部署工具)裝到這個專案裡，不會裝到系統全域，
好處是不用擔心版本跟你電腦上其他專案衝突。

### 步驟3：登入你的Cloudflare帳號

```powershell
npx wrangler login
```

這會打開瀏覽器讓你登入Cloudflare帳號並授權。如果你之前沒用過wrangler，這一步是必要的。

### 步驟4：先跑一次單元測試，確認引擎本身沒問題

```powershell
npm test
```

應該會看到 **1001 個測試全部通過**（`# pass 1001`、`# fail 0`）。如果這裡就失敗了，先別急著部署，表示你的環境或依賴版本有問題，跟 Cloudflare 網路部署無關。

### 步驟5：部署

```powershell
npx wrangler pages deploy public
```

第一次執行時，wrangler會問你要建立一個新的Pages專案還是關聯到既有專案，選「建立新專案」，
專案名稱可以直接用 `wxh-engine`(或你喜歡的名字，但建議跟 `wrangler.toml` 裡的 `name` 欄位保持一致)。

部署完成後，wrangler會印出一個 `*.pages.dev` 的網址，那就是你的引擎現在的公開網址。

### 步驟6：驗證API真的接上了(重要，不要跳過)

> **⚠️ 先確認你打的是哪一個網址。** 2026-08-17 有一輪回報「Pages Functions 沒有被服務，
> `/api/shop` 與 `/api/session` 在 preview 與正式站都回 404，只有 `/` 回 200」，並據此
> 懷疑 Pages 專案設定壞了。**那個結論是錯的**：實際的 Pages 專案網域是
> `ai-trpg-evd.pages.dev`，而測試時打的是 `ai-trpg.pages.dev`——一個不屬於這個專案的網域。
> 打對網址之後，`/api/shop` 與 `/api/forms` 都正常回應（沒有 sessionId 時回 400
> 「需要 sessionId」，那正是函式有在跑的證據）。
>
> **正確的網址以每次部署後 PR 上 Cloudflare 機器人留言的 Preview URL 為準**，
> 不要從專案名稱推測。一個 404 有兩種可能——函式沒部署，或你根本打錯站。

部署完打開瀏覽器或用 curl 依序測試 `/api/scenario`、`/api/check`、`/api/session`，再用測試 session 做一次 `/api/turn`。先確認 API routing 正常，再確認 LLM secret／binding 與 fallback chain。`/api/scenario` 是單數形式，不是 `/api/scenarios`。例如：

```powershell
curl -X POST https://你的網址.pages.dev/api/check `
  -H "Content-Type: application/json" `
  -d '{\"character\":{\"attributes\":{\"力量\":3},\"skills\":{}},\"params\":{\"attribute\":\"力量\",\"dc\":2}}'
```

如果 `/api/check` 回傳 `{"ok":true,"result":{...}}`，代表函式 routing 與規則層接上。真正送出 `/api/turn` 後，應確認成功回應的 `provider`／`model` 是實際使用的 provider；所有 provider 失敗時應保留可重試的 pending 狀態，而不是偽造敘事。若回傳 500 或「函式拋出例外」，請檢查 `wrangler.toml` 裡的 `compatibility_flags = ["nodejs_compat"]`。

## 想在本機先看看畫面

不用先部署也可以在本機跑起來，Cloudflare官方的做法是：

```bash
npx wrangler pages dev
```

它會同時提供 `public/` 的靜態檔案跟 `functions/` 底下的API，等於在本機模擬正式環境。
本機測試可在 `.dev.vars` 設定任一 server provider，例如 `GROQ_API_KEY`、`SILICONFLOW_API_KEY`、`NVIDIA_API_KEY` 或 `MISTRAL_API_KEY`，再用 `LLM_PROVIDER` 與 `LLM_FALLBACK_PROVIDERS` 指定順序。Workers AI 則需要本機 Wrangler 能提供 `[ai] binding`；若只是測試前端，不要把 API key 寫進 `public/`。`/api/narrate` 的 server-managed 模式另需 `NARRATE_ALLOW_SERVER_LLM=true`，正式 V2 遊玩則使用 `/api/turn`。

**如果你直接用瀏覽器打開 `public/index.html`**：畫面會出來，但右上角會顯示 `ENGINE OFFLINE`，
任何行動都會跳出 `SYSTEM.ERROR`——這是正常的，因為那樣沒有任何東西在提供 `/api/*`。
這是刻意設計的：寧可讓你看到「後端沒接上」，也不會假裝擲出了一個骰子結果。

## 在 Cloudflare 上切換 LLM 供應商（正式站 vs 測試站）

**玩家已經不能自己填 API 金鑰了**——設定面板整個拆掉，`/api/turn` 也不再讀 body 裡的
`provider` / `apiKey` / `baseUrl` / `model`。供應商完全由這裡的環境變數決定。

這一節回答的是最常見的那個需求：**正式站固定用 DeepSeek V4 Flash，但我自己測試的時候
想用別家（例如第三方 Gemini 中轉）。**

### Cloudflare Pages 有兩套環境，這就是答案

Pages 專案天生分成 **Production** 與 **Preview** 兩套環境，**環境變數可以各設各的**：

| 環境 | 什麼時候會跑到 | 拿來做什麼 |
| --- | --- | --- |
| **Production** | 推到正式分支（通常是 `main`）時部署的那一份 | 固定 DeepSeek V4 Flash |
| **Preview** | 其他分支、以及每一個 PR 自動產生的預覽網址 | 你的第三方 Gemini 中轉 |

也就是說：**你不需要每次測試前後手動改設定**。開一個分支推上去，Cloudflare 會給你一個
獨立的預覽網址，那個網址跑的是 Preview 的環境變數。正式站完全不受影響。

### 設定位置

Cloudflare Dashboard → **Workers & Pages** → 選你的 Pages 專案 → **Settings** →
**Variables and Secrets**（舊版介面叫 Environment variables）。
上方有 **Production / Preview** 的切換，**兩邊要分別設定**。

每個變數有兩種型別，選錯不會報錯，但差很多：

| 型別 | 用在哪 | 說明 |
| --- | --- | --- |
| **Secret**（加密） | 所有 `*_API_KEY`、`AUTH_SESSION_SECRET`、`DISCORD_CLIENT_SECRET` | 存進去之後**在介面上再也看不到內容**，只能覆寫。這是正確的行為，不是壞掉 |
| **Text / Plain**（明文） | 模型名稱、費率、白名單這類非機密設定 | 可以隨時看到與編輯 |

> 改完環境變數要**重新部署一次**才會生效（Deployments → 最新那筆 → Retry deployment，
> 或直接推一個新 commit）。這一步很容易忘，忘了會以為設定沒有用。

### Production：固定 DeepSeek V4 Flash

| 變數 | 型別 | 值 |
| --- | --- | --- |
| `LLM_PROVIDER` | Text | `deepseek` |
| `DEEPSEEK_API_KEY` | **Secret** | 你的 DeepSeek 金鑰 |
| `LLM_MODEL` | Text | `deepseek-v4-flash` |

走硅基流動而不是 DeepSeek 官方的話：

| 變數 | 型別 | 值 |
| --- | --- | --- |
| `LLM_PROVIDER` | Text | `siliconflow` |
| `SILICONFLOW_API_KEY` | **Secret** | 你的硅基流動金鑰 |
| `LLM_MODEL` | Text | 硅基流動上那個 V4 Flash 的完整 slug |

> ⚠️ `siliconflow` 在 `content/llm/providers.js` 的 `defaultModel` 是一個 Qwen 模型，
> **不是 DeepSeek**。不設 `LLM_MODEL` 的話你會跑到 Qwen 上，而且不會有任何錯誤訊息。
> 另外 `.com` 與 `.cn` 兩個站的帳號與金鑰是分開的，用錯會是 401 不是 404——
> 要用 `.cn` 請加 `LLM_BASE_URL=https://api.siliconflow.cn/v1`。

### Preview：你的第三方 Gemini 中轉

第三方中轉幾乎都宣稱相容 OpenAI 格式，那就用內建的 `custom` 供應商，一行程式都不用改：

| 變數 | 型別 | 值 |
| --- | --- | --- |
| `LLM_PROVIDER` | Text | `custom` |
| `LLM_API_KEY` | **Secret** | 中轉商給你的金鑰 |
| `LLM_BASE_URL` | Text | `https://你的中轉網域/v1`（要含 `/v1`，**不要**含 `/chat/completions`） |
| `LLM_MODEL` | Text | 中轉商接受的模型名稱 |

如果那個中轉是走 Google 原生的 `generateContent` 格式，改用 `LLM_PROVIDER=gemini` +
`GEMINI_API_KEY`，需要換網域時再加 `LLM_BASE_URL`。

### 敘事語氣也在這裡設

文筆也從前端拿掉了，改由環境變數決定（Text，選配）：

| 變數 | 可用值 |
| --- | --- |
| `NARRATIVE_STYLE` | `白描` / `恐怖懸疑` / `冷硬寫實` / `電影感` / `標準` |

值必須跟 `content/narrativeStyle.js` 的 key 一字不差，打錯會讓回合回 400。

`NARRATOR_PERSONA`（敘事者人格面具）已於 2026-09-03 停用：設了仍會驗證合法性，
但面具文字不再送進 prompt，見 `LLM_PROVIDERS.md` 的說明。

### 怎麼確認真的切過去了

打一個回合，然後看回應的 `provider` 與 `model` 欄位，或 Cloudflare 的即時 log：

```
[PROMPT_CACHE] {"provider":"deepseek","model":"deepseek-v4-flash","hit":8960,...}
```

---

## 後台用量與成本面板（只有你看得到）

網址：`/admin.html`。它讀 `/api/admin/usage`，**非管理員一律拿到 404**
（不是 403——403 等於告訴對方「這個網址是真的，只是你沒權限」）。

### 1. 誰是管理員

沿用既有的 Discord 登入，加一個白名單：

| 變數 | 型別 | 值 |
| --- | --- | --- |
| `ADMIN_DISCORD_IDS` | Text | 你的 Discord user id，多個用逗號隔開 |

取得方法：Discord → 設定 → 進階 → 開啟「開發者模式」，然後對自己的頭像按右鍵 →
「複製使用者 ID」。純數字或 `discord:數字` 兩種寫法都收。

> **沒設定 `ADMIN_DISCORD_IDS` 時，沒有任何人是管理員**（不是「所有人都是」）。
> 前提是 Discord 登入本身已經設好（見下面那一節），否則沒有人能通過驗證。

### 2. 費率（選填，但沒填就只有 token 數）

| 變數 | 型別 | 說明 |
| --- | --- | --- |
| `ADMIN_PRICE_CACHE_HIT_PER_MTOK` | Text | 輸入 token **命中快取**的單價（每一百萬 token） |
| `ADMIN_PRICE_CACHE_MISS_PER_MTOK` | Text | 輸入 token **未命中**的單價 |
| `ADMIN_PRICE_OUTPUT_PER_MTOK` | Text | 輸出 token 的單價 |
| `ADMIN_PRICE_CURRENCY` | Text | 幣別標籤，純顯示用，預設 `USD` |
| `ADMIN_PRICE_MODEL_LABEL` | Text | 這組費率是哪個模型的，純顯示用 |

**這個專案不預設任何價格數字。** 各家計價變動很快，把一組沒查證的數字寫進原始碼，
會變成一個「看起來很確定、實際上可能早就過期」的謊——這跟 `providers.js` 對
`baseUrl` / `defaultModel` 的處理原則一致。請自己到官方計價頁核對後填進來。

三個單價**缺一個就整組視為未設定**，面板只顯示 token 數。理由是：用「有的那兩個」
去算會得到一個看起來合理、但少算了一整類成本的數字，那比沒有數字更危險。

### 3. 成本是「虛擬」的，這正是重點

面板的換算一律是「**實際發生的 token 數** × **你填的那組費率**」，跟這次是哪一家服務的無關。

所以你在 Preview 上用 Gemini 中轉測試，只要費率填的是 V4 Flash 的，
看到的數字就是**正式站固定用 V4 Flash 時會付的錢**。這就是你要的那個功能。

面板上會有：

- 回合數、以及其中有多少回合真的回報了 token（沒回報的供應商不進統計——
  「沒回報」不等於「用了 0」）
- 快取命中率（逐日，含長條圖）
- 總成本、每回合平均成本
- **快取省下多少**：拿「完全沒有快取的話要多少錢」減掉實際成本

### 4. 帳本存在哪

存在既有的 `SAVES` KV namespace，key 前綴 `usage:`，**一天一筆彙總**。

刻意不存逐回合明細：明細會隨玩家數線性成長，而且裡面會有 sessionId 與玩家行為資料——
營運數字不需要那些，不留就不會外洩。同理，`/api/admin/usage` 的回應裡沒有任何
sessionId、玩家 id 或敘事文字（有一條測試在守這件事）。

沒有 KV binding 時帳本會退到記憶體，容器一重啟就歸零；面板上會照實標示，
不然數字歸零時看起來會像是「今天沒有人玩」。

## 目前仍可擴充的項目

- 將 Tailwind Play CDN 改成 build-time CSS，降低正式環境對外部 CDN 的依賴。
- 為 fallback chain 增加帳戶／每日 request counter 與更細緻的 paid-spend hard stop；目前 `LLM_ALLOW_PAID_FALLBACK` 只控制付費候補是否能加入，不是計費平台的硬斷路器。
- 在 Cloudflare production 上用各帳戶實際 secret 完成 Groq、SiliconFlow、NVIDIA、Mistral 的 smoke test，確認模型 ID、免費資格與 JSON 支援仍有效。
- 設定自訂網域與登入 OAuth；這些設定依你的 Cloudflare／Discord 帳戶而異，請以官方文件為準。

## Discord 登入（選配）

登入是**選配的**：三個環境變數都沒設時，前端會自動把登入按鈕整塊藏起來，遊戲照樣以匿名模式運作。
設定好之後，玩家可以用 Discord 帳號登入，存檔會綁在帳號底下、跨裝置讀得到。

### 1. 在 Discord Developer Portal 建立應用

1. 開 <https://discord.com/developers/applications>，建立一個新應用
2. 左側「OAuth2」→「General」，在「Redirects」加入你的 callback 網址：

   ```
   https://你的網域/api/auth/discord-callback
   ```

   > **這個網址必須一字不差。** 差一個結尾斜線、差 `http`/`https` 都會被 Discord 直接拒絕，
   > 而且錯誤訊息（「無效的 OAuth2 redirect_uri」）不會告訴你差在哪裡。
   > Cloudflare Pages 的 preview 部署每次都是新網域，如果要在 preview 上測登入，
   > 就把那個 preview 網域也加進這份清單。

3. 同一頁可以看到 **Client ID**；「Client Secret」在旁邊按 Reset Secret 產生

### 2. 設定環境變數

```bash
# 兩個都是機密，一定要用 secret，不可以寫進 wrangler.toml 或任何會被 commit 的檔案
npx wrangler pages secret put DISCORD_CLIENT_ID --project-name=wxh-engine
npx wrangler pages secret put DISCORD_CLIENT_SECRET --project-name=wxh-engine

# 簽發登入憑證用的密鑰，自己產生一段夠長的隨機字串
openssl rand -base64 32
npx wrangler pages secret put AUTH_SESSION_SECRET --project-name=wxh-engine
```

正式環境建議再設一個非機密的 `DISCORD_AUTH_REDIRECT_URI`：

```
DISCORD_AUTH_REDIRECT_URI=https://你的網域/api/auth/discord-callback
```

不設的話程式會從這次請求的網址推導。推導在多數情況下是對的，但只要前面有任何會改寫
`Host` 標頭的東西，推出來的值就會跟 Discord 登記的不一致而登入失敗——明確指定最保險。

> **換掉 `AUTH_SESSION_SECRET` 會讓所有人被登出**（既有的登入票全部驗不過）。
> 這也正是懷疑密鑰外洩時的處理方式。

### 3. `prompt=none` 的取捨

登入按鈕預設會帶 `prompt=none`：玩家如果已經登入 Discord、且先前同意過這個應用的權限，
可以直接跳過「是否授權」畫面。代價是玩家第一次登入、或撤銷過授權時，Discord 不會顯示
同意畫面，而是回報 `login_required`／`consent_required`——`discord-callback.js` 偵測到
這兩種情況會自動重新導向一次不省略同意畫面的登入，所以玩家最終還是看得到同意畫面，
只是會多轉一次頁面，這是目前這個實作已知的體驗代價。

## 存檔歸屬的行為

| 情況 | 行為 |
|---|---|
| 沒登入 | 照舊能玩。存檔是「匿名存檔」，任何知道 session ID 的人都讀得到（ID 本身就是一串 UUID，等於不公開的鑰匙） |
| 登入後 | 新建的存檔直接綁在帳號底下，只有本人讀得到 |
| 登入時手上有匿名存檔 | **自動認領成你的**，已經在玩的人進度不會不見 |
| 已經有主人的存檔 | 不會被別人認領走，其他帳號讀取一律回 404 |

回 404 而不是 403 是刻意的：回 403 等於告訴對方「這個 ID 存在，只是你不能看」。

## 已知取捨

登入狀態是一張 **HMAC 簽章的 cookie**，不是資料庫 session。這樣即使沒設定 KV binding，
登入也能正常運作（見 `content/auth/sessionToken.js` 的檔頭說明）。

代價是：**沒辦法在到期前主動撤銷某一張票**。玩家按登出只是清掉自己瀏覽器上的 cookie，
那張票本身在 30 天到期前仍然有效。對單人遊戲來說這個取捨可以接受；
之後若真的需要「把某個使用者踢出去」，作法是加一份 KV 撤銷清單，而不是整套換掉。

## Discord bot 查詢玩家資料（選配）

`GET /api/bot/status?discordId=xxx` 是給你自己的 Discord bot（例如 `/status` 指令）查詢
「這個 Discord 使用者的輪迴者檔案」用的端點——只有先用 Discord 帳號登入過這個網站的玩家
（見上面「Discord 登入」一節）才查得到，沒登入過的人回 `linked:false`。

這**不是**玩家會直接打的端點，呼叫端是你的 bot 進程本身，所以驗證方式不是 OAuth，
而是一把只有 bot 與這個 Cloudflare Pages 部署知道的共用密鑰：

```bash
openssl rand -base64 32
npx wrangler pages secret put BOT_API_SECRET --project-name=wxh-engine
```

bot 那邊打這支端點時要帶一樣的值：

```js
const res = await fetch(`https://你的網域/api/bot/status?discordId=${discordId}`, {
  headers: { "x-bot-secret": process.env.BOT_API_SECRET },
});
const { ok, linked, status } = await res.json();
```

沒設定 `BOT_API_SECRET` 時這支端點整支回 503，不會半開放；密鑰不符一律回 401，
不分「密鑰錯」跟「沒帶密鑰」（都算未授權）。回傳形狀見 `content/discord/statusView.js`
的 `buildDiscordStatusView()`——只有六維屬性、血統/改造、支線與分數、上一場主神評價，
不含事件日誌或劇情全文。
