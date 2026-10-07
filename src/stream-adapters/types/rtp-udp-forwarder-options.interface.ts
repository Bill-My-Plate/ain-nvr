import { type Socket } from 'node:dgram';


export interface RtpUdpForwarderOptions {
  readonly host?: string;
  readonly port: number;
  readonly maximumPendingPackets?: number;
  readonly socketFactory?: () => Socket;
  readonly onError?: (error: Error) => void;
}
