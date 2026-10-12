import type { RtpHeaderExtension } from '../types/rtp-header-extension.type.js';
import type { RtpPacket } from '../types/rtp-packet.interface.js';
import { RtpPacketError } from '../errors/rtp-packet-error.class.js';
import { RTP_HEADER_LAYOUT } from '../constants/rtp-header-layout.constant.js';

/**
 * Parse one complete RTP packet, without the RTSP `$` frame header.
 *
 * Fixed 12-byte RTP header (bits in network order):
 *   byte 0: V(2) | P(1) | X(1) | CSRC count(4)
 *   byte 1: marker(1) | payload type(7)
 *   bytes 2-3: sequence number; 4-7: timestamp; 8-11: SSRC
 *
 * After that come the CSRC identifiers, an optional extension header and
 * extension data, the media payload, and optional trailing padding.
 * The caller supplies the entire RTP packet as `raw`, not a TCP chunk.
 */
export function parseRtpPacket(raw: Buffer): RtpPacket {
  if (raw.length < RTP_HEADER_LAYOUT.fixedHeaderBytes) {
    throw new RtpPacketError('RTP packet is shorter than the fixed header.');
  }

  const first = raw[RTP_HEADER_LAYOUT.firstByteOffset] ?? 0;
  // The version occupies the top two bits. Shift them down to compare with 2.
  if (first >>> RTP_HEADER_LAYOUT.versionShift !== RTP_HEADER_LAYOUT.version) {
    throw new RtpPacketError('Unsupported RTP version.');
  }

  // Masks isolate the P and X flags and the four-bit CSRC count in byte 0.
  const hasPadding = (first & RTP_HEADER_LAYOUT.paddingFlag) !== 0;
  const hasExtension = (first & RTP_HEADER_LAYOUT.extensionFlag) !== 0;
  const csrcCount = first & RTP_HEADER_LAYOUT.csrcCountMask;
  let offset = RTP_HEADER_LAYOUT.fixedHeaderBytes
    + csrcCount * RTP_HEADER_LAYOUT.csrcIdentifierBytes;
  if (raw.length < offset) {
    throw new RtpPacketError('RTP CSRC list exceeds packet length.');
  }

  const csrc: number[] = [];
  for (let index = 0; index < csrcCount; index += 1) {
    csrc.push(raw.readUInt32BE(
      RTP_HEADER_LAYOUT.fixedHeaderBytes + index * RTP_HEADER_LAYOUT.csrcIdentifierBytes,
    ));
  }

  let extension: RtpHeaderExtension | undefined;
  if (hasExtension) {
    if (raw.length < offset + RTP_HEADER_LAYOUT.extensionHeaderBytes) {
      throw new RtpPacketError('RTP extension header is truncated.');
    }
    const profile = raw.readUInt16BE(offset);
    // The extension length counts 32-bit words, excluding its four-byte header.
    const extensionBytes = raw.readUInt16BE(offset + RTP_HEADER_LAYOUT.extensionLengthOffset)
      * RTP_HEADER_LAYOUT.extensionLengthWordBytes;
    offset += RTP_HEADER_LAYOUT.extensionHeaderBytes;
    if (raw.length < offset + extensionBytes) {
      throw new RtpPacketError('RTP extension data is truncated.');
    }
    extension = { profile, data: raw.subarray(offset, offset + extensionBytes) };
    offset += extensionBytes;
  }

  let paddingBytes = 0;
  if (hasPadding) {
    // The last byte gives the total padding length, including that last byte.
    paddingBytes = raw[raw.length - RTP_HEADER_LAYOUT.paddingCountFromEnd] ?? 0;
    if (paddingBytes === 0 || paddingBytes > raw.length - offset) {
      throw new RtpPacketError('RTP padding length is invalid.');
    }
  }

  const payloadEnd = raw.length - paddingBytes;
  if (payloadEnd < offset) {
    throw new RtpPacketError('RTP header exceeds packet length.');
  }

  const second = raw[RTP_HEADER_LAYOUT.secondByteOffset] ?? 0;
  // `subarray` returns a view of `raw`; it does not copy the media payload.
  return {
    marker: (second & RTP_HEADER_LAYOUT.markerFlag) !== 0,
    payloadType: second & RTP_HEADER_LAYOUT.payloadTypeMask,
    sequenceNumber: raw.readUInt16BE(RTP_HEADER_LAYOUT.sequenceNumberOffset),
    timestamp: raw.readUInt32BE(RTP_HEADER_LAYOUT.timestampOffset),
    ssrc: raw.readUInt32BE(RTP_HEADER_LAYOUT.ssrcOffset),
    csrc,
    ...(extension === undefined ? {} : { extension }),
    paddingBytes,
    headerLength: offset,
    payload: raw.subarray(offset, payloadEnd),
    raw,
  };
}
