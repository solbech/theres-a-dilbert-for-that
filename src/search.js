// Hybrid ranking: BM25-style keyword search plus cosine similarity, added and
// curved into the 0-10 score. Pure logic, shared by the page and the test script.
const STOP = new Set('a am an and are as at be been being but by can could d did do does doing for from had has have having he her his how i if in is it its just ll m me my no not of on only or our re s she so t than that the their them then there these they this those to too ve very was we were what when where which who will with would you your'.split(' '));
const FIELD_WEIGHT = { title: 3, characters: 2, themes: 2, concepts: 2, keywords: 2, situation: 1, punchline: 1, summary: 1, transcript: 1 };
// Query words to also look up, since people and the extracted data word things differently. Keys and values are stemmed.
const SYNONYMS = { colleague: ['coworker'], coworker: ['colleague'], job: ['work', 'duty', 'function'], boss: ['manager'], manager: ['boss'], told: ['tell', 'ask'], resource: ['headcount', 'staff'] };
const SEM_LOW = 0.2, SEM_HIGH = 0.75, SEM_WEIGHT = 0.65, KEYWORD_WEIGHT = 1.2, SYNONYM_WEIGHT = 0.7, CURVE = 1.5, MIN_SCORE = 3, MAX_RESULTS = 25;

export const terms = (text) => text.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
  .split(/[^\p{L}\p{N}]+/u).filter((t) => t && !STOP.has(t)).map((t) => (t.length > 3 ? t.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : m === 'es' ? 'e' : '')) : t));

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
  return { postings, lengths, avg: total / strips.length, n: strips.length };
}

function keywordScores(index, query) {
  const k1 = 1.2, b = 0.75;
  const uniq = [...new Set(terms(query))];
  const scores = new Float32Array(index.n);
  const idf = (t) => Math.log(1 + (index.n + 0.5) / ((index.postings.get(t)?.length || 0) + 0.5));
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

// vectors: Int8Array of n * dim values, each unit vector scaled by 127.
export function search(index, vectors, dim, queryVec, query) {
  const kw = keywordScores(index, query);
  const hits = [];
  for (let i = 0; i < index.n; i++) {
    let cos = 0;
    for (let d = 0, o = i * dim; d < dim; d++) cos += vectors[o + d] * queryVec[d];
    cos /= 127;
    const sem = Math.max(0, Math.min(1, (cos - SEM_LOW) / (SEM_HIGH - SEM_LOW)));
    // Keywords add to meaning, so a query sharing no words with a strip can still score well.
    const score = 10 * (1 - Math.exp(-CURVE * (SEM_WEIGHT * sem + KEYWORD_WEIGHT * kw[i])));
    if (score >= MIN_SCORE) hits.push({ i, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS).map((h) => ({ ...h, score: Math.round(h.score * 10) / 10 }));
}
