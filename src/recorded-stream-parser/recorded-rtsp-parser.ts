import type { TrackDescription } from '../media/track-description.js';
import { parseRtpPacket, type RtpPacket } from '../rtp/packet.js';
import { RtpReorderBuffer } from '../rtp/reorder-buffer.js';
import type { RtspInterleavedFrame } from '../rtsp/interleaved-parser.js';
import { AinNvrError } from '../shared/ain-nvr-error.js';

export interface RecordedByteSource {
  readonly id: string;
  readonly safeLength: number;
  read(offset: number, length: number, signal?: AbortSignal): Promise<Buffer>;
}

export interface ClockAnchor {
  readonly trackId: string;
  readonly byteOffset: number;
  readonly timeMs: number;
  readonly rtpTimestamp: number;
}

export interface RecordedSegmentDescriptor<TSegmentRef = unknown> {
  readonly ref: TSegmentRef;
  readonly sessionId: string;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly discontinuityBefore: boolean;
  readonly source: RecordedByteSource;
  readonly tracks: readonly TrackDescription[];
  readonly clockAnchors: readonly ClockAnchor[];
}

export interface SequenceGap {
  readonly expected: number;
  readonly actual: number;
  readonly lost: number;
}

export interface RecordedPacket<TSegmentRef = unknown> {
  readonly segment: RecordedSegmentDescriptor<TSegmentRef>;
  readonly byteOffset: number;
  readonly frame: RtspInterleavedFrame;
  readonly rtp?: RtpPacket;
  readonly track?: TrackDescription;
  readonly wallClockTimeMs: number;
  readonly sequenceGap?: SequenceGap;
  readonly discontinuity: boolean;
}

export interface RecordedRtspParserOptions {
  readonly maximumPacketBytes?: number;
  readonly reorderWindowPackets?: number;
}

export class RecordedStreamError extends AinNvrError {
  override readonly name = 'RecordedStreamError';

  constructor(message: string, options: { readonly cause?: unknown } = {}) {
    super('corrupt_media', message, options);
  }
}

function signedTimestampDelta(timestamp: number, anchor: number): number {
  let delta = timestamp - anchor;
  if (delta > 0x8000_0000) delta -= 0x1_0000_0000;
  else if (delta < -0x8000_0000) delta += 0x1_0000_0000;
  return delta;
}

async function readExactly(
  source: RecordedByteSource,
  offset: number,
  length: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  const output = Buffer.allocUnsafe(length);
  let read = 0;
  while (read < length) {
    if (signal?.aborted) throw signal.reason;
    let chunk: Buffer;
    try {
      chunk = await source.read(offset + read, length - read, signal);
    } catch (error) {
      throw new AinNvrError('recorded_source_failed', 'Recorded byte source read failed.', {
        cause: error,
        details: { sourceId: source.id, offset: offset + read, length: length - read },
      });
    }
    if (chunk.length === 0 || chunk.length > length - read) {
      throw new RecordedStreamError('Recorded byte source returned an invalid read length.');
    }
    chunk.copy(output, read);
    read += chunk.length;
  }
  return output;
}

function wallClockTime(
  segment: RecordedSegmentDescriptor,
  track: TrackDescription,
  byteOffset: number,
  rtpTimestamp: number,
): number {
  let anchor: ClockAnchor | undefined;
  for (const candidate of segment.clockAnchors) {
    if (candidate.trackId !== track.trackId) continue;
    if (candidate.byteOffset <= byteOffset) anchor = candidate;
    else if (anchor === undefined) anchor = candidate;
    else break;
  }
  return anchor === undefined
    ? segment.startTimeMs
    : anchor.timeMs
      + signedTimestampDelta(rtpTimestamp, anchor.rtpTimestamp) * 1000 / track.clockRate;
}

export class RecordedRtspParser {
  readonly maximumPacketBytes: number;
  readonly reorderWindowPackets: number;
  reorderedPackets = 0;
  duplicatePackets = 0;
  lostPackets = 0;
  discontinuities = 0;

  constructor(options: RecordedRtspParserOptions = {}) {
    this.maximumPacketBytes = options.maximumPacketBytes ?? 65_535;
    this.reorderWindowPackets = options.reorderWindowPackets ?? 4;
    if (!Number.isSafeInteger(this.maximumPacketBytes)
      || this.maximumPacketBytes <= 0
      || this.maximumPacketBytes > 65_535) {
      throw new RangeError('maximumPacketBytes must be between 1 and 65535.');
    }
    if (!Number.isSafeInteger(this.reorderWindowPackets) || this.reorderWindowPackets <= 0) {
      throw new RangeError('reorderWindowPackets must be a positive safe integer.');
    }
  }

  async *parse<TSegmentRef>(
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

    while (position < safeLength) {
      if (signal?.aborted) throw signal.reason;
      if (position + 4 > safeLength) {
        throw new RecordedStreamError('Safe boundary ends inside an interleaved header.');
      }
      const header = await readExactly(segment.source, position, 4, signal);
      if (header[0] !== 0x24) {
        throw new RecordedStreamError(`Packet at offset ${position} lacks the $ marker.`);
      }
      const payloadLength = header.readUInt16BE(2);
      if (payloadLength === 0 || payloadLength > this.maximumPacketBytes) {
        throw new RecordedStreamError('Stored interleaved packet length is invalid.');
      }
      if (position + 4 + payloadLength > safeLength) {
        throw new RecordedStreamError('Safe boundary ends inside an interleaved payload.');
      }
      const payload = await readExactly(segment.source, position + 4, payloadLength, signal);
      const packetOffset = position;
      position += 4 + payloadLength;
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
        wallClockTimeMs: rtp === undefined || track === undefined
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
      if (timestampDelta > 0x8000_0000) timestampDelta -= 0x1_0000_0000;
      else if (timestampDelta < -0x8000_0000) timestampDelta += 0x1_0000_0000;
      const discontinuity = (previousSsrc !== undefined && previousSsrc !== rtp.ssrc)
        || timestampDelta * 1000 / track.clockRate < -5_000;
      if (discontinuity) {
        const flushed = reorder.flush();
        this.lostPackets += flushed.lost;
        for (const ordered of flushed.packets) yield this.withGap(ordered.value, ordered.lostBefore);
        reorder.reset();
        this.discontinuities += 1;
      }
      packet = {
        ...packet,
        discontinuity: discontinuity
          || (track.mediaType === 'video' && videoDiscontinuityPending),
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

    for (const reorder of reorderByTrack.values()) {
      const result = reorder.flush();
      this.lostPackets += result.lost;
      for (const ordered of result.packets) yield this.withGap(ordered.value, ordered.lostBefore);
    }
  }

  private withGap<TSegmentRef>(
    packet: RecordedPacket<TSegmentRef>,
    lostBefore: number,
  ): RecordedPacket<TSegmentRef> {
    if (lostBefore === 0 || packet.rtp === undefined) return packet;
    return {
      ...packet,
      sequenceGap: {
        expected: (packet.rtp.sequenceNumber - lostBefore) & 0xffff,
        actual: packet.rtp.sequenceNumber,
        lost: lostBefore,
      },
    };
  }
}
