











import type { RtspSessionTrackInfo } from './rtsp-session-track-info.type.js';

export interface RtspSessionInfo {
  readonly sdp: string;
  readonly tracks: readonly RtspSessionTrackInfo[];
}
