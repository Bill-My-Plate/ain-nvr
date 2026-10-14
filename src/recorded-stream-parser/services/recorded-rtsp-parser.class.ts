import { RECORDED_STREAM_CONSTANTS } from '../constants/recorded-stream-parser-numeric-values.constant.js';
import { parseRtpPacket } from '../../rtp-parser/index.js';
import { RtpReorderBuffer } from '../../rtp-parser/index.js';
import type { RtspInterleavedFrame } from '../../rtsp-parser/index.js';

import type { RecordedSegmentDescriptor } from '../types/recorded-segment-descriptor.interface.js';
import type { RecordedPacket } from '../types/recorded-packet.interface.js';
import type { RecordedRtspParserOptions } from '../types/recorded-rtsp-parser-options.interface.js';
import { RecordedStreamError } from '../errors/recorded-stream-error.class.js';
import { readExactly } from '../utils/read-exactly.util.js';
import { wallClockTime } from '../utils/wall-clock-time.util.js';
/**
 * Reads stored interleaved RTSP bytes and yields ordered per-track RTP packets.
 */
export class RecordedRtspParser {
  readonly maximumPacketBytes: number;
  readonly reorderWindowPackets: number;
  reorderedPackets = 0;
  duplicatePackets = 0;
  lostPackets = 0;
  discontinuities = 0;
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(options: RecordedRtspParserOptions = {}) {
    this.maximumPacketBytes =
      options.maximumPacketBytes ?? RECORDED_STREAM_CONSTANTS.maximumInterleavedPayloadBytes;
    this.reorderWindowPackets =
      options.reorderWindowPackets ?? RECORDED_STREAM_CONSTANTS.defaultReorderWindowPackets;
    if (
      !Number.isSafeInteger(this.maximumPacketBytes) ||
      this.maximumPacketBytes <= 0 ||
      this.maximumPacketBytes > RECORDED_STREAM_CONSTANTS.maximumInterleavedPayloadBytes
    ) {
      throw new RangeError('maximumPacketBytes must be between 1 and 65535.');
    }
    if (!Number.isSafeInteger(this.reorderWindowPackets) || this.reorderWindowPackets <= 0) {
      throw new RangeError('reorderWindowPackets must be a positive safe integer.');
    }
  }

  /**
   * Reads complete `$` frames up to the source's safe byte boundary. It maps
   * each RTP channel to a track, reorders packets per track, and marks gaps or
   * stream changes before yielding packets to playback.
   */
  public async *parse<TSegmentRef>(
    segment: RecordedSegmentDescriptor<TSegmentRef>,
    byteOffset = 0,
    signal?: AbortSignal,
  ): AsyncGenerator<RecordedPacket<TSegmentRef>> {
    const safeLength = segment.source.safeLength;
    if (!Number.isSafeInteger(safeLength) || safeLength < 0) {
      throw new RecordedStreamError('Recorded source safeLength is invalid.');
    }
    if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || byteOffset > safeLength) {
      throw new RecordedStreamError('Initial byte offset is outside the recorded source.');
    }
    const reorderByTrack = new Map<string, RtpReorderBuffer<RecordedPacket<TSegmentRef>>>();
    const lastSsrc = new Map<string, number>();
    const lastTimestamp = new Map<string, number>();
    let videoDiscontinuityPending = segment.discontinuityBefore;
    let position = byteOffset;

    // Each stored record is a complete RTSP interleaved frame. The safe length
    // is the host's committed boundary, so reject a header or payload crossing it.
    while (position < safeLength) {
      if (signal?.aborted) throw signal.reason;
      if (position + RECORDED_STREAM_CONSTANTS.interleavedHeaderBytes > safeLength) {
        throw new RecordedStreamError('Safe boundary ends inside an interleaved header.');
      }
      const header = await readExactly(
        segment.source,
        position,
        RECORDED_STREAM_CONSTANTS.interleavedHeaderBytes,
        signal,
      );
      if (header[0] !== RECORDED_STREAM_CONSTANTS.interleavedMarker) {
        throw new RecordedStreamError(`Packet at offset ${position} lacks the $ marker.`);
      }
      const payloadLength = header.readUInt16BE(RECORDED_STREAM_CONSTANTS.interleavedLengthOffset);
      if (payloadLength === 0 || payloadLength > this.maximumPacketBytes) {
        throw new RecordedStreamError('Stored interleaved packet length is invalid.');
      }
      if (
        position + RECORDED_STREAM_CONSTANTS.interleavedHeaderBytes + payloadLength >
        safeLength
      ) {
        throw new RecordedStreamError('Safe boundary ends inside an interleaved payload.');
      }
      const payload = await readExactly(
        segment.source,
        position + RECORDED_STREAM_CONSTANTS.interleavedHeaderBytes,
        payloadLength,
        signal,
      );
      const packetOffset = position;
      position += RECORDED_STREAM_CONSTANTS.interleavedHeaderBytes + payloadLength;
      const frame: RtspInterleavedFrame = {
        type: 'interleaved-frame',
        channel: header[1] ?? 0,
        rawHeader: header,
        payload,
      };
      const track = segment.tracks.find((candidate) => candidate.rtpChannel === frame.channel);
      const rtp = track === undefined ? undefined : parseRtpPacket(payload);
      let packet: RecordedPacket<TSegmentRef> = {
        segment,
        byteOffset: packetOffset,
        frame,
        ...(track === undefined ? {} : { track }),
        ...(rtp === undefined ? {} : { rtp }),
        wallClockTimeMs:
          rtp === undefined || track === undefined
            ? segment.startTimeMs
            : wallClockTime(segment, track, packetOffset, rtp.timestamp),
        discontinuity: false,
      };
      if (track === undefined || rtp === undefined) {
        yield packet;
        continue;
      }

      let reorder = reorderByTrack.get(track.trackId);
      if (reorder === undefined) {
        reorder = new RtpReorderBuffer<RecordedPacket<TSegmentRef>>(this.reorderWindowPackets);
        reorderByTrack.set(track.trackId, reorder);
      }
      const previousSsrc = lastSsrc.get(track.trackId);
      const previousTimestamp = lastTimestamp.get(track.trackId);
      let timestampDelta = previousTimestamp === undefined ? 0 : rtp.timestamp - previousTimestamp;
      if (timestampDelta > RECORDED_STREAM_CONSTANTS.rtpTimestampHalfRange)
        timestampDelta -= RECORDED_STREAM_CONSTANTS.rtpTimestampRange;
      else if (timestampDelta < -RECORDED_STREAM_CONSTANTS.rtpTimestampHalfRange)
        timestampDelta += RECORDED_STREAM_CONSTANTS.rtpTimestampRange;
      // A new SSRC or implausible timestamp regression starts a new reorder
      // window; flush its old packets before admitting the new packet.
      const discontinuity =
        (previousSsrc !== undefined && previousSsrc !== rtp.ssrc) ||
        (timestampDelta * RECORDED_STREAM_CONSTANTS.millisecondsPerSecond) / track.clockRate <
          -RECORDED_STREAM_CONSTANTS.maximumTimestampDiscontinuityMs;
      if (discontinuity) {
        const flushed = reorder.flush();
        this.lostPackets += flushed.lost;
        for (const ordered of flushed.packets)
          yield this.withGap(ordered.value, ordered.lostBefore);
        reorder.reset();
        this.discontinuities += 1;
      }
      packet = {
        ...packet,
        discontinuity: discontinuity || (track.mediaType === 'video' && videoDiscontinuityPending),
      };
      if (track.mediaType === 'video') videoDiscontinuityPending = false;
      lastSsrc.set(track.trackId, rtp.ssrc);
      lastTimestamp.set(track.trackId, rtp.timestamp);
      const result = reorder.push(rtp.sequenceNumber, packet);
      if (result.reordered) this.reorderedPackets += 1;
      if (result.duplicate) this.duplicatePackets += 1;
      this.lostPackets += result.lost;
      for (const ordered of result.packets) yield this.withGap(ordered.value, ordered.lostBefore);
    }

    // Release held tail packets only after reaching the committed byte boundary.
    for (const reorder of reorderByTrack.values()) {
      const result = reorder.flush();
      this.lostPackets += result.lost;
      for (const ordered of result.packets) yield this.withGap(ordered.value, ordered.lostBefore);
    }
  }

  /**
   * With Gap.
   */
  private withGap<TSegmentRef>(
    packet: RecordedPacket<TSegmentRef>,
    lostBefore: number,
  ): RecordedPacket<TSegmentRef> {
    if (lostBefore === 0 || packet.rtp === undefined) return packet;
    return {
      ...packet,
      sequenceGap: {
        expected:
          (packet.rtp.sequenceNumber - lostBefore) &
          RECORDED_STREAM_CONSTANTS.maximumRtpSequenceNumber,
        actual: packet.rtp.sequenceNumber,
        lost: lostBefore,
      },
    };
  }
}
