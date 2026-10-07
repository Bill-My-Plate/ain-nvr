import type { TrackDescription } from './track-description.interface.js';
import type { RtspInterleavedFrame } from '../../rtsp-parser/index.js';
import type { RtpPacket, RtcpSenderReport } from '../../rtp-parser/index.js';

/** Packet shape shared by live sessions and storage-neutral recording. */
export interface MediaPacket {
  /** Present on live-session packets; optional for custom/recorded sources. */
  readonly sessionGeneration?: number;
  readonly arrivalTimeMs: number;
  readonly track?: TrackDescription;
  readonly channel: number;
  readonly rawInterleavedFrame: Buffer;
  readonly frame: RtspInterleavedFrame;
  readonly rtp?: RtpPacket;
  readonly rtcpSenderReport?: RtcpSenderReport;
  readonly discontinuity: boolean;
}
