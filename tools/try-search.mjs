// Runs test queries against the built data from the command line. --with=characters,dates or --with=all turns on FEATURES.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as ort from 'onnxruntime-web';
import { makeEmbedder, QUERY_PREFIX } from '../src/embedder.js';
import { buildKeywordIndex, embeddingText, search, FEATURES } from '../src/search.js';

const ctx = { window: {} };
vm.runInNewContext(await readFile('build/app/data.js', 'utf8'), ctx);
const { STRIPS, VECTORS_B64, DIM } = ctx.window;
const buf = Buffer.from(VECTORS_B64, 'base64');
const vectors = new Int8Array(buf.buffer, buf.byteOffset, buf.length);
const model = 'models/bge-small-en-v1.5/';
ort.env.wasm.numThreads = 1;
const embed = await makeEmbedder(ort, await readFile(model + 'model_quantized.onnx'), JSON.parse(await readFile(model + 'tokenizer.json', 'utf8')).model.vocab);
const index = buildKeywordIndex(STRIPS);
const withArg = process.argv.find((a) => a.startsWith('--with='));
if (withArg) for (const f of withArg.slice(7).split(',')) for (const k of f === 'all' ? Object.keys(FEATURES) : [f]) FEATURES[k] = true;
for (const q of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  console.log(`\n# ${q}`);
  for (const h of search(index, vectors, DIM, await embed(QUERY_PREFIX + embeddingText(q)), q).slice(0, 5)) console.log(h.score.toFixed(1), STRIPS[h.i].date, STRIPS[h.i].title);
}
