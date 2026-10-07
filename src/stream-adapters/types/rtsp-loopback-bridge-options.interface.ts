

import type { Logger } from '../../shared/index.js';






import type { RtspBridgePacketSource } from './rtsp-bridge-packet-source.interface.js';

export interface RtspLoopbackBridgeOptions {
  readonly source: RtspBridgePacketSource;
  readonly logger?: Logger;
  readonly maximumPrerollBytes?: number;
  readonly maximumPrerollPackets?: number;
  readonly maximumClientQueuedBytes?: number;
  readonly maximumClients?: number;
  readonly onError?: (error: Error) => void;
}
