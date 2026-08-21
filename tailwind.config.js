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
 * [2026-08-21] colors 一節改成指向 CSS 變數，理由寫在該節的註解裡。
 * fontFamily 與 zinc 的額外階數仍與最初的 tailwind.config 相同。
 */
export default {
  darkMode: "class",
  content: ["./public/**/*.html", "./public/**/*.js"],
  theme: {
    extend: {
      colors: {
        /* [2026-08-21 token 重構]
           這裡不再寫死色票，而是把 Tailwind 的色階指向 CSS 變數（見 public/index.html
           的 <style> 開頭「舞台與主題的色彩 token」）。

           為什麼要這樣做：先前每一個顏色工具類在淺色主題都要手寫一行覆寫
           （`html[data-theme="light"] .text-emerald-300 { color: #2563eb }` 之類，
           曾經多達兩百多行），而且那份對照表只認得「深色／淺色」兩種情境——
           後來加上「邀請頁」「主神空間」兩個舞台之後就再也擴充不動，只能靠
           `[class*="text-emerald-"] { color: ... !important }` 這種整片覆蓋去壓，
           連帶把所有漸層 (background-image) 一起消掉，畫面才會糊成同一個色調。

           改成變數之後，換一個舞台＝重新定義二十幾個變數，工具類完全不用動，
           `/70`、`/20` 這些透明度階也原封不動地保留下來。

           色階怎麼收斂：每個色系只留「文字階」與「實色階」兩級。
           200/300 這種原本是「深底上的亮字」，一律指向文字階；
           400/500 是填色與描邊，指向實色階。中性灰 (zinc) 因為要同時表達
           文字層次與面的層次，所以拆得比較細。 */
        zinc: {
          100: "rgb(var(--c-ink-100) / <alpha-value>)",
          200: "rgb(var(--c-ink-200) / <alpha-value>)",
          300: "rgb(var(--c-ink-300) / <alpha-value>)",
          400: "rgb(var(--c-ink-400) / <alpha-value>)",
          500: "rgb(var(--c-ink-500) / <alpha-value>)",
          600: "rgb(var(--c-ink-500) / <alpha-value>)",
          700: "rgb(var(--c-surface-3) / <alpha-value>)",
          800: "rgb(var(--c-surface-2) / <alpha-value>)",
          850: "rgb(var(--c-surface-1) / <alpha-value>)",
          900: "rgb(var(--c-surface-1) / <alpha-value>)",
          950: "rgb(var(--c-surface-0) / <alpha-value>)",
        },
        panel: "rgb(var(--c-surface-1) / <alpha-value>)",
        emerald: {
          200: "rgb(var(--c-accent-text) / <alpha-value>)",
          300: "rgb(var(--c-accent-text) / <alpha-value>)",
          400: "rgb(var(--c-accent-base) / <alpha-value>)",
          500: "rgb(var(--c-accent-base) / <alpha-value>)",
          600: "rgb(var(--c-accent-base) / <alpha-value>)",
        },
        yellow: {
          200: "rgb(var(--c-warn-text) / <alpha-value>)",
          300: "rgb(var(--c-warn-text) / <alpha-value>)",
          400: "rgb(var(--c-warn-base) / <alpha-value>)",
          500: "rgb(var(--c-warn-base) / <alpha-value>)",
        },
        amber: {
          200: "rgb(var(--c-warn-text) / <alpha-value>)",
          300: "rgb(var(--c-warn-text) / <alpha-value>)",
          500: "rgb(var(--c-warn-base) / <alpha-value>)",
        },
        orange: {
          200: "rgb(var(--c-time-text) / <alpha-value>)",
          300: "rgb(var(--c-time-text) / <alpha-value>)",
          500: "rgb(var(--c-time-base) / <alpha-value>)",
        },
        red: {
          200: "rgb(var(--c-danger-text) / <alpha-value>)",
          300: "rgb(var(--c-danger-text) / <alpha-value>)",
          400: "rgb(var(--c-danger-base) / <alpha-value>)",
          500: "rgb(var(--c-danger-base) / <alpha-value>)",
        },
        rose: {
          200: "rgb(var(--c-vice-text) / <alpha-value>)",
          300: "rgb(var(--c-vice-text) / <alpha-value>)",
          500: "rgb(var(--c-vice-base) / <alpha-value>)",
        },
        sky: {
          300: "rgb(var(--c-info-text) / <alpha-value>)",
          500: "rgb(var(--c-info-base) / <alpha-value>)",
        },
        cyan: {
          300: "rgb(var(--c-info-text) / <alpha-value>)",
        },
        violet: {
          100: "rgb(var(--c-arcane-text) / <alpha-value>)",
          200: "rgb(var(--c-arcane-text) / <alpha-value>)",
          300: "rgb(var(--c-arcane-text) / <alpha-value>)",
          400: "rgb(var(--c-arcane-base) / <alpha-value>)",
          500: "rgb(var(--c-arcane-base) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
        serif: ['"Noto Serif TC"', "serif"],
      },
    },
  },
};
