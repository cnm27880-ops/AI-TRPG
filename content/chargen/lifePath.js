// [設計] 建卡問答 —— 玩家回答五個關於「被抓進主神空間之前那個晚上」的問題，
// 引擎在後台把答案換算成一個美德、一個惡德，以及全部的屬性與技能；起始專長另由玩家在答題後選擇。
// 玩家從頭到尾看不到、也不需要碰任何數字。
//
// ---------------------------------------------------------------------------
// [2026-08-18 改版] 六道生平問答（職業/成長環境/秘密/瀕死/風評/直覺）換成現在這五題；
// 答完後的起始專長不再由題目偷偷產生，而是交給玩家從十項技能方向中選三項。
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
//   3. 答完五題後玩家選三項起始專長，讓自動配點之外的可靠能力由玩家自己決定
//   4. 醒來那一幕主神會再給 5 點自由屬性，讓玩家自己補洞（見 content/chargen/reshape.js）
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
 */

export const LIFE_PATH_QUESTIONS = [
  {
    id: "numb",
    title: "凌晨兩點，房間只剩螢幕的光。你怎麼把這一晚拖到天亮？",
    subtitle: "沒人看著時，你留給自己的時間是什麼樣子。",
    options: [
      {
        id: "lie",
        label: "躺在床上，等天亮",
        detail: "讓時間先替你處理明天的事",
        echo: "凌晨兩點，你躺著，等天亮。",
        story: "凌晨兩點，你躺在床上。待辦事項還亮在手機裡，你看了一眼，把螢幕扣在床邊，等時間自己走過去。",
        vices: { 懶惰: 3, 縱欲: 1 },
        virtues: { 節制: 1 },
        weights: { attributes: { 意志: 2, 感知: 1 }, skills: { 潛行: 2, 求生: 2, 偵察: 1 } },
      },
      {
        id: "gorge",
        label: "吃東西，喝到睡著",
        detail: "嘴巴忙著，腦子就能安靜",
        echo: "你一直吃，直到腦子安靜下來。",
        story: "你靠吃東西撐過那些夜晚。嘴巴一直動著，腦子才會安靜一點。你吃到胃痛，躺下去，很快睡著。",
        vices: { 縱欲: 3, 色欲: 1 },
        virtues: { 希望: 1 },
        weights: { attributes: { 耐力: 3, 力量: 1 }, skills: { 體魄: 2, 求生: 2 } },
      },
      {
        id: "flesh",
        label: "出門找人說話",
        detail: "至少那幾個小時有人在旁邊",
        echo: "你走出門，去找一個願意陪你的人。",
        story: "你受不了整夜一個人。你出門去找人，天亮後常常記不起對方的名字，但那幾個小時有人坐在你旁邊。",
        vices: { 色欲: 3, 縱欲: 1 },
        virtues: { 慈愛: 1 },
        weights: { attributes: { 敏捷: 2, 感知: 2 }, skills: { 交涉: 3, 潛行: 1 } },
      },
      {
        id: "hoard",
        label: "反覆查數字，下新訂單",
        detail: "存款和庫存往上走，你才睡得著",
        echo: "你在深夜查著數字，又下了一筆用不到的訂單。",
        story: "你在深夜反覆刷新存款和庫存。房間角落堆滿用不到的東西，只有數字往上跳的那一秒，你才睡得著。",
        vices: { 貪欲: 3, 驕傲: 1, 嫉妒: 1 },
        virtues: { 剛毅: 1, 希望: 1 },
        weights: { attributes: { 智力: 3, 意志: 1 }, skills: { 技藝: 2, 偵察: 2 } },
      },
    ],
  },

  {
    id: "gaze",
    title: "你看見一個不熟的人，突然過上了你想要的生活。你第一個念頭是什麼？",
    subtitle: "你看著別人的生活，也在看自己缺了什麼。",
    options: [
      {
        id: "deserve",
        label: "「憑什麼是他們？」",
        detail: "把同樣的機會交給你，你會做得更好",
        echo: "看著那些人，你想的是：「換成我會做得更好。」",
        story: "你滑過那些人，心裡浮上來的是「憑什麼」。你相信同樣的機會交到手上，自己能做得更好。",
        vices: { 驕傲: 3, 嫉妒: 1 },
        virtues: { 信念: 1 },
        weights: { attributes: { 智力: 2, 意志: 2 }, skills: { 秘識: 2, 交涉: 2 } },
      },
      {
        id: "fall",
        label: "看留言，等他們出醜",
        detail: "你想看那種光鮮亮麗摔下來",
        echo: "你盯著留言，等那個人失去掌聲。",
        story: "你點進留言區，看有沒有人在罵他們。你把那些失去掌聲的畫面想了一遍，手指還在往下滑。",
        vices: { 嫉妒: 3, 憤怒: 1 },
        virtues: { 正義: 1 },
        weights: { attributes: { 感知: 3, 智力: 1 }, skills: { 偵察: 3, 秘識: 1 } },
      },
      {
        id: "burn",
        label: "把手機扣在桌上",
        detail: "你想把那張笑臉從螢幕上砸掉",
        echo: "你看著那張笑臉，手已經握緊。",
        story: "你盯著那些笑臉，手指收緊。你想砸掉螢幕，也想當著他們的面把話說完，後果留到之後再算。",
        vices: { 憤怒: 3, 驕傲: 1 },
        virtues: { 正義: 2 },
        weights: { attributes: { 力量: 3, 耐力: 1 }, skills: { 格鬥: 3, 體魄: 1 } },
      },
      {
        id: "scroll",
        label: "一則一則看完，停不下來",
        detail: "等你抬起頭，天已經亮了",
        echo: "你把那些人一則一則看完，抬頭時天已經亮了。",
        story: "你一則一則往下滑，看完這個人再看下一個。抬起頭時天已經亮了，手機裡留下更多名字，手上沒有多出任何東西。",
        vices: { 色欲: 1, 嫉妒: 1, 貪欲: 2, 懶惰: 1 },
        virtues: { 穩重: 1 },
        weights: { attributes: { 感知: 2, 敏捷: 1 }, skills: { 偵察: 2, 技藝: 2 } },
      },
    ],
  },

  {
    id: "held",
    title: "你已經很久沒有好好休息了。每次快撐不下去時，最後拉住你的，是什麼？",
    subtitle: "那個念頭總在最後一刻出現。",
    options: [
      {
        id: "grit",
        label: "咬緊牙關，撐到天亮",
        detail: "只要還有一口氣，你就不肯停下",
        echo: "拉住你的是你自己。你不肯認輸。",
        story: "拉住你的是不甘心。痛就痛，你咬著牙撐過去，認輸這件事你做不到。",
        virtues: { 剛毅: 3, 信念: 1 },
        vices: { 驕傲: 2 },
        weights: { attributes: { 耐力: 3, 力量: 1 }, skills: { 體魄: 3, 格鬥: 1 } },
      },
      {
        id: "faith",
        label: "相信事情還有一個意思",
        detail: "你說不出理由，卻一直把它留在心裡",
        echo: "拉住你的是一個說不出理由、卻一直相信的念頭。",
        story: "你說不清那是什麼。它沒有名字，也沒有證明。每次你走到最後一步，這個念頭都把你留下來。",
        virtues: { 信念: 3, 希望: 1, 慈愛: 1 },
        vices: { 懶惰: 1 },
        weights: { attributes: { 意志: 3, 智力: 1 }, skills: { 秘識: 3, 醫療: 1 } },
      },
      {
        id: "line",
        label: "守住自己畫下的界線",
        detail: "那條線畫得很清楚，你一次次停在它前面",
        echo: "拉住你的是你畫下的那條線。",
        story: "你替自己畫過一條線。每次有人叫你跨過去，你都聽見了，也都停在原地。",
        virtues: { 節制: 3, 穩重: 1, 慈愛: 1 },
        vices: { 驕傲: 1 },
        weights: { attributes: { 意志: 3, 耐力: 1 }, skills: { 求生: 2, 醫療: 2 } },
      },
      {
        id: "calm",
        label: "先算清楚，再往前走",
        detail: "把情緒收好，活著才有下一步",
        echo: "拉住你的是計算。你算過，活著還有下一步。",
        story: "你把事情算過一遍。爆發解決不了問題，活著才有下一步。你收好情緒，照著算過的路走。",
        virtues: { 穩重: 3, 節制: 1 },
        vices: { 嫉妒: 1, 貪欲: 1 },
        weights: { attributes: { 智力: 3, 感知: 1 }, skills: { 偵察: 2, 技藝: 2 } },
      },
    ],
  },

  {
    id: "stranger",
    title: "城市的警報響了一整晚。你手上的東西只夠自己撐過明天，這時身旁有個陌生人快撐不住了，你會怎麼做？",
    subtitle: "你怎麼對待一個與自己無關的人，會留下你的底色。",
    options: [
      {
        id: "share",
        label: "分出僅剩的一點東西給他",
        detail: "先讓他撐過今天，再想明天",
        echo: "警報響了一整晚，你把手上僅剩的東西分給一個陌生人。",
        story: "城市的警報響了一整晚。你手上只剩夠自己撐過明天的東西，卻還是把其中一半分給那個陌生人。先讓他撐過今天，其他事之後再想。",
        virtues: { 慈愛: 3, 希望: 1 },
        vices: { 縱欲: 1, 色欲: 1 },
        weights: { attributes: { 意志: 2, 感知: 1 }, skills: { 醫療: 3, 交涉: 2 } },
      },
      {
        id: "light",
        label: "拉著他一起找出口",
        detail: "先走一步，之後的路邊走邊看",
        echo: "警報響了一整晚，你拉著陌生人一起找出口。",
        story: "城市的警報響了一整晚。你走過去跟那個人說話，叫他先跟你走。兩個人一起找出口，走到哪裡再決定下一步。",
        virtues: { 希望: 3, 信念: 1 },
        vices: { 懶惰: 1, 驕傲: 1 },
        weights: { attributes: { 意志: 2, 智力: 1 }, skills: { 交涉: 3, 求生: 2 } },
      },
      {
        id: "avenge",
        label: "先去找那個把他逼到絕境的人",
        detail: "先把事情的源頭找出來",
        echo: "警報響了一整晚，你先去找那個把人逼到絕境的人。",
        story: "城市的警報響了一整晚。你看著那個快放棄的陌生人，卻先去找把他逼到這一步的源頭。事情要有個交代，之後才輪到安慰誰。",
        virtues: { 正義: 3, 剛毅: 1 },
        vices: { 憤怒: 2 },
        weights: { attributes: { 力量: 2, 敏捷: 1 }, skills: { 格鬥: 3, 射擊: 2 } },
      },
      {
        id: "preserve",
        label: "假裝沒有看見，先保住自己",
        detail: "你沒有多餘的力氣，也不相信幫了他就會有好結果",
        echo: "警報響了一整晚，你看見了那個陌生人，卻先保住自己。",
        story: "城市的警報響了一整晚。你看見了那個快放棄的陌生人，卻沒有停下來。你先確認手上的東西夠不夠自己撐過明天，因為你不相信幫了他就會有好結果。",
        virtues: { 節制: 2, 穩重: 1 },
        vices: { 憤怒: 2, 懶惰: 1 },
        weights: { attributes: { 意志: 2, 感知: 1 }, skills: { 求生: 3, 潛行: 2 } },
      },
    ],
  },

  {
    id: "confirm",
    title: "電腦螢幕突然變黑。\n一個無法關閉的視窗出現在正中央：【想明白生命的意義嗎？想真正的……活著嗎？】\n游標停在 [YES] 上。你會怎麼做？",
    subtitle: "你還在自己的房間裡。這是你作為普通人的最後一個選擇。",
    options: [
      {
        id: "inspect",
        label: "盯著螢幕，先找出破綻",
        detail: "你想知道這個視窗從哪裡出現",
        echo: "按下去之前，你先查這個視窗從哪裡出現。",
        story: "螢幕黑掉的那一刻，你沒有立刻動。你把視窗看了一遍，查它從哪裡出現，再決定要不要按下去。",
        virtues: { 穩重: 2, 信念: 1 },
        vices: { 嫉妒: 1, 貪欲: 1 },
        weights: { attributes: { 智力: 2, 感知: 2 }, skills: { 偵察: 2, 秘識: 2 } },
      },
      {
        id: "slam",
        label: "抬手，直接按下左鍵",
        detail: "你早就受夠這種日子了",
        echo: "你抬手，直接按下左鍵。",
        story: "你抬手按下左鍵，力氣大得整張桌子都響了一聲。這種日子你早就受夠了，眼前出現什麼都比它好。",
        virtues: { 剛毅: 2, 正義: 1, 希望: 1 },
        vices: { 憤怒: 1, 色欲: 1, 縱欲: 1 },
        weights: { attributes: { 力量: 2, 敏捷: 2 }, skills: { 格鬥: 2, 體魄: 2 } },
      },
      {
        id: "coffee",
        label: "喝完冷掉的咖啡，再按下去",
        detail: "你看了一眼杯底，手沒有停",
        echo: "你喝完冷掉的咖啡，才按下確認。",
        story: "你看了一眼冷掉的咖啡，喝完它，擦了擦嘴，才按下去。",
        virtues: { 節制: 2, 信念: 1 },
        vices: { 懶惰: 1, 縱欲: 1 },
        weights: { attributes: { 意志: 2, 耐力: 2 }, skills: { 求生: 2, 醫療: 2 } },
      },
      {
        id: "reach_out",
        label: "把畫面拍下來，傳給一個你信得過的人",
        detail: "你想先確認這不是只有自己看見的錯覺",
        echo: "你把那個視窗拍下來，試著傳給一個你信得過的人。",
        story: "你拿起手機，把畫面拍下來，傳給一個你信得過的人。訊息沒有送出去，畫面上仍然只剩那個游標。你盯著 [YES] 看了一會兒，最後還是按了下去。",
        virtues: { 慈愛: 2, 希望: 1 },
        vices: { 色欲: 1, 嫉妒: 1 },
        weights: { attributes: { 感知: 2, 意志: 2 }, skills: { 交涉: 2, 偵察: 2 } },
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
