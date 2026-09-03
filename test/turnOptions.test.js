// content/turnOptions.js 的測試。
//
// 這個模組是「AI說了不算」的那道關卡，所以測試重點全部放在**惡意/錯誤輸入**上：
// AI 幻覺出一個不存在的技能、自己編一個DC數字、給了角色沒登記的專業、
// 回傳的JSON外面包了markdown程式碼區塊……這些都真的會發生，而且不能靠「AI通常不會這樣」帶過。
import test from "node:test";
import assert from "node:assert/strict";
import {
  OPTION_COUNT,
  DIFFICULTY_TIERS,
  DIFFICULTY_IDS,
  DEFAULT_DIFFICULTY,
  difficultyToDc,
  buildOptionsSpec,
  parseTurnResponse,
  extractNarrationFallback,
  validateOption,
  validateOptions,
  optionToCheckParams,
  MAX_FREE_OPTIONS,
  MAX_FREE_ACTION_CHARS,
  countActionCharacters,
  TURN_RESPONSE_SCHEMA,
  REFERENCE_TURN_RESPONSE_SCHEMA,
  buildReferenceResponseSpec,
} from "../content/turnOptions.js";
import { emptyCharacter, SKILLS } from "../core/schema.js";
import { performCheck } from "../core/check.js";

function demoCharacter() {
  const c = emptyCharacter("測試輪迴者");
  c.attributes["感知"] = 4;
  c.attributes["敏捷"] = 6;
  c.attributes["力量"] = 4;
  c.skills["偵察"] = 2;
  c.skills["體魄"] = 2;
  c.skills["射擊"] = 3;
  c.specializations["射擊"] = ["步槍"];
  return c;
}

// --- 難度分級 ---

test("難度分級的DC隨等級單調遞增，且都是正整數", () => {
  let prev = 0;
  for (const tier of DIFFICULTY_TIERS) {
    assert.ok(Number.isInteger(tier.dc) && tier.dc > 0, `${tier.id} 的DC不是正整數`);
    assert.ok(tier.dc > prev, `${tier.id} 的DC沒有比前一級高`);
    prev = tier.dc;
  }
});

test("difficultyToDc：未知分級退回預設，不丟錯(AI偶爾會寫出量表外的字串)", () => {
  assert.equal(difficultyToDc("困難"), 3);
  assert.equal(difficultyToDc("超級無敵難"), difficultyToDc(DEFAULT_DIFFICULTY));
  assert.equal(difficultyToDc(undefined), difficultyToDc(DEFAULT_DIFFICULTY));
});

// --- prompt 規格 ---

test("buildOptionsSpec：會列出角色真正練過的技能與等級(避免AI四個選項全挑0級技能)", () => {
  const spec = buildOptionsSpec(demoCharacter());
  assert.match(spec, /射擊3/);
  assert.match(spec, /偵察2/);
  assert.match(spec, new RegExp(String(OPTION_COUNT)));
  for (const id of DIFFICULTY_IDS) assert.ok(spec.includes(id), `難度分級 ${id} 沒有列進spec`);
});

test("buildOptionsSpec：會警告心智系技能0級是自動失敗", () => {
  const spec = buildOptionsSpec(demoCharacter());
  assert.match(spec, /自動失敗/);
});

// --- JSON 解析容錯 ---

test("parseTurnResponse：純JSON可以解析", () => {
  const r = parseTurnResponse('{"narration":"文字","options":[]}');
  assert.equal(r.ok, true);
  assert.equal(r.data.narration, "文字");
});

test("parseTurnResponse：包在markdown程式碼區塊裡也要能解析(模型很常這樣做)", () => {
  const r = parseTurnResponse('```json\n{"narration":"文字","options":[]}\n```');
  assert.equal(r.ok, true);
  assert.equal(r.data.narration, "文字");
});

test("parseTurnResponse：前後多了廢話也要能挖出JSON", () => {
  const r = parseTurnResponse('好的，以下是這一回合：\n{"narration":"文字","options":[]}\n希望你喜歡。');
  assert.equal(r.ok, true);
  assert.equal(r.data.narration, "文字");
});

test("parseTurnResponse：真的不是JSON時要明確回報失敗，不能假裝成功", () => {
  const r = parseTurnResponse("這就是一段普通的敘事，完全沒有JSON。");
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON/);
});

test("parseTurnResponse：空白內容要回報失敗", () => {
  assert.equal(parseTurnResponse("").ok, false);
  assert.equal(parseTurnResponse(null).ok, false);
});

// --- narration 降級抽取(JSON解析失敗時，避免把裸JSON印給玩家看) ---

test("extractNarrationFallback：JSON被截斷(缺結尾括號)時仍能挖出narration純文字", () => {
  const truncated = '{\n  "narration": "你醒來時發現自己在一個陌生的隔離艙內。",\n  "options": [\n    { "label": "試';
  assert.equal(
    extractNarrationFallback(truncated),
    "你醒來時發現自己在一個陌生的隔離艙內。"
  );
});

test("extractNarrationFallback：還原跳脫字元(換行、引號)", () => {
  const text = '{"narration": "第一行\\n第二行，還有\\"引號\\"。", "options": []';
  assert.equal(extractNarrationFallback(text), '第一行\n第二行，還有"引號"。');
});

test("extractNarrationFallback：完全沒有narration欄位時回傳null，交由呼叫端退回原始文字", () => {
  assert.equal(extractNarrationFallback("這就是一段普通的敘事，完全沒有JSON。"), null);
  assert.equal(extractNarrationFallback(""), null);
  assert.equal(extractNarrationFallback(null), null);
});

// --- 選項查驗：這是「AI說了不算」的核心 ---

test("合法選項可以通過，並算出對應的DC", () => {
  const r = validateOption(
    { label: "翻找櫃檯後方", attribute: "感知", skill: "偵察", difficulty: "困難" },
    demoCharacter()
  );
  assert.equal(r.ok, true);
  assert.equal(r.option.dc, 3);
  assert.deepEqual(r.warnings, []);
});

test("AI幻覺出不存在的技能時，降級成純屬性檢定並留下警告(不採用自創技能)", () => {
  const r = validateOption(
    { label: "駭進終端機", attribute: "智力", skill: "駭客", difficulty: "普通" },
    demoCharacter()
  );
  assert.equal(r.ok, true);
  assert.equal(r.option.skill, undefined, "自創技能不可以被採用");
  assert.match(r.warnings.join(), /不在規則書技能表/);
});

test("AI用了不存在的屬性時，整個選項被捨棄(沒有屬性就組不出骰池)", () => {
  const r = validateOption(
    { label: "用魅力壓制", attribute: "魅力", skill: "交際", difficulty: "普通" },
    demoCharacter()
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /不在規則書屬性表裡/);
});

test("AI自己編一個DC數字時不予採用，難度一律走分級量表", () => {
  const r = validateOption(
    { label: "衝過去", attribute: "力量", skill: "體魄", difficulty: "DC7", dc: 7 },
    demoCharacter()
  );
  assert.equal(r.ok, true);
  assert.equal(r.option.dc, difficultyToDc(DEFAULT_DIFFICULTY), "不可以採用AI自己給的DC");
  assert.match(r.warnings.join(), /不在分級量表/);
});

test("前端/AI直接塞一個dc數字進來時完全不予採用，DC一律從難度分級查表", () => {
  // 這是防竄改最重要的一條：擋掉「把 dc 改成 0 讓所有判定必過」。
  const r = validateOption(
    { label: "潛行", attribute: "敏捷", skill: "躲藏", difficulty: "困難", dc: 0 },
    demoCharacter()
  );
  assert.equal(r.option.dc, difficultyToDc("困難"), "dc欄位必須被忽略並依難度分級重算");

  const r2 = validateOption(
    { label: "潛行", attribute: "敏捷", skill: "躲藏", difficulty: "困難", dc: 99 },
    demoCharacter()
  );
  assert.equal(r2.option.dc, difficultyToDc("困難"));
});

// [2026-08-16 決策] 專業(specialization)在輕量化規則裡明確不做，完整理由見
// test/checkIntent.test.js 的同一個決定。這則測試從「專業要正確帶上」改成
// 「專業一律不帶上」——因為 core/check.js 從來沒有讀過這個欄位，
// 舊行為等於在選項上放一個完全不影響結果的裝飾，還配一句「引擎會依規則減半」的假說明。
test("專業欄位一律被丟棄，就算角色真的登記過（輕量化規則不實作專業）", () => {
  const character = demoCharacter();
  for (const spec of ["狙擊槍", "步槍"]) {
    const r = validateOption(
      { label: "狙擊", attribute: "感知", skill: "射擊", specialization: spec, difficulty: "普通" },
      character
    );
    assert.equal(r.ok, true);
    assert.equal(r.option.specialization, undefined, `專業「${spec}」不該被帶進檢定參數`);
    assert.equal(r.warnings.join().includes("減半"), false, "不該再出現那句不存在的減半規則說明");
  }
});

test("缺label的選項要被捨棄(沒有文字就沒辦法顯示給玩家看)", () => {
  const r = validateOption({ attribute: "力量", skill: "體魄", difficulty: "普通" }, demoCharacter());
  assert.equal(r.ok, false);
  assert.match(r.error, /label/);
});

test("角色卡上沒有該技能欄位時降級成純屬性檢定(否則performCheck會丟錯)", () => {
  const character = demoCharacter();
  delete character.skills["電腦"];
  const r = validateOption(
    { label: "入侵系統", attribute: "智力", skill: "電腦", difficulty: "普通" },
    character
  );
  assert.equal(r.ok, true);
  assert.equal(r.option.skill, undefined);
  assert.doesNotThrow(() => performCheck(character, optionToCheckParams(r.option)));
});

// --- 整批查驗 ---

test("validateOptions：壞的被剔除、好的保留，數量不符時回報警告並用通用選項墊滿", () => {
  const character = demoCharacter();
  const { options, warnings } = validateOptions(
    [
      { label: "搜查", attribute: "感知", skill: "偵察", difficulty: "普通" },
      { label: "壞的", attribute: "不存在的屬性", difficulty: "普通" },
      { label: "衝刺", attribute: "敏捷", skill: "體魄", difficulty: "困難" },
    ],
    character
  );

  assert.equal(options.length, OPTION_COUNT, "數量不足要被墊滿到OPTION_COUNT個，玩家畫面不能時多時少");
  assert.ok(options.some((o) => o.label === "搜查"), "AI真正給的合法選項要保留");
  assert.ok(options.some((o) => o.label === "衝刺"), "AI真正給的合法選項要保留");
  assert.match(warnings.join(), /被捨棄/);
  assert.match(warnings.join(), new RegExp(`預期${OPTION_COUNT}個`));
});

test("validateOptions：options不是陣列時不丟錯，回報警告並用通用選項墊滿四個", () => {
  const { options, warnings } = validateOptions("不是陣列", demoCharacter());
  assert.equal(options.length, OPTION_COUNT);
  assert.match(warnings.join(), /options陣列/);
});

test("validateOptions：AI給的數量不足時，用FALLBACK_OPTIONS墊到OPTION_COUNT個(2026-08-15決策變更，見函式註解)", () => {
  const { options } = validateOptions(
    [{ label: "只有一個", attribute: "感知", skill: "偵察", difficulty: "普通" }],
    demoCharacter()
  );
  assert.equal(options.length, OPTION_COUNT, "版面必須永遠有OPTION_COUNT個選項，不管AI給了幾個");
  assert.equal(options[0].label, "只有一個", "AI真正給的選項優先，墊底選項只補在後面");
});

test("validateOptions：AI完全沒給任何合法選項時，也要墊滿四個通用選項(不能讓玩家看到空版面)", () => {
  const { options } = validateOptions([], demoCharacter());
  assert.equal(options.length, OPTION_COUNT);
  for (const opt of options) {
    assert.ok(opt.label && opt.attribute && opt.dc, "墊底選項也必須是查驗過的合法選項");
  }
});

// --- 「這個選項是誰給的」必須看得出來（2026-08-16 任務A的根本原因） ---
//
// 這一組測試存在的理由：先前「AI給了3個少1個」跟「AI一個都沒給」被處理成完全一樣的結果，
// 於是後者可以連續發生幾十輪都沒人發現(症狀只有『選項每輪逐字重複』，得靠肉眼比對)。
// 現在兩者必須在回傳值上就分得開。

test("validateOptions：AI給的選項標 source=ai，引擎墊的標 source=fallback", () => {
  const { options } = validateOptions(
    [{ label: "只有一個", attribute: "感知", skill: "偵察", difficulty: "普通" }],
    demoCharacter()
  );
  assert.equal(options[0].source, "ai", "AI真正給的選項要標成 ai");
  for (const opt of options.slice(1)) {
    assert.equal(opt.source, "fallback", "墊底選項要標成 fallback，前端才能標示給玩家看");
  }
});

test("validateOptions：回傳 aiOptionCount / fallbackCount，讓呼叫端分得出『少1個』與『整組都是保底』", () => {
  const partial = validateOptions(
    [
      { label: "搜查", attribute: "感知", skill: "偵察", difficulty: "普通" },
      { label: "衝刺", attribute: "敏捷", skill: "體魄", difficulty: "困難" },
      { label: "喊話", attribute: "意志", skill: "交涉", difficulty: "容易" },
    ],
    demoCharacter()
  );
  assert.equal(partial.aiOptionCount, 3);
  assert.equal(partial.fallbackCount, 1);

  const none = validateOptions(null, demoCharacter());
  assert.equal(none.aiOptionCount, 0, "AI一個都沒給時 aiOptionCount 必須是0");
  assert.equal(none.fallbackCount, OPTION_COUNT, "整組都是保底選項");
});

test("validateOptions：整組都退回保底時，警告文字要跟『只是少幾個』的警告明顯不同", () => {
  const none = validateOptions(null, demoCharacter()).warnings.join();
  const partial = validateOptions(
    [{ label: "搜查", attribute: "感知", skill: "偵察", difficulty: "普通" }],
    demoCharacter()
  ).warnings.join();

  assert.match(none, /全部/, "整組保底的警告要明講『全部』，不能跟墊一兩個共用同一句");
  assert.match(none, /每一輪都會是同一組文字/, "要點出『逐字重複』這個實際觀察得到的症狀");
  assert.ok(!/每一輪都會是同一組文字/.test(partial), "只少幾個的情況不該用整組保底的警告文字");
});

// --- 接回引擎 ---

test("查驗過的選項一定能被 performCheck() 實際吃下去而不丟錯", () => {
  const character = demoCharacter();
  const allSkills = Object.values(SKILLS).flat();

  // 掃過所有技能 × 所有難度，確保產生的參數引擎都吃得下
  for (const skill of allSkills) {
    for (const difficulty of DIFFICULTY_IDS) {
      const r = validateOption(
        { label: "測試", attribute: "感知", skill, difficulty },
        character
      );
      assert.equal(r.ok, true);
      assert.doesNotThrow(
        () => performCheck(character, optionToCheckParams(r.option)),
        `技能${skill}／難度${difficulty} 產生的參數讓引擎丟錯`
      );
    }
  }
});

test("optionToCheckParams：純屬性選項不帶skill欄位", () => {
  const params = optionToCheckParams({ label: "x", attribute: "決心", difficulty: "普通", dc: 2 });
  assert.equal(params.attribute, "決心");
  assert.equal(params.skill, undefined);
  assert.equal(params.dc, 2);
});

// --- 輸出被截斷時的敘事挖掘（2026-08-16，玩家實際看到的畫面bug） ---
//
// 症狀：說書人對話框裡出現裸奔的 JSON —— `{ "narration": "昏紅的緊急照明燈光在…士兵`
// 成因：extractNarrationFallback() 的正則要求 narration 字串**有收尾引號**，
// 而輸出被切斷時那個引號根本不存在，於是 match 不到、回傳 null，
// 呼叫端只好把整段原文印出來，玩家就看到了程式碼。
// 被切斷的敘事本身仍然是AI寫的、仍然可讀，沒有理由不給玩家看。

test("extractNarrationFallback：narration字串沒有收尾引號(輸出被切斷)時，仍要挖得出文字", () => {
  const truncated = '{\n  "narration": "昏紅的緊急照明燈光在B3隔離艙內規律跳動，門邊掛著一枚沾染暗紅血跡的士兵';
  const got = extractNarrationFallback(truncated);
  assert.ok(got, "被切斷不等於沒有內容，不可以回 null");
  assert.match(got, /^昏紅的緊急照明燈光/);
  assert.ok(!got.includes('"narration"'), "挖出來的必須是純敘事，不可以夾帶JSON語法");
  assert.ok(!got.includes("{"), "不可以把大括號一起帶出來");
});

test("extractNarrationFallback：完整的JSON仍然照舊優先用有收尾引號的那一條路", () => {
  const complete = '{"narration": "完整的敘事", "options": []}';
  assert.equal(extractNarrationFallback(complete), "完整的敘事");
});

test("extractNarrationFallback：被切斷的內容裡有跳脫字元也要正確還原", () => {
  const truncated = '{"narration": "他說：\\"快走\\"\\n然後轉身';
  const got = extractNarrationFallback(truncated);
  assert.match(got, /他說：「?"?快走/);
  assert.ok(got.includes("\n"), "\\n 要還原成真的換行");
});

test("extractNarrationFallback：結尾剛好斷在一個落單的反斜線上時，仍要挖得出文字", () => {
  // 這是最刁鑽的邊界：輸出停在跳脫序列只寫了一半的地方。那個落單的反斜線
  // 既不符合 \\. 也不符合 [^"\\]，正則若沒有特別容忍它就會整條match不到、
  // 退回 null，玩家又看到裸JSON——等於修正在最需要它的地方失效。
  const truncated = '{"narration": "文字結尾剛好斷在跳脫字元\\';
  assert.doesNotThrow(() => extractNarrationFallback(truncated));
  assert.equal(extractNarrationFallback(truncated), "文字結尾剛好斷在跳脫字元");
});

test("extractNarrationFallback：完全沒有narration欄位時還是回 null", () => {
  assert.equal(extractNarrationFallback("這只是一段普通的散文，沒有JSON"), null);
});

// ---------------------------------------------------------------------------
// 純敘事選項 requiresCheck（Phase 5.3 任務2）
//
// 這一組測試的重點是「無風險」這件事必須是**乾淨**的：不擲骰的選項不可以留下任何
// 半截的檢定欄位。只要 dc 還帶著一個數字，之後任何一個呼叫端都可能拿它去擲骰，
// 而按鈕上寫的是「這個行動沒有風險」——那就是引擎在騙玩家。
// ---------------------------------------------------------------------------

test("requiresCheck:false 的選項直接放行，且屬性/技能/難度/DC 一律被清成 null", () => {
  const result = validateOption(
    { label: "問她剛才那句話是什麼意思", hint: "想知道她在瞞什麼", requiresCheck: false },
    demoCharacter()
  );

  assert.equal(result.ok, true);
  assert.equal(result.option.requiresCheck, false);
  assert.equal(result.option.attribute, null);
  assert.equal(result.option.skill, null);
  assert.equal(result.option.difficulty, null);
  assert.equal(result.option.dc, null);
  assert.equal(result.option.hint, "想知道她在瞞什麼");
});

test("requiresCheck:false 時，連完全不存在的屬性/技能都不再被查驗(但會留警告)", () => {
  // 這是這個功能的核心：純敘事選項**不走**屬性查驗那條路。
  // 修改前這個選項會因為「屬性『心電感應』不在規則書屬性表裡」被整個丟掉。
  const result = validateOption(
    { label: "走過去看牆上的名牌", hint: "想確認這是誰的房間", requiresCheck: false, attribute: "心電感應", skill: "讀心術" },
    demoCharacter()
  );

  assert.equal(result.ok, true);
  assert.equal(result.option.attribute, null);
  assert.ok(result.warnings.some((w) => w.includes("已一律忽略")), "被丟掉的欄位要講出來");
});

test("沒有 requiresCheck 欄位時當成「要檢定」(舊AI/舊存檔的相容行為完全不變)", () => {
  const result = validateOption(
    { label: "撬開櫃子", hint: "想拿到裡面的東西", attribute: "力量", skill: "格鬥", difficulty: "困難" },
    demoCharacter()
  );

  assert.equal(result.ok, true);
  assert.equal(result.option.requiresCheck, true);
  assert.equal(result.option.dc, 3);
});

test("requiresCheck 只認 === false：字串 \"false\" 之類的東西一律當成要檢定", () => {
  // 猜錯方向的代價是不對稱的：猜成「要檢定」最多多擲一次骰，
  // 猜成「不檢定」會讓一個有風險的行動變成免費通行證。
  const result = validateOption(
    { label: "在怪物旁邊挪動", hint: "想繞到牠背後", requiresCheck: "false", attribute: "敏捷", skill: "潛行", difficulty: "很困難" },
    demoCharacter()
  );

  assert.equal(result.option.requiresCheck, true);
  assert.equal(result.option.dc, 4);
});

test("純敘事選項缺 label 一樣要被打回票(label 是唯一無條件必填的欄位)", () => {
  const result = validateOption({ requiresCheck: false, hint: "想看看" }, demoCharacter());
  assert.equal(result.ok, false);
});

test("optionToCheckParams 對純敘事選項要丟錯，不可以湊一組檢定參數出來", () => {
  const { option } = validateOption(
    { label: "看一眼窗外", hint: "想確認外面天黑了沒", requiresCheck: false },
    demoCharacter()
  );
  assert.throws(() => optionToCheckParams(option), /純敘事選項/);
});

test("validateOptions：一輪最多兩個純敘事選項，多的丟掉並用保底檢定選項補滿", () => {
  const character = demoCharacter();
  const raw = [
    { label: "看窗外", hint: "想確認外面", requiresCheck: false },
    { label: "問她名字", hint: "想知道她是誰", requiresCheck: false },
    { label: "翻抽屜", hint: "想找鑰匙", requiresCheck: false },
    { label: "聽門後的聲音", hint: "想確認有沒有人", requiresCheck: false },
  ];

  const result = validateOptions(raw, character);

  assert.equal(result.options.length, OPTION_COUNT, "版面永遠是四顆按鈕");
  assert.equal(result.freeOptionCount, MAX_FREE_OPTIONS);
  assert.ok(result.checkOptionCount >= 2, "一輪至少要有兩個會擲骰的選項，不然骰子系統等於被關掉");
  assert.ok(result.warnings.some((w) => w.includes("純敘事選項一回合最多")));
});

test("validateOptions：正常的一輪(3檢定+1純敘事)會原樣全部保留", () => {
  const character = demoCharacter();
  const raw = [
    { label: "觀察血跡", hint: "想知道通往哪裡", requiresCheck: true, attribute: "感知", skill: "偵察", difficulty: "普通" },
    { label: "撞開艙門", hint: "想開出一條路", requiresCheck: true, attribute: "力量", skill: "體魄", difficulty: "困難" },
    { label: "繞到管線後面", hint: "想換一個位置", requiresCheck: true, attribute: "敏捷", skill: "潛行", difficulty: "普通" },
    { label: "問她剛才看到什麼", hint: "想拼出時間線", requiresCheck: false },
  ];

  const result = validateOptions(raw, character);

  assert.equal(result.aiOptionCount, 4);
  assert.equal(result.fallbackCount, 0);
  assert.equal(result.freeOptionCount, 1);
  assert.equal(result.checkOptionCount, 3);
});

test("保底選項全部都是檢定選項(保底不可以是不擲骰的行動)", () => {
  const result = validateOptions(null, demoCharacter());
  assert.equal(result.freeOptionCount, 0);
  assert.equal(result.checkOptionCount, OPTION_COUNT);
});

test("buildOptionsSpec：明確告訴AI可以給1~2個 requiresCheck:false 的無風險選項", () => {
  const spec = buildOptionsSpec(demoCharacter());
  assert.match(spec, /requiresCheck/);
  assert.match(spec, /純探索、對話、無風險/);
  assert.match(spec, /"requiresCheck": false/);
});

// [2026-09-03] reference 回合改成「AI 寫選項文字、引擎綁定與查驗」。
// 選項回到 schema 裡，但 narration 仍然不可以自己列 1/2/3——那會讓玩家把同一批選項
// 讀兩次（一次在故事裡、一次在按鈕上）。
test("V2 reference prompt：選項文字由 AI 產出，但 narration 不得自列編號選項", () => {
  const spec = buildReferenceResponseSpec();
  assert.match(spec, /選項的\*\*文字由你寫\*\*/);
  assert.match(spec, /開放且不預設答案/);
  assert.match(spec, /不要在 narration 裡列出 1\/2\/3 的編號選項/);
  const optionItem = REFERENCE_TURN_RESPONSE_SCHEMA.properties.options.items;
  assert.deepEqual(optionItem.required, ["label", "hint"]);
  // approachId 是「索引」不是「真理」：引擎會拿它回 reference 查一次。
  assert.ok("approachId" in optionItem.properties);
  // 檢定參數刻意不進 schema——那幾格永遠由引擎從副本資料重建。
  assert.equal("attribute" in optionItem.properties, false);
  assert.equal("difficulty" in optionItem.properties, false);
  assert.equal(MAX_FREE_ACTION_CHARS, 1000);
  assert.equal(countActionCharacters("中文😀"), 3);
  assert.equal(countActionCharacters("a".repeat(1001)), 1001);
});

test("TURN_RESPONSE_SCHEMA：requiresCheck 是必填布林值，attribute/difficulty 改為選填", () => {
  const item = TURN_RESPONSE_SCHEMA.properties.options.items;
  assert.equal(item.properties.requiresCheck.type, "boolean");
  assert.ok(item.required.includes("requiresCheck"));
  // 純敘事選項不該有這兩格，所以它們不可以是 required——否則結構化輸出會逼模型
  // 替一個「不擲骰」的行動硬填一個屬性與難度，玩家看到的按鈕就會自相矛盾。
  assert.ok(!item.required.includes("attribute"));
  assert.ok(!item.required.includes("difficulty"));
  // enum 仍然保留：檢定選項填的值一樣由供應商端保證在合法清單裡。
  assert.ok(Array.isArray(item.properties.attribute.enum));
});

test("TURN_RESPONSE_SCHEMA：思維鏈 st_thought 是必填，而且排在 narration 之前", () => {
  // 結構化輸出按 properties 的順序生成欄位，所以「先想再寫」只有在它真的排前面時才成立。
  const keys = Object.keys(TURN_RESPONSE_SCHEMA.properties);
  assert.ok(TURN_RESPONSE_SCHEMA.required.includes("st_thought"));
  assert.ok(keys.indexOf("st_thought") < keys.indexOf("narration"));
});

test("純敘事選項不會被前端的骰池顯示邏輯誤讀(attribute 是 null，不是空字串或未定義)", () => {
  // 前端用 opt.requiresCheck === false 決定要不要畫「屬性+技能 DC 骰池」那一行。
  // 這裡把資料形狀釘死：null 是明確的「這一格不存在」，undefined 會讓
  // `opt.attribute ?? 1` 這類寫法悄悄算出一個假的骰池。
  const { option } = validateOption(
    { label: "深呼吸一下", hint: "想穩住自己", requiresCheck: false },
    demoCharacter()
  );
  assert.strictEqual(option.attribute, null);
  assert.ok("dc" in option && option.dc === null);
});
