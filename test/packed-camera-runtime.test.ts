import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import test from 'node:test';
import { CameraServer } from './helpers/camera-server.js';

const run = promisify(execFile);

test('packed package starts native camera workers from unrelated cwd in ESM and CommonJS', { timeout: 40_000 }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'ain-packed-'));
  const server = new CameraServer();
  try {
    const packageRoot = process.cwd();
    const packed = JSON.parse(execFileSync('npm', ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', temporary, '--cache', join(temporary, 'npm-cache')], {
      cwd: packageRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })) as { filename: string }[];
    const modules = join(temporary, 'consumer', 'node_modules');
    const installed = join(modules, 'ain-nvr');
    await mkdir(installed, { recursive: true });
    execFileSync('tar', ['-xzf', join(temporary, packed[0]!.filename), '--strip-components=1', '-C', installed]);
    // Reuse installed dependencies without network or another postinstall download.
    await symlink(resolve(packageRoot, 'node_modules', '@scrypted'), join(modules, '@scrypted'), 'junction');
    const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
    assert.equal(manifest.version, JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')).version);
    const script = join(temporary, 'consumer', 'consumer.mjs');
    await writeFile(script, `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const primary = process.argv[2] === 'cjs' ? require('ain-nvr/camera-runtime') : await import('ain-nvr/camera-runtime');
const runtime = primary.getCameraRuntime({ acquireTimeoutMs: 5000, firstFrameTimeoutMs: 10000, shutdownTimeoutMs: 2000 });
assert.equal(require('ain-nvr/camera-runtime').getCameraRuntime(), (await import('ain-nvr/camera-runtime')).getCameraRuntime());
const errors = [];
let frames = 0;
let committed = 0;
try {
  const lease = await runtime.acquire({ cameraId: 'packed', url: process.env.CAMERA_URL });
  const recording = await lease.startRecording({ cacheRoot: process.env.CACHE_ROOT, segmentDurationMs: 500,
    onCommitted: () => { committed++; }, onError: e => errors.push(e) });
  const decoder = await lease.startFrames({ onFrame: frame => { assert.ok(Buffer.isBuffer(frame.data)); assert.equal(frame.data[0],255); frames++; }, onError: e => errors.push(e) });
  await decoder.ready;
  await decoder.stop(); await recording.stop(); await lease.release();
  assert.ok(frames > 0); assert.ok(committed > 0); assert.deepEqual(errors, []);
  console.log('PACKED_CAMERA_OK');
} finally { await runtime.close(); }
`);
    const url = await server.start();
    for (const mode of ['esm', 'cjs']) {
      const result = await run(process.execPath, [script, mode], {
        cwd: tmpdir(), timeout: 20_000, maxBuffer: 128 * 1024,
        env: { ...process.env, CAMERA_URL: url, CACHE_ROOT: join(temporary, 'recordings', mode) },
      });
      assert.match(result.stdout, /PACKED_CAMERA_OK/);
    }
    assert.equal(server.maximumClients, 1);
  } finally { await server.close(); await rm(temporary, { recursive: true, force: true }); }
});
