import { RtspClient } from '../../rtsp-client/index.js';

export interface RtspSessionManagerOptions {
  readonly reconnectInitialMs?: number;
  readonly reconnectMaximumMs?: number;
  readonly clientFactory?: (url: string) => RtspClient;
}
