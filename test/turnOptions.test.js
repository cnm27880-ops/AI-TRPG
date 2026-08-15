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

test("validateOptions：壞的被剔除、好的保留，並回報數量不符", () => {
  const character = demoCharacter();
  const { options, warnings } = validateOptions(
    [
      { label: "搜查", attribute: "感知", skill: "偵察", difficulty: "普通" },
      { label: "壞的", attribute: "不存在的屬性", difficulty: "普通" },
      { label: "衝刺", attribute: "敏捷", skill: "體魄", difficulty: "困難" },
    ],
    character
  );

  assert.equal(options.length, 2);
  assert.match(warnings.join(), /被捨棄/);
  assert.match(warnings.join(), new RegExp(`預期${OPTION_COUNT}個`));
});

test("validateOptions：options不是陣列時不丟錯，回報警告並回傳空陣列", () => {
  const { options, warnings } = validateOptions("不是陣列", demoCharacter());
  assert.deepEqual(options, []);
  assert.match(warnings.join(), /options陣列/);
});

test("validateOptions：不會自己補足數量(補選項等於程式碼在編劇情)", () => {
  const { options } = validateOptions(
    [{ label: "只有一個", attribute: "感知", skill: "偵察", difficulty: "普通" }],
    demoCharacter()
  );
  assert.equal(options.length, 1, "數量不足時不可以自己生選項出來");
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
