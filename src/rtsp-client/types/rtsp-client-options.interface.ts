
import { type Socket } from 'node:net';








export interface RtspClientOptions {
  readonly url: string;
  readonly connectTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
  readonly keepaliveIntervalMs?: number;
  readonly mediaTimeoutMs?: number;
  readonly socketFactory?: (port: number, host: string) => Socket;
}
