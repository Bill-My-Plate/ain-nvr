import assert from 'node:assert/strict';
import test from 'node:test';

import { SharedRtspFrameExtractor } from '../src/frame-extractor/shared-rtsp-frame-extractor.class.js';
import type { LibavDecoderLike } from '../src/frame-extractor/libav-decoder-like.type.js';
import type { LibavFormatContextLike } from '../src/frame-extractor/libav-format-context-like.type.js';
import type { LibavFrameLike } from '../src/frame-extractor/libav-frame-like.type.js';
import type { LibavPacketLike } from '../src/frame-extractor/libav-packet-like.type.js';
import type { LibavRuntime } from '../src/frame-extractor/libav-runtime.type.js';
import type { MediaPacket } from '../src/media/index.js';
import { RtspLoopbackBridge } from '../src/stream-adapters/rtsp-loopback-bridge.class.js';
import { type RtspBridgePacketSource } from '../src/stream-adapters/rtsp-bridge-packet-source.interface.js';
import { RtspClient } from '../src/rtsp-client/rtsp-client.class.js';
import { createBaselineSps, mediaPacket, videoTrack } from './helpers/media.js';

class FakePacketSource implements RtspBridgePacketSource {
  readonly tracks = [{
    ...videoTrack,
    parameterSets: {
      sps: createBaselineSps(),
      pps: Buffer.from([0x68, 0xaa]),
    },
  }];

  subscriptions = 0;
  unsubscriptions = 0;
  private readonly subscribers = new Set<(packet: MediaPacket) => void>();

  subscribeMediaPackets(subscriber: (packet: MediaPacket) => void): () => void {
    this.subscriptions += 1;
    this.subscribers.add(subscriber);
    return () => {
      if (this.subscribers.delete(subscriber)) this.unsubscriptions += 1;
    };
  }

  emit(packet: MediaPacket): void {
    for (const subscriber of this.subscribers) subscriber(packet);
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds = 2_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Test timed out.')), milliseconds);
      timer.unref();
    }),
  ]);
}

test('loopback bridge serves SDP and forwards original RTP over negotiated TCP channels', async () => {
  const source = new FakePacketSource();
  const bridge = new RtspLoopbackBridge({ source });
  const url = await bridge.start();
  assert.match(url, /^rtsp:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{32}$/u);

  const client = new RtspClient({ url, mediaTimeoutMs: 60_000 });
  const received = withTimeout(new Promise<Buffer>((resolve) => {
    client.once('interleaved', (frame) => resolve(frame.payload));
  }));
  const packet = mediaPacket(1, 90_000, Buffer.from([0x65, 1, 2]));
  source.emit(packet);
  try {
    const session = await client.connect();
    assert.equal(session.video.rtpMap.payloadType, 96);
    assert.equal(session.video.rtpChannel, 0);
    assert.match(session.sdp, /sprop-parameter-sets=/u);

    assert.deepEqual(await received, packet.frame.payload);
    assert.equal(bridge.status.forwardedPackets, 1);
    assert.equal(source.subscriptions, 1);
  } finally {
    await client.close();
    await bridge.stop();
  }
  assert.equal(source.unsubscriptions, 1);
});

test('loopback bridge drops only a slow local client at its queue limit', async () => {
  const source = new FakePacketSource();
  const bridge = new RtspLoopbackBridge({
    source,
    maximumClientQueuedBytes: 1,
  });
  const client = new RtspClient({ url: await bridge.start(), mediaTimeoutMs: 60_000 });
  try {
    await client.connect();
    const disconnected = withTimeout(new Promise<void>((resolve) => {
      client.once('disconnect', () => resolve());
    }));
    source.emit(mediaPacket(1, 90_000, Buffer.from([0x65, 1, 2])));
    await disconnected;
    assert.equal(bridge.status.droppedClients, 1);
    assert.equal(source.unsubscriptions, 0);
  } finally {
    await client.close();
    await bridge.stop();
  }
  assert.equal(source.unsubscriptions, 1);
});

test('shared extractor opens only the loopback URL and emits a JPEG', async () => {
  const source = new FakePacketSource();
  let openedUrl: string | undefined;
  let releaseReceive: (() => void) | undefined;
  let contextClosed = false;
  const packet: LibavPacketLike = {
    streamIndex: 0,
    flags: 1,
    destroy: () => undefined,
  };
  const frame: LibavFrameLike = {
    width: 640,
    height: 360,
    destroy: () => undefined,
  };
  const decoder: LibavDecoderLike = {
    sendPacket: async () => true,
    receiveFrame: async () => frame,
    destroy: () => undefined,
  };
  const context: LibavFormatContextLike = {
    streams: [{ index: 0, codec: 'h264', type: 'video', width: 640, height: 360 }],
    open: async (input) => { openedUrl = input; },
    createDecoder: () => decoder,
    readFrame: async () => packet,
    receiveFrame: async () => new Promise<undefined>((resolve) => {
      releaseReceive = () => resolve(undefined);
    }),
    close: async () => {
      contextClosed = true;
      releaseReceive?.();
    },
  };
  const runtime: LibavRuntime = {
    keyPacketFlag: 1,
    initialize: async () => undefined,
    createFormatContext: () => context,
    toJpeg: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  };
  let resolveFrame: ((value: Buffer) => void) | undefined;
  const emitted = withTimeout(new Promise<Buffer>((resolve) => { resolveFrame = resolve; }));
  const extractor = new SharedRtspFrameExtractor({
    id: 'camera-1',
    source,
    runtime,
    capabilities: {
      platform: 'linux',
      arch: 'x64',
      renderDevices: [],
      cudaAvailable: false,
      intelCpu: false,
    },
    onFrame: ({ data }) => { resolveFrame?.(data); },
  });

  await extractor.start();
  assert.deepEqual(await emitted, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.match(openedUrl ?? '', /^rtsp:\/\/127\.0\.0\.1:\d+\//u);
  assert.equal(source.subscriptions, 1);
  await extractor.stop();
  assert.equal(source.unsubscriptions, 1);
  assert.equal(contextClosed, true);
});
