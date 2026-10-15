import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

import { RtspUrlFrameExtractor } from '../src/frame-extractor/services/rtsp-url-frame-extractor.class.js';
import type { LibavFormatContextLike } from '../src/frame-extractor/types/libav-format-context-like.type.js';
import type { LibavFrameLike } from '../src/frame-extractor/types/libav-frame-like.type.js';
import { delay as reconnectDelay } from '../src/frame-extractor/utils/delay.util.js';

test('completed reconnect delays release their abort listeners', async () => {
  const controller = new AbortController();
  await Promise.all([reconnectDelay(1, controller.signal), delay(5)]);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('URL extractor bounds queued frames and releases them on stop', { timeout: 5_000 }, async () => {
  const destroyed: number[] = [];
  const frame = (number: number): LibavFrameLike => ({
    width: 640,
    height: 480,
    destroy: () => { destroyed.push(number); },
  });
  let releaseCallback!: () => void;
  const callbackHeld = new Promise<void>((resolve) => { releaseCallback = resolve; });
  let releaseRead!: () => void;
  const readHeld = new Promise<undefined>((resolve) => { releaseRead = () => resolve(undefined); });
  let reads = 0;
  let closes = 0;
  let number = 0;
  const received: number[] = [];
  const context: LibavFormatContextLike = {
    streams: [{ index: 0, type: 'video', codec: 'h264', width: 640, height: 480 }],
    open: async () => undefined,
    createDecoder: () => ({
      sendPacket: async () => true,
      receiveFrame: async () => frame(0),
      destroy: () => undefined,
    }),
    readFrame: async () => ({ streamIndex: 0, flags: 1, destroy: () => undefined }),
    receiveFrame: async () => {
      reads += 1;
      return reads <= 2 ? { ...frame(reads), type: 'frame' as const, streamIndex: 0 } : readHeld;
    },
    close: async () => { closes += 1; releaseRead(); },
  };
  const extractor = new RtspUrlFrameExtractor({
    id: 'camera',
    url: 'rtsp://camera/live',
    runtime: {
      keyPacketFlag: 1,
      initialize: async () => undefined,
      createFormatContext: () => context,
      toJpeg: async () => Buffer.from('jpeg'),
    },
    onFrame: async (value) => { received.push(value.frameNumber); await callbackHeld; },
    capabilities: { platform: 'darwin', arch: 'x64', renderDevices: [], cudaAvailable: false, intelCpu: false },
    monotonicNow: () => BigInt(number++) * 1_000_000_000n,
  });

  extractor.start();
  try {
    for (let attempt = 0; attempt < 100 && reads < 3; attempt++) await delay(5);
    assert.equal(reads, 3);
    assert.equal(extractor.state, 'extracting');
    assert.equal(extractor.status.decodedFrames, 3);
    assert.equal(extractor.status.droppedFrames, 1);
    assert.deepEqual(destroyed.sort(), [0, 2]);

    const stopped = extractor.stop();
    await delay(0);
    assert.equal(extractor.state, 'extracting');
    releaseCallback();
    await stopped;
    assert.deepEqual(received, [0]);
    assert.equal(extractor.status.emittedFrames, 1);
    assert.deepEqual(destroyed.sort(), [0, 1, 2]);
    assert.ok(closes >= 1);
    assert.equal(extractor.state, 'stopped');
  } finally {
    releaseCallback();
    await extractor.stop();
  }
});

test('URL extractor reports a failed connection and starts another session', { timeout: 5_000 }, async () => {
  let contexts = 0;
  let closes = 0;
  let releaseRead!: () => void;
  const readHeld = new Promise<undefined>((resolve) => { releaseRead = () => resolve(undefined); });
  const errors: Error[] = [];
  const extractor = new RtspUrlFrameExtractor({
    id: 'camera',
    url: 'rtsp://camera/live',
    runtime: {
      keyPacketFlag: 1,
      initialize: async () => undefined,
      createFormatContext: (): LibavFormatContextLike => {
        const attempt = ++contexts;
        return {
          streams: [{ index: 0, type: 'video', codec: 'h264', width: 640, height: 480 }],
          open: async () => { if (attempt === 1) throw new Error('connection lost'); },
          createDecoder: () => ({
            sendPacket: async () => true,
            receiveFrame: async () => ({ width: 640, height: 480, destroy: () => undefined }),
            destroy: () => undefined,
          }),
          readFrame: async () => ({ streamIndex: 0, flags: 1, destroy: () => undefined }),
          receiveFrame: async () => readHeld,
          close: async () => { closes += 1; if (attempt === 2) releaseRead(); },
        };
      },
      toJpeg: async () => Buffer.from('jpeg'),
    },
    onFrame: () => undefined,
    onError: (error) => { errors.push(error); },
    capabilities: { platform: 'darwin', arch: 'x64', renderDevices: [], cudaAvailable: false, intelCpu: false },
    reconnectInitialMs: 1,
    reconnectMaximumMs: 1,
  });

  extractor.start();
  try {
    for (let attempt = 0; attempt < 100 && extractor.state !== 'extracting'; attempt++) await delay(5);
    assert.equal(extractor.state, 'extracting');
    assert.equal(contexts, 2);
    assert.deepEqual(errors.map((error) => error.message), ['connection lost']);
    assert.equal(extractor.status.decodedFrames, 1);
  } finally {
    await extractor.stop();
  }
  assert.equal(extractor.state, 'stopped');
  assert.ok(closes >= 2);
});
