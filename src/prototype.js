import * as ort from 'onnxruntime-web/wasm';
import { makeEmbedder } from './embedder.js';

const log = (m) => { document.getElementById('log').textContent += m + '\n'; };
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const SAMPLES = [
  ['2005-09-16', 'Boss asks Dilbert to take on a coworker\'s job; Dilbert offers infinite capacity if quality can approach zero'],
  ['1994-10-04', 'Anne has given up sleep and exercise and runs on a coffee IV drip, holding the aorta of someone who asked about side effects'],
  ['2000-01-01', 'Dogbert, hired as a consultant, sells the boss a migration to the cloud he does not understand'],
  ['1992-06-07', 'Dogbert teaches men to act phony and fake empathy in conversations with women'],
  ['1989-05-06', 'A road construction sign and engineers discussing the work'],
];

async function run() {
  const t0 = performance.now();
  log('page protocol: ' + location.protocol);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmBinary = b64(window.WASM_B64);
  const embed = await makeEmbedder(ort, b64(window.MODEL_B64), window.VOCAB);
  log(`model ready in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  const vecs = [];
  for (const [d, text] of SAMPLES) vecs.push([d, text, await embed(text)]);
  const search = async () => {
    const q = document.getElementById('q').value;
    const t = performance.now();
    const v = await embed(q);
    const hits = vecs.map(([d, text, u]) => [u.reduce((s, x, i) => s + x * v[i], 0), d, text]).sort((a, b) => b[0] - a[0]);
    document.getElementById('hits').textContent = hits.map(([s, d, text]) => `${s.toFixed(3)}  ${d}  ${text}`).join('\n');
    log(`query embedded in ${Math.round(performance.now() - t)} ms`);
  };
  document.getElementById('go').onclick = search;
  await search();
  log('RESULT: PASS');
}
run().catch((e) => log('RESULT: FAIL ' + (e.stack || e)));
