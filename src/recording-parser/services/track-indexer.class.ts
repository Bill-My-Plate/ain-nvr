import { RECORDING_PARSER_CONSTANTS } from '../constants/recording-parser-numeric-values.constant.js';
import type { MediaPacket } from '../../media/index.js';
import type { TrackDescription } from '../../media/index.js';
import { H264ConfigurationTracker } from '../../h264/index.js';
import { inspectH264Payload } from '../../h264/index.js';
import type { RtpPacket } from '../../rtp-parser/index.js';

import { RtpClockMapper, RtpTimestampUnwrapper } from '../../rtp-parser/index.js';

import type { RecordingIndexEvent } from '../types/recording-index-event.type.js';
import type { PendingVideoAccessUnit } from '../types/pending-video-access-unit.type.js';
/**
 * Tracks packet continuity and maps RTP time to recording time using arrival and RTCP anchors.
 */
export class TrackIndexer<TLocation> {
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
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(readonly track: TrackDescription) {
    this.configurationTracker = track.codec === 'h264' ? new H264ConfigurationTracker() : undefined;
    if (track.parameterSets !== undefined && this.configurationTracker !== undefined) {
      try {
        this.configurationTracker.seed(track.parameterSets.sps, track.parameterSets.pps);
      } catch {
        // The parser may discover a valid in-band configuration later.
      }
    }
  }

  /**
   * Discontinuity Reason.
   */
  public discontinuityReason(
    rtp: RtpPacket,
    arrivalTimeMs: number,
  ): 'ssrc-change' | 'timestamp-reset' | undefined {
    if (this.activeSsrc !== undefined && this.activeSsrc !== rtp.ssrc) return 'ssrc-change';
    if (this.lastRawTimestamp === undefined || this.lastArrivalTimeMs === undefined)
      return undefined;
    let timestampDelta = rtp.timestamp - this.lastRawTimestamp;
    if (timestampDelta > RECORDING_PARSER_CONSTANTS.rtpTimestampHalfRange)
      timestampDelta -= RECORDING_PARSER_CONSTANTS.rtpTimestampRange;
    else if (timestampDelta < -RECORDING_PARSER_CONSTANTS.rtpTimestampHalfRange)
      timestampDelta += RECORDING_PARSER_CONSTANTS.rtpTimestampRange;
    const arrivalDeltaMs = Math.max(0, arrivalTimeMs - this.lastArrivalTimeMs);
    const rtpDeltaMs =
      (timestampDelta * RECORDING_PARSER_CONSTANTS.millisecondsPerSecond) / this.track.clockRate;
    return rtpDeltaMs < -RECORDING_PARSER_CONSTANTS.maximumTimestampRegressionMs ||
      rtpDeltaMs - arrivalDeltaMs > RECORDING_PARSER_CONSTANTS.maximumTimestampLeadMs
      ? 'timestamp-reset'
      : undefined;
  }

  /**
   * Begin Boundary.
   */
  public beginBoundary(resetClock: boolean): void {
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

  /**
   * Flushes pending index events at the end of the current track.
   */
  public finishPending(): RecordingIndexEvent<TLocation>[] {
    const events: RecordingIndexEvent<TLocation>[] = [];
    this.emitPendingKeyframe(events);
    this.pendingVideo = undefined;
    return events;
  }

  /**
   * Inspect Rtcp.
   */
  public inspectRtcp(packet: MediaPacket, location: TLocation): RecordingIndexEvent<TLocation>[] {
    const report = packet.rtcpSenderReport;
    if (
      report === undefined ||
      !Number.isFinite(report.ntpTimeMs) ||
      report.ntpTimeMs < 0 ||
      Math.abs(report.ntpTimeMs - packet.arrivalTimeMs) >
        RECORDING_PARSER_CONSTANTS.clockAnchorArrivalWindowMultiplier *
          RECORDING_PARSER_CONSTANTS.maximumClockAnchorSkewMs ||
      (this.activeSsrc !== undefined && report.ssrc !== this.activeSsrc)
    ) {
      return [];
    }
    const timeMs = Math.round(report.ntpTimeMs);
    const unwrapped = this.unwrapper.unwrap(report.rtpTimestamp);
    this.clockMapper = new RtpClockMapper(unwrapped, timeMs, this.track.clockRate);
    this.clockSource = 'rtcp-sr';
    this.needsBoundaryAnchor = false;
    return [
      {
        type: 'clock-anchor',
        location,
        trackId: this.track.trackId,
        source: 'rtcp-sr',
        timeMs,
        rtpTimestamp: report.rtpTimestamp,
      },
    ];
  }

  /**
   * Inspect Rtp.
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
      if (timestampDelta > RECORDING_PARSER_CONSTANTS.rtpTimestampHalfRange)
        timestampDelta -= RECORDING_PARSER_CONSTANTS.rtpTimestampRange;
      else if (timestampDelta < -RECORDING_PARSER_CONSTANTS.rtpTimestampHalfRange)
        timestampDelta += RECORDING_PARSER_CONSTANTS.rtpTimestampRange;
      const rtpProgressMs =
        (timestampDelta * RECORDING_PARSER_CONSTANTS.millisecondsPerSecond) / this.track.clockRate;
      const arrivalProgressMs = packet.arrivalTimeMs - previousArrival;
      if (
        Math.abs(rtpProgressMs - arrivalProgressMs) >
        RECORDING_PARSER_CONSTANTS.maximumTimestampRegressionMs
      ) {
        this.clockMapper = new RtpClockMapper(
          unwrapped,
          packet.arrivalTimeMs,
          this.track.clockRate,
        );
        this.clockSource = 'arrival';
        events.push(this.anchor(location, packet.arrivalTimeMs, rtp.timestamp, 'arrival'));
      }
    }
    if (this.needsBoundaryAnchor && events.length === 0) {
      events.push(
        this.anchor(
          location,
          Math.round(this.clockMapper.toWallClockMs(unwrapped)),
          rtp.timestamp,
          this.clockSource ?? 'arrival',
        ),
      );
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

  /**
   * Inspect Video.
   */
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

  /**
   * Emit Pending Keyframe.
   */
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

  /**
   * Anchor.
   */
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
