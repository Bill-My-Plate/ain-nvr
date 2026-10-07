
import { type Socket } from 'node:net';



import { RtspMixedParser } from '../../rtsp-parser/index.js';

export type ClientState = {
  readonly socket: Socket;
  readonly parser: RtspMixedParser;
  readonly sessionId: string;
  readonly channels: Map<0 | 1, { readonly rtp: number; readonly rtcp: number }>;
  playing: boolean;
};
