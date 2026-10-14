import type { RtspStreamSession } from '../services/rtsp-stream-session.class.js';
/** One caller's reference to a shared, streaming RTSP session. */
export interface RtspSessionLease {
/** Shared session from which the caller can subscribe to media. */
  readonly session: RtspStreamSession;
/** Releases this caller's reference; repeated calls have no effect. */
  release(): Promise<void>;
}
