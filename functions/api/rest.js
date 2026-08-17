// Cloudflare Pages Function —— 休息。
//   POST /api/rest { sessionId }
//
// [使用者決定 2026-08-17] 休息有兩種，由**地點**決定是哪一種，玩家不用選：
//
//   主神空間 —— 完全恢復（生命／意志力／所有能量池全滿），不花任何代價。
//   副本中   —— 打坐：每個能量池做一次關鍵屬性判定、恢復等同成功數，生命恢復1點沖擊傷害，
//               **代價是3回合的時間預算**。
//
// 為什麼需要這個端點：在它出現之前整個遊戲沒有「休息」，`core/health.js` 的 shortRest()
// 與 `core/energyPools.js` 的恢復函式全都是零呼叫端。2026-08-17 把能量池接上消費端之後
// 這變成一個會卡住玩家的洞——開一次洞察眼扣1點查克拉，那1點永遠回不來。
//
// 這一層一樣很薄：恢復多少、扣多少時間，全部是 core/rest.js 與 timeBudget.js 的純函式在算。

import { resolveSessionStore } from "../../content/storage/sessionStore.js";
import { fullRecovery, meditate, describeRest, IN_MOVIE_REST_ROUNDS } from "../../core/rest.js";
import { locationOf } from "../../content/shop/access.js";
import { spendTime, isExpired, timeStatus } from "../../content/scenario/timeBudget.js";
import { getScenarioPack } from "../../content/scenario/registry.js";
import { appendEvent, EVENT_TYPES } from "../../core/eventLog.js";
import { getCurrentUser } from "../../content/auth/sessionToken.js";
import { canAccessSession } from "../../content/auth/ownership.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestPost(context) {
  const store = resolveSessionStore(context.env ?? {});

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "請求body必須是合法JSON" }, 400);
  }

  const { sessionId } = body ?? {};
  if (!sessionId) return json({ ok: false, error: "body必須包含 sessionId" }, 400);

  const session = await store.get(sessionId);
  if (!session) return json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404);
  if (!canAccessSession(session, await getCurrentUser(context.request, context.env ?? {}))) {
    return json({ ok: false, error: `找不到存檔 ${sessionId}` }, 404);
  }

  // 戰鬥中不能休息。這不是規則書的條文，是常識，而且引擎層面也講得通：
  // 打坐要花的是「回合」這個劇情時間單位，戰鬥輪不是同一種時間。
  if (session.combat?.active) {
    return json({ ok: false, blockers: [{ code: "戰鬥中", message: "戰鬥中沒辦法休息" }] });
  }

  const access = locationOf(session, getScenarioPack);

  if (access.location === "主神空間") {
    const result = fullRecovery(session.character);
    session.character = result.character;
    appendEvent(
      session.log,
      EVENT_TYPES.REST,
      { kind: "完全恢復", location: access.location, summary: describeRest(result.recovered) },
      { timestamp: new Date().toISOString() }
    );
    await store.put(session);
    return json({
      ok: true,
      location: access.location,
      recovered: result.recovered,
      summary: describeRest(result.recovered),
      character: session.character,
    });
  }

  // 副本中：先確認時間預算付得起，再打坐。付不起就整筆不成立——
  // 跟錢包與能量池同一個約定，不允許「扣一半」或「透支」。
  const budget = session.scenario?.progress?.timeBudget ?? null;
  if (!budget) {
    return json({
      ok: false,
      blockers: [
        {
          code: "沒有時間預算",
          message: "這個副本沒有設定時間預算，打坐的代價無從扣起(見 content/scenario/timeBudget.js)",
        },
      ],
    });
  }
  const remaining = budget.totalRounds - budget.spentRounds;
  if (remaining < IN_MOVIE_REST_ROUNDS) {
    return json({
      ok: false,
      blockers: [
        {
          code: "時間不足",
          message: `打坐要花${IN_MOVIE_REST_ROUNDS}回合，但只剩下${Math.max(0, remaining)}回合`,
        },
      ],
    });
  }

  const result = meditate(session.character);
  session.character = result.character;
  const nextBudget = spendTime(budget, IN_MOVIE_REST_ROUNDS, "打坐休息");
  session.scenario = {
    ...session.scenario,
    progress: { ...session.scenario.progress, timeBudget: nextBudget },
  };

  const summary = describeRest(result.recovered);
  appendEvent(
    session.log,
    EVENT_TYPES.REST,
    { kind: "打坐", location: access.location, roundsSpent: IN_MOVIE_REST_ROUNDS, summary },
    { timestamp: new Date().toISOString() }
  );
  appendEvent(
    session.log,
    EVENT_TYPES.TIME_SPENT,
    { amount: IN_MOVIE_REST_ROUNDS, activity: "打坐休息" },
    { timestamp: new Date().toISOString() }
  );
  await store.put(session);

  return json({
    ok: true,
    location: access.location,
    recovered: result.recovered,
    summary,
    character: session.character,
    timeBudget: {
      totalRounds: nextBudget.totalRounds,
      spentRounds: nextBudget.spentRounds,
      status: timeStatus(nextBudget),
      expired: isExpired(nextBudget),
    },
  });
}
