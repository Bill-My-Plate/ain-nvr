import type { RtspClient } from '../../rtsp-client/index.js';
/** Connection, retry, and clock options for one live RTSP session. */
export interface RtspStreamSessionOptions {
/** Exact camera URL passed to the RTSP client and used as manager identity. */
  readonly url: string;
/** Reconnect initial in milliseconds. */
  readonly reconnectInitialMs?: number;
/** Reconnect maximum in milliseconds. */
  readonly reconnectMaximumMs?: number;
/** Creates a client for each connection attempt. */
  readonly clientFactory?: (url: string) => RtspClient;
/** Returns packet arrival time in Unix milliseconds. */
  readonly now?: () => number;
}
