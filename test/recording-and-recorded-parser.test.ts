import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RecordedRtspParser,
  RecordedStreamError,
  type RecordedByteSource,
  type RecordedSegmentDescriptor,
} from '../src/recorded-stream-parser/recorded-rtsp-parser.js';
import {
  RecordingParser,
  type RecordingWriteRequest,
} from '../src/recording-parser/recording-parser.js';
import {
  RecordingPipeline,
  type RecordingPacketSource,
} from '../src/recording-parser/recording-pipeline.js';
import type { MediaPacket } from '../src/stream/rtsp-stream-session.js';
import {
  createBaselineSps,
  createRtp,
  interleaved,
  mediaPacket,
  videoTrack,
} from './helpers/media.js';

function keyPayload(): Buffer {
  const sps = createBaselineSps();
  const pps = Buffer.from([0x68, 0xaa]);
  const idr = Buffer.from([0x65, 1]);
  return Buffer.concat([
    Buffer.from([0x78, 0, sps.length]), sps,
    Buffer.from([0, pps.length]), pps,
    Buffer.from([0, idr.length]), idr,
  ]);
}

test('recording parser returns semantic indexes with host-owned opaque locations', async () => {
  type Location = { readonly cacheKey: string; readonly byteOffset: number };
  const writes: RecordingWriteRequest[] = [];
  let offset = 0;
  const parser = new RecordingParser<Location>({ tracks: [videoTrack] });
  const writer = {
    write: async (request: RecordingWriteRequest): Promise<Location> => {
      writes.push(request);
      const location = { cacheKey: 'private-cache-file', byteOffset: offset };
      offset += request.packet.rawInterleavedFrame.length;
      return location;
    },
  };

  parser.requestBoundary();
  const first = await parser.process(mediaPacket(1, 90_000, keyPayload()), writer);
  assert.equal(writes[0]?.boundaryBefore, true);
  assert.equal(first.some((event) => event.type === 'configuration'), true);
  assert.equal(first.some((event) => event.type === 'clock-anchor'), true);
  assert.equal(first.some((event) => event.type === 'playpoint'), true);

  const changedSsrc = await parser.process(mediaPacket(
    2,
    93_600,
    Buffer.from([0x61, 2]),
    { arrivalTimeMs: 1_040, ssrc: 2 },
  ), writer);
  assert.equal(writes[1]?.discontinuityBefore, true);
  assert.equal(changedSsrc.find((event) => event.type === 'keyframe')?.location.cacheKey,
    'private-cache-file');
  assert.equal(changedSsrc.some((event) => event.type === 'discontinuity'
    && event.reason === 'ssrc-change'), true);
});

test('recording index does not trust an early marker on an incomplete IDR FU-A', async () => {
  const parser = new RecordingParser<number>({ tracks: [videoTrack] });
  const writer = { write: async () => 0 };
  const events = await parser.process(mediaPacket(
    1,
    90_000,
    Buffer.from([0x7c, 0x85, 1, 2]),
    { marker: true },
  ), writer);
  assert.equal(events.some((event) => event.type === 'keyframe'), false);
  const flushed = await parser.flush(writer);
  assert.equal(flushed.some((event) => event.type === 'keyframe'), false);
});

test('decoder-safe recording waits for a complete IDR at initial start and rotation', async () => {
  const writes: RecordingWriteRequest[] = [];
  const parser = new RecordingParser<number>({
    tracks: [videoTrack],
    decoderSafeBoundaries: true,
  });
  const writer = {
    write: async (request: RecordingWriteRequest): Promise<number> => {
      writes.push(request);
      return writes.length - 1;
    },
  };

  await parser.process(mediaPacket(1, 90_000, Buffer.from([0x61, 1])), writer);
  assert.equal(writes.length, 0);

  await parser.process(mediaPacket(2, 93_600, keyPayload()), writer);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.boundaryBefore, true);

  parser.requestBoundary();
  await parser.process(mediaPacket(3, 97_200, Buffer.from([0x61, 2])), writer);
  assert.equal(writes[1]?.boundaryBefore, false);
  await parser.process(mediaPacket(4, 100_800, keyPayload()), writer);
  assert.equal(writes[2]?.boundaryBefore, true);
});

test('decoder-safe recording skips a damaged IDR and marks a reconnect boundary', async () => {
  const track = {
    ...videoTrack,
    parameterSets: { sps: createBaselineSps(), pps: Buffer.from([0x68, 0xaa]) },
  };
  const writes: RecordingWriteRequest[] = [];
  const parser = new RecordingParser<number>({
    tracks: [track],
    decoderSafeBoundaries: true,
  });
  const writer = {
    write: async (request: RecordingWriteRequest): Promise<number> => {
      writes.push(request);
      return writes.length - 1;
    },
  };

  await parser.process(mediaPacket(
    1,
    90_000,
    Buffer.from([0x7c, 0x85, 1]),
    { marker: true, track },
  ), writer);
  assert.equal(writes.length, 0);

  const recovered = mediaPacket(2, 93_600, Buffer.from([0x65, 2]), { track });
  Object.assign(recovered, { discontinuity: true });
  const events = await parser.process(recovered, writer);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.boundaryBefore, true);
  assert.equal(writes[0]?.discontinuityBefore, true);
  assert.equal(events.some((event) => event.type === 'discontinuity'
    && event.reason === 'source-reconnect'), true);
});

test('recording pipeline serializes writes and releases bounded backpressure', async () => {
  let subscriber: ((packet: MediaPacket) => void) | undefined;
  let pauses = 0;
  let resumes = 0;
  const source: RecordingPacketSource = {
    subscribeMediaPackets: (next) => {
      subscriber = next;
      return () => { subscriber = undefined; };
    },
    pauseMedia: () => { pauses += 1; },
    resumeMedia: () => { resumes += 1; },
  };
  let releaseFirstWrite: (() => void) | undefined;
  const firstWrite = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
  const sequences: number[] = [];
  const pipeline = new RecordingPipeline<number>({
    source,
    tracks: [videoTrack],
    pauseAtBytes: 30,
    resumeAtBytes: 10,
    maximumQueuedBytes: 1_000,
    writer: {
      write: async ({ packet }) => {
        sequences.push(packet.rtp?.sequenceNumber ?? -1);
        if (sequences.length === 1) await firstWrite;
        return sequences.length;
      },
    },
  });
  pipeline.start();
  subscriber?.(mediaPacket(1, 90_000, Buffer.from([0x61, 1])));
  await new Promise<void>((resolve) => setImmediate(resolve));
  subscriber?.(mediaPacket(2, 93_600, Buffer.from([0x61, 2])));
  subscriber?.(mediaPacket(3, 97_200, Buffer.from([0x61, 3])));
  assert.equal(pauses, 1);
  releaseFirstWrite?.();
  await pipeline.stop();
  assert.deepEqual(sequences, [1, 2, 3]);
  assert.equal(resumes, 1);
  assert.equal(pipeline.status.state, 'stopped');
});

function memorySource(data: Buffer, safeLength = data.length): RecordedByteSource {
  return {
    id: 'memory-segment',
    safeLength,
    read: async (offset, length) => data.subarray(offset, offset + Math.min(length, 3)),
  };
}

function descriptor(data: Buffer, safeLength = data.length): RecordedSegmentDescriptor<string> {
  return {
    ref: 'private-segment-reference',
    sessionId: 'session-1',
    startTimeMs: 1_000,
    endTimeMs: 1_100,
    discontinuityBefore: false,
    source: memorySource(data, safeLength),
    tracks: [videoTrack],
    clockAnchors: [{
      trackId: 'video',
      byteOffset: 0,
      timeMs: 1_000,
      rtpTimestamp: 90_000,
    }],
  };
}

test('recorded parser supports partial reads and reorders within its bounded window', async () => {
  const data = Buffer.concat([
    interleaved(0, createRtp(10, 90_000, Buffer.from([0x61, 1]))),
    interleaved(0, createRtp(12, 97_200, Buffer.from([0x61, 3]))),
    interleaved(0, createRtp(11, 93_600, Buffer.from([0x61, 2]))),
  ]);
  const packets = [];
  for await (const packet of new RecordedRtspParser().parse(descriptor(data))) {
    packets.push(packet);
  }
  assert.deepEqual(packets.map((packet) => packet.rtp?.sequenceNumber), [10, 11, 12]);
  assert.deepEqual(packets.map((packet) => packet.wallClockTimeMs), [1_000, 1_040, 1_080]);
});

test('recorded parser never reads through the host safe boundary', async () => {
  const data = interleaved(0, createRtp(1, 90_000, Buffer.from([0x61, 1])));
  await assert.rejects(async () => {
    for await (const _packet of new RecordedRtspParser().parse(
      descriptor(data, data.length - 1),
    )) {
      // Consume the generator.
    }
  }, RecordedStreamError);
});
