











import type { RtspStreamSession } from './rtsp-stream-session.class.js';

export interface RtspSessionLease {
  readonly session: RtspStreamSession;
  release(): Promise<void>;
}
