// [設計] 「角色還能不能繼續行動」的判定層 —— 把 core/health.js 的傷勢狀態
// 接到實際的遊戲流程（/api/turn、/api/combat/*）上。
//
// 這個檔案存在的理由（2026-08-16 排查發現）：
//   core/health.js 的 evaluateStatus() 一直都會算出 dead / unconscious / worsening 三個旗標，
//   core/deathAndRevival.js 也早就有完整的復活規則與測試，但這兩者在 functions/ 與 content/
//   底下**一次都沒有被引用過**。實際效果是：玩家在戰鬥中被打到 intact 歸零、
//   甚至判定為 dead，戰鬥面板照樣結束、`endCombat()` 照樣送一句摘要回主迴圈，
//   然後玩家用一張已經死掉的角色卡繼續玩下去，沒有任何地方提過這件事。
//   那正是這個專案最不能接受的那種bug：規則層算對了，但結果沒有生效，
//   而且畫面看起來一切正常。
//
// 分工（跟專案其他地方一致）：
//   core/health.js          算「傷勢狀態是什麼」——純規則，不知道有遊戲流程這回事
//   core/deathAndRevival.js 算「復活要多少錢、還能不能復活」——純規則，刻意不吃 character
//   這個檔案               把上面兩者接到 character 物件與遊戲流程上
//
// [已知限制 —— 誠實寫在這裡，不假裝已經解決]
// core/deathAndRevival.js 的檔頭寫得很清楚：復活費用公式需要「未花分數 + 已花分數明細」
// 兩筆資料，而 core/schema.js 目前只有 xp:{earned,spent} 這組經驗值帳本，還沒有建卡時的
// 「分數(支線/開局點數)」帳本。所以 buildRevivalWallet() 是**用經驗值帳本代打**的近似版：
// 把未花經驗當作未花分數、已花經驗當作已花分數明細。這不是書中原意的那個數字，
// 但它是目前這個資料形狀能給出的唯一自洽答案，而且維持了公式的性質
// （花得越多、復活越貴）。等點數帳本做出來之後，只要改這一個函式即可，
// 其他呼叫端不用動。

import { evaluateStatus } from "../core/health.js";
import { attemptRevival, computeRevivalCost, MAX_REVIVALS } from "../core/deathAndRevival.js";
import { createHpState } from "../core/health.js";

/**
 * 這張角色卡目前能不能行動。
 *
 * @param {object} character
 * @returns {{dead: boolean, unconscious: boolean, worsening: boolean, canAct: boolean, reason: string|null}}
 */
export function getDownState(character) {
  const hp = character?.derived?.hp;
  if (!hp) {
    return { dead: false, unconscious: false, worsening: false, canAct: true, reason: null };
  }

  const status = evaluateStatus(hp);
  const canAct = !status.dead && !status.unconscious;

  let reason = null;
  if (status.dead) {
    reason = "角色已經死亡，無法繼續行動。";
  } else if (status.unconscious) {
    reason = status.worsening
      ? "角色因傷勢過重陷入昏迷，而且傷勢正在惡化，無法繼續行動。"
      : "角色因傷勢過重陷入昏迷，無法繼續行動。";
  }

  return { ...status, canAct, reason };
}

/**
 * 把角色卡轉成 core/deathAndRevival.js 需要的 wallet 形狀。
 * 這裡就是上面「已知限制」講的那個代打實作，映射方式刻意寫成一行看得懂的程式碼，
 * 之後接上真正的點數帳本時，改這裡就好。
 */
export function buildRevivalWallet(character) {
  const earned = character?.xp?.earned ?? 0;
  const spent = character?.xp?.spent ?? 0;
  return {
    unspentPoints: Math.max(0, earned - spent),
    spentLedger: { xp: Math.max(0, spent) },
  };
}

/** 這次復活要花多少（給前端顯示用，不改任何狀態）。 */
export function revivalQuote(character) {
  const wallet = buildRevivalWallet(character);
  const cost = computeRevivalCost(wallet);
  const available = wallet.unspentPoints;
  return {
    cost,
    available,
    affordable: available >= cost,
    reviveCount: character?.reviveCount ?? 0,
    maxRevivals: MAX_REVIVALS,
  };
}

/**
 * 實際執行一次復活。成功時**就地修改**傳入的角色卡（跟專案其他地方處理 session.character
 * 的方式一致：呼叫端拿到的是存檔裡的那一份，改完直接存回去）。
 *
 * 失敗時完全不動角色卡，並把 core/deathAndRevival.js 給的原因原封不動帶回去——
 * 「湊不出費用」跟「復活次數用完」對玩家來說是兩件完全不同的事，不可以合併成一句「失敗」。
 *
 * @returns {{ok: true, cost: number, reviveCount: number} | {ok: false, permaDeath: boolean, reason: string, cost?: number, shortfall?: number}}
 */
export function reviveCharacter(character) {
  const state = getDownState(character);
  if (!state.dead) {
    return { ok: false, permaDeath: false, reason: "角色沒有死亡，不需要復活" };
  }

  const wallet = buildRevivalWallet(character);
  const result = attemptRevival(
    { reviveCount: character.reviveCount ?? 0 },
    wallet,
    wallet.unspentPoints
  );

  if (!result.revived) {
    return {
      ok: false,
      permaDeath: result.permaDeath,
      reason: result.reason,
      ...(result.cost != null ? { cost: result.cost } : {}),
      ...(result.shortfall != null ? { shortfall: result.shortfall } : {}),
    };
  }

  // 付款、記次數、傷勢全部清乾淨（規則書：復活後非永久效果移除；這裡的傷勢軌就是最典型的非永久狀態）
  character.xp.spent = (character.xp.spent ?? 0) + result.cost;
  character.reviveCount = result.reviveCount;
  character.derived.hp = createHpState(character.derived.hp.max);

  return { ok: true, cost: result.cost, reviveCount: result.reviveCount };
}
