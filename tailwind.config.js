/**
 * Tailwind 設定。
 *
 * [2026-08-18] 這份設定原本是寫在 public/index.html 的 <script> 裡、交給
 * cdn.tailwindcss.com 在瀏覽器端即時編譯的。那個 CDN 版官方文件明講
 * 「僅供開發與試作，不要用在正式環境」——它會把整個 Tailwind 編譯器
 * （約 400KB 的 JS）送到每一位玩家的瀏覽器，每次開啟頁面都重新掃一次 DOM
 * 產生 CSS，首屏會先閃一下沒有樣式的畫面，手機上尤其明顯。
 *
 * 現在改成事先編譯成 public/tailwind.css 並**提交進版控**。這樣做的理由是
 * 部署方式維持不變：wrangler.toml 的 pages_build_output_dir 指向 ./public，
 * 整個專案仍然是「一包靜態檔案直接上傳」，不需要在 CI 或部署端跑任何建置步驟。
 * 改了 class 之後跑 `npm run build:css` 重新產生，然後跟原始碼一起提交。
 *
 * 下面每一項都跟原本 index.html 裡的 tailwind.config 一字不差，
 * 換掉編譯時機而已，沒有順便改任何設計。
 */
export default {
  darkMode: "class",
  content: ["./public/**/*.html", "./public/**/*.js"],
  theme: {
    extend: {
      colors: {
        zinc: { 850: "#131316", 900: "#18181b", 950: "#09090b" },
        panel: "#121215",
        emerald: { 400: "#34d399", 500: "#10b981", 600: "#059669" },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
        serif: ['"Noto Serif TC"', "serif"],
      },
    },
  },
};
