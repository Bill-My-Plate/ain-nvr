import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRtpPacket } from '../src/rtp-parser/utils/parse-rtp-packet.util.js';
import { RtpPacketizer } from '../src/stream-adapters/services/rtp-packetizer.class.js';

test('RTP packetizer emits single NAL and FU-A H.264 packets', () => {
  const packetizer = new RtpPacketizer({
    payloadType: 96,
    clockRate: 90_000,
    maximumPayloadBytes: 6,
    initialSequenceNumber: 65_535,
    initialTimestamp: 100,
    ssrc: 7,
  });
  const accessUnit = Buffer.concat([
    Buffer.from([0, 0, 0, 1, 0x67, 1]),
    Buffer.from([0, 0, 0, 1, 0x65, 2, 3, 4, 5, 6, 7, 8]),
  ]);

  const packets = packetizer.packetizeH264(accessUnit, 100_000).map(parseRtpPacket);

  assert.equal(packets.length, 3);
  assert.deepEqual(packets[0]?.payload, Buffer.from([0x67, 1]));
  assert.equal(packets[0]?.sequenceNumber, 65_535);
  assert.equal(packets[1]?.sequenceNumber, 0);
  assert.equal(packets[2]?.sequenceNumber, 1);
  assert.equal(packets.every((packet) => packet.timestamp === 9_100), true);
  assert.equal(packets.every((packet) => packet.ssrc === 7), true);
  assert.deepEqual(packets[1]?.payload.subarray(0, 2), Buffer.from([0x7c, 0x85]));
  assert.deepEqual(packets[2]?.payload.subarray(0, 2), Buffer.from([0x7c, 0x45]));
  assert.deepEqual(packets.map((packet) => packet.marker), [false, false, true]);
});

test('RTP packetizer converts PCM little endian samples to L16', () => {
  const packetizer = new RtpPacketizer({
    payloadType: 97,
    clockRate: 8_000,
    maximumPayloadBytes: 4,
    initialSequenceNumber: 10,
    initialTimestamp: 1_000,
    ssrc: 9,
  });

  const packets = packetizer
    .packetizePcmS16Le(Buffer.from([0x34, 0x12, 0xcd, 0xab, 0xff, 0x7f]), 250_000)
    .map(parseRtpPacket);

  assert.equal(packets.length, 2);
  assert.deepEqual(packets[0]?.payload, Buffer.from([0x12, 0x34, 0xab, 0xcd]));
  assert.deepEqual(packets[1]?.payload, Buffer.from([0x7f, 0xff]));
  assert.equal(packets[0]?.timestamp, 3_000);
  assert.equal(packets[1]?.timestamp, 3_002);
  assert.deepEqual(packets.map((packet) => packet.sequenceNumber), [10, 11]);
});
