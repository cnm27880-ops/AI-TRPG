// [設計] 商品效果詞彙表 —— 「簡化規則適用的商品」到底能做什麼的封閉清單。
//
// 這是整個主神商店架構的核心限制，也是本專案第4條最高原則(「數值系統一律要有嚴格公式，
// 不交給AI臨場發揮」)在型錄轉換上的具體落實：
//
//   規則書的資源型錄有 500+ 頁，每個條目的「特性」是一段自由文字，寫的是完整版規則的語言
//   （高速、破甲、格擋加值、洞察加值、專業、能量池、技能樹、豁免、劇痛點數、體積、
//   友方單位…）。本專案的規則已經被大幅簡化過(六維十技能、單一防御DC、單一護甲值、
//   沒有專業、沒有不良狀態、單人無隊友)，那些詞彙在這個引擎裡**沒有對應的欄位可以寫**。
//
//   所以轉換不是「把文字搬進JSON」，而是：**每個特性都必須落到下面這張表的其中一種效果，
//   落不進去的就明確記成 droppedTraits，寫清楚為什麼落不進去。** 不允許出現第三種下場
//   ——尤其不允許「寫進JSON、看起來有效、實際上沒有任何程式碼會讀它」，那正是這個專案
//   在 ARCHITECTURE.md「專業(specialization)系統：決定不做」那則決策記錄裡拆掉的東西。
//
// 條件式效果的紅線：
//   書上大量效果帶有情境條件（「位於酒館時」「對沒有盔甲的目標」「每天一次」）。引擎無法
//   判斷這些條件是否成立，如果照收，就等於讓 AI 在敘事時決定加值有沒有生效——那是被禁止的。
//   因此 EFFECT_KINDS 裡的檢定類效果**只接受 attribute/skill 這種引擎自己看得懂的匹配鍵**，
//   一律常態生效。任何需要臨場判斷的條件，只有兩條路：降級成 `敘事`(明確標記無數值效果)，
//   或進 droppedTraits。
//
// [決策記錄 2026-08-17] 「型態」是這條紅線唯一的例外，而且它不是把紅線放寬，是換了一個
//   守門員。變身/爆發類效果（血統整類的價值幾乎都在這裡）帶的條件是「變身期間」，而
//   「有沒有在變身」這件事在 content/shop/forms.js 裡是一個**引擎自己持有、自己倒數、
//   自己到期**的狀態，不是 AI 敘事時的判斷。條件的裁判從 AI 換成程式碼，紅線的理由就不成立了。
//   因此型態內部的 grants 允許省略匹配鍵（「變身期間所有檢定+1」是書上原文，引擎算得出來），
//   但代價是型態必須付出啟動成本（意志力/動作）並且會過期——沒有成本或沒有期限的型態
//   等於把加值白送，那才是真正的放寬。這兩件事由 validateEffect() 擋住。

import { ATTRIBUTES, SKILLS } from "../../core/schema.js";
import { attackCheckKeys } from "../../core/combat/attackTypes.js";
import { POOL_DEFS, openPool } from "../../core/energyPools.js";
import { healDamage } from "../../core/health.js";
import { applyAffectionDelta } from "../affection.js";

const ATTRIBUTE_KEYS = new Set(ATTRIBUTES.map((a) => a.key));
const SKILL_KEYS = new Set(Object.values(SKILLS).flat());

/**
 * 效果種類 → 這個效果最後被寫進引擎的哪一個欄位。
 * `target` 欄位不是註解，是給接手者的接線圖：要新增效果種類，必須先指出它接到哪。
 */
export const EFFECT_KINDS = Object.freeze({
  屬性: { target: "character.attributes[attribute]", fields: ["attribute", "amount"], permanent: true },
  技能: { target: "character.skills[skill]", fields: ["skill", "amount"], permanent: true },
  生命上限: { target: "character.derived.hp.max", fields: ["amount"], permanent: true },
  意志上限: { target: "character.derived.willpower.max", fields: ["amount"], permanent: true },
  先攻: { target: "combatProfile.initiativeBonus", fields: ["amount"], permanent: true },
  防御: { target: "combatProfile.equipmentDefense → core/combat/defense.js", fields: ["amount"], permanent: true },
  護甲: { target: "combatProfile.armor → core/combat/armor.js", fields: ["amount"], permanent: true },
  檢定加骰: {
    target:
      "core/check.js 的 otherDpModifier(經 checkModifiersFor 查表)、" +
      "core/combat/resolveCombatAction.js 的 attackDpModifier(經 attackModifiersFor 查表)",
    fields: ["amount"],
    matcher: true,
  },
  附加成功: {
    target:
      "core/check.js 的 otherBonusSuccesses(經 checkModifiersFor 查表)、" +
      "core/combat/attack.js 的 attackBonusSuccesses(經 attackModifiersFor 查表)",
    fields: ["amount"],
    matcher: true,
  },
  武器: {
    target: "背包 → content/combat/placeholderEncounters.js 的武器形狀 → core/combat/attackTypes.js",
    fields: ["label", "attackType", "weaponDamage"],
  },
  治療: { target: "core/health.js 的傷勢軌(使用時才套用，不是購買時)", fields: ["severity", "amount"] },
  好感度: { target: "content/affection.js 的好感度點數", fields: ["amount"] },
  敘事: { target: "(無數值效果)只送進AI敘事的背景資訊", fields: ["text"] },
  能量池: {
    target: "character.derived.energyPools → core/energyPools.js(購買當下開池，上限＝關鍵屬性之和)",
    fields: ["pool"],
    permanent: true,
  },
  型態: {
    target:
      "content/shop/forms.js 的 activeForms → 期間內把 grants 併進上面同一張效果表" +
      "(戰鬥中的消費端是 content/combat/encounterState.js)",
    fields: ["label", "activation", "duration", "grants"],
  },
});

/**
 * 檢定類效果的生效範圍。**三個值都是引擎自己分得出來的**，不需要任何臨場判斷：
 *   檢定 —— 只有 core/check.js 的一般檢定算數(走 checkModifiersFor)
 *   攻擊 —— 只有戰鬥攻擊算數(走 attackModifiersFor)
 *   全部 —— 兩邊都算(預設)
 *
 * [決策記錄 2026-08-17] 為什麼需要這個欄位：型錄裡「攻擊檢定+X」跟「XX技能檢定+X」是
 * 兩種不同的東西，先前引擎兩邊都表達不了——一般檢定與攻擊根本是兩條互不相干的程式路徑，
 * 商品效果只接在其中一條上。把兩條都接上之後，如果沒有 scope，一個「攻擊+2」的效果
 * 就會連帶讓所有力量檢定都+2，那是憑空放大。scope 讓範圍精確，而且判斷者是程式碼。
 */
export const EFFECT_SCOPES = Object.freeze(["檢定", "攻擊", "全部"]);

/** 型態可以授予的效果種類。刻意比整張詞彙表窄，理由見 validateFormEffect()。 */
export const GRANTABLE_EFFECT_KINDS = Object.freeze([
  "防御",
  "護甲",
  "先攻",
  "檢定加骰",
  "附加成功",
  "武器",
  "敘事",
]);

/**
 * 型態的持續時間單位。只有兩個，而且兩個都對應到引擎裡**已經在前進**的計數器：
 *   輪   —— content/combat/encounterState.js 的 combat.round(advanceTurn() 每輪 +1)
 *   場景 —— 一場戰鬥遭遇結束，或呼叫端明確宣告場景結束(endScene())
 * 不提供「10分鐘」「每天」這種單位，因為引擎沒有在走的時鐘去倒數它們——
 * 加一個沒有人會遞減的計時器，等於加一個永不過期的型態。
 */
export const FORM_DURATION_UNITS = Object.freeze(["輪", "場景"]);

/** 型態的啟動動作，對齊 core/combat/actionEconomy.js 的動作等級名稱。 */
export const FORM_ACTIVATION_ACTIONS = Object.freeze([
  "自由",
  "迅捷",
  "移動",
  "標準",
  "整輪",
  "全回合",
]);

/** 本引擎沒有實作、因此不可能被轉換成效果的規則書機制。轉換時用來把「為什麼被丟掉」講清楚。 */
export const UNSUPPORTED_MECHANICS = Object.freeze({
  高速: "簡化規則沒有高速(命中修正)這個軸，見 RULES_DIGEST 第9節",
  破甲: "護甲已簡化為單一Armor值減法，沒有破甲/穿透的中間層",
  格擋: "四層防御(基礎/閃避/洞察/格擋)已於2026-08-15合併成單一防御DC",
  加值類型: "書中的內在/修行/器械/士氣/招式/洞察加值疊加規則整套沒有實作，一律當作直接相加",
  專業: "專業系統已明確決定不做，見 ARCHITECTURE.md「專業(specialization)系統：決定不做」",
  能量池: "沒有能量池資料結構(character.derived.energyPools 目前永遠是空物件)",
  技能樹: "沒有技能樹，型錄的「開啟X級技能樹」在這裡沒有東西可以開",
  豁免: "沒有強韌/反射/意志豁免的獨立判定，全部走 core/check.js 的一般檢定",
  不良狀態:
    "暈眩/流血/劇痛/惡心/疲乏/燃燒/內耗點數等狀態軌**永久不實作**——" +
    "2026-08-17 使用者決定「太複雜了，全部刪除」，並會在簡化規則定案後自己重新平衡資源。" +
    "這一條跟「專業」同級：引用它等於說「這一條永遠轉不出來」，不是「等一輪就有」",
  體積: "體積只在生命值上限公式裡當常數5，沒有物品佔位/武器體積限制",
  隊友: "單人遊戲，沒有友方單位可以當目標(見 ARCHITECTURE.md 的 requiresAlly 提醒)",
  動作經濟細節: "行動經濟有實作，但「降低一級動作」「與移動結合」這類改寫還沒有接線",
  情境條件: "引擎無法判斷『在酒館時』『每天一次』這類條件，照收等於讓AI決定加值有沒有生效",
  移動速度: "沒有以公尺計的移動距離資料，戰鬥是抽象回合制",
  距離視野: "沒有視距/照明/敏感範圍的實際運算(derivedStats 有算出數字但沒有消費端)",
  重擲: "沒有重擲機制，core/dice.js 的加骰是骰面觸發的，不是玩家可以宣告的",
  長期計時:
    "引擎只有兩個會前進的時鐘：戰鬥輪與場景(見 forms.js 的 FORM_DURATION_UNITS)。" +
    "『10分鐘』『每天一次』『接下來5天』這種以真實時間計的期限與冷卻沒有東西可以倒數",
  傷害類型: "傷害不分類型(物理/能量/精神/火焰…全部一樣)，所以【防彈】【魔法】這種對特定類型的抗性或加成沒有欄位可寫",
  自然恢復:
    "沒有以真實時間為單位的自然恢復速率(『每10輪回復1點』這種)。" +
    "2026-08-17 起有『休息』(core/rest.js)：主神空間完全恢復、副本中打坐消耗3回合時間預算，" +
    "但那是玩家主動花代價換來的，不是隨時間自動流逝的恢復",
  傷勢惡化: "tickWorsening() 存在但整個遊戲迴圈裡沒有任何呼叫端，所以『免疫惡化』會是免疫一件不會發生的事",
  進階戰鬥動作: "全力一擊/衝鋒/擒抱/摔絆等進階動作刻意排除，見 RULES_DIGEST 第9節的已知排除",
});

function fail(errors, msg) {
  errors.push(msg);
}

/**
 * 匹配鍵可以寫成單數(attribute/skill)或複數(attributes/skills)。
 *
 * [決策記錄 2026-08-17] 複數形式是為了「生理系屬性」「心智系技能」這種書上極常見的**範圍**：
 * 先前一個效果只能指一個屬性，於是「所有基於生理系屬性的攻擊檢定+2」只能整條丟掉
 * (假面騎士EVOL 的攻擊強化就是這樣被丟掉的)。複數不是放寬匹配，是把「一組具名的鍵」
 * 一次寫齊——每一個鍵仍然要是六維十技能之一，仍然完全不需要臨場判斷。
 */
function matchAttributes(effect) {
  if (Array.isArray(effect.attributes)) return effect.attributes;
  return effect.attribute != null ? [effect.attribute] : [];
}

function matchSkills(effect) {
  if (Array.isArray(effect.skills)) return effect.skills;
  return effect.skill != null ? [effect.skill] : [];
}

function hasMatcher(effect) {
  return matchAttributes(effect).length > 0 || matchSkills(effect).length > 0;
}

/**
 * 這個效果適不適用於「屬性=X、技能=Y、範圍=scope」的這一次擲骰。
 * 規則跟先前一樣嚴：有寫屬性就必須命中其中一個，有寫技能就必須命中其中一個，
 * 兩邊都寫就兩邊都要命中。沒有模糊比對。
 */
function effectApplies(effect, { attribute, skill, scope }) {
  const effectScope = effect.scope ?? "全部";
  if (effectScope !== "全部" && effectScope !== scope) return false;
  const attributes = matchAttributes(effect);
  if (attributes.length > 0 && !attributes.includes(attribute)) return false;
  const skills = matchSkills(effect);
  if (skills.length > 0 && !skills.includes(skill)) return false;
  return true;
}

/**
 * 驗證一個「型態」效果本身(它的啟動成本、期限與 grants)。
 *
 * 三條硬性限制，每一條都是為了讓型態不會變成「免費的永久加值」：
 *
 * 1. **必須有啟動成本**(意志力至少1點，或一個動作等級)。書上的變身無一例外都要付代價，
 *    沒有代價的型態就沒有理由不永遠開著，那就該直接寫成常態效果。
 * 2. **必須有期限**，而且單位只能是引擎真的在遞減的那兩個(見 FORM_DURATION_UNITS)。
 * 3. **grants 只能是查詢型效果**(GRANTABLE_EFFECT_KINDS)。屬性/技能/生命上限/意志上限
 *    是購買當下就寫進角色卡的，型態結束時沒有辦法乾淨地收回來(要收回就得反推歷史，
 *    那正是 isPermanentStatEffect() 註解裡刻意避開的東西)；治療/好感度是「發生一次」的
 *    事件，放進一個會反覆開關的容器裡會變成無限回血。剩下的六種都是每次用到才查表的，
 *    型態一結束，下一次查表就自然查不到了。
 */
function validateFormEffect(effect, where, errors) {
  const activation = effect.activation;
  if (activation != null) {
    if (typeof activation !== "object") {
      fail(errors, `${where}(型態) 的 activation 必須是物件`);
    } else {
      const wp = activation.willpower ?? 0;
      if (!Number.isInteger(wp) || wp < 0) {
        fail(errors, `${where}(型態) 的 activation.willpower 必須是非負整數`);
      }
      if (activation.action != null && !FORM_ACTIVATION_ACTIONS.includes(activation.action)) {
        fail(
          errors,
          `${where}(型態) 的 activation.action「${activation.action}」不是動作等級之一：` +
            FORM_ACTIVATION_ACTIONS.join("/")
        );
      }
      if (activation.pool != null) {
        if (!POOL_DEFS[activation.pool.name]) {
          fail(
            errors,
            `${where}(型態) 的 activation.pool.name「${activation.pool.name}」還沒有登錄關鍵屬性，` +
              `合法值：${Object.keys(POOL_DEFS).join("/")}`
          );
        }
        if (!Number.isInteger(activation.pool.amount) || activation.pool.amount <= 0) {
          fail(errors, `${where}(型態) 的 activation.pool.amount 必須是正整數`);
        }
      }
      if (wp === 0 && activation.action == null && activation.pool == null) {
        fail(
          errors,
          `${where}(型態) 沒有任何啟動成本(意志力與動作都沒有)——` +
            `沒有代價的型態沒有理由不永遠開著，那應該直接寫成常態效果，不要用型態包一層`
        );
      }
    }
  }

  const duration = effect.duration;
  if (duration != null) {
    if (typeof duration !== "object") {
      fail(errors, `${where}(型態) 的 duration 必須是物件`);
    } else if (!FORM_DURATION_UNITS.includes(duration.unit)) {
      fail(
        errors,
        `${where}(型態) 的 duration.unit「${duration.unit}」不合法，合法值：${FORM_DURATION_UNITS.join("/")}` +
          `——只有這兩個單位對應得到引擎裡真的在前進的計數器`
      );
    } else if (duration.unit === "輪") {
      // 輪數可以寫死，也可以掛在一個屬性上——書上大量寫成「持續你的感知值*1輪」，
      // 那是引擎算得出來的數字(不是 AI 判斷)，所以兩種寫法都收，但只能二選一。
      const hasFixed = duration.rounds != null;
      const hasScaled = duration.roundsFromAttribute != null;
      if (hasFixed && hasScaled) {
        fail(errors, `${where}(型態) 的 duration 不能同時寫 rounds 與 roundsFromAttribute，二選一`);
      } else if (hasScaled) {
        if (!ATTRIBUTE_KEYS.has(duration.roundsFromAttribute)) {
          fail(
            errors,
            `${where}(型態) 的 duration.roundsFromAttribute「${duration.roundsFromAttribute}」不是六維之一`
          );
        }
      } else if (!Number.isInteger(duration.rounds) || duration.rounds <= 0) {
        fail(errors, `${where}(型態) 以「輪」計時，duration.rounds 必須是正整數(或改用 roundsFromAttribute)`);
      }
    }
  }

  if (effect.grants != null) {
    if (!Array.isArray(effect.grants)) {
      fail(errors, `${where}(型態) 的 grants 必須是陣列`);
    } else if (effect.grants.length === 0) {
      fail(errors, `${where}(型態) 的 grants 是空陣列——一個什麼都不給的型態不該存在`);
    } else {
      effect.grants.forEach((grant, i) => {
        const gw = `${where}(型態) grants[${i}]`;
        if (grant?.kind === "型態") {
          fail(errors, `${gw} 又是一個型態——型態不可以巢狀(變身中再變身沒有定義，也沒有消費端)`);
          return;
        }
        if (grant?.kind != null && EFFECT_KINDS[grant.kind] && !GRANTABLE_EFFECT_KINDS.includes(grant.kind)) {
          fail(
            errors,
            `${gw} 的 kind「${grant.kind}」不能由型態授予，可授予的只有：${GRANTABLE_EFFECT_KINDS.join("/")}` +
              `——「${grant.kind}」是購買當下寫進角色卡或當場發生一次的效果，型態結束時收不回來`
          );
          return;
        }
        errors.push(...validateEffect(grant, gw, { insideForm: true }));
      });
    }
  }
}

/**
 * 驗證單一效果的結構。回傳錯誤陣列(空陣列=合法)。
 * @param {object} effect
 * @param {string} where 錯誤訊息用的位置描述
 * @param {{ insideForm?: boolean }} [opts] insideForm：這個效果是某個「型態」的 grants 之一。
 *   型態內部的檢定類效果可以省略匹配鍵，理由見本檔案開頭 2026-08-17 的決策記錄。
 */
export function validateEffect(effect, where = "effect", { insideForm = false } = {}) {
  const errors = [];
  if (!effect || typeof effect !== "object") {
    return [`${where} 不是物件`];
  }
  const spec = EFFECT_KINDS[effect.kind];
  if (!spec) {
    return [`${where} 的 kind「${effect.kind}」不在詞彙表中，合法值：${Object.keys(EFFECT_KINDS).join("/")}`];
  }
  for (const field of spec.fields) {
    if (effect[field] == null) fail(errors, `${where}(${effect.kind}) 缺少必要欄位「${field}」`);
  }
  for (const attribute of matchAttributes(effect)) {
    if (!ATTRIBUTE_KEYS.has(attribute)) {
      fail(errors, `${where} 的屬性「${attribute}」不是六維之一：${[...ATTRIBUTE_KEYS].join("/")}`);
    }
  }
  for (const skill of matchSkills(effect)) {
    if (!SKILL_KEYS.has(skill)) {
      fail(errors, `${where} 的技能「${skill}」不是十技能之一：${[...SKILL_KEYS].join("/")}`);
    }
  }
  if (effect.attributes != null && !Array.isArray(effect.attributes)) {
    fail(errors, `${where} 的 attributes 必須是陣列(單一屬性請用 attribute)`);
  }
  if (effect.skills != null && !Array.isArray(effect.skills)) {
    fail(errors, `${where} 的 skills 必須是陣列(單一技能請用 skill)`);
  }
  if (effect.scope != null && !EFFECT_SCOPES.includes(effect.scope)) {
    fail(errors, `${where} 的 scope「${effect.scope}」不合法，合法值：${EFFECT_SCOPES.join("/")}`);
  }
  if (effect.scope != null && !spec.matcher) {
    fail(errors, `${where}(${effect.kind}) 不是檢定類效果，不該有 scope`);
  }
  // 型態內部不要求匹配鍵：那裡的「何時生效」由 forms.js 的啟動狀態決定，不是由 AI 決定。
  if (spec.matcher && !insideForm && !hasMatcher(effect)) {
    fail(
      errors,
      `${where}(${effect.kind}) 必須指定 attribute 或 skill 至少一項當匹配鍵——` +
        `沒有匹配鍵的檢定加值等於「所有檢定都加」或「靠AI判斷何時生效」，兩者都不允許` +
        `(唯一的例外是寫在型態的 grants 裡，那時候生效範圍由型態的開關決定)`
    );
  }
  if (effect.kind === "能量池" && effect.pool != null && !POOL_DEFS[effect.pool]) {
    fail(
      errors,
      `${where}(能量池) 的「${effect.pool}」還沒有登錄關鍵屬性，` +
        `合法值：${Object.keys(POOL_DEFS).join("/")}。` +
        `新增池子要先在 core/energyPools.js 的 POOL_DEFS 補上關鍵屬性與行號出處——` +
        `沒有關鍵屬性就算不出上限，那個池子會是一個永遠是0的容器`
    );
  }
  if (effect.kind === "型態") {
    validateFormEffect(effect, where, errors);
  }
  if (effect.amount != null && !Number.isInteger(effect.amount)) {
    fail(errors, `${where} 的 amount 必須是整數(簡化規則沒有小數加值)`);
  }
  if (effect.kind === "治療" && !["B", "L", "A"].includes(effect.severity)) {
    fail(errors, `${where}(治療) 的 severity 必須是 B/L/A 之一`);
  }
  if (effect.kind === "武器" && effect.severity != null && !["B", "L"].includes(effect.severity)) {
    fail(errors, `${where}(武器) 的 severity 只支援 B/L(惡性傷害武器不在簡化規則的武器資料形狀裡)`);
  }
  return errors;
}

/**
 * 一個效果是不是「買下去當場就永久改角色卡」的類型。
 * 其餘的(檢定加骰/附加成功/武器/治療/好感度/敘事)都是持有期間查表生效，不改角色卡本身，
 * 這樣洗點(退貨)才不需要反推歷史。
 */
export function isPermanentStatEffect(effect) {
  return EFFECT_KINDS[effect.kind]?.permanent === true;
}

/**
 * 把永久型效果套用到角色卡上，回傳新的角色卡(不改動傳入物件)。
 * 非永久型效果會被忽略——它們由 checkModifiersFor()/combatProfileFrom()/背包在使用當下查表。
 */
export function applyPermanentEffects(character, effects = []) {
  const next = {
    ...character,
    attributes: { ...character.attributes },
    skills: { ...character.skills },
    derived: {
      ...character.derived,
      hp: { ...character.derived.hp },
      willpower: { ...character.derived.willpower },
      energyPools: { ...(character.derived.energyPools ?? {}) },
    },
  };
  for (const effect of effects) {
    if (!isPermanentStatEffect(effect)) continue;
    switch (effect.kind) {
      case "屬性":
        next.attributes[effect.attribute] = (next.attributes[effect.attribute] ?? 0) + effect.amount;
        break;
      case "技能":
        next.skills[effect.skill] = (next.skills[effect.skill] ?? 0) + effect.amount;
        break;
      case "生命上限":
        // 上限提高時，多出來的那幾點以「完好」入帳(不是免費治療，是身體變大了)。
        next.derived.hp.max += effect.amount;
        next.derived.hp.intact += effect.amount;
        break;
      case "意志上限":
        next.derived.willpower.max += effect.amount;
        next.derived.willpower.current += effect.amount;
        break;
      case "能量池":
        // 開池要知道是「哪個資源開的」，因為書上的重複開啟補償要求來源必須完全不同。
        next.derived.energyPools = openPool(
          next.derived.energyPools ?? {},
          effect.pool,
          next.attributes,
          effect.source ?? "未具名來源"
        );
        break;
      case "先攻":
      case "防御":
      case "護甲":
        // 這三個永久效果不寫在角色卡上，而是每次戰鬥由 combatProfileFrom() 從持有物重算，
        // 這樣賣掉/洗點時不用回推。標記為 permanent 是為了跟「條件式檢定加值」區分：
        // 它們是常態生效的，不需要匹配鍵。
        break;
      default:
        break;
    }
  }
  return next;
}

/**
 * 一次檢定/一次戰鬥要看的效果來源清單 = 角色持有的商品 ＋ 目前正在進行中的型態。
 *
 * 型態的 grants 之所以能用「跟持有商品一模一樣的形狀」併進來，是因為它們本來就是同一張
 * 詞彙表的效果，差別只在**現在算不算數**。這個函式是那個「算不算數」的唯一接縫：
 * 上面的三個查表函式都經過它，所以型態一到期，下一次查表自然就查不到了，
 * 不需要任何人記得去回收加值。extraSources 由 content/shop/forms.js 的
 * activeGrantSources() 產生。
 */
function effectSources(character, extraSources = []) {
  return [...(character.abilities ?? []), ...extraSources];
}

/**
 * 查詢「這次檢定」該吃到多少加骰與附加成功。
 * 由 content/checkIntent.js / content/turnOptions.js 在組 performCheck() 參數時呼叫。
 *
 * 匹配規則刻意寫得很嚴：效果有寫 attribute 就必須跟這次檢定的屬性一致，有寫 skill 就必須
 * 跟技能一致，兩個都寫就都要一致。沒有模糊比對，沒有「相關檢定」這種需要判斷的字眼。
 * 型態授予的加骰可以兩個都沒寫(那是「變身期間所有檢定」)，於是對任何檢定都成立。
 * @param {{ abilities?: object[] }} character
 * @param {{ attribute?: string, skill?: string }} check
 * @param {{ extraSources?: object[] }} [opts]
 */
export function checkModifiersFor(character, { attribute, skill } = {}, { extraSources = [] } = {}) {
  return gatherModifiers(character, { attribute, skill, scope: "檢定" }, extraSources);
}

/** checkModifiersFor 與 attackModifiersFor 共用的那一段。 */
function gatherModifiers(character, { attribute, skill, scope }, extraSources) {
  let dp = 0;
  let bonusSuccesses = 0;
  const sources = [];
  for (const owned of effectSources(character, extraSources)) {
    for (const effect of owned.effects ?? []) {
      if (effect.kind !== "檢定加骰" && effect.kind !== "附加成功") continue;
      if (!effectApplies(effect, { attribute, skill, scope })) continue;
      if (effect.kind === "檢定加骰") dp += effect.amount;
      else bonusSuccesses += effect.amount;
      sources.push(`${owned.name}(${effect.kind}${effect.amount >= 0 ? "+" : ""}${effect.amount})`);
    }
  }
  return { dp, bonusSuccesses, sources };
}

/**
 * 查詢「這次戰鬥攻擊」該吃到多少加骰與附加成功。
 *
 * [決策記錄 2026-08-17] 在這個函式出現之前，商品的檢定加值**只影響敘事迴圈的檢定，
 * 完全不影響戰鬥攻擊**——因為攻擊走的是 resolveCombatAction()/attackTypes.js，
 * 那條路徑從來沒有查過效果表。同一個「+2DP」的加值在兩種場合行為不一致，
 * 而玩家不會知道；這比完全不生效更糟，因為它看起來是有效的。
 *
 * 匹配用的屬性/技能來自 core/combat/attackTypes.js 的 ATTACK_CHECK_KEYS，
 * 也就是那種攻擊方式的公式裡本來就在用的那兩個欄位——不是另外發明的對應關係。
 * @param {object} character
 * @param {string} attackType core/combat/attackTypes.js 的 key
 * @param {{ extraSources?: object[] }} [opts]
 */
export function attackModifiersFor(character, attackType, { extraSources = [] } = {}) {
  const { attribute, skill } = attackCheckKeys(attackType);
  return gatherModifiers(character, { attribute, skill, scope: "攻擊" }, extraSources);
}

/**
 * 把持有商品(與進行中型態)的檢定加值併進一組 performCheck() 參數。
 *
 * [決策記錄 2026-08-17] 在這個函式出現之前，checkModifiersFor() 的唯一呼叫端是測試——
 * 也就是說整個「專長」貨架(8件商品的價值幾乎都是檢定加值)買了以後在真實遊戲裡完全不生效。
 * 那正是 CONVERSION_RULES.md 第1節在講的「看起來有效、實際上沒有程式碼會讀它」，
 * 只是這次漏掉的不是欄位，是最後一段接線。三個 API 進入點(check/turn/narrate)現在都經過這裡。
 *
 * 刻意用「加上去」而不是「覆蓋」：呼叫端傳進來的 otherDpModifier 是情境調整(套路遞減之類)，
 * 商品加值是另一回事，兩者要並存。
 */
export function applyCheckModifiers(character, params, { extraSources = [] } = {}) {
  if (!params) return { params, modifiers: null };
  const modifiers = checkModifiersFor(
    character,
    { attribute: params.attribute, skill: params.skill },
    { extraSources }
  );
  if (modifiers.dp === 0 && modifiers.bonusSuccesses === 0) return { params, modifiers: null };
  return {
    params: {
      ...params,
      otherDpModifier: (params.otherDpModifier ?? 0) + modifiers.dp,
      otherBonusSuccesses: (params.otherBonusSuccesses ?? 0) + modifiers.bonusSuccesses,
    },
    modifiers,
  };
}

/**
 * 從持有物重算戰鬥用檔案(core/character.js 的 emptyCombatProfile 形狀 + initiativeBonus)。
 * skillCorrection 仍由呼叫端算(它是 max(格鬥,體魄) 技能等級，不是商品給的)。
 */
export function combatProfileFrom(character, { skillCorrection = 0, extraSources = [] } = {}) {
  let equipmentDefense = 0;
  let armor = 0;
  let initiativeBonus = 0;
  for (const owned of effectSources(character, extraSources)) {
    for (const effect of owned.effects ?? []) {
      if (effect.kind === "防御") equipmentDefense += effect.amount;
      else if (effect.kind === "護甲") armor += effect.amount;
      else if (effect.kind === "先攻") initiativeBonus += effect.amount;
    }
  }
  return { skillCorrection, equipmentDefense, armor, initiativeBonus };
}

/**
 * 使用一件消耗品(或一次療傷服務)的即時效果。
 * 跟 applyPermanentEffects 分開的理由：治療與好感度是「使用當下發生一次」的事件，
 * 不是持有期間常態生效的加值，混在一起會讓「買了藥水放著沒喝」也自動回血。
 *
 * @param {{ hp: object, affectionPoints?: number }} state
 * @returns {{ hp: object, affectionPoints: number, applied: string[] }}
 */
export function applyInstantEffects(state, effects = []) {
  let hp = state.hp;
  let affectionPoints = state.affectionPoints ?? 0;
  const applied = [];
  for (const effect of effects) {
    if (effect.kind === "治療") {
      const before = hp[effect.severity] ?? 0;
      hp = healDamage(hp, effect.amount, effect.severity);
      applied.push(`治療${effect.severity}傷 ${Math.min(effect.amount, before)}點`);
    } else if (effect.kind === "好感度") {
      affectionPoints = applyAffectionDelta(affectionPoints, effect.amount).points;
      applied.push(`好感度 ${effect.amount >= 0 ? "+" : ""}${effect.amount}`);
    }
  }
  return { hp, affectionPoints, applied };
}

/** 從持有物撈出所有武器，形狀直接對齊 content/combat/placeholderEncounters.js 的武器物件。 */
export function weaponsFrom(character, { extraSources = [] } = {}) {
  const weapons = [];
  for (const owned of effectSources(character, extraSources)) {
    for (const effect of owned.effects ?? []) {
      if (effect.kind !== "武器") continue;
      weapons.push({
        key: `${owned.goodId}:${effect.label}`,
        label: effect.label,
        attackType: effect.attackType,
        weaponDamage: effect.weaponDamage,
        severity: effect.severity ?? "B",
        ranged: effect.ranged ?? false,
        ...(effect.weaponRange != null ? { weaponRange: effect.weaponRange } : {}),
        sourceGood: owned.name,
      });
    }
  }
  return weapons;
}
