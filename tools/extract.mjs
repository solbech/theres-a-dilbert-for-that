// Sends strips to the Batch API and appends results to a JSON Lines directory.
// Usage: node tools/extract.mjs <pilot|all> <outDir>
// Safe to rerun: strips already in outDir are skipped, and submitted batches
// are tracked in outDir/batches.json so an interrupted run picks them up.
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { MODEL, PROMPT_VERSION, SCHEMA, SYSTEM } from '../src/prompt.js';

const ARCHIVE = process.env.DILBERT_ARCHIVE || '/volume1/Public/Dilbert';
const MAX_BATCH_BYTES = 200e6;
const PRICE = { input: 1, output: 5 }; // batch $ per million tokens, Sonnet 5.5
const PILOT_FORCED = ['2005-09-16', '1994-10-04'];

const [mode, outDir] = process.argv.slice(2);
if (!['pilot', 'all'].includes(mode) || !outDir) throw new Error('usage: extract.mjs <pilot|all> <outDir>');

const apiKey = (await readFile(join(homedir(), '.config/dilbert-search/anthropic-key'), 'utf8')).trim();
const client = new Anthropic({ apiKey });
const hash = (s) => createHash('sha1').update(s).digest('hex');

async function listStrips() {
  const strips = [];
  for (const year of (await readdir(ARCHIVE)).filter((d) => /^\d{4}$/.test(d)).sort()) {
    for (const file of (await readdir(join(ARCHIVE, year))).sort()) {
      const m = file.match(/^(\d{4}-\d{2}-\d{2})(?:_(.*))?\.(gif|jpg)$/);
      if (m) strips.push({ date: m[1], year, file, tags: m[2] ? m[2].split('_') : [] });
    }
  }
  return strips;
}

// Four strips a year chosen by hash, plus known strips to check accuracy.
function pilotSet(strips) {
  const byYear = Object.groupBy(strips, (s) => s.year);
  const picked = Object.values(byYear).flatMap((list) =>
    list.toSorted((a, b) => hash(a.date).localeCompare(hash(b.date))).slice(0, 4));
  const extra = strips.filter((s) => PILOT_FORCED.includes(s.date) || (s.year >= '2010' && /cloud/i.test(s.file)));
  const seen = new Set();
  const all = [...extra.slice(0, 6), ...picked].filter((s) => !seen.has(s.date) && seen.add(s.date));
  return all.slice(0, 150);
}

function mediaType(bytes) {
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  throw new Error('unknown image type');
}

async function toRequest(s) {
  const bytes = await readFile(join(ARCHIVE, s.year, s.file));
  const text = s.tags.length ? `Archive tags: ${s.tags.join(', ')}` : 'No archive tags for this strip.';
  return {
    custom_id: s.date,
    params: {
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      thinking: { type: 'between_tools' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType(bytes), data: bytes.toString('base64') } },
          { type: 'text', text },
        ],
      }],
    },
  };
}

async function readDone() {
  const done = new Set();
  for (const f of (await readdir(outDir)).filter((n) => n.endsWith('.jsonl'))) {
    for (const line of (await readFile(join(outDir, f), 'utf8')).split('\n')) {
      if (line) done.add(JSON.parse(line).date);
    }
  }
  return done;
}

async function collect(id, stripByDate, totals) {
  const failures = [];
  for await (const r of await client.messages.batches.results(id)) {
    const s = stripByDate.get(r.custom_id);
    const msg = r.result.type === 'succeeded' ? r.result.message : null;
    if (!msg || msg.stop_reason !== 'end_turn') {
      failures.push({ date: r.custom_id, type: r.result.type, stop: msg?.stop_reason, error: r.result.error });
      continue;
    }
    const data = JSON.parse(msg.content.find((b) => b.type === 'text').text);
    const rec = { date: s.date, file: `${s.year}/${s.file}`, tags: s.tags, ...data, model: MODEL, prompt_version: PROMPT_VERSION };
    await appendFile(join(outDir, `${s.year}.jsonl`), JSON.stringify(rec) + '\n');
    totals.n++;
    totals.input += msg.usage.input_tokens;
    totals.output += msg.usage.output_tokens;
  }
  if (failures.length) await appendFile(join(outDir, 'failures.log'), failures.map((f) => JSON.stringify(f)).join('\n') + '\n');
  return failures.length;
}

await mkdir(outDir, { recursive: true });
const statePath = join(outDir, 'batches.json');
const state = await readFile(statePath, 'utf8').then(JSON.parse).catch(() => ({ pending: [], collected: [] }));
const save = () => writeFile(statePath, JSON.stringify(state, null, 1));

const strips = await listStrips();
const stripByDate = new Map(strips.map((s) => [s.date, s]));
const wanted = mode === 'pilot' ? pilotSet(strips) : strips;
const done = await readDone();
const inFlight = state.pending.flatMap((b) => b.dates);
const todo = wanted.filter((s) => !done.has(s.date) && !inFlight.includes(s.date));
console.log(`${wanted.length} wanted, ${done.size} done, ${inFlight.length} in flight, ${todo.length} to submit`);

let chunk = [], bytes = 0;
const flush = async () => {
  if (!chunk.length) return;
  const b = await client.messages.batches.create({ requests: chunk });
  state.pending.push({ id: b.id, dates: chunk.map((r) => r.custom_id) });
  await save();
  console.log(`submitted ${b.id} with ${chunk.length} strips`);
  chunk = []; bytes = 0;
};
for (const s of todo) {
  const req = await toRequest(s);
  const size = JSON.stringify(req).length;
  if (bytes + size > MAX_BATCH_BYTES) await flush();
  chunk.push(req); bytes += size;
}
await flush();

const totals = { n: 0, input: 0, output: 0, failed: 0 };
while (state.pending.length) {
  for (const entry of [...state.pending]) {
    const b = await client.messages.batches.retrieve(entry.id);
    if (b.processing_status !== 'ended') { console.log(`${entry.id}: ${JSON.stringify(b.request_counts)}`); continue; }
    totals.failed += await collect(entry.id, stripByDate, totals);
    state.pending = state.pending.filter((p) => p.id !== entry.id);
    state.collected.push(entry.id);
    await save();
    console.log(`collected ${entry.id}`);
  }
  if (state.pending.length) await new Promise((r) => setTimeout(r, 60_000));
}
const cost = (totals.input * PRICE.input + totals.output * PRICE.output) / 1e6;
console.log(JSON.stringify({ ...totals, cost: +cost.toFixed(4), perStrip: totals.n ? +(cost / totals.n).toFixed(5) : 0, projectedAll: totals.n ? +(cost / totals.n * strips.length).toFixed(2) : 0 }));
