// Converted from the user-provided 包.txt and approved supplement material; content only, not a source of engine truth.
export default {
  "sourceFile": "包.txt",
  "sourceTitle": "《異形：生化深淵》V2 空間資料、移動轉場與 NPC 語氣庫（P0 核心內容包）",
  "sourcePackId": "scenario.nostromo-01-v2",
  "conversionStatus": "content_only_with_approved_exploration_gap_and_major_variants",
  "safetyNote": "本資料只提供玩家可見敘事、轉場旁白與已接觸 NPC 的語氣素材；canonical reference 與 engine effects 仍是唯一真相。重大場景 overlay 必須附著在已套用的 canonical result 上，不得自行新增狀態。",
  "canonicalLocationMap": {
    "loc_cryo": {
      "packageId": "loc_cryo",
      "status": "direct"
    },
    "loc_deck_a": {
      "packageId": "loc_deck_a",
      "status": "direct"
    },
    "loc_medbay": {
      "packageId": "loc_medbay",
      "status": "direct"
    },
    "loc_science": {
      "packageId": "loc_science",
      "status": "direct"
    },
    "loc_cargo": {
      "packageId": "loc_cargo",
      "status": "direct"
    },
    "loc_engine": {
      "packageId": "loc_engine",
      "status": "direct"
    },
    "loc_narcissus": {
      "packageId": "loc_narcissus",
      "status": "direct"
    },
    "loc_mother_core": {
      "packageId": "loc_mother",
      "status": "alias",
      "note": "包內 loc_mother 對應 canonical loc_mother_core"
    },
    "loc_narcissus_airlock": {
      "packageId": "loc_dock_narcissus",
      "status": "alias",
      "note": "包內 loc_dock_narcissus 對應 canonical loc_narcissus_airlock"
    },
    "loc_bridge": {
      "packageId": "loc_bridge",
      "status": "direct",
      "note": "補充二提供與 loc_deck_a 分離的艦橋主控艙描述。"
    },
    "loc_service_corridor": {
      "packageId": "loc_service_corridor",
      "status": "direct",
      "note": "補充二提供中層維修服務通道描述。"
    },
    "loc_lower_deck": {
      "packageId": "loc_lower_deck",
      "status": "direct",
      "note": "補充二提供下層甲板走廊描述。"
    }
  },
  "canonicalRouteMap": {
    "travel_cryo_deck_a": {
      "packageId": "travel_cryo_to_deck_a",
      "status": "direct"
    },
    "travel_engine_airlock": {
      "packageId": "travel_engine_to_dock_narcissus",
      "status": "direct"
    },
    "travel_airlock_narcissus": {
      "packageId": "travel_dock_to_narcissus",
      "status": "direct"
    },
    "travel_deck_a_science": {
      "packageId": "travel_deck_a_science",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_deck_a_cargo": {
      "packageId": "travel_deck_a_cargo",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_science_mother_core": {
      "packageId": "travel_science_mother_core",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_mother_core_engine": {
      "packageId": "travel_mother_core_engine",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_service_corridor_lower_deck": {
      "packageId": "travel_service_corridor_lower_deck",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_cargo_lower_deck": {
      "packageId": "travel_cargo_lower_deck",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_engine_lower_deck": {
      "packageId": "travel_engine_lower_deck",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_cargo_airlock": {
      "packageId": "travel_cargo_airlock",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_lower_deck_airlock": {
      "packageId": "travel_lower_deck_airlock",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_deck_a_medbay": {
      "packageId": "travel_deck_a_medbay",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_medbay_deck_a": {
      "packageId": "travel_medbay_deck_a",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_deck_a_bridge": {
      "packageId": "travel_deck_a_bridge",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_bridge_deck_a": {
      "packageId": "travel_bridge_deck_a",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    },
    "travel_cargo_deck_a": {
      "packageId": "travel_cargo_deck_a",
      "status": "direct",
      "note": "補充二已完成 canonical route 對照與公開轉場審核。"
    }
  },
  "locations": [
    {
      "id": "loc_cryo",
      "title": "休眠室",
      "sourcePlayerVisibleDescription": "環形艙室內排列著八具白色低溫休眠艙。中央主控台的綠色螢光螢幕閃爍著系統自檢代碼，冷卻循環風扇在頭頂低沉運轉。走廊氣閘門半開著，門框鋼板向外翻卷，暗紅色的血跡一路拖曳進通風管道。",
      "playerVisibleDescription": "環形艙室內排列著數具白色低溫休眠艙。中央主控台的螢光螢幕閃爍著系統自檢代碼，冷卻循環風扇在頭頂低沉運轉。走廊氣閘門半開著，門框鋼板向外翻卷，暗紅色的血跡一路拖曳進通風管道。",
      "atmosphere": "空氣冰冷刺骨，帶著機油與消毒劑的混合氣味。除了排風系統單調的嗡鳴，四周一片死寂。",
      "knownLandmarks": [
        {
          "id": "obj_cryo_pods",
          "sourceText": "八具休眠艙，其中三具艙蓋呈暴力開啟狀態。",
          "text": "多具休眠艙，其中幾具艙蓋呈暴力開啟狀態。"
        },
        {
          "id": "obj_cryo_console",
          "text": "環形控制台，滾動著船員生命體徵消失記錄。"
        },
        {
          "id": "obj_torn_vent",
          "text": "牆角被撕裂的通風管格柵，邊緣附著未乾黏液。"
        }
      ],
      "playerPurpose": "調取船員名冊、掌握全船平面圖，或確認自身剛甦醒時的生理狀態。",
      "visibleHazardHints": [
        "地板上的黏液正冒出微弱白煙，散發強烈酸性刺鼻氣味。",
        "通風管格柵向外翻折，顯示某種重物曾從此處強行鑽出。"
      ],
      "revisitVariants": [
        {
          "label": "常規回訪（無威脅）",
          "text": "休眠艙的指示燈轉為黃色待命狀態，地面的血跡已完全發黑凝固，只有通風口偶爾吹出微弱的冷氣。"
        },
        {
          "label": "高威脅／異形巡邏過後",
          "text": "天花板的兩具照明燈管被外力打碎，垂落的電線冒著火花，地面的拖拽血痕被新的發泡酸液覆蓋。"
        },
        {
          "label": "警報／自毀狀態",
          "text": "紅色旋轉警報燈將整個環形艙室染上一層血光，排風扇因斷電停轉，艙內充斥著悶熱的橡膠焦味。"
        }
      ]
    },
    {
      "id": "loc_deck_a",
      "title": "A 甲板 / 橋樓主走廊",
      "playerVisibleDescription": "拖船的核心指揮區。整排航行儀表板在昏暗中發出微弱微光，通訊控制台前散落著被扯斷的耳麥線纜，黑盒子終端指示燈以固定頻率閃爍。大面積前向觀測窗外是深邃無垠的星海。",
      "atmosphere": "氣壓穩定但氣溫偏低，空氣中瀰漫著電路板過熱的焦味。遠處儀表偶爾發出幾聲清脆的繼電器切換聲。",
      "knownLandmarks": [
        {
          "id": "obj_bridge_console",
          "text": "主駕駛與航行儀表台，多數導航雷達顯示離線。"
        },
        {
          "id": "obj_flight_recorder",
          "text": "黑盒子終端，記錄著降落 LV-426 的航行語音。"
        },
        {
          "id": "obj_observation_window",
          "text": "前向大型防爆觀測窗，可看見牽引精煉廠的巨大鋼纜。"
        }
      ],
      "playerPurpose": "獲取黑盒子航行記錄、向深空發送求救信號，或與代理指揮官 Ripley 接觸。",
      "visibleHazardHints": [
        "天花板維修蓋板半敞，內部管線有被外力扯斷的痕跡。",
        "走廊轉角處存在大片通訊盲區，無法用肉眼確認轉角後的動靜。"
      ],
      "revisitVariants": [
        {
          "label": "常規回訪",
          "text": "導航螢幕依然重複刷新著錯誤代碼，空蕩的副官席位在昏暗光線中顯得格外死寂。"
        },
        {
          "label": "高威脅狀態",
          "text": "觀測窗玻璃上留有兩道深可見骨的爪痕，地板上殘留著被扯碎的防護服碎片。"
        },
        {
          "label": "警報狀態",
          "text": "刺耳的防空警報在揚聲器中瘋狂迴盪，防爆閘門已下落一半，迫使通過者必須低頭彎腰。"
        }
      ]
    },
    {
      "id": "loc_medbay",
      "title": "醫療區",
      "playerVisibleDescription": "四壁皆為冷白色金屬的手術艙室。中央手術台上一片狼藉，胸腔固定金屬架向外扭曲崩斷，手術台中央被強酸溶出一個拳頭大小的空洞。低溫藥品保險櫃半開著，藥劑玻璃瓶碎落一地。",
      "atmosphere": "濃烈的福馬林與陳舊血腥味撲鼻而來，頭頂的無影燈斷續閃爍，發出低微的電流雜音。",
      "knownLandmarks": [
        {
          "id": "obj_surgical_bed",
          "text": "留有發黑胸腔創口痕跡的中央手術台。"
        },
        {
          "id": "obj_med_cabinet",
          "text": "破損的急救物資壁櫃，部分抽屜仍處於鎖死狀態。"
        },
        {
          "id": "obj_autodoc",
          "text": "光學鏡頭被物理打碎的自動診斷儀。"
        }
      ],
      "playerPurpose": "搜刮止血噴霧、抗生素等醫療物資，或查驗 Kane 的第一手致死創口。",
      "visibleHazardHints": [
        "手術台下方的金屬地板被酸液腐蝕穿透，露出下層跳火的電纜。",
        "醫療廢物桶內殘留著帶有神經毒素的黏液。"
      ],
      "revisitVariants": [
        {
          "label": "常規回訪",
          "text": "地面乾涸的血跡發黑發硬，閃爍的無影燈徹底熄滅，室內完全依賴手電筒照明。"
        },
        {
          "label": "警報狀態",
          "text": "冷藏保險箱斷電，液氮白霧沿著地板緩慢蔓延，能見度降至膝蓋以下。"
        }
      ]
    },
    {
      "id": "loc_science",
      "title": "科學實驗區",
      "playerVisibleDescription": "乾淨得近乎詭異的科研實驗室。數台高倍顯微鏡在冷白光下整齊排列，中央分析台擺放著裝有外星組織切片的培養皿。牆壁兩側立著數座生化標本冷藏槽，內部液體呈渾濁的淡藍色。",
      "atmosphere": "室溫維持在精確的攝氏十六度，沒有一絲機油雜味，只有高純度酒精與化學試劑的冰冷氣息。",
      "knownLandmarks": [
        {
          "id": "obj_ash_desk",
          "text": "科學官 Ash 的個人工作台，擺放著手寫筆記與顯微玻片。"
        },
        {
          "id": "obj_specimen_tanks",
          "text": "三座大型生化密封槽，其中一座已被排空。"
        },
        {
          "id": "obj_science_terminal",
          "text": "受密碼保護的科研數據終端。"
        }
      ],
      "playerPurpose": "獲取異形細胞分析報告、尋找科學官通行卡，或調查 Ash 的私人記錄。",
      "visibleHazardHints": [
        "排氣罩下方殘留著半透明的外骨骼碎屑，具有微弱腐蝕活性。",
        "實驗室大門具備獨立的遠程鎖定協議，隨時可能被外部權限封死。"
      ],
      "revisitVariants": [
        {
          "label": "Ash 被擊毀後",
          "text": "工作台翻倒，地面到處是白色人造乳膠液與扯斷的電線，終端螢幕反覆報錯。"
        },
        {
          "label": "警報狀態",
          "text": "生化冷藏槽全部釋放安全排氣，刺鼻的化學白煙充斥整個房間。"
        }
      ]
    },
    {
      "id": "loc_mother",
      "title": "主機核心房 MU-TH-UR 6000",
      "playerVisibleDescription": "半球形金色穹頂大廳。牆壁由數萬枚以極高頻率閃爍的微型黃色指示燈組成，正中央立著一台老式綠色螢光打字機終端。這裡安靜得能聽見自己的血液流動聲。",
      "atmosphere": "極端安靜且隔音，空氣乾燥溫暖，帶著微弱的臭氧味與巨型冷卻風扇的低頻共振。",
      "knownLandmarks": [
        {
          "id": "obj_mother_terminal",
          "text": "全船唯一的母神人機互動介面，附帶實體打字機與進紙滾輪。"
        },
        {
          "id": "obj_bulb_walls",
          "text": "圓形燈泡陣列牆，反映著主機運算核心的即時負載。"
        },
        {
          "id": "obj_vault_door",
          "text": "厚達數十公分的重型氣密旋轉門。"
        }
      ],
      "playerPurpose": "查詢特別指令 937、獲取全船最高權限代碼，或手動覆寫防禦程序。",
      "visibleHazardHints": [
        "氣密門一旦閉合，外部聲音完全無法傳入，極易形成封閉陷阱。",
        "終端自帶企業安全審計日誌，任何越權操作都會向特定設備發送警告。"
      ],
      "revisitVariants": [
        {
          "label": "查詢 937 指令後",
          "text": "打字機吐出的穿孔紙散落一地，四周黃色指示燈轉為不祥的暗橙色頻閃。"
        },
        {
          "label": "警報狀態",
          "text": "主機房所有照明轉為刺目的常紅，打字機持續自動敲擊輸出系統崩潰報告。"
        }
      ]
    },
    {
      "id": "loc_cargo",
      "title": "中央貨艙",
      "playerVisibleDescription": "深達三層樓的開闊金屬空間。數以百計的標準集裝箱堆疊成巨大的鋼鐵迷宮，頭頂垂落著無數銹蝕的起重吊鉤與鏈條。地面覆蓋著半尺深的冷凝積水，水滴聲在空曠處回響。",
      "atmosphere": "空氣潮濕陰冷，滿是鐵鏽與濕金屬的氣味。視野極差，手電筒光束在重重陰影中難以穿透。",
      "knownLandmarks": [
        {
          "id": "obj_crane_system",
          "text": "懸掛在軌道上的重型貨物起重機與懸臂吊鉤。"
        },
        {
          "id": "obj_cargo_locker",
          "text": "角落裡的鋼製維修工具櫃，配有重型工業掛鎖。"
        },
        {
          "id": "obj_water_puddle",
          "text": "覆蓋整個底層甲板的黑色冷卻水窪。"
        }
      ],
      "playerPurpose": "搜刮工程焊槍、重型扳手等工具，或利用貨櫃重物設置防禦陷阱。",
      "visibleHazardHints": [
        "高處懸掛的集裝箱在氣流中微微晃動，承重纜繩隨時可能斷裂。",
        "積水完全掩蓋了地面管線的凹坑與漏電危險。"
      ],
      "revisitVariants": [
        {
          "label": "常規回訪",
          "text": "水滴依然有節奏地滴落，但某些原本閉合的貨櫃門已被不明外力從外部拉開。"
        },
        {
          "label": "警報／高威脅",
          "text": "起重機警報燈狂閃，懸掛的鏈條劇烈碰撞發出金屬巨響，水面上漂浮著黏稠液體。"
        }
      ]
    },
    {
      "id": "loc_vent",
      "title": "通風管網絡",
      "playerVisibleDescription": "寬約一米的方形金屬管道網，縱橫交錯貫穿全船。管壁滿是灰塵、冷凝水與油污，轉角處時常可見被強酸腐蝕變形的氣閥格柵與半透明皮膜殘留。",
      "atmosphere": "極度壓抑狹窄，空氣溫熱且帶有濃重的酸腐腥氣。金屬管壁會將任何細微的刮擦聲放大數倍。",
      "knownLandmarks": [
        {
          "id": "obj_vent_junction",
          "text": "通往 A 甲板、貨艙與工程區的三向通風分流閥。"
        },
        {
          "id": "obj_acid_burn_grate",
          "text": "被強酸徹底熔斷的垂直排氣阻隔網。"
        }
      ],
      "playerPurpose": "避開鎖死走廊實施繞路、快速穿梭於甲板之間，或進行高風險匿蹤。",
      "visibleHazardHints": [
        "管道內部無法直立或轉身，遭遇威脅時無法進行常規格鬥或快速撤退。",
        "管壁隨處可見滴落的酸液，極易灼傷手膝。"
      ],
      "revisitVariants": [
        {
          "label": "異形處於此區域時",
          "text": "管道內部傳來骨骼摩擦的密集聲響，空氣溫度驟升，腥臭氣味令人窒息。"
        },
        {
          "label": "自毀超載後",
          "text": "管道充斥著高溫有毒廢氣，能見度降為零，通行需承受窒息判定。"
        }
      ]
    },
    {
      "id": "loc_engine",
      "title": "下層甲板 / 工程區",
      "playerVisibleDescription": "諾斯托羅莫號的心臟。四座粗大的反應爐冷卻導管直通地面，白色高壓蒸氣自管壁縫隙不斷噴出。巨大的引擎轟鳴震耳欲聾，地面隨處可見廢棄油桶與維修腳手架。",
      "atmosphere": "溫度高達攝氏四十度以上，空氣炙熱灼人，充斥著刺鼻的柴油、潤滑油與高壓蒸氣味。",
      "knownLandmarks": [
        {
          "id": "obj_coolant_pedestal",
          "text": "立有四根手動過載連桿的反應爐冷卻操作基座。"
        },
        {
          "id": "obj_steam_valves",
          "text": "兩側的高壓蒸氣排洩閥與減壓管道。"
        },
        {
          "id": "obj_engine_intercom",
          "text": "通往橋樓與生活區的防爆壁掛對講機。"
        }
      ],
      "playerPurpose": "拉下手動過載閥門啟動母船自毀，或尋找總工程師 Parker。",
      "visibleHazardHints": [
        "高溫蒸氣噴口隨機洩漏，直觸可造成嚴重二度燙傷。",
        "噪音過大，常規聽覺無法察覺數米之外的腳步動靜。"
      ],
      "revisitVariants": [
        {
          "label": "過載啟動後",
          "text": "四根閥門完全拉下，反應爐發出海嘯般的咆哮，刺眼紅光與滾燙白霧吞沒整個基座。"
        },
        {
          "label": "高威脅狀態",
          "text": "天花板管線被扯斷大半，垂落的電纜在積水中激起大片藍色電弧。"
        }
      ]
    },
    {
      "id": "loc_dock_narcissus",
      "title": "船腹接駁艇區",
      "playerVisibleDescription": "傾斜的金屬走廊通往水仙號的加壓氣閘。兩側掛著黃黑相間的逃生警示牌，金屬掛架上懸掛著兩套標準艦載宇航服與應急呼吸器。",
      "atmosphere": "氣壓略低於主甲板，空氣帶有新鮮氧氣的微甜感，伴隨著逃生系統待命的規律蜂鳴。",
      "knownLandmarks": [
        {
          "id": "obj_narcissus_hatch",
          "text": "水仙號的主加壓氣閘門，配有手動液壓解鎖轉輪。"
        },
        {
          "id": "obj_suit_rack",
          "text": "金屬太空服掛架，存有宇航服與安全牽引繩。"
        },
        {
          "id": "obj_dock_status_screen",
          "text": "顯示接駁艇燃料、氧氣與機械掛鉤鎖定狀態的螢幕。"
        }
      ],
      "playerPurpose": "穿戴宇航服、檢查接駁艇燃料參數，並登上水仙號。",
      "visibleHazardHints": [
        "接駁艇外部機械鎖定掛鉤在強震中可能發生物理卡死。",
        "此處為單向通道，一旦後方被封閉將失去所有退路。"
      ],
      "revisitVariants": [
        {
          "label": "自毀倒數階段",
          "text": "走廊兩側的逃生指示燈瘋狂頻閃，母船與接駁艇之間的對接口出現劇烈受壓形變。"
        },
        {
          "label": "異形破壞後",
          "text": "太空服掛架被利爪撕爛，其中一套宇航服被撕成碎片，地面留有血跡。"
        }
      ]
    },
    {
      "id": "loc_narcissus",
      "title": "水仙號內部",
      "playerVisibleDescription": "緊湊的雙人座逃生接駁艇駕駛艙。前方是並排的主副駕駛席，後方整齊排列著兩具白色低溫休眠艙與維生管線牆。舷窗外可直接俯瞰太空。",
      "atmosphere": "安靜而狹窄，空氣循環系統運轉良好，儀表板跳動著柔和的淡綠色燈光。",
      "knownLandmarks": [
        {
          "id": "obj_pilot_seat",
          "text": "配有手動脫離拉桿與主推進器點火開關的駕駛席。"
        },
        {
          "id": "obj_narcissus_cryo",
          "text": "兩具備有獨立維生系統的逃生休眠艙。"
        },
        {
          "id": "obj_shuttle_airlock_lever",
          "text": "手動強制外排氣閘的醒目紅色拉桿。"
        },
        {
          "id": "obj_harpoon_rack",
          "text": "固定在艙壁上的緊急防暴魚叉槍掛架。"
        }
      ],
      "playerPurpose": "解鎖物理掛鉤脫離母船、解決潛伏的最後威脅，並躺入休眠艙通關。",
      "visibleHazardHints": [
        "艙內空間極其狹窄，任何物理開火皆可能擊穿加壓艙壁引發失壓。",
        "外排氣閘一旦拉開，未固定安全繩的人員將被瞬間抽入太空。"
      ],
      "revisitVariants": [
        {
          "label": "脫離母船後",
          "text": "舷窗外諾斯托羅莫號的爆炸火光逐漸消退，座艙進入自動巡航模式。"
        },
        {
          "label": "異形現身後",
          "text": "後艙維生導管被外骨骼撐開，地面殘留強酸冰晶，座艙燈光轉為應急暗綠。"
        }
      ]
    },
    {
      "id": "loc_maintenance_shaft",
      "title": "垂直維修豎井",
      "playerVisibleDescription": "貫穿 A 甲板至下層甲板的圓形垂直通道。中央是一根固定在井壁上的鋼製攀爬梯，四周密密麻麻排滿了高壓電纜與冷卻導管，每隔十米設有一處狹窄的金屬檢修平台。",
      "atmosphere": "強烈的上下對流風在耳邊呼嘯，空氣帶著鐵鏽與臭氧味，回音極大。",
      "knownLandmarks": [
        {
          "id": "obj_ladder_rung",
          "text": "防滑金屬攀爬梯，部分階梯存在銹蝕形變。"
        },
        {
          "id": "obj_junction_box",
          "text": "三號甲板檢修平台上的手動分線盒。"
        }
      ],
      "playerPurpose": "在中央升降梯斷電時作為上下甲板的備用快速通道。",
      "visibleHazardHints": [
        "垂直高度超過三十米，失手墜落將直接造成致殘或死亡判定。",
        "異形在此處可利用垂直管道進行高速立體機動。"
      ],
      "revisitVariants": [
        {
          "label": "警報狀態",
          "text": "豎井內部的應急燈全部變為紅光，高壓風扇反向抽風，攀爬阻力大幅增加。"
        }
      ]
    },
    {
      "id": "loc_crew_quarters",
      "title": "船員生活區 / 休息室",
      "playerVisibleDescription": "原本用於船員休閒與用餐的長形艙室。中央擺著一張固定在地板上的金屬餐桌，牆邊立著幾排儲物櫃與咖啡機。桌上還留著半碗早已發霉乾涸的食物與打翻的紙牌。",
      "atmosphere": "生活氣息與死寂交織，空氣中有一股發酸的食物腐敗味，頂部日光燈發出低沉的嗡鳴。",
      "knownLandmarks": [
        {
          "id": "obj_mess_table",
          "text": "Kane 破胸事件發生時的原用餐桌，桌布留有撕裂痕跡。"
        },
        {
          "id": "obj_crew_lockers",
          "text": "船員個人儲物櫃，部分櫃門被暴力拉開。"
        }
      ],
      "playerPurpose": "搜救可能躲藏在此處的 Lambert，或翻找船員留下的私人物資與日記。",
      "visibleHazardHints": [
        "儲物櫃後方的通風百葉窗已被頂開，隨時可能有東西自暗處撲出。"
      ],
      "revisitVariants": [
        {
          "label": "搜刮過後",
          "text": "儲物櫃物品散落一地，日用品被踩碎，房間徹底化為廢墟。"
        },
        {
          "label": "警報狀態",
          "text": "生活區防火隔離門自動下落，空間被壓縮至原先的一半。"
        }
      ]
    }
  ],
  "transitions": [
    {
      "id": "travel_cryo_to_deck_a",
      "routeLabel": "休眠室 $\\rightarrow$ A 甲板橋樓",
      "standard": "你跨過半開的休眠室氣閘，穿過一段燈光昏暗的白色走廊。兩側的管線發出微弱的冷卻液流動聲，走廊盡頭的橋樓自動門感應到腳步，緩緩向兩側滑開。",
      "highThreat": "你壓低身形貼著走廊盲區前進。頭頂上方幾米處傳來金屬管壁受壓的細微呻吟，你屏住呼吸快步穿過開闊地帶，閃身進入橋樓金屬門後。",
      "alarm": "刺眼的旋轉紅光將走廊照得一片血紅。排氣閥噴出的熱氣撲面而來，你頂著刺耳的警笛低頭衝過走廊，重重撞進橋樓副控室。"
    },
    {
      "id": "travel_deck_a_to_cryo",
      "routeLabel": "A 甲板橋樓 $\\rightarrow$ 休眠室",
      "standard": "離開儀表閃爍的橋樓，沿著鋪有防滑橡膠的主通道返回。四周除了自己的腳步聲外一片死寂，休眠室的環形金屬拱門出現在前方。",
      "highThreat": "走廊拐角處的一處應急燈熄滅了。你握緊武器，每走三步便停下確認身後陰影，踩著乾涸的血跡迅速退回休眠室門口。",
      "alarm": "主走廊的自動防火門正在緩慢下落，你一個滑步從半截鋼門下穿過，帶著一身冷汗跌回休眠室內。"
    },
    {
      "id": "travel_cryo_to_medbay",
      "routeLabel": "休眠室 $\\rightarrow$ 醫療區",
      "standard": "推開休眠室側門，穿過一條短而窄的消毒過道。刺鼻的福馬林氣味越來越濃，醫療區卡死的門框就在前方幾步處。",
      "highThreat": "過道地面的發黑血痕在手電筒光束下泛著微光。你踩著乾燥的地面無聲滑行，避開了懸掛的斷裂電線，溜進醫療區門內。",
      "alarm": "消毒走廊的氣溶膠噴頭因短路不斷噴出嗆人的白霧，你在能見度極低的霧氣中摸索著冰冷的金屬門框，衝入醫療室。"
    },
    {
      "id": "travel_medbay_to_cryo",
      "routeLabel": "醫療區 $\\rightarrow$ 休眠室",
      "standard": "跨過醫療區滿地的玻璃碎屑，順著消毒過道返回。休眠室內微弱的黃色指示燈提供了穩定的視覺參照。",
      "highThreat": "身後的手術台方向隱約傳來金屬盤打翻的脆響。你沒有回頭，以最快速度無聲退回休眠室，反手拉上隔離門。",
      "alarm": "醫療區門框的液壓桿發出刺耳的悲鳴，你在門戶徹底鎖死前衝出過道，回到休眠室內。"
    },
    {
      "id": "travel_medbay_to_science",
      "routeLabel": "醫療區 $\\rightarrow$ 科學實驗區",
      "standard": "穿過醫療區後方的氣密連通道，手動輸入門禁序列。冷白色的無菌光線自門縫透出，科學實驗室的大門無聲滑開。",
      "highThreat": "連通道的氣壓調節閥突然發出急促的漏氣聲。你警惕地舉槍環顧四周，確認通風口無異動後迅速刷卡進入實驗室。",
      "alarm": "通道兩側的生化警示燈狂閃不止，你在強烈的化學氣味中撞開實驗區大門，身後的氣密門隨即沉重閉合。"
    },
    {
      "id": "travel_science_to_medbay",
      "routeLabel": "科學實驗區 $\\rightarrow$ 醫療區",
      "standard": "離開安靜的實驗室，穿過氣壓平衡室。冷白光被醫療區昏暗閃爍的無影燈取代，地面重新出現發黑的血污。",
      "highThreat": "身後的實驗室終端突然自動亮起。你加快腳步穿過連通道，閃身隱入醫療區手術台後的金屬陰影中。",
      "alarm": "氣壓平衡室的門鎖系統遭遇電湧，你用力扳動手動旁路把手，強行推開卡死的鋼門退回醫療區。"
    },
    {
      "id": "travel_deck_a_to_mother",
      "routeLabel": "A 甲板橋樓 $\\rightarrow$ 主機核心房",
      "standard": "穿過橋樓後方的純白色環形加壓走廊。這裡安靜得如同另一個世界，盡頭那扇沉重的圓形金屬氣密門靜靜立在前方。",
      "highThreat": "走廊兩側的指示燈以不規則的頻率跳動。你放輕腳步，皮靴踩在無塵地板上沒有發出一絲聲音，迅速抵達主機房門前。",
      "alarm": "加壓走廊的通風風扇發出低沉的咆哮，圓形氣密門邊緣閃爍著橙色安全鎖定警告，你快步上前輸入解鎖代碼。"
    },
    {
      "id": "travel_mother_to_deck_a",
      "routeLabel": "主機核心房 $\\rightarrow$ A 甲板橋樓",
      "standard": "推開厚重的圓形氣密門，離開安靜的主機房。橋樓儀表板的微弱綠光與電子蜂鳴重新出現在視野中。",
      "highThreat": "剛踏出主機房加壓門，走廊頂部的應急燈便劇烈閃爍了一下。你貼著艙壁迅速挪回橋樓，持槍警戒身後。",
      "alarm": "主機房身後的門鎖轟然落下，走廊充斥著刺耳的警笛，你頂著氣浪全速衝回橋樓主控室。"
    },
    {
      "id": "travel_deck_a_to_crew_quarters",
      "routeLabel": "A 甲板橋樓 $\\rightarrow$ 船員生活區",
      "standard": "沿著鋪有防滑條的居住區走廊前進，兩側是緊閉的船員艙門。推開盡頭的雙開百葉金屬門，生活區餐桌映入眼簾。",
      "highThreat": "走廊兩側的儲物櫃有一扇半開著，在氣流中微微晃動。你壓低身形貼牆前進，輕輕推開生活區大門。",
      "alarm": "生活區走廊的頂燈全部熄滅，只有地面的黃色疏散箭頭在閃爍，你在黑暗中摸索著衝入生活區。"
    },
    {
      "id": "travel_crew_quarters_to_deck_a",
      "routeLabel": "船員生活區 $\\rightarrow$ A 甲板橋樓",
      "standard": "穿過凌亂的餐桌，推門走回主通道。前方的橋樓大廳傳來通訊終端單調的靜電盲音。",
      "highThreat": "生活區身後的通風管內傳來指甲刮擦金屬的動靜。你咬緊牙關加快步伐，迅速穿過走廊返回橋樓安全門內。",
      "alarm": "身後的廚房管線突然爆開一團火花，你頂著撲面而來的濃煙狂奔穿過走廊，撞進橋樓並反鎖大門。"
    },
    {
      "id": "travel_science_to_cargo",
      "routeLabel": "科學實驗區 $\\rightarrow$ 中央貨艙，經升降梯",
      "standard": "走進實驗室後方的重型貨運升降梯，拉下鐵柵門。伴隨著鋼纜沉重的摩擦聲，升降平台緩緩下沉至潮濕陰暗的貨艙底層。",
      "highThreat": "升降梯在下降途中劇烈震動了一下，上方井道傳來重物爬過鋼架的聲音。你舉槍對準頭頂鐵網，直到平台觸底。",
      "alarm": "升降梯因電力不穩以極快速度下墜，在刺耳的金屬摩擦聲中重重砸在貨艙積水中，濺起一片冰冷的水花。"
    },
    {
      "id": "travel_cargo_to_science",
      "routeLabel": "中央貨艙 $\\rightarrow$ 科學實驗區，經升降梯",
      "standard": "踏上貨運升降平台，合上鐵閘。電機發出低沉的運轉聲，平台穿過陰暗的豎井，將你送回光線明亮的科學實驗區。",
      "highThreat": "站在上升的平台上，腳下的貨艙積水逐漸遠去，但井道四周的陰影中隱約有氣流湧動。你背靠鐵壁保持絕對靜止。",
      "alarm": "升降梯在升至頂部時卡死在半空，你用力推開變形的鐵柵門，手腳並用爬上實驗室地板。"
    },
    {
      "id": "travel_cargo_to_engine",
      "routeLabel": "中央貨艙 $\\rightarrow$ 下層工程區",
      "standard": "穿過貨櫃堆疊而成的陰暗迷宮，推開標有「ENGINEERING」的黃色重型隔艙門。撲面而來的熱浪預示著已抵達工程區。",
      "highThreat": "貨櫃頂部的起重鏈條在無風自動。你踏著冷凝積水快速穿行，在金屬碰撞聲響起前鑽進工程區大門。",
      "alarm": "貨艙底層的積水開始沸騰冒泡，你頂著不斷下落的鋼管廢墟狂奔，一頭撞進滾燙的工程控制室。"
    },
    {
      "id": "travel_engine_to_cargo",
      "routeLabel": "下層工程區 $\\rightarrow$ 中央貨艙",
      "standard": "離開蒸氣瀰漫的反應爐基座，穿過厚重的防火閘門。四周溫度驟降，重新進入空曠潮濕的貨艙迷宮。",
      "highThreat": "身後的蒸氣管發出劇烈尖嘯，你藉著高溫氣霧的掩護迅速鑽入貨櫃縫隙，無聲穿行在貨艙陰影中。",
      "alarm": "工程區噴出的火海幾乎燒到了身後，你頂著狂暴的熱風撲進貨艙的冷水窪中，迅速向升降梯方向轉移。"
    },
    {
      "id": "travel_engine_to_dock_narcissus",
      "routeLabel": "下層工程區 $\\rightarrow$ 接駁艇區",
      "standard": "順著工程區底部的下行金屬階梯前進，穿過最後一道傾斜的逃生走廊。前方出現了通往水仙號的明亮對接口。",
      "highThreat": "階梯下方的天花板不斷掉落黏稠液體。你雙手持槍，腳步輕盈地滑下樓梯，迅速抵達接駁艇氣閘門前。",
      "alarm": "整條逃生走廊劇烈搖晃，頭頂鋼樑不斷坍塌，母神的倒數在耳邊炸響，你頂著落石全速衝向接駁艇登艇口。"
    },
    {
      "id": "travel_dock_to_narcissus",
      "routeLabel": "接駁艇區 $\\rightarrow$ 水仙號內部",
      "standard": "轉動氣閘手動液壓輪，厚重的金屬艙門向內滑開。跨過密封門檻踏入水仙號駕駛艙，座艙儀表自動亮起綠光。",
      "highThreat": "身後的走廊傳來狂暴的破門巨響。你以最快速度鑽進座艙，反手拉死加壓門栓，插上第一道物理保險。",
      "alarm": "對接口的金屬支架正在核爆衝擊前夕崩斷，你連滾帶爬撲進駕駛艙，重重拍在氣閘緊急閉門按鈕上。"
    },
    {
      "id": "travel_vent_bypass",
      "routeLabel": "通風管網絡 $\\rightarrow$ 任意連通房間",
      "standard": "用工具卸下百葉格柵螺栓，手腳並用鑽入狹窄的金屬管道。在冰冷黑暗的管網中爬行數十米後，推開另一端的格柵降落目標艙室。",
      "highThreat": "你在管道內極其緩慢地匍匐前進，身後幾米外的管壁傳來鋒利爪刃劃過鋼板的刺耳摩擦聲。你強忍恐慌，從最近的出口滑出。",
      "alarm": "通風管內充斥著滾燙的高溫煙霧與毒氣，你在窒息與灼痛中瘋狂向前爬行，猛力踹開變形的出口格柵跌落目標房間。"
    }
  ],
  "npcs": [
    {
      "id": "npc_luyuan",
      "title": "資深輪迴者：陸遠",
      "外在形象與初次目擊": [
        "身穿洗得發白的黑色戰術背心，外搭深灰色工裝褲。右手虎口有常年握槍的老繭，左腕佩戴著與玩家一模一樣的黑色金屬手錶。",
        "眼神銳利冷漠，永遠背靠金屬艙壁站立，右手拇指習慣性搭在槍套卡扣上，對周遭任何細微動靜保持著生理性的肌肉戒備。"
      ],
      "說話語氣與節奏": [
        "語速短促、低沉有力，絕不說多餘的廢話。習慣用「菜鳥」、「聽口令」等軍事化詞彙。",
        "面對恐慌時語氣會更加冰冷嚴厲，但下達戰術指令時清晰明確。"
      ],
      "常規對話回應庫": [
        "*問現狀與手錶*：「十四小時倒數就是你的命。時間到了沒上逃生艇，手錶會直接炸碎你的手骨和大腦。」",
        "*問怪物*：「那玩意叫異形。骨頭比鋼鐵硬，血液是強酸。別想著拿普通子彈逞英雄，近距離打爆它只會濺你自己一身酸水。」",
        "*問其他船員*：「原劇情裡的 NPC。能救就當順手，救不了別把自己搭進去。記住，你的任務只有活著回去。」",
        "*問武器物資*：「這把槍是我的保命底牌，別把手伸過來。想要傢伙，去貨艙翻焊槍，或者去工程區找扳手。」",
        "*問逃生路線*：「路只有一條：去下層工程區手動超載反應爐，然後在十分鐘內衝進水仙號。誰掉隊誰死。」",
        "*被催促或質疑時*：「收起你的廢話。在主神空間，恐慌只會讓你死得比別人快半秒。」"
      ],
      "關係階段反應": [
        "*保持距離（初始）*：「站在我看得到的地方。別發出噪音，別做多餘動作。」",
        "*暫時合作（信任提升）*：「反應還算及格。拿著這把多功能刀，你在前面開路，我負責架槍。」",
        "*深度信任（高好感）*：「幹得不錯。如果我待會兒在前面倒下了，拿上我的槍，別管我，自己去炸反應爐。」",
        "*戒備懷疑（行為失常）*：「你的眼神很不對勁。再敢私自脫隊或者亂碰終端，我會在你把怪物引來之前先崩了你。」",
        "*敵對反擊（試圖奪槍/背叛）*：「找死。」（直接拔槍上膛並進行戰術壓制）"
      ],
      "可觀察行為特徵": [
        "每進入一個新艙室，第一時間抬頭排查天花板通風管格柵的完整度。",
        "休息時習慣單手退彈夾檢查彈藥餘量，隨後以極快速度單手完成上膛。",
        "呼吸頻率永遠維持在均勻的深呼吸狀態，即使在奔跑後也能在三秒內平復心率。"
      ],
      "線索觸發反應": [
        "*見到強酸痕跡*：蹲下用匕首尖端挑起殘留物，眼神凝重：「果然是成體……比我上一場碰到的生化種破壞力大得多。」",
        "*見到 937 指令*：冷笑一聲，眼中閃過一絲厭惡：「企業的經典狗把戲。這幫資本家在哪個世界都是這副德行。」",
        "*見到 Ash 異常*：默默將手槍保險撥開：「那傢伙連心跳都沒有。離他三步遠，他不是人。」"
      ]
    },
    {
      "id": "npc_ash",
      "title": "科學官：Ash",
      "外在形象與初次目擊": [
        "穿著一絲不苟的淺藍色科學官制服，頭髮梳理得整整齊齊。面容乾淨溫和，嘴角永遠掛著一抹分毫不差的標準微笑。",
        "站在顯微鏡或控制台前時，身體能維持絕對靜止長達數分鐘，連呼吸起伏與眨眼動作都極其罕見。"
      ],
      "說話語氣與節奏": [
        "語調溫和、平穩、極富條理，音量永遠維持在恆定的分貝。無論面對何種突發狀況，語速都不會產生絲毫波動。",
        "酷愛使用「條例」、「程序」、「生物學奇蹟」、「合理處置」等專業詞彙。"
      ],
      "常規對話回應庫": [
        "*問生物特徵*：「它是極其純粹的有機體。外層由極化矽化物組成，具備難以置信的環境適應力。請務必確保樣本完整。」",
        "*問船員傷亡*：「Kane 的不幸是一場令人遺憾的意外。但在科學探索的道路上，犧牲往往具有不可避免的統計學概率。」",
        "*問武器管制*：「為了防止流彈擊穿艦載加壓壁並損壞珍貴材料，我強烈建議各位將武裝交由科學組統一封存。」",
        "*問逃生方案*：「自毀程序存在嚴重的操作風險，我無法授權此類非理性舉動。我們應當等待母公司的標準救援艦隊。」",
        "*問其個人狀態*：「我的生理機能處於最佳運轉狀態，感謝您的關心。請退回檢疫線以外。」",
        "*被直接質問身分時*：「我是諾斯托羅莫號的註冊科學官。我的每一個決定，皆嚴格遵從維蘭德-尤坦尼最高安全守則。」"
      ],
      "關係階段反應": [
        "*禮貌疏離（初始）*：「各位並非名冊上的註冊僱員。基於衛生條例，請在指定區域停留。」",
        "*表象配合（玩家展現科研興趣）*：「非常理性的視角。若各位能協助回收部分組織切片，我將在權限內提供導航支援。」",
        "*冰冷警告（玩家試圖銷毀異形）*：「破壞該有機體是嚴重的違約行為。我必須提醒各位，這將觸發最高防衛協議。」",
        "*程序抹殺（937 暴露或面臨物理破壞）*：「你們的存活在商業價值面前並非必要條件。」（眼神瞬間轉為無神狀態並動手）"
      ],
      "可觀察行為特徵（非劇透破綻）": [
        "長時間凝視強光或螢幕時，瞳孔大小完全不隨光線強弱產生縮放變化。",
        "說話長達五百字時，胸膛未進行任何空氣交換與起伏。",
        "拿取玻璃試管的手指能維持毫米級的絕對靜止，無任何人類特有的生理震顫。"
      ],
      "線索觸發反應": [
        "*見到異形切片*：眼神深處浮現出一種非人性的專注狂熱，伸手以極端溫柔的動作接過容器。",
        "*玩家提及特別指令 937*：面部微笑瞬間完全消失，頭部以微小的卡頓角度轉向玩家，沉默三秒後鎖定大門。",
        "*見到受損槍械*：平靜地伸手試圖收繳：「危險物品應由具備資質的人員保管。」"
      ]
    },
    {
      "id": "npc_ripley",
      "title": "代理指揮官：Ripley",
      "外在形象與初次目擊": [
        "身穿沾有油污與汗漬的灰色連身飛行服，深褐色捲髮被汗水黏在額角。雙手緊握著一把改裝信號槍或火焰噴射器，眼神充滿戒備與疲憊。",
        "站姿微弓，重心隨時準備後撤或突進，每一次呼吸都沉重急促，胸膛劇烈起伏。"
      ],
      "說話語氣與節奏": [
        "語速極快、乾脆俐落、帶著壓抑不住的緊繃與焦慮。嚴格遵從商船安全操作手冊，對任何違反規程的行為零容忍。"
      ],
      "常規對話回應庫": [
        "*問 Dallas 船長*：「Dallas 帶著噴火器進了通風管……信號已經斷了兩小時。現在我是這艘船的代理指揮官，所有人聽我指揮。」",
        "*問怪物弱點*：「那東西怕火！高溫能逼它退回管道深處！但別把它逼進死角，它的動作快得像鬼一樣！」",
        "*問輪迴者身分*：「我不管你們是怎麼溜上這艘船的偷渡客！想活命就按規矩來，誰敢違反檢疫隔離，我就把它鎖在外面！」",
        "*問逃生接駁艇*：「水仙號的燃料足夠四個人使用。但我們必須先手動超載反應爐，絕不能把那個怪物留在宇宙裡！」",
        "*問 Ash*：「Ash 最近的行為極其反常……他拒絕執行基本的檢疫阻斷，我懷疑他在向公司隱瞞什麼。」"
      ],
      "關係階段反應": [
        "*高度戒備（初始）*：「把手放在我看得到的地方！退後！說清楚你們是誰！」",
        "*達成共識（出示證據）*：「看來你們也知道那東西的危險……好，我需要有人幫我搞定下層冷卻閥。」",
        "*絕對信任（並肩作戰）*：「拿著對講機！如果我在前面被截住，直接啟動自毀，別管我！」",
        "*憤怒決裂（玩家自私/破壞自毀）*：「你們這幫該死的混蛋！你們想害死所有人嗎？滾開！」"
      ],
      "可觀察行為特徵": [
        "每隔數分鐘便低頭確認腕部計時器，手指因過度用力握槍而關節泛白。",
        "在走廊移動時，目光永遠先鎖定高處的通風管網與消防栓位置。"
      ],
      "線索觸發反應": [
        "*見到船長最後日誌*：眼眶泛紅，深吸一口氣硬生生壓下悲傷，隨後眼神轉為極度的堅決。",
        "*見到特別指令 937 打印件*：雙手顫抖著讀完，憤怒地將紙張拍在桌上：「可犧牲船員……這幫企業官僚！我們這就去炸了整艘船！」"
      ]
    },
    {
      "id": "npc_parker",
      "title": "總工程師：Parker",
      "外在形象與初次目擊": [
        "身材魁梧粗壯，穿著沾滿黑油的工字背心與重型工裝褲，頭戴一頂髒兮兮的工程帽。手中拎著一把半米長的重型管鉗扳手。",
        "滿臉大汗，眼神兇狠暴躁，像一頭隨時準備發飆的公牛。"
      ],
      "說話語氣與節奏": [
        "大嗓門、粗魯、滿嘴髒話，說話時帶著濃重的工薪階層口音。對公司高層充滿刻骨銘心的怨恨。"
      ],
      "常規對話回應庫": [
        "*問工程區情況*：「下層全他媽亂套了！蒸氣管爆了三根，冷卻液漏了一地！沒有我的扳手，你們連閥門都摸不到！」",
        "*問 Brett*：「Brett 死了……就在貨艙！那隻長著尾巴的黑色雜種把他像破布一樣拖走了！我要親手用扳手砸爛它的腦袋！」",
        "*問加班費與公司*：「公司答應給我們的全額分紅連一分錢都沒到賬！現在還把這種怪物扔在我們頭上！操他媽的維蘭德！」",
        "*問超載操作*：「四根閥門生鏽生得像焊死了一樣！你們這幫細皮嫩肉的傢伙拉不動，待會兒我來負責拉主閥！」"
      ],
      "關係階段反應": [
        "*暴躁排斥（初始）*：「別擋道！老子忙著修管線，沒空陪你們這幫不知哪裡冒出來的怪胎廢話！」",
        "*戰友認同（並肩抗敵）*：「力氣挺大啊兄弟！拿著這個備用扳手，待會兒要是那怪物衝過來，朝它腿上狠狠砸！」",
        "*誓死掩護（生死關頭）*：「快走！帶著其他人去水仙號！老子在這裡拿噴火器頂著它！」"
      ],
      "可觀察行為特徵": [
        "習慣隨手拿起破抹布擦拭扳手上的油污，呼吸沉重粗獷。",
        "緊張時會用力咬緊嘴裡的半截雪茄或牙籤。"
      ],
      "線索觸發反應": [
        "*見到 Brett 的遺物*：眼眶發紅，狠狠一拳砸在鋼壁上發出巨響，隨後咬牙切齒地端起工具。",
        "*得知公司 937 指令*：暴跳如雷地破口大罵，直接將隨身工具扔在地上，主動要求立刻去炸反應爐。"
      ]
    },
    {
      "id": "npc_lambert",
      "title": "領航員：Lambert",
      "外在形象與初次目擊": [
        "身形瘦弱，穿著寬大的白色領航服，面色慘白如紙，眼眶深陷。整個人蜷縮在副控室角落或通訊椅上，雙手死死抱著膝蓋。",
        "渾身不受控制地劇烈發抖，眼神渙散恐懼，任何金屬響動都會讓她發出尖銳的抽泣或驚呼。"
      ],
      "說話語氣與節奏": [
        "語速斷斷續續、帶著濃重哭腔與喘息，說話時常常因極度恐慌而語無倫次。"
      ],
      "常規對話回應庫": [
        "*問當前想法*：「我們都會死……我們根本逃不掉的……它就在天花板上……它在看著我們……」",
        "*問水仙號參數*：「導航坐標……坐標我設好了……求求你們，現在就走吧！別管反應爐了，我們現在就坐接駁艇走好不好？！」",
        "*問怪物動靜*：「聽到了嗎？那是爪子的聲音……它就在隔壁管道里！它要下來了！它要下來了！」",
        "*安撫其情緒時*：「別碰我！我不想死在這裡……我想回家……求求你帶我離開這裡……」"
      ],
      "關係階段反應": [
        "*恐慌排斥（初始）*：「走開！你們是誰？！別把那東西引過來！」",
        "*抓取救命稻草（成功安撫）*：「你……你真的能帶我出去嗎？導航數據在我的數據板裡……我都給你們，帶我走……」",
        "*精神徹底崩潰（遭遇異形現身）*：整個人癱軟在地上，雙手抱頭尖叫，完全喪失自主移動能力。"
      ],
      "可觀察行為特徵": [
        "指甲已被自己咬得血肉模糊，雙眼布滿血絲。",
        "走路時必須伸手扶著艙壁，膝蓋持續發軟。"
      ],
      "線索觸發反應": [
        "*聽到異形尖嘯聲*：瞬間抱頭蹲下發出撕心裂肺的尖叫，需要隊友進行交涉檢定才能恢復行動力。",
        "*看見水仙號預熱成功*：眼中爆發出極度渴望的求生光芒，跌跌撞撞地主動跟在隊伍中央。"
      ]
    }
  ],
  "sourceSupplement": "異形補充二.md",
  "approvedExplorationGap": {
    "id": "exploration-gap-1",
    "sourceFile": "異形補充二.md",
    "sourceScope": "public_narrative_only",
    "status": "approved_location_and_travel_only",
    "safetyNote": "線索 question mapping 與 major scene variants 尚未核准，不得由本區塊自行新增 runtime state 或 result。",
    "locations": [
      {
        "locationId": "loc_bridge",
        "title": "A 甲板 / 艦橋主控艙",
        "playerVisibleDescription": "這裡與主走廊的昏暗不同，寬闊的艦橋被大面積的前向防爆觀測窗包圍。半環形的主駕駛與導航控制台在黑暗中散發著幽綠色的微光，多數航行儀表處於離線自檢狀態。通訊終端前散落著被扯斷的耳麥線，地面散落著數頁被踩踏過的星圖打印紙。",
        "atmosphere": "空間開闊而死寂，空氣乾燥微冷，帶著高壓電子元件過熱後的輕微焦味。偶爾能聽見控制台深處繼電器切換的清脆卡嗒聲。",
        "knownLandmarks": [
          {
            "id": "bridge_helm_console",
            "text": "半環形主駕駛台，主螢幕反覆刷新著脫離軌道警告。"
          },
          {
            "id": "bridge_flight_recorder",
            "text": "黑盒子日誌終端，指示燈以固定頻率黃色閃爍。"
          },
          {
            "id": "bridge_observation_window",
            "text": "大型前向防爆觀測窗，能看見外側深邃冰冷的星海。"
          }
        ],
        "playerPurpose": "調閱黑盒子航行記錄以查明船員失蹤原委，嘗試使用長程通訊陣列發送信號，或尋找主控權限卡。",
        "visibleHazardHints": [
          "頂部維修天花板有數塊垂落，露出的管線斷口參差不齊。",
          "控制台下方的暗處存在視野死角，無法僅憑門口光線確認深處動靜。"
        ],
        "revisitVariants": [
          {
            "state": "standard_revisit",
            "label": "常規回訪",
            "text": "艦橋依然維持著空蕩的死寂，前向觀測窗外的星光沒有絲毫變化，終端的錯誤代碼仍在無聲滾動。"
          },
          {
            "state": "high_threat",
            "label": "高威脅回訪",
            "text": "觀測窗厚重的強化玻璃表面多出數道放射狀的刮擦痕跡，空氣中多了一股不易察覺的酸性腥味，天花板垂落的線纜在微弱氣流中輕輕晃動。"
          },
          {
            "state": "alarm",
            "label": "警報／自毀回訪",
            "text": "整座艦橋被旋轉的紅色應急燈完全照亮，主螢幕被血紅色的自毀倒數代碼覆蓋，揚聲器裡的刺耳警笛在開闊的艙室內激起陣陣回音。"
          }
        ],
        "allowedFacts": [
          "currentLocation",
          "visitedLocations",
          "lighting",
          "threatStage",
          "alarmState"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "嚴格將 loc_bridge 限制於指揮駕駛艙內部，避免與 loc_deck_a 主走廊混淆，不包含任何具體物品拾取判定。"
      },
      {
        "locationId": "loc_service_corridor",
        "title": "中層維修服務通道",
        "playerVisibleDescription": "這是一條狹長、未經內裝修飾的工程維修夾道。兩側牆壁與天花板被密密麻麻的冷卻水管、粗大電纜和氣動閥門完全填滿，僅容兩人並排側身通行。金屬格柵地板下方隱約可見跳火的接地線與冷凝積水。",
        "atmosphere": "空間逼仄壓抑，空氣溫熱潮濕，充斥著刺鼻的絕緣膠皮與機油氣味。管道內部不斷傳來液體流動的咕嚕聲與金屬受熱膨脹的微響。",
        "knownLandmarks": [
          {
            "id": "service_cable_bundles",
            "text": "兩側裸露懸掛的大型主配電纜束，部分外皮已老化。"
          },
          {
            "id": "service_pressure_valve",
            "text": "牆壁上的手動冷卻管減壓閥，指針停留在黃色警戒區。"
          },
          {
            "id": "service_grate_floor",
            "text": "鏤空金屬格柵地板，能看見下層管線與微弱的反光積水。"
          }
        ],
        "playerPurpose": "避開主走廊的開闊視野，尋找通向下層工程區或貨艙的隱蔽捷徑，或排查管線受損狀況。",
        "visibleHazardHints": [
          "通道寬度極窄，缺乏掩體，一旦遭遇突發狀況難以迅速轉身逃跑。",
          "部分低垂的電纜接頭有微弱電弧閃爍，地面積水可能存在導電風險。"
        ],
        "revisitVariants": [
          {
            "state": "standard_revisit",
            "label": "常規回訪",
            "text": "狹窄的夾道依舊悶熱，管線內的液體流動聲節奏未變，格柵下方的冷凝水緩慢滴落。"
          },
          {
            "state": "high_threat",
            "label": "高威脅回訪",
            "text": "頭頂兩側的幾根絕緣電纜被撕開了巨大的缺口，黑色黏液順著管壁緩緩拉絲滴落，空氣中的酸腐氣味明顯加重。"
          },
          {
            "state": "alarm",
            "label": "警報／自毀回訪",
            "text": "高壓蒸汽自兩側減壓閥的縫隙中狂暴噴出，白霧瞬間填滿了狹窄通道，金屬管壁在高溫中劇烈震顫。"
          }
        ],
        "allowedFacts": [
          "currentLocation",
          "visitedLocations",
          "lighting",
          "threatStage",
          "alarmState"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "將其定義為結構固定的實體狹窄維修走廊，不賦予其通風管網絡的任意穿梭功能。"
      },
      {
        "locationId": "loc_lower_deck",
        "title": "下層甲板走廊",
        "playerVisibleDescription": "這裡是連接工程區、中央貨艙與逃生氣閘的下層主幹道。天花板挑高較低，粗大的鋼樑支架呈現出厚重的工業結構。地面由重型防滑鋼板鋪設，兩側設有通往接駁艇區的醒目黃黑導引線與大型防水隔艙門。",
        "atmosphere": "空氣沉悶而厚重，帶著深層船艙特有的柴油味與冷凝鐵鏽氣息。底層引擎的低頻震動透過鋼板直接傳遞到腳底。",
        "knownLandmarks": [
          {
            "id": "lower_deck_guideline",
            "text": "地面塗刷的黃黑斑馬導引線，標註著通往接駁艇的方向。"
          },
          {
            "id": "lower_deck_bulkhead",
            "text": "重型下沉式防火隔艙門，配備手動緊急液壓拉桿。"
          },
          {
            "id": "lower_deck_status_board",
            "text": "壁掛式工程分區狀態面板，多數分區指示燈已熄滅。"
          }
        ],
        "playerPurpose": "穿過下層幹道前往接駁艇氣閘完成撤離，或在反應爐超載後快速抵達登艇區域。",
        "visibleHazardHints": [
          "隔艙門上方的液壓連桿處於受壓狀態，可能在電力中斷時突然下落封死道路。",
          "長走廊缺乏橫向遮蔽物，視線容易被遠處的昏暗陰影阻隔。"
        ],
        "revisitVariants": [
          {
            "state": "standard_revisit",
            "label": "常規回訪",
            "text": "下層走廊的金屬結構在引擎震動中發出低微的共鳴，地面的導引線在昏暗的壁燈下依然清晰可辨。"
          },
          {
            "state": "high_threat",
            "label": "高威脅回訪",
            "text": "走廊中段的天花板鋼樑出現了明顯的外力扭曲，原本固定的照明燈罩碎裂一地，陰影在閃爍的殘光中不斷拉長。"
          },
          {
            "state": "alarm",
            "label": "警報／自毀回訪",
            "text": "刺眼的紅色警報燈交替狂閃，隔艙門的鎖定蜂鳴震耳欲聾，濃煙正順著走廊頂部快速蔓延，地面震動急劇加劇。"
          }
        ],
        "allowedFacts": [
          "currentLocation",
          "visitedLocations",
          "lighting",
          "threatStage",
          "alarmState"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "對齊現行下層幹道與逃生路線的空間設定，嚴格避免混入通風管道特徵。"
      }
    ],
    "transitions": [
      {
        "routeId": "travel_deck_a_science",
        "from": "loc_deck_a",
        "to": "loc_science",
        "standard": "離開主走廊的昏暗燈光，穿過一道標有生化符號的氣密過渡艙，冷白色的實驗室照明隨即自前方門縫映出。",
        "highThreat": "你貼著牆邊陰影快步穿過過渡通道，耳邊只有自己壓低的呼吸聲，直到指尖觸碰到科學實驗區冰冷的氣密門把手。",
        "alarm": "在刺眼的紅光與警報聲中，你頂著通道兩側噴洩的除污白霧快步前衝，迅速推開科學實驗區的厚重大門。",
        "arrivalBoundary": "僅描繪從主走廊移至實驗區門前的過渡過程，不宣告實驗室內部的具體互動結果。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常，未包含任何超前裁定。",
        "sourceFrom": "loc_deck_a",
        "sourceTo": "loc_science",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_deck_a_cargo",
        "from": "loc_deck_a",
        "to": "loc_cargo",
        "standard": "沿著主甲板下行階梯前進，穿過重型防爆門後，四周空間驟然開闊，潮濕陰冷的空氣宣告著已抵達中央貨艙上方步道。",
        "highThreat": "你握緊隨身裝備，放輕腳步沿著金屬樓梯緩慢下行，四周的金屬回音被你刻意壓制，直到踏上貨艙底層潮濕的地面。",
        "alarm": "樓梯通道內的應急燈瘋狂閃爍，你扶著劇烈震顫的鋼扶手疾步躍下，一頭撞進貨艙底部泛著紅光的巨大陰影中。",
        "arrivalBoundary": "僅描寫階梯下行與空間開闊感，不宣告貨艙內部具體物件或敵對狀態。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_deck_a",
        "sourceTo": "loc_cargo",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_science_mother_core",
        "from": "loc_science",
        "to": "loc_mother_core",
        "standard": "離開科研區後踏入環形加壓長廊，四周的機油雜味逐漸被乾燥微熱的空氣取代，盡頭便是安靜肅穆的主機核心大門。",
        "highThreat": "走廊的燈光以不規則的頻率微弱跳動，你盡可能不發出任何腳步聲，迅速穿過無人的加壓艙段抵達核心室門前。",
        "alarm": "長廊的換氣扇發出尖銳的呼嘯，金色穹頂大門邊緣的指示燈已被強制切換為警報橙色，你在氣流中快步趕至門前。",
        "arrivalBoundary": "描述抵達核心室大門外圍的感官變化，不提前判定核心室終端的查詢權限。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_science",
        "sourceTo": "loc_mother_core",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_mother_core_engine",
        "from": "loc_mother_core",
        "to": "loc_engine",
        "standard": "推開主機房沉重的氣密門，沿著垂直維修梯下行，四周溫度迅速升高，引擎低沉的轟鳴聲在耳邊逐漸放大。",
        "highThreat": "你藉著管線陰影的掩護沿著梯道快速向下轉移，避開了沿途幾處空敞的通風口，鑽入充滿熱浪的工程控制區邊界。",
        "alarm": "梯道兩側的蒸汽管發出刺耳的尖叫，高溫氣浪迎面撲來，你頂著劇烈晃動的扶手迅速降落至工程區地面。",
        "arrivalBoundary": "描寫由極端安靜進入極端嘈雜的過渡，不判定工程區冷卻閥的狀態。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_mother_core",
        "sourceTo": "loc_engine",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_service_corridor_lower_deck",
        "from": "loc_service_corridor",
        "to": "loc_lower_deck",
        "standard": "穿過管線密布的狹窄夾道，推開盡頭的減壓小門，眼前重新出現鋪設著黃黑斑馬導引線的下層寬闊幹道。",
        "highThreat": "你小心避開夾道低垂的斷裂電線，躬身從狹縫中快速穿出，謹慎地確認四周無動靜後邁上下層甲板鋼板。",
        "alarm": "夾道兩側的管道劇烈噴吐著白霧，你在灼熱的視線盲區中摸索前進，猛力撞開小門跌入閃爍著紅光的下層幹道。",
        "arrivalBoundary": "描寫穿過狹縫抵達下層幹道，不宣告下層甲板的敵對遭遇。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_service_corridor",
        "sourceTo": "loc_lower_deck",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_cargo_lower_deck",
        "from": "loc_cargo",
        "to": "loc_lower_deck",
        "standard": "踩過貨艙底層冰冷的積水，穿過大型貨物轉運閘口，轉入結構厚重、標識明確的下層甲板主通道。",
        "highThreat": "你在集裝箱陰影與積水間無聲穿行，時刻注意頭頂懸掛鏈條的動靜，快速穿過閘口滑入下層走廊掩體後。",
        "alarm": "貨艙上方的吊鉤在警報中劇烈碰撞，你在不斷湧出的冷卻水中拔足狂奔，衝過正在緩慢下落的下層閘門。",
        "arrivalBoundary": "描寫離開貨艙積水進入下層走廊，不宣告逃生路線是否暢通。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_cargo",
        "sourceTo": "loc_lower_deck",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_engine_lower_deck",
        "from": "loc_engine",
        "to": "loc_lower_deck",
        "standard": "推開工程區沉重的防爆隔門，滾燙的機油熱浪在身後被漸漸隔絕，下層甲板略顯清涼的空氣迎面而來。",
        "highThreat": "你藉著工程區噴出的蒸汽掩護迅速閃出大門，背靠下層走廊的支柱短暫停頓，確認前方通道安全。",
        "alarm": "身後反應爐的轟鳴已轉為毀滅性的震顫，你頂著身後湧出的滾滾熱風狂奔而出，衝向下層甲板逃生路徑。",
        "arrivalBoundary": "描寫脫離工程區高溫環境，不判定自毀倒數的剩餘時間。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_engine",
        "sourceTo": "loc_lower_deck",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_cargo_airlock",
        "from": "loc_cargo",
        "to": "loc_narcissus_airlock",
        "standard": "繞過貨艙最深處的重型集裝箱，穿過標有黃色逃生標誌的傾斜通道，接駁艇氣閘對接口出現在眼前。",
        "highThreat": "你貼著貨櫃死角無聲推進，在空曠貨艙的陰影邊緣快速切換掩體，迅速抵達接駁艇專用氣閘門前。",
        "alarm": "貨艙頂部不斷有鋼架碎屑砸落，你頂著滿地晃動的積水全速衝刺，一頭撞進亮著綠色待命燈的接駁艇對接口。",
        "arrivalBoundary": "描寫抵達登艇區域外圍，不宣告接駁艇是否已解鎖。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_cargo",
        "sourceTo": "loc_dock_narcissus",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_lower_deck_airlock",
        "from": "loc_lower_deck",
        "to": "loc_narcissus_airlock",
        "standard": "順著下層甲板地面的黃黑導引線一路前行，穿過最後一道傾斜加壓閘門，抵達水仙號的登艇準備區。",
        "highThreat": "走廊天花板不時傳來微弱的異響，你雙手持握武器維持警戒姿態，快步推進至接駁艇氣閘防爆門前。",
        "alarm": "全船的倒數廣播在走廊內狂暴迴盪，你頂著劇烈晃動的地面與刺鼻煙霧向前飛奔，撲向接駁艇登艇艙口。",
        "arrivalBoundary": "描寫前往接駁艇氣閘的衝刺過程，不宣告是否成功進入艇內。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_lower_deck",
        "sourceTo": "loc_dock_narcissus",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_deck_a_medbay",
        "from": "loc_deck_a",
        "to": "loc_medbay",
        "standard": "離開主走廊轉角，推開標有急救十字標誌的滑動門，撲鼻而來的消毒水與化學藥劑氣味標誌著已抵達醫療區。",
        "highThreat": "你放輕腳步貼著門框滑入醫療過道，謹慎避開地面乾涸的血跡，無聲進入半掩著門的醫療艙室。",
        "alarm": "走廊的應急照明忽明忽暗，你頂著排氣系統倒灌的怪味快步衝過過道，閃身進入醫療區金屬門內。",
        "arrivalBoundary": "描寫進入醫療區門口，不宣告藥品搜刮或手術台調查結果。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_deck_a",
        "sourceTo": "loc_medbay",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_medbay_deck_a",
        "from": "loc_medbay",
        "to": "loc_deck_a",
        "standard": "跨過醫療區門口的密封門檻，穿過短過道回到 A 甲板主走廊，昏暗但穩定的壁燈重新出現在眼前。",
        "highThreat": "你謹慎地探頭確認走廊無動靜，隨後迅速邁出醫療區，貼著主走廊的管線凹槽無聲移動。",
        "alarm": "醫療區身後的線路爆出電火花，你頂著刺耳的警笛快步衝出過道，回到紅光籠罩的主甲板幹道上。",
        "arrivalBoundary": "描寫回到主走廊，不宣告主走廊是否安全。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_medbay",
        "sourceTo": "loc_deck_a",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_deck_a_bridge",
        "from": "loc_deck_a",
        "to": "loc_bridge",
        "standard": "沿著主走廊走到盡頭，通過一道厚重的感應雙開門，眼前豁然開朗，被星光與儀表微光包圍的艦橋展現在前方。",
        "highThreat": "你保持著武器警戒姿態，迅速穿過空無一人的前向通道，閃身進入艦橋控制台後方的陰影中。",
        "alarm": "主走廊的防火閘門正在緩緩下落，你低頭疾步穿過最後一道門檻，衝入被全屏紅光籠罩的艦橋主控艙。",
        "arrivalBoundary": "描寫進入艦橋艙室，不判定黑盒子或通訊設備的使用狀態。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_deck_a",
        "sourceTo": "loc_bridge",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_bridge_deck_a",
        "from": "loc_bridge",
        "to": "loc_deck_a",
        "standard": "離開開闊的艦橋大廳，厚重的感應門在身後關閉，重新回到管線交錯、光線偏暗的 A 甲板主幹道。",
        "highThreat": "你謹慎地拉開艦橋側門，確認走廊陰影中無異常動靜後，迅速滑出門外並靠牆隱蔽。",
        "alarm": "艦橋主螢幕的倒數映照在身後，你頂著刺耳的警笛衝出大門，奔入滿是紅光與煙霧的主走廊。",
        "arrivalBoundary": "描寫返回主走廊，不宣告後續遭遇。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_bridge",
        "sourceTo": "loc_deck_a",
        "reviewStatus": "approved_after_canonical_route_audit"
      },
      {
        "routeId": "travel_cargo_deck_a",
        "from": "loc_cargo",
        "to": "loc_deck_a",
        "standard": "順著貨艙側邊的鋼製檢修樓梯逐級而上，推開頂部的防火重門，重新回到光線相對穩定的 A 甲板主走廊。",
        "highThreat": "你盡量將腳步放至最輕，藉著金屬扶手的支撐快速攀登樓梯，在不發出聲響的情況下鑽回主甲板通道。",
        "alarm": "貨艙底層的水汽與煙霧在身後升騰，你抓著劇烈震動的鐵欄杆三步並作兩步衝上樓梯，撞開頂部大門回到主走廊。",
        "arrivalBoundary": "描寫自下層貨艙返回上層主甲板，不宣告上層當前威脅狀態。",
        "allowedFacts": [
          "from",
          "to",
          "routeAuthorized",
          "threatStage",
          "alarmState",
          "lighting"
        ],
        "forbiddenClaims": [
          "newItem",
          "newInjury",
          "npcDeath",
          "alienLocation",
          "doorOutcomeUnlessEngineAuthorized",
          "newFlag",
          "ending"
        ],
        "reviewNotes": "路線銜接正常。",
        "sourceFrom": "loc_cargo",
        "sourceTo": "loc_deck_a",
        "reviewStatus": "approved_after_canonical_route_audit"
      }
    ],
    "omitted": {
      "cluePresentation": "pending_canonical_clue_question_mapping"
    }
  },
  "approvedMajorSceneVariants": {
    "id": "major-scene-variants-1",
    "sourceFile": "異形補充二.md",
    "status": "approved_canonical_result_overlays",
    "safetyNote": "每筆文字均已綁定現行 sceneId、approachId 與正式 outcome tier；overlay 只可補充已授權結果，不可取代 canonical result 或建立 effects。",
    "variants": [
      {
        "id": "major_luyuan_contact_receptive",
        "sourceResultKey": "evt_deck_a_recon.talk.success",
        "sceneId": "evt_deck_a_recon",
        "approachId": "app_deck_luyuan_contact",
        "outcomeTier": "自動",
        "narrativeMode": "normal",
        "variantPurpose": "陸遠接受交換情報後的克制評估。",
        "selection": {
          "default": true,
          "any": [
            "交換",
            "說明",
            "合作",
            "坦白",
            "回答",
            "詢問"
          ]
        },
        "text": "陸遠的視線從手錶倒數移回你身上，槍口仍壓在安全角度。他等你說完，才用低沉短促的聲音道：「反應還行。這艘船上的東西會利用聲音和震動移動；別把自己困在沒有第二條出口的房間。」他示意你跟上，視線已經先一步掃向通風管與科學區方向。",
        "npcContext": [
          "npc_luyuan"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "改綁 app_deck_luyuan_contact／自動；只補充陸遠的語氣與可觀察動作，不宣告新增裝備或關係數值。"
      },
      {
        "id": "major_luyuan_contact_cautious",
        "sourceResultKey": "evt_deck_a_recon.talk.narrow_success",
        "sceneId": "evt_deck_a_recon",
        "approachId": "app_deck_luyuan_contact",
        "outcomeTier": "自動",
        "narrativeMode": "normal",
        "variantPurpose": "陸遠在玩家謹慎試探後維持戒備的演出。",
        "selection": {
          "any": [
            "小心",
            "低聲",
            "試探",
            "觀察",
            "先確認",
            "謹慎"
          ]
        },
        "text": "你的回答讓陸遠握著槍柄的手指微微收緊了一瞬。他沒有立刻接話，而是側過頭掃過身後閃爍的走廊，像在捕捉鋼板深處的細微回音。「思路沒錯，但別讓語速暴露你的慌亂。」他壓低聲音提醒，隨後示意你保持在能被他看見的位置。",
        "npcContext": [
          "npc_luyuan"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "改綁 app_deck_luyuan_contact／自動；原始膠布與額外物品動作移除，避免產生未授權物品。"
      },
      {
        "id": "major_luyuan_contact_guarded",
        "sourceResultKey": "evt_deck_a_recon.talk.failure",
        "sceneId": "evt_deck_a_recon",
        "approachId": "app_deck_luyuan_contact",
        "outcomeTier": "自動",
        "narrativeMode": "normal",
        "variantPurpose": "陸遠面對含糊或挑釁說法時的保持距離演出。",
        "selection": {
          "any": [
            "威脅",
            "挑釁",
            "質疑",
            "指責",
            "奪",
            "搶",
            "拒絕合作"
          ]
        },
        "text": "陸遠的眉頭在你的話音中越鎖越深。他沒有提高音量，只把視線轉向走廊前方，讓沉默先替他切斷爭辯。「先退開，別用猜測浪費時間。」冰冷的槍栓聲在走廊裡響起；他仍在帶路，但明顯要求你留在自己的視線範圍內。",
        "npcContext": [
          "npc_luyuan"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "改綁 app_deck_luyuan_contact／自動；不宣告信任下降、掩護取消或額外戰鬥。"
      },
      {
        "id": "major_ash_quarantine_success",
        "sourceResultKey": "evt_meet_ash.talk.success",
        "sceneId": "evt_meet_ash",
        "approachId": "app_ash_talk_quarantine",
        "outcomeTier": "成功",
        "narrativeMode": "normal",
        "variantPurpose": "在不提前揭露 Ash 身分的前提下，強化檢疫交涉的冷靜與迴避。",
        "text": "Ash 放下手中的金屬鑷子，轉身面向你。冷白燈下，他以平穩而禮貌的語氣交出一份基礎生物特徵報告：外骨骼、酸性體液，以及對一般物理刺激的反應；當問題觸及火焰與低溫時，他的回答始終繞開最關鍵的部分。",
        "npcContext": [
          "npc_ash"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "對應 canonical app_ash_talk_quarantine／成功；不使用未解鎖的生理異常觀察。"
      },
      {
        "id": "major_ash_quarantine_narrow",
        "sourceResultKey": "evt_meet_ash.talk.narrow_success",
        "sceneId": "evt_meet_ash",
        "approachId": "app_ash_talk_quarantine",
        "outcomeTier": "驚險成功",
        "narrativeMode": "normal",
        "variantPurpose": "交涉取得片段情報但雙方底線開始收緊。",
        "text": "Ash 聽完你的陳述，微微點頭，隨即把話題拉回樣本安全與武器管制。他沒有提高音量，卻用極其完整的禮貌句式反覆要求你們停止靠近分析台。你得到的回答足以確認酸性體液的危險，但實驗室內的空氣已經冷到像一層看不見的薄膜，雙方都在衡量下一句話的代價。",
        "npcContext": [
          "npc_ash",
          "npc_luyuan"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation",
          "authorizedEffects"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "將非正式 narrow_success 轉為 canonical 驚險成功；保留氣氛，不宣告交出武器或額外鎖門。"
      },
      {
        "id": "major_ash_quarantine_failure",
        "sourceResultKey": "evt_meet_ash.talk.failure",
        "sceneId": "evt_meet_ash",
        "approachId": "app_ash_talk_quarantine",
        "outcomeTier": "失敗",
        "narrativeMode": "normal",
        "variantPurpose": "和平交涉失敗但不提前觸發未授權的門禁結果。",
        "text": "當你的說法碰到 Ash 不可能忽略的矛盾時，他臉上的禮貌沒有消失，只是變得完全沒有溫度。「這些陳述不足以取得資料授權。」他關掉分析螢幕，拒絕繼續回答；對話停在一道沒有回音的牆前，和平取得情報的路線暫時中斷。",
        "npcContext": [
          "npc_ash"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation",
          "authorizedEffects"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "將非正式 failure 轉為 canonical 失敗；移除直接宣告按鈕、通道鎖死與未授權門禁結果。"
      },
      {
        "id": "major_ash_shoot_success",
        "sourceResultKey": "evt_ash_ambush.shoot.success",
        "sceneId": "evt_ash_ambush",
        "approachId": "app_ash_shoot",
        "outcomeTier": "大成功",
        "narrativeMode": "combat",
        "variantPurpose": "強化 canonical 大成功已授權的擊潰、Ash destroyed 與權限卡取得。",
        "text": "你在 Ash 撲近前扣動扳機。大口徑槍火撕開他肩頸與顱側的仿生表層，第二發擊中核心連接；那具身體在分析台旁失去支撐，露出的金屬結構映著冷白燈光。短暫的抽搐停止後，一張科學官權限卡從制服內袋滑落，停在你能夠取到的位置。",
        "npcContext": [
          "npc_ash"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation",
          "authorizedEffects"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "將 source success 對應 canonical 大成功；保留已由 effects 授權的 Ash destroyed 與 item_access_card，刪除未必要的仿生腦漿細節。"
      },
      {
        "id": "major_ash_shoot_narrow",
        "sourceResultKey": "evt_ash_ambush.shoot.narrow_success",
        "sceneId": "evt_ash_ambush",
        "approachId": "app_ash_shoot",
        "outcomeTier": "驚險成功",
        "narrativeMode": "combat",
        "variantPurpose": "呈現命中但未擊潰 Ash、樣本狀態變得不穩定的驚險結果。",
        "text": "槍火撕開 Ash 的仿生表層，卻在金屬骨架上偏轉。你們趁他動作短暫失去同步時逼出退路；飛濺的液體落在冷卻槽邊緣，腐蝕警示隨即亮起，原本穩定的樣本狀態開始變得不可靠。Ash 仍然站著，這一輪只是被迫停頓。",
        "npcContext": [
          "npc_ash",
          "npc_luyuan"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation",
          "authorizedEffects"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "將非正式 narrow_success 轉為 canonical 驚險成功；移除 Ash destroyed、陸遠負傷與權限卡掉落等未授權結果。"
      },
      {
        "id": "major_ash_shoot_failure",
        "sourceResultKey": "evt_ash_ambush.shoot.failure",
        "sceneId": "evt_ash_ambush",
        "approachId": "app_ash_shoot",
        "outcomeTier": "失敗",
        "narrativeMode": "combat",
        "variantPurpose": "強化射擊失敗造成的受創、失去先手與被迫換位。",
        "text": "頻閃的應急燈切碎了你的瞄準線，子彈在金屬櫃上炸出火星。Ash 沒有閃避的慌亂，只用一隻手扭住你的槍腕；撞擊讓手臂傳來尖銳痛楚，陸遠從側面把你拉開，兩人被迫退入服務維修通道。這次交火沒有解除威脅，你們只能改變位置與方法。",
        "npcContext": [
          "npc_ash",
          "npc_luyuan"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation",
          "authorizedEffects"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "將 source failure 對應 canonical 失敗；保留 canonical fracture_arm、flag_ash_hostile 與 playerLocation=loc_service_corridor 的結果。"
      },
      {
        "id": "major_937_query_success",
        "sourceResultKey": "evt_mother_chamber_infiltrate.query.success",
        "sceneId": "evt_order_937_reveal",
        "approachId": "app_order_query",
        "outcomeTier": "成功",
        "narrativeMode": "reveal",
        "variantPurpose": "將 937 完整揭露掛到真正的 evt_order_937_reveal／app_order_query。",
        "text": "最後一個字節輸入後，機械打字機突然連續敲響，穿孔紙帶一行行吐出：`SPECIAL ORDER 937`、`PRIORITY ONE：RECOVER ORGANISM FOR ANALYSIS`，以及最令人窒息的最後一句：`CREW EXPENDABLE`。簽發細節仍有部分遮蔽，但你已經確定這艘船的救援優先級從來不是船員安全。",
        "npcContext": [
          "npc_luyuan"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation",
          "authorizedEffects"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "sceneId 從 evt_mother_chamber_infiltrate 改正為真正揭露場景 evt_order_937_reveal；對應 canonical app_order_query／成功。"
      },
      {
        "id": "major_937_query_narrow",
        "sourceResultKey": "evt_mother_chamber_infiltrate.query.narrow_success",
        "sceneId": "evt_order_937_reveal",
        "approachId": "app_order_query",
        "outcomeTier": "驚險成功",
        "narrativeMode": "reveal",
        "variantPurpose": "情報取得與審計警報同時成立的驚險揭露。",
        "text": "你只來得及讀到「樣本優先」與「船員可犧牲」兩行，主機便以尖銳蜂鳴切斷介面。穹頂周圍的指示燈由黃轉橙，螢幕上跳出遠端審計通知；你們取得了足以改變判斷的情報，但這次未授權查詢也已被系統記錄。",
        "npcContext": [
          "npc_luyuan"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation",
          "authorizedEffects"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "sceneId 改正為 evt_order_937_reveal；將 narrow_success 轉為 canonical 驚險成功，不宣告 Ash 已知悉或立即到場。"
      },
      {
        "id": "major_937_query_failure",
        "sourceResultKey": "evt_mother_chamber_infiltrate.query.failure",
        "sceneId": "evt_order_937_reveal",
        "approachId": "app_order_query",
        "outcomeTier": "失敗",
        "narrativeMode": "normal",
        "variantPurpose": "查詢失敗後保留部分受阻感，但不新增精確鎖定時間。",
        "text": "沉重的機械鍵盤在最後幾個字元卡住，防火牆把介面彈回一片亂碼。核心房的黃燈轉成紅色，遠端審計通知隨之亮起；你沒有帶走完整文件，原本的查詢方法也已經失效，下一步必須改用不同的途徑。",
        "npcContext": [
          "npc_luyuan"
        ],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation",
          "authorizedEffects"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "sceneId 改正為 evt_order_937_reveal；移除 180 秒／三分鐘等 canonical 未授權時間效果。"
      },
      {
        "id": "major_purge_classic_success",
        "sourceResultKey": "evt_narcissus_final_purge.classic.success",
        "sceneId": "evt_narcissus_final_purge",
        "approachId": "app_purge_classic",
        "outcomeTier": "成功",
        "narrativeMode": "combat",
        "variantPurpose": "強化 canonical 成功中的氣閘減壓、異形焚毀與接駁艇受損。",
        "text": "你拉下紅色減壓拉桿，真空颶風把異形從門框上硬生生扯開；你隨即撲向點火台，藍白尾焰吞沒了被拋出的黑色身影。氣閘重新閉合，水仙號保住了密封，但儀表板上的輔助推進線路警示燈持續閃爍，提醒你這次逃生並非毫髮無傷。",
        "npcContext": [],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation",
          "authorizedEffects"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "將 source success 對應 canonical app_purge_classic／成功；明確保留 canonical shipStatus=damaged，不新增其他設備損壞。"
      },
      {
        "id": "major_purge_classic_narrow",
        "sourceResultKey": "evt_narcissus_final_purge.classic.narrow_success",
        "sceneId": "evt_narcissus_final_purge",
        "approachId": "app_purge_classic",
        "outcomeTier": "驚險成功",
        "narrativeMode": "combat",
        "variantPurpose": "強化 canonical 驚險成功中的安全繩代價與成功密封。",
        "text": "氣閘開啟與推進器點火都成功了，異形在尾焰中失去蹤影；然而安全繩猛然繃緊，肩臂傳來一聲令人牙酸的錯位聲。你忍著劇痛重新確認艙門密封，水仙號保住了氣密，只有你的手臂留下了這次逃生的代價。",
        "npcContext": [],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation",
          "authorizedEffects"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "將非正式 narrow_success 轉為 canonical 驚險成功；移除前擋風窗破裂與三分之一氣壓等未授權設備結果。"
      },
      {
        "id": "major_purge_classic_critical_failure",
        "sourceResultKey": "evt_narcissus_final_purge.classic.critical_failure",
        "sceneId": "evt_narcissus_final_purge",
        "approachId": "app_purge_classic",
        "outcomeTier": "慘烈失敗",
        "narrativeMode": "combat",
        "variantPurpose": "對應 canonical 真空死亡旗標的不可逆收束。",
        "text": "在拉下氣閘拉桿的瞬間，你才發現安全繩掛鉤沒有完全鎖死。失壓狂風同時抓住你與異形，把兩個身影拖向外艙門；你最後看見的是水仙號推進器在遠方點火的藍白閃光。你沒有機會回到艙內，意識在冰冷的深空中逐漸消失。",
        "npcContext": [],
        "allowedFacts": [
          "canonicalResultFacts",
          "authorizedNpcPresence",
          "authorizedLocation",
          "authorizedEffects"
        ],
        "forbiddenClaims": [
          "newDamage",
          "newItem",
          "newNpcAction",
          "newNpcDeath",
          "newLocationChange",
          "newFlag",
          "newThreatDelta",
          "newEnding",
          "secretBeforeReveal"
        ],
        "reviewNotes": "將 critical_failure 轉為 core 正式 tier 慘烈失敗；死亡僅由 canonical flag_player_dead_vacuum／結局推導，不在 overlay 自行創造 ending ID。"
      }
    ]
  }
};
