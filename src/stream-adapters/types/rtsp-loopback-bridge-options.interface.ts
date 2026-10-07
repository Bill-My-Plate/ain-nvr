import type { RtspBridgePacketSource } from './rtsp-bridge-packet-source.interface.js';

export interface RtspLoopbackBridgeOptions {
  readonly source: RtspBridgePacketSource;
  readonly maximumPrerollBytes?: number;
  readonly maximumPrerollPackets?: number;
  readonly maximumClientQueuedBytes?: number;
  readonly maximumClients?: number;
  readonly onError?: (error: Error) => void;
}
