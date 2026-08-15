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
functions/api/narrate.js    POST /api/narrate —— 判定 + 敘事分級 + Gemini生成敘事(需要金鑰)
functions/api/combat/resolve.js  POST /api/combat/resolve —— 呼叫 resolveCombatAction() 跑一次完整攻擊
```

這些API端點直接複用引擎裡已經有222個單元測試涵蓋過的運算邏輯，**沒有新的遊戲規則**，
純粹是「把function包成HTTP端點」。

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

應該會看到222個測試全部通過(`# pass 222` `# fail 0`)。如果這裡就失敗了，先別急著部署，
表示你的環境(Node版本太舊之類)有問題，跟Cloudflare無關。

### 步驟5：部署

```powershell
npx wrangler pages deploy public
```

第一次執行時，wrangler會問你要建立一個新的Pages專案還是關聯到既有專案，選「建立新專案」，
專案名稱可以直接用 `wxh-engine`(或你喜歡的名字，但建議跟 `wrangler.toml` 裡的 `name` 欄位保持一致)。

部署完成後，wrangler會印出一個 `*.pages.dev` 的網址，那就是你的引擎現在的公開網址。

### 步驟6：驗證API真的接上了(重要，不要跳過)

部署完打開瀏覽器或用curl測試一下 `/api/check` 端點是否正常運作，例如：

```powershell
curl -X POST https://你的網址.pages.dev/api/check `
  -H "Content-Type: application/json" `
  -d '{\"character\":{\"attributes\":{\"力量\":3},\"skills\":{}},\"params\":{\"attribute\":\"力量\",\"dc\":2}}'
```

如果回傳 `{\"ok\":true,\"result\":{...}}` 這種結構，代表接上了。如果回傳500錯誤或「函式拋出例外」，
最可能的原因是 `wrangler.toml` 裡的 `compatibility_flags = ["nodejs_compat"]` 沒有生效
(見 `wrangler.toml` 檔案裡的註解說明為什麼一定要開這個)。

## 想在本機先看看畫面

不用先部署也可以在本機跑起來，Cloudflare官方的做法是：

```bash
npx wrangler pages dev
```

它會同時提供 `public/` 的靜態檔案跟 `functions/` 底下的API，等於在本機模擬正式環境。
注意 `/api/narrate` 需要 `GEMINI_API_KEY`，本機測試可以用 `--binding GEMINI_API_KEY=你的金鑰`
帶進去(這個指令參數請以 `npx wrangler pages dev --help` 的輸出為準，wrangler的CLI參數會改版)。

**如果你直接用瀏覽器打開 `public/index.html`**：畫面會出來，但右上角會顯示 `ENGINE OFFLINE`，
任何行動都會跳出 `SYSTEM.ERROR`——這是正常的，因為那樣沒有任何東西在提供 `/api/*`。
這是刻意設計的：寧可讓你看到「後端沒接上」，也不會假裝擲出了一個骰子結果。

## 之後要做的(不在這次骨架範圍內)

- 建卡流程與存檔(目前角色卡寫死在 `public/app.js`，重整頁面就回到初始狀態，
  需要 KV / D1 之類的儲存才能真的存檔)。
- 戰鬥介面(`/api/combat/resolve` 目前還沒有任何UI在呼叫)。
- 把前端的Tailwind從Play CDN換成build-time版本(見 `ARCHITECTURE.md` 的前端接線決策記錄)。
- 環境變數/API金鑰的管理(Gemini整合需要，見 `GEMINI_INTEGRATION.md`，那邊會用到
  `wrangler pages secret put` 這個指令)。
- 自訂網域(如果你不想用`*.pages.dev`，需要在Cloudflare Dashboard另外設定，這步驟因人而異，
  請照Cloudflare官方文件操作)。
