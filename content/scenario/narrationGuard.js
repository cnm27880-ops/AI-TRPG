// Unmatched free input 的敘事合規檢查。
//
// 這不是第二個劇情引擎，也不嘗試理解所有文學句子；它只攔截高風險的「未授權完成式世界主張」。
// 檢查失敗時，呼叫端可以要求 AI 只重寫 narration；任何 engine state 都不會在這裡被重算。

const UNCERTAINTY_WORDS = [
  "似乎",
  "可能",
  "彷彿",
  "像是",
  "尚未",
  "未能",
  "無法確認",
  "沒有確認",
  "不確定",
  "未確認",
  "被阻住",
  "卡住",
  "仍未",
  "不足以",
];

const RULES = Object.freeze([
  {
    category: "invented_numeric_fact",
    code: "UNAUTHORIZED_NUMERIC_FACT",
    regexes: [
      /(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千萬]+)\s*(?:公尺|米|公里|公分|秒|分鐘|小時|回合)/,
      /(?:幾十|幾百|幾公尺|幾米|幾公釐|幾秒|幾分鐘|數公尺|數公釐|數秒|數分鐘)/,
    ],
  },
  {
    category: "door_state",
    code: "UNAUTHORIZED_DOOR_STATE",
    regexes: [
      /(?:門|艙門|氣密門|自動門).{0,18}(?:已鎖死|鎖死|死鎖|完全打開|已打開|鎖上|關死|封死|封閉)/,
      /(?:已鎖死|鎖死|死鎖|完全打開|已打開|鎖上|關死|封死|封閉).{0,18}(?:門|艙門|氣密門|自動門)/,
    ],
  },
  {
    category: "path_state",
    code: "UNAUTHORIZED_PATH_STATE",
    regexes: [
      /(?:維修通道|通道|出口|路徑|走廊).{0,18}(?:已打通|打通|可通行|可通過|能通過|封死|封閉|被封|不能通行|無法通行|緊閉|無法進入|無法越過|唯一(?:的)?(?:出口|避難所|道路))/,
      /(?:已打通|打通|可通行|可通過|能通過|封死|封閉|被封|不能通行|無法通行|緊閉|無法進入|無法越過).{0,18}(?:維修通道|通道|出口|路徑|走廊)/,
    ],
  },
  {
    category: "item_delta",
    code: "UNAUTHORIZED_ITEM_DELTA",
    regexes: [
      /(?:取得|拿到|獲得|撿起|撿到|拾起|遺失|掉落|摔落|損壞|破損|變形|彎曲|斷裂|失效|消耗|用完).{0,16}(?:手電筒|工具|扳手|撬棍|焊槍|樣本|組織|裝備|武器|手槍|沙漠之鷹|信號槍|火焰噴射器|槍械|物品)/,
      /(?:手電筒|工具|扳手|撬棍|焊槍|樣本|組織|裝備|武器|手槍|沙漠之鷹|信號槍|火焰噴射器|槍械|物品).{0,16}(?:遺失|掉落|摔落|損壞|破損|變形|彎曲|斷裂|失效|消耗|用完)/,
      /(?:手中的|拿著|拿起|握著|舉起|舉著|拔出|裝備|持有|扣住|拉開|扳動|扣動|打開|推上).{0,16}(?:手槍|信號槍|火焰噴射器|槍械|武器|焊槍)/,
    ],
  },
  {
    category: "location_delta",
    code: "UNAUTHORIZED_LOCATION_DELTA",
    regexes: [
      /(?:已|已經|立刻|隨即)(?:進入|離開|抵達|來到|移動到|退到|站在).{0,20}(?:橋樓|艦橋|走廊|維修通道|門外|門口|通風管|科學室|休眠室|下層甲板)/,
      /(?:進入|離開|抵達|來到|移動到|退到).{0,20}(?:橋樓|艦橋|走廊|維修通道|門外|門口|通風管|科學室|休眠室|下層甲板).{0,8}(?:已經|完成)/,
    ],
  },
  {
    category: "injury_delta",
    code: "UNAUTHORIZED_INJURY_DELTA",
    regexes: [
      /(?:你|玩家|角色).{0,12}(?:受傷|割傷|灼傷|骨折|流血|倒下|死亡|失去意識)/,
      /(?:受傷|割傷|灼傷|骨折|流血|失去意識|死亡).{0,12}(?:你|玩家|角色)/,
      /(?:HP|生命值|傷勢).{0,10}(?:下降|增加|減少|變成)/i,
    ],
  },
  {
    category: "threat_contact",
    code: "UNAUTHORIZED_THREAT_CONTACT",
    regexes: [
      /(?:異形|獵食者|怪物|威脅).{0,20}(?:撲上|撲出|衝出|攻擊|咬住|抓住|直接接觸|在門口|守在|落地|降落|出現在|就在)/,
      /(?:撲上|撲出|衝出|攻擊|咬住|抓住|直接接觸|守在|落地|降落).{0,20}(?:異形|獵食者|怪物|威脅)/,
    ],
  },
  {
    category: "npc_authority",
    code: "UNAUTHORIZED_NPC_AUTHORITY",
    regexes: [
      /(?:Ash|MU[- ]?TH[- ]?UR|母親|主神|系統).{0,24}(?:按下|輸入|啟動|下令|宣布|觸發|封鎖|列入|授權|新增|條款|指令|鎖定)/i,
      /(?:按下|輸入|啟動|下令|宣布|觸發|封鎖|列入|授權|新增|條款|指令|鎖定).{0,24}(?:Ash|MU[- ]?TH[- ]?UR|母親|主神|系統)/i,
    ],
  },
]);

function sentenceContext(text, index) {
  const boundary = /[。！？!?\n]/g;
  let previousEnd = -1;
  let nextStart = text.length;
  let match;
  while ((match = boundary.exec(text))) {
    if (match.index < index) previousEnd = match.index;
    else {
      nextStart = match.index + match[0].length;
      break;
    }
  }
  return text.slice(previousEnd + 1, nextStart);
}

function isUncertaintyContext(context) {
  return UNCERTAINTY_WORDS.some((word) => context.includes(word));
}

function findRuleMatches(text, rule) {
  const matches = [];
  for (const regex of rule.regexes) {
    const match = regex.exec(text);
    if (!match) continue;
    const evidence = match[0];
    // 只看命中短語所在的同一句，避免前一個句子的「卡住」替後一個完成式背書。
    // 這仍足以辨識「似乎在門外」「尚未確認」等同句未確定描述。
    const context = sentenceContext(text, match.index);
    // 「尚未打開」「似乎在門外」是安全的未確定描述，不要把它們過濾掉再重寫。
    if (isUncertaintyContext(context)) continue;
    matches.push({
      code: rule.code,
      category: rule.category,
      evidence,
      message: `unmatched free input 未授權${rule.category}完成式主張`,
    });
  }
  return matches;
}

/**
 * @param {string} narration
 * @param {object} contract buildUnmatchedFreeActionContract() 的結果
 */
export function validateNarrationAgainstContract(narration, contract) {
  if (!contract || contract.mode !== "unmatched_free_input") {
    return { ok: true, severity: "none", violations: [], safeRewriteRequired: false };
  }
  const text = String(narration ?? "").trim();
  if (!text) {
    return {
      ok: false,
      severity: "high",
      violations: [{ code: "EMPTY_NARRATION", category: "empty", evidence: "", message: "narration 不可以是空白" }],
      safeRewriteRequired: true,
    };
  }

  const violations = RULES.flatMap((rule) => findRuleMatches(text, rule));
  const unique = [];
  const seen = new Set();
  for (const violation of violations) {
    const key = `${violation.code}:${violation.evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(violation);
  }
  return {
    ok: unique.length === 0,
    severity: unique.length ? "high" : "none",
    violations: unique,
    safeRewriteRequired: unique.length > 0,
  };
}

/** 只回傳可放進 API debug metadata 的簡短資料，不把整段模型原文寫入 history。 */
export function summarizeNarrationGuard(result) {
  return {
    checked: true,
    initialPass: Boolean(result?.ok),
    severity: result?.severity ?? "none",
    violations: [...new Set((result?.violations ?? []).map((v) => v.category ?? v.code))],
    safeRewriteRequired: Boolean(result?.safeRewriteRequired),
  };
}
