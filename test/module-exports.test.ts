import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const packageEntrypoints = [
  'ain-nvr',
  'ain-nvr/rtsp-parser',
  'ain-nvr/rtsp-client',
  'ain-nvr/rtp-parser',
  'ain-nvr/h264',
  'ain-nvr/stream-session',
  'ain-nvr/recording-parser',
  'ain-nvr/recorded-stream-parser',
  'ain-nvr/playback',
  'ain-nvr/playback-wire',
  'ain-nvr/frame-extractor',
  'ain-nvr/rtp-forwarder',
  'ain-nvr/rtsp-bridge',
] as const;

const require = createRequire(import.meta.url);

test('every public entrypoint supports import and require', async () => {
  for (const entrypoint of packageEntrypoints) {
    const esmModule = await import(entrypoint);
    const commonJsModule = require(entrypoint) as Record<string, unknown>;

    assert.ok(Object.keys(esmModule).length > 0, `${entrypoint} has no ESM exports`);
    assert.deepEqual(
      Object.keys(commonJsModule).sort(),
      Object.keys(esmModule).sort(),
      `${entrypoint} exposes different ESM and CommonJS APIs`,
    );
  }
});
