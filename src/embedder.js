// BERT WordPiece tokenizer plus mean-pooled ONNX inference. Shared by the
// index builder (Node) and the search page (browser) so vectors always match.
const MAX_LEN = 256;

const isPunct = (c) => /[\p{P}\p{S}]/u.test(c);

function basicTokens(text) {
  const clean = text.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
  const out = [];
  for (const word of clean.split(/\s+/)) {
    let cur = '';
    for (const c of word) {
      if (isPunct(c)) {
        if (cur) out.push(cur);
        out.push(c);
        cur = '';
      } else cur += c;
    }
    if (cur) out.push(cur);
  }
  return out;
}

export function makeTokenizer(vocab) {
  const unk = vocab['[UNK]'], cls = vocab['[CLS]'], sep = vocab['[SEP]'];
  return (text) => {
    const ids = [cls];
    for (const tok of basicTokens(text)) {
      const pieces = [];
      let start = 0, bad = tok.length > 100;
      while (!bad && start < tok.length) {
        let end = tok.length, hit = null;
        while (start < end) {
          const sub = (start ? '##' : '') + tok.slice(start, end);
          if (sub in vocab) { hit = vocab[sub]; break; }
          end--;
        }
        if (hit === null) bad = true;
        else { pieces.push(hit); start = end; }
      }
      if (bad) ids.push(unk); else ids.push(...pieces);
    }
    return [...ids.slice(0, MAX_LEN - 1), sep];
  };
}

export async function makeEmbedder(ort, modelBytes, vocab) {
  const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] });
  const tokenize = makeTokenizer(vocab);
  return async (text) => {
    const ids = tokenize(text);
    const n = ids.length;
    const tensor = (a) => new ort.Tensor('int64', BigInt64Array.from(a, BigInt), [1, n]);
    const { last_hidden_state: h } = await session.run({
      input_ids: tensor(ids),
      attention_mask: tensor(ids.map(() => 1)),
      token_type_ids: tensor(ids.map(() => 0)),
    });
    const dim = h.dims[2];
    const vec = new Float32Array(dim);
    for (let t = 0; t < n; t++) for (let d = 0; d < dim; d++) vec[d] += h.data[t * dim + d] / n;
    const norm = Math.hypot(...vec);
    return vec.map((v) => v / norm);
  };
}
