// Embeds every strip once per view (cached in data/vectors*.json) and writes the offline app to build/app/.
import { chmod, mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
import * as ort from 'onnxruntime-web';
import { makeEmbedder } from '../src/embedder.js';

const out = 'build/app/', model = 'models/bge-small-en-v1.5/';
const DIM = 384;
const dataDir = process.argv[2] || 'data';
await mkdir(out, { recursive: true });

const strips = [];
for (const f of (await readdir(dataDir)).filter((n) => n.endsWith('.jsonl')).sort()) {
  for (const line of (await readFile(dataDir + '/' + f, 'utf8')).split('\n')) if (line) strips.push(JSON.parse(line));
}
strips.sort((a, b) => a.date.localeCompare(b.date));

const vocab = JSON.parse(await readFile(model + 'tokenizer.json', 'utf8')).model.vocab;
const onnx = await readFile(model + 'model_quantized.onnx');
ort.env.wasm.numThreads = 1;
const embed = await makeEmbedder(ort, onnx, vocab);
// One vector per view, so a query can match a strip's description or its dialogue. Order sets the layout in search.js.
const VIEWS = [
  { cache: 'data/vectors.json', text: (s) => [s.title, s.situation, s.punchline, s.themes.join(', '), s.enterprise_concepts.join(', ')].join(' ') },
  { cache: 'data/vectors-summary.json', text: (s) => s.summary },
  { cache: 'data/vectors-dialogue.json', text: (s) => s.transcript.map((l) => l.text).join(' ') || s.summary },
];

const vectors = new Int8Array(strips.length * VIEWS.length * DIM);
for (const [v, view] of VIEWS.entries()) {
  const cache = await readFile(view.cache, 'utf8').then(JSON.parse).catch(() => ({}));
  for (const [i, s] of strips.entries()) {
    if (!cache[s.date]) {
      cache[s.date] = [...(await embed(view.text(s)))].map((x) => Math.round(x * 127));
      if (i % 500 === 0) { await writeFile(view.cache, JSON.stringify(cache)); console.log(`${view.cache}: embedded ${i}/${strips.length}`); }
    }
    vectors.set(cache[s.date], (i * VIEWS.length + v) * DIM);
  }
  await writeFile(view.cache, JSON.stringify(cache));
}

const keep = ({ date, file, title, transcript, characters, situation, punchline, summary, themes, enterprise_concepts, keywords }) =>
  ({ date, file, title, transcript, characters, situation, punchline, summary, themes, enterprise_concepts, keywords });
await writeFile(out + 'data.js', `window.DIM=${DIM};window.STRIPS=${JSON.stringify(strips.map(keep))};window.VECTORS_B64="${Buffer.from(vectors.buffer).toString('base64')}";`);
await build({ entryPoints: ['src/app.js'], bundle: true, format: 'iife', minify: true, outfile: out + 'app.js', define: { 'import.meta.url': '""' }, logLevel: 'warning' });
const wasm = await readFile('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm');
await writeFile(out + 'wasm.js', `window.WASM_B64="${wasm.toString('base64')}";`);
await writeFile(out + 'model.js', `window.MODEL_B64="${onnx.toString('base64')}";window.VOCAB=${JSON.stringify(vocab)};`);
await copyFile('src/index.html', out + 'index.html');
await copyFile('src/index-archive.command', out + 'index-archive.command');
await copyFile('src/README.txt', out + 'README.txt');
await chmod(out + 'index-archive.command', 0o755);
console.log(`built ${strips.length} strips`);
