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
public/index.html           佔位首頁(還沒有真正的前端UI)
functions/api/check.js      POST /api/check —— 呼叫 core/check.js 做一次判定
functions/api/combat/resolve.js  POST /api/combat/resolve —— 呼叫 resolveCombatAction() 跑一次完整攻擊
```

這兩個API端點直接複用引擎裡已經有176+個單元測試涵蓋過的運算邏輯，**沒有新的遊戲規則**，
純粹是「把function包成HTTP端點」。真正還沒做的是前端(要打這些API的網頁UI)跟Gemini敘事整合
(見 `GEMINI_INTEGRATION.md`)。

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

應該會看到190個測試全部通過(`# pass 190` `# fail 0`)。如果這裡就失敗了，先別急著部署，
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

## 之後要做的(不在這次骨架範圍內)

- 真正的前端UI(打這些API、顯示角色卡/戰鬥畫面)。
- 環境變數/API金鑰的管理(Gemini整合需要，見 `GEMINI_INTEGRATION.md`，那邊會用到
  `wrangler pages secret put` 這個指令)。
- 自訂網域(如果你不想用`*.pages.dev`，需要在Cloudflare Dashboard另外設定，這步驟因人而異，
  請照Cloudflare官方文件操作)。
