import assert from 'node:assert/strict';

import type { TrackDescription } from '../../src/media/types/track-description.interface.js';
import { parseRtpPacket } from '../../src/rtp-parser/utils/parse-rtp-packet.util.js';
import type { MediaPacket } from '../../src/media/index.js';

class BitWriter {
  private readonly bits: number[] = [];

  bit(value: number): void {
    this.bits.push(value & 1);
  }

  unsignedExpGolomb(value: number): void {
    const binary = (value + 1).toString(2);
    for (let index = 1; index < binary.length; index += 1) this.bit(0);
    for (const digit of binary) this.bit(digit === '1' ? 1 : 0);
  }

  finish(): Buffer {
    this.bit(1);
    while (this.bits.length % 8 !== 0) this.bit(0);
    const output = Buffer.alloc(this.bits.length / 8);
    for (let index = 0; index < this.bits.length; index += 1) {
      if (this.bits[index] === 1) {
        const byteIndex = index >>> 3;
        output[byteIndex] = (output[byteIndex] ?? 0) | (1 << (7 - (index & 7)));
      }
    }
    return output;
  }
}

export function createBaselineSps(width = 1280, height = 720): Buffer {
  assert.equal(width % 16, 0);
  assert.equal(height % 16, 0);
  const bits = new BitWriter();
  bits.unsignedExpGolomb(0);
  bits.unsignedExpGolomb(0);
  bits.unsignedExpGolomb(0);
  bits.unsignedExpGolomb(0);
  bits.unsignedExpGolomb(1);
  bits.bit(0);
  bits.unsignedExpGolomb(width / 16 - 1);
  bits.unsignedExpGolomb(height / 16 - 1);
  bits.bit(1);
  bits.bit(1);
  bits.bit(0);
  bits.bit(0);
  return Buffer.concat([Buffer.from([0x67, 0x42, 0, 0x1f]), bits.finish()]);
}

export function createRtp(
  sequenceNumber: number,
  timestamp: number,
  payload: Buffer,
  marker = true,
  payloadType = 96,
  ssrc = 1,
): Buffer {
  const output = Buffer.allocUnsafe(12 + payload.length);
  output[0] = 0x80;
  output[1] = (marker ? 0x80 : 0) | payloadType;
  output.writeUInt16BE(sequenceNumber, 2);
  output.writeUInt32BE(timestamp, 4);
  output.writeUInt32BE(ssrc, 8);
  payload.copy(output, 12);
  return output;
}

export function interleaved(channel: number, payload: Buffer): Buffer {
  const header = Buffer.allocUnsafe(4);
  header[0] = 0x24;
  header[1] = channel;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

export const videoTrack: TrackDescription = {
  trackId: 'video',
  mediaType: 'video',
  codec: 'h264',
  payloadType: 96,
  clockRate: 90_000,
  rtpChannel: 0,
  rtcpChannel: 1,
};

export function mediaPacket(
  sequenceNumber: number,
  timestamp: number,
  payload: Buffer,
  options: {
    readonly marker?: boolean;
    readonly arrivalTimeMs?: number;
    readonly ssrc?: number;
    readonly track?: TrackDescription;
  } = {},
): MediaPacket {
  const track = options.track ?? videoTrack;
  const rawRtp = createRtp(
    sequenceNumber,
    timestamp,
    payload,
    options.marker ?? true,
    track.payloadType,
    options.ssrc ?? 1,
  );
  const raw = interleaved(track.rtpChannel, rawRtp);
  return {
    arrivalTimeMs: options.arrivalTimeMs ?? 1_000,
    track,
    channel: track.rtpChannel,
    rawInterleavedFrame: raw,
    frame: {
      type: 'interleaved-frame',
      channel: track.rtpChannel,
      rawHeader: raw.subarray(0, 4),
      payload: rawRtp,
    },
    rtp: parseRtpPacket(rawRtp),
    discontinuity: false,
  };
}
