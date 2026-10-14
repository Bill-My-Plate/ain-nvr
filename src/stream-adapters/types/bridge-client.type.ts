import { type Socket } from 'node:net';

import type { RtspParser } from '../../rtsp-parser/index.js';
/**
 * Connected RTSP loopback client and its negotiated transport state.
 */
export type BridgeClient = {
  /** Connected RTSP client socket. */
  readonly socket: Socket;
  /** Incremental parser for this client’s RTSP requests. */
  readonly parser: RtspParser;
  /**
   * Identifier of the RTSP or recording session.
   */
  readonly sessionId: string;
  /** RTSP interleaved channel carrying RTP packets. */
  rtpChannel: number;
  /** RTSP interleaved channel carrying RTCP packets. */
  rtcpChannel: number;
  /** Whether the RTSP client has completed PLAY. */
  playing: boolean;
};
