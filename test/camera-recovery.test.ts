import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Worker } from 'node:worker_threads';
import test from 'node:test';
import { CameraOwner } from '../src/camera-runtime/camera-owner.class.js';
import { resolveSettings } from '../src/camera-runtime/resolve-settings.util.js';
import { StartupLimiter } from '../src/camera-runtime/startup-limiter.class.js';
import type { CommittedSegment } from '../src/recording-storage/index.js';
import { getCameraRuntime } from '../src/camera-runtime/get-camera-runtime.util.js';
import { CameraServer, until } from './helpers/camera-server.js';

const settings = { acquireTimeoutMs: 3_000, shutdownTimeoutMs: 2_000, operationTimeoutMs: 8_000,
  firstFrameTimeoutMs: 10_000, restartDelayMs: 50 };

test('worker death restores recording and frames after old ownership exits', { timeout: 30_000 }, async () => {
  const server = new CameraServer();
  const root = await mkdtemp(join(tmpdir(), 'ain-recovery-'));
  const owner = new CameraOwner('recovery', await server.start(), resolveSettings(settings), new StartupLimiter(1));
  const commits: CommittedSegment[] = [];
  const frames: number[] = [];
  const errors: Error[] = [];
  try {
    await owner.ready();
    const recording = await owner.startRecording({ cacheRoot: root, segmentDurationMs: 500,
      onCommitted: segment => { commits.push(segment); }, onError: error => errors.push(error) });
    const frame = await owner.startFrames({ onFrame: value => { frames.push(value.frameNumber); }, onError: error => errors.push(error) });
    await frame.handle.ready;
    await until(() => commits.length > 0);
    const epoch = owner.status.workerEpoch;
    const previous = frames.length;
    // White-box fault injection at the private host boundary; no production testing API.
    const worker = Reflect.get(Reflect.get(owner, 'host'), 'worker') as Worker;
    await worker.terminate();
    await until(() => owner.status.workerEpoch > epoch && frames.length > previous + 2, 15_000);
    await until(() => new Set(commits.map(segment => segment.sessionStartMs)).size >= 2);
    assert.ok(frames.every((number, index) => index === 0 || number > frames[index - 1]!));
    assert.equal(server.maximumClients, 1);
    assert.equal(owner.status.reconciliationNeeded, true);
    assert.deepEqual(errors, []);
    await frame.handle.stop();
    await recording.handle.stop();
  } finally { await owner.close().finally(async () => { await server.close(); await rm(root, { recursive: true, force: true }); }); }
});

test('startup failure and cancellation settle and release all registry slots', { timeout: 10_000 }, async () => {
  const runtime = getCameraRuntime({ ...settings, acquireTimeoutMs: 200, maxCameras: 1 });
  const server = new CameraServer();
  try {
    await assert.rejects(runtime.acquire({ cameraId: 'missing', url: 'rtsp://127.0.0.1:1/camera' }), /timed out/);
    const lease = await runtime.acquire({ cameraId: 'present', url: await server.start() });
    await lease.release();
  } finally { await runtime.close().finally(() => server.close()); }
});

test('timed-out frame callbacks stop only that subscriber and report a terminal completion', { timeout: 20_000 }, async () => {
  const runtime = getCameraRuntime({ ...settings, callbackTimeoutMs: 100 });
  const server = new CameraServer();
  try {
    const lease = await runtime.acquire({ cameraId: 'callback', url: await server.start() });
    let calls = 0;
    const errors: Error[] = [];
    const bad = await lease.startFrames({ onFrame: () => { calls++; return new Promise<void>(() => undefined); }, onError: error => errors.push(error) });
    let goodCalls = 0;
    const good = await lease.startFrames({ onFrame: () => { goodCalls++; }, onError: () => undefined });
    await assert.rejects(bad.completion, /callback timed out/);
    await until(() => goodCalls >= 3);
    assert.equal(calls, 1);
    assert.equal(errors.length, 1);
    await good.stop();
    await lease.release();
  } finally { await runtime.close().finally(() => server.close()); }
});

test('upstream reconnect rebuilds recording sessions and decoder without replacing the worker', { timeout: 25_000 }, async () => {
  const runtime = getCameraRuntime(settings);
  const server = new CameraServer();
  const root = await mkdtemp(join(tmpdir(), 'ain-reconnect-'));
  try {
    const lease = await runtime.acquire({ cameraId: 'reconnect', url: await server.start() });
    const commits: CommittedSegment[] = [];
    const errors: Error[] = [];
    let frames = 0;
    const recording = await lease.startRecording({ cacheRoot: root, segmentDurationMs: 500,
      onCommitted: segment => { commits.push(segment); }, onError: error => errors.push(error) });
    const decoder = await lease.startFrames({ onFrame: () => { frames++; }, onError: error => errors.push(error) });
    await decoder.ready;
    await until(() => commits.length > 0);
    const generation = lease.status.streamGeneration;
    const epoch = lease.status.workerEpoch;
    const previous = frames;
    server.disconnectClients();
    await until(() => lease.status.streamGeneration > generation && frames > previous + 2, 15_000);
    await until(() => new Set(commits.map(segment => segment.sessionStartMs)).size >= 2);
    assert.equal(lease.status.workerEpoch, epoch);
    assert.equal(server.maximumClients, 1);
    assert.deepEqual(errors, []);
    await decoder.stop(); await recording.stop(); await lease.release();
  } finally { await runtime.close().finally(async () => { await server.close(); await rm(root, { recursive: true, force: true }); }); }
});

test('decoder failure is scoped to frames while recording continues', { timeout: 25_000 }, async () => {
  const server = new CameraServer();
  const root = await mkdtemp(join(tmpdir(), 'ain-decoder-failure-'));
  const owner = new CameraOwner('decoder-failure', await server.start(), resolveSettings({ ...settings, maximumFrameBytes: 1 }), new StartupLimiter(1));
  // An over-limit real JPEG makes the decoder fail after bounded retries.
  // A short first-frame deadline also covers initialization without publishing an oversized message.
  try {
    await owner.ready();
    let commits = 0;
    const recording = await owner.startRecording({ cacheRoot: root, segmentDurationMs: 500,
      onCommitted: () => { commits++; }, onError: () => undefined });
    const frameErrors: Error[] = [];
    const frame = await owner.startFrames({ onFrame: () => assert.fail('Oversized JPEG delivered'), onError: error => frameErrors.push(error) });
    // Native decoder error text varies by runtime. Verify propagation to the
    // subscriber instead of depending on a particular libav error string.
    await assert.rejects(frame.handle.ready, error => error instanceof Error && frameErrors.includes(error));
    const before = commits;
    await until(() => commits > before);
    assert.equal(owner.status.workerEpoch, 1);
    await recording.handle.stop();
  } finally { await owner.close().finally(async () => { await server.close(); await rm(root, { recursive: true, force: true }); }); }
});

test('RTSP authentication failure is terminal and preserves its public error code', { timeout: 8_000 }, async () => {
  const { createServer } = await import('node:net');
  let connections = 0;
  const sockets = new Set<import('node:net').Socket>();
  const server = createServer(socket => {
    connections++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', data => {
      const cseq = /CSeq:\s*(\d+)/i.exec(data.toString())?.[1] ?? '1';
      socket.write(`RTSP/1.0 401 Unauthorized\r\nCSeq: ${cseq}\r\nWWW-Authenticate: Basic realm="camera"\r\nContent-Length: 0\r\n\r\n`);
    });
  });
  const runtime = getCameraRuntime(settings);
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as import('node:net').AddressInfo;
    await assert.rejects(runtime.acquire({ cameraId: 'auth', url: `rtsp://127.0.0.1:${address.port}/camera` }),
      error => (error as NodeJS.ErrnoException).code === 'rtsp_authentication_failed');
    assert.equal(connections, 1);
  } finally {
    await runtime.close().finally(async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    });
  }
});
