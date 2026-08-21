# 主神空間白色平台 Hub／輪迴者手錶 HUD 實作架構

更新日期：2026-08-21

## 設計目標

主神邀請頁是普通現代網站，接受後才進入主神空間。主神空間不再延續一般後台控制台，而是以 `RULES_DIGEST.md` 所描述的主神空間意象作為 hub：白色平台、巨大光源、遠方黑暗，以及等待下一場恐怖片的中繼感。

主遊戲進入恐怖片後，畫面才轉成低彩度的生存檔案介面。兩個狀態共用同一組色彩變數、襯線敘事字體、等寬索引字體與細線材質，但資訊密度不同：hub 用空間物件承載選擇，副本畫面用手錶 HUD 與任務檔案承載狀態。

## 目前規則可直接支援的資料

`RULES_DIGEST.md` 已明確列出目前可以誠實顯示的資料：六維屬性、十技能、四段傷勢軌、意志值、XP、獎勵點數、D 級支線當量、主神商店、時間預算、主線進度、迫近度、NPC 好感度、劇情扭轉度與回合難度。這些資料可以進入 UI；不應新增完整九維角色卡、完整二十二技能或目前沒有消費端的規則欄位。

| 介面物件 | 資料來源 | 顯示內容 | 是否改規則 |
|---|---|---|---|
| 主神平台 | 前端目前 session／portal 狀態 | 個人房間、主神兌換、前往任務、輪迴者檔案 | 否 |
| 輪迴者手錶 | `scenario` 與角色 session | 副本名稱、當前目標、剩餘回合、迫近度、主線進度 | 否 |
| 角色檔案 | `character`／`adoptCharacter()` | 六維、十技能、四段生命傷勢、意志、XP、資源 | 否 |
| Decision Card | `turnOptions.js` 回傳的 options | 行動文字、hint、是否需檢定、技能與難度 | 否 |
| 擲骰覆蓋層 | 現有 `dice-roll-overlay` | 原版 d20 動畫與結算 | **完全保留** |

## Hub DOM 架構

在既有 `#portal-main-content` 裡保留現有三個入口事件，將目前的 banner 與 action tile 外包成 `portal-platform`。平台中央放置一個無互動的巨大光源，周圍放四個可互動的 hub 物件；這些物件仍使用既有 `onclick` 函式，因此不增加新的資料流。

```text
#portal-main-content.portal-platform
├── .platform-sky / .platform-orb                 // 純視覺層，不產生遊戲狀態
├── .platform-heading                            // 主神空間、輪迴等待狀態
├── .platform-grid
│   ├── button[data-hub-action="profile"]       // 角色檔案，開啟現有遊戲／角色入口
│   ├── button[data-hub-action="exchange"]      // 主神兌換，呼叫既有 openShop()
│   ├── button[data-hub-action="mission"]       // 建立新檔案／進入新輪迴
│   └── button[data-hub-action="records"]       // 讀取存檔／設定
├── #portal-resume-box                            // 有存檔時保留，改成平台上的醒目檔案夾
└── .platform-footnote                            // 主神記錄與輪迴編號
```

目前 `#portal-resume-box`、`startNewChargen()`、`openModal('sessionModal')`、`openModal('settingsModal')` 都可以保留。第一版只改 DOM 分組與樣式，不把 hub 做成真正的 3D 場景，避免把入口變成需要新框架的重寫。

## 輪迴者手錶 HUD DOM 架構

在 `#app-viewport > main` 的故事區上方，把目前 `#scenario-hud` 由寬條改成「手錶讀數」容器。既有 `#scenario-node-title`、`#scenario-progress-bar`、`#scenario-threat-*` 與 `#scenario-time-badge` 全部保留，新增的只是包裝層與幾個靜態標籤。`updateScenarioHud(scenario)` 繼續更新現有 ID，不需要改規則函式。

```text
#watch-hud
├── .watch-face
│   ├── .watch-brand                 // 主神空間／輪迴編號
│   ├── #current-scene-text         // 當前位置
│   ├── #scenario-time-badge        // 剩餘回合與時間狀態
│   └── .watch-objective
│       ├── #scenario-node-title    // playerGoal
│       └── #scenario-progress-*    // 主線進度
├── .watch-threat
│   ├── #scenario-threat-label
│   └── #scenario-threat-pips
└── .watch-actions                   // 主神兌換、休息、戰鬥按鈕
```

手錶的外觀使用檔案紙、銀灰金屬邊、冷白讀數與鏽紅迫近指示；平時不使用霓虹綠。骰子覆蓋層 `#dice-roll-overlay` 不放入手錶容器，也不修改它的 SVG、class、動畫或結算流程。

## Tailwind 整合方式

現有專案以 Tailwind utility 搭配 `public/index.html` 的 component CSS。第一版採「HTML utility 負責尺寸與排列、archive component CSS 負責材質與狀態」的方式：

```html
<div id="watch-hud" class="watch-hud shrink-0" role="status" aria-live="polite">
  <div class="watch-face flex items-stretch gap-3 px-3 py-2.5">
    <div class="watch-readout min-w-0 flex-1">
      <div class="watch-kicker text-[10px] font-mono">輪迴者手錶</div>
      <div id="scenario-node-title" class="watch-objective truncate">—</div>
    </div>
    <div class="watch-metrics flex items-center gap-2 text-[10px] font-mono">
      <span id="scenario-time-badge" class="watch-time"></span>
      <span id="scenario-threat-pips" class="watch-pips"></span>
    </div>
  </div>
</div>
```

不用在 JS 裡拼 Tailwind class；`updateScenarioHud()` 只更新既有內容與 `TIME_STATUS_STYLE`。狀態色透過 `watch-time` 的 `data-status` 或既有 class 映射處理，避免每次回合把完整樣式寫進邏輯。

## 遊戲感的第一版範圍

這一輪不做真正的場景地圖、3D 光球互動或新的資源系統。先完成三個可驗證的視覺切片：

1. 玩家從白色平台 hub 看見「前往任務」這個明確入口，而不是看到三個平等的後台按鈕。
2. 進入副本後，手錶 HUD 固定顯示玩家在哪裡、下一個目標、還剩多少回合、威脅距離多遠。
3. Decision Card 的數值資訊退到手錶與卡片底部，行動文字和 hint 成為第一眼資訊；原版骰子動畫仍在玩家按下高風險行動後接管畫面。

## 文案重寫邊界

`content/chargen/lifePath.js` 只改 `title`、`subtitle`、`label`、`detail`、`echo`、`story`、trait description 等玩家可見文字；不改 id、權重、六維屬性、十技能、七美德／七惡德鍵與回傳結構。

`content/chargen/awakening.js` 只改 `AWAKENING_TRANSITION`、`DEFAULT_ARRIVAL`、`system.header`、`system.footer` 以及固定的語氣文字；保留 `shieldSeconds`、`RESHAPE_POINTS`、`RESHAPE_ATTRIBUTE_CAP`、`collectEchoes()` 與 `composeAwakening()` 的資料契約。

所有固定文案避免「不是……而是……」、硬湊三段排比與過度破折號。入口維持普通現代人的電腦經驗；甦醒後才使用主神空間、輪迴者、防護罩、肉體重塑與主神記錄等世界內語彙。
