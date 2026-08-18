// [設計] 甦醒 —— 建卡的最後一步，也是主神系統第一次跟玩家說話。
//
// 使用者提供的原文（過場那一段逐字保留，只有分段是這裡切的）：
//   「點下確認的瞬間，滑鼠的觸感消失了。…你猛然睜開眼睛。」
//   「你發現自己躺在金屬網格地板上，周圍是閃爍著警報紅光的休眠艙。…」
//   「【主神系統：檢測到新進輪迴者。基礎意識掃描完畢，已為你喚醒專屬特質。
//     防護罩將在三十秒後解除。你還有最後 5 點自由屬性，請完成最終的肉體重塑。】」
//
// ---------------------------------------------------------------------------
// 為什麼切成「過場」與「房間」兩段
//
// 第二段寫的是休眠艙與 MU-TH-UR 6000，那是異形副本專屬的畫面，而
// content/scenario/examples/alienNostromo.js 的 openingNarration **已經**有一段
// 「低溫休眠艙的蓋子在你上方彈開」——兩段都放進去玩家會被叫醒兩次。
//
// 所以照文意的接縫切：
//   transition —— 從建卡掉進主神空間的過場，跟副本無關，任何副本都適用，放在這裡。
//   arrival    —— 你醒在哪個房間，是副本的事，由 pack.arrivalNarration 提供
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
  "點下確認的瞬間，滑鼠的觸感消失了。周圍的空氣彷彿被瞬間抽乾，強烈的失重感將你向下拉扯。" +
  "你聽不到自己的心跳，只有無盡的冰冷與黑暗灌入腦海……\n\n" +
  "不知過了多久，冰冷堅硬的觸感從背部傳來。你猛然睜開眼睛。";

/**
 * 副本沒有自己的 arrivalNarration 時用的通用房間。
 * 一樣以「被防護罩罩住」收尾，讓主神那段對話接得住。
 */
export const DEFAULT_ARRIVAL =
  "你發現自己躺在一片冰冷的地面上。四周沒有牆，也沒有天花板，只有均勻的白光從每一個方向照過來，" +
  "讓你分不出自己在哪裡、也分不出現在幾點。\n\n" +
  "你正想爬起身，卻發現自己被一層半透明的微光防護罩籠罩著。";

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
 * @param {Array}  input.traits     collectTraits() 的結果（純敘事型特質）
 * @param {object} input.attributes 自動配點後的屬性（重塑要疊在這上面）
 * @param {string} [input.arrivalNarration] 副本自己的房間描述
 * @returns {object} 給前端直接渲染用的資料（不含任何權重與分數）
 */
export function composeAwakening({
  options = [],
  morality,
  traits = [],
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
      header: "主神系統：檢測到新進輪迴者。基礎意識掃描完畢。",
      // 五句引用，順序就是題目順序——讀起來會像主神把你那個晚上重播了一遍。
      echoes: collectEchoes(options),
      virtue: virtue ? { key: virtue.key, description: virtue.description } : null,
      vice: vice ? { key: vice.key, description: vice.description } : null,
      traits: traits.map((t) => ({ name: t.name, description: t.description })),
      core,
      footer:
        `已為你喚醒專屬特質。防護罩將在 ${SHIELD_SECONDS} 秒後解除。` +
        `你還有最後 ${RESHAPE_POINTS} 點自由屬性，請完成最終的肉體重塑。`,
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
