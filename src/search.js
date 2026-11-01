// Hybrid ranking: BM25-style keyword search plus cosine similarity, blended
// into the 0-10 score. Pure logic, shared by the page and the test script.
const STOP = new Set('a an and are as at be but by for from has he her his i in is it its me my of on or our she that the their them they this to was we were what when where which who will with you your'.split(' '));
const FIELD_WEIGHT = { title: 3, characters: 2, themes: 2, concepts: 2, keywords: 2, situation: 1, punchline: 1, summary: 1, transcript: 1 };
const SEM_LOW = 0.2, SEM_HIGH = 0.65, SEM_SHARE = 0.65, MIN_SCORE = 3, MAX_RESULTS = 25;

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
  const idfs = uniq.map((t) => Math.log(1 + (index.n + 0.5) / ((index.postings.get(t)?.length || 0) + 0.5)));
  const maxTotal = idfs.reduce((a, b2) => a + b2, 0) || 1;
  uniq.forEach((t, q) => {
    for (const [i, c] of index.postings.get(t) || []) {
      const tf = (c * (k1 + 1)) / (c + k1 * (1 - b + b * index.lengths[i] / index.avg));
      scores[i] += (idfs[q] * tf) / (k1 + 1);
    }
  });
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
    const score = 10 * (SEM_SHARE * sem + (1 - SEM_SHARE) * kw[i]);
    if (score >= MIN_SCORE) hits.push({ i, score: Math.round(score * 10) / 10 });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}
