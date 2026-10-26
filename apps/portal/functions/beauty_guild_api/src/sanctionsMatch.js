'use strict';
// Name screening against the UK sanctions list. Pure functions: the data comes from Analytics
// (analytics.js) and the orchestration is in riskChecks.js.
//
// A name is compared as a set of words, so reversed order and an added or missing middle name still
// match, and each word is compared with Jaro-Winkler so spelling variations count. Date of birth
// and country only move the score (they never clear a name match and are never required).
const STOP_WORDS = new Set([
  'ltd',
  'limited',
  'llc',
  'inc',
  'plc',
  'co',
  'company',
  'corp',
  'corporation',
  'the',
  'of',
  'and',
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
]);
const FOLD = { ß: 'ss', ø: 'o', æ: 'ae', œ: 'oe', đ: 'd', ł: 'l', ı: 'i' };
// Common transliteration variants that string distance alone scores too low.
const VARIANTS = [
  ['muhammad', 'mohammed', 'mohamed', 'mohammad', 'muhammed', 'mohamad', 'mohamet', 'mehmet', 'muhamad'],
  ['ahmed', 'ahmad', 'ahmet'],
  ['hussein', 'hussain', 'husain', 'hosein', 'husein'],
  ['yusuf', 'yousef', 'youssef', 'yusif', 'yousuf'],
  ['abdul', 'abdel', 'abdal', 'abd'],
  ['omar', 'umar', 'omer'],
  ['ali', 'aly'],
  ['aleksandr', 'alexander', 'alexandr', 'aleksandar', 'oleksandr'],
  ['sergey', 'sergei', 'serguei', 'serhiy'],
  ['vladimir', 'wladimir', 'volodymyr'],
  ['mikhail', 'mikhael', 'mihail'],
  ['yuri', 'yury', 'yuriy', 'iurii'],
  ['osama', 'usama'],
  ['khalid', 'khaled'],
  ['ibrahim', 'ebrahim', 'ibraheem'],
  ['mustafa', 'mostafa', 'moustafa'],
  ['hasan', 'hassan'],
];
const CANON = new Map();
for (const group of VARIANTS) for (const w of group) CANON.set(w, group[0]);
// Two different words must be this alike to count as the same name word. 0.88 keeps spelling variants (Smith and Smyth score 0.89) and
// drops different names that merely look similar (Khawar and Khair score 0.88).
const MIN_TOKEN = 0.88;

// "José  O'Brien-Smith" -> ['jose', 'o', 'brien', 'smith']. Words with no Latin letters or digits vanish.
function tokens(value) {
  const s = String(value == null ? '' : value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ßøæœđłı]/g, c => FOLD[c]);
  return s
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(t => t && !STOP_WORDS.has(t));
}

function jaro(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false),
    bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (!bm[j] && a[i] === b[j]) {
        am[i] = bm[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let t = 0,
    k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  return (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
}
function jaroWinkler(a, b) {
  const j = jaro(a, b);
  let p = 0;
  while (p < 4 && p < a.length && p < b.length && a[p] === b[p]) p++;
  return j + p * 0.1 * (1 - j);
}
function tokenSimilarity(a, b) {
  if (a === b || (CANON.has(a) && CANON.get(a) === CANON.get(b))) return 1;
  // An initial is not evidence of the same name: "K" must never stand in for Khawar. Two identical initials are handled by a === b above.
  if (a.length === 1 || b.length === 1) return 0;
  return jaroWinkler(a, b);
}

// 0..1. Every word of the shorter name must match for a middle-name difference to be forgiven, and
// then only when that shorter name has at least two words (a lone surname never matches a full name).
// Initials are dropped from a name that has at least two full words (they stand for middle names), and kept otherwise.
const withoutInitials = words => {
  const full = words.filter(w => w.length > 1);
  return full.length >= 2 ? full : words;
};
function nameScore(subjectWords, candidateWords) {
  const subject = withoutInitials(subjectWords),
    candidate = withoutInitials(candidateWords);
  if (!subject.length || !candidate.length) return 0;
  const pairs = [];
  subject.forEach((s, i) =>
    candidate.forEach((c, j) => {
      const sim = tokenSimilarity(s, c);
      if (sim >= MIN_TOKEN) pairs.push({ i, j, sim });
    }),
  );
  pairs.sort((x, y) => y.sim - x.sim);
  const usedS = new Set(),
    usedC = new Set();
  let sum = 0,
    count = 0;
  for (const p of pairs) {
    if (usedS.has(p.i) || usedC.has(p.j)) continue;
    usedS.add(p.i);
    usedC.add(p.j);
    sum += p.sim;
    count++;
  }
  const small = Math.min(subject.length, candidate.length);
  let score = (2 * sum) / (subject.length + candidate.length);
  if (small >= 2 && count >= small) score = Math.max(score, (sum / small) * 0.97);
  return score;
}

const years = v => [...String(v == null ? '' : v).matchAll(/\b(\d{4})\b/g)].map(m => m[1]);
const NAME_COLUMNS = ['Name 1', 'Name 2', 'Name 3', 'Name 4', 'Name 5', 'Name 6'];

// Rows from the list (one per name variant) -> one entry per designation with all its names.
function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const id = String(row['Unique ID'] || row['OFSI Group ID'] || '').trim();
    if (!id) continue;
    let g = groups.get(id);
    if (!g) {
      g = {
        id,
        group: String(row['OFSI Group ID'] || ''),
        type: String(row['Designation Type'] || ''),
        names: [],
        years: new Set(),
        countries: new Set(),
      };
      groups.set(id, g);
    }
    const words = tokens(
      NAME_COLUMNS.map(c => row[c])
        .filter(Boolean)
        .join(' '),
    );
    const type = String(row['Name type'] || '').toLowerCase(),
      strength = String(row['Alias strength'] || '').toLowerCase();
    if (words.length)
      g.names.push({
        words,
        text: NAME_COLUMNS.map(c => String(row[c] || '').trim())
          .filter(Boolean)
          .join(' '),
        alias: type.includes('alias'),
        low: strength.includes('low'),
      });
    for (const y of years(row['D.O.B'])) g.years.add(y);
    for (const c of [row['Address Country'], row['Nationality(/ies)']])
      for (const part of String(c || '').split(/[|,;]/)) if (part.trim()) g.countries.add(part.trim().toLowerCase());
  }
  return [...groups.values()];
}

// subject: {name, dob?, country?}. Returns the credible matches, best first.
function screenSubject(subject, groups, { threshold = 0.88 } = {}) {
  const words = tokens(subject.name),
    dobYear = years(subject.dob)[0] || null,
    country = String(subject.country || '')
      .trim()
      .toLowerCase();
  const hits = [];
  for (const g of groups) {
    let best = null;
    for (const n of g.names) {
      const s = nameScore(words, n.words) * (n.low ? 0.97 : 1);
      if (!best || s > best.score) best = { score: s, name: n.text, alias: n.alias };
    }
    if (!best || best.score < MIN_TOKEN) continue;
    let score = best.score;
    if (dobYear && g.years.size) score += g.years.has(dobYear) ? 0.05 : -0.1;
    if (country && g.countries.has(country)) score += 0.02;
    score = Math.min(1, score);
    if (score >= threshold)
      hits.push({
        id: g.id,
        group: g.group,
        name: best.name,
        alias: best.alias,
        designation: g.type,
        score: Math.round(score * 1000) / 1000,
      });
  }
  return hits.sort((a, b) => b.score - a.score);
}

// First letters of each usable word, to pull a small candidate set from Analytics (see riskChecks.js).
function searchPrefixes(name) {
  return [
    ...new Set(
      tokens(name)
        .filter(t => t.length >= 3 && /^[a-z0-9]+$/.test(t))
        .map(t => t.slice(0, 4)),
    ),
  ];
}

// Two-letter words (Ng, Li, Bo) would pull thousands of rows as a prefix, so they are looked up exactly instead.
function searchTerms(name) {
  const words = tokens(name).filter(t => /^[a-z0-9]+$/.test(t));
  return {
    prefixes: [...new Set(words.filter(t => t.length >= 3).map(t => t.slice(0, 4)))],
    exact: [...new Set(words.filter(t => t.length === 2))],
  };
}

module.exports = {
  searchTerms,
  tokens,
  jaroWinkler,
  tokenSimilarity,
  nameScore,
  groupRows,
  screenSubject,
  searchPrefixes,
  NAME_COLUMNS,
};
