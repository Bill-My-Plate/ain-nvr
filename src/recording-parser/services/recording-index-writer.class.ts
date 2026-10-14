import type { TrackDescription } from '../../media/index.js';
import type { RtpPacket } from '../../rtp-parser/index.js';
import { AinNvrError } from '../../shared/index.js';
import type { DiscontinuityReason } from '../types/discontinuity-reason.type.js';
import type { OrderedInput } from '../types/ordered-input.type.js';
import type { RecordingIndexEvent } from '../types/recording-index-event.type.js';
import type { RecordingPacketWriter } from '../types/recording-packet-writer.interface.js';
import { serializeInterleavedFrame } from '../utils/serialize-interleaved-frame.util.js';
import { TrackIndexer } from './track-indexer.class.js';

/** Writes ordered packets and owns segment boundaries and per-track index state. */
export class RecordingIndexWriter<TLocation> {
  private readonly indexers = new Map<string, TrackIndexer<TLocation>>();
  private pendingBoundary = false;
  private boundaryIsDiscontinuity = false;
  private pendingDiscontinuityReason: DiscontinuityReason | undefined;
  private nextPlaypointMs: number | undefined;

  /** Builds an indexer for each unique negotiated track. */
  public constructor(
    tracks: readonly TrackDescription[],
    private readonly playpointIntervalMs: number,
  ) {
    for (const track of tracks) {
      if (this.indexers.has(track.trackId)) throw new Error(`Duplicate trackId ${track.trackId}.`);
      this.indexers.set(track.trackId, new TrackIndexer<TLocation>(track));
    }
  }

  /** Whether the next eligible packet must start a new segment. */
  public get boundaryPending(): boolean {
    return this.pendingBoundary;
  }

  /** Requests a normal recording rotation before the next eligible write. */
  public requestBoundary(): void {
    this.pendingBoundary = true;
  }

  /** Requests a new clock and segment after source or RTP continuity changes. */
  public markDiscontinuity(reason: DiscontinuityReason): void {
    this.pendingBoundary = true;
    this.boundaryIsDiscontinuity = true;
    this.pendingDiscontinuityReason = reason;
  }

  /** Detects a discontinuity against the last indexed packet for this track. */
  public discontinuityReason(
    trackId: string,
    rtp: RtpPacket,
    arrivalTimeMs: number,
  ): 'ssrc-change' | 'timestamp-reset' | undefined {
    return this.indexers.get(trackId)?.discontinuityReason(rtp, arrivalTimeMs);
  }

  /** Emits any keyframes still pending after the last written packet. */
  public finishPending(): RecordingIndexEvent<TLocation>[] {
    const events: RecordingIndexEvent<TLocation>[] = [];
    for (const indexer of this.indexers.values()) events.push(...indexer.finishPending());
    return events;
  }

  /** Writes pre-boundary packets into the old segment while retaining the pending boundary. */
  public async writeBeforePendingBoundary(
    input: OrderedInput,
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<RecordingIndexEvent<TLocation>[]> {
    const boundaryPending = this.pendingBoundary;
    const boundaryIsDiscontinuity = this.boundaryIsDiscontinuity;
    const pendingDiscontinuityReason = this.pendingDiscontinuityReason;
    this.pendingBoundary = false;
    this.boundaryIsDiscontinuity = false;
    this.pendingDiscontinuityReason = undefined;
    try {
      return await this.writeOrdered(input, writer);
    } finally {
      this.pendingBoundary = boundaryPending;
      this.boundaryIsDiscontinuity = boundaryIsDiscontinuity;
      this.pendingDiscontinuityReason = pendingDiscontinuityReason;
    }
  }

  /** Persists one ordered packet and emits its packet, clock, and video indexes. */
  public async writeOrdered(
    input: OrderedInput,
    writer: RecordingPacketWriter<TLocation>,
  ): Promise<RecordingIndexEvent<TLocation>[]> {
    const boundaryBefore = this.pendingBoundary;
    const discontinuityBefore = boundaryBefore && this.boundaryIsDiscontinuity;
    const discontinuityReason = discontinuityBefore ? this.pendingDiscontinuityReason : undefined;
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
    this.pendingBoundary = false;
    this.boundaryIsDiscontinuity = false;
    this.pendingDiscontinuityReason = undefined;

    let packetEvent: Extract<
      RecordingIndexEvent<TLocation>,
      {
        /** Discriminant for this packet or event variant. */
        type: 'packet';
      }
    > = {
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
    if (
      track.mediaType === 'video' &&
      (this.nextPlaypointMs === undefined || inspected.timeMs >= this.nextPlaypointMs)
    ) {
      events.push({ type: 'playpoint', location, timeMs: inspected.timeMs });
      this.nextPlaypointMs = inspected.timeMs + this.playpointIntervalMs;
    }
    return events;
  }
}
