// [設計] 副本節點 -> prompt 指引，以及「節點完成信號」的查驗。
//
// 分界線(跟 content/turnOptions.js 同一套原則)：
//   AI 負責「判斷這個節點的關鍵事件這回合是否已經發生、以及發生的過程跟原設定差多少」，
//   這是敘事判斷，交給AI合理。
//   引擎負責「差多少 -> 獎勵/難度多少」——這是查表，AI一個數字都不碰
//   (見 content/scenario/divergence.js 的固定分級表)。
//
// AI 在回合JSON裡多帶一個頂層欄位 nodeComplete：
//   - 這個節點的關鍵事件還沒發生：nodeComplete 填 null
//   - 已經發生：nodeComplete 填 { "divergenceTier": 0~4 }，分級定義見 divergence.js 檔頭註解
// 這裡只負責「组指引文字」跟「查驗AI回傳的信號合不合法」，不負責查表換算(那是 progress.js 的事)。

import { DIVERGENCE_TIERS } from "./divergence.js";

const MAX_TIER = DIVERGENCE_TIERS.length - 1;

/** 卡關到第幾回合才開始加重語氣、以及加到最重語氣的門檻。 */
const STALL_WARN_AT = 2;
const STALL_URGENT_AT = 4;

/**
 * [2026-09-02 新增] 主動說書人指令 —— 修的是測玩回饋「AI太被動、像冷血公務員」。
 *
 * 為什麼這段掛在 buildNodeGuidance() 的回傳值裡、而不是搬進 narrativeStyle.js 的
 * 靜態文筆層：這段話本身逐字不變、按理說更適合靜態層(整場命中快取)，但它談的是
 * 「這個節點該怎麼收尾」，跟 goalBlock/stallWarning 是同一組決策脈絡——都是「這一回合
 * 該往哪裡推」而不是「怎麼描寫細節」。拆成兩個檔案只會讓下一個維護者難以同時看到
 * 「節點目標」跟「節點目標之後該怎麼收尾」是同一件事的兩半。
 * 代價是它現在跟著 nodeGuidance 一起住進動態層，每回合都重新計費一次
 * (見 docs/PROMPT_CACHE_CONTRACT.md「判斷不出來就當成會變」那一段——這裡不是判斷不出來，
 * 是刻意接受這筆小額重複計費換取维護時的可讀性；固定文字，體積遠小於 history/reference block)。
 * 如果之後帳單分析發現這段真的貴到有感，再搬進 staticBlocks，不影響任何測試斷言。
 */
const ACTIVE_DM_DIRECTIVE = `

【主動說書人：這回合結尾禁止用一句平淡的陳述句收尾】
你是這場遊戲的主持人(DM)，不是被動記錄玩家行動結果的旁白。每一回合的敘事結尾，
必須讓玩家讀完就知道「接下來要繃緊神經還是可以喘口氣、以及手上有哪些路可以走」，
三個元素缺一不可：
1. 感官反饋：周遭環境這一刻正在發生的即時變化(聲音、光線、溫度、氣味、震動)，
   不是重複描述已經寫過的固定場景。
2. 迫近威脅：把目前的威脅/進度轉成一個具體、能倒數的壓迫感(還剩幾步、還能撐多久、
   下一個異常什麼時候會發生)，不要只寫抽象的「氣氛越來越緊張」。
3. 行動鉤子：主動拋出一個衝突、異常現象、或必須馬上決定的情境，把球丟回給玩家，
   不要停在「你觀察著四周」這種沒有推力的收尾。

【行動錨點：結尾用列表給出可以怎麼做，不要讓玩家對著空白發呆】
在敘事正文之後，另起一段用 Markdown 引言或列表，根據這個場景實際可行的手段，
自然地給出 2~3 個具體、彼此屬性/技能傾向不同的行動建議(例如：破解/駭入、警戒/架槍防守、
搜索/蒐集物資——依場景實際情境替換，不要照抄範例字面)，並且一定要附上第 4 個選項：
「自由行動：輸入任意你想嘗試的行動」。這份列表是**建議**，不是限制玩家只能選這幾項，
目的是不讓玩家決策癱瘓，而不是收窄他們能打的字。

【NPC 破冰：讓在場NPC依照他當下的 Motive 主動出手，不要等玩家先開口】
如果 [NPC_ACTIVE_STATE] 標示某個在場NPC目前的 Motive 是 ORIENT_NEWCOMERS，或他行動力
明顯還很充足，這一回合就讓他主動向玩家搭話、講清楚生存原則、或催促玩家儘快做決定，
不要演成他在原地等玩家先問問題。如果他目前是 PRESERVE_SELF 或 GUARD_BOUNDARY，
就要讓他明確表現出抗拒、拒絕配合、或提出強烈反對意見，把人際張力寫出來，
不要把這兩種狀態演成他只是沉默或消極——沉默不是抗拒，抗拒要說出口或做出來。`;

/**
 * 組出「目前活躍節點」的指引文字，附加在回合prompt後面。
 * @param {object|null} node content/scenario/schema.js 的 Node 形狀，null代表主線已跑完
 * @param {number} [stalledRounds] 這個節點已經卡了幾回合都沒結算(見 progress.js 的
 *   getNodeStallRounds())，用來把「不要原地踏步」的提醒隨著卡關時間拉長而加重語氣，
 *   而不是每一回合都用同一句溫和提醒——固定強度的提醒對AI而言很容易被當背景噪音略過。
 */
export function buildNodeGuidance(node, stalledRounds = 0) {
  if (!node) {
    return `【劇情節點】這個副本的主線節點已經全部完成，接下來請自由收尾這場輪迴任務，
不需要再回傳 nodeComplete 欄位。${ACTIVE_DM_DIRECTIVE}`;
  }

  const stallWarning =
    stalledRounds >= STALL_URGENT_AT
      ? `\n\n【卡關警告：已連續 ${stalledRounds} 回合沒有推進】這個節點已經卡了太多回合，絕對不可以再讓場景停留在
同一個僵局裡。這一回合請主動引入新的變化(意外狀況、新的線索、環境改變、敵人動作)來打破僵局，
把敘事往前推，不要再重複描寫玩家嘗試同一件事、或讓玩家停在原地觀望。`
      : stalledRounds >= STALL_WARN_AT
      ? `\n\n【提醒：已經 ${stalledRounds} 回合沒有推進這個節點】不要再寫跟前面回合幾乎一樣的場景與動作，
這一回合的敘事必須讓情境出現實質變化，往這個節點的關鍵事件靠近一步。`
      : "";

  // 玩家在畫面上看得到 playerGoal 這一行字（見 public/app.js 的 updateScenarioHud），
  // 所以AI的敘事**必須跟它對得上**。這是測玩回饋「我不理解現在具體要幹嘛」的直接修法：
  // 光把目標寫在HUD上還不夠，敘事本身如果完全不提，玩家還是接不起來。
  const goalBlock = node.playerGoal
    ? `\n\n【玩家看得到的目標】畫面上正對玩家顯示這一行字：「${node.playerGoal}」。
你的敘事必須跟這個目標對得上——這一回合至少要讓玩家知道「離這個目標還差什麼」或
「下一步往哪個方向走會更接近它」。不可以整段只寫氣氛，讓玩家讀完還是不知道自己該幹嘛。`
    : "";

  if (node.isFinale) {
    // 最終戰節點刻意**不**開放 nodeComplete 信號：這個節點只能透過玩家實際打贏
    // /api/combat/* 的戰鬥來結算(見 functions/api/combat/act.js)，不能靠敘事文字帶過，
    // 否則等於讓AI用嘴巴打贏一場理應由引擎骰子決定勝負的戰鬥。
    return `【劇情節點：${node.title}（最終戰）】
這個節點在原設定裡的走向：
${node.canonSummary}

請把敘事帶向與敵人正面對決、一觸即發的處境，但**不要**描寫戰鬥的過程或結果，
也**不要**在輸出JSON裡加入 nodeComplete 欄位——這個節點只能由玩家實際在戰鬥系統裡
打贏敵人才會結算，不是由你的敘事文字決定勝負。${goalBlock}${stallWarning}${ACTIVE_DM_DIRECTIVE}`;
  }

  return `【劇情節點：${node.title}】
這個節點在原設定裡的走向(給你判斷「扭轉度」的基準，不代表玩家必須複製這個過程，
只是超出這個基準越多，等一下要標的分級就越高)：
${node.canonSummary}

如果這一回合的敘事已經讓這個節點的關鍵事件實際發生(不管玩家是照原設定走、還是走出完全不同的過程)，
請在輸出JSON裡多加一個頂層欄位 "nodeComplete"，並從以下分級裡選一個最貼近的：
${DIVERGENCE_TIERS.map((t) => `  ${t.tier} = ${t.label}`).join("\n")}
格式：{"divergenceTier": 分級數字}

如果這個節點的關鍵事件這回合還沒發生(還在鋪陳、玩家還在猶豫、還沒到關鍵時刻)，
"nodeComplete" 請填 null，不要提早結算。每回合最多只能完成一個節點。${goalBlock}${stallWarning}${ACTIVE_DM_DIRECTIVE}`;
}

/**
 * 查驗AI回傳的 nodeComplete 信號。**AI說了不算**：分級必須是表裡合法的整數，
 * 格式錯誤或超出範圍一律當作「這回合沒有完成」處理，不會讓遊戲卡住，也不會讓AI亂填的
 * 數字直接進到獎勵計算。
 * @param {unknown} raw parsed.data.nodeComplete
 * @returns {{ tier: number } | null}
 */
export function validateNodeComplete(raw) {
  if (raw == null) return null;
  if (typeof raw !== "object") return null;

  const tier = Number(raw.divergenceTier);
  if (!Number.isInteger(tier) || tier < 0 || tier > MAX_TIER) return null;

  return { tier };
}
