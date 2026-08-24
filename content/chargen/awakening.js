// [設計] 甦醒 —— 建卡的最後一步，也是主神系統第一次跟玩家說話。
//
// 固定文案：接受邀請後的第一段過場與主神初次記錄。
// 入口仍然是普通人的電腦與生活；按下 YES 後才進入主神空間。
// 文字只負責描述玩家看見的變化，不替玩家決定恐懼、悔意或其他情緒。
//
// ---------------------------------------------------------------------------
// 為什麼切成「過場」與「房間」兩段
//
// 第二段寫的是副本專屬的房間畫面，而該副本的 openingNarration 也可能描述同一個
// 喚醒節拍——兩段都放進去會讓玩家被叫醒兩次。
//
// 所以照文意的接縫切：
//   transition —— 從建卡掉進主神空間的過場，跟副本無關，任何副本都適用，放在這裡。
//   arrival    —— 你醒在哪個房間，是目前選定副本的事，由 pack.arrivalNarration 提供
//                 （見 content/scenario/schema.js）。沒提供的副本退回 DEFAULT_ARRIVAL。
//
// 兩段都必須以「被防護罩罩住、動不了」收尾，因為底下主神那段對話要有地方站。
// 這是寫新副本的 arrivalNarration 時唯一的硬性要求。
// ---------------------------------------------------------------------------
//
// 掃描結果為什麼要「引用玩家的答案」
//
// 美德/惡德是五題總分制算出來的（見 content/chargen/virtueVice.js），玩家並沒有
// 直接勾選任何一個。這種設計最大的風險是結果讀起來像亂數——「我什麼時候選了色欲？」
// 所以主神唸的不只是結論，還會把玩家五個選擇各引用一句（選項的 echo 欄位），
// 讀完那五句再看到結論，玩家會覺得是自己走到這裡的，而不是被系統丟了一個標籤。
//
// 這一段刻意**不呼叫LLM**，理由跟 lifePath.js 的 composeBackground() 同一條：
// 這是玩家第一次看見自己那五題的結果被系統認證，那個瞬間不能變成等三十秒的空白。

import { collectEchoes } from "./lifePath.js";
import { getVirtue, getVice, composeCore } from "./virtueVice.js";
import { RESHAPE_POINTS, RESHAPE_ATTRIBUTE_CAP, reshapeStepCosts, suggestReshape } from "./reshape.js";

/** 從建卡掉進主神空間的過場。跟副本無關，所有副本共用。 */
export const AWAKENING_TRANSITION =
  "你按下 [YES]。游標停住，視窗沒有關閉。" +
  "桌面的圖示、工作列上的時間、房間裡那盞燈，一樣一樣從螢幕上退開。" +
  "你伸手去碰鍵盤，指腹沒有碰到任何東西。\n\n" +
  "下一次呼吸時，腳下已經沒有地板。";

/**
 * 副本沒有自己的 arrivalNarration 時用的通用房間。
 * 一樣以「被防護罩罩住」收尾，讓主神那段對話接得住。
 */
export const DEFAULT_ARRIVAL =
  "你躺在白色平台上。平台沒有接縫，邊緣落進遠處的黑暗。" +
  "頭頂懸著一顆巨大的光球，白光從四面落下，照不出它的表面，也照不到更遠的地方。\n\n" +
  "你試著坐起來，透明的防護罩扣在身上。身體還能呼吸，手腳卻沒有辦法離開原地。";

/**
 * 防護罩解除的秒數。**只是台詞，不是真的倒數。**
 * 真的計時會讓玩家在第一次接觸配點介面時被逼著亂按——那是這一幕唯一要玩家動腦的地方，
 * 用一個假的壓迫感把它毀掉不划算。要改成真倒數的話這裡是唯一的來源。
 */
export const SHIELD_SECONDS = 30;

/**
 * 組出甦醒那一幕的全部內容。
 *
 * @param {object} input
 * @param {Array}  input.options    collectLifePath() 選中的選項（要有 echo）
 * @param {object} input.morality   resolveMorality() 的結果
 * @param {Array}  input.startingSpecialties 伺服器已驗證的起始專長物件
 * @param {object} input.attributes 自動配點後的屬性（重塑要疊在這上面）
 * @param {string} [input.arrivalNarration] 副本自己的房間描述
 * @returns {object} 給前端直接渲染用的資料（不含任何權重與分數）
 */
export function composeAwakening({
  options = [],
  morality,
  startingSpecialties = [],
  attributes = {},
  arrivalNarration,
} = {}) {
  const virtue = getVirtue(morality?.virtue);
  const vice = getVice(morality?.vice);
  const core = morality ? composeCore(morality.virtue, morality.vice) : null;

  return {
    transition: AWAKENING_TRANSITION,
    arrival: typeof arrivalNarration === "string" && arrivalNarration.trim()
      ? arrivalNarration
      : DEFAULT_ARRIVAL,
    shieldSeconds: SHIELD_SECONDS,
    system: {
      header: "主神系統：確認新進輪迴者。開始讀取入場記錄。",
      // 五句引用，順序就是題目順序——讀起來會像主神把你那個晚上重播了一遍。
      echoes: collectEchoes(options),
      virtue: virtue ? { key: virtue.key, description: virtue.description } : null,
      vice: vice ? { key: vice.key, description: vice.description } : null,
      startingSpecialties: startingSpecialties.map((specialty) => ({
        id: specialty.id,
        name: specialty.name,
        skill: specialty.skill,
        description: specialty.description,
        bonus: 1,
      })),
      core,
      footer:
        `入場記錄完成。已登錄 ${startingSpecialties.length} 項起始專長。` +
        `剩餘 ${RESHAPE_POINTS} 點自由屬性，請完成最後的肉體重塑。`,
    },
    reshape: {
      points: RESHAPE_POINTS,
      cap: RESHAPE_ATTRIBUTE_CAP,
      base: { ...attributes },
      stepCosts: reshapeStepCosts(attributes),
      suggestion: suggestReshape(attributes),
    },
  };
}
