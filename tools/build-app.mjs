// Embeds every strip (cached in work/vectors.json) and writes the offline app to build/app/.
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
import * as ort from 'onnxruntime-web';
import { makeEmbedder } from '../src/embedder.js';

const out = 'build/app/', model = 'models/all-MiniLM-L6-v2/', cachePath = 'work/vectors.json';
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
const cache = await readFile(cachePath, 'utf8').then(JSON.parse).catch(() => ({}));
const embedText = (s) => [s.title, s.situation, s.punchline, s.themes.join(', '), s.enterprise_concepts.join(', ')].join(' ');

const vectors = new Int8Array(strips.length * DIM);
for (const [i, s] of strips.entries()) {
  if (!cache[s.date]) {
    cache[s.date] = [...(await embed(embedText(s)))].map((v) => Math.round(v * 127));
    if (i % 500 === 0) { await writeFile(cachePath, JSON.stringify(cache)); console.log(`embedded ${i}/${strips.length}`); }
  }
  vectors.set(cache[s.date], i * DIM);
}
await writeFile(cachePath, JSON.stringify(cache));

const keep = ({ date, file, title, transcript, characters, situation, punchline, summary, themes, enterprise_concepts, keywords }) =>
  ({ date, file, title, transcript, characters, situation, punchline, summary, themes, enterprise_concepts, keywords });
await writeFile(out + 'data.js', `window.DIM=${DIM};window.STRIPS=${JSON.stringify(strips.map(keep))};window.VECTORS_B64="${Buffer.from(vectors.buffer).toString('base64')}";`);
await build({ entryPoints: ['src/app.js'], bundle: true, format: 'iife', minify: true, outfile: out + 'app.js', define: { 'import.meta.url': '""' }, logLevel: 'warning' });
const wasm = await readFile('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm');
await writeFile(out + 'wasm.js', `window.WASM_B64="${wasm.toString('base64')}";`);
await writeFile(out + 'model.js', `window.MODEL_B64="${onnx.toString('base64')}";window.VOCAB=${JSON.stringify(vocab)};`);
await copyFile('src/index.html', out + 'index.html');
console.log(`built ${strips.length} strips`);
