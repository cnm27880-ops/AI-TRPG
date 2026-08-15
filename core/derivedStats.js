// 衍生屬性計算 —— 六維輕量版

export const DEFAULT_SIZE = 5;

export function maxHitPoints(constitution, size = DEFAULT_SIZE) {
  return constitution + size;
}

export function maxWillpower(willpower) {
  return willpower * 2;
}

export function initiativeScore(agility, perception) {
  return agility + perception;
}

export function baseDefense(agility, perception) {
  return Math.min(agility, perception);
}

export function sensoryRangeMeters(perception) {
  return perception * 10;
}

export function computeDerivedStats(attributes, { size = DEFAULT_SIZE } = {}) {
  const con = attributes["耐力"] ?? 1;
  const wil = attributes["意志"] ?? 1;
  const agi = attributes["敏捷"] ?? 1;
  const per = attributes["感知"] ?? 1;

  const hpMax = maxHitPoints(con, size);
  const wpMax = maxWillpower(wil);

  return {
    size,
    hp: { max: hpMax, intact: hpMax, B: 0, L: 0, A: 0 },
    willpower: { max: wpMax, current: wpMax, temp: 0 },
    initiative: initiativeScore(agi, per),
    baseDefense: baseDefense(agi, per),
    sensoryRangeMeters: sensoryRangeMeters(per),
  };
}
