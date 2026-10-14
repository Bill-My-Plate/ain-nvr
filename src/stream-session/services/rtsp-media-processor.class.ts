import type { H264AccessUnit } from '../../h264/index.js';
import { H264AccessUnitAssembler } from '../../h264/index.js';
import type { MediaPacket, TrackDescription } from '../../media/index.js';
import { findRtcpSenderReport, parseRtpPacket, RtpReorderBuffer, type RtpPacket } from '../../rtp-parser/index.js';
import type { RtspInterleavedFrame } from '../../rtsp-parser/index.js';
import { MAX_VIDEO_TIMESTAMP_REGRESSION_MS } from '../constants/max-video-timestamp-regression-ms.constant.js';
import { MILLISECONDS_PER_SECOND } from '../constants/milliseconds-per-second.constant.js';
import { RTP_TIMESTAMP_FULL_RANGE } from '../constants/rtp-timestamp-full-range.constant.js';
import { RTP_TIMESTAMP_HALF_RANGE } from '../constants/rtp-timestamp-half-range.constant.js';
import { VIDEO_REORDER_WINDOW_PACKETS } from '../constants/video-reorder-window-packets.constant.js';
import type { AccessUnitSubscriber } from '../types/access-unit-subscriber.type.js';
import type { PacketSubscriber } from '../types/packet-subscriber.type.js';
/** Parses interleaved media and assembles live video for one negotiated RTSP stream. */
export class RtspMediaProcessor {
  private readonly packetSubscribers = new Set<PacketSubscriber>();
  private readonly accessUnitSubscribers = new Set<AccessUnitSubscriber>();
  private tracks: readonly TrackDescription[] = [];
  private sessionGeneration: number | undefined;
  private assembler: H264AccessUnitAssembler | undefined;
  private videoReorder = new RtpReorderBuffer<MediaPacket>(VIDEO_REORDER_WINDOW_PACKETS);
  private videoSsrc: number | undefined;
  private videoTimestamp: number | undefined;
  private discontinuityPending = false;
/** Receives the session clock and callbacks that report parsing or subscriber failures. */
  public constructor(
    private readonly now: () => number,
    private readonly onPacketError: (error: Error) => void,
    private readonly onSubscriberError: (error: Error) => void,
  ) {}

  /** Registers a raw/parsed media packet subscriber and returns its removal function. */
  public subscribeMediaPackets(subscriber: PacketSubscriber): () => void {
    this.packetSubscribers.add(subscriber);
    return () => this.packetSubscribers.delete(subscriber);
  }

  /** Registers an assembled video access-unit subscriber and returns its removal function. */
  public subscribeVideoAccessUnits(subscriber: AccessUnitSubscriber): () => void {
    this.accessUnitSubscribers.add(subscriber);
    return () => this.accessUnitSubscribers.delete(subscriber);
  }

  /** Replaces negotiated tracks and clears video ordering state for a new generation. */
  public configure(tracks: readonly TrackDescription[], generation: number, reconnect: boolean): void {
    this.tracks = tracks;
    this.sessionGeneration = generation;
    const video = tracks.find((track) => track.mediaType === 'video');
    this.assembler = video === undefined ? undefined : new H264AccessUnitAssembler({
      payloadType: video.payloadType,
      clockRate: video.clockRate,
      ...(video.parameterSets === undefined ? {} : { parameterSets: video.parameterSets }),
    });
    this.videoReorder = new RtpReorderBuffer<MediaPacket>(VIDEO_REORDER_WINDOW_PACKETS);
    this.videoSsrc = undefined;
    this.videoTimestamp = undefined;
    this.discontinuityPending = reconnect;
  }

  /**
   * Publishes one complete RTSP/TCP `$` frame. `rawHeader` is four bytes:
   * `$`, one channel byte, then a two-byte big-endian payload length.
   * `payload` contains exactly that many bytes: one RTP packet on an RTP
   * channel, or one RTCP packet/compound packet on an RTCP channel.
   */
  public handleFrame(frame: RtspInterleavedFrame): void {
    try {
      const arrivalTimeMs = this.now();
      const track = this.tracks.find(
        (candidate) => candidate.rtpChannel === frame.channel
          || candidate.rtcpChannel === frame.channel,
      );
      const isRtp = track?.rtpChannel === frame.channel;
      const rtp = isRtp ? parseRtpPacket(frame.payload) : undefined;
      const rtcpSenderReport = track?.rtcpChannel === frame.channel
        ? findRtcpSenderReport(frame.payload)
        : undefined;
      let videoDiscontinuity = false;
      if (track?.mediaType === 'video' && rtp !== undefined) {
        let timestampDelta = this.videoTimestamp === undefined
          ? 0
          : rtp.timestamp - this.videoTimestamp;
        // Choose the nearest signed 32-bit timestamp delta across rollover.
        if (timestampDelta > RTP_TIMESTAMP_HALF_RANGE) timestampDelta -= RTP_TIMESTAMP_FULL_RANGE;
        else if (timestampDelta < -RTP_TIMESTAMP_HALF_RANGE) timestampDelta += RTP_TIMESTAMP_FULL_RANGE;
        videoDiscontinuity = this.discontinuityPending
          || (this.videoSsrc !== undefined && this.videoSsrc !== rtp.ssrc)
          || timestampDelta * MILLISECONDS_PER_SECOND / track.clockRate < -MAX_VIDEO_TIMESTAMP_REGRESSION_MS;
      }
      const packet: MediaPacket = {
        sessionGeneration: this.sessionGeneration!,
        arrivalTimeMs,
        ...(track === undefined ? {} : { track }),
        channel: frame.channel,
        rawInterleavedFrame: Buffer.concat([frame.rawHeader, frame.payload]),
        frame,
        ...(rtp === undefined ? {} : { rtp }),
        ...(rtcpSenderReport === undefined ? {} : { rtcpSenderReport }),
        discontinuity: videoDiscontinuity,
      };
      for (const subscriber of this.packetSubscribers) {
        try {
          subscriber(packet);
        } catch (error) {
          this.onSubscriberError(error instanceof Error ? error : new Error(String(error)));
        }
      }
      if (track?.mediaType === 'video' && rtp !== undefined) this.handleVideoPacket(packet, rtp);
    } catch (error) {
      this.onPacketError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Reorders one parsed video RTP packet and feeds assembled access units to subscribers.
   * `rtp.raw` is the complete RTP packet from the `$` payload: a minimum
   * 12-byte fixed header, optional CSRC/extension bytes, then H.264 payload
   * and optional padding. `rtp.payload` is the H.264 portion of that buffer.
   */
  private handleVideoPacket(packet: MediaPacket, rtp: RtpPacket): void {
    if (packet.discontinuity) {
      this.videoReorder.reset();
      this.discontinuityPending = true;
    }
    this.videoSsrc = rtp.ssrc;
    this.videoTimestamp = rtp.timestamp;
    const result = this.videoReorder.push(rtp.sequenceNumber, {
      ...packet,
      discontinuity: packet.discontinuity || this.discontinuityPending,
    });
    for (const ordered of result.packets) {
      this.discontinuityPending = false;
      const orderedRtp = ordered.value.rtp;
      if (orderedRtp === undefined || this.assembler === undefined) continue;
      const units: H264AccessUnit[] = this.assembler.push({
        rtp: orderedRtp,
        wallClockTimeMs: ordered.value.arrivalTimeMs,
        discontinuity: ordered.value.discontinuity,
        lostBefore: ordered.lostBefore,
      });
      for (const unit of units) {
        for (const subscriber of this.accessUnitSubscribers) {
          try {
            subscriber(unit);
          } catch (error) {
            this.onSubscriberError(error instanceof Error ? error : new Error(String(error)));
          }
        }
      }
    }
  }
}
