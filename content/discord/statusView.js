// [設計] Discord bot 的 `/status` 指令要顯示的「輪迴者檔案」摘要 —— 純函式，
// 只讀 session，不碰網路、不碰 discord.js，方便離線測試（跟 functions/api/session.js
// 的 publicSessionView() 同一種分工：functions/ 放端點glue，可測試的整理邏輯放 content/）。
//
// 這裡刻意不是把 session.character 整包丟出去——bot 只需要玩家在 Discord 上會想看的
// 那幾件事（活著嗎、六維屬性、身上的血統/改造、還有多少支線與分數、上一場主神打幾分），
// 其餘欄位（event log、chronicle、combat 內部狀態…）沒有必要暴露到 Discord 頻道上。

import { ATTRIBUTES } from "../../core/schema.js";
import { getDownState } from "../downState.js";
import { EXCLUSIVE_TEMPLATE_TYPES } from "../shop/catalog.js";
import { tokenValueInD, normalizeTokens } from "../shop/wallet.js";

/**
 * 把一份存檔整理成 `/status` 指令要顯示的形狀。
 * @param {object} session content/storage/sessionStore.js 的存檔物件
 */
export function buildDiscordStatusView(session) {
  const character = session.character ?? {};
  const downState = getDownState(character);
  const attributes = Object.fromEntries(
    ATTRIBUTES.map((a) => [a.key, character.attributes?.[a.key] ?? 0])
  );

  // 血統/改造/瞳術/修真/魔導書彼此排他（規則書：「這種兌換只能兌換一種」，
  // 見 content/shop/catalog.js 的 EXCLUSIVE_TEMPLATE_TYPES），所以角色身上
  // 這五類最多只會有一件，不需要回傳陣列。
  const template = (character.abilities ?? []).find((ability) =>
    EXCLUSIVE_TEMPLATE_TYPES.includes(ability.exclusiveGroup)
  );

  const wallet = session.wallet ?? { points: 0, tokens: {}, xp: 0 };
  // 上一場副本主神給的評價（見 content/scenario/settlement.js 的 deriveEvaluation()）；
  // 副本還沒結算過的話沒有這筆資料，回 null 讓呼叫端顯示「尚無評價紀錄」而不是空字串。
  const evaluation = session.scenario?.progress?.runSummary?.evaluation ?? null;

  return {
    sessionId: session.id,
    name: character.concept?.name || "未命名輪迴者",
    alive: !downState.dead,
    downState,
    attributes,
    template: template
      ? { name: template.name, rank: template.rank ?? null, category: template.exclusiveGroup }
      : null,
    wallet: {
      points: wallet.points ?? 0,
      tokens: normalizeTokens(tokenValueInD(wallet.tokens ?? {})),
      xp: wallet.xp ?? 0,
    },
    evaluation: evaluation
      ? { grade: evaluation.grade, label: evaluation.label, summary: evaluation.summary }
      : null,
    scenarioId: session.scenario?.packId ?? null,
    updatedAt: session.updatedAt ?? session.createdAt ?? null,
  };
}
