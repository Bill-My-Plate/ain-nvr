import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import test from 'node:test';

import { defaultSleep } from '../src/playback/utils/default-sleep.util.js';

test('completed playback sleeps release their abort listeners', async () => {
  const controller = new AbortController();
  // defaultSleep intentionally unrefs its timer; keep this isolated test alive.
  const keepAlive = setInterval(() => undefined, 1_000);
  try {
    for (let index = 0; index < 12; index += 1) {
      await defaultSleep(1, controller.signal);
    }
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  } finally {
    clearInterval(keepAlive);
  }
});

test('aborted playback sleep releases its listener', async () => {
  const controller = new AbortController();
  const pending = defaultSleep(60_000, controller.signal);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  controller.abort(new Error('playback stopped'));
  await assert.rejects(pending, { message: 'playback stopped' });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});
