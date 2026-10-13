import { type SdpDescription } from '../../rtsp-parser/index.js';

import type { RtspVideoTrack } from './rtsp-video-track.interface.js';
import type { RtspAudioTrack } from './rtsp-audio-track.interface.js';

/** SDP and tracks returned after a successful PLAY. */
export interface RtspClientSession {
  /** Original SDP text received from DESCRIBE. */
  readonly sdp: string;
  /** Parsed SDP used to select media tracks. */
  readonly description: SdpDescription;
  /** Required negotiated H.264 track. */
  readonly video: RtspVideoTrack;
  /** Optional negotiated G.711 track. */
  readonly audio?: RtspAudioTrack;
  /** Session identifier returned by SETUP. */
  readonly sessionId: string;
  /** Optional camera session timeout in seconds. */
  readonly sessionTimeoutSeconds?: number;
}
