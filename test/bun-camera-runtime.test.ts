import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { CameraServer } from './helpers/camera-server.js';
const bunAvailable = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0;

test('Bun fails fast before spawning unsupported managed workers', { skip: !bunAvailable, timeout: 25_000 }, async () => {
  const server = new CameraServer();
  const directory = await mkdtemp(join(tmpdir(), 'ain-bun-'));
  try {
    const entry = new URL('../src/camera-runtime/camera-runtime.js', import.meta.url).href;
    const script = join(directory, 'consumer.mjs');
    await writeFile(script, `
import { getCameraRuntime } from ${JSON.stringify(entry)};
try {
  getCameraRuntime();
  throw new Error('Bun was incorrectly accepted');
} catch (error) {
  if (error.code !== 'unsupported_runtime') throw error;
  console.log('BUN_REJECTED_BEFORE_SPAWN');
}
`);
    const result = await promisify(execFile)('bun', [script], { timeout: 20_000, maxBuffer: 128 * 1024,
      env: { ...process.env, CAMERA_URL: await server.start() } });
    assert.match(result.stdout, /BUN_REJECTED_BEFORE_SPAWN/);
    assert.equal(server.maximumClients, 0);
  } finally { await server.close(); await rm(directory, { recursive: true, force: true }); }
});
