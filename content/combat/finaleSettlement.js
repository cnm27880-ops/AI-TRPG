// [設計] 副本最終戰的戰後結算 —— 兩套戰鬥系統共用。
//
// 這一段原本整個寫在 functions/api/combat/act.js 裡。Combat V2 需要**一模一樣**的行為
// （打贏最終戰要結算節點、發獎勵點數、跑通關結算、封存劇情包），而它跟哪一套戰鬥引擎
// 算出勝負完全無關——它只關心「玩家贏了一場被標記為最終戰的戰鬥」。
//
// 把它抄第二份到 V2 是最糟的選項：這裡有六處會靜音失敗的分支（找不到副本包、節點結算被
// 擋下、reference 終局還沒完成……），test/silentFailures.test.js 有一則測試就是在盯
// 「打贏了卻沒有任何回饋，跟沒打贏長得一模一樣」這件事。兩份抄本遲早只有一份修對。
//
// 所以抽成一個純函式：進去是「存檔 + 哪個節點」，出來是「改好的存檔欄位 + 要回給前端的
// scenarioResult」。它不碰戰鬥狀態，也不知道 V1 與 V2 的差別。

import { getScenarioPack, getScenarioReference } from "../scenario/registry.js";
import { applyReferenceFinaleVictory, normalizeReferenceState } from "../scenario/referenceAdapter.js";
import { completeNodeAndAdvance, getProgressSummary } from "../scenario/progress.js";
import { creditNodeReward, settleScenario } from "../scenario/settlement.js";
import { publicEndingPresentation } from "../godspace/debrief.js";
import { registerChroniclePackage } from "../storage/chronicle.js";
import { appendEvent, EVENT_TYPES } from "../../core/eventLog.js";

/**
 * 結算一場打贏的最終戰。
 *
 * **直接修改 session**（wallet／scenario／log／chroniclePackages），跟呼叫端原本的寫法一致。
 * 回傳要放進 API 回應的 `scenario` 欄位；沒有東西要結算時回 null。
 *
 * @param {object} params
 * @param {object} params.session 存檔（會被修改）
 * @param {string} params.finaleNodeId 這場戰鬥掛的最終戰節點
 * @param {string} params.sessionId 只用來寫 server log
 * @param {string} params.where 只用來寫 server log（哪一個端點呼叫的）
 * @returns {object|null} { nodeCompleted, warnings?, settlement?, reference?, chroniclePackage? }
 */
export function settleFinaleVictory({ session, finaleNodeId, sessionId, where }) {
  if (!finaleNodeId || !session.scenario) return null;

  let scenarioResult = null;
  const scenarioWarnings = [];

  const pack = getScenarioPack(session.scenario.packId);
  if (!pack) {
    const msg =
      `打贏了最終戰，但存檔記錄的副本「${session.scenario.packId}」找不到對應的內建副本包，` +
      `本次無法結算節點獎勵。`;
    console.error("[SCENARIO_SETTLEMENT_FAILED]", JSON.stringify({
      where,
      sessionId,
      packId: session.scenario.packId,
      nodeId: finaleNodeId,
      reason: "pack_not_found",
    }));
    scenarioWarnings.push(msg);
  }

  if (pack) {
    // 扭轉度固定用 0 級（完全遵循原劇情）——戰鬥勝負本身沒有「敘事扭轉度」可言，
    // 那是敘事節點的概念，見 content/scenario/divergence.js 檔頭說明。
    const result = completeNodeAndAdvance(pack, session.scenario.progress, finaleNodeId, 0);
    if (!result.ok) {
      console.error("[SCENARIO_SETTLEMENT_FAILED]", JSON.stringify({
        where,
        sessionId,
        packId: pack.id,
        nodeId: finaleNodeId,
        reason: result.error,
      }));
      scenarioWarnings.push(`打贏了最終戰，但節點結算被引擎擋下：${result.error}`);
    }

    if (result.ok) {
      // 最終戰的獎勵跟一般節點一樣是獎勵點數，不是XP(見 content/scenario/settlement.js)
      //
      // [2026-09-01] 帳本要寫進 result.progress（節點**已完成**的那一份），不是
      // session.scenario.progress（完成之前的那一份）。寫錯邊的話這筆帳會被下面
      // `let progress = result.progress` 整個蓋掉，而錢照樣進了錢包——
      // 於是同一筆最終戰獎勵在下一次結算時又會被判定成「還沒發過」。
      const credited = creditNodeReward(result.progress, session.wallet, {
        nodeId: result.node.id,
        points: result.reward,
        label: result.node.title,
        turn: (session.turns ?? 0) + 1,
      });
      session.wallet = credited.wallet;
      let progress = credited.progress;
      const ts = new Date().toISOString();
      appendEvent(
        session.log,
        EVENT_TYPES.NODE_COMPLETE,
        { nodeId: result.node.id, title: result.node.title, divergenceTier: 0, reward: result.reward },
        { timestamp: ts, scenarioId: pack.id, turn: (session.turns ?? 0) + 1 }
      );
      appendEvent(
        session.log,
        EVENT_TYPES.POINTS_GRANT,
        { total: result.reward, reason: `擊敗最終戰「${result.node.title}」` },
        { timestamp: ts, scenarioId: pack.id, turn: (session.turns ?? 0) + 1 }
      );

      // 最終戰打完通常就是通關，所以結算也要在這條路徑上跑一次——
      // 不然玩家打贏之後如果沒有再送出任何一輪敘事，XP 就永遠不會入帳。
      // reference 終局狀態先由 adapter 產生，再交給 settlement 建立 server-computed runSummary。
      const reference = getScenarioReference(pack);
      const referenceStateBeforeVictory = reference
        ? normalizeReferenceState(reference, session.scenario.referenceState)
        : null;
      const completedReferenceState = reference
        ? applyReferenceFinaleVictory(reference, referenceStateBeforeVictory)
        : null;
      const referenceSettlementReady = !reference || Boolean(
        completedReferenceState?.endingId || completedReferenceState?.flags?.includes("flag_hypersleep_entered")
      );
      const settlement = referenceSettlementReady
        ? settleScenario(pack, progress, session.character, session.wallet, {
            referenceState: completedReferenceState,
            turn: (session.turns ?? 0) + 1,
          })
        : { settled: false, wallet: session.wallet, progress, reason: "reference 終局仍需完成休眠前結算" };
      if (settlement.settled) {
        session.wallet = settlement.wallet;
        progress = settlement.progress;
        appendEvent(
          session.log,
          EVENT_TYPES.XP_GRANT,
          { total: settlement.xp, reason: `副本「${pack.briefing?.title ?? pack.id}」通關結算`, breakdown: settlement.breakdown },
          { timestamp: ts, scenarioId: pack.id, turn: (session.turns ?? 0) + 1 }
        );
        if (settlement.speedBonusPoints > 0) {
          appendEvent(
            session.log,
            EVENT_TYPES.POINTS_GRANT,
            { total: settlement.speedBonusPoints, reason: "剩餘效率回合速度獎勵", speedBonus: settlement.speedBonus, runSummary: settlement.runSummary },
            { timestamp: ts }
          );
        }
        scenarioWarnings.push(`副本通關結算：獲得 ${settlement.xp} XP，速度獎勵 ${settlement.speedBonusPoints} 點。回到主神空間，商店已開放。`);
      }

      session.scenario = {
        packId: pack.id,
        progress,
        ...(reference ? { referenceState: completedReferenceState } : {}),
      };
      const packageRegistration = getProgressSummary(pack, progress).scenarioComplete
        ? registerChroniclePackage(session.chroniclePackages, {
            scenarioId: pack.id,
            scenarioTitle: pack.briefing?.title ?? pack.id,
            turnStart: 1,
            turnEnd: session.turns ?? session.chronicle?.length ?? 0,
            createdAt: ts,
          })
        : { packages: session.chroniclePackages ?? [], record: null, created: false };
      session.chroniclePackages = packageRegistration.packages;
      scenarioResult = {
        nodeCompleted: { nodeId: result.node.id, title: result.node.title, reward: result.reward },
        ...(packageRegistration.created && packageRegistration.record ? { chroniclePackage: packageRegistration.record } : {}),
        ...(reference
          ? { reference: { enabled: true, eventId: session.scenario.referenceState.currentSceneId, location: session.scenario.referenceState.currentLocation } }
          : {}),
        ...(settlement.settled
          ? {
              settlement: {
                xp: settlement.xp,
                speedBonusPoints: settlement.speedBonusPoints,
                runSummary: settlement.runSummary,
                endingPresentation: publicEndingPresentation({
                  reference,
                  endingId: settlement.runSummary?.endingId,
                }),
              },
            }
          : {}),
      };
    }
  }

  // 結算失敗一律留下原因，不靜音——打贏了boss卻沒有XP、沒有節點完成提示、也沒有任何
  // 錯誤，跟「沒打贏」長得一模一樣。這是 test/silentFailures.test.js 在盯的那條路。
  if (scenarioWarnings.length) {
    scenarioResult = { ...(scenarioResult ?? { nodeCompleted: null }), warnings: scenarioWarnings };
  }
  return scenarioResult;
}
