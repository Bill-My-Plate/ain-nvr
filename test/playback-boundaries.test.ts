import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlaybackStream } from '../src/playback/create-playback-stream.util.js';
import { type PlaybackMessage } from '../src/playback/playback-message.type.js';
import { type PlaybackSegment } from '../src/playback/playback-segment.type.js';
import { type PlaybackSource } from '../src/playback/playback-source.interface.js';
import { createBaselineSps, createRtp, interleaved, videoTrack } from './helpers/media.js';

const audioTrack = {
  trackId: 'audio',
  mediaType: 'audio',
  codec: 'pcmu',
  payloadType: 0,
  clockRate: 8_000,
  rtpChannel: 2,
  rtcpChannel: 3,
} as const;

function segment(ref: number, data: Buffer, startTimeMs = 1_000): PlaybackSegment<number> {
  return {
    ref,
    sessionId: 'session-1',
    startTimeMs,
    endTimeMs: startTimeMs + 100,
    discontinuityBefore: false,
    source: {
      id: String(ref),
      safeLength: data.length,
      read: async (offset, length) => data.subarray(offset, offset + length),
    },
    tracks: [
      {
        ...videoTrack,
        parameterSets: { sps: createBaselineSps(), pps: Buffer.from([0x68, 0xaa]) },
      },
      audioTrack,
    ],
    clockAnchors: [
      { trackId: 'video', byteOffset: 0, timeMs: startTimeMs, rtpTimestamp: 90_000 },
      { trackId: 'audio', byteOffset: 0, timeMs: startTimeMs, rtpTimestamp: 8_000 },
    ],
  };
}

async function collect(segments: readonly PlaybackSegment<number>[]): Promise<PlaybackMessage[]> {
  const source: PlaybackSource<number> = {
    resolveStart: async () => ({ segment: segments[0]!, byteOffset: 0, actualStartTimeMs: 1_000 }),
    nextSegment: async (ref) => segments[ref + 1],
  };
  const messages: PlaybackMessage[] = [];
  for await (const message of createPlaybackStream({
    source,
    cameraId: 'camera',
    startTimeMs: 1_000,
    maximumGapMs: 500,
  })) {
    messages.push(message);
  }
  return messages;
}

for (const reason of ['incompatible-session', 'recording-gap'] as const) {
  function nextSegment(): PlaybackSegment<number> {
    return {
      ...segment(1, Buffer.alloc(0), reason === 'recording-gap' ? 5_000 : 1_100),
      sessionId: reason === 'incompatible-session' ? 'session-2' : 'session-1',
      source: {
        id: 'must-not-read',
        safeLength: 4,
        read: async () => {
          throw new Error('Read past boundary');
        },
      },
    };
  }

  test('playback flushes the final delta frame before ' + reason, async () => {
    const data = Buffer.concat([
      interleaved(0, createRtp(1, 90_000, Buffer.from([0x65, 1]))),
      interleaved(0, createRtp(2, 99_000, Buffer.from([0x41, 2]))),
    ]);
    const messages = await collect([segment(0, data), nextSegment()]);
    assert.deepEqual(
      messages.map((message) => message.kind),
      ['ready', 'video', 'video', 'end'],
    );
    assert.deepEqual(
      messages
        .filter((message) => message.kind === 'video')
        .map((message) => message.wallClockTimeMs),
      [1_000, 1_100],
    );
    assert.deepEqual(messages.at(-1), { kind: 'end', reason });
  });

  test('playback flushes a lone IDR and buffered audio before ' + reason, async () => {
    const data = Buffer.concat([
      interleaved(0, createRtp(1, 90_000, Buffer.from([0x65, 1]))),
      interleaved(2, createRtp(1, 8_000, Buffer.from([0xff, 0x80]), true, 0, 2)),
    ]);
    const messages = await collect([segment(0, data), nextSegment()]);
    assert.deepEqual(
      messages.map((message) => message.kind),
      ['ready', 'video', 'audio', 'end'],
    );
    assert.deepEqual(messages.at(-1), { kind: 'end', reason });
  });

  test('playback drops incomplete final FU-A at ' + reason, async () => {
    const data = Buffer.concat([
      interleaved(0, createRtp(1, 90_000, Buffer.from([0x65, 1]))),
      interleaved(0, createRtp(2, 99_000, Buffer.from([0x7c, 0x81, 2]), false)),
    ]);
    const messages = await collect([segment(0, data), nextSegment()]);
    assert.deepEqual(
      messages.map((message) => message.kind),
      ['ready', 'video', 'end'],
    );
    assert.deepEqual(messages.at(-1), { kind: 'end', reason });
  });

  test('playback still rejects a boundary with no complete IDR at ' + reason, async () => {
    const data = interleaved(0, createRtp(1, 90_000, Buffer.from([0x7c, 0x85, 1]), false));
    await assert.rejects(collect([segment(0, data), nextSegment()]), { code: 'recording_gap' });
  });
}

test('playback assembles an IDR split across continuous segments without flushing early', async () => {
  const first = segment(
    0,
    interleaved(0, createRtp(1, 90_000, Buffer.from([0x7c, 0x85, 1]), false)),
  );
  const second = segment(1, interleaved(0, createRtp(2, 90_000, Buffer.from([0x7c, 0x45, 2]))));
  const messages = await collect([first, second]);
  assert.deepEqual(
    messages.map((message) => message.kind),
    ['ready', 'video', 'end'],
  );
  const video = messages.find((message) => message.kind === 'video');
  assert.ok(video?.data.includes(Buffer.from([0, 0, 0, 1, 0x65, 1, 2])));
});
