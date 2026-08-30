import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decoderCandidates,
  selectDecoder,
  type DecoderHostCapabilities,
} from '../src/frame-extractor/decoder.js';
import { FrameSampler } from '../src/frame-extractor/frame-sampler.js';
import type {
  LibavDecoderLike,
  LibavFormatContextLike,
  LibavFrameLike,
  LibavPacketLike,
  LibavStreamLike,
} from '../src/frame-extractor/libav-types.js';
import type { Logger } from '../src/logging/logger.js';
import { createPlaybackStream, type PlaybackSource } from '../src/playback/playback-stream.js';
import type { RecordedByteSource, RecordedSegmentDescriptor } from '../src/recorded-stream-parser/recorded-rtsp-parser.js';
import { createBaselineSps, createRtp, interleaved, videoTrack } from './helpers/media.js';

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

test('frame sampler has no catch-up burst after a stall', () => {
  const sampler = new FrameSampler(4);
  assert.equal(sampler.shouldCapture(0n), true);
  assert.equal(sampler.shouldCapture(100_000_000n), false);
  assert.equal(sampler.shouldCapture(250_000_000n), true);
  assert.equal(sampler.shouldCapture(10_000_000_000n), true);
  assert.equal(sampler.shouldCapture(10_100_000_000n), false);
});

test('decoder order follows platform policy and falls back to software', async () => {
  const capabilities: DecoderHostCapabilities = {
    platform: 'linux',
    arch: 'x64',
    renderDevices: ['/dev/dri/renderD128'],
    cudaAvailable: true,
    intelCpu: false,
  };
  assert.deepEqual(decoderCandidates(capabilities).map((item) => item.label), [
    'vaapi:/dev/dri/renderD128', 'cuda', 'vulkan', 'software',
  ]);

  let destroyedPackets = 0;
  const packet: LibavPacketLike = {
    streamIndex: 0,
    flags: 1,
    destroy: () => { destroyedPackets += 1; },
  };
  const frame: LibavFrameLike = { width: 1280, height: 720, destroy: () => undefined };
  const decoder: LibavDecoderLike = {
    sendPacket: async () => true,
    receiveFrame: async () => frame,
    destroy: () => undefined,
  };
  const stream: LibavStreamLike = {
    index: 0, codec: 'h264', type: 'video', width: 1280, height: 720,
  };
  const context: LibavFormatContextLike = {
    streams: [stream],
    open: async () => undefined,
    createDecoder: (_index, hardware) => {
      if (hardware !== undefined) throw new Error('hardware unavailable');
      return decoder;
    },
    readFrame: async () => packet,
    receiveFrame: async () => undefined,
    close: async () => undefined,
  };
  const selection = await selectDecoder(
    context,
    stream,
    1,
    [{ label: 'hardware', hardwareDevice: 'vaapi' }, { label: 'software' }],
    new AbortController().signal,
    logger,
  );
  assert.equal(selection.candidate.label, 'software');
  assert.equal(selection.firstFrame, frame);
  assert.equal(destroyedPackets, 1);
});

test('playback accepts a valid final IDR completed only by flush', async () => {
  const sps = createBaselineSps();
  const pps = Buffer.from([0x68, 0xaa]);
  const idr = Buffer.from([0x65, 1]);
  const stap = Buffer.concat([
    Buffer.from([0x78, 0, sps.length]), sps,
    Buffer.from([0, pps.length]), pps,
    Buffer.from([0, idr.length]), idr,
  ]);
  const data = interleaved(0, createRtp(1, 90_000, stap));
  const byteSource: RecordedByteSource = {
    id: 'memory',
    safeLength: data.length,
    read: async (offset, length) => data.subarray(offset, offset + length),
  };
  const segment: RecordedSegmentDescriptor<string> = {
    ref: 'private-ref',
    sessionId: 'session-1',
    startTimeMs: 1_000,
    endTimeMs: 1_000,
    discontinuityBefore: false,
    source: byteSource,
    tracks: [videoTrack],
    clockAnchors: [{
      trackId: 'video', byteOffset: 0, timeMs: 1_000, rtpTimestamp: 90_000,
    }],
  };
  const source: PlaybackSource<string> = {
    resolveStart: async () => ({ segment, byteOffset: 0, actualStartTimeMs: 1_000 }),
    nextSegment: async () => undefined,
  };
  const messages = [];
  for await (const message of createPlaybackStream({
    source,
    cameraId: 'camera-1',
    startTimeMs: 1_000,
  })) {
    messages.push(message);
  }
  assert.deepEqual(messages.map((message) => message.kind), ['ready', 'video', 'end']);
});
