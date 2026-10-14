import type { RtspSessionInfo } from './rtsp-session-info.interface.js';
/** Immutable view of one successfully negotiated stream generation. */
export interface RtspSessionSnapshot {
/** One-based counter incremented after each successful connection. */
  readonly generation: number;
/** SDP and track details for this generation. */
  readonly sessionInfo: RtspSessionInfo;
}
