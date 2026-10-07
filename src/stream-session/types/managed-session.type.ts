











import type { RtspStreamSession } from '../services/rtsp-stream-session.class.js';

export type ManagedSession = {
  readonly session: RtspStreamSession;
  leases: number;
};
