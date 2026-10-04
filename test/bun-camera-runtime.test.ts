import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { CameraServer } from './helpers/camera-server.js';
const bunAvailable = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0;

test('Bun records and decodes native JPEGs in a shared camera worker', { skip: !bunAvailable, timeout: 30_000 }, async () => {
  const server = new CameraServer();
  const directory = await mkdtemp(join(tmpdir(), 'ain-bun-'));
  try {
    const entry = new URL('../src/camera-runtime/camera-runtime.js', import.meta.url).href;
    const script = join(directory, 'consumer.mjs');
    await writeFile(script, `
import { getCameraRuntime } from ${JSON.stringify(entry)};
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const runtime = getCameraRuntime({ shutdownTimeoutMs: 3000, operationTimeoutMs: 8000, firstFrameTimeoutMs: 8000 });
const errors = [];
const committed = [];
try {
  const input = { cameraId: 'bun-camera', url: process.env.CAMERA_URL };
  const [recordLease, frameLease] = await Promise.all([runtime.acquire(input), runtime.acquire(input)]);
  const recording = await recordLease.startRecording({ cacheRoot: process.env.CACHE_ROOT, segmentDurationMs: 500,
    onCommitted: segment => { committed.push(segment); }, onError: error => { errors.push(error); } });
  let delivered = 0;
  const frames = await frameLease.startFrames({ onFrame: frame => {
    assert.equal(frame.data.readUInt16BE(0), 0xffd8);
    assert.equal(frame.width, 160);
    delivered++;
  }, onError: error => { errors.push(error); } });
  await frames.ready;
  const deadline = Date.now() + 8000;
  while (delivered < 3 || committed.length < 1) {
    if (Date.now() > deadline) throw new Error('Bun recording/JPEG delivery timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const metadata = JSON.parse(await readFile(committed[0].metadataPath, 'utf8'));
  assert.equal(metadata.complete, true);
  assert.ok(metadata.keyframes.length > 0);
  await recording.stop();
  await recordLease.release();
  await frames.stop();
  await frameLease.release();
  assert.deepEqual(errors, []);
  console.log('BUN_RECORDING_AND_JPEGS_OK');
} catch (error) { console.error('Bun flow failed', error); throw error; } finally { await runtime.close(); }
`);
    const result = await promisify(execFile)('bun', [script], { timeout: 20_000, maxBuffer: 128 * 1024,
      env: { ...process.env, CAMERA_URL: await server.start(), CACHE_ROOT: directory } });
    assert.match(result.stdout, /BUN_RECORDING_AND_JPEGS_OK/);
    assert.equal(server.maximumClients, 1);
  } finally { await server.close(); await rm(directory, { recursive: true, force: true }); }
});
