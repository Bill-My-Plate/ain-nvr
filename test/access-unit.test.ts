import assert from 'node:assert/strict';
import test from 'node:test';

import { H264AccessUnitAssembler } from '../src/h264/h264-access-unit-assembler.class.js';
import { parseRtpPacket } from '../src/rtp-parser/parse-rtp-packet.util.js';
import { createBaselineSps, createRtp } from './helpers/media.js';

function input(
  sequence: number,
  timestamp: number,
  payload: Buffer,
  lostBefore = 0,
) {
  return {
    rtp: parseRtpPacket(createRtp(sequence, timestamp, payload)),
    wallClockTimeMs: 1_000 + timestamp / 90,
    ...(lostBefore === 0 ? {} : { lostBefore }),
  };
}

test('assembler creates Annex-B access units and drops only a damaged unit', () => {
  const sps = createBaselineSps();
  const pps = Buffer.from([0x68, 0xbb]);
  const idr = Buffer.from([0x65, 1, 2]);
  const stap = Buffer.concat([
    Buffer.from([0x78, 0, sps.length]), sps,
    Buffer.from([0, pps.length]), pps,
    Buffer.from([0, idr.length]), idr,
  ]);
  const assembler = new H264AccessUnitAssembler({ payloadType: 96, clockRate: 90_000 });

  assert.deepEqual(assembler.push(input(1, 1_000, stap)), []);
  const [key] = assembler.push(input(2, 10_000, Buffer.from([0x7c, 0x81, 3, 4])));
  assert.equal(key?.type, 'key');
  assert.deepEqual(key?.data, Buffer.concat([
    Buffer.from([0, 0, 0, 1]), sps,
    Buffer.from([0, 0, 0, 1]), pps,
    Buffer.from([0, 0, 0, 1]), idr,
  ]));

  assembler.push(input(3, 10_000, Buffer.from([0x7c, 0x41, 5, 6])));
  const [delta] = assembler.push(input(4, 19_000, Buffer.from([0x7c, 0x81, 7])));
  assert.equal(delta?.type, 'delta');
  assert.deepEqual(delta?.data, Buffer.from([0, 0, 0, 1, 0x61, 3, 4, 5, 6]));

  assembler.push(input(5, 19_000, Buffer.from([0x7c, 0x41, 8]), 1));
  assert.deepEqual(assembler.flush(), []);
  assert.equal(assembler.droppedAccessUnits, 1);
});
