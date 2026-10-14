import type { RtspStreamSession } from '../services/rtsp-stream-session.class.js';
/** Manager-owned stream session and its current reference count. */
export type ManagedSession = {
/** The single stream shared by callers that requested the same URL. */
  readonly session: RtspStreamSession;
/** Number of active callers sharing this managed session. */
  leases: number;
};
