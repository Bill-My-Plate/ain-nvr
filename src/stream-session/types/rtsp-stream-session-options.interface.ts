import { RtspClient } from '../../rtsp-client/index.js';

export interface RtspStreamSessionOptions {
  readonly url: string;
  readonly reconnectInitialMs?: number;
  readonly reconnectMaximumMs?: number;
  readonly clientFactory?: (url: string) => RtspClient;
  readonly now?: () => number;
}
