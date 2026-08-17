// [自動同步] 商店起始貨架的**執行期副本**。
//
// 這個檔案的內容逐字對應 content/packs/shop-starter-*.json 那九個檔案。
// 之所以要有一份 .js，理由寫在 content/shop/registry.js 的檔頭：這個專案的政策是
// 「執行期會被 functions/ 匯入的資料一律是普通 JS 模組」，因為 Cloudflare Workers
// 沒有檔案系統。JSON 檔仍然是轉換工作的產出與審閱對象(CONVERSION_RULES.md 指的是那些)。
//
// **改商品請改 JSON，然後同步這裡。** test/shopPacks.test.js 有一則測試逐件比對兩邊，
// 忘記同步就會紅——所以這兩份不可能默默走鐘。

export const SHOP_STARTER_PACKS = [
  {
    "id": "shop-starter.物品",
    "type": "商品",
    "version": "1.0.0",
    "sourceRef": "rules-2.35.txt 第276789行起(無支線武器.htm)、第277258行起(D級武器/武器.htm)",
    "note": "第一批『型錄條目 → 簡化規則商品』的轉換成果，全部是書中真實條目，不是自編。挑選標準是『武器基本屬性寫得明確、可以直接餵給 core/combat/attackTypes.js』。每一條的 droppedTraits 都寫明了哪個原文特性沒被轉換、理由對應 content/shop/effects.js 的 UNSUPPORTED_MECHANICS。",
    "skillMappingNote": "書中前提使用的是原始22技能(白刃/掩飾/運動/調查…)，本專案是十技能。這批用到的對映：白刃→格鬥、運動→體魄、調查→偵察、掩飾→交涉、學識→秘識。這是轉換時的人工判斷，不是書上的欄位，原文前提保留在各條目的 originalPrerequisite。",
    "entries": [
      {
        "name": "特別定制的太陽傘",
        "goodId": "item.特別定制的太陽傘",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": "200",
        "consumable": false,
        "effects": [
          {
            "kind": "武器",
            "label": "特別定制的太陽傘",
            "attackType": "白刃",
            "weaponDamage": 3,
            "severity": "L",
            "ranged": false
          }
        ],
        "droppedTraits": [
          {
            "trait": "太陽傘：撐開時體積變為5並獲得【格擋】特性，此時無法用於攻擊",
            "reason": "格擋"
          },
          {
            "trait": "體積3",
            "reason": "體積"
          }
        ],
        "narrative": "斯卡雷特家族特別定制的太陽傘，用於讓她們得以在白天出去賞花。",
        "sourceRef": "rules-2.35.txt 第276792行(無支線武器.htm)：價格200，分類特殊武器(傘)，武器傷害3L"
      },
      {
        "name": "圓月扇刃",
        "goodId": "item.圓月扇刃",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": "200",
        "consumable": false,
        "effects": [
          {
            "kind": "武器",
            "label": "圓月扇刃",
            "attackType": "白刃",
            "weaponDamage": 3,
            "severity": "L",
            "ranged": false
          }
        ],
        "droppedTraits": [
          {
            "trait": "武器特殊屬性【格擋】",
            "reason": "格擋"
          },
          {
            "trait": "回還：每回合一次，如果你的一次攻擊沒有獲得任何成功數，你獲得重擲此攻擊的機會",
            "reason": "重擲"
          },
          {
            "trait": "扇子只有在展開時才具有武器基礎屬性(閉合體積2/展開4)",
            "reason": "體積"
          }
        ],
        "narrative": "如同圓月一般寒氣奪人、有著完美圓形曲線的武器，仔細看依然是如同扇子的紋路。",
        "sourceRef": "rules-2.35.txt 第276807行(無支線武器.htm)：價格200，分類扇子，武器傷害3L"
      },
      {
        "name": "處女座",
        "goodId": "item.處女座",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": "200",
        "consumable": false,
        "effects": [
          {
            "kind": "武器",
            "label": "處女座",
            "attackType": "白刃",
            "weaponDamage": 4,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "檢定加骰",
            "skill": "交涉",
            "amount": 2
          }
        ],
        "droppedTraits": [
          {
            "trait": "破甲2",
            "reason": "破甲"
          },
          {
            "trait": "女性：本武器女士才可以佩戴，若男性佩戴則所有社交檢定-2附加成功；華貴加值同樣只在佩戴者為女士時生效",
            "reason": "情境條件"
          }
        ],
        "conversionNote": "書上的『華貴：所有社交檢定+2DP表現加值』帶有『佩戴者為女士』的條件。簡化規則沒有性別欄位，而讓AI臨場判斷條件成不成立是被禁止的，所以這裡把+2DP轉成無條件常態生效，並把性別條款(含男性的-2附加成功懲罰)整條記進 droppedTraits。這是本批唯一一條『刻意放寬』的轉換，不是漏抄。",
        "narrative": "一把女士細劍，從內到外透露出一種華麗的感覺。",
        "sourceRef": "rules-2.35.txt 第276824行(無支線武器.htm)：價格200分，分類突刺劍，武器傷害4L破甲2"
      },
      {
        "name": "手杖劍",
        "goodId": "item.手杖劍",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": "200",
        "consumable": false,
        "prerequisites": {
          "skills": {
            "格鬥": 3,
            "交涉": 2
          }
        },
        "originalPrerequisite": "需求白刃等級3，需求掩飾等級2",
        "effects": [
          {
            "kind": "武器",
            "label": "手杖劍(拔劍)",
            "attackType": "白刃",
            "weaponDamage": 4,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "武器",
            "label": "手杖劍(偽裝鞘)",
            "attackType": "白刃",
            "weaponDamage": 0,
            "severity": "B",
            "ranged": false
          },
          {
            "kind": "檢定加骰",
            "skill": "交涉",
            "amount": 2
          }
        ],
        "droppedTraits": [
          {
            "trait": "破甲1",
            "reason": "破甲"
          },
          {
            "trait": "偽裝鞘：可以以一個迅捷動作從手杖中拔出劍",
            "reason": "動作經濟細節"
          },
          {
            "trait": "功能性偽裝：收入鞘中時，無支線等級的安檢裝置無法識別內置的武器",
            "reason": "情境條件"
          },
          {
            "trait": "社會性偽裝的加值『與看到過本武器真面目的角色社交時無效』這條例外",
            "reason": "情境條件"
          }
        ],
        "narrative": "一桿彰顯紳士優雅風度的手杖，裡面配置了防身用的刺劍。購買時也可以要求把手杖型偽裝鞘替換成女式洋傘或扁擔等常見物品。",
        "sourceRef": "rules-2.35.txt 第276843行(無支線武器.htm)：價格200，武器傷害4L破甲1，社會性偽裝社交檢定+2DP器械加值"
      },
      {
        "name": "黑曜石制匕首",
        "goodId": "item.黑曜石制匕首",
        "category": "物品",
        "resourceType": "物品",
        "rank": "D",
        "lineageId": "item.黑曜石制匕首",
        "startsAtRank": true,
        "price": "D+500",
        "consumable": false,
        "effects": [
          {
            "kind": "武器",
            "label": "黑曜石制匕首",
            "attackType": "白刃",
            "weaponDamage": 1,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "敘事",
            "text": "持有者可以進行一個持續1小時的儀式(智力+秘識檢定，DC4)，活剝一個無助狀態對象的皮並披在身上，取得對方的外貌。成功則維持成功數×1天，失敗則被剝皮目標承受3點惡性傷害。"
          }
        ],
        "droppedTraits": [
          {
            "trait": "剝皮儀式的完整判定與後果(DC4的智力+神秘學檢定、3點不可避免惡性傷害、外貌持續時間)",
            "reason": "情境條件"
          }
        ],
        "conversionNote": "儀式的數值部分不是不能算(智力+秘識 DC4 正好是 core/check.js 吃得下的參數)，但它需要一個『對無助目標執行儀式』的流程觸發點，而遊戲迴圈裡沒有那個觸發點。所以這裡轉成敘事效果並保留完整數字，等之後有『情境動作』系統時再接成真的判定。",
        "narrative": "一把純黑曜石製成的原始刀具，製作粗糙、年代久遠，極其鋒利且完全不需要保養。",
        "sourceRef": "rules-2.35.txt 第277261行(D級武器/武器.htm)：本質魔幻，價格D+500，分類匕首，體積1，武器傷害1L"
      },
      {
        "name": "生命短杖",
        "goodId": "item.生命短杖",
        "category": "物品",
        "resourceType": "物品",
        "rank": "D",
        "lineageId": "item.生命短杖",
        "startsAtRank": true,
        "price": "D+500",
        "consumable": false,
        "effects": [
          {
            "kind": "武器",
            "label": "生命短杖",
            "attackType": "白刃",
            "weaponDamage": 2,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "治療",
            "severity": "L",
            "amount": 4
          }
        ],
        "droppedTraits": [
          {
            "trait": "生命恢復：持有者每經過10輪，自動將1點嚴重傷害恢復完好",
            "reason": "自然恢復"
          },
          {
            "trait": "爆發回復的替代選項(改為回復1點惡性傷害)與『接下來5天生命恢復失效』的冷卻",
            "reason": "長期計時"
          }
        ],
        "conversionNote": "『爆發回復』的兩個選項(4點嚴重 或 1點惡性)在簡化規則裡只留下前者當一次性治療效果——本引擎沒有冷卻計時器，如果兩個選項都留下、又沒有冷卻，玩家可以無限回血。留4點L是兩者中較保守的一邊(惡性傷害才是致命的那一軌)。",
        "narrative": "一根木質的兩指寬、兩根筷子長的木棍，看起來像小型擀麵杖，實際上比鋼鐵還硬。某位法師模仿薩滿治療圖騰時的失敗品。",
        "sourceRef": "rules-2.35.txt 第277330行(D級武器/武器.htm)：本質魔幻，價格D+500，分類短棍，武器傷害2L，爆發回復立即將4點嚴重傷害或1點惡性傷害回復完好"
      },
      {
        "name": "鳳翅鎦金镋",
        "goodId": "item.鳳翅鎦金镋",
        "category": "物品",
        "resourceType": "物品",
        "rank": "D",
        "lineageId": "item.鳳翅鎦金镋",
        "startsAtRank": true,
        "price": "D+500",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "力量": 5
          },
          "skills": {
            "格鬥": 4
          }
        },
        "originalPrerequisite": "需求力量5，需求白刃技能4",
        "effects": [
          {
            "kind": "武器",
            "label": "鳳翅鎦金镋",
            "attackType": "白刃",
            "weaponDamage": 8,
            "severity": "L",
            "ranged": false
          }
        ],
        "droppedTraits": [
          {
            "trait": "破甲2",
            "reason": "破甲"
          },
          {
            "trait": "武器特殊屬性【威猛】【長柄武器】",
            "reason": "加值類型"
          },
          {
            "trait": "鳳翅：目標體積小於你的體積與本武器體積之和時，攻擊檢定獲得4DP器械加值",
            "reason": "體積"
          },
          {
            "trait": "提振士氣：處於其他友方單位的模糊範圍內時，這些友方單位的下次攻擊獲得2DP器械加值",
            "reason": "隊友"
          }
        ],
        "narrative": "隋朝大將天寶將軍宇文成都的武器，威猛罕匹。",
        "sourceRef": "rules-2.35.txt 第277306行(D級武器/武器.htm)：本質魔幻，價格D+500，分類戟，體積5，武器傷害8L破甲2"
      }
    ]
  },
  {
    "id": "shop-starter.專長",
    "type": "商品",
    "version": "1.0.0",
    "sourceRef": "rules-2.35.txt 第715行起(專長概述1.htm)、第2203行起(生理系專長1.htm)、第2519行起(心智系專長.htm)、第2789行起(社交系專長.htm)",
    "note": "個人專長的轉換成果。專長跟其他資源最大的不同是**它用XP買，不用支線/分數**——第723行：『要學習一個專長，必須為專長所需的每個專長點數投入3點XP』，一個1~5級的專長總共 3+6+9+12+15=45XP。這裡逐級寫死的價格必須跟 core/xp.js 的 featCost(level) 一致(有測試鎖定)。",
    "levelModelNote": "每一個專長等級是一件獨立商品，效果**逐級累加**而不是取代。書上大量寫成『獲得等同于本專長等級的專長加值』，換算成累加模型就是每一級各給 +1。所以買到3級時，1/2/3 級商品各給的 +1 相加剛好等於書上的『+3』。這個換算是本轉換的統一解讀，寫在這裡一次，不在每條重複。",
    "sequenceNote": "規則書第723行要求專長必須逐級按順序學習，所以**中間級數不能跳過、也不能不上架**——若某一級在簡化規則裡完全轉不出數值效果，它仍然要以原價上架，只是效果只剩敘事。這比『把它藏起來』誠實，也才不會讓上面那一級永遠買不到。這種等級的 effects 只有一個 kind:\"敘事\"，並在 droppedTraits 裡寫明整級被丟掉的理由。",
    "skillMappingNote": "原始22技能→本專案十技能的對映，這批用到：調查→偵察、感受→偵察、電腦→技藝、野外求生→求生、追蹤→求生。注意『調查』與『感受』都併進『偵察』，於是警覺與洞察人心的低階效果在本引擎裡會變成同一件事——那是簡化成十技能之後必然出現的重疊，不是抄錯。",
    "examinedButRejected": [
      {
        "feat": "健步如飛(1~3)",
        "sourceRef": "rules-2.35.txt 第2297行",
        "reason": "三級全滅：1級『基礎移動速度增加5米』→移動速度；2級『沖鋒攻擊+3DP』→進階戰鬥動作；3級『以迅捷動作進行移動』→動作經濟細節。沒有任何一級做得出事情，整個專長不上架(不是『上架成敘事級』——那是給有後續等級要接的中間級用的，這個專長沒有可接的後續)。"
      },
      {
        "feat": "鋼鐵胃袋(1)",
        "sourceRef": "rules-2.35.txt 第2217行",
        "reason": "唯一的數值效果是『對抗惡心點數/饑渴的檢定+2DP』，兩者都是不良狀態軌，本引擎沒有實作。硬轉成『耐力檢定+2』等於自己發明一條規則。"
      },
      {
        "feat": "貓眼(2)",
        "sourceRef": "rules-2.35.txt 第2226行",
        "reason": "效果全是昏暗視覺/視覺敏感範圍/模糊視距 → 距離視野。derivedStats.js 有算 sensoryRangeMeters()，但沒有任何消費端會讀它。"
      },
      {
        "feat": "快速自愈(1~3)",
        "sourceRef": "rules-2.35.txt 第2239行",
        "reason": "1級『傷勢不會惡化』→傷勢惡化(core/health.js 的 tickWorsening() 整個遊戲迴圈沒有任何呼叫端，免疫一件不會發生的事就是假功能)；2級『自然恢復速度提升1倍』→自然恢復；3級『不會因為沒有完好生命值而昏迷』其實接得到 evaluateStatus() 的 unconscious，但它被卡在1、2級後面，而1、2級轉不出來。這條列在這裡，是因為它是最值得優先補的一個——只要之後把 tickWorsening 接進戰鬥迴圈，1級就活了。"
      }
    ],
    "entries": [
      {
        "name": "方向感(1級)",
        "goodId": "feat.方向感.1",
        "lineageId": "feat.方向感",
        "featLevel": 1,
        "category": "專長",
        "price": "3XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "感知": 2
          }
        },
        "originalPrerequisite": "需求感知2",
        "featAttributeCaps": [
          "感知"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "求生",
            "amount": 2
          }
        ],
        "droppedTraits": [],
        "conversionNote": "書上寫『求生（追蹤）相關檢定+2DP專長加值』。這是少數不隨等級縮放的固定值(本專長只有1級)，所以照抄+2。括號裡的『追蹤』是原始22技能的專業，簡化規則沒有專業，加值範圍因此從『求生的追蹤專業』放寬到整個求生技能。",
        "sourceRef": "rules-2.35.txt 第2206行(生理系專長1.htm)：方向感（1），前提需求感知2，求生（追蹤）相關檢定獲得2DP專長加值"
      },
      {
        "name": "荒野求生(1級)：求生專家",
        "goodId": "feat.荒野求生.1",
        "lineageId": "feat.荒野求生",
        "featLevel": 1,
        "category": "專長",
        "price": "3XP",
        "consumable": false,
        "prerequisites": {
          "skills": {
            "求生": 3
          }
        },
        "originalPrerequisite": "需求求生技能3級",
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "求生",
            "amount": 1
          }
        ],
        "droppedTraits": [],
        "sourceRef": "rules-2.35.txt 第2256行(生理系專長1.htm)：荒野求生（1~3），1級求生專家，求生（野外求生）相關檢定獲得等同于本專長等級的專長加值"
      },
      {
        "name": "荒野求生(2級)：荒野生存",
        "goodId": "feat.荒野求生.2",
        "lineageId": "feat.荒野求生",
        "featLevel": 2,
        "category": "專長",
        "price": "6XP",
        "consumable": false,
        "prerequisites": {
          "skills": {
            "求生": 3
          }
        },
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "求生",
            "amount": 1
          }
        ],
        "droppedTraits": [
          {
            "trait": "2級本身的效果：每天一次，求生（野外求生）檢定若不滿意可以重投，但必須接受重投結果",
            "reason": "重擲"
          }
        ],
        "conversionNote": "這一級唯一轉得出來的是等級縮放帶來的 +1(1級的『等同于本專長等級』從1變成2)。2級自己寫的重投效果整條丟掉。",
        "sourceRef": "rules-2.35.txt 第2256行(生理系專長1.htm)：荒野求生（1~3），2級荒野生存"
      },
      {
        "name": "荒野求生(3級)：貝爺",
        "goodId": "feat.荒野求生.3",
        "lineageId": "feat.荒野求生",
        "featLevel": 3,
        "category": "專長",
        "price": "9XP",
        "consumable": false,
        "prerequisites": {
          "skills": {
            "求生": 3
          }
        },
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "求生",
            "amount": 1
          },
          {
            "kind": "附加成功",
            "skill": "求生",
            "amount": 1
          }
        ],
        "droppedTraits": [
          {
            "trait": "人物所有由求生技能的專業所獲得的專業加值提升至3點",
            "reason": "專業"
          }
        ],
        "conversionNote": "『求生（野外求生）相關檢定上獲得1個附加成功』直接轉得過來，是本批唯一一個純粹的附加成功效果。買齊1~3級後求生檢定共 +3DP 與 +1 附加成功，跟書上的『等級3專長加值+1附加成功』一致。",
        "sourceRef": "rules-2.35.txt 第2256行(生理系專長1.htm)：荒野求生（1~3），3級貝爺，求生（野外求生）相關檢定上獲得1個附加成功"
      },
      {
        "name": "精通先攻(1級)",
        "goodId": "feat.精通先攻.1",
        "lineageId": "feat.精通先攻",
        "featLevel": 1,
        "category": "專長",
        "price": "3XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "敏捷": 2
          }
        },
        "originalPrerequisite": "需求敏捷2",
        "featAttributeCaps": [
          "敏捷"
        ],
        "effects": [
          {
            "kind": "先攻",
            "amount": 1
          }
        ],
        "droppedTraits": [],
        "conversionNote": "先攻值是 core/derivedStats.js 的 initiativeScore(敏捷+感知)。這個加值由 combatProfileFrom() 的 initiativeBonus 累加，戰鬥開始時加進 core/combat/turnOrder.js 的 rollInitiative() 參數。",
        "sourceRef": "rules-2.35.txt 第2318行(生理系專長1.htm)：精通先攻（1~3），1級人物的先攻值提升等同于專長等級*1點"
      },
      {
        "name": "精通先攻(2級)",
        "goodId": "feat.精通先攻.2",
        "lineageId": "feat.精通先攻",
        "featLevel": 2,
        "category": "專長",
        "price": "6XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "敏捷": 2
          }
        },
        "featAttributeCaps": [
          "敏捷"
        ],
        "effects": [
          {
            "kind": "先攻",
            "amount": 1
          }
        ],
        "droppedTraits": [
          {
            "trait": "2級本身的效果：當其他單位的先攻權與你相同時，由你先行動",
            "reason": "core/combat/turnOrder.js 的同分處理是『沉著→敏捷→回報需要玩家/隨機決定』，沒有『某個角色永遠贏同分』的旗標可掛，而沉著本身也不在六維裡"
          }
        ],
        "sourceRef": "rules-2.35.txt 第2318行(生理系專長1.htm)：精通先攻（1~3），2級同先攻權時由你先行動"
      },
      {
        "name": "精通先攻(3級)",
        "goodId": "feat.精通先攻.3",
        "lineageId": "feat.精通先攻",
        "featLevel": 3,
        "category": "專長",
        "price": "9XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "敏捷": 3
          }
        },
        "featAttributeCaps": [
          "敏捷"
        ],
        "effects": [
          {
            "kind": "先攻",
            "amount": 3
          },
          {
            "kind": "防御",
            "amount": 3
          }
        ],
        "droppedTraits": [],
        "conversionNote": "先攻的 +3 = 等級縮放的 +1(2→3級) 加上這一級自己寫的『再提升2點』。買齊1~3級共 +5 先攻，跟書上一致(等級加值3 + 再提升2)。『基礎防御提升3點』接到 core/combat/defense.js 的 equipmentDefense——四層防御已於2026-08-15合併成單一DC，所以基礎防御的加值與裝備防御在這裡是同一個欄位。",
        "sourceRef": "rules-2.35.txt 第2318行(生理系專長1.htm)：精通先攻（1~3），3級人物的先攻值再提升2點，同時人物的基礎防御提升3點"
      },
      {
        "name": "警覺(1級)",
        "goodId": "feat.警覺.1",
        "lineageId": "feat.警覺",
        "featLevel": 1,
        "category": "專長",
        "price": "3XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "感知": 3
          },
          "skills": {
            "偵察": 2
          }
        },
        "originalPrerequisite": "需求感知3，調查技能2級",
        "featAttributeCaps": [
          "感知"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "偵察",
            "amount": 1
          }
        ],
        "droppedTraits": [],
        "sourceRef": "rules-2.35.txt 第2339行(生理系專長1.htm)：警覺（1~3），1級調查技能相關檢定獲得等同于本專長等級的專長加值"
      },
      {
        "name": "警覺(2級)",
        "goodId": "feat.警覺.2",
        "lineageId": "feat.警覺",
        "featLevel": 2,
        "category": "專長",
        "price": "6XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "感知": 3
          },
          "skills": {
            "偵察": 2
          }
        },
        "featAttributeCaps": [
          "感知"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "偵察",
            "amount": 1
          }
        ],
        "droppedTraits": [
          {
            "trait": "2級本身的效果：措手不及時可以保留最大等于本專長等級的基礎防御",
            "reason": "不良狀態"
          }
        ],
        "sourceRef": "rules-2.35.txt 第2339行(生理系專長1.htm)：警覺（1~3），2級措手不及時保留基礎防御"
      },
      {
        "name": "警覺(3級)",
        "goodId": "feat.警覺.3",
        "lineageId": "feat.警覺",
        "featLevel": 3,
        "category": "專長",
        "price": "9XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "感知": 3
          },
          "skills": {
            "偵察": 2
          }
        },
        "featAttributeCaps": [
          "感知"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "偵察",
            "amount": 1
          }
        ],
        "droppedTraits": [
          {
            "trait": "3級本身的效果：獲得D級免疫措手不及的能力",
            "reason": "不良狀態"
          }
        ],
        "sourceRef": "rules-2.35.txt 第2339行(生理系專長1.htm)：警覺（1~3），3級獲得D級免疫措手不及"
      },
      {
        "name": "程序猿(1級)",
        "goodId": "feat.程序猿.1",
        "lineageId": "feat.程序猿",
        "featLevel": 1,
        "category": "專長",
        "price": "3XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "智力": 2
          },
          "skills": {
            "技藝": 2
          }
        },
        "originalPrerequisite": "需求智力2，電腦技能2級",
        "featAttributeCaps": [
          "智力"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "技藝",
            "amount": 1
          }
        ],
        "droppedTraits": [],
        "conversionNote": "原始的『電腦』技能對映到十技能的『技藝』(涵蓋終端駭入/拆彈爆破/機械維修改裝)。這是一次明顯的放寬：加值從只吃駭客判定，變成整個技藝技能都吃得到。",
        "sourceRef": "rules-2.35.txt 第2588行(心智系專長.htm)：程序猿（1~2），1級人物在進行電腦技能相關檢定時獲得等同于本專長等級的專長加值"
      },
      {
        "name": "程序猿(2級)",
        "goodId": "feat.程序猿.2",
        "lineageId": "feat.程序猿",
        "featLevel": 2,
        "category": "專長",
        "price": "6XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "智力": 2
          },
          "skills": {
            "技藝": 2
          }
        },
        "featAttributeCaps": [
          "智力"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "技藝",
            "amount": 1
          }
        ],
        "droppedTraits": [
          {
            "trait": "2級本身的效果：使用意志力的基礎用法為檢定增加DP時，額外獲得3DP完美加值",
            "reason": "意志力的『基礎用法』(花意志力換DP)在本引擎沒有實作，character.derived.willpower 只有數字沒有消費端"
          }
        ],
        "sourceRef": "rules-2.35.txt 第2588行(心智系專長.htm)：程序猿（1~2），2級意志力基礎用法額外3DP完美加值"
      },
      {
        "name": "洞察人心(1級)",
        "goodId": "feat.洞察人心.1",
        "lineageId": "feat.洞察人心",
        "featLevel": 1,
        "category": "專長",
        "price": "3XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "感知": 3
          },
          "skills": {
            "偵察": 3
          }
        },
        "originalPrerequisite": "需求感知3，感受技能3級",
        "featAttributeCaps": [
          "感知"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "偵察",
            "amount": 1
          }
        ],
        "droppedTraits": [],
        "sourceRef": "rules-2.35.txt 第2792行(社交系專長.htm)：洞察人心（1~3），1級人物在進行感受技能相關檢定時獲得等同于本專長等級的專長加值"
      },
      {
        "name": "洞察人心(2級)",
        "goodId": "feat.洞察人心.2",
        "lineageId": "feat.洞察人心",
        "featLevel": 2,
        "category": "專長",
        "price": "6XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "感知": 3
          },
          "skills": {
            "偵察": 3
          }
        },
        "featAttributeCaps": [
          "感知"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "偵察",
            "amount": 1
          }
        ],
        "droppedTraits": [
          {
            "trait": "2級本身的效果：每天一次，感受（察言觀色）檢定若不滿意可以重投",
            "reason": "重擲"
          }
        ],
        "sourceRef": "rules-2.35.txt 第2792行(社交系專長.htm)：洞察人心（1~3），2級每天一次可重投察言觀色檢定"
      },
      {
        "name": "洞察人心(3級)",
        "goodId": "feat.洞察人心.3",
        "lineageId": "feat.洞察人心",
        "featLevel": 3,
        "category": "專長",
        "price": "9XP",
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "感知": 3
          },
          "skills": {
            "偵察": 3
          }
        },
        "featAttributeCaps": [
          "感知"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "偵察",
            "amount": 1
          },
          {
            "kind": "防御",
            "amount": 3
          }
        ],
        "droppedTraits": [],
        "conversionNote": "『防御上獲得3點洞察加值』——洞察防御是舊四層防御之一，2026-08-15 併進單一防御DC 之後，它跟精通先攻3級的『基礎防御+3』落在同一個 equipmentDefense 欄位，處理方式必須一致，所以這裡照樣轉成 防御+3。",
        "sourceRef": "rules-2.35.txt 第2792行(社交系專長.htm)：洞察人心（1~3），3級人物在防御上獲得3點洞察加值"
      }
    ]
  },
  {
    "id": "shop-starter.血統",
    "type": "商品",
    "version": "2.0.0",
    "sourceRef": "rules-2.35.txt 第9902行起(撰寫規則.htm 血統模板)、第21162行(阿蘭斯)、第21283行(Orphnoch血統)、第45308行(夜兔)",
    "note": "血統貨架。轉換規則見 CONVERSION_RULES.md，三件商品的來源是 content/packs/d-tier-samples-bloodline.json 的同一批原文——那個包存的是型錄原文，這個包存的是轉換後的商品，刻意分開。",
    "findingNote": "2026-08-17 更新：3件裡2件上架(原本只有1件)。上一輪的結論是『血統的價值幾乎全寫在變身/爆發/每場景一次這種形態上，而引擎既沒有暫時性增益容器也沒有意志力消費端』——那兩個機制做出來之後(content/shop/forms.js)，Orphnoch 整條從掛名轉正，阿蘭斯也把原本丟掉的『帝國子民』撿了回來。這是轉換率表當待辦清單用的第一個驗證：卡住的真的是引擎機制，不是轉換人力。剩下的夜兔仍然不收，理由跟形態無關(『殺戮機器』改寫的是死亡判定本身)。",
    "entries": [
      {
        "name": "阿蘭斯血統-D級：阿蘭斯公民",
        "goodId": "bloodline.阿蘭斯.D",
        "lineageId": "bloodline.阿蘭斯",
        "rank": "D",
        "status": "上架",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "price": "D+600",
        "consumable": false,
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "effects": [
          {
            "kind": "敘事",
            "text": "阿蘭斯帝國的公民。買下這個血統之後，角色在判定上視為超自然生物(規則書第532行：所有兌換了血統的單位在判定上都視為超自然生物)。"
          },
          {
            "kind": "型態",
            "label": "帝國子民",
            "activation": {
              "action": "標準",
              "willpower": 1
            },
            "duration": {
              "unit": "場景"
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amount": 1
              }
            ]
          }
        ],
        "droppedTraits": [
          {
            "trait": "多項全能：購買本血統時，必須在學識、電腦、白刃與槍械技能中選擇兩項，選定後不可更改，若選定的技能至少有1級，則立刻獲得該技能的所有專業",
            "reason": "專業"
          }
        ],
        "conversionNote": "核心價值『屬性自由分配：4點屬性自由分配，每項最多2點』正好等於血統模板 D 級的 attributePerRank=4 與 attributeCapPerRank=2(content/templates.js)。分配由玩家在購買時決定，合法性由 catalog.js 的 evaluatePurchase() 檢查，不是AI決定。 | 『帝國子民』在 2026-08-17 型態容器做出來之後從 droppedTraits 移回效果：標準動作＋1點意志力，持續一個場景，期間所有檢定+1。三個判斷寫在這裡：(1)『等同於本血統等級的內在加值』在D級就是1級，所以是+1，之後升級要跟著改；(2)『內在加值』這個加值類型簡化規則沒有實作，一律直接相加(見 UNSUPPORTED_MECHANICS 的『加值類型』)；(3)『每場景一次』沒有另外做次數限制——一個持續整個場景的型態本來就不可能在同一個場景裡啟動第二次，由 forms.js 的『已在進行中』擋住。",
        "pricingNote": "書中這條D級沒有標價(見 d-tier-samples-bloodline.json 的 price:null)，依血統模板規定的 D+600 上架。這是『用模板價格補上書中留白』，不是覆蓋書上的數字。",
        "higherRanks": [
          {
            "rank": "C",
            "name": "古代阿蘭斯人(科技路線) / 阿蘭斯士兵(士兵路線)"
          },
          {
            "rank": "B",
            "name": "遠古阿蘭斯人(科技路線)"
          },
          {
            "rank": "A",
            "name": "大科學家(科技路線)"
          }
        ],
        "higherRanksNote": "阿蘭斯在D級之後會分成科技路線與士兵路線兩條，選定不可更改。這一輪只轉D級，分歧路線的資料結構(同一個 lineageId 底下有兩條互斥的升級鏈)還沒有設計，見 CONVERSION_RULES.md 的『尚未解決的結構問題』。",
        "sourceRef": "rules-2.35.txt 第21162行(阿蘭斯)：D級阿蘭斯公民。模板定價出處：第9907行(撰寫規則.htm)血統模板 D+600"
      },
      {
        "name": "Orphnoch血統-D級：原生體Orphnoch",
        "goodId": "bloodline.Orphnoch.D",
        "lineageId": "bloodline.Orphnoch",
        "rank": "D",
        "status": "上架",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "price": "D+600",
        "consumable": false,
        "effects": [
          {
            "kind": "型態",
            "label": "進化形態",
            "activation": {
              "action": "移動",
              "willpower": 1
            },
            "duration": {
              "unit": "場景"
            },
            "grants": [
              {
                "kind": "防御",
                "amount": 3
              },
              {
                "kind": "武器",
                "label": "Orphnoch的手足(天生武器)",
                "attackType": "肉搏",
                "weaponDamage": 3,
                "severity": "L",
                "ranged": false
              },
              {
                "kind": "敘事",
                "text": "變身成Orphnoch期間，被你殺死的敵人會化為沙子；你自己若在此時死亡，也會粉碎成沙粒。"
              }
            ]
          }
        ],
        "droppedTraits": [
          {
            "trait": "獲得基於天生防禦的【防彈】",
            "reason": "傷害類型"
          },
          {
            "trait": "非Orphnoch種族見到變身形態的人對你的印象立刻下降一級，最低為敵對",
            "reason": "情境條件"
          },
          {
            "trait": "開啟D級Orphnoch技能樹",
            "reason": "技能樹"
          }
        ],
        "conversionNote": "2026-08-17 型態容器(content/shop/forms.js)做出來之後從掛名轉正。原文的成本與期限逐字照抄：移動動作＋1點意志力，變身中才有3點天生防禦與武器傷害3L的天生武器。兩個判斷：(1)期限『一個場景或10分鐘取低』只取『一個場景』，因為引擎沒有以分鐘計的時鐘(見 UNSUPPORTED_MECHANICS 的『長期計時』)，而在單人網頁節奏下一個場景通常短於10分鐘，取場景是較保守的一邊；(2)天生武器走『肉搏』攻擊方式，不另外改寫攻擊公式(CONVERSION_RULES.md 第5節)。",
        "originalTraits": [
          "進化形態（三特性）：花費一個移動動作消耗1點意志力變身成為Orphnoch，持續一個場景或10分鐘取低；獲得3點天生防禦，手部和腿部為武器傷害3L的天生武器，獲得基於天生防禦的【防彈】；被殺死的敵人化為沙子，自身死亡時也粉碎成沙粒；非Orphnoch種族見到變身形態的人對你的印象立刻下降一級，最低為敵對"
        ],
        "pricingNote": "書中D級標價600，與血統模板一致，價格本身沒有問題。",
        "sourceRef": "rules-2.35.txt 第21283行(Orphnoch血統)：D級原生體Orphnoch，價格D+600"
      },
      {
        "name": "夜兔血統-D級：夜兔族人",
        "goodId": "bloodline.夜兔.D",
        "lineageId": "bloodline.夜兔",
        "rank": "D",
        "status": "掛名",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "price": "D+600",
        "consumable": false,
        "effects": [],
        "pendingReason": "四個特性全部落在沒有實作的軸上：飽食(飢餓狀態＋意志力消費)、厭光(陽光直射時每輪耐力檢定＋屬性傷害)、夜兔血液(狂暴狀態＋敵我不分)、殺戮機器(免疫昏迷、惡性填滿也不死，但受到任意1點傷害立刻死亡)。其中『殺戮機器』改寫的是 core/health.js 的死亡判定本身——那不是一個加值，是替換一條核心規則，不應該用商品效果詞彙表來表達，見 CONVERSION_RULES.md 的『不可以用商品表達的東西』。",
        "originalTraits": [
          "飽食（雙特性）：飢餓時所有檢定承受1DP減值；進食後1小時內每花費1點意志力可使一項生理系屬性獲得1點內在加值",
          "厭光（負特性）：陽光直射時每輪需進行耐力檢定，失敗則生理系屬性降低1點，DC隨輪數遞增",
          "夜兔血液（正負特性）：戰鬥中每輪需意志豁免，失敗進入「狂暴狀態」，全部生理系屬性再獲得1點內在加值但敵我不分優先攻擊",
          "殺戮機器（雙特性）：不會因傷勢失去意識，惡性傷害填滿也不會死亡，但受到任意1點傷害便會立刻死亡"
        ],
        "pricingNote": "書中D級沒有標價，依血統模板的 D+600 登錄。",
        "sourceRef": "rules-2.35.txt 第45308行(夜兔)：D級夜兔族人"
      }
    ]
  },
  {
    "id": "shop-starter.改造",
    "type": "商品",
    "version": "1.0.0",
    "sourceRef": "rules-2.35.txt 第9945行起(撰寫規則.htm 改造模板)、第93660行(假面騎士EVOL)、第98629行(紅馬尾戰士)、第100122行(最蔡之人)",
    "note": "改造貨架。原文來源是 content/packs/d-tier-samples-cybernetic.json。轉換規則見 CONVERSION_RULES.md。",
    "pricingNote": "[已知落差，保留原數字不覆蓋] 三個條目的D級價格書中原文都寫 D+1000，但改造模板(CYBERNETIC_TEMPLATE)規定D級應為500。這是書中舊資源沒跟上模板更新的現象，跟金剛狼血統同性質。auditGoodPricing() 會如實回報這個落差，我們不自行改成500。",
    "findingNote": "改造轉出2件，比血統好，原因是改造的特性裡有『防御強化』『技能提升』這種**常態被動**的寫法——被動加值是簡化規則接得住的形狀，主動變身則不是。這條觀察對之後挑條目很有用：先找有常態被動的條目。",
    "entries": [
      {
        "name": "假面騎士EVOL-D級：危險等級：一",
        "goodId": "cybernetic.假面騎士EVOL.D",
        "lineageId": "cybernetic.假面騎士EVOL",
        "rank": "D",
        "status": "上架",
        "category": "模板能力",
        "resourceType": "改造",
        "exclusiveGroup": "改造",
        "price": "D+1000",
        "consumable": false,
        "effects": [
          {
            "kind": "防御",
            "amount": 1
          },
          {
            "kind": "型態",
            "label": "攻擊強化",
            "activation": {
              "action": "自由",
              "willpower": 1
            },
            "duration": {
              "unit": "輪",
              "rounds": 1
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amount": 2,
                "scope": "攻擊",
                "attributes": [
                  "力量",
                  "敏捷",
                  "耐力"
                ]
              }
            ]
          }
        ],
        "droppedTraits": [
          {
            "trait": "速度強化：基礎移動速度獲得改造支線等級*3米的提升",
            "reason": "移動速度"
          },
          {
            "trait": "加值轉換：本改造帶來的加值為增強加值",
            "reason": "加值類型"
          }
        ],
        "conversionNote": "『防御強化：基礎防禦提升改造支線等級/點』——D級等級值為1，所以是防御+1，而且它是**常態被動**，不需要動作也不花意志力，這正是它一開始就轉得過來的原因。接到 core/combat/defense.js 的 equipmentDefense。 | 『攻擊強化』在 2026-08-17 第二次補機制之後從 droppedTraits 撿回來：自由動作＋1點意志力，持續1輪，生理系屬性的攻擊檢定+2。它需要的是三個機制同時到位——型態容器(期限1輪與意志力成本)、複數匹配鍵(『生理系屬性』＝力量/敏捷/耐力)、以及攻擊路徑查效果表(scope:\"攻擊\")。數值『改造支線等級*2』在D級等級值為1，所以是+2，之後升級要跟著改。『增強加值』這個加值類型簡化規則沒有實作，一律直接相加(見 UNSUPPORTED_MECHANICS 的『加值類型』)，這一條仍然留在 droppedTraits。",
        "higherRanks": [
          {
            "rank": "C",
            "name": "危險等級：三"
          }
        ],
        "higherRanksNote": "C級之後的級數名稱尚未清查，只確認到C級。",
        "sourceRef": "rules-2.35.txt 第93660行(假面騎士EVOL)：D級危險等級：一，價格D+1000"
      },
      {
        "name": "最蔡之人-D級：偶像練習生",
        "goodId": "cybernetic.最蔡之人.D",
        "lineageId": "cybernetic.最蔡之人",
        "rank": "D",
        "status": "上架",
        "category": "模板能力",
        "resourceType": "改造",
        "exclusiveGroup": "改造",
        "price": "D+1000",
        "consumable": false,
        "effects": [
          {
            "kind": "技能",
            "skill": "體魄",
            "amount": 1
          },
          {
            "kind": "武器",
            "label": "召喚籃球",
            "attackType": "投擲_輕",
            "weaponDamage": 2,
            "severity": "L",
            "ranged": true,
            "weaponRange": 10
          }
        ],
        "droppedTraits": [
          {
            "trait": "漫畫般美少年.GIF（雙特性）：以標準動作對能感知你的目標進行風度+表達檢定，目標意志豁免，承受失敗數的噁心點數(或魅惑點數)",
            "reason": "不良狀態"
          },
          {
            "trait": "籃球的『投擲攻擊檢定可用風度代替敏捷』",
            "reason": "core/combat/attackTypes.js 的投擲_輕公式關鍵屬性寫死為敏捷，而且風度不在六維裡"
          },
          {
            "trait": "加值轉換：本級改造提供的屬性加值為增強加值",
            "reason": "加值類型"
          }
        ],
        "conversionNote": "『籃球（雙特性）』拆成兩半：『運動技能提升1級（最高5級）』→ 原始的運動技能對映到十技能的體魄，轉成技能+1；『每輪自由動作打響指召喚一顆籃球（武器傷害2L，鈍擊，輕投擲武器，基礎射程10米）』→ 轉成一件常駐武器。書上召喚籃球需要一個自由動作，簡化規則的動作經濟裡自由動作本來就不限次數，所以視為隨時可用，不算放寬。",
        "higherRanks": [
          {
            "rank": "C",
            "name": "偶像男團愛抖露"
          },
          {
            "rank": "B",
            "name": "IKUN們的精神支柱"
          },
          {
            "rank": "A",
            "name": "最蔡之人"
          }
        ],
        "sourceRef": "rules-2.35.txt 第100122行(最蔡之人)：D級偶像練習生，價格D+1000"
      },
      {
        "name": "紅馬尾戰士-D級",
        "goodId": "cybernetic.紅馬尾戰士.D",
        "lineageId": "cybernetic.紅馬尾戰士",
        "rank": "D",
        "status": "掛名",
        "category": "模板能力",
        "resourceType": "改造",
        "exclusiveGroup": "改造",
        "price": "D+1000",
        "consumable": false,
        "effects": [],
        "pendingReason": "兩個核心特性(空想具現、爆炎聖劍)都掛在『消耗1點屬性力並以移動動作變身』這個前提上，而屬性力是一個專屬能量池——引擎沒有能量池資料結構(character.derived.energyPools 永遠是空物件)。2026-08-17 註記：變身這一半已經不是問題了(型態容器見 content/shop/forms.js，它甚至已經支援移動動作＋資源成本這個形狀)，唯一還缺的是『屬性力』這個池子本身——型態的 activation 目前只吃意志力。另外它的加值大量落在風度/決心這兩個六維裡沒有的屬性上。",
        "originalTraits": [
          "空想具現（四特性）：消耗1點屬性力並以移動動作變身，生成空想裝甲Tail Gear(輕甲，盔甲防禦4/4，特殊屬性【認主】【防彈】)，附帶唯想願景、雙馬尾的女神、Tail Gear等子效果",
          "爆炎聖劍（四特性）：變身時獲得專屬武器爆炎聖劍(重劍，武器傷害3L，特殊屬性【魔法】【威猛】【雙手】【認主】)，白刃攻擊可用風度代替力量，命中額外造成1點火焰嚴重傷害",
          "裝備位占據（負特性）：空想裝甲會占據除護符和戒指以外的全部裝備位",
          "人類限定（負特性）：強化前提為人類或近人血統，且無法與任何非人血統強化共存"
        ],
        "sourceRef": "rules-2.35.txt 第98629行(紅馬尾戰士)：D級，價格D+1000"
      }
    ]
  },
  {
    "id": "shop-starter.瞳術",
    "type": "商品",
    "version": "1.0.0",
    "sourceRef": "rules-2.35.txt 第9988行起(撰寫規則.htm 瞳術模板)、第117995行(寫輪眼)、第119824行(審判眼)、第119881行(毀滅之眼)",
    "note": "瞳術貨架。原文來源是 content/packs/d-tier-samples-dojutsu.json。轉換規則見 CONVERSION_RULES.md。",
    "structureNote": "瞳術模板本身註明『無需從D級開始撰寫』，實際清查過31個瞳術條目：21個從D級開始、5個從C級開始、2個從B級開始、3個是無分級的一次性瞳術。這個貨架只收D級起跳的3個。『從C級起跳』的資源要上架，需要商品資料結構支援 startsAtRank——欄位已經有了(見 catalog.js)，但那些條目的效果還沒轉。",
    "entries": [
      {
        "name": "審判眼-D級",
        "goodId": "dojutsu.審判眼.D",
        "lineageId": "dojutsu.審判眼",
        "rank": "D",
        "status": "上架",
        "category": "模板能力",
        "resourceType": "瞳術",
        "exclusiveGroup": "瞳術",
        "price": "D+600",
        "consumable": false,
        "effects": [
          {
            "kind": "武器",
            "label": "加斯特沖擊波(龍骨炮)",
            "attackType": "炮",
            "weaponDamage": 4,
            "severity": "L",
            "ranged": true,
            "weaponRange": 200
          }
        ],
        "droppedTraits": [
          {
            "trait": "攻擊檢定為敏捷+神秘學(塑能)+武器傷害",
            "reason": "core/combat/attackTypes.js 的『炮』公式是智力+射擊+武器傷害，關鍵屬性與技能都寫死在公式表裡，個別武器不能改寫公式"
          },
          {
            "trait": "傷害上限為武器傷害*3點",
            "reason": "傷害上限機制已於2026-08-15停用(damageCap 保留但不再被呼叫)"
          },
          {
            "trait": "使用該武器檢定時增加3點器械加值",
            "reason": "加值類型"
          },
          {
            "trait": "造成純能量嚴重傷害",
            "reason": "傷害類型系統已簡化為單一Armor減法，沒有能量/物理之分"
          }
        ],
        "conversionNote": "這是整批轉換裡唯一一件遠程武器，也是唯一一件『炮』類武器。轉換的重點在武器基本屬性(4L、射程200米)，攻擊公式一律走 attackTypes.js 的表定公式——**個別條目不可以改寫公式**，這是 CONVERSION_RULES.md 的硬性規則之一，否則七種攻擊方式的表就形同虛設。",
        "higherRanks": [
          {
            "rank": "C",
            "name": "(書中有C級段落，未命名)"
          },
          {
            "rank": "B",
            "name": "(書中有B級段落，未命名)"
          },
          {
            "rank": "A",
            "name": "(書中有A級段落，未命名)"
          }
        ],
        "sourceRef": "rules-2.35.txt 第119824行(審判眼)：D級，價格見第119840行 D+600"
      },
      {
        "name": "寫輪眼-D級",
        "goodId": "dojutsu.寫輪眼.D",
        "lineageId": "dojutsu.寫輪眼",
        "rank": "D",
        "status": "掛名",
        "category": "模板能力",
        "resourceType": "瞳術",
        "exclusiveGroup": "瞳術",
        "price": "D+600",
        "consumable": false,
        "effects": [],
        "pendingReason": "兩個特性都接不上：『忍術：獲得相當於瞳術等級的忍術施法者等級』需要施法者職能系統(整個沒有)；『洞察眼』需要查克拉能量池、開啟/關閉的持續狀態、以及幻覺免疫，三樣都沒有。",
        "originalTraits": [
          "忍術：獲得相當於瞳術等級的忍術施法者等級",
          "洞察眼：花費一個標準動作支付1點查克拉開啟本瞳術，持續一個場景或10分鐘取低；開啟期間在防御、攻擊以及寫輪眼的相關檢定上獲得2DP洞察加值，獲得相當於瞳術等級的魔幻本質偵測能力，並可以免疫相當於瞳術等級的幻覺效果"
        ],
        "pricingNote": "書中D級段落沒有寫價格數字(這在瞳術章節很常見：21個D級起跳的條目裡只有2個明確標價)，依瞳術模板的 D+600 登錄。",
        "sourceRef": "rules-2.35.txt 第117995行(寫輪眼)：D級"
      },
      {
        "name": "毀滅之眼-D級",
        "goodId": "dojutsu.毀滅之眼.D",
        "lineageId": "dojutsu.毀滅之眼",
        "rank": "D",
        "status": "掛名",
        "category": "模板能力",
        "resourceType": "瞳術",
        "exclusiveGroup": "瞳術",
        "price": "D+600",
        "consumable": false,
        "effects": [],
        "pendingReason": "『破法雙瞳』需要意志力消費(每輪1點維持)、目標的魔力池(扣6點魔力)、劇痛點數與強韌豁免——四樣機制引擎都沒有。『信仰導向（負特性）』需要信仰系統。",
        "originalTraits": [
          "破法雙瞳：消耗1點意志力，以一個移動動作睜開毀滅之眼並每輪以1點意志力和迅捷動作維持，可使雙眼能看到的一個目標每輪損失6點魔力，並對其造成流失魔力等額的純能量嚴重傷害以及等額的不可疊加的劇痛點數",
          "信仰導向（負特性）：必須信仰天界十二主神中的毀滅之主迪斯馬森或救贖之主以撒，將失去原本的所有信仰和基於信仰導向的能力；每天需祈禱，否則失去本瞳術帶來的一切好處"
        ],
        "sourceRef": "rules-2.35.txt 第119881行(毀滅之眼)：D級，價格見第119897行 D+600"
      }
    ]
  },
  {
    "id": "shop-starter.稱號",
    "type": "商品",
    "version": "1.0.0",
    "sourceRef": "rules-2.35.txt 第10096行起(撰寫規則.htm 稱號模板)、第120993行(港漫強者)、第121985行(劍舞者)、第123051行(京都神鳴流)",
    "note": "稱號貨架。原文來源是 content/packs/d-tier-samples-title.json。三個條目的D級價格都是 D+1000，跟稱號模板完全一致，這個類別沒有定價落差。",
    "findingNote": "稱號是模板類裡轉換率最好的(3件轉出2件)。原因是稱號的效果偏向『永久的身體/技能提升』——天生防禦、技能等級、意志值——這些簡化規則全部保留了。這跟血統偏『變身形態』形成明顯對比。",
    "entries": [
      {
        "name": "港漫強者-D級：初武·萬里長城平地起",
        "goodId": "title.港漫強者.D",
        "lineageId": "title.港漫強者",
        "rank": "D",
        "status": "上架",
        "category": "體系",
        "resourceType": "稱號",
        "price": "D+1000",
        "consumable": false,
        "effects": [
          {
            "kind": "技能",
            "skill": "交涉",
            "amount": 1
          },
          {
            "kind": "意志上限",
            "amount": 1
          },
          {
            "kind": "防御",
            "amount": 1
          },
          {
            "kind": "武器",
            "label": "港漫強者的拳腳(天生武器)",
            "attackType": "肉搏",
            "weaponDamage": 1,
            "severity": "L",
            "ranged": false
          }
        ],
        "droppedTraits": [
          {
            "trait": "強者威嚴：可自由控制威嚇幅度、威嚇失敗不再帶來負面效果",
            "reason": "情境條件"
          },
          {
            "trait": "武者之心的失效條款：若在挑戰/對決中逃離、投降或逃避困境，會喪失此特性及後續「XX之心」系列的一切好處",
            "reason": "情境條件"
          }
        ],
        "conversionNote": "三個特性各轉出一半：『強者威嚴』的『脅迫等級提升一級』→ 原始脅迫技能對映到十技能的交涉，轉成技能+1；『武者之心』的『意志值增加，數值等同稱號等級(D=1)』→ 意志上限+1，這是整批轉換裡唯一一個動到意志值的效果；『超凡入圣』的『天生防禦與天生武器傷害獲得稱號等級的永久提升，天生武器可以造成嚴重傷害』→ 防御+1 加上一件傷害1L的肉搏天生武器。三個都是永久被動，所以三個都轉得過來。",
        "higherRanks": [
          {
            "rank": "C",
            "name": "低武·武林中人"
          },
          {
            "rank": "B",
            "name": "(書中有B級段落，未命名)"
          },
          {
            "rank": "A",
            "name": "(書中有A級段落，未命名)"
          }
        ],
        "sourceRef": "rules-2.35.txt 第120993行(港漫強者)：D級初武·萬里長城平地起，價格D+1000"
      },
      {
        "name": "京都神鳴流-D級：神鳴流·入門",
        "goodId": "title.京都神鳴流.D",
        "lineageId": "title.京都神鳴流",
        "rank": "D",
        "status": "上架",
        "category": "體系",
        "resourceType": "稱號",
        "price": "D+1000",
        "consumable": false,
        "effects": [
          {
            "kind": "技能",
            "skill": "格鬥",
            "amount": 1
          }
        ],
        "droppedTraits": [
          {
            "trait": "在白刃技能上獲得專業——彎刀(對應肋差、小太刀、太刀、野太刀)，專業加值改為3DP",
            "reason": "專業"
          },
          {
            "trait": "使用彎刀專業對應武器時，可選擇以敏捷屬性代替力量屬性進行白刃攻擊檢定",
            "reason": "core/combat/attackTypes.js 的白刃公式關鍵屬性寫死為力量，個別條目不可改寫公式"
          }
        ],
        "conversionNote": "『劍術入門』的『白刃技能等級提升1級(上限5級)』→ 白刃對映到十技能的格鬥。書上的5級上限在這裡沒有實作成硬性檢查(簡化規則的技能上限是建卡期的3，遊戲中沒有上限檢查)，這一點記在 CONVERSION_RULES.md 的『尚未解決的結構問題』。",
        "bookGapNote": "書中D級段落寫『特性：劍道精修(四特性)』暗示有4個子特性，但底下只實際寫出『劍術入門』1個。這是書本原文的缺漏，不替書補完。",
        "higherRanks": [
          {
            "rank": "C",
            "name": "神鳴流·劍士"
          },
          {
            "rank": "B",
            "name": "神鳴流·師范"
          }
        ],
        "sourceRef": "rules-2.35.txt 第123051行(京都神鳴流)：D級神鳴流·入門，價格D+1000"
      },
      {
        "name": "劍舞者-D級：劍之歌",
        "goodId": "title.劍舞者.D",
        "lineageId": "title.劍舞者",
        "rank": "D",
        "status": "掛名",
        "category": "體系",
        "resourceType": "稱號",
        "price": "D+1000",
        "consumable": false,
        "effects": [],
        "pendingReason": "四個特性全部落在沒有實作的軸上：舞劍(連續十天每天冥想八小時的同調儀式＋風度)、風之舞(閃避防禦＋反射動作＋每天次數限制)、劍舞(以移動距離為條件的速度加值)、優雅(格擋防禦的逐米累加)。其中三個牽涉到已經合併掉的四層防御與已經拿掉的移動距離。",
        "originalTraits": [
          "舞劍（雙特性）：選定一把劍同調建立特殊聯繫(需連續十天每天冥想八小時)，該劍成為「舞劍」並自動成為精緻品武器",
          "風之舞：不穿甲、不用盾、手持舞劍時可以反射動作發動，防禦獲得至多等同自身風度值的X點閃避防禦，同時下輪所有攻擊和施法檢定承受X點無名減值",
          "劍舞：若本輪移動距離至少相當於自身體積/米，可在攻擊和防禦中選一項獲得2DP速度加值",
          "優雅：以移動動作格擋的同時，以迅捷動作移動不超過自身體積的距離，每移動1米使格擋防禦增加1點"
        ],
        "sourceRef": "rules-2.35.txt 第121985行(劍舞者)：D級劍之歌，價格D+1000"
      }
    ]
  },
  {
    "id": "shop-starter.流派",
    "type": "商品",
    "version": "1.0.0",
    "sourceRef": "rules-2.35.txt 第10144行起(撰寫規則.htm 流派模板)、第184476行(降龍十八掌)、第186278行(青蓮劍歌總決)、第187072行(華山氣宗)",
    "note": "流派貨架。原文來源是 content/packs/d-tier-samples-school.json。流派與稱號共用同一份模板(TITLE_TEMPLATE)，D級都是1000，三個條目都對得上。",
    "structureNote": "流派跟血統/改造/瞳術不同，它不是一條D→S的升級鏈，而是『一個D級總綱 + 底下一整棵各自標價的技能樹』。技能樹在簡化規則裡沒有對應物(見 effects.js 的 UNSUPPORTED_MECHANICS)，所以這裡只轉總綱那一層，樹上的招式一個都沒收——那不是遺漏，是那棵樹整體還沒有落腳處。",
    "entries": [
      {
        "name": "華山氣宗-D級",
        "goodId": "school.華山氣宗.D",
        "lineageId": "school.華山氣宗",
        "rank": "D",
        "status": "上架",
        "category": "體系",
        "resourceType": "流派",
        "price": "D+1000",
        "consumable": false,
        "effects": [
          {
            "kind": "技能",
            "skill": "格鬥",
            "amount": 1
          }
        ],
        "droppedTraits": [
          {
            "trait": "清鋒：免疫D級以下的措手不及效果",
            "reason": "不良狀態"
          },
          {
            "trait": "狂歌：免疫D級以下影響心靈的效果",
            "reason": "不良狀態"
          },
          {
            "trait": "絕學的後半：獲得專業「長劍」，同時白刃技能上的「長劍」專業提供的專業加值改為3點",
            "reason": "專業"
          },
          {
            "trait": "技能樹：開啟華山氣宗技能樹",
            "reason": "技能樹"
          }
        ],
        "conversionNote": "只有『絕學』的前半『白刃技能等級提升1級(最高提升至4級)』轉得出來 → 白刃對映到格鬥。兩個『免疫措手不及/心靈效果』的特性看起來很強，但措手不及與心靈效果在這個引擎裡都不存在，免疫一件不會發生的事等於什麼都沒買——所以它們進 droppedTraits，不是偷偷當成別的加值。",
        "sourceRef": "rules-2.35.txt 第187072行(華山氣宗)：D級，價格D+1000"
      },
      {
        "name": "降龍十八掌-D級",
        "goodId": "school.降龍十八掌.D",
        "lineageId": "school.降龍十八掌",
        "rank": "D",
        "status": "掛名",
        "category": "體系",
        "resourceType": "流派",
        "price": "D+1000",
        "consumable": false,
        "effects": [],
        "pendingReason": "『剛柔並濟（五特性）』整條掛在傳奇力量/傳奇敏捷的交叉換算上，並且產出的是【破甲】與【高速優勢】——破甲與高速兩個機制在簡化規則裡都被拿掉了(護甲已簡化為單一Armor減法)。『英魂（負特性）』是行為準則觸發的懲罰，屬於情境條件。",
        "originalTraits": [
          "剛柔並濟（五特性）：以力量作為關鍵屬性進行近戰肉搏攻擊時獲得等同傳奇敏捷的附加成功；以敏捷作為關鍵屬性時獲得等同傳奇力量的附加成功；每有1點傳奇力量，近戰肉搏攻擊增加1點【破甲】；每有1點傳奇敏捷，增加2點【高速優勢】",
          "英魂（負特性）：行事必須堂堂正正、以天下為己任，無法對他人進行突襲，且不可蓄意傷及無辜；違背準則會失去所有被動效果並在相關檢定中失去4個成功數，持續一部影片"
        ],
        "conversionCandidateNote": "這條其實離上架不遠：『以力量攻擊時獲得等同傳奇敏捷的附加成功』用 core/dice.js 的 legendaryAttributeBonus() 就算得出來，缺的只是一個『交叉屬性附加成功』的效果種類。之所以不加，是因為只為一個條目擴充詞彙表不划算——等第二、第三個同型條目出現再一起加，見 CONVERSION_RULES.md 的『什麼時候可以擴充詞彙表』。",
        "sourceRef": "rules-2.35.txt 第184476行(降龍十八掌)：D級，價格D+1000"
      },
      {
        "name": "青蓮劍歌總決-D級",
        "goodId": "school.青蓮劍歌總決.D",
        "lineageId": "school.青蓮劍歌總決",
        "rank": "D",
        "status": "掛名",
        "category": "體系",
        "resourceType": "流派",
        "price": "D+1000",
        "consumable": false,
        "effects": [],
        "pendingReason": "三個特性全部掛在『劍氣池』這個專屬能量池上(青蓮殘雪要劍氣不空、劍氣化碧要支付1點劍氣、劍氣凝霜要再支付1點劍氣)。引擎沒有能量池資料結構，能量池一做出來這條就能整條上架——它是能量池機制最好的驗收樣本之一。",
        "originalTraits": [
          "青蓮殘雪：只要劍氣池不空，可花費一個自由動作使接觸的物體、持用的武器或以自身為中心半徑5米範圍內溫度降低至0度，每輪需以移動動作維持",
          "劍氣化碧（雙特性）：花費一個自由動作並支付1點劍氣，凝聚出武器傷害6L、招式適應性C級、支線等級D級並且觸及範圍等同於風度值的青蓮劍氣長劍，持續時間為感知值*1輪",
          "劍氣凝霜：持用「劍氣化碧」凝聚出的劍氣進行近戰白刃攻擊時，可支付1點劍氣，額外造成等同於白刃技能上附加成功/點寒冰嚴重傷害"
        ],
        "sourceRef": "rules-2.35.txt 第186278行(青蓮劍歌總決)：D級，價格D+1000"
      }
    ]
  },
  {
    "id": "shop-starter.技藝",
    "type": "商品",
    "version": "1.0.0",
    "sourceRef": "rules-2.35.txt 第10247行起(撰寫規則.htm 技藝類)、第206973行(太玄鑲華劍譜)、第207188行(葵花寶典第一重)、第229249行(饕餮盛宴)",
    "note": "技藝貨架。原文來源是 content/packs/d-tier-samples-technique.json。轉換規則見 CONVERSION_RULES.md。",
    "pricingNote": "[已知落差，保留原數字不覆蓋] 太玄鑲華劍譜書中寫 D+600，技藝模板(TECHNIQUE_TEMPLATE)規定D級應為500；同類的葵花寶典第一重與饕餮盛宴都確實是500，符合模板。",
    "findingNote": "技藝的轉換率不錯(3件轉出2件)，因為技藝的效果常常是『某技能等級提升』與『某類檢定的加減值』——那正好是簡化規則的原生語言。值得注意的是葵花寶典是整批36件商品裡**唯一一件帶有負面數值效果**的商品(力量檢定-1DP)，它證明了效果詞彙表吃得下負值，代價型商品是做得出來的。",
    "entries": [
      {
        "name": "葵花寶典第一重-D級",
        "goodId": "technique.葵花寶典.1",
        "lineageId": "technique.葵花寶典",
        "rank": "D",
        "status": "上架",
        "category": "體系",
        "resourceType": "技藝",
        "price": "D+500",
        "consumable": false,
        "effects": [
          {
            "kind": "檢定加骰",
            "attribute": "敏捷",
            "amount": 1
          },
          {
            "kind": "檢定加骰",
            "attribute": "力量",
            "amount": -1
          },
          {
            "kind": "敘事",
            "text": "返老還童：練成此功後重返壯年時期，停止肉體成長，容顏不再衰老，青春永駐，但不代表免疫使其衰老的效果，依然會壽盡而亡。"
          }
        ],
        "droppedTraits": [
          {
            "trait": "葵花真氣：獲得D級內力，但功法鎖定為「內丹術」，若已擁有內力則使內力上限提高5點",
            "reason": "能量池"
          },
          {
            "trait": "鬼魅身：迅捷動作開啟、支付1點內力，基礎移動速度增加10米並在防御上獲得3點閃避加值，每輪需支付1點內力維持，占用身法位",
            "reason": "能量池"
          },
          {
            "trait": "真陰意對耐力的部分：耐力相關檢定同時獲得1DP修行加值與承受1DP內在減值",
            "reason": "書上這兩項在耐力上剛好互相抵銷(+1與-1)。簡化規則沒有加值類型的疊加規則(見加值類型)，所以淨值是0——與其寫兩個互相抵銷的效果讓人以為漏算，不如明確記在這裡"
          }
        ],
        "conversionNote": "『真陰意：在敏捷和耐力相關檢定上獲得1DP修行加值，同時在力量和耐力相關檢定上再承受1DP內在減值』——敏捷淨+1、力量淨-1、耐力淨0。這是唯一一件買了會讓某項檢定變差的商品，也是效果詞彙表允許負值的實證。",
        "prerequisiteNote": "書中另有『先訣(價格500，前提需求性別為男性)』這個前置強化，沒買先訣則葵花寶典最高只能到第二重。簡化規則沒有性別欄位，這條前提沒有實作，如實記在這裡。",
        "higherRanks": [
          {
            "rank": "C",
            "name": "葵花寶典第二重(C+1000)"
          },
          {
            "rank": "B",
            "name": "葵花寶典第三重(B+4000)"
          },
          {
            "rank": "A",
            "name": "葵花寶典第四重"
          }
        ],
        "sourceRef": "rules-2.35.txt 第207188行(葵花寶典第一重)：價格見第207190行 D+500"
      },
      {
        "name": "饕餮盛宴-D級",
        "goodId": "technique.饕餮盛宴.D",
        "lineageId": "technique.饕餮盛宴",
        "rank": "D",
        "status": "上架",
        "category": "體系",
        "resourceType": "技藝",
        "price": "D+500",
        "consumable": false,
        "effects": [
          {
            "kind": "技能",
            "skill": "技藝",
            "amount": 1
          },
          {
            "kind": "敘事",
            "text": "嘗百草：由於熟知各種食材，當以一個標準動作觀察包含毒素的食物(食材)時，可以立即無需通過任何檢定而發現。"
          }
        ],
        "droppedTraits": [
          {
            "trait": "獲得手藝-烹飪專業",
            "reason": "專業"
          }
        ],
        "conversionNote": "『烹飪大師：獲得手藝-烹飪專業，並且在該子項分類中的技能等級提升1級』——書上提升的只有『手藝』底下的烹飪子項，簡化規則沒有子項，所以整個技藝技能都吃到+1。這是一次**明顯的放寬**，跟專長包的『程序猿』是同一種情況：子項→整個技能。",
        "sourceRef": "rules-2.35.txt 第229249行(饕餮盛宴)：價格見第229253行 D+500"
      },
      {
        "name": "太玄鑲華劍譜-D級",
        "goodId": "technique.太玄鑲華劍譜.D",
        "lineageId": "technique.太玄鑲華劍譜",
        "rank": "D",
        "status": "掛名",
        "category": "體系",
        "resourceType": "技藝",
        "price": "D+600",
        "consumable": false,
        "effects": [],
        "pendingReason": "書中D級段落只寫了一個特性名稱『武器嫻熟（劍）』，沒有展開任何數值——不是我們轉不出來，是原文就沒有數字可以轉。硬給它一個加值等於自己發明規則。等使用者決定要不要替這種『只有名字沒有數值』的舊條目補數值，再回頭處理。",
        "originalTraits": [
          "武器嫻熟（劍）"
        ],
        "pricingNote": "書中寫 D+600，技藝模板規定 D 級應為 500，落差保留不覆蓋。",
        "sourceRef": "rules-2.35.txt 第206973行(太玄鑲華劍譜)：價格見第206977行 D+600"
      }
    ]
  },
  {
    "id": "shop-starter.法術",
    "type": "商品",
    "version": "1.0.0",
    "sourceRef": "rules-2.35.txt 第10260行起(撰寫規則.htm 法術)、第357927行(阿尼馬格斯)、第358099行(變身術)、第358483行(暗示術)",
    "note": "法術貨架。原文來源是 content/packs/d-tier-samples-spell.json。轉換規則見 CONVERSION_RULES.md。",
    "structureNote": "法術跟其他資源的分級意義不同：血統/改造/瞳術的 D→S 是**同一個資源逐級變強**，法術則是**每個法術各自標一個等級價格**，沒有升級鏈。所以法術商品不需要 higherRanks，也不受依序購買規則約束——這一點在 CONVERSION_RULES.md 有專門一段說明。",
    "findingNote": "法術是這一輪轉換率最差的類別之一(3件只轉出1件)，而且卡點跟其他類別不同：法術幾乎都預設角色有『施法者職能』與『魔力』，並且大量法術的效果是『用施法檢定取代某個技能檢定』——那是改寫判定流程，不是加值。簡化規則沒有施法者系統，這個缺口比暫時性增益還大。",
    "entries": [
      {
        "name": "變身術-D級",
        "goodId": "spell.變身術.D",
        "lineageId": "spell.變身術",
        "rank": "D",
        "startsAtRank": true,
        "status": "上架",
        "category": "體系",
        "resourceType": "法術",
        "price": "D+500",
        "consumable": false,
        "effects": [
          {
            "kind": "檢定加骰",
            "skill": "交涉",
            "amount": 2
          },
          {
            "kind": "敘事",
            "text": "可變成與你相同類別的生物(例如人形生物或魔法獸)，新形體體積與原體型差別不能大於3點；變形後可保有原有屬性值、血統、改造、稱號、技藝、能量池等全部能力，除非新形體不具有所需的身體器官。"
          }
        ],
        "droppedTraits": [
          {
            "trait": "變成其他生物後的體積限制與器官限制的實際判定",
            "reason": "體積"
          }
        ],
        "conversionNote": "『若使用這個法術來易容，則「易容」技能檢定可獲得威力值的加值』——威力值D級為2(法術模板 powerValuePerRank.D=2)，易容在原始22技能裡屬於偽裝類，對映到十技能的交涉(涵蓋欺騙偽裝)。這是本批唯一一個**加值數字直接來自模板欄位**的轉換：威力值不是條目自己寫的數字，是 SPELL_TEMPLATE 規定的。變形本身沒有數值後果，轉成敘事效果。",
        "sourceRef": "rules-2.35.txt 第358099行(變身術)：D級，價格500，威力值2"
      },
      {
        "name": "暗示術-D級",
        "goodId": "spell.暗示術.D",
        "lineageId": "spell.暗示術",
        "rank": "D",
        "startsAtRank": true,
        "status": "掛名",
        "category": "體系",
        "resourceType": "法術",
        "price": "D+500",
        "consumable": false,
        "effects": [],
        "pendingReason": "整個法術的核心是『用施法判定代替操控+說服或操控+掩飾』——它不是加值，是**替換一次判定的屬性與技能**，而且需要目標以意志判定(DC=法術威力)抵抗，也就是需要對抗判定框架。引擎沒有施法者職能、沒有對抗判定的資料流程，效果詞彙表也刻意不提供『替換檢定』這種能力(見 CONVERSION_RULES.md 的『不可以用商品表達的東西』)。",
        "originalTraits": [
          "用施法判定代替操控+說服或操控+掩飾，進行說服目標或改變目標看法的判定，若是延長判定，最多可進行的周期數=威力值",
          "可用這種方法給目標植入一個看法、讓目標擁有一個目的、或相信一個謊言，目標可進行意志判定(DC=法術威力)抵抗",
          "也可以用一個標準動作使用此法術，給目標下一個簡單的命令，若勝出目標會情不自禁地照做，但不會受影響超過一個回合"
        ],
        "sourceRef": "rules-2.35.txt 第358483行(暗示術)：D級，價格500，威力值2"
      },
      {
        "name": "阿尼馬格斯（Animagus）-D級",
        "goodId": "spell.阿尼馬格斯.D",
        "lineageId": "spell.阿尼馬格斯",
        "rank": "D",
        "startsAtRank": true,
        "status": "掛名",
        "category": "體系",
        "resourceType": "法術",
        "price": "D+1000",
        "consumable": false,
        "effects": [],
        "pendingReason": "效果是『變成動物後，AC、HP等均會變成與該動物相同』——這需要一套動物/生物的數值資料庫，以及『暫時替換角色的整組衍生數值』的機制。兩樣都沒有。而且原文用的是AC(D&D的護甲等級)這種不屬於本規則書體系的詞，本身就是一條沒整理乾淨的舊條目。",
        "originalTraits": [
          "能讓你變成一些小動物，如果要變成大動物將會很大地提高DC，只能變成非常熟悉的動物",
          "變成動物後，AC、HP等均會變成與該動物相同，但受傷超過一半HP以後就會變回來"
        ],
        "pricingNote": "[已知落差，保留原數字不覆蓋] 書中寫 D+1000，法術模板(SPELL_TEMPLATE)規定D級應為500。同類的變身術與暗示術都是500，符合模板。",
        "sourceRef": "rules-2.35.txt 第357927行(阿尼馬格斯（Animagus）)：D級"
      }
    ]
  }
];
