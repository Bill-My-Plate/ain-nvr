import type { RtpHeaderExtension } from './rtp-header-extension.type.js';
import type { RtpPacket } from './rtp-packet.interface.js';
import { RtpPacketError } from './rtp-packet-error.class.js';

export function parseRtpPacket(raw: Buffer): RtpPacket {
  if (raw.length < 12) {
    throw new RtpPacketError('RTP packet is shorter than the fixed header.');
  }

  const first = raw[0] ?? 0;
  if (first >>> 6 !== 2) {
    throw new RtpPacketError('Unsupported RTP version.');
  }

  const hasPadding = (first & 0x20) !== 0;
  const hasExtension = (first & 0x10) !== 0;
  const csrcCount = first & 0x0f;
  let offset = 12 + csrcCount * 4;
  if (raw.length < offset) {
    throw new RtpPacketError('RTP CSRC list exceeds packet length.');
  }

  const csrc: number[] = [];
  for (let index = 0; index < csrcCount; index += 1) {
    csrc.push(raw.readUInt32BE(12 + index * 4));
  }

  let extension: RtpHeaderExtension | undefined;
  if (hasExtension) {
    if (raw.length < offset + 4) {
      throw new RtpPacketError('RTP extension header is truncated.');
    }
    const profile = raw.readUInt16BE(offset);
    const extensionBytes = raw.readUInt16BE(offset + 2) * 4;
    offset += 4;
    if (raw.length < offset + extensionBytes) {
      throw new RtpPacketError('RTP extension data is truncated.');
    }
    extension = { profile, data: raw.subarray(offset, offset + extensionBytes) };
    offset += extensionBytes;
  }

  let paddingBytes = 0;
  if (hasPadding) {
    paddingBytes = raw[raw.length - 1] ?? 0;
    if (paddingBytes === 0 || paddingBytes > raw.length - offset) {
      throw new RtpPacketError('RTP padding length is invalid.');
    }
  }

  const payloadEnd = raw.length - paddingBytes;
  if (payloadEnd < offset) {
    throw new RtpPacketError('RTP header exceeds packet length.');
  }

  const second = raw[1] ?? 0;
  return {
    marker: (second & 0x80) !== 0,
    payloadType: second & 0x7f,
    sequenceNumber: raw.readUInt16BE(2),
    timestamp: raw.readUInt32BE(4),
    ssrc: raw.readUInt32BE(8),
    csrc,
    ...(extension === undefined ? {} : { extension }),
    paddingBytes,
    headerLength: offset,
    payload: raw.subarray(offset, payloadEnd),
    raw,
  };
}
