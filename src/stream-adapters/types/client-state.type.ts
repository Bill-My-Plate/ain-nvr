import { type Socket } from 'node:net';

import type { RtspParser } from '../../rtsp-parser/index.js';
/**
 * Lifecycle states of client.
 */
export type ClientState = {
  /** Connected playback RTSP client socket. */
  readonly socket: Socket;
  /** Incremental parser for this client’s RTSP requests. */
  readonly parser: RtspParser;
  /**
   * Identifier of the RTSP or recording session.
   */
  readonly sessionId: string;
  /** Negotiated RTP and RTCP interleaved channel numbers. */
  readonly channels: Map<
    0 | 1,
    {
      /** RTP channel negotiated for this client. */
      readonly rtp: number;
      /** RTCP channel negotiated for this client. */
      readonly rtcp: number;
    }
  >;
  /** Whether the RTSP client has completed PLAY. */
  playing: boolean;
};
