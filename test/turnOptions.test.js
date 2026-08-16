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
  assert.match(spec, /步槍/); // 已登記的專業
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

test("角色沒登記的專業不會被帶上，讓引擎照『無對應專業減半』規則處理", () => {
  const character = demoCharacter();
  const r = validateOption(
    { label: "狙擊", attribute: "感知", skill: "射擊", specialization: "狙擊槍", difficulty: "普通" },
    character
  );
  assert.equal(r.ok, true);
  assert.equal(r.option.specialization, undefined);
  assert.match(r.warnings.join(), /沒有登記/);

  // 而角色真的有登記的專業要保留
  const ok = validateOption(
    { label: "狙擊", attribute: "感知", skill: "射擊", specialization: "步槍", difficulty: "普通" },
    character
  );
  assert.equal(ok.option.specialization, "步槍");
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
