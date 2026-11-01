import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';

const out = 'build/prototype/';
const model = 'models/all-MiniLM-L6-v2/';
await mkdir(out, { recursive: true });
await build({
  entryPoints: ['src/prototype.js'], bundle: true, format: 'iife', minify: true,
  outfile: out + 'app.js', define: { 'import.meta.url': '""' }, logLevel: 'warning',
});
const wasm = await readFile('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm');
const bytes = await readFile(model + 'model_quantized.onnx');
const vocab = JSON.parse(await readFile(model + 'tokenizer.json', 'utf8')).model.vocab;
await writeFile(out + 'wasm.js', `window.WASM_B64="${wasm.toString('base64')}";`);
await writeFile(out + 'model.js', `window.MODEL_B64="${bytes.toString('base64')}";window.VOCAB=${JSON.stringify(vocab)};`);
await writeFile(out + 'index.html', `<!doctype html><meta charset="utf-8"><title>Meaning search test</title>
<style>body{font:15px system-ui;margin:24px;max-width:860px}pre{white-space:pre-wrap;background:#eee3;padding:12px}input{width:70%;padding:6px}</style>
<h1>Meaning search test</h1>
<input id="q" value="consultant sells cloud to clueless manager"> <button id="go">Search</button>
<pre id="hits"></pre><pre id="log"></pre>
<script src="wasm.js"></script><script src="model.js"></script><script src="app.js"></script>`);
