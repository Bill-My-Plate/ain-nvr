
import { type Socket } from 'node:net';




import { RtspMixedParser } from '../rtsp-parser/index.js';


export type BridgeClient = {
  readonly socket: Socket;
  readonly parser: RtspMixedParser;
  readonly sessionId: string;
  rtpChannel: number;
  rtcpChannel: number;
  playing: boolean;
};
