import { type Socket } from 'node:net';
/** Options for an RTSP camera connection. */
export interface RtspClientOptions {
  /** RTSP or RTSPS camera URL; optional user information supplies credentials. */
  readonly url: string;
  /** Connect timeout in milliseconds. */
  readonly connectTimeoutMs?: number;
  /** Request timeout in milliseconds. */
  readonly requestTimeoutMs?: number;
  /** Keepalive interval in milliseconds. */
  readonly keepaliveIntervalMs?: number;
  /** Media timeout in milliseconds. */
  readonly mediaTimeoutMs?: number;
  /** Factory for the TCP or TLS socket used by this RTSP client. */
  readonly socketFactory?: (port: number, host: string) => Socket;
}
