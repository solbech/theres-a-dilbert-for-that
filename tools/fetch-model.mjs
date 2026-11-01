// Downloads the embedding model into models/, which git does not track.
import { mkdir, stat, writeFile } from 'node:fs/promises';

const dir = 'models/bge-small-en-v1.5/';
const base = 'https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/main/';
const files = { 'model_quantized.onnx': 'onnx/model_quantized.onnx', 'tokenizer.json': 'tokenizer.json' };

await mkdir(dir, { recursive: true });
for (const [name, remote] of Object.entries(files)) {
  if (await stat(dir + name).catch(() => null)) continue;
  const res = await fetch(base + remote);
  if (!res.ok) throw new Error(`${remote}: HTTP ${res.status}`);
  await writeFile(dir + name, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded ${name}`);
}
