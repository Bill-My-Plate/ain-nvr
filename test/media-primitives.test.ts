import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createH264CodecConfiguration,
  H264ConfigurationTracker,
  splitH264NalUnits,
} from '../src/rtp/h264-configuration.js';
import { inspectH264Payload, H264PayloadError } from '../src/rtp/h264.js';
import { RtpReorderBuffer } from '../src/rtp/reorder-buffer.js';
import { RtpTimestampUnwrapper } from '../src/rtp/timestamp.js';
import { createBaselineSps } from './helpers/media.js';

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
