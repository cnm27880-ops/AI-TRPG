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
  // [文字來源] 玩家提供的 Gemini 劇本文字是 canonical narrative source；規則與 effects 仍由 engine/reference 掌管。

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
    premise: "你點擊了神秘的網頁彈窗，隨後在深空採礦拖船諾斯托羅莫號的休眠艙中醒來。冰冷的金屬手錶扣在你的腕部，提示你已經被捲入致命的輪迴世界。走廊深處充斥著腐蝕性黏液與拖拽血痕，資深輪迴者正握緊手槍注視著四周。",
    objective: "查明船員失蹤真相，獲取母神電腦情報，在主神倒數結束前抵達接駁艇「水仙號」逃離。",
    caution: "船內存在極度致命的非人生物，常規物理攻擊效果有限且伴隨強酸濺射。不要脫離隊伍或盲目進入狹窄通風管。",
  },

  timeWindow: {
    entryPoint: "船員開始失蹤之後、諾斯托羅莫號自毀之前",
    span: "副本共提供五十個行動回合；回合是玩家可支配的效率資源，剩餘回合會在結算時轉化為速度獎勵。啟動主機超載後仍可行動，但逃生路線與威脅會更危險。",
  },

  arrivalNarration:
    "意識從無底深淵中被猛然拽回。你的大腦像被灌了鉛一樣脹痛，視野一片昏暗，冰冷的金屬地板正透過單薄的衣物刺激著神經。你驚愕地發現自己身處一個完全陌生的地方，而周圍正籠罩著一層正在逐漸變薄的半透明微光防護罩。",

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

      openingNarration: `腦袋像是要裂開一樣疼。你猛地坐起身大口喘息，滿嘴都是冰冷黏稠的金屬味。

你清楚記得自己上一秒還坐在電腦前，螢幕上突然跳出一個奇怪的彈窗：「想明白生命的意義嗎？想真正的……活著嗎？」你以為是某種惡作劇病毒，順手點了「YES」，緊接著整個人就被吸進了黑暗。

低頭看去，你身上穿著一套滿是油污的灰色工作服，胸口貼著幾枚微弱閃爍的醫療貼片。更詭異的是，你的左手腕上多了一塊冰冷沉重的黑色金屬腕錶，螢幕正跳動著猩紅色的字跡：
【主線任務：在諾斯托羅莫號存活，搭乘水仙號逃生。當前時間預算：十四小時。】

微光防護罩在空氣中無聲碎裂，化作螢光消散。

「醒了就別在地上發呆，菜鳥。」

一把冰冷沙啞的聲音從旁邊傳來。一名靠在休眠艙邊緣的男子神色漠然，手裡正熟練地擺弄著一把大口徑黑色手槍。他的左腕上戴著一模一樣的金屬腕錶，眼神像刀子一樣在你們幾個人身上掃過。

這是一間昏暗的環形休眠室。中央主控台反覆跳動著刺眼的黃色警告，通往主走廊的氣閘門半開著，門框鋼板被某種巨力硬生生撕裂，斷口處掛著半透明的黏液。一道暗紅色的拖拽血跡從門口一路延伸進被扯開的通風管深處。

空氣中瀰漫著鐵鏽與酸腐的怪味。通風管內部，正傳來某種龐然大物在金屬管壁上緩慢爬行的刮擦聲。`,

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
        { label: "避開通風口摸進走廊",
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
          // 「確認船艦現況、倖存者位置與最初的逃生方向」= 接觸到倖存者 + 手上有一條
          // 關於船上還有東西在動的線索。在此之前這個節點的完成判準是「走出科學區的門」。
          //
          // 兩項都刻意給多個來源：flag_luyuan_met 有五個產生點（其中 app_deck_luyuan_contact
          // 是 requiresCheck:false 的自動結果），線索三選一分別來自休眠室、A 甲板與貨艙。
          // 證據閘門的目的是擋掉「路過就算完成」，不是逼玩家骰到特定結果。
          completionEvidence: [
            { anyFlags: ["flag_luyuan_met"] },
            { anyClues: ["clue_alien_trace", "clue_motion_route", "clue_brett_fate"] },
          ],
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
          // 「取得能證明公司目的的情報」= 真的讀到 937，不是走進母核心又走出來。
          //
          // 接受線索或任何一個 937 旗標：資料裡這件事有三個層級
          // （flag_937_partial 片段 / flag_order_937_revealed 完整 / flag_937_evidence_saved 帶得走），
          // 任何一級都算「知道公司放棄了船員」。flag_937_path_known 是從 evt_meet_ash
          // 的終端偷看來的另一條路，同樣算數——證據鏈允許不同走法，只是不允許零證據。
          //
          // 這條閘門有保底：app_order_manual_read 是 requiresCheck:false，
          // 只要在母核心讀那張自動列印的摘要就一定拿得到 clue_order_937。
          completionEvidence: [
            {
              any: [
                { anyClues: ["clue_order_937"] },
                {
                  anyFlags: [
                    "flag_937_partial",
                    "flag_order_937_revealed",
                    "flag_937_evidence_saved",
                    "flag_937_path_known",
                  ],
                },
              ],
            },
          ],
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
          // 這個節點的目標有兩半：「啟動主機超載」與「抵達水仙號」。
          //
          // 有意義的那一半是 flag_overload_active——它有三條 approach 可以拿到
          // （其中 app_overload_parker 是「容易」），而且連 app_overload_manual 的慘烈失敗
          // 都會設它。單獨要求它才是真正的閘門。
          //
          // [取捨] 仍然接受 flag_escaped_to_narcissus，理由是避免把最終戰鎖死：
          // n4 的前置是 n3，玩家如果在 evt_trigger_overload 全部失敗又離場，
          // 之後就沒有回頭路（sceneExit.canReturn:false），n3 永遠完不成 → 整場無法結算。
          // 這個旗標由 evt_vent_ambush_escape 幾乎所有結果寫入，代表「通風管逃生真的跑完了」，
          // 不是「走進了某個房間」，所以它是節點目標的另一半，不是繞道。
          completionEvidence: [
            { any: [{ allFlags: ["flag_overload_active"] }, { allFlags: ["flag_escaped_to_narcissus"] }] },
          ],
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
