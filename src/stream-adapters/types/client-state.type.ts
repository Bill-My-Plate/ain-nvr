
import { type Socket } from 'node:net';



import type { RtspParser } from '../../rtsp-parser/index.js';

export type ClientState = {
  readonly socket: Socket;
  readonly parser: RtspParser;
  readonly sessionId: string;
  readonly channels: Map<0 | 1, { readonly rtp: number; readonly rtcp: number }>;
  playing: boolean;
};
