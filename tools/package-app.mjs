// Writes build/DilbertSearch.zip from build/app/. Unzips to a DilbertSearch folder holding index.html.
import { cp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const name = 'DilbertSearch';
await rm(`build/${name}`, { recursive: true, force: true });
await rm(`build/${name}.zip`, { force: true });
await cp('build/app', `build/${name}`, { recursive: true });
await rm(`build/${name}/archive-index.js`, { force: true }); // Personal to whoever ran the script.
execFileSync('zip', ['-rqX', `${name}.zip`, name], { cwd: 'build' });
await rm(`build/${name}`, { recursive: true });
console.log(`wrote build/${name}.zip`);
