











import type { RtspSessionInfo } from './rtsp-session-info.interface.js';

export interface RtspSessionSnapshot {
  readonly generation: number;
  readonly sessionInfo: RtspSessionInfo;
}
