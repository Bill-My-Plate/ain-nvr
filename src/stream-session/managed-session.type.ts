











import type { RtspStreamSession } from './rtsp-stream-session.class.js';

export type ManagedSession = {
  readonly session: RtspStreamSession;
  leases: number;
};
