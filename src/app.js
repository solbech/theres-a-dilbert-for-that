import * as ort from 'onnxruntime-web/wasm';
import { makeEmbedder, QUERY_PREFIX } from './embedder.js';
import { buildKeywordIndex, embeddingText, search } from './search.js';

const $ = (id) => document.getElementById(id);
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DEFAULT_ARCHIVE = '/Volumes/Public/Dilbert';

const ARCHIVE_HINT = 'The folder holding the strips. If its folders or filenames differ from the original archive, run index-archive.command once. Safari only shows strips when this app is inside that folder.';
const MISSING = 'Strip not found at this location. Check the archive location in Settings. Safari needs this app inside the archive folder.';

function setting(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function saveSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* optional */ }
}
// window.ARCHIVE_INDEX comes from the optional archive-index.js, written by index-archive.command.
const archiveIndex = window.ARCHIVE_INDEX;
const stripFile = (s) => archiveIndex?.files[s.date] ?? s.file;
const archivePath = () => setting('archive', archiveIndex?.root || DEFAULT_ARCHIVE).replace(/\/+$/, '');
const showStrips = () => setting('showStrips', 'on') === 'on';

// Filenames can hold %, # and control characters, so each path segment is encoded.
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');
const fileUrl = (path) => `file://${encodePath(path)}`;

const imageLoads = (url) => new Promise((resolve) => {
  const probe = new Image();
  probe.onload = () => resolve(true);
  probe.onerror = () => resolve(false);
  probe.src = url;
});

function card(s, score) {
  const path = `${archivePath()}/${stripFile(s)}`;
  const lines = s.transcript.map((l) => `<p><b>${esc(l.speaker)}:</b> ${esc(l.text)}</p>`).join('');
  const strip = showStrips() ? `<img class="strip" loading="lazy" alt="${esc(s.title)}" src="${esc(fileUrl(path))}">` : '';
  return `<article>
    <div class="head"><time>${s.date}</time><h2>${esc(s.title)}</h2><span class="score" title="Estimated match, 0 to 10">${score.toFixed(1)}</span></div>
    ${strip}
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
  // Safari only lets a file:// page read its own folder, so an app inside the archive uses that folder.
  const sample = stripFile(STRIPS.find((s) => archiveIndex?.files[s.date]) || STRIPS[0]);
  if (await imageLoads(encodePath(sample))) saveSetting('archive', decodeURIComponent(location.pathname).replace(/\/[^/]*$/, ''));
  $('status').textContent = `${STRIPS.length.toLocaleString('en-US')} strips ready`;
  $('q').disabled = false;
  $('q').focus();

  let hits = null;
  const render = () => {
    if (!hits) return;
    $('results').innerHTML = hits.length
      ? hits.map((h) => card(STRIPS[h.i], h.score)).join('')
      : '<p class="none">No strip matched that well. Try describing the situation differently.</p>';
  };
  const applySize = () => { $('results').className = `strip-${setting('stripSize', 'full')}`; };
  const hint = (text, bad) => {
    $('archive-hint').textContent = text;
    $('archive-hint').classList.toggle('bad', bad);
  };

  $('form').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('q').value.trim();
    if (!q) return;
    hits = search(index, vectors, DIM, await embed(QUERY_PREFIX + embeddingText(q)), q);
    render();
  };
  // Image errors do not bubble, so this listens in the capture phase.
  $('results').addEventListener('error', (e) => {
    if (!e.target.matches('img.strip')) return;
    const note = document.createElement('div');
    note.className = 'missing';
    note.textContent = MISSING;
    e.target.replaceWith(note);
  }, true);
  $('results').onclick = async (e) => {
    const b = e.target.closest('button[data-path]');
    if (!b) return;
    await navigator.clipboard.writeText(b.dataset.path);
    b.textContent = 'Copied';
    setTimeout(() => { b.textContent = 'Copy'; }, 1200);
  };
  $('archive').value = archivePath();
  $('archive').onchange = () => {
    saveSetting('archive', $('archive').value.trim());
    hint(ARCHIVE_HINT, false);
    render();
  };
  $('test-archive').onclick = async () => {
    saveSetting('archive', $('archive').value.trim());
    if (await imageLoads(fileUrl(`${archivePath()}/${sample}`))) hint('Found the test strip at this location.', false);
    else hint("Couldn't find the test strip here. Check the path and that the drive is connected. In Safari, this app must be inside the archive folder.", true);
    render();
  };
  $('show-strips').checked = showStrips();
  $('show-strips').onchange = () => {
    saveSetting('showStrips', $('show-strips').checked ? 'on' : 'off');
    render();
  };
  $('strip-size').value = setting('stripSize', 'full');
  $('strip-size').onchange = () => {
    saveSetting('stripSize', $('strip-size').value);
    applySize();
  };
  applySize();
  hint(ARCHIVE_HINT, false);
}
start().catch((e) => { $('status').textContent = `Could not start: ${e.message}`; });
