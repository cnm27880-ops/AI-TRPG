// [設計] 建卡問答 —— 玩家回答五個關於「被抓進主神空間之前那個晚上」的問題，
// 引擎在後台把答案換算成一個美德、一個惡德、一個特性，以及全部的屬性與技能。
// 玩家從頭到尾看不到、也不需要碰任何數字。
//
// ---------------------------------------------------------------------------
// [2026-08-18 改版] 六道生平問答（職業/成長環境/秘密/瀕死/風評/直覺）換成現在這五題。
//
// 使用者的要求(逐字)：
//   「請協助我將建卡問題替換成七美德/七惡德/角色特性的決定，並根據選項自動分配大部分基礎點」
//   「七美德/七惡德是本來就在規則書裡的，我打算拿來化用，讓人物建卡更有代入感」
//   「所以應該是用五道題目綜合判斷七美德/七惡德，有點類似心理測驗」
//
// 舊的六題問的是「你這幾年在做什麼」，答案很具體，技能權重也扎實，但它測的是**履歷**。
// 現在這五題問的是「撐不下去的那個晚上你是什麼樣子」，測的是**這個人是誰**——
// 而《無限恐怖》抓進去的本來就不是履歷，是人。
//
// 換過來的代價很誠實：技能的指向變弱了。舊版「貨運司機」直接推出力量與體魄，
// 新版「你怎麼麻醉自己」只能給出比較間接的傾向。三個地方在補這件事：
//   1. 每個選項照樣帶 attributes/skills 權重（見下方每一筆的 weights）
//   2. allocate.js 的 seedBreadth（保底四個技能≥1）變得比以前更關鍵，絕對不能動
//   3. 醒來那一幕主神會再給 5 點自由屬性，讓玩家自己補洞（見 content/chargen/reshape.js）
//
// 美德/惡德**不是一題對一個**，是五題總分制，理由與計分規則寫在
// content/chargen/virtueVice.js 的檔頭，改權重之前請先讀那一段。
// ---------------------------------------------------------------------------
//
// 寫這些題目的四條原則（之後要加題目請照這個寫）：
//
// 1. **每個選項都必須是普通人的日常**，不可以出現任何「戰鬥訓練」「特殊能力」。
//    《無限恐怖》抓進去的是現代普通人——上班族、學生、司機，不是特種部隊。
// 2. **每個選項都要能同時往兩個方向解讀**，不能有明顯的「最強選項」。
//    「躺著什麼都不做」給的不只是惡德，還有一分【節制】——你至少沒有去傷害誰。
//    玩家應該照「這比較像我」選，而不是照「這比較強」選。這條有測試在管。
// 3. **story 片段要能直接接成一段通順的第二人稱小傳**，因為它真的會被接起來
//    （見 composeBackground），而且會餵給AI當角色背景。
// 4. **echo 是主神掃描時要唸出來的那一句**，必須短、必須是**引用玩家的選擇**而不是評價他。
//    玩家沒有直接選美德惡德，所以掃描結果一定要說得出理由，否則會像亂數。
// 5. **玩家看得到的文字裡不可以出現十四個美德惡德的名字**（title/subtitle/label/detail）。
//    有測試在管，但這條不只是為了過測試——「希望」「正義」這種字在中文裡是日常詞彙，
//    很容易不小心寫進去，而寫進去會**誤導**：原本 gaze/fall 的說明寫的是
//    「你甚至希望看到他們跌落泥沼」，那個選項給的其實是【嫉妒】，字面卻在暗示【希望】。
//    玩家照字面推，只會推到錯的地方。已改成「你甚至想看到」。
// ---------------------------------------------------------------------------

import { resolveMorality } from "./virtueVice.js";

/**
 * @typedef LifePathOption
 * @property {string} id
 * @property {string} label 按鈕上的短句
 * @property {string} detail 按鈕上的第二行，補一點具體畫面，幫玩家代入
 * @property {string} echo 主神掃描時引用的那一句（第二人稱，一句話講完）
 * @property {string} story 會被接進角色小傳的完整句子（第二人稱）
 * @property {Record<string, number>} virtues 七美德加分表（主權重3、次權重1~2）
 * @property {Record<string, number>} vices 七惡德加分表
 * @property {object} weights { attributes: {屬性:權重}, skills: {技能:權重} }
 *   權重只是**相對傾向**，不是點數。實際配點由 content/chargen/allocate.js 依預算換算。
 * @property {{name: string, description: string}} [trait] 選填。純敘事型性格特質，
 *   不影響任何數值，只餵給AI當「這個角色容易對什麼有反應」的提示。
 */

export const LIFE_PATH_QUESTIONS = [
  {
    id: "numb",
    title: "凌晨兩點的房間，空氣沉悶得讓人窒息。面對這看不到盡頭的生活，當你獨自一人時，你最常怎樣麻醉自己？",
    subtitle: "沒有人看著的時候，你對自己做的事最誠實。",
    options: [
      {
        id: "lie",
        label: "躺在床上，什麼都不做",
        detail: "讓時間自己過去，逃避明天的到來",
        echo: "凌晨兩點，你選擇躺著不動，讓明天自己過來。",
        story: "凌晨兩點，你躺在床上，什麼都沒做。你知道還有事情沒開始，也知道現在爬起來還來得及，但你就是讓時間自己過去了。",
        vices: { 懶惰: 3, 縱欲: 1 },
        virtues: { 節制: 1 },
        weights: { attributes: { 意志: 2, 感知: 1 }, skills: { 潛行: 2, 求生: 2, 偵察: 1 } },
      },
      {
        id: "gorge",
        label: "吃到撐，喝到斷片",
        detail: "嘴巴一直動著的時候，腦子就能停下來",
        echo: "你用塞滿自己的方式，讓腦子停下來。",
        story: "你靠吃東西撐過那些夜晚。不是餓，是嘴巴一直動著的時候腦子就能安靜一點——你吃到胃痛，然後才睡得著。",
        vices: { 縱欲: 3, 色欲: 1 },
        virtues: { 希望: 1 },
        weights: { attributes: { 耐力: 3, 力量: 1 }, skills: { 體魄: 2, 求生: 2 } },
      },
      {
        id: "flesh",
        label: "找人，或者找一個身體",
        detail: "至少那幾個小時裡，你不是一個人",
        echo: "你需要有人靠近，哪怕那個人是誰其實沒那麼重要。",
        story: "你受不了整夜一個人。你會出門去找人，天亮之後那些人叫什麼名字你多半記不住，但那幾個小時裡你確實不是一個人。",
        vices: { 色欲: 3, 縱欲: 1 },
        virtues: { 慈愛: 1 },
        weights: { attributes: { 敏捷: 2, 感知: 2 }, skills: { 交涉: 3, 潛行: 1 } },
      },
      {
        id: "hoard",
        label: "想賺更多，想囤更多",
        detail: "哪怕那些東西你根本不需要",
        echo: "你在深夜算著自己還差多少，然後又下了一筆單。",
        story: "你在深夜反覆刷新那幾個數字：存款、庫存、還差多少。房間角落堆滿你用不到的東西，但只有數字往上跳的那一秒你覺得安全。",
        vices: { 貪欲: 3, 驕傲: 1, 嫉妒: 1 },
        virtues: { 剛毅: 1, 希望: 1 },
        weights: { attributes: { 智力: 3, 意志: 1 }, skills: { 技藝: 2, 偵察: 2 } },
      },
    ],
  },

  {
    id: "gaze",
    title: "你滑著手機，螢幕裡閃爍著那些光鮮亮麗、高高在上的人們。看著他們，你心底最深處湧上的情緒是？",
    subtitle: "你對別人的反應，會告訴你自己最在意什麼。",
    options: [
      {
        id: "deserve",
        label: "「憑什麼是他們？」",
        detail: "如果你有同樣的運氣，你絕對做得比他們更好",
        echo: "看著那些人，你想的是「換成我會做得更好」。",
        story: "你滑過那些人，心裡浮上來的是「憑什麼」——你很確定，如果把他們的運氣給你，你會做得比他們好得多。",
        vices: { 驕傲: 3, 嫉妒: 1 },
        virtues: { 信念: 1 },
        weights: { attributes: { 智力: 2, 意志: 2 }, skills: { 秘識: 2, 交涉: 2 } },
      },
      {
        id: "fall",
        label: "「為什麼他們能擁有這一切？」",
        detail: "你甚至想看到他們失去一切，跌落泥沼",
        echo: "看著那些人，你希望他們跌下來。",
        story: "你不只是羨慕。你會點進去看留言，看有沒有人在罵他們，然後在心裡想像他們失去一切的樣子——你知道這很難看，但你停不下來。",
        vices: { 嫉妒: 3, 憤怒: 1 },
        virtues: { 正義: 1 },
        weights: { attributes: { 感知: 3, 智力: 1 }, skills: { 偵察: 3, 秘識: 1 } },
      },
      {
        id: "burn",
        label: "單純的怒火",
        detail: "你想砸碎那些虛偽的笑臉，哪怕會引火燒身",
        echo: "看著那些人，你只想砸碎那些笑臉。",
        story: "你看著那些笑臉只覺得噁心。你想砸東西，想當著他們的面把話說完，哪怕結果是你自己被燒個精光。",
        vices: { 憤怒: 3, 驕傲: 1 },
        virtues: { 正義: 2 },
        weights: { attributes: { 力量: 3, 耐力: 1 }, skills: { 格鬥: 3, 體魄: 1 } },
      },
      {
        id: "scroll",
        label: "一則一則看完，一個都沒漏",
        detail: "等你抬起頭，窗外已經亮了",
        echo: "你把那些人一則一則看完，抬頭時天已經亮了。",
        story: "你會一則一則往下滑，一個都不漏，看完這個人再看下一個。等你抬起頭，窗外已經亮了，而你什麼也沒得到。",
        vices: { 色欲: 1, 嫉妒: 1, 貪欲: 2, 懶惰: 1 },
        virtues: { 穩重: 1 },
        weights: { attributes: { 感知: 2, 敏捷: 1 }, skills: { 偵察: 2, 技藝: 2 } },
      },
    ],
  },

  {
    id: "held",
    title: "但你終究沒有徹底崩潰。在無數個瀕臨極限、想要一了百了的夜晚，是什麼硬生生拉住了你？",
    subtitle: "撐住你的那個東西，就是你身上最硬的地方。",
    options: [
      {
        id: "grit",
        label: "咬緊牙關的死撐",
        detail: "痛苦算什麼，只要還有一口氣，你就絕不認輸",
        echo: "拉住你的是你自己——你只是不肯認輸。",
        story: "拉住你的不是什麼漂亮的理由，就是不甘心。痛就痛，你咬著牙撐過去，因為認輸這件事你做不到。",
        virtues: { 剛毅: 3, 信念: 1 },
        vices: { 驕傲: 2 },
        weights: { attributes: { 耐力: 3, 力量: 1 }, skills: { 體魄: 3, 格鬥: 1 } },
      },
      {
        id: "faith",
        label: "心底某種無法被證明的信仰",
        detail: "即使世界荒謬，你堅信萬物仍有其意義",
        echo: "拉住你的是一個你證明不了、但就是相信的東西。",
        story: "你說不清那是什麼——不是宗教，也不是道理。你就是相信這一切總有個意思，而那個說不清的東西每次都把你留下來。",
        virtues: { 信念: 3, 希望: 1, 慈愛: 1 },
        vices: { 懶惰: 1 },
        weights: { attributes: { 意志: 3, 智力: 1 }, skills: { 秘識: 3, 醫療: 1 } },
      },
      {
        id: "line",
        label: "絕對的克制與自律",
        detail: "即使深淵在誘惑，你也絕不跨越自己畫下的底線",
        echo: "拉住你的是你自己畫下的那條線。",
        story: "你替自己畫過一條線，很清楚，也很硬。深淵一直在旁邊叫你，你每次都聽見了，而你每次都沒有過去。",
        virtues: { 節制: 3, 穩重: 1, 慈愛: 1 },
        vices: { 驕傲: 1 },
        weights: { attributes: { 意志: 3, 耐力: 1 }, skills: { 求生: 2, 醫療: 2 } },
      },
      {
        id: "calm",
        label: "理智與冷靜",
        detail: "與其盲目爆發，不如步步為營，活下去才有翻盤的機會",
        echo: "拉住你的是理智——你算過，活著比較划算。",
        story: "你不是撐不下去，你是算過。爆發解決不了任何事，活著才有翻盤的機會，所以你把情緒收好，一步一步走。",
        virtues: { 穩重: 3, 節制: 1 },
        vices: { 嫉妒: 1, 貪欲: 1 },
        weights: { attributes: { 智力: 3, 感知: 1 }, skills: { 偵察: 2, 技藝: 2 } },
      },
    ],
  },

  {
    id: "stranger",
    title: "想像一下，如果明天就是世界末日。而在你面前，有一個和你一樣陷入絕境、即將放棄的陌生人，你會？",
    subtitle: "你對一個素不相識的人做的事，最接近你真正的樣子。",
    options: [
      {
        id: "share",
        label: "分出僅剩的一點資源給他",
        detail: "在末日裡，能救一個是一個",
        echo: "末日面前，你會把僅剩的東西分給一個陌生人。",
        story: "如果明天就是末日，而旁邊有個要放棄的陌生人，你會把手上僅剩的東西分他一半。能救一個是一個，你沒有想那麼多。",
        virtues: { 慈愛: 3, 希望: 1 },
        vices: { 縱欲: 1, 色欲: 1 },
        weights: { attributes: { 意志: 2, 感知: 1 }, skills: { 醫療: 3, 交涉: 2 } },
      },
      {
        id: "light",
        label: "拉著他一起尋找活下去的微光",
        detail: "告訴他別放棄，哪怕你自己也沒有把握",
        echo: "末日面前，你會拉著陌生人一起去找那一點微光。",
        story: "如果明天就是末日，你會走過去跟那個人說話。你會告訴他還沒結束，然後拉著他一起去找那點微光——即使你自己也沒什麼把握。",
        virtues: { 希望: 3, 信念: 1 },
        vices: { 懶惰: 1, 驕傲: 1 },
        weights: { attributes: { 意志: 2, 智力: 1 }, skills: { 交涉: 3, 求生: 2 } },
      },
      {
        id: "avenge",
        label: "先拿起武器，去宰了那個惡人",
        detail: "如果他是被惡人逼入絕境的",
        echo: "末日面前，你會先去解決那個把人逼到絕境的傢伙。",
        story: "如果明天就是末日，而那個人是被誰逼到這一步的，你不會先安慰他。你會先去找那個人，然後把事情了結。",
        virtues: { 正義: 3, 剛毅: 1 },
        vices: { 憤怒: 2 },
        weights: { attributes: { 力量: 2, 敏捷: 1 }, skills: { 格鬥: 3, 射擊: 2 } },
      },
    ],
  },

  {
    id: "confirm",
    title: "電腦螢幕突然一黑，跳出一個無法關閉的對話框：【想明白生命的意義嗎？想真正的……活著嗎？】。在游標移向 [YES] 的那一瞬間，你的動作是？",
    subtitle: "這是你身為普通人的最後一個動作。",
    options: [
      {
        id: "inspect",
        label: "死死盯著螢幕，找出破綻",
        detail: "這惡作劇是從哪來的？你想先弄懂",
        echo: "按下去之前，你先想找出這是誰的把戲。",
        story: "螢幕黑掉的那一刻你沒有立刻動。你把整個視窗看了一遍，想找出這是誰的惡作劇——你一向是先弄懂再說的那種人。",
        virtues: { 穩重: 2, 信念: 1 },
        vices: { 嫉妒: 1, 貪欲: 1 },
        trait: {
          name: "多疑的智者",
          description: "凡事先找破綻，對「太順利」的狀況特別警覺，但也容易錯過該當機立斷的時機",
        },
        weights: { attributes: { 智力: 2, 感知: 2 }, skills: { 偵察: 2, 秘識: 2 } },
      },
      {
        id: "slam",
        label: "毫不猶豫地重重砸下左鍵",
        detail: "去他媽的，你早就受夠這一切了",
        echo: "你沒有猶豫，直接把左鍵砸了下去。",
        story: "你沒有猶豫。手指落下去的力氣大得整張桌子都響了一聲——反正這種日子你早就受夠了，是什麼都好過現在。",
        virtues: { 剛毅: 2, 正義: 1, 希望: 1 },
        vices: { 憤怒: 1, 色欲: 1, 縱欲: 1 },
        trait: {
          name: "亡命之徒",
          description: "沒有什麼可以失去，因此願意承受別人不敢承受的風險，也不太考慮後果",
        },
        weights: { attributes: { 力量: 2, 敏捷: 2 }, skills: { 格鬥: 2, 體魄: 2 } },
      },
      {
        id: "coffee",
        label: "把冷掉的咖啡喝完，平靜按下",
        detail: "帶著自嘲的冷笑",
        echo: "你把冷掉的咖啡喝完，才平靜地按下確認。",
        story: "你笑了一下，那種笑自己的笑。然後你把手邊那杯早就冷掉的咖啡喝完，擦了擦嘴，才平靜地按下去。",
        virtues: { 節制: 2, 信念: 1 },
        vices: { 懶惰: 1, 縱欲: 1 },
        trait: {
          name: "泰山崩於前",
          description: "情緒起伏極小，在混亂中反而更清楚，但也容易讓人覺得你不在乎",
        },
        weights: { attributes: { 意志: 2, 耐力: 2 }, skills: { 求生: 2, 醫療: 2 } },
      },
    ],
  },
];

export const LIFE_PATH_QUESTION_IDS = LIFE_PATH_QUESTIONS.map((q) => q.id);

/** 查一個題目。查不到回 null，呼叫端自己決定要不要當成錯誤。 */
export function getQuestion(questionId) {
  return LIFE_PATH_QUESTIONS.find((q) => q.id === questionId) ?? null;
}

/** 查一個選項（同時驗證它真的屬於那一題）。 */
export function getOption(questionId, optionId) {
  return getQuestion(questionId)?.options.find((o) => o.id === optionId) ?? null;
}

/**
 * 把玩家的答案換成一組「傾向權重」＋美德惡德的判定結果。
 *
 * @param {Record<string,string>} answers { 題目id: 選項id }
 * @returns {{weights: object, options: object[], morality: object|null, errors: string[]}}
 *   沒答完不會丟錯，只在 errors 裡列出來——建卡畫面每答一題就會呼叫一次，
 *   「還沒答完」是正常狀態不是錯誤。morality 只在**全部答完**時才算，
 *   因為總分制在答到一半時算出來的贏家沒有意義，只會誤導。
 */
export function collectLifePath(answers = {}) {
  const weights = { attributes: {}, skills: {} };
  const options = [];
  const errors = [];

  for (const question of LIFE_PATH_QUESTIONS) {
    const chosenId = answers[question.id];
    if (!chosenId) {
      errors.push(`還沒回答：${question.title}`);
      continue;
    }
    const option = getOption(question.id, chosenId);
    if (!option) {
      errors.push(`「${question.title}」沒有這個選項（${chosenId}）`);
      continue;
    }
    options.push({ questionId: question.id, ...option });
    for (const [attr, w] of Object.entries(option.weights.attributes ?? {})) {
      weights.attributes[attr] = (weights.attributes[attr] ?? 0) + w;
    }
    for (const [skill, w] of Object.entries(option.weights.skills ?? {})) {
      weights.skills[skill] = (weights.skills[skill] ?? 0) + w;
    }
  }

  const morality =
    errors.length === 0 ? resolveMorality(options, LIFE_PATH_QUESTION_IDS) : null;

  return { weights, options, morality, errors };
}

/**
 * 把選中的 story 片段接成一段角色小傳。
 *
 * 刻意用「作者寫好的句子直接相接」而不是叫AI潤飾：這段文字要在建卡當下**立刻**出現
 * （玩家按完最後一題就要看到自己拼出來的人），呼叫LLM會讓這個瞬間變成等待三十秒的空白。
 * 五個片段都是照「前後會接著別的句子」寫的，接起來讀得通。
 */
export function composeBackground(options) {
  return options.map((o) => o.story).join("");
}

/** 主神掃描要唸的那幾句（見 content/chargen/awakening.js）。 */
export function collectEchoes(options) {
  return options.map((o) => o.echo).filter(Boolean);
}

/** 取出這些選項帶的性格特質，轉成 content/characterBuilder.js 認得的純敘事型專長形狀。 */
export function collectTraits(options) {
  return options
    .filter((o) => o.trait)
    .map((o) => ({
      id: `lifepath-${o.questionId}-${o.id}`,
      name: o.trait.name,
      description: o.trait.description,
      effect: { type: "narrative" },
    }));
}

/**
 * 給前端建卡畫面用的題目資料（不含權重、不含美德惡德分表、不含 echo/story）。
 *
 * 這些東西刻意**不送給前端**：一旦玩家看得到「這個選項給敏捷+3」或「這題偏懶惰」，
 * 整套問答會立刻退化回「選數字」——那正是這次要解決的問題。而且美德惡德是總分制，
 * 看得到分表的玩家可以直接反推出想要的結果，掃描那一幕的意義就沒了。
 * 玩家該照「這比較像我」選，不是照「這比較強」選。
 */
export function questionsForClient() {
  return LIFE_PATH_QUESTIONS.map((q) => ({
    id: q.id,
    title: q.title,
    subtitle: q.subtitle,
    options: q.options.map((o) => ({ id: o.id, label: o.label, detail: o.detail })),
  }));
}
