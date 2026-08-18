// [設計] PWA 的 Service Worker —— 只做兩件事：快取「App殼」讓安裝後開得快、
// 離線時還能看到畫面；然後**絕對不快取任何遊戲資料**。
//
// 為什麼 /api/ 一定要繞過快取：這個引擎的核心原則是「AI只負責敘事，數值算在伺服器」，
// 存檔、判定結果、故事進度全部即時算在 functions/api/ 底下。如果 Service Worker
// 手滑把某次 /api/turn 的回應快取住，玩家下次打開可能看到的是上一輪的舊回合——
// 那不是「離線也能玩」，是「悄悄把存檔讀壞」。所以策略很單純：
//   - 同源的 App 殼（HTML/JS/manifest/圖示）：cache-first，順便在背景抓新的回來更新快取，
//     這樣下次開才會是新版，不用逼玩家手動清快取。
//   - /api/ 開頭、或任何非 GET 請求：完全不攔截，直接放行給網路。
//   - 跨網域資源（Tailwind CDN、字型、FontAwesome）：也不攔截，交給瀏覽器自己的 HTTP 快取，
//     Service Worker 攔截跨網域的 opaque response 只會徒增複雜度、抓不到失敗也管不了版本。
//
// 版本號寫死在快取名稱裡：改這個檔案裡快取的內容(APP_SHELL)時，記得把 CACHE_NAME
// 的版號也往上加一，否則舊版 Service Worker 還在跑的使用者不會拿到新檔案。
const CACHE_VERSION = "v1";
const CACHE_NAME = `echoes-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
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

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      // 有快取先給快取（快），背景同時去抓新的回來更新（見 activate 的版本清理）；
      // 沒快取就等網路，網路也失敗才真的沒東西可給。
      return cached || (await network) || Response.error();
    })
  );
});
