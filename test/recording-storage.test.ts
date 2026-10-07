import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { RecordingSegmentWriter } from '../src/recording-storage/services/recording-segment-writer.class.js';
import { RecordingFileUtil } from '../src/recording-storage/services/recording-file-util.class.js';
import type { CommittedSegment } from '../src/recording-storage/types/committed-segment.type.js';
import { createBaselineSps, mediaPacket, videoTrack } from './helpers/media.js';
import { RecordingParser } from '../src/recording-parser/services/recording-parser.class.js';

const sessionInfo = { sdp: 'v=0\r\n', tracks: [{ ...videoTrack, control: 'track1', parameterSets: {
  sps: createBaselineSps(), pps: Buffer.from([0x68, 0xaa]),
} }] };

test('schema-1 storage preserves publication order, indexes, collision rules and partial writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ain-writer-'));
  const cacheRoot = join(root, 'cache');
  const finalRoot = join(root, 'final');
  const cameraId = 'camera';
  const committed: CommittedSegment[] = [];
  const closed: number[] = [];
  try {
    await mkdir(join(finalRoot, cameraId, '1000'), { recursive: true });
    const writer = await RecordingSegmentWriter.create({ cameraId, cacheRoot, finalRoot,
      sessionInfo, sessionStartMs: 1_000, segmentDurationMs: 10_000,
      onCommitted: segment => committed.push(segment), onSessionClosed: (_, session) => closed.push(session) });
    const first = mediaPacket(1, 90_000, Buffer.from([0x65, 1]), { arrivalTimeMs: 2_000 });
    const location = await writer.write({ packet: first, boundaryBefore: true, discontinuityBefore: false });
    // Emulate a filesystem handle which accepts only a prefix on each write.
    const handle = location.segment.handle;
    const original = handle.write.bind(handle);
    let shortWrites = 0;
    handle.write = (async (...args: unknown[]) => {
      shortWrites++;
      return original(args[0] as Buffer, args[1] as number, Math.min(3, args[2] as number), null);
    }) as typeof handle.write;
    const second = mediaPacket(2, 99_000, Buffer.from([0x61, 2]), { arrivalTimeMs: 2_100 });
    await writer.write({ packet: second, boundaryBefore: false, discontinuityBefore: false });
    assert.ok(shortWrites > 1);
    const third = mediaPacket(3, 108_000, Buffer.from([0x65, 3]), { arrivalTimeMs: 3_000 });
    await writer.write({ packet: third, boundaryBefore: true, discontinuityBefore: false });
    assert.equal(committed.length, 0, 'rotation cannot publish before the index batch completes');
    await writer.applyEvents([
      { type: 'keyframe', trackId: 'video', location, timeMs: 2_000, rtpTimestamp: 90_000, sequenceNumber: 1 },
      { type: 'playpoint', location, timeMs: 2_000 },
      { type: 'clock-anchor', trackId: 'video', source: 'arrival', location, timeMs: 2_000, rtpTimestamp: 90_000 },
    ]);
    await writer.completeBatch();
    assert.equal(committed.length, 1);
    const segment = committed[0]!;
    assert.equal(segment.sessionStartMs, 1_001);
    assert.equal(segment.mediaPath, join(cacheRoot, cameraId, '1001', '0', '2000.rtsp'));
    assert.deepEqual(await readFile(segment.mediaPath), Buffer.concat([first.rawInterleavedFrame, second.rawInterleavedFrame]));
    assert.deepEqual(JSON.parse(await readFile(segment.metadataPath, 'utf8')), {
      schemaVersion: 1, cameraId, sessionStartMs: 1_001, segmentStartMs: 2_000, endTimeMs: 2_100,
      durationMs: 100, complete: true, bytes: first.rawInterleavedFrame.length + second.rawInterleavedFrame.length,
      discontinuityBefore: false, clockAnchors: [{ trackId: 'video', source: 'arrival', timeMs: 2_000, rtpTimestamp: 90_000, byteOffset: 0 }],
      playpointIntervalMs: 2_000, playpoints: [{ timeMs: 2_000, offsetMs: 0, byteOffset: 0 }],
      keyframes: [{ timeMs: 2_000, offsetMs: 0, byteOffset: 0, rtpTimestamp: 90_000, sequenceNumber: 1 }],
    });
    const session = JSON.parse(await readFile(segment.sessionMetadataPath, 'utf8'));
    assert.deepEqual(session, {
      schemaVersion: 1, cameraId, sessionStartMs: 1_001, createdAt: new Date(1_001).toISOString(),
      segmentDurationMs: 10_000, playpointIntervalMs: 2_000, sdp: sessionInfo.sdp,
      tracks: [{ ...videoTrack, parameterSets: undefined, control: 'track1',
        webCodec: { codec: 'avc1.42001f', codedWidth: 1280, codedHeight: 720, bitstreamFormat: 'annexb' },
        parameterSetsBase64: { sps: createBaselineSps().toString('base64'), pps: 'aKo=' } }].map(({ parameterSets: _, ...track }) => track),
    });
    await writer.close(false);
    assert.deepEqual(closed, []);
    assert.ok((await stat(join(cacheRoot, cameraId, '1001', '0', '3000.rtsp.partial'))).size > 0);
    assert.equal((await readdir(join(cacheRoot, cameraId, '1001', '0'))).filter(name => name.endsWith('.json')).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('atomic publication retries only transient Windows rename failures', async () => {
  let calls = 0;
  await RecordingFileUtil.renameAtomic('source', 'destination', 'win32', async () => {
    if (++calls < 3) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
  });
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(RecordingFileUtil.renameAtomic('source', 'destination', 'linux', async () => {
    calls++; throw Object.assign(new Error('denied'), { code: 'EACCES' });
  }), /denied/);
  assert.equal(calls, 1);
});

test('missing IDR termination is bounded before writer access', async () => {
  const parser = new RecordingParser({ tracks: sessionInfo.tracks, decoderSafeBoundaries: true, reorderWindowPackets: 1 });
  let writes = 0;
  const writer = { write: async () => { writes++; return 0; } };
  await assert.rejects(async () => {
    for (let i = 0; i < 5_000; i++) {
      await parser.process(mediaPacket(i, 90_000, Buffer.from([0x7c, i === 0 ? 0x85 : 0x05, 1]), { marker: false }), writer);
    }
  }, /buffer limit/);
  assert.equal(writes, 0);
});
