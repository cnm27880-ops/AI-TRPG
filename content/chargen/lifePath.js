// [設計] 生平問答建卡 —— 玩家回答六個關於「被抓走之前的人生」的問題，
// 引擎在後台把答案換算成屬性與技能。玩家從頭到尾看不到、也不需要碰任何數字。
//
// 為什麼改成這樣（使用者的要求，逐字）：
//   「我想把目前預設的背景故事拿掉，要透過一些更有代入感的方式讓玩家可以逐步建立
//     一個他心目中的角色，故事要豐富(且符合無限恐怖的設定，每個人都是現代普通人)，
//     這樣屬性跟技能都改成後台，透過建卡系統自動幫玩家分配好」
//
// 舊做法的問題：四個身分模板（特戰隊員／武道極限／科技專家／戰地軍醫）＋二選一的背景故事。
// 那是**選職業**，不是建角色——而且職業化的模板跟《無限恐怖》的前提直接衝突：
// 主神空間抓進來的是**現代普通人**，第一部片裡的人不是特種部隊，是上班族、學生、司機。
// 「你原本是特戰隊員」把整個世界觀最重要的那個落差（普通人被丟進地獄）先削掉了一半。
//
// 現在的做法：問六個誰都答得出來的日常問題。玩家答完會得到一個他自己拼出來的人，
// 而那個人的屬性技能是這些答案的**後果**，不是他事先規劃的build。
//
// ---------------------------------------------------------------------------
// 寫這些題目的三條原則（之後要加題目請照這個寫，否則會回到「選職業」）：
//
// 1. **每個選項都必須是普通人的日常**，不可以出現任何「戰鬥訓練」「特殊能力」。
//    力量不是來自健身房課表，是來自搬了三年貨；警覺不是來自軍事訓練，是來自值夜班。
// 2. **每個選項都要能同時往兩個方向解讀**，不能有明顯的「最強選項」。
//    「見死不救」給的是意志與潛行，不是懲罰；「總是笑著擋下來」給的是交涉與意志。
//    玩家應該照「這比較像我」選，而不是照「這比較強」選。
// 3. **story 片段要能直接接成一段通順的第二人稱小傳**，因為它真的會被接起來
//    （見 composeBackground），而且會餵給AI當角色背景。寫的時候就要想像它前後接著別的句子。
// ---------------------------------------------------------------------------

/**
 * @typedef LifePathOption
 * @property {string} id
 * @property {string} label 按鈕上的短句
 * @property {string} detail 按鈕上的第二行，補一點具體畫面，幫玩家代入
 * @property {string} story 會被接進角色小傳的完整句子（第二人稱）
 * @property {object} weights { attributes: {屬性:權重}, skills: {技能:權重} }
 *   權重只是**相對傾向**，不是點數。實際配點由 content/chargen/allocate.js 依預算換算，
 *   所以這裡的數字大小只在同一次建卡內互相比較有意義，不需要跨題目對齊。
 * @property {{name: string, description: string}} [trait] 選填。純敘事型性格特質，
 *   不影響任何數值，只餵給AI當「這個角色容易對什麼有反應」的提示
 *   （見 content/narrativeStyle.js 的分層說明）。
 */

export const LIFE_PATH_QUESTIONS = [
  {
    id: "job",
    title: "被拉進主神空間之前，你靠什麼過日子？",
    subtitle: "這一格決定你的身體與手感——你這幾年到底在重複做什麼動作。",
    options: [
      {
        id: "office",
        label: "辦公室內勤",
        detail: "報表、會議、永遠回不完的信",
        story: "你在一間中型公司做內勤，日子由報表、會議和回不完的信件組成。",
        weights: { attributes: { 智力: 3, 意志: 2 }, skills: { 技藝: 3, 交涉: 2, 偵察: 1 } },
      },
      {
        id: "service",
        label: "餐飲服務業",
        detail: "出餐尖峰、客訴、站到腳腫的十小時",
        story: "你在餐飲業工作，習慣了出餐尖峰的節奏，也習慣了站滿十個小時之後小腿的那種脹痛。",
        weights: { attributes: { 敏捷: 3, 耐力: 2 }, skills: { 求生: 2, 交涉: 3, 體魄: 1 } },
      },
      {
        id: "labor",
        label: "貨運司機／工地",
        detail: "搬、扛、卸，一天跑七趟",
        story: "你靠體力吃飯，這幾年不是在搬東西就是在開車去搬東西的路上。",
        weights: { attributes: { 力量: 4, 耐力: 3 }, skills: { 體魄: 3, 求生: 2, 技藝: 1 } },
      },
      {
        id: "care",
        label: "護理師／照服員",
        detail: "三班輪替，看過太多不會好的人",
        story: "你在醫院輪三班，看過的傷口和不會好的病人，多到你已經不會在餐桌上提起。",
        weights: { attributes: { 智力: 3, 意志: 3 }, skills: { 醫療: 4, 交涉: 2 } },
      },
      {
        id: "student",
        label: "研究生／實習生",
        detail: "念不完的文獻，跑不完的實驗",
        story: "你還在念書，實驗室的燈比你家的燈更常亮著。",
        weights: { attributes: { 智力: 4, 感知: 2 }, skills: { 秘識: 3, 偵察: 2, 技藝: 2 } },
      },
      {
        id: "nightshift",
        label: "夜班保全／倉管",
        detail: "一個人，一整層樓，一整夜",
        story: "你上夜班，一個人守著一整層樓，久到你能從腳步聲判斷來的是誰。",
        weights: { attributes: { 感知: 4, 耐力: 2 }, skills: { 偵察: 3, 潛行: 2, 格鬥: 1 } },
      },
    ],
  },

  {
    id: "origin",
    title: "你是在什麼樣的環境裡長大的？",
    subtitle: "這一格決定你面對陌生環境時的直覺。",
    options: [
      {
        id: "single",
        label: "很早就自己處理事情",
        detail: "家裡只有一個大人，而那個大人很忙",
        story: "家裡只有一個大人，而那個大人很忙，所以你很小就學會自己處理麻煩，也學會不麻煩別人。",
        weights: { attributes: { 意志: 3, 耐力: 2 }, skills: { 求生: 3, 交涉: 1 } },
        trait: { name: "自己來", description: "對「求助」這件事有心理障礙，容易硬撐、容易獨自行動" },
      },
      {
        id: "smalltown",
        label: "小鎮，所有人都認識",
        detail: "你家發生什麼事，隔天整條街都知道",
        story: "你在一個小鎮長大，那裡的人彼此都認識——你家發生什麼事，隔天整條街都會知道。",
        weights: { attributes: { 感知: 3, 意志: 1 }, skills: { 交涉: 3, 偵察: 2 } },
        trait: { name: "看人臉色長大的", description: "對人際氣氛的變化敏感，容易先察覺誰在說謊、誰在隱瞞" },
      },
      {
        id: "moving",
        label: "一直搬家，每年都是新學校",
        detail: "你很會消失在人群裡",
        story: "你的童年是一連串的新學校和新地址，你很早就學會怎麼不引人注意地待在一個房間裡。",
        weights: { attributes: { 敏捷: 3, 感知: 2 }, skills: { 潛行: 3, 交涉: 1, 求生: 1 } },
        trait: { name: "不會生根的人", description: "對「留下來」沒有執念，遇到危險時第一個念頭通常是換地方" },
      },
      {
        id: "absent",
        label: "不缺錢，但家裡沒人",
        detail: "你有自己的房間，和很多獨處的時間",
        story: "你家不缺錢，缺的是人。你有自己的房間、自己的電腦，和大量沒人打擾的時間。",
        weights: { attributes: { 智力: 3, 意志: 2 }, skills: { 技藝: 3, 秘識: 2 } },
        trait: { name: "在螢幕前長大", description: "習慣用工具和資訊解決問題，對直接的人際衝突不太自在" },
      },
    ],
  },

  {
    id: "secret",
    title: "有一件事，你從來沒對任何人說過。",
    subtitle: "它不會讓你變強或變弱，但它會在你以為自己撐得住的時候冒出來。",
    options: [
      {
        id: "bystander",
        label: "你有一次選擇了不去幫忙",
        detail: "那個人後來怎麼了，你一直沒去查",
        story: "有一次你站在能幫上忙的距離，卻沒有動。那個人後來怎麼樣了，你到現在都沒去查。",
        weights: { attributes: { 意志: 2, 感知: 2 }, skills: { 潛行: 2, 偵察: 1 } },
        trait: { name: "沒動的那一次", description: "對「見死不救」「來不及救人」的情節反應特別強烈" },
      },
      {
        id: "theft",
        label: "你拿過不屬於自己的東西",
        detail: "沒有人發現，這件事比拿走的東西更困擾你",
        story: "你拿過不屬於自己的東西，沒有人發現。真正困擾你的一直不是那樣東西，是沒有人發現這件事。",
        weights: { attributes: { 敏捷: 3 }, skills: { 潛行: 3, 技藝: 2 } },
        trait: { name: "手比腦快", description: "在無人看管的地方會下意識評估「拿走會怎樣」" },
      },
      {
        id: "illness",
        label: "你隱瞞了身體出過的問題",
        detail: "報告你自己看得懂，所以你決定不說",
        story: "你身體出過一次狀況，檢查報告你自己看得懂，所以你決定不說。你把藥收在別人不會打開的抽屜裡。",
        weights: { attributes: { 耐力: 3, 意志: 2 }, skills: { 醫療: 3 } },
        trait: { name: "自己知道就好", description: "會隱瞞自己的傷勢與極限，直到瞞不住為止" },
      },
      {
        id: "ranaway",
        label: "你逃開過一個承諾",
        detail: "對方沒有追究，這讓你更難受",
        story: "你答應過一個人一件事，然後你走了。對方沒有追究，這件事因此變得更難放下。",
        weights: { attributes: { 敏捷: 2, 意志: 2 }, skills: { 求生: 2, 交涉: 2 } },
        trait: { name: "欠著的那個承諾", description: "對「承諾」「不要丟下我」這類請求難以拒絕" },
      },
    ],
  },

  {
    id: "brush",
    title: "你這輩子最接近死亡的一次，是什麼時候？",
    subtitle: "身體會記得，而且會用它自己的方式提醒你。",
    options: [
      {
        id: "crash",
        label: "一場車禍",
        detail: "你記得金屬的聲音，和之後很長的復健",
        story: "你出過一場車禍。你記得金屬扭曲的聲音，也記得之後那段很長、很無聊、很痛的復健。",
        weights: { attributes: { 耐力: 4 }, skills: { 體魄: 2, 醫療: 2 } },
      },
      {
        id: "drowning",
        label: "溺水",
        detail: "你知道那種吸不到氣的安靜是什麼樣子",
        story: "你溺過一次水。你知道吸不到氣的那幾秒有多安靜，也知道自己在那種安靜裡沒有放棄。",
        weights: { attributes: { 意志: 4, 耐力: 2 }, skills: { 體魄: 3 } },
      },
      {
        id: "assault",
        label: "被人打過一次，很嚴重的那種",
        detail: "從那之後你進任何空間都會先看出口",
        story: "你被人狠狠打過一次。從那之後，你進任何一個空間都會先確認出口在哪裡。",
        weights: { attributes: { 力量: 2, 感知: 3 }, skills: { 格鬥: 3, 偵察: 1 } },
      },
      {
        id: "witness",
        label: "你看著別人死掉",
        detail: "你什麼都沒受傷，但那天之後有些東西不一樣了",
        story: "死的不是你。你毫髮無傷地站在旁邊，看完了整個過程——那天之後有些東西就不一樣了。",
        weights: { attributes: { 感知: 3, 意志: 3 }, skills: { 偵察: 2, 醫療: 2 } },
      },
    ],
  },

  {
    id: "reputation",
    title: "認識你的人會怎麼形容你？",
    subtitle: "不是你怎麼看自己，是別人怎麼看你。",
    options: [
      {
        id: "reliable",
        label: "「話不多，但交給他就沒問題。」",
        detail: "你很少解釋，你只是把事情做完",
        story: "認識你的人都說你話不多，但事情交給你就不用再問第二次。",
        weights: { attributes: { 意志: 3, 力量: 2 }, skills: { 體魄: 2, 技藝: 1 } },
        trait: { name: "不解釋的人", description: "傾向直接動手處理而不先說明，容易被誤解成冷淡" },
      },
      {
        id: "reader",
        label: "「他很會看場面。」",
        detail: "你總是最早發現氣氛不對的那個",
        story: "大家都說你很會看場面——一桌人裡誰不對勁，你通常是最早發現的那一個。",
        weights: { attributes: { 感知: 4 }, skills: { 偵察: 3, 交涉: 2 } },
        trait: { name: "讀空氣的人", description: "會下意識觀察在場每個人的狀態與關係" },
      },
      {
        id: "stubborn",
        label: "「固執得讓人生氣。」",
        detail: "你認定的事情很難被說服",
        story: "你固執，固執到會讓人生氣。你認定的事情，別人講到累了你也還在原地。",
        weights: { attributes: { 意志: 4, 耐力: 2 }, skills: { 求生: 1, 格鬥: 1 } },
        trait: { name: "說不動", description: "對威脅與話術的抵抗力強，但也容易錯過該退讓的時機" },
      },
      {
        id: "smiler",
        label: "「他總是笑著把事情擋下來。」",
        detail: "你很擅長讓場面不要炸開",
        story: "你習慣笑著把難處理的事情接過來，久了大家都覺得那些事對你來說很輕鬆。",
        weights: { attributes: { 意志: 2, 智力: 2 }, skills: { 交涉: 4, 醫療: 1 } },
        trait: { name: "接下來再說", description: "習慣先安撫場面、先承擔，把自己的狀況放到最後" },
      },
    ],
  },

  {
    id: "instinct",
    title: "有東西朝你衝過來。半秒之內，你會做什麼？",
    subtitle: "這一格決定你在副本裡的第一個動作——不是你想怎麼做，是你身體會怎麼做。",
    options: [
      {
        id: "hide",
        label: "先閃到看不見的地方",
        detail: "先活下來，看清楚再說",
        story: "遇到突發狀況時，你的身體會先找遮蔽物——先活下來，其他的看清楚再說。",
        weights: { attributes: { 敏捷: 4, 感知: 2 }, skills: { 潛行: 4, 偵察: 2 } },
      },
      {
        id: "shield",
        label: "先擋在別人前面",
        detail: "你的手會比腦袋更早伸出去",
        story: "遇到突發狀況時，你的手會比腦袋更早伸出去——擋在別人和那個東西之間。",
        weights: { attributes: { 力量: 3, 耐力: 3 }, skills: { 格鬥: 3, 體魄: 2 } },
      },
      {
        id: "talk",
        label: "先開口，把場面拖住",
        detail: "只要還在講話，就還沒真的開打",
        story: "遇到突發狀況時你會先開口。你相信只要還在講話，事情就還沒有真的無法挽回。",
        weights: { attributes: { 意志: 3, 智力: 2 }, skills: { 交涉: 4, 偵察: 1 } },
      },
      {
        id: "improvise",
        label: "先找手邊能用的東西",
        detail: "你的眼睛會先掃過桌面和牆上",
        story: "遇到突發狀況時，你的眼睛會先掃過桌面、牆面和地上——你在找能用的東西。",
        weights: { attributes: { 智力: 3, 敏捷: 2 }, skills: { 技藝: 4, 求生: 2 } },
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
 * 把玩家的答案換成一組「傾向權重」。
 *
 * @param {Record<string,string>} answers { 題目id: 選項id }
 * @returns {{weights: {attributes: object, skills: object}, options: object[], errors: string[]}}
 *   沒答完不會丟錯，只在 errors 裡列出來——建卡畫面每答一題就會呼叫一次，
 *   「還沒答完」是正常狀態不是錯誤（跟 content/characterBuilder.js 的驗證同一個原則）。
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

  return { weights, options, errors };
}

/**
 * 把選中的 story 片段接成一段角色小傳。
 *
 * 刻意用「作者寫好的句子直接相接」而不是叫AI潤飾：這段文字要在建卡當下**立刻**出現
 * （玩家按完最後一題就要看到自己拼出來的人），呼叫LLM會讓這個瞬間變成等待三十秒的空白。
 * 六個片段都是照「前後會接著別的句子」寫的，接起來讀得通。
 */
export function composeBackground(options) {
  return options.map((o) => o.story).join("");
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
 * 給前端建卡畫面用的題目資料（不含權重）。
 *
 * 權重刻意**不送給前端**：一旦玩家看得到「這個選項給敏捷+3」，這套問答就會立刻退化回
 * 「選數字」——那正是這次要解決的問題。玩家該照「這比較像我」選，不是照「這比較強」選。
 */
export function questionsForClient() {
  return LIFE_PATH_QUESTIONS.map((q) => ({
    id: q.id,
    title: q.title,
    subtitle: q.subtitle,
    options: q.options.map((o) => ({ id: o.id, label: o.label, detail: o.detail })),
  }));
}
