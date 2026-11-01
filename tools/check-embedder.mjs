// Verifies our embedder matches the reference Transformers.js output.
import { readFile } from 'node:fs/promises';
import * as ort from 'onnxruntime-web';
import { pipeline, env } from '@huggingface/transformers';
import { makeEmbedder } from '../src/embedder.js';

const dir = 'models/all-MiniLM-L6-v2/';
const vocab = JSON.parse(await readFile(dir + 'tokenizer.json', 'utf8')).model.vocab;
ort.env.wasm.numThreads = 1;
const embed = await makeEmbedder(ort, await readFile(dir + 'model_quantized.onnx'), vocab);
const texts = ["Dogbert is a cloud expert!", "I have infinite capacity to do more work; my quality approaches zero.", "Café re-org, don't panic."];
const ref = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
for (const t of texts) {
  const a = await embed(t);
  const b = (await ref(t, { pooling: 'mean', normalize: true })).data;
  console.log(a.length, a.reduce((s, v, i) => s + v * b[i], 0).toFixed(6), t);
}
