











import type { RtspStreamSession } from '../services/rtsp-stream-session.class.js';

export interface RtspSessionLease {
  readonly session: RtspStreamSession;
  release(): Promise<void>;
}
