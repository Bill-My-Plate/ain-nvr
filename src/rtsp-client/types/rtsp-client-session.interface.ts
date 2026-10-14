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
  /** Negotiated audio track, when the RTSP session has one. */
  readonly audio?: RtspAudioTrack;
  /** Session identifier returned by SETUP. */
  readonly sessionId: string;
  /** RTSP session timeout advertised by the camera, in seconds. */
  readonly sessionTimeoutSeconds?: number;
}
