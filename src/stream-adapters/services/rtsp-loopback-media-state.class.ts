import {
  createH264CodecConfiguration,
  H264ConfigurationTracker,
  type H264CodecConfiguration,
} from '../../h264/index.js';
import type { MediaPacket, TrackDescription } from '../../media/index.js';

import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
import type { BufferedFrame } from '../types/buffered-frame.type.js';
import { signedTimestampDelta } from '../utils/signed-timestamp-delta.util.js';
import { trackSignature } from '../utils/track-signature.util.js';

/** Tracks the current H.264 source, learned codec data, and bounded RTP preroll. */
export class RtspLoopbackMediaState {
  private readonly preroll: BufferedFrame[] = [];
  private currentTrack: TrackDescription | undefined;
  private configurationTracker = new H264ConfigurationTracker();
  private configuration: H264CodecConfiguration | undefined;
  private currentSsrc: number | undefined;
  private currentTimestamp: number | undefined;
  private prerollBytesValue = 0;

  /** Stores preroll limits and the callback used to disconnect stale clients. */
  public constructor(
    private readonly maximumPrerollBytes: number,
    private readonly maximumPrerollPackets: number,
    private readonly disconnectClients: () => void,
  ) {}

  /** Returns the current video track used by SDP. */
  public get track(): TrackDescription | undefined {
    return this.currentTrack;
  }

  /** Returns codec configuration from SDP or in-band H.264 parameter sets. */
  public get codecConfiguration(): H264CodecConfiguration | undefined {
    return this.configuration;
  }

  /** Returns buffered complete RTP or RTCP packets in capture order. */
  public get prerollFrames(): readonly BufferedFrame[] {
    return this.preroll;
  }

  /** Returns the bytes charged to preroll, including interleaved headers. */
  public get prerollBytes(): number {
    return this.prerollBytesValue;
  }

  /** Returns the number of buffered packets. */
  public get prerollPackets(): number {
    return this.preroll.length;
  }

  /**
   * Installs a track and its advertised H.264 parameter sets, then clears old
   * RTP state. A changed track disconnects clients negotiated against the old SDP.
   */
  public setTrack(track: TrackDescription, disconnectClients: boolean): void {
    this.currentTrack = track;
    this.configurationTracker = new H264ConfigurationTracker();
    this.configuration = undefined;
    if (track.parameterSets !== undefined) {
      try {
        this.configuration = createH264CodecConfiguration(
          track.parameterSets.sps,
          track.parameterSets.pps,
        );
        this.configurationTracker.seed(track.parameterSets.sps, track.parameterSets.pps);
      } catch {
        // A valid in-band configuration may arrive later.
      }
    }
    this.resetMedia(disconnectClients, false);
  }

  /**
   * Accepts one complete source media packet. Returns a copied frame for live
   * clients after updating codec data and bounded preroll; ignores other tracks.
   */
  public capture(packet: MediaPacket): BufferedFrame | undefined {
    const track = packet.track;
    if (track?.mediaType !== 'video' || track.codec !== 'h264') return undefined;
    const isRtcp = packet.channel === track.rtcpChannel;
    if (!isRtcp && (packet.channel !== track.rtpChannel || packet.rtp === undefined)) {
      return undefined;
    }

    if (
      this.currentTrack === undefined ||
      trackSignature(this.currentTrack) !== trackSignature(track)
    ) {
      this.setTrack(track, true);
    }
    if (!isRtcp && packet.rtp !== undefined) {
      const reset =
        (this.currentSsrc !== undefined && this.currentSsrc !== packet.rtp.ssrc) ||
        (this.currentTimestamp !== undefined &&
          (signedTimestampDelta(packet.rtp.timestamp, this.currentTimestamp) *
            STREAM_ADAPTER_CONSTANTS.millisecondsPerSecond) /
            track.clockRate <
            -STREAM_ADAPTER_CONSTANTS.maximumTimestampRegressionMs);
      if (reset) this.resetMedia(true);
      this.currentSsrc = packet.rtp.ssrc;
      this.currentTimestamp = packet.rtp.timestamp;
      const learned = this.configurationTracker.push(packet.rtp.payload, packet.rtp.timestamp);
      if (learned !== undefined) this.configuration = learned;
    }

    const frame: BufferedFrame = { isRtcp, payload: Buffer.from(packet.frame.payload) };
    this.preroll.push(frame);
    this.prerollBytesValue += frame.payload.length + STREAM_ADAPTER_CONSTANTS.interleavedHeaderBytes;
    while (
      this.preroll.length > this.maximumPrerollPackets ||
      this.prerollBytesValue > this.maximumPrerollBytes
    ) {
      const removed = this.preroll.shift();
      if (removed === undefined) break;
      this.prerollBytesValue -=
        removed.payload.length + STREAM_ADAPTER_CONSTANTS.interleavedHeaderBytes;
    }
    return frame;
  }

  /** Releases buffered packets when the bridge stops. */
  public clearPreroll(): void {
    this.preroll.length = 0;
    this.prerollBytesValue = 0;
  }

  /** Clears RTP history and optionally closes clients using an obsolete stream. */
  private resetMedia(disconnectClients: boolean, resetConfiguration = true): void {
    this.clearPreroll();
    this.currentSsrc = undefined;
    this.currentTimestamp = undefined;
    if (resetConfiguration) this.configurationTracker.resetFragments();
    if (disconnectClients) this.disconnectClients();
  }
}
