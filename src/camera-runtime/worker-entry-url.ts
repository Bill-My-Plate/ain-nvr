import { pathToFileURL } from 'node:url';

/** build-dual replaces import.meta.url with __filename for CommonJS. */
export function privateEntry(name: 'camera-worker-entry' | 'decoder-process-entry'): URL {
  const moduleUrl = import.meta.url.startsWith('file:') ? new URL(import.meta.url) : pathToFileURL(import.meta.url);
  return new URL(`./${name}.js`, moduleUrl);
}
