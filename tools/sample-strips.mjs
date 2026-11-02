// Picks a fixed random sample of strips per year for writing test queries in a chat.
// Usage: node tools/sample-strips.mjs [perYear=5] [seed=1]  ->  eval/sample-strips.jsonl
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const perYear = Number(process.argv[2] || 5);
let seed = Number(process.argv[3] || 1);
const rand = () => { // mulberry32, so the same seed gives the same sample
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const out = [];
for (const f of (await readdir('data')).filter((n) => /^\d{4}\.jsonl$/.test(n)).sort()) {
  const strips = (await readFile('data/' + f, 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
  for (let i = strips.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [strips[i], strips[j]] = [strips[j], strips[i]];
  }
  const picked = strips.slice(0, perYear).sort((a, b) => a.date.localeCompare(b.date));
  for (const { date, title, situation, punchline, summary } of picked) out.push({ date, title, situation, punchline, summary });
}
await mkdir('eval', { recursive: true });
await writeFile('eval/sample-strips.jsonl', out.map((s) => JSON.stringify(s)).join('\n') + '\n');
console.log(`wrote ${out.length} strips to eval/sample-strips.jsonl`);
