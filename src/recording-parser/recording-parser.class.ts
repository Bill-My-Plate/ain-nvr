import type { MediaPacket } from '../media/index.js';

import { H264ConfigurationTracker } from '../h264/index.js';
import { inspectH264Payload } from '../h264/index.js';
import type { RtpPacket } from '../rtp-parser/index.js';
import { RtpReorderBuffer } from '../rtp-parser/index.js';

import { AinNvrError } from '../shared/index.js';

import type { RecordingPacketWriter } from './recording-packet-writer.interface.js';
import type { RecordingIndexEvent } from './recording-index-event.type.js';
import type { RecordingParserOptions } from './recording-parser-options.interface.js';
import type { RecordingParserStatus } from './recording-parser-status.interface.js';
import type { OrderedInput } from './ordered-input.type.js';
import type { PendingSafeAccessUnit } from './pending-safe-access-unit.type.js';
import type { DiscontinuityReason } from './discontinuity-reason.type.js';
import { TrackIndexer } from './track-indexer.class.js';
import { serializeInterleavedFrame } from './serialize-interleaved-frame.util.js';

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
