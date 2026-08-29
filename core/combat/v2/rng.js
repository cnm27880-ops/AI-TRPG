// Combat V2 —— 戰鬥專用的可重播亂數來源。
//
// 為什麼不直接用 core/dice.js 的 rollD10()（它走 node:crypto 的 randomInt）：
// Combat V2 是 server-authoritative 而且**有狀態**——同一場戰鬥的骰子要能在測試裡
// 完全鎖定，否則「結算順序正確嗎」「重送 requestId 有沒有重複扣血」這些測試只能
// 靠機率碰運氣。所以每一場戰鬥開場時抽一個 seed 存進戰鬥狀態，之後每次擲骰
// 從 seed + cursor 推導，cursor 跟著戰鬥狀態一起存。
//
// 這**不是**把亂數變成可預測的安全漏洞：seed 不會出現在任何公開 payload
// （見 publicState.js 的白名單），玩家看不到它，也就無從預測下一擲。

/** mulberry32：32-bit 狀態的小型 PRNG，回傳 [0,1)。 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 開一場新戰鬥時抽一個 seed。 */
export function createSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * 依 seed + cursor 建立一個擲骰器。cursor 是「這場戰鬥已經抽過幾個亂數」，
 * 每抽一個就 +1，結束後由呼叫端寫回戰鬥狀態。
 *
 * @param {number} seed
 * @param {number} cursor
 */
export function createRng(seed, cursor = 0) {
  let position = cursor;
  return {
    /** 下一個 [0,1) 亂數。 */
    next() {
      // 每次都從 seed 重新推導到 position，這樣同一個 (seed, cursor) 永遠得到同一個值，
      // 不會因為中間有人多抽了一顆而整條序列位移到對不上。
      const gen = mulberry32(seed ^ Math.imul(position + 1, 0x9e3779b9));
      position += 1;
      gen();
      return gen();
    },
    /** 擲一顆 D10（1~10）。 */
    d10() {
      return Math.floor(this.next() * 10) + 1;
    },
    /** 從陣列裡挑一個（敵人 AI 的隨機取捨、意圖預告都用它）。 */
    pick(list) {
      if (!Array.isArray(list) || list.length === 0) return null;
      return list[Math.min(list.length - 1, Math.floor(this.next() * list.length))];
    },
    /** 目前的 cursor，寫回戰鬥狀態用。 */
    get cursor() {
      return position;
    },
  };
}

/**
 * 把一個 rng 包成 core/dice.js 的 rollDicePool 介面 `(dp, opts) => {successes, rolls, ...}`，
 * 好讓 Combat V2 直接沿用既有的命中判定引擎（core/combat/attack.js）而不必複製規則。
 * 骰池規則完全照 core/dice.js：8+ 算成功、10 加骰、DP<=0 走機運骰。
 */
export function seededRollFn(rng) {
  return function rollDicePool(dp, opts = {}) {
    const rerollThreshold = Math.max(8, Math.min(10, opts.rerollThreshold ?? 10));
    const successThreshold = opts.successThreshold ?? 8;

    if (dp <= 0) {
      const rolls = [];
      let successes = 0;
      let queue = 1;
      while (queue > 0) {
        const r = rng.d10();
        rolls.push(r);
        queue -= 1;
        if (r === 10) successes += 1;
        if (r >= rerollThreshold) queue += 1;
      }
      return { successes, rolls, isFortuneDie: true, fumble: successes === 0 && rolls.includes(1) };
    }

    const rolls = [];
    let successes = 0;
    let queue = dp;
    while (queue > 0) {
      const r = rng.d10();
      rolls.push(r);
      queue -= 1;
      if (r >= successThreshold) successes += 1;
      if (r >= rerollThreshold) queue += 1;
    }
    return { successes, rolls, isFortuneDie: false, fumble: false };
  };
}
