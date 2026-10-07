import assert from 'node:assert/strict';
import test from 'node:test';

import { createRtspAuthorization } from '../src/rtsp-client/create-rtsp-authorization.util.js';
import { parseRtspAuthChallenge } from '../src/rtsp-client/parse-rtsp-auth-challenge.util.js';
import { createH264CodecConfiguration } from '../src/h264/create-h264-codec-configuration.util.js';
import { H264ConfigurationTracker } from '../src/h264/h264-configuration-tracker.class.js';
import { splitH264NalUnits } from '../src/h264/split-h264-nal-units.util.js';
import { inspectH264Payload } from '../src/h264/inspect-h264-payload.util.js';
import { H264PayloadError } from '../src/h264/h264-payload-error.class.js';
import { RtpReorderBuffer } from '../src/rtp-parser/rtp-reorder-buffer.class.js';
import { RtpTimestampUnwrapper } from '../src/rtp-parser/rtp-timestamp-unwrapper.class.js';
import { createBaselineSps } from './helpers/media.js';

test('RTSP Digest authorization quotes the algorithm for Hikvision compatibility', () => {
  const challenge = parseRtspAuthChallenge(
    'Digest realm="IP Camera", nonce="abc", stale="FALSE", Basic realm="IP Camera"',
  );
  const authorization = createRtspAuthorization(
    challenge,
    { username: 'admin', password: 'password' },
    'DESCRIBE',
    'rtsp://camera.example/Streaming/channels/101',
  );

  assert.match(authorization.header, /algorithm="MD5"/u);
  assert.doesNotMatch(authorization.header, /algorithm=MD5(?:,|$)/u);
});

test('RTP reorder handles reordering, duplicates, loss, and rollover', () => {
  const reorder = new RtpReorderBuffer<string>(4);
  assert.deepEqual(reorder.push(0xfffe, 'a').packets.map((item) => item.value), ['a']);
  assert.deepEqual(reorder.push(0, 'c').packets, []);
  assert.equal(reorder.push(0, 'duplicate').duplicate, true);
  assert.deepEqual(reorder.push(0xffff, 'b').packets.map((item) => item.value), ['b', 'c']);
  reorder.push(2, 'e');
  reorder.push(3, 'f');
  reorder.push(4, 'g');
  const loss = reorder.push(5, 'h');
  assert.equal(loss.lost, 1);
  assert.equal(loss.packets[0]?.lostBefore, 1);
});

test('RTP timestamps unwrap across the unsigned 32-bit boundary', () => {
  const unwrapper = new RtpTimestampUnwrapper();
  assert.deepEqual(
    [0xffff_fff0, 0x20, 0x120].map((value) => unwrapper.unwrap(value)),
    [4_294_967_280n, 4_294_967_328n, 4_294_967_584n],
  );
});

test('H.264 configuration accepts Annex-B, STAP-A, and bundled FU-A data', () => {
  const sps = createBaselineSps();
  const pps = Buffer.from([0x68, 0xaa]);
  const annexB = Buffer.concat([
    Buffer.from([0, 0, 0, 1]), sps,
    Buffer.from([0, 0, 1]), pps,
  ]);
  assert.deepEqual(splitH264NalUnits(annexB), [sps, pps]);
  assert.equal(createH264CodecConfiguration(annexB, pps).decoder.codedWidth, 1280);

  const stap = Buffer.concat([
    Buffer.from([0x78, 0, sps.length]), sps,
    Buffer.from([0, pps.length]), pps,
  ]);
  const stapTracker = new H264ConfigurationTracker();
  assert.equal(stapTracker.push(stap, 10)?.decoder.codedHeight, 720);

  const bundled = new H264ConfigurationTracker();
  const body = Buffer.concat([sps.subarray(1), Buffer.from([0, 0, 0, 1]), pps]);
  const split = Math.floor(body.length / 2);
  assert.equal(bundled.push(
    Buffer.concat([Buffer.from([0x7c, 0x87]), body.subarray(0, split)]),
    11,
  ), undefined);
  assert.equal(bundled.push(
    Buffer.concat([Buffer.from([0x7c, 0x47]), body.subarray(split)]),
    11,
  )?.decoder.codec, 'avc1.42001f');
});

test('unsupported H.264 aggregation and fragmentation modes are rejected', () => {
  for (const nalType of [25, 26, 27, 29]) {
    assert.throws(
      () => inspectH264Payload(Buffer.from([0x60 | nalType, 0, 0])),
      H264PayloadError,
    );
  }
});
