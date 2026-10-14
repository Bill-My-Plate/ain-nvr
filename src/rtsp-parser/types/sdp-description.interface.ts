import type { SdpMediaDescription } from './sdp-media-description.interface.js';
/**
 * Parsed SDP session attributes, control URL, and media sections.
 */
export interface SdpDescription {
  /** Original input bytes retained for callers that need the wire representation. */
  readonly raw: string;
  /** Session-level RTSP control URI advertised by SDP. */
  readonly sessionControl?: string;
  /** SDP attributes that apply to the whole session. */
  readonly sessionAttributes: ReadonlyMap<string, readonly string[]>;
  /** Negotiated media description for this track. */
  readonly media: readonly SdpMediaDescription[];
}
