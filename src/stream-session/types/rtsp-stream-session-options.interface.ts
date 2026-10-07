
import type { Logger } from '../../shared/index.js';







import { RtspClient } from '../../rtsp-client/index.js';


export interface RtspStreamSessionOptions {
  readonly url: string;
  readonly logger?: Logger;
  readonly reconnectInitialMs?: number;
  readonly reconnectMaximumMs?: number;
  readonly clientFactory?: (url: string) => RtspClient;
  readonly now?: () => number;
}
