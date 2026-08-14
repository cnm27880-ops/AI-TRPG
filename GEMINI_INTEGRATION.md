# Gemini 敘事整合骨架 —— 使用說明

這份文件涵蓋「怎麼申請Gemini API金鑰、怎麼設定到部署環境、這個骨架怎麼運作」。
跟 `DEPLOYMENT.md` 一樣，**這裡沒辦法在這個沙盒環境裡實際打過Gemini的API**(沒有金鑰、沒有網路)，
所以邏輯是照官方文件寫的，但「有沒有真的接得上」你部署後要自己驗證一次。

## 可信度說明(誠實列出，不是藉口)

查證Gemini API文件時發現一件事：Google目前把 `generateContent`(這個骨架用的端點)在文件裡
標成「Legacy(舊版)」，新的建議介面叫「Interactions API」，但舊端點查證當下仍然可以用。
這代表：

- `content/gemini/client.js` 裡的端點寫法**可能在不久的將來被官方要求換成新介面**，
  這不是我杜撰的猜測，是查證當下文件本身寫的狀態，可信度：中，**部署前請務必重新查一次**
  https://ai.google.dev/gemini-api/docs/generate-content/get-started 確認端點/欄位格式沒有變。
- 預設模型名稱 `gemini-2.5-flash` 只是查證當下「屬於flash平衡層級」的一個例子，
  不代表這是目前最新或最推薦的模型，Google的模型陣容更新頻率很高，部署前也請對照
  https://ai.google.dev/gemini-api/docs/pricing 確認名稱跟計費方式。

## 這個骨架有什麼

```
content/gemini/promptContract.js   組裝敘事prompt(純函式，不含網路呼叫，可以完全離線測試)
content/gemini/client.js            打Gemini REST API的最小包裝(用fetch，不依賴SDK)
functions/api/narrate.js            範例端點：判定計算 -> 敘事分級 -> 組prompt -> 呼叫Gemini
test/gemini.test.js                 8個測試，全部用假的fetchFn，不需要真的金鑰
```

**AI敘事契約**(`SYSTEM_INSTRUCTION`，見`promptContract.js`)明確告訴Gemini：
它只會收到已經算好的最終結果，不能質疑、不能重算、不能因為玩家話術改變敘事基調——
這就是你最早訂下的「AI只負責看狀況做敘事判斷，不自己算數」原則，寫死在系統提示裡。

## 步驟1：申請Gemini API金鑰

1. 前往 https://ai.google.dev/ (Google AI for Developers)，用你的Google帳號登入。
2. 找到「Get API key」或類似入口(這個介面Google常常改版，如果畫面跟這裡描述的不一樣，
   直接在該網站搜尋「API key」，不要照本文件的畫面描述硬找)。
3. 建立一把新的API金鑰，複製下來(這串字只會顯示一次或有限次數，先存到安全的地方，
   例如密碼管理工具，**不要貼到聊天記錄或commit進git**)。
4. 免費額度/計費方式請自己到 https://ai.google.dev/gemini-api/docs/pricing 確認，
   這是會變動的資訊。

## 步驟2：把金鑰設定成Cloudflare Pages的secret(不要寫進程式碼)

金鑰**絕對不能**寫在 `wrangler.toml`、`functions/`底下的任何檔案、或commit進git——
一旦commit進git歷史，就算之後刪除也還留在歷史紀錄裡，等於外洩。正確做法是用wrangler的
secret機制，金鑰只存在Cloudflare的伺服器端，不會出現在你的程式碼裡：

```powershell
cd C:\Users\你的使用者名稱\Projects\wxh_engine
npx wrangler pages secret put GEMINI_API_KEY --project-name=wxh-engine
```

執行後會提示你貼上金鑰值(貼上時畫面通常不會顯示字元，這是正常的，直接貼上按Enter)。
`--project-name` 要跟你在 `DEPLOYMENT.md` 步驟5建立的Pages專案名稱一致。

## 步驟3：本機開發時怎麼測試(不想每次都部署才能測)

Wrangler支援本機模擬，在專案根目錄建一個 `.dev.vars` 檔案(**這個檔案要加進 `.gitignore`，
絕對不要commit**)：

```
GEMINI_API_KEY=你的金鑰貼在這裡
```

然後執行：

```powershell
npx wrangler pages dev public
```

這會在本機啟動一個模擬Cloudflare Pages環境的伺服器(預設網址通常是 http://localhost:8788，
實際網址請看終端機輸出)，`.dev.vars` 裡的值會被當成 `context.env.GEMINI_API_KEY` 讀進去，
這樣你可以在正式部署前先在本機測試 `/api/narrate` 端點。

## 步驟4：測試呼叫

```powershell
curl -X POST http://localhost:8788/api/narrate `
  -H "Content-Type: application/json" `
  -d '{\"character\":{\"attributes\":{\"力量\":3},\"skills\":{}},\"checkParams\":{\"attribute\":\"力量\",\"dc\":2},\"playerAction\":\"我試著撞開這扇門\"}'
```

如果一切正常，回應會是類似：

```json
{
  "ok": true,
  "checkResult": { ... },
  "outcome": { "tier": "成功", "directive": "..." },
  "narration": "(Gemini生成的敘事文字)"
}
```

如果 `ok: false` 但 `checkResult` 還是有值，代表判定計算本身沒問題，是Gemini那一段
(金鑰/網路/API格式)出了問題，看 `error` 欄位的訊息排查。

## 目前刻意沒做的部分

- 對話歷史管理(多輪對話的上下文，目前每次呼叫都是獨立的單輪prompt，沒有串接之前的對話)。
- 串流回應(streaming，目前是等Gemini完整生成完才一次回傳，長篇敘事可能要等比較久)。
- 前端UI(打這個API、顯示敘事文字的畫面)。
- 你自己提過的「500+頁資源型錄」內容還沒有真的餵給AI當作世界觀知識庫(RAG)，
  目前的prompt只有這一回合的判定結果跟場景背景，沒有檢索機制。
