import type { SdpRtpMap } from './sdp-rtp-map.interface.js';
/**
 * One SDP media section with formats, transport, and attributes.
 */
export interface SdpMediaDescription {
  /** Audio or video kind declared by the SDP media section. */
  readonly mediaType: string;
  /** Network port for this transport endpoint. */
  readonly port: number;
  /** Transport protocol declared in the SDP media line. */
  readonly protocol: string;
  /** RTP payload numbers advertised in the SDP media line. */
  readonly payloadTypes: readonly number[];
  /** RTSP control URI advertised for this media section. */
  readonly control?: string;
  /** RTP payload-to-codec mappings parsed from SDP rtpmap attributes. */
  readonly rtpMaps: ReadonlyMap<number, SdpRtpMap>;
  /** Codec format parameters advertised by SDP. */
  readonly fmtp: ReadonlyMap<number, string>;
  /** SDP attributes grouped by name for this media section. */
  readonly attributes: ReadonlyMap<string, readonly string[]>;
}
