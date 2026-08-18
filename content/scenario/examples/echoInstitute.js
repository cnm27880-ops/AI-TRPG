// [設計] 內建範例副本 —— 給使用者第一次測試「副本系統」用的完整範例，不是規則書內容。
//
// 為什麼是 .js 檔而不是 content/packs/ 底下的 .json：這個專案裡所有「執行期真的會被
// functions/ 匯入使用」的資料，一律是普通 JS 模組匯出物件(參考 content/combat/placeholderEncounters.js
// 的 PLACEHOLDER_ENEMY、content/characterBuilder.js 的 ARCHETYPES)，因為 Cloudflare Workers
// 執行環境沒有檔案系統，`import x from "./file.json"` 在 Node 測試環境還需要額外的 import
// attribute 語法支援，兩邊都要穩定運作最簡單的作法就是普通 JS 物件匯出。
// content/packs/*.json 那些檔案目前是「資料格式範例」，還沒有接上任何執行期載入器
// (見 content/loader.js 檔頭)，之後工坊/後台上架機制做出來時才會真正讀取那些檔案。
//
// 結構對照 content/scenario/schema.js：初始場景(chapter.openingScene) + 三個重大節點
// (n1~n3) + 一個最終戰節點(n4, isFinale)，符合這次使用者要求的「固定格式」。
// 章節帶了時間預算(timeLimitRounds)示範「副本都有時間限制」；timeWindow 欄位示範
// 未來「大系列作品」跨副本時間軸定位需要的資料形狀(目前只是描述性文字，見 schema.js 說明)。

export const ECHO_INSTITUTE_SCENARIO = {
  id: "scenario.echo-institute-01",
  type: "副本",
  version: "1.0.0",
  sourceRef: "[設計] 內建範例副本，非規則書內容，用來驗證副本系統(節點推進/扭轉度/時間預算/最終戰)的完整迴圈",
  difficulty: "中等",
  timeWindow: {
    entryPoint: "獨立世界觀，不掛在任何已知作品的時間軸上",
    span: "副本內時間約72小時(劇情內時間，非現實回合數)",
  },
  entries: [
    {
      id: "ch1",
      name: "第一章：迴聲研究所",
      timeLimitRounds: 16,
      onExpireNodeId: "n-expire",
      openingScene:
        "你在一間狹小的隔離艙裡甦醒，艙壁上凝結著水珠，遠處的警報燈以固定頻率明滅。" +
        "牆上的老式螢幕反覆播放同一句話：『回聲協定啟動，全員進入緊急隔離』。" +
        "你的輪迴者系統在意識邊緣低語：新手保護結界仍在運作，但不會永遠持續下去。",
      nodes: [
        {
          id: "n1",
          title: "醒來的代價",
          canonSummary:
            "輪迴者於迴聲研究所B3隔離艙甦醒，新手保護結界啟動，安然度過甦醒後最脆弱的十分鐘，" +
            "未在保護期內與任何威脅正面接觸，並找到隔離艙外的走廊地圖。",
          prerequisites: [],
          baseRewardPoints: 150,
          baseDC: 1,
        },
        {
          id: "n2",
          title: "監控室的真相",
          canonSummary:
            "輪迴者潛入三樓監控室，調閱錄像得知研究所因『回聲協定』實驗失控而封鎖：" +
            "協定原本用來複製受試者的意識回聲，卻意外讓回聲脫離原主體，反過來吞噬活人軀殼，" +
            "變成研究員口中的『容器』。輪迴者確認了容器的活動路徑並未被容器發現。",
          prerequisites: ["n1"],
          baseRewardPoints: 400,
          baseDC: 2,
        },
        {
          id: "n3",
          title: "封鎖線的抉擇",
          canonSummary:
            "輪迴者抵達地面封鎖線，遇上一批同樣受困、彈盡援絕的研究員。他們請求輪迴者護送他們" +
            "穿越核心區撤離，但這會拖慢腳步、也可能引來容器注意。輪迴者做出了明確的抉擇" +
            "(帶走或不帶走)，且這個抉擇後來確實影響了核心區的最終遭遇。",
          prerequisites: ["n2"],
          baseRewardPoints: 700,
          baseDC: 3,
        },
        {
          id: "n4",
          title: "最終戰：回聲容器",
          canonSummary:
            "輪迴者抵達研究所核心區，唯一出口被『回聲容器』——實驗失控後產生的高階實驗體——堵死。" +
            "容器保留著原受試者的部分記憶片段，會用受害者的聲音說話動搖輪迴者的意志，" +
            "但最終仍以正面戰鬥收場，輪迴者擊敗容器後奪回出口控制權，成功脫離這場輪迴任務。",
          prerequisites: ["n3"],
          baseRewardPoints: 1500,
          baseDC: 4,
          isFinale: true,
          bossEncounter: {
            name: "回聲容器",
            attributes: { 力量: 3, 敏捷: 2, 耐力: 4, 智力: 1, 感知: 2, 意志: 3 },
            skills: { 格鬥: 2 },
            weaponKey: "unarmed",
            armor: 1,
            size: 6,
            // 意圖預告：每輪開始時抽一句給玩家看（見 content/combat/encounterState.js）。
            // 純敘事資料，不影響任何數值。
            telegraphs: [
              "容器的軀幹開始復誦你剛才說過的半句話，一個音節一個音節地對齊",
              "它把兩隻手臂舉到跟肩膀同高，掌心朝向你，像在測量距離",
              "牆上的喇叭同時嘯叫，容器隨著那個頻率一起顫抖",
              "它退了半步，腳下的積水漾開一圈又一圈的同心圓",
            ],
          },
        },
        {
          id: "n-expire",
          title: "劣化結局：警報淹沒了一切",
          canonSummary:
            "時間預算耗盡：研究所的自毀警報比輪迴者更快一步。核心區在輪迴者抵達前提前崩塌封死，" +
            "輪迴者被迫從次要通道狼狽逃生，雖然保住性命，但錯過了直面『回聲容器』、" +
            "徹底了結這場失控實驗的機會，只帶著滿身狼狽與比原本更少的收穫離開輪迴空間。",
          prerequisites: [],
          baseRewardPoints: 50,
          baseDC: 1,
        },
      ],
    },
  ],
};
