import type { MediaPacket } from '../stream/rtsp-stream-session.js';
import type { TrackDescription } from '../media/track-description.js';
import {
  H264ConfigurationTracker,
  type H264CodecConfiguration,
} from '../rtp/h264-configuration.js';
import { inspectH264Payload } from '../rtp/h264.js';
import type { RtpPacket } from '../rtp/packet.js';
import { RtpReorderBuffer } from '../rtp/reorder-buffer.js';
import { RtpClockMapper, RtpTimestampUnwrapper } from '../rtp/timestamp.js';
import { AinNvrError } from '../shared/ain-nvr-error.js';

export interface RecordingWriteRequest {
  readonly packet: MediaPacket;
  readonly boundaryBefore: boolean;
  readonly discontinuityBefore: boolean;
}

export interface RecordingPacketWriter<TLocation> {
  write(request: RecordingWriteRequest): Promise<TLocation>;
}

export type RecordingIndexEvent<TLocation> =
  | {
      readonly type: 'packet';
      readonly location: TLocation;
      readonly trackId?: string;
      readonly timeMs: number;
      readonly byteLength: number;
    }
  | {
      readonly type: 'keyframe';
      readonly location: TLocation;
      readonly trackId: string;
      readonly timeMs: number;
      readonly rtpTimestamp: number;
      readonly sequenceNumber: number;
    }
  | {
      readonly type: 'playpoint';
      readonly location: TLocation;
      readonly timeMs: number;
    }
  | {
      readonly type: 'clock-anchor';
      readonly location: TLocation;
      readonly trackId: string;
      readonly source: 'arrival' | 'rtcp-sr';
      readonly timeMs: number;
      readonly rtpTimestamp: number;
    }
  | {
      readonly type: 'configuration';
      readonly trackId: string;
      readonly configuration: H264CodecConfiguration;
    }
  | {
      readonly type: 'discontinuity';
      readonly location: TLocation;
      readonly trackId: string;
      readonly reason: 'source-reconnect' | 'ssrc-change' | 'timestamp-reset';
    };

export interface RecordingParserOptions {
  readonly tracks: readonly TrackDescription[];
  readonly reorderWindowPackets?: number;
  readonly playpointIntervalMs?: number;
  /**
   * Wait for a complete, undamaged H.264 IDR access unit before the first
   * write and every requested boundary. The default preserves the original
   * next-packet boundary behavior.
   */
  readonly decoderSafeBoundaries?: boolean;
}

export interface RecordingParserStatus {
  readonly reorderedPackets: number;
  readonly duplicatePackets: number;
  readonly lostPackets: number;
  readonly discontinuities: number;
}

interface PendingVideoAccessUnit<TLocation> {
  readonly timestamp: number;
  readonly location: TLocation;
  readonly timeMs: number;
  readonly sequenceNumber: number;
  damaged: boolean;
  hasIdr: boolean;
  fuNalType: number | undefined;
}

interface OrderedInput {
  readonly packet: MediaPacket;
  readonly lostBefore: number;
}

interface PendingSafeAccessUnit {
  readonly timestamp: number;
  readonly packets: OrderedInput[];
  bytes: number;
  damaged: boolean;
  hasIdr: boolean;
  fuNalType: number | undefined;
}

type DiscontinuityReason = 'source-reconnect' | 'ssrc-change' | 'timestamp-reset';

class TrackIndexer<TLocation> {
  private readonly unwrapper = new RtpTimestampUnwrapper();
  private readonly configurationTracker: H264ConfigurationTracker | undefined;
  private clockMapper: RtpClockMapper | undefined;
  private clockSource: 'arrival' | 'rtcp-sr' | undefined;
  private activeSsrc: number | undefined;
  private lastRawTimestamp: number | undefined;
  private lastArrivalTimeMs: number | undefined;
  private lastIndexedTimeMs: number | undefined;
  private needsBoundaryAnchor = true;
  private pendingVideo: PendingVideoAccessUnit<TLocation> | undefined;
  private lastKeyframeTimestamp: number | undefined;

  constructor(readonly track: TrackDescription) {
    this.configurationTracker = track.codec === 'h264'
      ? new H264ConfigurationTracker()
      : undefined;
    if (track.parameterSets !== undefined && this.configurationTracker !== undefined) {
      try {
        this.configurationTracker.seed(track.parameterSets.sps, track.parameterSets.pps);
      } catch {
        // The parser may discover a valid in-band configuration later.
      }
    }
  }

  discontinuityReason(rtp: RtpPacket, arrivalTimeMs: number):
  'ssrc-change' | 'timestamp-reset' | undefined {
    if (this.activeSsrc !== undefined && this.activeSsrc !== rtp.ssrc) return 'ssrc-change';
    if (this.lastRawTimestamp === undefined || this.lastArrivalTimeMs === undefined) return undefined;
    let timestampDelta = rtp.timestamp - this.lastRawTimestamp;
    if (timestampDelta > 0x8000_0000) timestampDelta -= 0x1_0000_0000;
    else if (timestampDelta < -0x8000_0000) timestampDelta += 0x1_0000_0000;
    const arrivalDeltaMs = Math.max(0, arrivalTimeMs - this.lastArrivalTimeMs);
    const rtpDeltaMs = timestampDelta * 1000 / this.track.clockRate;
    return rtpDeltaMs < -5_000 || rtpDeltaMs - arrivalDeltaMs > 30_000
      ? 'timestamp-reset'
      : undefined;
  }

  beginBoundary(resetClock: boolean): void {
    this.needsBoundaryAnchor = true;
    this.pendingVideo = undefined;
    if (!resetClock) return;
    this.unwrapper.reset();
    this.clockMapper = undefined;
    this.clockSource = undefined;
    this.activeSsrc = undefined;
    this.lastRawTimestamp = undefined;
    this.lastArrivalTimeMs = undefined;
    this.lastIndexedTimeMs = undefined;
    this.lastKeyframeTimestamp = undefined;
    this.configurationTracker?.resetFragments();
  }

  finishPending(): RecordingIndexEvent<TLocation>[] {
    const events: RecordingIndexEvent<TLocation>[] = [];
    this.emitPendingKeyframe(events);
    this.pendingVideo = undefined;
    return events;
  }

  inspectRtcp(
    packet: MediaPacket,
    location: TLocation,
  ): RecordingIndexEvent<TLocation>[] {
    const report = packet.rtcpSenderReport;
    if (report === undefined || !Number.isFinite(report.ntpTimeMs) || report.ntpTimeMs < 0
      || Math.abs(report.ntpTimeMs - packet.arrivalTimeMs) > 5 * 60_000
      || (this.activeSsrc !== undefined && report.ssrc !== this.activeSsrc)) {
      return [];
    }
    const timeMs = Math.round(report.ntpTimeMs);
    const unwrapped = this.unwrapper.unwrap(report.rtpTimestamp);
    this.clockMapper = new RtpClockMapper(unwrapped, timeMs, this.track.clockRate);
    this.clockSource = 'rtcp-sr';
    this.needsBoundaryAnchor = false;
    return [{
      type: 'clock-anchor',
      location,
      trackId: this.track.trackId,
      source: 'rtcp-sr',
      timeMs,
      rtpTimestamp: report.rtpTimestamp,
    }];
  }

  inspectRtp(
    packet: MediaPacket,
    location: TLocation,
    lostBefore: number,
  ): { readonly timeMs: number; readonly events: RecordingIndexEvent<TLocation>[] } {
    const rtp = packet.rtp as RtpPacket;
    const events: RecordingIndexEvent<TLocation>[] = [];
    this.activeSsrc = rtp.ssrc;
    const previousTimestamp = this.lastRawTimestamp;
    const previousArrival = this.lastArrivalTimeMs;
    const unwrapped = this.unwrapper.unwrap(rtp.timestamp);

    if (this.clockMapper === undefined) {
      this.clockMapper = new RtpClockMapper(unwrapped, packet.arrivalTimeMs, this.track.clockRate);
      this.clockSource = 'arrival';
      events.push(this.anchor(location, packet.arrivalTimeMs, rtp.timestamp, 'arrival'));
    } else if (previousTimestamp !== undefined && previousArrival !== undefined) {
      let timestampDelta = rtp.timestamp - previousTimestamp;
      if (timestampDelta > 0x8000_0000) timestampDelta -= 0x1_0000_0000;
      else if (timestampDelta < -0x8000_0000) timestampDelta += 0x1_0000_0000;
      const rtpProgressMs = timestampDelta * 1000 / this.track.clockRate;
      const arrivalProgressMs = packet.arrivalTimeMs - previousArrival;
      if (Math.abs(rtpProgressMs - arrivalProgressMs) > 5_000) {
        this.clockMapper = new RtpClockMapper(unwrapped, packet.arrivalTimeMs, this.track.clockRate);
        this.clockSource = 'arrival';
        events.push(this.anchor(location, packet.arrivalTimeMs, rtp.timestamp, 'arrival'));
      }
    }
    if (this.needsBoundaryAnchor && events.length === 0) {
      events.push(this.anchor(
        location,
        Math.round(this.clockMapper.toWallClockMs(unwrapped)),
        rtp.timestamp,
        this.clockSource ?? 'arrival',
      ));
    }
    this.needsBoundaryAnchor = false;
    this.lastRawTimestamp = rtp.timestamp;
    this.lastArrivalTimeMs = packet.arrivalTimeMs;
    const mapped = Math.round(this.clockMapper.toWallClockMs(unwrapped));
    const timeMs = Math.max(this.lastIndexedTimeMs ?? mapped, mapped);
    this.lastIndexedTimeMs = timeMs;

    if (this.track.codec === 'h264') {
      this.inspectVideo(rtp, location, timeMs, lostBefore, events);
    }
    return { timeMs, events };
  }

  private inspectVideo(
    rtp: RtpPacket,
    location: TLocation,
    timeMs: number,
    lostBefore: number,
    events: RecordingIndexEvent<TLocation>[],
  ): void {
    if (this.pendingVideo !== undefined && this.pendingVideo.timestamp !== rtp.timestamp) {
      this.emitPendingKeyframe(events);
      this.pendingVideo = undefined;
    }
    this.pendingVideo ??= {
      timestamp: rtp.timestamp,
      location,
      timeMs,
      sequenceNumber: rtp.sequenceNumber,
      damaged: false,
      hasIdr: false,
      fuNalType: undefined,
    };
    if (lostBefore > 0) {
      this.pendingVideo.damaged = true;
      this.configurationTracker?.resetFragments();
    }
    try {
      const configuration = this.configurationTracker?.push(rtp.payload, rtp.timestamp);
      if (configuration !== undefined) {
        events.push({
          type: 'configuration',
          trackId: this.track.trackId,
          configuration,
        });
      }
      const inspection = inspectH264Payload(rtp.payload);
      if (inspection.packetization === 'fu-a') {
        const nalType = inspection.nalTypes[0] ?? 0;
        if (inspection.fuStart) {
          if (this.pendingVideo.fuNalType !== undefined) this.pendingVideo.damaged = true;
          this.pendingVideo.fuNalType = nalType;
        } else if (this.pendingVideo.fuNalType !== nalType) {
          this.pendingVideo.damaged = true;
        }
        if (inspection.fuEnd) this.pendingVideo.fuNalType = undefined;
      } else if (this.pendingVideo.fuNalType !== undefined) {
        this.pendingVideo.damaged = true;
        this.pendingVideo.fuNalType = undefined;
      }
      if (inspection.hasIdr) this.pendingVideo.hasIdr = true;
    } catch {
      this.pendingVideo.damaged = true;
    }
  }

  private emitPendingKeyframe(events: RecordingIndexEvent<TLocation>[]): void {
    const pending = this.pendingVideo;
    if (pending === undefined || pending.damaged || pending.fuNalType !== undefined || !pending.hasIdr
      || this.lastKeyframeTimestamp === pending.timestamp) return;
    this.lastKeyframeTimestamp = pending.timestamp;
    events.push({
      type: 'keyframe',
      location: pending.location,
      trackId: this.track.trackId,
      timeMs: pending.timeMs,
      rtpTimestamp: pending.timestamp,
      sequenceNumber: pending.sequenceNumber,
    });
  }

  private anchor(
    location: TLocation,
    timeMs: number,
    rtpTimestamp: number,
    source: 'arrival' | 'rtcp-sr',
  ): RecordingIndexEvent<TLocation> {
    return {
      type: 'clock-anchor',
      location,
      trackId: this.track.trackId,
      source,
      timeMs,
      rtpTimestamp,
    };
  }
}

export function serializeInterleavedFrame(packet: MediaPacket): Buffer {
  const frame = packet.frame;
  if (frame.payload.length <= 0 || frame.payload.length > 65_535) {
    throw new RangeError('Interleaved payload length is invalid.');
  }
  if (packet.rawInterleavedFrame.length === frame.payload.length + 4
    && packet.rawInterleavedFrame[0] === 0x24) {
    return packet.rawInterleavedFrame;
  }
  const header = Buffer.allocUnsafe(4);
  header[0] = 0x24;
  header[1] = frame.channel;
  header.writeUInt16BE(frame.payload.length, 2);
  return Buffer.concat([header, frame.payload]);
}

export class RecordingParser<TLocation> {
  private readonly indexers = new Map<string, TrackIndexer<TLocation>>();
  private readonly reorder = new Map<string, RtpReorderBuffer<MediaPacket>>();
  private readonly playpointIntervalMs: number;
  private readonly decoderSafeBoundaries: boolean;
  private readonly safeVideoTrackId: string | undefined;
  private readonly safeConfigurationTracker: H264ConfigurationTracker | undefined;
  private safeHasConfiguration = false;
  private safeBoundaryWritten = false;
  private pendingSafeAccessUnit: PendingSafeAccessUnit | undefined;
  private boundaryPending = false;
  private boundaryIsDiscontinuity = false;
  private pendingDiscontinuityReason: DiscontinuityReason | undefined;
  private nextPlaypointMs: number | undefined;
  private mutableStatus: RecordingParserStatus = {
    reorderedPackets: 0,
    duplicatePackets: 0,
    lostPackets: 0,
    discontinuities: 0,
  };

  constructor(private readonly options: RecordingParserOptions) {
    const window = options.reorderWindowPackets ?? 4;
    if (!Number.isSafeInteger(window) || window <= 0) {
      throw new RangeError('reorderWindowPackets must be a positive safe integer.');
    }
    this.playpointIntervalMs = options.playpointIntervalMs ?? 2_000;
    if (!Number.isSafeInteger(this.playpointIntervalMs) || this.playpointIntervalMs <= 0) {
      throw new RangeError('playpointIntervalMs must be a positive safe integer.');
    }
    this.decoderSafeBoundaries = options.decoderSafeBoundaries ?? false;
    const safeVideoTrack = options.tracks.find(
      (track) => track.mediaType === 'video' && track.codec === 'h264',
    );
    if (this.decoderSafeBoundaries && safeVideoTrack === undefined) {
      throw new Error('decoderSafeBoundaries requires an H.264 video track.');
    }
    this.safeVideoTrackId = safeVideoTrack?.trackId;
    this.safeConfigurationTracker = safeVideoTrack === undefined
      ? undefined
      : new H264ConfigurationTracker();
    if (safeVideoTrack?.parameterSets !== undefined
      && this.safeConfigurationTracker !== undefined) {
      try {
        this.safeConfigurationTracker.seed(
          safeVideoTrack.parameterSets.sps,
          safeVideoTrack.parameterSets.pps,
        );
        this.safeHasConfiguration = true;
      } catch {
        // Valid in-band configuration may be discovered before the first IDR.
      }
    }
    if (this.decoderSafeBoundaries) this.boundaryPending = true;
    for (const track of options.tracks) {
      if (this.indexers.has(track.trackId)) throw new Error(`Duplicate trackId ${track.trackId}.`);
      this.indexers.set(track.trackId, new TrackIndexer<TLocation>(track));
      this.reorder.set(track.trackId, new RtpReorderBuffer<MediaPacket>(window));
    }
  }

  get status(): RecordingParserStatus {
    return { ...this.mutableStatus };
  }

  requestBoundary(): void {
    this.boundaryPending = true;
  }

  async process(
    packet: MediaPacket,
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<readonly RecordingIndexEvent<TLocation>[]> {
    const track = packet.track;
    if (track === undefined || packet.rtp === undefined) {
      return this.writeOrdered({ packet, lostBefore: 0 }, writer);
    }
    const indexer = this.indexers.get(track.trackId);
    const reorder = this.reorder.get(track.trackId);
    if (indexer === undefined || reorder === undefined) {
      return this.writeOrdered({ packet, lostBefore: 0 }, writer);
    }

    const reason: DiscontinuityReason | undefined = packet.discontinuity
      ? 'source-reconnect'
      : indexer.discontinuityReason(packet.rtp, packet.arrivalTimeMs);
    const events: RecordingIndexEvent<TLocation>[] = [];
    if (reason !== undefined) {
      const flushed = reorder.flush();
      this.mutableStatus = {
        ...this.mutableStatus,
        lostPackets: this.mutableStatus.lostPackets + flushed.lost,
      };
      for (const ordered of flushed.packets) {
        events.push(...await this.writeWithBoundaryPolicy({
          packet: ordered.value,
          lostBefore: ordered.lostBefore,
        }, writer));
      }
      reorder.reset();
      this.boundaryPending = true;
      this.boundaryIsDiscontinuity = true;
      this.pendingDiscontinuityReason = reason;
      this.mutableStatus = {
        ...this.mutableStatus,
        discontinuities: this.mutableStatus.discontinuities + 1,
      };
    }

    const result = reorder.push(packet.rtp.sequenceNumber, packet);
    this.mutableStatus = {
      ...this.mutableStatus,
      reorderedPackets: this.mutableStatus.reorderedPackets + (result.reordered ? 1 : 0),
      duplicatePackets: this.mutableStatus.duplicatePackets + (result.duplicate ? 1 : 0),
      lostPackets: this.mutableStatus.lostPackets + result.lost,
    };
    for (const ordered of result.packets) {
      const orderedEvents = await this.writeWithBoundaryPolicy({
        packet: ordered.value,
        lostBefore: ordered.lostBefore,
      }, writer);
      events.push(...orderedEvents);
    }
    return events;
  }

  async flush(writer: RecordingPacketWriter<TLocation>): Promise<readonly RecordingIndexEvent<TLocation>[]> {
    const events: RecordingIndexEvent<TLocation>[] = [];
    for (const reorder of this.reorder.values()) {
      const result = reorder.flush();
      this.mutableStatus = {
        ...this.mutableStatus,
        lostPackets: this.mutableStatus.lostPackets + result.lost,
      };
      for (const ordered of result.packets) {
        events.push(...await this.writeWithBoundaryPolicy({
          packet: ordered.value,
          lostBefore: ordered.lostBefore,
        }, writer));
      }
    }
    if (this.decoderSafeBoundaries && this.pendingSafeAccessUnit !== undefined) {
      events.push(...await this.resolveSafeAccessUnit(writer));
    }
    for (const indexer of this.indexers.values()) {
      events.push(...indexer.finishPending());
    }
    return events;
  }

  private async writeWithBoundaryPolicy(
    input: OrderedInput,
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<RecordingIndexEvent<TLocation>[]> {
    if (!this.decoderSafeBoundaries || !this.boundaryPending) {
      return await this.writeOrdered(input, writer);
    }

    const packet = input.packet;
    const isVideoRtp = packet.track?.trackId === this.safeVideoTrackId
      && packet.rtp !== undefined;
    const events: RecordingIndexEvent<TLocation>[] = [];

    if (!isVideoRtp) {
      if (this.pendingSafeAccessUnit !== undefined) {
        this.bufferSafePacket(this.pendingSafeAccessUnit, input);
        return events;
      }
      if (this.safeBoundaryWritten) {
        return await this.writeBeforePendingBoundary(input, writer);
      }
      return events;
    }

    const rtp = packet.rtp as RtpPacket;
    if (this.pendingSafeAccessUnit !== undefined
      && this.pendingSafeAccessUnit.timestamp !== rtp.timestamp) {
      events.push(...await this.resolveSafeAccessUnit(writer));
      if (!this.boundaryPending) {
        events.push(...await this.writeOrdered(input, writer));
        return events;
      }
    }

    this.pendingSafeAccessUnit ??= {
      timestamp: rtp.timestamp,
      packets: [],
      bytes: 0,
      damaged: false,
      hasIdr: false,
      fuNalType: undefined,
    };
    const pending = this.pendingSafeAccessUnit;
    this.bufferSafePacket(pending, input);
    if (input.lostBefore > 0) {
      pending.damaged = true;
      this.safeConfigurationTracker?.resetFragments();
    }

    try {
      const configuration = this.safeConfigurationTracker?.push(rtp.payload, rtp.timestamp);
      if (configuration !== undefined) {
        this.safeHasConfiguration = true;
        events.push({
          type: 'configuration',
          trackId: packet.track?.trackId ?? this.safeVideoTrackId as string,
          configuration,
        });
      }
      const inspection = inspectH264Payload(rtp.payload);
      if (inspection.packetization === 'fu-a') {
        const nalType = inspection.nalTypes[0] ?? 0;
        if (inspection.fuStart) {
          if (pending.fuNalType !== undefined) pending.damaged = true;
          pending.fuNalType = nalType;
        } else if (pending.fuNalType !== nalType) {
          pending.damaged = true;
        }
        if (inspection.fuEnd) pending.fuNalType = undefined;
      } else if (pending.fuNalType !== undefined) {
        pending.damaged = true;
        pending.fuNalType = undefined;
      }
      if (inspection.hasIdr) pending.hasIdr = true;
    } catch {
      pending.damaged = true;
    }

    if (rtp.marker) events.push(...await this.resolveSafeAccessUnit(writer));
    return events;
  }

  private bufferSafePacket(pending: PendingSafeAccessUnit, input: OrderedInput): void {
    pending.bytes += input.packet.rawInterleavedFrame.length;
    if (pending.bytes > 8 * 1024 * 1024 || pending.packets.length >= 4_096) {
      this.pendingSafeAccessUnit = undefined;
      this.safeConfigurationTracker?.resetFragments();
      throw new AinNvrError('corrupt_media', 'Incomplete recording access unit exceeded its buffer limit.');
    }
    pending.packets.push(input);
  }

  private async resolveSafeAccessUnit(
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<RecordingIndexEvent<TLocation>[]> {
    const pending = this.pendingSafeAccessUnit;
    this.pendingSafeAccessUnit = undefined;
    if (pending === undefined) return [];

    const decoderSafe = this.safeHasConfiguration
      && pending.hasIdr
      && !pending.damaged
      && pending.fuNalType === undefined;
    const events: RecordingIndexEvent<TLocation>[] = [];
    if (decoderSafe) {
      for (const input of pending.packets) {
        events.push(...await this.writeOrdered(input, writer));
      }
      this.safeBoundaryWritten = true;
      return events;
    }

    if (!this.safeBoundaryWritten) return events;
    for (const input of pending.packets) {
      events.push(...await this.writeBeforePendingBoundary(input, writer));
    }
    return events;
  }

  private async writeBeforePendingBoundary(
    input: OrderedInput,
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<RecordingIndexEvent<TLocation>[]> {
    const boundaryPending = this.boundaryPending;
    const boundaryIsDiscontinuity = this.boundaryIsDiscontinuity;
    const pendingDiscontinuityReason = this.pendingDiscontinuityReason;
    this.boundaryPending = false;
    this.boundaryIsDiscontinuity = false;
    this.pendingDiscontinuityReason = undefined;
    try {
      return await this.writeOrdered(input, writer);
    } finally {
      this.boundaryPending = boundaryPending;
      this.boundaryIsDiscontinuity = boundaryIsDiscontinuity;
      this.pendingDiscontinuityReason = pendingDiscontinuityReason;
    }
  }

  private async writeOrdered(
    input: OrderedInput,
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<RecordingIndexEvent<TLocation>[]> {
    const boundaryBefore = this.boundaryPending;
    const discontinuityBefore = boundaryBefore && this.boundaryIsDiscontinuity;
    const discontinuityReason = discontinuityBefore
      ? this.pendingDiscontinuityReason
      : undefined;
    const events: RecordingIndexEvent<TLocation>[] = [];
    if (boundaryBefore) {
      for (const indexer of this.indexers.values()) {
        events.push(...indexer.finishPending());
        indexer.beginBoundary(discontinuityBefore);
      }
      this.nextPlaypointMs = undefined;
    }
    let location: TLocation;
    try {
      location = await writer.write({
        packet: input.packet,
        boundaryBefore,
        discontinuityBefore,
      });
    } catch (error) {
      throw new AinNvrError('recording_writer_failed', 'Recording writer rejected a packet.', {
        cause: error,
      });
    }
    this.boundaryPending = false;
    this.boundaryIsDiscontinuity = false;
    this.pendingDiscontinuityReason = undefined;

    let packetEvent: Extract<RecordingIndexEvent<TLocation>, { type: 'packet' }> = {
      type: 'packet',
      location,
      ...(input.packet.track === undefined ? {} : { trackId: input.packet.track.trackId }),
      timeMs: input.packet.arrivalTimeMs,
      byteLength: serializeInterleavedFrame(input.packet).length,
    };
    const packetEventIndex = events.length;
    events.push(packetEvent);
    const track = input.packet.track;
    if (track === undefined) return events;
    const indexer = this.indexers.get(track.trackId);
    if (indexer === undefined) return events;
    if (input.packet.rtp === undefined) {
      events.push(...indexer.inspectRtcp(input.packet, location));
      return events;
    }
    const inspected = indexer.inspectRtp(input.packet, location, input.lostBefore);
    packetEvent = { ...packetEvent, timeMs: inspected.timeMs };
    events[packetEventIndex] = packetEvent;
    if (discontinuityReason !== undefined) {
      events.push({
        type: 'discontinuity',
        location,
        trackId: track.trackId,
        reason: discontinuityReason,
      });
    }
    events.push(...inspected.events);
    if (track.mediaType === 'video'
      && (this.nextPlaypointMs === undefined || inspected.timeMs >= this.nextPlaypointMs)) {
      events.push({ type: 'playpoint', location, timeMs: inspected.timeMs });
      this.nextPlaypointMs = inspected.timeMs + this.playpointIntervalMs;
    }
    return events;
  }
}
