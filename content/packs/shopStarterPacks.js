// [自動同步] 商店起始貨架的**執行期副本**。
//
// 這個檔案的內容逐字對應 content/packs/shop-starter-*.json 那幾個檔案。
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
    "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)；附件 tier-d-equipment-weapons",
    "note": "17 件特殊武器以純分數定價。可執行的能力已轉成現有效果；無法安全對應 Combat V2 的能力均列入 droppedTraits 並附轉換說明。",
    "skillMappingNote": "原始技能白刃→格鬥、掩飾→交涉、神秘→秘識；前置與固定效果均採本專案十技能鍵。",
    "entries": [
      {
        "name": "特別定制的太陽傘",
        "goodId": "item.weapon.magical.sun_umbrella",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 700,
        "consumable": false,
        "prerequisites": {},
        "effects": [
          {
            "kind": "武器",
            "label": "特別定制的太陽傘",
            "attackType": "白刃",
            "weaponDamage": 3,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "防御",
            "amount": 2
          },
          {
            "kind": "敘事",
            "text": "撐開後視為防禦姿態；原本的陽光免疫與不能攻擊限制已轉為敘事提示。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "原「撐開防禦態／格擋」轉為固定防御 +2；型態切換本身以敘事提示呈現。",
        "narrative": "斯卡雷特家族特別定制的洋傘。閉合時可作白刃打擊，撐開時轉化為具備格擋與陽光防護的掩體。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "圓月扇刃",
        "goodId": "item.weapon.magical.moon_fan_blade",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 700,
        "consumable": false,
        "prerequisites": {},
        "effects": [
          {
            "kind": "武器",
            "label": "圓月扇刃",
            "attackType": "白刃",
            "weaponDamage": 3,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "防御",
            "amount": 1
          },
          {
            "kind": "附加成功",
            "amount": 1,
            "scope": "攻擊",
            "skill": "格鬥"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "原「格擋」已轉為持有期間固定防御 +1。 重骰保底轉為持有本武器進行白刃攻擊時附加成功 +1；目前系統沒有玩家宣告重骰接口。",
        "narrative": "如圓月般冰冷優雅的扇刃。閉合時體積2易於攜帶，展開時體積4並啟動完整殺傷與重擲保底機制。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "處女座",
        "goodId": "item.weapon.magical.virgo_rapier",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 700,
        "consumable": false,
        "prerequisites": {},
        "effects": [
          {
            "kind": "武器",
            "label": "處女座",
            "attackType": "白刃",
            "weaponDamage": 6,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "檢定加骰",
            "skill": "交涉",
            "amount": 2,
            "scope": "全部"
          },
          {
            "kind": "敘事",
            "text": "原條件「持用者為女性」已轉為無條件固定加值。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "原「破甲2」轉為固定武器傷害 +2；目前系統沒有獨立破甲層。 原條件「持用者為女性」無對應欄位，已轉為無條件固定加值。",
        "narrative": "華貴優雅的女士細劍。具備高破甲穿刺性能，女性持用時在社交檢定中獲得顯著表現加值。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "手杖劍",
        "goodId": "item.weapon.magical.cane_sword",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 700,
        "consumable": false,
        "prerequisites": {
          "skills": {
            "格鬥": 3,
            "交涉": 2
          }
        },
        "originalPrerequisite": "白刃3、掩飾2",
        "effects": [
          {
            "kind": "武器",
            "label": "手杖劍",
            "attackType": "白刃",
            "weaponDamage": 5,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "檢定加骰",
            "skill": "交涉",
            "amount": 1,
            "scope": "檢定"
          },
          {
            "kind": "敘事",
            "text": "常規安檢免疫保留為敘事提示。"
          },
          {
            "kind": "敘事",
            "text": "原副型態武器「偽裝外鞘」保留為敘事描述，未另建立第二把可選武器。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "原「破甲1」轉為固定武器傷害 +1；目前系統沒有獨立破甲層。 社交檢定加骰已轉為交涉檢定 +1；安檢免疫保留為敘事資訊。 副型態武器改為敘事描述，避免同一商品在裝備表生成無法切換的第二把武器。",
        "narrative": "紳士手杖內藏鋒芒。未拔劍時外鞘可作鈍擊武器並通過常規安檢，戰鬥中可迅捷出鞘奇襲。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "龍膽",
        "goodId": "item.weapon.magical.dragon_bravery_spear",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 750,
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "力量": 2
          }
        },
        "originalPrerequisite": "力量2",
        "effects": [
          {
            "kind": "武器",
            "label": "龍膽",
            "attackType": "白刃",
            "weaponDamage": 5,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "檢定加骰",
            "attribute": "意志",
            "amount": 1,
            "scope": "全部"
          },
          {
            "kind": "檢定加骰",
            "attribute": "意志",
            "amount": 1,
            "scope": "檢定"
          },
          {
            "kind": "敘事",
            "text": "原恐慌抗性已轉為意志檢定 +1。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "恐慌抗性已轉為意志檢定 +1；目前沒有獨立恐慌狀態與抗性軸。",
        "narrative": "沉香木所鑄長矛，柔韌輕盈。持用時幽香陣陣，令人心神堅定、意志高昂。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "惡德戰斧",
        "goodId": "item.weapon.magical.vicious_battleaxe",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 700,
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "力量": 5
          }
        },
        "originalPrerequisite": "力量5",
        "effects": [
          {
            "kind": "武器",
            "label": "惡德戰斧",
            "attackType": "白刃",
            "weaponDamage": 5,
            "severity": "L",
            "ranged": false,
            "weaponRange": 10
          },
          {
            "kind": "檢定加骰",
            "skill": "格鬥",
            "amount": 1,
            "scope": "攻擊"
          },
          {
            "kind": "敘事",
            "text": "原戰術效果「鐘擺蓄力」轉為白刃攻擊固定 +1DP；原始條件保留於商品描述。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "戰術攻擊增幅轉為白刃攻擊固定 +1DP；原動作經濟條件保留為敘事提示。",
        "narrative": "中空圓環構造的重型鐘擺斧。可藉由旋轉慣性蓄力投擲，造成毀滅性的遠距劈砍殺傷。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "戰闊劍",
        "goodId": "item.weapon.magical.warglaive",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 800,
        "consumable": false,
        "prerequisites": {},
        "effects": [
          {
            "kind": "武器",
            "label": "戰闊劍",
            "attackType": "白刃",
            "weaponDamage": 5,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "防御",
            "amount": 2
          },
          {
            "kind": "敘事",
            "text": "原防禦條件：格擋或全防禦；目前已改為固定防御 +2。"
          },
          {
            "kind": "敘事",
            "text": "原反噬條件「攻擊檢定0成功」保留為敘事提示；目前系統沒有攻擊失敗後自傷的結算鉤子。"
          },
          {
            "kind": "檢定加骰",
            "skill": "格鬥",
            "amount": 1,
            "scope": "攻擊"
          },
          {
            "kind": "敘事",
            "text": "原戰術效果「全力攻擊防禦補正」轉為白刃攻擊固定 +1DP；原始條件保留於商品描述。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "原條件式防禦加值已轉為無條件固定防御 +2。 反噬懲罰改為公開敘事提示，不新增會被誤讀的固定傷害。 戰術攻擊增幅轉為白刃攻擊固定 +1DP；原動作經濟條件保留為敘事提示。",
        "narrative": "惡魔獵手鍾愛的月牙形弧刃。雙持攻守兼備且全力攻擊代價更低，但失手時容易反噬傷及自身。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "風切之刃",
        "goodId": "item.weapon.magical.wind_sever_blade",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 650,
        "consumable": false,
        "prerequisites": {
          "skills": {
            "格鬥": 3
          }
        },
        "originalPrerequisite": "白刃3",
        "effects": [
          {
            "kind": "武器",
            "label": "風切之刃",
            "attackType": "白刃",
            "weaponDamage": 3,
            "severity": "L",
            "ranged": false,
            "weaponRange": 10
          },
          {
            "kind": "先攻",
            "amount": 3
          },
          {
            "kind": "檢定加骰",
            "skill": "格鬥",
            "amount": 1,
            "scope": "攻擊"
          },
          {
            "kind": "敘事",
            "text": "原戰術效果「疾風脫離」轉為白刃攻擊固定 +1DP；原始條件保留於商品描述。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "戰術攻擊增幅轉為白刃攻擊固定 +1DP；原動作經濟條件保留為敘事提示。",
        "narrative": "極其輕靈的近戰短刃。賦予持用者極高的出手速度與近戰拉扯能力，亦可精準投擲。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "落陽",
        "goodId": "item.weapon.magical.setting_sun_rapier",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 650,
        "consumable": false,
        "prerequisites": {
          "skills": {
            "格鬥": 3
          }
        },
        "originalPrerequisite": "白刃3",
        "effects": [
          {
            "kind": "武器",
            "label": "落陽",
            "attackType": "白刃",
            "weaponDamage": 4,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "檢定加骰",
            "skill": "格鬥",
            "amount": 1,
            "scope": "攻擊"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "原「破甲1」轉為固定武器傷害 +1；目前系統沒有獨立破甲層。 力量／敏捷複合加值轉為該武器白刃攻擊固定 +1DP。",
        "narrative": "剛柔並濟的刺劍。能將力量與敏捷兩種截然不同的戰鬥風格互相轉化並疊加於打擊之中。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "勇士巨劍",
        "goodId": "item.weapon.magical.warrior_greatsword",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 900,
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "力量": 4
          },
          "skills": {
            "格鬥": 3
          }
        },
        "originalPrerequisite": "力量4、白刃3",
        "effects": [
          {
            "kind": "武器",
            "label": "勇士巨劍",
            "attackType": "白刃",
            "weaponDamage": 6,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "防御",
            "amount": 1
          },
          {
            "kind": "敘事",
            "text": "原防禦條件：持用者力量>=4進行格擋；目前已改為固定防御 +1。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "原條件式防禦加值已轉為無條件固定防御 +1。",
        "narrative": "純粹重型劍刃的代表作。厚重的劍脊既可釋放致命的劈斬，亦能在巨力加持下化作堅固壁壘。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "念珠",
        "goodId": "item.weapon.magical.prayer_beads",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 350,
        "consumable": false,
        "prerequisites": {},
        "effects": [
          {
            "kind": "武器",
            "label": "念珠",
            "attackType": "白刃",
            "weaponDamage": 3,
            "severity": "B",
            "ranged": false
          },
          {
            "kind": "檢定加骰",
            "attribute": "意志",
            "amount": 1,
            "scope": "全部"
          },
          {
            "kind": "敘事",
            "text": "原特殊目標條件「靈體/虛體」已泛化為本武器固定傷害 +1。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "特攻／陣營特攻轉為本武器固定傷害 +1，原目標條件保留為敘事提示。",
        "narrative": "佛門修行念珠。持用增強心神定力，對常人僅為鈍擊，但接觸靈體鬼怪時會迸發破煞金光。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "薙刀",
        "goodId": "item.weapon.magical.naginata",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 700,
        "consumable": false,
        "prerequisites": {},
        "effects": [
          {
            "kind": "武器",
            "label": "薙刀",
            "attackType": "白刃",
            "weaponDamage": 4,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "防御",
            "amount": 2
          },
          {
            "kind": "敘事",
            "text": "原防禦條件：對抗未持白刃/長兵武器之近戰攻擊者；目前已改為固定防御 +2。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "原條件式防禦加值已轉為無條件固定防御 +2。",
        "narrative": "長柄弧刃刀。善於利用距離優勢壓制短兵、空手與野獸撲擊，形成嚴密的近戰防線。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "阿爾法法杖",
        "goodId": "item.weapon.magical.alpha_staff",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 450,
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "力量": 1
          },
          "skills": {
            "秘識": 3
          }
        },
        "originalPrerequisite": "力量1、神秘3",
        "effects": [
          {
            "kind": "武器",
            "label": "阿爾法法杖",
            "attackType": "白刃",
            "weaponDamage": 2,
            "severity": "B",
            "ranged": false
          },
          {
            "kind": "法術增幅",
            "amount": 2
          }
        ],
        "droppedTraits": [],
        "conversionNote": "法術共鳴已接入：使用法術時威力值固定 +2。",
        "narrative": "銘刻基礎奧術迴路的法杖。近戰時僅作防身短棍，但能顯著穩定並增幅各類法術的輸出威力。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "十字軍",
        "goodId": "item.weapon.magical.crusader_pistol",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 750,
        "consumable": false,
        "prerequisites": {
          "attributes": {
            "智力": 3,
            "敏捷": 3
          }
        },
        "originalPrerequisite": "智力3、敏捷3",
        "effects": [
          {
            "kind": "武器",
            "label": "十字軍",
            "attackType": "槍械",
            "weaponDamage": 4,
            "severity": "L",
            "ranged": true,
            "weaponRange": 20
          },
          {
            "kind": "敘事",
            "text": "原智力＋秘識替代敏捷＋射擊已轉為本武器固定武器傷害 +1。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "屬性替換轉為十字軍本身固定武器傷害 +1，避免影響其他槍械。",
        "narrative": "銘刻十字聖痕的轉輪手槍。允許智力法系角色將精神力量注入彈丸，以心念進行精準射擊。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "名劍工布（偽）",
        "goodId": "item.weapon.magical.gongbu_sword_replica",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 900,
        "consumable": false,
        "prerequisites": {
          "skills": {
            "格鬥": 3
          }
        },
        "originalPrerequisite": "白刃3",
        "effects": [
          {
            "kind": "武器",
            "label": "名劍工布（偽）",
            "attackType": "白刃",
            "weaponDamage": 4,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "附加成功",
            "skill": "格鬥",
            "amount": 1,
            "scope": "攻擊"
          },
          {
            "kind": "檢定加骰",
            "skill": "格鬥",
            "amount": 1,
            "scope": "攻擊"
          },
          {
            "kind": "敘事",
            "text": "原戰術效果「全力一擊強化」轉為白刃攻擊固定 +1DP；原始條件保留於商品描述。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "原「劍術附加成功」已轉為攻擊附加成功。 戰術攻擊增幅轉為白刃攻擊固定 +1DP；原動作經濟條件保留為敘事提示。",
        "narrative": "倣古名劍打造的青刃長劍。劍路如水銀瀉地，兼具極高的劈斬加值與破陣破甲威力。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "桃木劍",
        "goodId": "item.weapon.magical.peach_wood_sword",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 750,
        "consumable": false,
        "prerequisites": {},
        "effects": [
          {
            "kind": "武器",
            "label": "桃木劍",
            "attackType": "白刃",
            "weaponDamage": 5,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "敘事",
            "text": "原特殊目標條件「非黑暗生物」已泛化為本武器固定傷害 +1。"
          },
          {
            "kind": "附加成功",
            "skill": "秘識",
            "amount": 1,
            "scope": "攻擊"
          },
          {
            "kind": "敘事",
            "text": "原條件「施展道術或消耗道力/符咒技能」已轉為無條件固定加值。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "特攻／陣營特攻轉為本武器固定傷害 +1，原目標條件保留為敘事提示。 原「道術符咒加成」已轉為攻擊附加成功。 原條件「施展道術或消耗道力/符咒技能」無對應欄位，已轉為無條件固定加值。",
        "narrative": "百年桃木雕琢的法劍。斬擊常人僅為鈍痛，但克制妖邪鬼魅，為施展道術符法的上佳法器。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
      },
      {
        "name": "執子",
        "goodId": "item.weapon.magical.zhizi_twin_vow",
        "category": "物品",
        "resourceType": "物品",
        "rank": null,
        "price": 600,
        "consumable": false,
        "prerequisites": {},
        "effects": [
          {
            "kind": "武器",
            "label": "執子",
            "attackType": "白刃",
            "weaponDamage": 3,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "檢定加骰",
            "attribute": "意志",
            "amount": 1,
            "scope": "檢定"
          },
          {
            "kind": "敘事",
            "text": "原共生契約轉為意志檢定 +1；傷害分攤與共享抵抗仍以敘事描述呈現。"
          }
        ],
        "droppedTraits": [],
        "conversionNote": "共生契約轉為持有者意志檢定 +1，隊友傷害分攤保留為敘事提示。",
        "narrative": "刻有「執子之手，與子偕老」的特殊誓約古劍。可用於與夥伴締結生命與意志共擔的同生共死契約。",
        "sourceRef": "rules-2.35.txt 第276789行起(武器型錄轉換)：附件 tier-d-equipment-weapons；固定效果依目前 Combat V2 轉化。"
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
        "balanceNote": {
          "direction": "放寬範圍",
          "what": "書上加的是「求生（追蹤）」這個子項專業的檢定，現在整個求生技能都吃得到 +2DP——包含野外求生、動物溝通。",
          "why": "簡化規則沒有子項專業(專業系統已明確決定不做，見 ARCHITECTURE.md 的決策記錄)，22技能→10技能之後沒有更細的粒度可以掛。",
          "ifRebalancing": "三件「放寬範圍」的商品(方向感／程序猿／饕餮盛宴)是同一種情況，要調就三件一起看，不要只動一件——它們的價格都照模板，彼此之間目前是公平的。真要分輕重就看『併掉幾個子項』：求生併了4個(求生/野外求生/追蹤/動物溝通)。"
        },
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
        "balanceNote": {
          "direction": "放寬範圍",
          "what": "書上加的是「電腦」技能(駭入類判定)，現在整個技藝技能都吃得到——連拆彈爆破與機械維修改裝都算。",
          "why": "同方向感：沒有子項專業這一層。而且這裡併掉的是三個原本獨立的22技能(手藝/電腦/爆破)，不只是一個子項。",
          "ifRebalancing": "**三件放寬裡幅度最大的一件**(技藝併掉的原始技能最多)。真的要區分輕重、只動一件的話，先動這一件。"
        },
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
    "id": "bloodline-full-ladder-v1",
    "type": "商品",
    "version": "2.0.0",
    "schemaVersion": "bloodline-full-ladder-v1",
    "packId": "bloodline-full-ladder-v1",
    "status": "上架",
    "candidateOnly": false,
    "runtimeImported": true,
    "sourceDraft": "bloodline-rebalanced-draft-v1",
    "note": "[2026-09-03 重新設計] 11 個血統的完整 D→C→B→A→S 全數補完(跳過AA，依使用者指示)。上一版只轉出 D 級，而且全部只用『屬性點包＋檢定加骰＋生命上限/護甲』四種效果，11 個血統的機制外觀完全相同，只差挑哪兩個技能——這一版的目的是讓每個血統有自己的機制手感(常態技能型／型態爆發型／能量池可變量型／維持成本型／modes二選一型)，同時把每一級的『加值量』盡量對齊，不讓 11 條血統彼此強弱差太多。型態(S級)的 grants 刻意只用「檢定加骰／附加成功／武器／法術增幅」，護甲／防御刻意不用——當初設計時 Combat V2 的 combatProfileFrom() 只在 startBattleV2() 算一次快照，戰鬥中途啟動的型態授予護甲/防御/天生武器都不會真的生效。[2026-09-03 後續修正] 這個接線缺口已經在 core/combat/v2/battleState.js 補上 livePlayerCombatProfile()(護甲/防御現查，不吃快照)，順便補了另一個對稱的缺口：型態到期時 battle.loadout 沒有跟著重建，型態授予的武器會變成到期後還按得到的永久武器，兩個缺口都各自有 test/combatV2Forms.test.js 的回歸測試守住。護甲/防御現在已經可以安全放進型態，這裡沒有回頭把已上架的 11 條血統改成用它——先攻(initiativeBonus)仍然只適合放常態效果，因為先攻只在開戰時 rollBattleInitiative() 排一次序，型態中途授予不會重新排。",
    "entries": [
      {
        "goodId": "bloodline.rebalanced.martial_arts_prodigy.D",
        "name": "萬中無一的武學奇才 D級：懵懂的少年",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.martial_arts_prodigy",
        "pathId": "default",
        "rank": "D",
        "status": "上架",
        "price": "D+600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "traits": [
          "生命上限+2",
          "求生檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "生命上限",
            "amount": 2
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "求生"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.martial_arts_prodigy.C",
        "name": "萬中無一的武學奇才 C級：入門武者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.martial_arts_prodigy",
        "pathId": "default",
        "rank": "C",
        "status": "上架",
        "price": "C+1200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 6,
          "capPerAttribute": 3
        },
        "traits": [
          "生命上限+2(累計4)",
          "格鬥檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "生命上限",
            "amount": 2
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "格鬥"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.martial_arts_prodigy.B",
        "name": "萬中無一的武學奇才 B級：武道行者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.martial_arts_prodigy",
        "pathId": "default",
        "rank": "B",
        "status": "上架",
        "price": "B+3600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 8,
          "capPerAttribute": 4
        },
        "traits": [
          "格鬥攻擊附加成功+1",
          "求生檢定加骰+1(累計2)"
        ],
        "effects": [
          {
            "kind": "附加成功",
            "amount": 1,
            "skill": "格鬥",
            "scope": "攻擊"
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "求生"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.martial_arts_prodigy.A",
        "name": "萬中無一的武學奇才 A級：一流高手",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.martial_arts_prodigy",
        "pathId": "default",
        "rank": "A",
        "status": "上架",
        "price": "A+7200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 12,
          "capPerAttribute": 6
        },
        "traits": [
          "天生武學拳勁(3L肉搏)",
          "格鬥攻擊附加成功+1(累計2)"
        ],
        "effects": [
          {
            "kind": "武器",
            "label": "武學拳勁",
            "attackType": "肉搏",
            "weaponDamage": 3,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "附加成功",
            "amount": 1,
            "skill": "格鬥",
            "scope": "攻擊"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.martial_arts_prodigy.S",
        "name": "萬中無一的武學奇才 S級：天下無雙",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.martial_arts_prodigy",
        "pathId": "default",
        "rank": "S",
        "status": "上架",
        "price": "S+14400",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 24,
          "capPerAttribute": 8
        },
        "traits": [
          "型態「破限拳意」：標準動作+2意志力，撐2輪，格鬥檢定加骰+2、格鬥攻擊附加成功+2"
        ],
        "effects": [
          {
            "kind": "型態",
            "label": "破限拳意",
            "activation": {
              "action": "標準",
              "willpower": 2
            },
            "duration": {
              "unit": "輪",
              "rounds": 2
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amount": 2,
                "skill": "格鬥",
                "scope": "檢定"
              },
              {
                "kind": "附加成功",
                "amount": 2,
                "skill": "格鬥",
                "scope": "攻擊"
              }
            ]
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.coordinator.D",
        "name": "調整者Coordinator D級：初代調整者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.coordinator",
        "pathId": "default",
        "rank": "D",
        "status": "上架",
        "price": "D+600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "traits": [
          "生命上限+2",
          "醫療檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "生命上限",
            "amount": 2
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "醫療"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.coordinator.C",
        "name": "調整者Coordinator C級：二代調整者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.coordinator",
        "pathId": "default",
        "rank": "C",
        "status": "上架",
        "price": "C+1200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 6,
          "capPerAttribute": 3
        },
        "traits": [
          "先攻+1",
          "醫療檢定加骰+1(累計2)"
        ],
        "effects": [
          {
            "kind": "先攻",
            "amount": 1
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "醫療"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.coordinator.B",
        "name": "調整者Coordinator B級：三代調整者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.coordinator",
        "pathId": "default",
        "rank": "B",
        "status": "上架",
        "price": "B+3600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 8,
          "capPerAttribute": 4
        },
        "traits": [
          "先攻+1(累計2)",
          "意志上限+2"
        ],
        "effects": [
          {
            "kind": "先攻",
            "amount": 1
          },
          {
            "kind": "意志上限",
            "amount": 2
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.coordinator.A",
        "name": "調整者Coordinator A級：超級調整者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.coordinator",
        "pathId": "default",
        "rank": "A",
        "status": "上架",
        "price": "A+7200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 12,
          "capPerAttribute": 6
        },
        "traits": [
          "醫療檢定加骰+2(累計4)",
          "先攻+1(累計3)"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 2,
            "skill": "醫療"
          },
          {
            "kind": "先攻",
            "amount": 1
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.coordinator.S",
        "name": "調整者Coordinator S級：完美調整者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.coordinator",
        "pathId": "default",
        "rank": "S",
        "status": "上架",
        "price": "S+14400",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 24,
          "capPerAttribute": 8
        },
        "traits": [
          "型態「基因鎖解放」：迅捷動作+2意志力，撐3輪，生理系屬性(力量/敏捷/耐力)檢定加骰+2、格鬥攻擊附加成功+1"
        ],
        "effects": [
          {
            "kind": "型態",
            "label": "基因鎖解放",
            "activation": {
              "action": "迅捷",
              "willpower": 2
            },
            "duration": {
              "unit": "輪",
              "rounds": 3
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amount": 2,
                "attributes": [
                  "力量",
                  "敏捷",
                  "耐力"
                ],
                "scope": "全部"
              },
              {
                "kind": "附加成功",
                "amount": 1,
                "skill": "格鬥",
                "scope": "攻擊"
              }
            ]
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.allance.D",
        "name": "阿蘭斯血統 D級：帝國公民",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.allance",
        "pathId": "default",
        "rank": "D",
        "status": "上架",
        "price": "D+600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "traits": [
          "技藝檢定加骰+1",
          "交涉檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "技藝"
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "交涉"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.allance.C",
        "name": "阿蘭斯血統 C級：古代阿蘭斯人",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.allance",
        "pathId": "default",
        "rank": "C",
        "status": "上架",
        "price": "C+1200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 6,
          "capPerAttribute": 3
        },
        "traits": [
          "技藝檢定加骰+1(累計2)",
          "意志上限+2"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "技藝"
          },
          {
            "kind": "意志上限",
            "amount": 2
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.allance.B",
        "name": "阿蘭斯血統 B級：遠古阿蘭斯人",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.allance",
        "pathId": "default",
        "rank": "B",
        "status": "上架",
        "price": "B+3600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 8,
          "capPerAttribute": 4
        },
        "traits": [
          "交涉檢定加骰+1(累計2)",
          "交涉附加成功+1"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "交涉"
          },
          {
            "kind": "附加成功",
            "amount": 1,
            "skill": "交涉",
            "scope": "檢定"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.allance.A",
        "name": "阿蘭斯血統 A級：阿蘭斯士兵",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.allance",
        "pathId": "default",
        "rank": "A",
        "status": "上架",
        "price": "A+7200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 12,
          "capPerAttribute": 6
        },
        "traits": [
          "防御+2",
          "技藝檢定加骰+1(累計3)"
        ],
        "effects": [
          {
            "kind": "防御",
            "amount": 2
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "技藝"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.allance.S",
        "name": "阿蘭斯血統 S級：戰爭之影",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.allance",
        "pathId": "default",
        "rank": "S",
        "status": "上架",
        "price": "S+14400",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 24,
          "capPerAttribute": 8
        },
        "traits": [
          "型態「戰爭之影」：標準動作+2意志力，撐2輪，召喚帝國制式劍(3L肉搏)、格鬥攻擊附加成功+1"
        ],
        "effects": [
          {
            "kind": "型態",
            "label": "戰爭之影",
            "activation": {
              "action": "標準",
              "willpower": 2
            },
            "duration": {
              "unit": "輪",
              "rounds": 2
            },
            "grants": [
              {
                "kind": "武器",
                "label": "帝國制式劍",
                "attackType": "肉搏",
                "weaponDamage": 3,
                "severity": "L",
                "ranged": false
              },
              {
                "kind": "附加成功",
                "amount": 1,
                "skill": "格鬥",
                "scope": "攻擊"
              }
            ]
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.white_tiger.D",
        "name": "白虎星血統 D級：白虎星裔",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.white_tiger",
        "pathId": "default",
        "rank": "D",
        "status": "上架",
        "price": "D+600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "traits": [
          "天生武器：白虎爪(2L肉搏)",
          "偵察檢定加骰+1(靈獸感官)"
        ],
        "effects": [
          {
            "kind": "武器",
            "label": "白虎爪",
            "attackType": "肉搏",
            "weaponDamage": 2,
            "severity": "L",
            "ranged": false
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "偵察"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.white_tiger.C",
        "name": "白虎星血統 C級：白虎行者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.white_tiger",
        "pathId": "default",
        "rank": "C",
        "status": "上架",
        "price": "C+1200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 6,
          "capPerAttribute": 3
        },
        "traits": [
          "護甲+1",
          "偵察檢定加骰+1(累計2)"
        ],
        "effects": [
          {
            "kind": "護甲",
            "amount": 1
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "偵察"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.white_tiger.B",
        "name": "白虎星血統 B級：白虎武者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.white_tiger",
        "pathId": "default",
        "rank": "B",
        "status": "上架",
        "price": "B+3600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 8,
          "capPerAttribute": 4
        },
        "traits": [
          "格鬥攻擊附加成功+1(征伐之心)",
          "格鬥檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "附加成功",
            "amount": 1,
            "skill": "格鬥",
            "scope": "攻擊"
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "格鬥"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.white_tiger.A",
        "name": "白虎星血統 A級：白虎尊者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.white_tiger",
        "pathId": "default",
        "rank": "A",
        "status": "上架",
        "price": "A+7200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 12,
          "capPerAttribute": 6
        },
        "traits": [
          "護甲+1(累計2)",
          "格鬥攻擊附加成功+1(累計2)"
        ],
        "effects": [
          {
            "kind": "護甲",
            "amount": 1
          },
          {
            "kind": "附加成功",
            "amount": 1,
            "skill": "格鬥",
            "scope": "攻擊"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.white_tiger.S",
        "name": "白虎星血統 S級：白虎顯真",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.white_tiger",
        "pathId": "default",
        "rank": "S",
        "status": "上架",
        "price": "S+14400",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 24,
          "capPerAttribute": 8
        },
        "traits": [
          "型態「白虎顯真」：標準動作+2意志力，撐2輪，格鬥檢定加骰+3、格鬥攻擊附加成功+1"
        ],
        "effects": [
          {
            "kind": "型態",
            "label": "白虎顯真",
            "activation": {
              "action": "標準",
              "willpower": 2
            },
            "duration": {
              "unit": "輪",
              "rounds": 2
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amount": 3,
                "skill": "格鬥",
                "scope": "攻擊"
              },
              {
                "kind": "附加成功",
                "amount": 1,
                "skill": "格鬥",
                "scope": "攻擊"
              }
            ]
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.ancient_sacred_body.D",
        "name": "荒古聖體 D級：天賦異稟",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.ancient_sacred_body",
        "pathId": "default",
        "rank": "D",
        "status": "上架",
        "price": "D+600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "traits": [
          "生命上限+2",
          "體魄檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "生命上限",
            "amount": 2
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "體魄"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.ancient_sacred_body.C",
        "name": "荒古聖體 C級：脫胎",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.ancient_sacred_body",
        "pathId": "default",
        "rank": "C",
        "status": "上架",
        "price": "C+1200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 6,
          "capPerAttribute": 3
        },
        "traits": [
          "生命上限+2(累計4)",
          "護甲+1"
        ],
        "effects": [
          {
            "kind": "生命上限",
            "amount": 2
          },
          {
            "kind": "護甲",
            "amount": 1
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.ancient_sacred_body.B",
        "name": "荒古聖體 B級：換骨",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.ancient_sacred_body",
        "pathId": "default",
        "rank": "B",
        "status": "上架",
        "price": "B+3600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 8,
          "capPerAttribute": 4
        },
        "traits": [
          "生命上限+2(累計6)",
          "體魄檢定加骰+1(累計2)"
        ],
        "effects": [
          {
            "kind": "生命上限",
            "amount": 2
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "體魄"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.ancient_sacred_body.A",
        "name": "荒古聖體 A級：洗髓",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.ancient_sacred_body",
        "pathId": "default",
        "rank": "A",
        "status": "上架",
        "price": "A+7200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 12,
          "capPerAttribute": 6
        },
        "traits": [
          "護甲+1(累計2)",
          "生命上限+2(累計8)"
        ],
        "effects": [
          {
            "kind": "護甲",
            "amount": 1
          },
          {
            "kind": "生命上限",
            "amount": 2
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.ancient_sacred_body.S",
        "name": "荒古聖體 S級：聖體顯世",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.ancient_sacred_body",
        "pathId": "default",
        "rank": "S",
        "status": "上架",
        "price": "S+14400",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 24,
          "capPerAttribute": 8
        },
        "traits": [
          "型態「聖體顯世」：標準動作+2意志力，撐3輪，力量/耐力檢定加骰+2、肉搏攻擊附加成功+1"
        ],
        "effects": [
          {
            "kind": "型態",
            "label": "聖體顯世",
            "activation": {
              "action": "標準",
              "willpower": 2
            },
            "duration": {
              "unit": "輪",
              "rounds": 3
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amount": 2,
                "attributes": [
                  "力量",
                  "耐力"
                ],
                "scope": "全部"
              },
              {
                "kind": "附加成功",
                "amount": 1,
                "skill": "格鬥",
                "scope": "攻擊"
              }
            ]
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.crimson_demon.D",
        "name": "紅魔族 D級：背負血之命運的法師",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.crimson_demon",
        "pathId": "default",
        "rank": "D",
        "status": "上架",
        "price": "D+600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "traits": [
          "秘識檢定加骰+1",
          "技藝檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "秘識"
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "技藝"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.crimson_demon.C",
        "name": "紅魔族 C級：紅魔法師",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.crimson_demon",
        "pathId": "default",
        "rank": "C",
        "status": "上架",
        "price": "C+1200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 6,
          "capPerAttribute": 3
        },
        "traits": [
          "法術增幅+1",
          "意志上限+2"
        ],
        "effects": [
          {
            "kind": "法術增幅",
            "amount": 1
          },
          {
            "kind": "意志上限",
            "amount": 2
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.crimson_demon.B",
        "name": "紅魔族 B級：紅魔賢者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.crimson_demon",
        "pathId": "default",
        "rank": "B",
        "status": "上架",
        "price": "B+3600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 8,
          "capPerAttribute": 4
        },
        "traits": [
          "法術增幅+1(累計2)",
          "秘識檢定加骰+1(累計2)"
        ],
        "effects": [
          {
            "kind": "法術增幅",
            "amount": 1
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "秘識"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.crimson_demon.A",
        "name": "紅魔族 A級：紅魔大賢者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.crimson_demon",
        "pathId": "default",
        "rank": "A",
        "status": "上架",
        "price": "A+7200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 12,
          "capPerAttribute": 6
        },
        "traits": [
          "意志上限+2(累計4)",
          "法術增幅+1(累計3)"
        ],
        "effects": [
          {
            "kind": "意志上限",
            "amount": 2
          },
          {
            "kind": "法術增幅",
            "amount": 1
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.crimson_demon.S",
        "name": "紅魔族 S級：爆裂之心",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.crimson_demon",
        "pathId": "default",
        "rank": "S",
        "status": "上架",
        "price": "S+14400",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 24,
          "capPerAttribute": 8
        },
        "traits": [
          "型態「爆裂之心」：標準動作+2意志力，撐1輪，啟動時二選一——爆裂(秘識附加成功+2)或詠唱(秘識檢定加骰+3)"
        ],
        "effects": [
          {
            "kind": "型態",
            "label": "爆裂之心",
            "activation": {
              "action": "標準",
              "willpower": 2
            },
            "duration": {
              "unit": "輪",
              "rounds": 1
            },
            "modes": [
              {
                "key": "爆裂",
                "label": "爆裂",
                "grants": [
                  {
                    "kind": "附加成功",
                    "amount": 2,
                    "skill": "秘識",
                    "scope": "檢定"
                  }
                ]
              },
              {
                "key": "詠唱",
                "label": "詠唱",
                "grants": [
                  {
                    "kind": "檢定加骰",
                    "amount": 3,
                    "skill": "秘識",
                    "scope": "檢定"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.wisewolf.D",
        "name": "賢狼變化 D級：萌芽之狼",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.wisewolf",
        "pathId": "default",
        "rank": "D",
        "status": "上架",
        "price": "D+600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "traits": [
          "偵察檢定加骰+1",
          "求生檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "偵察"
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "求生"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.wisewolf.C",
        "name": "賢狼變化 C級：森之狼",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.wisewolf",
        "pathId": "default",
        "rank": "C",
        "status": "上架",
        "price": "C+1200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 6,
          "capPerAttribute": 3
        },
        "traits": [
          "先攻+1",
          "求生檢定加骰+1(累計2)"
        ],
        "effects": [
          {
            "kind": "先攻",
            "amount": 1
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "求生"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.wisewolf.B",
        "name": "賢狼變化 B級：賢狼",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.wisewolf",
        "pathId": "default",
        "rank": "B",
        "status": "上架",
        "price": "B+3600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 8,
          "capPerAttribute": 4
        },
        "traits": [
          "偵察檢定加骰+1(累計2)",
          "格鬥攻擊附加成功+1"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "偵察"
          },
          {
            "kind": "附加成功",
            "amount": 1,
            "skill": "格鬥",
            "scope": "攻擊"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.wisewolf.A",
        "name": "賢狼變化 A級：古狼",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.wisewolf",
        "pathId": "default",
        "rank": "A",
        "status": "上架",
        "price": "A+7200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 12,
          "capPerAttribute": 6
        },
        "traits": [
          "先攻+1(累計2)",
          "求生檢定加骰+1(累計3)"
        ],
        "effects": [
          {
            "kind": "先攻",
            "amount": 1
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "求生"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.wisewolf.S",
        "name": "賢狼變化 S級：森之守望者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.wisewolf",
        "pathId": "default",
        "rank": "S",
        "status": "上架",
        "price": "S+14400",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 24,
          "capPerAttribute": 8
        },
        "traits": [
          "型態「森之守望」：迅捷動作+1意志力，撐3輪，敏捷/感知檢定加骰+2"
        ],
        "effects": [
          {
            "kind": "型態",
            "label": "森之守望",
            "activation": {
              "action": "迅捷",
              "willpower": 1
            },
            "duration": {
              "unit": "輪",
              "rounds": 3
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amount": 2,
                "attributes": [
                  "敏捷",
                  "感知"
                ],
                "scope": "全部"
              }
            ]
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.garuda.D",
        "name": "迦樓羅血統 D級：祈靈者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.garuda",
        "pathId": "default",
        "rank": "D",
        "status": "上架",
        "price": "D+600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "traits": [
          "防御+1",
          "格鬥檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "防御",
            "amount": 1
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "格鬥"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.garuda.C",
        "name": "迦樓羅血統 C級：迦樓羅之翼",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.garuda",
        "pathId": "default",
        "rank": "C",
        "status": "上架",
        "price": "C+1200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 6,
          "capPerAttribute": 3
        },
        "traits": [
          "護甲+1",
          "意志上限+2"
        ],
        "effects": [
          {
            "kind": "護甲",
            "amount": 1
          },
          {
            "kind": "意志上限",
            "amount": 2
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.garuda.B",
        "name": "迦樓羅血統 B級：迦樓羅之魂",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.garuda",
        "pathId": "default",
        "rank": "B",
        "status": "上架",
        "price": "B+3600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 8,
          "capPerAttribute": 4
        },
        "traits": [
          "格鬥攻擊附加成功+1(迦樓羅之魂)",
          "護甲+1(累計2)"
        ],
        "effects": [
          {
            "kind": "附加成功",
            "amount": 1,
            "skill": "格鬥",
            "scope": "攻擊"
          },
          {
            "kind": "護甲",
            "amount": 1
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.garuda.A",
        "name": "迦樓羅血統 A級：迦樓羅之佑",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.garuda",
        "pathId": "default",
        "rank": "A",
        "status": "上架",
        "price": "A+7200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 12,
          "capPerAttribute": 6
        },
        "traits": [
          "意志上限+2(累計4)",
          "格鬥攻擊附加成功+1(累計2)"
        ],
        "effects": [
          {
            "kind": "意志上限",
            "amount": 2
          },
          {
            "kind": "附加成功",
            "amount": 1,
            "skill": "格鬥",
            "scope": "攻擊"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.garuda.S",
        "name": "迦樓羅血統 S級：迦樓羅顯羽",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.garuda",
        "pathId": "default",
        "rank": "S",
        "status": "上架",
        "price": "S+14400",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 24,
          "capPerAttribute": 8
        },
        "traits": [
          "型態「迦樓羅顯羽」：標準動作+2意志力，撐2輪，格鬥檢定加骰+3、格鬥攻擊附加成功+1"
        ],
        "effects": [
          {
            "kind": "型態",
            "label": "迦樓羅顯羽",
            "activation": {
              "action": "標準",
              "willpower": 2
            },
            "duration": {
              "unit": "輪",
              "rounds": 2
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amount": 3,
                "skill": "格鬥",
                "scope": "攻擊"
              },
              {
                "kind": "附加成功",
                "amount": 1,
                "skill": "格鬥",
                "scope": "攻擊"
              }
            ]
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.holy_gem.D",
        "name": "聖寶石體質 D級：晶體接觸",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.holy_gem",
        "pathId": "default",
        "rank": "D",
        "status": "上架",
        "price": "D+600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "traits": [
          "意志檢定加骰+1",
          "秘識檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "attribute": "意志"
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "秘識"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.holy_gem.C",
        "name": "聖寶石體質 C級：共鳴",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.holy_gem",
        "pathId": "default",
        "rank": "C",
        "status": "上架",
        "price": "C+1200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 6,
          "capPerAttribute": 3
        },
        "traits": [
          "能量池：以內力運作的寶石之光",
          "秘識檢定加骰+1(累計2)"
        ],
        "effects": [
          {
            "kind": "能量池",
            "pool": "內力"
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "秘識"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.holy_gem.B",
        "name": "聖寶石體質 B級：融合",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.holy_gem",
        "pathId": "default",
        "rank": "B",
        "status": "上架",
        "price": "B+3600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 8,
          "capPerAttribute": 4
        },
        "traits": [
          "秘識檢定加骰+1(累計3)",
          "意志上限+2"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "秘識"
          },
          {
            "kind": "意志上限",
            "amount": 2
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.holy_gem.A",
        "name": "聖寶石體質 A級：覺醒",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.holy_gem",
        "pathId": "default",
        "rank": "A",
        "status": "上架",
        "price": "A+7200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 12,
          "capPerAttribute": 6
        },
        "traits": [
          "意志檢定加骰+1(累計2)",
          "秘識檢定加骰+1(累計4)"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "attribute": "意志"
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "秘識"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.holy_gem.S",
        "name": "聖寶石體質 S級：寶石顯世",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.holy_gem",
        "pathId": "default",
        "rank": "S",
        "status": "上架",
        "price": "S+14400",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 24,
          "capPerAttribute": 8
        },
        "traits": [
          "型態「寶石顯世」：迅捷動作，支付1～意志值點內力，每點秘識檢定加骰+1，撐3輪"
        ],
        "effects": [
          {
            "kind": "型態",
            "label": "寶石顯世",
            "activation": {
              "action": "迅捷",
              "poolVariable": {
                "name": "內力",
                "min": 1,
                "maxFromAttributes": [
                  "意志"
                ]
              }
            },
            "duration": {
              "unit": "輪",
              "rounds": 3
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amountPerPoint": 1,
                "skill": "秘識",
                "scope": "檢定"
              }
            ]
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.fungus_lord.D",
        "name": "毒茸之侵略者 D級：Wake Up!",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.fungus_lord",
        "pathId": "default",
        "rank": "D",
        "status": "上架",
        "price": "D+600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "traits": [
          "潛行檢定加骰+1",
          "醫療檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "潛行"
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "醫療"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.fungus_lord.C",
        "name": "毒茸之侵略者 C級：孢子擴散",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.fungus_lord",
        "pathId": "default",
        "rank": "C",
        "status": "上架",
        "price": "C+1200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 6,
          "capPerAttribute": 3
        },
        "traits": [
          "潛行檢定加骰+1(累計2)",
          "生命上限+2"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "潛行"
          },
          {
            "kind": "生命上限",
            "amount": 2
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.fungus_lord.B",
        "name": "毒茸之侵略者 B級：菌絲蔓延",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.fungus_lord",
        "pathId": "default",
        "rank": "B",
        "status": "上架",
        "price": "B+3600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 8,
          "capPerAttribute": 4
        },
        "traits": [
          "醫療檢定加骰+1(累計2)",
          "護甲+1"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "醫療"
          },
          {
            "kind": "護甲",
            "amount": 1
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.fungus_lord.A",
        "name": "毒茸之侵略者 A級：森林支配者",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.fungus_lord",
        "pathId": "default",
        "rank": "A",
        "status": "上架",
        "price": "A+7200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 12,
          "capPerAttribute": 6
        },
        "traits": [
          "護甲+1(累計2)",
          "生命上限+2(累計4)"
        ],
        "effects": [
          {
            "kind": "護甲",
            "amount": 1
          },
          {
            "kind": "生命上限",
            "amount": 2
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.fungus_lord.S",
        "name": "毒茸之侵略者 S級：孢子共生",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.fungus_lord",
        "pathId": "default",
        "rank": "S",
        "status": "上架",
        "price": "S+14400",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 24,
          "capPerAttribute": 8
        },
        "traits": [
          "型態「孢子共生」：迅捷動作+1意志力啟動，之後每輪維持1點意志力，付不出來當場解除，期間潛行/醫療檢定加骰+3"
        ],
        "effects": [
          {
            "kind": "型態",
            "label": "孢子共生",
            "activation": {
              "action": "迅捷",
              "willpower": 1
            },
            "duration": {
              "unit": "輪",
              "untilUpkeepFails": true
            },
            "upkeep": {
              "willpower": 1
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amount": 3,
                "skill": "潛行",
                "scope": "檢定"
              },
              {
                "kind": "檢定加骰",
                "amount": 3,
                "skill": "醫療",
                "scope": "檢定"
              }
            ]
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.saiyan.D",
        "name": "賽亞人血統 D級：下級戰士",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.saiyan",
        "pathId": "default",
        "rank": "D",
        "status": "上架",
        "price": "D+600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 4,
          "capPerAttribute": 2
        },
        "traits": [
          "護甲+1",
          "體魄檢定加骰+1"
        ],
        "effects": [
          {
            "kind": "護甲",
            "amount": 1
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "體魄"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.saiyan.C",
        "name": "賽亞人血統 C級：中級戰士",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.saiyan",
        "pathId": "default",
        "rank": "C",
        "status": "上架",
        "price": "C+1200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 6,
          "capPerAttribute": 3
        },
        "traits": [
          "護甲+1(累計2)",
          "體魄檢定加骰+1(累計2)"
        ],
        "effects": [
          {
            "kind": "護甲",
            "amount": 1
          },
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "體魄"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.saiyan.B",
        "name": "賽亞人血統 B級：上級戰士",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.saiyan",
        "pathId": "default",
        "rank": "B",
        "status": "上架",
        "price": "B+3600",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 8,
          "capPerAttribute": 4
        },
        "traits": [
          "格鬥攻擊附加成功+1",
          "護甲+1(累計3)"
        ],
        "effects": [
          {
            "kind": "附加成功",
            "amount": 1,
            "skill": "格鬥",
            "scope": "攻擊"
          },
          {
            "kind": "護甲",
            "amount": 1
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.saiyan.A",
        "name": "賽亞人血統 A級：精英戰士",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.saiyan",
        "pathId": "default",
        "rank": "A",
        "status": "上架",
        "price": "A+7200",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 12,
          "capPerAttribute": 6
        },
        "traits": [
          "體魄檢定加骰+1(累計3)",
          "格鬥攻擊附加成功+1(累計2)"
        ],
        "effects": [
          {
            "kind": "檢定加骰",
            "amount": 1,
            "skill": "體魄"
          },
          {
            "kind": "附加成功",
            "amount": 1,
            "skill": "格鬥",
            "scope": "攻擊"
          }
        ]
      },
      {
        "goodId": "bloodline.rebalanced.saiyan.S",
        "name": "賽亞人血統 S級：界限突破",
        "category": "模板能力",
        "resourceType": "血統",
        "exclusiveGroup": "血統",
        "lineageId": "bloodline.saiyan",
        "pathId": "default",
        "rank": "S",
        "status": "上架",
        "price": "S+14400",
        "consumable": false,
        "sourceRef": "rules-2.35.txt 第0行(2026-09-03 重新設計：D-S五級全數原創補完，理由與各級 conversionNote 並列)",
        "attributePool": {
          "points": 24,
          "capPerAttribute": 8
        },
        "traits": [
          "型態「界限突破」：標準動作+2意志力，撐3輪，格鬥檢定加骰+3、格鬥攻擊附加成功+1"
        ],
        "effects": [
          {
            "kind": "型態",
            "label": "界限突破",
            "activation": {
              "action": "標準",
              "willpower": 2
            },
            "duration": {
              "unit": "輪",
              "rounds": 3
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amount": 3,
                "skill": "格鬥",
                "scope": "攻擊"
              },
              {
                "kind": "附加成功",
                "amount": 1,
                "skill": "格鬥",
                "scope": "攻擊"
              }
            ]
          }
        ]
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
        "pendingReason": "**這一件的掛名理由已經從『還沒查到』變成『查到了，而且答案是不可能』。** 兩個核心特性(空想具現、爆炎聖劍)都掛在『消耗1點屬性力並以移動動作變身』上，而屬性力的關鍵屬性是決心+風度(第98784行)——兩個都不在簡化規則的六維裡，於是屬性力池算不出上限，登錄在 core/energyPools.js 的 REJECTED_POOLS 而不是 POOL_DEFS。變身容器與『型態吃能量池當啟動成本』兩樣機制在 2026-08-17 都已經做好了(見 content/shop/forms.js 與寫輪眼)，所以擋住這一件的**只剩六維本身**：除非簡化規則把決心與風度加回來，否則這一件不會有上架的一天。它的加值也大量落在同樣那兩個屬性上。",
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
        "status": "上架",
        "category": "模板能力",
        "resourceType": "瞳術",
        "exclusiveGroup": "瞳術",
        "price": "D+600",
        "consumable": false,
        "effects": [
          {
            "kind": "能量池",
            "pool": "查克拉",
            "source": "dojutsu.寫輪眼.D"
          },
          {
            "kind": "型態",
            "label": "洞察眼",
            "activation": {
              "action": "標準",
              "pool": {
                "name": "查克拉",
                "amount": 1
              }
            },
            "duration": {
              "unit": "場景"
            },
            "grants": [
              {
                "kind": "檢定加骰",
                "amount": 2,
                "scope": "攻擊"
              },
              {
                "kind": "防御",
                "amount": 2
              }
            ]
          }
        ],
        "droppedTraits": [
          {
            "trait": "忍術：你獲得相當於瞳術等級的忍術施法者等級",
            "reason": "沒有施法者職能系統(整個沒有，見 CONVERSION_RULES.md 第二部分 D 節)"
          },
          {
            "trait": "洞察眼的持續時間「一個場景或10分鐘取低」的後半",
            "reason": "長期計時"
          },
          {
            "trait": "洞察眼開啟期間「寫輪眼的相關檢定」也獲得2DP",
            "reason": "情境條件"
          },
          {
            "trait": "洞察眼開啟期間獲得相當於瞳術等級的魔幻本質偵測能力",
            "reason": "沒有本質/靈光這一層資料(魔幻本質、科技本質這些標籤在簡化規則裡沒有欄位)，也沒有偵測判定"
          },
          {
            "trait": "洞察眼開啟期間可以免疫相當於瞳術等級的幻覺效果",
            "reason": "不良狀態"
          },
          {
            "trait": "內耗點數（負特性）：每次為寫輪眼支付查克拉便獲得等同瞳術等級的「內耗」點數，只能在主神空間以10分1點消除；超過耐力*5會單眼失明(感知檢定失去2個成功數、查克拉支付翻倍)，超過耐力*10會雙眼失明並無法再開啟本瞳術",
            "reason": "沒有這種累積點數軌(不良狀態)，也沒有『用錢清除一個角色狀態』的服務。**這是一個被丟掉的限制，不是被丟掉的好處**——見 conversionNote"
          },
          {
            "trait": "技能樹：開啟D級寫輪眼技能樹",
            "reason": "技能樹"
          }
        ],
        "conversionNote": "**這件商品從掛名轉正，靠的全部是上一輪已經做好的機制，一行引擎程式碼都沒有為它新增**：能量池容器、型態容器、型態吃能量池當啟動成本，三樣都是 2026-08-17 前半天做的。缺的只是查克拉沒有來源——而它自己就是來源(第117996行的『能量池：查克拉』)，上一輪的 pendingReason 寫『需要查克拉能量池』時漏看了這一行。\n\n洞察眼原文的『2DP洞察加值』同時落在防御與攻擊上：攻擊那一半轉成 scope:\"攻擊\" 的檢定加骰(型態內部允許省略匹配鍵，見 CONVERSION_RULES.md 第2a節)，防御那一半轉成防御+2——四層防御已於2026-08-15合併成單一DC，洞察加值沒有自己的層可以待，加值類型本來就一律當作直接相加。\n\n**必須講明的一件事：內耗點數被丟掉，讓這件商品比書上強。** 書上的寫輪眼是一個會累積不可逆代價的能力(開一次眼就多一點內耗，最後會瞎)，這裡只剩下1點查克拉的成本。這不是簡化造成的損耗，是簡化造成的**加強**，而 CONVERSION_RULES.md 第0節只要求記下損耗——這一條提醒下一個人：做不良狀態軌那一輪時，內耗點數是第一個該回來補的欄位。另外『主動關閉本瞳術是一個自由動作』也沒轉：forms.js 的 deactivateForm() 不收動作成本。",
        "balanceNote": {
          "direction": "比書上強",
          "what": "書上開一次眼要付的不只是1點查克拉：每次為寫輪眼支付查克拉都會累積等同瞳術等級的「內耗」點數，只能在主神空間以10分1點消除，超過耐力*5單眼失明(感知檢定失去2個成功數、之後所有查克拉支付翻倍)，超過耐力*10雙眼失明並且再也開不了眼。這一整套代價目前完全不存在，玩家開眼的成本只剩下1點查克拉與一個標準動作。",
          "why": "需要一條累積型的點數軌。2026-08-17 使用者決定不良狀態整套永久不實作(「太複雜了，我想要全部刪除」)，所以這不是「等一輪就會補」，是**確定不會回來**。",
          "ifRebalancing": "這是整個貨架上**唯一一件丟掉的是限制而不是好處**的商品，所以它是重新平衡時第一個該看的。可以不做點數軌而用現有機制逼近的方向有兩個：把開眼的能量成本調高(書上C級就已經漲到3點、B級5點、A級7點，本專案只收D級所以拿到的是最便宜的那一級)，或是給洞察眼加一個「每個場景只能開一次」以外的額外限制。**不要用『反正沒人會注意』當理由留著不動**——書上的寫輪眼是一個會把使用者用瞎的能力，這裡的版本沒有任何長期代價。"
        },
        "pricingNote": "書中D級段落沒有寫價格數字(這在瞳術章節很常見：21個D級起跳的條目裡只有2個明確標價)，依瞳術模板的 D+600 登錄。",
        "higherRanks": [
          {
            "rank": "C",
            "name": "提升-洞察眼(移動動作支付3點查克拉，再獲得4DP)"
          },
          {
            "rank": "B",
            "name": "提升-洞察眼(迅捷動作支付5點查克拉)"
          },
          {
            "rank": "A",
            "name": "提升-洞察眼(自由動作支付7點查克拉)"
          }
        ],
        "sourceRef": "rules-2.35.txt 第117995行(寫輪眼)：D級，能量池見第117996行「能量池：查克拉」，洞察眼見第118005行，開啟期間的加值見第118009行，內耗點數見第118007行"
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
        "pendingReason": "『破法雙瞳』卡在三樣機制：**對目標的資源動手**(每輪扣敵人6點魔力——敵人樣板只有六維/技能/血量，沒有能量池)、劇痛點數(不良狀態，**永久排除**)、強韌豁免(沒有獨立豁免判定)。『信仰導向（負特性）』需要信仰系統。[2026-08-17 第九輪更新] 先前這一條的理由裡還列著『每輪1點意志力維持』，那一項現在**已經不是障礙**了——維持成本型態(upkeep)做出來了，見葵花寶典的鬼魅身。剩下的三樣才是真的卡住的，其中劇痛點數這一項確定不會有解。",
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
        "status": "上架",
        "category": "體系",
        "resourceType": "流派",
        "price": "D+1000",
        "consumable": false,
        "effects": [
          {
            "kind": "型態",
            "label": "劍氣化碧",
            "activation": {
              "action": "自由",
              "pool": {
                "name": "劍氣",
                "amount": 1
              }
            },
            "duration": {
              "unit": "輪",
              "roundsFromAttribute": "感知"
            },
            "grants": [
              {
                "kind": "武器",
                "label": "青蓮劍氣(凝聚長劍)",
                "attackType": "白刃",
                "weaponDamage": 6,
                "severity": "L",
                "ranged": false
              }
            ]
          },
          {
            "kind": "敘事",
            "text": "青蓮殘雪：只要劍氣池不空，你能以一個自由動作使接觸的物體、持用的武器或以自身為中心半徑5米內的溫度降至0度，溫度變化不會影響你自己；每輪需以一個移動動作維持。"
          }
        ],
        "originalTraits": [
          "青蓮殘雪：只要劍氣池不空，可花費一個自由動作使接觸的物體、持用的武器或以自身為中心半徑5米範圍內溫度降低至0度，每輪需以移動動作維持",
          "劍氣化碧（雙特性）：花費一個自由動作並支付1點劍氣，凝聚出武器傷害6L、招式適應性C級、支線等級D級並且觸及範圍等同於風度值的青蓮劍氣長劍，持續時間為感知值*1輪",
          "劍氣凝霜：持用「劍氣化碧」凝聚出的劍氣進行近戰白刃攻擊時，可支付1點劍氣，額外造成等同於白刃技能上附加成功/點寒冰嚴重傷害"
        ],
        "sourceRef": "rules-2.35.txt 第186278行(青蓮劍歌總決)：D級，價格D+1000",
        "prerequisites": {
          "goods": [
            "pool.混元劍經.1"
          ]
        },
        "originalPrerequisite": "前提：混元劍經第一層，白刃(rules-2.35.txt 第186276行)",
        "droppedTraits": [
          {
            "trait": "劍氣化碧的「招式適應性C級」與「觸及範圍等同於你風度值」",
            "reason": "沒有「招式適應性」這個軸(簡化規則的武器只有傷害/攻擊方式/射程三個欄位)；『觸及範圍等同風度值』的風度不在六維裡，見 CONVERSION_RULES.md 第4節"
          },
          {
            "trait": "劍氣凝霜：持用劍氣化碧的劍進行近戰白刃攻擊時，可支付1點劍氣，額外造成等同白刃技能附加成功/點寒冰嚴重傷害",
            "reason": "傷害類型"
          }
        ],
        "conversionNote": "2026-08-17 依使用者決定『A：往上追池子的來源』轉正。核心特性『劍氣化碧』是一個由能量池驅動的型態：自由動作＋支付1點劍氣，凝聚出武器傷害6L的長劍，持續感知值*1輪——三個數字全部照抄原文。持續時間掛在感知上(duration.roundsFromAttribute)，因為書上寫的就是「感知值*1輪」，那是角色卡上的數字，引擎算得出來。 | 前提『混元劍經第一層』現在是一個真的擋得住的前提：沒有先買混元劍經就沒有劍氣池，型態啟動時會因為「能量不足」被擋下。 | 『青蓮殘雪』的條件是「只要劍氣池不空」——引擎其實查得出來，但它的效果(把溫度降到0度)沒有任何數值後果，所以降級成敘事而不是型態。"
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
            "kind": "能量池",
            "pool": "內力",
            "source": "technique.葵花寶典.1"
          },
          {
            "kind": "型態",
            "label": "鬼魅身",
            "activation": {
              "action": "迅捷",
              "pool": {
                "name": "內力",
                "amount": 1
              }
            },
            "upkeep": {
              "action": "自由",
              "pool": {
                "name": "內力",
                "amount": 1
              }
            },
            "duration": {
              "unit": "輪",
              "untilUpkeepFails": true
            },
            "grants": [
              {
                "kind": "防御",
                "amount": 3
              }
            ]
          },
          {
            "kind": "敘事",
            "text": "返老還童：練成此功後重返壯年時期，停止肉體成長，容顏不再衰老，青春永駐，但不代表免疫使其衰老的效果，依然會壽盡而亡。"
          }
        ],
        "droppedTraits": [
          {
            "trait": "葵花真氣的後半：功法鎖定為「內丹術」",
            "reason": "內功心法(少陽神功/內丹術/太極心經)整套沒有實作，見能量池來源包的內力心法條目：那是一個『購買當下三選一、選定不可更改』的排他選擇點，引擎只有 attributePool 一種形狀撐不起它。這裡被鎖定成其中一個選項，鎖定的對象本身不存在"
          },
          {
            "trait": "鬼魅身的『使你的基礎移動速度增加10米』",
            "reason": "移動速度"
          },
          {
            "trait": "鬼魅身『占用身法位』",
            "reason": "沒有裝備位/招式位系統(身法位、招式適應性那一整套排他槽位都沒有實作)，所以這件商品不會擋住任何別的身法"
          },
          {
            "trait": "真陰意對耐力的部分：耐力相關檢定同時獲得1DP修行加值與承受1DP內在減值",
            "reason": "書上這兩項在耐力上剛好互相抵銷(+1與-1)。簡化規則沒有加值類型的疊加規則(見加值類型)，所以淨值是0——與其寫兩個互相抵銷的效果讓人以為漏算，不如明確記在這裡"
          }
        ],
        "conversionNote": "『真陰意：在敏捷和耐力相關檢定上獲得1DP修行加值，同時在力量和耐力相關檢定上再承受1DP內在減值』——敏捷淨+1、力量淨-1、耐力淨0。這是唯一一件買了會讓某項檢定變差的商品，也是效果詞彙表允許負值的實證。\n\n[2026-08-17 第二輪] 『葵花真氣：獲得D級內力』原本整條丟在 droppedTraits 裡，理由是「能量池」。內力登錄之後(關鍵屬性感知+耐力，第329628行)它變成一個真的能量池效果，這是這一輪從丟棄堆裡撿回來的第二個特性。**書上同一句的後半是一個很有價值的交叉驗證**：『若已擁有內力則使內力上限提高5點』——那個 5 就是 core/energyPools.js 的 REOPEN_BONUSES 第一項(第一次重複開啟 +5)。所以這裡不需要、也不可以另外寫一個 +5，通則自己會算出來；一個獨立條目複述了通則的數字，等於替通則背書。\n\n[2026-08-17 第九輪] 『鬼魅身』從 droppedTraits 撿回來，它是**維持成本型態的第一個實例**：迅捷動作開啟支付1點內力，之後每輪要以一個自由動作再付1點內力，付不出來當場結束(第207198行逐字)。這是型態的第二種到期方式——先前只有「時鐘走完」，現在多了「某一輪付不出錢」，收錢的地方是 encounterState.js 的 advanceTurn()，也就是引擎裡唯一會週期性回頭的地方。**這件事讓內力池第一次有了會持續流失的消費端**：先前所有池子消費都是啟動時扣一次。轉出來的只有『防御上獲得3點閃避加值』，另外兩半(移動速度+10米、占用身法位)見 droppedTraits。",
        "balanceNote": {
          "direction": "比書上弱",
          "what": "書上的鬼魅身只要付得出內力就能一直維持，走路、潛行、逃命時都算數；這裡只有在戰鬥中開得起來也維持得下去，一離開戰鬥就結束。另外書上的『基礎移動速度增加10米』整條沒有轉，所以它在這裡純粹是一個防御型態。",
          "why": "維持成本每輪收一次，而引擎唯一會週期性前進的時鐘是戰鬥輪(advanceTurn())。戰鬥外沒有任何東西會回頭跟玩家收這1點內力，硬讓它在戰鬥外開著，就會變成付一次錢用到天荒地老——那比不能用更糟。移動速度則是整個引擎都沒有的軸(戰鬥是抽象回合制)。",
          "ifRebalancing": "如果之後補了戰鬥外的時間刻度(例如探索用的『分鐘』)，這一條會自動變寬，屆時要重看它的價格。反過來說，只要維持成本仍然只在戰鬥中收，這件商品的實際價值就低於書上的定價 D+500 所預期的。"
        },
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
        "balanceNote": {
          "direction": "放寬範圍",
          "what": "書上提升的是「手藝（烹飪）」子項的技能等級，現在整個技藝技能 +1 級——駭入與爆破也跟著 +1。",
          "why": "跟方向感、程序猿同一個原因：簡化規則沒有子項專業這一層，22技能併成10技能之後，「手藝（烹飪）」在角色卡上沒有欄位可以掛，只剩下整個技藝技能。",
          "ifRebalancing": "跟方向感／程序猿同一組，一起看。這一件的形式跟另外兩件不同(它給的是「技能」永久+1級，不是檢定加骰)，所以它的放寬會一路帶到所有用技藝的攻擊與檢定裡，影響面比看起來大。"
        },
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
  },
  {
    "id": "shop-starter.能量池來源",
    "type": "商品",
    "version": "1.0.0",
    "sourceRef": "rules-2.35.txt 第240955行起(劍氣1.htm 混元劍經)、第320244行起(劍氣.htm 劍氣能量池定義)、第138633行起(忍者.htm)、第329625行起(內力.htm 與內力心法.htm)",
    "note": "能量池的來源資源。這個包是 2026-08-17 依使用者決定『A：往上追池子的來源』新增的——在這之前商店只收七個模板化分類的 D 級條目，而那些條目全部只是能量池的**消費者**，沒有一個定義池子。追上來之後，青蓮劍歌總決那類條目才有池子可以扣。",
    "findingNote": "追池子來源的過程中發現了一件更重要的事：能量池的通用上限公式(上限＝關鍵屬性之和)一直都在書上，只是被本專案 2026-08-17 的規則書精簡輪刪掉了(生命.htm)。上一輪據此判斷『書上沒有通用公式、能量池卡在資料不是卡在程式』，那個結論是錯的。完整教訓見 RULES_TRIM.md 與 ARCHITECTURE.md。",
    "secondRoundNote": "2026-08-17 第二輪：劍氣之外再追兩條鏈。查克拉的來源是忍者稱號(第138646行)，內力的來源是內力心法(第329643行)，兩者都在原文裡直接寫著『能量池：X』這一行——**池子來源在書上是一個獨立的欄位，不是特性文字裡的一句話**，所以追起來很快。這一輪也第一次出現『同一個池子有兩個獨立來源』的實例(忍者與寫輪眼都開查克拉)，重複開啟補償+5 因此有了第一個真實的消費端。",
    "idNote": "goodId 的前綴照的是**資源分類**(title./technique./…)，不是這個檔案的名字——忍者是稱號、內力心法是技藝，只是因為它們的用途是開池子才收在這個包裡。第一件 pool.混元劍經.1 是例外，它沿用舊 id 是因為青蓮劍歌總決的 prerequisites.goods 指著它，改 id 會把那條前提打斷。",
    "crossCheckNote": "葵花寶典第一重的原文寫『若已擁有內力則使內力上限提高5點』——那個 5 跟 core/energyPools.js 的 REOPEN_BONUSES 第一項是同一個數字。這是一個獨立條目複述了通則，也是目前『通則抄對了』最強的旁證。因此葵花寶典的能量池效果不需要寫任何 +5，通則自己會算出來。",
    "entries": [
      {
        "name": "混元劍經-第一層：玄通",
        "goodId": "pool.混元劍經.1",
        "lineageId": "pool.混元劍經",
        "rank": "D",
        "status": "上架",
        "category": "體系",
        "resourceType": "技藝",
        "price": "D+600",
        "consumable": false,
        "effects": [
          {
            "kind": "能量池",
            "pool": "劍氣",
            "source": "pool.混元劍經.1"
          },
          {
            "kind": "型態",
            "label": "劍氣",
            "activation": {
              "action": "自由",
              "poolVariable": {
                "name": "劍氣",
                "min": 1,
                "maxFromAttributes": [
                  "敏捷",
                  "感知"
                ],
                "maxRule": "取低"
              }
            },
            "duration": {
              "unit": "輪",
              "rounds": 1
            },
            "modes": [
              {
                "key": "攻",
                "label": "灌注兵刃（近戰攻擊）",
                "grants": [
                  {
                    "kind": "檢定加骰",
                    "amountPerPoint": 1,
                    "scope": "攻擊",
                    "skill": "格鬥"
                  }
                ]
              },
              {
                "key": "防",
                "label": "護體（防御）",
                "grants": [
                  {
                    "kind": "防御",
                    "amountPerPoint": 1
                  }
                ]
              }
            ]
          },
          {
            "kind": "敘事",
            "text": "運劍：你能夠如同正常收起武器一般將武器化作劍丸藏在頭髮或指甲內，最多3把、每把不超過500斤；他人需以DC等同混元劍經層數的感知+偵察檢定才能發現。"
          }
        ],
        "droppedTraits": [
          {
            "trait": "基礎訓練：白刃技能獲得所有與「劍」與「刀」相關的專業，且該專業加值變為3點",
            "reason": "專業"
          },
          {
            "trait": "開啟D級混元劍經技能樹",
            "reason": "技能樹"
          },
          {
            "trait": "劍氣的加值類型「環境加值」，以及「該用法可與劍氣的基礎用法同時使用」的後半",
            "reason": "加值類型。基礎用法(池子頁面上那組隨用隨付的通用用法)整組還沒有轉，所以「可以同時使用」目前沒有第二個東西可以同時"
          }
        ],
        "conversionNote": "這個條目上架的第一個理由是它**開啟劍氣能量池**——它是青蓮劍歌總決那類條目的前提。上限不是這個條目寫的，是能量池通則算的：劍氣的關鍵屬性為敏捷+感知(第320247行)，上限＝兩者之和(生命.htm 能量池段落，該頁已被本專案精簡移出，原文用 git show 2ee0820 取回)。\n\n[2026-08-17 第九輪] 『劍氣（特性）』從 droppedTraits 撿回來，它是**可變量型態的第一個實例**：自由動作、支付1～min(敏捷,感知)點劍氣、獲得等額加值、持續1輪，四個數字全部照抄第240996行。兩個機制都是這一輪補的——(1)`activation.poolVariable` 讓玩家自己決定付幾點，上限由引擎從角色卡算(「敏捷或感知取低」寫成 maxRule:\"取低\")，加值由 `amountPerPoint` 乘開；(2)`modes` 表達書上的「由你自己選擇」，攻與防在啟動的那一瞬間二選一，選完就寫死進進行中的紀錄。**選擇點只存在啟動那一刻，之後查表的時候已經沒有任何條件要判斷**，所以它沒有碰到「條件不可以交給AI決定」那條紅線。 | 『每輪一次』不需要另外做次數限制：持續1輪的型態在同一輪內不可能啟動第二次(forms.js 的『已在進行中』擋住)，跟帝國子民的『每場景一次』同一個道理。 | 攻擊那一側的匹配鍵寫成技能『格鬥』，因為 core/combat/attackTypes.js 裡白刃與肉搏的檢定鍵完全相同(力量+格鬥)，引擎分不出「用刀」與「空手」——那是 CONVERSION_RULES.md 第4節既有的22技能→10技能對映(白刃、肉搏→格鬥)造成的，不是這次新發明的，但它確實讓生效範圍比書上大，所以登記在 balanceNote 裡。",
        "balanceNote": {
          "direction": "放寬範圍",
          "what": "書上的『劍氣』加值只在**近戰白刃**攻擊檢定上生效(拿刀劍時)，這裡會連空手肉搏一起吃到——赤手空拳也能把劍氣灌進拳頭。",
          "why": "匹配鍵只能是六維十技能，而 core/combat/attackTypes.js 裡白刃與肉搏的檢定鍵完全相同(都是力量+格鬥)，引擎沒有任何欄位分得出「手上有沒有武器」。要精確表達就得讓效果的匹配鍵能指定攻擊方式，那會在 CONVERSION_RULES.md 第3a節的兩個維度之外再開第三個。",
          "ifRebalancing": "跟所有掛在『格鬥』上的效果是同一組問題(22技能→10技能把白刃與肉搏併成一項)，要處理就一起處理，不要只改這一件。實務上的影響有限：這個型態每次都要花劍氣，空手打人並不會因此變成主流打法。"
        },
        "higherRanks": [
          {
            "rank": "C",
            "name": "第二層：靈根"
          },
          {
            "rank": "B",
            "name": "第三層以上（劍氣1.htm 尚未清查完）"
          }
        ],
        "sourceRef": "rules-2.35.txt 第240977行(混元劍經第一層：玄通)：價格D+600，能量池：劍氣"
      },
      {
        "name": "忍者-D級：下忍",
        "goodId": "title.忍者.D",
        "lineageId": "title.忍者",
        "rank": "D",
        "status": "上架",
        "category": "體系",
        "resourceType": "稱號",
        "price": "D+1000",
        "consumable": false,
        "prerequisites": {
          "skills": {
            "體魄": 1,
            "潛行": 1,
            "秘識": 1,
            "格鬥": 1,
            "求生": 1
          }
        },
        "originalPrerequisite": "需求運動1，隱藏1，神秘學1，白刃1，肉搏1，求生1(第138637~138638行)",
        "effects": [
          {
            "kind": "能量池",
            "pool": "查克拉",
            "source": "title.忍者.D"
          },
          {
            "kind": "先攻",
            "amount": 3
          }
        ],
        "droppedTraits": [
          {
            "trait": "體能訓練(前半)：你可以使用敏捷代替力量進行近戰攻擊檢定",
            "reason": "CONVERSION_RULES.md 第5節硬性規定：個別條目不可以改寫 core/combat/attackTypes.js 的攻擊公式。已經這樣處理過京都神鳴流與最蔡之人的籃球"
          },
          {
            "trait": "體能訓練(後半)：免疫困難地形，並且在跳躍時視作已進行助跑",
            "reason": "移動速度"
          },
          {
            "trait": "五行遁術：你獲得相當於稱號等級的施法者職能，現在你可以學習和使用通用忍術",
            "reason": "沒有施法者職能系統(整個沒有，法術類貨架幾乎整批卡在這裡，見 CONVERSION_RULES.md 第二部分 D 節)"
          },
          {
            "trait": "技能樹：開啟D級忍者技能樹",
            "reason": "技能樹"
          }
        ],
        "conversionNote": "**這件商品上架的主要理由是它開啟查克拉池**——寫輪眼的洞察眼要扣查克拉，而在此之前查克拉的關鍵屬性雖然登錄好了(耐力+感知)，卻沒有任何資源開得出這個池子。順帶一提『神速：先攻增加3點』是這一條唯一直接轉得出來的特性，它跟精通先攻專長走同一個欄位。忍者在書中是**稱號**不是職能：第12304行的改版紀錄寫『火影忍者血統與忍者稱號合并為稱號』，而 D+1000 也正好對得上稱號/流派模板的 D 級價格(稽核通過)。",
        "skillMappingNote": "書上的六項技能前提用的是原始22技能，對映到十技能之後只剩五項：運動→體魄、隱藏→潛行、神秘學→秘識、求生→求生，而**白刃與肉搏都對映到格鬥**，兩項併成一項(兩者原文都要求1級，取相同值，沒有取捨問題)。這是 CONVERSION_RULES.md 第4節的既有對映表，不是這次新發明的。",
        "higherRanks": [
          {
            "rank": "C",
            "name": "中忍"
          },
          {
            "rank": "B",
            "name": "上忍"
          },
          {
            "rank": "A",
            "name": "影"
          },
          {
            "rank": "AA",
            "name": "忍者之神"
          }
        ],
        "sourceRef": "rules-2.35.txt 第138643行(忍者.htm「D：下忍」)：價格見第138645行 D+1000，能量池見第138646行「能量池：查克拉」，神速見第138652行"
      },
      {
        "name": "內力心法-D級",
        "goodId": "technique.內力心法.D",
        "lineageId": "technique.內力心法",
        "rank": "D",
        "status": "上架",
        "category": "體系",
        "resourceType": "技藝",
        "price": "D+500",
        "consumable": false,
        "effects": [
          {
            "kind": "能量池",
            "pool": "內力",
            "source": "technique.內力心法.D"
          }
        ],
        "droppedTraits": [
          {
            "trait": "初級內力增強（雙特性）：以一個迅捷動作，每消耗1點內力換取1點在生理屬性上的無名加值，持續時間為每點內力/輪，極限為4點屬性，每個屬性上最多2點",
            "reason": "[2026-08-17 第九輪更新] 兩個障礙裡的第一個已經解掉了：可變量型態(activation.poolVariable ＋ grants 的 amountPerPoint)做出來了，見混元劍經的『劍氣』。**剩下的那個才是真的卡住的**：型態的 grants 不收「屬性」——屬性是購買當下寫進角色卡的永久欄位，戰鬥中的DP骰池是直接讀 character.attributes 算的，型態結束時沒有辦法乾淨地收回來(見 effects.js 的 GRANTABLE_EFFECT_KINDS)。要轉這一條，得先讓「屬性」變成一個每次用到才查表的東西，那會動到引擎裡最底層的那張表，不是一個型態容器的問題。另外『持續時間為每點內力/輪』(支付量同時決定輪數)也還沒有做——目前 amountPerPoint 只放大加值，不放大期限，因為除了這一條之外沒有第二個條目需要它"
          },
          {
            "trait": "內功心法：在少陽神功／內丹術／太極心經三者中選一個，一旦選擇不可更改",
            "reason": "『購買當下三選一、選定不可更改』這種排他選擇點，引擎只有 attributePool(自由分配屬性點)一種形狀，撐不起它。另外三個選項本身也各自缺機制：少陽神功與內丹術是『推動陽性/陰性武學』這種引擎判斷不了的情境條件，太極心經的『內力池上限增加10點』則需要一個「能量池上限」效果種類，而目前詞彙表沒有(只有開池，沒有單獨加上限)"
          }
        ],
        "conversionNote": "跟混元劍經同一個定位：**上架的唯一理由是它開內力池**。上限不是這個條目寫的，是能量池通則算的——內力的關鍵屬性為感知+耐力(第329628行)，上限＝兩者之和。書上的內力基礎用法(『進行生理系技能檢定時消耗1點內力，該次檢定獲得2DP增強加值』，第329632行)同樣是可變量/隨用隨付的形狀，跟池子的其他基礎用法一起等同一個機制，沒有寫進效果裡。",
        "classificationNote": "內力心法.htm 這一頁**沒有寫「分類」那一行**(忍者.htm 有寫本質與前提，這頁連那些都沒有)。這裡登錄成技藝是一個推論，依據是它的定價 D+500／C+1000／B+2000／A+4000 逐級對得上 content/templates.js 的技藝模板。標成推論而不是事實，是因為 auditGoodPricing() 會拿 resourceType 去比對模板價——如果將來查到它其實是別的分類，稽核結果會跟著變。",
        "higherRanks": [
          {
            "rank": "C",
            "name": "中級內力增強(C+1000)"
          },
          {
            "rank": "B",
            "name": "高級內力增強(B+2000)"
          },
          {
            "rank": "A",
            "name": "真元力(A+4000)"
          }
        ],
        "sourceRef": "rules-2.35.txt 第329640行(內力心法.htm「D級」)：價格見第329642行 D+500，能量池見第329643行「能量池：你獲得內力能量池」"
      }
    ]
  }
];
