import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { getCameraRuntime } from '../src/camera-runtime/utils/get-camera-runtime.util.js';
import type { CommittedSegment } from '../src/recording-storage/index.js';
import { CameraServer, until } from './helpers/camera-server.js';

const settings = { acquireTimeoutMs: 5_000, operationTimeoutMs: 10_000, shutdownTimeoutMs: 2_000, firstFrameTimeoutMs: 10_000 };

test('managed recording and native JPEG subscribers share one upstream and independent leases', { timeout: 25_000 }, async () => {
  const server = new CameraServer();
  const root = await mkdtemp(join(tmpdir(), 'ain-camera-'));
  const runtime = getCameraRuntime(settings);
  const errors: Error[] = [];
  const committed: CommittedSegment[] = [];
  try {
    const url = await server.start();
    const [recordLease, frameLease] = await Promise.all([
      runtime.acquire({ cameraId: 'camera-1', url }), runtime.acquire({ cameraId: 'camera-1', url }),
    ]);
    await assert.rejects(runtime.acquire({ cameraId: 'camera-1', url: `${url}x` }), /different URL/);
    await assert.rejects(runtime.acquire({ cameraId: 'other-camera', url }), /another camera/);
    const recording = await recordLease.startRecording({ cacheRoot: root, segmentDurationMs: 600,
      onCommitted: segment => { committed.push(segment); }, onError: error => errors.push(error) });
    await assert.rejects(frameLease.startRecording({ cacheRoot: root, segmentDurationMs: 600,
      onCommitted: () => undefined, onError: () => undefined }), /recording owner/);
    let delivered = 0;
    const frames = await frameLease.startFrames({ framesPerSecond: 4, onFrame: frame => {
      assert.ok(Buffer.isBuffer(frame.data));
      assert.equal(frame.data.readUInt16BE(0), 0xffd8);
      assert.equal(frame.width, 160);
      assert.equal(frame.height, 96);
      delivered++;
    }, onError: error => errors.push(error) });
    await frames.ready;
    await until(() => delivered >= 3 && committed.length > 0);
    assert.equal(server.maximumClients, 1);
    assert.equal(server.bridge.status.clientCount, 1);
    const metadata = JSON.parse(await readFile(committed[0]!.metadataPath, 'utf8'));
    const session = JSON.parse(await readFile(committed[0]!.sessionMetadataPath, 'utf8'));
    const media = await readFile(committed[0]!.mediaPath);
    assert.equal(metadata.schemaVersion, 1);
    assert.equal(metadata.complete, true);
    assert.equal(metadata.bytes, media.length);
    assert.equal(session.schemaVersion, 1);
    assert.equal(session.cameraId, 'camera-1');
    assert.ok(session.tracks[0].parameterSetsBase64.sps);
    assert.ok(metadata.keyframes.length > 0);
    assert.ok(metadata.playpoints.length > 0);
    for (let offset = 0; offset < media.length;) {
      assert.equal(media[offset], 0x24);
      const length = media.readUInt16BE(offset + 2) + 4;
      assert.ok(server.sent.some(packet => packet.equals(media.subarray(offset, offset + length))), 'written RTP must match upstream bytes');
      offset += length;
    }
    const before = committed.length;
    await frames.stop();
    await frameLease.release();
    const stoppedFrames = delivered;
    await until(() => committed.length > before);
    assert.equal(delivered, stoppedFrames);
    assert.equal(server.bridge.status.clientCount, 1);
    await recording.stop();
    await recordLease.release();
    await until(() => server.bridge.status.clientCount === 0);
    assert.deepEqual(errors, []);
  } finally {
    await runtime.close().finally(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  }
});

test('ESM/CommonJS registry identity and configuration checks', async () => {
  const esm = await import('ain-nvr/camera-runtime');
  const cjs = createRequire(import.meta.url)('ain-nvr/camera-runtime') as typeof esm;
  const runtime = esm.getCameraRuntime({ maxCameras: 2 });
  try {
    assert.equal(cjs.getCameraRuntime(), runtime);
    assert.equal(getCameraRuntime(), runtime);
    assert.throws(() => cjs.getCameraRuntime({ maxCameras: 3 }), /different maxCameras/);
  } finally { await runtime.close(); }
});

test('cancel one concurrent acquire without canceling the other; reacquire waits for final release', { timeout: 10_000 }, async () => {
  const server = new CameraServer();
  const runtime = getCameraRuntime(settings);
  try {
    const url = await server.start();
    const cancel = new AbortController();
    const canceled = runtime.acquire({ cameraId: 'race', url, signal: cancel.signal });
    const kept = runtime.acquire({ cameraId: 'race', url });
    cancel.abort(new Error('Canceled only this waiter.'));
    await assert.rejects(canceled, /only this waiter/);
    const first = await kept;
    const releasing = first.release();
    const second = await runtime.acquire({ cameraId: 'race', url });
    await releasing;
    assert.equal(server.maximumClients, 1);
    await second.release();
    await second.release();
    assert.throws(() => first.startFrames({ onFrame: () => undefined, onError: () => undefined }), /released/);
  } finally { await runtime.close().finally(() => server.close()); }
});

test('slow frame callback is bounded and does not block recording or another subscriber', { timeout: 20_000 }, async () => {
  const server = new CameraServer();
  const root = await mkdtemp(join(tmpdir(), 'ain-slow-'));
  const runtime = getCameraRuntime({ ...settings, callbackTimeoutMs: 5_000 });
  let unblock!: () => void;
  const slow = new Promise<void>(resolve => { unblock = resolve; });
  try {
    const lease = await runtime.acquire({ cameraId: 'slow', url: await server.start() });
    let commits = 0;
    const errors: Error[] = [];
    const recording = await lease.startRecording({ cacheRoot: root, segmentDurationMs: 500,
      onCommitted: () => { commits++; }, onError: error => errors.push(error) });
    let slowCalls = 0;
    let fastCalls = 0;
    const stalled = await lease.startFrames({ onFrame: async frame => {
      slowCalls++; frame.data.fill(0); await slow;
    }, onError: error => errors.push(error) });
    const fast = await lease.startFrames({ onFrame: frame => { assert.equal(frame.data[0], 0xff); fastCalls++; }, onError: error => errors.push(error) });
    await Promise.all([stalled.ready, fast.ready]);
    await until(() => fastCalls >= 4 && commits >= 1);
    assert.equal(slowCalls, 1);
    assert.equal(server.maximumClients, 1);
    await assert.rejects(lease.startFrames({ framesPerSecond: 1, onFrame: () => undefined, onError: () => undefined }), /same FPS/);
    await stalled.stop(); // Stop does not wait for an arbitrary user callback.
    unblock();
    await fast.stop();
    await recording.stop();
    await lease.release();
    assert.deepEqual(errors, []);
  } finally { unblock(); await runtime.close().finally(async () => { await server.close(); await rm(root, { recursive: true, force: true }); }); }
});

test('disk-full recording failure leaves native frame extraction alive', { timeout: 20_000 }, async () => {
  const server = new CameraServer();
  const root = await mkdtemp(join(tmpdir(), 'ain-full-'));
  const runtime = getCameraRuntime(settings);
  try {
    const lease = await runtime.acquire({ cameraId: 'full', url: await server.start() });
    let frameCount = 0;
    const frameErrors: Error[] = [];
    const recordingErrors: Error[] = [];
    const frames = await lease.startFrames({ onFrame: () => { frameCount++; }, onError: error => frameErrors.push(error) });
    await frames.ready;
    const recording = await lease.startRecording({ cacheRoot: root, segmentDurationMs: 500,
      minimumFreeBytes: Number.MAX_SAFE_INTEGER,
      onCommitted: () => assert.fail('Disk-full writer must not commit'), onError: error => recordingErrors.push(error) });
    await assert.rejects(recording.completion, error => (error as NodeJS.ErrnoException).code === 'ENOSPC');
    const before = frameCount;
    await until(() => frameCount > before + 2);
    assert.ok(recordingErrors.length > 0);
    assert.deepEqual(frameErrors, []);
    assert.equal(server.maximumClients, 1);
    await frames.stop();
    await lease.release();
  } finally { await runtime.close().finally(async () => { await server.close(); await rm(root, { recursive: true, force: true }); }); }
});

test('three simultaneous cameras use isolated native decoders and tolerate repeated start/stop', { timeout: 30_000 }, async () => {
  const servers = Array.from({ length: 3 }, () => new CameraServer());
  const runtime = getCameraRuntime({ ...settings, maxStartingCameras: 2 });
  try {
    const leases = await Promise.all(servers.map(async (server, i) => runtime.acquire({ cameraId: `concurrent-${i}`, url: await server.start() })));
    for (let round = 0; round < 2; round++) {
      const frames = await Promise.all(leases.map(lease => lease.startFrames({ onFrame: frame => {
        assert.equal(frame.data[0], 0xff);
      }, onError: error => { throw error; } })));
      await Promise.all(frames.map(frame => frame.ready));
      await Promise.all(frames.map(frame => frame.stop()));
    }
    for (const server of servers) assert.equal(server.maximumClients, 1);
    await Promise.all(leases.map(lease => lease.release()));
  } finally { await runtime.close().finally(() => Promise.all(servers.map(server => server.close()))); }
});
