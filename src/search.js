// Hybrid ranking: BM25-style keyword search plus cosine similarity, added and
// curved into the 0-10 score. Pure logic, shared by the page and the test script.
const STOP = new Set('a am an and are as at be been being but by can could d did do does doing for from had has have having he her his how i if in is it its just ll m me my no not of on only or our re s she so t than that the their them then there these they this those to too ve very was we were what when where which who will with would you your'.split(' '));
// Words that describe the search rather than the strip ("a strip about..."), dropped from queries only.
const QUERY_STOP = new Set(['strip', 'comic', 'cartoon', 'panel']);
const FIELD_WEIGHT = { title: 3, characters: 2, themes: 2, concepts: 2, keywords: 2, situation: 1, punchline: 1, summary: 1, transcript: 1 };
// Words to look up together, since people and the extracted data word things differently.
const SYNONYM_GROUPS = [
  'colleague coworker', 'job work duty function task', 'boss manager', 'told tell ask', 'resource headcount staff',
  'impossible unreasonable unrealistic', 'metric number measure estimate kpi', 'random arbitrary guess meaningless',
  'suggest propose recommend', 'request ask demand', 'project initiative force', 'same duplicate redundant overlap',
  'communication coordination', 'meeting conference', 'stupid idiot incompetent', 'fire layoff downsizing',
  'salary pay raise compensation', 'customer client', 'deadline schedule', 'software code program',
  'budget cost funding', 'pointless useless meaningless',
];
const SEM_LOW = 0.45, SEM_HIGH = 0.75, SEM_WEIGHT = 0.65, KEYWORD_WEIGHT = 1.2, SYNONYM_WEIGHT = 0.7, CURVE = 1.5, MIN_SCORE = 3, MAX_RESULTS = 25;
const CHARACTER_WEIGHT = 0.25, DATE_WEIGHT = 0.3;
// Taken off the cosine of each view (description, summary, dialogue) before the best one is used.
export const VIEW_OFFSET = [0, 0.05, 0.1];
// Ranking extras, off until tools/eval.mjs shows they help. Try them with `npm run eval -- --with=all`. views is on: it did.
export const FEATURES = { characters: false, dates: false, views: true };
// Words people use for a character, matched against the strip's characters (lowercased).
// Dilbert is left out: he is in most strips, so naming him says little.
const CHARACTERS = [
  [['the boss', 'pointy haired boss'], ['phb', 'pointy haired', 'pointy hair', 'pointyhaired']],
  [['dogbert'], ['dogbert', 'the dog', 'his dog', 'dilbert s dog']],
  [['catbert'], ['catbert', 'evil hr director', 'hr director', 'the cat', 'hr cat']],
  [['ratbert'], ['ratbert', 'the rat']],
  [['wally'], ['wally']], [['alice'], ['alice']], [['asok'], ['asok', 'the intern']],
  [['carol'], ['carol', 'the boss s secretary']], [['ted'], ['ted']], [['tina'], ['tina', 'tech writer', 'technical writer']],
  [['mordac'], ['mordac', 'preventer of information']], [['phil'], ['phil', 'prince of insufficient light']],
  [['garbage man'], ['garbage man', 'garbageman', 'trash man', 'garbage collector']],
  [['bob', 'dinosaur'], ['dinosaur', 'bob the dinosaur']], [["dilbert's mom"], ['dilbert s mom', 'dilbert s mother']],
  [['elbonian', 'elbonians'], ['elbonia', 'elbonian', 'elbonians']], [['loud howard'], ['loud howard']], [['topper'], ['topper']],
];
const FIRST_YEAR = 1989, LAST_YEAR = 2023;

const stem = (t) => {
  const plain = t.length > 3 ? t.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : m === 'es' ? 'e' : '')) : t;
  return plain.length > 5 ? plain.replace(/(ing|ed)$/, '') : plain;
};

export const terms = (text) => text.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
  .split(/[^\p{L}\p{N}]+/u).filter((t) => t && !STOP.has(t)).map(stem);

const SYNONYMS = {};
for (const group of SYNONYM_GROUPS) {
  const words = group.split(' ').map(stem);
  for (const w of words) SYNONYMS[w] = [...new Set([...(SYNONYMS[w] || []), ...words.filter((x) => x !== w)])];
}

const fields = (s) => ({
  title: s.title, characters: s.characters.join(' '), themes: s.themes.join(' '), concepts: s.enterprise_concepts.join(' '),
  keywords: s.keywords.join(' '), situation: s.situation, punchline: s.punchline, summary: s.summary,
  transcript: s.transcript.map((l) => l.text).join(' '),
});

export function buildKeywordIndex(strips) {
  const postings = new Map();
  let total = 0;
  const lengths = strips.map((s, i) => {
    const counts = new Map();
    let len = 0;
    for (const [name, text] of Object.entries(fields(s))) {
      for (const t of terms(text)) {
        counts.set(t, (counts.get(t) || 0) + FIELD_WEIGHT[name]);
        len += FIELD_WEIGHT[name];
      }
    }
    for (const [t, c] of counts) {
      if (!postings.has(t)) postings.set(t, []);
      postings.get(t).push([i, c]);
    }
    total += len;
    return len;
  });
  const characters = strips.map((s) => new Set(s.characters.map((c) => c.toLowerCase())));
  const years = Int16Array.from(strips, (s) => +s.date.slice(0, 4));
  return { postings, characters, years, lengths, avg: total / strips.length, n: strips.length };
}

const idfOf = (index, t) => Math.log(1 + (index.n + 0.5) / ((index.postings.get(t)?.length || 0) + 0.5));
// Lowercase words with stop words kept, padded with spaces for whole-word matching of aliases.
const plain = (text) => ` ${text.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')} `;

// Finds a year, a year range or a decade ("1995", "1995 to 1998", "the late 90s"), and the query without it.
export function parseDates(query) {
  if (!FEATURES.dates) return { range: null, rest: query };
  const clip = (a, b) => [Math.max(FIRST_YEAR, a), Math.min(LAST_YEAR, b)];
  const year = '(19[89]\\d|20[0-2]\\d)', lead = "(?:\\b(?:in|from|during|around|of|between)\\s+)?(?:the\\s+)?";
  const rules = [
    [new RegExp(`${lead}\\b${year}\\s*(?:-|–|to|and|until)\\s*${year}\\b`, 'i'), (m) => clip(+m[1], +m[2])],
    [new RegExp(`${lead}\\b(early|mid|late)?[\\s-]*(?:19([89])0|20([0-2])0|'?([89])0)'?s\\b`, 'i'), (m) => {
      const start = m[2] ? 1900 + 10 * m[2] : m[3] !== undefined ? 2000 + 10 * m[3] : 1900 + 10 * m[4];
      const part = { early: [0, 3], mid: [3, 6], late: [6, 9] }[m[1]?.toLowerCase()] || [0, 9];
      return clip(start + part[0], start + part[1]);
    }],
    [new RegExp(`${lead}\\b(early|mid|late)?[\\s-]*(eighties|nineties)\\b`, 'i'), (m) => {
      const start = m[2].toLowerCase() === 'eighties' ? 1980 : 1990;
      const part = { early: [0, 3], mid: [3, 6], late: [6, 9] }[m[1]?.toLowerCase()] || [0, 9];
      return clip(start + part[0], start + part[1]);
    }],
    [new RegExp(`\\b(before|after|since)\\s+${year}\\b`, 'i'), (m) => (m[1].toLowerCase() === 'before' ? clip(FIRST_YEAR, +m[2] - 1) : clip(+m[2], LAST_YEAR))],
    [new RegExp(`${lead}\\b${year}\\b`, 'i'), (m) => clip(+m[1], +m[1])],
  ];
  for (const [re, toRange] of rules) {
    const m = query.match(re);
    if (m) {
      const range = toRange(m);
      if (range[0] <= range[1]) return { range, rest: (query.slice(0, m.index) + ' ' + query.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() };
    }
  }
  return { range: null, rest: query };
}
// The text to embed for a query, so a date in it does not pull the meaning match off course.
export const embeddingText = (query) => parseDates(query).rest || query;

// Indexes of the CHARACTERS entries the query names.
function namedCharacters(query) {
  const q = plain(query);
  return CHARACTERS.filter(([, aliases]) => aliases.some((a) => q.includes(` ${a} `))).map(([names]) => names);
}

function keywordScores(index, qTerms) {
  const k1 = 1.2, b = 0.75;
  const uniq = [...new Set(qTerms)];
  const scores = new Float32Array(index.n);
  const idf = (t) => idfOf(index, t);
  const maxTotal = uniq.reduce((a, t) => a + idf(t), 0) || 1;
  const add = (t, weight) => {
    for (const [i, c] of index.postings.get(t) || []) {
      const tf = (c * (k1 + 1)) / (c + k1 * (1 - b + b * index.lengths[i] / index.avg));
      scores[i] += (weight * idf(t) * tf) / (k1 + 1);
    }
  };
  for (const t of uniq) {
    add(t, 1);
    for (const syn of SYNONYMS[t] || []) add(syn, SYNONYM_WEIGHT);
  }
  return scores.map((s) => Math.min(1, s / maxTotal));
}

// vectors: Int8Array of n * views * dim values, each unit vector scaled by 127. Only the first view is used unless FEATURES.views is on.
// Returns every strip's unrounded 0-10 score, for search() and the eval script.
export function scoreAll(index, vectors, dim, queryVec, query) {
  const { range, rest } = parseDates(query);
  const qTerms = terms(rest).filter((t) => !QUERY_STOP.has(t));
  const kw = keywordScores(index, qTerms);
  const named = FEATURES.characters ? namedCharacters(query) : [];
  const views = vectors.length / (index.n * dim), used = FEATURES.views ? views : 1;
  const scores = new Float32Array(index.n);
  for (let i = 0; i < index.n; i++) {
    let cos = -1;
    for (let v = 0; v < used; v++) {
      let c = 0;
      for (let d = 0, o = (i * views + v) * dim; d < dim; d++) c += vectors[o + d] * queryVec[d];
      cos = Math.max(cos, c / 127 - VIEW_OFFSET[v]);
    }
    const sem = Math.max(0, Math.min(1, (cos - SEM_LOW) / (SEM_HIGH - SEM_LOW)));
    // Keywords add to meaning, so a query sharing no words with a strip can still score well.
    let extra = 0;
    if (named.length) extra += (CHARACTER_WEIGHT * named.filter((names) => names.some((c) => index.characters[i].has(c))).length) / named.length;
    if (range) {
      const y = index.years[i], off = y < range[0] ? range[0] - y : y > range[1] ? y - range[1] : 0;
      extra += DATE_WEIGHT * (off === 0 ? 1 : off === 1 ? 0.5 : 0); // a remembered year is often a year out
    }
    scores[i] = 10 * (1 - Math.exp(-CURVE * (SEM_WEIGHT * sem + KEYWORD_WEIGHT * kw[i] + extra)));
  }
  return scores;
}

export const SHOWN = { MIN_SCORE, MAX_RESULTS };

export function search(index, vectors, dim, queryVec, query) {
  const scores = scoreAll(index, vectors, dim, queryVec, query);
  const hits = [];
  for (let i = 0; i < index.n; i++) if (scores[i] >= MIN_SCORE) hits.push({ i, score: scores[i] });
  return hits.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS).map((h) => ({ ...h, score: Math.round(h.score * 10) / 10 }));
}
