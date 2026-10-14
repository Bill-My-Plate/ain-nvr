import type { SdpRtpMap } from './sdp-rtp-map.interface.js';
/**
 * SDP media section while its attributes and codec maps are being parsed.
 */
export type MutableMedia = {
  /** Audio or video kind declared by the SDP media section. */
  mediaType: string;
  /** Network port for this transport endpoint. */
  port: number;
  /** Transport protocol declared in the SDP media line. */
  protocol: string;
  /** RTP payload numbers advertised in the SDP media line. */
  payloadTypes: number[];
  /** RTSP control URI advertised for this media section. */
  control?: string;
  /** RTP payload-to-codec mappings parsed from SDP rtpmap attributes. */
  rtpMaps: Map<number, SdpRtpMap>;
  /** Codec format parameters advertised by SDP. */
  fmtp: Map<number, string>;
  /** SDP attributes grouped by name for this media section. */
  attributes: Map<string, string[]>;
};
