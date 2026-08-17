# 無限恐怖 TRPG 2.35 —— 核心引擎

依照你的規則書(`rules2.35.txt`)實作、並且用書中自帶的範例反向驗證過的「純運算」核心引擎。
不含任何 AI/LLM 呼叫——這是刻意的：AI 只負責讀這個引擎吐出的結果去做敘事判斷，
所有骰子、成功數、生命值轉換、經驗值花費、劇情獎勵倍率全部是這裡的程式碼在算，AI 不做任何算術。

**這個 repo 現在有兩份文件，用途不同：**

- `ARCHITECTURE.md` —— **給接手這個專案的下一個人(或下一個AI，例如未來的 Claude Code)看的**。
  記錄了目前為止所有你做過的關鍵決策、最高原則、每個模組的用途、Phase進度。
  之後要轉移到 GitHub 交給 Claude Code 接手，**請先讓它讀這份文件**，不用再重新解釋一次背景。
- `README.md`(這份) —— 一般說明，怎麼跑測試、目錄結構長什麼樣。

## 目錄結構

```
core/               核心規則引擎(跟哪個資源包/副本包無關，永遠會用到的底層規則)
  schema.js         九維屬性、三大分類技能表、空白人物卡骨架
  dice.js           骰池判定引擎(D10、加骰、機運骰、傳奇屬性/技能附加成功、DC比較)
  health.js         生命值傷勢引擎(完好/衝擊B/嚴重L/惡性A 四階層疊轉換)
  xp.js             建卡/成長XP花費公式(屬性/技能/專業/專長)
  check.js          「組一次判定」的組裝層，串起屬性+技能+專業+傳奇加值，回傳完整結果
  campaignXp.js     跑團後的經驗值發放(固定分配/動態分配兩種公式，含RP精彩度獎勵)
  narration.js      敘事結果分級契約——把骰子margin轉成固定的敘事語氣指令，AI不能自己判斷贏得多漂亮
  deathAndRevival.js 死亡判定與復活費用公式(書中「特殊兌換」機制+使用者決定的簡化版門檻)
  eventLog.js       append-only事件日誌，「角色日誌回顧」功能的資料層
  legendaryAttributes.js 九個屬性的傳奇效果總表(檢定附加成功/防御/傷害上限/先攻/XP紅利/重骰等)
  character.js      戰鬥用角色檔案資料形狀(emptyCombatProfile)，橋接屬性/技能與combat/模組
  derivedStats.js   衍生屬性：生命值=耐力+體積、意志值=決心+沉著+傳奇決心+傳奇沉著、
                     先攻=敏捷+沉著、基礎防御=min(敏捷,感知)、敏感範圍=感知×10米

content/            內容包(plug-and-play)系統，血統/瞳術/副本/契約都走同一套機制
  templates.js      [規則書]「資源模板」的DCBA分級定價表(血統/改造/瞳術/稱號流派/技藝/法術)
  loader.js         內容包結構驗證、跨包撞名偵測、拿模板稽核實際資源條目的價格是否合理
  affection.js      NPC好感度分級表與判定加值(草案，數值待使用者確認)
  packs/
    example-bloodline-wolverine.json   血統包範例(金剛狼)，含真實抓到的定價落差案例
    example-scenario-judge1.json       副本包範例(審判者1，3個劇情節點)
    example-contract-placeholder.json  契約包骨架範例(數值全部留白)
    d-tier-samples-*.json              7個資源分類(血統/改造/瞳術/稱號/流派/技藝/法術)各3個D級
                                        真實條目，直接從rules2.35.txt摘錄轉換(不是自編內容)，
                                        供建卡流程測試時選用，含3組真實發現的定價落差，見ARCHITECTURE.md
  checkIntent.js  [設計] 玩家自然語言行動 -> 檢定參數(屬性/技能/專業)的對照層。放在引擎層而不是
                   前端的理由見檔頭註解：「這個行動該擲什麼」是規則決定，必須有測試蓋住
  narrativeStyle.js [設計] 文筆風格層。跟「規則契約層」刻意分開的第二層系統提示，
                   換文筆永遠碰不到規則，見 LLM_PROVIDERS.md 與檔頭註解
  characterBuilder.js [設計] 建卡組裝層：把四個預算驗證器 + 衍生屬性串成「驗證並組出一張合法角色卡」
  storage/
    sessionStore.js [設計] 存檔層(Cloudflare KV，無binding時退到記憶體版並標記persistent:false)。
                     存檔含 角色卡/事件日誌/最近幾輪敘事/場景，AI的記憶就是從這裡讀的
  turnOptions.js  [規則書授權+設計] 回合選項系統。AI為每個選項挑「屬性+技能」組合
                   (規則書第686~686行明文把這件事指派給ST)，難度只能從五級量表挑，
                   引擎逐項查驗後才採用——技能名不在規則書技能表裡就不算數
  llm/
    providers.js  [設計] LLM供應商註冊表(Gemini/DeepSeek/OpenRouter/Workers AI/任意OpenAI相容中轉)
    client.js     [設計] 統一呼叫層，市面上的API其實只有兩種線路格式，這裡各實作一份
  scenario/
    schema.js       副本包的章節/節點結構驗證(含選填的timeLimitRounds時間預算欄位)
    divergence.js   劇情扭轉度系統——0~4級分級表、獎勵倍率、難度加值、進度條彙總計算
    timeBudget.js   劇情時間預算——主線推進與NPC好感度養成共用同一筆倒數時間池
  contracts/
    schema.js       主神商店奴隸/員工契約包的結構驗證(骨架，數值留白)

core/combat/        戰鬥引擎(Phase 2)，只做「引擎本身」，不含任何怪物/武器實際資料
  turnOrder.js      先攻排序(1d10+先攻值)，同分時沉著->敏捷->玩家/隨機決定
  defense.js        四層防御值組裝(基礎/閃避/洞察/格擋)+盔甲/天生防御+防御附加成功
  attackTypes.js    七種攻擊方式(肉搏/白刃/投擲輕/投擲重/弓箭/槍械/炮)的DP與傷害上限公式表
  attack.js         命中判定核心：目標防御扣減攻擊方DP -> 原始成功數vs防御附加成功數決定命中
                     -> 命中後總成功數(封頂)當傷害
  actionEconomy.js  自由/迅捷/移動/標準/整輪/全回合/反射/專注的額度追蹤與轉化鏈
  damageTypes.js    物理/能量/精神/力場/毒素/墜落六大類傷害的8步驟減免流程(免疫->忽略->硬度->
                     吸收->轉化->抗力/減免->抵消)
  resolveCombatAction.js 把攻擊判定+傷害減免+生命值扣減接成一次完整攻擊行動

functions/api/       Cloudflare Pages Functions範例端點，直接呼叫上面的引擎(見DEPLOYMENT.md)
  turn.js             POST /api/turn —— **遊戲主迴圈**：讀存檔->查驗選項->擲骰->帶記憶敘事->
                       產生下一輪4個選項->寫回存檔
  session.js          /api/session —— 存檔的建立/讀取/刪除/列表
  character.js        /api/character —— GET拿建卡規則常數、POST驗證建卡草稿並組出角色卡
  check.js            POST /api/check —— 只跑一次判定(給params，或只給playerAction讓引擎推導)
  combat/resolve.js   POST /api/combat/resolve —— 跑一次完整攻擊行動
  narrate.js          POST /api/narrate —— 只要判定+敘事、不要選項時用這個
wrangler.toml         Cloudflare Pages設定骨架

public/              前端UI(Cloudflare Pages的靜態資源根目錄，`pages_build_output_dir`指向這裡)
  index.html          單頁UI：建卡畫面/角色HUD/敘事流/行動主控台/骰子動畫/手機抽屜
  app.js              應用層：渲染角色卡、呼叫/api/*、把引擎算出的結果畫成敘事區塊
                       **不做任何規則運算**，數字一律來自後端

test/                198個測試，node內建測試跑者，`node --test` 全跑
  engine.test.js, health.test.js, statistics.test.js, invariants.test.js, integration.test.js
  campaignXp.test.js, narration.test.js, loader.test.js, divergence.test.js
  eventLog.test.js, deathAndRevival.test.js, affection.test.js, timeBudget.test.js, contracts.test.js
  turnOrder.test.js, defense.test.js, attackTypes.test.js, attack.test.js, legendaryAttributes.test.js
  actionEconomy.test.js, damageTypes.test.js, resolveCombatAction.test.js, characterBuilder.test.js
  gemini.test.js

TEST_PLAN.md         規則條文 → 程式碼 → 驗證方式 → 狀態 的對照表，每加新模組就加新的一列
ARCHITECTURE.md       給接手者看的架構總覽與決策紀錄(見上)
RULES_DIGEST.md       規則精要單頁參考：實際數值/公式速查表，不用翻 rules-2.35.txt 全文；
                       文末附「想找模組去哪查」快速索引
CONVERSION_RULES.md   **要把型錄條目變成商店商品的人，先讀這份**。上半部是轉換規則(硬性/判斷
                       兩種強度)，下半部是「目前的簡化規則總表」分門別類，告訴你哪些機制存在、
                       哪些不存在，所以哪些原文特性接得上、哪些一定要丟掉
RULES_TRIM.md         rules-2.35.txt 的精簡紀錄：哪些頁面因為「已經簡化完成」而被刪掉、
                       刪掉的內容現在住在哪、以及**行號怎麼對**(重要，動到行號引用前先讀)
DEPLOYMENT.md         Cloudflare Pages部署步驟(給你自己看的操作手冊，不是給接手AI看的架構文件)
GEMINI_INTEGRATION.md Gemini API金鑰申請與串接步驟(同上)
LLM_PROVIDERS.md      怎麼切換敘事AI(Gemini/DeepSeek/OpenRouter/免金鑰的Workers AI/第三方中轉)
                       與文筆設定檔的用法，含各家端點的查證日期與出處
```

## 已對照規則書驗證的部分

- **生命值傷勢範例**：規則書「生命.htm」裡有一段完整的逐步計算範例(20點生命的角色一路挨打到
  0完好+0B+14L+6A)，`test/health.test.js` 把這個範例完整重現，代表 B/L/A 三種傷害各自的轉換優先順序
  (包含「A傷可以跳過L直接把B轉A」這個容易漏掉的細節)都是對的。
- **傳奇屬性公式**：n = floor((屬性值-1)/5)，用規則書裡屬性11→2點、16→3點的範例驗證。
- **技能附加成功門檻**：5/10/11/13/15，最多5個。
- **XP花費公式**：屬性 目前值×4、技能 (目前等級-1)×2(0→1固定3)、專業固定1、專長 等級×3(輪回隊×6)。
- **附加成功規則**：擲骰成功數為0時附加成功不生效；但技能為0導致的「損失1/2成功數」是獨立的扣減，
  即使擲骰成功數是0也照樣扣(這是規則書原文兩條不同的規則，容易搞混，已分開處理)。
- **跑團後經驗值發放**：固定分配(基礎10 + 逐項RP/表現獎勵)與動態分配(五段式公式)都對照書中範例驗證過，
  固定分配是目前單人遊戲的主要路徑，也是「RP精彩度獎勵」的落地機制。
- **資源模板稽核**：拿真實條目(金剛狼血統)實測 `auditAgainstTemplate`，**實測抓到書中D級定價(500)
  與目前血統模板(600)不符**，證實你提醒過的「舊資源亂寫」現象確實存在，也證明稽核工具真的有用——
  這就是未來把500+頁資源型錄轉成JSON時要用的檢查機制。
- **死亡與復活公式**：規則書「特殊兌換」章節本來就有完整的復活機制，用書中範例(D+1000未花+D+600
  血統+3000屬性=DD+4600)驗證過公式無誤；已依你的決定拿掉「第二次復活需要特定劇情道具」的門檻，
  兩次復活都直接照公式收費，額度用完第三次死亡就是真死。
- **完整攻擊行動接線**：`resolveCombatAction()` 把命中判定、傷害減免、生命值扣減三個先前分開驗證
  過的模組實際串起來，用「空手空防具」的角色骨架(`core/character.js`)就能跑完整套流程，不用等
  Phase 3真實裝備資料。
- **建卡點數預算驗證**：用規則書「羅蘭」完整建卡範例反向驗證，屬性總花費(9點)、技能總花費(20點)、
  免費專業(3個)、專長點數(5點)、語言專長點數(智力×2)全部精確對上範例數字。
- **7個資源分類各3個D級真實條目**：直接從500+頁資源型錄摘錄(不是自編)，用`auditAgainstTemplate`
  稽核，**抓到3組真實的定價落差**：改造類3個D級範例書中原文都是D+1000，模板規定應為500；
  技藝類「太玄鑲華劍譜」書中D+600，模板規定500；法術類「阿尼馬格斯」書中D+1000，模板規定500——
  再次印證你提醒過的「舊資源常常沒跟上模板」，數字保留原始寫法不覆蓋，落差留給稽核工具呈現。

完整的驗證方式(📖書內範例/🧮數學推導/🔧內部一致性)與每一條規則的狀態，請看 `TEST_PLAN.md`。

## 怎麼跑測試

```bash
node --test
```

目前 312 個測試，全部通過。

## `[規則書]` 與 `[設計]` 標記

看程式碼註解時會看到這兩種標記：

- `[規則書]`：直接來自 `rules2.35.txt` 的規則，可以在書裡找到出處。
- `[設計]`：規則書沒有的東西，是這次開發過程中為了滿足你的需求(內容包架構、劇情扭轉度、
  敘事分級契約)新設計的機制，數值(倍率/門檻)都是草案，可以之後再調整，但**調整方式是改表格常數，
  不是讓AI自己決定**。

## 這一版刻意「還沒做」的部分

- 500+ 頁血統/技能樹/道具型錄的批量轉換(資源模板 → JSON 的轉換工具/腳本本身)。
- 戰鬥引擎的命中判定、行動經濟、傷害減免、完整攻擊行動接線都做了(見 `core/combat/`)，但全力
  一擊/衝鋒等進階戰鬥動作、範圍攻擊(AoE)、混合傷害類型、不良狀態(暈眩/流血等)、載具戰鬥都還沒做。
- 建卡走 `content/characterBuilder.js` 的輕量化版本(6屬性/10技能)。原始規則書的完整版曾實作於
  `core/characterCreation.js`，因為只維護單一建卡路徑已移除，內容保留在 git 歷史，見 `ARCHITECTURE.md`。
- Cloudflare Pages 部署骨架、Gemini 敘事整合骨架都做了(`wrangler.toml`/`functions/api/`/
  `content/gemini/`)，**但沒有實際部署過、沒有實際打過Gemini的API**(這個開發環境沒有帳號/金鑰/
  網路)，你拿到後要自己走一次 `DEPLOYMENT.md`/`GEMINI_INTEGRATION.md` 才能確認真的接得上。
- 前端UI已經接上引擎(`public/`)：建卡→存檔→回合迴圈(AI給4個選項+第5種自訂行動)→重整後接續
  都可以跑了，AI也有記憶(最近8輪敘事+完整事件日誌摘要)。仍缺：
  劇本節點推進、戰鬥介面(`/api/combat/resolve` 還沒有任何UI在呼叫)、XP升級介面、
  資源包套用到角色身上、NPC好感度。
  另外UI目前依賴Tailwind Play CDN，官方明講那不是給正式環境用的，見下方說明。

這些都记录在 `ARCHITECTURE.md` 的 Phase 進度表裡，不是遺漏，是刻意分期。

## AI 在這個架構裡的角色(照你的設計)

AI(未來會是 Gemini)只會收到這個引擎算好的結果，例如：
「玩家用 力量8+白刃3 對 DC5 做攻擊判定，骰出3個成功+1個傳奇力量附加成功=4，總成功數4 ≥ DC5？不，判定失敗。」
`core/narration.js` 會把這個結果轉成固定的敘事語氣指令(例如「些微失敗」對應的固定敘事方向)，
AI 要做的事只是把這個結果變成一段有畫面的敘事文字，**不需要、也不被允許自己編數字或自己判斷這次表現有多好**——
這是為了防止玩家用話術引導AI(自稱很厲害但骰子其實慘敗)。
