// [設計] PWA 的 Service Worker —— 只做兩件事：快取「App殼」讓安裝後開得快、
// 離線時還能看到畫面；然後**絕對不快取任何遊戲資料**。
//
// 為什麼 /api/ 一定要繞過快取：這個引擎的核心原則是「AI只負責敘事，數值算在伺服器」，
// 存檔、判定結果、故事進度全部即時算在 functions/api/ 底下。如果 Service Worker
// 手滑把某次 /api/turn 的回應快取住，玩家下次打開可能看到的是上一輪的舊回合——
// 那不是「離線也能玩」，是「悄悄把存檔讀壞」。所以策略很單純：
//   - 同源的 App 殼（HTML/JS/manifest/圖示）：network-first，線上優先拿部署中的新版，
//     斷線時才回退快取，避免 HTML 與 JavaScript 版本配對不一致。
//   - /api/ 開頭、或任何非 GET 請求：完全不攔截，直接放行給網路。
//   - 跨網域資源（Tailwind CDN、字型、FontAwesome）：也不攔截，交給瀏覽器自己的 HTTP 快取，
//     Service Worker 攔截跨網域的 opaque response 只會徒增複雜度、抓不到失敗也管不了版本。
//
// 版本號寫死在快取名稱裡：改這個檔案裡快取的內容(APP_SHELL)時，記得把 CACHE_NAME
// 的版號也往上加一；network-first 是線上安全網，版本 bump 則負責清除舊離線殼。
const CACHE_VERSION = "v3";
const CACHE_NAME = `echoes-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  // [2026-08-20 修正] 樣式表在 2026-08-18 從 cdn.tailwindcss.com 換成同源的
  // ./tailwind.css 之後，一直沒有被加進 App 殼。它是 render-blocking 的樣式表，
  // 漏掉它等於「離線時打得開，但整頁沒有樣式」——安裝成PWA之後第一次離線開啟
  // 就會踩到。加進來的同時把 CACHE_VERSION 往上加一（見檔頭說明）。
  "./tailwind.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只處理「同源、GET」的請求。/api/ 一律放行給網路，跨網域資源也放行——理由見檔頭註解。
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // 只改寫明確列在 app shell 的檔案；其他同源資源交回瀏覽器，避免把未預期的
  //下載內容塞進 PWA cache。HTML／JS／CSS 必須 network-first：舊版 cache-first 曾讓
  //已部署的新 index.html 與舊 app.js 長時間配對，正式站實際出現 null DOM error。
  const shellPathnames = APP_SHELL.map((path) => new URL(path, self.location.origin).pathname);
  if (!shellPathnames.includes(url.pathname)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const network = fetch(req, { cache: "no-store" })
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      // 線上永遠先用部署中的版本（並繞過瀏覽器 HTTP cache）；斷網時才回退到 cache。
      // ignoreSearch 讓實際載入的
      // app.js?v=... 可以使用安裝時預快取的 ./app.js，且每次 query 版本仍可更新 cache。
      return (await network) || (await cache.match(req, { ignoreSearch: true })) || Response.error();
    })
  );
});
