
import { type Socket } from 'node:net';




import type { RtspParser } from '../../rtsp-parser/index.js';


export type BridgeClient = {
  readonly socket: Socket;
  readonly parser: RtspParser;
  readonly sessionId: string;
  rtpChannel: number;
  rtcpChannel: number;
  playing: boolean;
};
