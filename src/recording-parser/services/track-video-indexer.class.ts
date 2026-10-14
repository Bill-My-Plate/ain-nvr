import type { TrackDescription } from '../../media/index.js';
import { H264ConfigurationTracker, inspectH264Payload } from '../../h264/index.js';
import type { RtpPacket } from '../../rtp-parser/index.js';
import type { RecordingIndexEvent } from '../types/recording-index-event.type.js';
import type { PendingVideoAccessUnit } from '../types/pending-video-access-unit.type.js';

/** Collects H.264 configuration and complete IDR keyframe index events for one track. */
export class TrackVideoIndexer<TLocation> {
  private readonly configurationTracker = new H264ConfigurationTracker();
  private pendingVideo: PendingVideoAccessUnit<TLocation> | undefined;
  private lastKeyframeTimestamp: number | undefined;

  /** Seeds codec configuration when the track description contains valid parameter sets. */
  public constructor(private readonly track: TrackDescription) {
    if (track.parameterSets !== undefined) {
      try {
        this.configurationTracker.seed(track.parameterSets.sps, track.parameterSets.pps);
      } catch {
        // The parser may discover a valid in-band configuration later.
      }
    }
  }

  /** Drops a partial access unit and resets fragment state after a discontinuity. */
  public beginBoundary(resetClock: boolean): void {
    this.pendingVideo = undefined;
    if (!resetClock) return;
    this.lastKeyframeTimestamp = undefined;
    this.configurationTracker.resetFragments();
  }

  /** Emits a pending keyframe when its access unit is complete and undamaged. */
  public finishPending(): RecordingIndexEvent<TLocation>[] {
    const events: RecordingIndexEvent<TLocation>[] = [];
    this.emitPendingKeyframe(events);
    this.pendingVideo = undefined;
    return events;
  }

  /** Inspects one complete RTP packet's H.264 payload and updates access-unit state. */
  public inspectRtp(
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
      this.configurationTracker.resetFragments();
    }
    try {
      const configuration = this.configurationTracker.push(rtp.payload, rtp.timestamp);
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

  /** Adds one keyframe event and avoids indexing the same RTP timestamp twice. */
  private emitPendingKeyframe(events: RecordingIndexEvent<TLocation>[]): void {
    const pending = this.pendingVideo;
    if (
      pending === undefined ||
      pending.damaged ||
      pending.fuNalType !== undefined ||
      !pending.hasIdr ||
      this.lastKeyframeTimestamp === pending.timestamp
    )
      return;
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
}
