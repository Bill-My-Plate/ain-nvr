import type { TrackDescription } from './track-description.interface.js';
import type { RtspInterleavedFrame } from '../../rtsp-parser/index.js';
import type { RtpPacket, RtcpSenderReport } from '../../rtp-parser/index.js';
/** One RTSP interleaved frame and the media information parsed from it. */
export interface MediaPacket {
  /** Live session generation; absent when a custom or recorded source does not supply one. */
  readonly sessionGeneration?: number;
  /** Packet arrival time in Unix milliseconds, supplied by the source. */
  readonly arrivalTimeMs: number;
  /** Negotiated track for the channel, when the source can identify one. */
  readonly track?: TrackDescription;
  /** RTSP interleaved channel number, matching `frame.channel`. */
  readonly channel: number;
  /**
   * Complete RTSP/TCP interleaved frame: byte 0 is `$` (0x24), byte 1 is the
   * channel, bytes 2–3 are the big-endian payload length, followed by that
   * many RTP or RTCP bytes. Total length is 4 plus the declared payload length.
   */
  readonly rawInterleavedFrame: Buffer;
  /** Parsed framing and payload for the same interleaved packet. */
  readonly frame: RtspInterleavedFrame;
  /** Parsed RTP packet when this frame carries RTP on the track's RTP channel. */
  readonly rtp?: RtpPacket;
  /** Parsed sender report when this frame contains an RTCP Sender Report. */
  readonly rtcpSenderReport?: RtcpSenderReport;
  /** Whether a source or timing change precedes this packet. */
  readonly discontinuity: boolean;
}
