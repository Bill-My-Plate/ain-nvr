import type { RtspBridgePacketSource } from './rtsp-bridge-packet-source.interface.js';
/**
 * Configuration options for rtsp Loopback Bridge.
 */
export interface RtspLoopbackBridgeOptions {
  /** Producer of packets, bytes, or segments consumed by this operation. */
  readonly source: RtspBridgePacketSource;
  /** Maximum preroll measured in bytes. */
  readonly maximumPrerollBytes?: number;
  /** Upper bound for preroll packets. */
  readonly maximumPrerollPackets?: number;
  /** Maximum client queued measured in bytes. */
  readonly maximumClientQueuedBytes?: number;
  /** Upper bound for clients. */
  readonly maximumClients?: number;
  /** Callback invoked when the operation fails. */
  readonly onError?: (error: Error) => void;
}
