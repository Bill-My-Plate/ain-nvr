import { execFileSync, spawnSync } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Branch switches must not execute stale tests left by an earlier checkout.
await rm(new URL('../.test-dist/', import.meta.url), { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json'], {
  cwd: root, stdio: 'inherit',
});
const directory = new URL('../.test-dist/test/', import.meta.url);
const tests = (await readdir(directory)).filter(name => name.endsWith('.test.js')).sort()
  .map(name => fileURLToPath(new URL(name, directory)));
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...tests], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
