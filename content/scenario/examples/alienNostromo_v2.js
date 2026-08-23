// [內容包] 《異形：生化深淵》V2 —— 目前 runtime 相容基底版。
//
// 這份檔案只使用目前 content/scenario/schema.js 已正式支援的欄位：
// briefing、timeWindow、arrivalNarration、threatTrack、threatEncounter、entries、
// openingScene、openingNarration、openingOptions、timeLimitRounds、onExpireNodeId、
// nodes、bossEncounter。
//
// 重大場景的事件卡、物品、NPC 狀態與結果 effects 另存於
// alienNostromo_v2_gm_reference.json。runtime 會透過 registry 與 referenceAdapter 載入 sidecar，
// 但不要把 reference JSON 直接當成現有 scenario pack 註冊。
//
// [版權] 文字為本專案重新撰寫的同人劇本資料，不複製原作台詞或劇本段落。

const XENOMORPH = {
  name: "異形",
  attributes: { 力量: 3, 敏捷: 3, 耐力: 3, 智力: 2, 感知: 2, 意志: 3 },
  skills: { 格鬥: 2 },
  weaponKey: "unarmed",
  armor: 1,
  size: 6,
  telegraphs: [
    "異形壓低了身體，尾巴在身後高高翹起",
    "牠的內顎在外顎後方緩慢伸縮，黏液牽成長絲滴在地板上",
    "牠側過光滑的長頭顱，把沒有眼睛的臉對準你剛才發出聲音的方向",
    "牠的爪子扣進管線縫隙，整個身體往天花板上挪了半個身位",
    "牠停住不動，只有尾尖在空中極慢地畫著弧",
  ],
};

export const NOSTROMO_SCENARIO_V2 = {
  id: "scenario.nostromo-01-v2",
  type: "副本",
  version: "2.0.0",
  sourceRef:
    "[設計] 《異形：生化深淵》V2。runtime 相容基底版；重大事件 reference 另存於 alienNostromo_v2_gm_reference.json。文字為本專案自行撰寫的同人劇本資料。",
  gmReferenceId: "reference.alien-nostromo-01-v2",
  difficulty: "困難",

  // 速度榜的 server-side 政策：每剩一個效率回合換一點，最多 50 點；不接受 AI 或前端覆寫。
  speedReward: { pointsPerRemainingRound: 1, maxPoints: 50 },

  briefing: {
    title: "USCSS 諾斯托羅莫號",
    premise:
      "商業拖船正在返回地球的航線上。船上有一隻已經成體的異形，" +
      "牠利用通風管道在全船移動；原本的船員大多已經失蹤或死亡，船載電腦仍然運作。",
    objective: "活著抵達船腹的接駁艇「水仙號」，並處理跟著你上船的異形。",
    caution: "你不需要證明自己能打贏它；你需要辨認風險、保存資源、利用船艦和時間活下來。",
  },

  timeWindow: {
    entryPoint: "船員開始失蹤之後、諾斯托羅莫號自毀之前",
    span: "副本共提供五十個行動回合；回合是玩家可支配的效率資源，剩餘回合會在結算時轉化為速度獎勵。啟動主機超載後仍可行動，但逃生路線與威脅會更危險。",
  },

  arrivalNarration:
    "你發現自己躺在金屬網格地板上，周圍是閃爍著警報紅光的休眠艙。" +
    "刺耳的廣播女聲反覆說著：「MU-TH-UR 6000，緊急程序已啟動。」\n\n" +
    "你正想爬起身，卻發現自己被一層半透明的微光防護罩籠罩著。",

  threatTrack: {
    name: "異形迫近度",
    subject: "異形",
    stages: {
      潛伏:
        "牠在船的另一端。你只能看到牠留下的東西：被撞凹的管線、尚未乾涸的黏液、" +
        "掛在格柵上的半透明皮膜。",
      追蹤:
        "動作偵測器出現不規則回訊。艙門在遠處被打開又關上，位置一次比一次近；" +
        "你已經知道牠正在按照聲音和震動縮短距離。",
      貼近:
        "牠就在同一段走廊裡。天花板格柵在承重下彎曲，冷凝水被震落，" +
        "空氣裡有一種聞過就不會忘記的酸腐味。你和牠之間只隔著一道門或一排貨櫃。",
      接觸:
        "牠從陰影裡直起身，比一個人高得多。金屬般的內顎垂著黏絲，" +
        "這個距離已經沒有可以依賴的遮蔽物。",
    },
  },

  threatEncounter: XENOMORPH,

  entries: [
    {
      id: "ch1",
      name: "第一章：諾斯托羅莫號",
      timeLimitRounds: 50,
      onExpireNodeId: "n-expire",

      // 給 AI 的事實背景，不是直接印給玩家的故事文字。
      openingScene:
        "地點：商業拖船 USCSS 諾斯托羅莫號，船上載有兩千萬噸礦砂與精煉設施，" +
        "原定返回地球。船上有一隻成體異形，能經由通風管道移動，原本的船員多數失蹤或死亡。" +
        "船載電腦 MU-TH-UR 6000 仍在運作，且收到過一條公司特別指令：優先取得該生物，" +
        "其他考量次之，船員可視為可犧牲。玩家是剛被主神空間投放進來的輪迴者，" +
        "在休眠室甦醒，其他船員不認識玩家。主要逃生路線是船腹的接駁艇水仙號。",

      openingNarration: `防護罩無聲地散開，那層微光收進地板的縫隙裡，休眠室重新被船艦的噪音填滿。

你吸進第一口沒有被隔開的空氣。那口氣又冷又乾，帶著金屬、消毒劑和陳年濾網的味道。格柵地板下方有細小的水珠沿著管線滴落，滴答聲每隔幾秒重複一次。

休眠室裡有七座艙。其他六座全開著，內襯上仍留著人形凹痕，卻沒有一個人。靠近牆角的那座艙門半掩，邊緣沾著一層已經乾掉的暗色痕跡。牆上的燈每隔幾秒暗一次；燈光熄滅時，房間只剩下通風管裡極輕的金屬摩擦聲。

你低頭看見手背上的醫療監控貼片，編號下方印著 WEYLAND-YUTANI ／ USCSS NOSTROMO。身上的灰色工作服尺寸剛好，袖口磨得起毛，像是有人在你之前穿過它。

天花板的擴音器接通。電流雜訊之後，一個女聲平穩地說：「MU-TH-UR 6000。緊急程序已啟動。全體船員請至 A 甲板橋樓。」播完，停三秒，再播一次。第三次播放時，你聽見句尾多了一個短暫的等待音，像是在等某個人回答。

通往走廊的門半開著，卡在滑軌上。門縫外的地面有一道拖行痕跡，暗色液體從門口一路延伸進黑暗，寬度大約是一個成年人的肩膀。痕跡旁躺著一支手電筒，還亮著。

頭頂的通風管傳來金屬受壓的聲音。很輕。一下，然後停住。`,

      openingOptions: [
        {
          label: "撿起手電筒照拖痕",
          hint: "想知道痕跡通往哪裡",
          requiresCheck: true,
          attribute: "感知",
          skill: "偵察",
          difficulty: "容易",
        },
        {
          label: "把卡住的艙門推回去",
          hint: "想先確保身後安全",
          requiresCheck: true,
          attribute: "力量",
          skill: "體魄",
          difficulty: "普通",
        },
        {
          label: "對母親回話",
          hint: "想問出船上發生什麼",
          requiresCheck: false,
          attribute: null,
          skill: null,
          difficulty: null,
        },
        {
          label: "避開通風口摸進走廊",
          hint: "想不驚動藏起來的東西",
          requiresCheck: true,
          attribute: "敏捷",
          skill: "潛行",
          difficulty: "普通",
        },
      ],

      nodes: [
        {
          id: "n1",
          title: "空船",
          playerGoal: "離開休眠室，確認船艦現況、倖存者位置與最初的逃生方向。",
          canonSummary:
            "輪迴者離開休眠室，在 A 甲板確認船員不是正常撤離，而是接連失蹤或死亡；" +
            "拖行痕跡與通風系統顯示船上仍有另一個能移動、體型遠大於人的掠食者。" +
            "輪迴者掌握休眠室、橋樓、科學區、機艙與船腹接駁艇的基本位置。",
          prerequisites: [],
          baseRewardPoints: 150,
          baseDC: 1,
        },
        {
          id: "n2",
          title: "母親的特別指令",
          playerGoal: "取得能證明公司目的的情報，確認是否存在可等待的救援。",
          canonSummary:
            "輪迴者從 MU-TH-UR 6000 或科學區紀錄中取得特別指令 937：" +
            "優先採集該生物，其他考量次之，船員可視為可犧牲。" +
            "輪迴者因此知道正常救援不會到來，必須自行選擇離船並承擔啟動超載的代價。",
          prerequisites: ["n1"],
          baseRewardPoints: 400,
          baseDC: 2,
        },
        {
          id: "n3",
          title: "最後的逃生窗口",
          playerGoal: "啟動主機超載，並在五十回合效率預算耗盡前抵達水仙號；玩家可以用更多回合調查與準備，以換取更高品質的結局。",
          canonSummary:
            "輪迴者決定啟動諾斯托羅莫號的主機超載程序，穿過已經惡化的下層甲板前往水仙號。" +
            "啟動超載後，時間預算仍由引擎以回合計算；回合代表效率獎勵的減少，" +
            "並使異形迫近度升高。",
          prerequisites: ["n2"],
          baseRewardPoints: 700,
          baseDC: 3,
        },
        {
          id: "n4",
          title: "最終戰：水仙號上的乘客",
          playerGoal: "在水仙號狹窄的艙室內，處理跟著玩家登艇的成體異形。",
          canonSummary:
            "輪迴者成功抵達水仙號，卻發現異形早已藏在生命維持管線與氣閘附近。" +
            "接駁艇內沒有可長時間迴避的隔間，玩家必須利用安全繩、氣閘、推進器、" +
            "可用工具與倖存 NPC 的協助，完成一場有明確風險的終局戰。",
          prerequisites: ["n3"],
          baseRewardPoints: 1500,
          baseDC: 4,
          isFinale: true,
          bossEncounter: XENOMORPH,
        },
        {
          id: "n-expire",
          title: "劣化結局：來不及的逃生窗口",
          playerGoal: "在主機臨界與船體解體中活下來。",
          canonSummary:
            "時間預算耗盡時，諾斯托羅莫號進入不可逆的核心崩潰。" +
            "輪迴者未能正常完成水仙號逃生，可能在爆炸邊緣被主神機制撈回，" +
            "但不應獲得正常通關的獎勵、物品或 NPC 存活結果。",
          prerequisites: [],
          baseRewardPoints: 50,
          baseDC: 1,
        },
      ],
    },
  ],
};

export default NOSTROMO_SCENARIO_V2;
