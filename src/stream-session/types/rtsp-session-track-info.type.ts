import type { TrackDescription } from '../../media/index.js';
/** Negotiated track identity plus the SDP fields used by RTSP consumers. */
export type RtspSessionTrackInfo = TrackDescription & {
/** Media-level SDP control value, or an empty string if absent. */
  readonly control: string;
/** Raw SDP format parameters for the negotiated payload type, when present. */
  readonly fmtp?: string;
};
