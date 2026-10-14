import type { RtspMessage } from '../../rtsp-parser/index.js';
import type { RtspClientSession } from './rtsp-client-session.interface.js';

/** RTSP session details and the OPTIONS reply needed to configure keepalives. */
export type RtspNegotiationResult = {
  /** Negotiated media tracks and camera session details after PLAY succeeds. */
  readonly session: RtspClientSession;
  /** Initial OPTIONS response advertising the camera's supported methods. */
  readonly optionsResponse: RtspMessage;
};
