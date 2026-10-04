import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
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
  'ain-nvr/camera-runtime',
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

test('CommonJS output keeps a literal libav addon require for pkg', () => {
  const commonJsRuntime = readFileSync(
    join(
      process.cwd(),
      'dist/cjs/frame-extractor/scrypted-libav-runtime.js',
    ),
    'utf8',
  );

  assert.match(
    commonJsRuntime,
    /require\(["']@scrypted\/libav\/build\/Release\/addon\.node["']\)/,
  );
  assert.match(
    commonJsRuntime,
    /if \(Boolean\(process\.pkg\)\) \{\s+libav = preloadScryptedLibavNativeAddon\(\);\s+\} else \{/,
  );
});
