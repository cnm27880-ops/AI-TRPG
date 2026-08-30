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
