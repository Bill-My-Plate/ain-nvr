import type { RtspSessionTrackInfo } from './rtsp-session-track-info.type.js';
/** SDP and track details negotiated for the current RTSP connection. */
export interface RtspSessionInfo {
/** Original SDP text received from the camera. */
  readonly sdp: string;
/** Negotiated video track followed by an optional audio track. */
  readonly tracks: readonly RtspSessionTrackInfo[];
}
