import { type Socket } from 'node:dgram';
/**
 * Configuration options for rtp Udp Forwarder.
 */
export interface RtpUdpForwarderOptions {
  /** UDP destination hostname or address. */
  readonly host?: string;
  /** Network port for this transport endpoint. */
  readonly port: number;
  /** Upper bound for pending packets. */
  readonly maximumPendingPackets?: number;
  /** Factory used to create the outbound UDP socket. */
  readonly socketFactory?: () => Socket;
  /** Callback invoked when the operation fails. */
  readonly onError?: (error: Error) => void;
}
