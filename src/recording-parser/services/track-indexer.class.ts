import type { MediaPacket } from '../../media/index.js';
import type { TrackDescription } from '../../media/index.js';
import type { RtpPacket } from '../../rtp-parser/index.js';
import type { RecordingIndexEvent } from '../types/recording-index-event.type.js';
import { TrackClockIndexer } from './track-clock-indexer.class.js';
import { TrackVideoIndexer } from './track-video-indexer.class.js';
/**
 * Coordinates a track's clock and H.264 indexes for the recording parser.
 */
export class TrackIndexer<TLocation> {
  private readonly clock: TrackClockIndexer<TLocation>;
  private readonly video: TrackVideoIndexer<TLocation> | undefined;
  /**
   * Creates per-track clock state and optional H.264 access-unit state.
   */
  public constructor(public readonly track: TrackDescription) {
    this.clock = new TrackClockIndexer(track);
    this.video = track.codec === 'h264' ? new TrackVideoIndexer(track) : undefined;
  }

  /**
   * Reports an SSRC change or RTP time jump before the packet is indexed.
   */
  public discontinuityReason(
    rtp: RtpPacket,
    arrivalTimeMs: number,
  ): 'ssrc-change' | 'timestamp-reset' | undefined {
    return this.clock.discontinuityReason(rtp, arrivalTimeMs);
  }

  /**
   * Starts a new segment and resets time mapping for discontinuities.
   */
  public beginBoundary(resetClock: boolean): void {
    this.clock.beginBoundary(resetClock);
    this.video?.beginBoundary(resetClock);
  }

  /**
   * Flushes an eligible pending H.264 keyframe at the end of the track.
   */
  public finishPending(): RecordingIndexEvent<TLocation>[] {
    return this.video?.finishPending() ?? [];
  }

  /**
   * Uses a credible sender report to update the track's time anchor.
   */
  public inspectRtcp(packet: MediaPacket, location: TLocation): RecordingIndexEvent<TLocation>[] {
    return this.clock.inspectRtcp(packet, location);
  }

  /**
   * Maps packet time, then inspects its H.264 access unit when applicable.
   */
  public inspectRtp(
    packet: MediaPacket,
    location: TLocation,
    lostBefore: number,
  ): {
    /** Recording time in Unix milliseconds. */
    readonly timeMs: number;
    /** Index events emitted for this packet. */
    readonly events: RecordingIndexEvent<TLocation>[];
  } {
    const { timeMs, events } = this.clock.inspectRtp(packet, location);
    if (this.video !== undefined) {
      this.video.inspectRtp(packet.rtp as RtpPacket, location, timeMs, lostBefore, events);
    }
    return { timeMs, events };
  }
}
