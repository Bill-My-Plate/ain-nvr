import { RECORDING_PARSER_CONSTANTS } from '../constants/recording-parser-numeric-values.constant.js';
import type { MediaPacket, TrackDescription } from '../../media/index.js';
import type { RtpPacket } from '../../rtp-parser/index.js';
import { RtpClockMapper, RtpTimestampUnwrapper } from '../../rtp-parser/index.js';
import type { RecordingIndexEvent } from '../types/recording-index-event.type.js';

/** Maps one track's RTP timestamps to monotonic recording time and clock anchors. */
export class TrackClockIndexer<TLocation> {
  private readonly unwrapper = new RtpTimestampUnwrapper();
  private clockMapper: RtpClockMapper | undefined;
  private clockSource: 'arrival' | 'rtcp-sr' | undefined;
  private activeSsrc: number | undefined;
  private lastRawTimestamp: number | undefined;
  private lastArrivalTimeMs: number | undefined;
  private lastIndexedTimeMs: number | undefined;
  private needsBoundaryAnchor = true;

  /** Keeps the negotiated clock rate and track identifier for index events. */
  public constructor(private readonly track: TrackDescription) {}

  /** Detects an SSRC change or an implausible RTP timestamp jump. */
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

  /** Requests a new anchor and resets continuity only for a discontinuity. */
  public beginBoundary(resetClock: boolean): void {
    this.needsBoundaryAnchor = true;
    if (!resetClock) return;
    this.unwrapper.reset();
    this.clockMapper = undefined;
    this.clockSource = undefined;
    this.activeSsrc = undefined;
    this.lastRawTimestamp = undefined;
    this.lastArrivalTimeMs = undefined;
    this.lastIndexedTimeMs = undefined;
  }

  /** Accepts a sender report only when its clock and SSRC are credible. */
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

  /** Maps a complete RTP packet and emits any new arrival or boundary anchor. */
  public inspectRtp(
    packet: MediaPacket,
    location: TLocation,
  ): {
    /** Recording time in Unix milliseconds. */
    readonly timeMs: number;
    /** Clock anchor events for this packet. */
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
    return { timeMs, events };
  }

  /** Builds an index event for an arrival, RTCP, or segment clock anchor. */
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
