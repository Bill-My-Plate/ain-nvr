import type { RtspClient } from '../../rtsp-client/index.js';
/** Defaults applied to each stream created by the session manager. */
export interface RtspSessionManagerOptions {
/** Reconnect initial in milliseconds. */
  readonly reconnectInitialMs?: number;
/** Reconnect maximum in milliseconds. */
  readonly reconnectMaximumMs?: number;
/** Factory used to create an RTSP client for a managed session. */
  readonly clientFactory?: (url: string) => RtspClient;
}
