import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { runInThisContext } from 'node:vm';
import type { CameraOwner } from '../src/camera-runtime/camera-owner.class.js';
import { resolveSettings } from '../src/camera-runtime/resolve-settings.util.js';
import { StartupLimiter } from '../src/camera-runtime/startup-limiter.class.js';
import { CameraServer } from './helpers/camera-server.js';

test('CommonJS camera frames start without a VM dynamic import callback', { timeout: 20_000 }, async () => {
  const filename = join(process.cwd(), 'dist/cjs/camera-runtime/camera-owner.class.js');
  const require = createRequire(filename);
  const module = { exports: {} as { CameraOwner: typeof CameraOwner } };
  // pkg executes compiled CommonJS in a VM. Deliberately omit the dynamic
  // import callback to reproduce the packaged preview startup failure.
  const wrapper = runInThisContext(Module.wrap(readFileSync(filename, 'utf8')), { filename });
  wrapper(module.exports, require, module, filename, dirname(filename));

  const libav = require('@scrypted/libav') as typeof import('@scrypted/libav');
  assert.equal(libav.isLoaded(), false, 'the parent must not load the native decoder');
  const server = new CameraServer();
  let owner: CameraOwner | undefined;
  const errors: Error[] = [];
  let delivered = 0;
  try {
    owner = new module.exports.CameraOwner('vm-camera', await server.start(), resolveSettings({
      acquireTimeoutMs: 5_000, operationTimeoutMs: 10_000,
      firstFrameTimeoutMs: 10_000, shutdownTimeoutMs: 2_000,
    }), new StartupLimiter(1));
    const { handle } = await owner.startFrames({
      onFrame: frame => {
        assert.ok(Buffer.isBuffer(frame.data));
        assert.equal(frame.data.readUInt16BE(0), 0xffd8);
        assert.equal(frame.width, 160);
        assert.equal(frame.height, 96);
        delivered++;
      },
      onError: error => { errors.push(error); },
    });
    await handle.ready;
    await handle.stop();
    assert.ok(delivered > 0);
    assert.equal(server.maximumClients, 1);
    assert.equal(libav.isLoaded(), false, 'native decoding must stay in the child process');
    assert.deepEqual(errors, []);
  } finally {
    try { await owner?.close(); }
    finally { await server.close(); }
  }
});
