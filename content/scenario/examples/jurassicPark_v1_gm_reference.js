// Generated from jurassicPark_v1_gm_reference.json for Cloudflare esbuild compatibility.
// Keep the JSON sidecar as the authoring/source file; regenerate this module after source edits.
export default {
  "schemaVersion": "scenario-gm-reference-1.1",
  "sourcePackId": "scenario.jurassic-park-01-v1",
  "canonicalVersion": "1.0.0",
  "narrativeVersion": "1.0.0",
  "title": "《努布拉島：維修站撤離》AI GM 事件參考資料",
  "directRuntimeLoad": false,
  "runtimeNote": "scenario runtime 透過 registry 與 referenceAdapter 載入本 sidecar，並使用其中的事件、物品、NPC 狀態、effects、轉場與結局條件；本檔案不應直接註冊到 SCENARIO_REGISTRY。",
  "authoringNote": "本檔由玩家提供的 Gemini 七批次產出（blueprint / rule-audit / opening-location / npc-bible / travel-clue / result-variants / debrief）轉寫而成。批次中的 proposal 欄位（threatDeltaProposal、outcomeEffectsProposal、riskProposal）已在此轉為 canonical effects；旗標一律正規化為 flag_*，結果階層一律對齊引擎正式階層。",
  "startingInventory": [
    "item_rain_gear",
    "item_halogen_torch",
    "item_maintenance_keycard_b"
  ],
  "finaleNodeIds": [
    "n4"
  ],
  "travelCompletesNodes": true,
  "authoringRules": {
    "truthOwner": "engine_and_reference_data",
    "narrationOwner": "llm",
    "checkOwner": "engine",
    "difficultyOwner": "reference_data",
    "allowedOutcomeTiers": [
      "大成功",
      "成功",
      "驚險成功",
      "些微失敗",
      "失敗",
      "慘烈失敗",
      "自動失敗",
      "大失敗(命定)"
    ],
    "difficultyToDc": {
      "容易": 1,
      "普通": 2,
      "困難": 3,
      "很困難": 4,
      "極難": 5
    },
    "stateRule": "每次行動只套用該行動及該結果的 effects；場景級 effects 僅供摘要，不得覆蓋結果級 effects。",
    "freeActionRule": "合理且有前置條件的玩家自訂行動可以被接受；若行動具有實質風險，必須轉成檢定，不得用純敘事行動免費通過。",
    "failureRule": "失敗必須改變位置、可用方法、現場人物、資源或威脅其中至少一項，不得原地重試同一方法。"
  },
  "initialStateAxes": {
    "shipStatus": "blackout",
    "sampleStatus": "none",
    "airlockPhase": "unseen",
    "infectionStatus": "unknown"
  },
  "stateAxisMeaning": {
    "shipStatus": "B 區維修站的供電與結構狀態（沿用引擎既有的 shipStatus 軸）。",
    "sampleStatus": "低溫胚胎備份的處置狀態（沿用引擎既有的 sampleStatus 軸）。",
    "airlockPhase": "南側停機坪的登機階段（沿用引擎既有的 airlockPhase 軸）。",
    "infectionStatus": "本副本不使用感染軸，固定停留在 unknown。"
  },
  "world": {
    "worldId": "jurassic_park_universe",
    "timelineId": "isla_nublar_incident_01",
    "setting": "五級熱帶暴風雨夜的努布拉島。全島高壓防護電網在兩小時前被主控中心的惡意指令關閉，B 區副維修站失去電力與對外通訊，多種掠食恐龍已突破外圍圍欄。",
    "fixedTruths": [
      "全島斷電是人為的：主程序師丹尼斯·納德利上傳的腳本關閉了電網與通訊，玩家無法在本副本內阻止這件已經發生的事。",
      "玩家是 B 區副維修站的外包技術與安保支援人員，不能前往主遊客中心取代原作主角，也不能改寫主園區的核心事件。",
      "南側懸崖停機坪只有一架可用的雙引擎工作直升機，機長受燃油與風切變限制，撤離窗口不會無限延長。",
      "低溫胚胎備份離開冷藏環境後只能維持有限時間；便攜冷藏箱是唯一能帶走樣本的容器。",
      "暴雨嚴重削弱視線與聽覺，露天泥濘區域對玩家不利、對掠食者有利。",
      "成體霸王龍會被引擎聲與強光吸引至停機坪道路，正面武力壓制不是可行解。"
    ],
    "unknownToPlayerAtStart": [
      "斷電是人為破壞而非雷擊",
      "凱倫·陳與 BioSyn 的走私協議",
      "莫拉萊斯藏起來的防暴電擊棍與未標記排洪閥",
      "冷藏箱夾層中的未標記嵌合體樣本",
      "直升機的實際起飛倒數餘裕"
    ]
  },
  "map": [
    {
      "id": "loc_maintenance_dock",
      "name": "B區露天裝卸坪",
      "connections": [
        "loc_power_junction_b",
        "loc_embryo_sublab",
        "loc_service_tunnel",
        "loc_south_helipad"
      ],
      "features": [
        "陷在泥濘水坑中的四驅維修吉普車",
        "被巨力扯斷的高壓防護鐵絲網",
        "牆邊的金屬工具應急箱",
        "通往地下維修管廊的鑄鐵人孔蓋"
      ],
      "hazards": [
        "暴雨狂風導致能見度極低",
        "斷裂高壓電纜垂落積水",
        "雙脊龍在圍欄外圍伺機伏擊"
      ],
      "playerVisible": {
        "firstArrival": "狂暴的熱帶暴雨把整座露天裝卸坪變成齊踝深的泥潭。工程吊臂在風中搖晃，發出金屬扭曲的刺耳聲響。遠處數公尺高的防護電網被撕開豁口，扭曲的鋼網在閃電下格外刺眼。陷在泥潭裡的吉普車大燈直直穿透雨幕，照亮周遭混亂的車轍與巨大的三趾爪印。",
        "atmosphere": "刺鼻的臭氧焦糊味、冰冷的傾盆大雨、密林深處傳來的怪異咕噥聲。",
        "knownLandmarks": [
          "陷坑吉普車",
          "發電機房重型防暴門",
          "實驗室側翼走廊",
          "中央雨水井蓋"
        ],
        "playerPurpose": "尋找安全的建築入口，排除外部威脅，取得可用工具或車輛。",
        "visibleHazardHints": [
          "泥水表面不時泛起幽藍色電火花",
          "林地邊緣有反光的黃綠色眼瞳在灌木叢中晃動"
        ],
        "revisitVariants": [
          {
            "condition": "threat_stage_ge_3",
            "text": "裝卸坪上的吉普車車門已被暴力撕開，駕駛座滿是泥水與抓痕。泥地上的足跡變得密集混亂，濃烈的血腥味混在雨水裡撲鼻而來。"
          },
          {
            "condition": "flag_power_restored",
            "text": "裝卸坪周圍的高架鹵素探照燈全部點亮，刺眼的白光穿透暴雨把泥濘空地照得如同白晝，也讓圍欄外的陰影無所遁形。"
          }
        ]
      }
    },
    {
      "id": "loc_power_junction_b",
      "name": "地下發電機房",
      "connections": [
        "loc_maintenance_dock",
        "loc_service_tunnel"
      ],
      "features": [
        "重型柴油發電機組（手動加壓閥與點火拉柄）",
        "主控電網分流配電盤",
        "維修日誌電腦終端機",
        "備用蓄電池組機架（部分保險絲已熔斷）"
      ],
      "hazards": [
        "地面覆蓋濕滑且易燃的柴油與積水",
        "密閉狹窄空間、回音巨大",
        "排風管道格柵被破壞，可能有小型掠食動物潛伏"
      ],
      "playerVisible": {
        "firstArrival": "順著濕滑的水泥階梯向下，是一處充斥低頻嗡鳴與柴油味的密閉地下機房。暗紅色的緊急備用燈把巨大的柴油發電機映照得像一頭沉睡的鋼鐵巨獸。地面流淌著深黑色油漬，主配電櫃上的指示燈全數熄滅。頭頂盤根錯節的金屬管道中，不時傳來指爪爬行的細碎聲響。",
        "atmosphere": "濃重刺鼻的柴油揮發氣味、悶熱潮濕的空氣、滴水落在高溫管道上的嘶嘶聲。",
        "knownLandmarks": [
          "柴油發電機點火把手",
          "主分流電閘箱",
          "工程維修終端機螢幕"
        ],
        "playerPurpose": "排查線路故障，重啟主柴油發電機或建立應急分流，為胚胎庫與全站防禦系統供電。",
        "visibleHazardHints": [
          "配電盤下方散落被咬爛的絕緣膠皮",
          "天花板排風口垂下一截沾滿黏液的金屬導管"
        ],
        "revisitVariants": [
          {
            "condition": "flag_power_restored",
            "text": "柴油發電機發出震耳欲聾的咆哮，排氣管道劇烈震顫並噴吐熱浪。整面牆壁的綠色供電指示燈整齊亮起，地下室溫度顯著升高。"
          },
          {
            "condition": "flag_power_room_dino_cleared",
            "text": "通風管下方安靜下來，排氣閥仍在緩緩洩壓，空氣中的焦糊味掩蓋了先前的野獸腥氣。"
          }
        ]
      }
    },
    {
      "id": "loc_embryo_sublab",
      "name": "冷藏胚胎副實驗室",
      "connections": [
        "loc_maintenance_dock",
        "loc_service_tunnel"
      ],
      "features": [
        "圓柱形液氮低溫儲存主罐",
        "便攜式防震生物冷藏箱",
        "強化氣密隔離操作間",
        "基因序列終端機與緊急滅菌焚化爐控制器"
      ],
      "hazards": [
        "洩漏液氮在地面聚成低溫冷霧，接觸皮膚會嚴重凍傷",
        "兩隻成年迅猛龍在實驗區巡獵",
        "自動滅菌系統可能因短路噴發高溫蒸汽"
      ],
      "playerVisible": {
        "firstArrival": "實驗室原本整潔的白色空間此刻像個戰場。翻倒的離心機與破碎試管散落滿地，乳白色的液氮冷霧沿著地面流淌，淹沒腳踝。透過蛛網般碎裂的強化玻璃窗，可以看見一名穿防護服的研究員蜷縮在氣密室角落。實驗台後方，兩道修長矯健的獸影正低伏著身軀，鐮刀爪在地板上踏出清脆的嗒嗒聲。",
        "atmosphere": "冰冷刺骨的冷卻氣體、濃烈的消毒水與血腥味、掠食者喉嚨深處的低沉震顫音。",
        "knownLandmarks": [
          "便攜手提冷藏箱",
          "氣密室安全門把手",
          "液氮緊急排氣閥手輪"
        ],
        "playerPurpose": "驅逐或引開迅猛龍，解救受困研究員，回收或果斷銷毀恐龍胚胎。",
        "visibleHazardHints": [
          "地面白霧掩蓋了深達數公分的玻璃碎片與化學廢液",
          "兩隻迅猛龍不斷變換站位，隱隱形成夾擊之勢"
        ],
        "revisitVariants": [
          {
            "condition": "flag_embryos_secured",
            "text": "中央冷藏罐的卡槽已被清空，氣密室大門敞開，地面殘留著急促離開的泥濘腳印與白色冰霜。"
          },
          {
            "condition": "flag_embryos_destroyed",
            "text": "高溫滅菌爐的焦黑痕跡蔓延至半個實驗室，空氣中充斥蛋白質燒焦的惡臭，所有儲存槽均已化為焦炭。"
          }
        ]
      }
    },
    {
      "id": "loc_service_tunnel",
      "name": "地底維修管道廊道",
      "connections": [
        "loc_maintenance_dock",
        "loc_power_junction_b",
        "loc_embryo_sublab",
        "loc_south_helipad"
      ],
      "features": [
        "沿天花板架設的高壓電纜束與給排水管道",
        "手動管道排水泵",
        "通往各建築模組的檢修豎井與金屬逃生梯",
        "牆上的應急工具掛架與防毒面具箱"
      ],
      "hazards": [
        "暴雨倒灌導致積水深達膝蓋",
        "狹長管道缺乏掩體，轉角易遭近距離伏擊",
        "天花板保溫棉塌陷、裸露電線垂掛於水面"
      ],
      "playerVisible": {
        "firstArrival": "逼仄陰暗的地下混凝土長廊筆直延伸至黑暗深處。冰冷渾濁的積水已經沒過小腿，水面漂浮著脫落的隔熱泡沫與工具包。黃色應急燈在水面拉出破碎的倒影。頭頂粗大的管道不時傳來水流衝擊的咚咚聲，遠處回蕩著空洞悠長的水滴聲與某種不明生物的刮擦聲。",
        "atmosphere": "令人窒息的潮濕壓迫感、冰冷刺骨的水流、管道金屬膨脹收縮的清脆敲擊聲。",
        "knownLandmarks": [
          "停機坪豎井爬梯標誌",
          "手動排水泵閥門",
          "發電機房分支鐵門"
        ],
        "playerPurpose": "避開地面露天危險區域，作為連接發電機房、實驗室與停機坪的安全暗道。",
        "visibleHazardHints": [
          "水面不時泛起細密的同心圓波紋",
          "前方轉角的混凝土牆面留有數道新鮮抓痕"
        ],
        "revisitVariants": [
          {
            "condition": "threat_stage_ge_4",
            "text": "地下管廊的積水已上漲至腰部，頭頂的電纜橋架大面積坍塌阻斷部分通路，水下不時有漂浮物撞擊雙腿。"
          },
          {
            "condition": "flag_power_restored",
            "text": "自動水泵開始全力運轉，管廊積水迅速退至腳踝以下，天花板排風扇重新旋轉，帶來外界的空氣。"
          }
        ]
      }
    },
    {
      "id": "loc_south_helipad",
      "name": "南側懸崖停機坪",
      "connections": [
        "loc_service_tunnel",
        "loc_maintenance_dock"
      ],
      "features": [
        "InGen 塗裝的雙引擎工作直升機",
        "懸崖邊緣的重型防風網與高架泛光探照燈塔",
        "起降調度防爆小屋（航空通訊電台與信號槍支架）",
        "航空煤油加注管線與手動緊急切斷閥"
      ],
      "hazards": [
        "懸崖邊緣陣風極強，隨時可能掀翻人員或阻礙起飛",
        "泥石流正侵蝕停機坪北側連接公路",
        "成體霸王龍阻截登機通道"
      ],
      "playerVisible": {
        "firstArrival": "突兀矗立在海邊懸崖之巔的巨型混凝土平台。太平洋的狂暴海風裹挾暴雨狠狠砸在地面上。平台中央，一架雙發動機直升機在暴風雨中劇烈顛簸，旋翼攪動氣流發出震撼心靈的轟鳴，強光探照燈筆直刺破前方的黑暗。而在連接停機坪的唯一路口，一具高達數公尺的龐然巨物正緩緩踏入光圈。",
        "atmosphere": "狂暴的航空煤油廢氣味、海浪拍擊懸崖的轟鳴、直升機引擎的咆哮與巨獸的威壓。",
        "knownLandmarks": [
          "直升機登機舷梯",
          "防爆調度小屋",
          "油料緊急切斷閥手柄",
          "懸崖防風安全網"
        ],
        "playerPurpose": "突破或引開巨獸阻截，穿過最後數十公尺開闊地登上直升機完成撤離。",
        "visibleHazardHints": [
          "巨獸的每一步都在泥濘路面踩出深坑",
          "起落架旁的信號燈正由綠色轉為急促閃爍的紅光"
        ],
        "revisitVariants": [
          {
            "condition": "flag_helipad_reached",
            "text": "直升機艙門敞開著，安全繩在風中狂舞，機長在座艙內拼命朝舷梯方向做出最後的登機手勢。"
          },
          {
            "condition": "flag_time_expired",
            "text": "停機坪中央空空如也，只有幾枚被強風吹落的信號彈外殼在水泥地上滾動。遠處夜空中，直升機的紅色航標燈已消失在雨雲之後。"
          }
        ]
      }
    }
  ],
  "travelTransitions": [
    {
      "id": "travel_dock_power",
      "from": "loc_maintenance_dock",
      "to": "loc_power_junction_b",
      "required": {
        "flags": [
          "flag_power_door_unlocked"
        ],
        "items": [],
        "flagsAbsent": []
      },
      "entryEventId": "evt_power_room_entry",
      "effects": {
        "flagsAdd": [
          "flag_dock_left"
        ],
        "cluesAdd": []
      }
    },
    {
      "id": "travel_power_dock",
      "from": "loc_power_junction_b",
      "to": "loc_maintenance_dock",
      "required": {
        "flags": [],
        "items": [],
        "flagsAbsent": []
      },
      "entryEventId": "evt_dock_arrival",
      "effects": {
        "flagsAdd": [],
        "cluesAdd": []
      }
    },
    {
      "id": "travel_dock_lab",
      "from": "loc_maintenance_dock",
      "to": "loc_embryo_sublab",
      "required": {
        "flags": [],
        "items": [],
        "flagsAbsent": []
      },
      "entryEventId": "evt_embryo_lab_entry",
      "effects": {
        "flagsAdd": [
          "flag_dock_left",
          "flag_lab_corridor_reached"
        ],
        "cluesAdd": []
      }
    },
    {
      "id": "travel_lab_dock",
      "from": "loc_embryo_sublab",
      "to": "loc_maintenance_dock",
      "required": {
        "flags": [],
        "items": [],
        "flagsAbsent": []
      },
      "entryEventId": "evt_dock_arrival",
      "effects": {
        "flagsAdd": [],
        "cluesAdd": []
      }
    },
    {
      "id": "travel_dock_tunnel",
      "from": "loc_maintenance_dock",
      "to": "loc_service_tunnel",
      "required": {
        "flags": [
          "flag_dock_manhole_opened"
        ],
        "items": [],
        "flagsAbsent": [
          "flag_tunnel_collapsed"
        ]
      },
      "entryEventId": "evt_service_tunnel_transit",
      "effects": {
        "flagsAdd": [
          "flag_dock_left"
        ],
        "cluesAdd": []
      }
    },
    {
      "id": "travel_tunnel_dock",
      "from": "loc_service_tunnel",
      "to": "loc_maintenance_dock",
      "required": {
        "flags": [],
        "items": [],
        "flagsAbsent": []
      },
      "entryEventId": "evt_dock_arrival",
      "effects": {
        "flagsAdd": [],
        "cluesAdd": []
      }
    },
    {
      "id": "travel_tunnel_power",
      "from": "loc_service_tunnel",
      "to": "loc_power_junction_b",
      "required": {
        "flags": [],
        "items": [],
        "flagsAbsent": []
      },
      "entryEventId": "evt_power_room_entry",
      "effects": {
        "flagsAdd": [
          "flag_power_room_reached_via_tunnel"
        ],
        "cluesAdd": []
      }
    },
    {
      "id": "travel_power_tunnel",
      "from": "loc_power_junction_b",
      "to": "loc_service_tunnel",
      "required": {
        "flags": [],
        "items": [],
        "flagsAbsent": [
          "flag_tunnel_collapsed"
        ]
      },
      "entryEventId": "evt_service_tunnel_transit",
      "effects": {
        "flagsAdd": [],
        "cluesAdd": []
      }
    },
    {
      "id": "travel_tunnel_lab",
      "from": "loc_service_tunnel",
      "to": "loc_embryo_sublab",
      "required": {
        "flags": [],
        "items": [],
        "flagsAbsent": []
      },
      "entryEventId": "evt_embryo_lab_entry",
      "effects": {
        "flagsAdd": [
          "flag_lab_corridor_reached"
        ],
        "cluesAdd": []
      }
    },
    {
      "id": "travel_lab_tunnel",
      "from": "loc_embryo_sublab",
      "to": "loc_service_tunnel",
      "required": {
        "flags": [],
        "items": [],
        "flagsAbsent": [
          "flag_tunnel_collapsed"
        ]
      },
      "entryEventId": "evt_service_tunnel_transit",
      "effects": {
        "flagsAdd": [],
        "cluesAdd": []
      }
    },
    {
      "id": "travel_tunnel_helipad",
      "from": "loc_service_tunnel",
      "to": "loc_south_helipad",
      "required": {
        "flags": [],
        "items": [],
        "flagsAbsent": [
          "flag_helipad_gate_locked"
        ]
      },
      "entryEventId": "evt_helipad_final",
      "effects": {
        "flagsAdd": [
          "flag_helipad_approach_tunnel"
        ],
        "cluesAdd": []
      }
    },
    {
      "id": "travel_dock_helipad",
      "from": "loc_maintenance_dock",
      "to": "loc_south_helipad",
      "required": {
        "flags": [
          "flag_jeep_repaired"
        ],
        "items": [],
        "flagsAbsent": [
          "flag_road_blocked_mudslide"
        ]
      },
      "entryEventId": "evt_helipad_final",
      "effects": {
        "flagsAdd": [
          "flag_helipad_approach_road"
        ],
        "cluesAdd": []
      }
    }
  ],
  "travelRiskRules": [
    {
      "id": "dark_open_ground",
      "locations": [
        "loc_maintenance_dock"
      ],
      "absentItems": [
        "item_halogen_torch"
      ],
      "threatDelta": 1,
      "label": "無照明的露天泥地",
      "note": "沒有可靠照明，你在開闊泥地上的動線更容易被圍欄外的東西鎖定。"
    },
    {
      "id": "dock_already_ambushed",
      "locations": [
        "loc_maintenance_dock"
      ],
      "flags": [
        "flag_dock_ambushed"
      ],
      "threatDelta": 1,
      "label": "裝卸坪已被盯上",
      "note": "掠食者已經把這片空地列入巡邏範圍，重返露天區域的風險更高。"
    },
    {
      "id": "flooded_tunnel_blind_corner",
      "locations": [
        "loc_service_tunnel"
      ],
      "absentItems": [
        "item_halogen_torch"
      ],
      "threatDelta": 1,
      "label": "積水管廊的盲區",
      "note": "沒有照明時，管廊轉角的伏擊距離會縮短到你無法反應。"
    },
    {
      "id": "lab_corridor_predators",
      "locations": [
        "loc_embryo_sublab"
      ],
      "from": [
        "loc_maintenance_dock"
      ],
      "threatDelta": 1,
      "label": "掠食者走廊",
      "note": "實驗室外側走廊有迅猛龍活動痕跡，從地面接近會經過牠們的獵區。"
    },
    {
      "id": "helipad_tunnel_climb",
      "locations": [
        "loc_south_helipad"
      ],
      "from": [
        "loc_service_tunnel"
      ],
      "threatDelta": 1,
      "label": "漫長爬升",
      "note": "管道盡頭是通往懸崖的陡峭爬梯，攀爬過程無法回頭。"
    },
    {
      "id": "helipad_road_dash",
      "locations": [
        "loc_south_helipad"
      ],
      "from": [
        "loc_maintenance_dock"
      ],
      "threatDelta": 2,
      "label": "山路衝刺",
      "note": "駕車走盤山泥路速度快，但引擎聲會把整座山谷的注意力都帶過來。"
    }
  ],
  "npcs": [
    {
      "id": "npc_engineer_morales",
      "name": "曼努埃爾·莫拉萊斯",
      "role": "B區駐站資深機電維修主管",
      "initialStatus": "alive",
      "contactFlags": [
        "flag_radio_contact_established",
        "flag_engineer_ready_to_move",
        "flag_engineer_panic_lockout"
      ],
      "presenceScenes": [
        "evt_power_room_entry",
        "evt_helipad_final",
        "evt_evacuation_departure"
      ],
      "knowledge": {
        "observed": [
          "主控中心在風雨增強時單方面切斷了 B 區主輸電網",
          "地下管道排風隔柵被小型恐龍咬破",
          "吉普車的絞盤與蓄電池仍可使用"
        ],
        "reported": [
          "停電前對講機傳來主園區迅猛龍脫逃的混亂呼叫",
          "南側停機坪直升機只能在暴風雨中等待有限時間"
        ],
        "inferred": [
          "全島跳電不是天氣造成的，而是主系統遭到人為篡改",
          "不手動重啟地下發電機的話，胚胎庫冷卻系統會在短時間內停擺"
        ],
        "secret": [
          "他在機房配電箱底部藏了一把備用防暴電擊棍",
          "他知道維修管道深處有一道未標記的緊急排洪閥，可直通停機坪山腳"
        ]
      },
      "privateGoals": [
        "重啟發電機恢復基本防禦",
        "帶著維修日誌活著登上直升機"
      ],
      "fearThreshold": "threat_stage=接觸 時會退向厚重鋼製控制台後方，並優先保全自己",
      "memoryRules": [
        "若玩家成功重啟發電機，視玩家為可靠技術專家，主動提供電擊棍與捷徑情報",
        "若玩家以武力威脅他，表面配合但保留關鍵安全閥密碼",
        "若玩家放棄實驗室研究員，拒絕再為玩家操作複雜的旁路分流電路"
      ],
      "voice": {
        "tone": "沙啞、疲憊但沉穩，帶有工程師特有的嚴謹與焦慮",
        "vocabulary": [
          "繼電器",
          "高壓刀閘",
          "柴油加壓",
          "過載跳脫"
        ],
        "avoid": [
          "輕浮玩笑",
          "長篇人生哲理"
        ]
      },
      "exposureStages": [
        {
          "stage": "surface",
          "requiredFlags": []
        },
        {
          "stage": "suspicious",
          "requiredFlags": [
            "flag_radio_contact_established"
          ]
        },
        {
          "stage": "confirmed",
          "requiredFlags": [
            "flag_sabotage_confirmed"
          ]
        }
      ]
    },
    {
      "id": "npc_researcher_karen",
      "name": "凱倫·陳",
      "role": "低溫副實驗室助理遺傳學者",
      "initialStatus": "alive",
      "contactFlags": [
        "flag_lab_corridor_reached",
        "flag_lab_corridor_reached_stealth",
        "flag_survivors_rescued",
        "flag_karen_distrustful"
      ],
      "presenceScenes": [
        "evt_embryo_lab_entry",
        "evt_helipad_final",
        "evt_evacuation_departure"
      ],
      "knowledge": {
        "observed": [
          "兩隻迅猛龍協同狩獵並在尋找強化玻璃的結構弱點",
          "低溫儲存罐的液氮存量不足以支撐長時間常溫暴露",
          "滅菌系統與火警噴淋仍連接應急蓄電池"
        ],
        "reported": [
          "主島實驗室已完成新一代掠食動物的基因重組測試"
        ],
        "inferred": [
          "胚胎一旦失去低溫活性，這批研發成果將完全報廢",
          "強化玻璃破裂只是時間問題"
        ],
        "secret": [
          "她已暗中接受競爭對手 BioSyn 的收購承諾，持有加密聯繫信號器",
          "冷藏箱底層夾層藏有一支未標記的高危嵌合體樣本"
        ]
      },
      "privateGoals": [
        "帶著胚胎活著離島",
        "在公海與 BioSyn 接頭人換取酬勞"
      ],
      "fearThreshold": "玻璃出現貫穿裂痕時會陷入恐慌，並優先要求玩家先解決掠食者",
      "memoryRules": [
        "若玩家從迅猛龍手中救出她，會在撤離關鍵時刻提供實驗室門禁權限",
        "若玩家銷毀胚胎，拒絕提供任何後續密碼或協助",
        "若玩家接受走私條件，主動透露公海接頭直升機的備用頻率"
      ],
      "voice": {
        "tone": "高亢、神經質、語速極快，在恐慌與精明算計之間切換",
        "vocabulary": [
          "低溫失活",
          "基因品系",
          "液氮壓力",
          "專利代碼"
        ],
        "avoid": [
          "粗鄙髒話",
          "主動承認背叛"
        ]
      },
      "exposureStages": [
        {
          "stage": "surface",
          "requiredFlags": []
        },
        {
          "stage": "suspicious",
          "requiredFlags": [
            "flag_karen_distrustful"
          ]
        },
        {
          "stage": "confirmed",
          "requiredFlags": [
            "flag_biosyn_contact_made"
          ]
        }
      ]
    },
    {
      "id": "npc_pilot_vance",
      "name": "范斯隊長",
      "role": "InGen 搜救撤離直升機資深飛行員",
      "initialStatus": "alive",
      "contactFlags": [
        "flag_radio_contact_established",
        "flag_helipad_reached"
      ],
      "presenceScenes": [
        "evt_helipad_final",
        "evt_evacuation_departure"
      ],
      "knowledge": {
        "observed": [
          "懸崖停機坪周圍風速已超過安全上限，機身劇烈顛簸",
          "北側盤山公路已被泥石流衝垮半邊",
          "主園區方向已無任何無線電回應"
        ],
        "reported": [
          "B 區維修站有生還者信號正嘗試向停機坪突圍"
        ],
        "inferred": [
          "暴風雨中心將在短時間內鎖死島嶼空域",
          "旋翼一旦在地面受損，全機人員都會葬身懸崖"
        ],
        "secret": [
          "總部給他的私下授權是：若無關鍵科研人員或資產，優先確保機組安全撤離",
          "副駕駛座下藏有一支重型防暴獵槍與數發大口徑照明彈"
        ]
      },
      "privateGoals": [
        "在風速突破極限前把直升機飛回沿岸基地"
      ],
      "fearThreshold": "大型掠食者進入停機坪光圈時會立刻進入起飛倒數",
      "memoryRules": [
        "若玩家在倒數內清除停機坪威脅，會提供最穩定的巡航與醫療支援",
        "若玩家把掠食者引向機艙，會立刻拉升並記錄玩家行為"
      ],
      "voice": {
        "tone": "冷靜、威嚴、軍事化，帶無線電通訊的破擦音",
        "vocabulary": [
          "風切變",
          "倒數兩分鐘",
          "旋翼轉速",
          "燃油警戒線"
        ],
        "avoid": [
          "情緒化哭喊",
          "承諾無限期等待"
        ]
      },
      "exposureStages": [
        {
          "stage": "surface",
          "requiredFlags": []
        },
        {
          "stage": "suspicious",
          "requiredFlags": [
            "flag_radio_contact_established"
          ]
        },
        {
          "stage": "confirmed",
          "requiredFlags": [
            "flag_helipad_reached"
          ]
        }
      ]
    }
  ],
  "items": [
    {
      "id": "item_rain_gear",
      "name": "重型防雨外套",
      "kind": "apparel",
      "carryOver": false,
      "initialLocation": "loc_maintenance_dock",
      "publicDiscoveryText": "厚實的高反光防雨外套，具備基礎防刮耐磨塗層，能擋住刺骨雨水與微量腐蝕性液體。"
    },
    {
      "id": "item_halogen_torch",
      "name": "手持鹵素探照燈",
      "kind": "utility",
      "carryOver": false,
      "initialLocation": "loc_maintenance_dock",
      "publicDiscoveryText": "工業級手持探照燈，能射出穿透暴雨的強烈光束，沉重的蓄電池組略微限制靈活性。"
    },
    {
      "id": "item_maintenance_keycard_b",
      "name": "B區維修授權磁卡",
      "kind": "key",
      "carryOver": false,
      "initialLocation": "loc_maintenance_dock",
      "publicDiscoveryText": "二級權限磁卡，塑膠封套上印著 InGen 設施維護部的標誌。"
    },
    {
      "id": "item_cryo_canister",
      "name": "便攜式生物低溫冷藏箱",
      "kind": "objective",
      "carryOver": false,
      "initialLocation": "loc_embryo_sublab",
      "publicDiscoveryText": "圓柱形金屬手提冷藏箱，箱體外側有數顯溫度計與液氮加壓閥，內部整齊排列著標有基因代碼的冷凍胚胎試管。"
    },
    {
      "id": "item_biosyn_crypto_key",
      "name": "BioSyn 加密通訊信號器",
      "kind": "secret",
      "carryOver": false,
      "initialLocation": "loc_embryo_sublab",
      "publicDiscoveryText": "偽裝成普通尋呼機的黑色硬體信號器，內部燒錄了指向公海特定頻段的動態密鑰與接頭坐標。"
    },
    {
      "id": "item_shock_prod",
      "name": "高壓防暴電擊棍",
      "kind": "weapon",
      "carryOver": false,
      "initialLocation": "loc_power_junction_b",
      "publicDiscoveryText": "配電箱暗格中取出的伸縮式防暴武器，頂部觸頭能瞬間釋放高壓脈衝電弧，足以逼退中小型掠食者。"
    }
  ],
  "clues": [
    {
      "id": "clue_sabotage_trace",
      "name": "電網人為跳脫篡改記錄",
      "reveals": "在短路燒毀的電子鎖伺服器記憶體中，殘留著一段覆蓋安全指令的批次檔代碼，顯示跳電是從主控室特定工位手動下達的。",
      "currentInterpretation": "島上的大斷電並非雷擊事故，而是內部人員刻意關閉了安全防護網絡。",
      "knowledgeLevel": "observed",
      "sourceBindings": [
        {
          "sceneId": "evt_dock_arrival",
          "approachId": "app_dock_hack_lock",
          "outcomeTier": "大成功"
        }
      ],
      "questionUpdates": [
        "q_power_failure_cause"
      ],
      "forbiddenClaims": [
        "completeSecretTruth",
        "exactEnemyLocation"
      ]
    },
    {
      "id": "clue_dino_tracks_dilophosaurus",
      "name": "泥濘中的雙脊龍足跡與黏液",
      "reveals": "吉普車輪邊的泥地裡有數個帶三趾趾爪的深印，旁邊的車門把手上附著帶有強烈刺激性氣味的黑色黏液。",
      "currentInterpretation": "外圍徘徊的是具備遠程噴射毒液能力的雙脊龍，數量至少兩隻以上。",
      "knowledgeLevel": "observed",
      "sourceBindings": [
        {
          "sceneId": "evt_dock_arrival",
          "approachId": "app_dock_stealth_lab",
          "outcomeTier": "大成功"
        }
      ],
      "questionUpdates": [
        "q_evacuation_route"
      ],
      "forbiddenClaims": [
        "exactEnemyLocation"
      ]
    },
    {
      "id": "clue_engineer_situation",
      "name": "維修主管受困坐標與狀態",
      "reveals": "對講機中莫拉萊斯急促說明自己受困於發電機房隔壁工具間，並確認主柴油機需要雙人同步操作才能點火。",
      "currentInterpretation": "重啟電力需要前往地下發電機房與莫拉萊斯會合並協同操作。",
      "knowledgeLevel": "reported",
      "sourceBindings": [
        {
          "sceneId": "evt_dock_arrival",
          "approachId": "app_dock_radio_broadcast",
          "outcomeTier": "成功"
        }
      ],
      "questionUpdates": [
        "q_power_failure_cause"
      ],
      "forbiddenClaims": []
    },
    {
      "id": "clue_grid_shutdown_log",
      "name": "主發電機終端電網關閉時間戳",
      "reveals": "終端螢幕上的日誌顯示：全島電網於晚間九點整被主控台指令全面切斷，備用發電機的自動啟動迴路被蓄意鎖定。",
      "currentInterpretation": "斷電是為了掩蓋某種非法行動，維修站早在兩小時前就已被主控中心放棄。",
      "knowledgeLevel": "observed",
      "sourceBindings": [
        {
          "sceneId": "evt_power_room_entry",
          "approachId": "app_power_restart_generator",
          "outcomeTier": "大成功"
        },
        {
          "sceneId": "evt_power_room_entry",
          "approachId": "app_power_bypass_circuit",
          "outcomeTier": "成功"
        }
      ],
      "questionUpdates": [
        "q_power_failure_cause"
      ],
      "forbiddenClaims": [
        "completeSecretTruth"
      ]
    },
    {
      "id": "clue_nedry_terminal_backdoor",
      "name": "納德利的白兔子後門代碼",
      "reveals": "分析蓄電池旁路協議時，發現一段名為 White_Rabbit 的隱藏腳本，專門用於鎖死外圍通訊並重置胚胎庫門禁。",
      "currentInterpretation": "主程序師是這次事故的始作俑者，其目標直指胚胎冷藏庫。",
      "knowledgeLevel": "inferred",
      "sourceBindings": [
        {
          "sceneId": "evt_power_room_entry",
          "approachId": "app_power_bypass_circuit",
          "outcomeTier": "大成功"
        }
      ],
      "questionUpdates": [
        "q_power_failure_cause",
        "q_embryo_destination"
      ],
      "forbiddenClaims": [
        "exactEnemyLocation"
      ]
    },
    {
      "id": "clue_biosyn_conspiracy",
      "name": "BioSyn 商業間諜收購協議草案",
      "reveals": "凱倫隨身的防水文件袋中有一份未署名的合約備忘錄，承諾在收到完整純系恐龍胚胎後向指定離岸帳戶支付巨額資金。",
      "currentInterpretation": "除了主控室的破壞者之外，實驗室內部也有人參與跨國基因走私計畫。",
      "knowledgeLevel": "observed",
      "sourceBindings": [
        {
          "sceneId": "evt_embryo_lab_entry",
          "approachId": "app_lab_negotiate_biosyn",
          "outcomeTier": "大成功"
        }
      ],
      "questionUpdates": [
        "q_embryo_destination"
      ],
      "forbiddenClaims": [
        "unlockedIdentity"
      ]
    },
    {
      "id": "clue_dna_records_burnt",
      "name": "高溫滅菌後的基因灰燼殘留",
      "reveals": "滅菌爐監視器顯示所有儲存槽內的基因鏈已完全熱解為碳化物，終端資料庫已執行不可逆物理覆寫。",
      "currentInterpretation": "B 區副實驗室的基因備份已徹底銷毀，該批次品系不再存在於世上。",
      "knowledgeLevel": "observed",
      "sourceBindings": [
        {
          "sceneId": "evt_embryo_lab_entry",
          "approachId": "app_lab_purge_samples",
          "outcomeTier": "大成功"
        }
      ],
      "questionUpdates": [
        "q_embryo_destination"
      ],
      "forbiddenClaims": []
    }
  ],
  "unresolvedQuestions": [
    {
      "id": "q_power_failure_cause",
      "text": "努布拉島全島電網與圍欄為何在暴風雨中同時跳脫？",
      "openWhen": {
        "allFlags": [
          "flag_dock_investigated"
        ]
      },
      "evidenceClues": [
        "clue_sabotage_trace",
        "clue_grid_shutdown_log",
        "clue_nedry_terminal_backdoor",
        "clue_engineer_situation"
      ],
      "progressText": "已發現部分系統遭人為篡改的痕跡，但仍需比對發電機終端的原始日誌。",
      "answerWhen": {
        "allClues": [
          "clue_sabotage_trace",
          "clue_grid_shutdown_log"
        ]
      },
      "answer": "主系統程序師為了竊取胚胎並潛逃，在上傳惡意腳本後人為關閉了全島高壓電網與通訊系統。"
    },
    {
      "id": "q_embryo_destination",
      "text": "B區副實驗室內的恐龍胚胎最終將去向何方？",
      "openWhen": {
        "scenes": [
          "evt_embryo_lab_entry"
        ]
      },
      "evidenceClues": [
        "clue_biosyn_conspiracy",
        "clue_dna_records_burnt",
        "clue_nedry_terminal_backdoor"
      ],
      "progressText": "胚胎目前仍在便攜冷藏箱內，最終歸宿取決於你的保護、走私或銷毀抉擇。",
      "answerWhenFlags": [
        "flag_lab_event_completed"
      ],
      "answer": "胚胎可被送上官方直升機、經黑市管道轉交競爭對手，或在滅菌爐中化為灰燼；本次輪迴的結果由你的處置決定。",
      "openWhenFlags": [
        "flag_lab_corridor_reached",
        "flag_lab_corridor_reached_stealth"
      ]
    },
    {
      "id": "q_evacuation_route",
      "text": "面對暴風雨、泥石流與恐龍阻截，哪條路徑能通往最後的停機坪？",
      "openWhen": {
        "allFlags": [
          "flag_dock_investigated"
        ]
      },
      "evidenceClues": [
        "clue_dino_tracks_dilophosaurus",
        "clue_engineer_situation"
      ],
      "progressText": "地面公路面臨泥石流與巨獸伏擊，地下管廊積水嚴重但相對隱蔽，需要在速度與風險之間取捨。",
      "answerWhenFlags": [
        "flag_helipad_reached"
      ],
      "answer": "可以修復吉普車強行突破地面盤山公路，或經由地下排水管廊涉水攀爬至懸崖平台。"
    }
  ],
  "stateSchema": {
    "threatStage": [
      "潛伏",
      "追蹤",
      "貼近",
      "接觸"
    ],
    "npcStatus": [
      "alive",
      "met",
      "injured",
      "critical",
      "suspicious",
      "dead",
      "survived",
      "unknown"
    ],
    "infectionStatus": [
      "unknown"
    ],
    "sampleStatus": [
      "none",
      "tissue",
      "preserved",
      "destroyed"
    ],
    "shipStatus": [
      "blackout",
      "stable",
      "powered",
      "burning",
      "collapsed"
    ],
    "airlockPhase": [
      "unseen",
      "approach",
      "positioned",
      "boarding",
      "secured"
    ],
    "playerLocation": [
      "loc_maintenance_dock",
      "loc_power_junction_b",
      "loc_embryo_sublab",
      "loc_service_tunnel",
      "loc_south_helipad"
    ],
    "injuryIds": [
      "acid_burn_minor",
      "acid_burn_major",
      "burn_minor",
      "burn_major",
      "bleeding_major",
      "fracture_leg",
      "frostbite_minor",
      "impact_hand_minor",
      "suffocation_major",
      "unconscious"
    ]
  },
  "scenes": [
    {
      "id": "evt_dock_arrival",
      "nodeId": "n1",
      "location": "loc_maintenance_dock",
      "title": "裝卸坪破局與入口選擇",
      "phase": "opening",
      "defaultTransition": "stay",
      "purpose": "讓玩家理解自己站在一座已經斷電、圍欄被撕開的維修站外圍，並在第一次選擇前決定要從哪個入口進入建築群。",
      "entryKnowledge": [
        "玩家知道自己被投放進陌生副本，任務是趕上最後一班撤離直升機",
        "玩家不知道斷電是人為破壞",
        "玩家不知道實驗室內還有生還者與胚胎樣本"
      ],
      "gmTruth": [
        "B 區主防護圍欄被倒下的樹木壓垮，主變電箱迴路是被惡意腳本切斷的",
        "數隻雙脊龍正在外圍工程車附近徘徊，會被強光與巨大聲響吸引",
        "地下機房的電子鎖因突波熔死，但手動維修旁路仍可被撬開",
        "排水人孔蓋下方確實通往地下維修管廊，這條路可以完全避開露天區域"
      ],
      "entryNarration": "狂風暴雨中，B 區裝卸坪一片狼藉。陷在泥濘裡的吉普車車燈筆直射向林地，遠處樹影劇烈晃動。通往地下發電機房的重型鐵門緊閉，門鎖處冒著刺鼻黑煙；右側通往胚胎庫的走廊門半掩著；腳邊的排水井蓋下傳來微弱的機械水泵聲。",
      "beats": [
        "確認外圍破壞與威脅方向",
        "選定一個進入建築群的入口",
        "決定要不要先聯繫站內人員"
      ],
      "exitConditions": [
        {
          "playerLeavesLocation": true
        }
      ],
      "approaches": [
        {
          "id": "app_dock_hack_lock",
          "label": "檢修地下發電機房門鎖",
          "intent": "短接被突波燒毀的線路，打開通往動力核心的捷徑",
          "requiresCheck": true,
          "attribute": "智力",
          "skill": "技藝",
          "difficulty": "普通",
          "setupNarration": "你冒雨來到地下發電機房的重型鐵門前。磁卡讀卡器外殼已經被突波燒融，焦黑的電線裸露在外，雨水滴在上面發出滋滋聲響。你卸下控制面板外殼，準備手動搭接伺服旁路。",
          "required": {
            "items": [],
            "locations": [
              "loc_maintenance_dock"
            ],
            "flagsAbsent": [
              "flag_power_door_unlocked",
              "flag_power_door_jammed"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你精準地剝開兩根備用控制線並迅速並聯。伴隨一聲清脆的金屬釋放音，沉重的液壓插銷利落地彈開。讀卡器殘留的微型螢幕上跳出一行紅色代碼，記錄著主控室惡意切斷電網的指令日誌。你迅速閃身推門而入，沒有在泥濘中發出多餘聲響。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_door_unlocked",
                  "flag_dock_cleared",
                  "flag_dock_investigated",
                  "flag_sabotage_confirmed"
                ],
                "cluesAdd": [
                  "clue_sabotage_trace"
                ],
                "timeCost": 1,
                "threatDelta": 0,
                "playerLocation": "loc_power_junction_b",
                "nextEvent": "evt_power_room_entry"
              }
            },
            "成功": {
              "text": "幾次試探性的短接後，繼電器發出合閘的咔嗒聲。重型防暴門的氣密鎖鬆脫，露出一道可供通行的縫隙。你用力推開厚重的鋼門，在暴雨進一步滲入前側身步入通往地下機房的階梯。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_door_unlocked",
                  "flag_dock_cleared",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 0,
                "playerLocation": "loc_power_junction_b",
                "nextEvent": "evt_power_room_entry"
              }
            },
            "驚險成功": {
              "text": "導線碰觸的瞬間爆發出一團刺眼的藍色電火花，灼熱的銅絲燙傷了你的指尖。防暴門終於應聲解鎖，但劇烈的電弧爆鳴在夜空中格外顯眼。遠處泥地裡的陰影停下了動作，朝著你的方向轉過頭顱。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_door_unlocked",
                  "flag_dock_cleared",
                  "flag_dock_investigated"
                ],
                "injuriesAdd": [
                  "burn_minor"
                ],
                "timeCost": 1,
                "threatDelta": 1,
                "playerLocation": "loc_power_junction_b",
                "nextEvent": "evt_power_room_entry"
              }
            },
            "些微失敗": {
              "text": "錯誤的接線引發了內部保險絲熔斷。一縷青煙從面板縫隙冒出，電磁插銷徹底卡死在鎖孔內。正門已經無法透過常規電氣手段打開，你必須另尋途徑進入機房。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_door_jammed",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "失敗": {
              "text": "控制板短路爆出一聲炸響，將你逼退數步。門鎖紋絲不動，而這聲巨響穿透了雨幕。空地上的吉普車旁傳來尖銳的嘶鳴聲，兩隻雙脊龍正踩著泥水朝著挑簷快速逼近。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_door_jammed",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "劇烈的電弧直接引燃了面板周圍的塑膠外殼，黑煙撲面而來。就在你被煙霧遮蔽視線的剎那，一團帶有腐蝕性氣味的黑色毒液狠狠砸在身側的水泥牆面上，發出刺鼻的白煙。雙脊龍已經張開了色彩斑斕的頸傘，封鎖了你的退路。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_door_jammed",
                  "flag_dock_ambushed",
                  "flag_acid_spit_warning",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            },
            "大失敗(命定)": {
              "text": "高壓電弧直接在雨水中炸開，強大的電流將你整個人震飛出去，重重撞在泥濘的水坑中。酸液隨即迎面噴來，灼傷了你的護目鏡與外套。掠食者踩著沉重的步伐將你逼入死角，局勢惡化至極點。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_door_jammed",
                  "flag_dock_ambushed",
                  "flag_acid_spit_warning",
                  "flag_dock_investigated"
                ],
                "injuriesAdd": [
                  "burn_major",
                  "acid_burn_minor"
                ],
                "itemsDamage": [
                  "item_rain_gear"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_dock_survey_jeep",
          "label": "觀察空地吉普車與泥地痕跡",
          "intent": "借助車燈光束辨認恐龍足跡，並確認吉普車是否還能發動",
          "requiresCheck": true,
          "attribute": "感知",
          "skill": "偵察",
          "difficulty": "普通",
          "setupNarration": "吉普車半個車身陷在泥水坑裡，車燈仍然固執地亮著。絞盤鋼索垂在泥地上，引擎蓋縫隙冒出被雨水打散的白汽。你壓低身體靠過去，同時留意腳邊那些深陷的三趾印。",
          "required": {
            "items": [],
            "locations": [
              "loc_maintenance_dock"
            ],
            "flagsAbsent": [
              "flag_jeep_repaired",
              "flag_road_blocked_mudslide"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你抹掉配電盒上的泥水，找出被震脫的電瓶接頭並重新鎖緊；引擎在第二次點火時穩定運轉起來。轉身時你也看清了泥地上的痕跡：三趾深印、車門把手上的黑色黏液，還有沿著圍欄缺口延伸出去的第二串足跡。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_jeep_repaired",
                  "flag_dock_investigated",
                  "flag_dock_cleared"
                ],
                "cluesAdd": [
                  "clue_dino_tracks_dilophosaurus"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "你把鬆脫的電瓶接頭重新鎖回去，引擎在咳嗽幾聲後恢復怠速。泥地上的三趾印比你的手掌還大，但暫時沒有新的痕跡靠近車身。至少你多了一台能動的車。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_jeep_repaired",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "引擎終於發動，但排氣管的爆鳴在雨幕裡傳得很遠。你趕緊把車燈調暗，只是林地邊緣那兩點反光的眼瞳，已經轉了過來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_jeep_repaired",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "雨水灌進了配電盒，你嘗試幾次都只換來繼電器空洞的喀噠聲。車還在原地，泥地上的痕跡也被新的積水沖散，你沒能看出更多東西。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "你踩上踏板想把車倒出泥坑，後輪反而把自己挖得更深。遠處盤山公路方向傳來一陣沉悶的坍塌聲，泥石流剛剛帶走了那條路的一整段路肩。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dock_investigated",
                  "flag_road_blocked_mudslide"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "絞盤鋼索在你腳邊猛然繃斷，鞭打在車門上發出巨響。這聲金屬爆鳴讓圍欄缺口的陰影全部轉向；與此同時，山道方向的路基在雨水中整段滑落。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dock_investigated",
                  "flag_road_blocked_mudslide",
                  "flag_dock_ambushed"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            },
            "大失敗(命定)": {
              "text": "斷裂的鋼索抽在你的小腿上，你整個人跌進齊膝的泥水裡。等你撐起身體，車燈已經照出三個正在逼近的低伏身影，而遠處的公路已經不存在了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dock_investigated",
                  "flag_road_blocked_mudslide",
                  "flag_dock_ambushed"
                ],
                "injuriesAdd": [
                  "bleeding_major"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_dock_stealth_lab",
          "label": "沿走廊潛行接近胚胎實驗室",
          "intent": "避開空地上的掠食者視線，繞行進入側翼實驗室",
          "requiresCheck": true,
          "attribute": "敏捷",
          "skill": "潛行",
          "difficulty": "容易",
          "setupNarration": "側翼走廊的鐵門只是虛掩著，門把上那道暗紅色抓痕還沒被雨水沖淡。你貼著牆面壓低身形，讓引擎聲與雨聲蓋過自己的腳步。",
          "required": {
            "items": [],
            "locations": [
              "loc_maintenance_dock"
            ],
            "flagsAbsent": [
              "flag_lab_corridor_reached"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你踩著積水最淺的邊線移動，每一步都落在雨聲的節奏裡。經過吉普車時，你順手確認了車輪旁那串三趾深印與門把上的黑色黏液——那是能噴射毒液的物種留下的。你在完全沒有驚動任何東西的情況下滑進了實驗室走廊。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_lab_corridor_reached_stealth",
                  "flag_lab_corridor_reached",
                  "flag_dock_cleared",
                  "flag_dock_investigated"
                ],
                "cluesAdd": [
                  "clue_dino_tracks_dilophosaurus"
                ],
                "playerLocation": "loc_embryo_sublab",
                "nextEvent": "evt_embryo_lab_entry",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "你貼著牆面快速穿過露天段，泥水在鞋底發出被雨聲蓋掉的悶響。走廊門在你身後合上，冷氣與消毒水的味道立刻取代了泥腥味。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_lab_corridor_reached",
                  "flag_dock_cleared",
                  "flag_dock_investigated"
                ],
                "playerLocation": "loc_embryo_sublab",
                "nextEvent": "evt_embryo_lab_entry",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "你在最後幾步踢翻了一個空油桶。金屬滾動聲在雨幕裡傳開，你只能放棄潛行直接衝進走廊並反手拉上門。門外傳來某種東西停下來、側耳傾聽的沉默。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_lab_corridor_reached",
                  "flag_dock_cleared",
                  "flag_dock_investigated"
                ],
                "playerLocation": "loc_embryo_sublab",
                "nextEvent": "evt_embryo_lab_entry",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "你成功進了走廊，但在門合上的瞬間，一雙黃綠色的眼瞳已經從灌木叢裡直直對上你。牠知道你進去了，也知道那扇門在哪裡。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_lab_corridor_reached",
                  "flag_spotted_by_dilophosaur",
                  "flag_dock_investigated"
                ],
                "playerLocation": "loc_embryo_sublab",
                "nextEvent": "evt_embryo_lab_entry",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "失敗": {
              "text": "泥水在你踩下的瞬間發出響亮的噗嗤聲。灌木叢裡的低鳴戛然而止，取而代之的是三個方向同時傳來的爪子刨地聲。你被迫退回挑簷下的掩體。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dock_ambushed",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "你在半途滑倒，整個人摔進積水裡。抬頭時，一隻張開頸傘的雙脊龍已經站在你與走廊之間，喉嚨深處發出短促的咕嚕聲。一道黑色液體擦過你的肩膀，布料立刻冒出白煙。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dock_ambushed",
                  "flag_acid_spit_warning",
                  "flag_dock_investigated"
                ],
                "injuriesAdd": [
                  "acid_burn_minor"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            },
            "大失敗(命定)": {
              "text": "你不只滑倒，還把手撐進了裸露電纜旁的積水。刺痛竄上手臂的同時，毒液準確地噴在你的面部側方。你在灼燒與麻痺中連滾帶爬退回掩體，通往走廊的那條路已經被牠佔住了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dock_ambushed",
                  "flag_acid_spit_warning",
                  "flag_dock_investigated"
                ],
                "injuriesAdd": [
                  "acid_burn_major"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_dock_radio_broadcast",
          "label": "用對講機呼叫站內倖存頻道",
          "intent": "聯繫站內人員取得局勢情報或內部協助",
          "requiresCheck": true,
          "attribute": "意志",
          "skill": "交涉",
          "difficulty": "普通",
          "setupNarration": "你退到挑簷最深處，把對講機音量壓到最低，一格一格掃過站內的備用頻道。雜訊像潮水一樣灌進耳朵。",
          "required": {
            "items": [],
            "locations": [
              "loc_maintenance_dock"
            ],
            "flagsAbsent": [
              "flag_radio_contact_established",
              "flag_radio_noise_alert"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "第四個頻道傳來一個沙啞疲憊的聲音。你冷靜報出自己的外包編號與位置，對方沉默兩秒後開始配合：他是駐站維修主管莫拉萊斯，受困在發電機房隔壁的工具間，腿部挫傷但意識清楚。他答應在你抵達時從內側解除機房的機械閂鎖。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_radio_contact_established",
                  "flag_inside_help_unlocked",
                  "flag_dock_investigated"
                ],
                "cluesAdd": [
                  "clue_engineer_situation"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "雜訊中終於擠出一個人聲。對方自報是駐站維修主管莫拉萊斯，受困在發電機房隔壁的工具間；他告訴你主柴油機需要兩個人同時操作才能點火，並要你把手電筒壓低。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_radio_contact_established",
                  "flag_dock_investigated"
                ],
                "cluesAdd": [
                  "clue_engineer_situation"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "你聯繫上了對方，但為了壓過雨聲不得不提高音量。通訊建立了，代價是你剛剛對著整片空地喊了兩句話。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_radio_contact_established",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "頻道裡只有規律的靜電與一段被切斷的自動廣播。你確認站內確實還有電源在維持通訊模組，但沒有人回話。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_radio_static_only",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "你誤觸了廣播鍵。刺耳的回授嘯叫從裝卸坪四角的擴音喇叭同時炸開，整片空地被那聲尖鳴填滿。你花了幾秒才把它關掉，但已經太遲了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_radio_noise_alert",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "回授嘯叫持續了整整五秒，擴音喇叭把它送到圍欄外的每一個角落。等聲音停下時，泥地上已經多出兩道正在快速接近的水花。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_radio_noise_alert",
                  "flag_dock_ambushed",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            },
            "大失敗(命定)": {
              "text": "嘯叫沒有停。老舊的廣播模組在過載中鎖死在發聲狀態，整座維修站變成一個持續尖叫的誘餌。你砸開面板才切斷電源，而此時圍欄外的動靜已經完全不掩飾了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_radio_noise_alert",
                  "flag_dock_ambushed",
                  "flag_dock_investigated"
                ],
                "injuriesAdd": [
                  "impact_hand_minor"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_dock_open_manhole",
          "label": "撬開排水人孔蓋進入維修管廊",
          "intent": "完全避開地面出入口，從地下管道潛入",
          "requiresCheck": true,
          "attribute": "力量",
          "skill": "體魄",
          "difficulty": "普通",
          "setupNarration": "鑄鐵井蓋被泥沙與鏽蝕咬死在框裡。你從工具箱抽出破拆撬棒，把它卡進蓋緣的缺口，用整個上半身的重量壓上去。",
          "required": {
            "items": [],
            "locations": [
              "loc_maintenance_dock"
            ],
            "flagsAbsent": [
              "flag_dock_manhole_opened"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你找準了蓋緣受力最小的那一側，撬棒一沉，井蓋幾乎沒有發出聲音就整個翻了開來。下方是垂直的金屬爬梯與冰冷的積水回音——一條完全避開地面的通路。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dock_manhole_opened",
                  "flag_dock_cleared",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "鏽蝕的鑄鐵在幾次施力後鬆動，你把井蓋推到一旁。下方傳來水泵運轉的微光與潮濕的空氣，維修管廊確實還能通行。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dock_manhole_opened",
                  "flag_dock_cleared",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "井蓋在最後一下被掀開，卻脫手砸在水泥地上發出沉悶的哐當聲。通路打開了，只是這一聲在雨幕裡傳得比你希望的更遠。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dock_manhole_opened",
                  "flag_dock_cleared",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "撬棒兩次從蓋緣滑脫，你的掌心被震得發麻。井蓋只被撬起一道縫又落了回去，你必須換個施力點重來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "撬棒打滑，金屬撞在井蓋上發出接連幾聲清脆的敲擊。井蓋紋絲不動，而那幾聲敲擊像鐘一樣在空地上迴盪。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_manhole_noise",
                  "flag_dock_investigated"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "你把全身重量壓上去，撬棒突然彈開，井蓋邊緣砸在你的手指上。你悶哼一聲鬆手，鑄鐵重重落回框裡的巨響蓋過了雨聲。圍欄缺口方向立刻傳來回應般的嘶鳴。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_manhole_noise",
                  "flag_dock_ambushed",
                  "flag_dock_investigated"
                ],
                "injuriesAdd": [
                  "impact_hand_minor"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            },
            "大失敗(命定)": {
              "text": "撬棒在最大受力點斷開，斷口劃過你的手臂，井蓋整個翻起又砸回原位。金屬爆鳴、你的驚呼與鮮血的氣味在同一秒散進雨裡；圍欄外的東西不再需要猜你在哪裡。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_manhole_noise",
                  "flag_dock_ambushed",
                  "flag_dock_investigated"
                ],
                "injuriesAdd": [
                  "bleeding_major"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        }
      ]
    },
    {
      "id": "evt_service_tunnel_transit",
      "nodeId": "n1",
      "location": "loc_service_tunnel",
      "title": "地底管廊的取道",
      "phase": "transit",
      "defaultTransition": "stay",
      "purpose": "讓玩家把地下管廊建立成可重複使用的安全動線，並決定要從管廊接進哪一個建築模組。",
      "entryKnowledge": [
        "玩家知道管廊連接發電機房、實驗室與停機坪山腳",
        "玩家不知道管廊深處是否有生物活動"
      ],
      "gmTruth": [
        "積水是暴雨倒灌造成的，手動排水泵仍可運作，但需要體力與正確的閥門順序",
        "通往停機坪的檢修豎井確實存在，只是標示牌被鏽蝕遮住",
        "管廊頂部的電纜橋架已經鬆脫，強行拉扯會造成塌落"
      ],
      "entryNarration": "冰冷渾濁的積水沒過小腿，每一步都在混凝土管壁之間拖出長長的回音。黃色應急燈在水面上拉出破碎的倒影，遠處某個方向傳來持續的水滴聲。頭頂的電纜束一路延伸進黑暗，指向三個不同的分支鐵門。",
      "beats": [
        "處理積水與能見度",
        "找出通往停機坪的豎井",
        "選定要接進哪一個建築模組"
      ],
      "exitConditions": [
        {
          "playerLeavesLocation": true
        }
      ],
      "sceneExit": {
        "normal": [
          "loc_power_junction_b",
          "loc_embryo_sublab",
          "loc_south_helipad"
        ],
        "nextByLocation": {
          "loc_power_junction_b": "evt_power_room_entry",
          "loc_embryo_sublab": "evt_embryo_lab_entry",
          "loc_south_helipad": "evt_helipad_final"
        },
        "canReturn": true
      },
      "approaches": [
        {
          "id": "app_tunnel_breach_power_door",
          "label": "打開通往發電機房的分支鐵門",
          "intent": "從管廊內側直接接進地下發電機房",
          "requiresCheck": true,
          "attribute": "智力",
          "skill": "技藝",
          "difficulty": "普通",
          "required": {
            "items": [],
            "locations": [
              "loc_service_tunnel"
            ],
            "flagsAbsent": []
          },
          "outcomes": {
            "大成功": {
              "text": "你認出這扇分支鐵門用的是內側機械閂，根本不需要電力。撥開鏽蝕的護板、拉起兩道插銷，門無聲地向內讓開，柴油與臭氧的氣味立刻迎面而來。你踏進發電機房時，身後的積水甚至沒有濺起水聲。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_door_unlocked",
                  "flag_dock_cleared",
                  "flag_tunnel_route_known"
                ],
                "playerLocation": "loc_power_junction_b",
                "nextEvent": "evt_power_room_entry",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "你撬開護板找到內側機械閂，兩道插銷在幾次施力後鬆脫。鐵門向內開啟，通往地下發電機房的階梯就在眼前。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_door_unlocked",
                  "flag_dock_cleared",
                  "flag_tunnel_route_known"
                ],
                "playerLocation": "loc_power_junction_b",
                "nextEvent": "evt_power_room_entry",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "插銷在最後一下猛然彈開，鐵門撞上牆面發出一記悶雷般的巨響，整條管廊都在回音裡震了一下。你進去了，但這聲響絕對不只你一個人聽見。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_door_unlocked",
                  "flag_dock_cleared",
                  "flag_tunnel_route_known"
                ],
                "playerLocation": "loc_power_junction_b",
                "nextEvent": "evt_power_room_entry",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "護板的鉚釘鏽死了，你只能徒手在冰冷積水裡摸索閂體位置。門沒有打開，你的手指凍得幾乎失去知覺。",
              "effects": {
                "worldFlagsAdd": [],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "你用力過猛，護板整片脫落砸進積水裡。水花與金屬聲同時炸開，管廊深處立刻傳來急促的踩水聲，某個東西正朝這個方向過來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_tunnel_stalked"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "你把整個體重壓上撬棒，門框上方鬆脫的電纜橋架應聲塌落，粗大的電纜束砸在你的肩膀與水面之間。刺耳的金屬撞擊聲沿著管廊傳出很遠，而黑暗深處的踩水聲已經不再掩飾。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_tunnel_stalked"
                ],
                "injuriesAdd": [
                  "impact_hand_minor"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_tunnel_climb_to_helipad",
          "label": "攀上檢修豎井前往南側停機坪",
          "intent": "沿著垂直爬梯離開管廊，直接爬上懸崖平台",
          "requiresCheck": true,
          "attribute": "敏捷",
          "skill": "體魄",
          "difficulty": "普通",
          "required": {
            "items": [],
            "locations": [
              "loc_service_tunnel"
            ],
            "flagsAbsent": [
              "flag_helipad_gate_locked"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你一階一階穩定地爬上豎井，在頂部的檢修口先聽了三秒才推開蓋板。狂風、暴雨與旋翼的轟鳴同時灌進來——南側停機坪就在你面前，而你是從沒有人監視的那一側上來的。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_approach_tunnel"
                ],
                "playerLocation": "loc_south_helipad",
                "nextEvent": "evt_helipad_final",
                "timeCost": 2,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "數十級鋼梯之後，你頂開檢修蓋板翻上懸崖平台。海風幾乎把你從邊緣推回去，直升機的探照燈正掃過雨幕。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_approach_tunnel"
                ],
                "playerLocation": "loc_south_helipad",
                "nextEvent": "evt_helipad_final",
                "timeCost": 2,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "爬到一半時，下方的積水傳來急促的飛濺聲。你放棄了節奏，用最快的速度爬完剩下的高度，在推開蓋板時幾乎脫力。你上來了，但身後那條路已經不能再用。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_approach_tunnel",
                  "flag_tunnel_stalked"
                ],
                "playerLocation": "loc_south_helipad",
                "nextEvent": "evt_helipad_final",
                "timeCost": 2,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "第三段爬梯的固定螺栓鬆脫，整截梯身向外傾斜。你只能退回底部，重新找一個能承重的攀爬點。",
              "effects": {
                "worldFlagsAdd": [],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "你的手在濕滑的橫桿上打滑，整個人摔回積水裡。金屬迴響沿著管廊傳出去很遠，而你的肩膀撞在梯腳上。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_tunnel_stalked"
                ],
                "injuriesAdd": [
                  "impact_hand_minor"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "鬆脫的梯段在你半空中整截塌下來。你連人帶鐵摔進齊腰的濁水，小腿被壓在扭曲的鋼架下。通往停機坪的這條豎井暫時報廢了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_tunnel_stalked",
                  "flag_helipad_gate_locked"
                ],
                "injuriesAdd": [
                  "fracture_leg"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_tunnel_pump_water",
          "label": "操作手動排水泵降低積水",
          "intent": "把管廊積水抽掉，換取移動速度與更安全的動線",
          "requiresCheck": true,
          "attribute": "力量",
          "skill": "技藝",
          "difficulty": "普通",
          "required": {
            "items": [],
            "locations": [
              "loc_service_tunnel"
            ],
            "flagsAbsent": [
              "flag_tunnel_drained",
              "flag_tunnel_pump_jammed"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你依序打開洩壓閥與回流閥，再用搖柄把泵浦帶到工作轉速。水位以肉眼可見的速度下降，露出乾燥的混凝土邊坡與一整排完好的應急工具掛架。整條管廊突然變成一條真正能用的通路。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_tunnel_drained",
                  "flag_tunnel_route_known"
                ],
                "timeCost": 1,
                "threatDelta": -1
              }
            },
            "成功": {
              "text": "搖柄比想像中沉重，但泵浦終於開始吸水。積水退到腳踝以下，你的移動不再拖出誇張的水聲。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_tunnel_drained"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "泵浦運轉起來了，代價是那具老舊馬達發出持續而響亮的嗡鳴。水位下降的同時，你也替整條管廊點了一盞聲音的燈。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_tunnel_drained"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "閥門順序錯了，泵浦只是空轉出一連串氣泡。你必須重新洩壓才能再試一次。",
              "effects": {
                "worldFlagsAdd": [],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "搖柄在你手中打滑，回流閥被硬生生扳斷。泵浦徹底停擺，積水甚至比剛才更高了一些。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_tunnel_pump_jammed"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "斷裂的閥門讓整條回流管噴出高壓濁水，你被沖得倒退幾步撞在管壁上。水位迅速上漲到大腿，漂浮的雜物開始撞擊你的雙腿，而水聲蓋過了你所有判斷方向的能力。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_tunnel_pump_jammed",
                  "flag_tunnel_flooded"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_tunnel_scout_shaft",
          "label": "尋找通往停機坪的檢修豎井",
          "intent": "確認管廊盡頭是否真的有直達懸崖平台的爬梯",
          "requiresCheck": true,
          "attribute": "感知",
          "skill": "偵察",
          "difficulty": "普通",
          "required": {
            "items": [],
            "locations": [
              "loc_service_tunnel"
            ],
            "flagsAbsent": [
              "flag_helipad_shaft_known"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你刮掉標示牌上的鏽層，讀出「南側平台 檢修豎井」與一串高度標記。爬梯完好，頂部的檢修口甚至還掛著可用的安全鉤環。這條路確實能把你送上懸崖。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_shaft_known",
                  "flag_tunnel_route_known"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "在第三個分岔的牆面上，你找到了那面被鏽蝕蓋住的標示牌與其後的垂直爬梯。它確實通往南側懸崖平台的方向。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_shaft_known"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "你找到了豎井，但攀上去試探時整段爬梯發出令人牙酸的金屬呻吟。路是通的，只是這條路會在你使用它的時候大聲宣告。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_shaft_known"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "你在兩個相似的分岔之間來回走了一趟，除了更深的積水什麼也沒找到。標示牌全被鏽蝕與淤泥覆蓋。",
              "effects": {
                "worldFlagsAdd": [],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "你走進了錯誤的分支，直到前方水面泛起一圈不屬於自己的波紋才停下腳步。那圈波紋正在朝你這邊擴散。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_tunnel_stalked"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "你摸黑拉動一道以為是門閂的握把，結果啟動了豎井底部的防洪隔離閘。厚重的鋼閘在轟鳴中落下，把通往停機坪的爬梯關在另一側；而這聲巨響把管廊深處的東西全都叫醒了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_tunnel_stalked",
                  "flag_helipad_gate_locked"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        }
      ]
    },
    {
      "id": "evt_power_room_entry",
      "nodeId": "n2",
      "location": "loc_power_junction_b",
      "title": "發電機房動力重啟",
      "phase": "power",
      "defaultTransition": "stay",
      "purpose": "讓玩家在噪音、油氣與通風管威脅之間選出一條恢復供電的路線，並理解斷電是人為造成的。",
      "entryKnowledge": [
        "玩家知道胚胎庫的冷卻需要電力",
        "玩家不知道電網日誌裡的關閉時間戳",
        "玩家不知道配電箱暗格裡藏著防暴電擊棍"
      ],
      "gmTruth": [
        "主柴油機的高壓油路被切斷，手動加壓閥處於洩壓狀態，需要正確順序才能點火",
        "控制台終端保存著全島電網在兩小時前被主控中心單方面切斷的完整日誌",
        "一隻年輕的雙脊龍被困在排風管道內部，牠會被震動與噪音刺激",
        "莫拉萊斯藏在配電箱底部的電擊棍確實存在，但只有在他信任玩家時才會主動說出"
      ],
      "entryNarration": "地下發電機房瀰漫著濃重的柴油與臭氧氣味。巨大的柴油機組靜止在庫房中央，兩側主電閘全部處於跳脫斷開狀態。儀表板上的紅色警告燈以固定頻率閃爍，照亮地面上緩慢擴散的黑色油漬。頭頂的通風管，傳來一陣不屬於機械的抓撓聲。",
      "beats": [
        "排除通風管上方的威脅",
        "選定重啟或旁路供電的路線",
        "取得電網被人為關閉的證據"
      ],
      "exitConditions": [
        {
          "allFlags": [
            "flag_power_restored"
          ]
        },
        {
          "playerLeavesLocation": true
        }
      ],
      "sceneExit": {
        "normal": [
          "loc_embryo_sublab"
        ],
        "nextEvent": "evt_embryo_lab_entry",
        "canReturn": true
      },
      "approaches": [
        {
          "id": "app_power_restart_generator",
          "label": "依標準規程手動加壓並啟動柴油機組",
          "intent": "按順序完成預熱、加壓與手動點火",
          "requiresCheck": true,
          "attribute": "力量",
          "skill": "技藝",
          "difficulty": "困難",
          "setupNarration": "你站在冰冷龐大的柴油發電機前。機油壓力表指針緊貼底線。你握住手動高壓燃油泵的搖柄，準備按照規程進行手動排氣、注油並拉動機械點火閥門。",
          "required": {
            "items": [],
            "locations": [
              "loc_power_junction_b"
            ],
            "flagsAbsent": [
              "flag_power_restored",
              "flag_generator_destroyed"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你以極其沉穩的節奏連續加壓，油路順暢充盈。猛然拉下點火閥門的瞬間，汽缸同步爆發出渾厚有力的轟鳴，排氣管噴出一股白煙隨即平穩運轉。主控屏上的跳脫燈依次熄滅，綠色的供電光芒重新照亮地下室。終端機自動刷新，彈出了兩小時前全島電網被惡意關閉的完整時間戳日誌。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_restored",
                  "flag_generator_running_smooth",
                  "flag_evidence_secured",
                  "flag_sabotage_confirmed"
                ],
                "cluesAdd": [
                  "clue_grid_shutdown_log"
                ],
                "shipStatus": "powered",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "伴隨幾次回火的悶響，柴油機劇烈抖動數秒後成功點火運轉。低沉的機械震動順著水泥地面擴散開來。你迅速合上主輸電閘，地下室的日光燈閃爍幾下後整齊點亮，抽水泵與排風系統隨之恢復運作。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_restored",
                  "flag_generator_running"
                ],
                "shipStatus": "powered",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "發電機在連番劇烈咳嗽中勉強啟動，由於排氣管積碳，引擎發出震耳欲聾的爆鳴。電力成功恢復、照明燈全數亮起，但巨大的機械運轉聲也透過通風管道傳向地表，維修站周邊的掠食者已被這動靜徹底驚動。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_restored",
                  "flag_generator_running"
                ],
                "shipStatus": "powered",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "燃油泵發出刺耳的空轉聲，發電機轉動幾圈後伴隨黑煙再度熄火。油路中殘留的氣泡阻礙了燃油輸送，你必須重新手動排氣才能進行下一次嘗試。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_generator_stalled"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "失敗": {
              "text": "汽缸內未燃燒的柴油引發嚴重回火爆炸，排氣管噴出一大團火星，金屬碎片四處飛濺。巨大的爆炸聲在密閉機房內震得你耳膜刺痛，通風管道上方的金屬格柵被猛然撞開，一隻受驚的幼年恐龍從天花板跌落下來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_generator_backfire",
                  "flag_dino_dropped_to_floor"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "操作過載導致高壓油管在接頭處徹底爆裂，黑色的柴油如暴雨般噴灑在滾燙的排氣岐管上，瞬間燃起熊熊烈火。刺鼻的濃煙迅速充斥整間地下室，警報器發出尖銳的尖叫，電力依然中斷，而你已被濃煙與火勢逼向角落。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_generator_backfire",
                  "flag_fuel_pipe_ruptured"
                ],
                "injuriesAdd": [
                  "suffocation_major"
                ],
                "shipStatus": "burning",
                "timeCost": 1,
                "threatDelta": 2
              }
            },
            "大失敗(命定)": {
              "text": "燃油混合氣在機體內部引發連環爆炸，飛射的金屬閥門碎片直接擊中你的胸口。火浪將整個主控配電盤燒成焦炭，地下發電機房徹底化為火海，重啟常規動力的可能性被永久抹去。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_generator_backfire",
                  "flag_fuel_pipe_ruptured",
                  "flag_generator_destroyed"
                ],
                "injuriesAdd": [
                  "burn_major"
                ],
                "shipStatus": "burning",
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_power_bypass_circuit",
          "label": "從終端機重構應急電池組旁路",
          "intent": "不啟動高噪音柴油機，只恢復關鍵系統的低功率供電",
          "requiresCheck": true,
          "attribute": "智力",
          "skill": "秘識",
          "difficulty": "困難",
          "setupNarration": "維修終端的螢幕還靠著殘餘電量閃著微光。你調出電網協議清單，開始尋找可以繞過主迴路、直接把蓄電池組掛上關鍵負載的那一條指令。",
          "required": {
            "items": [],
            "locations": [
              "loc_power_junction_b"
            ],
            "flagsAbsent": [
              "flag_power_restored",
              "flag_battery_fuse_blown"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你讀懂了這套專有的自動化協議，逐條解開被鎖定的負載順序。冷藏庫、排水泵與走廊照明依序亮起，機房卻始終安靜。翻查指令歷程時，你同時挖出兩份東西：電網被主控台指令切斷的完整日誌，以及一段名為 White_Rabbit 的隱藏腳本。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_restored",
                  "flag_stealth_power_active",
                  "flag_evidence_secured",
                  "flag_sabotage_confirmed"
                ],
                "cluesAdd": [
                  "clue_grid_shutdown_log",
                  "clue_nedry_terminal_backdoor"
                ],
                "shipStatus": "powered",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "你把蓄電池組掛上關鍵負載，冷藏庫與排水泵的指示燈重新亮起，柴油機始終沒有啟動。終端在刷新時吐出一段日誌：全島電網在兩小時前被主控台指令全面切斷。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_restored",
                  "flag_stealth_power_active"
                ],
                "cluesAdd": [
                  "clue_grid_shutdown_log"
                ],
                "shipStatus": "powered",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "旁路建立了，但負載切換的瞬間整排繼電器同時動作，發出一連串清脆的合閘聲。關鍵系統恢復供電，而這串聲音沿著通風管傳了出去。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_restored"
                ],
                "shipStatus": "powered",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "你成功登入了電網協議，卻發現蓄電池組的剩餘電量遠低於標示值。這條路還在，但可用的時間比你以為的更短。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_battery_drain_warning"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "錯誤的負載順序讓電流集中在同一條支路上，蓄電池組的主保險絲連續熔斷。旁路供電這條路已經被你自己燒斷了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_battery_fuse_blown"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "保險絲熔斷的瞬間，電弧點燃了機架上老化的絕緣材料。橘紅色的火苗沿著電池架向上竄，刺鼻的塑膠焦味立刻填滿了整間機房，你只能一邊咳嗽一邊後退。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_battery_fuse_blown",
                  "flag_short_circuit_fire"
                ],
                "injuriesAdd": [
                  "burn_minor"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            },
            "大失敗(命定)": {
              "text": "整組蓄電池在過載中爆開，強烈的白光與飛濺的電解液把你掀翻在油污地面上。火勢沿著地面的柴油迅速蔓延，機房的空氣在幾秒內變得無法呼吸。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_battery_fuse_blown",
                  "flag_short_circuit_fire"
                ],
                "injuriesAdd": [
                  "burn_major",
                  "acid_burn_minor"
                ],
                "shipStatus": "burning",
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_power_guide_engineer",
          "label": "安撫受困的站內技師並協同操作",
          "intent": "讓熟悉設備的莫拉萊斯指導你扳動雙重同步開關",
          "requiresCheck": true,
          "attribute": "意志",
          "skill": "交涉",
          "difficulty": "普通",
          "setupNarration": "工具間的鐵門後傳來急促的呼吸聲。莫拉萊斯的腿被掉落的冷卻管砸傷，手裡緊攥著一把重型管鉗。他需要一個能讓他冷靜下來的人，你需要他的那雙手。",
          "required": {
            "items": [],
            "locations": [
              "loc_power_junction_b"
            ],
            "flags": [
              "flag_radio_contact_established"
            ],
            "flagsAbsent": [
              "flag_power_restored"
            ],
            "npcStatuses": {
              "npc_engineer_morales": [
                "alive",
                "met",
                "injured"
              ]
            }
          },
          "outcomes": {
            "大成功": {
              "text": "你先報出自己的位置與工具狀況，再一句一句把他的注意力從天花板的聲音拉回配電盤。他的呼吸慢下來，開始用工程師的語言回應你。兩人在同一秒扳下雙重同步開關，整面牆的綠燈整齊亮起。他從配電箱底部摸出一支伸縮電擊棍塞進你手裡：「拿著，我不打算再空手走回去。」",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_restored",
                  "flag_engineer_ready_to_move"
                ],
                "itemsAdd": [
                  "item_shock_prod"
                ],
                "npcStatusChanges": {
                  "npc_engineer_morales": "met"
                },
                "npcTrustDelta": {
                  "npc_engineer_morales": 2
                },
                "shipStatus": "powered",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "你把指令拆成他能在噪音裡聽清楚的短句。莫拉萊斯撐著受傷的腿站到另一側配電盤前，兩人在倒數後同時合閘。供電指示燈依序亮起，他靠著櫃體長長吐出一口氣。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_restored"
                ],
                "npcStatusChanges": {
                  "npc_engineer_morales": "met"
                },
                "npcTrustDelta": {
                  "npc_engineer_morales": 1
                },
                "shipStatus": "powered",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "他在合閘前一刻手抖了一下，第一次同步失敗發出刺耳的電弧聲。第二次才成功。電力恢復了，但那道電弧的爆鳴在管道間傳了很遠。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_restored"
                ],
                "npcStatusChanges": {
                  "npc_engineer_morales": "met"
                },
                "shipStatus": "powered",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "他願意隔著鐵門跟你說話，卻拒絕在天花板還有動靜時走出工具間。你們交換了資訊，但沒有人碰那道總閘。",
              "effects": {
                "npcStatusChanges": {
                  "npc_engineer_morales": "met"
                },
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "你的語氣讓他覺得自己被當成工具而不是同事。莫拉萊斯退回工具間並從內側扣上門閂：「你想拉閘就自己拉。」現在你得靠自己完成雙人操作。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_engineer_panic_lockout"
                ],
                "npcStatusChanges": {
                  "npc_engineer_morales": "met"
                },
                "npcTrustDelta": {
                  "npc_engineer_morales": -1
                },
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "你在他情緒最緊繃的時候提高了音量。莫拉萊斯猛地起身，受傷的腿撐不住重量，他整個人撞在配電櫃邊角上滑坐下去，肋骨傳來明顯的斷裂聲。他推開你的手，把門閂重重扣上。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_engineer_panic_lockout"
                ],
                "npcStatusChanges": {
                  "npc_engineer_morales": "injured"
                },
                "npcTrustDelta": {
                  "npc_engineer_morales": -2
                },
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_power_flush_pipe",
          "label": "高壓排氣強制驅逐通風管內的生物",
          "intent": "先清除機房上方的潛伏威脅，確保後續操作不會被打斷",
          "requiresCheck": true,
          "attribute": "感知",
          "skill": "求生",
          "difficulty": "普通",
          "setupNarration": "天花板的排風格柵後方有東西在移動。你循著管線走向找到主排氣閥，只要洩壓時機抓對，高壓氣流會把那個東西逼回地面層。",
          "required": {
            "items": [],
            "locations": [
              "loc_power_junction_b"
            ],
            "flagsAbsent": [
              "flag_power_room_dino_cleared"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你等到抓撓聲移動到主管道正上方才猛地開閥。高壓氣流在管內爆出一聲悶響，那個東西尖叫著沿著支管一路退向地表。你順手打開配電箱底部的暗格，把裡面那支伸縮電擊棍收進腰間。機房安靜了下來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_room_dino_cleared",
                  "flag_power_room_safe"
                ],
                "itemsAdd": [
                  "item_shock_prod"
                ],
                "timeCost": 1,
                "threatDelta": -1
              }
            },
            "成功": {
              "text": "排氣閥開啟的瞬間，管道內傳出一陣慌亂的爪擊聲，隨後迅速遠去。頭頂終於只剩下金屬冷卻的細微聲響。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_room_dino_cleared"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "那個東西被逼走了，但牠在逃離時撞破了兩片格柵，金屬片接連砸落在機組外殼上。你清空了頭頂，也宣告了自己在這裡。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_power_room_dino_cleared"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "你開閥的時機早了幾秒，氣流只掃到空管。抓撓聲停頓了一下，接著換了一個方向繼續移動。",
              "effects": {
                "worldFlagsAdd": [],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "高壓氣流不但沒能把牠逼回地面，反而把牠直接沖出了下方的格柵。一隻幼年雙脊龍重重摔在油污地面上，立刻低伏起身，頸部的皮膜正在張開。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dino_dropped_to_floor"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "格柵整片塌落，掉下來的不只一隻。你被撲倒在柴油與積水裡，前臂被爪子劃開一道深口，濃烈的血腥味立刻在密閉空間裡擴散開來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_dino_dropped_to_floor",
                  "flag_player_ambushed"
                ],
                "injuriesAdd": [
                  "bleeding_major"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        }
      ]
    },
    {
      "id": "evt_embryo_lab_entry",
      "nodeId": "n3",
      "location": "loc_embryo_sublab",
      "title": "胚胎副實驗室防線與處置",
      "phase": "sublab",
      "defaultTransition": "stay",
      "purpose": "讓玩家在掠食者、受困研究員與高價值樣本之間做出一次不可逆的處置抉擇。",
      "entryKnowledge": [
        "玩家看得到氣密室內有一名研究員",
        "玩家看得到中央冷藏罐與便攜冷藏箱",
        "玩家不知道研究員與 BioSyn 的協議"
      ],
      "gmTruth": [
        "助理研究員凱倫·陳受困於強化氣密操作間內，玻璃已有貫穿裂痕",
        "兩隻迅猛龍正在外側實驗區試探玻璃的結構弱點，牠們懂得包抄",
        "便攜冷藏箱內的胚胎在常溫下只能維持約四十五分鐘活性",
        "凱倫持有 BioSyn 的加密信號器，只有在她認定玩家是同夥時才會拿出來"
      ],
      "entryNarration": "白色的實驗室地面滿是碎玻璃與打翻的化學試劑瓶。白霧般的冷氣從破裂的管道緩緩湧出。兩隻敏捷的掠食者背對著門口，用利爪刮擦氣密室的強化玻璃；玻璃上已布滿蛛網狀裂紋，裡面的研究員臉色慘白地指著控制面板。",
      "beats": [
        "解決或引開迅猛龍",
        "決定研究員的命運",
        "決定胚胎的去向"
      ],
      "exitConditions": [
        {
          "anyFlags": [
            "flag_embryos_secured",
            "flag_embryos_destroyed"
          ]
        },
        {
          "playerLeavesLocation": true
        }
      ],
      "sceneExit": {
        "normal": [
          "loc_service_tunnel"
        ],
        "nextEvent": "evt_service_tunnel_transit",
        "canReturn": true
      },
      "approaches": [
        {
          "id": "app_lab_distract_cryo",
          "label": "手動過載液氮排氣閥製造低溫白霧",
          "intent": "用冷卻氣體阻斷恐龍視線與嗅覺，趁機衝入氣密室營救",
          "requiresCheck": true,
          "attribute": "智力",
          "skill": "技藝",
          "difficulty": "困難",
          "setupNarration": "你悄無聲息地靠近走廊外側的液氮緊急排氣閥手輪。實驗室內，兩隻迅猛龍正專注地用尖爪試探強化氣密室的玻璃接縫。你雙手握緊閥門，深吸一口氣。",
          "required": {
            "items": [],
            "locations": [
              "loc_embryo_sublab"
            ],
            "flagsAbsent": [
              "flag_embryos_secured",
              "flag_embryos_destroyed",
              "flag_nitrogen_vent_broken"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你一口氣將排氣閥旋至最大。伴隨高亢的尖嘯，滾滾乳白色的零下低溫白霧瞬間淹沒整個實驗室。強烈的冷浪與窒息性氮氣讓兩隻迅猛龍陷入極度混亂，發出痛苦的尖鳴並盲目退向後門。你戴上防護面罩衝入氣密室，將受凍的研究員一把拉起，順手把閃爍綠燈的便攜冷藏箱牢牢扣在腰間，整個過程乾淨利落。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_secured",
                  "flag_survivors_rescued",
                  "flag_raptors_disoriented",
                  "flag_lab_event_completed"
                ],
                "itemsAdd": [
                  "item_cryo_canister"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": 2
                },
                "sampleStatus": "preserved",
                "timeCost": 1,
                "threatDelta": -1
              }
            },
            "成功": {
              "text": "液氮白霧迅速擴散，遮蔽了室內所有視線。迅猛龍在迷霧中失去氣味與視覺鎖定，焦躁地原地踏步。你趁機撞開氣密室側門，引導凱倫抱著冷藏箱撤出危險區域，成功穿過走廊撤向安全通道。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_secured",
                  "flag_survivors_rescued",
                  "flag_lab_event_completed"
                ],
                "itemsAdd": [
                  "item_cryo_canister"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": 1
                },
                "sampleStatus": "preserved",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "低溫白霧阻礙了恐龍，也讓室內溫度驟降至冰點以下。你在濃霧中抓起冷藏箱與凱倫，刺骨的冷氣凍得你雙手生疼。一隻迅猛龍憑聽覺盲目揮爪，擦著你的外套劃過。你們成功逃出，但身後已傳來掠食者破霧而出的腳步聲。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_secured",
                  "flag_survivors_rescued",
                  "flag_lab_event_completed"
                ],
                "itemsAdd": [
                  "item_cryo_canister"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "injuriesAdd": [
                  "frostbite_minor"
                ],
                "sampleStatus": "preserved",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "排氣閥完全卡在最大開度，濃稠的白霧反向倒灌進走廊，連你自己也看不清氣密室的大門。冰冷的氣體讓你劇烈咳嗽，你被迫暫時後撤重新辨認方位，錯失了最佳營救窗口。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_lab_fog_too_thick"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "失敗": {
              "text": "排氣管道因生鏽發出一聲刺耳的金屬尖叫。白霧尚未成型，兩隻迅猛龍便瞬間轉過頭顱，金黃色的眼瞳死死鎖定閥門旁的你。其中一隻敏捷地躍過實驗台，貼著地面向你飛撲而來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_raptor_ambush_player"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "閥門噴出的氣流非但沒能迷惑恐龍，反而激怒了體型較大的那一隻。牠狂暴地撞碎已經開裂的氣密室玻璃，利爪直接劃破研究員的護具。鮮血噴濺在白色瓷磚上，室內傳來撕心裂肺的呼救聲。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_raptor_ambush_player",
                  "flag_researcher_critical"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "injured"
                },
                "timeCost": 1,
                "threatDelta": 2
              }
            },
            "大失敗(命定)": {
              "text": "氣密室玻璃徹底崩塌，研究員瞬間被拖入陰影中。與此同時，另一隻迅猛龍從側翼盲區破霧撲出，將你重重踩在積滿碎玻璃的地板上。冰冷的鐮刀爪死死抵住你的喉嚨，局勢陷入絕境。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_raptor_ambush_player",
                  "flag_researcher_critical"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "dead"
                },
                "injuriesAdd": [
                  "bleeding_major"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_lab_combat_containment",
          "label": "使用電擊棍與強光正面壓制迅猛龍",
          "intent": "以高壓電流與強光強行擊退掠食者，確保樣本與人員安全",
          "requiresCheck": true,
          "attribute": "敏捷",
          "skill": "格鬥",
          "difficulty": "很困難",
          "setupNarration": "你把探照燈調到最強，另一手握緊電擊棍的絕緣握把。兩隻掠食者已經注意到光源，開始分開向兩側移動。",
          "required": {
            "items": [],
            "locations": [
              "loc_embryo_sublab"
            ],
            "flagsAbsent": [
              "flag_embryos_secured",
              "flag_embryos_destroyed"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你在牠們完成包抄之前先動手。強光直射眼睛的瞬間，電擊棍的觸頭準確頂上領頭那隻的頸側，數萬伏特讓牠整個身體弓起後重摔在地。另一隻掉頭撞開後門逃走。你拉開氣密室，把研究員與冷藏箱一起帶了出來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_secured",
                  "flag_survivors_rescued",
                  "flag_raptor_alpha_killed",
                  "flag_lab_event_completed"
                ],
                "itemsAdd": [
                  "item_cryo_canister"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": 2
                },
                "sampleStatus": "preserved",
                "timeCost": 1,
                "threatDelta": -1
              }
            },
            "成功": {
              "text": "電弧在狹窄的實驗區裡連續炸開三次，刺眼的藍白光讓兩隻掠食者退向後門。你趁著這個空檔撞開氣密室，把凱倫與冷藏箱一起拖了出來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_secured",
                  "flag_survivors_rescued",
                  "flag_raptors_retreated",
                  "flag_lab_event_completed"
                ],
                "itemsAdd": [
                  "item_cryo_canister"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": 1
                },
                "sampleStatus": "preserved",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "你逼退了牠們，但代價是被爪尖劃開外套與皮膚。研究員與冷藏箱都出來了，而你的血正一滴滴落在牠們退走的那條路線上。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_secured",
                  "flag_survivors_rescued",
                  "flag_lab_event_completed"
                ],
                "itemsAdd": [
                  "item_cryo_canister"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "injuriesAdd": [
                  "bleeding_major"
                ],
                "sampleStatus": "preserved",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "電擊棍的觸頭在第一次接觸時就被咬彎，強光也只讓牠們退了半步。你必須先退回門邊重新評估，武器已經不能再指望。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_weapon_damaged"
                ],
                "itemsDamage": [
                  "item_shock_prod"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "失敗": {
              "text": "牠們比你快。第一隻吸引你的視線，第二隻從側後方掠過，爪尖在你的大腿上撕開一道傷口。你被迫退到實驗台後方，氣密室仍在牠們與你之間。",
              "effects": {
                "injuriesAdd": [
                  "bleeding_major"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "包抄成功了。你在後退時被翻倒的離心機絆倒，膝蓋以下傳來清脆的斷裂聲。電擊棍滾出手邊，兩隻掠食者的低吼從左右同時逼近。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_raptor_ambush_player",
                  "flag_weapon_damaged"
                ],
                "itemsDamage": [
                  "item_shock_prod"
                ],
                "injuriesAdd": [
                  "fracture_leg",
                  "bleeding_major"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_lab_purge_samples",
          "label": "啟動高溫滅菌程序銷毀胚胎",
          "intent": "主動銷毀基因資產切斷商業價值，並誘發火警噴淋驅離恐龍",
          "requiresCheck": true,
          "attribute": "意志",
          "skill": "求生",
          "difficulty": "普通",
          "setupNarration": "滅菌爐控制器的紅色護蓋就在你手邊。只要輸入指令，這批價值難以估算的樣本會在幾秒內化為碳。火警系統會同時啟動——那也許是唯一能把牠們趕出去的東西。",
          "required": {
            "items": [],
            "locations": [
              "loc_embryo_sublab"
            ],
            "flags": [
              "flag_power_restored"
            ],
            "flagsAbsent": [
              "flag_embryos_secured",
              "flag_embryos_destroyed"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你掀開護蓋、輸入指令、按下確認，沒有一秒猶豫。滅菌爐在低沉的轟鳴中把所有儲存槽燒成碳化物，火警噴淋隨即啟動，高壓水霧與警報聲一起把兩隻掠食者逼出實驗室。你在噴淋下拉開氣密室，把研究員帶了出來。監視器上的資料庫覆寫進度條走到了底。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_destroyed",
                  "flag_survivors_rescued",
                  "flag_lab_fire_cleared",
                  "flag_lab_event_completed"
                ],
                "cluesAdd": [
                  "clue_dna_records_burnt"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": -2
                },
                "sampleStatus": "destroyed",
                "timeCost": 1,
                "threatDelta": -1
              }
            },
            "成功": {
              "text": "滅菌程序啟動，儲存槽在高溫中一個接一個熄滅指示燈。噴淋系統灑下的水霧讓掠食者退向後門，你趁機把凱倫從氣密室裡拉出來。她在你身後尖叫著要你停下，但已經來不及了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_destroyed",
                  "flag_survivors_rescued",
                  "flag_lab_event_completed"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": -2
                },
                "sampleStatus": "destroyed",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "程序跑完了，但爐體的洩壓閥同時噴出一股高溫蒸汽。你護著凱倫退出實驗室，手背被燙出一片紅腫，警報聲把整棟建築的注意力都拉了過來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_destroyed",
                  "flag_survivors_rescued",
                  "flag_lab_event_completed",
                  "flag_alarm_triggered_loud"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": -2
                },
                "injuriesAdd": [
                  "burn_minor"
                ],
                "sampleStatus": "destroyed",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "你按下確認的瞬間，只有火警警報啟動了。刺耳的鳴笛響徹整個側翼，滅菌爐卻停在自檢畫面。你什麼也沒銷毀，卻已經告訴所有人這裡有人。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_alarm_triggered_loud"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "失敗": {
              "text": "系統要求二級授權，而你沒有。控制台鎖死並開始倒數重試等待，滅菌這條路暫時關上了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_purge_failed_lockout"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "控制台鎖死的同時，警報把兩隻掠食者的注意力從氣密室轉到了你身上。其中一隻已經繞過實驗台，低伏的身體正對著你唯一的退路。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_purge_failed_lockout",
                  "flag_raptor_ambush_player"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_lab_negotiate_biosyn",
          "label": "與受困研究員談成私下協議",
          "intent": "承諾帶出胚胎並平分酬金，換取對方的全力配合",
          "requiresCheck": true,
          "attribute": "意志",
          "skill": "交涉",
          "difficulty": "困難",
          "setupNarration": "她抱著冷藏箱的姿勢不像在保護公司資產，而像在保護自己的財產。你隔著碎裂的玻璃看著她的眼睛，決定先開口的是價碼而不是救援。",
          "required": {
            "items": [],
            "locations": [
              "loc_embryo_sublab"
            ],
            "flagsAbsent": [
              "flag_embryos_secured",
              "flag_embryos_destroyed"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你點破了她抱箱子的姿勢，也點破了她口袋裡那個一直被按著的東西。她沉默三秒，然後笑了：條件、頻率、分成比例，一次講清楚。她打開氣密室、交出冷藏箱，還把一台偽裝成尋呼機的加密信號器拍在你手上，連同那份沒有署名的合約備忘錄。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_secured",
                  "flag_biosyn_contact_made",
                  "flag_karen_fully_cooperating",
                  "flag_survivors_rescued",
                  "flag_lab_event_completed"
                ],
                "itemsAdd": [
                  "item_cryo_canister",
                  "item_biosyn_crypto_key"
                ],
                "cluesAdd": [
                  "clue_biosyn_conspiracy"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": 3
                },
                "sampleStatus": "preserved",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "她聽懂了你的意思，也接受了條件。氣密室的門在她的生物識別下打開，冷藏箱交到你手裡時，她只說了一句：「別讓它離開你的視線。」",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_secured",
                  "flag_biosyn_contact_made",
                  "flag_survivors_rescued",
                  "flag_lab_event_completed"
                ],
                "itemsAdd": [
                  "item_cryo_canister"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": 2
                },
                "sampleStatus": "preserved",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "談成了，但她堅持親自抱著箱子，而且在開門前多花了半分鐘確認你的表情。這半分鐘裡，玻璃上的裂痕又延伸了一截。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_embryos_secured",
                  "flag_biosyn_contact_made",
                  "flag_survivors_rescued",
                  "flag_lab_event_completed"
                ],
                "itemsAdd": [
                  "item_cryo_canister"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "met"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": 1
                },
                "sampleStatus": "preserved",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "她的表情在你提到「分成」時瞬間收緊。「我不知道你在說什麼。」門沒有開，箱子被她抱得更緊了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_karen_distrustful"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "suspicious"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": -1
                },
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "你把話說死了，她卻聽成威脅。她退到操作間最深處，手指懸在密碼鎖上：「沒有我的動態密碼，強行破拆會觸發酸蝕自毀。我們誰也拿不到。」",
              "effects": {
                "worldFlagsAdd": [
                  "flag_karen_refuses_trust"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "suspicious"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": -2
                },
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "她在你逼近玻璃時按下了操作間的緊急求救鈕。刺耳的蜂鳴同時響徹整層樓，兩隻掠食者的頭顱猛然轉了過來——這一次牠們看的不是玻璃，是你。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_karen_panic_alarm",
                  "flag_raptor_ambush_player"
                ],
                "npcStatusChanges": {
                  "npc_researcher_karen": "suspicious"
                },
                "npcTrustDelta": {
                  "npc_researcher_karen": -3
                },
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        }
      ]
    },
    {
      "id": "evt_helipad_final",
      "nodeId": "n4",
      "location": "loc_south_helipad",
      "title": "懸崖停機坪終局突圍",
      "phase": "finale",
      "purpose": "讓玩家在倒數、巨獸與同伴之間完成最後一次取捨，並決定誰真的離開這座島。",
      "entryKnowledge": [
        "玩家知道直升機的起飛窗口即將關閉",
        "玩家看得見阻擋在通道上的大型掠食者",
        "玩家不知道機長私下收到的優先撤離授權"
      ],
      "gmTruth": [
        "最後一架工作直升機的旋翼已加至滿速，機長只剩不到三分鐘起飛窗口",
        "一隻成體霸王龍順著山道追擊而至，站在停機坪與道路交界處",
        "直升機是民用改裝搜救機，沒有任何可用的空對地火力",
        "調度小屋內的信號槍支架與油料緊急切斷閥都可以被玩家使用"
      ],
      "entryNarration": "狂風暴雨在懸崖平台上呼嘯。直升機的探照燈光束在雨幕中穿梭，旋翼的轟鳴震得胸腔發麻。通往舷梯的最後一段水泥通道前，巨大的黑色陰影橫亙在路中央；那顆低垂的頭顱正把琥珀色的豎瞳鎖定在你身上。",
      "beats": [
        "決定用什麼方式突破或引開巨獸",
        "決定誰先上機",
        "完成登機或選擇留下"
      ],
      "sceneExit": {
        "normal": [
          "loc_south_helipad"
        ],
        "nextEvent": "evt_evacuation_departure",
        "canReturn": false,
        "completionMode": "combat_or_boarding"
      },
      "approaches": [
        {
          "id": "app_helipad_flare_distract",
          "label": "發射信號彈誘導巨獸轉向懸崖盲區",
          "intent": "利用暴龍對動態光線的敏感度把牠的視線帶離通道",
          "requiresCheck": true,
          "attribute": "敏捷",
          "skill": "射擊",
          "difficulty": "困難",
          "setupNarration": "狂風暴雨中，霸王龍橫在通往直升機的唯一通道中央，龐大的身軀如同一座黑色巨塔。你拔出信號槍，頂著強烈的側風將槍口抬向懸崖外側的海面空域，手指扣在扳機上。",
          "required": {
            "items": [],
            "locations": [
              "loc_south_helipad"
            ],
            "flagsAbsent": [
              "flag_player_on_heli",
              "flag_helipad_defended"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "一枚熾熱的紅色信號彈破空而出，在暴雨夜空中劃出一道刺目的燃燒軌跡，筆直落向懸崖下方的巨浪。霸王龍的雙瞳被強光死死牽引，發出一聲震天動地的咆哮，轉身邁開巨步朝著懸崖邊緣狂奔追逐。你趁著通道徹底清空，大步踏上金屬登機梯衝入機艙。艙門在身後重重鎖死，直升機隨即平穩拉升拔地而起。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_reached",
                  "flag_player_on_heli",
                  "flag_trex_fully_distracted",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "secured",
                "timeCost": 1,
                "threatDelta": -1
              }
            },
            "成功": {
              "text": "信號彈在密林上方炸開一團耀眼的紅光。巨獸被燃燒的強光吸引，龐大的頭顱猛然轉向左側。藉著這寶貴的數秒空隙，你壓低身體全速衝過開闊的水泥平台，一躍抓住直升機垂下的登機扶手，被副駕駛一把拉入座艙。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_reached",
                  "flag_player_on_heli",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "secured",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "信號彈只分散了巨獸短暫的注意。當你衝向登機梯時，霸王龍已經察覺並憤怒地甩動巨尾橫掃而來。你連滾帶爬撲進機艙，直升機在千鈞一髮之際強行拉起；巨顎狠狠咬在金屬起落架上，撕下一大塊蒙皮。機身在劇烈顛簸中頂著側風艱難爬升脫離。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_reached",
                  "flag_player_on_heli",
                  "flag_heli_skid_damaged",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "secured",
                "injuriesAdd": [
                  "impact_hand_minor"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "強烈的側風把信號彈直接吹向懸崖後方熄滅，微弱的紅光未能吸引巨獸的注意力。霸王龍依然矗立在路口中央，低沉的喉音在暴雨中迴盪，你不得不縮回掩體重新評估突圍路線。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_flare_blown_away"
                ],
                "airlockPhase": "approach",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "失敗": {
              "text": "信號彈擦著霸王龍的面頰飛過，灼熱的火星徹底激怒了這頭掠食者。牠沒有追逐光芒，而是順著彈道直直將目光鎖定在你身上。沉重的腳步踩碎水泥路面，龐然大物以驚人的速度向你的掩體直撲而來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_trex_charges_forward"
                ],
                "airlockPhase": "approach",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "霸王龍碩大的頭顱如同一柄重錘，狠狠撞碎防爆調度小屋的外牆。碎石與鋼筋四處崩飛，強大的衝擊力將你掀翻在地。身旁的同伴在慘叫聲中被咬住拖入黑暗，直升機旋翼在狂暴的氣流中發出刺耳的超速警報。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_trex_charges_forward",
                  "flag_survivor_dragged_away"
                ],
                "injuriesAdd": [
                  "impact_hand_minor"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            },
            "大失敗(命定)": {
              "text": "暴雨遮蔽了視線，信號槍在關鍵時刻受潮啞火。巨獸龐大的黑影瞬間籠罩整片平台，巨大的腳掌踩碎了你身前的掩體。狂風吹散雨水，黑暗在最後一刻降臨，停機坪上只剩下直升機引擎絕望的轟鳴。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_trex_charges_forward",
                  "flag_player_dead"
                ],
                "timeCost": 1,
                "threatDelta": 3
              }
            }
          }
        },
        {
          "id": "app_helipad_ram_jeep",
          "label": "駕駛吉普車全速撞擊並引爆油料",
          "intent": "用車輛殘骸與火光構築屏障，強行開闢登機通路",
          "requiresCheck": true,
          "attribute": "敏捷",
          "skill": "求生",
          "difficulty": "困難",
          "setupNarration": "吉普車的引擎在你腳下咆哮。前方是巨獸，右側是懸崖，而油料補給箱就堆在通道邊。你算的不是怎麼撞上去，是什麼時候跳車。",
          "required": {
            "items": [],
            "locations": [
              "loc_south_helipad"
            ],
            "flags": [
              "flag_jeep_repaired"
            ],
            "flagsAbsent": [
              "flag_player_on_heli",
              "flag_helipad_defended"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你把油門踩到底，在最後三公尺鬆手滾出駕駛座。吉普車撞進油料補給箱，火球在巨獸與登機通道之間炸開一道牆。你從火光邊緣爬起來，頭也不回地衝上舷梯。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_reached",
                  "flag_player_on_heli",
                  "flag_jeep_explosion_barrier",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "secured",
                "timeCost": 1,
                "threatDelta": -1
              }
            },
            "成功": {
              "text": "車頭撞在巨獸側腹上，那頭龐然大物踉蹌著讓開了半個身位。你在車子翻覆前跳出去，滾了兩圈後直接衝進機艙。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_reached",
                  "flag_player_on_heli",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "secured",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "跳車的時機晚了半秒。你被甩出去撞在防風網上，眼前一陣發黑，但通道確實空出來了。你扶著網柱站起來，一步一步走完了最後那幾十公尺。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_reached",
                  "flag_player_on_heli",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "secured",
                "injuriesAdd": [
                  "impact_hand_minor"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "後輪在泥濘中空轉，車子沒能達到需要的速度就陷住了。巨獸只是側過頭看著這台掙扎的機器，通道依然被牠佔著。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_jeep_stuck_in_mud"
                ],
                "airlockPhase": "approach",
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "失敗": {
              "text": "牠在你撞上之前先動了。巨尾橫掃過來，吉普車整台被掀翻滾出三圈，你在翻滾的車廂裡被撞得七葷八素。等你爬出來，車已經變成廢鐵。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_jeep_flipped_by_trex"
                ],
                "injuriesAdd": [
                  "impact_hand_minor"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            },
            "慘烈失敗": {
              "text": "車子被掀起的瞬間你還來不及鬆開安全帶。金屬車廂在懸崖邊緣翻滾，最後卡在防風網的殘骸之間。你的腿被壓在變形的踏板下，而那顆巨大的頭顱正在朝破裂的擋風玻璃低下來。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_jeep_flipped_by_trex",
                  "flag_player_dead"
                ],
                "injuriesAdd": [
                  "fracture_leg"
                ],
                "timeCost": 1,
                "threatDelta": 3
              }
            }
          }
        },
        {
          "id": "app_helipad_radio_pilot_suppress",
          "label": "協調直升機探照燈與側射壓制",
          "intent": "指揮飛行員用低空氣流與強光照射巨獸雙眼製造通道",
          "requiresCheck": true,
          "attribute": "智力",
          "skill": "交涉",
          "difficulty": "很困難",
          "setupNarration": "無線電裡的機長聲音冷靜得像機械鐘。你要說服的是一個所有訓練都在告訴他「立刻拉升」的人，讓他把機頭壓低、把探照燈當成武器。",
          "required": {
            "items": [],
            "locations": [
              "loc_south_helipad"
            ],
            "flags": [
              "flag_radio_contact_established"
            ],
            "flagsAbsent": [
              "flag_player_on_heli",
              "flag_helipad_defended"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你報出風向、巨獸位置與自己的預定路線，一句廢話都沒有。機長沉默兩秒後照做：機頭壓低、探照燈直射，強烈的下洗氣流與白光同時打在那顆頭顱上。巨獸別過臉去的三秒裡，你跑完了整段通道。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_reached",
                  "flag_player_on_heli",
                  "flag_pilot_morale_high",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "secured",
                "npcStatusChanges": {
                  "npc_pilot_vance": "met"
                },
                "npcTrustDelta": {
                  "npc_pilot_vance": 2
                },
                "timeCost": 1,
                "threatDelta": -1
              }
            },
            "成功": {
              "text": "機長接受了你的方案。探照燈轉向巨獸的雙眼，牠不適地甩動頭顱後退了幾步。你抓住這個空檔衝上舷梯。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_reached",
                  "flag_player_on_heli",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "secured",
                "npcStatusChanges": {
                  "npc_pilot_vance": "met"
                },
                "npcTrustDelta": {
                  "npc_pilot_vance": 1
                },
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "他照做了，但機身在低空懸停時被陣風打得劇烈搖晃。你在旋翼氣流與雨水裡幾乎站不住，最後是被人從舷梯上直接拖進機艙的。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_reached",
                  "flag_player_on_heli",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "secured",
                "npcStatusChanges": {
                  "npc_pilot_vance": "met"
                },
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "「否定。」機長的回答只有兩個字。他不會為了照亮一頭霸王龍而把旋翼送進牠的攻擊範圍，你得自己想辦法。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_pilot_refuses_hover"
                ],
                "npcStatusChanges": {
                  "npc_pilot_vance": "met"
                },
                "airlockPhase": "approach",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "失敗": {
              "text": "你的要求讓他判定情勢已經失控。起落架離地半公尺，旋翼轉速攀升——他開始提前執行起飛程序，留給你的時間正在以秒計算。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_heli_lift_early"
                ],
                "npcStatusChanges": {
                  "npc_pilot_vance": "met"
                },
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "慘烈失敗": {
              "text": "機身在提前拉升時被巨獸的尾巴掃過，尾旋翼發出刺耳的金屬摩擦聲。直升機劇烈偏航後勉強穩住，機長的怒吼從無線電裡炸出來：這架飛機再也承受不起第二次。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_heli_lift_early",
                  "flag_tail_rotor_clipped"
                ],
                "npcStatusChanges": {
                  "npc_pilot_vance": "met"
                },
                "npcTrustDelta": {
                  "npc_pilot_vance": -2
                },
                "timeCost": 1,
                "threatDelta": 2
              }
            }
          }
        },
        {
          "id": "app_helipad_sacrifice_cover",
          "label": "手動鎖死控制閘門孤身殿後",
          "intent": "確保同伴與直升機安全拔升，把自己留在安全閘後方",
          "requiresCheck": true,
          "attribute": "意志",
          "skill": "體魄",
          "difficulty": "普通",
          "setupNarration": "隔離閘的手輪就在通道側面。只要把它拉下來，巨獸就過不去；而你也一樣。舷梯上的人正在朝你伸手。",
          "required": {
            "items": [],
            "locations": [
              "loc_south_helipad"
            ],
            "flags": [
              "flag_survivors_rescued"
            ],
            "flagsAbsent": [
              "flag_player_on_heli"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你把最後一個人推上舷梯，然後轉身拉下手輪。重型隔離門在轟鳴中落下，把通道與停機坪徹底切開。直升機在你身後拔升，航標燈穿過雨幕越飛越遠。你退進閘門後方的維修間，反手扣上了插銷。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_defended",
                  "flag_shelter_secured",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "positioned",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "成功": {
              "text": "隔離門在巨獸撲上來的前一刻落下。金屬承受撞擊的悶響一次比一次遠，直升機的燈光已經離開懸崖。你背靠著閘門坐下，聽著自己的呼吸。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_defended",
                  "flag_shelter_secured",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "positioned",
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "門落下的瞬間，你的小腿被壓在門緣與地面之間，硬生生抽出來時留下一道深口。但同伴上機了，門也鎖上了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_helipad_defended",
                  "flag_shelter_secured",
                  "flag_evacuation_concluded"
                ],
                "airlockPhase": "positioned",
                "injuriesAdd": [
                  "bleeding_major"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "些微失敗": {
              "text": "手輪只轉了三分之一就卡死在鏽蝕的齒條上。閘門懸在半空，既擋不住東西，也放不了人。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_gate_mechanism_stuck"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "失敗": {
              "text": "閘門落到一半就被撞了。變形的鋼板卡在軌道上，巨獸的頭顱正從縫隙間擠進來，而你連退路都沒有選好。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_gate_crushed"
                ],
                "timeCost": 1,
                "threatDelta": 2
              }
            },
            "慘烈失敗": {
              "text": "整道閘門被連根撞脫，鋼板砸下來把你掃倒在通道上。直升機的燈光在你視野邊緣拉遠、變小，然後只剩下雨聲與一片陰影。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_gate_crushed",
                  "flag_player_dead"
                ],
                "timeCost": 1,
                "threatDelta": 3
              }
            }
          }
        }
      ]
    },
    {
      "id": "evt_evacuation_departure",
      "nodeId": "n4",
      "location": "loc_south_helipad",
      "title": "離場結算",
      "unlockOnly": true,
      "purpose": "在撤離結果已經由 engine 確定之後，讓玩家看見自己帶走了什麼、留下了什麼。",
      "entryKnowledge": [
        "玩家已經完成或放棄了本次撤離"
      ],
      "gmTruth": [
        "本場景不再改變撤離結果，只呈現已保存的狀態"
      ],
      "entryNarration": "螺旋槳的氣流壓倒停機坪周圍的灌木。努布拉島在暴雨中逐漸縮成一片模糊的黑影，只剩下幾點還沒熄滅的燈火。",
      "beats": [
        "確認隨行人員與物資",
        "確認留在島上的東西"
      ],
      "sceneExit": {
        "normal": [
          "settlement"
        ],
        "canReturn": false,
        "completionMode": "settlement_after_finale"
      },
      "approaches": [
        {
          "id": "app_departure_take_stock",
          "label": "確認隨行人員與帶出的物資",
          "intent": "在結算前清點這一夜真正帶走的東西",
          "requiresCheck": false,
          "attribute": null,
          "skill": null,
          "difficulty": null,
          "required": {
            "items": [],
            "locations": [
              "loc_south_helipad"
            ],
            "flagsAbsent": []
          },
          "outcomes": {
            "成功": {
              "text": "你把冷藏箱、工具與身上每一處傷口都數了一遍，也把還留在那座島上的名字數了一遍。窗外的雨開始變小，遠處的海面正在天光下露出邊界。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_evacuation_concluded"
                ],
                "timeCost": 0,
                "threatDelta": 0
              }
            }
          }
        }
      ]
    },
    {
      "id": "evt_expire_shelter",
      "nodeId": "n-expire",
      "location": "loc_service_tunnel",
      "title": "撤離窗口關閉",
      "unlockOnly": true,
      "purpose": "在時間預算耗盡、直升機離場之後，讓玩家仍然能為自己爭取一個可被記錄的結局。",
      "entryKnowledge": [
        "玩家知道直升機已經離開",
        "玩家不知道搜救何時會來"
      ],
      "gmTruth": [
        "撤離窗口已經永久關閉，本副本不再提供任何登機路徑",
        "地下防空掩體確實存在且可以從內部封閉"
      ],
      "entryNarration": "遠方傳來直升機漸行漸遠的尾音，最終完全被風雨聲淹沒。管廊深處的應急燈一盞接一盞暗下去，只剩下你自己的呼吸在混凝土之間回蕩。",
      "beats": [
        "接受撤離已經結束",
        "為自己找到一個能撐過今晚的位置"
      ],
      "sceneExit": {
        "normal": [
          "settlement"
        ],
        "canReturn": false
      },
      "approaches": [
        {
          "id": "app_expire_seal_shelter",
          "label": "封死地下掩體的防爆鐵門",
          "intent": "把自己關進唯一還能守住的空間",
          "requiresCheck": true,
          "attribute": "力量",
          "skill": "體魄",
          "difficulty": "普通",
          "required": {
            "items": [],
            "locations": [
              "loc_service_tunnel"
            ],
            "flagsAbsent": [
              "flag_shelter_secured"
            ]
          },
          "outcomes": {
            "大成功": {
              "text": "你轉動厚重的防空掩體手輪，最後一道鋼鐵插銷咔嗒落鎖。架上整齊碼放著壓縮口糧與淨水錠，儀表板的紅燈微弱地跳動著。搜救不知何時會來，但今晚你守住了自己的呼吸。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_shelter_secured",
                  "flag_time_expired"
                ],
                "timeCost": 1,
                "threatDelta": -1
              }
            },
            "成功": {
              "text": "掩體的鋼門在你身後合上並落鎖。空氣裡有陳年的機油味，但至少沒有雨，也沒有腳步聲。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_shelter_secured",
                  "flag_time_expired"
                ],
                "timeCost": 1,
                "threatDelta": 0
              }
            },
            "驚險成功": {
              "text": "門在最後一刻合上，插銷落下的同時，外側傳來一記沉重的撞擊。門沒有變形，但你知道牠找到這裡了。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_shelter_secured",
                  "flag_time_expired"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            },
            "失敗": {
              "text": "手輪的齒條鏽死了，門只合上一半。你必須先清掉軌道裡的碎石，而外面的水聲正在靠近。",
              "effects": {
                "worldFlagsAdd": [
                  "flag_time_expired"
                ],
                "timeCost": 1,
                "threatDelta": 1
              }
            }
          }
        }
      ]
    }
  ],
  "finaleCompletion": {
    "any": [
      {
        "allFlags": [
          "flag_player_on_heli"
        ]
      },
      {
        "allFlags": [
          "flag_helipad_defended",
          "flag_shelter_secured"
        ]
      }
    ]
  },
  "finaleVictory": {
    "effects": {
      "worldFlagsAdd": [
        "flag_trex_repelled",
        "flag_helipad_reached",
        "flag_player_on_heli",
        "flag_evacuation_concluded"
      ],
      "airlockPhase": "secured",
      "playerLocation": "loc_south_helipad"
    },
    "nextSceneId": "evt_evacuation_departure",
    "completedSceneIds": [
      "evt_helipad_final"
    ],
    "lastApproachId": "combat.n4",
    "lastOutcomeTier": "戰鬥勝利"
  },
  "endingRules": [
    {
      "endingId": "end_consumed_by_island",
      "allFlags": [
        "flag_player_dead"
      ]
    },
    {
      "endingId": "end_stranded_survival",
      "allFlags": [
        "flag_time_expired",
        "flag_shelter_secured"
      ],
      "flagsAbsent": [
        "flag_player_dead",
        "flag_helipad_reached",
        "flag_player_on_heli"
      ]
    },
    {
      "endingId": "end_heroic_sacrifice",
      "allFlags": [
        "flag_helipad_defended",
        "flag_survivors_rescued"
      ],
      "flagsAbsent": [
        "flag_player_on_heli",
        "flag_player_dead"
      ]
    },
    {
      "endingId": "end_corporate_contraband",
      "allFlags": [
        "flag_player_on_heli",
        "flag_embryos_secured",
        "flag_biosyn_contact_made"
      ],
      "flagsAbsent": [
        "flag_ingen_loyal",
        "flag_player_dead"
      ]
    },
    {
      "endingId": "end_perfect_evacuation",
      "allFlags": [
        "flag_player_on_heli",
        "flag_embryos_secured",
        "flag_survivors_rescued"
      ],
      "flagsAbsent": [
        "flag_time_expired",
        "flag_player_dead"
      ]
    },
    {
      "endingId": "end_samples_lost_survived",
      "allFlags": [
        "flag_player_on_heli"
      ],
      "flagsAbsent": [
        "flag_player_dead"
      ]
    }
  ],
  "endings": [
    {
      "id": "end_perfect_evacuation",
      "kind": "full_success",
      "conditions": [
        "flag_player_on_heli",
        "flag_embryos_secured",
        "flag_survivors_rescued"
      ],
      "text": "螺旋槳的強烈氣流壓倒停機坪周圍的灌木。隨著直升機拉升高度，B區維修站的燈火在下方風雨中逐漸縮成微光。低溫冷藏箱的指示燈穩定閃爍綠光，身旁的研究員癱坐在座位上大口喘氣。你們活著離開了這座孤島。",
      "worldDelta": [
        {
          "key": "isla_nublar.sector_b",
          "value": "evacuated_with_assets",
          "persistence": "world",
          "provenance": "end_perfect_evacuation"
        },
        {
          "key": "ingen.embryo_backup",
          "value": "recovered",
          "persistence": "world",
          "provenance": "end_perfect_evacuation"
        },
        {
          "key": "isla_nublar.blackout_cause",
          "value": "documented_as_sabotage",
          "persistence": "world",
          "provenance": "end_perfect_evacuation"
        }
      ],
      "npcDeltas": [
        {
          "npcId": "npc_engineer_morales",
          "status": "survived",
          "relationship": "trusted_colleague",
          "memorySeeds": [
            "player_restored_power",
            "player_did_not_leave_anyone"
          ]
        },
        {
          "npcId": "npc_researcher_karen",
          "status": "survived",
          "relationship": "obligated",
          "memorySeeds": [
            "player_saved_her_from_raptors"
          ]
        }
      ],
      "memorySeeds": [
        "player_survived_isla_nublar_sector_b",
        "sabotage_evidence_left_the_island"
      ],
      "unresolvedThreads": [
        "company_will_contest_the_incident_report",
        "second_embryo_batch_now_exists_off_island"
      ]
    },
    {
      "id": "end_samples_lost_survived",
      "kind": "survival",
      "conditions": [
        "flag_player_on_heli",
        "未同時滿足其他更專屬的結局條件"
      ],
      "text": "機艙門在千鈞一髮之際重重關上，金屬爪尖在蒙皮上劃出刺耳長音。直升機在狂風中劇烈搖晃著升空。你望向窗外，實驗室方向正冒出滾滾黑煙，那些價值連城的基因樣本已隨同廢墟沉入黑暗。至少，你活下來了。",
      "worldDelta": [
        {
          "key": "isla_nublar.sector_b",
          "value": "abandoned",
          "persistence": "world",
          "provenance": "end_samples_lost_survived"
        },
        {
          "key": "ingen.embryo_backup",
          "value": "lost_on_island",
          "persistence": "world",
          "provenance": "end_samples_lost_survived"
        }
      ],
      "npcDeltas": [],
      "memorySeeds": [
        "player_survived_isla_nublar_sector_b",
        "sector_b_assets_unaccounted_for"
      ],
      "unresolvedThreads": [
        "who_is_responsible_for_the_blackout",
        "sector_b_may_be_re_entered_later"
      ]
    },
    {
      "id": "end_heroic_sacrifice",
      "kind": "sacrifice",
      "conditions": [
        "flag_helipad_defended",
        "flag_survivors_rescued",
        "not flag_player_on_heli"
      ],
      "text": "直升機在引擎的咆哮聲中加速脫離停機坪。強烈的下洗氣流吹散了地面的火光。你站在控制閘門後，手中握著打空的信號槍，背後傳來龐然大物的沉重步伐。你看著同伴安全升空的航標燈，平靜地面對陰影中的咆哮。",
      "worldDelta": [
        {
          "key": "isla_nublar.sector_b",
          "value": "evacuated_without_player",
          "persistence": "world",
          "provenance": "end_heroic_sacrifice"
        },
        {
          "key": "isla_nublar.blackout_cause",
          "value": "reported_by_survivors",
          "persistence": "world",
          "provenance": "end_heroic_sacrifice"
        }
      ],
      "npcDeltas": [
        {
          "npcId": "npc_researcher_karen",
          "status": "survived",
          "relationship": "indebted",
          "memorySeeds": [
            "player_stayed_behind_for_them"
          ]
        },
        {
          "npcId": "npc_engineer_morales",
          "status": "survived",
          "relationship": "indebted",
          "memorySeeds": [
            "player_stayed_behind_for_them"
          ]
        }
      ],
      "memorySeeds": [
        "player_held_the_gate",
        "survivor_testimony_names_the_player"
      ],
      "unresolvedThreads": [
        "is_the_player_still_alive_on_the_island"
      ]
    },
    {
      "id": "end_corporate_contraband",
      "kind": "betrayal",
      "conditions": [
        "flag_player_on_heli",
        "flag_embryos_secured",
        "flag_biosyn_contact_made"
      ],
      "text": "直升機並未飛向常規搜救基地，而是朝著公海低空掠海飛行。金屬手提箱完好無損地放在你的腳邊，裡面沉睡著價值億萬的生命代碼。你點燃一支菸，看著窗外漆黑的海面，你知道自己的下半生將在全新的財富與永無止境的追殺中度過。",
      "worldDelta": [
        {
          "key": "ingen.embryo_backup",
          "value": "diverted_to_competitor",
          "persistence": "world",
          "provenance": "end_corporate_contraband"
        },
        {
          "key": "biosyn.gene_program",
          "value": "accelerated",
          "persistence": "world",
          "provenance": "end_corporate_contraband"
        }
      ],
      "npcDeltas": [
        {
          "npcId": "npc_researcher_karen",
          "status": "survived",
          "relationship": "co_conspirator",
          "memorySeeds": [
            "player_accepted_the_deal"
          ]
        }
      ],
      "memorySeeds": [
        "player_is_wanted_by_two_companies",
        "black_market_contact_established"
      ],
      "unresolvedThreads": [
        "retrieval_teams_will_look_for_the_player",
        "the_unlabelled_sample_is_still_in_the_case"
      ]
    },
    {
      "id": "end_stranded_survival",
      "kind": "stranded",
      "conditions": [
        "flag_time_expired",
        "flag_shelter_secured",
        "not flag_helipad_reached"
      ],
      "text": "遠方傳來直升機漸行漸遠的尾音，最終完全被風雨聲淹沒。你轉動厚重的防空掩體手輪，最後一道鋼鐵插銷咔嗒落鎖。儀表板上的紅燈微弱地跳動著，架子上整齊碼放著幾罐壓縮口糧。搜救不知何時會來，但這座鋼鐵孤島將是你接下來的戰場。",
      "worldDelta": [
        {
          "key": "isla_nublar.sector_b",
          "value": "overrun",
          "persistence": "world",
          "provenance": "end_stranded_survival"
        },
        {
          "key": "isla_nublar.rescue_operation",
          "value": "postponed_indefinitely",
          "persistence": "world",
          "provenance": "end_stranded_survival"
        }
      ],
      "npcDeltas": [],
      "memorySeeds": [
        "player_survived_the_first_night_alone"
      ],
      "unresolvedThreads": [
        "rescue_may_never_arrive",
        "shelter_supplies_will_run_out"
      ]
    },
    {
      "id": "end_consumed_by_island",
      "kind": "death",
      "conditions": [
        "flag_player_dead"
      ],
      "text": "雨水沖刷著破碎的護目鏡，周圍的世界逐漸模糊褪色。金屬撕裂聲、狂風呼嘯與沉重的喉音低鳴在耳畔交織，隨後歸於一片死寂。島嶼收下了它的祭品，暴風雨依舊在黑夜中肆虐。",
      "worldDelta": [
        {
          "key": "isla_nublar.sector_b",
          "value": "overrun",
          "persistence": "world",
          "provenance": "end_consumed_by_island"
        }
      ],
      "npcDeltas": [],
      "memorySeeds": [],
      "unresolvedThreads": [
        "no_record_of_the_player_left_the_island"
      ]
    }
  ],
  "debriefTemplates": [
    {
      "endingId": "end_perfect_evacuation",
      "closingLine": "你在極限時間內完成電網重啟、科研保全與同僚營救，為這座島留下了一份完整的事故紀錄。"
    },
    {
      "endingId": "end_samples_lost_survived",
      "closingLine": "你付出了巨大的科研代價，但在這座被遠古巨獸主宰的孤島上，活著離開本身就是一場勝利。"
    },
    {
      "endingId": "end_heroic_sacrifice",
      "closingLine": "你的殿後讓同僚得以逃出生天，這段紀錄將被寫進他們的證詞裡。"
    },
    {
      "endingId": "end_corporate_contraband",
      "closingLine": "你選擇了背叛秩序並攫取最大個人利益，未來的財富與追殺將徹底改變你的處境。"
    },
    {
      "endingId": "end_stranded_survival",
      "closingLine": "撤離窗口已經關閉，但你在這片史前荒野的鋼鐵孤島中守住了自己的呼吸。"
    },
    {
      "endingId": "end_consumed_by_island",
      "closingLine": "生命在此終結，努布拉島的暴風雨抹去了一切痕跡。"
    }
  ],
  "ambient": [
    {
      "id": "amb_rain_metal",
      "locationId": "loc_maintenance_dock",
      "text": "暴雨重重敲擊著廢棄油桶與工程車頂棚，狂風掠過撕裂的鋼纜，發出如同哨音般的尖嘯。"
    },
    {
      "id": "amb_generator_drip",
      "locationId": "loc_power_junction_b",
      "text": "冷卻管道表面凝聚的水珠不斷滴落在滾燙的排氣閥上，發出連綿不斷的輕微嘶嘶聲。"
    },
    {
      "id": "amb_lab_hiss",
      "locationId": "loc_embryo_sublab",
      "text": "減壓閥每隔數十秒便噴吐出一股冰冷的白霧，地面結霜的碎玻璃在氣流吹拂下發出細微的脆響。"
    },
    {
      "id": "amb_tunnel_echo",
      "locationId": "loc_service_tunnel",
      "text": "膝蓋深的濁水在混凝土牆壁間蕩漾，遠處黑暗的管廊深處傳來利爪刮擦鋼管的空洞回音。"
    },
    {
      "id": "amb_helipad_wind",
      "locationId": "loc_south_helipad",
      "text": "直升機旋翼攪動的下洗氣流與太平洋海風在懸崖邊緣激烈對撞，吹得安全防護網劇烈抖動。"
    }
  ],
  "alignmentSignals": {
    "description": "陣營只記錄玩家選擇的趨勢，不強制玩家行動，也不直接取代技能或骰子。",
    "axes": [
      "善良_邪惡",
      "守序_混亂"
    ],
    "signalExamples": [
      {
        "action": "冒險把受困的研究員或工程師一起帶走",
        "善良_邪惡": -1,
        "守序_混亂": 0
      },
      {
        "action": "把同伴留在原地換取自己的撤離時間",
        "善良_邪惡": 1,
        "守序_混亂": 0
      },
      {
        "action": "遵守設施操作規程並保全事故證據",
        "善良_邪惡": 0,
        "守序_混亂": -1
      },
      {
        "action": "接受走私協議把樣本帶往公海",
        "善良_邪惡": 2,
        "守序_混亂": 2
      },
      {
        "action": "銷毀所有基因樣本以杜絕外流",
        "善良_邪惡": -1,
        "守序_混亂": 1
      }
    ],
    "rule": "同一行動可以同時改變兩條軸；系統只保存累積信號與摘要，不把陣營當成玩家不能選擇其他行動的限制。"
  },
  "crossScenarioExportTemplate": {
    "scenarioId": "scenario.jurassic-park-01-v1",
    "outcomeId": null,
    "worldId": "jurassic_park_universe",
    "timelineId": "isla_nublar_incident_01",
    "playerOutcome": {
      "alive": null,
      "sampleStatus": "none",
      "injuries": [],
      "carryOverItems": []
    },
    "worldDelta": [],
    "npcDeltas": [],
    "memorySeeds": [],
    "unresolvedThreads": [],
    "alignmentSummary": {
      "善良_邪惡": 0,
      "守序_混亂": 0,
      "evidence": []
    }
  },
  "canonicalNarrative": {
    "version": 1,
    "sourceFiles": [
      "批次1 blueprint",
      "批次2 rule-audit",
      "批次3 opening-location",
      "批次4 npc-bible",
      "批次5 travel-clue",
      "批次6 result-variants",
      "批次7 debrief"
    ],
    "policy": "批次提供的文字只提供玩家演出；effects、tier、旗標、位置、戰鬥與結局判定仍由 engine/reference 裁定。"
  },
  "authoredDeviations": [
    "威脅軌由批次的五階段提案改為引擎正式的四階段（潛伏／追蹤／貼近／接觸），文字對應寫在 pack.threatTrack.stages。",
    "所有旗標統一加上 flag_ 前綴；批次的 threatDeltaProposal／outcomeEffectsProposal 已轉為 canonical effects。",
    "批次的結果階層「大失敗」對應引擎正式階層「大失敗(命定)」。",
    "批次以 evt_embryo_sublab 指稱實驗室事件，已統一為事件 ID evt_embryo_lab_entry。",
    "地圖既有的相鄰關係（管廊對發電機房／實驗室）補上了對應的雙向 route，否則地圖會宣稱相鄰卻無法通行。",
    "新增 evt_service_tunnel_transit（管廊取道）與 evt_evacuation_departure（離場結算）兩個事件，讓批次描述的地下動線與結算收尾有可落地的場景。",
    "在裝卸坪新增 app_dock_survey_jeep，對應批次開場選項「觀察空地吉普車與泥地痕跡」，並作為 flag_jeep_repaired 的唯一來源。",
    "玩家死亡旗標只出現在最終停機坪事件的最嚴重階層；批次在實驗室戰鬥提案的即死改為重傷，交由既有 HP／倒地機制處理。",
    "結局判定改為有序規則表（endingRules）：完美撤離不再硬性要求恢復供電（供電仍計入品質分數），而「斷尾求生」作為所有登機路線的保底結局，避免出現無法推導結局的狀態組合。"
  ]
};
