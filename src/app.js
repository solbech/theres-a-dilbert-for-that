import * as ort from 'onnxruntime-web/wasm';
import { makeEmbedder } from './embedder.js';
import { buildKeywordIndex, search } from './search.js';

const $ = (id) => document.getElementById(id);
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DEFAULT_ARCHIVE = '/Volumes/Public/Dilbert';

function archivePath() {
  try { return localStorage.getItem('archive') || DEFAULT_ARCHIVE; } catch { return DEFAULT_ARCHIVE; }
}

function card(s, score) {
  const path = `${archivePath()}/${s.file}`;
  const lines = s.transcript.map((l) => `<p><b>${esc(l.speaker)}:</b> ${esc(l.text)}</p>`).join('');
  return `<article>
    <div class="head"><time>${s.date}</time><h2>${esc(s.title)}</h2><span class="score" title="Estimated match, 0 to 10">${score.toFixed(1)}</span></div>
    <div class="path"><code>${esc(path)}</code><button data-path="${esc(path)}">Copy</button></div>
    <details><summary>${esc(s.summary)}</summary><p>${esc(s.situation)}</p><p class="joke">${esc(s.punchline)}</p>${lines}</details>
  </article>`;
}

async function start() {
  const { STRIPS, VECTORS_B64, DIM } = window;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmBinary = b64(window.WASM_B64);
  const embed = await makeEmbedder(ort, b64(window.MODEL_B64), window.VOCAB);
  const index = buildKeywordIndex(STRIPS);
  const bytes = b64(VECTORS_B64);
  const vectors = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
  $('status').textContent = `${STRIPS.length.toLocaleString('en-US')} strips ready`;
  $('q').disabled = false;
  $('q').focus();

  $('form').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('q').value.trim();
    if (!q) return;
    const hits = search(index, vectors, DIM, await embed(q), q);
    $('results').innerHTML = hits.length
      ? hits.map((h) => card(STRIPS[h.i], h.score)).join('')
      : '<p class="none">No strip matched that well. Try describing the situation differently.</p>';
  };
  $('results').onclick = async (e) => {
    const b = e.target.closest('button[data-path]');
    if (!b) return;
    await navigator.clipboard.writeText(b.dataset.path);
    b.textContent = 'Copied';
    setTimeout(() => { b.textContent = 'Copy'; }, 1200);
  };
  $('archive').value = archivePath();
  $('archive').onchange = () => { try { localStorage.setItem('archive', $('archive').value.trim()); } catch { /* optional */ } };
}
start().catch((e) => { $('status').textContent = `Could not start: ${e.message}`; });
