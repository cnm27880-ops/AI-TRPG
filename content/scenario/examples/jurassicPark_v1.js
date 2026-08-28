// [內容包] 《努布拉島：維修站撤離》V1 —— 第二個 runtime 相容副本。
//
// 這份檔案只使用 content/scenario/schema.js 已正式支援的欄位：
// briefing、timeWindow、arrivalNarration、threatTrack、threatEncounter、entries、
// openingScene、openingNarration、openingOptions、timeLimitRounds、onExpireNodeId、
// nodes、bossEncounter、speedReward。
//
// 事件卡、物品、NPC、線索、問題、路線與結局條件另存於
// jurassicPark_v1_gm_reference.json（authoring 來源）與同名 .js（Cloudflare 相容產物）。
// runtime 透過 registry 與 referenceAdapter 載入 sidecar，不把 reference 直接註冊成 scenario pack。
//
// [文字來源] 玩家提供的 Gemini 七批次產出是 canonical narrative source；
// 規則、effects、旗標與結局判定仍由 engine/reference 掌管。
// 批次 proposal 轉成 canonical 的差異列在 reference 的 authoredDeviations。

const TYRANNOSAURUS = {
  name: "成體霸王龍",
  attributes: { 力量: 6, 敏捷: 3, 耐力: 5, 智力: 1, 感知: 4, 意志: 4 },
  skills: { 格鬥: 3 },
  weaponKey: "unarmed",
  armor: 2,
  size: 10,
  telegraphs: [
    "牠把頭顱壓低到與你同高，鼻孔噴出的熱氣在冷雨裡凝成白霧",
    "巨大的後肢在泥濘裡調整了半步，整片水泥地隨之震動",
    "牠停住不動，只有琥珀色的豎瞳在探照燈光下微微收縮",
    "牠側過頭，把耳孔對準你剛才發出聲音的方向",
    "牠的尾巴在身後緩緩擺動，掃過的防風網一片片脫落",
  ],
};

export const ISLA_NUBLAR_SCENARIO_V1 = {
  id: "scenario.jurassic-park-01-v1",
  type: "副本",
  version: "1.0.0",
  sourceRef:
    "[設計] 《努布拉島：維修站撤離》V1。runtime 相容基底版；事件 reference 另存於 jurassicPark_v1_gm_reference.json。文字為本專案自行撰寫的同人劇本資料。",
  gmReferenceId: "reference.jurassic-park-01-v1",
  difficulty: "中等",

  // 速度榜的 server-side 政策：每剩一個效率回合換一點，最多 40 點；不接受 AI 或前端覆寫。
  speedReward: { pointsPerRemainingRound: 1, maxPoints: 40 },

  briefing: {
    title: "努布拉島：B區維修站",
    premise:
      "五級熱帶暴風雨籠罩努布拉島。B區副維修站的防護高壓電網在兩小時前全面跳脫，站點與主控中心通訊中斷。多種掠食恐龍已突破外圍鋼纜圍欄，備用柴油發電機停擺，低溫胚胎庫面臨失溫失效。",
    objective:
      "查明維修站受損狀況，重啟地下備用發電機或構建應急供電旁路，保護或處置關鍵胚胎樣本，並在最後撤離直升機離開前抵達南側懸崖停機坪。",
    caution:
      "暴雨會嚴重遮蔽視線並掩蓋掠食者的腳步聲。請注意積水中的漏電電纜，切勿在無照明的露天泥濘區域長時間滯留。",
  },

  timeWindow: {
    entryPoint: "暴風雨登陸當夜，全島電網被惡意關閉後約兩小時",
    span:
      "副本共提供四十個行動回合；回合是玩家可支配的效率資源，剩餘回合會在結算時轉化為速度獎勵。撤離窗口關閉後仍可行動，但只剩下滯留求生的路線。",
  },

  arrivalNarration:
    "暴雨砸在鐵皮屋頂上，發出震耳欲聾的連綿悶響。冷風挾帶濃重的泥腥味與機油氣息，從四面八方的通風縫隙灌進來。地面伴隨遠處的沉重撞擊微幅顫動，隱約夾雜著某種爬行動物尖銳的嘶鳴。你的四肢剛從僵硬麻木中恢復知覺，周身正籠罩著一層泛著淡藍色螢光的半透明防護罩，將外界狂暴的風雨與刺骨寒意完全隔絕。",

  threatTrack: {
    name: "掠食者侵入度",
    subject: "掠食恐龍",
    stages: {
      潛伏:
        "牠們還在圍欄之外。你只能看到牠們留下的東西：被壓垮的鋼纜、泥地上還沒被雨水填平的三趾深印、" +
        "門把上尚未乾涸的黏液。",
      追蹤:
        "圍欄的破口已經被反覆穿越。露天空地上的水花不再只有雨造成的，" +
        "某個東西正在依照聲音縮短距離，而你已經能判斷牠從哪個方向來。",
      貼近:
        "牠進了建築群。通風格柵在承重下彎曲，天花板落下細碎的鐵鏽，" +
        "走廊盡頭的積水泛起不屬於你的漣漪。你和牠之間只隔著一道門或一排貨架。",
      接觸:
        "牠從陰影裡直起身，比一個人高得多。鐮刀狀的趾爪在地板上敲出清脆的節奏，" +
        "這個距離已經沒有可以依賴的遮蔽物。",
    },
  },

  threatEncounter: TYRANNOSAURUS,

  entries: [
    {
      id: "ch1",
      name: "努布拉島：維修站撤離",
      timeLimitRounds: 40,
      onExpireNodeId: "n-expire",

      // 給 AI 的事實背景，不是直接印給玩家的故事文字。
      openingScene:
        "地點：努布拉島南側 B 區副維修站，包含露天裝卸坪、地下發電機房、冷藏胚胎副實驗室、" +
        "地底維修管廊與南側懸崖停機坪。全島高壓電網在兩小時前被主控中心的惡意腳本關閉，" +
        "圍欄失效，雙脊龍與迅猛龍已進入站區，一隻成體霸王龍正沿山道接近停機坪。" +
        "站內仍有兩名生還者：受困於工具間的機電維修主管，以及受困於實驗室氣密操作間的助理遺傳學者。" +
        "玩家是剛被投放進來的輪迴者，身分是外包技術與安保支援人員，不認識站內任何人。" +
        "唯一的撤離手段是南側停機坪那架已經在倒數的雙引擎工作直升機。",

      openingNarration: `淡藍色的半透明防護罩悄然碎裂，化作光點消散在雨幕中。冰冷的雨水瞬間打濕面頰，暴風雨的咆哮與警報蜂鳴聲灌入耳膜。

你站在B區裝卸坪邊緣的防雨挑簷下，身上穿著一套沾滿泥水的外包工作服。左手腕上多了一塊冰冷沉重的黑色金屬腕錶，螢幕正跳動著猩紅色的字跡：
【主線任務：在 B 區維修站存活，搭乘南側停機坪的最後一架直升機撤離。當前時間預算：三小時。】

頭頂的黃色旋轉警示燈光芒微弱，照亮身前幾個關鍵方向：左側通往地下發電機房的重型防暴鐵門緊閉，門旁的磁卡讀卡器冒著黑煙與微弱電火花；右側通往胚胎副實驗室的走廊鐵門虛掩著，門把上殘留著暗紅色的抓痕；正前方泥濘的開闊空地上，陷在水坑裡的維修吉普車車燈筆直射向遠處被撕裂的高壓鐵絲網；而在你腳邊不遠處，鑄鐵雨水井蓋下正隱隱透出機械水泵的微光。

風雨愈發狂暴。遠處密林深處傳來一聲拖得很長的低鳴，然後是樹木折斷的聲音。`,

      openingOptions: [
        {
          label: "檢修地下發電機房門鎖",
          hint: "想短接被燒毀的線路打開動力核心的捷徑",
          requiresCheck: true,
          attribute: "智力",
          skill: "技藝",
          difficulty: "普通",
        },
        {
          label: "觀察空地吉普車與泥地痕跡",
          hint: "想確認車還能不能動，順便辨認腳印",
          requiresCheck: true,
          attribute: "感知",
          skill: "偵察",
          difficulty: "普通",
        },
        {
          label: "沿走廊潛行接近胚胎實驗室",
          hint: "想避開露天開闊地探查實驗室內部",
          requiresCheck: true,
          attribute: "敏捷",
          skill: "潛行",
          difficulty: "容易",
        },
        {
          label: "用對講機呼叫站內倖存頻道",
          hint: "想在掩體後方先找到還活著的人",
          requiresCheck: true,
          attribute: "意志",
          skill: "交涉",
          difficulty: "普通",
        },
      ],

      nodes: [
        {
          id: "n1",
          title: "暴風雨之夜",
          playerGoal: "確認維修站受損程度，選定一條進入建築群的路線。",
          canonSummary:
            "輪迴者在斷電的 B 區裝卸坪甦醒，確認防護電網已被撕開、掠食者已進入站區，" +
            "並從門鎖、側翼走廊、排水人孔或無線電之中選出第一條可用的路線進入設施內部。",
          prerequisites: [],
          baseRewardPoints: 120,
          baseDC: 1,
        },
        {
          id: "n2",
          title: "動力與冷卻",
          playerGoal: "恢復 B 區的供電，讓冷藏庫、排水泵與照明重新運作。",
          canonSummary:
            "輪迴者進入地下發電機房，在噪音、油氣與通風管內的威脅之間選擇手動重啟柴油機組、" +
            "重構蓄電池旁路或與受困技師協同操作，並在過程中接觸到電網是被人為關閉的證據。",
          prerequisites: ["n1"],
          baseRewardPoints: 300,
          baseDC: 2,
        },
        {
          id: "n3",
          title: "血腥迴廊",
          playerGoal: "處置低溫胚胎備份，並決定受困研究員的命運。",
          canonSummary:
            "輪迴者進入冷藏胚胎副實驗室，面對已經進入室內的迅猛龍，" +
            "在營救、正面壓制、銷毀樣本與私下交易之間做出一次不可逆的抉擇。",
          prerequisites: ["n1"],
          baseRewardPoints: 500,
          baseDC: 3,
        },
        {
          id: "n4",
          title: "最後撤離點",
          playerGoal: "突破或引開停機坪前的巨獸，完成撤離或為他人爭取升空的時間。",
          canonSummary:
            "輪迴者抵達南側懸崖停機坪，直升機已進入起飛倒數，一隻成體霸王龍阻斷了唯一的登機通道。" +
            "輪迴者必須用信號彈、車輛、機組協調或自我犧牲其中一種方式結束這一夜。",
          prerequisites: ["n1"],
          baseRewardPoints: 1200,
          baseDC: 4,
          isFinale: true,
          bossEncounter: TYRANNOSAURUS,
        },
        {
          id: "n-expire",
          title: "劣化結局：撤離窗口關閉",
          playerGoal: "在直升機離場之後，為自己找到一個能撐過今晚的位置。",
          canonSummary:
            "時間預算耗盡時，最後一架直升機被迫離場，撤離窗口永久關閉。" +
            "輪迴者只能退回地下掩體求生，不應獲得正常通關的獎勵、樣本結果或生還者結果。",
          prerequisites: [],
          baseRewardPoints: 40,
          baseDC: 1,
        },
      ],
    },
  ],
};

export default ISLA_NUBLAR_SCENARIO_V1;
