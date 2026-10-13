import { type Socket } from 'node:net';

/** Options for an RTSP camera connection. */
export interface RtspClientOptions {
  /** RTSP or RTSPS camera URL; optional user information supplies credentials. */
  readonly url: string;
  /** Maximum TCP or TLS connection time in milliseconds. */
  readonly connectTimeoutMs?: number;
  /** Maximum wait for each RTSP response in milliseconds. */
  readonly requestTimeoutMs?: number;
  /** Optional session keepalive interval in milliseconds. */
  readonly keepaliveIntervalMs?: number;
  /** Maximum silence on negotiated RTP channels in milliseconds. */
  readonly mediaTimeoutMs?: number;
  /** Optional creator for a custom or test socket. */
  readonly socketFactory?: (port: number, host: string) => Socket;
}
