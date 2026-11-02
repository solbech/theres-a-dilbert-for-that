// Writes build/web/ from build/app/ for a web server: the app, strip.php and an example .htaccess. Run it after `npm run build`.
import { copyFile, mkdir, rm } from 'node:fs/promises';

const from = 'build/app/', out = 'build/web/';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of ['index.html', 'app.js', 'data.js', 'model.js', 'wasm.js']) await copyFile(from + f, out + f);
await copyFile('src/web/strip.php', out + 'strip.php');
await copyFile('src/web/htaccess.example', out + 'htaccess.example');
console.log(`wrote ${out}`);
