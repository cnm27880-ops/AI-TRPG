// 無限恐怖 TRPG 2.35 —— 生命值傷勢引擎(生命.htm「生命值 / 受傷 / 死亡」段落)
// 這份規則是逐點運算的層疊轉換系統，四個狀態：完好(intact) / 沖擊B / 嚴重L / 惡性A
// 已經用規則書內建的範例(20點生命的人物一路受傷到 0完好+0B+14L+6A)驗證過，見 test/health.test.js

/** 建立一個生命值狀態物件 */
export function createHpState(max) {
  return { max, intact: max, B: 0, L: 0, A: 0 };
}

// 各傷害類型的「優先轉換順序」，對每一點傷害都依序嘗試，能轉就轉，轉完這一點就換下一點
// B傷：完好->B，否則 B->L，否則 L->A
// L傷：完好->L，否則 B->L，否則 L->A
// A傷：完好->A，否則 B->A，否則 L->A(注意：A傷跳過L，B可以直接轉A)
const CONVERSION_ORDER = {
  B: [
    ["intact", "B"],
    ["B", "L"],
    ["L", "A"],
  ],
  L: [
    ["intact", "L"],
    ["B", "L"],
    ["L", "A"],
  ],
  A: [
    ["intact", "A"],
    ["B", "A"],
    ["L", "A"],
  ],
};

/**
 * 對生命值狀態套用一種傷害類型、指定點數的傷害。逐點運算，回傳新的狀態(不修改傳入的物件)。
 * @param {{max:number,intact:number,B:number,L:number,A:number}} hpState
 * @param {number} amount 傷害點數
 * @param {"B"|"L"|"A"} type 傷害類型
 */
export function applyDamage(hpState, amount, type) {
  if (!CONVERSION_ORDER[type]) {
    throw new Error(`未知傷害類型: ${type}，只接受 B / L / A`);
  }
  const state = { ...hpState };
  const order = CONVERSION_ORDER[type];

  for (let i = 0; i < amount; i++) {
    const step = order.find(([from]) => state[from] > 0);
    if (!step) break; // 完好/B/L 全部歸零，代表已經全惡性，多餘傷害不再有轉換對象
    const [from, to] = step;
    state[from] -= 1;
    state[to] += 1;
  }

  return { ...state, ...evaluateStatus(state) };
}

/**
 * 依目前狀態判斷角色的整體傷勢狀態(生命.htm「因傷勢嚴重而昏迷 / 傷勢惡化 / 死亡」)
 * 回傳的旗標交給 AI 去敘事，這裡只負責判斷「規則上發生了什麼」。
 */
export function evaluateStatus(state) {
  const dead = state.A >= state.max && state.intact === 0 && state.B === 0 && state.L === 0;
  const noIntact = state.intact === 0;
  // 只要 intact 歸零，最壞的傷勢欄位決定是否惡化中；已經死亡就不存在「還會惡化」這件事
  const worsening = !dead && noIntact && hasAnyDamage(state) && worstTrack(state) === "A";
  const unconscious = noIntact && hasAnyDamage(state);

  return { dead, unconscious, worsening };
}

function hasAnyDamage(state) {
  return state.B > 0 || state.L > 0 || state.A > 0;
}

/** 找出目前「最壞」的非零傷勢欄位，惡性(A) > 嚴重(L) > 沖擊(B) */
function worstTrack(state) {
  if (state.A > 0) return "A";
  if (state.L > 0) return "L";
  if (state.B > 0) return "B";
  return null;
}

/**
 * 每輪結束時的「傷勢惡化」處理：若最壞狀態是 A，則有 1 點非 A 生命轉為 A(優先轉化 L)。
 * 沒有惡化中就回傳原狀態不變。
 */
export function tickWorsening(hpState) {
  const status = evaluateStatus(hpState);
  if (!status.worsening) return { ...hpState, ...status };
  const state = { ...hpState };
  if (state.L > 0) {
    state.L -= 1;
    state.A += 1;
  } else if (state.B > 0) {
    state.B -= 1;
    state.A += 1;
  }
  return { ...state, ...evaluateStatus(state) };
}

/**
 * 治療：把指定傷勢軌上的 N 點傷害轉回「完好」。逐點運算，回傳新的狀態(不修改傳入物件)。
 *
 * [規則書] 語意出自「特殊兌換」(主神修復.htm)，rules-2.35.txt 第17600~17615行：主神空間的修復
 * 是按傷勢種類分開計價的(沖擊/嚴重免費、惡性每點200分)，而型錄裡的治療類道具也是同樣寫法，
 * 例如「生命短杖」的爆發回復是「立即將4點嚴重傷害或者1點惡性傷害**回復完好**」
 * (第287280行附近)。所以治療不是 applyDamage 的反向層疊，而是單一軌直接回到 intact，
 * 不會發生「A 退回 L」這種中間態——書上沒有那個機制。
 *
 * [2026-08-17 新增的理由] 這個引擎原本只有 shortRest()(一次1點B)這一條恢復路徑，
 * 而主神商店的療傷服務與治療類商品都需要「指定軌、指定點數」的治療。沒有這個函式，
 * 那些商品就只能是有名無實的敘事文字，那是本專案明令禁止的那種假功能。
 *
 * @param {"B"|"L"|"A"} type 要治療的傷勢軌
 * @returns {{max:number,intact:number,B:number,L:number,A:number,dead:boolean,unconscious:boolean,worsening:boolean}}
 */
export function healDamage(hpState, amount, type) {
  if (!CONVERSION_ORDER[type]) {
    throw new Error(`未知傷勢類型: ${type}，只接受 B / L / A`);
  }
  if (amount < 0) throw new Error("治療點數不能是負數");
  const state = { ...hpState };
  const healed = Math.min(amount, state[type]);
  state[type] -= healed;
  state.intact += healed;
  return { ...state, ...evaluateStatus(state), healed };
}

/** 自然恢復:短休息(至少15分鐘)恢復1點B->完好 */
export function shortRest(hpState) {
  const state = { ...hpState };
  if (state.B > 0) {
    state.B -= 1;
    state.intact += 1;
  }
  return { ...state, ...evaluateStatus(state) };
}
