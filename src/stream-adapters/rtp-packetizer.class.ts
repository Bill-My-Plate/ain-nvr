
import { splitH264NalUnits } from '../h264/index.js';

import { RTP_HEADER_BYTES } from './rtp-header-bytes.constant.js';
import { DEFAULT_MAXIMUM_PAYLOAD_BYTES } from './default-maximum-payload-bytes.constant.js';
import type { RtpPacketizerOptions } from './rtp-packetizer-options.type.js';
import { unsignedRandom32 } from './unsigned-random32.util.js';
import { requireUint } from './require-uint.util.js';

export class RtpPacketizer {
  readonly initialSequenceNumber: number;
  readonly initialTimestamp: number;
  readonly ssrc: number;

  private readonly payloadType: number;
  private readonly clockRate: number;
  private readonly maximumPayloadBytes: number;
  private sequenceNumber: number;

  constructor(options: RtpPacketizerOptions) {
    this.payloadType = requireUint(options.payloadType, 127, 'payloadType');
    if (!Number.isSafeInteger(options.clockRate) || options.clockRate <= 0) {
      throw new RangeError('clockRate must be a positive safe integer.');
    }
    this.clockRate = options.clockRate;
    this.maximumPayloadBytes = options.maximumPayloadBytes ?? DEFAULT_MAXIMUM_PAYLOAD_BYTES;
    if (!Number.isSafeInteger(this.maximumPayloadBytes) || this.maximumPayloadBytes < 3) {
      throw new RangeError('maximumPayloadBytes must be at least 3.');
    }
    this.initialSequenceNumber = requireUint(
      options.initialSequenceNumber ?? unsignedRandom32() & 0xffff,
      0xffff,
      'initialSequenceNumber',
    );
    this.initialTimestamp = requireUint(
      options.initialTimestamp ?? unsignedRandom32(),
      0xffff_ffff,
      'initialTimestamp',
    );
    this.ssrc = requireUint(options.ssrc ?? unsignedRandom32(), 0xffff_ffff, 'ssrc');
    this.sequenceNumber = this.initialSequenceNumber;
  }

  packetizeH264(accessUnit: Buffer, timestampUs: number): Buffer[] {
    const nalUnits = splitH264NalUnits(accessUnit).filter((nal) => nal.length > 0);
    const timestamp = this.timestampFor(timestampUs);
    const packets: Buffer[] = [];

    for (const [nalIndex, nal] of nalUnits.entries()) {
      const finalNal = nalIndex === nalUnits.length - 1;
      if (nal.length <= this.maximumPayloadBytes) {
        packets.push(this.createPacket(nal, timestamp, finalNal));
        continue;
      }

      const nalHeader = nal[0];
      if (nalHeader === undefined) continue;
      const fuIndicator = (nalHeader & 0xe0) | 28;
      const nalType = nalHeader & 0x1f;
      const fragmentBytes = this.maximumPayloadBytes - 2;
      let offset = 1;
      while (offset < nal.length) {
        const end = Math.min(nal.length, offset + fragmentBytes);
        const firstFragment = offset === 1;
        const finalFragment = end === nal.length;
        const fuHeader = nalType
          | (firstFragment ? 0x80 : 0)
          | (finalFragment ? 0x40 : 0);
        const payload = Buffer.concat([
          Buffer.from([fuIndicator, fuHeader]),
          nal.subarray(offset, end),
        ]);
        packets.push(this.createPacket(payload, timestamp, finalNal && finalFragment));
        offset = end;
      }
    }

    return packets;
  }

  packetizePcmS16Le(samples: Buffer, timestampUs: number): Buffer[] {
    if (samples.length % 2 !== 0) {
      throw new Error('PCM S16LE data must contain complete 16-bit samples.');
    }
    const maximumBytes = this.maximumPayloadBytes - (this.maximumPayloadBytes % 2);
    const timestamp = this.timestampFor(timestampUs);
    const packets: Buffer[] = [];
    let sampleOffset = 0;

    for (let offset = 0; offset < samples.length; offset += maximumBytes) {
      const end = Math.min(samples.length, offset + maximumBytes);
      const payload = Buffer.allocUnsafe(end - offset);
      for (let index = offset; index < end; index += 2) {
        payload[index - offset] = samples[index + 1] ?? 0;
        payload[index - offset + 1] = samples[index] ?? 0;
      }
      packets.push(this.createPacket(payload, (timestamp + sampleOffset) >>> 0, false));
      sampleOffset += payload.length / 2;
    }

    return packets;
  }

  private timestampFor(timestampUs: number): number {
    if (!Number.isSafeInteger(timestampUs) || timestampUs < 0) {
      throw new RangeError('timestampUs must be a non-negative safe integer.');
    }
    return (
      this.initialTimestamp
      + Math.round(timestampUs * this.clockRate / 1_000_000)
    ) >>> 0;
  }

  private createPacket(payload: Buffer, timestamp: number, marker: boolean): Buffer {
    const packet = Buffer.allocUnsafe(RTP_HEADER_BYTES + payload.length);
    packet[0] = 0x80;
    packet[1] = this.payloadType | (marker ? 0x80 : 0);
    packet.writeUInt16BE(this.sequenceNumber, 2);
    packet.writeUInt32BE(timestamp, 4);
    packet.writeUInt32BE(this.ssrc, 8);
    payload.copy(packet, RTP_HEADER_BYTES);
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
    return packet;
  }
}
