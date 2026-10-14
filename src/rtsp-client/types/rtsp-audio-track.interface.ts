import { type SdpMediaDescription, type SdpRtpMap } from '../../rtsp-parser/index.js';
/** Negotiated optional G.711 audio track and its TCP channels. */
export interface RtspAudioTrack {
  /** Selected G.711 encoding, PCMU or PCMA. */
  readonly codec: 'pcmu' | 'pcma';
  /** SDP media description advertising this track. */
  readonly media: SdpMediaDescription;
  /** SDP mapping of payload type to codec and clock rate. */
  readonly rtpMap: SdpRtpMap;
  /** Resolved RTSP URL used to SETUP this track. */
  readonly controlUrl: string;
  /** One-byte TCP interleaved channel identifier for RTP. */
  readonly rtpChannel: number;
  /** One-byte TCP interleaved channel identifier for RTCP. */
  readonly rtcpChannel: number;
}
