import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
import { splitH264NalUnits } from '../../h264/index.js';

import { RTP_HEADER_BYTES } from '../constants/rtp-header-bytes.constant.js';
import { DEFAULT_MAXIMUM_PAYLOAD_BYTES } from '../constants/default-maximum-payload-bytes.constant.js';
import type { RtpPacketizerOptions } from '../types/rtp-packetizer-options.type.js';
import { unsignedRandom32 } from '../utils/unsigned-random32.util.js';
import { requireUint } from '../utils/require-uint.util.js';
/**
 * Creates RTP headers and splits H.264 or PCM media into transport-sized packets.
 */
export class RtpPacketizer {
  readonly initialSequenceNumber: number;
  readonly initialTimestamp: number;
  readonly ssrc: number;

  private readonly payloadType: number;
  private readonly clockRate: number;
  private readonly maximumPayloadBytes: number;
  private sequenceNumber: number;
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(options: RtpPacketizerOptions) {
    this.payloadType = requireUint(
      options.payloadType,
      STREAM_ADAPTER_CONSTANTS.rtpPayloadTypeMax,
      'payloadType',
    );
    if (!Number.isSafeInteger(options.clockRate) || options.clockRate <= 0) {
      throw new RangeError('clockRate must be a positive safe integer.');
    }
    this.clockRate = options.clockRate;
    this.maximumPayloadBytes = options.maximumPayloadBytes ?? DEFAULT_MAXIMUM_PAYLOAD_BYTES;
    if (
      !Number.isSafeInteger(this.maximumPayloadBytes) ||
      this.maximumPayloadBytes < STREAM_ADAPTER_CONSTANTS.minimumH264FragmentPayloadBytes
    ) {
      throw new RangeError('maximumPayloadBytes must be at least 3.');
    }
    this.initialSequenceNumber = requireUint(
      options.initialSequenceNumber ?? unsignedRandom32() & STREAM_ADAPTER_CONSTANTS.rtpSequenceMax,
      STREAM_ADAPTER_CONSTANTS.rtpSequenceMax,
      'initialSequenceNumber',
    );
    this.initialTimestamp = requireUint(
      options.initialTimestamp ?? unsignedRandom32(),
      STREAM_ADAPTER_CONSTANTS.rtpTimestampMax,
      'initialTimestamp',
    );
    this.ssrc = requireUint(
      options.ssrc ?? unsignedRandom32(),
      STREAM_ADAPTER_CONSTANTS.rtpTimestampMax,
      'ssrc',
    );
    this.sequenceNumber = this.initialSequenceNumber;
  }

  /**
   * Packetize H264.
   * @param accessUnit One H.264 access unit containing Annex B start codes and NAL units; each NAL begins with a one-byte type header and has variable length.
   */
  public packetizeH264(accessUnit: Buffer, timestampUs: number): Buffer[] {
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
      const fuIndicator =
        (nalHeader & STREAM_ADAPTER_CONSTANTS.rtpNalPriorityMask) |
        STREAM_ADAPTER_CONSTANTS.rtpFuIndicatorType;
      const nalType = nalHeader & STREAM_ADAPTER_CONSTANTS.h264NalTypeMask;
      const fragmentBytes = this.maximumPayloadBytes - STREAM_ADAPTER_CONSTANTS.h264FuHeaderBytes;
      let offset = 1;
      while (offset < nal.length) {
        const end = Math.min(nal.length, offset + fragmentBytes);
        const firstFragment = offset === 1;
        const finalFragment = end === nal.length;
        const fuHeader =
          nalType |
          (firstFragment ? STREAM_ADAPTER_CONSTANTS.rtpFuStartFlag : 0) |
          (finalFragment ? STREAM_ADAPTER_CONSTANTS.rtpFuEndFlag : 0);
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

  /**
   * Packetize Pcm S16 Le.
   * @param samples Little-endian signed 16-bit PCM samples: each sample occupies two bytes; the byte count must align to the sample width.
   */
  public packetizePcmS16Le(samples: Buffer, timestampUs: number): Buffer[] {
    if (samples.length % STREAM_ADAPTER_CONSTANTS.pcmSampleBytes !== 0) {
      throw new Error('PCM S16LE data must contain complete 16-bit samples.');
    }
    const maximumBytes =
      this.maximumPayloadBytes -
      (this.maximumPayloadBytes % STREAM_ADAPTER_CONSTANTS.pcmSampleBytes);
    const timestamp = this.timestampFor(timestampUs);
    const packets: Buffer[] = [];
    let sampleOffset = 0;

    for (let offset = 0; offset < samples.length; offset += maximumBytes) {
      const end = Math.min(samples.length, offset + maximumBytes);
      const payload = Buffer.allocUnsafe(end - offset);
      for (let index = offset; index < end; index += STREAM_ADAPTER_CONSTANTS.pcmSampleBytes) {
        payload[index - offset] = samples[index + 1] ?? 0;
        payload[index - offset + 1] = samples[index] ?? 0;
      }
      packets.push(this.createPacket(payload, (timestamp + sampleOffset) >>> 0, false));
      sampleOffset += payload.length / STREAM_ADAPTER_CONSTANTS.pcmSampleBytes;
    }

    return packets;
  }

  /**
   * Timestamp For.
   */
  private timestampFor(timestampUs: number): number {
    if (!Number.isSafeInteger(timestampUs) || timestampUs < 0) {
      throw new RangeError('timestampUs must be a non-negative safe integer.');
    }
    return (
      (this.initialTimestamp +
        Math.round(
          (timestampUs * this.clockRate) / STREAM_ADAPTER_CONSTANTS.microsecondsPerSecond,
        )) >>>
      0
    );
  }

  /**
   * Writes the fixed RTP header around one encoded media payload.
   * @param payload One variable-length encoded media payload without an RTP header; this method prepends the 12-byte fixed RTP header before returning it.
   */
  private createPacket(payload: Buffer, timestamp: number, marker: boolean): Buffer {
    const packet = Buffer.allocUnsafe(RTP_HEADER_BYTES + payload.length);
    packet[0] = STREAM_ADAPTER_CONSTANTS.rtpVersionTwoHeader;
    packet[1] = this.payloadType | (marker ? STREAM_ADAPTER_CONSTANTS.rtpMarkerFlag : 0);
    packet.writeUInt16BE(this.sequenceNumber, STREAM_ADAPTER_CONSTANTS.rtpSequenceOffset);
    packet.writeUInt32BE(timestamp, STREAM_ADAPTER_CONSTANTS.rtpTimestampOffset);
    packet.writeUInt32BE(this.ssrc, STREAM_ADAPTER_CONSTANTS.rtpSsrcOffset);
    payload.copy(packet, RTP_HEADER_BYTES);
    this.sequenceNumber = (this.sequenceNumber + 1) & STREAM_ADAPTER_CONSTANTS.rtpSequenceMax;
    return packet;
  }
}
