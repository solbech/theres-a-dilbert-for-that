// Measures ranking against the CLAUDE.md checks and the test queries in eval/test-queries*.json.
// Usage: node tools/eval.mjs [--all] [--with=phrase,characters,dates|all] [file.json ...]. Needs `npm run build` first.
// --with turns on FEATURES from src/search.js for this run, to compare against the default.
// The test file maps a strip date to the queries that should find it: { "YYYY-MM-DD": ["query", ...] }.
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import * as ort from 'onnxruntime-web';
import { makeEmbedder, QUERY_PREFIX } from '../src/embedder.js';
import { buildKeywordIndex, embeddingText, scoreAll, FEATURES, SHOWN } from '../src/search.js';

// The ranking checks from CLAUDE.md. `rank` is the worst allowed rank; `above` lists dates that must outrank `date`.
const CHECKS = [
  { q: "We just had an anonymous satisfaction survey and we're only 5 people in the team. It's easy figure who answered what", date: '2010-09-01', rank: 1 },
  { q: 'Dogbert is a cloud expert', date: '1992-12-13', above: ['2020-03-11', '2020-03-12', '2020-03-13', '2020-03-14'] },
  { q: "told to do a colleague's job as well with no extra resources", date: '2005-09-16', rank: 5 },
  { q: 'We had two projects running simultaneously with the same purpose but with no communication between them', date: '2011-04-27', rank: SHOWN.MAX_RESULTS },
  { q: 'We had a manager requesting completely impossible metrics and we ended just suggesting random stuff', date: '2013-08-31', rank: SHOWN.MAX_RESULTS },
  { q: 'cloud bunny', date: '1992-12-13', rank: 1 },
  { q: 'quality approaches zero', date: '2005-09-16', rank: 1 },
];
// Position of a query within its strip's list, matching the order the prompt asks for.
const STYLES = ['short', 'sentence', 'half-remembered'];

const args = process.argv.slice(2);
const showAll = args.includes('--all');
const withArg = args.find((a) => a.startsWith('--with='));
if (withArg) for (const f of withArg.slice(7).split(',')) {
  if (f !== 'all' && !(f in FEATURES)) throw new Error(`unknown feature ${f}; known: ${Object.keys(FEATURES).join(', ')}`);
  for (const k of f === 'all' ? Object.keys(FEATURES) : [f]) FEATURES[k] = true;
}
console.log(`features on: ${Object.keys(FEATURES).filter((k) => FEATURES[k]).join(', ') || 'none'}`);
const named = args.filter((a) => !a.startsWith('--'));
const files = named.length ? named : (await readdir('eval')).filter((n) => /^test-queries.*\.json$/.test(n)).sort().map((n) => 'eval/' + n);

const ctx = { window: {} };
vm.runInNewContext(await readFile('build/app/data.js', 'utf8'), ctx);
const { STRIPS, VECTORS_B64, DIM } = ctx.window;
const buf = Buffer.from(VECTORS_B64, 'base64');
const vectors = new Int8Array(buf.buffer, buf.byteOffset, buf.length);
const model = 'models/bge-small-en-v1.5/';
ort.env.wasm.numThreads = 1;
const embed = await makeEmbedder(ort, await readFile(model + 'model_quantized.onnx'), JSON.parse(await readFile(model + 'tokenizer.json', 'utf8')).model.vocab);
const index = buildKeywordIndex(STRIPS);
const byDate = new Map(STRIPS.map((s, i) => [s.date, i]));

async function rankOf(q, dates) {
  const scores = scoreAll(index, vectors, DIM, await embed(QUERY_PREFIX + embeddingText(q)), q);
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  const rank = (d) => {
    const s = scores[byDate.get(d)];
    let r = 1;
    for (const x of scores) if (x > s) r++;
    return { rank: r, score: s };
  };
  return { ranks: dates.map(rank), top: STRIPS[best] };
}
const shown = ({ rank, score }) => rank <= SHOWN.MAX_RESULTS && score >= SHOWN.MIN_SCORE;
const fmt = ({ rank, score }) => `#${rank} (${score.toFixed(1)})`;

console.log('## CLAUDE.md checks');
let failedChecks = 0;
for (const c of CHECKS) {
  const { ranks: [r, ...others] } = await rankOf(c.q, [c.date, ...(c.above || [])]);
  const ok = c.above ? others.every((o) => o.rank < r.rank) : r.rank <= c.rank && shown(r);
  if (!ok) failedChecks++;
  const detail = c.above ? `${c.date} ${fmt(r)}, must be below ${c.above.map((d, k) => `${d} ${fmt(others[k])}`).join(', ')}` : `${c.date} ${fmt(r)}, needs top ${c.rank}`;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${detail}  "${c.q}"`);
}

if (!files.length) console.log('\nNo eval/test-queries*.json files yet.');
const rows = [];
for (const file of files) {
  let tests;
  try {
    tests = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    console.log(`\nskipped ${file}: ${e.code || e.message}`);
    continue;
  }
  for (const [date, queries] of Object.entries(tests)) {
    if (!byDate.has(date)) { console.log(`${file}: skipped unknown date ${date}`); continue; }
    if (!Array.isArray(queries)) { console.log(`${file}: skipped ${date}, expected a list of queries`); continue; }
    for (const [k, q] of queries.entries()) {
      const { ranks: [r], top } = await rankOf(q, [date]);
      rows.push({ file, date, q, style: STYLES[k] || 'other', ...r, top });
    }
  }
}
if (!rows.length) process.exit(failedChecks ? 1 : 0);

const summarize = (rs) => {
  const pct = (f) => `${Math.round((100 * rs.filter(f).length) / rs.length)}%`.padStart(5);
  const mrr = rs.reduce((a, r) => a + 1 / r.rank, 0) / rs.length;
  return `${String(rs.length).padStart(4)}  top1 ${pct((r) => r.rank === 1)}  top5 ${pct((r) => r.rank <= 5)}  shown ${pct(shown)}  MRR ${mrr.toFixed(3)}`;
};
const list = showAll ? rows : rows.filter((r) => r.rank > 5);
console.log(`\n## ${showAll ? 'All test queries' : 'Test queries outside the top 5'}, worst first`);
for (const r of list.sort((a, b) => b.rank - a.rank)) {
  console.log(`${fmt(r).padEnd(14)} ${r.date} "${r.q}"`);
  if (r.rank > 1) console.log(`${''.padEnd(14)} first: ${r.top.date} ${r.top.title}`);
}
console.log('\n## Summary: queries, found first, in top 5, in the shown results, mean reciprocal rank');
const groups = [['all', rows]];
if (files.length > 1) for (const f of files) groups.push([f.replace(/^.*test-queries-?|\.json$/g, '') || f, rows.filter((r) => r.file === f)]);
for (const style of [...new Set(rows.map((r) => r.style))]) groups.push([style, rows.filter((r) => r.style === style)]);
const width = Math.max(...groups.map(([name]) => name.length)) + 2;
for (const [name, rs] of groups) if (rs.length) console.log(`${name.padEnd(width)} ${summarize(rs)}`);
process.exit(failedChecks ? 1 : 0);
