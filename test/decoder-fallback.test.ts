import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import test, { type TestContext } from 'node:test';
import { DecoderProcess } from '../src/camera-runtime/services/decoder-process.class.js';
import { resolveSettings } from '../src/camera-runtime/utils/resolve-settings.util.js';
import { decoderCandidates, detectDecoderHostCapabilities } from '../src/frame-extractor/index.js';
import { until } from './helpers/camera-server.js';

const linux = { skip: process.platform !== 'linux', timeout: 5_000 };
const renderDevice = '/dev/dri/renderD128';

function mockRenderAccess(t: TestContext, readable: boolean): void {
  const readdirSync = fs.readdirSync;
  const accessSync = fs.accessSync;
  t.mock.method(fs, 'readdirSync', (...args: unknown[]) =>
    args[0] === '/dev/dri' ? ['renderD128'] : Reflect.apply(readdirSync, fs, args),
  );
  t.mock.method(fs, 'accessSync', (path: fs.PathLike, mode?: number) => {
    if (path !== renderDevice) return accessSync(path, mode);
    assert.equal(mode, fs.constants.R_OK | fs.constants.W_OK);
    if (!readable) throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
  });
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  syncBuiltinESMExports();
}

test('Linux selects only CPU decoding when the render device cannot be opened', linux, (t) => {
  mockRenderAccess(t, false);
  const capabilities = detectDecoderHostCapabilities({});
  assert.deepEqual(capabilities.renderDevices, []);
  assert.deepEqual(decoderCandidates(capabilities).map(({ label }) => label), ['software']);
});

test('Linux prefers hardware with an accessible device and can still select CPU only', linux, (t) => {
  mockRenderAccess(t, true);
  const capabilities = detectDecoderHostCapabilities({});
  assert.deepEqual(capabilities.renderDevices, [renderDevice]);
  assert.deepEqual(decoderCandidates(capabilities).map(({ label }) => label), [
    `vaapi:${renderDevice}`,
    'vulkan',
    'software',
  ]);
  assert.deepEqual(decoderCandidates({ ...capabilities, softwareOnly: true }).map(({ label }) => label), ['software']);
});

for (const { scenario, access, frames, attempts, error } of [
  { scenario: 'denied', access: false, frames: ['software'], attempts: 1 },
  { scenario: 'healthy', access: true, frames: ['vaapi'], attempts: 1 },
  { scenario: 'linker-error', access: true, frames: ['software'], attempts: 2 },
  { scenario: 'reported-error', access: true, frames: ['software'], attempts: 2 },
  { scenario: 'crash-after-frame', access: true, frames: ['vaapi', 'software'], attempts: 2 },
  { scenario: 'cpu-error', access: true, frames: [], attempts: 2, error: 'Decoder process exited (1).' },
  { scenario: 'cpu-stall', access: true, frames: ['vaapi'], attempts: 2, error: 'CPU decoder produced no JPEG before its deadline.' },
  { scenario: 'stop-during-retry', access: true, frames: ['vaapi'], attempts: 2 },
]) {
  test(`managed decoder handles ${scenario}`, linux, async (t) => {
    mockRenderAccess(t, access);
    const fork = childProcess.fork;
    const childPids: number[] = [];
    const forkMock = t.mock.method(childProcess, 'fork', (
      _entry: string | URL,
      args: readonly string[],
      options: childProcess.ForkOptions,
    ) => {
      for (const pid of childPids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
      const child = fork(new URL('./helpers/decoder-process-fixture.js', import.meta.url), args, {
        ...options,
        env: {
          ...options.env,
          NVIDIA_VISIBLE_DEVICES: '',
          NVIDIA_DRIVER_CAPABILITIES: '',
          AIN_DECODER_TEST_SCENARIO: scenario,
        },
      });
      assert.ok(child.pid);
      childPids.push(child.pid);
      return child;
    });
    const environment = process.env;
    const visibleDevices = environment.NVIDIA_VISIBLE_DEVICES;
    delete environment.NVIDIA_VISIBLE_DEVICES;
    syncBuiltinESMExports();
    const received: string[] = [];
    const errors: Error[] = [];
    const decoder = new DecoderProcess(
      resolveSettings({
        operationTimeoutMs: 2_000,
        firstFrameTimeoutMs: scenario === 'cpu-stall' ? 300 : 2_000,
        shutdownTimeoutMs: 300,
      }),
      (frame) => received.push(frame.decoder),
      (error) => errors.push(error),
    );
    try {
      await decoder.start('rtsp://127.0.0.1:8554/test', 'test', { framesPerSecond: 4, jpegQuality: 0.9 });
      if (scenario === 'stop-during-retry') await until(() => childPids.length === attempts, 2_000);
      await until(() => received.length >= frames.length && (error === undefined || errors.length > 0), 2_000);
    } finally {
      await decoder.stop();
      if (visibleDevices !== undefined) environment.NVIDIA_VISIBLE_DEVICES = visibleDevices;
    }
    assert.deepEqual(received, frames);
    assert.deepEqual(errors.map(({ message }) => message), error === undefined ? [] : [error]);
    assert.equal(forkMock.mock.callCount(), attempts);
    for (const pid of childPids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  });
}
