// [安全] 決定「呼叫端(玩家瀏覽器/直接打API的人)這次請求，可以覆寫哪些LLM設定」。
//
// /api/turn 與 /api/narrate 都支援玩家在設定裡指定自己的LLM供應商/金鑰/端點(BYOK)，
// 這是刻意的功能，不是漏洞。但**在這次安全稽核之前**，覆寫欄位(apiKey/baseUrl/model)
// 是不分青紅皂白地整組往下傳的，即使呼叫端根本沒有指定 provider：
//
//   一個沒有帶 provider 欄位、只帶了 baseUrl(不帶apiKey)的請求，會讓
//   resolveProvider() 把伺服器自動選定的供應商(例如靠 GEMINI_API_KEY 自動選中
//   的 gemini)的 baseUrl 換成呼叫端指定的網域，同時因為呼叫端沒給 apiKey，
//   金鑰退回讀伺服器自己的環境變數——等於伺服器拿著自己的正牌金鑰，
//   對著一個呼叫端指定的任意網域發了一次請求。SSRF黑名單(content/llm/urlSafety.js)
//   只擋得住「內網/loopback/metadata」這一類目標，擋不住攻擊者自己申請的
//   合法公開網域——金鑰就這樣送到對方手上了。
//
// 這個檔案把「這次到底可以套用哪些覆寫」收斂成一條規則，讓 turn.js／narrate.js
// 的每一個 callLlm() 呼叫點都用同一份邏輯，不必自己各寫一份（也不會漏掉某一處）：
//
//   1. 完全沒有指定 provider -> 三個欄位全部忽略，一律用伺服器的設定與金鑰。
//      "沒帶provider"本身就代表這次呼叫沒有要求BYOK，任何 baseUrl/apiKey/model
//      都不該被套用——不能靠「有沒有帶apiKey」反推「有沒有要BYOK」，
//      因為那正是上面那個漏洞的成因。
//   2. 指定了 provider，但不是 "custom" -> baseUrl 一律忽略(內建供應商的端點是
//      寫死在 content/llm/providers.js 的常數，不能被請求改寫；「第三方URL只能走
//      custom」)；apiKey／model 可以套用呼叫端提供的值(apiKey 由上層先擋掉留空的
//      情況，這裡只是不要它退回伺服器金鑰)。
//   3. 指定 provider = "custom" -> apiKey/baseUrl/model 全部套用呼叫端提供的值，
//      這正是「接自己的第三方中轉/自架端點」這個功能存在的意義。
export function resolveLlmRequestOverrides({ bodyProvider, bodyApiKey, bodyBaseUrl, bodyModel }) {
  if (!bodyProvider) {
    return { apiKey: undefined, baseUrl: undefined, model: undefined };
  }
  const allowBaseUrlOverride = bodyProvider === "custom";
  return {
    apiKey: bodyApiKey || undefined,
    baseUrl: allowBaseUrlOverride ? (bodyBaseUrl || undefined) : undefined,
    model: bodyModel || undefined,
  };
}
