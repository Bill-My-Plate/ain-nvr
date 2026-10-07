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
const baseline = JSON.parse(
  readFileSync(join(process.cwd(), 'test/public-api-baseline.json'), 'utf8'),
) as {
  exports: Record<string, unknown>;
  typesVersions: Record<string, unknown>;
  runtime: Record<string, string[]>;
};

test('every public entrypoint supports import and require', async () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>;
    typesVersions: Record<string, unknown>;
  };
  assert.deepEqual(packageJson.exports, baseline.exports);
  assert.deepEqual(packageJson.typesVersions, baseline.typesVersions);
  for (const entrypoint of packageEntrypoints) {
    const esmModule = await import(entrypoint);
    const commonJsModule = require(entrypoint) as Record<string, unknown>;

    assert.deepEqual(Object.keys(esmModule).sort(), baseline.runtime[entrypoint]);
    assert.deepEqual(
      Object.keys(commonJsModule).sort(),
      Object.keys(esmModule).sort(),
      `${entrypoint} exposes different ESM and CommonJS APIs`,
    );
  }
});

test('CommonJS output keeps a literal libav addon require for pkg', () => {
  const commonJsAddonLoader = readFileSync(
    join(
      process.cwd(),
      'dist/cjs/frame-extractor/utils/preload-scrypted-libav-native-addon.util.js',
    ),
    'utf8',
  );
  const commonJsRuntime = readFileSync(
    join(
      process.cwd(),
      'dist/cjs/frame-extractor/utils/create-scrypted-libav-runtime.util.js',
    ),
    'utf8',
  );

  assert.match(
    commonJsAddonLoader,
    /require\(["']@scrypted\/libav\/build\/Release\/addon\.node["']\)/,
  );
  assert.match(commonJsRuntime, /if \(Boolean\(process\.pkg\)\) \{/);
  assert.match(commonJsRuntime, /preloadScryptedLibavNativeAddon/);
});
