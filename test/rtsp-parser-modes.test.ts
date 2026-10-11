import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RtspParser,
} from '../src/rtsp-parser/index.js';

const message = Buffer.from('RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n');
const frame = Buffer.from([0x24, 0, 0, 2, 0x80, 0x01]);

test('RtspParser defaults to mixed RTSP messages and interleaved frames', () => {
  const parser = new RtspParser();
  const items = parser.push(Buffer.concat([message, frame]));
  assert.deepEqual(items.map((item) => item.type), ['rtsp-message', 'interleaved-frame']);
  assert.equal(items[0]?.type, 'rtsp-message');
  assert.equal(items[1]?.type, 'interleaved-frame');
  parser.finish();
});

test('RtspParser message mode returns messages and rejects interleaved input', () => {
  const parser = new RtspParser({ mode: 'message' });
  const items = parser.push(message);
  assert.equal(items.length, 1);
  const parsed = items[0];
  assert.equal(parsed?.type, 'rtsp-message');
  if (parsed?.type !== 'rtsp-message') throw new Error('Expected an RTSP message.');
  assert.equal(parsed.headers.get('CSEQ'), '1');
  assert.throws(() => parser.push(frame), { code: 'unexpected_interleaved_frame' });
});

test('RtspParser interleaved mode returns frames and rejects message input', () => {
  const parser = new RtspParser({ mode: 'interleaved' });
  assert.equal(parser.push(frame.subarray(0, 3)).length, 0);
  assert.equal(parser.bufferedBytes, 3);
  const parsed = parser.push(frame.subarray(3))[0];
  assert.equal(parsed?.type, 'interleaved-frame');
  if (parsed?.type !== 'interleaved-frame') throw new Error('Expected a frame.');
  assert.equal(parsed.channel, 0);
  assert.deepEqual(parsed.payload, Buffer.from([0x80, 0x01]));
  assert.throws(() => parser.push(message), { code: 'invalid_interleaved_magic' });
});

test('RtspParser validates its mode at construction', () => {
  assert.throws(
    () => new RtspParser({ mode: 'unknown' as 'mixed' }),
    RangeError,
  );
});

